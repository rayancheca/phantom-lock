# Ideas backlog — prioritized

Candidate work that is **not** yet scheduled as a numbered session in
[`master-plan.md`](master-plan.md). Ordered by priority; each entry states the priority, why it
sits there, and a rough effort estimate. Priorities are a judgement call — argue with them.

**How priority was decided:** (1) does it fix something actively broken or unsafe, (2) does it
unblock or improve something the owner hits in real use, (3) is it additive polish. Ties broken by
effort — a small high-value item beats a large one.

| # | Idea | Priority | Effort |
|---|---|---|---|
| 1 | Auto-detect walls accuracy overhaul | **P0 — broken feature** | 1 session *(scheduled as S12)* |
| 2 | Grid-loop iteration cap | **P0 — safety + real slowness** | ½ session |
| 3 | **Guided tutorial mode** | **P1 — high** | 1–2 sessions |
| 3b | ✅ **Door width + swing angle** (owner-requested) — **DONE S17** (G2f corridors deferred) | ~~P1~~ done | — |
| 4 | Snap furniture to a wall's angle | **P1 — high** | ½ session |
| 5 | Read-only 3D view | P2 | 1 session *(plan exists)* |
| 6 | Component/hook tests | P2 | 1 session |
| 7 | Drag-release wall splitting | P3 | small |
| 8 | Multi-select with a listener in it | P3 | small |
| 9 | Window/door-leaf reflection materials | P3 | small |

---

## 1. Auto-detect walls accuracy overhaul — **P0**

Already scheduled as **Session 12** with a full diagnosis; see the kickoff in
[`kickoff-session-12.md`](kickoff-session-12.md). Listed here only so the priority ordering is
complete. It is P0 because it is a headline feature that currently returns an unusable tangle on a
real floorplan — the owner hit this in a cold clickthrough and the only available action was
"Discard".

## 2. Grid-loop iteration cap — **P0**

Deferred out of S8 (see [`security.md`](security.md)). `bestspot.ts:150`, `pairspot.ts:141` and
`arrange.ts:167` walk `sceneBounds` with a fixed step, so cost is multiplicative in
`objects × pairs × span²` and unbounded from the engine's own side.

Two payoffs, which is why it outranks everything below it despite being small:

- **Safety:** it is the one thing that would let the security posture claim worst-case CPU is
  *closed* rather than *mitigated*.
- **Real, everyday slowness:** measured, a legitimately-built 10-room house already costs ~200 ms
  per simulation — and the memo re-runs on **every scene edit**, so that is 200 ms of lag per
  nudge. A 50-room layout is ~11 s and effectively unusable. Capping iterations (or making the
  step adaptive to span, as `rooms.ts` already does) fixes a real usability cliff, not just a
  theoretical attack.

Do it as its own session: it touches frozen engine files and every change there needs the full
adversarial treatment.

---

## 3. Guided tutorial mode — **P1 (high)**

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
