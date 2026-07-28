# Ideas backlog — prioritized

Candidate work that is **not** yet scheduled as a numbered session in
[`master-plan.md`](master-plan.md). Ordered by priority; each entry states the priority, why it
sits there, and a rough effort estimate. Priorities are a judgement call — argue with them.

**How priority was decided:** (1) does it fix something actively broken or unsafe, (2) does it
unblock or improve something the owner hits in real use, (3) is it additive polish. Ties broken by
effort — a small high-value item beats a large one.

| # | Idea | Priority | Effort |
|---|---|---|---|
| 1 | ✅ **Auto-detect walls accuracy overhaul** — **DONE S22** (52.1 % → 95.6 %, and it refuses) | ~~P0~~ done | — |
| 2 | ✅ **Grid-loop iteration cap** — **DONE S18** (safety half; slowness half → 2b) | ~~P0~~ done | — |
| 2b | ✅ **Bound the reflection search** (`bestReflectionDb`) — **DONE S19** (50-room 13.7 s → ~0.5 s) | ~~P1~~ done | — |
| 2d | Close the last wall-heavy residual (12–14 s → <10 s): `bestPairSpot`'s 32 null sweeps | P2 | ½ session |
| 2c | Bound `traceScene` + `arrange.openSlots` | P2 | ½ session |
| 3 | **Guided tutorial mode** | **P1 — high** | 1–2 sessions |
| 3b | ✅ **Door width + swing angle** (owner-requested) — **DONE S17** (G2f corridors deferred) | ~~P1~~ done | — |
| 4 | Snap furniture to a wall's angle | **P1 — high** | ½ session |
| 11 | ✅ **Generate a design** (owner-requested randomizer) — **DONE S22** | ~~P1~~ done | — |
| 5 | Read-only 3D view | P2 | 1 session *(plan exists)* |
| 6 | Component/hook tests | P2 | 1 session |
| 10 | ✅ **Projects (folders) + N-up compare** (owner-requested) — **DONE S20** | ~~P1~~ done | — |
| 10b | Bundle IMPORTER (read an export-all backup back in, folders included) | P2 | ½ session |
| 10c | Layout ORDER within a folder (drag to reorder; today `getAll()` key order) | P3 | small |
| 10d | Multi-tab: `saveMeta` overwrites the folder list wholesale (last-writer-wins) | P2 | ½ session |
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

## 4. Snap furniture to a wall's angle — **P1 (high)**

The deeper fix behind the rotation problem the owner hit ("I'm angling the bed but it never sits
flush against the wall"). S8 dropped the rotate step from 5° to 1° with hold-to-sweep, which makes
it *achievable* — but the user is still eyeballing an angle the app already knows exactly.

Proposal: with a rect selected, offer **align to nearest wall** — snap the rect's rotation to the
angle of the nearest wall within some radius, and optionally seat its edge flush against that wall.
Surfacing options: a key (`f` for flush?), a button on the selection HUD, or a magnetic snap while
dragging when the rect comes within a few centimetres of a wall.

Small, well-bounded, and directly removes the friction that prompted the fix. Worth doing before the
tutorial, because the tutorial would otherwise have to teach the workaround.

Design notes: it needs an "undo returns the exact previous rotation" guarantee, must not fight the
existing 45°/5 cm grid snapping, and should be a no-op (not a silent nothing) when no wall is near —
the S14 lesson about disabling an affordance rather than letting it silently do nothing.

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
