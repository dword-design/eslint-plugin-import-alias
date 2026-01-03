import pathLib from 'node:path';

import { loadOptions } from '@babel/core';
import defaults from '@dword-design/defaults';
import { ESLintUtils } from '@typescript-eslint/utils';
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver';
import { omit, orderBy, pick } from 'lodash-es';

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

const loadTsConfigPathsFromFile = (
  configPath: string,
  cwd: string,
  visitedConfigs: Set<string> = new Set<string>(),
): Record<string, string> => {
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

  // Load paths from current config
  const basePath = baseUrl
    ? pathLib.resolve(pathLib.dirname(configPath), baseUrl)
    : pathLib.dirname(configPath);

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
      return [aliasKey, `./${relativeAliasPath}`];
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

      // Merge referenced aliases, giving priority to already defined aliases
      for (const [key, value] of Object.entries(referencedAliases)) {
        if (!aliases[key]) {
          aliases[key] = value;
        }
      }
    }
  }

  return aliases;
};

const loadTsConfigPaths = (
  currentFile: string,
  cwd: string,
): Record<string, string> => {
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

export interface Options {
  alias: Record<string, string>;
  aliasForSubpaths: boolean;
  shouldReadTsConfig: boolean;
  shouldReadBabelConfig: boolean;
  resolvePath: (
    sourcePath: string,
    currentFile: string,
    options: Pick<BabelPluginModuleResolverOptions, 'alias' | 'cwd'>,
  ) => string;
  cwd: string;
}

type BabelOptions = Exclude<Parameters<typeof loadOptions>[0], undefined>;

export type OptionsInput = Partial<Options> & { babelOptions?: BabelOptions };
const isParentImport = (path: string) => /^(\.\/)?\.\.\//.test(path);

const findMatchingAlias = (
  sourcePath: string,
  currentFile: string,
  options: Options,
) => {
  const absoluteSourcePath = pathLib.resolve(
    pathLib.dirname(currentFile),
    sourcePath,
  );

  const matches = Object.keys(options.alias)
    .map(aliasName => {
      const path = pathLib.resolve(
        pathLib.dirname(currentFile),
        options.resolvePath(
          `${aliasName}/`,
          currentFile,
          pick(options, ['alias', 'cwd']),
        ),
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
  return sortedMatches?.[0] ?? null;
};

export default createRule<[OptionsInput], 'parentImport' | 'subpathImport'>({
  create: context => {
    const currentFile = context.getFilename();
    const folder = pathLib.dirname(currentFile);
    // can't check a non-file
    if (currentFile === '<text>') return {};

    const optionsFromRule = defaults(context.options[0] ?? {}, {
      babelOptions: {},
      shouldReadBabelConfig: true,
      shouldReadTsConfig: true,
    });

    const optionsFromBabelPlugin = optionsFromRule.shouldReadBabelConfig
      ? (() => {
          const babelConfig = loadOptions({
            filename: currentFile,
            ...optionsFromRule.babelOptions,
          });

          const babelPlugin =
            babelConfig?.plugins?.find?.(
              iteratedPlugin => iteratedPlugin.key === 'module-resolver',
            ) ?? null;

          const babelPluginOptions = (babelPlugin?.options ??
            {}) as BabelPluginModuleResolverOptions; // TODO: https://github.com/microsoft/TypeScript/issues/62929

          return pick(babelPluginOptions, ['alias', 'resolvePath'] as const);
        })()
      : {};

    const options = defaults(
      omit(optionsFromRule, ['babelOptions']),
      {
        alias: optionsFromRule.shouldReadTsConfig
          ? loadTsConfigPaths(currentFile, context.cwd)
          : {},
      },
      optionsFromBabelPlugin,
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

        const hasAlias = Object.keys(options.alias).some(alias =>
          sourcePath.startsWith(`${alias}/`),
        );

        // relative parent
        if (isParentImport(sourcePath)) {
          const matchingAlias = findMatchingAlias(
            sourcePath,
            currentFile,
            options,
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
          currentFile,
          options,
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

        return;
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
