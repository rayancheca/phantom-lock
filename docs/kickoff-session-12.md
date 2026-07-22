# KICKOFF — Session 12 / AUTO-DETECT WALLS: ACCURACY OVERHAUL (Phantom Lock)

Run under the **Standing Operating Protocol** at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness and
completeness, never speed.

This task is **HEAVY** by the objective triggers: it rewrites the core of `src/engine/detect.ts` (an engine
file), it changes what the app produces from user-supplied images, and it will touch more than one file. It
therefore MUST get: a multi-agent Workflow (parallel understand → design → an adversarial skeptic that tries to
REFUTE each risky change against the real code), full implementation (no stubs/TODOs/`.skip`/`.only`/
scope-narrowing), failing-test-first for every new pure behaviour, a self-review agent pass over the ACTUAL diff,
and a handoff with an Evidence block.

---

## 0. GIT + THE TRAPS (read before touching a file)

**MAIN REPO (source of truth):** `<REPO_ROOT>` — `main`, clean, in sync with `origin/main`.
Create a fresh per-session worktree branch off `main`. Then:

- ⚠️ **TRAP 1 — the worktree path.** The worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE `main` checkout sits at the repo root. ALWAYS confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST, and pass worktree-relative paths to Read/Edit/Write — otherwise your edits
  silently land in the wrong checkout and the gate lies to you. (Bit UX-1/2/3.)
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** Run `npm install` first or every gate
  command fails confusingly. (Bit S7 and S8.)
- ⚠️ **TRAP 3 — the shell `cwd` persists between Bash calls.** A `cd` in one call is still in effect in the
  next. Prefer absolute paths or re-`cd` every time.
- ⚠️ **TRAP 4 — `.claude/launch.json` is a TRACKED file.** Do not overwrite it; it carries `autoPort: true`,
  which is what stops your dev server from stealing the owner's port on :5173.
- ⚠️ **TRAP 5 — verify claims by observation, not by API readback.** S7 shipped a focus ring that
  `getComputedStyle` reported as present and that was invisible. S8's CSP work only counted as verified because
  every run carried a **negative control** (an injected inline `<script>` that MUST be blocked) — without one,
  "0 violations" is unfalsifiable. For S12 the equivalent is: a detector that returns *some* walls is not a
  detector that returns the *right* walls. Assert geometry, not counts alone.
- ⚠️ **TRAP 6 (new, from S8) — a guard that fires on real data is a bug, not a fix.** Before shipping any
  threshold, prove it against the app's own outputs and the owner's real floorplan, not just synthetic fixtures.

Several stale worktrees are registered from earlier sessions. Ignore them; don't reuse or clean them up.

Commit a baseline, then commit again after the gate passes. Land with:

```
git -C <REPO_ROOT> merge --ff-only <branch>
git -C <REPO_ROOT> push origin main
```

Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
The owner wants visible GitHub contribution activity — push `main` after the gate lands.

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and PASTE
the literal tails to confirm the baseline is green before changing anything.

---

## 1. WHERE THE PROJECT IS

Repo: **github.com/rayancheca/phantom-lock** (PUBLIC), default branch `main`.

Baseline gate to reproduce (as of end of S8):

- `npm run lint` → 0 problems
- `npm test` → **644 tests, 34 files**, two vitest projects (`|node|` 618/31, `|dom|` 26/3)
- `npm run build` → clean; **403.53 kB / 130.11 kB gz** JS + **43.19 kB / 8.24 kB gz** CSS + **1.31 kB** HTML
- `npm run dev` → Vite on :5173 (the owner often has one running; `autoPort` moves yours)

**TEST COUNT IS A RATCHET:** 95→126→140→181→239→245→296→322→340→613→**644**. It must never drop, and no test may
be newly skipped/`.only`'d/weakened. State before/after counts.

Done so far: Sessions 1–5 (persistence/IndexedDB · multi-seat + compare · engine correctness · canvas
interaction · App decomposition + ESLint), the UI/UX overhaul (Sessions 13–16 = UX-1…UX-4), Session 7
(accessibility), and Session 8 (security hardening + README rewrite).

**Read the S8 progress-log entry and the new "Security" section in `CLAUDE.md` before touching anything.** Two
S8 outcomes matter to you:

1. **The input boundary now has a split contract.** `sanitizeScene`/`loadStore` (the LOAD path) clamps nothing
   and truncates nothing — deliberately, because clamping silently flattened legitimate layouts. Untrusted
   files are refused at IMPORT by `importRejection`. **Auto-detect produces walls that go straight into the
   live scene, not through the import path** — so if your detector can emit absurd geometry (it currently can:
   grazing diagonals spanning the plan), think about where that is bounded.
2. **A CSP is now enforced.** It is strict (`default-src 'none'`, `worker-src 'none'`, `connect-src 'none'`).
   If your detection work reaches for a Web Worker to keep the main thread free, you must loosen `worker-src`
   to `'self' blob:` in `src/security-headers.ts` (the intended value is already recorded there as
   `FUTURE_LOOSENING`) — and the drift test will fail until `public/_headers` and `vercel.json` match.

**S8 deferred one item explicitly, and it is NOT this session's scope** — do not absorb it silently and do not
delete it from the plan: worst-case simulation CPU for a layout that sits just under every import limit is
*mitigated, not closed*; genuinely bounding it needs an iteration cap inside `bestspot.ts`/`pairspot.ts`.

---

## 2. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** Map every site before touching it (list in §4).
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). Do not solo
   heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent skeptic
   that tries to REFUTE it against the real code. This is not ceremony: skeptics have caught a change that would
   have bricked three dialogs, a live-region design that announced nothing, a contrast table wrong in 4 of 5
   cells, and — in S8 — a proposed hardening that would have silently destroyed a legitimate 42-room layout, plus
   a DoS estimate that was wrong by two orders of magnitude. Report each verdict.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>". No
   stubs/TODOs/placeholders/scope-narrowing.
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure behaviour,
   never let the count drop below 644. Run `npm run test:coverage` and paste the coverage line for every file you
   touched (≥80%, or state the exact reason).
7. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a domain reviewer)
   over the ACTUAL diff. Fix everything real, then re-verify. Prefer plain-text returns for reviewer agents; a
   strict StructuredOutput schema killed one in an earlier session.
8. **Data safety** (see §5).
9. **Verification gate — proven, not paraphrased.** Paste the literal terminal tails of `npm run lint`,
   `npm test` (with count) and `npm run build` (with gz size). Any red = not done.
10. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count · pasted gate
    output · saved artifact paths · each Acceptance bullet → met/deferred. No Evidence block = incomplete.

State honestly: live checks run ONE browser (Chromium) unless you do otherwise; no real screen reader has ever
been driven on this project.

---

## 3. YOUR TASK

**Auto-detect walls is broken on real floorplans.** Surfaced 2026-07-19 by a first-time-user clickthrough: the
owner drove "Auto-detect walls" on a real uploaded apartment floorplan and it returned a spidery, overlapping,
duplicated tangle — banner read *"Found 20 walls — 69.4 m"* — with double/triple parallel walls, bogus cross-plan
diagonal beams over the dining/sofa area, and corners that overshoot and don't meet. It does **not** track the
actual walls; the user's only move is "Discard." **No threshold tweak fixes this — the failure is structural.**

### Diagnosed root causes (read from `detect.ts` against the live failure)

- **Global Hough on FILLED (thick) walls** (`houghPeaks`) finds many parallel/grazing lines per wall; the greedy
  NMS (`dt<=3`, `MERGE_RHO_PX=7`) is too weak, so redundant peaks survive → double/triple walls.
- **No skeletonization/thinning** before Hough — it should run on a 1-px centerline (or an edge map), not the
  filled stroke; the wall thickness itself manufactures the duplicate detections.
- **`segmentsOnLine` grazing artifacts:** a diagonal Hough line collects every ink pixel within `BAND_PX` and
  projects it onto the line, so a line grazing several thick walls/furniture stitches unrelated ink into one
  bogus diagonal segment (the cross-plan diagonals in the failure).
- **Furniture/appliance blobs survive `dropSmallComponents`** (kept purely by bbox span ≥ 12% of the max dim), so
  the dining table / sofa / fixtures get Hough'd into spurious segments — walls and furniture aren't distinguished.
- **No global regularization:** `snapSegment` snaps each segment's ANGLE but not its POSITION; there is no
  dominant-axis (Manhattan) clustering, no shared-grid position snap, no endpoint/junction snapping, and the
  output never runs through `integrateWall`/`snapToWalls`, so corners overshoot/gap and duplicates stack.

### In scope

- Replace the detection core with a thinning/vectorization approach: morphological skeleton (or
  distance-transform ridge) of the ink mask, then a probabilistic-Hough-style **segment** extractor (endpoints
  included) OR contour/centerline tracing — target **one line per wall**.
- **Segment ink-support test:** reject any candidate whose along-length ink coverage falls below a threshold
  (kills the grazing diagonals).
- **Wall-vs-furniture separation:** keep thin, elongated components (high aspect ratio / low fill fraction), drop
  bulky filled blobs — not by bbox span alone.
- **Global regularization:** cluster angles to dominant axes (Manhattan default; allow true diagonals only when
  strongly supported), snap positions to a shared grid, snap endpoints to shared junctions, then run the result
  through `integrateWall` so corners join and duplicates collapse.
- **Stronger peak NMS / looser collinear merge** tuned to wall thickness.
- Consider raising `WORK_MAX` (640 may be too coarse for a detailed plan) with adaptive downscale.
- **UX:** the "Detected layout" ghost step already exists — add a cleanup control (sensitivity slider and/or
  per-wall reject) and a confidence/quality read so the user can steer instead of discard.

### Out of scope

ML/model-based detection (keep it a zero-dep pure pipeline); anything outside the detect → preview → commit path;
the engine iteration cap deferred by S8.

### Scope guard

Keep the acoustics math byte-unchanged: `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot}.ts` —
verify with `git diff --stat`. `detect.ts` and `joints.ts` are yours. Do not regress the S7 a11y work, the
S13–S16 design system, or the S8 security posture (the drift test will tell you if you break the CSP).

---

## 4. READ FIRST (in order)

1. `CLAUDE.md` — protocol, architecture map, design system, the Accessibility and **Security** sections, and
   especially "Hard-won lessons" (it encodes real bugs; ~9 from S7 and ~7 from S8).
2. `docs/master-plan.md` — the Standing Operating Protocol at the top, the **Session 12** block, and the Session
   7 + Session 8 progress-log entries.
3. `docs/ultrareview.md` — the original audit.
4. `docs/security.md` — the S8 posture, so you don't unknowingly break it.
5. The code: `src/engine/detect.ts` (the whole pipeline) · `src/engine/joints.ts` (`integrateWall`,
   `snapToWalls`) · `src/components/panels/UnderlayCard.tsx` and the detect trigger in `App.tsx`
   (`runDetection`) · `src/components/canvas/CanvasStage.tsx` (the "Detected layout" ghost card) ·
   `src/engine/__tests__/detect.test.ts`.

---

## 5. ⚠️ DATA SAFETY — THE OWNER'S REAL LAYOUT IS ON THIS MACHINE

The preview's IndexedDB on `localhost:5173` holds the owner's real data. As of 2026-07-22 (verified): exactly one
layout, id `layout-mrwb0lnz-28-u87ub`, named "Maple Court", `updatedAt` **1784738154671**, 24 objects, 2 speakers,
1 listener, no underlays. **VERIFY the live values; do not assume** — the owner designs their real room in this
app and it changes.

- **NEVER delete the owner's layouts.** The "remove the fixture / restore the origin" habit applies ONLY to
  disposable fixtures YOU create.
- **BEFORE any write test, back up FULL-FIDELITY** to `docs/sessions/S12/backup.json` (gitignored) by reading the
  `phantom-lock` IDB `layouts` + `meta` + `underlays` stores. **S8 technique worth reusing:** navigate to a
  same-origin STATIC asset (e.g. `http://localhost:5173/fonts/LICENSE.md`) and read IndexedDB from there — the
  app never boots, so not even the `meta` row's `updatedAt` advances.
- **Prefer a fresh headless-Chrome profile for ALL interactive testing.** A fresh `--user-data-dir` is a fresh
  ORIGIN, so the app gets its own IndexedDB and the owner's is never touched.
- Afterwards confirm the layout record's `updatedAt` is byte-identical.
- Never hand-mutate IndexedDB to "reset".
- **Screenshot policy CHANGED in S8 by explicit owner decision** (*"pulbish and change the rules. idc about
  privacy"*): `docs/screenshots/` is committed and published, and README screenshots of the bundled "Maple Court"
  demo are allowed. The street address stays scrubbed to the "Maple Court" placeholder. You will be feeding a
  REAL floorplan photo to the detector this session — that image is still the owner's own file; keep detection
  input images under the gitignored `docs/sessions/S12/` unless the owner says otherwise.

---

## 6. LIVE VERIFICATION

The in-app preview tab runs `document.hidden`, so rAF (canvas render, drag, hover) is paused there. Drive
rAF-gated behaviour in headless Chrome over CDP — zero-dep, since Node 25 has a built-in `WebSocket` and `fetch`.
A working ~230-line client from S8 is at
`…/scratchpad/main/cdp.mjs` (session-scoped; re-create it if gone — see the S8 log for its shape):

- Launch `--headless=old` with `--window-size` at launch (NOT `Emulation.setDeviceMetricsOverride`, which
  deadlocks capture) and a fresh `--user-data-dir`.
- `Page.captureScreenshot` must be `format: 'jpeg', quality: 90` — a large PNG silently overruns Node's built-in
  WebSocket and the command times out while `Runtime.evaluate` keeps working.
- To feed the detector a real image, drive the file input with CDP `DOM.setFileInputFiles` (S8 used exactly this
  to import hostile layout JSON through the real UI).
- Poll DOM conditions with `Runtime.evaluate`; avoid fixed sleeps.
- Note S7 hardened the key dispatcher because `e.target === window` when you dispatch a synthetic
  `KeyboardEvent` at `window`; prefer real `Input.dispatchKeyEvent` for focus-dependent behaviour. And
  `navigator.clipboard` needs a real `Input.dispatchMouseEvent` gesture — `element.click()` is not one.

---

## 7. ACCEPTANCE

- On a **real apartment floorplan** the output tracks the actual walls: no visible duplicate/parallel walls, no
  cross-plan diagonal beams, corners meet. Saved before/after screenshots (both themes).
- A **synthetic fixture** that currently over-detects (thick double-line rectangle + a furniture blob) returns
  the correct wall count and geometry — **failing-test-first** in `detect.test.ts`, asserting geometry, not just
  a count.
- Wall-vs-furniture separation demonstrated on a fixture containing both.
- The detected result is committed through `integrateWall` so corners join and duplicates collapse.
- The user can steer (sensitivity and/or per-wall reject) rather than only discard.
- Detection stays a zero-dependency pure pipeline and does not block the main thread perceptibly on a real
  photo — if you use a Worker, loosen `worker-src` in `src/security-headers.ts` and keep the drift test green.
- Gate green: lint 0 · ≥644 tests · build clean, all three tails pasted.
- The owner's real layout untouched and verified byte-identical.
- The six frozen engine files byte-unchanged.

---

## 8. FINISH

Paste the literal gate tails. Spawn `code-reviewer` + `silent-failure-hunter` (+ a geometry/vision-focused
reviewer) over the ACTUAL diff; fix everything real; re-verify. Save evidence to `docs/sessions/S12/`
(gitignored). Update `CLAUDE.md` (commands/ratchet/bundle size, the architecture map entry for `detect.ts`, new
hard-won lessons) and the `docs/master-plan.md` Session 12 checklist + progress log with a full Evidence block.
Commit on the session branch, land on `main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full. Candidates, in the order the backlog favours:
**the read-only 3D view** (`docs/3d-view-plan.md`; owner approved Three.js — "bundle size does NOT matter, cool
matters"), **Session 10** (component/hook tests — note the old "repo lacks jsdom + RTL" blocker is GONE as of S7;
tests just have to be named `*.test.tsx`), or **the engine iteration cap** deferred by S8.
