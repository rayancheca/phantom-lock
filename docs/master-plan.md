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
screenshots stay local/gitignored (the demo apartment's floorplan is the owner's real home — never publish it).

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

**Gate.** `npm run lint` 0 problems · `npm test` **608 passed (608)**, 31 files (ratchet 340 → 608) ·
`npm run build` clean, **401.17 kB / 129.28 kB gz** JS + **43.19 kB / 8.24 kB gz** CSS.

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

Next: **Session 8-remainder (security hardening: CSP + headers + import size cap; README rewrite)** — kickoff below.

---

**KICKOFF PROMPT (Session 8-remainder — security hardening + README rewrite, the NEXT session)** — *run under
the Standing Operating Protocol at the top of this file (also in `CLAUDE.md`, auto-loaded).*

> ultracode
>
> **KICKOFF — Session 8-remainder / SECURITY HARDENING + README (Phantom Lock)**
>
> Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
> auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness and
> completeness, never speed. This task is **HEAVY** (it changes what the app will execute and what it will
> accept as input, and it rewrites the public front door of a PUBLIC repo), so it MUST get: a multi-agent
> Workflow (parallel understand → design → an adversarial skeptic that tries to REFUTE each risky change
> against the real code), full implementation (no stubs/TODOs/`.skip`/`.only`/scope-narrowing), failing-first
> tests for every new pure behavior, a self-review agent pass over the ACTUAL diff, and a handoff with an
> Evidence block.
>
> **0. GIT + ⚠️ THE WORKTREE-PATH TRAP.** MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`.
> Create a fresh per-session worktree branch off `main`. ⚠️ TRAP (has bitten UX-1/2/3 and cost time in S7):
> the worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a SEPARATE `main` checkout sits at the
> repo root — ALWAYS confirm with `git rev-parse --show-toplevel` and `git branch --show-current` FIRST, and
> pass worktree-relative paths to Read/Edit/Write, or your edits silently land in the wrong checkout and the
> gate lies to you. **Also: `node_modules` is NOT shared into a new worktree — run `npm install` first.**
> **Also: watch your shell `cwd`** — a `cd` in one Bash call persists into the next, and in S7 that put a
> `mkdir docs/sessions/S7` inside `src/components/canvas/`. Commit a baseline, commit again after the gate.
> Land with `git -C <MAIN_REPO> merge --ff-only <branch>` then `git -C <MAIN_REPO> push origin main`.
> Commit messages end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
> FIRST ACTION: run the full gate and PASTE the literal tails to confirm the baseline is green.
>
> **1. WHERE THE PROJECT IS.** Repo: github.com/rayancheca/phantom-lock (PUBLIC), default branch `main`.
> Baseline to reproduce: `npm run lint` 0 problems · `npm test` **608 tests, 31 files** across the `node` and
> `dom` vitest projects · `npm run build` clean (~401 kB / 129.3 kB gz JS + 43.2 kB / 8.24 kB gz CSS).
> **TEST COUNT IS A RATCHET** (95→126→140→181→239→245→296→322→340→**608**) — never let it drop, and never
> skip/only/weaken a test. DONE so far: Sessions 1–5, the whole UI/UX overhaul (S13–S16 = UX-1…UX-4), and
> **Session 7 (the a11y audit)** — read its progress-log entry and the new **Accessibility** section in
> `CLAUDE.md` before touching anything, because S7 added a keyboard model, two live regions, a contrast test
> that reads the real stylesheets off disk, and a second (jsdom) vitest project.
>
> **2. YOUR TASK — two blocks, both fully in scope.**
>
> **(A) SECURITY HARDENING.** The app is a zero-backend static site that accepts UNTRUSTED USER INPUT: JSON
> layout imports and floorplan photos. Deliver:
> - A production **Content-Security-Policy** with NO `'unsafe-inline'` for scripts, plus
>   `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`. Decide honestly
>   HOW it ships for a static Vite build (a `<meta http-equiv>` CSP, a host config file, or both) and say what
>   each does and does not protect. Note the app uses `blob:`/`data:` URLs (underlay photos, plan-image
>   export) and self-hosted fonts — the policy must actually allow the real app to run, so **prove it in a
>   real browser with a clean console**, not just by writing a header.
> - **Import hardening**: a size cap AND a shape/depth guard on layout-JSON import and on photo import,
>   with user-visible errors (the app already has an error-toast path — and after S7 error toasts are
>   `role="alert"`/assertive). `sanitizeScene` already exists; find out what it does NOT defend against
>   (prototype pollution via `__proto__`/`constructor`, absurd counts, NaN/Infinity coordinates, a 200 MB
>   image, a deeply nested object) and close the real gaps with failing-first pure tests.
> - Re-verify there are no secrets, and that nothing user-controlled reaches `innerHTML`/`dangerouslySetInnerHTML`.
>
> **(B) README REWRITE.** `README.md` predates the gallery, zones, detection, multi-select, the whole UX
> overhaul and the a11y work — it is the front door of a public repo and is badly stale. Rewrite it to the
> standard in the user's global rules (`~/.claude/rules/common/readme-standards.md`): what it is · **live
> workflow screenshots (minimum 6, numbered captions, real data, captured from the running app)** ·
> architecture · a technical deep-dive that explains something non-obvious (candidates: the 2D-plan vs 3D-path
> split in the lock test; image-source reflections having to land on a SOLID span; the mode-owns-the-theme IA;
> why the canvas needs `role="application"`) · install + run · real usage examples. **Screenshots go in
> `docs/screenshots/` and MUST be committed** (unlike `docs/sessions/`, which is gitignored) — so they must
> show the **bundled "Maple Court" demo, never the owner's real layout**, and must contain no real address.
>
> **SCOPE GUARD:** do NOT touch `src/engine` acoustics math (`optimize.ts`/`rooms.ts`/`stereo.ts`/`raytrace.ts`
> must be byte-unchanged) and do not regress the S7 a11y work or the S13–S16 design system.
>
> **ACCEPTANCE:** a documented CSP + headers that a real browser enforces with a clean console and a working
> app (proven live, both modes) · import of a hostile/oversized/malformed file fails safely with a visible
> assertive error and never corrupts the store · new pure guards are failing-first tested · README meets the
> standard with ≥6 real committed screenshots · gate green (lint 0 · ≥608 tests · build) · the owner's real
> layout untouched.
>
> **3. READ FIRST:** `CLAUDE.md` (protocol, architecture map, design system, **Accessibility**, and the
> "Hard-won lessons" list — it encodes real bugs, including several from S7) · this file's Standing Operating
> Protocol + the Session 7 and Session 8 blocks · `docs/ultrareview.md` §3.4 (security) · then
> `src/engine/scene.ts` (`sanitizeScene`), `src/engine/db.ts`, `src/components/app/hooks/useLayoutActions.ts`
> (import path), `src/components/panels/underlay-import.ts`, `index.html`, `vite.config.ts`.
>
> **4. ⚠️ DATA SAFETY — THE OWNER'S REAL LAYOUT IS ON THIS MACHINE.** The preview's IndexedDB on
> `localhost:5173` holds their real layout — as of 2026-07-22 it is **one** layout, `layout-mrwb0lnz-28-u87ub`,
> named **"Maple Court"**, 24 objects / 2 speakers (VERIFY the live values, don't assume). **NEVER delete the
> owner's layouts.** Back up FULL-FIDELITY to `docs/sessions/S8/backup.json` (gitignored) BEFORE any write
> test by reading the `phantom-lock` IDB `layouts` + `meta` + `underlays` stores. Prefer a **fresh headless
> Chrome profile** for all interactive testing — a fresh `--user-data-dir` is a fresh ORIGIN, so the app gets
> its own IndexedDB and theirs is never touched. Afterwards confirm the layout record's `updatedAt` is
> byte-identical (the `meta` row's `updatedAt` DOES advance on every boot — that is normal and not a change to
> their data). Never hand-mutate IndexedDB to "reset". Keep any real street address out of committable files:
> `git ls-files -oc --exclude-standard | xargs grep -l "Bay"` must be empty (the only legitimate match is this
> instruction quoting its own search string in `docs/master-plan.md`).
>
> **5. LIVE VERIFICATION.** The in-app preview tab runs `document.hidden`, so rAF (canvas render/drag/hover) is
> PAUSED there; drive rAF-gated behavior in headless Chrome over CDP (zero-dep, Node 25 has built-in
> `WebSocket` + `fetch`): `--headless=old` + `--window-size` at LAUNCH (NOT
> `Emulation.setDeviceMetricsOverride`, which deadlocks capture), and `Page.captureScreenshot` as
> `format:'jpeg', quality:90` (a big PNG silently overruns the built-in WebSocket). A working client is
> described in the S7 log. **Verify visual claims by pixel diff, not by `getComputedStyle`** — S7 shipped an
> invisible focus ring that `getComputedStyle` reported as present.
>
> **6. FINISH.** Paste the literal gate tails. Spawn self-review agents (`security-reviewer` +
> `code-reviewer` + `silent-failure-hunter`) over the ACTUAL diff; fix everything real; re-verify. Save
> evidence to `docs/sessions/S8/` (gitignored) and the README screenshots to `docs/screenshots/` (committed).
> Update `CLAUDE.md` (commands/ratchet/bundle size, a Security section, new lessons) + this checklist and
> progress log with a full **Evidence block** (agents + verdicts · before/after test count · pasted gate
> output · saved artifact paths · each Acceptance bullet → met/deferred). Commit on the session branch, land
> on `main` via `--ff-only`, and `git push`. Then write the NEXT kickoff — **Session 12: the auto-detect walls
> accuracy overhaul** (root causes are already diagnosed in this file against `src/engine/detect.ts`) —
> re-stating this protocol in full.
