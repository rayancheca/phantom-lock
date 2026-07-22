# KICKOFF — Session 8-remainder: SECURITY HARDENING + README (Phantom Lock)

> Paste everything below the line as the next session's opening prompt.
> It is deliberately exhaustive: every technical claim in §3 was **verified by a
> multi-agent research pass with two adversarial skeptics** at the end of Session 7
> (2026-07-22), including real production builds, a live headless-Chrome CSP probe
> driving 38 clicks, and engine payloads executed under Node. Facts marked
> **UNVERIFIED** are explicitly flagged; do not silently upgrade them.

---

ultracode

**KICKOFF — Session 8-remainder / SECURITY HARDENING + README REWRITE (Phantom Lock)**

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in
`CLAUDE.md`, auto-loaded). This is an **ultracode** project: unlimited token/time budget —
optimize for correctness and completeness, never speed.

This task is **HEAVY** by the objective triggers (it changes what the app will execute and
what it accepts as untrusted input, it touches `src/engine/scene.ts`'s sanitizer, and it
rewrites the public front door of a PUBLIC repo). It therefore MUST get: a multi-agent
Workflow (parallel understand → design → an adversarial skeptic that tries to REFUTE each
risky change against the real code), full implementation (no stubs/TODOs/`.skip`/`.only`/
scope-narrowing), failing-first tests for every new pure behavior, a self-review agent pass
over the ACTUAL diff, and a handoff with an Evidence block.

---

## 0. GIT + THE TRAPS (read before touching a file)

**MAIN REPO (source of truth):** `<REPO_ROOT>`
`main` is at **`62d0ab8`**, clean, in sync with `origin/main`.

Create a fresh per-session worktree branch off `main`. Then:

**⚠️ TRAP 1 — the worktree path.** The worktree lives at
`<MAIN_REPO>/.claude/worktrees/<name>/` while a SEPARATE `main` checkout sits at the repo
root. ALWAYS confirm with `git rev-parse --show-toplevel` and `git branch --show-current`
FIRST, and pass worktree-relative paths to Read/Edit/Write — otherwise your edits silently
land in the wrong checkout and the gate lies to you. (Bit UX-1/2/3.)

**⚠️ TRAP 2 — `node_modules` is NOT shared into a new worktree.** Run `npm install` first or
every gate command fails confusingly. (Bit S7.)

**⚠️ TRAP 3 — the shell `cwd` persists between Bash calls.** A `cd` in one call is still in
effect in the next. In S7 this put a `mkdir docs/sessions/S7` inside
`src/components/canvas/`. Prefer absolute paths or re-`cd` every time.

**⚠️ TRAP 4 — `.claude/launch.json` is a TRACKED file.** Do not overwrite it; it carries
`autoPort: true`, which is what stops your dev server from stealing the owner's port. (Bit S7.)

**⚠️ TRAP 5 — verify visual/behavioural claims by observation, not by API readback.** S7
shipped a focus ring that `getComputedStyle` reported as present and that was **invisible**
(an inset `box-shadow` under an opaque canvas bitmap); it was caught only by pixel-diffing
the focused vs blurred edge. Same discipline applies to CSP: a policy that *parses* is not a
policy that *works*.

There are 9 worktrees registered, most of them stale from earlier sessions. Ignore them,
don't reuse them, don't clean them up unless asked.

Commit a baseline, then commit again after the gate passes. Land with:

```
git -C <REPO_ROOT> merge --ff-only <branch>
git -C <REPO_ROOT> push origin main
```

Commit messages end with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
The owner wants visible GitHub contribution activity — **push `main` after the gate lands.**

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`,
`npm run build`) and PASTE the literal tails to confirm the baseline is green before
changing anything.

---

## 1. WHERE THE PROJECT IS

Repo: **github.com/rayancheca/phantom-lock** (PUBLIC), default branch `main` @ `62d0ab8`.

Baseline gate to reproduce exactly:
- `npm run lint` → **0 problems**
- `npm test` → **613 tests, 32 files**, across TWO vitest projects (`|node|` and `|dom|`)
- `npm run build` → clean; **401.76 kB / 129.53 kB gz** JS + **43.19 kB / 8.24 kB gz** CSS
- `npm run dev` → Vite on :5173 (the owner often has one running; `autoPort` moves yours)

**TEST COUNT IS A RATCHET:** 95→126→140→181→239→245→296→322→340→**613**. It must never drop,
and no test may be newly skipped/`.only`'d/weakened. State before/after counts.

**Done so far:** Sessions 1–5 (persistence/IndexedDB · multi-seat + compare · engine
correctness · canvas interaction · App decomposition + ESLint), the entire UI/UX overhaul
(Sessions 13–16 = UX-1…UX-4), and **Session 7 — the accessibility audit** (just landed).

**Read the S7 progress-log entry and the new "Accessibility" section in `CLAUDE.md` before
touching anything.** S7 added: a keyboard-operable `role="application"` canvas with a pure
`selection-cycle.ts`/`placement.ts` traversal; TWO off-screen `aria-live` regions
(`announce.ts` + `useAnnouncer` + `LiveAnnouncer`); an automated contrast test that reads the
real stylesheets off disk; and a second **jsdom** vitest project with axe-core.

**S7 left four architectural a11y items explicitly scheduled, not fixed** (see the S7 log for
the full statement): no parallel DOM control list for the canvas (touch screen readers get
nothing), no keyboard pan/zoom, WCAG 2.1.4 still failing for the *pre-existing* `t`/digit/
`q`/`e`/`r` single-key shortcuts, and four `role="dialog"` overlays that implement no dialog
contract. **They are NOT this session's scope** — do not absorb them silently, and do not
delete them from the plan.

---

## 2. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** Map every site before touching it (list in §4).
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design →
   skeptic). Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an
   independent skeptic that tries to REFUTE it against the real code. This is not ceremony:
   in S7 the skeptics caught a CRITICAL `inert` change that would have bricked three dialogs,
   a live-region design that would have announced nothing, and a contrast row that was
   numerically wrong in 4 of 5 cells. The S8 research pass caught three more (see §3).
   Report each verdict.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to
   <block>". No stubs/TODOs/placeholders/scope-narrowing.
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every
   new pure behavior, never let the count drop below 613. Run `npm run test:coverage` and
   paste the coverage line for every file you touched (≥80%, or state the exact reason).
7. **Double-check.** Spawn self-review agents (`security-reviewer` + `code-reviewer` +
   `silent-failure-hunter`) over the ACTUAL diff. Fix everything real, then re-verify.
   *Note: prefer plain-text returns for reviewer agents; a strict StructuredOutput schema
   killed one in a previous session.*
8. **Data safety** (see §5).
9. **Verification gate — proven, not paraphrased.** Paste the literal terminal tails of
   `npm run lint`, `npm test` (with count), and `npm run build` (with gz size). Any red =
   not done.
10. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test
    count · pasted gate output · saved artifact paths · each Acceptance bullet →
    met/deferred. No Evidence block = the session is incomplete.

State honestly: live checks run ONE browser (Chromium) unless you do otherwise; no real
screen reader has ever been driven on this project.

---

## 3. YOUR TASK — two blocks, both fully in scope

> Everything below marked **[VERIFIED]** was empirically established at the end of S7 by a
> 6-agent research pass with two adversarial skeptics (real builds, a live CSP probe, engine
> payloads run under Node). You may trust these as starting facts, but you are still expected
> to re-confirm anything you build on — and the skeptics were only able to check Chromium.

### BLOCK A — SECURITY HARDENING

The app is a zero-backend static site that accepts untrusted input in two forms: **layout
JSON import** and **floorplan photo import**.

#### A1. Content-Security-Policy + security headers

**[VERIFIED] The production build is unusually CSP-friendly — `script-src 'self'` is enough,
with no nonce and no hash.** `dist/index.html` contains **exactly one** script tag
(`<script type="module" crossorigin src="/assets/index-*.js">`), **zero inline `<script>`**,
and **zero `<style>`**. There is no inline modulepreload polyfill, because the app has zero
dynamic imports, so Vite emits one chunk and no `<link rel="modulepreload">`. `dist/` holds
only `index.html`, one JS, one CSS, and `fonts/`. Both a researcher and a skeptic built and
inspected this independently.

**[VERIFIED] The policy below was tested verbatim as an HTTP header against the real built
app in headless Chrome, driving 38 clicks (Design/Tune, Legend, Suggest placement, Compare,
Add spot, an opened dialog) → 0 CSP violations, 0 console errors, all 7 fonts loaded:**

```
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'none';
worker-src 'none'; child-src 'none'; frame-src 'none';
object-src 'none'; media-src 'none'; manifest-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none'
```

Why each non-obvious one:
- `img-src` needs **both** `data:` and `blob:` — `data:` for the emoji SVG favicon
  (`index.html:5-8`) and the underlay image (`render.ts:114-116`, `detect.ts:316-318`),
  `blob:` for photo import (`underlay-import.ts:8-9`). **[VERIFIED]** a negative control with
  `img-src 'self'` blocked all three, favicon included.
- `font-src 'self'` is genuinely required and is NOT covered by `default-src` for the two
  `<link rel="preload" as="font" crossorigin>` in `index.html:10-11` — **[VERIFIED]** those
  preloads route to `font-src` *independently* of the 7 `@font-face` fetches in
  `styles/fonts.css`.
- `connect-src 'none'` is safe in production — **[VERIFIED]** the single `fetch(` token in
  the bundle is inside Vite's modulepreload polyfill, which is unreachable (zero
  `link[rel=modulepreload]`, zero dynamic imports).
- **`style-src 'self'` needs NO `'unsafe-inline'` and no `style-src-attr` concession.**
  **[VERIFIED]** — this was the biggest open question and the skeptic settled it: React 19
  writes inline styles through **CSSOM** (`style.setProperty`), never
  `setAttribute('style')` (`grep setAttribute("style") node_modules/react-dom/` → **zero
  hits**). Across 41 `[style]` elements — including `SimCanvas` `style={{cursor}}`, the
  compass `transform: rotate(...)`, and `SegmentSwitch`'s CSS custom properties — there were
  zero violations, while a deliberate `setAttribute('style', …)` probe **was blocked** in the
  same document, proving the check was live.
- **DROP `upgrade-insecure-requests`.** **[VERIFIED REAL DEFECT]** — the first draft included
  it as "harmless belt-and-braces"; serving the identical `dist/` over plain http on a LAN
  address with it enabled produced a **total outage**, and — critically — the failure does
  **not** surface as a CSP violation, so a violation-counting harness reports success. It
  buys nothing here (every subresource is a same-origin relative path).

**How to ship it — this is the honest part, do not skip it.**
**[VERIFIED] There is NO deploy target in this repo**: no `netlify.toml`, `vercel.json`,
`public/_headers`, `Dockerfile`, `nginx.conf`, and no `.github/` at all. So:
- Decide and STATE how the policy is delivered. A `<meta http-equiv>` CSP is the only
  self-contained option, and you must say what it cannot do: **`frame-ancestors`, `sandbox`
  and `report-uri` are ignored in meta** (so clickjacking protection specifically cannot be
  delivered by meta — it needs a real header or `X-Frame-Options`).
- **⚠️ Do NOT hand-write a CSP meta tag into the source `index.html`.** **[VERIFIED]** the
  dev server injects an **inline** react-refresh preamble
  (`@vitejs/plugin-react/dist/index.js:331-337`) plus an HMR **WebSocket** (`/@vite/client`),
  so a source-level meta CSP breaks `npm run dev` — and it breaks on `style-src`/`connect-src`,
  not `script-src`, so the symptom is confusing. Inject it at build time only, via a small
  Vite plugin with `apply: 'build'` + `transformIndexHtml` (use `head-prepend` so it precedes
  everything it must govern), or ship a host config file, or both.
- **[VERIFIED] `npm run preview` sends no security headers** (`curl -D-` shows only `Vary`,
  `Content-Type`, `Cache-Control`, `Etag`). Vite's `preview.headers` config **does** work and
  is the right *verification harness* — but if you add it, comment it as a harness, because
  it ships nothing to any host and will otherwise be mistaken for a shipped protection.

Also add and justify: `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` (camera/microphone/geolocation all `()`), and the `frame-ancestors`
equivalent.

**Verification recipe (required):** build → serve `dist/` statically with the headers →
open in a real browser → drive the golden path → **console must be clean** → screenshot.
A CSP verified only in `npm run dev` proves nothing.

#### A2. Import hardening

This is where the real bugs are. **[VERIFIED] findings, in descending order of actual risk:**

**1. A ~760-byte layout permanently bricks the origin. LEAD WITH THIS ONE.**
A four-wall box with a large span makes `bestListeningSpot` quadratic in span at constant
payload size — **[VERIFIED] measured: span 60 → 9 ms, span 200 → 53 ms, span 600 → 311 ms,
span 1200 → 1452 ms, all from ~750-byte payloads.** This variant **commits and persists**, so
it is re-simulated on every boot forever. It is strictly more dangerous than the spectacular
hang below, which does *not* commit (React never commits, so autosave never runs and a tab
kill + reload recovers).

**2. Non-terminating grid loops (main thread, no timeout).**
`bestspot.ts:150`'s `x += step` is a no-op in IEEE-754 once `|x| ≳ 1e17` because the step is
floor-clamped at 0.7. **[VERIFIED] killed at 12 s, never returns**, on three separate
payloads. Same shape at `pairspot.ts:141` (step 0.35) and `arrange.ts:167` (0.45).
**Crucially it does not need an extreme coordinate:** `Math.max(0.05, o.r)` (`scene.ts:430`)
and `Math.max(0.05, o.w)` (`scene.ts:412-413`) have **no upper bound**, so a *single circle
at the origin with `r = 1e308`* is sufficient. A `MAX_WORLD_SPAN` clamp closes both this and
finding 4.

**3. Two sanitizer THROW sites that eat the entire store.**
`speakers:[null]` → `scene.ts:513` TypeError; `rooms:[null]` → `scene.ts:580` TypeError.
**[VERIFIED]** in `loadStore` this silently replaces the whole store with defaults —
*one hostile record ate every other layout*. (`objects:[null]`, `listeners:[null]`,
`pairs:[null]`, primitives, `listener:null`, `underlay:null` are all handled; only
`null`/`undefined` array elements throw.) **[VERIFIED]** the `loadFromIDB` path is NOT
genuinely reachable — everything in IDB has already passed `sanitizeScene` — so trim that
from any reachability claim.

**4. NaN is not accepted, but it is MANUFACTURED downstream, and it reaches the readout.**
`isNum` (`scene.ts:392`) correctly rejects NaN/Infinity on input. But `sceneBounds`'s finite
guard at **`scene.ts:377` checks only `min.x`** — one-sided. **[VERIFIED]** a circle with
`center.x = 1e308, r = 1e308` (both finite, both accepted) yields `max.x = Infinity`; two
speakers at `±1e308` through the real `traceScene`→`computeAudio` pipeline produce
`eqError = NaN`, `quality = NaN`, `sweet = {NaN, NaN}`. `deriveVerdict` then takes every
`quality > CLOSE_QUALITY` branch as false, so **the hero silently reads "No lock yet"** and
the meter renders `width: NaN%` (an invalid declaration the browser drops). No crash, no
error — a plausible-looking wrong answer. Fix the guard to check all four components.

**5. A colliding id silently moves the user's active seat.**
**[VERIFIED]** `activeListenerId` is resolved *after* id regeneration (`scene.ts:492`), so an
imported object whose id collides with the active seat's drops the pointer to `seats[0]`:
the "Bed" seat survives with a fresh id but **YOU silently loads onto the Couch**. Same class
as the S2 seat/verdict desync trap that `CLAUDE.md` warns about.

**6. Unbounded element counts.** **[VERIFIED]** 200 000 speakers, 200 000 objects and
100 000 rooms are all kept. Only listeners are capped (`MAX_LISTENERS` = 32). Ids are
uncapped (200 000-char id kept). The string caps that DO hold: object `label` 40, layout
`name` 48, seat `name` 32, speaker `label` 8, room `name` 32.

**7. Parsed sub-objects are aliased.** **[VERIFIED]** `s.objects[0].center === raw` is `true`,
and an injected foreign key survives into the store, IDB and every export.

**Two things NOT to do — the research refuted both:**
- **Prototype pollution is NOT reachable here.** **[VERIFIED] five payloads**
  (`__proto__` at top level and nested, `constructor.prototype`, `__proto__` as an id and as
  a room name) → `Object.prototype keys added: []`. Structurally impossible: `JSON.parse`
  makes `__proto__` an own data property, every sanitizer output is a fresh literal with
  hard-coded keys, the id dedup uses a `Set`, and `grep Object.assign src` → zero hits.
  A regression lock is fine, but **label it "locking in a property we already have"** — do
  not present it as a fix for a vulnerability that does not exist.
- **A `file.size` gate on photo import is the WRONG control.** **[VERIFIED in real Chrome]**
  a valid 8192×8192 PNG of **192 MB succeeds in 197 ms**; 200 MB of junk named `.png` hits
  `img.onerror` in **4 ms** (the file is never read — `createObjectURL` is a handle, not a
  copy); a 16384×16384 decompression bomb in a **1.17 MB** file decodes fine; a 40000×40000
  bomb hits `onerror` in **7 ms** because Chrome's own pixel cap rejects it. So a size gate
  would block the one harmless case and miss both bombs. If you want a guard it must be a
  **pixel** guard (`naturalWidth * naturalHeight`, checked in `onload` before `drawImage`).
  Also **[VERIFIED]**: a `viewBox`-only SVG reports `naturalWidth = 150`, not 0 (so the
  "scale: Infinity" bug some drafts assume **does not exist**), and there is **no canvas
  taint** — a scripted SVG rasterizes, the script does not run, and `toDataURL` returns
  normally.

**[VERIFIED] XSS and secrets are clean.** No `innerHTML`, `dangerouslySetInnerHTML`,
`outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, or `new Function` anywhere in
`src` outside tests; no network calls; download filenames are regex-slugged in both places;
no secrets. Confirm, then say so plainly rather than inventing work.

**⚠️ Test-placement facts you need before writing a single test [VERIFIED]:**
`vite.config.ts` routes by **FILENAME, not directory**: `node` project = `src/**/*.test.ts`,
`dom` project = `src/**/*.test.tsx`. Consequences:
- Every sanitizer/engine guard above is pure and belongs in a `*.test.ts` (node). The
  termination assertions work as plain vitest timeouts.
- **`buildUnderlay` is NOT unit-testable in this repo at all.** In node there is no `Image`
  and no `document`; in jsdom there is no canvas 2D context (`node_modules/canvas` is not
  installed), so `fileToBitmap` hits its own `reject(new Error('no canvas'))`
  (`underlay-import.ts:18-20`). Either inject the image/canvas factories, add a canvas
  backend, or verify that path in a real browser and say so.
- **Correct a stale line in `CLAUDE.md` while you are here:** "React hook/component tests are
  deferred to S10 (needs jsdom + React Testing Library, which the repo doesn't have)" is now
  **false** — S7 added `jsdom`, `@testing-library/react`, `@testing-library/dom` and
  `fake-indexeddb`. Hook tests are writable today; they just have to be `*.test.tsx`.

### BLOCK B — README REWRITE

**The framing in the old backlog is stale — check it yourself and correct it.** The backlog
says "README.md predates gallery/zones/detection/multi-select". In fact the README was
rewritten to the standard on 2026-07-19 (`6815d0e`) and is 160 lines with all the right
sections. **[VERIFIED]** what is actually wrong is narrower and worse:

1. **The Screenshots section is an explicit placeholder** — a 🚧 "Placeholders — coming soon"
   block with a commented-out `<!-- docs/screenshots/01-boot.png … -->`. **Zero images
   exist; `docs/screenshots/` does not exist.** The repo's own standard
   (`~/.claude/rules/common/readme-standards.md`) mandates **≥6 real screenshots of a live
   end-to-end workflow** and bans placeholder text ("TBD", "coming soon", "TODO") outright.
   This is the single biggest gap.
2. **The described walkthrough documents a UI that no longer exists** — it says "the light
   blueprint view" (both canvas themes have been dark since S13) and lists "Analyze" as a
   step (S14 merged Sound + Analyze into TUNE). So the screenshot plan itself must be redone,
   not just executed.
3. **`npm test` is documented as "140 tests"**; reality is 613 across two projects.
4. **Zero mentions** of DESIGN/TUNE, the VerdictHero readout, the glossary/`<Term>` system,
   or any accessibility affordance.

Requirements:
- Capture **≥6 numbered screenshots** of the real running app with real data, each with a
  caption naming the step and what the user did to get there, together covering the golden
  path from empty state → data → core output. Use the bundled **"Maple Court"** demo,
  **never** the owner's real layout. Note that on a fresh origin the app boots straight into
  **TUNE with a seeded locked pair** (`src/engine/seed.ts`) — plan the sequence around that.
- **Screenshots go in `docs/screenshots/` and MUST be committed.** ⚠️ `docs/sessions/` IS
  gitignored but `docs/screenshots/` is NOT — check `.gitignore` and confirm the images
  actually get added. Reference them with relative paths so they render on GitHub.
- Keep/strengthen the **technical deep-dive** with something genuinely non-obvious. Verified
  candidates: the 2D-plan-vs-3D-path split in the stereo lock test (`src/engine/stereo.ts`);
  image-source reflections having to land on a **solid** span of wall (`src/engine/pairspot.ts`);
  the mode-owns-the-theme IA (`src/components/app/mode.ts`); why the canvas needs
  `role="application"` (S7). For each: the decision, the alternative rejected, and why.
- Fix the stale numbers and add the a11y story.
- No real street address or personal information anywhere.

### SCOPE GUARD

Do **NOT** touch the acoustics math: `src/engine/optimize.ts`, `rooms.ts`, `stereo.ts`,
`raytrace.ts`, `pairspot.ts`, `bestspot.ts` must be **byte-unchanged** — verify with
`git diff --stat`. Changing `sanitizeScene` in `scene.ts` IS in scope (that is the input
boundary); adding a clamp that the engine then benefits from is fine, but do not "fix" the
engine loops by editing the engine. Do not regress the S7 a11y work or the S13–S16 design
system.

---

## 4. READ FIRST (in order)

1. `CLAUDE.md` — protocol, architecture map, design system, the **Accessibility** section,
   and especially **"Hard-won lessons"** (it encodes real bugs, ~9 of them from S7 alone).
2. `docs/master-plan.md` — the Standing Operating Protocol at the top, the **Session 7**
   entry (its Evidence block, its self-review findings, and the four deferred a11y items),
   and the Session 8 block.
3. `docs/ultrareview.md` §3.4 (security findings from the original audit).
4. The code: `index.html` · `vite.config.ts` · `src/engine/scene.ts` (`sanitizeScene`,
   `sanitizeLayout`, `loadStore` — the whole input boundary) · `src/engine/db.ts` ·
   `src/components/app/hooks/useLayoutActions.ts` (the JSON import path) ·
   `src/components/panels/underlay-import.ts` (the photo path) ·
   `src/engine/bestspot.ts:150`, `pairspot.ts:141`, `arrange.ts:167` (the grid loops) ·
   `README.md`.

---

## 5. ⚠️ DATA SAFETY — THE OWNER'S REAL LAYOUT IS ON THIS MACHINE

The preview's IndexedDB on `localhost:5173` holds the owner's real data. **As of
2026-07-22 (verified):** exactly **one** layout, id **`layout-mrwb0lnz-28-u87ub`**, named
**"Maple Court"**, `updatedAt` **1784738154671**, 24 objects, 2 speakers, 1 listener, no
underlays. **VERIFY the live values; do not assume** — the owner designs their real room in
this app and it changes.

- **NEVER delete the owner's layouts.** The "remove the fixture / restore the origin" habit
  applies ONLY to disposable fixtures YOU create.
- **BEFORE any write test**, back up FULL-FIDELITY to `docs/sessions/S8/backup.json`
  (gitignored) by reading the `phantom-lock` IDB `layouts` + `meta` + `underlays` stores.
- **Prefer a fresh headless-Chrome profile for ALL interactive testing.** A fresh
  `--user-data-dir` is a fresh ORIGIN, so the app gets its own IndexedDB and the owner's is
  never touched at all. This is how S7 did every interactive test.
- Afterwards confirm the layout record's `updatedAt` is byte-identical. **Note:** the `meta`
  row's `updatedAt` DOES advance on every boot — that is the normal per-boot rewrite the app
  performs whenever the owner opens it, not a change to their data.
- Never hand-mutate IndexedDB to "reset".
- **This block is doubly important this session:** you will be importing deliberately hostile
  layouts. Import them ONLY on a fresh-profile origin. Several of the payloads in §3 are
  designed to hang or brick the origin they land on.
- Keep any real street address out of committable files:
  `git ls-files -oc --exclude-standard | xargs grep -l "Bay"` must be empty. **The only
  legitimate match is this instruction quoting its own search string in
  `docs/master-plan.md`** — verify that is the only hit before dismissing it.

---

## 6. LIVE VERIFICATION

The in-app preview tab runs `document.hidden`, so rAF (canvas render, drag, hover) is
**paused** there. Drive rAF-gated behaviour in headless Chrome over CDP — zero-dep, since
Node 25 has a built-in `WebSocket` and `fetch`:

- Launch `--headless=old` with `--window-size` **at launch** (NOT
  `Emulation.setDeviceMetricsOverride`, which deadlocks capture) and a fresh
  `--user-data-dir`.
- `Page.captureScreenshot` must be `format: 'jpeg', quality: 90` — a large PNG silently
  overruns Node's built-in WebSocket and the command times out while `Runtime.evaluate` keeps
  working.
- A working client from S7 is at the path recorded in the S7 log; re-create it if gone (it is
  ~120 lines).
- You CAN drive shortcuts by dispatching `window.dispatchEvent(new KeyboardEvent('keydown',…))`
  and read results back from IndexedDB after the ~400 ms autosave — but note S7 hardened the
  key dispatcher precisely because `e.target === window` there, so prefer real
  `Input.dispatchKeyEvent` when testing focus-dependent behaviour.
- **For CSP specifically:** build, serve `dist/` with the headers, load in the browser, drive
  the golden path, and assert **zero** CSP violations in the console — and remember the
  `upgrade-insecure-requests` lesson: some failures do not appear as violations at all.

---

## 7. ACCEPTANCE

- A documented CSP + security headers that a **real browser enforces** with a **clean
  console** and a **fully working app**, proven live in BOTH modes, with the delivery
  mechanism and its limits stated honestly (what a meta CSP cannot do; that `preview.headers`
  is a harness, not a shipped control; that no deploy target exists yet).
- The dev server still works (`npm run dev`) — i.e. the policy is not baked into the source
  `index.html`.
- Importing a hostile, oversized or malformed layout **fails safely** with a visible
  assertive error, never corrupts or replaces the store, and never hangs the main thread.
  Specifically: the ~760-byte quadratic payload, the `r = 1e308` circle, the `x = 1e17` wall,
  `speakers:[null]`, `rooms:[null]`, a colliding active-seat id, and 200 000 objects are all
  handled.
- New pure guards are **failing-first** tested in the correct vitest project.
- README meets `readme-standards.md`: ≥6 real committed screenshots of a live workflow with
  numbered captions, no placeholder text anywhere, correct test count, a real technical
  deep-dive.
- Gate green: **lint 0 · ≥613 tests · build clean**, all three tails pasted.
- The owner's real layout untouched and verified byte-identical.

---

## 8. FINISH

Paste the literal gate tails. Spawn `security-reviewer` + `code-reviewer` +
`silent-failure-hunter` over the ACTUAL diff; fix everything real; re-verify. Save evidence
to `docs/sessions/S8/` (gitignored) and the README screenshots to `docs/screenshots/`
(committed). Update `CLAUDE.md` (commands/ratchet/bundle size, a new **Security** section,
new hard-won lessons, and the stale S10 line noted in §3) and the `docs/master-plan.md`
Session 8 checklist + progress log with a full **Evidence block**. Commit on the session
branch, land on `main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff — **Session 12: the auto-detect walls accuracy overhaul** (root
causes are already diagnosed in `docs/master-plan.md` against `src/engine/detect.ts`: global
Hough on filled walls, no skeletonization, grazing diagonals, furniture blobs kept, no global
regularization) — re-stating this protocol in full.
