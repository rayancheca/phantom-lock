/**
 * The single source of truth for Phantom Lock's Content-Security-Policy and
 * security headers.
 *
 * BUILD-TIME / CONFIG ONLY. Imported by `vite.config.ts` (the build-time meta
 * injector and the `preview` harness) and by `src/__tests__/security-headers.test.ts`.
 * No client module imports it, so it never reaches the browser bundle — the same
 * arrangement as `src/styles/contrast.ts`.
 *
 * Phantom Lock is a zero-backend static site: one module script, one stylesheet,
 * seven self-hosted fonts, and no network calls at all. That makes an unusually
 * strict policy affordable — `default-src 'none'` with no nonce and no hash.
 *
 * Every directive below was verified against the real production build in
 * headless Chrome, driving the full golden path in both modes (0 violations),
 * with a negative control (an injected inline `<script>` IS blocked) proving the
 * policy was actually enforcing rather than merely being sent.
 */

/** Directives that a `<meta http-equiv>` policy can actually enforce. */
export const CSP_DIRECTIVES: readonly string[] = [
  // Deny by default; every resource type is then opted in explicitly.
  "default-src 'none'",
  // One same-origin module script. No inline, no eval, no nonce needed:
  // `dist/index.html` carries zero inline <script>. Vite DOES emit its
  // modulepreload polyfill into the bundle, but the app has zero dynamic imports
  // so no `<link rel="modulepreload">` is ever inserted and the polyfill never
  // runs — and `connect-src 'none'` would block its `fetch` even if it did.
  "script-src 'self'",
  // No 'unsafe-inline'. React 19 writes inline styles through CSSOM
  // (`style.setProperty`), never `setAttribute('style')`, so the ~31 elements
  // with a style attribute keep working while a genuine style-attribute write
  // is blocked. This is the directive most likely to silently kill the UI, so
  // `security-headers.test.ts` also asserts the codebase never regresses to
  // setAttribute('style') / insertRule.
  "style-src 'self'",
  // `data:` for the emoji SVG favicon (index.html) and the persisted underlay
  // data URL; `blob:` for floorplan photo import (`underlay-import.ts`) and the
  // "Export plan image" download. A negative control with `img-src 'self'`
  // blocked all three, favicon included.
  "img-src 'self' data: blob:",
  // Required independently of default-src: the two <link rel=preload as=font
  // crossorigin> in index.html route to font-src.
  "font-src 'self'",
  // The app makes no requests of any kind. The single `fetch(` token in the
  // bundle is inside Vite's modulepreload polyfill, which is unreachable.
  "connect-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "media-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  // No form posts anywhere; the three <form>s are onSubmit + preventDefault.
  "form-action 'self'",
];

/**
 * Clickjacking protection. Kept OUT of `CSP_DIRECTIVES` on purpose:
 * `frame-ancestors` is ignored when delivered via `<meta>` (W3C CSP Level 3
 * §3.3, alongside `report-uri` and `sandbox`), and Chrome logs a console ERROR
 * when it sees it there — which would defeat the clean-console bar this project
 * holds itself to. It can only be delivered as a real HTTP header.
 */
export const CSP_FRAME_ANCESTORS = "frame-ancestors 'none'";

/** The policy string for the build-injected `<meta http-equiv>` tag. */
export const CSP_META = CSP_DIRECTIVES.join('; ');

/** The policy string for a real `Content-Security-Policy` HTTP header. */
export const CSP_HEADER = [...CSP_DIRECTIVES, CSP_FRAME_ANCESTORS].join('; ');

/**
 * The full header set a host should send.
 *
 * Deliberately NOT included: `upgrade-insecure-requests`. Serving the identical
 * `dist/` over plain http on a LAN address with it enabled produces a total
 * outage (every same-origin subresource is rewritten to https and fails), and
 * the failure does not surface as a CSP violation — so a violation-counting
 * harness reports success while the app is dead. It buys nothing here: every
 * subresource is a same-origin relative path.
 *
 * Note that check is invisible on localhost — `127.0.0.1` is a
 * potentially-trustworthy origin, so the upgrade never fires there. Any
 * "is this safe over plain http" test must run against a LAN IP or hostname.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CSP_HEADER,
  // Stops the browser from sniffing a non-HTML/non-script MIME type into an
  // HTML or script context, and enforces MIME matching on script/style loads.
  'X-Content-Type-Options': 'nosniff',
  // The frame-ancestors equivalent for older engines; belt and braces.
  'X-Frame-Options': 'DENY',
  // The app never makes a request, so there is no referrer to leak to a third
  // party — but a layout name or route should not reach one via a user-followed
  // link either. `no-referrer` costs nothing here because nothing needs it.
  'Referrer-Policy': 'no-referrer',
  // The app uses no device APIs; deny them so an injected script cannot either.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Forward note for the next sessions that will need this loosened:
 *   * Session 6 moves `useSimulation` into a Web Worker → `worker-src 'self' blob:`.
 *   * The approved read-only Three.js 3D view spawns DRACO/KTX2 workers from
 *     `blob:` URLs and may fetch assets → `worker-src 'self' blob:` and
 *     `connect-src 'self'`.
 * Loosen deliberately when those land; do not discover it as a mystery bug.
 */
export const FUTURE_LOOSENING = {
  worker: "worker-src 'self' blob:",
  connect: "connect-src 'self'",
} as const;
