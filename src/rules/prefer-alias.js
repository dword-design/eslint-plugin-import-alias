import { OptionManager } from '@babel/core'
import { find, keys, replace, some, startsWith } from '@dword-design/functions'
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver'
import P from 'path'

const isParentImport = path => /^(\.\/)?\.\.\//.test(path)

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

export default {
  create: context => {
    const currentFile = context.getFilename()

    const folder = P.dirname(currentFile)
    // can't check a non-file
    if (currentFile === '<text>') return {}

    const manager = new OptionManager()

    const babelConfig = manager.init({
      babelrc: true,
      filename: currentFile,
      root: folder,
    })

    const plugin = babelConfig.plugins |> find({ key: 'module-resolver' })

    const options = { ...plugin?.options, ...context.options[0] }

    const resolvePath = options.resolvePath || defaultResolvePath

    return {
      ImportDeclaration: node => {
        const sourcePath = node.source.value

        const hasAlias =
          options.alias
          |> keys
          |> some(alias => sourcePath |> startsWith(`${alias}/`))
        // relative parent
        if (sourcePath |> isParentImport) {
          const matchingAlias = findMatchingAlias(
            sourcePath,
            currentFile,
            options,
          )
          if (!matchingAlias) {
            return context.report({
              message: `Unexpected parent import '${sourcePath}'. No matching alias found to fix the issue. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule.`,
              node,
            })
          }

          const absoluteImportPath = P.resolve(folder, sourcePath)

          const rewrittenImport = `${matchingAlias.name}/${
            P.relative(matchingAlias.path, absoluteImportPath)
            |> replace(/\\/g, '/')
          }`

          return context.report({
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                rewrittenImport,
              ),
            message: `Unexpected parent import '${sourcePath}'. Use '${rewrittenImport}' instead`,
            node,
          })
        }

        const importWithoutAlias = resolvePath(sourcePath, currentFile, options)
        if (!(importWithoutAlias |> isParentImport) && hasAlias) {
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
        },
        type: 'object',
      },
    ],
    type: 'suggestion',
  },
}
