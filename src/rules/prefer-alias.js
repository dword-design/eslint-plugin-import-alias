import { OptionManager } from '@babel/core'
import { find, keys, replace, some, startsWith } from '@dword-design/functions'
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver'
import deepmerge from 'deepmerge'
import P from 'path'

const isParentImport = path => /^(\.\/)?\.\.\//.test(path)

const isSiblingImport = path => /^\.\/[^/]+$/.test(path)

const isSubpathImport = path => /^\.\/.+\//.test(path)

const findMatchingAlias = (sourcePath, currentFile, options) => {
  const resolvePath = options.resolvePath || defaultResolvePath

  const absoluteSourcePath = P.resolve(P.dirname(currentFile), sourcePath)
  for (const aliasName of options.alias |> keys) {
    const path = P.resolve(
      P.dirname(currentFile),
      resolvePath(`${aliasName}/`, currentFile, options),
    )
    if (absoluteSourcePath |> startsWith(path)) {
      return { name: aliasName, path }
    }
  }

  return undefined
}

const getImportType = importWithoutAlias => {
  if (importWithoutAlias |> isSiblingImport) {
    return 'sibling'
  }
  if (importWithoutAlias |> isSubpathImport) {
    return 'subpath'
  }

  return 'parent'
}

const getSiblingsMaxNestingLevel = options => {
  if (options.forSiblings === true) {
    return Infinity
  }
  if (options.forSiblings) {
    return options.forSiblings.ofMaxNestingLevel
  }

  return -1
}

export default {
  create: context => {
    const currentFile = context.getFilename()

    const folder = P.dirname(currentFile)
    // can't check a non-file
    if (currentFile === '<text>') return {}

    const manager = new OptionManager()

    const babelConfig = manager.init({
      filename: currentFile,
      rootMode: 'upward-optional',
    })

    const plugin = babelConfig.plugins |> find({ key: 'module-resolver' })

    const options = deepmerge.all([
      { alias: [] },
      plugin?.options || {},
      context.options[0] || {},
    ])
    if (options.alias.length === 0) {
      throw new Error(
        'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule.',
      )
    }

    const siblingsMaxNestingLevel = getSiblingsMaxNestingLevel(options)

    const resolvePath = options.resolvePath || defaultResolvePath

    return {
      ImportDeclaration: node => {
        const sourcePath = node.source.value

        const hasAlias =
          options.alias
          |> keys
          |> some(
            alias =>
              (sourcePath |> startsWith(`${alias}/`)) || sourcePath === alias,
          )

        const importWithoutAlias = resolvePath(sourcePath, currentFile, options)

        const importType = getImportType(importWithoutAlias)

        const matchingAlias = findMatchingAlias(
          sourcePath,
          currentFile,
          options,
        )

        const currentFileNestingLevel =
          matchingAlias &&
          P.relative(matchingAlias.path, currentFile).split(P.sep).length - 1

        const shouldAlias =
          !hasAlias &&
          ((importWithoutAlias |> isParentImport) ||
            ((importWithoutAlias |> isSiblingImport) &&
              currentFileNestingLevel <= siblingsMaxNestingLevel) ||
            ((importWithoutAlias |> isSubpathImport) && options.forSubpaths))
        if (shouldAlias) {
          if (!matchingAlias) {
            return undefined
          }

          const absoluteImportPath = P.resolve(folder, sourcePath)

          const rewrittenImport =
            `${matchingAlias.name}/${
              P.relative(matchingAlias.path, absoluteImportPath)
              |> replace(/\\/g, '/')
            }` |> replace(/\/$/, '')

          return context.report({
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                rewrittenImport,
              ),
            message: `Unexpected ${importType} import '${sourcePath}'. Use '${rewrittenImport}' instead`,
            node,
          })
        }

        const isDirectAlias =
          options.alias |> keys |> some(alias => sourcePath === alias)

        const shouldUnalias =
          hasAlias &&
          !isDirectAlias &&
          (((importWithoutAlias |> isSiblingImport) &&
            currentFileNestingLevel > siblingsMaxNestingLevel) ||
            ((importWithoutAlias |> isSubpathImport) && !options.forSubpaths))
        if (shouldUnalias) {
          return context.report({
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                importWithoutAlias,
              ),
            message: `Unexpected ${importType} import via alias '${sourcePath}'. Use '${importWithoutAlias}' instead`,
            node,
          })
        }

        return undefined
      },
    }
  },
  meta: {
    fixable: true,
    schema: [
      {
        additionalProperties: false,
        properties: {
          alias: {
            type: 'object',
          },
          forSiblings: {
            anyOf: [
              {
                default: false,
                type: 'boolean',
              },
              {
                additionalProperties: false,
                properties: {
                  ofMaxNestingLevel: {
                    minimum: 0,
                    type: 'number',
                  },
                },
                type: 'object',
              },
            ],
          },
          forSubpaths: {
            default: false,
            type: 'boolean',
          },
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
}
