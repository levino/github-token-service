import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false, // Tests share database
    testTimeout: 10000,
    env: {
      NODE_ENV: 'development', // Enable dev auth for testing
      DATABASE_PATH: './data/test.db',
      RP_ID: 'localhost',
      RP_NAME: 'Test Service',
      ORIGIN: 'http://localhost:3000',
    },
  },
});
