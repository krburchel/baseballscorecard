import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The app is loaded into its own jsdom window by test/helpers/loadApp.js,
    // so the test runner itself only needs a plain node environment.
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
