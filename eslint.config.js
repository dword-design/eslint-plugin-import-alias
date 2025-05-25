import config from '@dword-design/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  config,
  {
    files: ['eslint.config.js'],
    rules: { 'import/no-extraneous-dependencies': 'off' },
  },
]);
