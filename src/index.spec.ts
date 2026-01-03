import P from 'node:path';

import defaults from '@dword-design/defaults';
import { expect, test } from '@playwright/test';
import packageName from 'depcheck-package-name';
import endent from 'endent';
import { ESLint } from 'eslint';
import { pick } from 'lodash-es';
import outputFiles, { type Files } from 'output-files';
import tseslint from 'typescript-eslint';

import self, { type OptionsInput } from '.';

interface TestConfig {
  error?: string | null;
  files?: Files;
  filename?: string;
  code: string;
  output?: string;
  messages?: Array<{
    message: string;
    ruleId: '@dword-design/import-alias/prefer-alias';
  }>;
  options?: OptionsInput;
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
    options: { shouldReadTsConfig: false },
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
  'multiple matching aliases takes the innermost': {
    code: "import '../lib/utils'",
    filename: P.join('sub', 'index.ts'),
    files: { 'lib/utils.ts': '' },
    messages: [
      {
        message:
          "Unexpected parent import '../lib/utils'. Use '@lib/utils' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    options: { alias: { '@': '.', '@lib': './lib' } },
    output: "import '@lib/utils'",
  },
  'no aliases': {
    code: "import '../foo'",
    error:
      'No alias configured. You have to define aliases by either passing them to the babel-plugin-module-resolver plugin in your Babel config, defining them in your tsconfig.json paths, or passing them directly to the prefer-alias rule.',
    filename: P.join('sub', 'index.ts'),
    files: { 'foo.ts': '', 'package.json': JSON.stringify({}) },
    options: { shouldReadTsConfig: false },
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
  tsconfig: {
    code: "import '../foo'",
    filename: P.join('sub', 'index.ts'),
    files: {
      'foo.ts': '',
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } },
      }),
    },
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use '@/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@/foo'",
  },
  'tsconfig with different baseUrl': {
    code: "import '../../foo'",
    filename: P.join('src', 'sub', 'index.ts'),
    files: {
      'foo.ts': '',
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: './src', paths: { '@/*': ['../*'] } },
      }),
    },
    messages: [
      {
        message: "Unexpected parent import '../../foo'. Use '@/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@/foo'",
  },
  'tsconfig with extends': {
    code: "import '../foo'",
    filename: P.join('sub', 'index.ts'),
    files: {
      'foo.ts': '',
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '~/*': ['./*'] } },
      }),
      'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json' }),
    },
    messages: [
      {
        message: "Unexpected parent import '../foo'. Use '~/foo' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '~/foo'",
  },
  'tsconfig with multiple path mappings': {
    code: "import '../lib/utils'",
    filename: P.join('sub', 'index.ts'),
    files: {
      'lib/utils.ts': '',
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['./*'], '@lib/*': ['./lib/*'] },
        },
      }),
    },
    messages: [
      {
        message:
          "Unexpected parent import '../lib/utils'. Use '@lib/utils' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@lib/utils'",
  },
  'tsconfig with multiple references': {
    code: "import '../../utils/src/helpers'",
    filename: P.join('packages', 'app', 'src', 'index.ts'),
    files: {
      'packages/app/src/foo.ts': '',
      'packages/app/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@app/*': ['./src/*'] } },
        references: [{ path: '../shared' }, { path: '../utils' }],
      }),
      'packages/shared/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./lib/*'] } },
      }),
      'packages/utils/src/helpers.ts': '',
      'packages/utils/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@utils/*': ['./src/*'] } },
      }),
    },
    messages: [
      {
        message:
          "Unexpected parent import '../../utils/src/helpers'. Use '@utils/helpers' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@utils/helpers'",
  },
  'tsconfig with nested references': {
    code: "import '../../core/utils'",
    filename: P.join('packages', 'app', 'src', 'index.ts'),
    files: {
      'packages/app/src/foo.ts': '',
      'packages/app/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@app/*': ['./src/*'] } },
        references: [{ path: '../shared' }],
      }),
      'packages/core/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@core/*': ['./*'] } },
      }),
      'packages/core/utils.ts': '',
      'packages/shared/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./lib/*'] } },
        references: [{ path: '../core' }],
      }),
    },
    messages: [
      {
        message:
          "Unexpected parent import '../../core/utils'. Use '@core/utils' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@core/utils'",
  },
  'tsconfig with references': {
    code: "import '../../shared/src/utils'",
    filename: P.join('packages', 'app', 'src', 'index.ts'),
    files: {
      'packages/app/src/foo.ts': '',
      'packages/app/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@app/*': ['./src/*'] } },
        references: [{ path: '../shared' }],
      }),
      'packages/shared/src/utils.ts': '',
      'packages/shared/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./src/*'] } },
      }),
    },
    messages: [
      {
        message:
          "Unexpected parent import '../../shared/src/utils'. Use '@shared/utils' instead",
        ruleId: '@dword-design/import-alias/prefer-alias',
      },
    ],
    output: "import '@shared/utils'",
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
