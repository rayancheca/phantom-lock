# Security posture

Phantom Lock is a zero-backend static site. There is no server, no account, no
network call, and no data leaves the browser — layouts live in IndexedDB on the
device. That removes most of the usual attack surface and concentrates what
remains into two places: **what the page is allowed to execute**, and **what the
app accepts as untrusted input**.

Everything below was verified against the real production build; where a claim
is not verified, it says so.

---

## 1. Content-Security-Policy

The policy is declared once in [`src/security-headers.ts`](../src/security-headers.ts)
and reaches the browser two ways:

| Mechanism | Where | Carries |
|---|---|---|
| `<meta http-equiv>` injected at build time | `vite.config.ts` → `dist/index.html` | 14 directives |
| Real HTTP headers | `public/_headers` (→ `dist/_headers`), `vercel.json` | the same 14 **plus `frame-ancestors`** |

```
default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data: blob:; font-src 'self'; connect-src 'none';
worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none';
media-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'                        ← HTTP header only
```

No nonce and no hash are needed: the build emits exactly one module script, zero
inline `<script>`, zero inline `<style>`, and — because the app has no dynamic
imports — no modulepreload polyfill.

### What the meta tag cannot do

`frame-ancestors`, `sandbox` and `report-uri` are **ignored** in a `<meta>`
policy (W3C CSP Level 3 §3.3), and Chrome logs a console *error* if it sees
them there. So **clickjacking protection cannot be delivered by the meta tag** —
it needs a real header. The meta tag is the self-contained floor that travels
with the files wherever they are served; a properly configured host adds the
rest.

### Non-obvious decisions

- **`style-src 'self'` with no `'unsafe-inline'`.** React 19 writes inline
  styles through CSSOM (`style.setProperty`), never `setAttribute('style')`, so
  the app's ~31 style-attribute elements keep working while a genuine style
  attribute write is blocked. This is the directive most likely to silently kill
  the UI, so `src/__tests__/security-headers.test.ts` also fails the build if
  any source file reaches for `setAttribute('style')`, `insertRule`,
  `innerHTML`, `eval` or `new Function`.
- **`img-src` needs both `data:` and `blob:`** — `data:` for the emoji SVG
  favicon and the persisted underlay, `blob:` for floorplan photo import and the
  "Export plan image" download. A control run with `img-src 'self'` blocked all
  three, favicon included.
- **`font-src 'self'` is not redundant.** The two `<link rel=preload as=font>`
  tags route to `font-src` independently of the `@font-face` rules.
- **`upgrade-insecure-requests` is deliberately absent.** With it enabled, the
  identical `dist/` served over plain http on a LAN address is a total outage —
  and the failure does *not* surface as a CSP violation, so a violation-counting
  test reports success while the app is dead. It buys nothing here: every
  subresource is a same-origin relative path. **This is invisible on
  `localhost`**, which is a potentially-trustworthy origin where the upgrade
  never fires; any "safe over plain http" check must use a LAN IP or hostname.

### Forward note

`worker-src 'none'` and `connect-src 'none'` are correct *today* and will need
loosening for two already-planned pieces of work: moving `useSimulation` into a
Web Worker, and the approved read-only Three.js 3D view (its DRACO/KTX2 loaders
spawn workers from `blob:` URLs). The intended values are recorded as
`FUTURE_LOOSENING` in `src/security-headers.ts`.

### Verification

Verified in headless Chrome against the real build, driving the full golden path
in both DESIGN and TUNE — first-run dialog, Legend, optimizer, `<Term>`
popovers, glossary, keyboard speaker placement, canvas PNG export, clipboard
copy, and the gallery: **18/18 steps, 0 violations, 0 page errors, 0 failed
requests**, under meta-only, under meta + real headers, and over plain http on a
LAN IP. A negative control (injecting an inline `<script>`) *is* blocked in every
run — without it, "0 violations" would be unfalsifiable.

*Limits:* one browser (headless Chrome). No Firefox or Safari. No real
deployment to Netlify/Cloudflare/Vercel — the header **values** and the
`dist/_headers` placement are proven, the host plumbing is not.

---

## 2. Untrusted input

Two things cross the trust boundary: an imported **layout JSON** file and an
imported **floorplan photo**.

### The load path never mangles

`sanitizeScene` is allow-list reconstruction, so there is no
prototype-pollution gadget. Three defects were fixed:

1. **A single malformed record used to eat every layout.** `speakers: [null]`
   and `rooms: [null]` threw a `TypeError`, and `loadStore` catches everything
   in one outer `try` that then returns `defaultStore()` — so one bad record
   silently replaced all of the user's work, and autosave wrote the replacement
   back. Both sites now null-check, and each record is additionally sanitized in
   isolation so any *future* throw is contained to the record that caused it.
2. **The sanitizer output aliased the caller's parse tree.** Every accepted
   `Vec2` was assigned by reference, so mutating the raw JSON afterwards changed
   the stored scene, arbitrary extra keys rode into IndexedDB and every export,
   and a JSON `"__proto__"` key survived as an own property. Positions are now
   rebuilt as fresh two-key literals.
3. **A colliding id silently moved the user's active seat.** Ids are
   deduplicated in document order; with objects processed first, an imported
   object whose id matched the active seat's forced the *seat* to be re-issued,
   so `activeListenerId` no longer matched and YOU fell back to seat 0 — a
   verdict computed for a seat the user never chose. The same hole unlinked
   stereo pairs. Seats and speakers now claim their ids **before** objects,
   which are the only entities nothing references by id.

**No position is clamped and no geometry is rewritten on load.** That is
deliberate: clamping coordinates would silently flatten a legitimate layout the
app's own "Add a room…" produced (measured: 42 appended 6 m rooms, or 11 at the
UI's 25 m maximum, collapse 75 walls onto a single line), and autosave would
overwrite the good record ~400 ms later. A refused import is recoverable;
mangled geometry is not.

For precision, the load path does carry three **pre-existing** bounds, all of
which are unreachable from app-produced data and none of which touch a position:
object/speaker heights and a seat's `z` are clamped to 0.02–6 m (the inspector's
own inputs are capped at `max={6}`, and listener/speaker z ranges are strictly
inside it); `listeners[]` is capped at 32 (`addListener` no-ops at the cap, "so
we never create seats a later load would silently drop"); and a circle radius has
a 5 cm floor, which only a degenerate sub-5 cm drag could hit.

### The import path rejects rather than repairs

`importRejection` (in `src/engine/scene.ts`) runs **before anything is
committed**, so a refused file leaves the store untouched and the user keeps
their file. Limits: span 400 m, coordinate 100 km, 5 000 objects, 64 speakers,
500 areas, 256-character ids. The bundled demo, a maximum-size room from the UI
dialog, and a 20-room layout built through "Add a room…" all pass — asserted by
a test, because a limit that fires on real data is a data-loss bug, not a
security fix.

### Termination

Every grid loop in the engine walks `for (x = min.x; x <= max.x; x += step)`
over `sceneBounds`, with `step` floored at 0.25. Past |x| ≈ 2⁵¹ that addition is
a no-op in IEEE-754. A **354-byte** payload — one circle with `r: 1e308`, which
the sanitizer accepted because `Math.max(0.05, r)` has no upper bound — ran
3 000 000 grid-cell bodies without the loop variable moving, then died with
"heap out of memory" at 4 094 MB. Because the layout persisted, it re-crashed on
every reload: a permanent, unrecoverable brick from a file smaller than this
paragraph.

`sceneBounds` now (a) tests all four components for finiteness, not just
`min.x` — a circle at (1e308, 1e308) overflows `max.x` to `Infinity` while
`min.x` stays finite — and (b) bounds the **returned search region** to
`MAX_SCENE_SPAN`. The scene itself is never modified, so nothing is mangled or
persisted; only the box handed to the grid loops is bounded.

### Known limit — worst-case CPU is mitigated, not closed

The import limits reject every pathological payload measured, and the bounds fix
guarantees termination. They do **not** make an accepted import fast, and they do
not bound worst-case CPU for a payload hand-tuned to sit just under every limit.

Measured, with every value inside the accepted range: 200 speakers, span 399 m
and 100 objects cost **~157 s** for a single simulation pass — and because the
layout persists, that freeze recurs on every load until the user finds and
deletes it. Speakers alone were ~18 s at the old cap with no furniture at all,
which is why `MAX_IMPORT_SPEAKERS` was subsequently tightened from 200 to 64.
Even so the product `objects × pairs × span²` is unbounded from the boundary's
side; a legitimately-built 10-room house already costs ~200 ms per simulation.

Genuinely bounding this requires an iteration cap inside the grid loops
themselves (`bestspot.ts`, `pairspot.ts`), which are frozen this session.
**That work is P0 in [`ideas.md`](ideas.md) and this claim must not be upgraded
until it lands.**

### Photo import

A `file.size` gate would be the wrong control and is deliberately not used: a
valid 8192×8192 PNG of 192 MB decodes in ~197 ms, while a 16384×16384
decompression bomb hides in 1.17 MB. Size does not predict decode cost. Images
are rasterized through `<img>` + canvas and re-encoded to a fresh JPEG, so an
SVG's scripts never run and the canvas is not tainted.

---

## 3. What was checked and found clean

No `innerHTML`, `dangerouslySetInnerHTML`, `outerHTML`, `insertAdjacentHTML`,
`document.write`, `eval`, or `new Function` anywhere in `src` outside tests. No
network calls of any kind. No secrets. Download filenames are regex-slugged.
Prototype pollution is not reachable — verified with five payloads
(`__proto__` at top level and nested, `constructor.prototype`, `__proto__` as an
id and as a room name): `Object.prototype` gained no keys. `npm audit` is clean
(React and ReactDOM are the only runtime dependencies).
