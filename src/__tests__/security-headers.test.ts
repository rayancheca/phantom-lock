import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CSP_DIRECTIVES,
  CSP_FRAME_ANCESTORS,
  CSP_HEADER,
  CSP_META,
  SECURITY_HEADERS,
} from '../security-headers';

/**
 * The policy is declared once in `src/security-headers.ts` but has to be
 * repeated verbatim in two static host-config files that cannot import it.
 * These assertions are what keeps the three copies from drifting — and drift
 * here is silent: a stale `_headers` still serves, it just serves the wrong
 * policy.
 *
 * Read off disk with `readFileSync`, never `?raw` — vitest stubs CSS/raw module
 * imports (`test.css` defaults to false), so a `?raw` import yields `""` and
 * every assertion below would pass against nothing.
 */
const root = new URL('../../', import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), 'utf8');

const headersFile = read('public/_headers');
const vercelFile = read('vercel.json');

describe('security-headers source of truth', () => {
  it('actually read the files (guards against a vacuous pass)', () => {
    expect(headersFile.length).toBeGreaterThan(200);
    expect(vercelFile.length).toBeGreaterThan(200);
    expect(CSP_DIRECTIVES.length).toBeGreaterThan(10);
  });

  it('keeps frame-ancestors OUT of the meta policy and IN the header policy', () => {
    // Chrome logs a console ERROR for `frame-ancestors` in a meta tag (W3C CSP
    // Level 3 §3.3 — ignored there), which would break the clean-console bar.
    expect(CSP_META).not.toContain('frame-ancestors');
    expect(CSP_HEADER).toContain(CSP_FRAME_ANCESTORS);
  });

  it('never ships upgrade-insecure-requests', () => {
    // Verified to kill the app outright when the same dist is served over plain
    // http on a LAN address — and it does NOT surface as a CSP violation.
    for (const policy of [CSP_META, CSP_HEADER, headersFile, vercelFile]) {
      expect(policy).not.toContain('upgrade-insecure-requests');
    }
  });

  it('has no unsafe escape hatches anywhere', () => {
    for (const policy of [CSP_META, CSP_HEADER, headersFile, vercelFile]) {
      expect(policy).not.toContain('unsafe-inline');
      expect(policy).not.toContain('unsafe-eval');
      expect(policy).not.toContain('unsafe-hashes');
    }
  });

  it('public/_headers matches the source of truth exactly', () => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headersFile).toContain(`${key}: ${value}`);
    }
  });

  it('vercel.json matches the source of truth exactly', () => {
    const parsed = JSON.parse(vercelFile) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const got = Object.fromEntries(parsed.headers[0].headers.map((h) => [h.key, h.value]));
    expect(got).toEqual({ ...SECURITY_HEADERS });
  });
});

/**
 * The plugin is the ONLY thing putting the policy into the shipped HTML. If it
 * silently stopped emitting (renamed hook, wrong `apply`, a bad merge), every
 * other test here would still pass and `npm run build` would still succeed —
 * the app would just ship with no CSP. Assert the descriptor directly; it needs
 * no `vite build`.
 */
describe('the build-time CSP injector', () => {
  it('emits the policy as a head-prepended meta, build-only', async () => {
    const { cspMeta } = (await import('../../vite.config')) as unknown as {
      cspMeta: () => {
        name: string;
        apply: string;
        transformIndexHtml: () => Array<{
          tag: string;
          attrs: Record<string, string>;
          injectTo: string;
        }>;
      };
    };
    const plugin = cspMeta();
    // `apply: 'build'` is what keeps `npm run dev` alive: the dev server injects
    // an inline react-refresh preamble and an HMR WebSocket that this policy
    // would block on script-src, connect-src AND style-src.
    expect(plugin.apply).toBe('build');

    const [tag] = plugin.transformIndexHtml();
    expect(tag.tag).toBe('meta');
    expect(tag.attrs['http-equiv']).toBe('Content-Security-Policy');
    expect(tag.attrs.content).toBe(CSP_META);
    // Must precede everything it governs: the data: favicon and the font preloads.
    expect(tag.injectTo).toBe('head-prepend');
  });
});

/**
 * `style-src 'self'` is the single directive most likely to silently kill the
 * UI, and it holds only because React 19 writes inline styles through CSSOM.
 * The moment any code reaches for a style ATTRIBUTE (or injects a stylesheet or
 * a script), the policy starts blocking real app behaviour. Assert the property
 * rather than trusting a comment.
 */
describe('the codebase stays compatible with the policy', () => {
  // `src/`, NOT `new URL('../', root)` — that climbs one level ABOVE the repo
  // and walked every sibling git worktree (581 files, 499 of them outside this
  // checkout), so an unrelated branch could fail this suite with a message
  // naming a file that is not in the repo. The defect was self-concealing: both
  // vacuity guards below still passed on the wrong tree.
  const srcDir = new URL('src/', root);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__' && entry !== 'node_modules') walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  // Exclude the policy module and this test: both NAME the forbidden APIs in
  // prose, and a scanner that flags its own documentation is useless.
  const files = walk(srcDir.pathname).filter(
    (f) => !f.endsWith('security-headers.test.ts') && !f.endsWith('src/security-headers.ts'),
  );
  const sources = files.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));

  it('scanned a real set of source files (guards against a vacuous pass)', () => {
    // Deterministic now that the root is `src/` (~82 files), so this can be a
    // real floor rather than a token one.
    expect(sources.length).toBeGreaterThan(70);
    expect(sources.some((s) => s.file.endsWith('scene.ts'))).toBe(true);
    // And it must be THIS checkout — the bug it replaces read sibling worktrees.
    expect(sources.every((s) => s.file.includes('/src/'))).toBe(true);
  });

  const forbidden: Array<[string, RegExp]> = [
    ['setAttribute("style") — blocked by style-src', /setAttribute\(\s*['"`]style['"`]/],
    ['insertRule — blocked by style-src', /\.insertRule\s*\(/],
    ['eval — blocked by script-src', /\beval\s*\(/],
    ['new Function — blocked by script-src', /\bnew\s+Function\s*\(/],
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\.innerHTML\s*=/],
    // docs/security.md §3 asserts these three are absent; enforce it rather than
    // trust it, so the claim can't quietly become false.
    ['outerHTML', /\.outerHTML\s*=/],
    ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
    ['document.write', /document\.write\s*\(/],
  ];

  for (const [label, pattern] of forbidden) {
    it(`contains no ${label}`, () => {
      const hits = sources.filter((s) => pattern.test(s.text)).map((s) => s.file);
      expect(hits).toEqual([]);
    });
  }
});
