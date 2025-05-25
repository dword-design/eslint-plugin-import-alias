import P from 'node:path';

import { endent, flatten, join, map, pick } from '@dword-design/functions';
import tester from '@dword-design/tester';
import testerPluginTmpDir from '@dword-design/tester-plugin-tmp-dir';
import packageName from 'depcheck-package-name';
import { ESLint } from 'eslint';
import { execaCommand } from 'execa';

import self from './index.js';

export default tester(
  {
    'prefer-alias': {
      code: endent`
        import foo from '../foo/bar'
      `,
      filename: P.join('sub', 'index.js'),
      files: {
        '.babelrc.json': JSON.stringify({
          plugins: [
            [
              packageName`babel-plugin-module-resolver`,
              { alias: { '@': '.' } },
            ],
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
  },
  [
    testerPluginTmpDir(),
    {
      transform: test => async () => {
        test.filename = test.filename || 'index.js';
        test.output = test.output || test.code;
        test.messages = test.messages || [];

        const lintingConfig = {
          baseConfig: self.configs.recommended,
          overrideConfigFile: true,
        };

        const eslintToLint = new ESLint(lintingConfig);
        const eslintToFix = new ESLint({ ...lintingConfig, fix: true });

        const lintedMessages =
          eslintToLint.lintText(test.code, { filePath: test.filename })
          |> await
          |> map('messages')
          |> flatten
          |> map(pick(['ruleId', 'message']));

        expect(lintedMessages).toEqual(test.messages);

        const lintedOutput =
          eslintToFix.lintText(test.code, { filePath: test.filename })
          |> await
          |> map('output')
          |> join('\n');

        expect(lintedOutput).toEqual(test.output);
      },
    },
    { before: () => execaCommand('base prepublishOnly') },
  ],
);
