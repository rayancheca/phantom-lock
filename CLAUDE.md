# Phantom Lock — project context for Claude

Browser-based 2D acoustic room planner (React 19 + Vite + TS, **zero runtime deps besides React**).
Finds optimal HomePod placement via a real 2.5D ray-tracing engine. The user owns 4 HomePods,
lives in the bundled "Maple Court" apartment, has a rolling TV stand (couch spot ↔ bed spot).

## ⚠️ OPERATING PROTOCOL — the quality bar (CANONICAL · append-only · READ FIRST)

The owner's standing directive: **make this perfect. Never be lazy, never take shortcuts, use as many
agents as the work warrants, spend as many tokens/seconds as it takes.** Token/time budget is NOT a
constraint — optimize for correctness and completeness, never speed. This is an **ultracode** project.

This protocol is **canonical and append-only**: do not weaken, soften, reword-down, or delete any clause
without explicit owner approval quoted in your handoff. Confirm the next kickoff you write re-states it.

**Objective triggers (no self-grading of "non-trivial").** A task is **heavy** — and MUST get a
multi-agent Workflow **and** an adversarial skeptic pass — if it does ANY of: changes a data model or
migration · touches persistence · touches the engine (`src/engine`) · deletes/overwrites data · or edits
more than one file. When unsure, treat it as heavy.

Every session MUST:

1. **Git first.** A git repo exists (as of 2026-07-19). Create a per-session branch, commit a baseline,
   and commit again after the gate passes — so the change is diffable and revertable. A migration that
   cannot be reverted must not be run.
2. **Read first.** `docs/master-plan.md` (your session + roadmap), `docs/ultrareview.md`,
   `docs/database-plan.md`, this file. Map every site you'll touch before touching it.
3. **Orchestrate.** For any heavy task, run a multi-agent Workflow (parallel understanding/design/review →
   synthesize). Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic agent that tries to REFUTE it against the real code. (This caught real data-loss bugs in S1 and
   a seat/verdict desync trap in the S2 plan.) Report each verdict.
5. **Implement fully.** No stubs, TODOs, placeholder returns, `.skip`/`.only`, scope-narrowing, or faked
   completion. A split is legitimate ONLY if the shipped slice fully satisfies a NAMED subset of the
   session's Acceptance criteria and the remainder is rescheduled as its own block with its own Acceptance.
   Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>" — none left unaddressed.
6. **Test everything — and PROVE it.**
   - *Automated:* keep the suite green and ADD tests for every new behavior (failing-test-first for every
     new pure-function behavior). Run `npm run test:coverage`; paste the coverage line for every file you
     touched (≥80%, or state the exact reason). **Test count is a ratchet — it must not decrease**
     (95 at S1 → 126 at S2 → 140 at S3 → 181/182 at S4 → 239 at S5 → 245 at S13 → 296 at S14 → **322** at S15/2026-07-20) and no test may be newly skipped/only'd/
     weakened; state before/after counts.
   - *Migrations:* seed an OLD-shape store/record and assert it upgrades correctly on read — not just
     fresh-fixture writes.
   - *Live:* any change to scene data, persistence, engine output, or UI is "observable" by definition.
     Drive the browser preview, exercise it, read the console, inspect persisted/DOM state, and SAVE
     screenshots to `docs/sessions/S<n>/` (both the dark "sound" and light "plan" themes for canvas/UI
     changes; check the ≤960 px stacked layout for new UI). Reference the files in the handoff. No saved
     artifact = the live check did not happen.
   - *New interactive UI* must be keyboard-operable, show a visible focus state, respect
     `prefers-reduced-motion`, and not regress contrast (`--text-3`) or the design system — at creation.
7. **Double-check your own work.** After implementing, spawn a self-review agent (`code-reviewer` /
   `security-reviewer` / `silent-failure-hunter` / domain reviewer) over the actual diff to hunt bugs, data
   loss, edge cases, and laziness. Fix everything real it finds, then re-verify.
8. **Data safety.** Before any live test that writes persistence, run Export-all and save the bundle to
   `docs/sessions/S<n>/backup.json`. Test on a disposable DUPLICATE layout — never the user's real active
   "Maple Court" layout — and never hand-mutate IndexedDB to "reset".
9. **Verification gate — proven, not paraphrased.** Paste the literal terminal tail of `npm test` (with the
   test count) and `npm run build` (with the emitted size). Any red = not done.
10. **Hand off with an Evidence block.** Update the master-plan checklist + progress log; update this file /
    memory if architecture or preferences changed; write the next kickoff (re-stating this protocol). The
    handoff MUST include an **Evidence block**: agents spawned (role + verdict) · before/after test count ·
    pasted gate output · saved screenshot paths · each Acceptance bullet → met/deferred. No Evidence block =
    the session is incomplete.

State honestly per session: live checks run ONE browser (not cross-browser); ESLint/`npm run lint` doesn't
exist until Session 5; automated a11y/contrast tests land in Session 7 — until then, meet these by hand and
say so.

## Commands

- `npm run dev` — Vite (user usually has this running on :5173 already; autoPort will move yours)
- `npm test` — vitest, **1387 tests** across TWO projects, all green as of 2026-07-29. `|node|` (pure logic) + `|dom|` (jsdom + axe, **10** files) — see `vite.config.ts` `test.projects`. Ratchet: never let the count drop (95→126→140→181→239→245→296→322→340→613→644→649→655→659→666→711→760→814→961→1084→1316→1354→1356→1365→**1387**). **S26 added +22** — the detection corpus gained TWO fixtures (`oblique-survey`, the lowest structure margin in the corpus; and `no-plan-shelf`, the null that beat the first cut of S26's own fix). `detect.test.ts` gained the monotonic-knob guarantee plus FOUR negative controls that each catch a different wrong version of it (the knob must still BITE — disabling 'Careful' passed the suite otherwise; a scatter must not be rescued; the second reading must be scored at ITS OWN corner radius, which is a no-op on every other fixture; and no null may slip through) and a three-test `resolution` block for the app's downscale chain, which NO fixture had ever exercised. `quality.test.ts` gained five for `referenceStructure` (two WRONG contracts passed without them), and `useWallDetection.test.tsx` gained eight for the cause-aware refusal hint. **S25 added +9** (`rooms.test.ts`, the wall-line leak), **S24 added +2**, **S23 added +38** (`canvas/__tests__/wall-seat.test.ts`), **S22 added +232.** Wall detection (+159): `engine/__tests__/detect.test.ts` **43** — the corpus regression (a per-fixture score FLOOR plus a mean floor, scored through the same instrument that measured the pre-S22 engine at 52.1 %), the refusal suite including *"does NOT refuse any legitimate plan in the corpus"*, and three NEGATIVE CONTROLS that must lower the score (duplicate every wall · add one cross-plan diagonal · outline the furniture) · `detect-score.test.ts` **20** — tests for the MEASURING INSTRUMENT itself, because every number in the S22 handoff rests on it: a perfect detection scores 1, an empty one 0, "every wall twice" ~0.5, a bbox-only answer visibly short, and the rasteriser is asserted deterministic AND seed-sensitive · `vision/__tests__/mask.test.ts` **21** (incl. the EXACT distance transform against a brute-force search, and *"separates a blob that TOUCHES a wall — which no component filter can"*) · `thin.test.ts` **12** (connectivity preserved on a thick ring, T- and X-junctions, a genuine fixed point) · `trace.test.ts` **21** (incl. *"THE TRAP: does not call a room OUTLINE annotation"* and the chamfered-corner control) · `regularize.test.ts` **31** (incl. *"THE ONE THAT MATTERS: leaves a genuinely angled wall alone"*) · `quality.test.ts` **11** (the pinned refusal thresholds). The generator (+58): `engine/generate/__tests__/generate.test.ts` **37** — incl. *"THE PAYOFF: never ships a placed-but-UNLOCKED pair"* (re-derived from the real `traceScene`→`computeAudio`, not from the flag), the VARIANT-D door proof measured end to end through `regionOf`, the listener-mirror check on every archetype, and the ZONE_AFFINITY name guard · `hooks/__tests__/useGenerateDesign.test.tsx` **11** (the ONLY store writer: preview writes nothing, keep adds exactly one, undo restores) · `gallery/__tests__/generate-dialog.a11y.test.tsx` **10** (PAGE-WIDE axe).
- `npm run lint` — **(S5)** flat ESLint (`eslint.config.js`): @eslint/js + typescript-eslint + eslint-plugin-react-hooks `recommended-latest`, scoped to `src`, ignoring `.claude`/`dist`/`coverage`. Clean (0 problems) as of 2026-07-19. exhaustive-deps is enforced; 5 documented survivor suppressions remain (SimCanvas:250/398 mount-once, Toast/Menu/LayoutGallery/ScenarioCompare mount-once) — see each file.
- `npm run build` — tsc --noEmit + vite build (**479.80 kB / 156.27 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S26; JS +0.74 kB / +0.32 kB gz and CSS UNCHANGED vs S25's 479.06/155.95 for the lazy second reading in `detectWalls`, the `RefusalCause` field, and `nextLevelHint` — everything under `engine/__tests__/fixtures/` (including the new `oblique-survey` fixture and the `scalePlan`/`downscale` helpers) is TEST-ONLY and tree-shakes out. Prior baseline: **479.06 kB / 155.95 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S23; JS +2.25 kB / +0.86 kB gz and CSS UNCHANGED vs S22's 476.00/154.75 for the `wallSeatFor`/`moveObjectTo`/`openingMagnetFor` additions to `canvas/placement.ts` and the `move-rc` rewiring in `SimCanvas.tsx`. Prior baseline: **476.00 kB / 154.75 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S22; JS +26.69 kB / +9.54 kB gz and CSS +2.21 kB / +0.39 kB gz vs S21's 449.31/145.21 + 49.34/9.17 for the whole `engine/vision/` directory (types/mask/thin/trace/regularize/quality), the rewritten `engine/detect.ts`, the whole `engine/generate/` directory (rng/archetypes/tile/shell/names/pair/index), `hooks/useWallDetection.ts` + `hooks/useGenerateDesign.ts`, `canvas/DetectionProposalCard.tsx` + `gallery/GenerateDialog.tsx` and their CSS. Everything under `engine/__tests__/fixtures/` (the floorplan rasteriser, the corpus and the accuracy score) is TEST-ONLY and tree-shakes out. Prior baseline: **449.31 kB / 145.21 kB gzip** JS + **49.34 kB / 9.17 kB gz** CSS + **1.31 kB** HTML after S21; JS +20.80 kB / +6.85 kB gz and CSS +4.11 kB / +0.58 kB gz vs S20's 427.43/138.02 + 44.84/8.52 for the whole `components/tutorial/` directory (types/machine/progress/steps/actions/spotlight + the three components + `tutorial.css`), `hooks/useTutorial.ts`, and the header/welcome wiring. Prior baseline: **427.43 kB / 138.02 kB gzip** JS + **44.84 kB / 8.52 kB gz** CSS + **1.31 kB** HTML after S20; JS +13.58 kB / +4.48 kB gz vs S19's 413.85/133.54 for `engine/projects.ts` + `engine/ids.ts` + the widened `seed.ts` + the N-up `ScenarioCompare` + `compare-summary.ts`/`compute-scenario.ts`/`column-gate.ts` + `hooks/useProjectActions.ts` + the folder-grouped gallery. `npm run test:coverage` is now scoped to `src/**` so gitignored session scratch cannot skew the figure the protocol asks to be pasted. Prior baseline: **413.85 kB / 133.54 kB gzip** JS + **43.18 kB / 8.24 kB gz** CSS + **1.31 kB** HTML after S19; JS +2.13 kB / +0.83 kB gz vs S18's 411.72/132.71 for the new `engine/reflection.ts`, the three `t`-only helpers in `geometry.ts`, and the two caller-level skips. Prior baseline: **411.72 kB / 132.71 kB gzip** after S18; +1.0 kB / +0.36 kB gz vs S17's 410.66/132.32 for `engine/grid.ts` + the two call sites. Prior baseline for context: **410.66 kB / 132.32 kB gzip** after S17; JS +~2.5 kB gz vs S8's 130.1 for the new `canvas/door-swing.ts` module + the door inspector branch + the opening tool. Pre-S8 baseline for context: **403.5 kB / 130.1 kB gz**; JS +0.6 kB gz for `importRejection`/`cleanVec`/`clampSpan`, HTML 0.87→1.31 kB for the injected CSP meta. `src/security-headers.ts` is BUILD/TEST-ONLY — imported by `vite.config.ts`, never by a client module, so it does not reach the bundle (verified by grep against `dist/assets/*.js`). Pre-S8 was ~402 kB / 129.5 kB gz; JS +2.4 kB gz / CSS +0.19 kB gz vs S16 for `selection-cycle.ts`/`placement.ts`/`canvas-help.ts`/`announce.ts`/`useAnnouncer.ts`/`LiveAnnouncer.tsx` + the a11y CSS). `src/styles/contrast.ts` and everything under `src/test/` are TEST-ONLY and tree-shake out of the bundle. Self-hosted fonts are static assets in `public/fonts/` (7 Latin-subset woff2 + `LICENSE.md`, ~148 kB total, 2 preloaded ≈36 kB — NOT in the JS/CSS bundle). Run all four (lint/test/build) before claiming done.

**GitHub (as of 2026-07-19):** the repo is public at **github.com/rayancheca/phantom-lock** (`origin`, default
branch `main`). The owner wants visible contribution activity, so **push `main` after every session lands the
gate** (land per-session branch work onto `main`, then `git push`). The bundled demo apartment's real address
was scrubbed to the placeholder **"Maple Court"** across all history — keep it that way; `docs/sessions/` and
`coverage/` are gitignored (local-only). **Screenshot policy CHANGED in S8 by explicit owner decision** — the
owner, asked directly whether README screenshots of the bundled "Maple Court" demo (which is modelled on their
real home) could be published to the public repo, answered: *"pulbish and change the rules. idc about privacy"*.
So the former "never publish the real-floorplan screenshots" clause is **retired**: `docs/screenshots/` is
committed and published, and README screenshots of the bundled demo are allowed. The **street address** stays
scrubbed to the "Maple Court" placeholder (unchanged, and no reason to undo it), and secrets/credentials scanning
is unchanged. Do not re-tighten this without the owner saying so.

## Architecture map

**Engine (`src/engine/`, pure TS, fully unit-tested):**
- `raytrace.ts` — ray casting, `directPath` (3D LOS with graze attenuation), `collectSurfaces`, `wallKeptSpans` (door gaps). **(S19)** `directOcclusion` reads only `hit.t`, so it now calls `geometry.ts`'s `surfaceT` — the same `t` without building `point`/`normal` (and without the `Math.hypot` inside `v.norm`). That change alone took the span-399 object-bomb payload 4.9 s → 0.12 s. It deliberately has **no** height prefilter: dropping surfaces below both endpoints rests on `zAt >= min(zFrom,zTo)`, exact in real arithmetic but only to an ulp in floating point, and a wrongly-skipped surface would silently drop a factor out of an `attenuation` product that is on screen in the Echogram.
- `geometry.ts` — ray/segment/circle primitives. **(S19)** adds `raySegmentT`/`rayCircleT`/`surfaceT`: `raySegment`/`rayCircle`'s `t` with the `point`/`normal` construction dropped, `-1` as the miss sentinel (every accepted `t` is `>= EPS`, so it is unambiguous) and NaN still flowing through as a hit. Identity vs the full forms is asserted over 80 000 randomized queries plus a deterministic case inside the 1e-9 `u` tolerance band.
- `stereo.ts` — `computeAudio`/`computePair`: pair metrics (ITD/ILD/angle/lock), `apexBlocked`, relocated `sweet` spot. **(S3)** the equilateral test (`eqError`/`isEquilateral`) is now pure **2D plan** distances — consistent with the 2D apex/angle/base — while `dA`/`dB` stay 3D for ITD/level; `locked` also requires 3D arrival symmetry (`pathDiff ≤ ITD_LOCK_TOLERANCE_M` = 0.07 m ≈ 0.2 ms) so an elevated-but-plan-symmetric pair locks yet a mismatched-height pair never false-locks.
- `pairspot.ts` — `bestPairSpot` (per-pair wall-aware seat search — runs once per apex-BLOCKED pair, so up to 32× per `computeAudio`; its fixed `GRID_STEP` 0.35 gives 4× the cells `bestspot` walks over the same bounds), `bestReflectionDb` (image-source first-order bounces, **both legs occlusion-checked**). **(S18)** its sweep step is `cappedStep(bounds, GRID_STEP, objects + 2·surfaces)`. **(S19)** `bestReflectionDb`'s body MOVED to `reflection.ts`; what remains here is a thin wrapper that builds a prepared context per call — right for a one-off query, WRONG inside a sweep (`bestPairSpot` calls `prepareReflections` once and `reflectionDb` per cell). Also S19: `reachDb`'s two calls now short-circuit the **computation**, not just the predicate — `||` stopped evaluating the test but `rb` had already been computed. **(S3)** a bounce is now only credited when its point `u` lands on a **solid (kept) span** of the wall — surfaces filtered by `objectId === w.id` — so reflections no longer pass through door/window openings; plus an explicit zero-length-wall guard.
- `bestspot.ts` — `bestListeningSpot` field (green ★ + glow): occlusion + reflections for ALL speakers, capability-weighted (mini 0.65), TV-mode gates score on `tvViewQuality`. **(S18)** its sweep step is `cappedStep(bounds, baseStep, objects + speakers·surfaces)`. **(S19)** two changes: `tvViewQuality`'s per-cell `surfaces.filter` is hoisted to once per sweep, and — when every speaker is paired — a cell whose pure GEOMETRY (`pairQualityAt`) is zero for every pair is skipped **before any occlusion work**, which is the entire cost of the cell. The proof and its one NaN caveat are in the code; `solos.length === 0` is load-bearing and policed by a negative control (dropping it breaks 8 of 162 golden entries). Deliberately `=== 0`, never a threshold: skipping `q < 0.05` also passes the whole corpus and is still wrong.
- **`reflection.ts` (S19, pure leaf — imports `types`/`geometry`/`speakers`/`vec` only):** the first-order wall-bounce search, prepared once per sweep instead of re-derived per grid cell. `prepareReflections(surfaces, walls, objects)` hoists per-wall constants (edge vector, `v.norm`'d direction, length, `20·log10(keep)`, and the open-door spans as a raw `[lo,hi]` interval list — turning an O(objects) scan inside the innermost loop into a couple of comparisons) and lazily caches per-(speaker, wall) mirror images; `reflectionDb(ctx, sp, p, earZ)` returns the identical double `bestReflectionDb` did. `isBlocked` replaces `surfaces.filter(...)` + two `directPath` calls with an allocation-free scan that skips the excluded object in place — legal because `bestReflectionDb` reads only `.blocked`, a pure existential over surfaces, so any visit order and any witness give the same boolean. **`directOcclusion` is left byte-unchanged**, which keeps the four `.attenuation` readers (`reachDb`, `bestListeningSpot`'s LOS test, `optimize.ts`'s score, and the on-screen Echogram via `traceScene`) out of the blast radius BY CONSTRUCTION. Bounding boxes and the per-leg last-blocker slot are a **search ORDER, not a filter** — a negative is settled by an unfiltered rescan, so neither needs a conservatism proof, which matters because `raySegment`'s near-parallel band can report a hit outside the box it was derived from and `addRoomShell` builds exactly that flush-collinear geometry. Measured: 7.7 µs → 1.0 µs per call.
- **`grid.ts` (S18, pure leaf — imports `types` ONLY, takes `bounds` as a parameter so there is no `scene→grid→scene` cycle):** bounds the two grid sweeps. `axisCells`/`gridCells` are UPPER bounds on what `for (t = min + step/2; t <= max; t += step)` really iterates (`floor(span/step) + 2`; the exact `floor(span/step − 0.5) + 1` is NOT a bound — float drift makes the real walk exceed it, measured 9 123 times in 560 000 samples). `cellBudget(perCellCost) = min(MAX_GRID_CELLS 160 000, MAX_GRID_WORK 1.5e8 / perCellCost)` — TWO ceilings because they catch different shapes and neither alone suffices (a 400 m square with 20 walls has 1.24 M cells but a work product *below* several legit scenes; a 5 000-object scene costs 47.8 ms per cell so even 100 cells is 5 s). `cappedStep` solves `(spanX/s + 2)(spanY/s + 2) ≤ budget` in closed form via the quadratic root, and **returns `baseStep` through `Math.max` — the identical float — whenever nothing binds, so bit-identity is STRUCTURAL, not a tested coincidence.** `minAdvancingStep` floors every step at `2·|coord|·ε` (closes a pre-existing non-termination class — see the lessons). Both constants are calibrated against the ENUMERATED protected set in `__tests__/fixtures/legit-scenes.ts`; re-derive them against that list if you touch either.
- `optimize.ts` — `suggestPlacement` with `target: listener | room | house`; TV-behind-wall falls back to music with a note. **(S3)** whole-house `placeAcrossHouse` keeps a **per-room** `Map<roomId, Vec2[]>` and adds a dominant separation reward (`sepR·SEP_WEIGHT`, `MIN_HOUSE_SEP` = 1.0 m) so two pods sharing a room never stack on the same point — yet the most-separated valid spot always wins, so a pod is never silently dropped.
- `rooms.ts` — `regionOf` flood-fill regions (`doorsBlock` option: true for sound zones, false for walkable floor). **(S25) `segsCross` is the TEXTBOOK intersection, not the proper-only one** — it required a strict `d1*d2 < 0 && d3*d4 < 0`, which is right only when all four determinants are non-zero, and the app manufactures zeros: the grid origin is `sceneBounds().min − cell` and `sceneBounds` reads door rect CORNERS, so an ordinary door's `h = 0.1` lands a whole cell-centre ROW on a wall metres away and the fill walked straight through. Measured 19 → **0** fully-unsealed designs over a 300-design corpus. THREE degenerate shapes, all covered by the four `=== 0` branches; the `d1`/`d2` pair is NOT optional (a partial fix left 4 of 300 unsealed — see `THE SEAM` fixture). Over-blocking was measured, not argued: a 0.9 m doorway still connects at 3.0, 2.4, 1.6 and 1.0 cells as the cell grows. **(S3)** the grid cell is now **adaptive** (`max(0.3, span/158)`) instead of a hard 160-cell clamp, so scenes wider than ~48 m no longer silently truncate; bit-identical for spans ≤ 47.4 m.
- `arrange.ts` — furniture placement brain (door corridors, daylight, feng shui, first-reflection absorbers, `ZONE_AFFINITY`, walkable containment) + `suggestInventory` ("Decide for me")
- **`detect.ts` + `vision/` (REWRITTEN in S22):** floorplan image → walls. Measured against the enumerated corpus in `__tests__/fixtures/floorplan-corpus.ts`, the old Hough pipeline scored **52.1 %** and emitted **61 walls** on an image containing no floorplan; the replacement scores **95.6 %** and refuses. The failure was structural: Hough voted over FILLED strokes (so thickness manufactured duplicates, and `MERGE_RHO_PX` served as both the NMS window and the collinear-merge window, making that merge path *unreachable*), `segmentsOnLine` gathered ink within a band of an INFINITE line (so one diagonal stitched a sofa, a wall and a door arc into a cross-plan beam), furniture was rejected by BOUNDING-BOX SPAN, and nothing checked the answer. The new pipeline asks a local, connected question: `inkMaskOf` → `removeThickRegions` (drop anything locally FATTER than a wall — the only discriminator that works when furniture TOUCHES a wall, which a component filter cannot) → `closeMask` (fill a cavity wall so it thins to ONE centreline) → `removeSmallComponents` → `thin` (Zhang-Suen) → `skeletonToSegments` (follow each branch: a cross-plan beam is unconstructible because nothing connects its ends) → `regularize` (dominant axis → snap → collinear merge → corner join) → `filterBySupport` → `assessDetection`. **`detectWallsFromUnderlay` now returns `{walls, quality}`** and returns ZERO walls on a refusal, so a caller that ignores `quality` still cannot commit a tangle. `WORK_MAX` raised 640 → 900 (the old cost was a 180-angle accumulator swept 48 times; thinning's iteration count is half the stroke width and does not grow with resolution). Deliberately NOT routed through `integrateWall`: measured, feeding N detected walls through it sequentially yields exactly **N²/2** objects (40 → 800), and `joinCorners` already makes corners meet. **(S26) two structural facts about this pipeline that were not written down before.** (1) `detectWalls` is PURE and takes whatever bytes you hand it — the app's own chain puts **two** unconditional lossy stages in front of it (`buildUnderlay` caps at 1600 and re-encodes JPEG q0.72; `detectWallsFromUnderlay` then caps at `WORK_MAX` 900), so any measurement that calls `detectWalls` on a source file is measuring a path no user can reach. That mistake produced a P0 in S25 and repeated inside S26. `WORK_MAX` is now EXPORTED and a test asserts it stays under `WALL_HALF_WIDTH_MAX / WALL_HALF_WIDTH_FRAC` = 1333, the point past which the poché clamp starts deleting real walls (measured: `heavy-poche` at 2.5× loses 97.5 % of its ink and is refused — latent only because the wrapper shrinks first). (2) `detectWalls` now takes a LAZY second reading at the default sensitivity, and refuses for structure only if BOTH readings fall short: `sensitivity` scales `minSegment` and `structure` is measured on the segments that survive it, so turning the knob DOWN mechanically lowered structure and reported the user's own pickiness back as evidence about their image. Stages 1–5 do not depend on `sensitivity`, so the second reading re-runs only 6–8, and only when the first would have been refused. The stated, tested invariant: **the knob may change WHICH walls are offered; it can never, by itself, turn an accepted image into "this doesn't look like a floorplan".**
  - `vision/mask.ts` — Otsu + an EXACT Felzenszwalb distance transform, on which `dilate`/`erode`/`closeMask`/`removeThickRegions` are all thresholds, so each is O(pixels) regardless of radius. The blob rim is swallowed at `maxHalfWidth · √2 + 1` (a right-angle corner is the farthest boundary point from the eroded core; the smaller figure leaves exactly four corner pixels behind).
  - `vision/thin.ts` — Zhang-Suen, plus **`crossingNumber`**, which `classify` uses instead of a raw neighbour count. Not academic: thinning leaves staircases, a staircase pixel has three neighbours in the middle of an unbranched line, tracing stops at junctions — so the neighbour-count version shattered every non-axis-aligned wall and a plan photographed 8/20/22/24/26° off-square returned **zero walls**.
  - `vision/trace.ts` — skeleton → graph → polylines → RDP → segments, plus `looksLikeAnnotation` (door arcs and dimension text). The arc rule compares an **implied radius** against the plan's scale, because thinning chamfers a right-angle corner into two 45° bends and a turn-only rule dropped a whole room outline.
  - `vision/regularize.ts` — `dominantAngle` (length-weighted, folded mod 90°, so a photo shot off-square is straightened to the BUILDING) → `snapToAxes` (which deliberately leaves a genuine 30° wall alone) → `mergeCollinear` (one span per uninterrupted run: duplicates collapse, fragments rejoin, DOORWAYS survive) → `joinCorners` (L-corners to the exact line intersection, T-junctions projected without moving the through-wall) → `inkSupport`.
  - `vision/quality.ts` — the refusal. Three independently-failing signals (support / structure / explained). `MIN_STRUCTURE` is **0.25**, lowered from 0.40 after that fired on a 22°-rotated photo (0.364) and on heavy-poché-with-thin-partitions (0.313) — each an 83–96 % correct read thrown away. **(S26)** the S25 note here — "it is still too high, the owner's plan scores 0.231 and is REFUSED" — was **WRONG and is retired**: that number came from the original 1320×1734 file, and the app puts two lossy stages in front of `detectWalls` (`buildUnderlay` 1600 + JPEG q0.72, then `WORK_MAX` 900). Through the real chain the owner's plan measures **0.278 / 0.500 / 0.646** at Careful / Balanced / Thorough and is accepted at all three — confirmed by driving the real UI. `MIN_STRUCTURE` is NOT known to be too high; do not lower it. Two things did change: `QualityOptions.referenceStructure?` lets `detect.ts` pool a second reading into the structure gate (the monotonic-knob guarantee — see below), and it is now recorded that **`support` and `explained` cannot separate anything** — `no-plan-lines` scores 1.000 on BOTH at every sensitivity, higher than the lowest legit `explained` (0.867), because both are measured against the mask the pipeline itself produced. `structure` is the only signal with separating power. See `docs/ideas.md` §13.
- `joints.ts` — wall snapping (`snapToWalls`) + `integrateWall` (crossings split BOTH walls into chunks)
- `scene.ts` — presets, sanitize, `addRoomShell`, `loadStore` (legacy localStorage `phantom-lock:v2` reader — now only used as the migration source + IDB-unavailable fallback). **Multi-listener (Session 2):** the source of truth is `scene.listeners: NamedListener[]` (`{id,name,pos,z}`) + `scene.activeListenerId`; `scene.listener` is a **mirror** always kept equal to the active seat so every engine/UI read-site is unchanged. Write ONLY through the helpers — `updateActiveListener` / `setActiveListener` / `addListener` (no-op at `MAX_LISTENERS`=32) / `renameListener` / `removeListener` — each runs `syncActiveListener` (which clones the mirror `Vec2`, never aliases). `sanitizeScene` migrates v2 single `{pos,z}`, v1 `{x,y}`, and the new `listeners[]` shape, truncating to the cap **without dropping the active seat**. Constructors + `addRoomShell` seed the fields (`addRoomShell` recenters ALL seats on a first room). `sceneListeners`/`activeListener` are defensive readers for hand-built scenes.
- `db.ts` — **IndexedDB persistence (Session 1)**: stores `layouts`/`underlays` (image Blobs)/`meta`; `bootstrapPersistence()` migrates the legacy localStorage blob on first run (keeps the old key as rollback), `saveLayout(layout, writeImage)` does per-record async writes, `loadFromIDB()` re-runs `sanitizeLayout`; hardened localStorage fallback when IDB is unavailable. In memory `Scene.underlay.src` stays a data URL so render/UI/export are unchanged. **(S20) folders ride the EXISTING stores — `DB_VERSION` stays 1 and `onupgradeneeded` is byte-unchanged:** `LayoutRecord.projectId?` (optional on disk, which is the truth for every pre-S20 row) and `MetaRecord.projects?`. A fourth object store would need a version bump, and `openDB` REJECTS on `onblocked` (an old tab holding v1) → `bootstrapPersistence`'s catch → localStorage mode → autosave overwrites the FROZEN pre-migration snapshot. Adding a field to an existing record needs no schema change at all (IDB stores structured clones). **`saveMeta(activeId, projects)` takes projects as a REQUIRED parameter** — it rebuilds the whole meta row and runs unconditionally every autosave cycle, so a 1-arg version was a 400 ms fuse on total folder loss. `saveLayout`'s record literal and `loadFromIDB`'s `raw` literal are built field-by-field and are therefore SILENT-DROP sites: any future per-layout field must be added to both. `loadFromIDB`'s call to `assembleStore` is WRAPPED — an assembly throw must never reach `bootstrapPersistence`'s catch, which puts a stale frozen snapshot on screen and then overwrites it. `buildExportBundle` is **version 2**: each layout carries its project's NAME (ids are meaningless in another store).
- **`projects.ts` (S20, pure LEAF — imports `types` + `ids` only):** folders. The model is FLAT — `Layout.projectId` → `Project.id`, `LayoutStore.projects` is the list — because the pointer has ONE direction and cannot dangle, and because deleting a folder can then be a pure regrouping. `assembleStore(rawProjects, layouts, rawActiveId, onProjectLoss?)` is the SINGLE seam establishing every store invariant: ≥1 project · every `projectId` resolves (an orphan is RE-HOMED, never dropped and never rendered into no group) · **project ids claim the shared id namespace BEFORE layout ids** (re-issuing a project id dangles N pointers at once; a layout id dangles at most `activeId`, which the next line re-derives) · layout ids dedup store-wide (pre-existing bug: two layouts sharing an id made `updateLayout` write both and `persistNow` `put` both to one IDB key) · nothing throws on hostile input. It takes ALREADY-SANITIZED `Layout[]`, which is what keeps it a leaf and avoids a `scene → projects → scene` cycle. `orphanHome` is the OLDEST project by `createdAt` (tie-broken by id), NOT `projects[0]`: the repair is recomputed on every load and never persisted, so an unstable target would move an orphan between folders across reloads. `removeProject` NEVER deletes a layout. `moveLayoutToProject` is the ONLY writer of `projectId` and bumps `updatedAt` (the entire autosave change detector). `activeProject` is DERIVED from the active layout — there is deliberately no `activeProjectId` state (the S14 "one controller" lesson one level up).
- **`generate/` (S22, a LEAF CONSUMER at the top of the graph — the position `seed.ts` occupies):** "Generate a design". Eight hand-authored ARCHETYPES × randomised envelopes, guillotine room tiling, doors, windows, furniture and a verified stereo pair, deterministic per 32-bit seed. Measured over 192 designs (24 seeds x 8 archetypes) **after the S24 unit fix**: **91.1 % open on a LOCKED pair** (pre-fix 88 %, measured on a different corpus — the direction of this number is corpus-dependent, so do not read it as a benefit of the fix), 477/480 distinct shells, 3.9 ms mean / 18.5 ms worst, zero import rejections, zero mirror desyncs, zero fields lost to a round-trip. It imports `scene`/`arrange`/`raytrace`/`stereo`; **nothing in `src/engine/` may import it back** (that makes `scene → generate → arrange → scene` AND `scene → generate → stereo → pairspot → scene` at once). Determinism covers GEOMETRY, never ids — `Layout.id` must stay `createId` because `assembleStore` dedups layout ids store-wide. `tile.ts` is guillotine subdivision, so "tiles without overlaps or gaps" is structural rather than tested. **(S24) `edgeAngleRad` returns RADIANS** — it returned degrees into `RectObj.rotation` until S24, so 50.7 % of every generated opening was drawn at the wrong angle (0° walls were accidentally right; 90° out by 26.62°, 180° by 53.24°). `wallKeptSpans` is rotation-BLIND, so the acoustic opening was never affected — what moved was the drawn symbol, the ZONING flood-fill (`collectBlockers` reads `rectCorners`), the furniture arranger's door corridors, and a window's own surfaces. **`shell.ts` emits interior partitions as TWO stubs with a real gap and the door rect inside it** — `rooms.ts` `collectBlockers` pushes the whole wall segment and never consults `wallKeptSpans`, so a door in a SOLID wall opens an acoustic path but no walkable one and every piece of furniture stays trapped in the seat's room (measured post-S24 on `two-bed`/seed 21: walkable 91.26 m² vs zoning 38.88 m² with the gap; equal without it — the previously documented 59.3 m² was computed from the BUGGY door rotation). `collectEdges` reduces each axis line to **atomic intervals** rather than matching whole cell edges, because a guillotine tiling is NOT conforming — a 7 m boundary faces two 3.5 m edges, none of the three match, and the wall is drawn three times with no door in any of them. `pair.ts` is a verified LADDER (ten radii × the TV direction then a 16-way sweep) accepting only what the real `traceScene`→`computeAudio` already reports as locked, so a design ships locked or with NO speakers — never placed-but-unlocked, which the hero's edge-triggered ignition cannot celebrate. Furniture is placed BEFORE speakers (`arrange.ts` `fits()` iterates objects and its own placed list, and speakers are neither), at the documented cost that the first-reflection-absorber layer never fires.
- **`ids.ts` (S20, pure leaf):** `createId`, moved verbatim out of `scene.ts` so `projects.ts` can mint ids without the cycle. `scene.ts` re-exports it, so every existing importer is unchanged.
- **`seed.ts` (S16, widened S20):** first-run demo. Now seeds a populated WORKSPACE — 2 folders × 6 designs, deliberately different in OUTCOME (couch pair locks · bed variant with the TV rolled over locks from its own Bed seat · four-pod variant · a bare audio-free shell · two sketches). Coordinates solved in `docs/sessions/S20/bench/seed-solver.mts` and re-asserted end-to-end in `seed.test.ts`. Still gated on `isPristineOrigin` + `bootstrapPersistence.firstRun`, and still NEVER reached from the degraded catch branch.
- `types.ts` — `Selection` includes `{ type:'multi', objectIds, speakerIds }`; `ToolMode` includes `'room' | 'marquee' | 'lasso'`; `RoomLabel {id,name,at,w?,h?}` = zone; `NamedListener extends ListenerState {id,name}`; `Scene.listeners?`/`activeListenerId?` are OPTIONAL (so hand-built test fixtures with only `listener` still type-check) but always populated for real data. **(S20)** `Project {id,name,createdAt}`; `Layout.projectId` and `LayoutStore.projects` are **REQUIRED in memory** — that is exactly what turns the seven non-spreading `setStore` literals into compile errors — while the DISK types (`LayoutRecord`/`MetaRecord` in `db.ts`) keep them optional, because optional-on-disk is the truth for every pre-S20 record. Note the split surfaces under `npm run build` (`tsc --noEmit`), NOT under `npm test`: vitest strips types with esbuild, so a green suite proves nothing about it

**UI:**
- `components/app/App.tsx` — **(S5) decomposed** thin **async-bootstrap wrapper** (`App`) + `AppInner`. **(S14/UX-2) the IA axis is now `appMode: 'design'|'tune'` + `designSubStep: 'build'|'furnish'`, and `theme` is a DERIVED `const` `modeTheme(appMode)` — NOT state.** The mode is the SINGLE theme controller (killed the old 3-way fight between `applyStep`/`applyTool`/the `t` key). `applyMode(entry, scene)` enters a mode+sub-step (+re-arms the wall tool on a fresh DESIGN/Build canvas); `setModeTo`/`setSubStep` are its thin wrappers (header switch PRESERVES the last sub-step, reading fresh `designSubStep` from the render closure); `applyTool(t)` sets the tool and MAY flip the DESIGN sub-step (`subStepForTool`) but NEVER the mode/theme; `runKeyCommand`'s `mode-toggle` (the `t` key) flips the mode. `initialMode(scene)` seeds boot + layout-switch. `AppInner` composes the extracted hooks + renders `<AppHeader>`/`<CanvasStage>`/`<Sidebar>`/`<AppDialogs>`. **Extracted hooks (`components/app/hooks/`):**
  - `useSceneHistory({store,setStore,setSelection})` — per-layout undo/redo. `setScene`/`undo`/`redo` are now **pure store updaters** (history bookkeeping moved OUT of the `setStore` callback → no StrictMode double-invoke reliance, fixes the dev double-pop). Coalescing is **gesture-scoped** (`beginGroup`/`endGroup` wired to `onDragging` drag boundaries + `opts.coalesce` from `e.repeat` for held keys) — NOT a 400 ms timer. `reap(liveIds, keepId)` drops deleted-layout undo buckets (the leak fix). Pure logic lives in `components/app/history.ts` (`historyPush`/`historyUndo`/`historyRedo`/`reapHistory`, unit-tested).
  - `useLayoutStore(store,setStore)` — `active`, `applyToLayout` (the `updateLayout(store,id,fn)` helper from `store.ts` that replaced the 6 duplicated `layouts.map` blocks), `setSettings`, `duplicateLayout`, `exportLayout`.
  - **`useProjectActions({...})` (S20)** — folder CRUD: create / rename / move-a-layout / delete + the delete undo. Split out of `App.tsx` for the 800-line cap, like its five siblings. Deleting a folder is a pure REGROUPING (`removeProject` re-homes, deletes nothing); the undo restores only the layouts THAT delete moved and only if they are still where it put them. Checks the `Deleted` type BEFORE consuming the shared single undo slot.
  - `useLayoutActions({...})` — layout CRUD orchestration (switch/add/rename/delete/import/`undoDelete`). `deleteLayout` calls `reap(…, keepId=deletedId)` so undo-after-undelete keeps the bucket.
  - `usePersistence({store,persistMode,showToast})` — autosave (per-layout IDB diff via `persistedRef`, photo re-encoded only when changed), pagehide/visibility flush, LOUD "Export all" toast on failure; returns `exportAll` (stays `useCallback([])` reading a `storeRef`).
  - `useSimulation(scene,settings,dragging)` — the `trace`/`audio`/`bestSpot` memo chain (identical deps; `DRAG_RAYS` lives here). **S6 moves this into a Web Worker.**
  - `useKeyboardShortcuts({state,run})` — mount-once (`[]`-deps) window `keydown` reading a `ctxRef` (killed the App keydown exhaustive-deps suppression); all branching is in the pure `components/app/keyboard.ts` `handleKeydown` (+ `nudgeSelection`/`rotateSelectedRect`, unit-tested).
  - `app-constants.ts` (`MODE_HINT` per-tool hints + `MODE_ITEMS`/`SUBSTEP_ITEMS` switch items) + `app-types.ts` (`Deleted`/`DialogState`).
  - **`useTutorial.ts` (S21)** — the guided tour's seam into the App: menu open/close plus the mapping from a
    declarative action NAME to a real app command. The runner never edits a scene itself, so the tutorial can
    never become a second implementation that drifts from the app and then teaches something untrue. The ONLY
    action that creates anything is `practice-room`, which finds-or-creates the disposable "Tutorial practice
    room" (reuse by NAME, so a re-run cannot litter the gallery) filed into `activeProject(store).id`.
  - **`components/app/mode.ts` (S14/UX-2, pure + node-tested, `__tests__/mode.test.ts` 45 tests)** — the IA truth: `modeTheme(mode)` (the single theme controller), `toolMode`/`subStepForTool`/`isToolInMode` (tool→mode/sub-step gating), `DIGIT_TOOL`/`digitTool(digit, mode)` (mode-scoped digit shortcuts — no cross-mode leak), `initialMode(scene)`. Retired `PLAN_STEPS`/`TOOL_OWNER`/`initialStep`/the `WorkflowSteps` `Step` type.
- `components/canvas/SimCanvas.tsx` — all pointer/keyboard interaction: wall chains, marquee/lasso band select, ⌘-click toggle, group drag, speaker height auto-snap onto furniture (`surfaceHeightAt`), wall-hover door/window chips. **(S4)** takes an `overlayOpen` prop that gates the canvas R/Backspace keys; the wall-hover chip anchor is **identity-latched** (stays put on the same wall, switches to a neighbour, self-heals on delete/`onPointerLeave`); `chainWallsRef` is now `string[][]` (per-corner id groups); a `grab`/`grabbing` cursor; a matchMedia DPR-repaint effect; the view is frozen while a marquee/lasso band is dragged. Pure logic lives in `interaction.ts`.
- `components/canvas/interaction.ts` — **(S4)** pure, DOM-free, node-tested helpers extracted OUT of SimCanvas: `wallHoverAt`/`makeOpening` (door/window chip), `popChainSegment` (Backspace chain-undo), `selectionSets`/`resolveSelection`/`itemsInBand`/`selectionFromBand` (marquee/lasso + ⌘-click selection algebra), `watchDevicePixelRatio` (DPR-change listener, injectable `win`), `isDraggableAt`/`hoverCursor` (grab affordance), `canvasKeyAction` (R/Backspace/Space gating). 98.9% covered.
- `components/canvas/render.ts` — pure canvas renderer; `THEMES` ('sound' dark glow / 'plan' **dark cyanotype** blueprint since S13); `labelPill` is the single annotation primitive. `FONT`/`FONT_MD` are Geist Mono (400/500), first paint gated on `document.fonts.load()` via `canvas/font-ready.ts`
- `components/canvas/font-ready.ts` — **(S13)** `repaintOnFontLoad(onReady, specs?, fonts?)`: triggers `document.fonts.load()` then ONE `setRedrawTick` repaint so canvas Geist-Mono numbers don't reflow off fallback metrics (FOUT guard). Injectable fontset → node-testable (`__tests__/font-ready.test.ts`, 5 tests), no-ops when `document.fonts` absent
- `components/gallery/LayoutGallery.tsx` — card gallery with live thumbnails (Roomba-style home); thumbnails use the shared `canvas/thumb.ts` `drawMiniPlan` (also used by compare) and draw every seat. **(S20) grouped by FOLDER:** one `<section aria-labelledby>` per project with its name, a store-DERIVED design count (never a stored number), per-folder “New design” + a kebab (Rename / Add apartment / Add a room / Delete), and a per-card “Move to “X””. Deleting a folder re-homes its designs and is undoable; the last folder cannot be deleted.
- `components/panels/ListenerCard.tsx` — **seat manager** (Session 2): a `radiogroup` of listening spots (roving tabindex + arrow keys), switch/add/rename/remove. **(S15/UX-3) Compare is now ALWAYS present in TUNE** (was gated at ≥2 seats) — `disabled={!canCompare}` (threaded App→Sidebar→here; `canCompare` = ≥2 seats OR ≥2 layouts) with a mode-neutral enabled title ("Compare two setups side by side" — covers the two-seats AND two-layouts cases) and a **self-teaching** `card-sub` when it can't fire ("Compare weighs two readouts side by side. Add a second listening spot, or duplicate this layout, and Compare lights up.").
- **`components/panels/verdict.ts` (S15/UX-3, pure + node-tested, `__tests__/verdict.test.ts` 26 tests)** — the SINGLE source of truth for the readout (killed the drift between ScenarioCompare's `verdictOf` and MetricsPanel's inline verdict, the `.compare-verdict` bug). `deriveVerdict(audio, trace, tvAnchor): VerdictView` reproduces the old `verdictOf` EXACTLY for `{locked, quality}` (compare's summary reads only those) and adds `kind`/`headline`/`cause`; the headline gates "One pair locks, another doesn't" on **any** pair locked (`some(p.locked)`, NOT `best.locked` — locked ≠ highest-quality when apex-blocked); `representativePair` ties the cause to the best (meter) pair, or the lowest-quality UNLOCKED pair when some-but-not-all lock; `causeSentence` MOVED here verbatim from MetricsPanel. **THE LOCK edge detector** is a pure reducer — `initIgnition(locked)` seeds `prevLocked` to the CURRENT value (mount is never an edge) and `stepIgnition` bumps a monotonic `token` ONLY on a false→true rising edge.
- **`components/panels/VerdictHero.tsx` (S15/UX-3)** — the verdict lifted onto the opaque `--surface-4` hero rung at `--text-hero`, pure presentational (props: `view: VerdictView` + `seatName` + `variant: 'sidebar'|'compare'`), NOT an aria-live region. Mounted FIRST + `position:sticky;top:0;z-index:1` in the TUNE sidebar column (leads the readout, never scrolls away) and verbatim in each `ScenarioCompare` column (`variant="compare"`). **THE LOCK ignition:** `useLockIgnition(view.locked)` mirrors the reducer's `token` into a `useState` and applies it as the headline's `key` — a keyed remount replays the one-shot `lock-sweep` (the `--signal` cyan→green gradient swept through the letterforms via `background-clip:text` + a green bloom). Each consumer KEYS the hero to the displayed entity (Sidebar: `key={activeListener(scene).id}`; Compare: `key` per scenario) so switching to a *different already-locked* seat/scenario remounts (reseeds → no spurious celebration) while a genuine in-place drag-to-lock (same key) still ignites.
- `components/compare/ScenarioCompare.tsx` — **N-up scenario compare** (Session 2 as 2-up, generalized in **S20**): N independent `(project, layout, seat)` columns on a horizontally-scrollable track, so it compares seats within a design, designs within a folder, AND designs across folders. `MIN_COMPARE` 2 / `MAX_COMPARE` 8 (a **legibility** bound, NOT a CPU control — see `compare-summary.ts`). The column's React key is a stable uid so a neighbour's removal does not remount it, while the `VerdictHero` inside is keyed on the **entity** (`layoutId:seatId`) so a picker change reseeds the LOCK ignition. Pointing a column at a design shows it from that design's OWN active seat, not `seats[0]`. `compare-summary.ts` (pure, node-tested) holds the N-way sentence and derives “has a pair” from `verdict.kind` — no second source of truth. **(S15/UX-3)** the divergent local `verdictOf` + `.compare-verdict` are DELETED; each Column now renders the shared `<VerdictHero variant="compare">` (from `deriveVerdict(audio, trace, tvAnchor)`, computed on the already-memoised `Computed` object — no recompute) above the read-only `MetricsPanel` (`hideSuggest`) spec-sheet. Stays read-only (immutable `setActiveListener`). Reachable from the gallery + ListenerCard (the duplicate header Compare was removed in UX-2).
- **`components/tutorial/` (S21) — the guided tour.** Entry points: a "Tour" button in the global header (visible
  text, not a hover title) and "Take the tour" as the primary action on the first-run welcome. `steps.ts` is 7
  chapters of PURE DATA, each step `show` (the runner acts and narrates) or `try` (waits on a pure
  `done(ctx)` predicate); `machine.ts` is the reducer, which treats a persisted chapter/step as UNTRUSTED input
  (clamp, never index — a throw here takes the whole editor down with it); `progress.ts` is a STANDALONE
  localStorage key (`phantom-lock:tutorial`, never the persistence schema — the S16 rule) holding `seen`/`done`/
  `resume`; `actions.ts` holds the pure scene transforms; `spotlight.ts` is the pure placement geometry (jsdom
  reports every rect as 0×0, so this had to be pure to be provable at all). **THE SPINE is chapter `lock`, and its
  shape is forced by measurement, not taste** — see the lessons below. `CoachMark.tsx` is deliberately NON-MODAL
  and NOT in `overlayOpen`; `ChapterMenu.tsx` is a modal `Dialog` and IS. Chapters are independently launchable,
  which is what makes the button useful forever rather than once — and is exactly why any chapter that writes a
  scene must carry `needsPractice`.
- **`components/panels/SegmentSwitch.tsx` (S14/UX-2)** — generic N-up `radiogroup` (was the retired 4-step "fader" `WorkflowSteps.tsx`): a frosted accent thumb slides via one `transform`, amber armed-LED, roving-tabindex + arrow/Home/End keyboard lifted verbatim. Used TWICE: header DESIGN/TUNE (`variant="mode"`) + sidebar Build/Furnish (`variant="substep"`).
- **`components/panels/TuneToolsCard.tsx` (S14/UX-2)** — the TUNE-context home for the (de-duplicated) TV/Music writer (`.mode-toggle`) + Suggest placement, re-homed out of the global header (both were inert in DESIGN). MetricsPanel/OptimizeDialog now only MIRROR `settings.tvAnchor`.
- **`components/canvas/SelectionActions.tsx` (S14/UX-2)** — on-selection touch HUD (rotate/nudge/delete) shown ONLY on `(hover:none) and (pointer:coarse)`, pinned above the mobile bottom rail. Dispatches the SAME `runKeyCommand` commands as the keyboard (zero logic dup). `role="group"`; rotate disabled unless the selection is a rect; delete disabled for a listener; HIDDEN when `overlayOpen || mode==='wall'` (so its buttons can't fire a command the keyboard path blocks).
- `components/app/AppHeader.tsx` — **(S14/UX-2) rescoped to ONLY global chrome:** brand (dual-span wordmark → `PL` monogram ≤560px, `aria-label="Phantom Lock"`) + pinned layout switcher + `<SegmentSwitch variant="mode">` + undo/redo. TV/Music + Compare + Suggest MOVED into TUNE.
- **Doors & swing (S17):** a door is a `RectObj` with `role:'door'` + `doorOpen?` + the PLAN-ONLY swing fields
  `swingDeg?`(0–180, default 90)/`hingeEnd?`('start'|'end')/`swingSide?`('in'|'out') — clamped in `scene.ts`
  `sanitizeObject`, defaulted in `interaction.ts` `makeOpening`. **`components/canvas/door-swing.ts`** is the pure,
  node-tested hinge/side/angle math (`doorSwing(o)` → `{hingeWorld, latchWorld, alongAngle, leafAngle, arcStart,
  arcEnd, radiusM, swingDeg}`); `render.ts` draws jamb ticks + leaf (solid=open, dashed=closed) + the swing arc from
  it. The **`InspectorPanel` door branch** (before the generic rect branch) shows Width(0.6–2.4, "clear opening")
  + 70/80/90 cm presets + a Swing slider(`<output aria-live=off>`) + Hinge/Swing `aria-pressed` flip pairs(role=group,
  NOT radiogroup) + the doorOpen checkbox, and DROPS Depth/Rotation (keeps shared Height+Absorption). Creation: the
  DESIGN/Build **`opening` tool** (digit 5, click a wall — ⇧=window — placing on pointer-DOWN since a door's h:0.1 is
  below the draw-commit floor; ghost via the canvas `preview` path), the `d`/`w` keys on a selected wall, the hover
  chip (DESIGN+`!overlayOpen`-gated), and the Furnish palette (`addPreset`→`placement.ts` `openingNearPoint`, nearest
  wall). `f`/`⇧F` flip hinge/swing (`keyboard.ts` `flipDoor`, DESIGN-scoped, same-ref no-op on a non-door).
- `components/panels/Toolbar.tsx` — floating dock; per-mode tools (DESIGN/Build: wall · **door/window (S17)** · DESIGN/Furnish: rect/circle · TUNE: speaker) + Fit. **(S14) theme-toggle + undo/redo removed** (theme is the mode's; undo/redo moved to the header). At ≤960px the whole `.toolstrip` un-floats to a bottom, full-width, horizontally-scrollable rail (CSS-only, no JSX change).
- `components/app/Sidebar.tsx` — mode-driven column: DESIGN leads with the Build/Furnish `<SegmentSwitch>` (then Guide + UnderlayCard/FurniturePalette); **(S15/UX-3) TUNE leads with the pinned `<VerdictHero>`** (then `<TuneToolsCard>` + Guide + Speakers + Seats + Audio + Controls + Echogram). Inspector always. Threads `canCompare` (from App) to `ListenerCard`. `GuidePanel` re-keyed to `build`/`furnish`/`tune`. `.sidebar` gained `scroll-padding-top:150px` so a keyboard-focused card scrolls clear of the sticky hero (WCAG 2.4.11).
- `components/ui/` — Icon (no emoji anywhere! + `redo`/`rotate` added S14), Dialog (focus trap/restore), Toast (single-slot, hover-pause), Menu (full ARIA keyboard contract)
- `components/panels/` — sidebar cards; **(S15/UX-3) `MetricsPanel` is now a per-pair DETAIL view under the `VerdictHero`**: the four metrics (ITD / level / angle / lock) render as a **Geist-Mono `tabular-nums` spec sheet** (`SpecRow`/`.spec-sheet` — dotted-underline labels as the visible affordance, right-aligned value column, tone fills on the 3 status rows + `--signal` on the Lock row), keeping the `<details>` "Distances & detail". Its inline per-pair `.verdict` block now renders ONLY when `pairCount > 1` (multi-pair detail); a single pair shows the hero as the sole verdict, so no double-verdict. Imports the shared `causeSentence` from `verdict.ts` (one definition).

## Design system (do not regress)

**"Anechoic Console" (UX-1 / S13):** one unified dark room — BOTH canvas themes are dark. Elevation over borders
(`styles/tokens.css` surface-**0..4** ladder — `--surface-4` #28324a is a UX-3 hero/carriage rung, no consumer yet).
The app shell backdrop is a top-lit vignette **`--app-backdrop`** (`radial-gradient(120% 100% at 50% 0%, #0c1120, #060810)`,
on `body` + `.stage`; it never paints over the opaque canvas). Sentence-case titles; all-caps mono ONLY for tiny eyebrows
+ canvas pills; `--text/-2/-3` emphasis tiers (**text-3 reserved ≥12px** now); motion tokens `--dur-1/2/3`; destructive
actions get undo toasts never confirms; icons via `ui/Icon.tsx`.

**Typography (S13, self-hosted, zero runtime dep):** 3 roles — `--font-display` **Space Grotesk** (500/700: wordmark,
UX-3 verdict hero), `--font-ui` **Geist Sans** (400/500/600: body/UI), `--font-mono` **Geist Mono** (400/500: data,
pills, kbd, **and the canvas** `FONT`/`FONT_MD`). Latin-subset woff2 vendored in `public/fonts/` (7 faces + `LICENSE.md`,
both OFL; ~148 kB total, Geist Mono has no 600/bold → `FONT_MD` + former-`bold` canvas sites use weight **500**). `@font-face`
in `styles/fonts.css` (imported first in `global.css`), `font-display:swap`; **2 preloads** in `index.html` (Geist Sans 400
+ Space Grotesk 500, `crossorigin`). Canvas can't read CSS, so `canvas/font-ready.ts` `repaintOnFontLoad()` fires ONE
repaint via `setRedrawTick` once Geist Mono loads (FOUT/reflow guard; injectable fontset → node-testable, no-ops in vitest).
Type scale is **px** (`--text-xs 11` mono-only … `--text-2xl 30`, `--text-hero clamp(2rem,1.2rem+2.6vw,2.75rem)`); prose
floored ≥13px (`--text-sm`).

**Color-role discipline (S13):** cyan `--accent` / amber `--accent-r` (`#ffa95a`) = L/R channel identity ONLY; `--ok`
(`#3ee08a`, one green app-wide) / `--warn` / `--bad` = acoustic status ONLY; **`--signal`** (`linear-gradient(accent→ok)`)
is the "approaching lock" sweep on `.quality-fill` (the old `.fader-fill` consumer was deleted with the fader in UX-2).
Alpha tokens are `--ok-12/--warn-12/--bad-12` (0.12).

**Information architecture — DESIGN / TUNE (S14/UX-2, do not regress):** TWO modes, each OWNING one canvas theme (the mode
is the SINGLE theme controller — see `mode.ts` `modeTheme`). **DESIGN** = dark cyanotype `plan` canvas, keeps **Build** +
**Furnish** as sub-steps (sidebar `<SegmentSwitch variant="substep">`). **TUNE** = dark `sound` canvas, merges the old
Sound + Analyze into one place-and-read loop (verdict live while positioning). A tool NEVER changes the mode/theme; digit
shortcuts bind only to the current mode's tools (`digitTool(digit, mode)` — no cross-mode leak); the `t` key switches the
MODE (which flips the theme as a consequence), never the theme directly. The **global header** holds ONLY brand + pinned
switcher (`PL` monogram ≤560px) + DESIGN/TUNE switch + undo/redo; TV/Music + Suggest + Compare live in TUNE.
**Responsive (≤960px):** the toolbar un-floats to a bottom full-width horizontally-scrollable rail (40px targets) that
never covers the canvas; the mode-hint repositions to the top (and hides entirely on touch); on-selection touch handles
(`SelectionActions`) appear on coarse pointers for rotate/nudge/delete.

**The readout & THE LOCK (S15/UX-3, do not regress):** the verdict is the app's payoff and now LEADS the TUNE column as
`VerdictHero` on the opaque **`--surface-4`** hero rung at **`--text-hero`** (Space Grotesk 700), `position:sticky;top:0;
z-index:1` so it never scrolls away (bg MUST stay opaque + z-index, or later-DOM cards paint over it). **THE LOCK** is the
signature moment: on a genuine false→true `locked` transition the headline ignites — the **`--signal`** cyan→green gradient
swept through the letterforms (`background-clip:text`, `background-size:220%`, animated `background-position`) + a green
`text-shadow` bloom, via the `lock-sweep` keyframe applied ONLY on the `.is-igniting` class (NOT the resting `.verdict-hero--locked`
headline — else an already-locked layout animates on first paint). Event-driven, one-shot (no perpetual loop). Reduced-motion
swaps `lock-sweep` for the opacity-only `lock-fade` (no positional/transform movement). A `forced-colors` fallback restores a
solid `CanvasText` (transparent gradient-clipped text is invisible in Windows High Contrast). State colours are scoped to
`.verdict-hero--locked/--close/--searching` (own modifiers, no collision with the per-pair `.verdict-*`). Metrics are a
Geist-Mono `tabular-nums` **spec sheet** (`.spec-sheet`/`.spec-row`): dotted-underline labels (visible affordance; the
focusable `<Term>` popover is UX-4), right-aligned value column, ok/warn/bad **tone** fills on the 3 status rows and `--signal`
ONLY on the Lock row + the aggregate quality meter (color-role discipline: the plan's "`--signal` on the four rows" was NOT
taken — `--signal` can't encode ok/warn/bad status; documented deviation).

**Canvas themes** (`render.ts` `THEMES`): `sound` (dark `#080b12`, additive ray-glow — load-bearing, untouched) and
`plan` (**dark cyanotype** `#0a1220`, cyan grid, steel-blue `#8fc7e0` walls, dimension ink — recolored from the old cream
blueprint in S13; `rays:false`). The sound↔plan toggle is a **gentle hue shift, not a black↔white flash**. Canvas overlays
adapt via `--overlay-*` vars on `.stage` — ONE dark-glass recipe; `.stage-plan` inherits it (the light fork was deleted in
S13). Only ambient motion is the canvas rays (`capBreathe`/`nodePulse` header loops deleted).

**Learnability, empty states & shareable output (S16/UX-4, do not regress):** no load-bearing meaning lives only in a hover
`title=`. The **`<Term>`** primitive (`components/ui/Term.tsx`) is a dotted-underline jargon term that IS a real `<button>`
(`aria-expanded`/`aria-controls`/`aria-describedby`, Escape window-capture+stopProp + outside-pointerdown swallow like `Menu`,
`prefers-reduced-motion`, 2px accent focus ring) opening an accessible popover; its base reset is wrapped in **`:where(.term)`**
(0 specificity) so a composed label class (`class="term spec-label"`) always wins the font cascade — do NOT un-`:where` it or the
Geist-Mono spec sheet reverts to Geist-Sans. Definitions are the single pure `panels/glossary.ts` `GLOSSARY` (11 terms), read by
both `Term` and the TUNE `GlossaryCard` `<details>`. `MetricsPanel.SpecRow`/`Row` take an optional `term?: TermKey` → `<Term>` on
the label (itd/ild/angle-60/lock/path-mismatch/comb-notch). **On-canvas `Legend`** (`components/canvas/Legend.tsx` + `legend.css`,
mounted in `CanvasStage` `.stage`) is a collapsible disclosure keyed to `appMode` (TUNE: ray colours, ★ best spot, sweet-spot ring,
60° triangle, YOU-green-when-locked, other seats, dashed=blocked; DESIGN: walls/furniture/TV/area/seat), `--overlay-*` glass,
reduced-motion; it swallows its own keydown/keyup (`stopPropagation`) so a focused toggle can't arm canvas pan (Space) / rotate
(`r`). **Editorial empty states**: `TuneToolsCard` leads with a "Nothing to analyze yet — suggest a stereo pair…" lead (routes to
the single Suggest CTA) when `speakerCount===0`; the empty `MetricsPanel` copy is distinct (no echo). **Speakers** get a one-click
"Pair X + Y as stereo" when exactly two unpaired same-model speakers exist. **Optimizer**: the "Where" picker ALWAYS shows with a
"This room" default (`{kind:'listener'}` = `regionOf(listener)`, a walled region **without a hidden zone**) + area chips + Whole
house; the Apply button reads "Replace with N speakers" when it overwrites; every apply (optimizer + arrange + placed) now emits the
same **undo toast** deletes get. **Rename**: the RoomLabel marker is now "**Area**" (GuidePanel "Mark an area", MODE_HINT, the canvas
drag label, the room-name dialog), the walled shell stays "**Room**" ("Add a room…"); gallery "Import layout (JSON)…"/"Export layout
(JSON)" + "N areas" badge; UnderlayCard "Import floorplan photo" (+ a first-run starter "Start from a floorplan photo" entry via the
shared `panels/underlay-import.ts` `buildUnderlay`). **Shareable output** (`ShareCard`): "Export plan image" (`canvas/export-image.ts`
`renderPlanToBlob` — offscreen `renderScene` → PNG, sized to the scene aspect) + "Copy verdict" (`deriveVerdict` headline+cause+seat →
`navigator.clipboard?.writeText`, guarded). **First run** (`engine/seed.ts`): on a pristine origin the Maple Court demo is seeded with
a fixed ±30° equilateral **locked** homepod pair at the couch seat (a LIVE verdict on first paint), + a dismissible `FirstRunExplainer`
(reuses `Dialog`) gated on **genuine first run** (`bootstrapPersistence.firstRun` = no prior IDB data, AND `isPristineOrigin`) + a
standalone `phantom-lock:intro-dismissed` localStorage flag — NEVER the persistence schema. `apartmentScene()` stays audio-free.

## Accessibility (S7 / 2026-07-22 — do not regress)

**The canvas is a keyboard-operable, AT-legible widget.** `SimCanvas`'s `<canvas>` carries
`tabIndex={overlayOpen ? -1 : 0}` · `role="application"` · `aria-roledescription="Floorplan editor"` ·
`aria-label="Room plan"` · `aria-describedby="sim-canvas-help"` (an `.sr-only` `<p>` holding `canvas-help.ts`'s
`CANVAS_HELP` key map). `role="application"` is DELIBERATE over `img`: browse mode would swallow the
single-letter keys, making the whole model unreachable for exactly the users it exists for — which is also why
the key map must be published via `aria-describedby`.

**The canvas key map** (all in the pure `app/keyboard.ts` dispatcher — the canvas has ZERO React key handlers,
so nothing double-handles): `n`/`Shift+N` cycle · `p` place a pod (**TUNE only**) · `d`/`w` cut a door/window
into a **selected wall** (**DESIGN only**) · arrows nudge · `q`/`e` rotate · `Delete` remove · `Escape` deselect.
The new keys are **mode-scoped exactly like the digit shortcuts** (`mode.ts` `digitTool`) — a letter key must not
become the loophole that reintroduces the cross-mode leak S14 structurally removed.

**Pure modules (node-tested):**
- `canvas/selection-cycle.ts` — `cycleOrder`/`stepCycle`/`selectionForEntry`/`describePosition`. Deterministic
  traversal over EVERY seat, speaker and object (seats → speakers → objects in reading order, cm-rounded, `id`
  tie-broken) so the order can't shift under a user mid-cycle. This is what makes walls/furniture/inactive seats
  reachable at all — before S7 they were pointer-only.
- `canvas/placement.ts` — `SNAP_STEP`/`snapPoint`/`surfaceHeightAt`/`keyboardPlacementPoint`/`placeSpeakerAt`/
  `openingOnWall`. **(S23) plus the wall-seat magnet:** `normalizeAngle`/`wallSeatFor`/`moveObjectTo`/
  `openingMagnetFor` + `DRAG_SEAT`/`WALL_ALIGN_GAP_M` 0.35/`WALL_SEAT_GAP_M` 0.15 — see the S23 lessons. `surfaceHeightAt` MOVED out of SimCanvas (it only ever read `scene.objects`), and the POINTER
  path now calls the same `placeSpeakerAt`, so the furniture z-snap cannot drift between the two paths.
  `keyboardPlacementPoint` puts the first two pods at **±30°** in front of the seat (a real 60° triangle, so two
  `p` presses + "Pair as stereo" can actually LOCK), then walks the **golden angle** so no finite count collides.
- `app/announce.ts` — `speakableUnits`/`sceneSentence`/`verdictSentence`/`countsChanged`/`announcementFor` +
  the `initSettle`/`stepSettle` reducer (injected clock → no fake timers anywhere in the suite).
- `styles/contrast.ts` — WCAG maths with real alpha compositing + `fadeElement` (element `opacity` fades the
  glyph AND its own fill over the parent; modelling only the glyph overstates every disabled state).

**The spoken mirror.** `VerdictHero` stays NOT a live region. `LiveAnnouncer` mounts **TWO** `.sr-only`
`role="status"` `aria-live="polite"` `aria-atomic` regions as the last child of the app root, because the two
change kinds need opposite cadences: **selection** is discrete (immediate) and **the readout** is continuous
(settled, `SETTLE_MS` 700). The scene inventory clause is spoken ONLY when a count changes — a deliberate
arrow-nudge is SLOWER than the settle window, so without that every keypress re-reads ~45 words. Reuses
`deriveVerdict`, so spoken and visible readouts cannot drift (`verdict.ts` stays byte-unchanged; the
speech-only unit expansion lives in `announce.ts`). Suppressed on `overlayOpen`, and the suppressed path
deliberately does NOT advance the baseline (else deleting the active layout from inside the gallery would
close to total silence).

**Contrast is enforced by a test, not a comment** (`styles/__tests__/contrast.test.ts`, 112 assertions over the
real `tokens.css` + `render.ts` `THEMES`, read from DISK). `--text-3` × `--surface-4` = **4.08 (FAILS)** and is
guarded: the only `--surface-4` consumer is `.verdict-hero`, which uses `--text-2` (5.92). The design system's
own "`--text-3` is ≥12px only" rule is a second executable guard, frozen at its **10** pre-existing 11px sites.

**S7 contrast fixes:** `--border-input` (0.75 alpha) — form-field boundaries were 1.19:1 and a field's border is
the only thing distinguishing it from its panel (fills differ by 1.08:1); the alpha must clear 3:1 on BOTH edges
because a translucent border paints over the element's own background. Sound `gridLabel` 0.7→0.82 (3.75→4.76;
those are real 11px ruler NUMBERS). `<Term>`/`.spec-label` underline `--border-strong`→`--text-3` (1.65→6.04 —
the entire UX-4 "there is an explanation here" affordance was invisible). The three disabled states became
**tier-drops rather than opacity fades** (2.08/3.48/1.60 → ≥4.5), using `--text-2` for `.btn:disabled` because
`.where-chips .btn` renders at 11px and `--text-3` is reserved for ≥12px.

**Automated a11y**: `vite.config.ts` `test.projects` = `node` (byte-identical to the pre-S7 config) + `dom`
(jsdom, `src/test/a11y-env.ts`). `src/test/axe.ts` scopes subtree runs to the WCAG tags and runs the full set
page-wide. **`color-contrast` is DISABLED in jsdom and this is a real limit, not a shortcut** — jsdom does not
resolve `var()`, so `getComputedStyle().color` returns the literal string `"var(--text-3)"`; that is exactly why
the token test exists. jsdom also cannot prove: the ≤960px layout (it ignores `@media` entirely), visible focus
rings, `prefers-reduced-motion`, `forced-colors`, `target-size` (disabled by default AND meaningless at 0×0
rects), or canvas pixels. Those are proven in real headless Chrome over CDP.

## Security (S8 / 2026-07-22 — do not regress) — full posture in `docs/security.md`

**CSP.** Declared ONCE in `src/security-headers.ts` (build/test-only, never bundled) and delivered two ways:
a build-time `<meta http-equiv>` injected by the `cspMeta()` plugin in `vite.config.ts` (`apply:'build'` +
`transformIndexHtml` + `injectTo:'head-prepend'`), and real HTTP headers in `public/_headers` (→ `dist/_headers`,
where Netlify/Cloudflare look) + `vercel.json`. `preview.headers` is a **verification harness only** — it ships
nothing. `default-src 'none'` with **no nonce and no hash** (the build emits one module script, zero inline
script/style, no modulepreload polyfill). `frame-ancestors` is **header-only** (ignored in meta per CSP3 §3.3,
and Chrome logs an ERROR if it sees it there). `src/__tests__/security-headers.test.ts` fails if the three copies
drift, or if any source file reaches for `setAttribute('style')`/`insertRule`/`innerHTML`/`eval`/`new Function`.
**Forward note:** `worker-src 'none'` + `connect-src 'none'` are correct today but will block the planned S6 Web
Worker and the approved Three.js 3D view — intended loosened values are in `FUTURE_LOOSENING`.

**The input boundary — LOAD never mangles, IMPORT rejects.** This split is the whole design. The load path
(`sanitizeScene`/`loadStore`) clamps no coordinate and truncates no array, because an adversarial pass measured
that clamping silently flattens a legitimate 42-room layout (75 walls onto one line) which autosave then
overwrites — worse than the DoS it prevents. Untrusted files are refused by `importRejection` **before anything
is committed** (span 400 m, coord 100 km, 5 000 objects, 200 speakers, 500 areas, 256-char ids), asserted by a
test to ACCEPT the bundled demo, a max-size UI room, and a 20-room "Add a room…" layout.

**Worst-case CPU — BOUNDED as of S18 (grid sweeps) and S19 (the reflection search).**
S18's `engine/grid.ts` took an import-legal payload at 64 speakers / span 360 m / 100
objects from **264.6 s to 4.9 s** per simulation pass and made cost flat in span, but it
explicitly could NOT fix everyday slowness: a legitimate 50-room chain's grids are never
capped at all, so it still cost 13.7 s per edit. S19's `engine/reflection.ts` closed that
by making the work cheaper rather than capping it — **50-room chain 13.7 s → ~0.5 s (24–27×),
100-room 102.8 s → ~2 s, object bomb 4.9 s → ~0.13 s, wall-heavy span 399 129.7 s → 12–14 s**
— all bit-identical against a golden captured from the pre-S19 engine.

**Do not upgrade the claim further without measuring.** One residual is left, with numbers
in `docs/security.md` §"Worst-case CPU": the wall-heavy import-legal payload sits at **12–14 s**,
of which `computeAudio` is 8.5–9.8 s — `bestPairSpot` sweeping ~154 000 cells once per apex-blocked
pair, 32 times, and returning `null` for every one. The S19 cell-skip has no analogue there
because its gate is *reachability*, not geometry. Follow-up: `docs/ideas.md` §2d. Separately
`arrange.ts` `openSlots` (6.85 s at span 399, ~370 ms per existing object, extrapolating to
30+ minutes at the ceiling) is now the single worst unbounded path left — `docs/ideas.md` §2c.

## Hard-won lessons

- **⚠️ MEASURE THE CHAIN, NOT THE FUNCTION — the same error landed three times at three depths (S26):**
  S25 read the owner's floorplan at **0.231** and filed a P0: "detection refuses their own plan at the
  default". It does not. `detectWalls` is pure and takes whatever bytes you hand it; the APP hands it
  bytes that have been through **two** unconditional lossy stages — `buildUnderlay` caps at 1600 and
  re-encodes **JPEG q0.72**, then `detectWallsFromUnderlay` caps at `WORK_MAX` 900. Through the real
  chain the plan is **accepted at all three levels** (structure 0.278 / 0.500 / 0.646). And the error
  repeated *inside this session*: S26's own first harness fixed the 900 stage and forgot the JPEG
  stage, reading 0.588 instead of 0.500 — caught only because an agent went looking for it. The rule:
  a harness that calls the pure function is measuring the pure function, and every stage between the
  user's file and that call is part of the answer. Enumerate them from the UI inward before you trust
  a number, and settle it by **driving the real UI** — that run (`docs/sessions/S26/live-owner-plan.mjs`)
  matched wall-for-wall and is the only evidence that needed no argument.
- **A refusal threshold and the knob that feeds it must not be the same lever (S26):** `sensitivity`
  scales `minSegment`, and `structure` is measured on the segments that survive it — so asking for
  FEWER walls mechanically lowers structure and the user's own pickiness is reported back as evidence
  about their image. Measured on the `oblique-survey` fixture: 0.346 accepted at the default, **0.222
  REFUSED at 'Careful'**, the same plan. The fix is not a lower constant but a stated invariant — the
  knob may change WHICH walls are offered and can never, by itself, turn an accepted image into "this
  doesn't look like a floorplan" — enforced by taking a second reading at the default and refusing only
  if both fall short. Pooling two readings is safe here for a reason worth checking before copying it:
  a null fails BOTH by a mile rather than by a near-miss (`no-plan-lines` measures exactly 0.000 at
  every level, because its lines are isolated, not almost-touching).
- **`support` and `explained` are measured against the pipeline's OWN mask, so they cannot separate
  anything (S26):** the obvious way to soften a structure refusal is "don't refuse when support is
  near-perfect and explained is high". Measured, that admits the null: `no-plan-lines` scores
  **support 1.000 and explained 1.000** at every sensitivity, while the lowest legit `explained` is
  0.867 — the null scores HIGHER than real plans on both. A set of clean straight lines is
  tautologically well-supported by, and fully explanatory of, the mask it produced. `structure` is the
  only signal with separating power, which is exactly why weakening it needs care.
- **A corpus can be blind to a whole dimension BY CONSTRUCTION, and the tell is arithmetic (S26):**
  every floorplan fixture rasterises at 700×520 or 900×700 — all at or under `WORK_MAX = 900` — so
  `k = min(1, 900/maxDim)` is exactly 1 for all 22 and the app's downscale was a no-op on every one.
  The corpus had never seen the resolution regime a phone photo arrives at, which is the hole S25 fell
  into. No fixture can catch a harness/app mismatch (that is not a property of any image), but a test
  CAN pin the property the mismatch hid: rasterise at 2.5×, push it through both of the app's
  downscales, and assert the read survives. When you add a guard, ask what its inputs cannot express.
- **A personal artefact can be the only valid fixture AND unpublishable at the same time (2026-07-29):**
  the regression guard here is the owner's own photo, but `src/engine/__tests__/fixtures/` is committed
  to a PUBLIC repo while the photo is a picture of their home. `docs/sessions/` is gitignored, so
  measurements can live there, but a committed test cannot reference them. The resolution is a
  SYNTHETIC fixture reproducing the measured characteristics — `oblique-survey`: an oblique envelope
  whose corners are sub-`minSegment` jogs, dimension lines beside every wall, heavy poché against thin
  partitions, a warren of closet-scale rooms. It now holds the bottom of the corpus's structure range
  (0.346 at the default, against `apartment-cluttered`'s 0.425), which is the gap the real plan sits
  in. Also: a photo dropped in the repo root is one `git add -A` from being published; it is covered by
  an `IMG_*` rule in `.gitignore`.

- **A "proper intersection" predicate is a LEAK whenever your geometry manufactures zeros (S25):**
  `rooms.ts` `segsCross` required a strict `d1*d2 < 0 && d3*d4 < 0`, which is correct exactly when
  all four determinants are non-zero — and this app produces exact zeros constantly, because the
  flood-fill grid origin is `sceneBounds().min − cell` and `sceneBounds` reads door rect CORNERS. An
  ordinary door's `h = 0.1` puts `min.y` at −0.05, which lands an entire cell-centre ROW on a wall
  5.5 m away; every step across it scored 0, was not blocked, and the region walked through the wall.
  Measured 54.81 m² for a 44.00 m² room, and **19 of 300** generated multi-room designs had a zoning
  region that had escaped the building entirely — which silently turns `optimize.ts`'s "This room"
  target into the whole house. Skewed walls are NOT exempt and are worse: a 45° hypotenuse can hold a
  whole anti-diagonal of centres, measured at 92.16 m² for a 40.05 m² triangle. The fix is the
  textbook predicate (proper test plus four `=== 0` branches with an on-segment span check), and
  `=== 0` rather than a tolerance is the RIGHT comparison: a determinant one ulp from zero still
  carries the correct sign and the strict test handles it, so only an exact zero is ambiguous.
- **Half a degeneracy fix passes every test you thought to write (S25):** the obvious repair handles
  only `d3`/`d4` (a cell CENTRE on the blocker) and argues that `d1`/`d2` (a blocker ENDPOINT on the
  step) should stay free, because going around a wall's tip is legitimate and blocking it might seal
  a doorway. That argument fails on the shape the generator actually builds: at an entry door the
  exterior wall splits into two stubs and the door rect's edges START at exactly the stub ends, so on
  that cell row THREE blockers each merely TOUCH the step — none blocks alone, together they seal the
  wall, and the fill threads the seam. The partial fix left **4 of 300** designs fully unsealed while
  passing all 22 other tests in the file. Distil the surviving failure into a named fixture (`THE
  SEAM`, from `one-bed`/seed 6) and keep a three-way ladder — strict → 5 fail, partial → 1 fails,
  full → 23 pass — or the next session's "simplification" silently reopens it. Fourth session running
  for "the corpus follows the code's guards".
- **A predicate that blocks a step blocks it in BOTH directions — including out of the seed (S25):**
  the leak fix makes `segsCross` block any step touching a blocker, which is right, but the flood
  fill applies it to the step OUT of a cell as well as the step in. So a seed whose own cell centre
  sits on a wall has all four exits removed and `regionOf` returns a single 0.09 m² cell. The cell
  spans ±cell/2, so ANY seat within 0.15 m of a grid-aligned wall lands in it — measured, 640 of
  17 600 interior positions on the app's 0.05 m snap grid, and a seat pushed against a wall is
  ordinary. `optimize.ts:265` is the one region consumer with no `area > 2` guard, so it surfaced as
  "Suggest placement" returning ZERO speakers behind a note blaming the user's furniture. Fix it at
  the SEED, not in the predicate (exempting the seed inside `segsCross` would reopen the leak): the
  raw seed POINT is off the wall even when its cell centre is not, so its position picks the side.
  And handle the exact tie — a seat dragged precisely onto the centreline carries no side
  information, and a stable sort silently picked the strip OUTSIDE the building (8.64 m² instead of
  43.74), so run both fills and keep the larger.
- **Re-measure a reviewer's CRITICAL before you act on it — two of them here were quantisation, not
  bugs (S25):** one agent reported that the `=== 0` gate is unsound because at H = 4.0 the on-wall
  cell centre is one ulp short and the leak "reproduces byte-for-byte". The arithmetic was right (it
  IS one ulp off at H = 4.0/3.7/6.1) and the conclusion was wrong: a non-zero determinant with the
  correct sign is exactly what the strict test handles, and all three heights are sealed at 0.35,
  0.5 and 0.8 m beyond the wall. Its evidence — `contains(4, 4.1) === true` — was half-cell
  quantisation: y = 4.1 maps to the cell centred one ulp BELOW the wall, legitimately inside the
  room. A second CRITICAL ("34 % of import-legal coordinate offsets reopen the leak") dissolved the
  same way: across 41 offsets to 100 km, `contains(0.5 m beyond)` is false at every one, and the
  area moving 43.74 → 46.17 is one extra boundary ROW (8 m × 0.3 = 2.43 m²). `contains` is
  grid-quantised BY CONSTRUCTION — a point up to half a cell outside a wall maps to the boundary
  cell — so it is the wrong probe for "did it leak". Probe well clear of the wall instead.
- **When a repair might over-block, find the axis that shrinks the margin and measure along it
  (S25):** the risk here was sealing a doorway, and the margin is the doorway measured IN CELLS —
  which shrinks because `rooms.ts` grows the cell as `span/158` past ~47 m. So the test sweeps
  envelope sizes: a 0.9 m door spans 3.0 cells at 8 m, 2.4 at 60 m, 1.6 at 90 m, 1.0 at 140 m, and it
  connects at every one. That is a real answer; "it should be fine, the gap is 3 cells" would have
  been an assumption that quietly stops holding on a large plan.

- **A unit bug survives every DETERMINISM test, because both sides move together (S24):**
  `generate.test.ts`'s `geometrySignature` includes `o.rotation`, and it is compared only against
  another run of the SAME code — so `edgeAngleDeg` feeding degrees into a radians field was pinned
  for *stability*, never for *correctness*, across 37 tests and two sessions. 50.7 % of every
  generated opening was drawn at the wrong angle (0° walls accidentally right, 90° out by 26.62°,
  180° by 53.24°) and the suite was green throughout. A determinism fingerprint proves reproducibility
  and nothing else; correctness needs an assertion against something OUTSIDE the code under test — here,
  "the opening's long axis is parallel to a wall whose line it lies on", measured through `rectCorners`.
  Never assert the raw field: the failure mode was a plausible number in the wrong unit, which a
  field-equality test would have happily frozen.
- **Right units is not right geometry — write the negative control that has the units right (S24):**
  after the fix landed green, an axis-snapping variant (`round(raw / (π/2)) * (π/2)`) — correct radians,
  visibly wrong on any diagonal wall — ALSO passed all 40 tests. The corpus (`SEEDS.slice(0, 8)`) held
  zero diagonal openings, because the `l-notch`/`alcove` outline variants only emit ±45° ones from seed
  index 8 on. Widening both tests to the full seed list makes the wrong fix fail at
  `studio/3428989595 window: 45.00 deg off` for +0.3 s, and the test now asserts `diagonal > 0` so the
  corpus cannot silently lose them again. Third session running for "the corpus follows the code's
  guards" — when you fix a bug, run the OTHER wrong answer past your new test, not just the old one.
- **Associate an opening with its wall by the LINE it lies on, not the nearest wall (S24):** a generated
  door sits in a real gap between two collinear jamb stubs, so at a corner the *nearest* wall is often
  the PERPENDICULAR one. A nearest-wall test failed by exactly 90° on 35 of 816 openings with the code
  fully correct — a false failure from the harness. Filter by perpendicular offset from the wall's
  infinite line (exact by construction: the centre is `lerp(a, b, t)` on that line), then assert
  parallelism. The tell is a failure of exactly 90.00°, which is a harness bug, not a geometry bug.
- **Give a tree-mutating skeptic its OWN copy (S24):** the impact workflow was told it could apply and
  revert the fix to measure. It did — six times — while the main thread was editing the same files, and
  it left eight scratch `zz*.test.ts` files in `src/` that joined `npm test` and broke the gate twice.
  Nothing was lost (the agent backed up by sha and restored byte-identically, and `git status` proved
  it), but the race was real and avoidable. Either point measurement agents at a copied tree, or forbid
  writes entirely and have them report what they would measure. And run `git ls-files --others
  --exclude-standard src/` before every gate, not just `git status`.

- **A magnet's band must be gated on the SIGNED gap, never `|gap|` (S23):** an absolute-value gate
  gives the band a NEAR edge as well as a far one, so pushing a piece FURTHER into a wall walks it
  SEAT → align → nothing. Measured on a 2.0×1.6 bed against a 13° wall: at 0.65 m of centre offset the
  seat released and the centre jumped **0.163 m BACKWARD** — larger than the seat band itself, so the
  design's own "provable jump bound" was false — and below 0.45 m the rotation reverted to its pre-drag
  value while the bed was half-buried in the wall. At the default 60 px/m that is a 9 px overshoot to
  lose the seat and 21 px to lose the angle, well inside ordinary mouse slop, and "shove it harder to
  make sure it's stuck" is exactly the gesture a magnet invites. Gate on `gap <= band` and a piece
  pushed past flush simply stays seated and is pulled back out.
- **Snap to the nearest HALF turn, not the nearest quarter turn — and the owner's building decides it
  (S23):** on a plan rotated as a whole, every wall lies in the SAME quarter-turn class (22° and 112°
  differ by exactly 90°). So under nearest-π/2 the face a piece presents to a wall is fixed forever by
  its birth rotation, and `App.tsx` hardcodes every palette drop to `rotation: 0` — a sofa dropped on a
  22° plan lands parallel to the 22° walls and **perpendicular** to the 112° walls, sticking a metre
  into the room, and dragging it to another wall never fixes it. Nearest-π puts `w` along the wall
  unconditionally, which is what `arrange.ts` `wallSlots`, `interaction.ts` `makeOpening` and
  `generate/shell.ts` already do. Half the owner's walls would otherwise refuse to seat anything.
- **A quarter-turn applied to the INPUT of a nearest-π snap is annihilated by it (S23):** `k =
  round((θ + π/2 − θw)/π)` just shifts `k` by an integer, landing in the same π-class. Measured over 7
  wall angles with the Sofa preset: a literal **no-op** on 13/22/37/68° walls, and on 0/104/−11.73° a
  180° flip whose four `rectCorners` are **bit-identical** — so the advertised "turn it a quarter turn"
  key does nothing, on every wall, while still pushing an undo entry and jumping the Inspector's
  rotation slider 180°. Apply the turn AFTER the snap and derive `halfPerp`/`halfAlong` from the result.
  This mattered because the whole justification for choosing π over π/2 was "⇧F covers the residual
  ambiguity" — a design that rests on an escape hatch must verify the hatch opens.
- **A wall shorter than the piece will capture the floor around it unless you require real OVERLAP
  (S23):** an accept window of `along ∈ (−halfAlong, L + halfAlong)` is `2·halfAlong` WIDER than the
  wall, so a 0.7 m closet wall gets a **2.70 m capture window — 3.9× its own length** — and a 2 m sofa
  parked in open floor gets yanked onto it. Require
  `overlap = min(along+halfAlong, L) − max(along−halfAlong, 0) ≥ min(halfAlong, L/2)` and clamp the
  output. `arrange.ts:151` already restricts its own wall slots to `t ∈ [0.12, 0.88]` for exactly this
  reason — when the app's own model already disagrees with your design, the model is usually right.
- **`Math.atan2(Math.sin(r), Math.cos(r))` is NOT bit-exact, and a one-value test will not catch it
  (S23):** measured, **12.1 %** of values already inside (−π, π] come back perturbed by ~4e-16. Calling
  it on a no-op path silently rewrote the rotation on every frame of a Shift-drag — contradicting the
  exact invariant the feature advertises ("leaving a wall's field restores the identical float"). The
  test that was supposed to guard it probed the single value `0.4211`, which happens to be one of the
  87.9 % that survive, so it **passed by luck**. Sweep the range, and pin a measured failing value by
  name. This is the S19/S22 "the corpus follows the code's guards" lesson landing on a fresh diff.
- **A drag that writes a field every frame silently reverts any OTHER writer of that field (S23):**
  `keyboard.ts`'s `q`/`e` needs only an object selection, which pointerdown has just set, so a rotate
  can land mid-gesture — and because every frame re-derives rotation from the pointerdown-captured
  `rot0`, the next pointermove threw it away. Pre-S23 the branch wrote only `center`, so it survived.
  Fix by comparing the object's live value against what the branch ITSELF last wrote: different means
  someone else wrote it, so re-base. That keeps the gesture a pure function of its inputs (an external
  edit re-bases it, its own output never does) instead of degrading into a feedback loop. Reset the
  marker per GESTURE, not per mount.
- **Read the app's real store, not the seed you wrote (S23):** a live harness that seeded
  `localStorage['phantom-lock:v2']` and then asserted against that same key measured **nothing** — the
  app autosaves to IndexedDB and never writes the legacy key again, so the read returned the frozen
  seed forever and every assertion would have passed against a value the app never produced. Worse, on
  a pristine origin the app ignores that key entirely and seeds its own first-run demo. Boot once, write
  the probe layout straight into IDB, reload (it is no longer a first run), and assert the layout
  switcher actually shows your layout's name before trusting a single number.
- **Locate a canvas object by CONSEQUENCE, not by pixel maths or DOM selectors (S23):** deriving the
  world→screen transform means re-implementing the app's fit logic in the harness, and probing for a
  selection through `.inspector`-style selectors guesses at markup. Instead sweep candidate points,
  drag each by ~30 px, and check whether the TARGET object's stored centre changed — then ⌘Z back. It
  cannot silently test the wrong object, it needs no knowledge of the view, and it survives markup
  changes. The drag direction still has to match the app's axis convention (+y is DOWN here), which one
  run's numbers will tell you immediately.


- **A component filter cannot separate furniture from a wall it TOUCHES; local thickness can (S22):** the old
  detector rejected furniture by BOUNDING-BOX SPAN, which a sofa passes, and no component-level rule (span, area,
  aspect ratio) can do better once the sofa is pushed against the wall and they share one connected component —
  which is the normal case on a real plan. What separates them pixel by pixel is the largest inscribed disc: a
  wall is thin everywhere, a sofa is fat in the middle. That is exactly what a distance transform measures, so
  `removeThickRegions` is an erode-then-dilate on an EXACT Felzenszwalb EDT. Two details that are not optional:
  the rim must be swallowed at `maxHalfWidth · √2 + 1` rather than `+1.5` (a right-angle corner is the farthest
  boundary point from the eroded core — measured, exactly four pixels of every rectangular blob survived the
  smaller figure), and the filter must run AGAIN after closing, because closing MANUFACTURES thick regions that
  were not in the image: hatching at a pitch under `2·closeRadius` fills into a solid mass that arrives after the
  first pass has already run.
- **`classify` by CROSSING NUMBER, never by neighbour count — and the corpus will not tell you (S22):**
  Zhang-Suen does not guarantee a strictly 8-connected 1-px skeleton; at most slopes it leaves a staircase, and a
  staircase pixel has THREE neighbours while lying mid-line. Branch tracing stops at junctions, so labelling those
  pixels junctions shatters every non-axis-aligned wall into sub-threshold fragments. Measured on an isolated
  straight line: 0 false junctions at 4°, **128 at 8°, 203 at 30°, 310 at 40°** — and a plan photographed 8, 20,
  22, 24 or 26 degrees off-square returned **ZERO walls**. The Rutovitz crossing number reports 0 at every angle
  while still reporting real T- and X-junctions. The corpus could not see it because it rotated by 4° and its one
  angled fixture was 30°, i.e. calibrated at exactly the two angles where the bug does not fire — the S19 lesson
  verbatim: *the test corpus follows the code's guards*.
- **A refusal is a cap, and a cap that fires on real data is a data-loss bug (S22):** `MIN_STRUCTURE` 0.40 looked
  well-clear of the null cases (which measure 0.00) and refused two legitimate plans — a 22°-rotated photo at
  0.364 and heavy-poché-with-thin-partitions at 0.313, each an 83–96 % correct read thrown away with a message
  blaming the user's image. Calibrate a refusal against MEASURED legitimate lows, not against the failures it is
  aimed at, and when you loosen one add the harder null fixture that gives the loosening something to be
  falsified against (`no-plan-lines`: long straight lines that join nothing).
- **The harness must score what the USER gets, or a wrongly-fired refusal is invisible (S22):** the benchmark
  scored `detectSegments` while the app showed `detectWalls(...).quality.refusal`. `hairline` scored 98.0 % in the
  harness and was REFUSED in the app, and nothing in the run said so. Score the refusal as zero and print the
  reason; the instrument has to model the product, not the function.
- **Build the measuring instrument first, and TEST IT (S22):** "did detection get better?" has no answer without
  ground truth, and ground truth is only exact when the image was *drawn* from a description. The corpus is
  therefore CODE — a deterministic pure-TS rasteriser that hands back the centrelines it painted. The score is an
  intersection-over-union on wall LENGTH, i.e. what fraction of the user's editing work was done for them, which
  makes duplicates and hallucinations both count as deletion work; precision alone is blind to a duplicate,
  because a duplicate lies exactly ON a real wall. `detect-score.test.ts` tests the instrument against hand-built
  cases whose answers are known by arithmetic — a perfect detection scores 1, an empty one 0, "every wall twice"
  0.5 — because if the instrument is wrong every other number in the session is wrong and nothing else notices.
  It also caught a real defect in itself: fragmentation double-counted duplicates until it subtracted the MEAN
  simultaneous coverage rather than the peak (two abutting halves both cover the single pixel where they meet, so
  a peak-based correction reads one shared pixel as "duplicated" and excuses the split entirely).
- **A guillotine tiling is NOT conforming, so matching whole edges silently draws walls three times (S22):** cut a
  room off the left and then cut the right-hand block horizontally, and the boundary is one 7 m edge on the left
  facing two 3.5 m edges on the right. Keyed whole, none of the three matches any other, all three count as
  exterior, and the wall is emitted three times with no door in any of them — after which the walkable region
  equals the zoning region and every piece of furniture is trapped in one room. Reduce each axis line to atomic
  intervals and count coverage instead. The tell was not a crash; it was `walkable === zoning`.
- **A door rect in a solid wall joins two rooms acoustically and not at all for furnishing (S22):**
  `rooms.ts` `collectBlockers` pushes the WHOLE wall segment for every wall at `height >= MIN_BOUNDING_HEIGHT` and
  never consults `wallKeptSpans`; doors only ever ADD blockers. Measured four ways on one two-room plan, only
  "two stubs with a real gap PLUS the door rect inside the gap" gets both semantics right — rooms stay distinct
  ZONES for `optimize.ts` while furniture reaches the whole home. The naive construction, which is also what the
  UI's own `opening` tool produces on an existing wall, confines every piece of furniture to the seat's room.
- **Ship a verified lock or ship nothing — never "almost" (S22):** `VerdictHero`'s ignition is a false→true EDGE
  and mount is never an edge (S15), so a generated design that opens *almost* locked shows a static "Almost
  there" and gives the user nothing the app makes discoverable. So the pair search is a LADDER that accepts only
  what the real `traceScene`→`computeAudio` already reports as locked, and returns zero speakers otherwise — which
  lands on `TuneToolsCard`'s existing empty state. Measured: 88 % of 480 designs open locked, 0 open unlocked.
  Also: furniture does NOT defeat a ±30° pair (a furnished 8×7 room locks at quality 1.00); what defeats it is
  `tv.offAxis` against `TV_AXIS_TOLERANCE` 0.25, so the heading is aimed at the TV first and swept only as a
  fallback.
- **`integrateWall` is the wrong home for detector output, and the reason is quadratic OUTPUT (S22):** the old
  Session-12 plan called for committing detected walls through it. Measured, feeding N walls through it
  sequentially produces exactly **N²/2 objects** — 40 walls → 800, 60 → 1 800 — which multiplies `collectSurfaces`
  and therefore every engine sweep S18 and S19 spent two sessions bounding. Its `EPS = 0.02` is also in NORMALISED
  parameter space, so it silently drops a chunk shorter than 2 % of a wall's length: a 10 m wall crossed twice
  0.10 m apart comes back 9.900 m, a 10 cm acoustic hole. `joinCorners` already makes corners meet, so the
  acceptance bullet was retired rather than met.

- **Two absolutely-positioned overlays at the same coordinates is a HIT-TESTING bug, not a cosmetic one (S21):** `.legend` and `.toolstrip` were both `top:12px; left:12px`, and the legend's `z-index:6` beat the strip's `auto` — so `elementFromPoint` at the centre of the primary "Select & move" tool returned `.legend-toggle` and the button was **unclickable at every desktop width**. It survived a screenshot review because the strip simply looked like it started at "Box select". Two lessons: assert reachability with `elementFromPoint`, not by eye; and fix a collision by anchoring the smaller element to the OPPOSITE edge rather than nudging an offset — `.toolstrip` has `flex-wrap: wrap`, so any fix assuming a fixed strip height breaks again the moment it wraps. The existing `@media (max-width:960px)` comment already reasoned about the bottom rail; the author had solved one regime and never checked the other.
- **A fixed CDP debugging port silently attaches you to a PREVIOUS browser (S21):** `--remote-debugging-port=9333` plus a lingering instance means the new Chrome fails to bind and `/json/list` hands you the OLD one — with its old profile. A run that believed it was on a fresh origin found `intro-dismissed`, `tutorial:{seen:true}` and a practice room already active, which would have quietly invalidated every first-run and data-safety claim made from it. Use `--remote-debugging-port=0` and read the real port from `<profile>/DevToolsActivePort`, so you provably attach to the process you just spawned. The tell is state that cannot exist on a fresh profile — check for it explicitly rather than trusting `mkdtemp`.

- **A tutorial's payoff step must be built backwards from the ENGINE, and the numbers decide the design (S21):**
  the guided tour's whole job is to walk someone to THE LOCK, and three measurements — not opinions — fixed its
  shape. (a) The lock is a PRECISION condition: with one speaker pinned, only **3–5 cells** of the 0.05 m snap
  grid lock at all, a target ~0.05–0.10 m across and a handful of pixels at default zoom. So "drag it until it
  locks" is not a step, it is a trap that stalls the tour on its own climax. (b) `keyboardPlacementPoint` puts the
  first two pods at exactly ±30°, which locks at **quality 0.997** in a CLEAN rectangular room and does **not**
  lock in the furnished Maple Court demo (`apexBlocked`, 0.5) — hence a disposable practice room rather than
  borrowing the demo. (c) `VerdictHero`'s ignition is a false→true EDGE and mount is never an edge (S15), so a step
  that merely lands on an already-locked scene shows a static headline and no celebration. The resolution is to
  split the work by who is good at it: the RUNNER does the precision placement (`show`), and the USER makes the
  pairing click (`try`) — which IS the edge. Measure first; a tutorial designed from intuition would have shipped
  a climax that silently does nothing.
- **Reuse-by-name means the SECOND run starts from the FIRST run's end state (S21):** the practice layout is found
  by name and reused, which is right (a re-run must not litter the gallery with copies) — but it meant the room
  still held the previous run's locked pair. `placeTwoPods` was idempotent and no-oped, `ctx.locked` was already
  true when the pairing step opened, and because the ignition needs an EDGE there was no celebration. The tour's
  climax was dead on every run after the first, with nothing on screen to indicate it. Any step that depends on a
  transition must RE-ARM its precondition on entry (`armPairDemo` clears before placing) rather than assume a
  clean slate. Idempotence is the right property for a `show` action and the WRONG one for a step whose whole
  point is a state change.
- **A non-modal overlay cannot join `overlayOpen`, and that has a price you must pay explicitly (S21):** setting it
  kills every scene and tool key (`keyboard.ts:118`), drops the canvas out of the tab order
  (`SimCanvas.tsx:1156`), disables Space-pan and the hover chip, and silences the announcer — so a tutorial that
  set it would switch off the very features it teaches and make every `try` step impossible on a keyboard. But
  staying out means app shortcuts are live while focus is in the card, and `interactiveTarget` gates **only Arrow
  and Delete** — digits, `t`, `q`/`e` fire straight through a focused button and mutate the scene behind the
  tour. So the card swallows its own KEYDOWN with carve-outs for Escape and ⌘-chords, and deliberately does NOT
  swallow keyup, because `interaction.ts` disarms Space-pan on keyup ABOVE its own target exemption (the S7
  lesson) — eating keyup would strand panning armed forever.
- **An independently-launchable chapter is a data-safety hole unless it declares what it writes (S21):** the
  chapter menu is what makes the tour re-enterable documentation rather than one-shot onboarding, but it also
  means a user can jump straight into a chapter whose first action writes a scene — landing on whatever layout is
  active, i.e. THEIRS. `TutorialChapter.needsPractice` marks a chapter as scene-writing and `onStart` enters the
  disposable room BEFORE dispatching, with a corpus test asserting that every chapter containing a writing action
  carries the flag. Fixing it by moving the step would have worked once; the test is what stops the next session
  reintroducing it.
- **A spotlight measured only on step change will confidently point at the wrong thing (S21):** the anchor can
  vanish with no event to listen for — the pair button unmounts the instant the pair exists, and the sidebar
  reflows into the gap — so the ring kept its last rect and ended up drawn around "+ HomePod" the moment the user
  completed the tour's most important action. Re-measure after EVERY render instead, which is only safe with a
  reliable "nothing moved" answer or the effect loops forever; hence `rectsEqual`/`positionsEqual` comparing to
  the nearest half pixel, because `getBoundingClientRect` jitters in the last bits between identical layouts and
  an exact compare would flip-flop indefinitely. Found by driving the real browser, not by a test.
- **The CSP source scanner is comment-blind (S21):** `security-headers.test.ts` greps source TEXT for the
  imperative style-attribute setter, so a comment promising "we never call X" fails the suite by naming X. Describe
  the forbidden API rather than spelling it. Same class of self-inflicted failure as the `--text-3` ratchet, which
  also fired on this diff for an 11px eyebrow — both guards were right and both were fixed rather than suppressed.

- **Make the shape REQUIRED in memory and OPTIONAL on disk — and know which gate catches which (S20):** `Layout.projectId`/`LayoutStore.projects` are required, which is exactly what turned the seven non-spreading `setStore` literals (duplicate / new / new-room / undo-delete / delete-last / delete-active / import — i.e. every layout CRUD action) into compile errors instead of silent folder resets. But the DISK types must stay optional, because every pre-S20 record genuinely has no such key and a required `MetaRecord.projects` lets you write `meta.projects.map(...)` that compiles clean and throws for 100 % of returning users on their first load. Two further traps in the same file: `saveLayout` and `loadFromIDB` build their record literals FIELD BY FIELD (so a new per-layout field round-trips to IDB and vanishes on the next read unless added to both), and `saveMeta` rebuilds the whole meta row on EVERY autosave cycle (so a 1-arg signature is a 400 ms fuse on total folder loss — making `projects` a required parameter is what stops it). And note the required/optional split surfaces under `npm run build`, NOT `npm test`: vitest strips types with esbuild, so a green suite proves nothing about it.
- **A cap is not always the tool — sometimes the honest control is a MEASUREMENT (S20):** an N-up view multiplies whatever one column costs, and a column here ranges over five orders of magnitude — 0.02 ms on the seeded demo, 62 ms on a 30-room house with apex-blocked pairs, ~10.9 s on an adversarial import-legal payload. No fixed N is safe by arithmetic, and a cap small enough to bound the slow case fires on every ordinary one (the S18 lesson inverted: there a cap calibrated against a subset caused data loss; here a cap *justified* against a subset licenses a freeze). So `MAX_COMPARE` is documented as a **legibility** bound and the real control measures the columns it does compute, then stops auto-computing once one exceeds the INP budget. Do not let a doc comment cross-check a cap against the one scene where the optimization works — the next session will believe it.
- **Half a speedup is still worth shipping, but say which half (S20):** a compare column reads the trace ONLY through `.direct.blocked`, and `traceScene` builds `direct` with an independent `directPath` taking neither `rayCount` nor `maxBounces` — so dropping the ray fan is exact BY CONSTRUCTION and 247–865× cheaper. It is also a ~1× no-op on any scene where `computeAudio` dominates (apex-blocked pairs → `bestPairSpot` sweeps), which is precisely the slow case. Both facts are true; the module comment states both, because a comment that only reports the 1565× would have sent the next session looking for a bug when a column takes 62 ms.
- **A repair applied only at the load boundary is not applied at all if UNDO writes past it (S20):** `assembleStore` re-homes an orphaned `projectId`, but `undoDelete` writes straight into the live store and never passes through it. Delete a layout, delete its folder, undo the layout → it comes back pointing at a folder that no longer exists, renders in NO group, is autosaved back to IndexedDB, and is invisible. Present-but-unreachable is worse than the delete it was undoing. Every write path that bypasses the sanitizer needs the same repair, and it must bump `updatedAt` or the repair never reaches disk. Related: the repair target must be STABLE (`orphanHome` = oldest project by `createdAt`, not `projects[0]`) because it is recomputed on every load and never persisted — an unstable target moves an orphan between folders across reloads with no user action in between.
- **`<section aria-label>` is a landmark, so N of them is a defect the WCAG-tags-only axe run cannot see (S20):** eight compare columns each rendering `VerdictHero` + `MetricsPanel` mint sixteen `region` landmarks with two distinct names. `landmark-unique` is a **best-practice** rule, so `expectNoAxeViolations` (WCAG tags only) passes clean on exactly the thing being broken — use `expectNoAxeViolationsOnPage`. The fix is to DROP the name in the compare variant (a `<section>` without an accessible name is not a landmark) and let each column name itself. Same class of thinking for focus: removing a column can disable every Remove button in the same commit, and `.focus()` on a disabled button is a no-op that drops focus to `<body>` — aim the ladder at a control the action itself re-enables.
- **Ragged columns defeat the point of a comparison view (S20):** at `--text-hero` a headline like “One pair locks, another doesn't” wraps to three lines in a 280–360 px column, so every column started its spec sheet at a different height and scanning four of them meant re-finding each row in each one. Invisible to every unit test and to `getComputedStyle` — it only fell out of measuring `getBoundingClientRect().top` of each column's metrics card in headless Chrome (193 vs 147 px heroes → 675 vs 630 px card tops). A type-step down plus a `min-height` fixed it; the proof is that all four card tops now read 666.

- **Bound the DERIVED value or make the WORK cheaper — a cap is not the only tool, and sometimes it structurally cannot be (S19):** S18 capped the grid sweeps and correctly reported that this did nothing for a legitimate 50-room chain, because that scene's grids are never capped — its cost is per-CALL work. The two shapes load the SAME term (`bestReflectionDb`, 94–100 % of a pass in both) through opposite factors: the chain is 45 901 calls × 315 µs, the wall-heavy attack 16.0 M calls × 7.7 µs. So the fix had to attack both axes — hoist everything independent of the grid cell OUT of it, and skip the calls whose results are provably discarded. Neither alone reaches the target.
- **`blocked` is an existential, so it may be computed in any order; `attenuation` is a left-fold, so it may not (S19):** `directOcclusion` returns the *literal* `attenuation: 0` on the blocked branch, and the per-surface predicate reads no loop-carried state — so "is anything blocking" is order-independent and can return on any witness. But the unblocked branch multiplies graze factors **in array order**, and float multiplication does not reassociate (measured: 35 % of three-factor products differ when reordered). The discipline that follows: give the `blocked`-only callers their own helper and leave `directOcclusion` byte-unchanged, so the four `.attenuation` readers — including the on-screen Echogram — are out of the blast radius BY CONSTRUCTION rather than by argument.
- **A bounding box over segments is a search ORDER, not a filter (S19):** it is tempting to reject a surface whose AABB misses the query box. It is not sound: in the near-parallel band just above `raySegment`'s `1e-12` guard, `t` is a ratio of two catastrophically-cancelling cross products and can be reported inside `[EPS, d)` for a segment whose true crossing is far outside the box — and `addRoomShell` appends rooms flush, so exactly-collinear walls are what the app actually builds. The fix costs nothing: trust a POSITIVE from the fast pass (it ran the exact predicate) and settle a NEGATIVE with an unfiltered rescan. Both answers are then exact and no conservatism proof is needed anywhere. Same reasoning licenses the per-leg "last blocker" hint and the height prefilter *inside* that helper — but NOT inside `directOcclusion`, where a wrongly-skipped surface would silently drop a factor out of a product that is on screen.
- **Move the expensive arithmetic BELOW the guards that reject almost everything (S19):** `bestReflectionDb` computed `Math.hypot(flat, sp.z - earZ)` — a nested hypot, unreplaceable under bit-identity — before the two leg-occlusion checks that reject nearly every candidate on a wall-heavy scene. Nothing between reads it and both guards are pure, so deferring it is exact and free. Also worth knowing before optimizing: `Math.hypot` measures **6.4 ns** against 0.7 ns for `sqrt(x*x+y*y)` — 9× slower but only 6 ns, so it was NOT the bottleneck; the win came from not calling it at all. Measure before assuming which primitive is slow.
- **A negative control that passes is a hole in the CORPUS, not a clean bill of health (S19):** four "harmless simplification" perturbations were run against the golden. Swapping the nested hypot for `sqrt(x*x+y*y)` broke 14 entries immediately. But swapping `v.norm(q)` for `v.scale(q, 1/wlen)` — a 45 %-divergent rewrite in general, and exactly what a "share the wall-direction helper" refactor produces — passed everything, because every fixture wall was AXIS-ALIGNED, where both forms give ±1 bitwise. Adding one skewed room with irrational wall lengths and one seeded pseudo-random scene made it fail. Two controls still pass and are recorded rather than hidden (`o.w/2/wlen` → `o.w/(2*wlen)`, and `u < 0` → `u <= 0`): both need an input landing inside an ulp-wide window. Run the controls, and when one passes, ask what the corpus is missing.
- **40 000 random rays never hit a 1e-9 tolerance band — aim at it deliberately (S19):** `raySegment` accepts `u ∈ [−1e-9, 1+1e-9]` so hits may land just past an endpoint. Tightening that to `u < 0 || u > 1` passed the entire randomized identity suite, because a random ray essentially never grazes an endpoint to within a nanometre. Every tolerance constant needs a test that *constructs* an input inside it; fuzzing alone will not find one.
- **The test corpus follows the code's guards, and `legit-scenes.ts` had none for these (S19):** `withSpeakers` always uses an even count and pairs (0,1),(2,3),… so the protected set contains **no solo speaker and no zero-pair scene** — precisely the two conditions the new cell-skip branches on. Dropping the `solos.length === 0` guard passed the whole suite until ALL-SOLO / MIXED / coincident-pair fixtures were added; it now breaks 8 of 162 golden entries. When you add a predicate, add the fixture that makes its guard load-bearing, or the guard is untested by construction.
- **Re-capturing a "pre-change" golden means putting the OLD engine back, and stash is the wrong tool (S19):** the corpus had to grow twice after the engine was already rewritten. Each time the fix was to copy the new files aside, `git checkout <pre-change-commit> -- <engine files>`, regenerate, then copy back — each step its own command, verified with `git status`. Never `git stash && regenerate && git stash pop` chained with `&&`: S18 lost that race when the regeneration timed out and the tree was left silently uncapped.
- **A skeptic's job includes refuting the SPEEDUP, not just the correctness (S19):** the design agent that proposed the two caller-level skips measured them against the pre-session baseline and claimed 117× on the 50-room chain. The independent skeptic re-measured on top of the already-landed `reflection.ts` and found 5.9× — and, more usefully, found the proposal had *under-sold* the same change on the payload it declared unreachable. Performance proposals go stale the moment a sibling change lands; re-measure every number on the tree you are actually shipping.

- **A performance cap is calibrated against an ENUMERATED protected set, or it is a data-loss bug (S18):**
  the first cut of the grid cap was calibrated against a 50-room chain of default 6×6 m rooms and looked
  fine. A design agent measured it against the UI's actual `clampDim` maximum and found it fired on a
  **16-room chain of 25×25 m rooms — span exactly 400 m, `importRejection`-ACCEPTED, coarsening with only
  two speakers.** That is the S8 lesson ("a cap that fires on real data is a data-loss bug, not a fix")
  reappearing in the CPU domain. "No legitimate scene" is **not a decidable predicate** — `addRoomShell`
  appends flush with no gap and no room limit, so cell count grows without bound in room count and no
  finite budget survives every UI-buildable layout. The fix is to write the protected set down as a
  fixture list (`engine/__tests__/fixtures/legit-scenes.ts`), test every entry, and make the constants'
  doc comments point at it. Calibrate against a subset and you will reintroduce exactly this bug.
- **ONE ceiling is never enough — cheap-cell and expensive-cell attacks are disjoint (S18):** a 400 m
  square with 20 walls reaches 1 243 528 pairspot cells at a work product *below* several legitimate
  scenes, so a work budget cannot see it; a 5 000-object scene costs **47.8 ms per cell**, so a cell
  budget large enough for real layouts still allows minutes of work. `grid.ts` therefore caps BOTH
  `cells` and `cells × perCellCost`, and each one is load-bearing for a shape the other misses.
- **Bound the DERIVED value through `Math.max`, and bit-identity becomes structural (S18):** `cappedStep`
  returns its `baseStep` argument via `Math.max`, which yields the *identical float*, and `step` is the
  only value the cap feeds into either loop — so "unchanged below the threshold" is a property of the
  code, not a coincidence a test happens to catch. Still prove it: capture a golden from the PRE-cap
  engine *before* wiring anything up (there is exactly one moment when the old engine exists), and keep
  a negative control — `bestListeningSpot`'s own `coarse` flag is an in-tree step lever that demonstrably
  moves the answer, so it proves the harness can fail.
- **Span is not the only way a `t += step` loop fails to terminate — the ORIGIN is (S18):** S8 clamped the
  span and recorded termination as closed. It was not. Whether the accumulator advances depends on
  `ulp(t)`, i.e. the box's absolute coordinates: a room of an **ordinary 400 m span** parked at
  x ≈ 4.6e15 cannot advance a 0.35 m step, and past ≈ 1e21 `clampSpan` rounds both ends to the midpoint
  so the span is exactly **0** and every `span > 0` guard waves it straight through. Both are reachable
  through the load path (`sanitizeScene` clamps no coordinate; `importRejection` guards only the JSON
  importer). Floor every step at `2·|coord|·ε`. This also breaks the cell PROJECTION: `t += step` rounds
  *down*, so more cells fit than `span/step` predicts (measured 502 real against 500 projected) — the
  projection must be origin-aware or the budget it feeds is unsound.
- **A closed-form cap must solve the projection you actually use, slack included (S18):** the obvious
  `step = √(area / budget)` ignores the `+2`-per-axis slack in `axisCells` and lands **over** budget
  (measured 2 116 cells against a 1 953 budget). Solve `(spanX/s + 2)(spanY/s + 2) ≤ budget` properly —
  it is one quadratic root. An iterative `while (cells > budget) step *= k` would add float noise and
  need its own termination proof; the closed form needs neither.
- **Assert the deterministic integer, never the wall clock (S18):** a `performance.now()` assertion that
  the capped sweep finishes "in under 10 s" passed under `npm test` and **failed at 10.18 s under
  `npm run test:coverage`**, with the code completely correct — v8 instrumentation is the difference.
  Cell counts are exact integers and cannot flake; timings belong in a saved benchmark artifact
  (`docs/sessions/S18/bench/`), not in the suite.
- **Cap the term that is actually unbounded, and say which ones you did not (S18):** this cap closes
  `span²`. It does **not** touch `bestReflectionDb` (O(walls × (objects + surfaces)), and deliberately so:
  a legitimate multi-room house is the wall-heaviest thing in the app, so a walls-aware budget fires on
  real data — measured **20× higher** for a legit 50-room chain than for the wall-heavy attack. Nor
  `traceScene`, which `MAX_RANGE` 60 makes span-independent by construction. Consequence to state plainly
  rather than bury: a 50-room chain still costs 14.2 s per edit and a 100-room chain 106.1 s, **unchanged**
  — so the "everyday slowness" half of `ideas.md` §2 was NOT delivered by this work and is rescheduled
  as §2b. Shipping the half you can prove, and naming the half you cannot, beats claiming both.
- **LOS rays from an object's center hit the object's own surfaces** — always filter `s.objectId !== obj.id` (the TV self-occlusion bug made TV/Music modes identical).
- Image-source reflections MUST occlusion-check both legs or they pass through walls.
- `setScene` history push guards against StrictMode double-runs (`h.past.top !== l.scene`).
- Windows/doors occupy no floor space in collision checks; door corridors are hard constraints.
- Vite HMR errors about deleted files (e.g. RoomMenu.tsx) are stale-buffer noise; hard reload clears.
- App-level keyboard shortcuts must gate on `overlayOpen` (dialogs/optimizer/arrange · `compare` · **and S21's tutorial chapter MENU, but deliberately NOT its step CARD**).
- **Listener mirror invariant:** `scene.listener` MUST always equal the active `listeners[]` entry. Never write `scene.listener` directly (that desyncs the tracer from the verdict — the S2 trap); go through the `scene.ts` seat helpers. `sanitizeScene` re-derives the mirror on every load, so on-disk drift self-heals; a live desync would silently show a verdict for one seat while the echogram traces another.
- **Stereo lock lives in ONE metric space (S3):** `eqError`/apex/subtended-angle are 2D **plan** geometry; keep `dA`/`dB` 3D only for ITD + level, and gate `locked` on 3D arrival symmetry (`pathDiff ≤ 0.07 m`). Mixing a 2D `base` with 3D legs in `eqError` made elevated symmetric pairs un-lockable; a naive 2D-only fix then false-locks unequal-height pairs — you need BOTH halves.
- **Image-source reflections must hit a SOLID span (S3):** a bounce point inside a door/window opening reflects off nothing. Check the bounce param against the wall's kept surfaces (`objectId === w.id`), not the raw a→b segment — same openings the forward tracer already respects via `wallKeptSpans`/`collectSurfaces`.
- **`overlayOpen` must cover EVERY overlay that sits over the still-mounted canvas (S4):** `SimCanvas` stays mounted under the full-screen `LayoutGallery`/`ScenarioCompare` and the `wallProposal` card, and its `window` keydown listener stays live. `LayoutGallery` only `stopPropagation`s Escape, so R/Backspace leaked through until `overlayOpen` (ONE shared App const) was extended to include `galleryOpen` + `wallProposal`. Gate the canvas key handler on it via an `overlayOpenRef` (the keydown effect has `[]` deps, so a prop read directly would be stale).
- **A hover chip anchored to `closestPointOnSegment` chases the cursor (S4):** on a screen-vertical wall the closest point's screen-y tracks the cursor, so the chip retreats ahead of it forever. Latch the anchor on **wall identity** (keep the same wall's anchor, switch to a different wall at once, hold briefly off-walls to stay reachable) — a plain screen-radius hold instead captures neighbouring walls and parks over empty space. Also re-check the wall still exists (self-heal on delete) and clear on `onPointerLeave` (no pointermove fires off-canvas).
- **The Browser-pane tab is `document.hidden` → `requestAnimationFrame` is paused (S4):** `SimCanvas.onPointerMove` throttles `applyMove` through rAF, so hover/drag/marquee-band interactions **cannot be driven live** in the preview. Keyboard + pointerdown paths work (Fix 6 was proven that way). Verify rAF-gated UI via unit tests + agent code-trace, and say so. **(S5)** you CAN still drive keyboard shortcuts + button clicks by dispatching `window.dispatchEvent(new KeyboardEvent('keydown', …))` / `el.click()` from `javascript_tool`, then observe the result in **IndexedDB** (after the ~400 ms autosave) — a numeric proof of undo/redo (S5 verified nudge→⌘Z→⇧⌘Z as 2.30→2.55→2.30→2.55 this way). Note React flushes async, so `wait` a tick before reading the DOM/IDB.
- **History coalescing is gesture-scoped, not a timer (S5):** the pre-refactor 400 ms wall-clock window coalesced ALL edits (drags AND rapid discrete taps). The new model coalesces (a) a pointer drag = one undo entry via `beginGroup`/`endGroup` on `onDragging`, and (b) a **held** key (arrow-nudge AND q/e-rotate) via `opts.coalesce = e.repeat`. Consequence (intended, documented): rapid *discrete* non-drag bursts — a fast wall-chain, placing 4 pods quickly, two quick deletes — are now **separate** undo steps (each independently undoable, which is more correct). If you touch keyboard scene-edits, wire `coalesce: e.repeat` for held keys — the self-review caught that rotate had been left without it while nudge had it.
- **The history leak fix must keep `keepId` (S5):** `reap(liveIds, keepId)` drops undo buckets for layouts no longer in the store, but a just-deleted layout can still be un-deleted (the toast Undo), so `deleteLayout` passes `keepId = deletedId`. Dropping the bucket eagerly would silently lose the restored layout's scene-undo stack (an unsanctioned 4th behavior change). `undoDelete`'s dropped-placeholder bucket is left for the next `deleteLayout` to reap (bounded).
- **Decouple history from the `setStore` updater (S5):** the pre-refactor `setScene`/`undo`/`redo` mutated `historyRef` INSIDE the `setStore` updater and relied on StrictMode's dev double-invoke to dedupe (and undo actually *double-popped* in dev). The fix: do all history bookkeeping in the callback body (reading `storeRef.current`) and pass React a **pure** updater. Safe because no handler fires two scene-mutating `setScene` calls in one synchronous tick (verified); if a future batched multi-edit handler is added, revisit (it would read a stale pre-edit snapshot).
- **Theme-keyed colors can hide OUTSIDE `THEMES` (S13):** recoloring `THEMES.plan` cream→cyanotype was NOT enough — `drawRoomLabels` had a hardcoded `st.theme === 'plan' ? royalblue : cyan` zone fill/stroke (`render.ts:939/941`) that would paint a foreign royal-blue box on the new dark plan. When recoloring a theme, **grep `theme === 'plan'`/`'sound'`** for literal colors outside the `THEMES` object (the D2 agent + skeptic both caught this). The other `theme === 'plan'` sites are behavior gates (underlay opacity, ruler/dimension visibility), not colors — leave them.
- **The canvas FONT stack MUST keep the `ui-monospace` fallback (S13):** `labelPill` draws `★` (best-spot), `∠` (angle), `⌀` (diameter) via `ctx.fillText`, and **Geist Mono lacks all three**. Canvas 2D does per-glyph font fallback, so `'Geist Mono', ui-monospace, …` renders digits/letters in Geist Mono and those 3 symbols in the fallback — correct, but only because the fallback is kept. Never reduce the canvas FONT to a single family. Geist Mono is vendored **400/500 only** (no bold), so `FONT_MD` + the former `bold ${FONT}` sites use weight **500** to avoid faux-bold synthesis.
- **The stage-frame vignette can't live on `.stage` alone (S13):** `SimCanvas` mounts unconditionally and `renderScene` opaquely fills the whole bitmap every frame, so the canvas covers 100% of `.stage` — a `background` there is never seen. `--app-backdrop` goes on **`body` + `.stage`**; it's visible during the async-bootstrap **splash** (the wordmark "powers on" over the vignette) and behind any translucent chrome, and composites *below* the opaque canvas child so the render.ts bg is untouched.
- **Font-load repaint is a real FOUT guard, and its error paths must not be silent (S13):** canvas pills size from `ctx.measureText`; on first mount Geist Mono may be a swap-face → pill widths computed from fallback metrics until some later repaint. `font-ready.ts` `repaintOnFontLoad` triggers `document.fonts.load()` then ONE `setRedrawTick`. A per-spec `.catch` keeps a 404'd face from blocking the repaint, and the outer `.catch` is **reachable** (an `onReady` throw lands there) — both now `console.warn`/`console.error` **only on real failure** (silent-failure-hunter caught the original silent swallows + a "this is unreachable" comment that was false). Injectable fontset → node-testable, no-ops when `document.fonts` is absent.
- **Make `theme` a DERIVED value, not state, to guarantee one controller (S14/UX-2):** the split-personality/tool-teleport bugs came from THREE writers of `theme` state (`applyStep`, the `applyTool` `TOOL_OWNER` teleport, the `t` key). The fix is structural, not a new guard: delete the `theme` `useState` and make it `const theme = modeTheme(appMode)`. Now it's impossible to desync — a tool can only touch the mode's SUB-step, and the `t` key toggles the mode. `theme` still threads through the same `CanvasStage → SimCanvas/render` prop path, so every render read-site is byte-identical (verified: zero `render.ts`/`SimCanvas.tsx` diff). Prove it live by dispatching `keydown` and reading the rendered `.stage-plan` class + the mode `radio`'s `aria-checked` — DOM/React state updates even though the canvas rAF is paused in the preview tab.
- **A non-blocking on-canvas HUD still needs the `overlayOpen`/wall-mode gates (S14/UX-2):** `SelectionActions` dispatches the SAME `rotate`/`nudge`/`delete` commands as the keyboard, but via `onClick` → `runKeyCommand` directly, BYPASSING `handleKeydown` (where the `overlayOpen` + `mode!=='wall'` gates live). Left ungated, its `z-index:7` buttons stay tappable ON TOP of the (z-index:auto) canvas-anchored `OptimizeDialog`/`ArrangeDialog`/`wallProposal` cards on phone viewports — a real, reachable mutate-through-a-dialog bug (both self-review agents caught it; the original "deliberate inverse of the S4 lesson" comment was WRONG). Fix: HIDE the HUD when `overlayOpen || mode==='wall'`, mirroring the keyboard gates. The S4 lesson about `SimCanvas`'s OWN keydown listener staying live is a different concern.
- **Disable an affordance for the no-op case, don't let it silently do nothing (S14/UX-2):** `Selection.type==='object'` spans wall/rect/circle, but `rotateSelectedRect` only rotates rects. A "Rotate" button enabled on a wall (the most common DESIGN selection) is a silent no-op — AND, because `setScene` spreads a new (referentially-identical) scene, it pushed a spurious undo entry. Two fixes: (a) the parent computes `canRotate = selection is a rect` from the scene and disables the button; (b) `rotateSelectedRect` returns the SAME `scene` ref when the target isn't a rect, so `historyPush`'s reference-dedup drops the no-op on BOTH the HUD and keyboard `q`/`e` paths.
- **CDP `(pointer:coarse)` emulation needs touch enabled AND the media features (S14/UX-2):** to screenshot the touch surfaces (bottom rail, HUD, hidden mode-hint) via headless-Chrome-over-CDP, `Emulation.setDeviceMetricsOverride{mobile:true}` alone did NOT flip `(hover:none) and (pointer:coarse)`; you must also call `Emulation.setTouchEmulationEnabled{enabled:true}` + `Emulation.setEmulatedMedia{features:[pointer/any-pointer=coarse, hover/any-hover=none]}`, and RE-assert them after navigations. Verify by probing `matchMedia('(pointer: coarse)').matches` + the element's `getComputedStyle().display` before trusting the pixels. (Node 25 has a built-in `WebSocket` + `fetch`, so a zero-dep CDP client drives this when Playwright isn't installed.)
- **THE LOCK ignition must be keyed to the DISPLAYED entity, not just the component (S15/UX-3):** the ignition ref-seed (`initIgnition` reseeds `prevLocked` to the current lock so mount is never an edge) only runs at MOUNT. Switching to a *different* already-locked seat/layout/compare-scenario is a post-mount `locked` false→true on the SAME mounted `VerdictHero`, so it fired the celebration for a lock the user didn't just achieve — the mount-suppression didn't cover it (self-review caught this; it's the exact case my own live test walked into). Fix is structural: `key` the hero to the entity it shows (`key={activeListener(scene).id}` in the sidebar; `key` per scenario in compare) so a discrete jump REMOUNTS (reseeds → no ignite) while a genuine in-place drag-to-lock (same seat = same key, no remount) still fires. Proven live: switch-to-locked → `igniting:false`; nudge-off-apex-then-back (same seat) → `igniting:true, anim:lock-sweep`.
- **`locked` and `quality` are uncorrelated — gate the multi-pair headline on ANY pair locked, not `best.locked` (S15/UX-3):** `stereo.ts` `locked` ignores `apexBlocked` but `quality` is ×0.6 when apex-blocked, so a fully-locked pair can score below a livelier unlocked pair. The old `verdictOf` gated "One pair locks, another doesn't" on `best.locked`, silently dropping the case where the locked pair isn't the highest-quality. `deriveVerdict` gates on `audio.pairs.some(p=>p.locked)` and draws the cause from the lowest-quality UNLOCKED pair — `{locked:allLocked, quality:best.quality}` stay identical to `verdictOf` (compare's summary reads only those, so no regression).
- **`background-clip:text` + transparent fill is invisible in `forced-colors` (S15/UX-3):** Windows High Contrast strips the gradient background and the `-webkit-text-fill-color:transparent`/`color:transparent` leaves nothing — add a `@media (forced-colors: active)` fallback restoring `CanvasText` + `background:none`. And keep the opaque surface on the hero's PARENT, never on the clipped headline (clip:text hides that element's own box background).
- **CDP `Page.captureScreenshot` over Node's built-in WebSocket must be JPEG, not a huge PNG (S15/UX-3):** a 2× DPR 1440-wide PNG base64 is multi-MB and the built-in `WebSocket` receive silently never delivers that message (the command times out while `Runtime.evaluate` works fine). Use `format:'jpeg', quality:90` (and/or DPR 1) — payloads drop to ~400 kB and land. Also: `--headless=new`'s compositor can deadlock `captureScreenshot`; `--headless=old` + `--window-size` at launch (NOT `Emulation.setDeviceMetricsOverride`) is reliable. To drive a genuine in-place lock in CDP (rAF runs there, unlike the paused preview tab): centre the scene bbox on the seat so a canvas-centre `Input.dispatchMouseEvent` selects the YOU puck, then `Input.dispatchKeyEvent` Arrow-nudge off-and-back (reversible integer steps re-lock exactly).
- **The first-run welcome must gate on genuine first run, not flag-absence (S16/UX-4):** the owner is an IDB-first-run migrated user with NO localStorage keys (`phantom-lock:v2`/`v1` both absent), so a "pristine origin" check alone does NOT exclude them — they'd wrongly see a "you're looking at the Maple Court demo with a pair" welcome over their real 0-speaker layout. The only reliable first-run signal is `loadFromIDB()` returning null (no meta row) → `bootstrapPersistence` now returns `firstRun`; the welcome shows on `boot.firstRun && isPristineOrigin(localStorage)`. Proven live: a fresh headless-Chrome profile (fresh origin) shows the welcome + seeded LOCKED verdict; the owner's origin (reloaded) shows neither.
- **The demo seed must live in a LEAF module, never imported back into `scene.ts` (S16/UX-4):** `engine/seed.ts` imports `scene.ts` (for `apartmentScene`/`makeSpeaker`/`loadStore`) and is consumed only by the App boot wiring. Importing `seed.ts` INTO `scene.ts` would create `scene→seed→optimize→scene` AND `scene→seed→stereo→pairspot→scene` cycles (optimize.ts + pairspot.ts both import scene.ts). Using fixed verified coords means `seed.ts` needs neither optimize nor stereo — it imports scene only. The lock is asserted end-to-end in `seed.test.ts` (traceScene→computeAudio→`pairs[0].locked`) so the coords can't silently drift.
- **Never seed synthetic data in the degraded/error boot path (S16/UX-4):** `bootstrapPersistence`'s catch branch fires when IDB is unavailable OR when existing records fail to reconstruct (`loadFromIDB` throws "unreadable"). Seeding an already-locked demo there would hide a user's temporarily-unreadable real data behind a fake layout. Fix: `bootstrapPersistence(loadLegacy, loadFallback = loadLegacy)` — the App passes the seeding `initialStoreForBoot` as `loadLegacy` (happy-path first run only) and the plain non-seeding `loadStore` as `loadFallback` (catch). No data loss either way (localStorage-mode autosave never writes IDB), but the demo now only appears on a confirmed first run.
- **The on-canvas Legend leaks Space/`r` to the canvas unless it swallows its own keys (S16/UX-4):** `canvasKeyAction` (interaction.ts) exempts only INPUT/TEXTAREA/SELECT — NOT BUTTON — so a focused legend toggle `<button>`, on Space, both toggles itself AND arms canvas pan (`armed=!overlayOpen`), and `r` rotates the selection. `SimCanvas` listens on `window` in the BUBBLE phase, so `onKeyDown`/`onKeyUp={e=>e.stopPropagation()}` on the legend root stops the leak without `preventDefault` (Enter/Space still toggle the button). A read-only legend needs no `overlayOpen` gate (it dispatches no commands), unlike `SelectionActions`.
- **`renderScene` is offscreen-safe; `drawMiniPlan` is not (S16/UX-4):** the export-image renderer paints a detached `<canvas>` because `renderScene` reads ONLY its `RenderState` (never `canvas.clientWidth`/CSS/`document`/`devicePixelRatio`) and `THEMES` are literal hex — verified by an adversarial skeptic. `drawMiniPlan` (thumb.ts) sizes from `canvas.clientWidth` (=0 offscreen) and early-returns. An offscreen renderer that does sync work (`sceneBounds`/`getContext`/`renderScene`) BEFORE its `new Promise` must be `async` so a sync throw becomes a rejection the caller's `.catch` (→ error toast) can see — else it escapes as an uncaught exception.
- **`clipboard.writeText` needs transient user activation; a programmatic click doesn't count (S16/UX-4):** in headless CDP an `element.click()` on "Copy verdict" rejects with `NotAllowedError` → the app's graceful "Could not copy" toast fires (proving the error path). A real `Input.dispatchMouseEvent` at the button's rect IS a user gesture → `writeText` succeeds and "Verdict copied" fires. Verify the success path with a synthesized mouse event, not `.click()`. (Also: the layout switcher is `.room-trigger` with a `title`, not an `aria-label` — CDP `querySelector('[aria-label^=…]')` misses it though the a11y tree shows the title as the name.)

- **An inset `box-shadow` is INVISIBLE on a `<canvas>` (S7):** the canvas paints its bitmap as *replaced content* on top of its own background, and `renderScene` fills it opaquely every frame — so `box-shadow: inset` (the obvious way to draw a focus ring inside an `overflow:hidden` wrapper) is completely covered. Proven by pixel-diffing the focused vs blurred edge strip: byte-identical. **Outlines** paint in the overlay phase, above content, so the ring must be `outline` + a NEGATIVE `outline-offset`. The ring also sits over pannable content, where `--accent` alone measures 1.03:1 against the best-spot green — so it needs a second dark ring (on `.sim-canvas-wrap` via `:has()`) to guarantee one contrasting edge. Always pixel-verify a focus indicator on a canvas; `getComputedStyle` reporting the shadow proves only that the CSS applied, not that anything is visible.
- **`?raw`/`?inline` CSS imports are EMPTY under vitest (S7):** `test.css` defaults to false, so vitest stubs CSS modules — `import tokens from '../tokens.css?raw'` yields `""`, silently. A contrast test built on that would have passed every assertion against an empty token map: a green suite proving nothing. Read stylesheets with `readFileSync` (which needs `@types/node` + `"node"` in `tsconfig.compilerOptions.types`, since this repo pins `types: ["vite/client"]`), and give any source-scanning test a guard that fails when the scan finds nothing.
- **`e.target` is not always an Element (S7):** a key event dispatched at `window` — the repo's OWN live-verification technique (S5/S14) — has `e.target === window`, which is truthy, so `t?.closest(...)` does NOT short-circuit and throws `closest is not a function` inside the global keydown listener, killing every shortcut including Escape and undo. Derive with `e.target instanceof Element ? e.target : null`, never with an `as HTMLElement | null` cast plus optional chaining. (The pre-existing `t.tagName` read was accidentally safe because `window.tagName` is merely `undefined`.)
- **A `<header>` inside `role="dialog"` is still a `banner` landmark (S7):** `role=dialog` is not sectioning content, so `<header class="dialog-head">` inside the shared `Dialog` (and the gallery/compare heads) mapped to a SECOND `banner` alongside the real topbar — axe `landmark-no-duplicate-banner`, and a rotor with two "banner" entries. Use a `<div>` for in-dialog heads. Found by the automated axe pass, not by reading the code.
- **A `role="radiogroup"` may only own radios (S7):** the seat list was `<ul role="radiogroup">` whose `<li>`s each held a radio PLUS a rename `<input>` and a remove `<button>`. That orphaned every `<li>` from its list (axe `listitem`) and promised a one-tab-stop composite contract the rows do not implement. Dropping to a plain list of `aria-pressed` toggles means the roving tabindex must go too — under a non-composite role there is no arrow-key contract, so `tabIndex={active ? 0 : -1}` would strand seats 2..N with no announced way to reach them.
- **`<output>` is an implicit `role="status"` live region (S7):** the ten `<output>` value displays next to sliders meant every drag of Rays/Bounces/Absorption/opacity/rotation double-spoke on each step. `aria-live="off"` keeps the semantics and the visual while silencing the unintended announcements.
- **Mode-scope EVERY new canvas key, not just digits (S7):** S14 made tools mode-scoped via `digitTool(digit, mode)`. A letter key is the obvious loophole — `p` placing a speaker while the user is in DESIGN on the cyanotype canvas is the exact cross-mode leak that was structurally removed. Gate new keys on `env.appMode` and prove it live (3× `p` in DESIGN must leave the entity count unchanged).
- **Gate `interactiveTarget` PER KEY, not per ladder (S7):** blocking the whole mutating ladder whenever a `<button>` has focus looks safe but silently kills `t`, the digits and `q`/`e` the moment the user clicks any sidebar or toolbar button — the single most common interaction. Only Arrow and Delete genuinely collide (ListenerCard and SegmentSwitch both drive roving focus with Arrow and neither stops propagation); Escape and ⌘Z must stay global.
- **A widened target exemption must not break "keyup always disarms" (S7):** adding BUTTON/A/SUMMARY to `canvasKeyAction`'s early return would strand canvas panning armed forever if the user holds Space, Tabs to a button and releases there — `window` never blurs and the canvas never had focus, so neither disarm path fires. Handle the Space **keyup** above the exemption, unconditionally.

- **A security cap that fires on real data is a data-loss bug, not a fix (S8):** the obvious hardening for the
  354-byte brick was to clamp coordinates in `sanitizeScene`. Measured consequence: `addRoomShell` appends each
  room to the RIGHT, so 42 legitimate 6 m rooms (or 11 at the UI's 25 m `clampDim` max) exceed any sane clamp —
  75 walls collapse onto a single line, silently, and `usePersistence` writes the mangled scene back ~400 ms
  later. Permanent, unrecoverable. The fix is to **separate the populations**: REJECT untrusted imports before
  committing (the user keeps their file), and never touch data already in the store. When a guard must bound the
  engine anyway, bound the **derived value** (`sceneBounds`'s returned box) rather than the stored data.
- **Span can be infinite while every bound is finite (S8):** a circle at the ORIGIN with `r: 1e308` yields bounds
  of ±1e308 — both `Number.isFinite` — but a span of `Infinity`, one ulp of 2.2e292, and `x += 0.7` that cannot
  move. A circle at (1e308, 1e308) is the *other* case, where `max.x` overflows to `Infinity` while `min.x` stays
  finite (which is why the old one-sided `!Number.isFinite(min.x)` guard let it through). You need BOTH the
  four-component finite check AND a span bound; neither alone is sufficient.
- **Id de-duplication order encodes a trust hierarchy (S8):** `sanitizeScene` dedupes ids in document order, so
  whoever is processed FIRST keeps its id. With objects first, an imported object whose id collided with the
  active seat's forced the *seat* to be re-issued — `activeListenerId` then failed to match and YOU silently fell
  back to `seats[0]`, i.e. the S2 seat/verdict desync arriving through the import path. The same hole unlinked
  stereo pairs when an object stole a speaker id (caught by my own test, not by inspection). Process the entities
  that are REFERENCED BY ID first (seats ← `activeListenerId`, speakers ← `pairs`) and objects last — objects are
  the only ones nothing references (`objectId` in the tracer is derived at runtime).
- **One `try` around a whole store is a data-loss amplifier (S8):** `loadStore` wrapped every layout in a single
  try/catch that fell through to `defaultStore()`, so one hostile record (`speakers:[null]` → TypeError) silently
  replaced EVERY layout the user owned — and autosave then persisted the replacement. Fix both ends: null-guard
  the throw sites, AND sanitize each record in isolation so a future throw is contained to the record that caused
  it. The v1 legacy branch needs the same wrapper or the total-loss path stays armed.
- **`apply:'build'` is mandatory for a CSP in a Vite app, and the failure is misdirecting (S8):** a CSP in the
  SOURCE `index.html` breaks `npm run dev` — `@vitejs/plugin-react` injects an inline react-refresh preamble
  (`script-src`), `/@vite/client` opens an HMR WebSocket (`connect-src`) and pushes CSS via `style.textContent`
  (`style-src`). Three directives, none of them the one you'd suspect. Inject at build time only.
- **`upgrade-insecure-requests` fails invisibly, and localhost cannot catch it (S8):** with it enabled the same
  `dist/` served over plain http on a LAN IP is a total outage — and it does NOT surface as a CSP violation, so a
  violation-counting harness reports success while the app is dead. `127.0.0.1` is potentially-trustworthy so the
  upgrade never fires there. Any "safe over plain http" check must use a LAN IP or hostname (verified working at
  `192.168.1.72`).
- **Prove a CSP with a NEGATIVE CONTROL, or "0 violations" is unfalsifiable (S8):** every CSP run in this session
  injects an inline `<script>` and asserts it is blocked AND raises a violation. Without it, a policy that failed
  to apply at all would look identical to a perfect one. Same discipline as the S7 focus-ring pixel-diff: a policy
  that parses is not a policy that enforces.
- **A CSS `transform` used for POSITIONING is silently clobbered by any `transform` animation (post-S8):** the
  +Door/+Window chip (`.wall-actions`) positioned itself with `transform: translate(-50%, calc(-100% - 10px))`,
  but its `pop-in` keyframe also animates `transform` — and a running animation REPLACES the element's own
  `transform` for its whole duration. So the chip rendered at the raw anchor while popping in, then jumped ~70px
  the instant the animation ended: the "it runs away from the mouse" report. Fix: position with the INDEPENDENT
  `translate` property, which composes with an animated `transform` instead of being overridden. And `getBoundingClientRect`
  reports the *post-animation* rect, so this is invisible to an API-readback check — it only fell out of dumping
  the element's position + opacity + `elementFromPoint` mid-interaction (the TRAP-5 discipline).
- **An on-canvas overlay chip needs BOTH the relocate-guard and a pointerleave carve-out (post-S8):** the same
  chip had two more independent kill switches. (a) The hover scan kept `prev.id === found.id ? prev : found`, so
  crossing within the appear-radius of ANY nearer wall relocated it — deadly on a 15-wall floorplan; fix: test
  the chip's own screen box (`insideRect`, pure/tested) BEFORE the nearest-wall test so a chip you're reaching for
  can't be stolen. (b) The canvas's `onPointerLeave` cleared the hover unconditionally, and the chip overlays the
  canvas, so moving onto "+ Door" fired pointerleave and destroyed it; fix: ignore a leave whose `relatedTarget`
  is inside the chip, and have the chip clear itself on its own leave. Three independent causes, each sufficient
  alone — the lesson is to drive the REAL trajectory end-to-end (place a door, assert count 0→1), not to stop at
  the first fix that makes one probe pass.

- **Door swing is PLAN-SYMBOL ONLY — verified by an adversarial acoustics trace, not assumed (S17):** doors gained
  `swingDeg?`(0–180, default 90) / `hingeEnd?`('start'|'end') / `swingSide?`('in'|'out') on `RectObj`, drawn by
  `canvas/door-swing.ts` (pure hinge/angle math) + `render.ts`, edited in the door-only `InspectorPanel` branch, and
  flipped by `f`/`⇧F` (`flipDoor`, DESIGN-scoped). The engine NEVER reads them: all 12 door read-sites bottom out in
  `{role, doorOpen, w, rectCorners(center,w,h,rotation), absorption, height}` — `doorOpen` stays the SOLE acoustic
  switch, `w` is the clear opening that cuts the wall gap. `door-swing-equivalence.test.ts` proves `traceScene`/
  `computeAudio`/`bestListeningSpot` are byte-identical across swing values (open AND closed) with a `doorOpen`
  negative control; the 6 frozen engine files are byte-unchanged. The ONE intended visible delta for a migrated door:
  its OPEN leaf standardises from the arbitrary `Math.PI/2.6`≈69.23° to 90° (hinge jamb + swing side preserved).
- **`ctx.arc(…, false)` with `startAngle > endAngle` draws the REFLEX arc, not the minor wedge (S17):** the door
  clearance arc naively called `arc(hinge, r, leafAngle, alongAngle, false)`. For `swingSide:'out'` the leaf angle
  exceeds `alongAngle`, so anticlockwise=false swept the `360−swingDeg` reflex arc — a 90°-out door drew a ~270°
  near-circle. Invisible to any test that only checks `getComputedStyle`/DOM (this is raw canvas), and my first
  screenshot CAPTURED it but I under-read it — the code-reviewer caught it. Fix: `doorSwing` returns
  `arcStart=min(leafAngle,alongAngle)`, `arcEnd=max(...)`; since `|leafAngle−alongAngle| = swingRad ≤ π`, min→max is
  always the swing wedge. Guarded by a node test asserting `arcEnd−arcStart == swingDeg` for both directions × several
  angles. Lesson: for a canvas drawing bug, extract the geometry into a pure helper and TEST it — a screenshot alone
  needs careful reading and a code reviewer's eye.
- **A 0°-swing OPEN door was pixel-identical to an unbroken wall (S17):** at `swingDeg:0`+open the leaf drew flush,
  solid, in `T.wall`, exactly filling the gap `wallKeptSpans` had cut — and in the `sound` theme there is no
  dimension pill, ever, so the door vanished. Silent-failure-hunter caught it. Fix: draw JAMB TICKS at both opening
  ends ALWAYS (a door is never mistaken for a wall), and draw the leaf only when it's off the wall — an open door
  shows the swung leaf only if `swingDeg>0` (an open 0° door is a bare ticked passage), a closed door always shows its
  dashed leaf. Lesson: a control that exposes a value (slider min=0) must render every value it allows without
  colliding with another symbol.
- **Door creation is a DESIGN concern — scope every route to it, and the chip's `overlayOpen` gate was a real fix
  (S17):** the new `opening` tool (ToolMode `'opening'`, `DIGIT_TOOL.design['5']`, `subStepForTool→'build'`), the
  `d`/`w` keys, and the hover chip are now all DESIGN-only. The chip's render+scan gate gained `theme==='plan' &&
  !overlayOpen` — not just tidiness: `insertOpening` calls `onScene` directly, bypassing the keyboard `overlayOpen`
  gate, so +Door/+Window could mutate the scene behind an open OptimizeDialog/ArrangeDialog (the S14
  mutate-through-a-dialog class). A door's rotation is wall-locked: the inspector drops the rotation slider, so
  `rotateSelectedRect` + `canRotateSel` now no-op/disable on doors (`q`/`e` + touch HUD) — a "wall-locked" claim must
  be ENFORCED, not just commented, or `q`/`e` silently detaches the door from its wall with no way to see the drift.
- **Headless canvas click-drive: activate tools via the DOM button, not a synthetic digit key (S17):** in the
  fresh-profile CDP harness a synthesised `'5'` keydown did NOT activate the opening tool (the active tool stayed
  Move), and a canvas click then did nothing. Clicking the real `.strip-btn` "Door / window" button worked, and the
  subsequent wall click placed a door (IDB doors 6→7, read back). Also: seed a disposable layout by navigating FIRST
  to a same-origin BLANK HTML page (not the app, not a `.md` served as octet-stream — that DENIES localStorage),
  setting `localStorage['phantom-lock:v2']`, THEN navigating to the app so `loadFromIDB` is empty and
  `initialStoreForBoot` loads it; booting the app first seeds Maple Court into IDB and your localStorage is ignored.

## NEXT UP: read-only 3D view — see docs/3d-view-plan.md

User approved Three.js (or any dep): **bundle size does NOT matter, "cool" matters;
efficiency only matters if the app gets slow.** It must be read-only and touch nothing else.

## Other known gaps (backlog)

**Unscheduled ideas live in `docs/ideas.md`, prioritized.** As of 2026-07-29 there is **no P0**. The
one S25 raised — *§13, detection REFUSES the owner's own floorplan at the default* — was **REFUTED in
S26**: its numbers came from feeding the original 1320×1734 file to `detectWalls`, and the app has two
unconditional lossy stages in front of that (`buildUnderlay` 1600 + JPEG q0.72, then
`detectWallsFromUnderlay` `WORK_MAX` 900). Through the real chain, and confirmed by driving the real UI
with the owner's actual file, the plan is **accepted at all three levels** — Careful 9 walls / 74 % /
structure 0.278 · Balanced 15 / 85 % / 0.500 · Thorough 24 / 92 % / 0.646.

The head of the queue is now **§13b** (P1) — the verdict is **unstable under exposure**: a 5 % darkening
of the same plan jumps the Otsu cut 175 → 208, TRIPLES the raw ink, and takes structure 0.500 → 0.077.
Then **§4b** — the explicit seat COMMAND (`f`/⇧F with the quarter turn applied AFTER the snap, plus the
Inspector and touch-HUD buttons and the on-canvas snap guide) — then creation-time alignment
(`App.tsx:446` and `SimCanvas.tsx:1015` both hardcode `rotation: 0`, so on a skewed plan every new rect
arrives crooked before any drag), the export-all bundle IMPORTER, multi-tab folder loss, the last
wall-heavy CPU residual, and an `App.tsx` decomposition (**1290** lines against an 800 cap).

- **(S22 done)** Auto-detect walls rebuilt: **52.1 % → 95.6 %** on the enumerated corpus, and it now REFUSES an
  image with no floorplan rather than emitting 61 confident walls. The proposal is reviewable (per-wall strike-off,
  a confidence readout, three named sensitivity levels). Residuals, honestly: `hatched` 91.6 % and
  `apartment-cluttered` 82.3 % — both losses are PRECISION or coverage, never duplication, so the failure
  direction is "a few extra to delete" or "a couple to draw", never a tangle. Detection has never been run against
  the owner's OWN floorplan photo; the harness for that is `docs/sessions/S22/bench/score-corpus.ts --image <f.png>`.

- Drag-release doesn't split walls crossed mid-drag (only creation does, via `integrateWall`).
- Proper image-source reflection off window glass / closed-door leaves (mirror the rect with its own material, not the host wall's) — S3 keeps them solid but approximates with wall absorption; a bounce landing on a coplanar door/window leaf is still governed by leg occlusion.
- Marquee/lasso band *drag* still not driven live (the Browser-pane tab runs `document.hidden`, so rAF — which throttles `applyMove` — is paused); the selection/deselect logic is unit-tested and 3-agent-traced (S4).
- README.md predates gallery/zones/detection/multi-select — needs a rewrite eventually.
- `{type:'multi'}` selection has no listener slot, so a `{type:'listener'}` base is silently dropped from an additive marquee/⌘-click (pre-existing; unchanged by S4). Add a `listenerId?`/`includeListener` if this ever matters.
- **React hook/component tests are still deferred to S10 — but the blocker is GONE.** ~~needs jsdom + RTL, which the repo doesn't have~~ **(corrected S8):** S7 added `jsdom`, `@testing-library/react`, `@testing-library/dom` and `fake-indexeddb`, so hook tests are writable **today**. They just have to be named `*.test.tsx` — `vite.config.ts` routes by FILENAME, not directory (`src/**/*.test.ts` → node project, `src/**/*.test.tsx` → jsdom project). The S5 pure logic (`history.ts`/`keyboard.ts`/`store.ts`) is ≥96% unit-covered; the hooks (`useSceneHistory`/`useLayoutStore`/`useLayoutActions`/`usePersistence`/`useSimulation`/`useKeyboardShortcuts`) + the 4 JSX components (`AppHeader`/`CanvasStage`/`Sidebar`/`AppDialogs`) are 0% unit-covered — S10 owns "component tests for the extracted hooks (S5)".
- **(S5, LOW/theoretical)** `splitWall`/`addPreset` now compute ids from the render-scope `scene` (not the updater's `s`). Behaviour-identical for the single-call-per-gesture wiring today; if a future caller fires two scene-mutating calls in one synchronous handler, `splitWall` could leave a phantom `{type:'object'}` selection pointing at an un-added id. Harden the guard if that wiring ever appears.
- **SimCanvas is still >800 lines** (1136) — its own hook split is out of scope until a dedicated session (S5 only cleaned its exhaustive-deps suppressions + 2 syntactic lint fixes).
- **(S4 done)** grab/grabbing cursor on draggable objects; door/window hover chips wired; canvas keys overlay-gated.
- **(S5 done, but STALE)** App.tsx was decomposed to 789 lines (< 800 cap) into tested hooks — it has since grown back to **1234** (S21) and is over the cap; new App-level logic must go into a `hooks/` module (S21 put the tutorial's in `useTutorial.ts` for exactly this reason), and the file needs its own decomposition session; ESLint (`npm run lint`) added + all exhaustive-deps suppressions re-derived (12 → 5 documented survivors); dead `setHistVersion` + both `setTimeout(fn,0)` selection hacks removed; the 3 history bugs (leak / impure updater / 400 ms→gesture coalescing) fixed.
