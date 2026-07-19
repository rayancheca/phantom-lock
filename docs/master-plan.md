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
**Status:** ☐ **Depends on:** nothing hard (do after S1-S4 land so you refactor stable code)
**Unblocks:** cleaner S6/S7

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
**Status:** ☐ **Depends on:** S1 (async store), ideally S5 (`useSimulation` extracted)

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
**Status:** ☐ **Depends on:** ideally S5 (keyboard hook)

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

**KICKOFF PROMPT** — *run under the Standing Operating Protocol at the top of this file (also in CLAUDE.md, auto-loaded): multi-agent orchestration, adversarial verification of every serious finding, full implementation (no shortcuts/stubs), test everything (unit + live browser), a self-review agent pass, the full verification gate, clean-up, and honest reporting. Token/time budget is unlimited — optimize for perfection, not speed.*
> Read `docs/ultrareview.md` §3.6 in the Phantom Lock repo and execute Session 7 of
> `docs/master-plan.md`: make the canvas keyboard-operable (focusable + arrow-nudge/cycle/select/
> delete, plus a keyboard-reachable object list), add an off-screen aria-live text mirror of scene
> state + verdict announcements, fix the `--text-3` surface-3 contrast (with a contrast unit test),
> restore input focus rings, convert the tablist to aria-current, focus-manage the detected-layout
> dialog, make error toasts assertive, and extend reduced-motion. Verify with an automated a11y check
> + `npm test` + `npm run build`, update the checklist, write the Session 8 handoff.

---

## Session 8 — Design polish + onboarding + hardening + README
**Status:** ☐ **Depends on:** S2 (so onboarding covers compare) **Independent otherwise**

**Goal.** Make it feel like one finished premium instrument, and teach a first-timer.

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

## Backlog (noticed, not yet scheduled — add to a session as it fits)
- **Auto-detect walls accuracy** — now scheduled as **Session 12** (duplicated/diagonal tangle on real floorplans);
  see its block above. Surfaced by first-time-user clickthrough.
- RT60 / room-mode / per-frequency acoustic output (deeper analysis to match the "real physics" framing).
- Shareable/exportable result (PNG/PDF plan + verdict).
- Real touch controls (on-screen rotate/nudge/delete) beyond the stacked ≤960 px layout.
- Persisted undo history across reload (currently in-memory only).
- Multi-tab coordination policy (BroadcastChannel vs last-write-wins).
- Periodic slim (imageless) localStorage mirror so the rollback snapshot isn't frozen at first migration (from the S1 data-loss review); surface a toast when an oversized underlay is dropped by `sanitizeScene`.
- Alpha-token rename (`ok-10`→`ok-12`), off-ladder radii snap, header perpetual-animation trim.

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
