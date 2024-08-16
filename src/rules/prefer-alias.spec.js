import { endent, map } from '@dword-design/functions'
import tester from '@dword-design/tester'
import testerPluginTmpDir from '@dword-design/tester-plugin-tmp-dir'
import deepmerge from 'deepmerge'
import packageName from 'depcheck-package-name'
import { Linter } from 'eslint'
import fs from 'fs-extra'
import inFolder from 'in-folder'
import outputFiles from 'output-files'
import P from 'path'

import self from './prefer-alias.js'

const linter = new Linter()
linter.defineRule('self/self', self)

const lint = (code, options = {}) => {
  options = deepmerge({ eslintConfig: {} }, options)

  const lintingConfig = deepmerge(
    {
      parserOptions: {
        ecmaVersion: 2015,
        sourceType: 'module',
      },
      rules: {
        'self/self': 'error',
      },
    },
    options.eslintConfig,
  )

  return {
    messages:
      linter.verify(code, lintingConfig, {
        filename: options.filename,
      }) |> map('message'),
    output: linter.verifyAndFix(code, lintingConfig, {
      filename: options.filename,
    }).output,
  }
}

export default tester(
  {
    'alias for siblings': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
        'foo.js': '',
      })
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: true,
                },
              ],
            },
          },
        }),
      ).toEqual({
        messages: ["Unexpected sibling import './foo'. Use '@/foo' instead"],
        output: "import foo from '@/foo'",
      })
    },
    'alias for siblings with max nested level': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
      })
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: {
                    ofMaxNestingLevel: 0,
                  },
                },
              ],
            },
          },
          filename: 'bar.js',
        }),
      ).toEqual({
        messages: ["Unexpected sibling import './foo'. Use '@/foo' instead"],
        output: "import foo from '@/foo'",
      })
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: {
                    ofMaxNestingLevel: 0,
                  },
                },
              ],
            },
          },
          filename: 'sub/bar.js',
        }).messages,
      ).toEqual([])
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: {
                    ofMaxNestingLevel: 1,
                  },
                },
              ],
            },
          },
          filename: 'sub/bar.js',
        }),
      ).toEqual({
        messages: [
          "Unexpected sibling import './foo'. Use '@/sub/foo' instead",
        ],
        output: "import foo from '@/sub/foo'",
      })
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: {
                    ofMaxNestingLevel: 1,
                  },
                },
              ],
            },
          },
          filename: 'sub/sub/bar.js',
        }).messages,
      ).toEqual([])
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: {
                    ofMaxNestingLevel: 2,
                  },
                },
              ],
            },
          },
          filename: 'sub/sub/bar.js',
        }),
      ).toEqual({
        messages: [
          "Unexpected sibling import './foo'. Use '@/sub/sub/foo' instead",
        ],
        output: "import foo from '@/sub/sub/foo'",
      })
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: {
                    ofMaxNestingLevel: 2,
                  },
                },
              ],
            },
          },
          filename: 'sub/sub/sub/bar.js',
        }).messages,
      ).toEqual([])
    },
    'alias for siblings, nested': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
        'sub/foo.js': '',
      })
      expect(
        lint("import foo from './foo'", {
          eslintConfig: {
            rules: {
              'self/self': [
                'error',
                {
                  forSiblings: true,
                },
              ],
            },
          },
          filename: 'sub/bar.js',
        }),
      ).toEqual({
        messages: [
          "Unexpected sibling import './foo'. Use '@/sub/foo' instead",
        ],
        output: "import foo from '@/sub/foo'",
      })
    },
    'alias for subpaths': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@components': './components' } },
            ],
          ],
        }),
      })

      const eslintConfig = {
        rules: {
          'self/self': [
            'error',
            {
              forSubpaths: true,
            },
          ],
        },
      }
      expect(
        lint("import foo from './components/foo'", {
          eslintConfig,
        }),
      ).toEqual({
        messages: [
          "Unexpected subpath import './components/foo'. Use '@components/foo' instead",
        ],
        output: "import foo from '@components/foo'",
      })
      expect(
        lint("import foo from './sub/foo'", {
          eslintConfig,
          filename: './components/bar.js',
        }),
      ).toEqual({
        messages: [
          "Unexpected subpath import './sub/foo'. Use '@components/sub/foo' instead",
        ],
        output: "import foo from '@components/sub/foo'",
      })
    },
    'alias for subpaths from inside': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@components': './components' } },
            ],
          ],
        }),
      })

      const eslintConfig = {
        rules: {
          'self/self': [
            'error',
            {
              forSubpaths: {
                fromInside: true,
              },
            },
          ],
        },
      }
      expect(
        lint("import foo from './sub/foo'", {
          eslintConfig,
          filename: './components/bar.js',
        }),
      ).toEqual({
        messages: [
          "Unexpected subpath import './sub/foo'. Use '@components/sub/foo' instead",
        ],
        output: "import foo from '@components/sub/foo'",
      })
      expect(
        lint("import foo from './components/foo'", {
          eslintConfig,
        }).messages,
      ).toEqual([])
    },
    'alias for subpaths from outside': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@components': './components' } },
            ],
          ],
        }),
      })

      const eslintConfig = {
        rules: {
          'self/self': [
            'error',
            {
              forSubpaths: {
                fromOutside: true,
              },
            },
          ],
        },
      }
      expect(
        lint("import foo from './components/foo'", {
          eslintConfig,
        }),
      ).toEqual({
        messages: [
          "Unexpected subpath import './components/foo'. Use '@components/foo' instead",
        ],
        output: "import foo from '@components/foo'",
      })
      expect(
        lint("import foo from './sub/foo'", {
          eslintConfig,
          filename: './components/bar.js',
        }).messages,
      ).toEqual([])
    },
    'alias parent': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
        'foo.js': '',
      })
      expect(
        lint("import foo from '@/foo'", { filename: 'sub/index.js' }).messages,
      ).toEqual([])
    },
    'alias subpath': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
        'foo.js': '',
      })
      expect(lint("import foo from '@/foo'")).toEqual({
        messages: [
          "Unexpected sibling import via alias '@/foo'. Use './foo' instead",
        ],
        output: "import foo from './foo'",
      })
    },
    'custom alias': async () => {
      await outputFiles({
        'foo.js': '',
        'package.json': JSON.stringify({}),
      })
      expect(
        lint("import foo from '../foo'", {
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
        }),
      ).toEqual({
        messages: ["Unexpected parent import '../foo'. Use 'bar/foo' instead"],
        output: "import foo from 'bar/foo'",
      })
    },
    'custom resolvePath': async () => {
      await outputFiles({
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
      })
      expect(
        lint("import foo from '../foo'", {
          filename: P.join('sub', 'sub', 'index.js'),
        }),
      ).toEqual({
        messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
        output: "import foo from '@/foo'",
      })
    },
    'cwd: babelrc': async () => {
      await outputFiles({
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
      })
      expect(
        lint("import foo from '../foo'", {
          filename: P.join('sub', 'sub', 'index.js'),
        }),
      ).toEqual({
        messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
        output: "import foo from '@/foo'",
      })
    },
    'cwd: subfolder': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' }, cwd: 'sub' },
            ],
          ],
        }),
        'sub/foo.js': '',
      })
      expect(
        lint("import foo from '../foo'", {
          filename: P.join('sub', 'sub', 'index.js'),
        }),
      ).toEqual({
        messages: ["Unexpected parent import '../foo'. Use '@/foo' instead"],
        output: "import foo from '@/foo'",
      })
    },
    'direct import of an alias from a parent': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@components': './sub/components' } },
            ],
          ],
        }),
      })
      expect(lint("import { foo } from '@components'").messages).toEqual([])
    },
    'direct import of an alias from a sibling': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@components': './components' } },
            ],
          ],
        }),
      })
      expect(lint("import { foo } from '@components'").messages).toEqual([])
    },
    'direct import of an alias from another one': async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@components': './components', '@hooks': './hooks' } },
            ],
          ],
        }),
      })
      expect(
        lint("import { foo } from '../hooks'", {
          filename: 'components/bar.js',
        }),
      ).toEqual({
        messages: ["Unexpected parent import '../hooks'. Use '@hooks' instead"],
        output: "import { foo } from '@hooks'",
      })
    },
    external: async () => {
      await fs.outputFile(
        '.babelrc.json',
        JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
      )
      expect(lint("import foo from 'foo'").messages).toEqual([])
    },
    'file in parent folder': async () => {
      await outputFiles({
        'babel.config.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
        'sub/package.json': JSON.stringify({}),
      })
      await inFolder('sub', () => expect(lint('').messages).toEqual([]))
    },
    'no aliases': async () => {
      await outputFiles({
        'foo.js': '',
        'package.json': JSON.stringify({}),
      })
      expect(() =>
        lint("import foo from '../foo'", {
          filename: P.join('sub', 'index.js'),
        }),
      ).toThrow(
        'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule.',
      )
    },
    parent: async () => {
      await fs.outputFile(
        '.babelrc.json',
        JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
      )
      expect(
        lint("import foo from '../foo/bar'", {
          filename: P.join('sub', 'index.js'),
        }),
      ).toEqual({
        messages: [
          "Unexpected parent import '../foo/bar'. Use '@/foo/bar' instead",
        ],
        output: "import foo from '@/foo/bar'",
      })
    },
    'parent import but no matching alias': async () => {
      await fs.outputFile(
        '.babelrc.json',
        JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
      )
      expect(lint("import foo from '../../foo'").messages).toEqual([])
    },
    'parent in-between folder': async () => {
      await fs.outputFile(
        '.babelrc.json',
        JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
      )
      expect(
        lint("import foo from '../foo'", {
          filename: P.join('sub', 'sub', 'index.js'),
        }),
      ).toEqual({
        messages: [
          "Unexpected parent import '../foo'. Use '@/sub/foo' instead",
        ],
        output: "import foo from '@/sub/foo'",
      })
    },
    scoped: async () => {
      await outputFiles({
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
          ],
        }),
        'foo.js': '',
      })
      expect(lint("import foo from '@foo/bar'").messages).toEqual([])
    },
  },
  [testerPluginTmpDir()],
)
