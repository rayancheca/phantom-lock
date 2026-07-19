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
     (95 at S1 → 126 at S2 → 140 at S3 → 181/182 at S4 → **239** at S5, all 2026-07-19) and no test may be newly skipped/only'd/
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
- `npm test` — vitest, **239 tests**, all green as of 2026-07-19 (S5 added +57: `history.test.ts` 14, `keyboard.test.ts` 38, `store.test.ts` 5 — all pure-logic, failing-first). Ratchet: never let the count drop.
- `npm run lint` — **(S5)** flat ESLint (`eslint.config.js`): @eslint/js + typescript-eslint + eslint-plugin-react-hooks `recommended-latest`, scoped to `src`, ignoring `.claude`/`dist`/`coverage`. Clean (0 problems) as of 2026-07-19. exhaustive-deps is enforced; 5 documented survivor suppressions remain (SimCanvas:250/398 mount-once, Toast/Menu/LayoutGallery/ScenarioCompare mount-once) — see each file.
- `npm run build` — tsc --noEmit + vite build (**~378 kB / 122.6 kB gzip** after S5 — the +3.5 kB gz is the decomposition wiring, expected). Run all four (lint/test/build) before claiming done.

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
- `components/app/App.tsx` — **(S5) decomposed 1506 → 789 lines.** Default export `App` is the thin **async-bootstrap wrapper** (hydrates persistence via `bootstrapPersistence`, splash, then mounts `AppInner`); `AppInner` now owns only UI state (selection/mode/step/theme/dialogs/…) + the workflow (`applyStep`/`applyTool`/`closeFloatingPanels`), the scene-edit handlers, the optimizer, and the `runKeyCommand` dispatcher, then composes the extracted hooks + renders `<AppHeader>`/`<CanvasStage>`/`<Sidebar>`/`<AppDialogs>`. **Extracted hooks (`components/app/hooks/`):**
  - `useSceneHistory({store,setStore,setSelection})` — per-layout undo/redo. `setScene`/`undo`/`redo` are now **pure store updaters** (history bookkeeping moved OUT of the `setStore` callback → no StrictMode double-invoke reliance, fixes the dev double-pop). Coalescing is **gesture-scoped** (`beginGroup`/`endGroup` wired to `onDragging` drag boundaries + `opts.coalesce` from `e.repeat` for held keys) — NOT a 400 ms timer. `reap(liveIds, keepId)` drops deleted-layout undo buckets (the leak fix). Pure logic lives in `components/app/history.ts` (`historyPush`/`historyUndo`/`historyRedo`/`reapHistory`, unit-tested).
  - `useLayoutStore(store,setStore)` — `active`, `applyToLayout` (the `updateLayout(store,id,fn)` helper from `store.ts` that replaced the 6 duplicated `layouts.map` blocks), `setSettings`, `duplicateLayout`, `exportLayout`.
  - `useLayoutActions({...})` — layout CRUD orchestration (switch/add/rename/delete/import/`undoDelete`). `deleteLayout` calls `reap(…, keepId=deletedId)` so undo-after-undelete keeps the bucket.
  - `usePersistence({store,persistMode,showToast})` — autosave (per-layout IDB diff via `persistedRef`, photo re-encoded only when changed), pagehide/visibility flush, LOUD "Export all" toast on failure; returns `exportAll` (stays `useCallback([])` reading a `storeRef`).
  - `useSimulation(scene,settings,dragging)` — the `trace`/`audio`/`bestSpot` memo chain (identical deps; `DRAG_RAYS` lives here). **S6 moves this into a Web Worker.**
  - `useKeyboardShortcuts({state,run})` — mount-once (`[]`-deps) window `keydown` reading a `ctxRef` (killed the App keydown exhaustive-deps suppression); all branching is in the pure `components/app/keyboard.ts` `handleKeydown` (+ `nudgeSelection`/`rotateSelectedRect`, unit-tested).
  - `app-constants.ts` (`MODE_HINT`/`PLAN_STEPS`/`TOOL_OWNER`/`initialStep`) + `app-types.ts` (`Deleted`/`DialogState`).
- `components/canvas/SimCanvas.tsx` — all pointer/keyboard interaction: wall chains, marquee/lasso band select, ⌘-click toggle, group drag, speaker height auto-snap onto furniture (`surfaceHeightAt`), wall-hover door/window chips. **(S4)** takes an `overlayOpen` prop that gates the canvas R/Backspace keys; the wall-hover chip anchor is **identity-latched** (stays put on the same wall, switches to a neighbour, self-heals on delete/`onPointerLeave`); `chainWallsRef` is now `string[][]` (per-corner id groups); a `grab`/`grabbing` cursor; a matchMedia DPR-repaint effect; the view is frozen while a marquee/lasso band is dragged. Pure logic lives in `interaction.ts`.
- `components/canvas/interaction.ts` — **(S4)** pure, DOM-free, node-tested helpers extracted OUT of SimCanvas: `wallHoverAt`/`makeOpening` (door/window chip), `popChainSegment` (Backspace chain-undo), `selectionSets`/`resolveSelection`/`itemsInBand`/`selectionFromBand` (marquee/lasso + ⌘-click selection algebra), `watchDevicePixelRatio` (DPR-change listener, injectable `win`), `isDraggableAt`/`hoverCursor` (grab affordance), `canvasKeyAction` (R/Backspace/Space gating). 98.9% covered.
- `components/canvas/render.ts` — pure canvas renderer; `THEMES` ('sound' dark glow / 'plan' light blueprint); `labelPill` is the single annotation primitive
- `components/gallery/LayoutGallery.tsx` — card gallery with live thumbnails (Roomba-style home); thumbnails now use the shared `canvas/thumb.ts` `drawMiniPlan` (also used by compare) and draw every seat
- `components/panels/ListenerCard.tsx` — **seat manager** (Session 2): a `radiogroup` of listening spots (roving tabindex + arrow keys), switch/add/rename/remove, "Compare" entry. Shown in Sound + Analyze.
- `components/compare/ScenarioCompare.tsx` — **2-up scenario compare** (Session 2): two `(layout, seat)` scenarios side by side, each a read-only `MetricsPanel` (`hideSuggest`) + mini preview; verdict aggregation uses the best pair's own lock state. Reachable from the header + gallery + ListenerCard.
- `components/ui/` — Icon (no emoji anywhere!), Dialog (focus trap/restore), Toast (single-slot, hover-pause), Menu (full ARIA keyboard contract)
- `components/panels/` — sidebar cards; `MetricsPanel` is verdict-first with plain-English cause sentences

## Design system (do not regress)

Elevation over borders (surface-0..3 ladder in `styles/tokens.css`), sentence-case titles,
all-caps mono ONLY for tiny eyebrows + canvas pills, `--text/-2/-3` emphasis tiers (text-3 ≥4.5:1),
motion tokens `--dur-1/2/3`, destructive actions get undo toasts never confirms, icons via
`ui/Icon.tsx`. Canvas overlays adapt to theme via `--overlay-*` vars on `.stage`/`.stage-plan`.

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
