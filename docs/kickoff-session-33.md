# KICKOFF — Session 33

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S32 shipped §4b's plain-`F` half and deferred ⇧F on a measurement.** It also recorded, with
numbers, the **two things the owner reported on 2026-08-03** — and those are now the head of the
queue, because they are owner-facing complaints about shipped features.

- **Shipped:** `COMMAND_SEAT` / `WALL_SEAT_REACH_M` (1.2 m) / `seatObjectAgainstWall` /
  `canSeatAgainstWall`; the `F` key; the Inspector button; a fourth touch-HUD button; the snap guide.
- **Two real defects fixed:** the C3 short-wall capture hazard reopening at the wider command band,
  and a SHIPPED quantise-then-clamp non-idempotence (14.3 % of seated results slid up to 1.5 cm).
- **Deferred:** ⇧F → `docs/ideas.md` **§4d**, fully specified.

**Baseline.** `main` is at the S32 merge (`d9566ad`): `npm test` **1560**, JS **503.23 kB /
164.17 kB gz**, CSS **53.65 kB / 10.00 kB gz**, HTML 1.31 kB. All gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1471 → 1536 → 1543 → **1560**). Never let it drop; no test may be
newly skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

**PUSH TO GITHUB — standing owner instruction, reaffirmed 2026-08-03: *"push to git always."***
Land session work on `main` via `--ff-only` and `git push origin main` at the end of EVERY session,
and push the kickoff you write too. Never leave work committed only locally.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install`, or symlink.
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole tree to /tmp and patch THERE.
  S32 used `rsync -a --exclude node_modules --exclude .git` + a symlinked `node_modules` to run nine
  negative controls; it is cheap and it is what turns an argument into a measurement.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.** S32: two CRITICALs
  reproduced exactly and were fixed; one HIGH was superseded by a better form; and a claimed "2.5 cm
  defect that keeps sliding" measured **1.5 cm and converges after one step**. Verify each one.
- ⚠️ **TRAP 10** — `vite preview` silently moves port if taken; use `--strictPort` on a dedicated port.
- ⚠️ **TRAP 11** — `git add -A src/` sweeps strays. Run
  `git ls-files --others --exclude-standard src/` before EVERY `git add`.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. S32 hit exactly this: three
  tsc-only breaks (`InspectorPanel.door.test.tsx`, `canvas-a11y.test.tsx`, and an unused import)
  with `npm test` green throughout. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree.
- ⚠️ **TRAP 15** — a workflow phase can run long; prefer several small workflows.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. `format:'jpeg'`.
- ⚠️ **TRAP 17** — zsh does not word-split unquoted parameters, and `--include=*.test.tsx` unquoted
  is a glob error. Quote them.
- ⚠️ **TRAP 18** — `npx vite-node` runs engine code outside the suite; imports from a /tmp or
  scratchpad harness must be **absolute**.
- ⚠️ **TRAP 19** — a fresh Chrome profile shows the first-run welcome, a MODAL `Dialog` whose
  `.dialog-scrim` swallows every synthesized mouse event. Dismiss it and assert
  `!document.querySelector('.dialog-scrim')` before driving anything.
- ⚠️ **TRAP 20** — a raw `window.dispatchEvent` is outside React's event system; go through `act()`.
- ⚠️ **TRAP 21** — jsdom dispatches a plain `Event` for pointer events, so `button`/`pointerId`/
  `clientX` arrive `undefined` and any guarded handler bails. Probe before writing a pointer test.
- ⚠️ **TRAP 22** — **a live harness with a wrong selector reports PASS against pre-existing data.**
  Gate every downstream assertion on "did the thing under test actually happen?", and make that
  guard itself a FAILING check when it did not. S32's harness did this correctly and caught that the
  seeded demo has no window, so C6 would have gone vacuously untested — it then CREATED one through
  the app's own `w` key rather than accepting the gap.
- ⚠️ **TRAP 23 (new, S32)** — **a parameter sweep can be arithmetically incapable of expressing the
  bug.** My first idempotence sweep reported 0 slides in 1737 results because every wall length and
  piece width I chose put the clamp target exactly on the 0.05 grid. Off-grid: 14.3 % slide. When a
  sweep finds nothing, ask whether your parameters could have found something.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0), including the push.
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained FIVE entries in S32. Plus
   `docs/master-plan.md` (Session 32), `docs/ideas.md` §15, §16, §4d.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
   §15 is squarely heavy (it is `src/engine/generate/` + `src/engine/arrange.ts`).
4. **Adversarially verify — ALWAYS**, then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1560**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then **run the wrong answer past your
   own new tests.** S32 ran nine; seven caught, one exposed a genuine test hole, and one revealed
   provable code redundancy that was then annotated honestly rather than dressed up as tested.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; **no real screen reader has
    ever been driven on this project**; touch is CDP emulation, not a physical device.

**The meta-lesson, from S32:** ship the half you can prove and SPEC the half you cannot — *before*
it lands. ⇧F was designed, measured against shipped `main`, found to be destroyed by the existing
drag magnet on 4 of 5 pieces, and deferred with every number written down. That is S31's revert
lesson applied one step earlier, which is much cheaper.

---

## 2. YOUR TASK

### 2a. §15 — the design generator's QUALITY (P1, owner-reported, ~1 session)

> *"generate a design is broken as fuck. i want actual good generations with logic and thought not
> random designs."* — owner, 2026-08-03

**Read `docs/ideas.md` §15 first — it has the measurements, so do not start from the adjective.**
Harness: `docs/sessions/S32/bench/audit-generate.mts` (8 archetypes × 60 seeds = 480 designs).

The diagnosis is much narrower than "random":

| symptom | measured |
|---|---|
| designs skipping ≥1 piece | **126 / 480 = 26.3 %** |
| of those skips, the `armchair` | **125 of 126** |
| designs shipping ZERO speakers | **46 / 480 = 9.6 %** |
| mean floor coverage | **9.3 – 24.1 %** |
| rooms with no furniture | 2 of 960 — a non-issue |

**Cause 1 is a one-line asymmetry.** `arrange.ts:411-418` — the `armchair` is the ONLY case in
`scoreSlot` that `return null`s (`if (facing < 0.2) return null`); every other case adjusts `score`.
It is requested in **420** designs and skipped in **125 = 29.8 %**, with a TV present in **every
single one**, so the cone test is the whole cause. Fix direction: make it a penalty, or fall back to
the best-facing slot — but MEASURE the resulting layouts, because the cone is what stops an armchair
facing a wall.

**Cause 2** — "no speakers" is S22's deliberate ship-a-lock-or-nothing choice and is *correct*, but
9.6 % of the time the user gets a furnished flat with no audio and the dialog does not say why.

**Cause 3** — 9–24 % floor coverage is what "looks random" actually measures. `inventoryFor`
(`generate/index.ts:99`) keys off crude area thresholds and room-name regexes, with no notion of a
focal wall, a circulation path, or a secondary zone.

**Not yet investigated, and prime suspects:** whether `tile.ts`'s guillotine tiler can be
constrained to sane proportions (worst aspect measured **2.68:1**, smallest `railroad` kitchen
**10.85 m²**), and whether room ADJACENCY is ever considered (a kitchen opening off a bedroom is
possible today).

**Acceptance.** Build the measuring instrument FIRST and test the instrument (the S22 discipline) —
a scored harness run BEFORE and AFTER over the same enumerated seeds, reporting skip rate, floor
coverage, aspect spread, adjacency sanity and lock rate. Skip rate to ~0. A stated coverage floor
per archetype. The `armchair` reject either removed with evidence or kept with a fallback.
⚠️ `generate/` is a LEAF CONSUMER — nothing in `src/engine/` may import it back, or you create
`scene → generate → arrange → scene` and `scene → generate → stereo → pairspot → scene` at once.

### 2b. §16 — Word-style direct-manipulation handles (P1, owner-requested, ~1 session)

> *"i also want to be able to change the shape and size and rotation of objects with my mouse just
> like in microsoft word"* — owner, 2026-08-03

`docs/ideas.md` §16 lists the six things in the shipped code that make this non-trivial. The two
that will bite hardest:

- **It collides with the S23 wall-seat magnet.** `moveObjectTo` rewrites `rotation` every frame from
  `rot0`; a resize or rotate gesture must be its own `Drag` kind the magnet does not touch, or the
  two fight exactly as `q`/`e` did mid-drag.
- **`rot0` re-basing (`SimCanvas.tsx:1004`) reads `live.rotation`** and re-bases when it differs from
  what the branch last wrote — so a rotate handle is indistinguishable from an external `q`/`e`
  unless it uses the same `lastRotRef` discipline.

Handles are canvas pixels, so hit-testing needs a pure node-tested `handleAt(view, obj, screenPt)`
(the `interaction.ts` pattern) and the a11y story stays the keyboard path. Doors are wall-locked
(S17): resize changes the clear opening only, rotation stays refused.

### 2c. Others

⇧F (§4d, P2, fully specified) · `App.tsx` decomposition (**1292** lines against an 800 cap, P2) ·
the `scalePlan` annotation-stroke gap (P2) · export-all bundle IMPORTER (P2, still write-only) ·
detection's worst case (P2) · §13e's metric-scale redirect (P2) · §13f · §13c (P3) · multi-tab
folder loss (§10d) · `docs/ideas.md` §14f (three P3 gallery leftovers).

---

## 3. LIVE VERIFICATION

`docs/sessions/S32/{cdp.mjs,live-s32.mjs}` is the freshest zero-dependency harness (Node's built-in
WebSocket + fetch). `live-s32.mjs` is the one to copy: it asserts a fresh profile, dismisses the
first-run modal (TRAP 19), drives the app's own keyboard cycle to select objects (no world→screen
maths needed), reads results back out of **IndexedDB** rather than the DOM, and — the TRAP 22
pattern — gates every assertion on the thing under test having actually happened, then CREATES the
missing fixture through the app's own UI rather than accepting a vacuous pass.

`docs/sessions/S30/live-s30.mjs` remains the reference for gallery/touch work (real
`Input.dispatchTouchEvent`, phone viewport). `docs/sessions/S28/live-owner-plan.mjs` is the one for
anything image-related — it feeds a real file through the app's OWN hidden file input, so the image
travels the full lossy chain.

`docs/sessions/S26/bench/owner-appchain.bin` and `docs/sessions/S28/bench/owner-plan.png` are where
detection measurements should start. `docs/sessions/` is gitignored — copy what you need into your
own session directory.

---

## 4. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what
is real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, **and `git push origin main` — standing owner instruction, do not skip it.**
Then write the NEXT kickoff, re-stating this protocol in full.
