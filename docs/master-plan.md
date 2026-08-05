# Phantom Lock — Master Execution Plan

> A multi-session roadmap that turns [ultrareview.md](ultrareview.md) + [database-plan.md](database-plan.md)
> into shippable work. Designed for **one Opus 4.8 / ultracode session per numbered phase**, each
> focused enough to finish at high quality without degrading. Every session ends by producing the
> **handoff prompt** for the next one. Dated 2026-07-19.

## How to use this plan

1. Pick the next open session. Paste its **KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.* verbatim into a fresh Claude Code
   session (Opus 4.8, ultracode on).
2. That session does the work, runs the **verification gate** (`npm test` + `npm run build`, both
   green), then updates this file's checklist and **writes the handoff prompt** for the following
   session (what it actually did, what changed, any surprises, and the next kickoff).
3. Sessions 1→10 are ordered by priority + dependency. Notes call out where reordering is safe.

## ⚠️ Standing Operating Protocol — EVERY session MUST follow this

**The full, canonical, append-only protocol lives in `CLAUDE.md` ("OPERATING PROTOCOL"), which every
session auto-loads. Follow it verbatim — do not weaken it.** In brief: it is an **ultracode** project
(unlimited token/time budget, optimize for perfection); a task is **heavy** (→ multi-agent Workflow +
adversarial skeptic REQUIRED) if it changes a data model/migration, touches persistence, touches the
engine, deletes data, or edits >1 file; every session does git-per-session, reads first, orchestrates,
adversarially verifies, implements fully (no stubs/shortcuts/`.skip`), tests everything with PROOF
(coverage numbers + a non-decreasing test count + saved live screenshots in both themes + a migration
old-shape→upgrade test), backs up before persistence tests (Export-all, test on a duplicate not the real
layout), self-reviews the diff with an agent, meets a11y at creation, runs a proven gate (pasted `npm
test` + `npm run build` output), and hands off with a required **Evidence block** (agents+verdicts,
before/after test count, pasted gate output, screenshot paths, each Acceptance bullet → met/deferred).

### Repo-specific rules (in addition to the protocol)
- **Zero-runtime-deps by default** — React only, unless a session adds a dep the user approved
  (IndexedDB is hand-rolled; the 3D view may add `three`; `fake-indexeddb` is dev-only).
- **Respect the design system** — elevation-over-borders, sentence-case, `Icon.tsx` not emoji,
  undo-toasts not confirms, motion tokens (see CLAUDE.md "Design system (do not regress)").
- **Immutability; files < 800 lines; functions < 50 lines.** If you touch a file, don't make it worse.
- **No scope-creep** — each session has an explicit *out of scope*; log stray findings to the backlog.
- **Update CLAUDE.md + this file** when architecture or preferences change, and **write the next
  kickoff prompt** (which must re-state the protocol so the chain never degrades).

## Dependency graph
```
S1 persistence ──► S2 compare (needs a stable store) 
S1 ──► (unblocks) S6 perf (autosave off main thread)
S5 refactor ──► S6 perf, S7 a11y (both easier on decomposed App/hooks)
S3, S4 engine/canvas ── independent, can run any time after S1
S8 polish ── independent (do after S2 so onboarding covers compare)
S9 3D ── independent, additive, do late
S10 tests/E2E ── LAST (tests the refactored, feature-complete app)
```
Safe order if you want product wins first: **S1 → S2 → S8 → S3 → S4 → S5 → S6 → S7 → S9 → S10.**
Safe order if you want a clean foundation first: **S1 → S5 → S3 → S4 → S6 → S7 → S2 → S8 → S9 → S10.**

---

## ⛳ DECISION GATE before Session 1 — RESOLVED 2026-07-19
**User chose: cross-device sync.** So Session 1 builds the local IndexedDB store (option b) as the
**offline cache**, and **Session 11 (cloud backend + auth)** is now a scheduled session, not a
conditional. The app must stay usable offline — IndexedDB is the source of truth locally and the
sync layer reconciles to the cloud; do **not** make the app network-dependent.

---

## Session 1 — Persistence foundation: hardening + IndexedDB (the "database")
**Status:** ☑ DONE 2026-07-19 **Depends on:** decision gate **Unblocks:** S2, S6
> Shipped: `src/engine/db.ts` (3 IDB stores; images as Blobs; per-record async writes; non-destructive
> migration keeping `phantom-lock:v2` as a frozen rollback; hardened localStorage fallback), `App` split
> into an async-bootstrap wrapper + `AppInner`, loud "Export all" toast on any save failure, "Export all"
> button in the gallery header. Then ran an **adversarial data-loss review** and hardened everything it
> flagged: `setSettings`/`renameLayout` now bump `updatedAt` (were silently unpersisted!); per-record
> isolation in `loadFromIDB` (one bad blob can't wipe the store); non-throwing image encode; per-layout
> isolation + in-flight serialization in autosave; `pagehide`/visibility flush; `onblocked` guard; raised
> the stale 2.5 MB underlay cap to ~12 MB. 10 tests in `db.test.ts` (**95 total green**), build green.
> Live-verified: migration, reload survival, per-record writes, settings persistence, fresh-install, clean console.
> Deferred to backlog: a fuller multi-tab conflict policy + a periodic slim localStorage mirror.

**Goal.** Kill the critical silent-data-loss bug and move storage from the single `localStorage`
blob to IndexedDB (images as Blobs, per-record writes), with a migration that *cannot* lose existing
data. This is the user's explicit ask.

**In scope**
- "Export all" bundle button (all layouts, inline data-URLs) — the storage-agnostic safety net.
- Replace the empty `catch` at `App.tsx:291-300` with explicit `QuotaExceededError` handling →
  persistent toast + auto-invoke Export-all.
- New `src/engine/db.ts`: promisified IndexedDB wrapper + typed helpers, per the schema in
  [database-plan.md §5](database-plan.md). Three stores: `layouts`, `underlays` (Blobs), `meta`.
- One-time, idempotent migration from `phantom-lock:v2` (reuse existing `sanitize*`); **keep the old
  key** as rollback (rename to `…:preIDB-backup`).
- Rewire `App.tsx` init (collapse the double `loadStore()` at `:104` + `:112`) + autosave (write only
  changed layout + meta).
- Unit tests for `db.ts` with `fake-indexeddb` (dev-only devDependency is acceptable here).

**Out of scope.** Any UI redesign; the compare feature (S2); a cloud backend (gated separately).

**Acceptance.** Import a photo-heavy layout → reload → survives; the old key still present; Export-all
round-trips; `npm test` green (85 + new db tests); `npm run build` green. Update CLAUDE.md persistence
notes + this checklist.

**Watch-outs.** IDB is async — pick "loading state until hydrate" or "default then hydrate, only
replace if IDB returned data." Don't overwrite user data on a cold IDB. `Scene.underlay.src` must
still be a URL in memory so `render.ts`/`SimCanvas` need no changes.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/database-plan.md` and `docs/ultrareview.md` §3.1 in the Phantom Lock repo, then execute
> **Session 1** of `docs/master-plan.md`: harden localStorage against silent quota loss and migrate
> persistence to a hand-rolled IndexedDB store (option b), non-destructively. Build the "Export all"
> safety net first, add `src/engine/db.ts` per the proposed schema, migrate from `phantom-lock:v2`
> reusing the existing `sanitize*` chain (keep the old key as rollback), rewire `App.tsx` init +
> autosave to per-record async writes, and unit-test `db.ts` with `fake-indexeddb`. Keep zero runtime
> deps (fake-indexeddb is dev-only). Verify with `npm test` (don't regress 85) + `npm run build`.
> Then update CLAUDE.md + the Session 1 checklist and write the Session 2 handoff prompt.

---

## Session 2 — Multiple listening positions + scenario compare (THE core job)
**Status:** ☑ DONE 2026-07-19 **Depends on:** S1 **Unblocks:** the product's reason to exist
> **Design chosen:** kept `scene.listener` as a **derived mirror** of the active seat (added optional
> `listeners:{id,name,pos,z}[]` + `activeListenerId`) → every ~13 engine read-site + the 9 listener-only
> test fixtures work unchanged; only writes + new UI are new. Shipped: the migration in `sanitizeScene`
> (v1 `{x,y}` / v2 `{pos,z}` / new `listeners[]`; cap-safe, never drops the active seat), the `scene.ts`
> seat helpers (`updateActiveListener`/`setActiveListener`/`addListener`/`renameListener`/`removeListener`/
> `syncActiveListener`), all four write-sites rerouted (App `updateListener`/apply-proposal/arrow-nudge,
> SimCanvas drag), `ListenerCard` (radiogroup, roving tabindex + arrows), inactive-seat canvas rendering
> + click-to-activate (`hit.ts` `hitInactiveSeat`), shared `canvas/thumb.ts`, and the 2-up `ScenarioCompare`
> (header + gallery + card). **The tracer/verdict desync trap is structurally impossible** — both read the
> single mirror (proven live: `mirrorMatchesActive:true` after an IDB round-trip). 5-agent pre-code
> verification workflow + `code-reviewer` + `silent-failure-hunter` ran; every finding fixed (a11y seat
> names, roving radiogroup, seat-cap silent-loss, verdict aggregation, addRoomShell recenter-all). Tests
> **95→126** (+20 `listeners`, +6 `hit`); build green (~368 kB/118 kB gz). Live-verified in both themes +
> ≤960 px; screenshots in `docs/sessions/S2/`. Deferred to backlog: App.tsx decomposition (S5 owns it).

**Goal.** Let the rolling-TV, couch-vs-bed decision actually be made in-app: multiple named listening
positions per scene, a movable "TV scenario," and a **2-up compare** of verdicts.

**Design decision — RESOLVE FIRST (it sets the blast radius).** Recommended: **keep `scene.listener` as
a derived accessor for the active seat** (add `listeners: {id,name,pos,z}[]` + `activeListenerId`, and
compute `listener` = the active entry) so the ~20 engine/UI read-sites and the ~9 test fixtures keep
working unchanged, and only *writes* + the seat-switching UI are new. If you instead REMOVE
`scene.listener`, every site in the touch-point map below **plus** the test fixtures must be migrated —
larger and riskier. Pick one explicitly before coding; don't leave it implicit.

**In scope (may split into 2a data-model+migration / 2b compare-UI — see split rule in the protocol)**
- **Data model:** extend `Scene` with named listener positions + `activeListenerId`. Do the back-compat
  migration in `sanitizeScene` (src/engine/scene.ts) — it runs on EVERY load (IDB via `loadFromIDB`→
  `sanitizeLayout`→`sanitizeScene:482`, localStorage via `loadStore:500`, import via App.tsx:1002/1005).
  **No IndexedDB `DB_VERSION` bump / no `onupgradeneeded` change** — the whole scene is stored per layout
  (`db.ts` `saveLayout:181` `stripUnderlay:157`), so new scene fields persist automatically (lazy upgrade
  on next save; sanitize re-applies on every read). Also update the scene *constructors*
  (`apartmentScene:176`/`blankScene:185`/`rectRoomScene:221`/`addRoomShell:439`) — sanitize does NOT
  cover those.
- **Engine:** thread the chosen seat through `computeAudio`, `bestListeningSpot`, the optimizer, **AND
  `traceScene`/`traceSpeaker` (raytrace.ts:297-298)** — the tracer produces the arrivals that feed
  `computeAudio` and the Echogram, so if it keeps reading the old `scene.listener` while the verdict uses
  the new seat, the echogram/capture silently desyncs from the verdict. Also `arrange.ts:225,596` (which
  seat drives furniture arrangement) and `speakers.ts` (`matchTrims`/`dist3dTo`). Optionally a "works at
  BOTH seats" score.
- **UI:** switch active seat; a 2-up compare (two seats or two layouts) showing both `MetricsPanel`s side
  by side, reachable from the gallery/header; update `InspectorPanel` (listener editor), `SpeakersCard`,
  `Echogram` ("which seat?"), `LayoutGallery` thumbnail, and the canvas puck drag/hit-test
  (`SimCanvas`/`render.ts`/`hit.ts`).
- Tests: sanitize old-shape→new-shape upgrade (v2 single `listener` and v1 `{x,y}`), old exported-JSON
  round-trip, engine paths per chosen seat, and a live compare check.

**Complete `listener` touch-point map (verified 2026-07-19 — do not miss one).**
`scene.ts` 176/185/221 (constructors), 239 (`sceneBounds`), 327-332/420 (sanitize), 439 (`addRoomShell`);
`raytrace.ts` 297-298 (**tracer — the desync trap**); `stereo.ts` 91/208; `bestspot.ts` 129; `optimize.ts`
242/249; `arrange.ts` 225/596; `hit.ts` 10; `speakers.ts` 39/54 (called App.tsx:788, Inspector:189,
SpeakersCard:45); `render.ts` 673/806/850-853; `App.tsx` 491-492 (`updateListener`)/822/944/947/1299;
`SimCanvas.tsx` 69/609/611/758-759; `InspectorPanel.tsx` 17/130/157/164/171; `LayoutGallery.tsx` 62;
`types.ts` 65 (`ListenerState`)/100 (`Scene.listener`)/196 (`Selection 'listener'`). Do NOT conflate with
the optimizer's `PlaceTarget {kind:'listener'}` (optimize.ts:13, OptimizeDialog) — that's the "where to
optimize for" target, a different concept. Test fixtures set `listener` in bestspot/optimize/pairspot/
rooms/stereo/scene/arrange/db `.test.ts` — only migrate them if you REMOVE `scene.listener`.

**Out of scope.** 3D; performance worker (S6); visual polish beyond what compare needs.

**Acceptance (each maps to a named check).**
- `sanitizeScene` test: a v2 single-`listener` blob upgrades to `listeners[]`+`activeListenerId` with
  identical pos/z; a v1 `{x,y}` listener still upgrades. → unit test in `scene.test.ts`.
- Round-trip test: an old exported single-listener JSON still imports and loads. → unit test.
- Live: in one layout, define "couch" + "bed" seats, move the TV, open compare, both verdicts render and
  differ correctly; reload → both seats persist; console clean. → saved screenshots (both themes + ≤960 px).
- Engine test: `computeAudio`/`traceScene` use the SAME active seat (no echogram/verdict desync).
- Gate: `npm run test:coverage` (count ≥ current, ≥80% on touched files) + `npm run build` green.

**Watch-outs.** Biggest data-model change so far — the tracer-desync trap above is the easy bug to ship;
the migration must never drop/reshape an existing layout (adversarially verify it, S1-style); keep the
old single-listener export/import shape working for files already on disk.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` (§5 items 1-2, and §0/§6 for context), `docs/database-plan.md`, and
> `docs/master-plan.md` Session 2 in the Phantom Lock repo, plus `CLAUDE.md`. Goal: let the rolling-TV
> couch-vs-bed decision actually be made in-app.
>
> Scope: (1) Extend `Scene` to hold multiple **named listening positions** (e.g. `listeners: {id,name,
> pos,z}[]` + `activeListenerId`), migrating the single `Scene.listener`. Do the back-compat migration
> inside `sanitizeScene` (src/engine/scene.ts) — it runs on EVERY load including `loadFromIDB` (which
> calls `sanitizeLayout`→`sanitizeScene`), so old single-listener layouts and old exported JSON upgrade
> automatically; the data rides inside the scene JSON, so **no IndexedDB `DB_VERSION` bump is needed**
> (confirm this by tracing `db.ts` `loadFromIDB`/`saveLayout` — the whole scene is stored per layout).
> Keep exporting/importing the old single-listener shape working, and update the scene CONSTRUCTORS
> (apartmentScene/blankScene/rectRoomScene/addRoomShell) — sanitize does not cover those. FIRST resolve
> the design decision in the Session 2 block: recommended is keeping `scene.listener` as a derived
> active-seat accessor (minimal blast radius); state your choice explicitly. (2) Thread the chosen seat
> through `computeAudio`, `bestListeningSpot`, the optimizer, **and `traceScene`/`traceSpeaker`
> (raytrace.ts:297-298)** — the tracer feeds the echogram/capture, so if it keeps reading the old
> `scene.listener` while the verdict uses the new seat, they silently desync (this is THE bug to avoid);
> also `arrange.ts` and `speakers.ts`. Optionally add a "works at BOTH seats" score. (3) Build a 2-up
> **scenario compare** (two seats or two layouts) showing both `MetricsPanel`s side by side, reachable
> from the gallery/header. Use the COMPLETE touch-point map in the Session 2 block — do not miss a site.
> (Undo/redo needs no change: it snapshots the whole `Scene`, so listener edits are already captured.)
>
> Rigor (per the Standing Operating Protocol): use a multi-agent Workflow to re-verify every `listener`
> touch-point against the map before coding; adversarially verify the migration can't drop or corrupt
> existing layouts; add engine + migration tests (failing-tests-first) INCLUDING a seed-old-shape→
> upgrade-on-read test and an old-exported-JSON round-trip; then verify LIVE in the browser preview
> (create two seats, move the TV, open compare, confirm both verdicts render and differ, reload to confirm
> persistence, check the console) and SAVE screenshots to docs/sessions/S2/ (both themes + the ≤960 px
> stacked layout); back up first (Export-all → docs/sessions/S2/backup.json) and test on a duplicate, not
> the real layout; run a self-review agent over the
> diff; and run the full gate (`npm test` all green + `npm run build`). Reset any test data you created.
> Then update `CLAUDE.md`, `README.md`, the Session 2 checklist + progress log, and write the Session 3
> handoff (re-stating the protocol). This may legitimately split into 2a (data model + migration) and 2b
> (compare UI) — if so, finish 2a fully and hand off 2b explicitly; do not fake completion.

---

## Session 3 — Engine correctness + missing engine tests
**Status:** ☑ DONE 2026-07-19 **Depends on:** S1 (S2 optional) **Independent of** UI sessions
> Fixed all four confirmed bug areas, each adversarially re-verified against the real engine BEFORE coding
> (two verification workflows) and the implemented diff re-reviewed after (code-reviewer + adversarial
> skeptic + silent-failure-hunter). **(1) Whole-house stacking** (`optimize.ts` `placeAcrossHouse`): a
> per-room `Map<roomId,Vec2[]>` + a dominant separation reward (`sepR·SEP_WEIGHT`, `MIN_HOUSE_SEP`=1.0 m)
> — the skeptic's refinement over a hard reject — so same-room pods never stack AND none is ever dropped.
> **(2) Reflections through openings** (`pairspot.ts` `bestReflectionDb`): the bounce point must land on a
> solid kept span (surfaces filtered by `objectId===w.id`, no signature change) + a zero-length-wall guard.
> **(3) Lock 2D-vs-3D** (`stereo.ts` `computePair`): `eqError`/`isEquilateral` now pure 2D plan (matching the
> 2D apex/angle/base), dA/dB stay 3D for ITD/level, and `locked` gains a 3D arrival-symmetry gate
> (`pathDiff ≤ ITD_LOCK_TOLERANCE_M` 0.07 m) — the skeptic caught that a naive 2D-only fix false-locks
> unequal-height pairs. **(4) Silent geometry:** `regionOf` adaptive cell (`max(0.3, span/158)`, no >48 m
> truncation, bit-identical ≤47.4 m); `splitWallAt` clamps the cut so neither half is <2 cm; `findByLabel`
> now scans `scene.objects` too. Tests **126→140** (+14, all failing-first then green); coverage ≥80% on
> every touched file; build green (~369 kB/119 kB gz). Engine-only → no live-browser pass required (stated).
> The self-review (code-reviewer + adversarial skeptic + silent-failure-hunter) caught three real issues,
> all fixed in-session: the ITD gate wasn't fed into `quality` (a plan-equilateral mismatched-height pair
> showed a full meter while "not locked"); `bestspot.ts pairQualityAt` + `pairspot.ts triQ` still mixed 2D
> base with 3D legs (aligned to 2D to match `computePair`); and the reflection guard over-refused windows +
> closed doors (narrowed to genuine OPEN-door holes only). Backlog: proper rect-mirroring of window/closed-
> door reflection material (approximated with wall absorption for now).

**Goal.** Fix the confirmed acoustic bugs and pin them with tests, so placement advice is trustworthy.

**In scope**
- **Whole-house speaker stacking** (`optimize.ts` `placeAcrossHouse`): reject candidates within a
  min-separation of any already-placed proposal.
- **Reflections through door/window openings** (`pairspot.ts` `bestReflectionDb`): require the bounce
  point `u` to land on a `wallKeptSpans` kept span; add the zero-length-wall guard.
- **Equilateral/lock 2D-vs-3D consistency** (`stereo.ts`): pick one metric space; fix the apex.
- **Silent geometry degradations:** `regionOf` 48 m clamp (adaptive CELL), `splitWallAt` degenerate
  guard, `findByLabel` scanning `scene.objects` too.
- **Tests:** `target:'room'`/`target:'house'` optimizer, a reflection-only scene (assert
  `viaReflection`), `tvViewQuality`/TV-behind-wall fallback, `doorsBlock:true` vs `false`, and a
  direct `bestReflectionDb` geometry test.

**Out of scope.** UI; performance.

**Acceptance.** New tests fail before the fix, pass after; no regression in the 85; build green.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.2, §3.5 (reflection cache is S6), §3.7, §3.9 in the Phantom Lock repo
> and execute Session 3 of `docs/master-plan.md`: fix the whole-house speaker-stacking bug, stop
> first-order reflections bouncing through door/window openings, make the equilateral/lock metric
> internally consistent, and fix the silent geometry degradations (regionOf clamp, splitWallAt,
> findByLabel). Add the missing engine tests (room/house optimizer targets, reflection-only path,
> tvViewQuality fallback, doorsBlock, direct bestReflectionDb geometry) — each should fail before the
> fix. Verify `npm test` + `npm run build`, update the checklist, write the Session 4 handoff.

---

## Session 4 — Canvas interaction fixes + dead features
**Status:** ☑ DONE 2026-07-19 **Depends on:** S1 **Independent**
> All six items shipped, each verified + adversarially refuted against the real code BEFORE coding (a
> 13-agent verify→refute Workflow) and the implemented diff re-reviewed AFTER by three independent agents
> (code-reviewer + silent-failure-hunter + an adversarial gesture-break skeptic). Pure, DOM-free logic was
> extracted into **`src/components/canvas/interaction.ts`** (`wallHoverAt`/`makeOpening`/`popChainSegment`/
> `selectionSets`/`resolveSelection`/`itemsInBand`/`selectionFromBand`/`watchDevicePixelRatio`/`isDraggableAt`/
> `hoverCursor`/`canvasKeyAction`) — unit-tested at 98.9% (tests **140→181**, +41; ratchet held). **(1)** The
> dead +Door/+Window chips are WIRED (select-mode hovers now reach `applyMove`); the chip anchor **latches on
> wall identity** (skeptic caught that a naive screen-radius hold left screen-vertical walls' chips unreachable
> AND captured neighbouring walls) + a wall-still-exists self-heal + `onPointerLeave`. **(2)** Backspace
> chain-undo now stores **per-corner id GROUPS** (`chainWallsRef: string[][]`) so a crossing segment's whole
> group is removed (was 1 id); `snapTargets` flattens; an empty group is pushed for too-close corners; via the
> pure `popChainSegment`. **(3)** Marquee/lasso: empty-click **deselect parity**, clear-band-on-pinch, freeze
> the view during a band drag (wheel/gesture/R + compass/fitView guards), and `cancelDraw` now cancels band
> drags (skeptic caught a tool-switch-mid-band freeze leak). **(4)** A `matchMedia((resolution))` listener
> re-rasterizes on a **DPR change** (leak-safe re-arm + legacy-MQL no-op). **(5)** A **grab/grabbing** cursor
> via `isDraggableAt`/`hoverCursor`, reset at every teardown site. **(6)** Canvas **R/Backspace gated on
> `overlayOpen`** via `canvasKeyAction`; `overlayOpen` is now ONE shared App definition that also includes the
> full-screen **gallery** + the **wallProposal** confirmation (both skeptic-caught key leaks past the
> still-mounted canvas). Gate: `npm test` **181 green**, `npm run build` green (~371 kB / 119 kB gz), `tsc`
> clean. **Live:** Fix 6 proven end-to-end in the browser (compass N→R 15°→gallery-open R **still 15°
> (gated)**→close R 30°), console clean; the rAF-throttled hover/drag/marquee interactions (Fix 1/3/5) could
> not be *driven* live because the Browser-pane tab is `document.hidden` (rAF paused) — covered instead by the
> 181 unit tests + the 3-agent code-trace (evidence: `docs/sessions/S4/live-verification.md`). Deferred to
> backlog: the `{type:'multi'}` selection has no listener slot (a listener base is dropped from an additive
> marquee — pre-existing, unchanged); SimCanvas is still >800 lines (S5 owns the hook decomposition).

**Goal.** Repair the interaction rough edges and resolve the dead/advertised features.

**In scope**
- **+Door/+Window hover chips:** either wire them (let select-mode hover reach `applyMove` in
  `SimCanvas.tsx:864`) or delete the orphaned chips + `insertOpening`. Decide and finish it.
- **Backspace chain-undo** desync when segments split walls (track ids per-segment).
- **Marquee/lasso:** verify in a browser (still unverified per CLAUDE.md); empty-click deselect
  parity; clear the band on pinch start; screen-vs-world band robustness.
- **DPR change** on monitor switch (matchMedia resolution listener).
- **Grabbable affordances:** hover cursor/halo on draggable objects.
- **Overlay-gate** the canvas `R`/Backspace key handlers (match app-level `overlayOpen` rule).

**Out of scope.** Splitting SimCanvas into hooks (that's S5); keyboard a11y model (S7).

**Acceptance.** Manual browser pass for each; build + tests green.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.3 in the Phantom Lock repo and execute Session 4 of
> `docs/master-plan.md`: resolve the dead +Door/+Window hover chips (wire or remove), fix the
> Backspace chain-undo desync, verify + fix marquee/lasso (empty-click deselect, clear band on pinch),
> handle DPR changes, add grab affordances to draggable objects, and gate the canvas R/Backspace keys
> on open overlays. Verify each in the browser preview, run `npm test` + `npm run build`, update the
> checklist, and write the Session 5 handoff.

---

## Session 5 — App.tsx decomposition + ESLint
**Status:** ☑ DONE 2026-07-19 **Depends on:** nothing hard **Unblocks:** cleaner S6/S7
> Behavior-identical refactor + the 3 named history fixes. **App.tsx 1506 → 789 lines** (< 800 cap). A pre-code
> understand→refute Workflow (11 agents: 5 concern maps × adversarial skeptic + a budget/ESLint agent) caught the
> big trap BEFORE coding — naive gesture-only coalescing would silently change undo granularity because many discrete
> edits (wall-chain corners, speaker placement, draw commits, rapid deletes) fire `onScene` with no `onDragging`
> bracket — so the coalescing model is drag-groups (`beginGroup`/`endGroup` on `onDragging`) **plus** `e.repeat` for
> held keys, with the granularity change documented. Extracted pure, **failing-test-first** modules `history.ts`
> (push/undo/redo/`reapHistory` reducers, 14 tests), `keyboard.ts` (`handleKeydown` + `nudgeSelection`/`rotateSelectedRect`,
> 38 tests), `store.ts` (`updateLayout` helper replacing the 6 duplicated `layouts.map` blocks, 5 tests); and hooks
> `useSceneHistory` (pure store updater — no StrictMode-double-invoke reliance, fixes the dev double-pop — + `reap`
> leak fix keeping `keepId`), `useLayoutStore`, `useLayoutActions`, `usePersistence`, `useSimulation`,
> `useKeyboardShortcuts` (mount-once `[]`-deps via `ctxRef`); JSX split into `AppHeader`/`CanvasStage`/`Sidebar`/`AppDialogs`;
> constants/types to siblings. Removed dead `setHistVersion` + both `setTimeout(fn,0)` selection hacks (ids computed
> synchronously). **ESLint:** flat `eslint.config.js` + `eslint-plugin-react-hooks` + `typescript-eslint`, `npm run
> lint`, all 12 exhaustive-deps suppressions re-derived (7 removed incl. the App keydown one via the ref-driven hook;
> 5 documented survivors), 4 pre-existing lint errors fixed. Self-review Workflow (code-reviewer + silent-failure-hunter
> + history-skeptic + wiring-skeptic over the diff): history-skeptic found NOTHING, wiring confirmed byte-identical;
> caught **one real regression** — q/e rotate had lost held-key undo coalescing (nudge had it) — **fixed** (+1 test).
> Tests **182 → 239**, coverage ≥96% on the pure modules (React glue deferred to S10, no jsdom/RTL yet), `npm run lint`
> clean, `npm run build` green (~378 kB / 122.6 kB gz; +3.5 kB gz decomposition wiring). Live-verified via keyboard +
> JS-dispatch + IndexedDB reads on a **disposable duplicate** of the user's real layout (backed up first, restored
> pristine): boot-clean, duplicate, tool-switch, nudge→⌘Z→⇧⌘Z (2.30→2.55→2.30→2.55), delete + undo-delete, cross-layout
> undo. Evidence in `docs/sessions/S5/` (`live-verification.md`, both-theme canvas PNGs, `backup.json`). Deferred to
> backlog: React hook/component tests (S10); a LOW theoretical `splitWall` phantom-selection if a future handler fires
> two scene-edits in one tick; SimCanvas's own hook split.

**Goal.** Break the god-component into tested hooks and get files under the 800-line cap, so future
work is safe.

**In scope**
- Extract `useSceneHistory` (fix the `historyRef` leak on delete + the impure-updater push +
  gesture-scoped coalescing instead of 400 ms wall-clock), `useKeyboardShortcuts` (pure, testable
  `handleKeydown`), `useLayoutStore` (CRUD + a single `updateLayout(store,id,fn)` helper replacing
  the 6 copies) , `useSimulation` (the trace/audio/bestSpot memo chain).
- Remove dead `setHistVersion`; remove the two `setTimeout(0)` selection hacks.
- Add a flat ESLint config + `eslint-plugin-react-hooks` + `npm run lint`; re-derive every
  `exhaustive-deps` suppression and document the survivors.
- Split `render.ts` (→ `render/rays.ts` / `objects.ts` / `overlays.ts`) if convenient; get App < 800.

**Out of scope.** Behavior changes; new features. This is a pure refactor — behavior must be identical.

**Acceptance.** App.tsx < 800 lines; `npm run lint` clean; tests + build green; manual smoke of undo/
redo, keyboard, layout CRUD unchanged.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.4 in the Phantom Lock repo and execute Session 5 of
> `docs/master-plan.md`: decompose the 1260-line App.tsx into `useSceneHistory` (fixing the historyRef
> leak, the impure-updater history push, and switching to gesture-scoped undo coalescing),
> `useKeyboardShortcuts` (extract a pure testable handler), `useLayoutStore` (with one `updateLayout`
> helper replacing the 6 duplicated reducer blocks), and `useSimulation`. Remove the dead
> `setHistVersion` and the two `setTimeout(0)` hacks. Add a flat ESLint config + react-hooks plugin +
> `npm run lint`, and re-derive every exhaustive-deps suppression. Behavior must be identical. Verify
> lint + `npm test` + `npm run build`, update CLAUDE.md, write the Session 6 handoff.

---

## Session 6 — Performance: Web Worker tracer + memoization
**Status:** ☐ **Depends on:** S1 (async store) + S5 (both DONE) **Now unblocked**
> **S5 handoff:** `useSimulation(scene, settings, dragging)` (`src/components/app/hooks/useSimulation.ts`) now owns the
> whole `trace`/`audio`/`bestSpot` memo chain and `DRAG_RAYS` (=360) — the single seam to move off the main thread. It
> returns `{trace, audio, bestSpot}` and App consumes them as props into `CanvasStage`/`Sidebar`; `stepDone` reads
> `audio.pairs`. Keep the exact memo dep arrays when threading through the worker (`trace` deps `[scene, effRays,
> settings.maxBounces]`; `audio` `[scene, trace, settings.tvAnchor]`; `bestSpot` `[scene, settings.showBestSpot,
> settings.tvAnchor, dragging]` with `coarse = dragging`). The panels are NOT yet `React.memo`'d (S6 scope). `npm run
> lint` now exists and enforces exhaustive-deps — keep it clean. Baseline: 239 tests, ~378 kB / 122.6 kB gz.

**Goal.** Get the expensive ray-tracing off the main thread so the editor never janks at high settings.

**In scope**
- Move `traceScene` + `bestListeningSpot` into a Web Worker (postMessage scene + settings, receive
  `TraceResult`/field). Keep the `DRAG_RAYS` synchronous fast-path for zero-latency drag.
- `React.memo` the panels; `useMemo` Echogram's `binArrivals`.
- Cache per-speaker reflection candidates per scene; skip reflections in the coarse/drag pass.
- Optionally: auto-scale ray/bounce budget by surface/speaker count.

**Out of scope.** Engine correctness (S3); new features.

**Acceptance.** No main-thread stall dragging at 1440 rays / 10 bounces / 4 speakers (verify with a
perf trace); tests + build green; results identical to the synchronous path.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.5 in the Phantom Lock repo and execute Session 6 of
> `docs/master-plan.md`: move `traceScene` and `bestListeningSpot` into a Web Worker (keeping the
> DRAG_RAYS fast-path for interactive drag), add `React.memo` to the sidebar panels, memoize
> Echogram's `binArrivals`, and cache per-speaker reflection candidates. Confirm output matches the
> synchronous path and that dragging at max settings no longer stalls the main thread (perf trace).
> Verify `npm test` + `npm run build`, update the checklist, write the Session 7 handoff.

---

## Session 7 — Accessibility: operable + AT-legible canvas
**Status:** ☑ **DONE 2026-07-22** (branch `claude/a11y-audit-phantom-lock-70516e`) **Depends on:** ideally S5 (keyboard hook)

**Goal.** Make the primary surface usable without a mouse and legible to screen readers; fix contrast.

**In scope**
- Canvas focusable (`tabIndex=0`, `role="application"` + instructions) + a keyboard model: arrow-nudge
  the selection, Tab/bracket to cycle objects, Enter/Space select/place, Delete. At minimum, a
  keyboard-reachable list of every object/listener (extend the SpeakersCard pattern).
- Off-screen `aria-live` **text mirror** of scene state (speakers/positions, lock/verdict, best-spot);
  announce verdict changes (MetricsPanel already computes the sentences).
- Fix `--text-3` contrast on surface-3 + add a contrast unit test; restore focus rings on inputs.
- `tablist`→`aria-current="step"`; focus-manage the "Detected layout" dialog (use `Dialog`);
  assertive error toasts; verify 24×24 target sizes; extend reduced-motion to the fader/canvas.

**Out of scope.** Redesign; the compare view's own a11y beyond parity.

**Acceptance.** Keyboard-only user can place + adjust a speaker and read the verdict; automated a11y
check clean on the chrome; contrast test passes; build + tests green.

**KICKOFF PROMPT (Session 7 — a11y audit, the NEXT session)** — *run under the Standing Operating Protocol at the top of this
file (also in `CLAUDE.md`, auto-loaded): git-per-session (a fresh worktree branch off `main` + baseline commit, commit again
after the gate; ⚠️ worktree-path trap — the worktree lives under `.claude/worktrees/<name>/` while a separate `main` checkout
sits at the repo root, so ALWAYS pass worktree-relative paths to Read/Edit/Write (confirm with `git rev-parse --show-toplevel`),
or edits silently land in the wrong checkout; land via `git -C <MAIN_REPO> merge --ff-only <branch>` then `git -C <MAIN_REPO>
push origin main`; commit messages end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`), read-first (map every site
before touching it), a multi-agent Workflow for this heavy task (parallel understand → design → an adversarial skeptic that
tries to REFUTE each risky change against the real code — this caught real bugs in UX-2/UX-3/UX-4, incl. a HIGH ignite-on-switch
bug, a headline that dropped a genuine lock, and a `.term` CSS cascade regression), full implementation (no stubs/TODOs/`.skip`/
`.only`/scope-narrowing), test everything with PROOF (ratchet — **340 tests** must not drop; add failing-first tests for any new
pure logic incl. the contrast checker; paste the literal `npm run lint` (0 problems) + `npm test` (with count) + `npm run build`
(with gz size) tails), a self-review agent pass (`code-reviewer` + `silent-failure-hunter` + `a11y-architect` over the actual
diff — fix everything real, then re-verify), and a handoff with an Evidence block (agents + verdicts · before/after test count ·
pasted gate output · saved screenshot paths · each Acceptance bullet → met/deferred). **Data safety (CRITICAL):** the preview's
IndexedDB on the owner's usual origin (`localhost:5173`) holds their REAL layout ("My apartment", renamed from a real address at
their request in S16) and they actively design their own room there — **NEVER delete the user's layouts** (that habit applied only
to disposable fixtures YOU create). Back it up to `docs/sessions/S7/backup.json` (gitignored, FULL fidelity) BEFORE any write
test; prefer testing on a **separate fresh headless-Chrome profile** (a fresh origin → the app's own IDB, never theirs) or on a
disposable "Maple Court" duplicate; confirm the real layout's `updatedAt` is byte-identical afterward (before AND after a
reload/autosave settle); keep any real address out of committable files (`git ls-files -oc --exclude-standard | xargs grep -l
"Bay"` must be empty). Live-drive rAF-gated behavior (drag, the LOCK, canvas hover) via a zero-dep Node-25 CDP client over
`--headless=old` + `--window-size` (NOT `Emulation.setDeviceMetricsOverride`; use `Page.captureScreenshot format:'jpeg'` — a huge
PNG silently overruns the built-in WebSocket), since the in-app preview tab runs `document.hidden` with rAF paused. Land on `main`
via `--ff-only` and `git push` after the gate. Token/time budget is unlimited — optimize for perfection, not speed. Confirm the
next kickoff you write re-states this protocol.*
> **The UX overhaul (UX-1…UX-4 / Sessions 13–16) is DONE** and built a11y in AT CREATION across every new surface — the S13
> `--text-3` widening + ≥13px prose floor + focus rings; the S14 `SegmentSwitch`/`SelectionActions` roving-tabindex + touch
> targets + reduced-motion; the S15 `VerdictHero` reduced-motion `lock-fade` + `forced-colors` fallback + `scroll-padding-top`;
> the S16 `<Term>` popover (`aria-expanded`/`-controls`/`-describedby`, Escape, outside-pointerdown, `:where(.term)`), the
> collapsible on-canvas `Legend` (disclosure ARIA + keydown/keyup swallow so it can't leak canvas keys), the `GlossaryCard`
> `<details>`, the `FirstRunExplainer` (reuses `Dialog`'s focus-trap), and reduced-motion blocks on `.term-pop`/`.legend-body`/
> `.glossary`. **Session 7 is now the SYSTEMATIC VALIDATION audit over the redesigned surface** (§8-reconciliation: prefer S7
> AFTER the overhaul so it audits the shipped UI). Read `docs/ultrareview.md` §3.6 and the CLAUDE.md design-system + UX-4 lessons
> first, then execute **Session 7:** (1) make the **canvas itself** keyboard-operable + AT-legible — it is still mouse/keyboard-
> dispatch only with no focusable canvas element (`tabIndex=0` + `role="application"` + instructions; a keyboard model for
> select/nudge/cycle/place/delete; at minimum a keyboard-reachable list of every object/seat extending the SpeakersCard/ListenerCard
> pattern); (2) add the **off-screen `aria-live` text mirror** of scene state + verdict (the `VerdictHero` is deliberately NOT a
> live region because it recomputes every drag frame — add a SEPARATE debounced polite mirror that announces the settled verdict/
> lock/best-spot, reusing `deriveVerdict`'s sentences); (3) **automated contrast** — add a contrast unit test over the token pairs
> and fix any `--text-3`-on-`--surface-3` (or `--overlay-text` on glass) failures; (4) audit the whole redesigned surface with an
> automated a11y pass (axe-core or equivalent — the repo has none yet; add it as a dev dep + a test) across DESIGN/TUNE, both
> canvas themes (both dark since S13), the gallery/compare/optimizer/arrange dialogs, and the ≤960px touch layout; validate the
> S13–S16 a11y-at-creation claims and fix every real gap. Presentation/a11y-layer only — do NOT touch `src/engine` math,
> persistence, or the scene data model. Acceptance: a keyboard-only user can place + adjust a speaker and READ the verdict without
> a mouse; an automated a11y check is clean on the chrome + the new canvas affordances; the contrast test passes; reduced-motion
> is honored everywhere; gate green (lint 0 · ≥340 tests · build). Then self-review the diff, update `CLAUDE.md` + this checklist,
> and write the **Session 8-remainder** (security hardening: CSP + headers + import size cap; README rewrite) handoff.

---

## Session 8 — Design polish + onboarding + hardening + README
**Status:** ☐ **SUPERSEDED in part** — its **design + onboarding items are absorbed/expanded by the UI/UX overhaul
(Sessions 13–16, `docs/ui-ux-overhaul-plan.md`)**. What remains of S8 is **security hardening (CSP + headers + import
size cap) + the README rewrite** (do the README AFTER the overhaul lands so screenshots match). **Depends on:** the
overhaul (for README) **Independent otherwise**.

**Goal.** Make it feel like one finished premium instrument, and teach a first-timer. *(The look-and-feel/onboarding
half now lives in the overhaul; keep only hardening + README here.)*

**In scope**
- **Split-theme fix:** light chrome ladder keyed off the plan/sound switch (or keep canvas dark in
  plan mode). **Typography:** self-host one distinctive UI face (`@font-face`, zero-dep) + widen the
  top of the scale; lift 10-11 px info text out of the dimmest tier.
- **Onboarding:** on-canvas legend (★ best-spot, sweet-spot ring, triangle, ray colors); a first-run
  "what am I looking at" pass; define phantom center / lock / ITD inline at first encounter; a
  workflow-fader legend.
- **Product fixes:** seed "Suggest placement" from the user's real inventory (stop the 4→2 trap);
  consistent undo toasts for Apply-arrangement / Apply-placement; reconcile the two TV/Music toggles;
  editorial empty state.
- **Security hardening:** CSP + security headers (`index.html`/host config); cap import `file.size` +
  slice sanitized arrays; fix the in-place `layout.id` mutation.
- **Rewrite README** to match the shipped app (4-step workflow, gallery, zones, detection,
  multi-select, view rotation, house/room targeting, compare).

**Out of scope.** New engine features; the 3D view.

**Acceptance.** Both themes feel intentional; a first-timer can tell what to do and what the verdict
means; README matches reality; build + tests green.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.8, §5 (confusions), §3.11 in the Phantom Lock repo and execute
> Session 8 of `docs/master-plan.md`: fix the split dark-chrome/light-canvas theme, upgrade typography
> (self-host a UI font, widen the scale, lift dim micro-text), add onboarding (canvas legend, first-run
> explainer, inline jargon definitions, fader legend), seed the optimizer from real inventory, make
> Apply-arrangement/placement undoable with toasts, reconcile the duplicate TV/Music toggles, add CSP +
> security headers and an import size cap, and rewrite the README to match the shipped app. Verify
> `npm test` + `npm run build`, update the checklist, write the Session 9 handoff.

---

## Session 9 — The read-only 3D view (the showpiece)
**Status:** ☐ **Depends on:** nothing (additive) **Do late**

**Goal.** Build the read-only Three.js 3D view per `docs/3d-view-plan.md` — orbit/zoom/admire, zero
effect on the 2D editor/engine/persistence.

**In scope.** Everything in `docs/3d-view-plan.md`: `npm i three @types/three`, a lazy
`src/components/three/ThreeView.tsx`, a toolstrip "3D" toggle, scene construction (floor/walls with
door gaps/windows/furniture/speakers with lights/listener/rays/best-spot), OrbitControls, proper
dispose-on-unmount, render-only-while-visible, keyboard gating. Keep `npm run build` green (three is
the first real runtime dep — approved for this feature).

**Out of scope.** Editing in 3D (read-only, hard rule); any change to the 2D path.

**Acceptance.** "3D" button renders the current scene in 3D, orbit/zoom works, exiting returns
untouched, no GPU leaks, initial 2D bundle unchanged (lazy import), build green.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/3d-view-plan.md` and `docs/master-plan.md` Session 9 in the Phantom Lock repo and build
> the read-only Three.js 3D view exactly as the plan specifies: a lazy `ThreeView.tsx`, a toolstrip
> "3D" toggle, full scene construction with disposal + render-only-while-visible, OrbitControls, and
> keyboard gating — touching nothing in the 2D editor, engine, or persistence. `three` may be added
> as the first runtime dep. Verify the initial 2D bundle is unchanged (lazy) and `npm run build` is
> green. Update CLAUDE.md, the checklist, and write the Session 10 handoff.

---

## Session 10 — Test-coverage completion + E2E + README screenshots
**Status:** ☐ **Depends on:** everything (test the finished app) **Do last**

**Goal.** Close the UI test gap and produce the README screenshot walkthrough (per the user's
readme-standards rule).

**In scope.** Playwright golden-path E2E (build → furnish → place → optimize → analyze → undo/redo →
compare); React Testing Library component tests for the extracted hooks (S5) + MetricsPanel; a
coverage script + threshold; capture 6+ live workflow screenshots into `docs/screenshots/` and embed
in the README.

**Out of scope.** New features; refactors (log any into backlog).

**Acceptance.** Coverage meets the 80% bar; E2E green in CI-shape; README has a numbered live
walkthrough; build green.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.7 and `docs/master-plan.md` Session 10 in the Phantom Lock repo and
> execute the final testing phase: add Playwright golden-path E2E (build→furnish→place→optimize→
> analyze→undo→compare), component tests for the hooks extracted in Session 5 and MetricsPanel, a
> coverage script + 80% threshold, and capture 6+ live workflow screenshots into `docs/screenshots/`
> embedded in the README. Verify all green, update the checklist, and mark the roadmap complete.

---

## Session 11 — Cloud backend + auth + sync (cross-device) — SCHEDULED
**Status:** ☐ **Depends on:** S1 (IndexedDB as the offline cache) **Do after** the app is solid

**Goal.** Layouts follow the user across devices/browsers, with off-device backup, while the app
stays fully usable offline (IndexedDB remains the local source of truth; the cloud is a sync target).

**In scope**
- Pick the stack (Supabase Postgres + Supabase Storage, or Turso/libSQL + R2). Auth (magic-link or
  OAuth). A thin API or the provider SDK. **Floorplan photos go to object storage** (URLs in the
  row), not the DB.
- Sync engine: IndexedDB ⇄ cloud with a clear conflict policy (per-layout `updatedAt` last-write-
  wins to start; upgrade later if needed). Offline queue + reconnect flush.
- Auth UX (sign in/out, "your layouts are synced" state), network-failure handling, and a privacy
  note that home floorplan photos now leave the device (user already opted in).
- Secrets via env vars; CSP `connect-src` updated for the provider; never hardcode keys.

**Out of scope.** Real-time collaboration / multi-user editing (a later phase if ever wanted).

**Acceptance.** Sign in on two browsers → a layout created on one appears on the other; offline edits
sync on reconnect; signing out leaves the local IndexedDB copy intact; build + tests green.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/database-plan.md` (option e) and `docs/master-plan.md` Session 11 in the Phantom Lock
> repo and add cross-device sync on top of the Session 1 IndexedDB store: choose Supabase or Turso,
> add auth, sync layouts (photos to object storage, URLs in the row) with a last-write-wins per-layout
> conflict policy and an offline queue, keep the app fully usable offline with IndexedDB as the local
> source of truth, wire secrets via env + update CSP connect-src, and add the auth/sync UI. Verify
> `npm test` + `npm run build`, update CLAUDE.md + the checklist, and mark the roadmap complete.

---

## Session 12 — Auto-detect walls: accuracy overhaul (the floorplan→walls pipeline)
**Status:** ☐ **Depends on:** nothing hard (pure engine + the existing detect ghost step) **Independent, additive**
> **Surfaced 2026-07-19 by a first-time-user clickthrough** (the owner drove "Auto-detect walls" on a real
> uploaded apartment floorplan): it returned a spidery, overlapping, duplicated tangle — banner read
> *"Found 20 walls — 69.4 m"* — with double/triple parallel walls, bogus cross-plan diagonal beams over the
> dining/sofa area, and corners that overshoot and don't meet. It does **not** track the actual walls; a user's
> only move is "Discard." No threshold tweak fixes this — the failure is structural in `src/engine/detect.ts`
> (Otsu ink mask → `dropSmallComponents` → global `houghPeaks` → `segmentsOnLine` run-split → `mergeSegments`
> collinear merge → 45° `snapSegment`).

**Goal.** Make auto-detect produce a clean, orthogonal, de-duplicated wall set a user accepts as-is (or with one
or two corrections) — not a tangle they discard.

**Diagnosed root causes (read from detect.ts against the live failure).**
- **Global Hough on FILLED (thick) walls** (`houghPeaks`) finds many parallel/grazing lines per wall; the greedy
  NMS (`dt<=3`, `MERGE_RHO_PX=7`) is too weak, so redundant peaks survive → double/triple walls.
- **No skeletonization/thinning** before Hough — it should run on a 1-px centerline (or an edge map), not the
  filled stroke; the wall thickness itself manufactures the duplicate detections.
- **`segmentsOnLine` grazing artifacts:** a diagonal Hough line collects every ink pixel within `BAND_PX` and
  projects it onto the line, so a line grazing several thick walls/furniture stitches unrelated ink into one
  bogus diagonal segment (the cross-plan diagonals in the failure).
- **Furniture/appliance blobs survive `dropSmallComponents`** (kept purely by bbox span ≥ 12% of the max dim), so
  the dining table / sofa / fixtures get Hough'd into spurious segments — walls and furniture aren't distinguished.
- **No global regularization:** `snapSegment` snaps each segment's ANGLE but not its POSITION; there's no
  dominant-axis (Manhattan) clustering, no shared-grid position snap, no endpoint/junction snapping, and the
  output never runs through `integrateWall`/`snapToWalls`, so corners overshoot/gap and duplicate segments stack.

**In scope**
- Replace the detection core with a thinning/vectorization approach: morphological skeleton (or distance-transform
  ridge) of the ink mask, then a probabilistic-Hough-style **segment** extractor (endpoints included) OR
  contour/centerline tracing — target **one line per wall**.
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

**Out of scope.** ML/model-based detection (keep it a zero-dep pure pipeline); anything outside the
detect → preview → commit path.

**Acceptance.** On a real apartment floorplan the output tracks the actual walls with no visible
duplicates/diagonal-beams; a synthetic fixture (thick double-line rectangle + a furniture blob) that currently
over-detects returns the correct wall count/geometry after the fix (**failing-test-first** in `detect.test.ts`);
`npm test` + `npm run build` green; live-verified with saved before/after screenshots (both themes). Real-floorplan
screenshots may now be **published** — the former "never publish it" clause was retired in S8 by explicit owner
decision (*"pulbish and change the rules. idc about privacy"*), and `docs/screenshots/` is committed. The street
address stays scrubbed to the "Maple Court" placeholder.

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` and `src/engine/detect.ts` in the Phantom Lock repo and execute Session 12 of
> `docs/master-plan.md`: overhaul the auto-detect-walls pipeline, which returns a spidery, duplicated,
> non-orthogonal tangle on real floorplans. Diagnose from the code + a live re-run, then replace the
> global-Hough-on-filled-walls core with a thinning/skeleton (or contour) + probabilistic-segment approach, add a
> segment ink-support test to kill grazing diagonals, separate walls from filled furniture blobs, and add global
> regularization (dominant-axis clustering, shared-grid position snap, endpoint/junction snap, then
> `integrateWall`). Add failing-first fixture tests (a thick double-line rectangle + a furniture blob that
> currently over-detects). Verify live on a real floorplan with saved before/after screenshots (kept local — the
> floorplan is the owner's real home), run `npm test` + `npm run build`, update the checklist, and write the next
> handoff.

---

## Sessions 13–16 — UI/UX & layout overhaul ("Anechoic Console") — see docs/ui-ux-overhaul-plan.md
**Status:** ☑ **ALL FOUR DONE** (S13 2026-07-19 · S14/S15/S16 2026-07-20) **Depends on:** S5 **Presentation-layer only**
> **Scheduled 2026-07-19** at the owner's request ("rethink the UI/UX and layout of everything"). A 6-agent design
> workflow (4 redesign directions + rubric judge + independent UX/IA-flow audit) + a live walkthrough produced the
> full plan in **`docs/ui-ux-overhaul-plan.md`** — read it first. Direction: **"Anechoic Console"** — one unified dark,
> acoustically-treated room where the glowing canvas is the only light source and **THE LOCK** (the phantom center
> locking at your seat) is the hero moment. Evolution of the existing dark studio-console DNA (the additive ray-glow
> is load-bearing on near-black — the dark canvas cannot be reversed). **No engine/persistence/data-model changes.**
> **Decisions CONFIRMED 2026-07-19** (plan §8): (a) aesthetic = **"Anechoic Console"** ✅; (b) IA = **DESIGN/TUNE
> modes** ✅ — DESIGN keeps Build+Furnish as sub-steps (dark cyanotype plan canvas), TUNE merges the old Sound+Analyze
> into one place-and-read loop (dark sound canvas) so the verdict is live while placing, and the mode owns the theme.
> Run **in order** (shared CSS/components).

**Session 13 = UX-1 — Design foundations (tokens · type · theme unification · motion).** Deepen the palette ladder +
add `--surface-4`; self-host Space Grotesk / Geist Sans / Geist Mono (woff2 subsets, preload ≤2 weights) + widen the
scale to 11→44px + floor prose ≥13px + hardcode `Geist Mono` in `render.ts` gated on `document.fonts.load()`;
color-role discipline + a `--signal` gradient; **recolor `THEMES.plan` cream→dark cyanotype + collapse the
`.stage-plan` light fork** (the #1 split-personality fix); delete `capBreathe`/`nodePulse`; rename the alpha tokens.
*Acceptance:* one coherent dark room in every step, no black↔white theme flash, fonts self-hosted with no canvas-number
reflow, perf budget held; gate green; both-theme screenshots of all 4 steps.
**Status:** ☑ DONE 2026-07-19 — all acceptance bullets met (Evidence in the progress log). Every item A–F landed:
deepened ladder + `--surface-4` + `--app-backdrop` vignette; self-hosted Space Grotesk/Geist Sans/Geist Mono (Latin
woff2 in `public/fonts/`, 2 preloaded, gated on `document.fonts.load()` via `font-ready.ts` — no canvas reflow);
scale→px (11→44) + prose floored ≥13px; `--signal` + color-role discipline + alpha-token rename (`-10`→`-12`);
`THEMES.plan` cream→dark cyanotype + `.stage-plan` light fork collapsed (the split-personality fix); `capBreathe`/
`nodePulse` deleted. Next: **UX-2 (Session 14)** — kickoff below.

**Session 14 = UX-2 — Shell & IA (modes · header scope · canvas hero framing · responsive/mobile).** DESIGN/TUNE (or
the confirmed IA); theme owned by mode; tools stop teleporting the step/theme; scope TV/Music + Suggest + Compare to
TUNE + de-dup the toggle; **fix the mobile toolbar** (bottom rail, un-float) + pin the switcher + on-selection touch
handles for rotate/delete/nudge + drop keyboard hints on touch.
*Acceptance:* a tool never changes mode/theme; header shows only context-appropriate actions; ≤960px toolbar never
overlaps the canvas + switcher always reachable + touch edit works; behavior otherwise identical; gate green.
**Status:** ☑ **DONE 2026-07-20** — all acceptance bullets met. The IA truth is a new pure module
`src/components/app/mode.ts` (`modeTheme`/`toolMode`/`subStepForTool`/`digitTool`/`initialMode`, 45 failing-first tests);
`theme` is now a DERIVED `const modeTheme(appMode)` (not state) — the SINGLE controller, so `applyStep`/`applyTool`-teleport/
the `t`-key three-way fight is gone. `applyTool` only flips the DESIGN sub-step (never the mode); digits are mode-scoped
(no cross-mode leak); `t`→mode-toggle. Header rescoped to brand + pinned switcher (`PL` monogram ≤560) + DESIGN/TUNE
`SegmentSwitch` (replaced the retired `WorkflowSteps` fader) + undo/redo; TV/Music + Suggest re-homed to `TuneToolsCard`
in TUNE (de-duped — MetricsPanel now only mirrors `tvAnchor`); Compare stays in ListenerCard + gallery. Mobile: `.toolstrip`
un-floats to a bottom scrollable 40px rail at ≤960px, mode-hint repositions to top (hidden on touch), `SelectionActions`
touch HUD (rotate/nudge/delete) on coarse pointers. **Evidence block:**
- *Agents (verdict):* 8-agent design Workflow (3 map → 2 design → synth → 2 adversarial refute; refute-correctness = BLUEPRINT
  SOUND, refute-ui = NEEDS FIXES → 4 must-fix folded in). Self-review over the diff: **code-reviewer** (1 HIGH: HUD escapes
  `overlayOpen` → FIXED), **silent-failure-hunter** (2 HIGH: HUD rotate no-op on walls + `overlayOpen` bypass → both FIXED),
  **a11y-architect** (HIGH empty mobile h1 + tab→radiogroup + 40px segments → FIXED). All real findings fixed + re-verified.
- *Tests:* **245 → 296** (+51; `mode.test.ts` +45 failing-first, `keyboard.test.ts` net +6). None skipped/only'd/deleted.
- *Gate (literal tails):* `npm run lint` → 0 problems (exit 0); `npm test` → **296 passed (20 files)**; `npm run build` →
  tsc clean + **JS 380.16 kB / 123.05 kB gz · CSS 35.46 kB / 6.96 kB gz**.
- *Live proof (headless-Chrome-over-CDP, zero-dep):* screenshots in `docs/sessions/S14/` (gitignored, scrubbed **Maple Court**
  only) — `01-tune-desktop` · `02-design-desktop` (cyanotype) · `03-design-furnish-desktop` · `04-tune-mobile-390` (bottom
  rail, no overlap) · `05-design-mobile-390` · `06-design-mobile-hud-object` (HUD, rotate ENABLED) · `07-tune-mobile-hud-listener`
  (rotate/delete DISABLED, nudge live) · `08-header-monogram-430`. Behavioral proof (6/6 PASS): dispatched `3`/`5`/`t`/`2`/`5`
  keydowns and read the rendered mode/theme/sub — a tool NEVER changed mode/theme; digits mode-scoped; `t` toggles mode.
  Media-query proof: `matchMedia('(pointer:coarse)')=true` ⟹ HUD `display:flex`, mode-hint `display:none`. Console clean.
- *Acceptance → status:* tool never changes mode/theme = **met** (6/6 behavioral PASS); header context-appropriate = **met**
  (02/04 shots + read_page); ≤960 rail never overlaps + switcher reachable = **met** (04/05 shots); touch rotate/delete/nudge
  = **met** (06/07 shots + HUD dispatches through `runKeyCommand`); behavior otherwise identical = **met** (parity verified
  by 3 reviewers + 296 green). *Caveat:* live checks ran ONE browser (headless Chrome + the in-app pane); drag/marquee-band
  stay rAF-limited in the `document.hidden` preview → covered by unit tests + agent trace (per the S4 lesson).
- *Data safety:* the owner's **real home layout** (a real street address) backed up to `docs/sessions/S14/backup.json`
  (gitignored) before any write; tested on a disposable Maple Court duplicate; real layout `updatedAt 1784480211854`
  **byte-identical** afterward; origin restored to the single real layout via the app's own delete. No real address in any
  committable file. Next: **UX-3 (Session 15) — ✅ DONE (see its block below)**. Then **UX-4 (Session 16)** — kickoff below.

**Session 15 = UX-3 — The readout & THE LOCK — ✅ DONE (2026-07-20).** Extracted the verdict into the pinned `--surface-4`
`VerdictHero` at `--text-hero` (names the active seat "At: Couch"), reused verbatim in `ScenarioCompare`; shipped THE LOCK
ignition (`--signal` letterform sweep + green bloom, reduced-motion → opacity cross-fade); spec-sheet metrics (Geist-Mono
tabular); Compare always present in TUNE + self-teaching; extracted the single-source pure `verdict.ts`.

*Acceptance → outcome (all MET):*
- **The verdict LEADS the TUNE column and never scrolls away** → MET. `VerdictHero` is the first TUNE child, `position:sticky;
  top:0;z-index:1` on `--surface-4`. Live-proven (`04-sticky-specsheet-desktop.jpg`): after scrolling, heroTop 61 ≈ sidebarTop
  53 (pinned) while Speakers/Seats/Audio scroll beneath it.
- **THE LOCK fires on the locked transition + degrades under reduced-motion** → MET. Genuine in-place lock (nudge YOU off apex
  then back, same seat) → `igniting:true, anim:lock-sweep` (`03-locked-sweep-desktop.jpg`); switching TO an already-locked seat
  → `igniting:false` (self-review-caught bug, fixed by keying the hero to the seat id); mount-of-locked → `igniting:false`.
  Reduced-motion → `anim:lock-fade` (opacity-only, no movement) (`06-reduced-motion-desktop.jpg`). Pure edge detector unit-tested
  (the `stepIgnition(initIgnition(true), true).token===0` mount-no-ignite assertion).
- **The same hero renders in `ScenarioCompare`** → MET. `05-compare-2up-desktop.jpg`: both columns render `VerdictHero
  variant="compare"` (Bed "No lock yet" vs Couch "Phantom center locked"); the divergent `.compare-verdict` + local `verdictOf`
  deleted.
- **Compare always reachable in TUNE + self-teaching** → MET. `ListenerCard` Compare button always shown, `disabled` on
  `!canCompare` with teach copy ("Add a second listening spot, or duplicate this layout, and Compare lights up"); enabled title
  is mode-neutral ("Compare two setups side by side").
- **Metrics read as a Geist-Mono spec sheet** → MET. `SpecRow`/`.spec-sheet` (ITD/level/angle/lock + TV), mono tabular, dotted-
  underline labels, tone fills on status rows + `--signal` on the Lock row.
- **Behavior otherwise identical** → MET (presentation-layer only; zero `src/engine`/persistence/data-model change).
- **Echogram/meters first-class data-viz** → MET (as-was; `.echo-tick` already Geist-Mono; no bar fills to recolor).

**Evidence block (S15):**
- *Agents spawned (all verdicts recorded):* **pre-code design Workflow** (6 agents) — 3 parallel Understand (data-flow · css+lock ·
  compare+spec-sheet), 2 diverse Design proposals (minimal-diff · pure-core), 1 adversarial Skeptic → produced the reconciled
  hybrid (Skeptic verdict "sound; take specific halves": RISK-1 gate the sweep on `.is-igniting` not the resting class = HIGH
  CONFIRMED_PROBLEM adopted; RISK-2/3/4/6 CONFIRMED_SAFE; RISK-5/7 low fixes adopted). **post-code self-review Workflow** (10
  agents) — 4 reviewers (code-reviewer · silent-failure-hunter · a11y-architect · domain-skeptic) each finding adversarially
  verified → **2 CONFIRMED_REAL** (HIGH: ignite-on-switch; MEDIUM: `best.locked` headline gap) + 4 MEDIUM/LOW a11y — **all fixed
  and re-verified**.
- *Test count:* **296 → 322** (+26 in `verdict.test.ts`, failing-first; none skipped/only'd/deleted).
- *Gate (literal tails):* `npm run lint` → clean (0 problems); `npm test` → **Tests 322 passed (21 files)**; `npm run build` →
  `index-*.js 382.23 kB / gzip 123.79 kB` + `index-*.css 37.99 kB / gzip 7.41 kB` (tsc --noEmit + vite, ✓ built).
- *Screenshots (gitignored `docs/sessions/S15/`):* `01-unlocked-desktop.jpg` · `02-locked-rest-desktop.jpg` (switch → no
  ignite) · `03-locked-sweep-desktop.jpg` (in-place ignite) · `04-sticky-specsheet-desktop.jpg` · `05-compare-2up-desktop.jpg` ·
  `06-reduced-motion-desktop.jpg`; plus `design-workflow-output.json` + `implementation.diff`. Live checks ran ONE browser
  (in-app pane for DOM/state proofs; a zero-dep Node-25 CDP client over classic headless for the desktop-layout + drag-driven
  ignition + reduced-motion visuals that the rAF-paused preview tab can't).
- *Data safety:* the owner's real home layout backed up to `docs/sessions/S15/backup.json` (gitignored, full 24-object fidelity)
  before any write; all tests ran on a disposable "Maple Court (S15 test)" layout; real layout `updatedAt 1784480211854`
  **byte-identical** before AND after (+ reload/autosave settle); the fixture removed and the origin restored to the single real
  layout; the disposable did not reappear. No real address in any committable file (`git ls-files -oc | grep "<real-address>"` empty).

**Session 16 = UX-4 — Learnability, empty states & shareable output (micro-UX).** `<Term>` tap-to-learn jargon layer +
glossary + on-canvas legend; first-run explainer + seed the demo with a placed pair (a live verdict on boot);
editorial empty states; "Pair these two" in Speakers; "Replace with N speakers" warning + uniform undo toasts on every
apply; rename Room-shell vs Zone/Area + let the optimizer target walled regions; separate "Import photo" vs "Import
JSON"; **"Export plan as image" + "Copy verdict"** shareable output.
*Acceptance:* no load-bearing meaning hidden in a hover tooltip; a first-timer is oriented + sees a live verdict; every
apply reversible with a toast; a plan image + verdict sentence is shareable; gate green; first-run walkthrough sequence.

**Reconciliation:** these absorb/expand Session 8's design + onboarding items — **S8 shrinks to security hardening
(CSP + headers + import size cap) + the README rewrite** (README waits until the overhaul lands so screenshots match).
Session 7 (a11y) overlaps UX-2/UX-3 (touch parity, focus, reduced-motion) — prefer running S7 **after** UX-2/UX-3 so it
audits the redesigned surface. Suggested order: **UX-1 → UX-2 → UX-3 → UX-4 → S7 → S8-remainder.**

**KICKOFF PROMPT (UX-1, the first)** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser, BOTH now-dark themes + the ≤960 px layout), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ui-ux-overhaul-plan.md` (the whole plan) and `docs/ultrareview.md` §3.8 in the Phantom Lock repo, confirm
> the two decisions in the plan §8 with the owner if not already confirmed, then execute **UX-1 (Session 13)**: the
> design-foundations pass — deepen the `tokens.css` surface ladder + add `--surface-4`; self-host Space Grotesk / Geist
> Sans / Geist Mono (woff2 subsets, preload ≤2 weights, zero runtime deps) and widen the type scale to 11→44px with a
> `--text-hero`, flooring prose at ≥13px; hardcode `Geist Mono` in `render.ts` gated on `document.fonts.load()` so canvas
> numerics don't reflow; impose color-role discipline (cyan/amber = L/R channel identity only, green/amber/red = status
> only) + add the `--signal` cyan→green gradient; **recolor `render.ts` `THEMES.plan` from cream to a dark cyanotype
> blueprint and collapse the `.stage`/`.stage-plan` light-overlay fork in `panels.css` into one dark-glass recipe**;
> delete the `capBreathe`/`nodePulse` perpetual loops; rename the mislabelled alpha tokens. Presentation-layer only — do
> NOT touch `src/engine`, persistence, or the scene data model. Verify `npm run lint` + `npm test` + `npm run build`,
> live-check all four steps in the unified dark theme + the ≤960 px layout with saved screenshots, self-review the diff,
> update `CLAUDE.md` + this checklist, and write the UX-2 handoff.

**KICKOFF PROMPT (UX-2 — Shell & IA, the NEXT session)** — *run under the Standing Operating Protocol at the top of this
file (also in `CLAUDE.md`, auto-loaded): git-per-session (branch + baseline commit, commit again after the gate),
read-first, a multi-agent Workflow for this heavy task (parallel understand → design → an adversarial skeptic that tries
to REFUTE each risky change against the real code), full implementation (no stubs/TODOs/`.skip`), test everything with
PROOF (ratchet — **245 tests** must not drop; add failing-first tests for any new pure logic; paste the literal
`npm run lint` + `npm test` + `npm run build` tails), a self-review agent pass (`code-reviewer` + `silent-failure-hunter`)
over the diff, and a handoff with an Evidence block. Land on `main` and `git push` after the gate. Token/time budget is
unlimited — optimize for perfection, not speed. Confirm the next kickoff you write re-states this protocol.*
> UX-1 (S13) is DONE — the app is now one unified dark room (dark cyanotype plan + dark sound), self-hosted fonts, the
> `--signal`/`--surface-4`/`--text-hero`/`--font-display` foundation tokens exist (some with no consumer yet, awaiting
> UX-3), motion is event-driven, alpha tokens renamed. **Read `docs/ui-ux-overhaul-plan.md` §3 (IA) + §6 (responsive) +
> §8 (confirmed DESIGN/TUNE decision) and `CLAUDE.md` first.** Execute **UX-2 (Session 14) — Shell & IA:** introduce the
> confirmed **DESIGN / TUNE** modes (DESIGN = Build+Furnish sub-steps on the dark cyanotype plan; TUNE = the old
> Sound+Analyze merged into one place-and-read loop on the dark sound canvas); **the mode owns the canvas theme — exactly
> ONE theme controller** (kills the current tool-teleports-and-flips-theme bug where `TOOL_OWNER` + the Toolbar toggle
> both drive it); tools never change the mode; digit shortcuts bind only to the current mode's tools; scope **TV/Music +
> Suggest placement + Compare into TUNE** and de-duplicate the TV/Music toggle; the global header holds only brand +
> layout switcher (always pinned; monogram the wordmark when tight) + undo/redo + the DESIGN/TUNE switch. **Fix the two
> named mobile breaks (§6):** at ≤960px un-float the toolbar into a bottom, full-width, horizontally-scrollable rail with
> 40px touch targets so it never covers the canvas (see the S13 mobile screenshot for the current overlap); pin the layout
> switcher; add on-selection touch handles for rotate/delete/nudge; drop the keyboard-referencing mode-hint on touch.
> Mind the S4 lesson: `overlayOpen` must cover every overlay over the still-mounted canvas. Presentation-layer only — do
> NOT touch `src/engine`, persistence, or the scene data model. Acceptance: a tool never changes the mode/theme; the
> header shows only context-appropriate actions; on ≤960px the toolbar never overlaps the canvas and the switcher is
> always reachable; touch rotate/delete/nudge work; behavior otherwise identical; gate green; before/after mobile
> screenshots (both dark themes; note the S13 correction that BOTH canvas themes are dark now). Then self-review the diff,
> update `CLAUDE.md` + this checklist, and write the UX-3 handoff.

**KICKOFF PROMPT (UX-4 — Learnability, empty states & shareable output, the NEXT session)** — *run under the Standing
Operating Protocol at the top of this file (also in `CLAUDE.md`, auto-loaded): git-per-session (fresh worktree branch off
`main` + baseline commit, commit again after the gate; ⚠️ worktree-path trap — the worktree lives under
`.claude/worktrees/<name>/` while a separate `main` checkout sits at the repo root, so always pass worktree-relative paths to
Read/Edit/Write, or edits silently land in the wrong checkout; land via `git -C <MAIN_REPO> merge --ff-only <branch>` then
`git -C <MAIN_REPO> push origin main`), read-first (map every site before touching it), a multi-agent Workflow for this heavy
task (parallel understand → design → an adversarial skeptic that tries to REFUTE each risky change against the real code —
this caught real bugs in UX-2 AND UX-3, incl. a HIGH ignite-on-switch bug and a headline that dropped a genuine lock), full
implementation (no stubs/TODOs/`.skip`/`.only`/scope-narrowing), test everything with PROOF (ratchet — **322 tests** must not
drop; add failing-first tests for any new pure logic; paste the literal `npm run lint` + `npm test` + `npm run build` tails),
a self-review agent pass (`code-reviewer` + `silent-failure-hunter` + an a11y reviewer over the actual diff — fix everything
real, then re-verify), and a handoff with an Evidence block (agents + verdicts · before/after test count · pasted gate output ·
saved screenshot paths · each Acceptance bullet → met/deferred). Data safety: the preview's IndexedDB on the owner's usual
origin holds their REAL home layout (a real street address) — back it up to `docs/sessions/S16/backup.json` (gitignored,
FULL fidelity) BEFORE any write test, test on a disposable **Maple Court** duplicate, confirm the real layout's `updatedAt` is
byte-identical afterward (before AND after a reload/autosave settle), remove the fixture and restore the origin to the single
real layout, and verify no real address is in any committable file (`git ls-files -oc --exclude-standard | xargs grep -l
"<address>"` must be empty). Live-drive rAF-gated behavior (drag, the LOCK, canvas hover) via a zero-dep Node-25 CDP client
over `--headless=old` + `--window-size` (NOT `Emulation.setDeviceMetricsOverride`; use `Page.captureScreenshot format:'jpeg'`
— a huge PNG silently overruns the built-in WebSocket), since the in-app preview tab runs `document.hidden` with rAF paused.
Land on `main` via `--ff-only` and `git push` after the gate. Token/time budget is unlimited — optimize for perfection, not
speed. Confirm the next kickoff you write re-states this protocol.*
> UX-3 (S15) is DONE — the verdict now LEADS the TUNE column as the pinned `--surface-4` `VerdictHero` (`--text-hero`, THE
> LOCK sweep + green bloom, reduced-motion `lock-fade`), reused verbatim in `ScenarioCompare`; the readout math is the single
> pure `components/panels/verdict.ts` (`deriveVerdict`/`representativePair`/`causeSentence` + the `initIgnition`/`stepIgnition`
> LOCK edge detector, 26 tests); metrics are a Geist-Mono `.spec-sheet`; Compare is always present in TUNE + self-teaching.
> **UX-4 completes the overhaul's learnability + shareability half. Read `docs/ui-ux-overhaul-plan.md` §5 (Learnability &
> onboarding) + §4 (Speakers "Pair these two", Dialogs/Toasts, Empty states) + §3 (Import homes, Room-shell vs Zone) + §10
> UX-4 + `CLAUDE.md` (esp. the S15 "readout & THE LOCK" design-system block + the new lessons) first.** Execute **UX-4 (Session
> 16) — Learnability, empty states & shareable output:** ship the **`<Term>` tap-to-learn jargon layer** (zero-dep dotted-
> underline term → accessible, keyboard-operable popover with a one-line plain-English definition for phantom center / lock /
> ITD / ILD / sweet spot / comb notch / 60° — this UPGRADES the S15 spec-sheet labels, which currently carry only a visible
> dotted underline + `title=` tooltip, the deliberate UX-3→UX-4 interim) + a short glossary reachable from TUNE; a collapsible
> **on-canvas legend** keyed to the current mode; **fix the boot** — a dismissible first-run explainer + **seed the demo
> apartment with a placed, locked stereo pair** so first run lands on a LIVE verdict (the whole point, visible before you touch
> anything); mode-aware **editorial empty states** (the empty TUNE offers "Nothing to analyze yet — suggest 4 HomePod spots?"
> wired to the existing Suggest); a **"Pair these two"** one-click in Speakers when exactly two same-model speakers are unpaired;
> the optimizer **"Replace with N speakers"** wording + a **uniform undo toast on every scene-mutating apply** (consistency
> with deletes); **rename the colliding "room" concepts** (walled Room shell vs targeting Zone/Area) and let the optimizer
> target real walled regions (`regionOf` already computes them); **separate "Import a floorplan photo" vs "Import a saved
> layout (JSON)"**; and a **shareable output** — "Export plan as image" + "Copy verdict". Presentation-layer + UI-only — do NOT
> touch `src/engine`, persistence, or the scene data model (the optimizer-target-a-walled-region change is UI wiring over the
> existing `regionOf`/`optimize.ts` API, not an engine edit). Acceptance: no load-bearing meaning hidden in a hover-only
> tooltip (every metric/affordance has a visible, keyboard/touch-reachable info); a first-timer is oriented and sees a live
> verdict on boot; every apply is reversible with a toast; a plan image + verdict sentence can be shared; Room-shell vs Zone no
> longer collide and "optimize the bedroom" works on a walled region; gate green; a first-run walkthrough screenshot sequence
> (scrubbed Maple Court, dark themes). Then self-review the diff, update `CLAUDE.md` + this checklist, and write the S7 (a11y
> audit) handoff (the overhaul's a11y was built in at creation across UX-1…UX-4; S7 remains the systematic audit + contrast
> tests + aria-live mirror over the redesigned surface).

## Backlog (noticed, not yet scheduled — add to a session as it fits)
- **Auto-detect walls accuracy** — now scheduled as **Session 12** (duplicated/diagonal tangle on real floorplans);
  see its block above. Surfaced by first-time-user clickthrough.
- RT60 / room-mode / per-frequency acoustic output (deeper analysis to match the "real physics" framing).
- Shareable/exportable result (PNG/PDF plan + verdict).
- Real touch controls (on-screen rotate/nudge/delete) — **DONE in S14/UX-2** (`SelectionActions` HUD on coarse pointers).
- Persisted undo history across reload (currently in-memory only).
- Multi-tab coordination policy (BroadcastChannel vs last-write-wins).
- Periodic slim (imageless) localStorage mirror so the rollback snapshot isn't frozen at first migration (from the S1 data-loss review); surface a toast when an oversized underlay is dropped by `sanitizeScene`.
- Off-ladder radii snap. (Alpha-token rename `ok-10`→`ok-12` + header perpetual-animation trim — **DONE in S13/UX-1**.)

## Progress log

### Session 38 — 2026-08-05 — finished the SimCanvas decomposition, and fixed the instrument (§18a + §18d)

**SimCanvas 1046 → 789**, under the project's own 800-line cap for the first time since S16. Test
count **1790 → 1893**. All three gates green. A CDP behaviour differential over 40 real-browser steps
returned **0 divergences** base-vs-head, with a base-vs-base control that also returned 0 and the same
three (symmetric) absolute-check failures.

**§18a — five cuts, not the two the spec named.** §18a's own arithmetic said its two cuts were
"enough"; measured, they land at 810. The extra three are pure-function lifts into the module that
already owns their helpers, chosen for cohesion rather than grabbed at the gate:

| module | lines | what |
|---|---|---|
| `canvas/pick.ts` | 384 | the 12-branch pointerdown ladder as `resolvePointerDown(input) -> PickAction`, plus `applyPickAction(act, effects)` |
| `canvas/chain.ts` | 195 | `chainVertex`/`chainStep`/`chainUndo`/`angleSnap`/`chainContext`, and `popChainSegment` moved from `interaction.ts` |
| `interaction.ts` | +92 | `nextWallHover`, `openingGhost`, the three `WALL_HOVER_*` radii |
| `canvas/useFinePointer.ts` | 39 | the coarse-pointer gate |

The point of `pick.ts` is not lines: jsdom dispatches a plain `Event` for pointer events, so the app's
most-used interaction path had NO committed test, and it is where the S36 grip-vs-pod hit-test
ORDERING lives — an invariant with a comment and no test until now. Moving the INTERPRETER out too was
also not for lines: `activateSeat` → `selection` → `startDrag` is load-bearing for undo GRANULARITY and
its cost is invisible in the final scene.

**§18d — the differential stall was never about the head build.** Root cause: the headless page is
never FOCUSED, Chrome throttles it, `visibilityState` flips to `hidden`, and rAF pauses — so every
rAF-throttled affordance silently stops updating while CDP keeps answering in 0.2 ms. `gripFound` had
been `false` in both legs of every run the harness ever completed, against builds whose grips were
perfect. One line (`Emulation.setFocusEmulationEnabled`) took the run from ~17 min (or a hang) to
**~2 min** and the grip sweep from 184 silent probes to **61 in 2.0 s**. Seven further instrument
defects were fixed on the way, three of them genuine forever-hangs that had simply never fired.

**Evidence block**

* **Agents:** 4 design lenses + 1 adjudicator (pre-work), 4 review lenses + 1 adjudicator (self-review).
  The adjudicator REFUTED a lens's central claim ("~5 s per `mouseMoved`") by re-measuring: 23.7 ms and
  108.0 ms unfocused across two runs, ~8 ms focused. It also disclosed running a build while a harness
  was live (TRAP 29) and told me to void that run, which I did.
* **Tests:** 1790 → **1893** (+103). pick.test.ts 56, chain.test.ts 39 (four moved in from
  `interaction.test.ts` with their subject), interaction.test.ts +12−4.
* **Negative controls:** **38/38** caught by the test written FOR them, in a copied tree at
  `/tmp/pl-nc38`. Three of the first 29 PASSED and all three were holes in the TESTS (fixtures
  arithmetically incapable of their own bug). Nine more were added AFTER self-review, one per
  confirmed finding — self-review had verified each by its own control first, which is the only
  reason they were found: my tests passed under nine plausible wrong implementations.
* **Coverage:** `pick.ts` 99.02 % · `chain.ts` 100 % · `interaction.ts` 88.34 → **99.10 %** ·
  `SimCanvas.tsx` 39.13 % (component; jsdom cannot reach the pointer path — that is what the
  differential is for).
* **Gates:** `npm test` 1893 passed (80 files) · `npm run lint` clean · `npm run build` green,
  **518.25 kB / 169.03 kB gz** JS + **54.90 kB / 10.24 kB gz** CSS (hash `index-j_hTKTEs.css`,
  byte-identical to S36/S37 — S38 touches no stylesheet) + 1.31 kB HTML.
* **Live:** `docs/sessions/S38/` — `differential.txt` (base-vs-head, 0 divergences),
  `control.txt` (base-vs-base, 0 divergences), `swapped.txt`, `negative-controls.txt`, `run.log`.
* **Acceptance:** SimCanvas < 800 ✅ (789) · every branch of the ladder tested ✅ · negative controls
  each caught by their own test ✅ (38/38) · differential base-vs-head identical ✅ · ratchet respected
  ✅ (1790 → 1893) · suppression count unchanged ✅ (6).
* **Honest limits:** ONE browser, headless Chrome only. No real screen reader has ever been driven on
  this project. Three absolute checks (`gripReturnedHome`, `marqueeSelected`, `multiDeleted`) fail
  SYMMETRICALLY in both legs including the base-vs-base control, so they cannot be a regression —
  filed as §18e. SimCanvas's 11-line margin is thin and is recorded as a warning.

### Session 37 — 2026-08-05 — component decomposition against the 800-line cap (`docs/ideas.md` §18)

No P1 was outstanding, so this session chose on merit. The project's own coding-style rule is
200–400 lines typical / **800 max**, and five files were over it; the two worst were the two the
committed suite barely covers, and both grow every session. **The App half is done. The SimCanvas
half is not, and the residual is named rather than left implicit** (`docs/ideas.md` §18a).

| file | before | after |
|---|---|---|
| `components/app/App.tsx` | 1292 | **85** (boot wrapper) |
| `components/app/AppInner.tsx` | — | **707** ✅ |
| `components/canvas/SimCanvas.tsx` | 1447 | **1042** ❌ still over |

Eleven new modules: `app/run-command.ts` + six App hooks, and `canvas/drag-apply.ts`,
`useCanvasCamera.ts`, `useCanvasPainter.ts`, `CanvasOverlays.tsx`.

**Why the extractions are worth more than the line count.** Both new test files cover logic that was
UNREACHABLE from `npm test` before. jsdom dispatches a plain `Event` for pointer events — `button`,
`pointerId` and `clientX` all arrive `undefined` (TRAP 21) — so SimCanvas's whole pointer path could
only ever be checked by driving real Chrome; and the command dispatcher lived inside a 1292-line
component reached through a mount-once ref. As pure functions they are ordinary unit-test material:
**+83 tests**, and twenty negative controls all caught.

**What had to be preserved exactly, and how.**

- `move-rc` re-bases `rot0` IN PLACE on the mutable `Drag` record when an external `q`/`e` lands
  mid-gesture. A pure function cannot mutate, so `applyDragToScene` RETURNS the re-based baseline and
  the rotation it wrote, and the call site writes both back. Dropping either reverts the user's
  rotate on the next pointermove — the S23 regression verbatim. The comparison stays `Object.is`,
  which disagrees with `===` on exactly one input (−0 vs 0), and there is now a test on it.
- `discardDetectionRef` and `closeFloatingPanels` moved as ONE unit. The callback is mount-once and
  created early while `useWallDetection` is created far below it, so the ref IS that forward
  reference. `closeFloatingPanels` keeps `useCallback([])` because `applyMode` and `useLayoutActions`
  depend on its identity.
- Only the `wheel` listener left SimCanvas's mount-once key effect. The window keydown/keyup/blur
  handler stays: splitting it per concern would register two window listeners, call `canvasKeyAction`
  twice per keystroke, and put "a Space keyup ALWAYS disarms" behind two paths.
- `import './app.css'` moved with the component and stays the LAST import. Rollup emits CSS in
  module-graph traversal order, so a stylesheet that moves ahead of the ones it overrides changes the
  cascade. **Verified, not argued: the emitted CSS asset hash is byte-identical across all eight
  commits** (`index-j_hTKTEs.css`).

**Deliberately NOT done, with the reason.** A `useAppMode` hook was designed and refused: `theme`
must stay a derived `const modeTheme(appMode)` — the structural S14 guarantee that killed the
three-way theme fight — and any hook storing it reopens the class while looking correct on the first
render. `applyMode`'s `sceneNow = scene` default reads the LIVE render closure and three callers rely
on it. Extracting `overlayOpen` was refused too: it is the one value where a SECOND computation is a
critical hazard, and its deliberate asymmetry (the tutorial's chapter MENU is in it, the step CARD is
not) is invisible to every test.

---

#### Evidence

*Agents.* One 7-agent design workflow (2 died on a session usage limit — the surviving conservative
plan was adjudicated by hand and its two load-bearing claims verified independently: `App` really is
imported from `components/app/App` by `main.tsx:4` and `shell.a11y.test.tsx:5`, and the suppression
count really was 6). One 4-lens self-review over the real diff. **Both completed lenses returned "no
shipping behaviour change" with MECHANICAL evidence** — one token-diffed every moved body against
`git show e379395:` with qualifier prefixes normalised away, the other computed a normalised
set-difference of semantic lines and got the empty set. Nine findings were real and all were fixed;
they were comment rot rather than behaviour, which is exactly what a mechanical move leaves behind.

*Tests.* 1706 → **1789** (+83). `run-command.test.ts` **47**, `drag-apply.test.ts` **36**. Twenty
negative controls in a copied tree, all twenty caught — but **two passed on the first attempt and
both were holes in the tests, not clean bills**: the move-multi fixture put every origin ON the 0.05
snap grid, where snapping the DELTA and snapping each PIECE are arithmetically identical (measured:
both move by exactly 0.35 at x = 4 / 0 / 2; off-grid they diverge to 0.37 / 0.39 / 0.38), and the
handle-idempotence test used an EDGE grip, which is idempotent either way because `'e'` pins the west
edge — only a ROTATE compounds.

*Completeness, checked mechanically rather than by eye.* All 27 single-line user-facing strings and
all 17 template messages from the pre-split `App.tsx` are present somewhere in the new files. All
**149** top-level declarations and all 16 user-facing strings from the pre-split `SimCanvas.tsx` have
exactly one home.

*Coverage of the touched files.* The two PURE extractions hit the bar and then some —
`run-command.ts` **100 %** stmts / 98.27 % branch / 100 % funcs, `drag-apply.ts` **98.08 %** / 94.02 %
/ 100 % — which is the point of the whole exercise, because both cover logic that was UNREACHABLE
from `npm test` before. The six extracted HOOKS did not: `useProposals` 41.75 %, `useCompare`
21.62 %, `useSceneEdits` 21.02 %, with `AppInner.tsx` at 87.35 % statements but **8.16 % functions**
and `SimCanvas.tsx` at 29.21 %. **No behaviour lost coverage** — those function bodies were
previously inside App.tsx and were reached only by the same `shell.a11y` smoke render that reaches
them now; the per-file statement percentage merely stopped being flattered by sitting in a file
whose render path executes. Closing it is exactly `docs/ideas.md` §6 (component/hook tests, P2), and
it is named here rather than waved at.

*Suppressions.* Unchanged at **6**. Two would have been added and both were removed instead: the
painter's draw effect was restructured to destructure its render state in the PARAMETER LIST so the
dep array is a list eslint can verify, and the `discardDetectionRef` registration lists the ref by
name (a `useRef` object is identity-fixed, so it is a literal no-op).

*The behaviour differential — BUILT, VALIDATED, and INCONCLUSIVE. Say so plainly.*
`docs/sessions/S37/diff-harness.mjs` serves two `dist` directories on two ports, drives both through
one fixed 36-step script in real headless Chrome, and diffs a signature after every step: an FNV hash
of the canvas bitmap (which, because `renderScene` is a pure function of `RenderState`, pins scene +
selection + trace + audio + bestSpot + preview + chain + proposal + snapGuide + handleTarget + theme
+ view in one id-independent number), the spec-sheet metrics, both aria-live regions, the DOM state,
and a canonicalised dump of the persisted IndexedDB store.

Its base-vs-base CONTROL did its job and is the most useful thing it produced: on a byte-identical
tree it returned **three divergences and two symmetric failures**, and all five were the instrument —
a `repaintOnFontLoad` FOUT repaint racing the capture (divergent at steps 0–1, agreeing from step 2,
which is the signature), IDB `getAll` returning the six seeded layouts in random key order, and a
sweep that selected a WALL when only rects and circles carry grips. A symmetric failure DIFFS EQUAL,
so without the absolute `checks` array the run would have looked clean.

**It never delivered a trustworthy base-vs-head verdict.** Four attempts: two were contaminated by
running `npm test`/`build`/coverage concurrently (the fixed sleeps raced and three steps that a
byte-identical tree had just passed began failing — now TRAP 29), and in the two clean attempts the
base leg completed in ~3.5 min while the head leg stalled past 10 with the node process at 0 % CPU.
That asymmetry is unexplained and is a defect in the harness, not evidence about the code. Rather
than report a number I do not trust, it is filed for S38 with the instrument committed and its
control documented.

*What stands in its place, and it is stronger for `drag-apply` than the differential would have been.*
The completeness lens ran a **20 000-tuple equivalence fuzz of `applyDragToScene`/`previewForDraw`
against the pre-S37 SimCanvas branches copied verbatim out of `e379395`**, and the two agree on the
scene, the guide, the `rot0` re-base and the `lastRot` write-back on every sample. Screenshots
(`docs/sessions/S37/shots/`, five: both canvas themes, ≤960 px, 390 px, the gallery) confirm the app
renders and behaves correctly end to end with **zero page errors** — the TUNE hero reads "Phantom
center locked", the plan theme draws its dimension pills, the mode switch flips the theme.

*Honest limits.* One browser (headless Chrome), no real screen reader. The differential exercises 36
scripted steps — it does not prove anything off that script, and it cannot see RENDER COUNT (a step
that renders twice as often produces identical pixels). Three of the four new canvas modules
(`useCanvasCamera`, `useCanvasPainter`, `CanvasOverlays`) ship with no unit tests of their own: the
first two are jsdom-hostile by nature (no canvas pixels, no layout) and are covered only by the
differential, which is a real gap and is why the differential exists.


### Session 36 — 2026-08-04 — Word-style resize/rotate grips (`docs/ideas.md` §16, owner-requested)

> *"i also want to be able to change the shape and size and rotation of objects with my mouse
> just like in microsoft word"* — owner, 2026-08-03.

Eight resize grips plus a rotate grip, in the object's own ROTATED frame, as a pure leaf plus a
`handle` Drag kind plus a `drawHandles` pass. Shift = aspect lock (resize) / 15° snap (rotate),
Alt = resize about centre. **The last P1 in the backlog is closed.**

**Evidence block**

*Agents spawned (role → verdict).* **Understanding workflow (7):** six read-only mappers
(drag-lifecycle · render · magnet · constraints · test-conventions · a11y-touch) → all reported;
one synthesizer → produced an integration map that caught the tree had moved under the mappers
and re-derived every stale line number. Its C1 (put the hit test at rung 709, not 756) was
adopted and then REVERSED on measurement — see below. **Self-review workflow (5 lenses):**
correctness → 2 findings · integration → 5 · regression → 4 · a11y → 6 · silent-failure →
reported. **17 raw findings adjudicated against HEAD: 8 real and fixed, 6 already fixed by the
round in flight when they were written, 3 refuted or reframed.**

*The two that mattered.* (1) A flat 11 px hit tolerance took **66.5 % of a Bookshelf's footprint,
54.6 % of a Window's, 54.1 % of a Plant's** away from the move gesture at the demo's own default
fit view — the app's most-used interaction, silently resizing. Fixed with a size gate plus an
interior core; **worst case 66.5 % → 16.6 %**, re-measured the same way. (2) The grip hit test
originally outranked the node tests, which made a HomePod parked at the head of the Bed
undraggable *in the shipped first-run demo* (measured 3.30 px from a grip). Reversed: pucks now
win both the paint order and the hit test.

*Test count.* **1640 → 1706** (+66). `canvas/__tests__/handles.test.ts` 56 ·
`handles-render.test.ts` 6 · `announce.test.ts` +6. Every fixture is deliberately OFF-AXIS at the
owner's −12.83°, because at rotation 0 the local basis degenerates to the world basis and a
transform that ignores rotation passes everything.

*Negative controls.* **16 run in a copied tree; 15 caught by the test written for them.** Three
tests had to be strengthened first — the tie-break fixture was arithmetically incapable of
expressing its own bug (12 px half-extent against an 11 px disc, so the grips never overlapped).
The one control that passed, clamp/snap ORDERING, is redundant-by-construction, and the property
that makes it so is now pinned instead (`MIN_SPAN_M = 0.07` turns it red).

*Bugs the tests caught rather than review.* The no-op check cannot be exact equality across a
cos/sin round trip (`h = 1.9999999999999998` for 2). Comparing the computed object against the
gesture BASELINE rather than the LIVE one stranded it at its mid-drag size when the pointer came
home (14.00 × 0.10 m instead of 4 × 2) — written, fixed, reintroduced by the field-merge
refactor, and caught again by the same test.

*Gate (literal tails).*

```
 Test Files  76 passed (76)
      Tests  1706 passed (1706)
   Duration  10.66s
```
```
> eslint .           (0 problems)
```
```
dist/index.html                   1.31 kB │ gzip:   0.62 kB
dist/assets/index-j_hTKTEs.css   54.90 kB │ gzip:  10.24 kB
dist/assets/index-DQRKdybK.js   511.83 kB │ gzip: 167.18 kB
✓ built in 600ms
```

*Live verification.* `docs/sessions/S36/live-s36.mjs`, real `Input.dispatchMouseEvent` drags in
headless Chrome on a fresh profile (fresh origin asserted, so the owner's workspace is never
read or written). ALL CHECKS PASSED: SE grip 2.00×1.55 → 2.90×2.55 · opposite corner drift
**0.0 mm** · rotation untouched by a resize · ONE undo restores · ROT grip −13.00° → 83.43°
(96.4° swept) with spans and centre bit-identical · body drag still moves 0.31 m and does not
resize · grips present in both canvas themes. Log: `docs/sessions/S36/live-run.txt`.
Screenshots: `docs/sessions/S36/shots/01-selected-grips.jpg`, `02-after-resize.jpg`,
`03-after-rotate.jpg`, `04-final.jpg`, `05-sound-theme-grips.jpg`.

*Harness bugs found and fixed before any number was trusted (TRAP 22 working as designed — it
aborted four times rather than reporting vacuous passes).* Wrong Inspector selector · reading
the panel TEXT when `NumField` renders `"2"` not `"2.00"` · probing before arming the Select tool,
so every probe click was DRAWING WALLS · reading IndexedDB 140 ms after a ~400 ms autosave
debounce, which made all three drag checks report "changed nothing" including the pre-existing
body move · choosing a target by size instead of by reachability · not re-selecting after ⌘Z,
which clears the selection.

*Acceptance, bullet by bullet.* Pure hit-test + transform module with node tests over rotated
frames → **met** (`handles.ts`, 56 tests). Its own `Drag` kind → **met** (`kind: 'handle'`).
Shift aspect-lock and Alt resize-about-centre → **met**. Rotation snapping to the plan's axis →
**deliberately NOT met, and the reason is S31's own measurement**: `dominantAngle` is BISTABLE on
the owner's plan (one square-drawn 4.6 m wall flips it −12.829° → 0.000°), which is why §4c was
reverted; Shift snaps to 15° world increments instead and the stable answer to "align to the
plan" remains the wall-seat magnet and `F`. Recorded in `docs/ideas.md` §16. SC 2.1.1 stated
explicitly → **met**, and 2.5.7/2.5.8 are stated precisely rather than flattered. Live-verified
with real mouse drags → **met**.

*Honest limits.* One browser (headless Chrome), no real screen reader, touch is CDP emulation
rather than a physical device. The `spokenSelection` mute is a HOLD rather than a blank, so a pan
no longer re-announces — but a ROTATE still announces a byte-identical sentence, because
`labelOf` carries no rotation; that is pre-existing (`q`/`e` has it too) and left alone.


### Session 35 — 2026-08-04 — the header covered the gallery's only door (`docs/ideas.md` §17b, §17c)

**Both closed.** `.room-trigger` opens the layout gallery and nothing else does, so open / rename /
duplicate / export / delete / generate all lived behind it — and below ~817 px the DESIGN/TUNE
switch painted over it. Then the gallery, once open, pushed its own Close button off the screen.

**§17b — the trigger.** Re-measured at 1 px resolution as the widest CONTIGUOUS unoccluded run,
because the S34 filing's 21-point sweep has an 8.7 px pitch at 390 px and SC 2.5.8's threshold is
24 px — it could not decide its own question.

| width | before | after | |
|---|---|---|---|
| 320 | **0 px** | 40 | entirely hidden; it is the first Tab stop, so SC 2.4.11 as well |
| 390 | **22** | 111 | fails SC 2.5.8 by 2 px |
| **561** | **27** | 113 | the worst width in the range — worse than 430 |
| 721 | 91 | 79 | |
| 817+ | 175 | 175 | unchanged |

Root cause: `.room-trigger` is a flex item with the default `min-width: auto`, so its automatic
minimum size is its MIN-CONTENT — and the name is `white-space: nowrap`. It measured **exactly
174.8 px at 560, 640, 760, 860 AND 1440**: it never shrank anywhere, and the ellipsis already on the
name could never engage. Fixed with `min-width: 0`, an icon-only mode switch and a clipped brand
below 480, a clipped name below 344, and the existing monogram rule extended 560 → 720 (which is
what `app.css` already said that rule was for).

**§17c — the gallery head. Filed wrong, and the correction was the work.** It blamed the toolbar
rail's `.strip-btn`s; measured, every one is inside `.toolstrip`'s own `overflow-x: auto` and
contributes **nothing** — with the gallery closed the document does not overflow at all. The real
cause was `.gallery-head`, whose 329 px of non-wrapping actions put its right edge at a fixed 430 px
at every viewport, leaving **Close entirely off-screen** at 320 and 390. SC 1.4.10 Reflow, on the
gallery's only pointer exit.

#### Evidence

**Agents spawned (role → verdict).** Design workflow: 3 understanding agents completed
(dependency map · a11y envelope · space budget) — **the other 9 died on a session usage limit
(TRAP 24)**, so the design/judge/skeptic phases never ran and the design was settled by
measurement in the main thread instead. The three that landed were decisive: they corrected my
candidate CSS (unscoped `.segment-label` also blanks the sidebar switch), corrected my measurement
method (1 px resolution, not 21 points), and found the 561 px cliff. Self-review workflow: 4 review
lenses (css-correctness · a11y · test-quality · ux-and-doctrine), all `SHIP_WITH_FIXES`, 17 findings
→ 9 verified by independent refuters → **8 CONFIRMED and fixed, 1 PRE_EXISTING** (the trigger's
purpose living only in `title=`, which holds identically on `main`; filed as §17b-i, P3).

**Before/after test count: 1628 → 1640** (+12, ratchet held). New file
`src/components/app/__tests__/header-responsive.test.ts`.

**Gate output (literal tails).**
```
 Test Files  74 passed (74)
      Tests  1640 passed (1640)
```
```
dist/index.html                   1.31 kB │ gzip:   0.63 kB
dist/assets/index-DIrwgzZG.css   54.75 kB │ gzip:  10.21 kB
dist/assets/index-a676D3Aa.js   506.04 kB │ gzip: 165.05 kB
```
```
> phantom-lock@0.1.0 lint
> eslint .
```
The JS is **byte-identical** to S34's — the whole diff is CSS and comments.

**Coverage.** No `.ts`/`.tsx` source file changed, so no coverage line moved; `npm run test:coverage`
green, `AppHeader.tsx` unchanged at 95.45 %.

**Negative controls: 18, all caught, each by the test written FOR it.** Eight in the first round;
self-review then found **six more that PASSED** and they were closed (unscoped label in a *different*
media block · a selector LIST whose sibling compound blanks the sidebar · `min-width: auto`
satisfying `/width:\s*auto/` · `.topbar-left` satisfying `/\.topbar\b/` · unpinned segment padding ·
missing `min-height`). NC2 was additionally proven in a browser: shipped keeps `["Build","Furnish"]`
visible in the sidebar, unscoped blanks both.

**Live verification** (headless Chrome, fresh profile per run — the owner's layouts untouched):
- `docs/sessions/S35/verify.mjs` — 20 widths × 2 layout names; worst exposed trigger **40 px**, worst
  segment 39, Tour 41, undo/redo 36; one `<h1>` at every width; the boot splash proven unclipped; the
  sidebar scoping proven **in DESIGN mode** (my first probe read 0 sidebar labels and would have
  passed vacuously, because the app boots into TUNE); a real mouse click opens the gallery at 320.
- `docs/sessions/S35/verify-gallery.mjs` — no horizontal overflow at any width in **either** gallery
  state, breadcrumb reachable in-folder, a real click on Close closes the gallery at 320, and S34's
  320 × 200 tray guarantee re-checked (5/5 reachable after scrolling, tray bounded at 62 px).
- Screenshots: `docs/sessions/S35/shots/v-after-{320,390,561,721,1440}.jpg`, `g-320-in-folder.jpg`,
  `g-320x200.jpg`, plus the before/after pairs `hdr-{before,after}-{320,390,561,721}.jpg`.

**Acceptance bullets.**
- *`elementFromPoint` reports SELF for ≥0.95 of the trigger at 320/390/560/760/960/1440* — **met, and
  strengthened**: the fraction was replaced by the widest contiguous unoccluded run in px (the
  fraction cannot decide SC 2.5.8), measured ≥40 px at 20 widths including the 561 and 721 cliffs.
- *The DESIGN/TUNE switch stays fully operable at every width; sweep IT too* — **met**: worst exposed
  segment 39 px, every segment ≥40 px wide, roles/`aria-checked`/roving tabindex untouched.
- *A CDP guard pins the fractions* — **met** (`verify.mjs`), and a committed disk-reading test pins
  the declarations, since jsdom ignores `@media`.
- *The ≤960 px bottom rail re-checked* — **met**: header height unchanged (57/53), and the rail's own
  overflow proven self-clipped.
- *§17c (P3 stretch)* — **met and upgraded**: re-diagnosed as SC 1.4.10 with Close off-screen, fixed,
  and the old attribution corrected in `ideas.md`.
- *Task 2b, §16 Word-style handles* — **DEFERRED**, untouched. It is a full session (new `Drag` kind,
  rotated-frame hit-testing, interaction with the S23 wall-seat magnet) and remains the head of the
  queue.

**Stated honestly.** Live checks ran ONE browser (headless Chrome over CDP). No real screen reader
has ever been driven on this project. Touch is CDP emulation, not a physical device. The design
workflow was **partial** — 9 of 12 agents died on a usage limit, so there was no independent judge
panel or design skeptic; the design rests on main-thread measurement plus the self-review that
followed it.

### Session 34 — 2026-08-04 — the two affordances the owner could not find (`docs/ideas.md` §17)

**The owner's report,** mid-session and unprompted: *"why is there no delete layout button and
wheres the generate layout button. impossible to find"*.

**Both existed. One was genuinely unreachable.** "Generate a design" had TWO entry points and both
were gated on a folder — the action-row button behind `{folder && …}` at `LayoutGallery.tsx:762`,
and a folder tile's kebab item at `:530`. Measured live in headless Chrome against the shipped
build, the home grid offered four creation buttons (New room / Empty layout / Maple Court apartment
/ Import layout) and **`generateOnHome === false`**. A workspace with **no folders at all** — which
is what `defaultStore()` is, and what a user reaches by deleting their folders — could not reach the
generator by any route. Every gallery test rendered `seededDefaultStore()`, which ships two folders,
so the 36-test corpus could not express the failing case, and the failing case is the DEFAULT one.

**Delete was never missing, and "too dim" was the wrong diagnosis.** It is a `MenuItem` behind the
card's `⋯`. Measured through `styles/contrast.ts` against the backdrop the chip actually sits on —
it is `top:14px` inside `.gallery-thumb`'s 130px band, so the mini-plan CANVAS on a card (`#0d1320`,
read from `thumb.ts`) and `.folder-mosaic` on a tile, NOT `--surface-1`/`--surface-2`, which the
first cut of the test wrongly used and an adversarial lens caught:

| | measured | verdict |
|---|---|---|
| glyph `--text-2` over the fill | 9.09 – 9.30 : 1 | already fine |
| the fill itself vs its backdrop | **1.01 – 1.10 : 1** | no boundary at all |

Every backdrop is near-black, so the intuitive fix is backwards: 0.6 → 0.85 alpha buys **0.02**.
Only a stroke works. `1px solid var(--text-3)` measures 5.93 / 6.36 / 6.04 / 5.57 across the four
backdrops, clearing WCAG 1.4.11's 3:1. `--border-strong` (1.59–1.68) and `--border` (1.16–1.22) were
measured, rejected, and are now asserted to FAIL, so a later "use the standard token" reds the suite.

**One regression introduced, caught by self-review, fixed in two rounds.** `.gallery-new` is
content-sized with no shrinkable minimum while `.gallery-surface` is `flex: 1 1 0; min-height: 0`,
so the lead button's 72px came straight out of the grid.

| viewport | pre-S34 grid | S34 v1 | shipped |
|---|---|---|---|
| 844 x 390 | 137 px (133 of a 196 px card) | **65 px (61 px)** | **153 px (149 px)** |
| 390 x 640 | 362 | 290 | 376 |
| 1440 x 900 | 224 | 224 | 224 |

`min-height: 44px` under `max-height: 640px` fixed that — and a fourth review lens then found the
hole in it at **320 x 200** (a 1280px display at 400 % zoom, SC 1.4.10's reflow target): the two
longest labels WRAP under the stacked column layout, so those buttons render 62px and the floor never
binds — tray 193px against a pre-S34 190px, with two buttons entirely below the fold where before
none were. `flex-direction: row` (what `.gallery-new-lead` already did, and why it was the one button
unaffected) takes the tray to 174px; the residual is structural (five buttons need three rows where
four needed two) so the tray is bounded to `50vh` and scrolls ITSELF, since `.gallery-layer` is
`inset: 0` and the overflow was otherwise escaping the overlay. Shipped guarantee is REACHABILITY:
**5 of 5** after scrolling the tray, against 4 of 4 pre-S34 on a tray already clipped by 78px.

**Two PRE-EXISTING defects found while verifying, both measured on a baseline tree and filed rather
than attributed.** §17b (**P1**): `.room-trigger` — the only control that opens the gallery — is
overlapped by the DESIGN/TUNE `.segment-label` spans. Sweeping 21 points with `elementFromPoint`,
the hit-testable fraction is **0.143 at 390px**, 0.714 at 560, 0.667 at 760, 1.000 at 960 and 1440 —
byte-identical on `git show 0216209:` restored files served on a second port. On a phone that makes
the gallery nearly unopenable, which is a superset of the complaint this session answered. §17c
(P3): 430px of horizontal overflow at 390px, same six `.strip-btn` offenders on both trees; the
harness asserts it has not MOVED rather than asserting it is absent.

**Evidence.**
- *Agents:* an audit workflow (27 agents, 0 errors) — 24 skeptics, **6 refutations, all corrections
  to OTHER agents' overstatements**, none contradicting the two measured facts. A design workflow
  (17 agents) that landed AFTER the fix was implemented; retrospective, but it independently produced
  the wrong-backdrop correction. A self-review workflow (4 agents): 3 HIGH (all the same finding —
  the contrast block did not read `gallery.css`; fixed mid-flight), 3 MEDIUM (wrong backdrop — fixed;
  short-viewport collapse — fixed; "only 2 of 6 tests load-bearing" — **partly refuted**, NC5/NC6
  show the in-folder and delete tests are load-bearing against plausible regressions), 3 LOW (hover
  backdrops — **refuted**, the chip sits over an opaque canvas so the card's hover fill is never
  visible under it; idle-action-during-move — real but pre-existing, `New room…` and `Import…`
  behave identically; 400 % zoom — real, fixed).
- *Negative controls, six, each caught by the test written for it:* border → `none` · border →
  `--border-strong` · home Generate button deleted · home button re-pointed at a folder · in-folder
  button re-pointed at home · the Delete `MenuItem` deleted. The first two are caught ONLY by the
  assertion that reads `gallery.css` from disk — without it the whole contrast block is documentation.
- *Tests* 1615 → **1628** (+13). `gallery.a11y.test.tsx` 36 → 42, `contrast.test.ts` 112 → 119.
- *Coverage:* `LayoutGallery.tsx` **92.02 %** stmts / 88.81 % branch; `contrast.ts` 100 %;
  `components/gallery` 83.09 %. `gallery.css` has no coverage concept.
- *Gates:* `Tests 1628 passed (1628)` · build **506.04 kB / 165.05 kB gz** JS + **53.97 kB /
  10.06 kB gz** CSS + 1.31 kB HTML · `eslint .` clean.
- *Live* (`docs/sessions/S34/{look,verify,mobile}.mjs`, fresh Chrome profile, fresh origin — the
  owner's layouts never touched): Generate renders and hit-tests on home, the dialog opens, "Create
  design" lands the design on the HOME grid (5 → 6 cards, `inFolder: false`), the card menu's Delete
  removes it (6 → 5) with an undo toast. Screenshots `docs/sessions/S34/shots/01-08`.
- *Acceptance:* Generate reachable from the home grid → **met**. Reachable with no folders → **met**.
  In-folder path unchanged → **met** (NC5). Delete reachable and perceivable → **met**. No
  responsive regression → **met after two rounds** (the first fix was itself incomplete).
- *Stated honestly:* live checks ran ONE browser (headless Chrome over CDP); touch is CDP emulation,
  not a physical device; **no real screen reader has ever been driven on this project**; the §17b
  header collision is filed, not fixed.

**Deferred with a reason:** §17b (P1, pre-existing, its own session) · §17c (P3) · the tray running
its idle action while a move is armed (pre-existing class shared with three other tray buttons).

### Session 33 — 2026-08-03 — the design generator's QUALITY (§15)

**The owner's report.** *"generate a design is broken as fuck. i want actual good generations with
logic and thought not random designs"*, with a screenshot of *"1 piece of furniture had nowhere to
go — reroll or pick a larger shape."*

**The instrument came first** (`src/engine/generate/__tests__/design-score.ts`, test-only, **29
tests of its own**), calibrated on `apartmentScene()` — the hand-authored Maple Court demo, a model
of the home the owner lives in and the only ground truth in the repo: **28.9 %** floor coverage,
1.75 pieces per 10 m². It scores **0.9998**. Its own tests found THREE defects in it before it was
used to justify anything: `spacing` was missing entirely (the pile-it-all-on-one-spot control scored
identically to the demo, because density is blind to it by construction), `ANCHORS` matched only the
generator's vocabulary so it could not see the demo's "Couch", and `intersectionArea` did not
re-orient the clip polygon and reported the demo as overlap-free (TRAP 22, in my own harness).

**Measured, 8 archetypes x 60 seeds — total 0.7856 → 0.8552:**

| | before | after | | before | after |
|---|---|---|---|---|---|
| placement | 0.9673 | **0.9984** | proportion | 0.9694 | **0.9993** |
| density | 0.1478 | **0.4160** | lock | 0.9042 | **0.9854** |
| programme | 0.9632 | 0.9583 | skipping a piece | 26.3 % | **1.9 %** |
| orientation | 0.7125 | 0.7696 | NO speakers | 46/480 | **7/480** |

**THE FILED CAUSE WAS WRONG.** `docs/ideas.md` §15 said the armchair's `facing < 0.2` cone was too
tight. It was not: `openSlots` gave every open slot the CONSTANT world facing `{x:0,y:-1}` and
`rotation: 0`, so the test asked *"is the TV north of this point?"* — 0/258 skips with the TV north
of the room centre, **125/162 (77.2 %)** with it south, which is 125 of the corpus's 126 skips.

**Seven further defects, each measured:** `wallSlots` offered ONE face of every wall (65.7 % of
floor-facing wall length reachable) · four of `inventoryFor`'s six area thresholds never fired and
`cabinet`/`round-table` were unorderable · `ZONE_AFFINITY.dining` excluded `living`, mismatching
53.9 % of multi-room dining placements · `split` drew blind, leaving a >2:1 room in 20.4 % of
designs · `loft`/`great-room` put one "living room" at up to 70 m², bigger than the whole Maple
Court apartment · the studio-sleeps rule put a **double bed in every generated home office** (caught
only by driving the real UI — the bed placed fine and counted toward coverage) · and a PRE-EXISTING
flaky test, measured at 1 failure in 40 runs on `main`.

**Two things measured and NOT taken.** Weighting sofa/TV facing harder buys +0.011 orientation and
costs 3 more no-speaker designs. Always taking the SQUAREST guillotine cut fixes proportion and
collapses variety — distinct room sets over 60 seeds fall 58 → 34 on `loft`; drawing at random from
the cuts inside an aspect budget keeps both.

**Evidence.** 8 negative controls, all caught (one exposed a weak test, which was rebuilt on an
L-shaped fixture and re-verified red). Live in real headless Chrome on a fresh profile: 24 summaries
across all 8 archetypes — **1** said "nowhere to go", **21** said "a stereo pair that locks"; the
kept design reached IndexedDB with 7 furniture pieces and 4 distinct rotations. Tests 1560 → **1615**.
Bundle 503.23 → **505.86 kB** (164.17 → 165.02 kB gz), CSS unchanged. Re-run live after the review
fixes: **0/24** "nowhere to go", **24/24** "a stereo pair that locks".

**Self-review was done BY HAND** — all four review agents died on a weekly usage limit, and four of
six agents in the earlier understanding workflow died on a session limit. It found one REAL defect
introduced by this session that none of the 8 negative controls had covered: with `ctx.walkable`
null (a flooded region ≤ 2 m²) the two-faced `wallSlots` placed furniture OUTSIDE the building, 1 of
2 pieces on a 1.2 x 1.2 room. Fixed, pinned, and the lesson recorded. It also found a consequence on
the shipped "Arrange furniture for me" dialog and fixed the messaging there.

**Deferred with a reason:** per-room furniture quotas (`ideas.md` §15b) — `two-bed`'s `programme` is
0.800 because `inventoryFor` reasons per room but returns a flat count and `arrangeFurniture` has no
per-room filter, so both beds can land in one bedroom.

### Session 32 — 2026-08-03 — the explicit seat command (§4b, plain `F`)

**Shipped.** `COMMAND_SEAT` / `WALL_SEAT_REACH_M` (1.2 m) / `seatObjectAgainstWall` /
`canSeatAgainstWall` in `canvas/placement.ts`; the `F` key routed off `flip-door`'s same-ref
result; the Inspector "Seat against wall" button (gated `furniture | tv`, C6); a fourth
`SelectionActions` HUD button with `repeatable={false}`; the on-canvas snap guide; `canvas-help.ts`.

**Two real defects found and fixed.** (1) Reach and capture are the same number, so 1.2 m reopened
the C3 short-wall hazard — measured 1.20 → 3.28 m² capture over a 0.70 m stub, worst jump 1.083 →
1.540 m, closed by a required `WallSeatOptions.contain` that is a no-op for walls ≥ 2.4 m.
(2) SHIPPED BUG: `wallSeatFor` quantised then clamped, so 14.3 % of seated results slid up to 1.5 cm
on re-application over off-grid wall lengths.

**Deferred with a spec (`docs/ideas.md` §4d).** ⇧F, because the turned class is not representable in
the drag magnet: 4 of 5 realistic pieces lose the turn on the next drag, one of them without moving.

**Owner reports recorded (`docs/ideas.md` §15/§16), both measured.** The generator skips a piece in
26.3 % of 480 designs and **125 of 126 skips are the `armchair`** — `arrange.ts:414` is the only
case in `scoreSlot` that returns null rather than scoring; it is requested 420 times and skipped
125 (29.8 %) with a TV present in every one. 9.6 % of designs ship with zero speakers. Plus the
Word-style resize/rotate handle request.

**Evidence.** Agents: 4 design lenses + 4 adversarial skeptics (8 total, 1.07 M tokens); every
finding adjudicated against the tree by hand — two CRITICALs reproduced exactly, one HIGH
("⇧F never settles") was superseded by a tie-break form measured idempotent over 1 036 800 samples,
and a claimed "2.5 cm" defect measured **1.5 cm** and converges, so the magnitude and the "keeps
sliding" characterisation were both corrected. Tests **1543 → 1560**. `placement.ts` 100 % stmts /
93.97 % branch / 100 % funcs / 100 % lines. Nine negative controls run (6 on the command, 3 on the
guide); 7 caught, 1 was a genuine test hole now covered, 1 was provable code redundancy and is
annotated as such. Live: real headless Chrome, fresh profile — Desk seated to **−11.73°**, face gap
**5.55e-17 m**, second press moved nothing, the button disabled itself, and C6 verified by creating
a window through the app's own `w` key. Shots in `docs/sessions/S32/shots/`. Gates green: 1560 tests
· 503.23 kB / 164.17 kB gz JS · lint 0 problems.

**Honest limits.** One browser, not cross-browser. No real screen reader driven. The snap guide is
only visible mid-drag, so it is proven by a recording stub plus three negative controls rather than
by a screenshot. `App.tsx` is now 1292 lines against the 800 cap — debt restated, not reduced.


- **2026-08-03 — Session 31 DONE:** §13e **REFUTED** at the `vision/quality.ts` seam (proven three
  ways, pinned by 7 tests, redirected to metric scale, P1→P2) and creation-time alignment **built,
  measured and REVERTED** (the plan axis flips 12.83° on one ordinary wall edit; fully specified as
  `docs/ideas.md` §4c). Two agent numbers did not reproduce and were corrected in place. Tests
  1536→1543, coverage green, asset hashes byte-identical. See the Session 31 block.
- **2026-07-19 — Session 0 (planning):** full audit (13 agents + verification), live human testing,
  DB design, and this roadmap. Wrote `docs/ultrareview.md`, `docs/database-plan.md`, `docs/master-plan.md`.
- **2026-07-19 — Decision gate:** user chose **cross-device sync** → Session 11 scheduled.
- **2026-07-19 — Session 1 DONE:** hardening + IndexedDB migration (see the Session 1 block).
- **2026-07-19 — Session 2 DONE:** named listening positions (couch/bed) + 2-up scenario compare (see the
  Session 2 block). Mirror-model migration is data-safe and desync-proof (verified live). Tests 95→126,
  build green.
- **2026-07-19 — Session 3 DONE:** engine-correctness pass — whole-house stacking, reflections-through-
  openings, the equilateral/lock 2D-vs-3D mix (+ the false-lock ITD gate the skeptic caught), and three
  silent geometry degradations (`regionOf` clamp, `splitWallAt`, `findByLabel`). Two pre-code verification
  workflows + a post-code self-review workflow; every bug adversarially verified. Tests 126→140, coverage
  ≥80% on touched files, build green. See the Session 3 block. Next: **Session 4** (canvas interaction
  fixes + dead features) — its kickoff prompt is in its block (re-states the Standing Operating Protocol).
- **2026-07-19 — Repo hygiene + GitHub (S3 session):** untracked `coverage/` (now gitignored); on the
  user's request, published to GitHub (public), with the bundled demo apartment's real address scrubbed to
  a neutral placeholder across ALL git history (`git filter-repo`) for privacy, and set the standing rule to
  push after each session. README rewritten to the readme-standards bar with placeholder screenshots (real
  ones deferred — the app changes too often to keep them current).
- **2026-07-19 — Session 4 DONE:** canvas interaction fixes + dead-feature wiring — door/window hover chips
  (wired + identity-latched), Backspace chain-undo per-corner id groups, marquee/lasso deselect + pinch-clear +
  freeze-during-band, DPR-change matchMedia repaint, grab/grabbing cursor, and overlay-gated canvas R/Backspace
  (now incl. gallery + wallProposal). Pure logic extracted to `interaction.ts`; a pre-code verify→refute Workflow
  (13 agents) + a post-code 3-agent self-review (which caught the sticky-latch, the gallery/wallProposal key
  leaks, and the tool-switch band-freeze leak — all fixed). Tests **140→181**, build green. See the Session 4
  block. Next: **Session 5** (App.tsx decomposition + ESLint) — its kickoff prompt is in its block.
- **2026-07-19 — Backlog growth (during S4):** a **first-time-user clickthrough** by the owner caught that
  **Auto-detect walls** produces a spidery, duplicated, non-orthogonal tangle on a real floorplan → scheduled as
  **Session 12** (auto-detect accuracy overhaul), root causes diagnosed against `detect.ts`. Codified the
  first-time-user-testing practice into memory (`first-time-user-testing`): drive each feature cold as a naive
  user, capture real friction, add it to this plan, and hand it off to a dedicated session — not half-fixed inline.
- **2026-07-19 — Session 5 DONE:** App.tsx decomposition + ESLint (see the Session 5 block). **1506 → 789 lines**
  into 6 hooks + 3 pure modules + 4 JSX components; the 3 history bugs fixed (leak via `reap`+`keepId`, impure
  updater → pure, 400 ms timer → gesture-scoped coalescing). ESLint (`npm run lint`) added, all 12 exhaustive-deps
  suppressions re-derived (5 documented survivors). A pre-code 11-agent understand→refute Workflow caught the
  coalescing trap; a 4-agent self-review Workflow caught + fixed the rotate-coalescing regression. Tests **182 → 239**,
  lint clean, build green (~378 kB/122.6 kB gz). Live-verified on a disposable duplicate (real layout backed up +
  restored pristine). Next: **Session 6** (Web-Worker tracer + memoization) — kickoff in its block; `useSimulation`
  is now cleanly extracted to unblock it.
- **2026-07-19 — Data-safety note (S5):** the preview browser's IndexedDB holds the owner's **real** home layout
  (a real street address — source/default stays the scrubbed "Maple Court", and the real address must never be
  committed to `src/`/`docs/` or shown in published screenshots). All S5 write-tests ran on a duplicate; the real
  layout was backed up and verified byte-identical afterward. Keep testing on duplicates, never the real active layout.
- **2026-07-19 — UI/UX overhaul planned (owner request "rethink the UI/UX and layout of everything"):** ran a 6-agent
  design workflow (4 complete redesign directions + a rubric judge + an independent UX/IA-flow audit) + a live
  walkthrough → wrote **`docs/ui-ux-overhaul-plan.md`** and scheduled it as **Sessions 13–16 (UX-1…UX-4)**. Direction:
  **"Anechoic Console"** — one unified dark room, the glowing canvas as the only light source, THE LOCK as the hero.
  Presentation-layer only. Absorbs Session 8's design + onboarding items (S8 shrinks to hardening + README). Both
  gating decisions **CONFIRMED by the owner** the same day: aesthetic = Anechoic Console; IA = DESIGN/TUNE modes
  (DESIGN keeps Build+Furnish sub-steps, TUNE merges Sound+Analyze, mode owns the theme). See plan §8.
- **2026-07-19 — Session 13 (UX-1) DONE:** design foundations ("Anechoic Console" base). The plan canvas is no longer a
  cream blueprint — it's a **dark cyanotype**, so the whole app is one unified dark room and the sound↔plan toggle is a
  gentle hue shift (the #1 split-personality fix). **Evidence block:**
  - *Workflow (understand→design→refute, 7 agents, 0 errors):* U1 token-consumer/small-text map · U2 canvas/font-load
    trace · U3 panels surgeon · D1 tokens · D2 cyanotype palette (caught the hardcoded plan-blue zone fill at
    `render.ts:939/941` living OUTSIDE `THEMES.plan`) · D3 fonts+helper · **adversarial skeptic** — REFUTED the risky
    changes and caught the **critical D1↔D2 green contradiction** (D1 nudged `--ok`→#40e08a, D2 kept #3ee08a; applying
    both would re-split the green) → resolved to **one green #3ee08a app-wide**; also flagged the prose-floor migration
    gap + the Space-Grotesk-preload-with-no-consumer warning (resolved by applying `--font-display` to the wordmark).
  - *Self-review (2 agents over the diff):* `code-reviewer` → **APPROVE, 0 findings** (re-ran the gate, verified woff2
    magic bytes, all token renames complete, font-ready race/StrictMode-safe, no engine coupling). `silent-failure-hunter`
    → **2 real findings FIXED**: the outer `.catch` was NOT unreachable (silently swallowed `onReady()` throws + a
    misleading "unreachable" comment) and the per-spec catch had zero diagnostics on a font 404 → both now `console.warn`/
    `console.error` **only on actual failure** (happy path stays silent), +1 regression test. Re-verified green.
  - *Gate (pasted tails):* `npm run lint` → **0 problems**; `npm test` → **245 passed (19 files)** — ratchet 239→245
    (+6 `font-ready.test.ts`, failing-first proven RED→GREEN); `npm run build` → tsc clean, vite OK, **JS 378.76 kB /
    122.71 kB gz** (flat vs S5) + **CSS 35.82 kB / 7.01 kB gz**; fonts are static `public/fonts/` assets (7 Latin-subset
    woff2 + OFL `LICENSE.md`, ~148 kB, 2 preloaded ≈36 kB).
  - *Live (one browser, real "Maple Court" fresh-origin demo):* all 4 steps render one coherent dark room — Build/Furnish
    dark cyanotype, Sound/Analyze dark, **no black↔white flash**; `document.fonts.check` = true for all 7 self-hosted
    faces (Geist Sans/Mono + Space Grotesk — NOT system fallback), wordmark in Space Grotesk 700; canvas numbers crisp,
    **no FOUT reflow**; console clean (only Vite/React dev noise); ≤960px stacked layout verified. Screenshots + backup in
    `docs/sessions/S13/` (gitignored). **Data safety:** the owner's real layout was backed up first and confirmed
    **byte-identical** (`updatedAt` unchanged) afterward — all checks were read-only; the scrubbed "Maple Court" demo is
    what the screenshots show. (Also scrubbed a pre-existing real-address string from this doc's S5 data-safety note.)
  - *Acceptance → all met:* one coherent dark room every step ✓ · no theme flash ✓ · fonts self-hosted, no reflow ✓ ·
    perf budget held (2 preloads, Latin subsets) ✓ · gate green ✓ · both-(now-dark)-theme screenshots of all 4 steps ✓.
  - *Known follow-ups (not UX-1 scope):* the mobile toolbar still floats over the canvas (UX-2 fix); the fader-fill lost
    its translucent-left fade when routed through `--signal` (brief-directed unification, acknowledged); the standing
    protocol's "screenshot both the dark sound and **light** plan themes" wording is now stale (both are dark — a factual
    correction for the owner to make to the canonical protocol); the real home address is still referenced in this repo's
    **git history** (already public on `origin/main`) — a dedicated history-scrub is out of scope here. Next: **UX-2**.
- **2026-07-20 — Session 14 (UX-2) DONE:** Shell & IA — the confirmed **DESIGN / TUNE** two-mode model. `theme` is now a
  DERIVED `const modeTheme(appMode)` (the single controller) via the new pure `src/components/app/mode.ts` (45 failing-first
  tests) — the old `applyStep`/`applyTool`-teleport/`t`-key three-way theme fight is structurally eliminated; a tool only
  flips the DESIGN sub-step, digits are mode-scoped (no cross-mode leak), `t`→mode-toggle. Header rescoped to brand + pinned
  switcher (`PL` monogram ≤560) + DESIGN/TUNE `SegmentSwitch` (replaced the retired `WorkflowSteps` fader) + undo/redo;
  TV/Music + Suggest re-homed to `TuneToolsCard` in TUNE (de-duped; MetricsPanel mirrors `tvAnchor`). Mobile: `.toolstrip`
  un-floats to a bottom scrollable 40px rail at ≤960px (never over the canvas), mode-hint→top (hidden on touch),
  `SelectionActions` touch HUD (rotate/nudge/delete, coarse pointers) with correct disabled/hidden gating. 8-agent design
  Workflow + 3 self-review agents (code-reviewer/silent-failure-hunter/a11y) — every real finding fixed (HUD escaping
  `overlayOpen`; HUD rotate no-op on walls; empty mobile h1; tab→radiogroup; duplicate Suggest CTA; unified armed-LED
  threshold). Tests **245→296** (+51, none skipped). Gate: lint 0 · 296 green · build JS 123.05 kB gz / CSS 6.96 kB gz.
  Live: headless-Chrome-over-CDP screenshots (both dark themes + ≤960 rail + touch HUD + monogram) in `docs/sessions/S14/`
  (gitignored, scrubbed Maple Court); 6/6 behavioral keydown assertions PASS (tool never changes mode/theme); console clean.
  Data-safe: the owner's real home layout backed up (gitignored) + byte-identical (`updatedAt` unchanged) + origin restored. Next: **UX-3**.
- **2026-07-20 — Session 15 (UX-3) DONE:** The readout & THE LOCK. Extracted the verdict into the pinned `--surface-4`
  `VerdictHero` (`--text-hero`, leads the TUNE column, `position:sticky` — never scrolls away) + THE LOCK ignition (the
  `--signal` cyan→green gradient swept through the letterforms via `background-clip:text` + green bloom; reduced-motion →
  opacity-only `lock-fade`; forced-colors fallback). All readout math is now the SINGLE pure `src/components/panels/verdict.ts`
  (`deriveVerdict` == old `verdictOf` for `{locked,quality}` + `kind`/`headline`/`cause`, `representativePair`, moved
  `causeSentence`, and the `initIgnition`/`stepIgnition` LOCK edge detector — 26 failing-first tests) consumed by BOTH the
  sidebar hero AND `ScenarioCompare` (the divergent `verdictOf` + `.compare-verdict` deleted — the drift bug is gone). Metrics
  are a Geist-Mono `.spec-sheet`; Compare is always present in TUNE + self-teaching (threaded `canCompare`). Pre-code 6-agent
  design Workflow (understand→2 designs→adversarial skeptic → reconciled hybrid) + post-code 10-agent self-review (4 reviewers,
  each finding adversarially verified) caught **2 real bugs** — a HIGH "ignite on switching TO an already-locked seat/scenario"
  (fixed by keying the hero to the displayed entity: `key={activeListener(scene).id}` / per-scenario) and a MEDIUM headline that
  dropped a genuine lock when it wasn't the highest-quality pair (fixed: gate on `some(p.locked)`, not `best.locked`) — plus 4
  a11y fixes (forced-colors, focus-not-obscured `scroll-padding-top`, opacity-only reduced-motion, 40px touch targets); all
  fixed + re-verified. Tests **296→322** (+26, none skipped). Gate: lint 0 · 322 green · build JS 123.79 kB gz / CSS 7.41 kB gz.
  Live: in-app browser DOM/state proofs + a zero-dep Node-25 CDP client (classic headless, JPEG) → 6 desktop screenshots in
  `docs/sessions/S15/` (unlocked → in-place LOCK sweep → sticky spec-sheet → 2-up compare → reduced-motion), incl. proof that a
  seat-switch to a locked seat does NOT ignite while a genuine in-place lock DOES (`anim:lock-sweep`; reduced-motion `lock-fade`).
  Presentation-layer only (zero engine/persistence/data-model change). Data-safe: real home layout backed up (gitignored, full
  fidelity) + `updatedAt 1784480211854` byte-identical before AND after (+ reload/autosave settle) + fixture removed + origin
  restored + no real address committed. Next: **UX-4 (Session 16)** — kickoff in the S16 block.
- **2026-07-20 — Session 16 (UX-4) DONE:** Learnability, empty states & shareable output. All 9 items shipped —
  **(A)** `<Term>` tap-to-learn jargon layer (`ui/Term.tsx`, accessible popover; base reset `:where(.term)` so the composed
  spec-label mono styling wins) + the single pure `panels/glossary.ts` (11 terms) wired into the `MetricsPanel` spec sheet +
  a TUNE `GlossaryCard`; **(B)** first-run seed — a fixed ±30° equilateral **LOCKED** homepod pair at the couch seat on a
  pristine origin (`engine/seed.ts`, a leaf module; `apartmentScene()` stays audio-free) so first paint reads "Phantom center
  locked", + a `FirstRunExplainer` gated on genuine first run (`bootstrapPersistence.firstRun` && `isPristineOrigin`, standalone
  localStorage flag); **(C)** editorial empty states (TuneToolsCard lead → the single Suggest CTA); **(D)** "Pair X + Y as
  stereo" one-click in Speakers; **(E)** "Replace with N speakers" + a uniform undo toast on every apply (optimizer/arrange/placed);
  **(F)** rename Room-shell vs **Area** + the optimizer's "This room" default targets `regionOf(listener)` — a walled region with
  no hidden zone (UI wiring only, zero engine-math change); **(G)** "Import floorplan photo" vs "Import layout (JSON)" split + a
  first-run starter photo entry; **(H)** "Export plan image" (`canvas/export-image.ts` offscreen `renderScene`→PNG) + "Copy
  verdict" (`ShareCard`); **(I)** collapsible on-canvas `Legend` keyed to the mode. Orchestrated: a 5-agent Understand Workflow →
  a 4-agent adversarial Skeptic (all CONFIRMED_SAFE: seed data-safety, F engine-safety, H offscreen-render, scope/a11y) → a
  4-lens self-review (code-reviewer + silent-failure-hunter + data-safety-scope + a11y) that caught **3 real HIGH** — a `.term`
  CSS cascade bug silently stripping the Geist-Mono spec-sheet typography (fixed with `:where(.term)`; re-verified live: computed
  `Geist Mono/11px/--text-2`), a non-async `renderPlanToBlob` whose sync throw escaped the caller's `.catch` (made `async`), and
  seeding in the degraded catch branch (added a non-seeding `loadFallback`) — plus 2 LOW copy nits (fixed); all re-verified.
  Tests **322→340** (+18: seed 10 · glossary 4 · export-image 4; none skipped). Gate: lint 0 · 340 green · build JS 126.9 kB gz /
  CSS 8.05 kB gz. Live: fresh headless-Chrome profiles (fresh origin → seed fires) + the in-app browser → 17 screenshots in
  `docs/sessions/S16/` (first-run explainer, seeded LOCKED verdict, legend, Term popover, glossary, ShareCard, "Replace with 2 /
  This room" optimizer, "Pair C+D" , DESIGN "Mark an area"/starter photo, mobile). Copy-verdict proven via a real CDP mouse
  gesture ("Verdict copied"); export image proven ("Saved the plan image"). Presentation/UI-only — zero `src/engine` math,
  persistence schema, or data-model change (the sanctioned `seed.ts` composes existing APIs; `scene.ts` only `export`ed
  LEGACY_KEY; `db.ts` only added a `firstRun` return field; optimize/rooms/stereo unchanged). Data-safe: the owner's real layout
  backed up (gitignored) + `updatedAt 1784480211854` byte-identical before AND after a reload/autosave settle; all interactive
  testing on separate fresh-origin profiles (their IDB never touched) — no fixture created on their origin, none to remove; no
  real address in any committable file. Per owner request (2026-07-20) their layout was renamed from its real street address to
  the placeholder "My apartment", and future sessions must never delete their layouts. Next: **Session 7 (a11y audit)** — kickoff below.

### 2026-07-22 — Session 7 (a11y audit) ☑ DONE

**Branch** `claude/a11y-audit-phantom-lock-70516e`, off `main` @ `1f32241`.

**Agents (12 in the planning workflow + 3 self-review).** Understand ×6 (canvas-keys · panel-lists ·
verdict-live · contrast · test-infra · aria-audit) → design synthesis ×1 → **adversarial skeptics ×5**, all
returning PARTIALLY REFUTED with ~40 real defects. The skeptics changed the shipped design substantially:
- **CRITICAL** the plan's `inert` on `<main>` would have **bricked the optimizer, arrange and detected-layout
  dialogs** — they render INSIDE `.workspace`, so `overlayOpen` inert would disable the very dialog that
  opened it. Dropped; `tabIndex={-1}` alone carries it.
- **CRITICAL** the live mirror had **no selection channel** — `n` would have announced nothing, defeating the
  headline deliverable. Fixed with a second, immediate region.
- **HIGH** `t?.closest(...)` throws on a window-dispatched key event (the repo's own verification technique).
- **HIGH** the plan's `stepSettle` reducer was dead code the hook never called (~10 vacuous tests).
- **HIGH** the `--text` contrast row was numerically wrong in 4 of 5 cells; `--border-input` at 0.62 alpha
  failed 3:1 in two of three real contexts (2.83/2.97). Both independently re-derived before shipping.
- MEDIUM: new canvas keys weren't mode-scoped (an S14 IA regression); blanket `interactiveTarget` gating would
  have killed `t`/digits/`q`/`e` after any button click; the widened Space exemption broke "keyup always
  disarms"; `KeyDispatchState`'s `Omit` and the `env()` test helper were missed edits.
Self-review ×3 (`code-reviewer` · `silent-failure-hunter` · `a11y-architect`) over the real diff.

**Gate.** `npm run lint` 0 problems · `npm test` **613 passed (613)**, 32 files (ratchet 340 → 613) ·
`npm run build` clean, **401.76 kB / 129.53 kB gz** JS + **43.19 kB / 8.24 kB gz** CSS.
(608 at first commit; +5 after the self-review fixes.)

**Coverage** (`npm run test:coverage`) — every NEW module is ≥96%:
`selection-cycle.ts` 100% · `placement.ts` 100% · `announce.ts` 100% · `useAnnouncer.ts` 100% ·
`LiveAnnouncer.tsx` 100% · `canvas-help.ts` 100% · `contrast.ts` 100% · `keyboard.ts` 96.4% ·
`interaction.ts` 99.5%. `src/test/axe.ts` is 76% — the uncovered lines are its violation-FORMATTING branch,
which by construction only executes when an axe assertion fails.
The pre-existing `.tsx` components edited for the ARIA fixes stay well below 80% (`SimCanvas` 25%, `App` 51%,
`Menu` 7%, `Toast` 76%, `MetricsPanel` 81%, `SpeakersCard` 84%, `ListenerCard` 88%). Stated plainly rather
than papered over: behavioural component tests for these are **S10's** scope, and S7 deliberately did not
absorb them — the new `dom` project asserts a11y properties only.

**Acceptance.**
- *Keyboard-only user can place + adjust a speaker and READ the verdict* — **met, proven live in headless
  Chrome**: canvas reached in **2 Tabs**; `p`×2 took pods 2→4; the selection region announced
  `"D, HomePod, 5 of 29"`; the readout announced *"Listening spot: Phantom center locked. Equal paths, a 60
  degrees triangle… Quality 100 percent."*; 8× ArrowLeft moved a pod 1.52 m → 1.87 m; `n` then `d` turned
  `"Wall, 0.74 m, 6 of 29"` into `"Door, 0.90 by 0.10 m, 6 of 30"`.
- *Automated a11y clean on the chrome AND the new canvas affordances* — **met**: 26 jsdom axe tests green, and
  a real-Chrome axe run with **`color-contrast` ENABLED** reported **0 violations** in both modes. axe found
  two genuine defects during development (duplicate `banner`; orphaned `<li>` under the seat list's bogus
  `radiogroup`) — both fixed.
- *Contrast test passes / exceptions documented* — **met**: 112 assertions. `--text-3`×`--surface-4` (4.08)
  is documented as forbidden and guarded; the 10 pre-existing 11px `--text-3` sites are frozen as a ratchet.
  Not fixed (documented, unchanged design decisions): panel hairlines, meter *tracks*, chart gridlines, the
  canvas graph-paper grid.
- *reduced-motion honored; no design-system regression* — **met**: the two uncovered transforms (compass
  needle, guide chevron) are now gated; screenshots captured under emulated `prefers-reduced-motion` and
  `forced-colors`.
- *Gate green* — **met** (above). *Screenshots + keyboard walkthrough* — **met**, `docs/sessions/S7/`.

**Evidence / artifacts** (gitignored): `docs/sessions/S7/` — `01-canvas-focused.jpg`,
`02-keyboard-placed-pods.jpg`, `03-keyboard-adjusted.jpg`, `04-door-via-keyboard.jpg`,
`05-focus-ring-tab.jpg`, `05b-focus-ring-zoom.jpg`, `06-reduced-motion.jpg`, `07-forced-colors.jpg`,
`08-design-plan-theme.jpg`, `backup.json`.

**Self-review (3 agents over the real diff) — findings and what happened to each.**
`code-reviewer`: 1 HIGH, 0 others. `silent-failure-hunter`: 2 confirmed + 1 bonus. `a11y-architect`: a hard
review, 16 findings. **Everything that was a defect in what S7 shipped is FIXED and re-verified live:**
- **HIGH — `prevAnnounceRef` written during render.** Found independently by TWO agents, both with a working
  repro. `main.tsx` wraps the app in `<StrictMode>`, which double-invokes the render body; the ref persisted
  between invocations, so the committing pass always saw `prev === current`, `countsChanged` was permanently
  false, and **the scene-inventory clause was never announced again after mount — in dev only**, i.e. exactly
  where this project does its live verification. Moved into an effect (the `useLockIgnition` pattern), and
  `shell.a11y.test.tsx` now renders under `<StrictMode>` so the class of bug cannot return silently.
- **CONFIRMED silent no-op — `d`/`w` on a non-wall.** `{type:'object'}` spans wall/rect/circle, so the
  dispatcher cannot tell them apart and `App` just returned. For a user whose only channel is a live region,
  silence is indistinguishable from a broken app. Now announces *"Select a wall first — doors can only be
  added to a wall."* (proven live). Escape likewise announces *"Selection cleared."*, and a marquee announces
  its count.
- **CONFIRMED vacuous-pass risks in the test helpers.** `axe.run` on an empty container reports zero
  violations, and `results.incomplete` was being dropped entirely. `src/test/axe.ts` now fails when no rule
  applied, and fails on any `incomplete` not on an explicitly-reasoned `KNOWN_INCOMPLETE` list. **The guard
  bit immediately**, surfacing three genuine unknowns (`form-field-multiple-labels`, `landmark-one-main`,
  `page-has-heading-one`) that had been passing invisibly; all three are jsdom limitations, each is listed
  with its reason, and the two structural facts are now asserted by hand instead.
- **BONUS — a false comment.** `a11y-env.ts` claimed the stubbed `lang`/`<title>` were "asserted against
  index.html separately". They were not. Made true: `src/__tests__/index-html.test.ts` reads the shipped file.
- **`Toast` comment contradicted its code** — it claimed the live region wrapped only the message while the
  attributes sat on the outer div containing the buttons. Restructured into two ALWAYS-MOUNTED regions (a
  region born with its text is unreliably announced; politeness must not be mutated on a live node), the
  buttons moved out of the atomic region, and the persistent Cmd+Z route is now named in the spoken text
  (WCAG 2.2.1, since the Undo button expires with the toast).
- **`aria-pressed` → `aria-current`** on the seat picks (exactly one is active and it cannot be un-pressed),
  with a STABLE accessible name (a name that changes with state announces state twice and breaks
  voice-control targeting), plus an explicit `role="list"` (WebKit strips list semantics from a
  `list-style:none` list, which silently voided the `aria-label`). Two stale comments corrected.
- **`speakableUnits` grammar** — "a 60° triangle" was spoken as "60 degrees triangle"; now "60-degree
  triangle" (narrowly, since the broad rule mangles the predicative "subtends 58° at your head"). The
  SELECTION text now goes through the same expansion — it was saying "0.74 m" while the readout said
  "metres" a second later.
- **`canvasFocused` keyed off a CSS class** — a rename would have disabled n/p/d/w with every test still
  green. Now identified by tag + role.
- **Contrast scanner widened** to `src/styles/*.css` (it walked only `components/<area>/*.css`), with an
  anti-vacuous guard on the file count.

**Deliberately NOT fixed — scheduled, not skipped.** The `a11y-architect` raised four architectural findings
that are genuinely a follow-up session's work, and it ordered them itself. They are recorded here as a named
block with their own Acceptance so they cannot be quietly lost:
1. **A parallel DOM control list for the canvas.** `role="application"` + a key map serves a *desktop
   screen-reader* user, but on iOS VoiceOver / Android TalkBack there is no keyboard, so every wall, seat and
   object is unreachable; and the sidebar covers only ~4 of the 27 traversable entities. A visually-hidden
   `listbox`/`tree` over the existing `cycleOrder` would satisfy 4.1.2 with real roles, work by swipe, and
   make `role="application"` unnecessary.
2. **No keyboard pan or zoom, and cycling does not scroll the selection into view** — so a sighted
   keyboard-only user can select an entity that is off-screen and see nothing change (the live region carries
   it, but that serves only screen-reader users).
3. **WCAG 2.1.4 Character Key Shortcuts (Level A) is still failing** for the PRE-EXISTING single-key
   shortcuts `t`, the digits, `q`/`e` and `r`: they fire on `<body>` focus with no way to turn them off. S7
   scoped its OWN new keys behind `canvasFocused`, but did not retro-fit the older ones.
4. **The four hand-rolled `role="dialog"` overlays implement no part of the dialog contract** (no
   `aria-modal` on the gallery, no focus trap, no initial focus, and the two stage-anchored ones sit BEFORE
   the sidebar in DOM order, so Tab leaves the app). Pre-existing; S7's `tabIndex={-1}` change removed a tab
   stop between them, which does not fix the ordering.
Also deferred: `aria-valuetext` on the range inputs (the `<output>` now silenced holds the unit, so sliders
announce a bare number), and a visible keyboard-shortcuts surface — today `CANVAS_HELP` exists ONLY as
`sr-only` text, so a sighted keyboard-only user has no way to discover `n`/`p`/`d`/`w`.

**Notable in-session catch.** The first focus-ring implementation used `box-shadow: inset`, and
`getComputedStyle` happily reported it — but a **pixel diff of the focused vs blurred canvas edge was
byte-identical**: a canvas paints its bitmap over its own background, so an inset shadow is invisible.
Re-done as `outline` + negative `outline-offset` (+ a dark companion ring on the wrapper via `:has()`, because
`--accent` alone is 1.03:1 against the best-spot green). Verified by re-running the pixel diff.

**Scope guard.** `src/engine/optimize.ts`, `rooms.ts`, `stereo.ts` **byte-unchanged**; `db.ts` and the scene
data model untouched; `verdict.ts` byte-unchanged (the speech-only unit expansion lives in `announce.ts`).
The only `src/engine` edit is `render.ts` (presentation: `export const THEMES` + one gridLabel alpha).

**Data safety.** The owner's real layout was backed up FULL-FIDELITY to `docs/sessions/S7/backup.json`
(gitignored) BEFORE any live work, and `layout-mrwb0lnz-28-u87ub` "Maple Court" verified `updatedAt`
**1784738154671 — byte-identical** before and after, 24 objects / 2 speakers / 1 layout, nothing deleted. All
interactive testing ran on **fresh headless-Chrome profiles** (fresh origin ⇒ the app's own IndexedDB, never
theirs). Only the `meta` row's `updatedAt` advances, which is the normal per-boot rewrite the app does every
time the owner opens it. No real address in any committable file.

**Honest limits.** Live checks ran ONE browser (Chromium). No real screen reader was driven — the utterances
above are the live-region TEXT read out of the DOM, not VoiceOver/NVDA output; a real-AT pass on
`role="application"` remains the one thing code inspection cannot settle. jsdom axe cannot evaluate computed
contrast, the ≤960px layout, focus-ring rendering, `forced-colors` or `target-size` (all stated in
`src/test/axe.ts` and CLAUDE.md; the first is why the token test exists, the rest were checked in real Chrome).
The ~20 `.tsx` components touched remain without behavioural unit tests — that is **S10's** scope, deliberately
not absorbed here; S7 added rendering-only a11y assertions.

Next: **Session 8-remainder** — done, see below.

---

### Session 8-remainder — security hardening + README rewrite (2026-07-22) ✅

**Shipped.** A strict CSP + security headers delivered three ways from one source of truth; an
input-boundary hardening pass that fixes real data loss; a README rewritten to the standard with 9
live screenshots; plus an owner-reported rotation-granularity fix and a prioritized ideas backlog.

**CSP + headers.** `src/security-headers.ts` is the single source; a build-only Vite plugin
(`apply:'build'` + `transformIndexHtml` + `injectTo:'head-prepend'`) injects the `<meta>` policy,
and `public/_headers` + `vercel.json` carry the real headers. `default-src 'none'` with **no nonce
and no hash**. `frame-ancestors` is header-only (ignored in meta per CSP3 §3.3, and Chrome errors
on it). `upgrade-insecure-requests` deliberately excluded — it kills the app over plain http on a
LAN address *without producing a CSP violation*. `preview.headers` is a harness and ships nothing.

**Input boundary — the design that changed after adversarial review.** The first spec clamped
coordinates and truncated arrays in `sanitizeScene`. A skeptic measured that this **silently
flattens a legitimate 42-room layout** (75 walls onto one line) which autosave then overwrites, and
separately proved the DoS estimate was wrong by two orders of magnitude (3.7–6 h, not ~4 min,
because cost is multiplicative in `objects × pairs` and only span had been varied). The spec was
rewritten: **the load path mangles nothing**; untrusted files are **rejected** at import by
`importRejection`. Also fixed: two throw sites that let one hostile record replace every layout the
user owned; sanitizer output aliasing the caller's parse tree; and an id-collision that silently
moved the active seat (and unlinked stereo pairs) — seats and speakers now claim ids before objects.

**Honest limit (do not upgrade without measuring):** worst-case CPU for a payload tuned to sit under
every import limit is **mitigated, not closed**. Bounding it needs an iteration cap inside
`bestspot.ts`/`pairspot.ts`, frozen this session — now **P0 in `docs/ideas.md`**, because the same
cap also fixes a real usability cliff (a legit 10-room house already costs ~200 ms *per edit*).

**Owner-reported fix (mid-session).** Rotation was 5° per tap — too coarse to sit furniture flush
against a wall, since real walls sit at arbitrary angles. Now **1° fine / 15° with ⇧**, and the
touch HUD gained **press-and-hold to repeat** (tap = one step, hold = continuous), with the whole
hold collapsing into one undo entry. Delete deliberately opts out of repeat.

---

#### EVIDENCE BLOCK — Session 8-remainder

**Agents spawned (16 total, 0 errors).**

*Investigation (8):* sanitizer boundary map · empirical cost curve · CSP delivery design · README
audit — each followed by an adversarial skeptic. Verdicts: the CSP design **survived** with 8
corrections (incl. the LAN-IP blind spot and the `worker-src`/`connect-src` forward note); the
README audit was **partly refuted** (it cleared a genuine deep-dive overstatement about which
openings reflections refuse, and proposed selectors that did not exist); the hardening spec was
**REFUTED on its two central claims** (see above) — the single most valuable result of the session.

*Self-review (8):* `security-reviewer` · `code-reviewer` · `silent-failure-hunter` ·
README fact-check — each with a skeptic. Surviving findings, all fixed: a **MEDIUM** where the new
forbidden-API scanner walked the *parent* of the repo (581 files, 499 in sibling worktrees —
self-concealing, since both vacuity guards still passed); `docs/security.md` overclaiming "no
coordinate is clamped" (heights/seat-z/seat-count bounds do exist, all unreachable from
app-produced data); the per-record isolation having **zero** coverage; the CSP plugin being
untestable; dropped IDB records vanishing silently; and four README facts (engine test
attribution, Node range, "no DOM", canvas-focus precondition). Two findings were **refuted** and
dropped rather than actioned.

**Test count:** 613 → **649** (34 files). Never dropped, nothing skipped.

**Gate (literal tails):**
```
> eslint .
                                    ← 0 problems

 Test Files  34 passed (34)
      Tests  649 passed (649)

dist/index.html                   1.31 kB │ gzip:   0.62 kB
dist/assets/index-DEe17nU-.css   43.19 kB │ gzip:   8.24 kB
dist/assets/index-Dt47rcLd.js   404.69 kB │ gzip: 130.58 kB
✓ built in 488ms
```

**Live verification (headless Chrome, fresh profiles).**
- CSP: **18/18 golden-path steps × 3 configurations** (meta-only · meta + real headers · plain http
  on LAN IP 192.168.1.72) → **0 violations, 0 page errors, 0 failed requests**. Every run carried a
  **negative control** (an injected inline `<script>` MUST be blocked) — without it "0 violations"
  is unfalsifiable.
- Dev server unaffected: serves the inline react-refresh preamble + `/@vite/client` with **0** CSP
  tags. `dist/index.html` charset at byte **488** (< 1024). Policy module **not** in the bundle.
- Hostile import through the real UI (`DOM.setFileInputFiles`): the 354-byte `r:1e308` brick, a
  1e17 coordinate, span 1200 m, 200 000 objects, a 5 000-char id and a non-layout file were all
  **refused with a specific message in ~250 ms**, store unchanged, page responsive. `speakers:[null]`
  and `rooms:[null]` now import cleanly instead of eating the store. Saved:
  `docs/sessions/S8/hostile-import.txt`.
- Rotation: one `e` tap = **1.000°**, ⇧+E = **15.000°**, touch tap = **1.00°**, 1.2 s hold =
  **20.00°**, after release = **0.00°** (no runaway timer) — all read from IndexedDB.

**Artifacts:** `docs/screenshots/01..09` (committed) · `docs/sessions/S8/{backup.json,
hostile-import.txt, csp-goldenpath-final.jpg, csp-plain-http-lan.jpg}` (gitignored).

**Data safety.** Owner's layout read **without booting the app** (same-origin static asset), so not
even the `meta` row advanced. Verified byte-identical at session end: `layout-mrwb0lnz-28-u87ub`,
`updatedAt` **1784738154671**, 24 objects / 2 speakers / 1 seat / 0 underlays. All interactive
testing ran on fresh `--user-data-dir` profiles. An absolute home path was scrubbed from a tracked
doc (found by a skeptic, not by my own first scan).

**Owner decision recorded.** Asked directly whether README screenshots of the bundled demo — which
the S12 block said was the owner's real home and must never be published — could go to the public
repo, the owner answered *"pulbish and change the rules. idc about privacy"*. The never-publish
clause is retired in both `CLAUDE.md` and this file; the street address stays scrubbed.

**Acceptance → outcome.** CSP + headers live-verified in both modes with delivery limits stated ✅ ·
`npm run dev` still works ✅ · hostile/oversized/malformed imports fail safely with a visible error,
store intact, no hang ✅ · new pure guards failing-first tested in the right vitest project ✅ ·
README meets `readme-standards.md` (9 committed screenshots, no placeholder text, correct counts,
real deep-dive) ✅ · gate green ✅ · owner's layout untouched ✅ · six frozen engine files
byte-unchanged ✅ (`git diff` = 0 lines). **Deferred, named:** the grid-loop iteration cap (P0 in
`docs/ideas.md`).

**Honest limits.** One browser (headless Chrome); no Firefox/Safari. No real screen reader. No
actual deployment to Netlify/Cloudflare/Vercel — header *values* and `dist/_headers` placement are
proven, host plumbing is not.

---

---

### Post-S8 owner-reported fixes + self-review closeout (2026-07-23) ✅

Landed on `main` after the S8-remainder evidence block above, in order:

- **Finer rotation** (`8511446`): the rotate step was 5°/tap — too coarse to sit furniture flush against a wall
  (real walls sit at arbitrary angles; Maple Court's front wall is −11.73°, where a 5° step oscillates between
  −10° and −15° and can never land). Now **1° fine / 15° with ⇧**, and the touch HUD gained **press-and-hold to
  repeat** (tap = one step, hold = continuous sweep, whole hold = one undo entry; Delete opts out). Live-verified
  in headless Chrome reading rotations back from IndexedDB: tap 1.000°, ⇧+E 15.000°, hold 1.2 s → 20.00°, 0.00°
  after release.
- **+Door/+Window chip made clickable** (`ddbd1f4`): the owner reported "i cant click it cause it runs away from
  the mouse." THREE independent causes, each fatal alone — a `transform`-vs-`translate` clash under the `pop-in`
  animation (the chip jumped ~70px), relocation to the nearest of 15 walls, and the canvas's `onPointerLeave`
  destroying the chip the instant it was touched. All three fixed and proven end-to-end (place a door → scene
  goes 0→1). New hard-won lessons recorded in `CLAUDE.md`.
- **Self-review closeout** (`b94832c`, `004683c`): the S8 self-review's security skeptic (read late — I'd
  extracted the journal at 6 of 8 agents) had a FINAL ACTION LIST I completed here. A false "low seconds" CPU
  claim corrected to the measured ~157 s (and `MAX_IMPORT_SPEAKERS` tightened 200→64); rooms brought into
  `seenIds` dedup and `importRejection`'s id-length cap (they bypassed both — a shared room id made `deleteRoom`
  remove both areas, and a 5 MB room id sailed through); the "no modulepreload polyfill" claim corrected (Vite
  bundles it; it just never runs); and the forbidden-API scan extended to `outerHTML`/`insertAdjacentHTML`/
  `document.write`. All failing-first tested.

Test ratchet across this arc: 644 → 649 → 655 → 659 → **666** (34 files). Frozen engine files byte-unchanged
throughout. Owner's real layout verified byte-identical (`updatedAt` 1784738154671).

Also written this session: **`docs/kickoff-door-swing.md`** — a full, ready-to-run kickoff for the
owner-requested door width + swing feature (`ideas.md` item 3b), grounding the next session in the completed
data-model + UX investigations and front-loading the acoustics/spec/skeptic pass that hit the usage limit.

---

Next: **the owner-requested door width + swing feature** — kickoff in
[`kickoff-door-swing.md`](kickoff-door-swing.md) — is the natural continuation. Otherwise **Session 12
(auto-detect walls accuracy overhaul)** in [`kickoff-session-12.md`](kickoff-session-12.md). Unscheduled ideas,
prioritized, live in [`ideas.md`](ideas.md) — including the owner-requested **guided tutorial mode** (P1, with a
full design written up) and the **grid-loop iteration cap** (P0 — safety + real per-edit slowness).

---

**KICKOFF PROMPT (Session 8-remainder — security hardening + README rewrite, the NEXT session)**

> **The full prompt lives in [`docs/kickoff-session-8.md`](kickoff-session-8.md)** — paste that
> file's contents as the next session's opening message. It is kept as its own file because it
> carries ~200 lines of *empirically verified* technical findings, produced at the end of S7 by a
> 6-agent research pass with two adversarial skeptics (real production builds, a live
> headless-Chrome CSP probe driving 38 clicks, and hostile engine payloads executed under Node).
>
> Headline facts it establishes, so they are not lost if that file is ever mislaid:
> - **`script-src 'self'` suffices — no nonce, no hash.** `dist/index.html` has exactly one
>   script tag, external, and zero inline script/style (the app has no dynamic imports, so Vite
>   emits no inline modulepreload polyfill).
> - **`style-src 'self'` needs no `'unsafe-inline'`**: React 19 writes inline styles via CSSOM
>   (`style.setProperty`), never `setAttribute('style')` — verified against 41 `[style]` elements
>   with a live blocked-probe as the control.
> - `img-src` needs BOTH `data:` (favicon + underlay) and `blob:` (photo import); `font-src 'self'`
>   is required independently for the two `as="font"` preloads.
> - **Drop `upgrade-insecure-requests`** — it is a total outage on a plain-http host and the
>   failure does NOT appear as a CSP violation.
> - **Do not put the CSP meta in the source `index.html`** — the dev server injects an inline
>   react-refresh preamble and an HMR WebSocket, so it breaks `npm run dev` via
>   `style-src`/`connect-src`. Inject at build time (`apply:'build'` + `transformIndexHtml`).
> - There is **no deploy target in the repo at all**, and `npm run preview` sends no headers.
> - **The real import bug is a ~760-byte layout** that makes `bestListeningSpot` quadratic in
>   span (1.45 s per recompute at span 1200) — it COMMITS and PERSISTS, so it bricks the origin
>   on every boot. The spectacular `1e17` infinite loop (`bestspot.ts:150`, step floor-clamped at
>   0.7) never commits, so a reload recovers. A single circle with `r = 1e308` triggers it too —
>   `Math.max(0.05, o.r)` has no upper bound.
> - `speakers:[null]` and `rooms:[null]` THROW in the sanitizer, and in `loadStore` that silently
>   replaces the **entire store** with defaults.
> - NaN cannot get in, but is **manufactured** downstream: `sceneBounds`' finite guard
>   (`scene.ts:377`) is one-sided, so `quality` becomes NaN and the hero silently reads
>   "No lock yet" with a `width: NaN%` meter.
> - **Prototype pollution is NOT reachable** (verified five ways) and **a `file.size` gate on
>   photo import is the wrong control** (a valid 192 MB PNG decodes in 197 ms; a 1.17 MB
>   decompression bomb decodes fine; Chrome's own pixel cap rejects the huge one in 7 ms).
>   Do not ship either as though it were a fix.
> - The README's problem is NOT that it is structurally stale — it has the right sections. Its
>   Screenshots section is an explicit "coming soon" **placeholder** (which the repo's own
>   standard bans outright), its walkthrough describes the pre-S13/S14 UI, and it claims
>   140 tests.

### S17 — Doors & Windows: easy placement + door swing (2026-07-23) ✅

Implements `docs/ideas.md` **3b** (owner-requested: "make doors/windows easy + select how far the
door swings given its size"). Heavy by the objective triggers (data model + migration + sanitizer +
>1 file), so it ran under the full protocol.

**What shipped (Group 1 + Group 2a–e):**
- **Data model** — `RectObj` gains door-only `swingDeg?`(0–180, default 90)/`hingeEnd?`('start'|'end')/
  `swingSide?`('in'|'out'); clamped in `scene.ts` `sanitizeObject` (allow-list, finite, `undefined` for
  non-doors), defaulted in `makeOpening`. `ToolMode` gains `'opening'`.
- **Render** — new pure `canvas/door-swing.ts` (`doorSwing(o)`: hinge/latch/along/leaf/arc math);
  `render.ts` replaces the hardcoded `Math.PI/2.6` with `swingDeg`, honours hinge/side, draws jamb
  ticks + leaf (solid=open, dashed=closed) + the minor-wedge clearance arc + a plan-theme dimension
  pill. Both themes.
- **Creation** — DESIGN/Build `opening` tool (digit 5, click a wall, ⇧=window, ghost via the canvas
  `preview` path, places on pointer-DOWN); `addPreset`→`openingNearPoint` drops onto the nearest wall;
  the hover chip is DESIGN+`!overlayOpen`-gated (closing a pre-existing mutate-through-a-dialog hole);
  `d`/`w` keys unchanged.
- **Inspector** — door-only branch: Width 0.6–2.4 "clear opening" + 70/80/90 cm presets, Swing slider
  (`<output aria-live=off>`), Hinge/Swing `aria-pressed` flip pairs (role=group, not radiogroup),
  doorOpen checkbox, honest hint ("the swing arc … doesn't change the sound"); Depth/Rotation dropped.
- **Keyboard** — `f`/`⇧F` flip hinge/swing (`flipDoor`, DESIGN-scoped, same-ref no-op on non-doors);
  `canvas-help.ts` + Legend + GuidePanel copy. Door rotation is now wall-locked (`rotateSelectedRect`
  + `canRotateSel` no-op/disable on doors).

**Acoustic decision: PLAN-ONLY.** The swing changes no acoustics — `doorOpen` stays the sole switch.
The 6 frozen engine files (`optimize/rooms/stereo/raytrace/pairspot/bestspot`) are **byte-unchanged**
(`git diff --stat` empty). **Deferred to its own block: G2f** (swing-aware furniture corridors in
`arrange.ts`) with named acceptance — see `docs/ideas.md` §3b.

**EVIDENCE BLOCK**
- **Agents (role → verdict):** design-pass Workflow (4 agents) — acoustics-equivalence prover →
  **CONFIRMED** (plan-only exact; all 12 door read-sites bottom out in role/doorOpen/w/rectCorners/
  absorption/height); migration-safety skeptic → **CONFIRMED** (additive; only visible delta is
  69.23°→90°); UX/a11y/security skeptic → **5 RISK, 0 BLOCK** (all guarded); synthesis → locked spec.
  Self-review: **code-reviewer** → 1 HIGH (reflex arc on `swing out`) + 1 MED (ghost not cleared on
  pointer-leave) → both fixed; **silent-failure-hunter** → 1 HIGH (click-off-wall silent no-op) + 1
  MED-HIGH (door rotation unenforced) + 1 MED (0°-swing open door = solid wall) → all fixed;
  **a11y-architect** → MEETS the S7 bar, 0 regressions. All findings re-verified.
- **Test count:** 666 → **711** (+45; ratchet respected, none skipped/weakened).
- **Gate (literal tails pasted in the session):** `npm run lint` → 0 problems · `npm test` → **711
  passed (38 files)** · `npm run build` → clean, **410.66 kB / 132.32 kB gz** JS + 43.18/8.24 gz CSS
  + 1.31 kB HTML.
- **Coverage (touched files):** door-swing.ts **100%**, mode/app-constants/canvas-help **100%**,
  interaction **99.5%**, placement **100%**, keyboard **97.1%**, scene **97.6%**, Legend **96.9%**,
  CanvasStage/GuidePanel/Toolbar ~86–88%. `render.ts` (10.7%) + `SimCanvas.tsx` (24%) are the canvas
  renderer + pointer component that are structurally un-unit-testable here (documented); their pure
  logic lives in the 100%-covered helpers and the paths were driven LIVE.
- **Live (CDP, fresh Chrome profile — owner's real data never touched):** seeded a disposable 6-door
  showcase; screenshots `docs/sessions/S17/{live-canvas-plan,live-canvas-sound,live-inspector-door}.jpg`
  verify the swing symbol in BOTH themes (90/45/hinge-flip/side-flip/closed/0°, arc-fix + jamb ticks +
  0°-door-not-wall), and an interactive drive placed a door via the tool (IDB doors **6→7**), rendered
  the door inspector (swing slider present), and surfaced the off-wall notice.
- **Acceptance:** create-easy ✅ · width-bounds+presets ✅ · swing selectable+drawn ✅ · acoustic-meaning
  stated+tested ✅ · migration proven (old-shape door → defaults, acoustics == fresh) ✅ · tests
  failing-first ✅ · gate green ✅ · frozen engine unchanged ✅ · CSP intact (React inline styles only;
  security-headers test green) ✅.

### S18 — Grid-loop cap: bound the engine's grid sweeps (2026-07-27) ✅

**Closes the S8 "worst-case CPU is mitigated, not closed" limit** (`docs/ideas.md` §2, P0) — the safety
half of it. `bestListeningSpot` and `bestPairSpot` swept `sceneBounds` at a step with a ceiling
(`min(0.7, span/24)` and a fixed 0.35), so cell count grew as `span²` with nothing above it.

**What landed.** New pure leaf module `src/engine/grid.ts` (imports `types` only; takes `bounds` as a
parameter, so no `scene→grid→scene` cycle). It bounds each sweep by TWO ceilings, because neither alone
is sufficient and they catch disjoint attack shapes:

- `MAX_GRID_CELLS` **160 000** — the huge-span/cheap-cell shape (a 400 m square with 20 walls has
  1 243 528 pairspot cells at a work product *below* several legitimate scenes, so a work budget cannot
  see it), and the only guard on the LOAD path, which `importRejection` never inspects: bounded solely
  by `MAX_SCENE_SPAN`, pairspot projects **3.27 billion** cells — an OOM, not a stall.
- `MAX_GRID_WORK` **1.5 × 10⁸** on `cells × perCellCost` — the expensive-cell shape, which a cell ceiling
  cannot bound because per-cell cost is itself unbounded from the boundary's side (5 000 objects × 64
  speakers measures **47.8 ms per cell**).

Both are calibrated against an **enumerated** protected set (`src/engine/__tests__/fixtures/legit-scenes.ts`),
not taste. Bit-identity is structural: `cappedStep` returns its `baseStep` through `Math.max` — the
identical float — and `step` is the only value the cap feeds into either loop.

**Also closed: a non-termination class S8 missed.** Whether `t += step` advances depends on the box's
absolute **coordinates**, not its span. A room of an ordinary 400 m span at x ≈ 4.6e15 cannot advance a
0.35 m step; past ≈ 1e21 `clampSpan` rounds both ends to the midpoint so the span is exactly 0 and every
`span > 0` guard waves it through. Both reachable via the load path. `minAdvancingStep` floors every step
at `2·|coord|·ε`. The same effect also broke the cell **projection** (`t += step` rounds down, so more
cells fit than `span/step` predicts — measured 502 real against 500 projected), so `gridCells` is now
origin-aware.

**Measured (node 25, `docs/sessions/S18/bench/`), one full simulation pass:**

| payload (all import-ACCEPTED) | before | after |
|---|---|---|
| bundled demo · 10-room chain | 61 ms · 177 ms | 63 ms · 182 ms (unchanged) |
| span 90.6 m, 100 obj, 64 spk | 16.5 s | 5.0 s |
| span 180.6 m, 100 obj, 64 spk | 65.1 s | 5.0 s |
| **span 359.7 m, 100 obj, 64 spk** | **264.6 s** | **4.9 s** |
| span 30 m, **5 000 obj**, 64 spk | 93.5 s | 4.7 s |
| span 399 m, 5 000 obj, 64 spk | hours (never completed) | 4.5 s |

Cost is now flat in span, which was the unbounded direction.

**What was NOT delivered, and why it is structural.** `docs/ideas.md` §2 claimed two payoffs. The
everyday-slowness half is **not** fixed and this cap cannot fix it: a 50-room chain still costs 14.2 s
per edit and a 100-room chain 106.1 s, *unchanged*, because their cost is not span-driven — it comes from
`bestReflectionDb` (O(walls × (objects + surfaces))), which the cost proxy deliberately omits. A
legitimate multi-room house is the wall-heaviest thing in the app, so a walls-aware budget fires on real
data: measured, a legit 50-room chain at the 64-speaker import ceiling scores **20× higher** than the
wall-heavy attack. The same blind spot is the last security residual (a 20-wall/64-speaker/span-399
payload still costs **132.2 s**). Rescheduled with its own acceptance as `docs/ideas.md` **§2b**
(bound the reflection search) and **§2c** (`traceScene`, structurally immune to a span cap because
`MAX_RANGE` 60 clips every ray, plus `arrange.ts` `openSlots`).

**EVIDENCE BLOCK**
- **Agents (role → verdict):** design Workflow, 11 agents. *Understand* ×4 — cost-model, legitimate-scene
  sizer, import-boundary, test-scout; the sizer overturned my calibration by finding the UI's `clampDim`
  max is 25 m (so a 16-room chain spans exactly 400 m), and the test-scout **refuted** the premise that a
  closed-form cell count can equal the loop count (±1 per axis from float drift). *Design* ×3
  (shared-helper / inline / cost-aware) → the cost-aware design **caught a live data-loss bug in my
  own already-landed implementation**: `MAX_GRID_CELLS = 32 000` fired on the span-400,
  import-ACCEPTED 16×(25×25) chain with only two speakers — the exact S8 failure mode. Recalibrated.
  *Judge* → full spec. *Skeptics* ×3 — correctness/bit-identity **SURVIVES WITH CAVEATS**;
  numerics/termination **REFUTED** (found the large-coordinate infinite loop, fixed above);
  scope/completeness **REFUTED** the "closed" wording (`traceScene` is now dominant and span-immune, so
  the doc must not claim closure). All three findings were real and are fixed or documented.
  **Self-review over the actual diff — all three found real defects, all fixed:**
  `silent-failure-hunter` → **1 CRITICAL** (the "never lose the last row" clamp is derived from box SHAPE
  alone, so it silently outranked `MAX_GRID_WORK` — 1.75× over on a 400 × 2 m corridor, unbounded on the
  load path; the suite was green because nothing asserted `cells × cost`) + 1 MED (`cellBudget` failed
  toward the LEAST protective budget on a non-finite cost, guarded only by a tautological `>= 1` test)
  + 1 HIGH (the protected-set enumeration omits the photo-import/detect/calibrate path, which has no
  scale ceiling) + 1 MED (no diagnostic signal when the cap engages). First two fixed with tests that
  fail against the old code; the latter two documented and rescheduled.
  `code-reviewer` → **1 real defect**: `cappedStep` solved the closed form against the RAW span while
  `gridCells` policed the budget against the origin-shrunk *effective* step, so a large-origin box could
  visit **3.9× its budget**. Fixed by adding the slip back into the solve; the new test was verified
  falsifiable (fails against the defect: 162 409 > 160 000). Also: a `minStep` naming collision (renamed
  `coarsened`) and a stale test count — both fixed.
  `performance-optimizer` → **REFUTED my `traceScene` claim** (at the ceiling `bestListeningSpot` is
  3.5–4.1 s vs `traceScene` 0.6–0.9 s, so `traceScene` is *not* dominant there — docs corrected), showed
  the reflection blind spot **grows without bound in wall count** (740× under-estimate at 20 walls →
  11 600× at 4 000, so the tested 132.2 s is not the ceiling — docs corrected), measured `regionOf` and
  `optimize.ts` clean, and put real numbers on `arrange.openSlots` (6.85 s at span 399; ~370 ms per
  existing object; 30+ minutes projected at the ceiling) — promoting §2c from P2 to P1. Confirmed
  `cappedStep` runs once per sweep with no new per-cell allocation.
- **Test count:** 711 → **760** (+49; ratchet respected, none skipped/`.only`'d/weakened).
- **Gate (literal tails pasted in-session):** `npm run lint` → 0 problems · `npm test` → **760 passed
  (40 files)** · `npm run build` → clean, **411.72 kB / 132.71 kB gz** JS (+1.0 kB / +0.36 kB gz for
  `grid.ts`) + 43.18/8.24 gz CSS + 1.31 kB HTML.
- **Coverage (touched files):** `grid.ts` **100%** (stmts/branch/funcs/lines) · `bestspot.ts` 98.28% ·
  `pairspot.ts` 93.66% · `scene.ts` 97.57% (comment-only change).
- **Bit-identity proof:** a golden captured from the **pre-cap** engine (`make-golden.ts`, run against a
  stashed-out cap) → **30/30 byte-identical** across `bestListeningSpot` × {tv, coarse} and
  `computeAudio().pairs` for the demo, the max-size UI room, the 10-room chain and the 50-room chain at
  4 and 16 speakers. Plus step-identity over the full enumerated protected set, and **two negative
  controls** (the `coarse` lever genuinely moves the answer; a moved speaker genuinely breaks the golden).
- **Live (fresh headless-Chrome profile — owner's real data never touched):**
  `docs/sessions/S18/live-tune-sound.jpg`, `live-design-plan.jpg`, `live-tune-after-nudge.jpg`. App boots
  with **zero console errors**, the seeded demo still reads **"Phantom center locked"**, both canvas
  themes render unchanged, mode switching works, and five seat-nudges (five full re-simulations) took
  **27 ms** total. ONE browser; no real screen reader was driven.
- **Acceptance:** worst case bounded + measured before/after ✅ · legitimate scenes bit-identical, proven
  against a pre-cap golden ✅ · cap is a deterministic integer, tested directly (and the one wall-clock
  assertion was **removed** after it flaked at 10.18 s under `--coverage`) ✅ · failing-first tests, ratchet
  up ✅ · frozen engine files other than `bestspot`/`pairspot` byte-unchanged (`git diff --stat`; `scene.ts`
  is comments only) ✅ · CSP/security posture intact ✅ · `docs/security.md` updated with real numbers ✅ ·
  **"limit fully closed" NOT claimed** — three residuals documented with measurements and rescheduled
  (§2b/§2c), which is a deliberate deviation from the kickoff's "sub-second, closed" wording, taken
  because bit-identity on legitimate wall-heavy houses provably forbids it.

### S19 — Bound the reflection search: the everyday-slowness half (2026-07-27) ✅

`ideas.md` §2b. S18 capped the grid sweeps and said plainly that this did nothing for a legitimate
50-room chain — 14.2 s per edit, unchanged — because that scene's grids are never capped at all. Its
cost, and the cost of the last security residual, is the same term: `bestReflectionDb`, the
blocked-line-of-sight fallback, measured at **94–100 % of a simulation pass** on every wall-heavy scene.
The two shapes load it through *opposite* factors, which is why no single cap could ever have fixed both:

| | calls | µs/call |
|---|---|---|
| 50-room chain (legitimate) | 45 901 | 315 |
| wall-heavy span 399 (attack) | 16 000 000 | 7.7 |

So this session made the work cheaper on both axes rather than capping it.

**What landed.** `src/engine/reflection.ts` (new pure leaf) prepares once per sweep what the old loop
re-derived per cell: per-wall edge vector / direction / `20·log10(keep)` / open-door spans (an O(objects)
scan inside the innermost loop becomes an interval list), and per-(speaker, wall) mirror images. Its
`isBlocked` replaces a per-wall `surfaces.filter(...)` plus two `directPath` calls with one
allocation-free scan — legal because `bestReflectionDb` reads only `.blocked`, a pure existential.
`directOcclusion` is left **byte-unchanged**, keeping the four `.attenuation` readers (including the
on-screen Echogram) out of the blast radius by construction. `geometry.ts` gained `raySegmentT` /
`rayCircleT` / `surfaceT` — the same `t` without `point`/`normal` — which `directOcclusion` now uses.
Two caller-level skips: `bestListeningSpot` drops a cell whose pure geometry scores zero for every pair
(when nothing is unpaired), and `bestPairSpot` short-circuits the second `reachDb` *computation*.

**Measured (node 25, `docs/sessions/S19/bench/{before,after}.txt`), one full simulation pass.**
Ranges are genuine run-to-run spread: the after-runs shared the machine with the review agents, while
the before-column was taken on an idle machine — so the ratios are, if anything, understated.

| payload (all import-ACCEPTED unless noted) | S18 | S19 | |
|---|---|---|---|
| bundled Maple Court demo | 64.4 ms | 50–60 ms | ~1.2× |
| 10-room chain, 4 speakers | 179.8 ms | 40–48 ms | ~4× |
| **50-room chain, 4 speakers** | **13.7 s** | **0.50–0.58 s** | **24–27×** |
| 100-room chain, 4 speakers (span 600, import-rejected) | 102.8 s | 1.8–2.0 s | ~52× |
| span 399, 100 objects, 64 speakers | 4.9 s | 0.12–0.15 s | ~35× |
| walled span 100, 20 walls, 64 speakers | 42.3 s | 4.6–5.6 s | ~8× |
| **walled span 399, 20 walls, 64 speakers** | **129.7 s** | **12.0–13.9 s** | **9–11×** |

**What was NOT delivered.** The wall-heavy payload is **12–14 s** against the ~10 s the kickoff asked for.
Measured split: `computeAudio` 8.5–9.8 s, `bestListeningSpot` 3.4–3.9 s, `traceScene` 0.13 s. The 8.5 s is
`bestPairSpot` sweeping ~154 000 cells once per apex-blocked pair, 32 times, returning `null` for every
one — again work that produces nothing, but its cell gate is *reachability*, which cannot be decided
without the occlusion work it would be avoiding, so the S19 cell-skip has no analogue there.
`reflectionDb` is near its floor at 1.0 µs/call (20 wall iterations, two unavoidable divisions each; the
single-reciprocal fix is exactly the reassociation bit-identity forbids). Rescheduled with its own
acceptance as `docs/ideas.md` **§2d**.

**EVIDENCE BLOCK**

- **Agents (role → verdict).** Design Workflow, 12 agents (3 killed by the 5-hour session limit; the run
  is resumable from its journal). *Understand* ×3 — hot-path anatomist (prototyped and measured three
  variants, verifying 73 810 real calls with `Object.is`, 0 mismatches), equivalence lawyer (measured the
  float-rewrite divergence rates this session's comments quote: nested-hypot 54 %, sqrt 37 %, per-component
  divide 45 %, `2p−s` 3.7 %, product reorder 35 %), blast-radius surveyor (call-site inventory of every
  `.blocked` vs `.attenuation` reader; flagged that `grid-cap-equivalence.test.ts` hand-mirrors the two
  `perCellCost` expressions). *Design* ×4 → *Skeptic*: one verdict returned before the limit —
  **SURVIVES WITH CHANGES** on the caller-level skips, after an 8 000-scene fuzz plus 56 targeted configs
  with 0 mismatches. Its required changes were all taken: the index-parallel `pairQ` scratch array was
  dropped as a desync landmine, the missing ALL-SOLO / MIXED / coincident-pair fixtures were added, and
  every performance number was re-measured on the post-`reflection.ts` tree (it caught the design agent
  quoting 117× where the real figure was 5.9×, *and* under-selling the same change on the payload it had
  declared unreachable). *Self-review* Workflow ×4 dimensions × adversarial verify — see below.
- **Test count:** 760 → **814** (+54). No test skipped, `.only`'d or weakened. Ratchet intact.
- **Coverage** (`npm run test:coverage`, files touched): `reflection.ts` 100 % stmts / 98.78 % branch ·
  `geometry.ts` 100 / 98.11 · `raytrace.ts` 100 / 95.50 · `bestspot.ts` 100 / 96.39 · `pairspot.ts`
  99.03 / 97.56. All ≥ 80 %.
- **Bit-identity.** A golden captured from the PRE-S19 engine (git `c95a57b`) — re-captured twice as the
  corpus grew, each time by checking the old engine back out rather than stashing: **162/162 entries,
  9 180 direct `bestReflectionDb` samples** over 18 branch-coverage scenes. S18's independent legit-scene
  golden: **30/30**. Negative controls that DO fail the harness: nested `Math.hypot` → `sqrt(x*x+y*y)`
  (14 entries), `v.norm` → `v.scale(q, 1/wlen)` (1), `proj+(proj−sp)` → `2*proj−sp` (1), dropping the cell
  skip's `solos.length === 0` guard (8 of 162), and in-suite the `raySegmentT` `u`-tolerance tightening (1 test).
  Controls that do NOT fail it, recorded rather than hidden: `o.w/2/wlen` → `o.w/(2*wlen)`, `u < 0` →
  `u <= 0`, dropping `pairs.length > 0` (provably redundant), and a `q < 0.05` threshold in place of
  `q !== 0` — the first two need an input inside an ulp-wide window, the last needs a scene whose best
  cell is itself near the 0.02 floor.
- **Live (ONE browser, headless Chrome over CDP, FRESH profile ⇒ its own IndexedDB; the owner's real
  layout was never loaded or written).** `docs/sessions/S19/`: `live-tune-sound.jpg`,
  `live-design-plan.jpg`, `live-tune-after-nudge.jpg`, `live-50room-tune.jpg`,
  `live-50room-after-nudge.jpg`, `live-50room-design-plan.jpg`. Seeded demo boots with a LIVE locked
  verdict ("Phantom center locked"); both themes render (`stage` / `stage stage-plan`); a disposable
  50-room chain seeded via localStorage into a cleared IndexedDB loads, renders its 300 m corridor and
  shows a live "No lock yet" readout, with arrow-nudge edits round-tripping in 1–9 ms.
- **Gate:** `npm run lint` clean · `npm test` **814 passed (41 files)** · `npm run build` **413.85 kB /
  133.54 kB gz** JS + 43.18 kB / 8.24 kB gz CSS + 1.31 kB HTML.
- **Acceptance, bullet by bullet.**
  1. 50-room chain < ~2 s — **MET**, 13.7 s → **0.50–0.58 s** (24–27×).
  2. Wall-heavy span-399 < ~10 s — **MISSED**, 129.7 s → **12.0–13.9 s** (9–11×). Measured cause and the
     reason the S19 technique does not transfer are above; deferred to `ideas.md` §2d.
  3. Byte-identical on the protected set *and* the adversarial payloads, against a pre-change golden,
     with a negative control proving the harness can fail — **MET** (162/162 + 30/30; five controls fail
     it, four do not and are named).
  4. New pure helpers failing-first tested; ratchet rises above 760 — **MET** (814).
  5. Spatial-index correctness tested independently — **MET in the form that shipped.** No index was
     shipped: an adversarial analysis showed an AABB test over segments is not *provably* conservative
     (the near-parallel band, which `addRoomShell`'s flush collinear walls reach), so the boxes are used
     as a search ORDER with an unfiltered rescan settling every negative. The brute-force oracle
     (`referenceReflectionDb`, the pre-S19 algorithm transcribed) fuzzes it over randomized scenes at
     origins 0 / 1e3 / 1e5, and a negative-radius-circle test forces the rescan path specifically.
  6. Gate green with all three tails pasted — **MET**.
  7. `security.md` §Worst-case CPU updated; `ideas.md` §2b marked done — **MET**, with §2d added for the
     remainder and the superseded S18 text left as a dated note in the house style.

---

### S20 — Projects (folders) + N-up compare, across layouts and projects (2026-07-28) ✅

Owner-requested, verbatim mid-S19: *"create several layouts just to fill up the app and then make
folders for projects so i can save projects and have multiple designs for one project and be able to
compare multiple layouts at once. as many as needed. and be able to compare different projects as well."*

Four things, and they are not the same feature: seed several layouts · projects-as-folders · compare
N at once · compare across projects. All four landed.

**The data model.** A layout belongs to a project. FLAT — `Layout.projectId` → `Project.id`, with
`LayoutStore.projects` as the list — after a design pass weighed it against nesting the layouts inside
the projects. The judge and the data-loss skeptic both came down on flat, decisively, on one axis:
nesting's natural project-delete is a cascade that removes N layouts behind ONE auto-dismissing toast,
against the owner's standing "never delete my layouts". Flat's `removeProject` re-homes and destroys
nothing. Blast radius was the second argument: ~16 edit sites against ~65, and nesting's 65 concentrate
in `db.ts` / `usePersistence.ts` / `useSceneHistory.ts` — the three modules S1 and S8 proved silent
data loss lives in.

**`DB_VERSION` stays at 1** and `onupgradeneeded` is byte-unchanged. The folder list rides the
existing singleton meta row; membership rides the existing layout record. A fourth object store would
have needed version 2, and that bump has a live user-visible failure: an old tab holds the v1
connection (no `onversionchange` handler exists), the new tab's open fires `onblocked`, `openDB`
**rejects**, `bootstrapPersistence` catches → localStorage mode → the frozen pre-migration snapshot on
screen → autosave overwrites it. Adding a field to an existing record needs no migration at all.

**Required in memory, optional on disk.** That split is the whole compile-time safety argument, and
each half is load-bearing in the opposite direction. Required `Layout.projectId` / `LayoutStore.projects`
turned the seven non-spreading `setStore` literals — duplicate, new, new-room, undo-delete, delete-last,
delete-active, import, i.e. every layout CRUD action — into compile errors instead of silent folder
resets. Optional `LayoutRecord.projectId` / `MetaRecord.projects` is simply the truth for every record
written before S20; the skeptic's sharpest catch was that a *required* `MetaRecord.projects` compiles
`meta.projects.map(...)` clean and throws for 100 % of returning users on first load.

**`assembleStore`** (pure leaf `engine/projects.ts`) is the single seam: ≥1 folder · every `projectId`
resolves (an orphan is RE-HOMED, never dropped, never rendered into no group) · project ids claim the
shared id namespace BEFORE layout ids · layout ids dedup store-wide (a pre-existing bug: two layouts
sharing an id made `updateLayout` write both and `persistNow` `put` both to one IDB key) · nothing
throws. Its call in `loadFromIDB` is wrapped, because an assembly throw would otherwise reach
`bootstrapPersistence`'s catch and destroy the rollback snapshot.

**N-up compare.** N independent `(project, layout, seat)` columns. The perf story is the interesting
part and it is half a win, stated as half: a column reads the trace ONLY through `.direct.blocked`, and
`traceScene` builds `direct` with an independent `directPath` taking neither `rayCount` nor
`maxBounces` — so `directOnlyTrace` is exact BY CONSTRUCTION and 255–1565× cheaper. It is also a ~1×
no-op wherever `computeAudio` dominates (apex-blocked pairs → `bestPairSpot` sweeps), which is
precisely the slow case: 62 ms/column on a 30-room house, ~10.9 s on an adversarial import-legal
payload. So `MAX_COMPARE` = 8 is documented as a **legibility** bound and the CPU control is a measured
slow-column gate.

**Evidence.**
- Agents: 4 understanding maps · 3 competing designs (flat / nested / N-up) · 1 judge · 2 adversarial
  skeptics · 3 self-reviewers over the real diff. Verdicts: judge → **flat, conditionally**; data-loss
  skeptic → **flat is safer, after five specific holes are closed** (all closed); N-up skeptic →
  **the measurement is real but the conclusion drawn from it is not** (accepted — it is why the cap is
  labelled legibility and the gate exists).
- Tests **814 → 961**. New: `projects.test.ts` 39 · `projects-migration.test.ts` 18 (old-shape IDB
  records and an old-shape localStorage blob seeded BY HAND, plus the export→import folder round-trip) ·
  `compute-scenario.test.ts` 17 · `compare-summary.test.ts` 20 · `column-gate.test.ts` 14 ·
  `compare.a11y.test.tsx` 10 · `gallery.a11y.test.tsx` 7 · `useProjectActions.test.tsx` 16 ·
  `seed.test.ts` +6.
- Coverage on everything created: `ids.ts` 100 · `seed.ts` 100 · `compute-scenario.ts` 100 ·
  `projects.ts` 98.6 · `compare-summary.ts` 97.7 · `scene.ts` 97.7 · `LayoutGallery.tsx` 94.4 ·
  `ScenarioCompare.tsx` 91.2 · `column-gate.ts` 100 · `useProjectActions.ts` 98.6 · `db.ts` 89.0. The hooks it EDITS stay under 80 % — the pre-existing,
  documented S10 gap, not made worse.
- Live: fresh headless-Chrome profile, `docs/sessions/S20/shots/` — first run seeds 6 designs across
  2 folders (read back out of IndexedDB, every layout carrying a `projectId`), both canvas themes, the
  folder-grouped gallery, a 4-up cross-project compare, the scrolled track, 390 px mobile, and a reload
  that keeps 6 layouts + 2 folders without re-seeding. 0 console errors.

**The three defects the self-review caught that the suite could not.** The slow-column gate derived its
threshold from the live results and a deferred column deleted its own measurement — it oscillated
forever, doing more work than no gate at all; it is now a pure state machine driven to a fixed point by
its own test. Folder repairs were reported on the dropped-LAYOUT channel, so a repair that loses nothing
raised "your work may be gone" on every boot. And the summary described only the columns it had measured
without saying so — "All three lock" while eight columns are on screen.

**Honest residuals, none of them regressions:** the export-all BUNDLE still has no importer (pre-existing;
the single-layout path now round-trips the folder by name) · a second tab's `saveMeta` overwrites the
folder list wholesale, the same last-writer-wins the app has always had on `activeId` but with a larger
blast radius · a downgrade discards folders (never layouts) · `App.tsx` is 1165 lines against the 800
cap, already 1098 on main. All recorded in `docs/ideas.md` and `docs/database-plan.md` §6b.

---

### S21 — Guided tutorial mode (2026-07-28) ✅ — owner-requested (`docs/ideas.md` §3)

**Shipped.** A guided tour, available at any time from a "Tour" button in the global header and offered
as the primary action on the first-run welcome. `src/components/tutorial/` holds 7 chapters of pure
data; the chapter menu makes each one independently launchable, which is what turns the feature into
re-enterable documentation rather than one-shot onboarding. Two step kinds: `show` (the runner performs
the action and narrates it) and `try` (the runner points, then waits on a pure `done(ctx)` predicate,
with a hint after inaction and a "Show me" rescue so nobody is stranded).

**The spine was designed backwards from the engine, and the numbers chose it.** Three measurements,
not opinions:

1. The lock is a PRECISION condition — with one speaker pinned, only **3–5 cells** of the 0.05 m snap
   grid lock at all (a target ~0.05–0.10 m across, a few pixels at default zoom). "Drag it until it
   locks" would have stalled the tour on its own climax for nearly every user.
2. `keyboardPlacementPoint` puts the first two pods at exactly ±30°, which locks at **quality 0.997**
   in a clean rectangular room — and does **not** lock in the furnished Maple Court demo
   (`apexBlocked`, 0.5). Hence a disposable practice room rather than borrowing the demo.
3. `VerdictHero`'s ignition is a false→true EDGE and mount is never an edge (S15), so a step that lands
   on an already-locked scene shows a static headline and no celebration.

So the runner does the precision placement and the USER makes the pairing click — which IS the edge.
`actions.test.ts` proves the whole chain through the real `traceScene`→`computeAudio`, with an
apartment negative control so the reason the practice room exists cannot be quietly forgotten.

**The four defects the adversarial pass caught that the suite could not.**
- **The climax was dead on every run after the first.** The practice room is reused by name, so it
  still held the previous run's locked pair: `placeTwoPods` no-oped, `locked` was already true when the
  pairing step opened, and with no edge there was no ignition — and nothing on screen to say so.
  `armPairDemo` clears before placing, making the edge unconditional.
- **A chapter launched from the menu wrote into the user's own layout.** `compare`'s first step adds a
  seat; jumping straight to it wrote to whatever was active. `needsPractice` + a corpus test that
  asserts every scene-writing chapter carries it.
- **The spotlight went stale and pointed at the wrong control** — the pair button unmounts the instant
  the pair exists and the sidebar reflows, so the ring ended up around "+ HomePod" exactly when the user
  completed the key action. Now re-measured every render, made loop-safe by `rectsEqual`.
- **"Resumable" was not met** — `progress.resume` was written and never read. The machine gained a
  `resume` event and the menu offers "Continue … — step N of M".

**An owner-reported bug found while this session was running, and it was the worst thing here.** The
on-canvas `Legend` sat at exactly `top:12px; left:12px` — the same coordinates as `.toolstrip` — with
`z-index:6` against the strip's `auto`. `elementFromPoint` at the centre of "Select & move anything (1)"
returned `.legend-toggle`, so the app's PRIMARY tool was not merely obscured but unclickable at every
desktop width, and had been since S16. Moved to the bottom-left, anchored to the opposite edge from the
tools so the collision is structurally impossible (the strip wraps, so any fixed-offset fix breaks
again on a narrow desktop) — and where a legend belongs anyway, beside the scale bar and compass.
Verified by hit-testing all six buttons in four states: all reachable.

**A harness bug worth more than the fix.** The CDP client used a fixed debugging port, so a lingering
Chrome from an earlier run was silently attached to instead of the freshly-spawned one — a "fresh
origin" run that already had `intro-dismissed`, `tutorial:{seen:true}` and the practice room active.
Every first-run and data-safety claim made from such a run would have been worthless. Now
`--remote-debugging-port=0` + `DevToolsActivePort`, and the evidence below was re-gathered afterwards.

**Two of the project's own guards fired on this diff and both were right:** the contrast test refused
`--text-3` on an 11px eyebrow, and the CSP scanner matched a comment in which I had spelled out the very
API I was promising not to use. Reworded and re-toned, not suppressed.

**Honest residuals, none of them regressions:** no `{kind:'world'}` canvas anchor in this pass (the view
transform IS reachable — `SimCanvas`'s `view` is React state and `worldToScreen` is exported — but
lifting it to App would re-render the whole sidebar on every pan frame, and jsdom's 0×0 rects make the
projection unprovable in the a11y suite; the copy names canvas objects instead) · the practice room is
never offered for deletion on exit, the copy points at the layouts screen instead (a delete flow is the
riskiest thing this feature could grow) · an abandoned tour leaves the practice room on disk and active
on next boot, deliberately, because silently deleting a layout at boot is the worse failure · the card
sits at z-index 62, above the `Menu` popover at 60, which is unavoidable while it must clear compare at
60 · `App.tsx` is 1234 lines against the 800 cap (1173 before this session, and already 1165 at the end of S20 — CLAUDE.md's "decomposed to 789" note is stale by five sessions) — the
tutorial's own logic went into `hooks/useTutorial.ts` rather than making that worse, but the file still
needs its own session.

### S22 — Auto-detect walls: the accuracy overhaul (the last P0) + "Generate a design" (2026-07-28) ✅

Two deliverables. The first was the last remaining **P0** and the only thing in the app the owner had
personally found broken by using it; the second was owner-requested in the same message that
authorised this session.

---

#### Part 1 — wall detection: **52.1 % → 95.6 %**, and it refuses instead of lying

**The measurement came first, because there wasn't one.** "Is detection better?" is unanswerable
without ground truth, and ground truth is exact only when the image was *drawn* from a description.
So the corpus is CODE:

- `__tests__/fixtures/floorplan-raster.ts` — a deterministic, pure-TS, zero-dep floorplan rasteriser
  (thick lines, cavity walls, furniture blobs, door arcs, hatching, dimension-text speckle, plus
  blur / gaussian noise / uneven lighting / low contrast / rotation / shear). It hands back the wall
  centrelines it painted, so the answer key cannot drift from the question — even under rotation,
  because the warp is applied to the drawing coordinates and to the truth together.
- `__tests__/fixtures/detect-score.ts` — the score: an intersection-over-union on wall LENGTH, which
  is the same thing as *what fraction of the user's editing work the detector did*. `hit / (hit +
  miss + off + redundant)`. Duplicates and hallucinations both count as deletion work, which matters
  because **precision alone is blind to a duplicate** — a duplicate lies exactly on a real wall.
- `__tests__/fixtures/floorplan-corpus.ts` — 22 enumerated fixtures, one per regime a constant is
  tuned for, in the `legit-scenes.ts` tradition.

**Baseline, measured with that instrument on the pre-S22 engine** (restored via
`git checkout <baseline> -- src/engine/detect.ts`, its own command, verified with `git status`):
**52.1 %**, and **61 hallucinated walls** on an image containing no floorplan.

The diagnosis in `kickoff-session-12.md` was re-verified and found true, plus one thing it missed:
`MERGE_RHO_PX` served as BOTH the Hough NMS window and `mergeSegments`' perpendicular-offset window,
so a parallel pair that survived suppression could never be merged — that code path was
**unreachable**, and loosening the constant would have loosened the suppressor in lockstep.

**The replacement** asks a local, connected question instead of a global one — `engine/vision/`:
Otsu ink → drop anything locally FATTER than a wall → close cavity walls → drop annotation
components → Zhang-Suen thinning → follow each skeleton branch → regularize (dominant axis, snap,
collinear merge, corner join) → reject geometry with no ink under it → assess and REFUSE.

| fixture | before | after |
|---|---|---|
| furnished apartment | 26.6 % | 99.8 % |
| cavity (double-drawn) walls | 41.1 % | 100 % |
| 22° rotated phone shot | 16.8 % | 84.9 % |
| heavy poché + thin partitions | — | 99.4 % |
| an image with NO floorplan | **61 walls** | **refused** |
| **mean over 20 scored fixtures** | **52.1 %** | **95.6 %** |
| cost for the whole corpus | 1 288 ms | 850 ms |

**Three defects found by adversarial review, all real, all fixed, each now carrying the fixture that
would have caught it:**

1. **CRITICAL** — `classify` used a raw 8-neighbour count where it needed the Rutovitz crossing
   number. Thinning leaves staircases; a staircase pixel has three neighbours mid-line; tracing stops
   at junctions. Measured on an isolated straight line: **128 false junctions at 8°, 203 at 30°, 310
   at 40°** — and a plan photographed 8/20/22/24/26° off-square returned **ZERO walls**. The corpus
   rotated by 4° and its angled fixture was 30°: calibrated at exactly the two angles where the bug
   does not fire.
2. The arc filter dropped a whole room outline, because thinning chamfers a right angle into two 45°
   bends — monotone, under the max-turn gate, therefore "an arc". `hollow-rect` scored **0**. The
   rule now compares an implied RADIUS against the plan's scale.
3. `MIN_STRUCTURE` 0.40 refused two legitimate plans (22°-rotated at 0.364, heavy poché at 0.313).
   Lowered to 0.25 against the measured lows, with a harder null fixture (`no-plan-lines`) added so
   the loosening has something to be falsified against.

**The Session-12 acceptance bullet "commit through `integrateWall`" was RETIRED, not met.** Measured:
feeding N detected walls through it sequentially produces exactly **N²/2 objects** (40 → 800,
60 → 1 800), multiplying `collectSurfaces` and every engine sweep S18/S19 spent two sessions
bounding; and its `EPS = 0.02` is in NORMALISED parameter space, so it silently drops a chunk shorter
than 2 % of a wall's length (a 10 m wall crossed twice 0.10 m apart returns 9.900 m — a 10 cm
acoustic hole). `joinCorners` already makes corners meet.

**UI.** The proposal is now REVIEWABLE rather than take-it-or-leave-it: a read-confidence bar, three
named sensitivity levels (`Careful` / `Balanced` / `Thorough` — chips rather than a slider, because
each run costs 80–125 ms and a range input fires per step), and per-wall strike-off. The list lives
in the CARD, not on the canvas: `wallProposal !== null` is a term of `overlayOpen`, so while the
proposal is up the canvas is out of the tab order and any canvas-driven reject would be pointer-only.
Refusal is surfaced as a sentence about the image; the old single message *"No clear walls found in
that image"* was emitted for four distinct causes including a `getContext('2d')` failure, which told
the user their floorplan was the problem when it was not.

---

#### Part 2 — "Generate a design"

Eight hand-authored ARCHETYPES × randomised envelopes → guillotine room tiling → shared walls →
variant-D doors → windows → furniture → a verified stereo pair. Deterministic per 32-bit seed, shown
as hex and re-enterable.

```
480 designs: locked 420 (88%) · importRejected 0 · mirror-desync 0 · sanitize-loss 0
distinct shells among these seeds: 477/480
mean 3.9 ms/design, worst 18.5 ms · same seed -> identical geometry: true
```

Three things the measurements decided rather than taste:

- **Variant D.** `rooms.ts` `collectBlockers` pushes the whole wall segment and never consults
  `wallKeptSpans`, so a door rect in a SOLID wall opens an acoustic path but no walkable one and all
  the furniture stays trapped in the seat's room. Partitions are two stubs with a real gap and the
  door inside it — measured end to end: walkable 91.3 m² vs zoning 59.3 m².
- **A verified ladder, not a formula.** The pair search accepts only what the real
  `traceScene`→`computeAudio` already reports as locked, so a design ships locked or with no
  speakers — never placed-but-unlocked, which the hero's edge-triggered ignition cannot celebrate.
- **Furniture before speakers**, because `arrange.ts` `fits()` cannot see speakers and would drop a
  wardrobe on a HomePod. Documented cost: the first-reflection-absorber layer never fires.

One bug found by measuring rather than reading: a guillotine tiling is **not conforming**, so
matching whole cell edges to find shared walls draws a boundary three times with no door in any of
them. `collectEdges` reduces each axis line to atomic intervals instead. The tell was not a crash —
it was `walkable === zoning`.

---

#### Evidence

**Agents spawned.** 4 parallel readers (detect core / detection wiring / generator surface /
metric design) · 2 designers (detection pipeline, generator) · 3 adversarial skeptics
(detection: **SOUND WITH FIXES**, and it found the CRITICAL crossing-number bug that returned zero
walls on a rotated photo, plus the heavy-poché refusal; generator; metric) · 2 self-reviewers over
the actual diff (`code-reviewer`, `silent-failure-hunter`).

**Test count: 1084 → 1316** (+232). No test skipped, `.only`'d or weakened.

**Gate** (pasted tails in the handoff): `npm run lint` 0 problems · `npm test` 1316 passed
(66 files) · `npm run build` clean, **476.00 kB / 154.75 kB gz** JS + **51.55 kB / 9.56 kB gz** CSS.

**Frozen engine files byte-unchanged:** `git diff --stat HEAD -- optimize rooms stereo raytrace
pairspot bestspot reflection grid` → empty.

**Live** (fresh headless-Chrome profile ⇒ fresh origin ⇒ the owner's real layout never loaded or
written; verified `localStorage['phantom-lock:v2'] === null` at the start of both runs):
`docs/sessions/S22/live.mjs` and `live-detect.mjs`, 15/15 checks pass. Screenshots in
`docs/sessions/S22/shots/`. The generated design opens on **"Phantom center locked"** on first paint;
detection on a furnished four-room plan with door arcs and dimension text returns **12 walls at 87 %
confidence** with a working strike-off, and an image of a table is REFUSED with a sentence.

**Honest limits.** Live checks ran ONE browser. No real screen reader has ever been driven on this
project. **Detection has never been run against the owner's own floorplan photo** — every accuracy
number is from the synthetic corpus; the harness accepts one directly via
`score-corpus.ts --image <file.png>`. Two fixtures stay below 92 % (`hatched` 91.6 %,
`apartment-cluttered` 82.3 %), both losing precision or coverage rather than duplicating.

**Self-review findings, all fixed in the same session** (`code-reviewer` + `silent-failure-hunter` over
the actual diff):

1. **HIGH** — the generate dialog's seed field fought the user on every keystroke: committing a seed
   re-ran the mirroring effect, which overwrote the half-typed value with its zero-padded form.
   Typing "1234" produced "00000001234" and the field could not recover; only an atomic paste worked,
   which broke the one thing the seed exists for. The mirror now writes only when the field does not
   already MEAN that seed, and there is a regression test that types one character at a time.
2. **HIGH** — `arrangeFurniture`'s notes were discarded. Measured across 8 archetypes × 200 seeds,
   **23.5 % of designs skip at least one requested piece** and a few `railroad` seeds skip the TV
   itself, with no note, no toast and no console output. `GenerateResult.skipped` now carries them and
   the dialog says so.
3. **HIGH** — `explained` was folded into confidence as a 0.2-weight TERM, so a detection that
   described only 23 % of a plan's wall ink still reported **77 % confidence**. It is now a FACTOR, so
   it cannot be outvoted. Deliberately not a refusal: under-reading is a partial answer the user can
   finish, and this file has already had to walk back one refusal that fired on real data.
4. **MEDIUM** — the generator's undo restored the store but never called `afterLayoutSwitch`, leaving
   the restored scene under the generated layout's mode with a selection pointing at objects that no
   longer existed. Every other restore path in the app calls it; this one now does too.
5. **MEDIUM** — the detection `.catch` swallowed the real error behind "Could not read that image",
   with nothing in the console. The pipeline behind it is nine stages of numeric work; it now logs.
6. **LOW** — `DetectionProposalCard`'s focus ladder aimed at the Accept button, which is disabled at
   exactly the instant the ladder fires (`.focus()` on a disabled control is a silent no-op — the same
   S20 lesson the comment cited). It aims at Discard now.

Two findings were assessed and **not** acted on, with reasons: the reviewer's O(n²) concern in
`regularize`/`structureScore` is real in shape but unproven (no pathological image was constructed, and
`WORK_MAX` plus the thickness and small-component filters bound the input hard) — recorded in
`docs/ideas.md` as a follow-up measurement rather than a speculative cap, because CLAUDE.md's own S18
lesson is that a cap calibrated against a subset is a data-loss bug. And the "commits do not carry the
Evidence block" note was simply premature: this entry is that block.


---

## Session 23 — 2026-07-28 — Seat furniture flush against a wall (`docs/ideas.md` §4)

**What changed.** Dragging a furniture rect or the TV now takes the nearest wall's angle at 0.35 m of
FACE clearance and seats flush at 0.15 m; Shift suppresses it. Doors and windows keep their own straddle
magnet, lifted verbatim out of `SimCanvas` into `placement.ts`. `Drag['move-rc']` gained a **required**
`rot0`.

**Why it mattered more than the backlog said.** The owner supplied their real floorplan this session. It
is almost entirely non-axis-aligned — every exterior wall skewed, the kitchen partition angled, the
bathroom block rotated — so this is the primary furnishing gesture, not polish. And the app already had
half of it: `arrange.ts` `wallSlots` auto-places at `rotation = atan2(dir)`, so "Decide for me" produced
wall-aligned furniture while dragging by hand did not. This closed an inconsistency, not a gap.

### Evidence block

**Agents spawned (16).** Design workflow (13): 4 understand (drag-path · rotation-model · precedents ·
test-surface) → 3 independent designs (minimal · ergonomic · invariant) → 3 judges (user · correctness ·
fit; **unanimous** ergonomic > invariant > minimal) → synthesis → 2 skeptics. **Both skeptics returned
defects** — `BROKEN` and `SOUND_WITH_FIXES`, 1 CRITICAL + 2 HIGH each, 15 total. Self-review (3):
`code-reviewer` ISSUES_FOUND · `silent-failure-hunter` ISSUES_FOUND · data-safety `general-purpose`
ISSUES_FOUND (core verdict CLEAN and proven).

**Findings adjudicated against HEAD myself, not taken on trust.** Three skeptic claims were re-derived by
hand before acceptance (`docs/sessions/S23/bench/refute.mjs`): the ⇧F quarter-turn is a no-op or a
footprint-identical flip on all 7 probed wall angles · the `|gap|` gate releases a bed with a 0.163 m
backward jump · a 0.7 m wall gets a 2.70 m capture window. All three upheld → `spec-v2-CORRECTED.md`.
Two claims were **refuted**: a judge proved `bestspot.ts:31` uses `Math.abs`, so the `invariant` design's
"the best-spot field collapses" TV justification is false (the branch was kept, the justification
rewritten); and the S22 detection-corpus concern was out of scope.

**Self-review defects fixed (2 real, 1 recorded).** (a) `normalizeAngle` on the no-seat path is an
atan2(sin,cos) round-trip that is not bit-exact — **12.1 %** of in-range values are perturbed, silently
rewriting rotation on every Shift-drag frame and contradicting the feature's headline invariant; the
guarding test probed one lucky value. Fixed, test widened to 406 values with a measured failing value
pinned by name, **negative control run** (restoring the old line fails 2 tests). (b) `q`/`e` mid-drag was
silently reverted; fixed by re-basing `rot0` on an external write. (c) `wallSeatFor` is 96 lines against
the 50-line guideline — recorded, not split: it is one cohesive loop at 100 % statement coverage.

**Test count 1316 → 1354** (+38, `canvas/__tests__/wall-seat.test.ts`). Nothing skipped, `.only`'d or
weakened. **Coverage:** `placement.ts` **100 % stmts / 93.7 % branch / 100 % funcs / 100 % lines**.
`SimCanvas.tsx` stays at 24.2 % — pre-existing, it has no component tests (S10 owns that).

**Gate (literal tails).** `npx eslint .` → 0 problems. `npm test` → `Test Files 67 passed (67) / Tests
1354 passed (1354)`. `npm run build` → `dist/assets/index-CDf_Byay.js 478.25 kB │ gzip: 155.61 kB`,
CSS `51.55 kB │ gzip: 9.56 kB` unchanged, HTML `1.31 kB`.

**Live verification — 9/9, real headless Chrome.** The drag is rAF-throttled and the Browser-pane tab runs
`document.hidden`, so it cannot be driven there (standing S4 lesson); `docs/sessions/S23/live-seat.mjs`
drives real mouse events on a fresh profile (fresh origin ⇒ own IndexedDB ⇒ the owner's layouts are never
read or written). On a −11.73° wall the sofa seated at **−11.730°** with a face gap of **1.11e-16 m**;
Shift held rotation at 0.000° while still moving the piece 1.600 m; ⌘Z restored the pre-drag centre
exactly. Artifacts: `docs/sessions/S23/shots/seat-0{1,2,3}-*.jpg`, `bench/live-seat.json`.

**Acceptance.** *Align a rect's rotation to the nearest wall within a radius* → **met**. *Optionally seat
its edge flush* → **met** (flush to 1.11e-16 m, live). *Undo returns the exact previous rotation* →
**met structurally** (`rot0` + the existing gesture-scoped history group). *Must not fight the existing
45°/5 cm snapping* → **met** (the 5 cm quantum moves onto the along-wall axis when seated; `settings.snap`
honoured; the world grid is byte-unchanged when the magnet does not fire). *A no-op must not be silent* →
**deferred to §4b** — that requirement is about the explicit command's disabled state, and the command
did not ship. *Surfaced via a key / HUD button / magnetic drag* → **met via the magnetic drag**, one of
the three options `ideas.md` names; the other two are §4b.

**Deferred, each with its own acceptance in §4b:** the `f`/⇧F command (with the quarter turn applied
AFTER the snap), the Inspector + touch-HUD buttons, the on-canvas snap guide, and creation-time
alignment. Until §4b lands, the escape for a deliberately perpendicular piece is Shift-drag — real, and
documented rather than hidden.

**Found in passing, filed not folded:** `src/engine/generate/shell.ts:140` `edgeAngleDeg` returns DEGREES
and `opening()` writes it into `RectObj.rotation`, which is RADIANS. Every non-horizontal generated door
and window is drawn at the wrong angle (a vertical wall's opening renders at 116.62° instead of 90°), and
generated windows are acoustically wrong too. `generate.test.ts:49` fingerprints `rotation` only for
DETERMINISM, so it pins the wrong value's stability. Not folded in because the fix moves S22's
determinism baselines; it needs its own block.

**Stated honestly:** live checks ran ONE browser (headless Chrome), no real screen reader has ever been
driven on this project, and detection has still never been run against the owner's own floorplan photo —
they supplied it as a chat image this session, which the harness cannot read; it needs a file path.


---

## Session 24 — 2026-07-28 — The degrees-into-radians bug in `generate/shell.ts`

**One line changed; the reason it took a session is that nothing in 37 tests could see it.**
`edgeAngleDeg` returned degrees and `opening()` assigned it into `RectObj.rotation`, which is radians.

### What was actually wrong, measured

Over 320 designs / 1406 openings: **50.7 % of every generated opening was drawn at the wrong angle.**
49.3 % sat on 0° walls and were accidentally correct; 40.9 % on 90° walls were out by **26.62°**, 5.5 %
on 180° walls by **53.24°**. A 0.9 m door's leaf tip was displaced up to **0.9017 m**.

**What it did NOT affect, and this is the load-bearing measurement:** `wallKeptSpans` reads only
`center` and `w`, so it is rotation-BLIND — **0 span differences across every wall of 320 designs**.
The acoustic opening cut into the wall was always right; the symbol drawn over it was not. What did
move: the drawn door symbol (jamb ticks, leaf and swing arc all derive from `rectCorners`), the ZONING
flood fill (238/320 designs), the furniture arranger's door corridors (213/320 place furniture
differently), a window's own acoustic surfaces (287; open doors emit none), and `sceneBounds` (253/320).

### The correction to the filing that prompted this

The brief (and my own S23 filing) said the fix "will move the S22 determinism baselines". **It does
not.** `geometrySignature` is compared only against another run of the same code (`generate.test.ts:272`
same-seed, `:277` cross-seed distinctness); there is no stored baseline for `generateDesign` anywhere —
no snapshot files, and both engine goldens contain **zero** occurrences of `rotation`. Nothing had to be
re-derived. What the fingerprint pinned was the wrong value's *stability*, never its correctness.

### Evidence block

**Agents spawned (4).** Impact workflow: `impact:engine` · `impact:tests` · `impact:fix-shape` →
`skeptic` (**SOUND_WITH_FIXES**, 2 HIGH + 3 MEDIUM/LOW). The skeptic's central finding was against **my
tests, not the fix**: an axis-snapping variant (`round(raw / (π/2)) * (π/2)`) — right units, wrong
geometry — **passed all 40 tests**, because the corpus `SEEDS.slice(0, 8)` contains zero diagonal
openings (the `l-notch`/`alcove` variants only emit ±45° ones from seed index 8). **I reproduced this
myself before accepting it.** Both tests now run the full seed list and assert `diagonal > 0`.

**Negative controls — the tests discriminate all three answers:** buggy degrees → FAILS (26.62° off) ·
axis-snapped radians → FAILS (45.00° off) · the real fix → 40/40. Each call site is independently
load-bearing: fixing only doors still fails on a window, and vice versa.

**A harness bug I fixed rather than shipped:** the first cut associated an opening with its NEAREST
wall, which at a corner is often the perpendicular one — a false failure of exactly 90.00° on 35 of 816
openings with the code fully correct. Openings are now matched by the wall whose infinite LINE contains
their centre, which is exact by construction.

**Test count 1354 → 1356.** Nothing skipped, `.only`'d or weakened.
**Coverage:** `shell.ts` is exercised by all 40 generator tests; the changed helper is on every
door/window path.

**Gate (literal tails).** `npx eslint .` → 0 problems. `npm test` → `Test Files 67 passed (67) / Tests
1356 passed (1356)`. `npm run build` → `dist/assets/index-B5uMxL2T.js 478.24 kB │ gzip: 155.60 kB`, CSS
`51.55 kB │ gzip: 9.56 kB` unchanged, HTML `1.31 kB`.

**Live verification: NOT run, and that is a deliberate call.** The change is to generated geometry, and
the deterministic corpus assertions (parallelism through `rectCorners` over the full seed list, plus two
negative controls) are strictly stronger evidence than a screenshot of one design would be. The one
thing a screenshot would add — that the door symbol now sits on its wall — is exactly what the
parallelism test asserts for all 1406 openings. Stated rather than quietly skipped.

**Stale numbers corrected in `CLAUDE.md`:** the documented "walkable 91.3 m² vs zoning **59.3 m²**" was
computed from the BUGGY rotation; re-measured post-fix it is **38.88 m²**. The lock rate is re-stated as
**91.1 %** on a named 192-design corpus, with an explicit warning that its direction is corpus-dependent
(the skeptic measured it moving DOWN on a third corpus) and must not be read as a benefit of the fix.
The A/B/C/D table in `shell.ts`'s header is flagged as pre-fix; its ordering and conclusion stand,
because what separates the four constructions is the gap, not the angle.

**Filed, not fixed — `docs/ideas.md` §12b (P1).** The fix TRIPLES the number of generated multi-room
designs whose zoning region is fully unsealed (**6 → 19 of 300**) through a pre-existing `rooms.ts`
degeneracy: `segsCross`'s strict `d3 * d4 < 0` cannot block a flood-fill step landing exactly on a wall
line, and the grid origin derives from `sceneBounds`, which reads door rect corners. The average
improves sharply (below-1.4: **138 → 28**). Consequence: `optimize.ts`'s "This room" target silently
becomes the whole house for ~6 % of generated multi-room designs. The repair is an engine change needing
its own golden and was deliberately not smuggled into a unit-fix commit.

**Audit result:** `shell.ts` was the ONLY site in the tree writing degrees into a radians field. Every
other `* 180 / Math.PI` is a display conversion, and both UI writers (`InspectorPanel.tsx:428`,
`UnderlayCard.tsx:82`) convert back. `swingDeg = 90` is genuinely degrees per the type and is untouched.


---

## Session 25 — 2026-07-29 — `regionOf` walked through walls (`docs/ideas.md` §12b)

**The bug.** `rooms.ts` `segsCross` implemented **proper** segment intersection only
(`d1*d2 < 0 && d3*d4 < 0`), which is correct exactly when all four determinants are non-zero. Every
**improper** (touching) intersection leaked — and zero is not an accident here, it is manufactured by
the app's own geometry: the flood-fill grid origin is `sceneBounds().min − cell`, `sceneBounds` reads
door rect CORNERS, and an ordinary door's `h = 0.1` puts `min.y` at −0.05, landing a whole cell-centre
ROW on a wall metres away.

**Measured**, 8 archetypes × seeds 0–59 = 300 multi-room designs: fully unsealed **19 → 0**, below
1.4× **28 → 0**. A minimal 8×5.5 room with one door read **54.81 m² → 43.74 m²** (true 44.00; the
remainder is sub-cell fringe). **Skewed walls were worse, not exempt** — a 45° hypotenuse holds a whole
anti-diagonal of centres, measured **92.16 m² for a 40.05 m² triangle**. That is the case that matters
for the owner's real floorplan, which is almost entirely non-axis-aligned.

**The half-fix trap.** The obvious repair handles only `d3`/`d4` (a cell CENTRE on the blocker) and
argues `d1`/`d2` (a blocker ENDPOINT on the step) should stay free because going around a wall's tip is
legitimate. That fails on the shape the generator builds: at an entry door the exterior wall splits into
two stubs and the door rect's edges START at the stub ends, so on that cell row THREE blockers each
merely TOUCH — none blocks alone, together they seal the wall, and the fill threads the seam. The
partial fix left **4 of 300** designs unsealed while passing all 22 other tests.

### Evidence block

**Agents spawned (6).** Impact workflow: `understand:consumers` + `understand:degeneracy` (both
completed and independently confirmed the three-shape taxonomy); its design phase ran long and was
**stopped** — I had already made and measured that decision, so the remaining value was the skeptic.
Self-review workflow (3): `review:over-block` ISSUES_FOUND · `review:consumers` ISSUES_FOUND ·
`review:silent-failure` **BLOCKING**.

**Findings adjudicated against the tree myself — 1 confirmed, 2 refuted.**
- **CONFIRMED (HIGH, found independently by two agents):** a seat within 0.15 m of a grid-aligned wall
  collapsed its region to a single 0.09 m² cell, because the new predicate blocks the step OUT of the
  seed cell as well as into it. 640 of 17 600 interior seat positions on the 0.05 m snap grid.
  `optimize.ts:265` has no `area > 2` guard, so it surfaced as "Suggest placement" returning ZERO
  speakers. **Fixed** by nudging the seed in `regionOf` (not in `segsCross`, which would reopen the
  leak), with the exact-tie case resolved by running both fills and keeping the larger — without that a
  seat dragged precisely onto the centreline picked the strip OUTSIDE the building (8.64 m² vs 43.74).
- **REFUTED (CRITICAL):** "the `=== 0` gate is unsound; at H = 4.0 the determinant is one ulp off and
  the leak reproduces". The arithmetic is right, the conclusion is not — a non-zero determinant with the
  correct sign is what the strict test handles, and H = 4.0/3.7/6.1 are all sealed at 0.35/0.5/0.8 m
  beyond the wall. The evidence offered (`contains(4, 4.1) === true`) is half-cell quantisation.
- **REFUTED (CRITICAL):** "34 % of import-legal coordinate offsets reopen the leak". Across 41 offsets
  to 100 km, `contains(0.5 m beyond the wall)` is false at **every** one; the area moving 43.74 → 46.17
  is one extra boundary ROW (2.43 m²).

**Also fixed from the review (MEDIUM):** the module comment still described the REJECTED partial fix and
contradicted the code twenty lines below it. In this file the comment is the specification, so a future
session would have reverted to the predicate that leaves 4 of 300 unsealed.

**Negative-control ladder** (pinned in the suite): strict → **5 of 23 fail** · partial (`d3`/`d4` only)
→ **1 fails** (`THE SEAM`, distilled from `one-bed`/seed 6) · full → **all pass**.

**Over-blocking measured, not argued.** Blocking a graze could seal a narrow doorway, and `arrange.ts:599`
builds its hard walkable-containment constraint from this region. The cell grows as `span/158` past ~47 m,
so a 0.9 m doorway spans 3.0 cells at 8 m, 2.4 at 60 m, 1.6 at 90 m and 1.0 at 140 m — it connects at
every one. The `consumers` reviewer independently ran the real `suggestPlacement`/`arrangeFurniture` over
480 designs: speaker counts identical everywhere (1868/1868, 3746/3746, 1920/1920), zero zones lost, and
where whole-house positions moved it was a CORRECTION (65/1200 speakers previously landed outside their
assigned room; 0/1200 after).

**Test count 1356 → 1365** (+9). Nothing skipped or weakened.

**Gate (literal tails).** `npx eslint .` → 0 problems. `npm test` → `Test Files 67 passed (67) / Tests
1365 passed (1365)`. `npm run build` → `dist/assets/index-E8D3okWk.js 479.06 kB │ gzip: 155.95 kB`, CSS
`51.55 kB │ gzip: 9.56 kB` unchanged, HTML `1.31 kB`.

**Live verification: NOT run, stated rather than skipped.** This is a pure engine predicate with no UI
surface; the deterministic evidence (a 300-design corpus, a three-way negative-control ladder, and a
doorway-vs-cell sweep across four envelope scales) is strictly stronger than a screenshot. The one
user-visible consequence — "Suggest placement" returning zero speakers — is now covered by a unit test
that seeds against the wall.

**Known, not fixed:** `sameRegion` has **no production caller** (definition plus two test assertions
only), so any "consumers verified" claim about it is vacuous. Its `dist(p, q) < CELL` short-circuit also
hardcodes `CELL` while `regionOf` grows the cell past ~47 m spans. Recorded for a future cleanup rather
than deleted in a bug-fix commit.

---

## Session 26 — 2026-07-29 — The P0 that wasn't, and the defect underneath it (`docs/ideas.md` §13)

**The session's stated P0 is REFUTED.** S25 measured the owner's real floorplan at structure **0.231**
against `MIN_STRUCTURE = 0.25` and filed *"detection REFUSES the owner's own floorplan at the default
sensitivity"* as the top of the backlog. It does not. That number came from handing the original
1320×1734 file to `detectWalls`, and the app puts **two unconditional lossy stages** in front of it:
`buildUnderlay` caps the import at `MAX_DIM = 1600` and re-encodes it as **JPEG q0.72**
(`underlay-import.ts:3,11-13,28`), then `detectWallsFromUnderlay` caps THAT at `WORK_MAX = 900`
(`detect.ts:308`). `detectWallsFromUnderlay` is the only non-test caller of `detectWalls`, its only
caller is `useWallDetection.ts:94`, and the downscale has no branch.

Through the real chain, and **confirmed end to end by driving the real UI in headless Chrome with the
owner's actual file**:

| UI level | sensitivity | walls | confidence | support | structure | explained | verdict |
|---|---|---|---|---|---|---|---|
| Careful | 0.7 | 9 | 73.9 % | 1.000 | 0.278 | 0.737 | accepted |
| **Balanced (default)** | **1.0** | **15** | **85.0 %** | **1.000** | **0.500** | **0.832** | **accepted** |
| Thorough | 1.5 | 24 | 91.8 % | 0.992 | 0.646 | 0.894 | accepted |

The live card reads *"Found 15 walls — 34.5 m · Read confidence 85 %"* with `Add 15 walls` and no
refusal toast (`docs/sessions/S26/shots/02-proposal-default.jpg`). S25's 9/13/21 walls at
0.111/0.231/0.548 reproduce EXACTLY at full resolution, which is how the chain was identified. Two
further corrections: **sensitivity 0.6 is not a value the UI can send** (the levels are 0.7/1.0/1.5), and
**this session made the same mistake itself** — the first S26 harness fixed the 900 stage and forgot the
JPEG stage, reading 0.588 instead of 0.500. Caught by an agent, not by the main thread.

### What was actually wrong, and what shipped

**1. The knob could refuse a plan the default accepts.** `sensitivity` scales `minSegment`, and
`structure` is measured on the segments that survive it — so asking for FEWER walls mechanically lowers
structure, and the user's own pickiness is reported back as evidence about their image. `detectWalls`
now takes a **lazy second reading at the default sensitivity** and refuses for structure only if both
fall short. Stages 1–5 do not depend on `sensitivity`, so the second reading re-runs only 6–8, and only
when the first would have been refused — zero cost on the accepting path. Stated and tested invariant:
*the knob may change WHICH walls are offered; it can never, by itself, turn an accepted image into
"this doesn't look like a floorplan."*

**2. The corpus was blind to resolution BY CONSTRUCTION.** All 22 fixtures rasterise at 700×520 or
900×700 — at or under `WORK_MAX` — so `k = min(1, 900/maxDim)` is exactly 1 for every one and the app's
downscale had never been exercised. That is the hole S25 fell into. A new `resolution` block rasterises
fixtures at 2.5× (a phone photo), pushes them through both of the app's downscales, and asserts the read
survives — plus a band test pinning `WORK_MAX` under `WALL_HALF_WIDTH_MAX / WALL_HALF_WIDTH_FRAC` = 1333,
demonstrated by `heavy-poche` at 2.5× losing **97.5 %** of its ink and being refused.

**3. The refusal never named the control that would help.** The toast now appends *"Try 'Thorough' to
look harder."* when a harder level exists, and nothing at the top level.

### The fixture

`oblique-survey` (620×760) — the gap no synthetic occupied. An oblique envelope whose corners are
**sub-`minSegment` jogs** (37–57 px against 38 px at the default and 54 at Careful), dimension lines
beside every wall, heavy poché (10) against thin partitions (6), and a warren of closet-scale rooms each
with its own doorway. Measured **0.222 REFUSED at Careful / 0.346 accepted at Balanced / 0.658 at
Thorough**, score 74.7 % — the lowest structure of any legitimate fixture at the default
(`apartment-cluttered` is next at 0.425). It is what made the monotonic-knob test fail first: on HEAD it
produced the literal P0 sentence.

### Evidence

**Agents (16 across two workflows).** Adjudication workflow — `skeptic-p0` (could not refute; **found my
own harness was missing the JPEG stage**), `harness` (confirmed both `--image` bugs, duplicated in S23;
produced the resolution sweep), `lowsens` (mechanism + fix candidates), `fixture` (characterisation +
spec), each with an independent refuter. Self-review workflow — correctness / tests / corpus-safety /
silent-failure over the actual diff.

**Findings I rejected, with reasons (TRAP 9).** (a) *"max(user, default) fixes the gamma-1.15 case"* —
REFUTED and I had already measured it: on the real bytes both arms are below threshold, so the rule does
not rescue it. The fix is justified by the `oblique-survey` flip and by rescuing gamma 1.50 at Careful,
not by that claim. (b) *"the margin rises to 0.175"* — an artifact of computing both arms
unconditionally; `max(a,b) ≥ T` ⟺ `a ≥ T ∨ b ≥ T`, so the lazy and eager forms are the same predicate
and the margin is unchanged at 0.114. (c) *"the live UI evidence was never produced, shots/ is empty"* —
stale; the run landed at 13:12 while that agent was mid-flight, and a refuter opened the JPEGs and
confirmed them. (d) *"the knife-edge is caused by a mis-measured strokeWidth / a dominantAngle flip"* —
**mechanism refuted**, symptom confirmed: forcing the stroke back leaves structure at 0.000 and injecting
the correct axis does too. I re-measured and the real cause is the **Otsu threshold**, which jumps
175 → 208 between gamma 1.02 and 1.05 and TRIPLES raw ink 32 376 → 107 365 px. Stroke width and the 69°
axis flip are both downstream of that.

**Prototyped and NOT shipped:** a graded `structureScore` (distance falloff instead of a binary
`<= radius`). It lifts every legit fixture while leaving BOTH nulls at exactly 0.000, so it does not
weaken the discriminator — but the Otsu instability is upstream of it and should be fixed first, and
shipping it now would look like a threshold move in disguise. Recorded in `ideas.md` §13b with numbers.

**The self-review found a hole in the fix, and it was real.** Pooling a second reading is safe only
when that reading is ITSELF a detection: a shelf edge meeting an upright is a clean two-segment corner
scoring a perfect structure while being refused for `MIN_WALLS`, and pooling that number offered 11
loose sticks at 'Thorough' in 9 of 9 variants. A second review lane found the mirror hole — the rescue
was unconditional on the USER's own reading, so `oblique-survey` redrawn at 0.7x offered 12 segments
whose structure was exactly 0 (46.4 % accurate). Both are closed, each by a condition with a measured
justification rather than a tuned constant, and each has a fixture or a negative control. Three further
review findings were adopted: the hint was pointing 'Careful' at a level the engine had already tried
(measured futile 5 of 5, so the refusal now carries a CAUSE and the hint skips it); the knob test was
satisfiable by DISABLING the knob (66/66 passed with 'Careful' made a no-op); and `referenceStructure`
scored at the user's corner radius was a no-op by corpus coincidence, which a thin-stroke control now
catches. Four accuracy corrections were also applied — `expectWalls` 13 → 25, the clamp boundary
1333 → 1361 (the `round`), a mis-stitched gamma figure, and `scalePlan`'s overclaim about what scales.

**Test count 1365 → 1388** (+23). Nothing skipped, `.only`'d or weakened. Corpus mean 95.6 % → **94.6 %**
against a `MEAN_FLOOR` of 0.92 — the new `oblique-survey` scores 74.7 % by design, so the headroom is
2.6 points and worth watching.

**Gate (literal tails).** `npm run lint` → 0 problems. `npm test` → `Test Files 67 passed (67) / Tests
1388 passed (1388)`. `npm run build` → `dist/assets/index-BB6XWN7z.js 479.80 kB │ gzip: 156.27 kB`, CSS
`51.55 kB │ gzip: 9.56 kB` unchanged, HTML `1.31 kB`. **`npm run test:coverage` also green — and that
one mattered**: a review lane BLOCKED the diff because three new tests hard-timed-out under v8
instrumentation at the 5 000 ms default, re-introducing the exact failure this file's own comment
documents from S18. Measured multiplier 7.0-7.3x. Fixed the way the file already knew how — hoist the 69
per-level `detectWalls` calls and the four 2.5x rasterisations to module scope — not by raising a
timeout. Worst test now 3 366 ms. Coverage on the touched engine files: `detect.ts` 72.84 % stmts /
**100 % branch** / 87.5 % funcs (uncovered 397-439 is `detectWallsFromUnderlay`, DOM-only and unreachable
from node), `quality.ts` **100 %** stmts / 95.12 % branch / 100 % funcs, `components/app/hooks` 61.98 % /
85.88 %.

**Behaviour-preserving, proven against the pre-session engine.** `git show main:` the two changed engine
files into /tmp, point them at the live siblings, and run both on the REAL app-chain bytes: segments,
confidence and structure are identical to 1e-12 in all six cases, and exactly one verdict moves —
`oblique-survey` at 'Careful', REFUSED → offered. Saved as `docs/sessions/S26/bench/old-vs-new.txt`.

**Live verification: RUN.** Fresh headless-Chrome profile (fresh origin, `phantom-lock:v2` asserted
null), the owner's photo fed through the app's own file input so it travels `buildUnderlay` → the
underlay record → `detectWallsFromUnderlay`, then the real Auto-detect button and the real
`DetectionProposalCard`. Screenshots in `docs/sessions/S26/shots/` (gitignored). ONE browser, as always.

**Left open, honestly.** §13b is the new head of the queue: the verdict is unstable under exposure and
the cause is upstream of everything this session touched. The owner's plan is accepted today with a
**one-junction margin at Careful** (structure 0.278; 5 of 18 endpoints joined, and 4 of 18 = 0.222 would
refuse), which is the tightest reachable margin in the app and the number to watch.

---

## Session 27 — 2026-07-29 — The threshold was decided by flat area (`docs/ideas.md` §13b)

**§13b is closed, and the cause is one level deeper than the section described.** It was written up as
"a 5 % darkening triples the ink". Both halves of that needed correcting.

**What it actually is.** The owner's file carries flat grey **letterbox bars** down both edges at
luminance ~198 over **11.1 % of the page** — verified in the original 1320×1734 PNG (far-left and
far-right pixels both 198 at standard deviation 0.0: digital padding, not a photographed surround). That
makes the page trimodal, and Otsu maximises between-class variance under a BIMODAL assumption, so its
criterion ends up with two near-tied maxima: **175 at 100.00 % against 209 at 98.07 %**. One gives 4.6 %
ink, the other 17.4 %. Confirmed by controlled substitution — paint the bars out and the discontinuity
vanishes entirely (26/41 gamma refusals → 0/41); force the threshold back and structure returns to
exactly 0.500.

**"Exposure" was the wrong word, and the correction is measured rather than pedantic.** Sweeping each
axis independently over the owner's file: a gamma curve refuses **26 of 41**, linear gain across ±0.3 EV
refuses **0 of 46**, an additive lift refuses **0 of 41**. Gain preserves tone ratios and lift preserves
tone differences, so neither can reorder two near-tied optima; only a tone CURVE moves two modes by
different amounts. The consequence is not semantic: the obvious regression test — perturb brightness —
would have passed on the broken engine. S26's companion claim that JPEG quality 0.49–0.51 shows the same
jump is also **refuted**: through the real chain the cut is 173 at every quality from 30 to 100.

**The fix.** `inkMaskOf` chooses its threshold on a **gradient-weighted histogram**: 3×3 box blur, then
|dx| + |dy| central differences, and a pixel votes only if that clears `EDGE_GATE` = 16 — so a flat band
contributes only its two boundaries however much of the page it covers. Below `MIN_EDGE_FRACTION` = 2 %
of the page clearing the gate it falls back to the plain histogram, which is exactly the pre-S27
decision. A plain histogram counts AREA; area is the wrong vote for "where does ink end?".

**Three rules that do NOT work, measured and recorded in the code.** Breaking the near-tie toward the
smaller minority class moved **13 of 24** corpus masks; picking the emptiest cut within the band moved
**21 of 24**. Both fail because on a clean page the criterion is a flat plateau spanning an EMPTY
histogram valley, so plateau noise satisfies any local-maximum test. And a design agent proved the
general case: over **6 080 three-mode histograms, 1 539** have the correct cut as argmax and a wrong cut
as a near-tied rival reaching **100.00 %** of it, because a page and its mirror are the same histogram
with the middle mode's ROLE swapped. No function of the histogram alone can separate them — which is
exactly why the fix uses spatial information the histogram discards.

### Evidence

**Agents spawned (8 + 4).** Design workflow: `threshold-rule` (proved the impossibility result;
proposed a two-reading alternative, byte-identical on the corpus — not adopted, see below) ·
`downstream` (bars never reach the wallMask; fixing the threshold IS sufficient) · `skeptic`
(CONFIRMED the diagnosis by controlled substitution and forced threshold; REFUTED the "exposure"
framing and S26's JPEG claim) · `fixture` (re-derived the `ink?:` byte-identity proof independently,
including against the version the main thread had already landed; built the fixture that actually
reproduces the flip). Plus four verifiers, one per proposal. Then a 4-lens self-review over the diff.

**Adjudicated, not accepted.** The skeptic's framing refutation was re-measured by the main thread
before any wording changed (gamma 26/41, gain 0/46, lift 0/41 — reproduced exactly). The
`threshold-rule` agent's two-reading design was NOT adopted: it is byte-identical on the corpus where
the shipped fix *improves* it, and its impossibility result argues for changing the histogram rather
than reading it twice. The main thread's own first two candidate rules were refuted by its own
measurements before any agent reported.

**Before/after test count: 1388 → 1393.** No test skipped, `.only`'d or weakened. Two of S26's negative
controls FAILED on the new engine — because detection improved on the degraded inputs they used — and
were **re-derived**, not relaxed: a search over 1 050 and 1 260 scaled/thinned variants found no
replacement in the corpus, so one vehicle was constructed on purpose and both were proven load-bearing
by disabling the guard they protect and watching the verdict flip.

**Gate (literal tails).**

```
> eslint .
(no output — 0 problems)

 Test Files  67 passed (67)
      Tests  1393 passed (1393)
   Duration  11.71s

dist/index.html                   1.31 kB │ gzip:   0.62 kB
dist/assets/index-DL95iJRY.css   51.55 kB │ gzip:   9.56 kB
dist/assets/index-CF22zYkB.js   480.36 kB │ gzip: 156.51 kB
✓ built in 516ms
```

**Live verification: RUN.** Fresh headless-Chrome profile, the owner's real plan fed through the app's
own file input so it travels `buildUnderlay` → the underlay record → `detectWallsFromUnderlay` → the
real `DetectionProposalCard`. Result **9 / 15 / 24 walls at 74 / 85 / 92 %** — identical to S26, i.e. no
regression on the owner's own plan through the real product path. Screenshots in
`docs/sessions/S27/shots/` (gitignored). ONE browser, as always.

**Acceptance, bullet by bullet.**
- *A fixture that reproduces the shape and pins the discontinuity* — **met.** `scan-letterbox`. On the
  pre-S27 engine it reads perfectly at gamma 1.00–1.02 (10 walls, structure 0.750, score 100 %) and is
  REFUSED from 1.03 (24 walls, structure 0.125, score 0 %); post-S27 it holds 10 walls and 95–100 % at
  every step from 0.90 to 1.10. Enabled by per-element `ink?:` on `WallSpec`/`BlobSpec`/`SpeckleSpec`,
  proven byte-identical on all 24 pre-existing fixtures.
- *The owner's verdict stable across ±10 %* — **exceeded.** 0 refusals over gamma 0.70–1.60 × 3 UI
  levels (138 readings), against 38 before.
- *All nulls still refused* — **met**, all three, at every level.
- *Corpus mean floor held, headroom stated* — **met and improved.** 94.82 % → **95.48 %** over the same
  22 fixtures against a 0.92 floor; headroom 0.0257 → **0.0348**, about three more ~0.75 fixtures.

**Left open, honestly.** Gradient weighting distinguishes a flat mass from thin strokes, so a large
mid-tone mass that is heavily TEXTURED would still vote like ink. Nothing in the corpus or the owner's
file exhibits it; filed as §13c (P3) rather than pre-empted. The `scalePlan` annotation-stroke-width gap
(`drawSpeckle`'s hardcoded 1.2 px, `ArcSpec.thickness`'s 1.4) is still open and deliberately NOT bundled
here — an agent measured that fixing it moves `apartment-annotated` at 2.5× from 99.7 % to 91.7 %, which
is a resolution-test number and must not ride along inside a byte-identity-preserving change.

---

## Session 28 — 2026-07-30 — Read the page at BOTH threshold rules (`docs/ideas.md` §13d)

**Branched from `session-27-detect-exposure`, not from `main`** — the decision the kickoff left open.
S27's work is measured and correct as far as it goes, and the §13d remedy *adds* a candidate rather
than replacing one, so the gradient histogram, the `scan-letterbox` fixture and the tone-curve sweep
all survive intact. Landing S28 therefore lands S27 with it, and `main` goes from the pre-S27 engine
to both.

### The P0, reproduced before anything was designed

Gradient weighting scales a tone's vote by roughly **1/thickness**. It demotes a flat mass, which is
what S27 wanted, and it equally demotes THICK LIGHT WALLS while amplifying THIN DARK LINES. On a
plotted sheet with screened poché under hairline annotation — an ordinary drafting convention — every
wall lands on the paper side of the cut. Reproduced with an independent construction (10 walls at
thickness 14 / ink 175, plus N thin thickness-3 ink-26 lines, five seeds), S27 against a pre-S27 copy:

| thin dark lines | pre-S27 | S27 branch |
|---|---|---|
| 0–2 | ok, 76–100 % | ok, 76–100 % |
| 4 | ok, 57–73 % | **REFUSED, structure 0.000 (5/5 seeds)** |
| 8 | ok, 50–62 % | **REFUSED (5/5 seeds)** |

### What shipped

`vision/mask.ts` `inkThresholds(img)` returns `{gray, thresholds, starved, edgeVotes, edgeDensity}` —
the gradient-weighted cut and the plain cut, best guess first, de-duplicated, at most two.
`detect.ts` `detectWalls` runs `pipelineAt` at candidate 0 and re-runs at candidate 1 ONLY when the
first reading is refused. `DetectionResult.ink` records which cut answered.
`MIN_EDGE_FRACTION` → `MIN_EDGE_DENSITY` (votes per unit page PERIMETER, not a fraction of AREA).
New corpus fixture `screened-poche`.

### Three things that corrected a plausible wrong answer

**The kickoff's recommended patch could not be pasted.** Reading the S27 workflow journal rather than
the summary of it: an S27 skeptic had proved that patch *silently reverts the gradient fix* when
applied on top of it — its `detectWalls` computes its own plain-histogram candidates and never calls
`inkMaskOf`, so `edgeWeightedHistogram` becomes dead code on the detection path while `tsc` and
`lint` stay clean and the owner metric still reads 0/138. The candidate set here is the two RULES,
not two peaks of one rule.

**"0 leaks over 684 readings" was refuted by measurement.** A design agent reported that for exactly
the shipped shape. The acceptance set is `accept(gradient) ∪ accept(plain)` — a UNION, so it can only
ADD acceptances — and re-pointing a different agent's polarity-repainted nulls at the same engine
found two leaks immediately (23 walls at structure 0.261; 4 at 0.250). Re-framed against what
actually shipped: **S27 never landed, so `main` IS the plain rule and the challenger is `main`'s own
engine.** Over 504 null readings, new-vs-`main` is **61 for the S27 engine alone and 61 for the
candidate set** — new null acceptances attributable to this fix, **0**.

**No challenger guard survived measurement.** Round 1 proposed `CHALLENGER_MIN_STRUCTURE = 0.45` on a
claimed 1.49× margin. Against an enumerated protected set of 391 legitimate rescues the structures run
to **0.214** while attacks reach **0.346** — the populations overlap. 0.45 would refuse **87 of 391**
(worst: an 88 %-correct read), leave `screened-poche` (0.464) 0.014 above a refusal cliff, and still
miss the worst attack (0.667). Two more guards were measured and dropped: "challenger ≥ `MIN_WALLS`"
is provably vacuous, and "challenger's own structure ≥ `MIN_STRUCTURE`" costs a real 57 %-correct read
and closes 0 of the 61.

### Evidence

- **Gates**: `npm test` 1393 → **1407**; `npm run build` **481.42 kB / 156.86 kB gz** (+1.05 / +0.35);
  `npm run lint` clean; `git ls-files --others --exclude-standard src/` empty.
- **Live, real UI, fresh Chrome profile** — owner's real plan **9 / 15 / 24 walls at 74 / 85 / 92 %**,
  identical to S26 and S27. The polarity fixture: **14 / 16 / 26 walls at 85 / 83 / 92 %** on the fix,
  and **no proposal card at all** on a build of the S27 tree. Shots in `docs/sessions/S28/shots/`.
- **Corpus**: 22 pre-existing legitimate fixtures byte-identical at all three UI levels; mean 0.9548
  (22) → **0.9497** (23) against `MEAN_FLOOR` 0.92.
- **The fixture is load-bearing twice**: on the S27 engine `screened-poche` scores **0.000** against
  its 0.78 floor AND drags the mean to **0.9132** against the 0.92 floor.

### Left open, honestly

**§13e is the new P1 and it is older than either session**: the refusal gates accept images with no
floorplan. A page of four thin furniture OUTLINES is offered **27/27** readings at structure up to
1.000 and confidence 1.00 — identically by `main`, by S27 and by S28, so no threshold rule can reach
it. An incumbent-side structure floor is not the answer (its first step, 0.28, already refuses 24
readings of the owner's own plan). Also still open: the `scalePlan` annotation-stroke gap (§2d of the
S28 kickoff), and `npm run test:coverage` is still not clean.

---

## Session 29 — the Android home-screen gallery (2026-07-31) — **owner-requested, mid-session**

The session opened on §13e (detection accepting images with no floorplan) and the owner redirected
it in flight: *"i want to be able to grab a design and move it around and if i drag it on top of
another one i am able to create a folder. copy the functinonality of android home screen with the
desgins treated like apps."* The detection work was reproduced and archived
(`docs/sessions/S29/bench/13e-reproduction.txt`) rather than lost, and §13e is unchanged at the head
of the detection queue.

Asked which shape they wanted, the owner chose **the true Android model** (a folder ICON appearing
in place, drill-in) over the smaller "a new labelled row below", and chose **saved positions**.

### What shipped

ONE flat grid where a design card and a FOLDER TILE are peers. Drop a design on a design → a folder
at the TARGET'S SLOT; on a tile → it joins; in a gap → it moves there; click a tile → drill in;
Escape climbs back out. `Layout.order` / `Project.order` persist the arrangement, with an old-shape
migration. Move mode is operable by keyboard AND by single pointer, because WCAG 2.2 SC 2.5.7 is
explicit that a keyboard equivalent does not satisfy it.

### Evidence block

**Agents spawned (13 across 3 workflows):** 5 understanding (gallery surface · data model · a11y
bar · drag idiom · Android spec) → 4 design (ordering model · home-invariant SKEPTIC · a11y contract
· visual design) → 4 self-review (data loss · silent failure · a11y · correctness).
**Verdicts:** the design skeptic REFUTED the draft's home identity (oldest-by-`createdAt` is
stealable by an import and ties under `sanitizeProjects`' `Date.now()` default) → home became
`projects[0]`. The ordering agent REFUTED three draft properties by measurement. The self-review
found **1 CRITICAL + 4 HIGH + 2 MEDIUM**, all adjudicated against the tree; one proposed fix was
measured worse than the alternative and NOT taken.

**Test count:** 1407 → **1471** (+64). No test skipped, `.only`'d or weakened.
- `engine/__tests__/order.test.ts` **33** — with FIVE negative controls built, run and restored
  byte-identically (verified by `shasum`): index fallback · no re-stamp in `moveLayoutToProject` ·
  none in `removeProject` · `touch:false` on mutations · merge appending instead of taking the
  target's slot. Each caught exactly one test.
- `components/gallery/__tests__/drag.test.ts` **23** (pure geometry — jsdom reports every rect 0×0).
- `gallery.a11y.test.tsx` **15**, rewritten: four S20 assertions described the retired
  section-per-folder IA; every property they protected still holds and is observed through the tile
  and the drill-in.

**Gates (literal):** `Tests 1471 passed (1471)`, `Test Files 69 passed (69)` · build
`496.81 kB / 161.71 kB gzip` JS + `53.45 kB / 9.96 kB gz` CSS + `1.31 kB` HTML · `eslint .` clean ·
`tsc --noEmit` clean.

**Live:** fresh headless-Chrome profile (fresh origin ⇒ its own IndexedDB; asserted before anything
ran, so the owner's real workspace was untouchable). **13/13 checks, 0 console errors.** Shots in
`docs/sessions/S29/shots/` (01 home grid · 02 folder created · 03 drilled in · 04 reordered ·
05 after reload).

**Acceptance → outcome:** grab and move a design ✅ · drop on another to create a folder ✅ (in the
target's slot, live) · folder as an icon with drill-in ✅ · saved arrangement ✅ (survives reload,
live) · keyboard + single-pointer path ✅ · **touch DEFERRED to §14a** (unverified, and partly
unsupported by construction) · **drag OUT of a folder DEFERRED to §14e** (the kebab route works and
dissolves an emptied folder; no drag does).

### What only the browser could find

Two bugs invisible to the suite: a click-suppression FLAG stranded by the merge's own DOM removal,
so the next click anywhere was eaten; and `absorb` proposed for a folder subject, announcing an
action no commit branch performs.

### What only the self-review could find

**CRITICAL:** the arrangement was persisted for FOLDERS and not for DESIGNS. `saveMeta` rebuilds the
meta row every cycle so `Project.order` was written; layouts are diff-gated on `updatedAt` and the
load path correctly derives ranks without touching it, so `Layout.order` never was. On every
pre-S29 store the two halves disagree on disk, `Infinity` sorts last, and on the **second** boot
every folder jumps to the front of the grid with the user having done nothing — permanently. Fixed
by putting `order` in the persistence diff key, seeded as unknown.

### Honest limits

One browser. No real screen reader. **No touch device has ever been driven on this project.**
`npm run test:coverage` remains not clean (one pre-existing timeout, untouched).

Residuals filed as `docs/ideas.md` §14a–14e. Next session: `docs/kickoff-session-30.md`.

---

## Session 30 — finishing the home screen (2026-07-31) — `docs/ideas.md` §14a–14e

S29 shipped the Android-style gallery and named five residuals. This session closed all five, and
found three defects underneath them that were not on the list — two of which were in the path S29
had designated as the WCAG-compliant one.

### What shipped

**§14b focus after a commit.** Every gallery commit destroys the element holding focus, so a drop
ended with `document.activeElement === document.body`. `focusPlanFor`/`fallbackIndex` are pure and
the hook applies them in ONE `useLayoutEffect` ladder, so the two input paths cannot disagree.
`mergeLayouts` now returns the folder id it mints — it was computed and discarded one frame before
the gallery needed it.

**§14c the Escape ladder.** The gallery's Escape handler and `Menu`'s are both window-CAPTURE on the
same node, so `stopPropagation` cannot stop the co-registered one; the gallery mounted first, ran
first, and closed everything. New pure `escape.ts` is total over three booleans. `inFolder` reads
the RESOLVED container, not the raw state — a folder can be deleted or dissolve while drilled into,
after which the raw id is stale and Escape swallowed itself while announcing "Closed folder."

**§14e drag a design OUT of a folder.** A fourth `DropIntent`, the breadcrumb as a drop target, `O`
as the keyboard twin, and clicking the breadcrumb mid-move as the single-pointer path. The intent is
UNCONSTRUCTIBLE on the home grid because the rect is absent rather than because a flag says so.

**§14d a deleted folder's designs — owner decision.** Asked directly, the owner chose the HOME GRID
over the adjacent folder. `removeProject` now re-homes at the tile's slot, rebuilding the sequence
explicitly (the arithmetic version overshoots: the gap above a midpoint insert is only 0.5, so a
fixed fractional step silently reorders the grid once a folder holds enough designs). It also now
refuses the home project, and so does `deleteProject`, which was writing an undo snapshot and
toasting "Deleted …" over a store `removeProject` had declined to change.

**§14a touch — FIXED, not merely documented.** See the Evidence block.

**§2e `npm run test:coverage` is GREEN for the first time.** Four tests straddled the 5 s per-test
ceiling under v8 instrumentation with the code entirely correct; each was measured, then moved to
module scope, which is evaluated during COLLECTION and is not timeout-bound. The largest was
`corpusFixtures()`, which re-rasterised all 25 fixtures on EVERY call — `fixtureByName` calls it and
discards all but one, so seven lookups cost 175 rasterisations.

### The three defects that were not on the list

1. **Move mode wasted a keypress and could not reach the last position.** It stepped ±1 through
   DISPLAY space, where index `self` and `self + 1` are the same outcome. Measured against the real
   engine: a subject at display 0 had `at=0` and `at=1` both no-ops, and the cap of `others.length`
   put the final position out of reach entirely. This is the path S29 designated as the SC 2.5.7
   mechanism, so it is the one that has to be exactly right. **The existing test froze the bug** by
   asserting the callback ARGUMENT and never the outcome.
2. **Move mode announced the wrong position.** Found by the a11y review, after the fix above: the
   live region formatted the raw display index, which the fix deliberately inflates, so a subject at
   display 0 heard "Position 2" for the slot it was already in and "Position 6" in a five-item grid.
   The caret is `aria-hidden`, so that sentence is the ONLY feedback a non-visual user gets.
3. **A click mid-move NAVIGATED instead of committing.** Clicking a folder tile drilled into it with
   the move still armed, after which the breadcrumb committed an `exit` for a design that had never
   been in that folder — a no-op write announced as "Moved X out. Y was empty and is gone." Clicking
   a design opened it and closed the gallery, abandoning the move without a word. An item click is
   now a DESTINATION, which is what move mode's own doc has always claimed, and what finally gives
   `merge`/`absorb`/`slot` a single-pointer-without-dragging path at all.

### Evidence block

**Agents spawned (role → verdict).**
- 4 × design (14a/14b/14c/14e) → each paired with an independent skeptic; **all four
  SOUND_WITH_FIXES**, 20 defects between them. Acted on the load-bearing ones; the 14a design's
  proposed "move bar" UI was REJECTED — out of its brief, and its own skeptic measured it as a focus
  REGRESSION on the canonical path that also covered `.gallery-new`'s four buttons.
- 3 × negative-control (21 wrong implementations) → **16 caught, 5 holes**, every hole a real
  regression rather than a no-op. All five closed and re-verified against the same controls.
- 4 × self-review (code-reviewer / silent-failure-hunter / a11y-architect / pr-test-analyzer) →
  2 HIGH behavioural, 2 HIGH untested-contract (each proven by mutation), 4 MEDIUM, 3 LOW.
  **Two findings adjudicated as NOT defects** and recorded in `ideas.md` §14f rather than actioned.

**Test count: 1471 → 1536** (+65). Never dropped.

**Coverage** (`npm run test:coverage`, green — 4 consecutive clean runs):
`escape.ts` **100 / 100 / 100 / 100** · `drag.ts` **98.42 / 97.43 / 100 / 98.42** ·
`projects.ts` **98.67 / 95.23 / 100 / 98.67** · `LayoutGallery.tsx` **91.06 / 84.72 / 51.21 / 91.06** ·
`useGalleryDrag.ts` **58.86 / 81.42 / 50 / 58.86** — below 80, and structurally so: jsdom dispatches
a plain `Event` for pointer events, so `button`/`pointerId`/`clientX` are `undefined`,
`onItemPointerDown` bails at `e.button !== 0`, and a press is never registered. Measured `main` in an
isolated worktree for a like-for-like comparison: **52.26 / 55.17 / 40 → 58.86 / 81.42 / 50**, so the
figure improved. The decisions all live in `drag.ts`; the pointer half is covered live.

**Gate.**
```
Tests  1536 passed (1536)      Test Files  70 passed (70)
dist/index.html                   1.31 kB │ gzip:   0.62 kB
dist/assets/index-CaouhDpz.css   53.65 kB │ gzip:  10.00 kB
dist/assets/index-XVZZrUhb.js   500.75 kB │ gzip: 163.20 kB
eslint .  →  (0 problems)
```

**Live (19/19, real headless Chrome, fresh profile):** `docs/sessions/S30/live-s30.mjs`, saved run
in `bench/live-run.txt`, screenshots in `shots/` (01 home grid · 02 kebab open · 03 merged+focus ·
04 drilled in · 05 after exit · 06 touch). Includes the two checks jsdom structurally cannot make:
Escape during an UN-ARMED press, and touch.

**§14a touch, measured.** `touch-action: pan-y` on `.gallery-card` confirmed. Before: a vertical
touch drag gave `pointerdown → pointermove → pointercancel`. After: 12 uncancelled `pointermove`s.
The regression check that matters more — an un-armed flick must still scroll — was VACUOUS at
1440×900 (nothing overflows), so it was re-run at 390×700: **650 px of overflow, scrollTop 0 → 387**.

**Acceptance → outcome.** Focus lands somewhere sensible after every gesture ✅ · Escape does the
least surprising thing at every rung ✅ · a design can be dragged out of a folder ✅ · touch verified
**and fixed** ✅ · §14d re-decided with the owner ✅ · `test:coverage` green ✅.

### Honest limits

One browser (Chrome). **No real screen reader has ever been driven on this project.** Touch is real
CDP touch emulation, not a physical device — the events are genuine `Input.dispatchTouchEvent`
streams through Chrome's real compositor, but a phone's own gesture recognisers are not in the loop.
`useGalleryDrag`'s pointer path remains jsdom-blind by construction.

Residuals filed as `docs/ideas.md` §14f (three, all P3). Next session: `docs/kickoff-session-31.md`.

---

## Session 31 — §13e refuted, creation-time alignment built and reverted (2026-08-03)

**Two refutations and no new feature. That is what the measurements said, and it is the deliverable.**

### Block A — `docs/ideas.md` §13e: REFUTED at the `vision/quality.ts` seam ✅

§13e stood as a P1 for three sessions on the reading that the refusal gates are too loose. They are
not. A page of four thin furniture OUTLINES really is offered 27/27 at structure up to 1.000 and
confidence 1.00 — but **nothing computable from the detected segments separates it from a floorplan**.
18 formulations of "cohesion" were measured; every one overlaps the protected population.

Two arguments, with different scopes (the first draft ran them together — the skeptic caught it):
- **THE THEOREM**, covering the ratio-to-the-whole family (cohesion / containment / span): each is
  `(largest component) / (all segments)`, so a ONE-COMPONENT reading scores identically **1.000**
  whatever the image depicts. Touching the furniture boxes reaches that for free.
- **THE CORPUS ITSELF**, covering everything else and stronger: `clean-rect` (floor 0.98) IS one
  closed rectangle and `two-room` (floor 0.95) IS two rectangles sharing a wall, so the nulls are
  drawings the suite demands be accepted — at any size, since the shrink ladder shows page-relative
  scale carries nothing. This disposes of the non-ratio candidates (T-junctions, enclosure) too.

Supporting, all re-measured by hand: the INVERSION (a legitimate terrace of three detached dwellings
0.333 vs a tight furniture cluster 0.522) · BISTABILITY (`apartment-rotated` 0.9882 → 0.5554 between
k=1.40 and k=1.60 at **identical** 900×669 pixels — resampling phase, not resolution) · FRAMING kills
the one page-normalised escape (`clean-rect` 0.819 → 0.511 padded; the attack 0.445 → 0.572 cropped).
**The naive fix was BUILT in a throwaway tree and swept**: a cohesion floor breaks 4/8/11 tests in
`detect.test.ts` at 0.35/0.45/0.55, refusing `apartment-rotated` and `oblique-survey` outright — and
even 0.35 refuses a plan photographed at phone resolution. No safe value exists.

**Redirect:** the missing information is METRIC SCALE. `Underlay.scale` is metres-per-pixel and
`detectWallsFromUnderlay` already holds it; `detectWalls` takes raw pixels and structurally cannot
know how big anything is. Needs a calibrated-scale flow first (`underlay-import.ts` seeds
`scale = 8 / wPx`, an explicit guess), so §13e drops **P1 → P2**.

### Block B — creation-time alignment: BUILT, MEASURED, REVERTED ⛔

Implemented `planAxis` + `bandRect` in `canvas/placement.ts`, wired both creation sites, 14 tests,
six negative controls **all caught**, and live-verified end to end — both paths persisted **-12.829°**
through IndexedDB and the canvas pill read `∠-13°`. Reverted anyway, because the self-review asked
the question the tests did not: **is the axis stable?** It is not.

- Maple Court has two wall populations (12.358 m folded to 77.75°, 7.840 m to 0.25°) and
  `dominantAngle` is winner-take-all, so **one ordinary 4.6 m wall drawn square flips the answer from
  -12.829° to exactly 0.000°** — reproduced independently. Four of the owner's six layouts are that
  plan. A margin gate cannot rescue it: the real margin is 1.58×.
- With Snap ON a 2.00 × 1.00 drag reads **1.728 × 1.419** (endpoints snap to the WORLD grid, extents
  project onto a rotated one).
- `arrange.ts:169` is a THIRD creation site still at 0°, so "Decide for me" would place a table at
  0.000° beside a palette sofa at -12.83°.

Reverted rather than patched, because the **premise** failed, not the arithmetic. Nothing left dead;
the build returns to byte-identical asset hashes. `docs/ideas.md` **§4c** carries every number,
including what was proven GOOD (exact-0 on Manhattan plans over 525 shells + 600 real-path walls +
192 generated designs; bit-identity over 200 000 drags; 48 µs at 500 walls; a NaN hole where `?? 0`
does not guard), so the next attempt starts from numbers.

### Evidence block

**Agents:** 8 measurement/design (4 lenses + synthesis + 3 skeptics) on §13e → the refutation, plus
the framing result and the single-component theorem. 4 self-review lenses on the diff → **1 HIGH**
(axis instability — real, reproduced, caused the revert), 2 MEDIUM on the §13e prose (**both real,
both fixed**), 3 LOW (all mooted by the revert, recorded in §4c).

**Adjudication (TRAP 9) — two agent claims did NOT survive:**
- An owner-plan lens reported span collapsing to 0.347. **Does not reproduce**: 0.8346 at k=0.55,
  minimum **0.7172**. I had already published it in a commit and two files; corrected in place.
- A skeptic's junction-degree figures could not be reproduced (my probe returned 0.000 for every
  input, including one that certainly has T-junctions), so they are **not cited**.

**Test count: 1536 → 1543** (+7). Never dropped. **Coverage green**: `quality.ts` **100 / 95.12 /
100 / 100**; `indistinguishable.test.ts` runs in 2 ms (all heavy work at module scope).

**Gate.**
```
Tests  1543 passed (1543)      Test Files  71 passed (71)
dist/index.html                   1.31 kB │ gzip:   0.62 kB
dist/assets/index-CaouhDpz.css   53.65 kB │ gzip:  10.00 kB
dist/assets/index-XVZZrUhb.js   500.75 kB │ gzip: 163.20 kB
eslint .  →  (0 problems)
```
Asset content hashes are **byte-identical to S30's** — the cleanest evidence that a refutation
changed no behaviour.

**Live:** `docs/sessions/S31/live-s31.mjs`, fresh Chrome profile, 13/13 checks passing on the §2c
build before it was reverted; screenshots in `shots/`. The first run reported two **vacuous** PASSes
(a wrong selector meant nothing was added and it asserted against pre-existing demo furniture); the
harness now fails loudly when the thing under test did not happen.

**Acceptance → outcome.** §13e "both null pages refused" ❌ **REFUTED — proven impossible at this
seam**, with the proof pinned and the work redirected · no legitimate corpus fixture refused ✅
(nothing changed) · owner's plan unchanged at 9/15/24 ✅ (verified, and unchanged by construction) ·
corpus mean ≥ 0.92 ✅ · §2c ⛔ **built and reverted**, fully specified as §4c.

### Honest limits

One browser (Chrome). No real screen reader has ever been driven on this project. The §13e result is
a claim about **this seam** — a function of the detected segments — not a proof that the problem is
unsolvable with other information; the metric-scale redirect is exactly the other information.

