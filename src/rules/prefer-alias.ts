import pathLib from 'node:path';

import { loadOptions } from '@babel/core';
import defu from '@dword-design/defu';
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver';

interface BabelPlugin {
  key: string;
  options?: Record<string, unknown>;
}
interface BabelConfig {
  plugins?: BabelPlugin[];
}
const isParentImport = path => /^(\.\/)?\.\.\//.test(path);

const findMatchingAlias = (sourcePath, currentFile, options) => {
  const resolvePath = options.resolvePath || defaultResolvePath;

  const absoluteSourcePath = pathLib.resolve(
    pathLib.dirname(currentFile),
    sourcePath,
  );

  for (const aliasName of Object.keys(options.alias)) {
    const path = pathLib.resolve(
      pathLib.dirname(currentFile),
      resolvePath(`${aliasName}/`, currentFile, options),
    );

    if (absoluteSourcePath.startsWith(path)) {
      return { name: aliasName, path };
    }
  }
};

export default {
  create: context => {
    const currentFile = context.getFilename();
    const folder = pathLib.dirname(currentFile);
    // can't check a non-file
    if (currentFile === '<text>') return {};
    const optionsFromRule = context.options[0] ?? {};

    const babelConfig = (loadOptions({
      filename: currentFile,
      ...optionsFromRule.babelOptions,
    }) || {}) as BabelConfig;

    const optionsFromPlugin =
      babelConfig?.plugins?.find(_ => _.key === 'module-resolver')?.options ??
      {};

    const options = defu(optionsFromRule, optionsFromPlugin, {
      alias: [],
      cwd: context.cwd,
    });

    if (options.alias.length === 0) {
      throw new Error(
        'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule.',
      );
    }

    const resolvePath = options.resolvePath || defaultResolvePath;
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
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                rewrittenImport,
              ),
            message: `Unexpected parent import '${sourcePath}'. Use '${rewrittenImport}' instead`,
            node,
          });
        }

        const importWithoutAlias = resolvePath(
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
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                importWithoutAlias,
              ),
            message: `Unexpected subpath import via alias '${sourcePath}'. Use '${importWithoutAlias}' instead`,
            node,
          });
        }

        return;
      },
    };
  },
  meta: {
    fixable: true,
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
    type: 'suggestion',
  },
};
