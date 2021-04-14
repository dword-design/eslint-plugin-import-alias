import { endent, map, mapValues } from '@dword-design/functions'
import packageName from 'depcheck-package-name'
import { Linter } from 'eslint'
import outputFiles from 'output-files'
import P from 'path'
import withLocalTmpDir from 'with-local-tmp-dir'

import self from './prefer-alias'

const runTest = (config = {}) => () => {
  config = {
    eslintConfig: {},
    filename: 'index.js',
    messages: [],
    output: config.code,
    ...config,
  }

  return withLocalTmpDir(async () => {
    await outputFiles(config.files)

    const linter = new Linter()
    linter.defineRule('self/self', self)

    const lintingConfig = {
      parserOptions: {
        ecmaVersion: 2015,
        sourceType: 'module',
      },
      rules: {
        'self/self': 'error',
        ...config.eslintConfig.rules,
      },
      ...config.eslintConfig,
    }

    const lintedMessages = linter.verify(config.code, lintingConfig, {
      filename: config.filename,
    })

    const lintedOutput = linter.verifyAndFix(config.code, lintingConfig, {
      filename: config.filename,
    }).output
    expect(lintedMessages |> map('message')).toEqual(config.messages)
    expect(lintedOutput).toEqual(config.output)
  })
}

export default {
  'alias parent': {
    code: "import foo from '@/foo'",
    filename: 'sub/index.js',
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
      'foo.js': '',
    },
  },
  'alias subpath': {
    code: "import foo from '@/foo'",
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
      'foo.js': '',
    },
    messages: [
      "Unexpected subpath import via alias '@/foo'. Use './foo' instead",
    ],
    output: "import foo from './foo'",
  },
  'custom alias': {
    code: "import foo from '../foo'",
    eslintConfig: {
      rules: {
        'self/self': [
          'error',
          {
            alias: { bar: '.' },
          },
        ],
      },
    },
    filename: 'sub/index.js',
    files: {
      'foo.js': '',
      'package.json': JSON.stringify({}),
    },
    messages: ["Unexpected parent import '../foo'. Use 'bar/foo' instead"],
    output: "import foo from 'bar/foo'",
  },
  'custom resolvePath': {
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
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
              '${packageName`babel-plugin-module-resolver`}',
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
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  'cwd: babelrc': {
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    files: {
      sub: {
        '.babelrc': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' }, cwd: 'babelrc' },
            ],
          ],
        }),
        'foo.js': '',
      },
    },
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  'cwd: packagejson': {
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    files: {
      sub: {
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' }, cwd: 'packagejson' },
            ],
          ],
        }),
        'foo.js': '',
        'package.json': JSON.stringify({}),
      },
    },
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  'cwd: subfolder': {
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [
            packageName`babel-plugin-module-resolver`,
            { alias: { '@': '.' }, cwd: 'sub' },
          ],
        ],
      }),
      'sub/foo.js': '',
    },
    messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
    output: "import foo from '@/foo'",
  },
  external: {
    code: "import foo from 'foo'",
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
    },
  },
  'no aliases': {
    code: "import foo from '../foo'",
    filename: 'sub/index.js',
    files: {
      'foo.js': '',
      'package.json': JSON.stringify({}),
    },
    messages: [
      "Unexpected parent import '../foo'. No matching alias found to fix the issue. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule in your ESLint config.",
    ],
  },
  parent: {
    code: "import foo from '../foo/bar'",
    filename: P.join('sub', 'index.js'),
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
    },
    messages: [
      "Unexpected parent import '../foo/bar'. Use '@/foo/bar' instead",
    ],
    output: "import foo from '@/foo/bar'",
  },
  'parent import but no matching alias': {
    code: "import foo from '../../foo'",
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
    },
    messages: [
      "Unexpected parent import '../../foo'. No matching alias found to fix the issue. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule in your ESLint config.",
    ],
  },
  'parent in-between folder': {
    code: "import foo from '../foo'",
    filename: P.join('sub', 'sub', 'index.js'),
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
    },
    messages: ["Unexpected parent import '../foo'. Use '@/sub/foo' instead"],
    output: "import foo from '@/sub/foo'",
  },
  scoped: {
    code: "import foo from '@foo/bar'",
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
      'foo.js': '',
    },
  },
} |> mapValues(runTest)
