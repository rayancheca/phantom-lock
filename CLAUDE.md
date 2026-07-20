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
- `npm test` — vitest, **322 tests**, all green as of 2026-07-20 (S15/UX-3 added +26 in `panels/__tests__/verdict.test.ts` — pure `deriveVerdict` aggregation across all cardinalities incl. the locked-but-not-best headline case, `representativePair`, moved `causeSentence`, and the `initIgnition`/`stepIgnition` LOCK edge detector: the critical `stepIgnition(initIgnition(true), true).token === 0` mount-no-ignite assertion + rising/held/falling/StrictMode cases). Ratchet: never let the count drop (95→126→140→181→239→245→296→**322**).
- `npm run lint` — **(S5)** flat ESLint (`eslint.config.js`): @eslint/js + typescript-eslint + eslint-plugin-react-hooks `recommended-latest`, scoped to `src`, ignoring `.claude`/`dist`/`coverage`. Clean (0 problems) as of 2026-07-19. exhaustive-deps is enforced; 5 documented survivor suppressions remain (SimCanvas:250/398 mount-once, Toast/Menu/LayoutGallery/ScenarioCompare mount-once) — see each file.
- `npm run build` — tsc --noEmit + vite build (**~382 kB / 123.8 kB gzip** JS + **38.0 kB / 7.4 kB gz** CSS after S15; JS +0.7 kB gz / CSS +0.45 kB gz vs S14 for `VerdictHero` + `verdict.ts` + THE LOCK / spec-sheet CSS). Self-hosted fonts are static assets in `public/fonts/` (7 Latin-subset woff2 + `LICENSE.md`, ~148 kB total, 2 preloaded ≈36 kB — NOT in the JS/CSS bundle). Run all four (lint/test/build) before claiming done.

**GitHub (as of 2026-07-19):** the repo is public at **github.com/rayancheca/phantom-lock** (`origin`, default
branch `main`). The owner wants visible contribution activity, so **push `main` after every session lands the
gate** (land per-session branch work onto `main`, then `git push`). The bundled demo apartment's real address
was scrubbed to the placeholder **"Maple Court"** across all history — keep it that way; `docs/sessions/` and
`coverage/` are gitignored (local-only, never publish the real-floorplan screenshots).

## Architecture map

**Engine (`src/engine/`, pure TS, fully unit-tested):**
- `raytrace.ts` — ray casting, `directPath` (3D LOS with graze attenuation), `collectSurfaces`, `wallKeptSpans` (door gaps)
- `stereo.ts` — `computeAudio`/`computePair`: pair metrics (ITD/ILD/angle/lock), `apexBlocked`, relocated `sweet` spot. **(S3)** the equilateral test (`eqError`/`isEquilateral`) is now pure **2D plan** distances — consistent with the 2D apex/angle/base — while `dA`/`dB` stay 3D for ITD/level; `locked` also requires 3D arrival symmetry (`pathDiff ≤ ITD_LOCK_TOLERANCE_M` = 0.07 m ≈ 0.2 ms) so an elevated-but-plan-symmetric pair locks yet a mismatched-height pair never false-locks.
- `pairspot.ts` — `bestPairSpot` (per-pair wall-aware seat search), `bestReflectionDb` (image-source first-order bounces, **both legs occlusion-checked**). **(S3)** a bounce is now only credited when its point `u` lands on a **solid (kept) span** of the wall — surfaces filtered by `objectId === w.id` — so reflections no longer pass through door/window openings; plus an explicit zero-length-wall guard.
- `bestspot.ts` — `bestListeningSpot` field (green ★ + glow): occlusion + reflections for ALL speakers, capability-weighted (mini 0.65), TV-mode gates score on `tvViewQuality`
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
- `components/panels/Toolbar.tsx` — floating dock; per-mode tools (DESIGN/Build: wall · DESIGN/Furnish: rect/circle · TUNE: speaker) + Fit. **(S14) theme-toggle + undo/redo removed** (theme is the mode's; undo/redo moved to the header). At ≤960px the whole `.toolstrip` un-floats to a bottom, full-width, horizontally-scrollable rail (CSS-only, no JSX change).
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

## Hard-won lessons

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

## NEXT UP: read-only 3D view — see docs/3d-view-plan.md

User approved Three.js (or any dep): **bundle size does NOT matter, "cool" matters;
efficiency only matters if the app gets slow.** It must be read-only and touch nothing else.

## Other known gaps (backlog)

- **Auto-detect walls is broken on real floorplans** (spidery/duplicated/non-orthogonal tangle) — scheduled as **Session 12** (accuracy overhaul); root causes diagnosed in `docs/master-plan.md` against `src/engine/detect.ts` (global Hough on filled walls, no skeletonization, grazing diagonals, furniture blobs kept, no global regularization).

- Drag-release doesn't split walls crossed mid-drag (only creation does, via `integrateWall`).
- Proper image-source reflection off window glass / closed-door leaves (mirror the rect with its own material, not the host wall's) — S3 keeps them solid but approximates with wall absorption; a bounce landing on a coplanar door/window leaf is still governed by leg occlusion.
- Marquee/lasso band *drag* still not driven live (the Browser-pane tab runs `document.hidden`, so rAF — which throttles `applyMove` — is paused); the selection/deselect logic is unit-tested and 3-agent-traced (S4).
- README.md predates gallery/zones/detection/multi-select — needs a rewrite eventually.
- `{type:'multi'}` selection has no listener slot, so a `{type:'listener'}` base is silently dropped from an additive marquee/⌘-click (pre-existing; unchanged by S4). Add a `listenerId?`/`includeListener` if this ever matters.
- **React hook/component tests are deferred to S10** (needs jsdom + React Testing Library, which the repo doesn't have — vitest env is `node`). The S5 pure logic (`history.ts`/`keyboard.ts`/`store.ts`) is ≥96% unit-covered; the hooks (`useSceneHistory`/`useLayoutStore`/`useLayoutActions`/`usePersistence`/`useSimulation`/`useKeyboardShortcuts`) + the 4 JSX components (`AppHeader`/`CanvasStage`/`Sidebar`/`AppDialogs`) are 0% unit-covered — S10 owns "component tests for the extracted hooks (S5)".
- **(S5, LOW/theoretical)** `splitWall`/`addPreset` now compute ids from the render-scope `scene` (not the updater's `s`). Behaviour-identical for the single-call-per-gesture wiring today; if a future caller fires two scene-mutating calls in one synchronous handler, `splitWall` could leave a phantom `{type:'object'}` selection pointing at an un-added id. Harden the guard if that wiring ever appears.
- **SimCanvas is still >800 lines** (1136) — its own hook split is out of scope until a dedicated session (S5 only cleaned its exhaustive-deps suppressions + 2 syntactic lint fixes).
- **(S4 done)** grab/grabbing cursor on draggable objects; door/window hover chips wired; canvas keys overlay-gated.
- **(S5 done)** App.tsx decomposed to 789 lines (< 800 cap) into tested hooks; ESLint (`npm run lint`) added + all exhaustive-deps suppressions re-derived (12 → 5 documented survivors); dead `setHistVersion` + both `setTimeout(fn,0)` selection hacks removed; the 3 history bugs (leak / impure updater / 400 ms→gesture coalescing) fixed.
