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
     touched (≥80%, or state the exact reason). **Test count is a ratchet — it must not decrease** (was
     **95** on 2026-07-19) and no test may be newly skipped/only'd/weakened; state before/after counts.
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
- `npm test` — vitest, **95 tests**, all green as of 2026-07-19 (85 engine + 10 in `db.test.ts`)
- `npm run build` — tsc --noEmit + vite build (~357 kB / 115 kB gzip). Run all three before claiming done.

## Architecture map

**Engine (`src/engine/`, pure TS, fully unit-tested):**
- `raytrace.ts` — ray casting, `directPath` (3D LOS with graze attenuation), `collectSurfaces`, `wallKeptSpans` (door gaps)
- `stereo.ts` — `computeAudio`/`computePair`: pair metrics (ITD/ILD/angle/lock), `apexBlocked`, relocated `sweet` spot
- `pairspot.ts` — `bestPairSpot` (per-pair wall-aware seat search), `bestReflectionDb` (image-source first-order bounces, **both legs occlusion-checked**)
- `bestspot.ts` — `bestListeningSpot` field (green ★ + glow): occlusion + reflections for ALL speakers, capability-weighted (mini 0.65), TV-mode gates score on `tvViewQuality`
- `optimize.ts` — `suggestPlacement` with `target: listener | room | house`; TV-behind-wall falls back to music with a note
- `rooms.ts` — `regionOf` flood-fill regions (`doorsBlock` option: true for sound zones, false for walkable floor)
- `arrange.ts` — furniture placement brain (door corridors, daylight, feng shui, first-reflection absorbers, `ZONE_AFFINITY`, walkable containment) + `suggestInventory` ("Decide for me")
- `detect.ts` — floorplan image → walls (Otsu → component filter → Hough → merge); pure core testable without DOM
- `joints.ts` — wall snapping (`snapToWalls`) + `integrateWall` (crossings split BOTH walls into chunks)
- `scene.ts` — presets, sanitize, `addRoomShell`, `loadStore` (legacy localStorage `phantom-lock:v2` reader — now only used as the migration source + IDB-unavailable fallback)
- `db.ts` — **IndexedDB persistence (Session 1)**: stores `layouts`/`underlays` (image Blobs)/`meta`; `bootstrapPersistence()` migrates the legacy localStorage blob on first run (keeps the old key as rollback), `saveLayout(layout, writeImage)` does per-record async writes, `loadFromIDB()` re-runs `sanitizeLayout`; hardened localStorage fallback when IDB is unavailable. In memory `Scene.underlay.src` stays a data URL so render/UI/export are unchanged.
- `types.ts` — `Selection` includes `{ type:'multi', objectIds, speakerIds }`; `ToolMode` includes `'room' | 'marquee' | 'lasso'`; `RoomLabel {id,name,at,w?,h?}` = zone

**UI:**
- `components/app/App.tsx` — default export `App` is now a thin **async-bootstrap wrapper** (hydrates persistence via `bootstrapPersistence`, shows a splash, then mounts `AppInner`); `AppInner` is the orchestrator: 4-step workflow (Build/Furnish/Sound/Analyze), per-layout infinite undo/redo (`historyRef`, 400 ms coalescing, ⌘Z/⇧⌘Z), toasts (undo instead of confirm), dialogs, `closeFloatingPanels()`. Autosave writes per-layout to IndexedDB (`persistMode`), diffs via `persistedRef`, only re-encodes the photo blob when it changed, and shows a LOUD "Export all" toast on any save failure (no more silent quota loss). "Export all" backup lives in the gallery header.
- `components/canvas/SimCanvas.tsx` — all pointer interaction: wall chains, marquee/lasso band select, ⌘-click toggle, group drag, speaker height auto-snap onto furniture (`surfaceHeightAt`), wall-hover door/window chips
- `components/canvas/render.ts` — pure canvas renderer; `THEMES` ('sound' dark glow / 'plan' light blueprint); `labelPill` is the single annotation primitive
- `components/gallery/LayoutGallery.tsx` — card gallery with live thumbnails (Roomba-style home)
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
- App-level keyboard shortcuts must gate on `overlayOpen` (dialogs/optimizer/arrange).

## NEXT UP: read-only 3D view — see docs/3d-view-plan.md

User approved Three.js (or any dep): **bundle size does NOT matter, "cool" matters;
efficiency only matters if the app gets slow.** It must be read-only and touch nothing else.

## Other known gaps (backlog)

- Drag-release doesn't split walls crossed mid-drag (only creation does, via `integrateWall`).
- Marquee/lasso not yet visually verified in a browser (typed + tested only) — check first run.
- README.md predates gallery/zones/detection/multi-select — needs a rewrite eventually.
- Hover cursors/halos on draggable canvas objects still default.
