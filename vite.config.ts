import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { CSP_META, SECURITY_HEADERS } from './src/security-headers';

/**
 * Inject the CSP as a `<meta http-equiv>` at BUILD TIME ONLY.
 *
 * It cannot live in the source `index.html`: `@vitejs/plugin-react` injects an
 * inline react-refresh preamble and `/@vite/client` opens an HMR WebSocket and
 * pushes CSS through `style.textContent`, so a source-level policy breaks
 * `npm run dev` on `script-src`, `connect-src` AND `style-src` — a confusing
 * failure whose symptom points away from the cause.
 *
 * `head-prepend` matters: the policy must precede everything it governs (the
 * `data:` favicon, both font preloads, the emitted script and stylesheet).
 *
 * A meta policy cannot carry `frame-ancestors` — see `security-headers.ts`. For
 * clickjacking protection a host must send the real header set; the meta tag is
 * the self-contained floor that travels with the files wherever they are served.
 */
export function cspMeta(): Plugin {
  return {
    name: 'phantom-lock-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_META },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  /**
   * VERIFICATION HARNESS ONLY — this ships nothing.
   *
   * `preview` is a dev-server option; it is never written to `dist/`, so no host
   * gets these headers from here. It exists so `npm run preview` reproduces what
   * a correctly-configured host sends (`public/_headers` / `vercel.json`), which
   * `npm run preview` otherwise does not: it sends no security headers at all.
   *
   * Under preview both the build-injected meta AND these headers apply, and two
   * policies enforce as an intersection. They are compatible today (the header
   * is exactly the meta plus `frame-ancestors`); if you edit one, edit both, or
   * the effective policy silently narrows in preview only.
   */
  preview: { headers: { ...SECURITY_HEADERS } },
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
