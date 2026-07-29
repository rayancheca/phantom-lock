# Ideas backlog — prioritized

Candidate work that is **not** yet scheduled as a numbered session in
[`master-plan.md`](master-plan.md). Ordered by priority; each entry states the priority, why it
sits there, and a rough effort estimate. Priorities are a judgement call — argue with them.

**How priority was decided:** (1) does it fix something actively broken or unsafe, (2) does it
unblock or improve something the owner hits in real use, (3) is it additive polish. Ties broken by
effort — a small high-value item beats a large one.

| # | Idea | Priority | Effort |
|---|---|---|---|
| 13 | ✅ **Detection refuses the owner's floorplan** — **REFUTED S26** (measured at a resolution the app never uses) | ~~P0~~ done | — |
| 13b | ✅ **Detection's verdict was unstable under a tone curve** — **DONE S27** (owner 38/138 refusals → 0/138; corpus mean 94.82 % → 95.48 %) | ~~P1~~ done | — |
| 1 | ✅ **Auto-detect walls accuracy overhaul** — **DONE S22** (52.1 % → 95.6 %, and it refuses) | ~~P0~~ done | — |
| 2 | ✅ **Grid-loop iteration cap** — **DONE S18** (safety half; slowness half → 2b) | ~~P0~~ done | — |
| 2b | ✅ **Bound the reflection search** (`bestReflectionDb`) — **DONE S19** (50-room 13.7 s → ~0.5 s) | ~~P1~~ done | — |
| 2d | Close the last wall-heavy residual (12–14 s → <10 s): `bestPairSpot`'s 32 null sweeps | P2 | ½ session |
| 2c | Bound `traceScene` + `arrange.openSlots` | P2 | ½ session |
| 3 | **Guided tutorial mode** | **P1 — high** | 1–2 sessions |
| 3b | ✅ **Door width + swing angle** (owner-requested) — **DONE S17** (G2f corridors deferred) | ~~P1~~ done | — |
| 4 | ✅ **Snap furniture to a wall's angle** — **DONE S23** (drag half; `f` command → 4b) | ~~P1~~ done | — |
| 4b | The explicit seat COMMAND (`f`/⇧F + Inspector/HUD buttons + snap guide) | **P1 — high** | ½ session |
| 11 | ✅ **Generate a design** (owner-requested randomizer) — **DONE S22** | ~~P1~~ done | — |
| 5 | Read-only 3D view | P2 | 1 session *(plan exists)* |
| 6 | Component/hook tests | P2 | 1 session |
| 10 | ✅ **Projects (folders) + N-up compare** (owner-requested) — **DONE S20** | ~~P1~~ done | — |
| 10b | Bundle IMPORTER (read an export-all backup back in, folders included) | P2 | ½ session |
| 10c | Layout ORDER within a folder (drag to reorder; today `getAll()` key order) | P3 | small |
| 10d | Multi-tab: `saveMeta` overwrites the folder list wholesale (last-writer-wins) | P2 | ½ session |
| 12b | ✅ **`rooms.ts` flood fill walked THROUGH walls** — **DONE S25** (19 → 0 unsealed) | ~~P1~~ done | — |
| 7 | Drag-release wall splitting | P3 | small |
| 8 | Multi-select with a listener in it | P3 | small |
| 9 | Window/door-leaf reflection materials | P3 | small |

---

## 1. Auto-detect walls accuracy overhaul — ✅ **DONE (S22)**

Rebuilt around thinning and connected tracing rather than a global Hough transform. Measured against
a new code-generated corpus with exact ground truth (`src/engine/__tests__/fixtures/`), scored through
an intersection-over-union on wall LENGTH:

| | before | after |
|---|---|---|
| mean over 20 fixtures | **52.1 %** | **95.6 %** |
| furnished plan | 26.6 % | 99.8 % |
| cavity (double-drawn) walls | 41.1 % | 100 % |
| an image with NO floorplan | **61 walls emitted** | **refused** |
| a plan shot 22° off-square | 16.8 % | 84.9 % |
| cost | 1 288 ms / corpus | 850 ms / corpus |

The proposal is now REVIEWABLE — a confidence readout, three named sensitivity levels, and per-wall
strike-off before anything is committed.

**Not delivered, and worth naming:** detection has never been run against the owner's own floorplan
photo — every number above is from the synthetic corpus. The harness takes one directly:
`score-corpus.ts --image <file.png>`. Two fixtures also remain below 92 %: `hatched` (91.6 %) and
`apartment-cluttered` (82.3 %). Both lose PRECISION or coverage rather than duplicating, so the
failure direction is "a couple extra to delete" — never the tangle the feature used to produce.

The Session-12 acceptance bullet *"the detected result is committed through `integrateWall`"* was
deliberately RETIRED rather than met: measured, feeding N detected walls through it produces N²/2
objects, and `joinCorners` already makes corners meet. See the S22 lesson in `CLAUDE.md`.

## 2. Grid-loop iteration cap — ✅ **DONE (S18)**, safety half only

Landed as `src/engine/grid.ts`. It had **two** claimed payoffs; exactly one was delivered, and the
split is worth recording because the reason is structural, not effort.

**✅ Safety — done.** One simulation pass on an import-legal payload went from a measured **264.6 s
to 4.9 s**, and cost is now flat in span. The object-bomb shape (5 000 objects) went from hours to
4.5 s. A pre-existing non-termination class S8 had missed — `t += step` cannot advance when the box's
absolute *coordinates* are large, independent of span — is closed too. Full table and the remaining
caveats in [`security.md`](security.md) §"Worst-case CPU".

**❌ Everyday slowness — NOT fixed, and this cap structurally cannot fix it.** Measured after the cap:
a 50-room chain still costs 14.2 s per edit and a 100-room chain 106.1 s — *unchanged*, because their
cost is not span-driven at all. It comes from `bestReflectionDb`, the blocked-line-of-sight fallback,
which is O(walls × (objects + surfaces)) and fires on nearly every cell in a heavily-walled house. The
cap's cost proxy deliberately omits that term: a legitimate multi-room house is itself the
wall-heaviest thing in the app, so a walls-aware budget would fire on real layouts (measured: a legit
50-room chain scores **20× higher** than the wall-heavy attack under such a model). The two
populations are not separable by any cheap static cost model.

→ Rescheduled as **§2b** below with its own acceptance.

## 2b. Bound the reflection search — ✅ **DONE (S19)**

Landed as `src/engine/reflection.ts` plus two caller-level skips. `bestReflectionDb`
was 94–100 % of a simulation pass on every wall-heavy scene, and it loaded that cost
through **opposite factors** in the two shapes that mattered — the 50-room chain ran
45 901 calls at 315 µs each, the wall-heavy attack 16.0 M calls at 7.7 µs — which is
precisely why S18's cap could not touch either: the chain's grids are never capped at
all. Three independent wins, all bit-identical:

1. **Per-call.** Everything independent of the grid cell is hoisted out of it: per-wall
   edge vector, unit direction, `20·log10(keep)` and the open-door spans (turning an
   O(objects) scan into an interval list), per-(speaker, wall) mirror images. The
   `surfaces.filter(...)` array plus two `directPath` objects per wall per cell became
   one allocation-free `blocked`-only scan — legal because `blocked` is a pure
   existential, so any visit order and any witness give the same boolean.
2. **Primitive.** `geometry.ts` gained `raySegmentT`/`rayCircleT`/`surfaceT`: the same
   `t` without building `point`/`normal` (and without the `Math.hypot` inside `v.norm`).
   `directOcclusion` uses them, which alone took the object-bomb payload 4.9 s → 0.12 s.
3. **Caller.** `bestListeningSpot` skips a cell whose pure geometry scores zero for
   every pair (when nothing is unpaired), before paying for any occlusion;
   `bestPairSpot` short-circuits the second `reachDb` *computation*, not just its test.

| payload | before | after | |
|---|---|---|---|
| 50-room chain | 13.7 s | **0.50–0.58 s** | 24–27× |
| 100-room chain | 102.8 s | **1.8–2.0 s** | ~52× |
| 10-room chain | 179.8 ms | **40–48 ms** | ~4× |
| bundled demo | 64.4 ms | **50–60 ms** | ~1.2× |
| wall-heavy span 399 | 129.7 s | **12.0–13.9 s** | 9–11× |

**Acceptance:** 50-room < ~2 s ✅ (0.50–0.58 s) · byte-identical on the protected set ✅
(162/162 new golden + 30/30 S18 golden, with failing negative controls) · ratchet ✅
(760 → 814) · wall-heavy < ~10 s ❌ (12–14 s) → §2d.

Note the §2 argument this did NOT overturn: a walls-aware cost proxy is still
forbidden, because a legitimate multi-room house remains the wall-heaviest thing the
app produces. S19 made the work cheaper rather than capping it.

## 2d. Close the last wall-heavy residual — **P2**

The wall-heavy import-legal payload (20 walls / 64 speakers / 32 pairs / span 399) sits
at **12–14 s**, against the ~10 s §2b aimed at. Measured split: `computeAudio` **8.5–9.8 s**,
`bestListeningSpot` **3.4–3.9 s**, `traceScene` 0.13 s. The `computeAudio` term is
`bestPairSpot` running once per apex-blocked pair — 32 sweeps of ~154 000 cells — and it
returns `null` for **every** pair, so all 8.5 s produces nothing. The S19 cell-skip does
not transfer: `bestListeningSpot`'s gate is pure geometry, `bestPairSpot`'s is
*reachability*, which cannot be decided without the occlusion work it is trying to avoid.

`reflectionDb` is near its floor at 1.0 µs/call (20 wall iterations, two unavoidable
divisions each — the obvious single-reciprocal fix is exactly the reassociation
bit-identity forbids). So this needs a different idea, not more of the same one.
Candidates worth measuring: hoisting `bestPairSpot`'s sweep so the 32 pairs share one
pass over the grid instead of 32; deciding `apexBlocked` more cheaply upstream in
`stereo.ts` so fewer pairs reach `bestPairSpot` at all; or a cheap conservative
reachability bound per (speaker, cell) reused across pairs.

**Acceptance:** the wall-heavy payload drops below ~10 s · every output stays
byte-identical against `reflection-golden.json` and `legit-golden.json` · ratchet respected.

## 2c. Bound `arrange.openSlots` (and `traceScene`) — **P1, promoted on measurement**

**`arrange.ts` `openSlots`/`fits()` is the single worst unbounded path left in the codebase** — measured,
not estimated. It materialises a slot array over `sceneBounds` at a fixed 0.45 m step (~786 k slots at
span 399), and `fits()` re-concatenates `[...ctx.scene.objects, ...ctx.placed]` — a fresh array — for
*every* candidate, on *every* `placeOne` call. Measured: span 20 m → 23 ms, 100 m → 428 ms, 399 m →
**6.85 s** for a 6-item furnish queue; holding span at 399 and adding clutter costs ~**370 ms per
existing object** (0 → 469 ms, 75 → 27.7 s, 150 → 57.1 s). Extrapolated to the import ceiling that is
**30+ minutes for one `placeOne`**, and "Decide for me" calls it repeatedly. It is behind a dialog rather
than the render path, which is the only reason it is not P0 — and `grid.ts` is now sitting right there.

`traceScene` is the smaller, separate half: structurally out of reach of any span-derived cap because
`MAX_RANGE = 60` (`raytrace.ts`) clips every ray, so its cost is `speakers × rayCount × surfaces` and
does not depend on span (measured flat, 4.0–10.5 ms across spans 10 → 399 at fixed load). `rayCount` and
`maxBounces` are sanitized, but object and speaker counts are **not** bounded on the load path — only
`importRejection` limits those, and it guards a single call site (the JSON importer). Measured linear
growth: 200 objects → 3.6 ms, 5 000 → 99.7 ms, 20 000 → 396.6 ms; 4 speakers → 2.2 ms, 300 → 125.3 ms.

*(Measured clean and needing nothing: `rooms.ts` `regionOf` stays sub-10 ms at 1 200 walls / 300 rooms —
the S3 adaptive-cell fix holds — and `optimize.ts` `placeAcrossHouse` scales linearly at ~125 ms
projected for `MAX_IMPORT_ROOMS`.)*

---

## 3. Guided tutorial mode — ✅ **DONE (S21, 2026-07-28)** — owner-requested

**SHIPPED.** `src/components/tutorial/` — 7 chapters, independently launchable from a chapter menu
behind a "Tour" button in the global header, plus "Take the tour" as the primary action on the
first-run welcome. Skippable, resumable (the menu offers "Continue … — step N of M"), shown
unprompted only on a genuine first run, page-wide axe clean, and it writes to nothing but its own
disposable "Tutorial practice room". 1082 tests (+121).

**What the design got right that the write-up below did not anticipate.** The plan assumed the hard
part was the anchor model. It was not — the hard part was that THE LOCK IS A PRECISION CONDITION.
Measured: with one speaker pinned, only 3–5 cells of the 0.05 m snap grid lock at all, a target
~0.05–0.10 m across. "Drag it until it locks" would have stalled the tour on its own climax for
almost every user. And the ignition is a false→true EDGE, so a step that merely lands on an
already-locked scene shows nothing. The shipped spine therefore splits the work: the runner does the
precision placement (two pods at ±30°, which locks at quality 0.997 in a clean room and NOT in the
furnished demo), and the user makes the pairing click — which is the edge.

**Deviations from the plan below, each deliberate:** no `{kind:'world'}` anchor in this pass (the
view transform IS reachable — `SimCanvas`'s `view` is React state and `worldToScreen` is exported —
but lifting it to App would re-render the whole sidebar on every pan frame, and jsdom's 0×0 rects
make the projection unprovable in the a11y suite; the copy names canvas objects instead). Reduced
motion is left entirely to CSS, as every other component in this repo does it. The `FirstRunExplainer`
was NOT absorbed into chapter 0 — it gained a "Take the tour" button instead, which keeps a proven
first-run gate rather than replacing it.

**Still open (deliberately out of scope, as the plan said):** video/GIF, voiceover, per-step
analytics, localisation, a mobile-specific tour. Also not built: an offered cleanup of the practice
room on exit (the copy points at the layouts screen instead — a delete flow is the riskiest thing
this feature could have grown, and the room is visible and clearly named).

<details>
<summary>The original design write-up (kept for the reasoning, now superseded by the shipped code)</summary>

## 3-original. Guided tutorial mode — **P1 (high)**

> *Owner's request:* a button, available at any time, that gives a tutorial and rundown of the app,
> guides you where to click, creates an example, and shows all possible functionality.

P1 rather than P0 because nothing is broken without it — but it is the highest-value *additive*
item on this list, because the app's core concept (a phantom center that "locks") is genuinely
unfamiliar and the UX-4 work only got as far as static explainers.

### The central design tension

"Show me **all** functionality" and "a tutorial I actually finish" pull in opposite directions. A
single 30-step linear tour is the thing everyone skips. Resolution:

- **A short spine, then optional branches.** A ~6-step golden path (draw → furnish → place →
  read the verdict) that can be finished in about two minutes, with each later chapter offered as
  "want to see X?" rather than forced.
- **Chapters are independently launchable.** The button opens a chapter menu, so it doubles as
  documentation you can re-enter at the exact topic you forgot. This is what makes "at any time"
  meaningful — a tour you can only take once is an onboarding flow, not a tutorial.
- **Coverage is enforced by a test, not by discipline** (see below), so "shows all functionality"
  stays true as the app grows.

### What makes this non-trivial *in this codebase*

1. **Half the UI is not DOM.** Every tutorial library (Shepherd, driver.js, intro.js) spotlights a
   DOM node. Walls, furniture, the YOU puck, the ★ best spot and the ray field are pixels on a
   canvas. So the anchor model needs two kinds:
   - `{ kind: 'dom', selector }` → `getBoundingClientRect()`
   - `{ kind: 'world', at: Vec2 }` → project through the live view transform
   The world anchor must re-project whenever the view changes (pan/zoom/rotate are rAF-driven), so
   the spotlight has to subscribe to the same view state `SimCanvas` already owns. This is the
   single biggest reason not to reach for an off-the-shelf library — and the project is zero-dep by
   design anyway.
2. **It must never touch the user's real data.** The tutorial "creates an example", so it must
   create a **disposable layout** (`Tutorial`) and switch to it — never mutate the active one. On
   exit, offer to remove it via the existing undo-toast pattern. This is the same rule that governs
   every other session: test on a duplicate, never the owner's "Maple Court".
3. **Progress state must NOT live in the persistence schema.** Use a standalone localStorage key
   (`phantom-lock:tutorial-progress`), exactly as the first-run welcome uses `intro-dismissed`.
   Putting it in the store would migrate into IndexedDB forever and entangle a UI preference with
   user data — the S16 lesson.
4. **Steps must drive the REAL commands.** Reuse `runKeyCommand` / `applyTool` / `applyMode`, the
   way `SelectionActions` already reuses the keyboard path. A tutorial that simulates the app is a
   second implementation that will drift and then lie.
5. **Mode-awareness is mandatory.** The IA is DESIGN/TUNE with a DESIGN sub-step, and tools are
   mode-scoped. Each step declares the mode it needs; the runner switches via `applyMode` **and
   says so** ("switching to DESIGN — walls are drawn here"), because a silent mode flip is exactly
   the split-personality confusion UX-2 removed.
6. **Accessibility at creation, not later.** Per the standing rule for new interactive UI: fully
   keyboard-operable, visible focus, `prefers-reduced-motion` respected (the spotlight moves —
   offer a no-transition path), no contrast regression, and each step change announced in a live
   region. Reuse `Dialog`'s focus trap/restore rather than rolling a new one. Note that a *modal*
   trap is wrong for steps that ask the user to click the canvas — those need a non-modal
   coach-mark that leaves the app operable, so the component needs both behaviours.
7. **CSP compatibility.** No external library, and the spotlight must position itself via CSSOM
   (React inline styles) — the S8 test fails the build on `setAttribute('style')`.

### Two step kinds, and why both are needed

- **`show`** — the runner performs the action itself and narrates it. Good for things that are
  tedious or hard to do correctly on the first try (running the arranger, applying an optimizer
  proposal).
- **`try`** — the runner points, then **waits for the user to actually do it**, gated by a pure
  predicate `done(scene, ui) => boolean`. This is what "guide me where to click" really means, and
  it is the only kind that proves the user can do it unaided.

Because `done` is a pure function of scene + UI state, the whole step list is unit-testable with no
DOM — which is how this fits the repo's testing culture. A `try` step also needs a **nudge after
inaction** and an **"just show me" escape hatch**, or a stuck user is stranded.

### Chapters (the coverage checklist)

| Chapter | Covers |
|---|---|
| 0 · What this is | phantom center, lock, the two modes — absorbs `FirstRunExplainer` |
| 1 · Build | wall chains, room shell, floorplan photo + calibrate, doors/windows, areas |
| 2 · Furnish | palette, rotate (fine / ⇧ coarse / hold-to-sweep), arranger |
| 3 · Tune | place pods, pair them, TV vs Music, drag YOU, read the verdict, spec sheet + `Term`, legend |
| 4 · Optimize | Suggest placement targets, preview ghosts, apply, undo |
| 5 · Compare | second seat, per-seat verdicts, 2-up compare |
| 6 · Layouts | gallery, duplicate, import/export, export plan image, copy verdict |
| 7 · Power user | full key map, selection cycle, marquee/lasso, multi-select, view rotate |

**Coverage test:** enumerate the app's tools (`DIGIT_TOOL`), modes, and primary panel actions, and
assert every one appears in at least one step. Adding a tool without a tutorial step then fails the
suite — the same "fail when the scan finds nothing" pattern as the contrast and CSP tests.

### Rough shape

`components/tutorial/` — `steps.ts` (pure data + `done` predicates, node-tested), `TutorialRunner.tsx`
(state machine), `Spotlight.tsx` (dual-anchor overlay), `TutorialButton.tsx`. Entry point in the
header next to undo/redo, plus a "Take the tour" action in the first-run welcome.

### Deliberately out of scope for a first pass

Video/GIF, voiceover, per-step analytics, localisation, and a mobile-specific tour. Ship the spine
and chapters 0–4 first; 5–7 can follow once the runner is proven.

</details>

---

## 3b. Door width + swing angle — ✅ **DONE (S17, 2026-07-23)** — owner-requested

> *Owner:* "i want it to be easy to make doors and windows and also select for [how] far
> the door swings given its size".

**SHIPPED in S17.** "Easy to make": a DESIGN/Build **door/window tool** (digit 5, click a wall,
⇧=window, with a live ghost), plus the palette drop now lands on the nearest wall, plus the `d`/`w`
keys and the (now overlay-gated, DESIGN-scoped) hover chip. "Select how far it swings given its
size": a **door-specific inspector** (Width 0.6–2.4 "clear opening" + 70/80/90 cm presets, a Swing
slider 0–180°, Hinge left/right + Swing in/out flips) + `f`/`⇧F` canvas flips, drawn on the plan as
the classic leaf + quarter arc + jamb ticks in both themes. The swing is **plan-symbol only** (no
acoustic effect — proven byte-identical across swing values by an equivalence test; the 6 frozen
engine files are untouched); `doorOpen` remains the sole acoustic switch. See
`docs/sessions/S17/design-pass.md` + the S17 progress-log Evidence block.

**Deferred (own block): G2f — swing-aware furniture corridors in `arrange.ts`.** Today the arranger
keeps a *rectangular* keep-out corridor at each door; a swing-aware version would carve the quarter-
circle swept footprint so furniture never lands where the leaf opens. Named acceptance: (1)
`arrange`/`suggestInventory` place no furniture intersecting a door's swept arc (given
`swingDeg`/`hingeEnd`/`swingSide`); (2) `swingDeg:0` behaves exactly as today; (3) a door+sofa test
asserts the sofa lands clear of the arc; (4) existing corridor tests stay green. Swing stays
render-only until then. Also noted: a door's rotation is wall-locked in the inspector + `q`/`e`, but
dragging a door to a differently-angled wall re-snaps rotation — auto-reorient-on-drag is unchanged.

<details><summary>Original pre-S17 groundwork (kept for history)</summary>

The "easy to make" half was a bug and is **fixed** (the chip was unclickable for three separate
reasons — see the `fix: make the +Door/+Window chip clickable` commit). The **swing** half is not
built. A design pass was started and its investigation completed before the session hit its usage
limit; the acoustics analysis, the spec and the skeptic did **not** run, so nothing here is a
finished design — but these facts are verified and should not be re-derived.

**A full, ready-to-run kickoff for this feature exists at
[`kickoff-door-swing.md`](kickoff-door-swing.md)** — it folds in the completed data-model + UX
investigations as verified file:line facts, states the one open question (what swing means
acoustically), and lists the ranked change set + minimum shippable slice. Start there.

**How a door works today (verified, file:line):**
- A door is not its own type: it is a `RectObj` with `role: 'door'` (`types.ts:20-37`). There is
  **no hinge side, no swing direction and no swing angle** — the drawn arc is hardcoded.
- `doorOpen?: boolean` (`types.ts:33`), and the universal convention is `doorOpen !== false`
  ⇒ OPEN, i.e. *absent means open*. `sanitizeObject` normalises it to a real boolean on every
  load (`scene.ts:496`).
- `w` is doing **two jobs**: it is the opening width that cuts the wall
  (`raytrace.ts:55`, `half = o.w/2/len`) *and* the drawn swing radius
  (`render.ts:544`, `rPx = o.w * view.scale`). Leaf length is therefore welded to door width —
  a swing feature must either respect that coupling or deliberately break it.
- Acoustically, a door is a **hole or a wall, nothing in between**: an open door contributes
  **no surfaces at all** (`raytrace.ts:91` `continue`), a closed one contributes its four edges
  with its own `absorption`. `pairspot.ts:79` additionally refuses an image-source bounce whose
  reflection point lands inside an open door's span.
- `makeOpening` defaults (`interaction.ts:59-79`): door `w 0.9`, `h 0.1`, `absorption 0.25`,
  `height 2.05`, `doorOpen true`.

**Constraints any implementation must respect:**
- The sanitizer is allow-list reconstruction — a new field that is not explicitly copied is
  **silently dropped on the first save→load**, so the feature would simply not persist. Add it
  gated on `role === 'door'` exactly like `doorOpen`, and **clamp it**: an unbounded numeric field
  is precisely the class S8 just hardened (`Math.max(0.05, o.w)` with no upper bound is what made
  the `r: 1e308` brick possible).
- Make it optional (`?:`) — hand-built rect literals in `raytrace.test.ts:176`, `pairspot.test.ts:120`,
  `hit.test.ts:88`, `arrange.test.ts:55` and `rooms.test.ts:244` would break on a required field.
- Existing `makeOpening` tests use `toMatchObject`, so adding a field breaks nothing there.
- **Migration is the risk.** The owner has real saved doors. Every existing door must behave
  identically after the change — same acoustics, same rendering. Decide the "absent" default once
  and reuse it at every read site, or old doors will read one way in the renderer and another in
  the engine.

**The honest-design question to settle first:** what should a swing angle actually *do*? Today the
model is binary. A swing control that looks physical but changes nothing acoustically would be a
decorative lie; an elaborate partial-transmission model would be unverifiable. Resolve that before
writing code, and be explicit in the UI about what it does and does not affect.

*(S17 resolution: PLAN-ONLY. The swing draws the leaf's clearance and changes no acoustics; the UI
says so verbatim. `doorOpen` stays the sole acoustic switch — the honest, testable model.)*

</details>

## 4. Snap furniture to a wall's angle — ✅ **DONE (S23)**, the drag half

The owner's complaint — *"I'm angling the bed but it never sits flush against the wall"* —
turned out to understate it. Their real floorplan, supplied this session, is almost
**entirely** non-axis-aligned: every exterior wall skewed, the kitchen partition angled, the
bathroom block rotated. So this was never polish; it is the primary furnishing gesture, and
the 5 cm world grid is useless perpendicular to a 13° wall (the lattice projects onto that
normal quasi-densely, so there is no reachable zero).

The app already had HALF of it: `arrange.ts` `wallSlots` places AUTO-arranged furniture at
`rotation = atan2(dir)` offset along the inward normal. So "Decide for me" produced
wall-aligned furniture while dragging by hand did not — an inconsistency, not a missing
feature. S23 applies that same convention to the drag path.

**Shipped:** drag a furniture rect or the TV within 0.35 m FACE clearance and it takes the
wall's angle; within 0.15 m it seats flush. Shift suppresses. Doors/windows keep their own
straddle magnet, lifted verbatim out of `SimCanvas` and pinned by a characterization oracle
(5 000 randomised triples, bitwise) because it had shipped with zero coverage.

**Three properties are load-bearing**, each pinned by a test, and each was forced by a
measurement rather than chosen:

- **`Drag['move-rc'].rot0` is REQUIRED** and every frame snaps from it, so the per-frame
  transform is a pure function of the gesture rather than a feedback loop over its own
  output. Leaving a wall's field restores the identical float; one ⌘Z restores centre and
  rotation together, so `ideas.md`'s old *"undo returns the exact previous rotation"*
  requirement is met **structurally**.
- **The gate is on the SIGNED gap.** An `|gap|` gate gives the band a NEAR edge, so shoving
  a piece harder into a wall RELEASES it — measured, a bed jumped **0.163 m backward**
  (larger than the seat band itself) and then un-rotated while half-buried.
- **A candidate needs real footprint overlap.** Without it a 0.7 m closet wall gets a 2.70 m
  capture window — **3.9× its own length** — and acts as a magnet over the surrounding floor.

**Nearest-π, not nearest-π/2**, and that is forced by the owner's plan: on a building rotated
as a whole every wall shares one quarter-turn class, so under nearest-π/2 a piece born at
`rotation: 0` (which `App.tsx:446` hardcodes for every palette drop) lands **across** half the
walls and dragging never fixes it. Verified over both wall classes of a 22° building.

**Deferred to §4b, each with its own acceptance:** the explicit `f`/⇧F command, the Inspector
and touch-HUD buttons, and the on-canvas snap guide. Note the quarter-turn must be applied
AFTER the snap — a skeptic proved that adding π/2 to the INPUT of a nearest-π snap is
annihilated by it (a literal no-op on 13/22/37/68° walls, a footprint-identical 180° flip on
the rest). Until §4b lands, the escape for a deliberately perpendicular piece is Shift-drag,
which holds `rot0` exactly — real, and documented rather than hidden.

Also deferred: **creation-time alignment**. `App.tsx:446` and `SimCanvas.tsx:1015` both
hardcode `rotation: 0`, so on a skewed plan every new rect still arrives crooked before any
drag. Same helper, ~2 more call sites, probably the next-biggest everyday win.

---

## 5. Read-only 3D view — **P2**

Plan already written: [`3d-view-plan.md`](3d-view-plan.md). Owner approved Three.js and stated
bundle size does not matter. P2 because it is purely additive — nothing is broken without it — but
it is the most "cool" item on the list and the owner has explicitly blessed it.

⚠️ It will need the CSP loosened: Three.js DRACO/KTX2 loaders spawn workers from `blob:` URLs, so
`worker-src 'self' blob:` (already recorded as `FUTURE_LOOSENING` in `src/security-headers.ts`), and
`connect-src 'self'` if any asset is fetched.

## 6. Component/hook tests — **P2**

The old blocker is gone: S7 added jsdom, React Testing Library and `fake-indexeddb`. Hook tests are
writable today; they just have to be named `*.test.tsx` (`vite.config.ts` routes by filename). The
six extracted hooks and four shell components are still 0% behaviourally covered.

## 7. Drag-release wall splitting — **P3**

Creation splits crossed walls via `integrateWall`, but dragging a wall across another does not.
Small inconsistency, rarely hit.

## 8. Multi-select that can include a listener — **P3**

`{type:'multi'}` has no listener slot, so a `{type:'listener'}` base is silently dropped from an
additive marquee or ⌘-click. Pre-existing; only worth fixing if it ever bites.

## 9. Window / closed-door reflection materials — **P3**

Image-source reflections currently approximate a window or closed door with the host wall's
absorption instead of mirroring the leaf with its own material. Physically nicer; audibly marginal
for a first-order model.


---

## 10b/10d — what S20 left open on folders

**10b — the export-all BUNDLE has no importer.** This is pre-existing: `importLayout` handles a single
layout file, and an "Export all" bundle has no `scene`, so it has never been importable at all. S20
added `project` (a NAME, not an id) to the bundle so a future importer can restore the filing, and
made the SINGLE-layout path round-trip properly today — `findOrCreateProject` matches an existing
folder case-insensitively, creates it when the receiving store has never heard of it, and falls back
rather than refusing the file at the folder cap. Until a bundle reader ships, the "storage-agnostic
safety net" in `db.ts`'s header comment is write-only, and the handoff should keep saying so.

**10d — multi-tab folder loss.** `saveMeta` rebuilds the whole meta row from one tab's in-memory
`store.projects`, and `usePersistence` calls it on every autosave cycle AND on every
`visibilitychange → hidden` / `pagehide` flush. Two tabs open: tab A creates a folder and files a design
into it (both persisted), the user switches to tab B whose `store.projects` predates it, and merely
switching away from B rewrites the meta row without that folder. On the next load it is gone, the design
is an orphan, and `assembleStore` re-homes it somewhere the user never chose.

Pre-S20 the meta row held only `activeId`, so a stale tab could clobber only which layout was active —
one click to recover. The folder tree is the same last-writer-wins singleton with a much larger blast
radius and no undo. `database-plan.md` §7 Q3 ("do you ever open the app in two tabs?") is still
unanswered, which is why this is documented rather than guessed at: the fix is a merge policy, and
which merge is correct depends on that answer. A `meta.updatedAt`/sequence guard that refuses to write a
projects list older than the stored one is the cheapest sound option.

S20 did reduce the exposure: `saveMeta` now runs FIRST in the persist cycle, so a torn write leaves a
folder with no members (invisible, self-correcting) rather than layouts pointing at a folder the meta
row has never heard of.

## 11. Generate a design — ✅ **DONE (S22)**

Owner-requested: *"a create or randomize button that makes designs for you. either from a selection
of hundreds or randomly generated ones."* Shipped as both — eight hand-authored archetypes crossed
with randomised envelopes, room tiling, doors, windows, furniture and a verified stereo pair,
deterministic per 32-bit seed so any design can be returned to by typing its seed back in.

Measured over 480 designs (`docs/sessions/S22/bench/gen-bench.txt`):

```
480 designs: locked 420 (88%) · importRejected 0 · mirror-desync 0 · sanitize-loss 0
distinct shells among these seeds: 477/480
mean 3.9 ms/design, worst 18.5 ms
same seed -> identical geometry: true
```

**Follow-ups worth having, none blocking:**

- the three single-room archetypes (`studio`, `cinema`, `office`) get their variety from
  `ShapeVariant` (`l-notch`, `alcove`) rather than from room cuts. That works, but the space is
  narrower than the multi-room archetypes and a user rerolling `office` will notice sooner.
- the 12 % of designs that ship with no speakers land on the existing "Nothing to analyze yet"
  empty state. Honest, but a line saying *why* ("this room is too small for a 60° triangle") would
  be better than silence.
- the arranger's first-reflection-absorber layer never fires, because furniture is placed before
  speakers (deliberate — `fits()` cannot see speakers, so the other order drops a wardrobe on a
  HomePod). A second arrange pass after the pair lands would recover it.

## 12. Measure detection's worst case, then decide whether it needs a cap — **P2**

The S22 self-review raised a real shape without a real reproduction: nothing caps how many candidate
segments `skeletonToSegments` hands to `regularize`, and `mergeCollinear` degrades toward O(n²) when
segments do not collapse onto shared lines, while `joinCorners` and `structureScore` are
unconditionally O(n²) over whatever survives. `WORK_MAX` (900 px) plus the thickness and
small-component filters bound the input hard, and every corpus fixture stays in the tens of segments —
but a densely-textured photo (fine hatching that never closes, a photographed rug, heavy scan noise)
is the shape that could survive as thousands of short non-collinear strokes.

**No cap was added, deliberately.** S18's lesson is that a cap calibrated against a subset is a
data-loss bug, and the protected set here is not yet enumerated. The right order is: build the
adversarial images, measure, and only then decide — exactly what `docs/security.md` §"Worst-case CPU"
does for the engine.

**Acceptance:** a measured worst case for `detectWalls` at `WORK_MAX`, written into `docs/security.md`
alongside the engine's; and if it exceeds the INP budget, a bound whose protected set is enumerated as
corpus fixtures rather than asserted.

---

## 12b. `regionOf` leaked through walls — ✅ **DONE (S25)**

`segsCross` implemented **proper** segment intersection only (`d1*d2 < 0 && d3*d4 < 0`), which is
correct exactly when all four determinants are non-zero. Every **improper** (touching) intersection
leaked — and zero is not a rare accident here, it is manufactured by the app's own geometry: the grid
origin is `sceneBounds().min − cell`, `sceneBounds` reads door rect CORNERS, and an ordinary door's
`h = 0.1` puts `min.y` at −0.05, which lands a whole cell-centre ROW on a wall 5.5 m away.

**Three degenerate shapes, and the taxonomy is complete:**

1. `d3`/`d4` zero — a step ENDPOINT on the blocker. The whole-ROW case: every step across that row is
   free. Catastrophic and global.
2. `d1`/`d2` zero — a blocker ENDPOINT on the step. A pinhole at a wall end or a doorway jamb.
3. all four zero — the step runs collinear inside the wall.

**The second one is why the obvious fix is not enough**, and the first cut of this work got it wrong.
It is tempting to handle only (1) and argue that going around a wall's TIP is legitimate. That fails
on the shape the generator actually builds: at an entry door the exterior wall splits into two stubs
and the door rect's edges START at exactly the stub ends, so on that cell row THREE blockers each
merely touch the step — none blocks alone, together they seal the wall, and the fill threads the seam.
The partial fix left **4 of 300** designs still fully unsealed while passing every other test in the
file. `THE SEAM` fixture (distilled from `one-bed`/seed 6) exists specifically to discriminate them.

**Measured**, 8 archetypes × seeds 0–59 = 300 multi-room designs:

| | before | after |
|---|---|---|
| fully unsealed (walkable/zoning ≤ 1.0001) | 19 | **0** |
| below 1.4× | 28 | **0** |
| minimal 8×5.5 room with one door | 54.81 m² | **43.74 m²** (true 44.00) |
| 45° hypotenuse, 40.05 m² triangle | 92.16 m² | within 5 % |

**Skewed walls were not exempt and were worse** — a 45° hypotenuse can hold an entire anti-diagonal of
cell centres. That is the case that matters for the owner's real floorplan, which is almost entirely
non-axis-aligned.

**Over-blocking was the real risk and was measured, not argued.** Blocking a graze could seal a narrow
doorway, and `arrange.ts:599` builds its hard walkable-containment constraint from this region. The
cell grows as `span/158` past ~47 m, so a 0.9 m doorway spans 3.0 cells at 8 m, 2.4 at 60 m, 1.6 at
90 m and 1.0 at 140 m — it connects at every one.

**Negative-control ladder** (pinned): strict → 5 of 23 fail · partial (`d3`/`d4` only) → 1 fails ·
full → 23 pass.

**Related, same pass, lower priority:** `regionOf(…, {doorsBlock:false})` escapes the wall envelope on
300 of 300 generated multi-room designs (expected — no door blockers, so it flows out through the entry
door), which means `walkable.area` is not floor area. Benign today: 0 of 3192 placed pieces landed
outside the envelope across 480 designs, because `openSlots` is bounded by `sceneBounds ± 0.6`. But do
not read `walkable.area` as floor area, and bound the fill by the exterior wall loop if it ever needs
to be exact.

---

## 13. Detection refuses the owner's own floorplan — ~~P0~~ **REFUTED (S26)**, and what was really there

**The P0 as written is FALSE, and the reason is a measurement chain no user can reach.** The S25 table
below fed the ORIGINAL 1320×1734 file straight to `detectWalls`. The app never does that. There are
**two** lossy stages in front of the pipeline, and both are unconditional:

1. `buildUnderlay` (`components/panels/underlay-import.ts:3,11-13,28`) caps the import at
   `MAX_DIM = 1600` and re-encodes it as **JPEG q0.72**. It is the ONLY origin of underlay bytes.
2. `detectWallsFromUnderlay` (`engine/detect.ts:308`) then caps THAT at `WORK_MAX = 900`.

`detectWallsFromUnderlay` is the only non-test caller of `detectWalls`, `useWallDetection.ts:94` is its
only caller, and the downscale has no branch — so the pipeline cannot see more than 900 px on any
route, including a JSON layout import.

**Measured 2026-07-29 through the real chain, and confirmed end to end by driving the real UI in
headless Chrome with the owner's actual file** (`docs/sessions/S26/shots/02-proposal-default.jpg`):

| UI level | sensitivity | walls | confidence | support | structure | explained | verdict |
|---|---|---|---|---|---|---|---|
| Careful | 0.7 | 9 | 73.9 % | 1.000 | **0.278** | 0.737 | **accepted** |
| **Balanced (default)** | **1.0** | **15** | **85.0 %** | **1.000** | **0.500** | **0.832** | **accepted** |
| Thorough | 1.5 | 24 | 91.8 % | 0.992 | 0.646 | 0.894 | **accepted** |

The live UI matches wall-for-wall: *"Found 15 walls — 34.5 m · Read confidence 85 %"*, with `Add 15
walls`, and no refusal toast at any level. The three numbers S25 reported (9/13/21 walls at
0.111/0.231/0.548) reproduce EXACTLY at full resolution, which is how the chain was identified.

Two further corrections to the S25 write-up: **sensitivity 0.6 is not a value the UI can send** —
`SENSITIVITY` holds careful 0.7 / balanced 1 / thorough 1.5, so that row was unreachable twice over;
and the first S26 harness fixed stage 2 while forgetting stage 1, reading 0.588 instead of 0.500. The
same error, three times, at three different depths.

### What was actually wrong — and what S26 fixed

**(a) The knob could refuse a plan the default accepts. FIXED.** `sensitivity` scales `minSegment`, and
`structure` is measured on the segments that survive it — so asking for FEWER walls mechanically lowers
structure, and the user's own pickiness is reported back to them as evidence about their image. It is
not hypothetical: the new `oblique-survey` fixture measures **0.346 accepted at the default and 0.222
REFUSED at Careful**, the same plan, refused only because the knob moved. `detectWalls` now takes a
second, lazy reading at the default sensitivity and refuses for structure only if BOTH fall short.
The guarantee, stated and tested: *the knob may change WHICH walls are offered; it can never, by
itself, turn an accepted image into "this doesn't look like a floorplan."* Both nulls still refuse at
every level with structure exactly 0.000 on both arms, which is what makes pooling safe.

**(b) The corpus was blind to resolution BY CONSTRUCTION. FIXED.** Every fixture rasterises at 700×520
or 900×700 — at or under `WORK_MAX` — so the downscale was a no-op on all 22 and no test had ever run
at the resolution a phone photo arrives at. That is exactly the hole S25 fell into. `detect.test.ts`
now has a `resolution` block that rasterises fixtures at 2.5× (an ordinary phone photo), pushes them
through both of the app's downscales, and asserts the read survives.

**(c) The refusal, when it does fire, never named the one control that would help. FIXED.** The toast
now appends *"Try 'Thorough' to look harder."* when a harder level exists, and says nothing at the top
level.

### 13b — the tone-curve instability — ✅ **DONE (S27, 2026-07-29)**

**Cause, and it is not the one this section originally proposed.** The instability is not "light
annotation gets swallowed". The owner's file has flat grey **letterbox bars** down both edges at
luminance ~198 over **11.1 % of the page** — verified in the original 1320×1734 PNG (far-left and
far-right pixels both 198, standard deviation 0.0: digital padding, not a photographed surround), so
not a resampling artifact. That makes the page **trimodal**, and Otsu maximises between-class
variance under a BIMODAL assumption. Its criterion ends up with two near-tied maxima — 175 at
100.00 % against 209 at 98.07 % — and which one wins decides whether ink is 4.6 % or 17.4 % of the
page. Confirmed by controlled substitution: paint the bars out with paper and the discontinuity
vanishes entirely (26/41 gamma refusals → 0/41); force the threshold back and structure returns to
exactly 0.500.

**"Exposure" was the wrong word, and the correction is measured rather than pedantic.** Sweeping each
axis independently over the owner's file: a **gamma curve refuses 26 of 41**, **linear gain across
±0.3 EV refuses 0 of 46**, and an **additive lift refuses 0 of 41**. Gain preserves tone ratios and
lift preserves tone differences, so neither can reorder the two optima; only a tone CURVE moves the
grey mass and the paper by different amounts. Tone curves are what phone pipelines, auto-enhance and
contrast sliders apply, so the bug was real — but a test that perturbed brightness would have passed
on the broken engine. Also **S26's claim that JPEG quality 0.49–0.51 shows the same jump is
REFUTED**: through the real chain the cut is 173 at every quality from 30 to 100 and the plan is
accepted at all thirteen.

**The fix: choose the threshold on a GRADIENT-WEIGHTED histogram.** A plain histogram counts AREA, so
a large flat region votes in proportion to how much of the page it covers — even though a flat region
says nothing about where ink ends and paper begins. Each pixel now votes only if its local intensity
change (3×3 box blur, then |dx|+|dy|) exceeds `EDGE_GATE` = 16, so a flat band contributes only its
two boundaries however wide it is. Below `MIN_EDGE_FRACTION` = 2 % of the page clearing the gate the
plain histogram is used instead, which degrades exactly to the pre-S27 decision.

Measured: the owner's plan goes **38/138 refusals → 0/138** over gamma 0.70–1.60 × 3 UI levels, and
the corpus mean rises **94.82 % → 95.48 %** over the same 22 fixtures — `apartment-photo`
0.965→1.000, `apartment-skewed` 0.898→0.975, `oblique-survey` 0.747→0.766, at a cost of 0.001 on
`apartment-cluttered`. Every per-fixture floor holds and all three nulls still refuse. Confirmed
end to end by driving the real UI with the owner's actual file: 9 / 15 / 24 walls at 74 / 85 / 92 %,
identical to S26.

**Three rules that do NOT work, recorded so they are not retried.** Breaking the near-tie toward the
smaller minority class moved 13 of 24 corpus masks; picking the emptiest cut within the band moved
21 of 24. Both fail for the same reason — on a clean page the criterion is a flat plateau spanning an
EMPTY histogram valley, so plateau noise satisfies any local-maximum test and "least ink" walks into
the anti-aliased edge of the stroke. And a design agent proved the general case: over **6 080
three-mode histograms**, 1 539 have the CORRECT cut as argmax with a WRONG cut as a near-tied rival
reaching 100.00 % of it, because the owner's page and its mirror are the same histogram with the
middle mode's ROLE swapped. **No function of the histogram alone can separate them** — which is
precisely why the fix uses spatial information the histogram discards.

**Still open, honestly.** Gradient weighting is not universally correct either: it distinguishes a
flat mass from thin strokes, so a large mid-tone mass that is TEXTURED would still vote. No such case
is known in the corpus or in the owner's file. See §13c.

### 13c. The adversarial case gradient weighting does not cover — **P3**

The fix rests on "a thing that should be excluded is flat". A large mid-tone region that is heavily
textured — halftone, dithering, dense hatching over a big area — would clear the gate and vote like
ink. Nothing measured today exhibits it, and the corpus has no such fixture. Worth a fixture if a
real image ever shows it; not worth pre-emptive machinery.

### What S26 left, for the record

**The verdict is unstable under invisible capture detail, and the cause is the Otsu threshold.**
Measured on the owner's real plan through the app chain, applying a gamma curve as a stand-in for a
slightly different exposure of the same drawing:

| gamma | Otsu cut | raw ink px | strokeWidth | walls @1.0 | structure | verdict |
|---|---|---|---|---|---|---|
| 1.00 | 175 | 32 376 | 14.0 | 15 | 0.500 | ok |
| 1.02 | 174 | 32 376 | 14.0 | 15 | 0.500 | ok |
| **1.05** | **208** | **107 365** | 10.7 | 13 | **0.077** | **REFUSED** |
| 1.15 | 205 | 107 931 | 10.4 | 12 | 0.083 | REFUSED |
| 1.50 | 195 | 109 927 | 12.0 | 17 | 0.353 | ok |

A **5 % darkening triples the ink**, because the Otsu cut jumps 175 → 208 and swallows the whole
annotation layer. The owner's plan is unusually exposed to this: its dimension lines are drawn in a
LIGHTER TONE than its walls (measured tones — poché ≈96–103, annotation 120–173, paper ≈203), so the
cut sits right at the top of the annotation band. An independent skeptic reproduced the same
discontinuity along a different axis (JPEG quality 0.49–0.51) and, by controlled substitution, showed
the mechanism is NOT the one it first looked like: forcing `strokeWidth` back to its correct value
leaves structure at 0.000, and injecting the correct dominant angle does too. Stroke width and the
69° dominant-axis flip are both **symptoms of the Otsu jump**, not causes.

Do not chase this by moving `MIN_STRUCTURE`. The threshold is not the problem — a signal that moves
6× on a 5 % exposure change is. Candidates worth measuring, in order: a hysteresis or bimodality check
around the Otsu cut; a two-class ink model that keeps light annotation OUT of the wall mask rather than
letting a threshold decide; and making `structureScore` a graded distance falloff rather than a binary
`<= radius` count (measured: it lifts every legit fixture while leaving BOTH nulls at exactly 0.000,
so it does not weaken the discriminator — it was prototyped in S26 and NOT shipped, because the Otsu
instability is upstream of it and should be fixed first).

**Acceptance:** a fixture that pins the Otsu discontinuity · the owner's plan's verdict stable across a
±10 % exposure sweep · both nulls still refused · corpus mean floor held.

### Artifacts

All gitignored and local. `docs/sessions/S26/bench/`: `owner-appchain.bin` (the real two-stage bytes),
`owner-APPCHAIN.txt` / `owner-UI-LEVELS.txt` / `owner-AFTER-FIX.txt`, `otsu-mechanism.txt`,
`adjudication.txt`, `corpus-UI-levels.txt`, plus `browser-resample.mjs` (the corrected two-stage
capture) and `diagnose.ts` (per-stage instrumentation). `docs/sessions/S26/shots/` holds the live-UI
run. The photo itself is at the repo root as `IMG_7421.jpeg` and is gitignored — do not commit it.

<details><summary>The original S25 write-up, kept because the numbers are real — they are just from the wrong chain</summary>

**Measured 2026-07-29 on `IMG_7421.jpeg` (1320×1734), the owner's real plan, through the REAL app path
(`detectWalls`, which includes the refusal — not `detectSegments`, which does not):**

| sensitivity | walls | confidence | support | structure | explained | verdict |
|---|---|---|---|---|---|---|
| 0.6 | 9 | 62.2 % | 1.000 | 0.111 | 0.645 | **REFUSED** |
| **1.0 (default)** | **13** | **71.5 %** | **1.000** | **0.231** | **0.816** | **REFUSED** |
| 1.5 | 21 | 87.4 % | 1.000 | 0.548 | 0.866 | ok |

At the default the user is told: *"The lines in this image don't join up into rooms, so it doesn't look
like a floorplan."* **The overlay shows that is false.** `bench/owner-plan-default.png` traces the left
exterior wall, both angled top walls, the long right diagonal, the kitchen partition, the small-room
partitions and the bathroom. `support` is a perfect **1.000** and `explained` is **0.816** — the ink it
claims is wall really is wall, and it explains 82 % of the wall ink. Only `structure` fails, at **0.231**
against `MIN_STRUCTURE = 0.25` — by 0.019.

**Why the corpus could not see this.** Structure across the whole corpus, measured:

- null fixtures (`no-plan`, `no-plan-lines`): **0.000**
- lowest LEGIT fixture (`apartment-cluttered`): **0.425**
- every other legit fixture: 0.50 – 1.00
- **the owner's real plan: 0.231**

The threshold sits at 0.25 with an apparently huge margin — 0.000 below, 0.425 above. The owner's photo
lands in the gap that no synthetic fixture occupies. This is the S22 lesson firing for the third time
("calibrate a refusal against MEASURED legitimate lows"), except the measured lows were all synthetic.

**Do NOT just lower the constant.** The interesting datum is that `structure` RISES with sensitivity —
0.111 → 0.231 → 0.548 — because more segments means more endpoints that meet. So the default is
UNDER-reading this plan (13 segments for a plan with 20+ walls), and the refusal then fires on the
under-read. The root causes to investigate, in order:

1. **`joinCorners` is not closing these corners.** The plan's corners are chamfered and sit under dense
   dimension-line annotation, so traced segments stop short of meeting. Closing them raises `structure`
   *legitimately* and improves the output at the same time.
2. Only then reconsider `MIN_STRUCTURE`, with the null margin (0.000) as headroom.

**The fixture problem, which is structural and must be solved first.** The obvious regression guard is
the owner's photo — but it is a personal photo of their home and `src/engine/__tests__/fixtures/` is
COMMITTED to a public repo (`docs/sessions/` is gitignored; the photo is now gitignored too, see
`.gitignore`). So the guard has to be a SYNTHETIC corpus fixture that reproduces this plan's
characteristics: heavy dimension-line annotation on every wall, thick filled poché, chamfered corners,
a non-rectangular envelope, and ~10° of skew. Build that fixture first, confirm it measures ≈0.23, and
only then change anything.

**Artifacts (gitignored, local):** `docs/sessions/S25/bench/owner-floorplan.txt` (the three-sensitivity
run), `owner-plan-default.png` and `owner-plan-sens15.png` (overlays). The photo itself is at the repo
root as `IMG_7421.jpeg` and is gitignored — do not commit it.


</details>
