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
inline `<script>`, and zero inline `<style>`. Vite does bundle its modulepreload
polyfill, but the app has no dynamic imports, so no `<link rel="modulepreload">`
is ever inserted and the polyfill never runs — and `connect-src 'none'` would
block its `fetch` even if it did.

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

Every grid loop in the engine walks `for (t = min + step/2; t <= max; t += step)`
over `sceneBounds`. `bestspot`'s step is `max(0.25, min(0.7, span/24))` and
`pairspot`'s is a fixed 0.35 — note the **0.7 ceiling**, not the 0.25 floor, is
the load-bearing one: past span ≈ 16.8 m the step stops adapting entirely (and
the `coarse` drag path becomes inert, costing exactly what the settled path
costs). Past |x| ≈ 2⁵¹ the addition is a no-op in IEEE-754. A **354-byte**
payload — one circle with `r: 1e308`, which the sanitizer accepted because
`Math.max(0.05, r)` has no upper bound — ran 3 000 000 grid-cell bodies without
the loop variable moving, then died with "heap out of memory" at 4 094 MB.
Because the layout persisted, it re-crashed on every reload: a permanent,
unrecoverable brick from a file smaller than this paragraph.

`sceneBounds` now (a) tests all four components for finiteness, not just
`min.x` — a circle at (1e308, 1e308) overflows `max.x` to `Infinity` while
`min.x` stays finite — and (b) bounds the **returned search region** to
`MAX_SCENE_SPAN`. The scene itself is never modified, so nothing is mangled or
persisted; only the box handed to the grid loops is bounded.

**S8 believed that closed the termination class. It did not** (found S18, by an
adversarial pass on the cap design). Whether `t += step` advances depends on the
box's absolute **coordinates**, not its span, and `sceneBounds` clamps only the
span. Two reachable holes, both through the load path — `sanitizeScene` clamps no
coordinate, and `importRejection` (which does, via `MAX_IMPORT_COORD`) guards only
the JSON-import handler:

- A room of an entirely **ordinary 400 m span** parked at x ≈ 4.6e15 cannot
  advance a 0.35 m step at all — an infinite loop at flat memory.
- Past ≈ 1e21, `clampSpan` sets `min = mid − 10000` and `max = mid + 10000`, but
  both round to `mid`, so the span is exactly **0** and every `span > 0` guard
  waves the scene straight through into that same endless loop.

`engine/grid.ts` `minAdvancingStep` closes both: every sweep now gets a step of at
least `2·|coord|·ε`, which is guaranteed to move the accumulator. It only starts
to bind past |coord| ≈ 2⁴⁹ ≈ 5.6e14 — ten orders of magnitude beyond
`MAX_IMPORT_COORD` — so no real layout sees it.

### Worst-case CPU — bounded (S18), with one measured residual

**Superseded claim.** This section previously read "mitigated, not closed", and
cited ~157 s for 200 speakers / span 399 m / 100 objects. `MAX_IMPORT_SPEAKERS`
has since been tightened 200 → 64, and the grid loops are now capped, so both
halves of that text are stale. Re-measured from scratch in S18
(`docs/sessions/S18/bench/`, node 25).

`engine/grid.ts` bounds each sweep by two ceilings, because neither alone is
enough and they catch different shapes:

- **`MAX_GRID_CELLS` = 160 000** — the huge-span / cheap-cell shape, where the
  work product stays small because there is little to occlude. A 400 m square
  with 20 walls reaches 1 243 528 pairspot cells at a work product of only
  4.97 × 10⁷, *below* several legitimate scenes, so the work ceiling cannot see
  it. This is also the **only** guard on the load path: bounded solely by
  `MAX_SCENE_SPAN`, `pairspot` projects 3.27 **billion** cells — an OOM, not a
  stall.
- **`MAX_GRID_WORK` = 1.5 × 10⁸** on `cells × perCellCost` — the expensive-cell
  shape, which a cell ceiling cannot bound because per-cell cost is itself
  unbounded from the boundary's side: 5 000 objects × 64 speakers measures
  **47.8 ms per cell**, so even a hundred cells would take five seconds.

Measured, one full simulation pass (`traceScene` + `computeAudio` +
`bestListeningSpot`), every payload inside `importRejection`:

| payload (all import-ACCEPTED) | before | after |
|---|---|---|
| span 45.6 m, 100 objects, 64 speakers | 4.2 s | 3.8 s |
| span 90.6 m, 100 objects, 64 speakers | 16.5 s | 5.0 s |
| span 180.6 m, 100 objects, 64 speakers | 65.1 s | 5.0 s |
| **span 359.7 m, 100 objects, 64 speakers** | **264.6 s** | **4.9 s** |
| span 30 m, **5 000 objects**, 64 speakers | 93.5 s | 4.7 s |
| span 399 m, 5 000 objects, 64 speakers | hours (never completed) | 4.5 s |
| `MAX_SCENE_SPAN` box (load path only) | OOM crash | bounded by cell ceiling |

Cost is now essentially **flat in span**, which was the unbounded direction.

**Superseded (S19).** The paragraphs that stood here described `bestReflectionDb`
as an unbounded residual the grid cap could not reach, quoted **132.2 s** for a
wall-heavy payload, and projected "tens of minutes" at 4 000 walls. S19 bounded
that search directly (`engine/reflection.ts`), so the numbers below replace them.
The *reasoning* is preserved verbatim in [`ideas.md`](ideas.md) §2 because it is
still correct and still load-bearing: a walls-aware cost proxy remains forbidden,
since a legitimate multi-room house is the wall-heaviest thing the app produces
(a legit 50-room chain scored **20× higher** than the attack under such a model).
S19 did not add one — it made the work cheaper instead.

### The reflection search — bounded (S19)

`bestReflectionDb` was 94–100 % of a simulation pass on every wall-heavy scene, and
it loaded that cost through two *opposite* factors, which is why one cap could
never have fixed both: the 50-room chain ran **45 901 calls × 315 µs**, the
wall-heavy attack **16.0 M calls × 7.7 µs**. S19 attacks the per-call work
(hoisting everything independent of the grid cell, an allocation-free
`blocked`-only occlusion scan) *and* the call count (skipping cells and `reachDb`
evaluations whose results are provably discarded).

Measured, one full pass — `traceScene` + `computeAudio` + `bestListeningSpot` —
node 25, same machine, `docs/sessions/S19/bench/{before,after}.txt`:

| payload | S18 | S19 | |
|---|---|---|---|
| bundled Maple Court demo | 64.4 ms | **49.9 ms** | 1.3× |
| 10-room chain, 4 speakers | 179.8 ms | **39.5 ms** | 4.6× |
| **50-room chain, 4 speakers** | **13.7 s** | **0.50 s** | **27×** |
| 100-room chain, 4 speakers | 102.8 s | **1.8 s** | 58× |
| span 399, 100 objects, 64 speakers | 4.9 s | **0.12 s** | 41× |
| walled span 100, 20 walls, 64 speakers | 42.3 s | **4.6 s** | 9.3× |
| **walled span 399, 20 walls, 64 speakers** | **129.7 s** | **12.0 s** | **10.8×** |

Every payload above is inside `importRejection`. The 50-room and 100-room chains
are the *legitimate* shapes — layouts the "Add a room…" dialog builds one click at
a time — and they were the everyday-slowness half S18 explicitly could not deliver.

**Bit-identity, not approximation.** None of this changes a single output. It is
pinned by a golden captured from the pre-S19 engine (git `c95a57b`): 153 entries
and 8 814 direct `bestReflectionDb` samples over 17 branch-coverage scenes, plus
S18's own 30/30 legit-scene golden. Negative controls confirm the harness fails
when arithmetic moves — a nested `Math.hypot` rewritten as `sqrt(x*x+y*y)` breaks
14 entries, `v.norm` → `v.scale(q, 1/len)` breaks 1, and dropping the cell skip's
`solos.length === 0` guard breaks 8.

**The residual, stated honestly — do not upgrade this claim without measuring.**
The wall-heavy attack is still the worst import-legal payload at **12.0 s**, above
the ~10 s this work aimed at. Where that 12.0 s sits, measured: `computeAudio`
**8.5 s**, `bestListeningSpot` **3.4 s**, `traceScene` 0.13 s. The `computeAudio`
term is `bestPairSpot` running once per apex-blocked pair — 32 sweeps of ~154 000
cells — and it returns `null` for every pair, i.e. it is again work that produces
nothing. Unlike `bestListeningSpot`, though, its cell gate is *reachability*, which
cannot be decided without doing the occlusion work, so the S19 cell-skip trick has
no analogue there. `reflectionDb` itself now measures **1.0 µs/call** against 7.7 µs
before, and is close to its floor: 20 wall iterations carrying two unavoidable
divisions each, where the obvious fix (one reciprocal, two multiplies) is exactly
the reassociation bit-identity forbids. Closing the last 20 % needs a different
idea, not more of this one — rescheduled as [`ideas.md`](ideas.md) §2d.

**Where the time actually goes now.** On ordinary scenes `traceScene` is once again
the dominant term (44.1 ms of the bundled demo's 49.9 ms) and the demo barely moved,
because it has almost no reflection cost to remove. `traceScene` is genuinely
unbounded on the load path, scaling linearly in object and speaker count, neither of
which `sanitizeScene` limits — but it is structurally immune to a span-derived cap
(`MAX_RANGE = 60` clips every ray, so its cost does not depend on span at all,
measured flat at 4.0–10.5 ms across spans 10 → 399 at fixed load).

`rooms.ts` `regionOf` and `optimize.ts` were measured and are **fine** (sub-10 ms
at 1 200 walls / 300 rooms; `placeAcrossHouse` ~125 ms projected at
`MAX_IMPORT_ROOMS`). `arrange.ts` `openSlots` is **not**: it materialises a
0.45 m-step slot array over `sceneBounds` and re-concatenates
`[...objects, ...placed]` per candidate, measuring 6.85 s at span 399 with a
6-item queue and ~370 ms per existing object — extrapolating to **30+ minutes**
per `placeOne` at the ceiling. It sits behind the "Decide for me" dialog rather
than the render path, but it is the single worst unbounded path left. Scheduled as
[`ideas.md`](ideas.md) §2c.

**What the cap must never do.** The bound is only legitimate because it is
invisible to real layouts. Bit-identity is structural — `cappedStep` returns its
`baseStep` argument through `Math.max`, which yields the identical float, and
`step` is the only value the cap feeds into either loop — and it is proven against
a golden captured from the pre-cap engine (30/30 byte-identical) plus a
step-identity assertion over an enumerated protected set
(`src/engine/__tests__/fixtures/legit-scenes.ts`). **Re-derive both constants
against that list if you change either.** The first cut of this cap was calibrated
against 6×6-metre rooms and fired on a 16-room chain of the UI's own 25 × 25 m
maximum — span exactly 400 m, import-ACCEPTED, coarsening with only two
speakers — which is precisely the S8 failure mode: a cap that fires on real data
is a data-loss bug, not a fix.

Layouts past 400 m of span *are* coarsened, deliberately: `importRejection`
refuses them, they already cost tens of seconds per edit, and coarsening them is
the usability half of [`ideas.md`](ideas.md) §2. The visible consequence is a
rougher best-spot star, never altered stored data.

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
