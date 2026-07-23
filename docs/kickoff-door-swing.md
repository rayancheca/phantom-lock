# KICKOFF — Doors & Windows: easy placement + door swing (Phantom Lock)

Run under the **Standing Operating Protocol** at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness and
completeness, never speed.

This corresponds to **`docs/ideas.md` items 3b (door width + swing — owner-requested) and, in part, 3b's
"easy to make" companion.** It is **HEAVY** by the objective triggers: it changes a data model + its
migration, it touches the sanitizer (`scene.ts`), and it edits more than one file. It therefore MUST get: a
multi-agent Workflow (parallel understand → design → an adversarial skeptic that tries to REFUTE each risky
change against the real code), full implementation (no stubs/TODOs/`.skip`/`.only`/scope-narrowing),
failing-test-first for every new pure behaviour, a self-review agent pass over the ACTUAL diff, and a handoff
with an Evidence block.

> **Why this kickoff exists and what's already been done.** The owner asked, verbatim: *"i want it to be easy
> to make doors and windows and also select for [how] far the door swings given its size."* The **"easy to
> make" half was a bug** — the on-canvas "+ Door / + Window" chip was unclickable for three separate reasons
> (a `transform`/`translate` animation clash, chip relocation to the nearest wall, and the canvas's
> `onPointerLeave` destroying it) — and that is **already fixed and pushed** (commit `ddbd1f4`,
> `fix: make the +Door/+Window chip clickable`). The **swing half is NOT built.** A design workflow was
> started; its **investigation completed** (data model + UX, both folded into this document as VERIFIED
> facts), but the **acoustics analysis, the design spec, and the adversarial skeptic never ran** — they died
> on a session usage limit. So your **first orchestration step is to run exactly those three**, then implement.

---

## 0. GIT + THE TRAPS (read before touching a file)

**MAIN REPO (source of truth):** `<REPO_ROOT>` (`/Users/<you>/…/Dev/fun/layout`). `main` is at **`77bb751`**,
clean, in sync with `origin/main`. Create a fresh per-session worktree branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE `main` checkout sits at the repo root. ALWAYS confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST, and pass worktree-relative paths to Read/Edit/Write — otherwise your
  edits silently land in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** Run `npm install` first or every gate
  command fails confusingly. (Bit S7 and S8.) **Corollary that bit THIS session:** after you land on `main`,
  the ROOT checkout's `node_modules` may be stale (pre-S7, missing `jsdom`) — `npm test` there reports 3
  ERR_MODULE_NOT_FOUND for the jsdom project while the 31 node files pass. It is not a code failure; run
  `npm install` in the root before trusting its gate.
- ⚠️ **TRAP 3 — the shell `cwd` persists between Bash calls.** A `cd` in one call is still in effect in the
  next. Prefer absolute paths or re-`cd` every time.
- ⚠️ **TRAP 4 — `.claude/launch.json` is a TRACKED file.** Do not overwrite it; its `autoPort: true` is what
  stops your dev server from stealing the owner's port on :5173.
- ⚠️ **TRAP 5 — verify visual/behavioural claims by OBSERVATION, not API readback.** This is the load-bearing
  lesson for THIS feature. The door-chip bug was a CSS `transform` being clobbered by a `pop-in` animation —
  `getBoundingClientRect` *reported the right position after the animation ended*, so the bug was invisible to
  a naive check and only fell out of dumping the chip's position + opacity + `elementFromPoint` mid-trip.
  Twice this session a "passing" verification was measuring the wrong thing (a chip that had silently
  relocated; a mid-animation rectangle). For a swing arc: a drawn arc that *looks* like it swings but is the
  hardcoded 69.23° is a lie; assert the actual angle, and screenshot both themes.
- ⚠️ **TRAP 6 — a control that looks physical but changes nothing is a lie (the core design risk here).**
  Today a door is acoustically **binary** (open = a hole with no surfaces; closed = a solid absorber). A swing
  *angle* slider that silently changes the simulation, OR that changes nothing while pretending to, are both
  failures. Settle what swing means BEFORE writing code (see §3).

There are several stale worktrees from earlier sessions. Ignore them; don't reuse or clean them up.

Commit a baseline, then commit again after the gate passes. Land with:
```
git -C <REPO_ROOT> merge --ff-only <branch>
git -C <REPO_ROOT> push origin main
```
Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. The owner wants visible
GitHub contribution activity — push `main` after the gate lands.

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and PASTE
the literal tails to confirm the baseline is green before changing anything.

---

## 1. WHERE THE PROJECT IS

Repo: **github.com/rayancheca/phantom-lock** (PUBLIC), default branch `main` @ `77bb751`.

Baseline gate to reproduce exactly (end of the security/README/door-chip session):
- `npm run lint` → 0 problems
- `npm test` → **659 tests, 34 files**, two vitest projects (`|node|` pure logic + `|dom|` jsdom+axe)
- `npm run build` → clean; **405.28 kB / 130.82 kB gz** JS + **43.18 kB / 8.24 kB gz** CSS + **1.31 kB** HTML
- `npm run dev` → Vite on :5173 (owner often has one running; `autoPort` moves yours)

**TEST COUNT IS A RATCHET:** 95→126→140→181→239→245→296→322→340→613→644→649→655→**659**. It must never drop, and
no test may be newly skipped/`.only`'d/weakened. State before/after counts.

Done since the master-plan's numbered sessions: S1–S5, the UI/UX overhaul (S13–S16 = UX-1…UX-4), S7
(accessibility), S8 (security hardening + CSP + README rewrite), plus two owner-reported fixes landed after S8:
**finer rotation** (1°/15°/hold-to-repeat, commit `8511446`) and the **door-chip fix** (`ddbd1f4`).

**Read before touching anything:** `CLAUDE.md` (the whole file — protocol, architecture map, design system, the
Accessibility and **Security** sections, and especially "Hard-won lessons"); `docs/security.md`; `docs/ideas.md`
(the prioritized backlog — this feature is item 3b); and the two `## Security` / rotation / door-chip entries in
the `docs/master-plan.md` progress log.

**Two constraints from recent work that bear on this feature:**
1. **The sanitizer is allow-list reconstruction and was hardened in S8.** A new field that is not explicitly
   copied in `sanitizeObject` is **silently dropped on the first save→load**, so the feature would not persist.
   Any new numeric field must be **clamped** there (an unbounded field is exactly the class S8 hardened — the
   `r: 1e308` brick). Read the `cleanVec`/`isNum` comments before editing.
2. **A strict CSP is enforced** and `src/__tests__/security-headers.test.ts` fails the build if any source file
   reaches for `setAttribute('style')` / `insertRule` / `innerHTML` / `eval` / `new Function`. Position new UI
   with React inline styles (CSSOM), never a style attribute string.

---

## 2. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** Map every site before touching it (§4 lists them; most are already cited in §3).
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). Do not solo
   heavy work. For THIS task the understanding of the data model and UX is already done (§3) — your first
   workflow is the **acoustics analysis + design spec + skeptic** that got cut off (§3, "DO THIS FIRST").
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent skeptic
   that tries to REFUTE it against the real code. This is not ceremony — skeptics on this project have caught a
   hardening change that would have silently destroyed a legitimate 42-room layout, a DoS estimate wrong by two
   orders of magnitude, a live-region design that announced nothing, and a contrast table wrong in 4 of 5
   cells. Report each verdict.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>". No
   stubs/TODOs/placeholders/scope-narrowing. A split is legitimate ONLY if the shipped slice fully satisfies a
   NAMED subset of the Acceptance criteria and the remainder is rescheduled with its own Acceptance.
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure behaviour,
   never let the count drop below 659. Run `npm run test:coverage` and paste the coverage line for every file
   you touched (≥80%, or state the exact reason). Vite routes by FILENAME: `src/**/*.test.ts` → node project,
   `src/**/*.test.tsx` → jsdom project.
7. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a domain reviewer,
   e.g. `a11y-architect` for the new inspector controls) over the ACTUAL diff. Fix everything real, then
   re-verify. Prefer plain-text returns for reviewer agents; a strict StructuredOutput schema killed one before.
8. **Data safety** (see §5).
9. **Verification gate — proven, not paraphrased.** Paste the literal terminal tails of `npm run lint`,
   `npm test` (with count) and `npm run build` (with gz size). Any red = not done.
10. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count · pasted
    gate output · saved artifact paths · each Acceptance bullet → met/deferred. No Evidence block = incomplete.

State honestly: live checks run ONE browser (headless Chromium unless you do otherwise); no real screen reader
has ever been driven on this project.

---

## 3. YOUR TASK — verified facts, the one open question, and what to build

### 3.0 DO THIS FIRST — run the design pass that got cut off

The started workflow completed the **data-model** and **UX** investigations (folded in below as VERIFIED) but
died on a usage limit before three agents ran: **acoustics analysis**, **design spec**, **adversarial skeptic**.
Re-run them as your opening Workflow, seeded with the verified facts in §3.1–§3.4 so you don't re-derive them.
The acoustics agent's charge (the open question) is §3.2. The skeptic's charge is §3.5.

### 3.1 How a door is represented today — VERIFIED (file:line)

- A door is **not its own type**: it is a `RectObj` with `role: 'door'` (`src/engine/types.ts:20-37`). Windows
  are `role: 'window'`. There is **no hinge side, no swing direction, no swing angle** — the drawn swing arc is
  a hardcoded constant.
- `doorOpen?: boolean` (`types.ts:33-34`). The **universal read convention is `doorOpen !== false` ⇒ OPEN**
  (absent/undefined ⇒ open; only literal `false` ⇒ closed). `sanitizeScene` normalises it to a real boolean on
  every load (`scene.ts:496`, `doorOpen: o.role === 'door' ? o.doorOpen !== false : undefined`).
- **`w` does two jobs at once:** it is the clear opening width that cuts the wall (`raytrace.ts:53-56`,
  `const half = o.w / 2 / len`) AND the drawn swing radius (`render.ts:544`, `rPx = o.w * view.scale`). The
  owner's mental model — "how far it swings given its size" — is already true in the drawing; the UI just never
  says so.
- `makeOpening` defaults (`src/components/canvas/interaction.ts:59-79` — note this file moved/grew when the
  chip fix landed; re-read it): door `w 0.9`, `h 0.1`, `absorption 0.25`, `height 2.05`, `doorOpen true`;
  window `w 1.2`, `h 0.12`, `absorption 0.04`, `height 2.2`, no `doorOpen`. `id` is injected (deterministic,
  unit-tested). `rotation = atan2(dir.y, dir.x)` where `dir = norm(b - a)`.
- **Every `doorOpen` / `role === 'door'` read site** (verify each still holds — line numbers may have drifted):
  `raytrace.ts:91` (`collectSurfaces`: an OPEN door contributes **no surfaces at all**; a CLOSED one
  contributes its 4 edges with its absorption); `pairspot.ts:79` (`bestReflectionDb`: skips an image-source
  bounce whose reflection point lands inside an OPEN door's span); `render.ts:541` (drawing); `scene.ts:496`
  (sanitizer); `InspectorPanel.tsx:345-353` (the one door-specific control today — a single "Door is open"
  checkbox).

### 3.2 THE OPEN QUESTION the acoustics agent must settle — what should swing DO?

Today acoustics are **binary**: open = hole, closed = wall, nothing between. A swing *angle* is a plan-drawing
concept. Decide, with measurements, which of these swing means — and be explicit in the UI about it:

- **Recommended default (from the UX investigation): swing is PLAN GEOMETRY ONLY and does NOT change acoustics.**
  Keep `doorOpen` as the sole acoustic switch; `swingDeg` documents the clearance the leaf needs (like every
  architectural floor plan). A door drawn swung-open at 90° with `doorOpen:false` is a normal, honest drawing.
  This is the simplest honest model and it is what "select how far the door swings given its size" literally
  asks for. **If you choose this, the inspector copy MUST say the swing "draws the clearance the door needs —
  it doesn't change the sound," and a test must assert swing 0 vs 90 produces byte-identical `computeAudio`.**
- **Alternative (heavier, must be justified by measurement, and the skeptic must sanity-check the DIRECTION):**
  a partially-open door partially transmits. If you go here you must PROVE (traceScene→computeAudio, numbers in
  the handoff) that swing 0→90 moves a measurable output in the CORRECT direction (more open ⇒ not quieter),
  and you must not fuse it with `doorOpen` such that a clearance edit silently perturbs the sim. The project's
  culture punishes fake precision — do not ship this unless the model is honest AND testable.

**Do not** overload `doorOpen` to mean "how open". That fuses the plan symbol with the acoustic switch and makes
every clearance edit change the verdict — the single most important design decision in the whole change set.

### 3.3 How doors are created today — VERIFIED (three inconsistent routes)

| route | pointer? | appMode | sub-step | tool | selection | picks position? |
|---|---|---|---|---|---|---|
| **A — hover chip** (now clickable) | yes (+rAF) | **any** | any | `select` | none | **yes** (anywhere on the wall) |
| **B — `d`/`w` keys** | no | `design` | any | any | a selected wall (`{type:'object'}`) | no (wall midpoint) |
| **C — Furnish palette preset** | click | `design` | `furnish` | any | none | no (drops at scene centre, needs a drag to snap) |

No two share a gate. Route A is unscoped by mode; route B is DESIGN-only — the **same feature has two different
mode rules** (a real inconsistency to resolve). Route C's door drops floating in mid-room, unrotated, drawn as a
leaf pointing nowhere until dragged within 0.35 m of a wall (`SimCanvas` snap) — the advertised route's first
result looks broken. The guides (`GuidePanel.tsx:28,38`) point ONLY to route C; `d`/`w` is documented only in
the screen-reader-only `canvas-help.ts:19`. There is **no always-visible affordance and no toolbar tool** for
openings (`ToolMode` in `types.ts:206-215` has no `door`/`opening` member; `DIGIT_TOOL.design` uses 1–4, so
**`5` is free in DESIGN**).

### 3.4 What the inspector shows today — VERIFIED

For every `rect` (doors included), `InspectorPanel.tsx` shows generic **Width / Depth / Rotation / Height /
Absorption** plus a TV checkbox, none labelled for a door: "Width" has no unit, "Depth" (the 0.1 m leaf
thickness) is meaningless to a user, the free Rotation slider can silently break the wall-snap invariant, and
`NumField` has `step 0.05` and **no max** (a door can be set to 47 m wide). The only door-specific control is the
one "Door is open" checkbox. Windows get no size guidance.

### 3.5 The change set (ranked) — GROUP 1 "make doors easy", GROUP 2 "add swing"

This is the UX investigation's recommendation. Treat it as the design input to your spec, not gospel — the
skeptic must attack it. **Minimum shippable slice** is called out at the end.

**GROUP 1 — makes doors easy (no swing model needed):**
1. **Openings as a first-class DESIGN/Build tool.** Add `'opening'` (or `'door'`) to `ToolMode`
   (`types.ts:206`), map it in `subStepForTool → 'build'` (`mode.ts:41`) and `DIGIT_TOOL.design['5']`
   (`mode.ts:61`), add a `MODE_HINT` entry (`app-constants.ts`) and a `Toolbar` entry, arming a "click a wall
   to place an opening" mode with a live ghost (⇧ for a window). This is the only fix that gives an
   always-visible affordance + click-to-position + correct alignment on first drop.
2. **Fix route C's drop** (`App.tsx addPreset`): for a door/window preset, place at the nearest/longest wall's
   midpoint with that wall's rotation (reuse `openingOnWall`, `placement.ts:110-123`), not the scene centre.
3. **Door-specific inspector, size first:** a dedicated branch `if (obj.kind === 'rect' && obj.role === 'door')`
   BEFORE the generic rect branch. Drop "Depth" and the free Rotation slider; bound Width to 0.6–2.4; add a
   `70 · 76 · 80 · 90 · 120 cm` preset row (reuse the `.preset-row` + `.btn-active` idiom already at
   `InspectorPanel.tsx:170-182`); caption that width is the clear opening.
4. **Surface the routes in visible copy** (`GuidePanel`, on-canvas `Legend`, a `MODE_HINT`) so `d`/`w` and the
   tool are documented outside the sr-only string.
5. **Make the chip's gating consistent:** add `overlayOpen` to the chip's render gate (`SimCanvas` `.wall-actions`
   has none, unlike `SelectionActions` which was S14-gated), and decide the appMode question (scope the chip to
   DESIGN like `d`/`w`, or unscope `d`/`w`).

**GROUP 2 — adds swing:**
6. **Parameterise the EXISTING plan symbol.** The quarter-arc + leaf already exists at `render.ts:535-563`; the
   swing angle is the hardcoded literal `Math.PI / 2.6 ≈ 69.23°` (`render.ts:543`), the hinge is always the same
   jamb, the side is always the same direction, and the arc DISAPPEARS when `doorOpen === false`. Add optional
   `swingDeg?` (0–180, default 90), `hingeEnd?: 'start'|'end'` (default 'start'), `swingSide?: 'in'|'out'`
   (default 'in') to `RectObj`; default+clamp them in `sanitizeScene`; consume them in that one render block,
   replacing the literal and drawing the arc whenever `swingDeg > 0` **independent of `doorOpen`**. Reuse
   existing colour tokens (`T.wall`/`T.select`) — do NOT hardcode a theme-keyed colour (the S13 trap). Theme
   difference must be a WEIGHT/visibility gate: `plan` draws the dimension pill at `view.scale >= 22` like the
   existing dimension convention; `sound` keeps it quiet so it doesn't fight the ray field.
7. **Swing controls in the inspector:** a `<input type=range>` 0–180 step 5 with an `<output aria-live="off">`
   (mandatory — `<output>` is an implicit `role="status"`; the S7 lesson is these double-speak on every drag),
   plus two `role="group"` `.preset-row` flip toggles (hinge side / swing side) using `aria-pressed`, NOT
   `radiogroup` (the S7 lesson: `radiogroup` promises a roving-tabindex contract these rows don't implement).
8. **Keep `doorOpen` as the acoustic switch only**, with copy that says the swing is separate (see §3.2).
9. **`f` / `⇧F` canvas keys** to flip swing side / hinge on a selected door — a pure addition to the
   canvas-scoped block in `keyboard.ts`, **MODE-SCOPED on `env.appMode === 'design'`** (the S7 lesson: mode-scope
   EVERY new canvas key, not just digits), node-testable, zero SimCanvas lines. Append to `canvas-help.ts`.
10. **Swing-aware door corridors** (`arrange.ts`): once `swingSide`/`swingDeg` exist, the arranger's clearance
    corridor should follow the actual swing so it stops putting a sofa where the door opens. Lowest priority; the
    payoff that makes swing more than decoration.

**Do NOT build canvas leaf-dragging this session.** The UX investigation rejected it: SimCanvas is already 1210
lines (over the 800 cap), rAF-gated drag cannot be driven in the in-app preview (only via CDP), and the gesture
collides with move-along-wall and `q`/`e` rotate. The inspector slider + `f`/`⇧F` keys cover it. If ever built,
it belongs in the session that splits SimCanvas into hooks, with CDP-driven live proof.

**MINIMUM SHIPPABLE SLICE (if only half the time exists):** GROUP 1 items 1+3 (the door tool + the
door-specific size inspector with the preset row) **plus** GROUP 2 items 6+7+8 (parameterise the symbol +
swing/hinge/side inspector controls + keep `doorOpen` separate). That fully satisfies the owner's literal ask
("easy to make" + "select how far it swings given its size") and is coherent on its own. Items 2, 4, 5, 9, 10
are the polish tail and each can be its own follow-up block with its own Acceptance.

### 3.6 SCOPE GUARD

Keep the acoustics math byte-unchanged UNLESS §3.2's acoustics decision deliberately requires an engine change —
and if it does, that change is itself HEAVY and needs its own skeptic pass and full engine treatment. The frozen
set is `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot}.ts`; verify with `git diff --stat`. If the
recommended "plan-only, no acoustic effect" model is chosen (§3.2), **none** of these should change — the swing
lives entirely in `types.ts` + `scene.ts` (sanitizer) + `render.ts` + the inspector + `keyboard.ts`
(+ optionally `arrange.ts` for item 10, which is NOT in the frozen set). Do not regress the S7 a11y work, the
S13–S16 design system, or the S8 security posture (the CSP drift test will tell you if you break it).

---

## 4. READ FIRST (in order)

1. `CLAUDE.md` — protocol, architecture map, design system, Accessibility + Security sections, "Hard-won
   lessons" (~9 from S7, ~7 from S8, plus the rotation and door-chip entries).
2. `docs/master-plan.md` — the Standing Operating Protocol at the top + the recent progress-log entries.
3. `docs/ideas.md` — item 3b (this feature) and its verified groundwork; also items 3 (tutorial) and 4 (snap to
   wall angle), which are adjacent.
4. `docs/security.md` — so you don't unknowingly break the S8 posture with a new field.
5. The code: `src/engine/types.ts` (`RectObj`, `ToolMode`) · `src/engine/scene.ts` (`sanitizeObject` rect
   branch ~`:483-502`, `FURNITURE_PRESETS` ~`:209-210`, `addPreset` consumers) · `src/components/canvas/interaction.ts`
   (`makeOpening`, and re-read the chip logic that just changed) · `src/components/canvas/render.ts:535-563`
   (the door symbol) + `THEMES` · `src/components/panels/InspectorPanel.tsx` (the whole rect branch + the
   `.preset-row`/`NumField`/`AbsorptionField` idioms) · `src/components/app/keyboard.ts` (the canvas-scoped
   block + the `opening` command) + `placement.ts` `openingOnWall` · `src/components/app/mode.ts`
   (`DIGIT_TOOL`, `subStepForTool`) + `app-constants.ts` (`MODE_HINT`) · `src/components/panels/Toolbar.tsx` ·
   `src/components/canvas/Legend.tsx` · `src/components/app/GuidePanel.tsx` · `src/components/canvas/canvas-help.ts`.

The full, VERIFIED investigation reports (data model + UX) are the source for every file:line above; if a line
number has drifted, grep the symbol.

---

## 5. ⚠️ DATA SAFETY — THE OWNER'S REAL LAYOUT IS ON THIS MACHINE

The preview's IndexedDB on `localhost:5173` holds the owner's real data. As of 2026-07-22 (verified): exactly
one layout, id `layout-mrwb0lnz-28-u87ub`, named "Maple Court", `updatedAt` **1784738154671**, 24 objects
(15 walls incl. real doors/windows implied), 2 speakers, 1 listener, no underlays. **VERIFY the live values;
do not assume** — the owner designs their real room in this app and it changes.

- **NEVER delete the owner's layouts.** The "remove the fixture" habit applies ONLY to disposable fixtures YOU
  create.
- **BEFORE any write test, back up FULL-FIDELITY** to `docs/sessions/<S>/backup.json` (gitignored) by reading
  the `phantom-lock` IDB `layouts` + `meta` + `underlays` stores. **Best technique (from S8):** navigate the
  in-app browser to a same-origin STATIC asset (`http://localhost:5173/fonts/LICENSE.md`) and read IndexedDB
  from there — the app never boots, so not even the `meta` row's `updatedAt` advances.
- **THIS FEATURE MIGRATES A DATA MODEL.** The owner has real saved doors. The single highest-risk item is that
  an existing door must behave **identically** after the change — same acoustics, same rendering. Seed an
  OLD-shape door (`{role:'door', doorOpen:true, w:0.9}` with NO `swingDeg`/`hingeEnd`/`swingSide`) and assert it
  reads back with the defaults that reproduce today's exact behaviour (hinge 'start', side 'in', and the
  RENDERED result matching the current 69.23° or your chosen default — decide whether the default is 90° for
  new doors but the migration preserves the OLD look, or you deliberately move all doors to 90° and say so).
- **Prefer a fresh headless-Chrome profile for ALL interactive testing.** A fresh `--user-data-dir` is a fresh
  ORIGIN ⇒ its own IndexedDB, so the owner's is never touched.
- Afterwards confirm the owner's layout record's `updatedAt` is byte-identical.
- Never hand-mutate IndexedDB to "reset".
- **Screenshot policy (owner decision, S8):** `docs/screenshots/` is committed and README screenshots of the
  bundled "Maple Court" demo are allowed (*"pulbish and change the rules. idc about privacy"*). The street
  address stays scrubbed to the "Maple Court" placeholder.

---

## 6. LIVE VERIFICATION

The in-app preview tab runs `document.hidden`, so rAF (canvas render, drag, hover) is paused there. Drive
rAF-gated behaviour in **headless Chrome over CDP** — zero-dep, Node 25 has built-in `WebSocket` + `fetch`. A
working ~230-line client from this session is at `<scratchpad>/main/cdp.mjs` (session-scoped; re-create it if
gone — the door-chip fix used it, and its shape is: `--headless=old`, `--window-size` at launch,
`Page.captureScreenshot{format:'jpeg',quality:90}`, a static file server for `dist/`, trusted
`Input.dispatchMouseEvent`/`dispatchKeyEvent`, and reading results back from IndexedDB).

Specific to this feature:
- **The door tool + chip + inspector are canvas/DOM interactions.** Drive real `Input.dispatch*` events, and —
  per TRAP 5 — verify by OBSERVATION: after placing a door, read it back from IndexedDB (role, w, swingDeg,
  hingeEnd, swingSide) AND screenshot the plan symbol in BOTH themes (`sound` + `plan`) to prove the arc draws
  at the chosen angle, hinge and side. A screenshot that merely shows *an* arc proves nothing about the angle —
  cross-check the numeric field.
- **The swing symbol is the highest-value screenshot.** Capture: a door at 90° vs 45°, hinge-left vs
  hinge-right, swing-in vs swing-out, and closed-with-clearance-shown. Save to `docs/sessions/<S>/`.
- **Migration proof is a unit test, not a screenshot:** seed an old-shape door and assert the sanitized output
  (defaults) + a traceScene→computeAudio comparison (swing must not change the verdict, if you took the
  plan-only model).
- The keyboard `f`/`⇧F` flips are pure `handleKeydown` dispatch — node-test them; they don't need the browser.
- Note S7 hardened the key dispatcher because `e.target === window` when you dispatch a synthetic
  `KeyboardEvent` at `window`; prefer real `Input.dispatchKeyEvent` for focus-dependent behaviour. And CDP
  `(pointer:coarse)` emulation needs `setTouchEmulationEnabled` + `setEmulatedMedia` (the S14/rotation lesson)
  if you test any touch path.

---

## 7. ACCEPTANCE

- A door can be created **easily and discoverably** — at minimum an always-visible DESIGN/Build affordance
  (tool + digit + hint), not only a hover chip and an undocumented keypress. Placement lands ON a wall,
  correctly aligned, on the first action.
- A door's **width** is editable with door-appropriate bounds and real-world presets, labelled as the clear
  opening, in a door-specific inspector (no meaningless "Depth", no invariant-breaking free Rotation slider).
- A door's **swing** is selectable — angle (0–180), hinge side, and swing side — and DRAWN correctly on the
  plan in both themes, with the hinge/side reversible from the keyboard. The `Math.PI/2.6` literal is gone.
- **The acoustic meaning of swing is decided, honest, and stated in the UI** (§3.2). If plan-only: a test proves
  swing 0 vs 90 yields identical `computeAudio`, and the copy says so. If acoustic: measured numbers in the
  handoff prove the effect exists and points the right way.
- **Migration is proven:** an old-shape saved door (no swing fields) reads back with defaults that reproduce its
  prior behaviour — asserted by a test that seeds the OLD shape, not just a fresh fixture. The owner's real
  layout is byte-identical after testing.
- New pure guards are **failing-first tested** in the correct vitest project. New interactive UI meets the S7
  bar (keyboard-operable, visible focus, `aria-live="off"` on `<output>`s, reduced-motion, no contrast
  regression).
- Gate green: lint 0 · ≥659 tests · build clean, all three tails pasted.
- The six frozen engine files are byte-unchanged (unless §3.2 deliberately chose an acoustic model and gave it
  its own skeptic pass — state which).
- The S8 security posture is intact (CSP drift test green; any new numeric field is clamped in `sanitizeObject`).

---

## 8. FINISH

Paste the literal gate tails. Spawn `code-reviewer` + `silent-failure-hunter` + `a11y-architect` over the ACTUAL
diff; fix everything real; re-verify. Save evidence (screenshots of the swing symbol in both themes, the
migration test output, the acoustic-equivalence proof) to `docs/sessions/<S>/` (gitignored). Update `CLAUDE.md`
(commands/ratchet/bundle size, the architecture-map entries for the door model + render symbol + inspector, and
any new hard-won lesson — e.g. the `transform`-vs-`translate`-under-animation trap from the chip fix is worth
recording if not already there), update `docs/ideas.md` (mark 3b done or partially done), and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on `main` via
`--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full. Candidates, in backlog order: **Session 12
auto-detect walls** (kickoff already exists at `docs/kickoff-session-12.md`), the **grid-loop iteration cap**
(P0 in `docs/ideas.md` — also fixes real per-edit slowness), or the **guided tutorial mode** (P1, owner-requested,
full design already written in `docs/ideas.md`).
