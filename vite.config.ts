import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * Two projects (S7). `test.projects` is the supported mechanism in vitest 3;
     * `environmentMatchGlobs` and `test.workspace` are both deprecated and would
     * print a deprecation banner into the terminal tail the operating protocol
     * requires be pasted as gate evidence.
     *
     * The `node` project's `environment` and `include` are byte-identical to the
     * pre-S7 top-level config, so every pre-existing test runs exactly as before.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/a11y-env.ts'],
        },
      },
    ],
  },
});
