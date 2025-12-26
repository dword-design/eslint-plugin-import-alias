import pathLib from 'node:path';

import { loadOptions } from '@babel/core';
import defaults from '@dword-design/defaults';
import { ESLintUtils } from '@typescript-eslint/utils';
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver';
import { omit, pick } from 'lodash-es';

export interface BabelPluginModuleResolverOptions {
  alias?: Record<string, string>;
  cwd?: string;
  resolvePath?: (
    sourcePath: string,
    currentFile: string,
    options: Pick<BabelPluginModuleResolverOptions, 'alias' | 'cwd'>,
  ) => string;
}
const createRule = ESLintUtils.RuleCreator(() => '');

export interface Options {
  alias: Record<string, string>;
  aliasForSubpaths: boolean;
  resolvePath: (
    sourcePath: string,
    currentFile: string,
    options: Pick<Options, 'alias' | 'cwd'>,
  ) => string;
  cwd: string;
}

type OptionsInput = Partial<Options> & {
  babelOptions?: Record<string, unknown>;
};
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

  for (const aliasName of Object.keys(options.alias)) {
    const path = pathLib.resolve(
      pathLib.dirname(currentFile),
      options.resolvePath(
        `${aliasName}/`,
        currentFile,
        pick(options, ['alias', 'cwd']),
      ),
    );

    if (absoluteSourcePath.startsWith(path)) {
      return { name: aliasName, path };
    }
  }
};

export default createRule<[OptionsInput], 'parentImport' | 'subpathImport'>({
  create: context => {
    const currentFile = context.getFilename();
    const folder = pathLib.dirname(currentFile);
    // can't check a non-file
    if (currentFile === '<text>') return {};

    const optionsFromRule = defaults(context.options[0] ?? {}, {
      babelOptions: {},
    });

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

    const optionsFromPlugin = pick(babelPluginOptions, [
      'alias',
      'resolvePath',
    ] as const);

    const options = defaults(
      omit(optionsFromRule, ['babelOptions']),
      optionsFromPlugin,
      {
        alias: {},
        aliasForSubpaths: false,
        cwd: context.cwd,
        resolvePath: defaultResolvePath,
      },
    );

    if (Object.keys(options.alias).length === 0) {
      throw new Error(
        'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule.',
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
        },
        type: 'object',
      },
    ],
    type: 'suggestion' as const,
  },
  name: 'prefer-alias',
});
