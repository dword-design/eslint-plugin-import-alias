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
      resolvePath(`${aliasName}/`, currentFile, options)
    )
    if (absoluteSourcePath |> startsWith(path)) {
      return { name: aliasName, path }
    }
  }
  return undefined
}

export default {
  meta: {
    type: 'suggestion',
    fixable: true,
  },
  create: context => {
    const currentFile = context.getFilename()
    const folder = P.dirname(currentFile)
    // can't check a non-file
    if (currentFile === '<text>') return {}
    const manager = new OptionManager()
    const babelConfig = manager.init({
      babelrc: true,
      root: folder,
      filename: currentFile,
    })
    const plugin = babelConfig.plugins |> find({ key: 'module-resolver' })
    const options = plugin.options
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
            options
          )
          if (!matchingAlias) {
            return context.report({
              node,
              message: `Unexpected parent import '${sourcePath}'. No matching alias found to fix the issue`,
            })
          }
          const absoluteImportPath = P.resolve(folder, sourcePath)
          const rewrittenImport = `${matchingAlias.name}/${
            P.relative(matchingAlias.path, absoluteImportPath)
            |> replace(/\\/g, '/')
          }`
          return context.report({
            node,
            message: `Unexpected parent import '${sourcePath}'. Use '${rewrittenImport}' instead`,
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                rewrittenImport
              ),
          })
        }
        const importWithoutAlias = resolvePath(sourcePath, currentFile, options)
        if (!(importWithoutAlias |> isParentImport) && hasAlias) {
          return context.report({
            node,
            message: `Unexpected subpath import via alias '${sourcePath}'. Use '${importWithoutAlias}' instead`,
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                importWithoutAlias
              ),
          })
        }
        return undefined
      },
    }
  },
}
