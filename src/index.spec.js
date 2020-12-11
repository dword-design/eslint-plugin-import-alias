import {
  endent,
  flatten,
  join,
  map,
  mapValues,
  pick,
  replace,
} from '@dword-design/functions'
import packageName from 'depcheck-package-name'
import { ESLint } from 'eslint'
import outputFiles from 'output-files'
import P from 'path'
import withLocalTmpDir from 'with-local-tmp-dir'

const runTest = config => () => {
  const filename = config.filename || 'index.js'
  const output = config.output || config.code
  const messages = config.messages || []
  return withLocalTmpDir(async () => {
    await outputFiles({
      'node_modules/@dword-design/eslint-plugin-import-alias': `module.exports = require('${
        require.resolve('.') |> replace(/\\/g, '/')
      }')`,
      ...config.files,
    })
    const lintingConfig = {
      overrideConfig: {
        extends: ['plugin:@dword-design/import-alias/recommended'],
        parserOptions: {
          ecmaVersion: 2015,
          sourceType: 'module',
        },
      },
      useEslintrc: false,
    }
    const eslintToLint = new ESLint(lintingConfig)
    const eslintToFix = new ESLint({ ...lintingConfig, fix: true })
    const lintedMessages =
      eslintToLint.lintText(config.code, {
        filePath: filename,
      })
      |> await
      |> map('messages')
      |> flatten
      |> map(pick(['ruleId', 'message']))
    expect(lintedMessages).toEqual(messages)
    const lintedOutput =
      eslintToFix.lintText(config.code, { filePath: filename })
      |> await
      |> map('output')
      |> join('\n')
    expect(lintedOutput).toEqual(output)
  })
}

export default {
  'prefer-alias': {
    code: endent`
      import foo from '../foo/bar'
    `,
    filename: P.join('sub', 'index.js'),
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
    },
    messages: [
      {
        message:
          "Unexpected parent import '../foo/bar'. Use '@/foo/bar' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import foo from '@/foo/bar'",
  },
} |> mapValues(runTest)
