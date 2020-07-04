import { endent, map, mapValues } from '@dword-design/functions'
import { Linter } from 'eslint'
import getPackageName from 'get-package-name'
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
        'self/self': 'error',
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
  external: {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
    },
    code: "import foo from 'foo'",
  },
  parent: {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
    },
    code: "import foo from '../foo/bar'",
    filename: P.join('sub', 'index.js'),
    messages: [
      "Unexpected parent import '../foo/bar'. Use '@/foo/bar' instead",
    ],
    output: "import foo from '@/foo/bar'",
  },
  'parent in-between folder': {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
    },
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    messages: ["Unexpected parent import '../foo'. Use '@/sub/foo' instead"],
    output: "import foo from '@/sub/foo'",
  },
  'parent import but no matching alias': {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
    },
    code: "import foo from '../../foo'",
    messages: [
      "Unexpected parent import '../../foo'. No matching alias found to fix the issue",
    ],
  },
  'alias parent': {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
      'foo.js': '',
    },
    code: "import foo from '@/foo'",
    filename: 'sub/index.js',
  },
  'alias subpath': {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
      'foo.js': '',
    },
    code: "import foo from '@/foo'",
    messages: [
      "Unexpected subpath import via alias '@/foo'. Use './foo' instead",
    ],
    output: "import foo from './foo'",
  },
  scoped: {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' } },
          ],
        ],
      }),
      'foo.js': '',
    },
    code: "import foo from '@foo/bar'",
  },
  'cwd: subfolder': {
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            getPackageName(require.resolve('babel-plugin-module-resolver')),
            { alias: { '@': '.' }, cwd: 'sub' },
          ],
        ],
      }),
      'sub/foo.js': '',
    },
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  'cwd: packagejson': {
    files: {
      sub: {
        'foo.js': '',
        'package.json': JSON.stringify({}),
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              getPackageName(require.resolve('babel-plugin-module-resolver')),
              { alias: { '@': '.' }, cwd: 'packagejson' },
            ],
          ],
        }),
      },
    },
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  'cwd: babelrc': {
    files: {
      sub: {
        'foo.js': '',
        '.babelrc': JSON.stringify({
          plugins: [
            [
              getPackageName(require.resolve('babel-plugin-module-resolver')),
              { alias: { '@': '.' }, cwd: 'babelrc' },
            ],
          ],
        }),
      },
    },
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  'custom resolvePath': {
    files: {
      '.babelrc.json': JSON.stringify({
        extends: 'babel-config-foo',
      }),
      'node_modules/babel-config-foo/index.js': endent`
        const P = require('path')
        const { resolvePath } = require('babel-plugin-module-resolver')

        module.exports = {
          plugins: [
            [
              '${getPackageName(
                require.resolve('babel-plugin-module-resolver')
              )}',
              {
                alias: { '@': '.' },
                resolvePath: (sourcePath, currentFile) =>
                  resolvePath(
                    sourcePath,
                    currentFile,
                    { alias: { '@': '.' }, cwd: P.resolve(P.dirname(currentFile), '..') }
                  )
              },
            ],
          ],
        }
      `,
      'sub/foo.js': '',
    },
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
} |> mapValues(runTest)
