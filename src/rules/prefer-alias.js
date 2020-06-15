import {
  findKey,
  keys,
  replace,
  some,
  startsWith,
} from '@dword-design/functions'
import { resolvePath } from 'babel-plugin-module-resolver'
import P from 'path'

const isParentImport = path => /^(\.\/)?\.\.\//.test(path)

export default {
  meta: {
    type: 'suggestion',
    fixable: true,
    schema: [
      {
        type: 'object',
        properties: {
          aliases: { type: 'object', default: { '@': '.' } },
        },
        required: ['aliases'],
      },
    ],
  },
  create: context => {
    const aliases = context.options[0]?.aliases || { '@': '.' }
    const path = context.getFilename()
    // can't check a non-file
    if (path === '<text>') return {}
    return {
      ImportDeclaration: node => {
        const importPath = node.source.value
        const hasAlias =
          aliases
          |> keys
          |> some(alias => importPath |> startsWith(`${alias}/`))
        const resolvedImport = resolvePath(importPath, path, {
          alias: aliases,
        })
        // relative parent
        if (importPath |> isParentImport) {
          const folder = P.basename(path)
          const resolvedImportPath = P.resolve(folder, importPath)
          const matchingAlias =
            aliases
            |> findKey(
              aliasPath =>
                resolvedImportPath |> startsWith(P.resolve(aliasPath))
            )
          if (!matchingAlias) {
            return context.report({
              node,
              message: `Unexpected parent import '${importPath}'. No matching alias found to fix the issue`,
            })
          }
          const rewrittenImport = `${matchingAlias}/${
            P.relative(P.resolve(aliases[matchingAlias]), resolvedImportPath)
            |> replace(/\\/g, '/')
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
        if (!(resolvedImport |> isParentImport) && hasAlias) {
          return context.report({
            node,
            message: `Unexpected subpath import via alias '${importPath}'. Use '${resolvedImport}' instead`,
            fix: fixer =>
              fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                resolvedImport
              ),
          })
        }
        return undefined
      },
    }
  },
}
