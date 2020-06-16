import {
  findKey,
  keys,
  replace,
  some,
  startsWith,
} from '@dword-design/functions'
import { resolvePath } from 'babel-plugin-module-resolver'
import findUp from 'find-up'
import P from 'path'
import pkgUp from 'pkg-up'

const isParentImport = path => /^(\.\/)?\.\.\//.test(path)

export default {
  meta: {
    type: 'suggestion',
    fixable: true,
    schema: [
      {
        type: 'object',
        properties: {
          alias: { type: 'object' },
        },
      },
    ],
  },
  create: context => {
    const options = {
      alias: { '@': '.' },
      ...context.options[0],
    }
    const path = context.getFilename()
    const folder = P.dirname(path)
    // can't check a non-file
    if (path === '<text>') return {}
    return {
      ImportDeclaration: node => {
        const importPath = node.source.value
        const hasAlias =
          options.alias
          |> keys
          |> some(alias => importPath |> startsWith(`${alias}/`))
        const importWithoutAlias = resolvePath(importPath, path, options)
        const resolvedCwd = (() => {
          switch (options.cwd) {
            case 'packagejson':
              return pkgUp.sync({ cwd: folder }) |> P.dirname
            case 'babelrc':
              return findUp.sync('.babelrc.json', { cwd: folder }) |> P.dirname
            default:
              return options.cwd || '.'
          }
        })()
        // relative parent
        if (importPath |> isParentImport) {
          const absoluteImportPath = P.resolve(folder, importPath)
          const matchingAlias =
            options.alias
            |> findKey(
              aliasPath =>
                absoluteImportPath
                |> startsWith(P.resolve(resolvedCwd, aliasPath))
            )
          if (!matchingAlias) {
            return context.report({
              node,
              message: `Unexpected parent import '${importPath}'. No matching alias found to fix the issue`,
            })
          }
          const rewrittenImport = `${matchingAlias}/${
            P.relative(
              P.resolve(resolvedCwd, options.alias[matchingAlias]),
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
