import pathLib from 'node:path';

import { loadOptions } from '@babel/core';
import defaults from '@dword-design/defaults';
import { ESLintUtils } from '@typescript-eslint/utils';
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver';
import { mapValues, omit, orderBy, pick } from 'lodash-es';
import micromatch from 'micromatch';

const ts = await import('typescript')
  .then(module => module.default)
  .catch(() => null);

export interface BabelPluginModuleResolverOptions {
  alias?: Record<string, string>;
  cwd?: string;
  resolvePath?: (
    sourcePath: string,
    currentFile: string,
    options: Pick<BabelPluginModuleResolverOptions, 'alias' | 'cwd'>,
  ) => string;
}
interface AliasInfo {
  path: string;
  includePatterns: string[];
  configDir: string;
}

export interface Options {
  alias: Record<string, AliasInfo[]>;
  aliasForSubpaths: boolean;
  shouldReadTsConfig: boolean;
  shouldReadBabelConfig: boolean;
  resolvePath: (
    sourcePath: string,
    currentFile: string,
    options: Pick<BabelPluginModuleResolverOptions, 'alias' | 'cwd'>,
  ) => string;
}

type BabelOptions = Exclude<Parameters<typeof loadOptions>[0], undefined>;

export type OptionsInput = Omit<Partial<Options>, 'alias'> & {
  alias?: Record<string, string>;
  babelOptions?: BabelOptions;
};

const loadTsConfigPathsFromFile = (
  configPath: string,
  cwd: string,
  visitedConfigs: Set<string> = new Set<string>(),
): Record<string, AliasInfo[]> => {
  if (!ts || visitedConfigs.has(configPath)) {
    return {};
  }

  visitedConfigs.add(configPath);
  const configText = ts.sys.readFile(configPath);

  if (!configText) {
    return {};
  }

  const result = ts.parseConfigFileTextToJson(configPath, configText);

  if (!result.config) {
    return {};
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    result.config,
    ts.sys,
    pathLib.dirname(configPath),
    undefined,
    configPath,
  );

  const { baseUrl, paths = [] } = parsedConfig.options;
  const projectReferences = parsedConfig.projectReferences ?? [];
  const includePatterns = result.config.include ?? [];
  const configDir = pathLib.dirname(configPath);
  // Load paths from current config
  const basePath = baseUrl ? pathLib.resolve(configDir, baseUrl) : configDir;

  const aliases = Object.fromEntries(
    Object.entries(paths).map(([key, values]) => {
      // Remove trailing /* from the alias pattern
      const aliasKey = key.replace(/\/\*$/, '');

      // Remove trailing /* from the path and resolve relative to baseUrl
      const absoluteAliasPath = pathLib.resolve(
        basePath,
        values[0].replace(/\/\*$/, ''),
      );

      // Make it relative to cwd for compatibility with babel-plugin-module-resolver
      const relativeAliasPath = pathLib.relative(cwd, absoluteAliasPath);
      return [
        aliasKey,
        [{ configDir, includePatterns, path: `./${relativeAliasPath}` }],
      ];
    }),
  );

  // Load paths from referenced projects (recursively)
  for (const reference of projectReferences) {
    const referencePath = pathLib.resolve(
      pathLib.dirname(configPath),
      reference.path,
    );

    // Try to load the referenced tsconfig
    let referencedConfigPath = referencePath;

    if (!referencedConfigPath.endsWith('.json')) {
      referencedConfigPath = pathLib.join(referencePath, 'tsconfig.json');
    }

    if (ts.sys.fileExists(referencedConfigPath)) {
      // Recursively load paths from the referenced config and its references
      const referencedAliases = loadTsConfigPathsFromFile(
        referencedConfigPath,
        cwd,
        visitedConfigs,
      );

      // Merge referenced aliases, accumulating all possible paths for each alias
      for (const [key, aliasInfos] of Object.entries(referencedAliases)) {
        if (aliases[key]) {
          // Add new alias infos, avoiding duplicates based on path
          for (const aliasInfo of aliasInfos) {
            if (!aliases[key].some(a => a.path === aliasInfo.path)) {
              aliases[key].push(aliasInfo);
            }
          }
        } else {
          aliases[key] = aliasInfos;
        }
      }
    }
  }

  return aliases;
};

const loadTsConfigPaths = (currentFile: string, cwd: string) => {
  if (!ts) {
    return {};
  }

  const configPath = ts.findConfigFile(
    pathLib.dirname(currentFile),
    ts.sys.fileExists,
    'tsconfig.json',
  );

  if (!configPath) {
    return {};
  }

  return loadTsConfigPathsFromFile(configPath, cwd);
};

const createRule = ESLintUtils.RuleCreator(() => '');
const isParentImport = (path: string) => /^(\.\/)?\.\.\//.test(path);

const findMatchingAlias = (
  sourcePath: string,
  currentFilename: string,
  options: Pick<Options, 'alias' | 'resolvePath'>,
  { cwd = '.' }: { cwd?: string } = {},
) => {
  const absoluteSourcePath = pathLib.resolve(
    pathLib.dirname(currentFilename),
    sourcePath,
  );

  const matches = Object.entries(options.alias)
    .flatMap(([aliasName, aliasInfos]) =>
      aliasInfos.map(info => [aliasName, info] as const),
    )
    .filter(([, info]) =>
      info.includePatterns.length > 0
        ? micromatch.isMatch(
            pathLib.relative(info.configDir, currentFilename),
            info.includePatterns,
            { cwd: info.configDir },
          )
        : true,
    )
    .map(([aliasName, info]) => {
      const path = pathLib.resolve(
        pathLib.dirname(currentFilename),
        options.resolvePath(`${aliasName}/`, currentFilename, {
          alias: { [aliasName]: info.path },
          cwd,
        }),
      );

      if (absoluteSourcePath.startsWith(path)) {
        return {
          name: aliasName,
          path,
          segmentCount: path.split(pathLib.sep).length,
        };
      }

      return null;
    })
    .filter(match => !!match);

  const sortedMatches = orderBy(matches, ['segmentCount'], ['desc']);
  return sortedMatches?.[0] ? omit(sortedMatches[0], ['segmentCount']) : null;
};

const withNormalizedAliases = (
  options: OptionsInput,
  { cwd }: { cwd: string },
) => ({
  ...options,
  alias: mapValues(options.alias, aliasPath =>
    typeof aliasPath === 'string'
      ? [{ configDir: cwd, includePatterns: [], path: aliasPath }]
      : aliasPath,
  ),
});

export default createRule<[OptionsInput], 'parentImport' | 'subpathImport'>({
  create: context => {
    const folder = pathLib.dirname(context.filename);
    // can't check a non-file
    if (context.filename === '<text>') return {};

    const optionsFromRule = defaults(context.options[0] ?? {}, {
      babelOptions: {},
      shouldReadBabelConfig: true,
      shouldReadTsConfig: true,
    });

    const optionsFromBabelPlugin = optionsFromRule.shouldReadBabelConfig
      ? (() => {
          const babelConfig = loadOptions({
            filename: context.filename,
            ...optionsFromRule.babelOptions,
          });

          const babelPlugin =
            babelConfig?.plugins?.find?.(
              iteratedPlugin => iteratedPlugin.key === 'module-resolver',
            ) ?? null;

          const babelPluginOptions = (babelPlugin?.options ??
            {}) as BabelPluginModuleResolverOptions; // TODO: https://github.com/microsoft/TypeScript/issues/62929

          return withNormalizedAliases(
            pick(babelPluginOptions, ['alias', 'resolvePath']),
            { cwd: context.cwd },
          );
        })()
      : {};

    const options = defaults(
      withNormalizedAliases(omit(optionsFromRule, ['babelOptions']), {
        cwd: context.cwd,
      }),
      {
        alias: optionsFromRule.shouldReadTsConfig
          ? loadTsConfigPaths(context.filename, context.cwd)
          : {},
      },
      withNormalizedAliases(optionsFromBabelPlugin, { cwd: context.cwd }),
      {
        alias: {},
        aliasForSubpaths: false,
        cwd: context.cwd,
        resolvePath: defaultResolvePath,
      },
    );

    if (Object.keys(options.alias).length === 0) {
      throw new Error(
        'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, defining them in your tsconfig.json paths, or passing them directly to the prefer-alias rule.',
      );
    }

    return {
      ImportDeclaration: node => {
        const sourcePath = node.source.value;

        const filteredAliases = Object.fromEntries(
          Object.entries(options.alias)
            .flatMap(([aliasName, aliasInfos]) =>
              aliasInfos.map(info => [aliasName, info] as const),
            )
            .filter(([, info]) =>
              info.includePatterns.length > 0
                ? micromatch.isMatch(
                    pathLib.relative(info.configDir, context.filename),
                    info.includePatterns,
                    { cwd: info.configDir },
                  )
                : true,
            )
            .map(([aliasName, info]) => [aliasName, info.path] as const),
        );

        const hasAlias = Object.keys(filteredAliases).some(alias =>
          sourcePath.startsWith(`${alias}/`),
        );

        // relative parent
        if (isParentImport(sourcePath)) {
          const matchingAlias = findMatchingAlias(
            sourcePath,
            context.filename,
            pick(options, ['alias', 'resolvePath']),
            { cwd: context.cwd },
          );

          if (!matchingAlias) {
            return;
          }

          const absoluteImportPath = pathLib.resolve(folder, sourcePath);

          const rewrittenImport = `${matchingAlias.name}/${pathLib
            .relative(matchingAlias.path, absoluteImportPath)
            .replaceAll('\\', '/')}`;

          return context.report({
            data: { rewrittenImport, sourcePath },
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                rewrittenImport,
              ),
            messageId: 'parentImport',
            node,
          });
        }

        const importWithoutAlias = options.resolvePath(
          sourcePath,
          context.filename,
          { alias: filteredAliases, cwd: options.cwd },
        );

        if (
          !isParentImport(importWithoutAlias) &&
          hasAlias &&
          !options.aliasForSubpaths
        ) {
          return context.report({
            data: { rewrittenImport: importWithoutAlias, sourcePath },
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                importWithoutAlias,
              ),
            messageId: 'subpathImport',
            node,
          });
        }
      },
    };
  },
  defaultOptions: [{}],
  meta: {
    docs: {
      description:
        'Enforce usage of import aliases over relative parent imports',
    },
    fixable: 'code' as const,
    messages: {
      parentImport:
        "Unexpected parent import '{{sourcePath}}'. Use '{{rewrittenImport}}' instead",
      subpathImport:
        "Unexpected subpath import via alias '{{sourcePath}}'. Use '{{rewrittenImport}}' instead",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          alias: { type: 'object' },
          aliasForSubpaths: { default: false, type: 'boolean' },
          babelOptions: { type: 'object' },
          shouldReadBabelConfig: { default: true, type: 'boolean' },
          shouldReadTsConfig: { default: true, type: 'boolean' },
        },
        type: 'object',
      },
    ],
    type: 'suggestion' as const,
  },
  name: 'prefer-alias',
});
