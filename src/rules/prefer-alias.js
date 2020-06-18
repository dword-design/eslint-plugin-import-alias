import { OptionManager } from '@babel/core'
import {
  find,
  findKey,
  keys,
  replace,
  some,
  startsWith,
} from '@dword-design/functions'
import { resolvePath as defaultResolvePath } from 'babel-plugin-module-resolver'
import P from 'path'

const isParentImport = path => /^(\.\/)?\.\.\//.test(path)

export default {
  meta: {
    type: 'suggestion',
    fixable: true,
  },
  create: context => {
    const path = context.getFilename()
    const folder = P.dirname(path)
    // can't check a non-file
    if (path === '<text>') return {}
    const manager = new OptionManager()
    const babelConfig = manager.init({
      babelrc: true,
      root: folder,
      filename: path,
    })
    const plugin = babelConfig.plugins |> find({ key: 'module-resolver' })
    const options = plugin.options
    const resolvePath = options.resolvePath || defaultResolvePath
    return {
      ImportDeclaration: node => {
        const importPath = node.source.value
        const hasAlias =
          options.alias
          |> keys
          |> some(alias => importPath |> startsWith(`${alias}/`))
        const importWithoutAlias = resolvePath(importPath, path, options)
        // relative parent
        if (importPath |> isParentImport) {
          const absoluteImportPath = P.resolve(folder, importPath)
          const matchingAlias =
            options.alias
            |> findKey(
              (aliasPath, alias) =>
                absoluteImportPath
                |> startsWith(
                  P.resolve(folder, resolvePath(`${alias}/`, path, options))
                )
            )
          if (!matchingAlias) {
            return context.report({
              node,
              message: `Unexpected parent import '${importPath}'. No matching alias found to fix the issue`,
            })
          }
          const rewrittenImport = `${matchingAlias}/${
            P.relative(
              P.resolve(
                folder,
                resolvePath(`${matchingAlias}/`, path, options)
              ),
              absoluteImportPath
            ) |> replace(/\\/g, '/')
          }`
          return context.report({
            node,
            message: `Unexpected parent import '${importPath}'. Use '${rewrittenImport}' instead`,
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                rewrittenImport
              ),
          })
        }
        if (!(importWithoutAlias |> isParentImport) && hasAlias) {
          return context.report({
            node,
            message: `Unexpected subpath import via alias '${importPath}'. Use '${importWithoutAlias}' instead`,
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
