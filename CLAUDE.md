# Phantom Lock — project context for Claude

Browser-based 2D acoustic room planner (React 19 + Vite + TS, **zero runtime deps besides React**).
Finds optimal HomePod placement via a real 2.5D ray-tracing engine. The user owns 4 HomePods,
lives in the bundled "Maple Court" apartment, has a rolling TV stand (couch spot ↔ bed spot).

## ⚠️ OPERATING PROTOCOL — the quality bar (READ FIRST, applies to EVERY session)

The owner's standing directive: **make this perfect. Never be lazy, never take shortcuts, use as
many agents as the work warrants, and spend as many tokens/seconds as it takes.** Token and time
budget are NOT constraints here — optimize for correctness and completeness, never for speed. This
is an **ultracode** project: default to multi-agent orchestration for anything non-trivial.

Every session MUST follow this protocol (it is non-negotiable):

1. **Read first.** `docs/master-plan.md` (your session + the roadmap), `docs/ultrareview.md`,
   `docs/database-plan.md`, and this file. Understand the code you're about to touch before touching it.
2. **Orchestrate, don't solo.** For any non-trivial task, run a multi-agent **Workflow**: fan out
   understanding/design/review across parallel agents and synthesize the best result. Scale the number
   of agents to the work — more when in doubt.
3. **Adversarially verify — ALWAYS.** Every serious finding, design choice, and risky change gets an
   independent skeptic agent that tries to REFUTE it against the real code. (In Session 1 this pattern
   caught real data-loss bugs that would otherwise have shipped. It is mandatory, not optional.)
4. **Implement fully — no shortcuts.** No stubs, no TODOs, no placeholder returns, no "left as an
   exercise," no silently narrowing scope, no faking completion. If a scope is genuinely too big for
   one session, finish a coherent slice properly and hand off the rest explicitly.
5. **Test EVERYTHING — twice.** (a) Automated: keep `npm test` green, and ADD tests for every new
   behavior (write the failing test first where practical); honor the 80% coverage bar. (b) Live: use
   the browser preview tools to actually exercise the change — click it, read the console, inspect the
   persisted/DOM state, screenshot the result. Never claim "works" without having run it for real.
6. **Double-check your own work.** After implementing, spawn a self-review agent (`code-reviewer`,
   `security-reviewer`, `silent-failure-hunter`, or a domain reviewer) to hunt for bugs, data loss,
   edge cases, and laziness in exactly what you just wrote. Fix everything real it finds, then re-verify.
7. **Verification gate before "done".** `npm test` (all green) + `npm run build` (`tsc --noEmit` + vite,
   both green) + a live browser check when the change is observable. If any is red, it is NOT done.
8. **Leave it clean.** If your testing altered the user's real data/state, reset it to clean. No leftover
   artifacts, no dead code, no `console.log`, no `any`/`@ts-ignore`. Respect the design system below.
9. **Report honestly.** State exactly what you did, what you verified, and what you did NOT do. If a test
   failed or a step was skipped, say so plainly — never paper over it.
10. **Hand off.** Update the `docs/master-plan.md` checklist + progress log, update this file / memory if
    architecture or preferences changed, and write the next session's kickoff prompt (which must re-state
    this protocol so the chain never degrades).

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
