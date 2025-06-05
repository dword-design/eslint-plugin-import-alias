import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,

  preserveOutput: 'failures-only',
});
