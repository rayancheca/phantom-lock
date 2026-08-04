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
| 13d | ✅ **S27's fix had a MIRROR regression** — **DONE S28** (both threshold rules kept as candidates; polarity case REFUSED → 14/16/26 walls live) | ~~P0~~ done | — |
| 13b | ✅ **Detection's verdict was unstable under a tone curve** — **DONE S27, LANDED S28** (owner 38/138 → 0/138; corpus 94.82 % → 95.48 %) | ~~P1~~ done | — |
| 17b | ✅ **The layout switcher was COVERED at phone widths** — **DONE S35** (exposed 0 px at 320 → 40 px; SC 2.4.11 + 2.5.8) | ~~P1~~ done | — |
| 17c | ✅ **The gallery head pushed Close off-screen** — **DONE S35** (re-diagnosed: not the toolbar rail; SC 1.4.10) | ~~P3~~ done | — |
| 14 | **Gallery home screen (owner-requested)** — ✅ **DONE S29**: flat grid, folders as tiles, drag to merge/reorder, persisted arrangement. Residuals below. | ~~P1~~ done | — |
| 13e | **REFUTED AT THIS SEAM (S31)** — no function of the detected segments separates a floorplan from furniture outlines; proven three ways and pinned. Redirected to metric scale, which needs a calibrated-scale flow first. | P2 | 1 session |
| 1 | ✅ **Auto-detect walls accuracy overhaul** — **DONE S22** (52.1 % → 95.6 %, and it refuses) | ~~P0~~ done | — |
| 2 | ✅ **Grid-loop iteration cap** — **DONE S18** (safety half; slowness half → 2b) | ~~P0~~ done | — |
| 2b | ✅ **Bound the reflection search** (`bestReflectionDb`) — **DONE S19** (50-room 13.7 s → ~0.5 s) | ~~P1~~ done | — |
| 2d | Close the last wall-heavy residual (12–14 s → <10 s): `bestPairSpot`'s 32 null sweeps | P2 | ½ session |
| 2c | Bound `traceScene` + `arrange.openSlots` | P2 | ½ session |
| 3 | **Guided tutorial mode** | **P1 — high** | 1–2 sessions |
| 3b | ✅ **Door width + swing angle** (owner-requested) — **DONE S17** (G2f corridors deferred) | ~~P1~~ done | — |
| 4 | ✅ **Snap furniture to a wall's angle** — **DONE S23** (drag half; `f` command → 4b) | ~~P1~~ done | — |
| 4b | ✅ **The explicit seat COMMAND** — **DONE S32** (plain `F`, Inspector + HUD buttons, snap guide). ⇧F → §4d | ~~P1~~ done | — |
| 4d | ⇧F quarter-turn — the turned class is not representable in the drag magnet, so the next drag un-turns it | P2 | ½ session |
| 11 | ✅ **Generate a design** (owner-requested randomizer) — **DONE S22** | ~~P1~~ done | — |
| 15 | ✅ **Generator QUALITY (owner-reported)** — **DONE S33**: skips 26.3 % → 1.9 %, no-speaker 9.6 % → 1.5 %, coverage 12.7 % → 18.4 %. Filed cause was WRONG (see below). Residual → 15b | ~~P1~~ done | — |
| 15b | Per-ROOM furniture quotas — `two-bed` programme 0.800, both beds can land in one bedroom | P2 | ½ session |
| 16 | **Word-style direct-manipulation handles (owner-requested 2026-08-03)** — resize + rotate an object with the mouse | **P1 — high** | 1 session |
| 5 | Read-only 3D view | P2 | 1 session *(plan exists)* |
| 6 | Component/hook tests | P2 | 1 session |
| 10 | ✅ **Projects (folders) + N-up compare** (owner-requested) — **DONE S20** | ~~P1~~ done | — |
| 10b | Bundle IMPORTER (read an export-all backup back in, folders included) | P2 | ½ session |
| 10c | ✅ **Layout ORDER** — **DONE S29** (persisted `Layout.order`/`Project.order`; the gallery is now an Android-style home screen) | ~~P3~~ done | — |
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

See **§4c** below: creation-time alignment was BUILT and REVERTED in S31, and §4c now carries
the measurements and the spec.

---

### 4c. Creation-time alignment — **BUILT, MEASURED AND REVERTED in S31. P1, and now fully specified.**

`App.tsx` `addPreset` and `SimCanvas.tsx`'s draw preview both hardcode `rotation: 0`, so on a
building not square to the world every new rect arrives crooked — and the S23 magnet only fires
within `WALL_ALIGN_GAP_M` (0.35 m) of a wall, so a piece dropped in the middle of a room is never
straightened by anything. Real on the shipped demo: `apartmentScene()` measures **-12.83°**.

S31 implemented it (`planAxis` + `bandRect` in `canvas/placement.ts`, 14 tests, six negative
controls all caught, live-verified end to end — both paths persisted -12.829° through IndexedDB and
the canvas pill read `∠-13°`) and then **reverted it**, because the self-review asked the question
the tests did not: *is the axis stable?*

**WHY IT WAS REVERTED — the three measurements any next attempt must answer.**

1. **The axis is BISTABLE on the only real plan.** Maple Court has two wall populations — 12.358 m
   folded to 77.75° and 7.840 m to 0.25° — and `dominantAngle` is winner-take-all over 0.5° bins.
   Measured: **one ordinary 4.6 m wall drawn square flips the answer from -12.829° to exactly
   0.000°**, as does one "Add a room…", as does deleting the 5.66 m wall. **Four of the owner's six
   layouts are this plan.** The user then gets two objects 12.83° apart from the same gesture,
   seconds apart, with nothing on screen to explain it. A margin gate does not rescue it: the true
   margin is 12.358/7.840 = **1.58x**, so a 1.5x gate still flips on a 4.5 m edit and a 2x gate
   returns null on the one plan the feature exists for. Structural direction: `addRoomShell` and the
   wall tool both emit world-square walls, so the estimate is dragged toward 0 as the user builds.
2. **The rubber band breaks Snap.** Endpoints snap to the WORLD 0.05 m grid while `w`/`h` become
   projections onto a rotated axis, which are multiples of nothing. Measured on Maple Court: a
   2.00 x 1.00 drag reads **1.728 x 1.419** in the Inspector and `1.73 x 1.42 m` on the canvas pill.
   Any fix must snap in the PLAN's frame, not the world's.
3. **`arrange.ts:169` is a THIRD creation site.** `openSlots` hardcodes `rotation: 0`, so with the
   other two fixed, "Decide for me" places a Dining table at 0.000° beside a palette sofa at
   -12.83° (measured: Sofa -11.725° via `wallSlots`, Dining table 0.000° via `openSlots`).
   Secondary: `fits()` is an SAT test over `rectCorners`, so a world-axis table also fails to fit in
   skewed rooms where an aligned one would, and the arranger reports "No spot survives the rules".

**Also true and worth keeping from the S31 attempt** (all measured, so the next session need not
re-derive): `planAxis` returns **exactly 0** on a Manhattan plan — verified with `Object.is` over
525 synthetic shells (origins to 1e21, spans 1e-2 to 400 m), 600 walls built through the app's real
paths, and all 192 generated designs — so a square plan is untouched by construction. `bandRect` at
axis 0 is bit-identical to the arithmetic it replaced (0 mismatches in 200 000 randomised drags) and
`a`/`b` stay genuinely opposite corners (worst error 2.16e-14). Cost is 48 µs at 500 walls, 2.6 % of
a frame. A square plan keeps 0 even with two 7 m diagonals; only a diagonal longer than the whole
perimeter flips it. `planAxis` can return **NaN** on a hand-crafted store with ≥50 walls of ~1e308
length, and `?? 0` does not catch NaN — `sanitizeScene` then silently DROPS the object; guard with
`Number.isFinite`, not `??`.

**Acceptance for the next attempt.** A stability rule stated and calibrated against an ENUMERATED
set of real layouts (the owner's six, plus the generated corpus), such that no single ordinary edit
— one wall, one "Add a room…", one delete — changes the axis · Snap produces round dimensions in the
plan's frame · all THREE creation sites agree (`addPreset`, the draw preview, `arrange.ts`
`openSlots`) · a test on each call site, including one that catches a rotated Area preview (deleting
the `room` exemption currently leaves the suite green) · the NaN guard · live-verified on the demo.
Worth considering instead of a global estimate: a per-layout STORED axis the user sets once, which
removes the instability by construction rather than by threshold.

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

### 13d. S27's fix has a MIRROR regression — ✅ **DONE (S28, 2026-07-30)**

**Fixed by keeping BOTH threshold rules as candidates.** `vision/mask.ts` `inkThresholds` returns the
gradient-weighted cut and the plain cut, best guess first and de-duplicated; `detect.ts` `detectWalls`
runs the pipeline at the first and re-runs at the second ONLY when the first reading is refused.
Live-verified through the real UI on a fresh Chrome profile: the polarity fixture reads **14 / 16 / 26
walls at 85 / 83 / 92 %** where the S27 build produces **no proposal card at all**, and the owner's
real plan is unchanged at **9 / 15 / 24 walls at 74 / 85 / 92 %**, identical to S26 and S27.

Three things are worth carrying forward, because each corrected a plausible wrong answer:

**The null cost is ZERO against what users actually have, and the reason is a theorem rather than a
sweep.** A second candidate is a second chance for a null to be accepted, so this was the session's
main risk. The acceptance set is exactly `accept(gradient) ∪ accept(plain)` — verified over 591
readings with 0 violations — and **S27 never landed, so `main` IS the plain-histogram engine**: the
challenger is `main`'s own rule. Measured over 504 null readings, new-vs-`main` is **61 for the S27
engine alone and 61 for the candidate set**. So the honest statement is not "this costs leaks"; it is
that S27 closed 61 null readings as a *side effect* of swapping the rule and paid for them with this
regression, and S28 hands them back to buy the regression off. An S27 design agent's claim of "0 leaks
over 684 readings" for this shape was a claim about its 684 constructions, not about the rule, and
re-pointing another agent's polarity-repainted nulls at the same engine broke it immediately.

**No challenger guard survived measurement, and the one first proposed was a data-loss bug.** Round 1
recommended a challenger-only floor `CHALLENGER_MIN_STRUCTURE = 0.45` on a claimed 1.49× margin. Over
an *enumerated* protected set of 391 legitimate challenger rescues the structures run down to **0.214**
(a 57 %-correct read of a poche plan photographed 8° off-square) while the attack family reaches
**0.346** — the populations overlap, so no floor separates them at any value. 0.45 would refuse **87 of
the 391**, the worst an 88 %-correct read, leave this session's own `screened-poche` fixture (0.464)
0.014 above a refusal cliff, and *still* not close the worst attack (structure 0.667, above every
legitimate rescue). Two further guards were measured and dropped: "the challenger must produce
≥ `MIN_WALLS`" is provably vacuous (`assessDetection` already refuses below it), and "the challenger's
own structure must clear `MIN_STRUCTURE`" costs a real 57 %-correct read and closes 0 of the 61.

**`screened-poche` is `scan-letterbox`'s mirror, and the pair is the argument.** On `scan-letterbox`
the correct cut admits LESS ink (6.7 % against 31.9 %) and comes from the EDGE histogram; on
`screened-poche` it admits MORE (16.3 % against 0.7 %) and comes from the PLAIN one. So "always weight
by gradient", "always use the plain histogram", "prefer the candidate admitting less ink" and "prefer
the one admitting more" each break exactly one of the two — which is why the choice has to be made
downstream, on whether the reading is a floorplan. The fixture is load-bearing on two assertions: on
the S27 engine it scores **0.000** against a floor of 0.78, and it drags the corpus mean to **0.9132**
against `MEAN_FLOOR` 0.92.

Evidence: `docs/sessions/S28/bench/` (reproduction, adjudication, negative control) and
`docs/sessions/S28/shots/`.

### 13e. The refusal gates accept images with no floorplan — **REFUTED AT THIS SEAM (S31). Closed as specified; redirected below.**

**The finding stands; the diagnosis was wrong.** A page of four thin furniture OUTLINES really is
offered 27/27 at structure up to 1.000 and confidence 1.00, on `main`, on S27 and on S28 alike. What
three sessions of this entry assumed — that `vision/quality.ts` is too loose and needs a fourth
signal — is false. S31 measured it. **Nothing computable from the detected segments separates the
two populations at this seam**, and the reason is structural rather than a matter of tuning. Two
distinct arguments carry it, with different scopes: the THEOREM covers the ratio-to-the-whole family,
and the CORPUS argument covers everything else.

The proposed fourth signal was COHESION, in every formulation that could be constructed: length in
the largest connected component, its bounding-box span, footprint containment, enclosure by flood
fill, cycle counts, reach-within-D, page-relative variants — 18 in all. Every one overlaps the
protected population.

- **THE THEOREM — scoped to the RATIO-TO-THE-WHOLE family** (cohesion, containment, span). Each is a
  ratio `(property of the largest component) / (the same property of all segments)`, so on a
  ONE-COMPONENT reading it is identically **1.000** whatever the image depicts. Pushing the furniture
  boxes together until their edges touch reaches that for free. Same blind spot as `structure`, one
  level up: `structure` fails because a closed box satisfies a local endpoint test perfectly; the
  cohesion family fails because a closed box *is* a single component. ⚠️ It does **not** cover
  enclosure or cycle counts — not of that form, refuted separately below.
- **THE CORPUS ITSELF — the stronger and more general argument.** `clean-rect` is a REQUIRED-ACCEPT
  fixture (floor 0.98) that is geometrically **one closed rectangle**, and `two-room` (floor 0.95) is
  **two rectangles sharing a wall**. Those are exactly the null constructions. So any predicate that
  refuses the furniture page must refuse a fixture the suite demands be accepted — at any size, since
  the shrink ladder shows page-relative scale carries nothing. This disposes of the non-ratio
  candidates too: a rule requiring T-junctions refuses `clean-rect`/`thick-rect`/`hollow-rect`, which
  have none by construction; and enclosure dies on its own numbers — `apartment-rotated` and
  `oblique-survey` measure enclosedLargest **0.000** at every level (one door gap floods the
  interior) and `tiny-rooms` 0.011, all legitimate, against nulls at 0.07-0.21.
- **THE INVERSION.** A legitimate terrace of three detached dwellings scores 0.333 where a tight
  furniture cluster scores 0.522. A detached duplex scores 0.500 against the same 0.522. Ordinary
  drawings, the wrong way round.
- **BISTABILITY.** The statistic does not drift with resolution, it *flips*, as the shell arrives in
  one piece or two. Measured on `apartment-rotated` through the app's real two-step chain
  (`buildUnderlay` 1600, then `WORK_MAX` 900): span swings **0.4365** across the scale sweep, and
  between k=1.40 and k=1.60 it moves **0.9882 -> 0.5554 at identical 900x669 pixel dimensions** — so
  the flip is resampling phase, not resolution. That is several times any margin a floor could have had.
- **SIZE ON THE PAGE CARRIES NOTHING.** `two-room` — a required-accept corpus fixture, floor 0.95 —
  is geometrically *two rectangles sharing a wall*. Shrunk to 60 %, 45 %, 45 %-in-a-corner and 30 %
  it reads **identically** (structure 0.833, confidence 1.00, support 1.000, explained 1.000). So
  "two boxes pushed together" is a required-accept drawing at every size.
- **THE NAIVE FIX WAS BUILT AND SWEPT**, in a throwaway tree: a cohesion floor breaks 4 tests in
  `detect.test.ts` at 0.35, 8 at 0.45 and 11 at 0.55, refusing `apartment-rotated` and
  `oblique-survey` outright. Even 0.35 — far under the 0.522 needed to reach the tight cluster —
  already refuses a plan photographed at phone resolution. **There is no safe value.**

⚠️ **One supporting number was wrong and is retired.** A measurement agent reported that the owner's
own plan, merely photographed smaller, reaches span 0.347 — below the attack family — and that figure
was briefly written into this section and into `vision/quality.ts`. **It does not reproduce.**
Re-measured directly against `docs/sessions/S26/bench/owner-appchain.bin`, the same pure-resample
sweep gives 0.8346 at k=0.55 (not 0.3473) and 0.8277 at k=0.95 (not 0.377); the minimum over
k in [0.50, 1.00] x all three levels is **0.7172**. The owner's plan is stable and never approaches
the attack band. The refutation does not rest on it — the theorem and the inversion are each
sufficient alone — but a false number is corrected here rather than quietly dropped. Two independent
agents disagreed about this and the disagreement was settled by measuring it directly; that is the
adjudication rule working, and it is why the rule exists.

- **THE LAST ESCAPE HATCH, ALSO CLOSED.** The only formulation that escapes the theorem is the
  page-normalised one (divide by the PAGE rather than by the segments). It is defeated by **framing**,
  which is free to an attacker and involuntary for a user: padding a legitimate fixture with plain
  paper takes `clean-rect` from 0.819 to 0.511 at 30 % pad, while cropping the attack tight lifts it
  from 0.445 to 0.572 — a cropped null outscoring a real plan with an ordinary margin. The corpus
  cannot express this dimension at all, since all 26 fixtures are drawn to fill their page. The
  counterpoint from the same measurement is worth keeping: the ratio family IS framing-invariant
  (`clean-rect` 1.000 either way), which is its one genuine structural virtue.

All of it is pinned as executable statements in `src/engine/__tests__/indistinguishable.test.ts`, and
recorded in the `vision/quality.ts` header. If a future session finds a genuinely separating signal,
several of those tests go red — which is the good news, not a regression.

**THE REDIRECT — where the missing information actually lives.** `detectWalls` takes raw pixels, so
it cannot know how big anything IS. The app can: `Underlay.scale` is metres-per-pixel, and
`detectWallsFromUnderlay` already holds the `Underlay`. A sofa outline is ~2 m across and a room is
~4 m and up, which is a semantic distinction the pixel pipeline structurally cannot make and a
metric one makes easily. Two cautions before anyone builds it, both already measured:

1. `underlay-import.ts` seeds `scale = 8 / wPx` — an explicit **guess** that the image spans 8 m,
   which the user corrects with "Calibrate scale". So a metric gate is only sound when the underlay
   has actually been calibrated, and that state is not currently plumbed into detection.
2. Enclosure-in-metres inherits the door-gap problem: a single opening in a shell lets the outside
   flood in, and two legitimate corpus fixtures (`apartment-rotated`, `oblique-survey`) already
   measure **enclosedLargest = 0.000** for exactly that reason. Measure the largest connected
   component's EXTENT in metres instead, and calibrate it against an enumerated protected set
   expressed in metres — which does not exist yet and is the first piece of work.

**Priority: P2**, not P1 — it needs a calibrated-scale flow before it can be built, and the
user-facing harm is bounded by the proposal card (per-wall strike-off, a confidence readout, and
Discard). **Acceptance, when it is picked up:** a protected set of real plans expressed in metres ·
the furniture page refused at all three levels · no corpus fixture refused · the owner's plan
unchanged at 9 / 15 / 24 walls · behaviour identical when the underlay is uncalibrated.


### 13f. The monotonic-knob guarantee is narrower than it is written — **P2, pre-existing**

S26's guarantee is stated in `CLAUDE.md` and in `detect.ts` as *"the knob may change WHICH walls are
offered; it can never, by itself, turn an accepted image into 'this doesn't look like a floorplan'."*
That is true only for the `unstructured` cause. The lazy second reading fires for that cause and no
other, so a **`too-few-lines`** refusal has never been covered: `sensitivity` scales `minSegment`, so
a plan sitting near `MIN_WALLS` can be accepted at 'Balanced' and refused at 'Careful' simply because
a short wall stopped qualifying.

**Measured, and it is NOT caused by the S28 candidate set**: over a swept family of sparse 3-wall
plans (wall length 40–120 px × stroke {3,5,7}), **31 combinations are accepted at 'Balanced' and
refused at 'Careful' — identically on `main` and on the S28 engine**, at the same parameters, with a
single candidate in play (`cand 0/1`). A self-review agent reproduced it via a candidate-rescued
image and read it as an S28 regression; re-measured against `main`, it is neither new nor
candidate-related.

The fix is a real behaviour change and needs its own measurement: extending the rescue to
`too-few-lines` gives a null refused for that cause a second chance, which is exactly the leak surface
S26's `ref.segments.length >= MIN_WALLS` guard exists to close. Alternatives worth measuring: rescue
only when the DEFAULT reading clears `MIN_WALLS` at the same candidate; or leave the behaviour and
narrow the written guarantee permanently.

**Acceptance:** the 31-case sweep becomes a test · the guarantee's scope is stated correctly wherever
it appears · no null gains an acceptance · the owner's plan unchanged.

### 13d-original. The mirror regression, as first written

**Confirmed by the S27 self-review and independently reproduced by the main thread.** Gradient
weighting scales a tone's weight in the histogram by its perimeter-to-area ratio — i.e. by
**1/thickness**. That suppresses flat masses as intended, but it equally AMPLIFIES thin ink and
DEMOTES thick ink. On a plan drawn to an ordinary architectural convention — walls poché'd in a
lighter grey, dimension and leader lines in thin black — the thin dark linework wins the vote, the
threshold lands BELOW the wall tone, and every wall is dropped from the ink mask before any
downstream stage sees it.

Measured on 700×520, paper 246, ten walls at 14 px / ink 175, plus N thin 3 px ink-26 dimension
lines, over five seeds:

| dimension lines | pre-S27 | S27 |
|---|---|---|
| 0 | ok, 92–100 % | ok, 92–100 % |
| 1 | ok | **REFUSED, 0 %** |
| 2 | ok, 80 % | **REFUSED, 0 %** |
| 4 | ok, 68 % | **REFUSED, 0 %** |

At two lines the dark ink is **0.33 % of the page**. The amplification is 13.9× for the 3 px dark
lines against 3.87× for the 14 px grey walls, and Otsu's (mB−mF)² term then rewards splitting off the
distant dark mode: the threshold moves 210 → 150. It survives the app's real chain at 1×/1.5×/2×/2.5×.

**The failure is silent in the worst way.** `support` and `explained` both read 1.000 — they are
measured against the mask the pipeline itself produced, which is the S26 lesson — and the user is told
*"This image doesn't have enough clear straight lines to read as a floorplan"* about an image
containing ten perfectly clear straight walls. `detectWallsFromUnderlay` returns zero walls on a
refusal, so they get nothing plus a false explanation blaming their drawing. S26's lazy second reading
cannot rescue it, because the threshold does not depend on `sensitivity` at all.

**The remedy as S27 wrote it, and how S28 changed it.** S27 proposed `otsuCandidates` — the argmax of
the PLAIN histogram plus its near-tied rival. That patch could not be pasted: an S27 skeptic proved it
**silently reverts the gradient fix** when applied on top of it, because its `detectWalls` computes its
own plain-histogram candidates and never calls `inkMaskOf`, leaving `edgeWeightedHistogram` dead on the
detection path while `tsc` and `lint` stay clean and the owner metric still reads 0/138. S28 kept the
idea and changed the candidate set to `{gradient-weighted, plain}` — the two RULES, not two peaks of
one rule — which is what makes it a fix rather than a swap. See §13d above for what landed.

Reproduction: `docs/sessions/S27/bench/CRITICAL-polarity.txt` and
`docs/sessions/S28/bench/polarity-repro.txt`.

### 13c. The adversarial case gradient weighting does not cover — **P3, and measured**

The fix rests on "the thing that should be excluded is FLAT". A large mid-tone region that is
textured — halftone, dithering, dense hatching — clears the gate and votes like ink, so the fix has
no advantage there. Measured on one drawing with an identical 25.7 %-of-the-page band rendered three
ways, reporting how much of the band each engine calls ink:

| band | plain Otsu | S27 gradient | S27 result |
|---|---|---|---|
| flat 190 | **100.0 %** | **0.0 %** | 5 walls, structure 1.000, ok |
| halftone (≈190 mean, hard dots) | 50.0 % | 50.0 % | 7 walls, structure 0.714, ok |
| 45° hatching, 5 px pitch | 20.0 % | 20.0 % | 7 walls, structure 0.714, ok |

So the honest statement is **"no advantage", not "a regression"**: on a textured mass the two engines
behave identically and the plan still reads in both. The fix helps exactly where it claims to and is
inert elsewhere. Nothing in the corpus or the owner's file is textured this way. Worth a fixture if a
real image ever shows one; not worth pre-emptive machinery.

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


## 14. The Android home-screen gallery — ✅ **DONE (S29)**, residuals ✅ **DONE (S30)**

Owner-requested mid-session, and they chose the true Android model (a folder ICON appearing in
place) over the smaller "a new labelled row" option, with saved positions.

Delivered in S29: one flat grid where a design and a folder tile are peers · drop-on-design creates
a folder at the target's slot · drop-on-tile joins · drop-in-a-gap reorders · drill in and out ·
`Layout.order`/`Project.order` persisted with an old-shape migration · a move mode that is both
keyboard- and single-pointer-operable (WCAG 2.2 SC 2.5.7) · 64 new tests · 13/13 live checks.

**S30 closed all five residuals**, and found three defects underneath them that were not on the
list — see `docs/master-plan.md` Session 30 for the evidence.

- **14a — touch. FIXED, not merely documented.** The recorded claim was right and is now measured:
  with `touch-action: pan-y` a mainly-VERTICAL touch drag produced `pointerdown → pointermove →
  pointercancel`, the scroller taking the gesture. `touch-action` is latched at touchstart, but
  `preventDefault` on a non-passive `touchmove` is evaluated per event — and an armed long press
  sits exactly in the window before a pan has begun. Guarded on `press.current?.armed`, so an
  ordinary swipe never reaches it. Both directions verified in Chrome at a 390×700 viewport: 12
  uncancelled moves when armed, and an un-armed flick still scrolls 387 px of 650 px of overflow.
- **14b — focus after a commit. DONE.** `focusPlanFor`/`fallbackIndex` are pure; the hook applies
  them in one `useLayoutEffect` ladder, so the pointer and keyboard paths cannot disagree.
  `mergeLayouts` now returns the id it mints instead of discarding it.
- **14c — the Escape ladder. DONE.** `escape.ts` is a total function over three booleans, and
  `inFolder` reads the RESOLVED container so a stale drill-in cannot swallow the key.
- **14d — a deleted folder's designs. DONE, by owner decision:** they land on the HOME GRID at the
  tile's slot, not in the adjacent folder. `removeProject` now also refuses the home project.
- **14e — drag a design OUT of a folder. DONE.** The breadcrumb is a drop target, `O` is the
  keyboard twin, and clicking it mid-move is the single-pointer path.

### 14f — what S30 left open (all P3, none owner-facing)

- **The focus ladder re-homes after a crumb-click exit even though focus was legitimately on the
  crumb.** Adjudicated as a taste call rather than a defect: the design has just left the view, so
  landing on the neighbour is defensible, and tightening the guard risks the merge/absorb focus
  that IS verified live. Recorded because a future reader will meet the same question.
- **The `undo` after an exit that dissolved the source folder is a silent no-op at `MAX_PROJECTS`**
  — `addProject` no-ops, so the restore targets a folder that no longer exists. Pre-existing;
  S30 made that gesture the headline feature rather than a kebab corner case.
- **`useGalleryDrag.ts` is 58.9 % line-covered** and structurally cannot go much higher: jsdom
  dispatches a plain `Event` for pointer events, so `button`/`pointerId`/`clientX` are `undefined`,
  `onItemPointerDown` bails at `e.button !== 0`, and a press is never registered. The decisions all
  live in `drag.ts` (98.4 %). The pointer half is covered live instead.

---

## 15. Generator QUALITY — owner-reported, **P1**

> *"generate a design is broken as fuck. i want actual good generations with logic and thought
> not random designs."* — owner, 2026-08-03, with a screenshot of the `railroad` archetype
> showing *"1 piece of furniture had nowhere to go — reroll or pick a larger shape."*

Reported mid-S32 as information to fix later, not as a redirect. **Measured immediately**, so the
next session starts from numbers rather than from the adjective. Harness:
`docs/sessions/S32/bench/audit-generate.mts`, 8 archetypes x 60 seeds = **480 designs**.

**The headline is much narrower than "random":**

| symptom | measured |
|---|---|
| designs skipping ≥1 piece | **126 / 480 = 26.3 %** |
| of those skips, the `armchair` | **125 of 126** |
| designs shipping **ZERO speakers** | **46 / 480 = 9.6 %** (`studio` 16/60, `railroad` 14/60) |
| mean floor coverage | **9.3 % – 24.1 %** by archetype |
| rooms with no furniture at all | 2 of 960 — **a non-issue** |
| worst room aspect ratio | **2.68:1** (`one-bed` Bedroom 2.80 x 7.50) |
| smallest room | **10.85 m²** (`railroad` Kitchen 3.10 x 3.50) |

**Cause 1 — the armchair is the ONLY preset with a hard reject.** `arrange.ts:411-418`:

```ts
case 'armchair': {
  if (tv) {
    const facing = v.dot(v.norm(v.sub(tv.center, slot.center)), slot.facing);
    if (facing < 0.2) return null;      // <-- every other preset only SCORES
```

Measured: an armchair is requested in **420** of the 480 designs and skipped in **125 = 29.8 %**,
and a TV is present in **every single one** — so the skip is purely this cone test, never a
missing anchor. Every other case in `scoreSlot` adjusts `score`; only this one rejects. The fix
direction is to make it a penalty, or to fall back to the best-facing slot when none clears the
cone — but measure the resulting layouts, because the cone is what stops an armchair facing a wall.

**Cause 2 — "no speakers" is by design and reads as a bug.** `pair.ts` ships a verified lock or
NOTHING (S22's deliberate choice: `VerdictHero`'s ignition is an edge, so "almost locked" would
celebrate nothing). Correct, but 9.6 % of the time the user gets a furnished flat with no audio
and the dialog does not say why. At minimum the notice should distinguish "no lock was findable
in this shape" from silence.

**Cause 3 — low floor coverage is what "looks random" actually means.** At 9–24 % coverage rooms
read as sparse regardless of how good each individual placement is. `inventoryFor`
(`generate/index.ts:99`) asks for a fixed small set keyed on crude area thresholds and room-name
regexes; it has no notion of *this room needs a focal wall, a circulation path, and a secondary
zone*. That is the "logic and thought" the owner is asking for.

**Not yet investigated:** whether the guillotine tiler can be constrained to sane proportions
(`tile.ts`), and whether room ADJACENCY is ever considered (a kitchen opening off a bedroom is
possible today). Both are prime suspects for the "random" feel and neither was measured here.

**Acceptance for the session that takes this on:** a scored quality harness that runs BEFORE and
AFTER over the same enumerated seeds (the S22 discipline — build the measuring instrument first
and test the instrument), reporting skip rate, floor coverage, aspect-ratio spread, adjacency
sanity, and lock rate. Skip rate to ~0. No archetype below a stated coverage floor. And the
`armchair` reject either removed with evidence or kept with a fallback.

---

### 15 — ✅ **DONE (S33)**, and the filed diagnosis was WRONG

The instrument is `src/engine/generate/__tests__/design-score.ts` (test-only, 29 tests of its own),
calibrated on `apartmentScene()` — the hand-authored Maple Court demo, which is a model of the home
the owner lives in and is the only ground truth in the repo (**28.9 %** floor coverage, 1.75 pieces
per 10 m², and it scores **0.9998**). Bench: `docs/sessions/S33/bench/score-corpus.mts`, same 8
archetypes x 60 seeds.

| | before | after |
|---|---|---|
| **total** | 0.7856 | **0.8552** |
| placement | 0.9673 | 0.9984 |
| density | 0.1478 | **0.4160** |
| programme | 0.9632 | 0.9583 |
| orientation | 0.7125 | 0.7696 |
| spacing | 1.0000 | 1.0000 |
| reach | 1.0000 | 1.0000 |
| proportion | 0.9694 | **0.9993** |
| lock | 0.9042 | **0.9854** |
| designs skipping a piece | 26.3 % | **1.9 %** |
| designs with NO speakers | 46 / 480 | **7 / 480** |
| mean floor coverage | 12.7 % | 18.4 % |
| cost | 10.1 ms | 22.3 ms |

**THE FILED CAUSE WAS WRONG, and the right one is more interesting.** §15 above says the armchair's
`facing < 0.2` cone was too tight. It was not. `openSlots` handed every open slot the CONSTANT world
facing `{x:0, y:-1}` and `rotation: 0`, so the cone test reduced to *"is the TV north of this
point?"* — a property of which wall the TV landed on, not of the slot. Measured: **0 / 258** skips
with the TV north of the room centre, **125 / 162 (77.2 %)** with it south. That is 125 of the 126
skipped pieces in the whole corpus. The facing was not even consistent with its own rotation
(`rotation: 0` puts a rect's front at `(0,+1)`), and every open-placed piece therefore shipped at
rotation 0 facing nothing.

**What else was found and fixed, each measured:** `wallSlots` offered only the centroid-facing side
of every wall, so one face of all 960 partitions was unreachable and only **65.7 %** of floor-facing
wall length was ever offered · `inventoryFor` read six area thresholds, **four of which never fired
on any of the 960 rooms**, and left `cabinet`/`round-table` unreachable · `ZONE_AFFINITY.dining`
excluded `living`, so a table ordered FOR a living room was charged −0.9 for standing in one and
**53.9 %** of multi-room dining placements were mismatched · `split` drew its cut blind, leaving a
room worse than 2:1 in **20.4 %** of designs · `loft`/`great-room` envelopes put a single "living
room" at up to 70 m², larger than the whole 51.4 m² Maple Court apartment · and the studio-sleeps
rule put a **double bed in every generated home office**, which no score could see and only driving
the real UI caught.

**Residuals, honestly.** `programme` is the one sub-score that did NOT improve (0.9632 → 0.9583):
`inventoryFor` reasons per ROOM but returns a flat global count and `arrangeFurniture` has no
per-room quota, so on `two-bed` (0.800) both beds can land in one bedroom. That is the next real
piece of work here — see §15b. `cinema` density is 0.254 and `great-room` 0.399, the two lowest.
`orientation` at 0.770 is limited by wall-placed sofa/TV pairs, and weighting facing harder was
measured and REJECTED: it buys +0.011 orientation and costs 3 more no-speaker designs.

### 15b. Per-ROOM furniture quotas — **P2**, ~½ session

`inventoryFor` decides per room and then sums into one flat `ArrangeItem[]`; `arrangeFurniture`
places by score with no notion of which room a piece was ordered for. `ZONE_AFFINITY` is a soft
pull (+1.6 in the right zone, −0.9 in the wrong one) and it is not always enough: measured after
S33, `two-bed`'s `programme` is **0.800**, i.e. one bedroom in five is missing its bed because both
beds scored better in the same room. The fix is to carry a room id on each `ArrangeItem` and give
`placeOne` a per-room candidate filter. Cheap to state, and it touches the same seam the
user-facing "Arrange furniture for me" dialog uses, so it needs its own before/after over the
instrument.

---

## 16. Word-style direct-manipulation handles — owner-requested, **P1**

> *"i also want to be able to change the shape and size and rotation of objects with my mouse
> just like in microsoft word"* — owner, 2026-08-03.

Today an object's `w`/`h`/`rotation` are editable ONLY through `InspectorPanel`'s numeric fields
and the rotation slider (`InspectorPanel.tsx:414-431`); the canvas offers move-only
(`SimCanvas.tsx:993` `move-rc`). The ask is the standard eight resize grips plus a rotate grip.

**What makes it non-trivial here, from the existing code:**

- The handles must live in the object's **ROTATED frame**, not the world's — every object carries
  `rotation`, and Maple Court is a -12.83° plan, so world-axis grips would be visibly wrong on the
  one layout that matters. `rectCorners(center, w, h, rotation)` already gives the right basis.
- **It collides with the S23 wall-seat magnet.** `moveObjectTo` rewrites `rotation` every frame
  from `rot0` while a drag is live; a resize or rotate gesture must be its own `Drag` kind that
  the magnet does not touch, or the two will fight exactly as `q`/`e` did mid-drag (S23 lesson).
- **`rot0` re-basing (`SimCanvas.tsx:1004`) reads `live.rotation`** and re-bases when it differs
  from what the branch last wrote. A rotate handle writing `rotation` is indistinguishable from an
  external `q`/`e` unless it uses the same `lastRotRef` discipline.
- Grips are canvas pixels, not DOM, so they are invisible to axe and to `getComputedStyle` — the
  hit-testing needs a pure, node-tested `handleAt(view, obj, screenPt)` the way `interaction.ts`
  already does for wall hover, and the a11y story stays the keyboard path.
- Undo must coalesce one gesture into one entry (`beginGroup`/`endGroup`, the S5 model), and a
  no-op resize must return the SAME scene ref or it pushes a phantom entry (the S14 lesson).
- Min sizes: `sanitizeObject` clamps, and `InspectorPanel` uses `min={0.1}`. A grip dragged past
  zero must not flip the rect inside out — decide whether it mirrors (Word does) or clamps.
- Doors/windows are wall-locked (S17): a resize grip changes the CLEAR OPENING (`w`) only, and
  rotation must stay refused, or the door silently detaches from its wall.

**Acceptance:** pure hit-test + transform module with node tests over rotated frames; a `Drag`
kind of its own; Shift for aspect-lock and Alt for resize-about-centre (the Word contract);
rotation snapping to the plan's axis rather than the world's; keyboard equivalents already exist
(`q`/`e`, Inspector) so SC 2.1.1 is met, but state that explicitly; live-verified with real
`Input.dispatchMouseEvent` drags, since jsdom cannot drive pointer events (TRAP 21).

---

### 4d. The ⇧F quarter turn — **DEFERRED OUT OF S32 ON A MEASUREMENT. P2.**

S23 deferred `f`/⇧F to §4b. S32 shipped **plain `F`** — the key, the Inspector button, the
touch-HUD button and the snap guide — and deferred **⇧F**, because the quarter-turned state is
**not representable in the ambient drag magnet's output space**, so the app destroys it on next
touch.

**The mechanism, from the shipped code.** `wallSeatFor` computes `th = normalizeAngle(thw + k·π)`
for integer `k` (`placement.ts`), so under `DRAG_SEAT` the only reachable orientations are
wall-PARALLEL. And `moveObjectTo` writes `rotation = seat.rotation` whenever ANY candidate is
found — `seated` or not. So a piece left perpendicular by ⇧F is snapped back the moment it is
dragged anywhere near a wall.

**Measured against shipped `main`**, a piece placed flush and perpendicular on a 6 m wall, then
put through one `DRAG_SEAT` frame:

| piece | result |
|---|---|
| sofa 2.00 × 0.90 | magnet does not fire — the turn survives (the ONLY survivor) |
| bed 2.00 × 1.60 | fires, gap 0.200, `seated=false` → **180°, turn destroyed** |
| desk 1.40 × 0.80 | fires, gap 0.300, `seated=false` → **180°, destroyed WITHOUT the piece moving** |
| table 1.20 × 0.90 | fires, gap 0.150, seated → **180°, destroyed** |
| chair 0.90 × 0.60 | fires, gap 0.150, seated → **180°, destroyed** |

4 of 5, and the desk case is the sharpest: the rotation is rewritten while the centre stays put,
so there is not even a movement to explain it. Shipping a command the app silently undoes is worse
than not shipping it — the S31 lesson, applied before the code landed rather than after.

**The two options, neither of which is small.**
1. Make `wallSeatFor` snap to the nearer of the TWO classes `{thw, thw + π/2}` with hysteresis,
   i.e. leave an already-perpendicular piece alone. This also fixes the ambient magnet's existing
   inability to respect a deliberately perpendicular piece — but it changes shipped S23 behaviour
   that 38 tests pin, and needs its own corpus.
2. Persist the intent as a per-object `seatTurn?: boolean`. A schema change, so it needs the
   old-shape migration test the protocol requires.

**Also settled in S32, so the next attempt need not re-derive it.** The correct place for the turn
is a REFERENCE ANGLE, not an addend: `ref = quarterTurn ? thw + π/2 : thw`, with both `k` and the
reconstruction measured against `ref`. C1 refuted the addend-on-the-input form; an addend on the
OUTPUT is also wrong, because it leaves `k` measured against the unturned lattice and puts the
second press exactly on `Math.round`'s ±0.5 tie — measured, `Math.round(0.5) === 1` and
`Math.round(-0.5) === -0`, so ⇧F twice is either a literal no-op (7 of 18 sampled wall angles) or
a footprint-identical 180° flip that still pushes an undo entry and jumps the Inspector slider.
Write `ref` as a CONDITIONAL rather than `thw + turn` with `turn = 0`: `Math.atan2(-0, 1)` returns
`-0`, `-0 + 0` is `+0`, and `normalizeAngle` preserves the sign of the zero — so the conditional
makes "`quarterTurn: false` is byte-unchanged" structural rather than incidental.

**And refuse the turn for a TV.** `bestspot.ts` scores `angle = |cos| >= 0.55 ? 1 : max(0.25, …)`,
so a quarter-turned TV reads `|cos| = 0` and multiplies `tvViewQuality` by **0.25 across the whole
room**. That is the exact collapse §1.2 cited as the reason the snap is nearest-π at all.

---

## 17. The gallery's two missing affordances — ✅ **DONE (S34)** — owner-reported

> *"why is there no delete layout button and wheres the generate layout button. impossible to find"*
> — owner, 2026-08-04

Both existed. **Generate was a reachability bug, not a discoverability one**: both entry points were
gated on a folder (`{folder && …}` at `LayoutGallery.tsx:762`, and a folder tile's kebab at `:530`),
so the home grid — the screen every session opens on — offered no path to it, and a workspace with
**no folders at all** could not reach it by any route. **Delete** was a `MenuItem` behind the card's
`⋯`, whose fill measured **1.01–1.10:1** against every backdrop it sits on: no boundary, so nothing
said a control was there. The glyph was already 9.09–9.30:1, so "too dim" was the wrong diagnosis and
darkening the fill makes it worse. Fixed with a `--text-3` stroke (5.57–6.36:1). See the S34 handoff.

## 17b. The layout switcher was COVERED at phone widths — ✅ **DONE S35**

`.room-trigger` opens the layout gallery and nothing else does, so open / rename / duplicate /
export / delete / generate all lived behind it. Below ~817 px the DESIGN/TUNE `SegmentSwitch`
painted over it.

**The S34 filing under-measured it.** A 21-point sweep has an 8.7 px pitch at 390 px and SC 2.5.8's
threshold is 24 px — 2.75 pitches — so "0.143" could not decide the question it was being asked.
Re-measured as the widest CONTIGUOUS unoccluded run at 1 px resolution, which is what the criterion
actually means (occluded area is not part of a target):

| width | exposed BEFORE | exposed AFTER | note |
|---|---|---|---|
| 320 | **0 px** | 40 | entirely hidden — and it is the FIRST Tab stop, so SC 2.4.11 too |
| 360 | 4 | 40 | |
| 390 | **22** | 111 | fails SC 2.5.8 by 2 px |
| 430 | 46 | 151 | |
| **561** | **27** | 113 | the worst width in the range — see below |
| 640 | 75 | 160 | |
| 721 | 91 | 79 | |
| 817+ | 175 | 175 | unchanged |

**Root cause, one level up from where it looks.** `.room-trigger` is a flex item with the default
`min-width: auto`, so its automatic minimum size is its MIN-CONTENT size — and `.room-trigger-name`
is `white-space: nowrap`, so that is the whole layout name. The button measured **exactly 174.8 px
at 560, 640, 760, 860 AND 1440**: it never shrank anywhere. The ellipsis already on the name could
therefore never engage, and `min-width: 0` on the NAME is a measured no-op.

**Reachability is not monotonic in viewport width.** 561 px measured worse than 430 px, because the
wordmark returns there and costs 96.6 px. Any future guard must sample 561 and 721, not round phone
widths. The fix moves the monogram rule 560 → 720, which is what `app.css` already says that rule is
for ("so the layout switcher beside it is never squeezed out").

**Three measurements that killed the obvious fixes:**
- Hiding `.segment-label` frees **exactly 0 px** — the switch is `width: min(300px, 40vw)`, not
  content-sized. And `width: auto` alone is a REGRESSION at 390 (max-content 160.4 > the 156 it
  replaces). They ship together or not at all.
- `min-width: 0` alone scores a perfect hit test on a **20 × 30 unlabelled stub** — an SC 2.5.8
  failure in its own right, not merely poor taste.
- A two-row header reflow costs **+42 px**, taking the header from 28.5 % to 49.5 % of the viewport
  at 320 × 200. Rejected.

Removing the Tour button or undo/redo was also rejected: the Tour button is the only permanent entry
to the tutorial, and `app.css` states the header undo/redo are the only ones on mobile.

Harness: `docs/sessions/S35/{verify,probe-fix,probe-shapes,probe-candidates,diagnose-header}.mjs`.

### 17b-i. The trigger's PURPOSE still lives only in a hover `title=` — **P3, pre-existing**

Adjudicated during S35's self-review and returned **PRE_EXISTING**: `.room-trigger`'s visible text is
the layout NAME, which describes state and never purpose, so "this pill opens open/rename/duplicate/
export/delete/generate" has only ever existed in `title="All layouts — switch, create, manage"`. That
is the UX-4 rule ("no load-bearing meaning lives only in a hover title") and it holds identically on
`main` at every width, so S35 did not worsen it. The clean fix needs no `aria-label` (which would
break SC 2.5.3 Label in Name by dropping the visible text out of the accessible name): add an
`.sr-only` suffix span inside the button, so the name becomes the layout name PLUS the purpose.

## 17c. The gallery head pushed its own Close button off-screen — ✅ **DONE S35**

**Filed wrong, and the correction matters.** §17c blamed the un-floated toolbar rail's `.strip-btn`
children (right edges 467, 557). Measured, every one of those is inside `.toolstrip`'s own
`overflow-x: auto` and contributes **nothing** to `documentElement.scrollWidth` — with the gallery
CLOSED the document does not overflow at all at 390 px. The condition was wrong too: it only
happens while the gallery is OPEN.

The real cause is `.gallery-head`, a non-wrapping `space-between` row whose 329 px of actions put its
right edge at a **fixed 430 px at every viewport**. So at 320 and 390 the **Close button was entirely
outside the screen** (exposed width 0), reachable only by scrolling the document sideways — SC 1.4.10
Reflow, on the gallery's only pointer exit (the other way out is Escape, which a touch user lacks).
"Export all" measured 13 px at 320, also under SC 2.5.8.

Fixed by wrapping BOTH rows. Wrapping only the outer one still left 353 px of content in a 320 px
viewport. Inert at ≥560 px — head height is unchanged there. After: `scrollWidth == clientWidth` at
every width, in both gallery states, every head button ≥26 px, and a real click on Close closes the
gallery at 320 px. S34's 320 × 200 tray guarantee re-verified (5/5 reachable, tray bounded at 62 px).
