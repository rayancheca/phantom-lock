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
- `npm test` — vitest, **814 tests** across TWO projects, all green as of 2026-07-27 (S19 reflection-search perf added +54: `engine/__tests__/reflection.test.ts` 36 — the golden equivalence over 18 branch-coverage probe scenes, a brute-force ORACLE that transcribes the pre-S19 algorithm and fuzzes it against the new one over randomized scenes at origins 0/1e3/1e5, the `surfaces.length`-unchanged guard that protects S18's grid cap, and a negative-radius-circle test that forces `isBlocked`'s exhaustive-rescan safety net — plus +11 in `geometry.test.ts` for the `t`-only ray helpers, incl. a deterministic case inside `raySegment`'s 1e-9 `u` tolerance band that 40 000 random rays never once hit). `|node|` (pure logic) + `|dom|` (jsdom + axe, 3 files) — see `vite.config.ts` `test.projects`. Ratchet: never let the count drop (95→126→140→181→239→245→296→322→340→613→644→649→655→659→666→711→760→**814**).
- `npm run lint` — **(S5)** flat ESLint (`eslint.config.js`): @eslint/js + typescript-eslint + eslint-plugin-react-hooks `recommended-latest`, scoped to `src`, ignoring `.claude`/`dist`/`coverage`. Clean (0 problems) as of 2026-07-19. exhaustive-deps is enforced; 5 documented survivor suppressions remain (SimCanvas:250/398 mount-once, Toast/Menu/LayoutGallery/ScenarioCompare mount-once) — see each file.
- `npm run build` — tsc --noEmit + vite build (**413.85 kB / 133.54 kB gzip** JS + **43.18 kB / 8.24 kB gz** CSS + **1.31 kB** HTML after S19; JS +2.13 kB / +0.83 kB gz vs S18's 411.72/132.71 for the new `engine/reflection.ts`, the three `t`-only helpers in `geometry.ts`, and the two caller-level skips. Prior baseline: **411.72 kB / 132.71 kB gzip** after S18; +1.0 kB / +0.36 kB gz vs S17's 410.66/132.32 for `engine/grid.ts` + the two call sites. Prior baseline for context: **410.66 kB / 132.32 kB gzip** after S17; JS +~2.5 kB gz vs S8's 130.1 for the new `canvas/door-swing.ts` module + the door inspector branch + the opening tool. Pre-S8 baseline for context: **403.5 kB / 130.1 kB gz**; JS +0.6 kB gz for `importRejection`/`cleanVec`/`clampSpan`, HTML 0.87→1.31 kB for the injected CSP meta. `src/security-headers.ts` is BUILD/TEST-ONLY — imported by `vite.config.ts`, never by a client module, so it does not reach the bundle (verified by grep against `dist/assets/*.js`). Pre-S8 was ~402 kB / 129.5 kB gz; JS +2.4 kB gz / CSS +0.19 kB gz vs S16 for `selection-cycle.ts`/`placement.ts`/`canvas-help.ts`/`announce.ts`/`useAnnouncer.ts`/`LiveAnnouncer.tsx` + the a11y CSS). `src/styles/contrast.ts` and everything under `src/test/` are TEST-ONLY and tree-shake out of the bundle. Self-hosted fonts are static assets in `public/fonts/` (7 Latin-subset woff2 + `LICENSE.md`, ~148 kB total, 2 preloaded ≈36 kB — NOT in the JS/CSS bundle). Run all four (lint/test/build) before claiming done.

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
- `rooms.ts` — `regionOf` flood-fill regions (`doorsBlock` option: true for sound zones, false for walkable floor). **(S3)** the grid cell is now **adaptive** (`max(0.3, span/158)`) instead of a hard 160-cell clamp, so scenes wider than ~48 m no longer silently truncate; bit-identical for spans ≤ 47.4 m.
- `arrange.ts` — furniture placement brain (door corridors, daylight, feng shui, first-reflection absorbers, `ZONE_AFFINITY`, walkable containment) + `suggestInventory` ("Decide for me")
- `detect.ts` — floorplan image → walls (Otsu → component filter → Hough → merge); pure core testable without DOM
- `joints.ts` — wall snapping (`snapToWalls`) + `integrateWall` (crossings split BOTH walls into chunks)
- `scene.ts` — presets, sanitize, `addRoomShell`, `loadStore` (legacy localStorage `phantom-lock:v2` reader — now only used as the migration source + IDB-unavailable fallback). **Multi-listener (Session 2):** the source of truth is `scene.listeners: NamedListener[]` (`{id,name,pos,z}`) + `scene.activeListenerId`; `scene.listener` is a **mirror** always kept equal to the active seat so every engine/UI read-site is unchanged. Write ONLY through the helpers — `updateActiveListener` / `setActiveListener` / `addListener` (no-op at `MAX_LISTENERS`=32) / `renameListener` / `removeListener` — each runs `syncActiveListener` (which clones the mirror `Vec2`, never aliases). `sanitizeScene` migrates v2 single `{pos,z}`, v1 `{x,y}`, and the new `listeners[]` shape, truncating to the cap **without dropping the active seat**. Constructors + `addRoomShell` seed the fields (`addRoomShell` recenters ALL seats on a first room). `sceneListeners`/`activeListener` are defensive readers for hand-built scenes.
- `db.ts` — **IndexedDB persistence (Session 1)**: stores `layouts`/`underlays` (image Blobs)/`meta`; `bootstrapPersistence()` migrates the legacy localStorage blob on first run (keeps the old key as rollback), `saveLayout(layout, writeImage)` does per-record async writes, `loadFromIDB()` re-runs `sanitizeLayout`; hardened localStorage fallback when IDB is unavailable. In memory `Scene.underlay.src` stays a data URL so render/UI/export are unchanged.
- `types.ts` — `Selection` includes `{ type:'multi', objectIds, speakerIds }`; `ToolMode` includes `'room' | 'marquee' | 'lasso'`; `RoomLabel {id,name,at,w?,h?}` = zone; `NamedListener extends ListenerState {id,name}`; `Scene.listeners?`/`activeListenerId?` are OPTIONAL (so hand-built test fixtures with only `listener` still type-check) but always populated for real data

**UI:**
- `components/app/App.tsx` — **(S5) decomposed** thin **async-bootstrap wrapper** (`App`) + `AppInner`. **(S14/UX-2) the IA axis is now `appMode: 'design'|'tune'` + `designSubStep: 'build'|'furnish'`, and `theme` is a DERIVED `const` `modeTheme(appMode)` — NOT state.** The mode is the SINGLE theme controller (killed the old 3-way fight between `applyStep`/`applyTool`/the `t` key). `applyMode(entry, scene)` enters a mode+sub-step (+re-arms the wall tool on a fresh DESIGN/Build canvas); `setModeTo`/`setSubStep` are its thin wrappers (header switch PRESERVES the last sub-step, reading fresh `designSubStep` from the render closure); `applyTool(t)` sets the tool and MAY flip the DESIGN sub-step (`subStepForTool`) but NEVER the mode/theme; `runKeyCommand`'s `mode-toggle` (the `t` key) flips the mode. `initialMode(scene)` seeds boot + layout-switch. `AppInner` composes the extracted hooks + renders `<AppHeader>`/`<CanvasStage>`/`<Sidebar>`/`<AppDialogs>`. **Extracted hooks (`components/app/hooks/`):**
  - `useSceneHistory({store,setStore,setSelection})` — per-layout undo/redo. `setScene`/`undo`/`redo` are now **pure store updaters** (history bookkeeping moved OUT of the `setStore` callback → no StrictMode double-invoke reliance, fixes the dev double-pop). Coalescing is **gesture-scoped** (`beginGroup`/`endGroup` wired to `onDragging` drag boundaries + `opts.coalesce` from `e.repeat` for held keys) — NOT a 400 ms timer. `reap(liveIds, keepId)` drops deleted-layout undo buckets (the leak fix). Pure logic lives in `components/app/history.ts` (`historyPush`/`historyUndo`/`historyRedo`/`reapHistory`, unit-tested).
  - `useLayoutStore(store,setStore)` — `active`, `applyToLayout` (the `updateLayout(store,id,fn)` helper from `store.ts` that replaced the 6 duplicated `layouts.map` blocks), `setSettings`, `duplicateLayout`, `exportLayout`.
  - `useLayoutActions({...})` — layout CRUD orchestration (switch/add/rename/delete/import/`undoDelete`). `deleteLayout` calls `reap(…, keepId=deletedId)` so undo-after-undelete keeps the bucket.
  - `usePersistence({store,persistMode,showToast})` — autosave (per-layout IDB diff via `persistedRef`, photo re-encoded only when changed), pagehide/visibility flush, LOUD "Export all" toast on failure; returns `exportAll` (stays `useCallback([])` reading a `storeRef`).
  - `useSimulation(scene,settings,dragging)` — the `trace`/`audio`/`bestSpot` memo chain (identical deps; `DRAG_RAYS` lives here). **S6 moves this into a Web Worker.**
  - `useKeyboardShortcuts({state,run})` — mount-once (`[]`-deps) window `keydown` reading a `ctxRef` (killed the App keydown exhaustive-deps suppression); all branching is in the pure `components/app/keyboard.ts` `handleKeydown` (+ `nudgeSelection`/`rotateSelectedRect`, unit-tested).
  - `app-constants.ts` (`MODE_HINT` per-tool hints + `MODE_ITEMS`/`SUBSTEP_ITEMS` switch items) + `app-types.ts` (`Deleted`/`DialogState`).
  - **`components/app/mode.ts` (S14/UX-2, pure + node-tested, `__tests__/mode.test.ts` 45 tests)** — the IA truth: `modeTheme(mode)` (the single theme controller), `toolMode`/`subStepForTool`/`isToolInMode` (tool→mode/sub-step gating), `DIGIT_TOOL`/`digitTool(digit, mode)` (mode-scoped digit shortcuts — no cross-mode leak), `initialMode(scene)`. Retired `PLAN_STEPS`/`TOOL_OWNER`/`initialStep`/the `WorkflowSteps` `Step` type.
- `components/canvas/SimCanvas.tsx` — all pointer/keyboard interaction: wall chains, marquee/lasso band select, ⌘-click toggle, group drag, speaker height auto-snap onto furniture (`surfaceHeightAt`), wall-hover door/window chips. **(S4)** takes an `overlayOpen` prop that gates the canvas R/Backspace keys; the wall-hover chip anchor is **identity-latched** (stays put on the same wall, switches to a neighbour, self-heals on delete/`onPointerLeave`); `chainWallsRef` is now `string[][]` (per-corner id groups); a `grab`/`grabbing` cursor; a matchMedia DPR-repaint effect; the view is frozen while a marquee/lasso band is dragged. Pure logic lives in `interaction.ts`.
- `components/canvas/interaction.ts` — **(S4)** pure, DOM-free, node-tested helpers extracted OUT of SimCanvas: `wallHoverAt`/`makeOpening` (door/window chip), `popChainSegment` (Backspace chain-undo), `selectionSets`/`resolveSelection`/`itemsInBand`/`selectionFromBand` (marquee/lasso + ⌘-click selection algebra), `watchDevicePixelRatio` (DPR-change listener, injectable `win`), `isDraggableAt`/`hoverCursor` (grab affordance), `canvasKeyAction` (R/Backspace/Space gating). 98.9% covered.
- `components/canvas/render.ts` — pure canvas renderer; `THEMES` ('sound' dark glow / 'plan' **dark cyanotype** blueprint since S13); `labelPill` is the single annotation primitive. `FONT`/`FONT_MD` are Geist Mono (400/500), first paint gated on `document.fonts.load()` via `canvas/font-ready.ts`
- `components/canvas/font-ready.ts` — **(S13)** `repaintOnFontLoad(onReady, specs?, fonts?)`: triggers `document.fonts.load()` then ONE `setRedrawTick` repaint so canvas Geist-Mono numbers don't reflow off fallback metrics (FOUT guard). Injectable fontset → node-testable (`__tests__/font-ready.test.ts`, 5 tests), no-ops when `document.fonts` absent
- `components/gallery/LayoutGallery.tsx` — card gallery with live thumbnails (Roomba-style home); thumbnails now use the shared `canvas/thumb.ts` `drawMiniPlan` (also used by compare) and draw every seat
- `components/panels/ListenerCard.tsx` — **seat manager** (Session 2): a `radiogroup` of listening spots (roving tabindex + arrow keys), switch/add/rename/remove. **(S15/UX-3) Compare is now ALWAYS present in TUNE** (was gated at ≥2 seats) — `disabled={!canCompare}` (threaded App→Sidebar→here; `canCompare` = ≥2 seats OR ≥2 layouts) with a mode-neutral enabled title ("Compare two setups side by side" — covers the two-seats AND two-layouts cases) and a **self-teaching** `card-sub` when it can't fire ("Compare weighs two readouts side by side. Add a second listening spot, or duplicate this layout, and Compare lights up.").
- **`components/panels/verdict.ts` (S15/UX-3, pure + node-tested, `__tests__/verdict.test.ts` 26 tests)** — the SINGLE source of truth for the readout (killed the drift between ScenarioCompare's `verdictOf` and MetricsPanel's inline verdict, the `.compare-verdict` bug). `deriveVerdict(audio, trace, tvAnchor): VerdictView` reproduces the old `verdictOf` EXACTLY for `{locked, quality}` (compare's summary reads only those) and adds `kind`/`headline`/`cause`; the headline gates "One pair locks, another doesn't" on **any** pair locked (`some(p.locked)`, NOT `best.locked` — locked ≠ highest-quality when apex-blocked); `representativePair` ties the cause to the best (meter) pair, or the lowest-quality UNLOCKED pair when some-but-not-all lock; `causeSentence` MOVED here verbatim from MetricsPanel. **THE LOCK edge detector** is a pure reducer — `initIgnition(locked)` seeds `prevLocked` to the CURRENT value (mount is never an edge) and `stepIgnition` bumps a monotonic `token` ONLY on a false→true rising edge.
- **`components/panels/VerdictHero.tsx` (S15/UX-3)** — the verdict lifted onto the opaque `--surface-4` hero rung at `--text-hero`, pure presentational (props: `view: VerdictView` + `seatName` + `variant: 'sidebar'|'compare'`), NOT an aria-live region. Mounted FIRST + `position:sticky;top:0;z-index:1` in the TUNE sidebar column (leads the readout, never scrolls away) and verbatim in each `ScenarioCompare` column (`variant="compare"`). **THE LOCK ignition:** `useLockIgnition(view.locked)` mirrors the reducer's `token` into a `useState` and applies it as the headline's `key` — a keyed remount replays the one-shot `lock-sweep` (the `--signal` cyan→green gradient swept through the letterforms via `background-clip:text` + a green bloom). Each consumer KEYS the hero to the displayed entity (Sidebar: `key={activeListener(scene).id}`; Compare: `key` per scenario) so switching to a *different already-locked* seat/scenario remounts (reseeds → no spurious celebration) while a genuine in-place drag-to-lock (same key) still ignites.
- `components/compare/ScenarioCompare.tsx` — **2-up scenario compare** (Session 2): two `(layout, seat)` scenarios side by side. **(S15/UX-3)** the divergent local `verdictOf` + `.compare-verdict` are DELETED; each Column now renders the shared `<VerdictHero variant="compare">` (from `deriveVerdict(audio, trace, tvAnchor)`, computed on the already-memoised `Computed` object — no recompute) above the read-only `MetricsPanel` (`hideSuggest`) spec-sheet. Stays read-only (immutable `setActiveListener`). Reachable from the gallery + ListenerCard (the duplicate header Compare was removed in UX-2).
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
  `openingOnWall`. `surfaceHeightAt` MOVED out of SimCanvas (it only ever read `scene.objects`), and the POINTER
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
- App-level keyboard shortcuts must gate on `overlayOpen` (dialogs/optimizer/arrange **and now `compare`**).
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

**Unscheduled ideas live in `docs/ideas.md`, prioritized** (P0 auto-detect overhaul + grid-loop
iteration cap · **P1 guided tutorial mode** (owner-requested, deep design written up) · P1 snap
furniture to a wall's angle · P2 3D view + component tests · P3 small stuff).

- **Auto-detect walls is broken on real floorplans** (spidery/duplicated/non-orthogonal tangle) — scheduled as **Session 12** (accuracy overhaul); root causes diagnosed in `docs/master-plan.md` against `src/engine/detect.ts` (global Hough on filled walls, no skeletonization, grazing diagonals, furniture blobs kept, no global regularization).

- Drag-release doesn't split walls crossed mid-drag (only creation does, via `integrateWall`).
- Proper image-source reflection off window glass / closed-door leaves (mirror the rect with its own material, not the host wall's) — S3 keeps them solid but approximates with wall absorption; a bounce landing on a coplanar door/window leaf is still governed by leg occlusion.
- Marquee/lasso band *drag* still not driven live (the Browser-pane tab runs `document.hidden`, so rAF — which throttles `applyMove` — is paused); the selection/deselect logic is unit-tested and 3-agent-traced (S4).
- README.md predates gallery/zones/detection/multi-select — needs a rewrite eventually.
- `{type:'multi'}` selection has no listener slot, so a `{type:'listener'}` base is silently dropped from an additive marquee/⌘-click (pre-existing; unchanged by S4). Add a `listenerId?`/`includeListener` if this ever matters.
- **React hook/component tests are still deferred to S10 — but the blocker is GONE.** ~~needs jsdom + RTL, which the repo doesn't have~~ **(corrected S8):** S7 added `jsdom`, `@testing-library/react`, `@testing-library/dom` and `fake-indexeddb`, so hook tests are writable **today**. They just have to be named `*.test.tsx` — `vite.config.ts` routes by FILENAME, not directory (`src/**/*.test.ts` → node project, `src/**/*.test.tsx` → jsdom project). The S5 pure logic (`history.ts`/`keyboard.ts`/`store.ts`) is ≥96% unit-covered; the hooks (`useSceneHistory`/`useLayoutStore`/`useLayoutActions`/`usePersistence`/`useSimulation`/`useKeyboardShortcuts`) + the 4 JSX components (`AppHeader`/`CanvasStage`/`Sidebar`/`AppDialogs`) are 0% unit-covered — S10 owns "component tests for the extracted hooks (S5)".
- **(S5, LOW/theoretical)** `splitWall`/`addPreset` now compute ids from the render-scope `scene` (not the updater's `s`). Behaviour-identical for the single-call-per-gesture wiring today; if a future caller fires two scene-mutating calls in one synchronous handler, `splitWall` could leave a phantom `{type:'object'}` selection pointing at an un-added id. Harden the guard if that wiring ever appears.
- **SimCanvas is still >800 lines** (1136) — its own hook split is out of scope until a dedicated session (S5 only cleaned its exhaustive-deps suppressions + 2 syntactic lint fixes).
- **(S4 done)** grab/grabbing cursor on draggable objects; door/window hover chips wired; canvas keys overlay-gated.
- **(S5 done)** App.tsx decomposed to 789 lines (< 800 cap) into tested hooks; ESLint (`npm run lint`) added + all exhaustive-deps suppressions re-derived (12 → 5 documented survivors); dead `setHistVersion` + both `setTimeout(fn,0)` selection hacks removed; the 3 history bugs (leak / impure updater / 400 ms→gesture coalescing) fixed.
