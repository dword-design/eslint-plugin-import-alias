import P from 'node:path';

import defaults from '@dword-design/defaults';
import { expect, test } from '@playwright/test';
import packageName from 'depcheck-package-name';
import endent from 'endent';
import { ESLint } from 'eslint';
import { pick } from 'lodash-es';
import outputFiles, { type Files } from 'output-files';
import tseslint from 'typescript-eslint';

import self from '.';

interface TestConfig {
  error?: string | null;
  files?: Files;
  filename?: string;
  code: string;
  output?: string;
  messages?: Array<{ message: string; ruleId: string | null }>;
  options?: Record<string, unknown>;
}

const tests: Record<string, TestConfig> = {
  'alias subpath': {
    code: "import '@/foo'",
    files: { 'foo.ts': '' },
    messages: [
      {
        message:
          "Unexpected subpath import via alias '@/foo'. Use './foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    options: { alias: { '@': '.' } },
    output: "import './foo'",
  },
  aliasForSubpaths: {
    code: "import '@/foo'",
    files: { 'foo.ts': '' },
    options: { alias: { '@': '.' }, aliasForSubpaths: true },
  },
  babelrc: {
    code: "import '../foo'",
    filename: P.join('sub', 'index.ts'),
    files: {
      '.babelrc.json': JSON.stringify({
        plugins: [
          [packageName`babel-plugin-module-resolver`, { alias: { '@': '.' } }],
        ],
      }),
      'foo.ts': '',
    },
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use '@/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@/foo'",
  },
  'custom alias': {
    code: "import '../foo'",
    filename: 'sub/index.ts',
    files: { 'foo.ts': '', 'package.json': JSON.stringify({}) },
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use 'bar/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    options: { alias: { bar: '.' } },
    output: "import 'bar/foo'",
  },
  'custom resolvePath': {
    code: "import '../foo'",
    filename: P.join('sub', 'sub', 'index.ts'),
    files: {
      '.babelrc.json': JSON.stringify({ extends: 'babel-config-foo' }),
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
      'sub/foo.ts': '',
    },
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use '@/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@/foo'",
  },
  external: { code: "import 'foo'", options: { alias: { '@': '.' } } },
  'no aliases': {
    code: "import '../foo'",
    error:
      'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, or directly to the prefer-alias rule.',
    filename: P.join('sub', 'index.ts'),
    files: { 'foo.ts': '', 'package.json': JSON.stringify({}) },
  },
  'parent import but no matching alias': {
    code: "import '../../foo'",
    options: { alias: { '@': '.' } },
  },
  'parent import with ..': {
    code: "import '../foo'",
    filename: P.join('sub', 'index.ts'),
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use '@/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    options: { alias: { '@': '.' } },
    output: "import '@/foo'",
  },
  'parent import with alias': {
    code: "import '@/foo'",
    filename: P.join('sub', 'index.ts'),
    files: { 'foo.ts': '' },
    options: { alias: { '@': '.' } },
  },
  'parent in-between folder': {
    code: "import '../foo'",
    filename: P.join('sub', 'sub', 'index.ts'),
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use '@/sub/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    options: { alias: { '@': '.' } },
    output: "import '@/sub/foo'",
  },
  scoped: {
    code: "import '@foo/bar'",
    files: { 'foo.ts': '' },
    options: { alias: { '@': '.' } },
  },
};

for (const [name, partialTestConfig] of Object.entries(tests)) {
  test(name, async ({}, testInfo) => {
    const cwd = testInfo.outputPath();

    const testConfig = defaults(partialTestConfig, {
      error: null,
      filename: 'index.ts',
      files: {},
      messages: [],
      output: partialTestConfig.code,
    });

    await outputFiles(cwd, testConfig.files);

    const lintingConfig = {
      baseConfig: [
        ...tseslint.configs.recommended,
        self.configs.recommended,
        {
          rules: {
            '@dword-design/import-alias/prefer-alias': [
              'error',
              defaults(testConfig.options, {
                babelOptions: { configFile: false },
              }),
            ],
          },
        },
      ],
      cwd,
      overrideConfigFile: true,
    } as ESLint.Options;

    const eslintToLint = new ESLint(lintingConfig);
    const eslintToFix = new ESLint({ ...lintingConfig, fix: true });

    if (testConfig.error) {
      await expect(
        eslintToLint.lintText(testConfig.code, {
          filePath: testConfig.filename,
        }),
      ).rejects.toThrow(testConfig.error);
    } else {
      const lintResult = await eslintToLint.lintText(testConfig.code, {
        filePath: testConfig.filename,
      });

      const lintedMessages = lintResult
        .flatMap(_ => _.messages)
        .map(_ => pick(_, ['ruleId', 'message']));

      expect(lintedMessages).toEqual(testConfig.messages);

      const outputResult = await eslintToFix.lintText(testConfig.code, {
        filePath: testConfig.filename,
      });

      const lintedOutput = outputResult.map(_ => _.output).join('\n');
      expect(lintedOutput || testConfig.code).toEqual(testConfig.output);
    }
  });
}
