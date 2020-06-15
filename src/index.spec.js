import {
  endent,
  flatten,
  map,
  mapValues,
  pick,
  replace,
} from '@dword-design/functions'
import { ESLint } from 'eslint'
import outputFiles from 'output-files'
import P from 'path'
import withLocalTmpDir from 'with-local-tmp-dir'

const runTest = config => () => {
  const filename = config.filename || 'index.js'
  // const output = config.output || config.code
  const messages = config.messages || []
  return withLocalTmpDir(async () => {
    await outputFiles({
      'node_modules/eslint-plugin-import-alias': `module.exports = require('${
        require.resolve('.') |> replace(/\\/g, '/')
      }')`,
      ...config.files,
    })
    const linter = new ESLint({
      useEslintrc: false,
      overrideConfig: {
        parserOptions: {
          sourceType: 'module',
          ecmaVersion: 2015,
        },
        plugins: ['import-alias'],
        rules: {
          'import-alias/prefer-alias': 1,
        },
      },
    })
    const result = await linter.lintText(config.code, {
      filePath: filename,
    })
    expect(
      result |> map('messages') |> flatten |> map(pick(['ruleId', 'message']))
    ).toEqual(messages)
  })
}

export default {
  'prefer-alias': {
    code: endent`
      import foo from '../foo/bar'
    `,
    filename: P.join('sub', 'index.js'),
    messages: [
      {
        message:
          "Unexpected parent import '../foo/bar'. Use '@/foo/bar' instead",
        ruleId: 'import-alias/prefer-alias',
      },
    ],
    output: "import foo from '@/foo/bar'",
  },
} |> mapValues(runTest)
