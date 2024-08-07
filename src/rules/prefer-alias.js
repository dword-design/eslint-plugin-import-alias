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

    const resolvePath = options.resolvePath || defaultResolvePath

    return {
      ImportDeclaration: node => {
        const sourcePath = node.source.value

        const hasAlias =
          options.alias
          |> keys
          |> some(alias => sourcePath |> startsWith(`${alias}/`))

        const importWithoutAlias = resolvePath(sourcePath, currentFile, options)

        const shouldAlias =
          !hasAlias &&
          ((importWithoutAlias |> isParentImport) ||
            ((importWithoutAlias |> isSiblingImport) && options.forSiblings) ||
            ((importWithoutAlias |> isSubpathImport) && options.forSubpaths))
        if (shouldAlias) {
          const matchingAlias = findMatchingAlias(
            sourcePath,
            currentFile,
            options,
          )
          if (!matchingAlias) {
            return undefined
          }

          const absoluteImportPath = P.resolve(folder, sourcePath)

          const rewrittenImport = `${matchingAlias.name}/${
            P.relative(matchingAlias.path, absoluteImportPath)
            |> replace(/\\/g, '/')
          }`

          const importType = getImportType(importWithoutAlias)

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

        const shouldUnalias =
          hasAlias &&
          (((importWithoutAlias |> isSiblingImport) && !options.forSiblings) ||
            ((importWithoutAlias |> isSubpathImport) && !options.forSubpaths))
        if (shouldUnalias) {
          return context.report({
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                importWithoutAlias,
              ),
            message: `Unexpected subpath import via alias '${sourcePath}'. Use '${importWithoutAlias}' instead`,
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
            default: false,
            type: 'boolean',
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
