import { endent, map, mapValues } from '@dword-design/functions'
import { Linter } from 'eslint'
import outputFiles from 'output-files'
import P from 'path'
import withLocalTmpDir from 'with-local-tmp-dir'

import self from './prefer-alias'

const runTest = config => () => {
  const filename = config.filename || 'index.js'
  const output = config.output || config.code
  const messages = config.messages || []
  return withLocalTmpDir(async () => {
    await outputFiles(config.files)
    const linter = new Linter()
    linter.defineRule('self/self', self)
    const lintingConfig = {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2015,
      },
      rules: {
        'self/self': 1,
      },
    }
    const lintedMessages = linter.verify(config.code, lintingConfig, {
      filename,
    })
    const lintedOutput = linter.verifyAndFix(config.code, lintingConfig, {
      filename,
    }).output
    expect(lintedMessages |> map('message')).toEqual(messages)
    expect(lintedOutput).toEqual(output)
  })
}

export default {
  'external import': {
    code: endent`
      import foo from 'foo'
    `,
  },
  'parent import': {
    code: endent`
      import foo from '../foo/bar'
    `,
    filename: P.join('sub', 'index.js'),
    messages: [
      "Unexpected parent import '../foo/bar'. Use '@/foo/bar' instead",
    ],
    output: "import foo from '@/foo/bar'",
  },
  'parent import but no matching alias': {
    code: endent`
      import foo from '../../foo'
    `,
    messages: [
      "Unexpected parent import '../../foo'. No matching alias found to fix the issue",
    ],
  },
  'alias parent import': {
    files: {
      'foo.js': '',
    },
    code: endent`
      import foo from '@/foo'
    `,
    filename: 'sub/index.js',
  },
  'alias subpath import': {
    files: {
      'foo.js': '',
    },
    code: endent`
      import foo from '@/foo'
    `,
    messages: [
      "Unexpected subpath import via alias '@/foo'. Use './foo' instead",
    ],
    output: "import foo from './foo'",
  },
} |> mapValues(runTest)
