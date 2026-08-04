# KICKOFF — Session 34

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S33 closed §15, the owner's "generate a design is broken as fuck" report** — and found that the
diagnosis filed in `docs/ideas.md` was wrong, which is worth reading before you trust any other
filed diagnosis in that file.

- **Built the instrument first** (`src/engine/generate/__tests__/design-score.ts`, test-only, 29
  tests of its own), calibrated on the hand-authored Maple Court demo. Three defects were found in
  the instrument before it was used to justify anything.
- **Measured, 8 archetypes x 60 seeds: total 0.7856 → 0.8552.** Skips 26.3 % → **1.9 %**, designs
  with NO speakers 46 → **7** of 480, coverage 12.7 % → 18.4 %, proportion 0.969 → **0.999**.
- **The real cause of 125 of 126 skips** was `openSlots` handing every open slot the CONSTANT world
  facing `{x:0,y:-1}`, not the cone threshold everyone had written down.

**Baseline.** `main` is at the S33 merge: `npm test` **1612**, JS **505.77 kB / 164.98 kB gz**, CSS
**53.65 kB / 10.00 kB gz**, HTML 1.31 kB. All gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1536 → 1543 → 1560 → **1612**). Never let it drop; no test may be
newly skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

**PUSH TO GITHUB — standing owner instruction: *"push to git always."*** Land session work on
`main` via `--ff-only` and `git push origin main` at the end of EVERY session, and push the kickoff
you write too. Never leave work committed only locally.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install`, or symlink.
- ⚠️ **TRAP 3** — **the shell cwd persists between Bash calls, including across a `cd` into /tmp.**
  S33 lost two tool calls to this after a negative-control run left the shell in `/tmp/s33nc`.
  Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole tree to /tmp and patch THERE.
  S33 used `rsync -a --exclude node_modules --exclude .git` + a symlinked `node_modules` for a
  9-point constant sweep and 8 negative controls; it is cheap and it turns an argument into a
  measurement.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.**
- ⚠️ **TRAP 10** — `vite preview` silently moves port if taken; use `--strictPort`.
- ⚠️ **TRAP 11** — `git add -A src/` sweeps strays. Run
  `git ls-files --others --exclude-standard src/` before EVERY `git add`. Note `docs/sessions/` is
  gitignored, so `git add docs/sessions/...` fails loudly — that is working as intended.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. S33 hit this again: `npm test`
  green, `tsc --noEmit` red on a `RectObj | CircleObj` narrowing in a new test. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree.
- ⚠️ **TRAP 15** — a workflow phase can run long; prefer several small workflows.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. `format:'jpeg'`.
- ⚠️ **TRAP 17** — zsh does not word-split unquoted parameters; quote `--include=*.test.tsx`.
- ⚠️ **TRAP 18** — `npx vite-node` runs engine code outside the suite; imports from a /tmp or
  scratchpad harness must be **absolute**.
- ⚠️ **TRAP 19** — a fresh Chrome profile shows the first-run welcome, a MODAL `Dialog` whose
  `.dialog-scrim` swallows every synthesized mouse event. **The dismiss button is "Start exploring"
  and it renders OUTSIDE `.dialog`** — scoping a query to `.dialog button` finds nothing (S33).
  Assert `!document.querySelector('.dialog-scrim')` before driving anything.
- ⚠️ **TRAP 20** — a raw `window.dispatchEvent` is outside React's event system; go through `act()`.
- ⚠️ **TRAP 21** — jsdom dispatches a plain `Event` for pointer events, so `button`/`pointerId`/
  `clientX` arrive `undefined` and any guarded handler bails. **This is directly load-bearing for
  §16**: the resize/rotate handles cannot be unit-tested through jsdom pointer events, so the pure
  hit-test module carries the tests and the wiring is proved over CDP.
- ⚠️ **TRAP 22** — **a live harness with a wrong selector reports PASS against pre-existing data.**
  Gate every downstream assertion on "did the thing under test actually happen?", and make that
  guard itself a FAILING check. S33's harness aborted twice on its own guards — first on the welcome
  modal, then on the Generate dialog never opening — instead of reporting vacuous passes. That is
  the behaviour you want.
- ⚠️ **TRAP 23** — a parameter sweep can be arithmetically incapable of expressing the bug.
- ⚠️ **TRAP 24 (new, S33)** — **agent workflows can die mid-run on a session usage limit.** Four of
  six agents in S33's understanding workflow errored with *"You've hit your session limit"*, losing
  both skeptics. The work was not lost (the two reports that landed were read out of
  `journal.jsonl`) but the adversarial pass had to be done by hand. Prefer several small workflows
  over one big one, read `journal.jsonl` directly rather than waiting on the summary, and say so in
  the handoff when a verification pass was partial.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0), including the push.
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained SIX entries in S33. Plus
   `docs/master-plan.md` (Session 33), `docs/ideas.md` §16, §15b, §4d.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
   §16 is heavy (canvas interaction + a new pure module + `SimCanvas.tsx`).
4. **Adversarially verify — ALWAYS**, then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1612**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then **run the wrong answer past your
   own new tests.** S33 ran 8; all were caught, and one revealed that the test written for it was
   not load-bearing — the fixture could not express the failure. Check each control fails the test
   you wrote it for, not merely some test.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; **no real screen reader has
    ever been driven on this project**; touch is CDP emulation, not a physical device.

**The meta-lesson, from S33:** build the measuring instrument BEFORE the first change and test the
instrument itself. It caught a regression that a skip-rate-only view would have shipped (no-speaker
designs 46 → 92), and its own tests found three defects in it. And when the instrument and a
screenshot disagree, the screenshot is the customer — the office-with-a-bed fix LOWERED the corpus
total and was obviously right.

---

## 2. YOUR TASK

### 2a. §16 — Word-style direct-manipulation handles (P1, owner-requested, ~1 session)

> *"i also want to be able to change the shape and size and rotation of objects with my mouse just
> like in microsoft word"* — owner, 2026-08-03, in the same message as the generator complaint.

This is now the head of the queue: it is owner-requested, owner-facing, and the only P1 left.
`docs/ideas.md` §16 lists what makes it non-trivial in the shipped code. The two that will bite:

- **It collides with the S23 wall-seat magnet.** `moveObjectTo` rewrites `rotation` every frame from
  `rot0` while a drag is live; a resize or rotate gesture must be its own `Drag` kind the magnet
  does not touch, or the two fight exactly as `q`/`e` did mid-drag (the S23 lesson).
- **`rot0` re-basing (`SimCanvas.tsx:1004`) reads `live.rotation`** and re-bases when it differs from
  what the branch last wrote — so a rotate handle is indistinguishable from an external `q`/`e`
  unless it uses the same `lastRotRef` discipline.

Also from §16: handles must live in the object's ROTATED frame (`rectCorners` gives the basis, and
Maple Court is a −12.83° plan, so world-axis grips are visibly wrong on the one layout that matters);
grips are canvas pixels so hit-testing needs a pure node-tested `handleAt(view, obj, screenPt)` in
the `interaction.ts` pattern; undo must coalesce one gesture into one entry (`beginGroup`/`endGroup`)
and a no-op resize must return the SAME scene ref (the S14 lesson); doors/windows are wall-locked
(S17) so a grip changes the clear opening only and rotation stays refused.

**Acceptance.** Pure hit-test + transform module with node tests over rotated frames; its own `Drag`
kind; Shift for aspect-lock and Alt for resize-about-centre (the Word contract); keyboard
equivalents already exist (`q`/`e`, Inspector) so SC 2.1.1 is met — state that explicitly; live
verification with real `Input.dispatchMouseEvent` drags, since jsdom cannot drive pointer events
(TRAP 21). Decide and document whether a grip dragged past zero mirrors (as Word does) or clamps.

### 2b. §15b — per-room furniture quotas (P2, ~½ session)

The one sub-score S33 did NOT improve. `inventoryFor` reasons per ROOM and returns a flat global
count; `arrangeFurniture` places by score with no per-room filter, and `ZONE_AFFINITY` is only a
soft pull (+1.6 / −0.9). Measured after S33, `two-bed`'s `programme` is **0.800** — one bedroom in
five has no bed because both beds scored better in the same room. Carry a room id on `ArrangeItem`
and give `placeOne` a per-room candidate filter. Re-run
`docs/sessions/S33/bench/score-corpus.mts` before and after; it is already the before/after
instrument and it is committed as a test-only module.

### 2c. Others

⇧F (§4d, P2, fully specified) · `App.tsx` decomposition (**1292** lines against an 800 cap, P2) ·
`cinema`/`great-room` density (0.254 / 0.399, the two lowest — P3) · the `scalePlan`
annotation-stroke gap (P2) · export-all bundle IMPORTER (P2, still write-only) · detection's worst
case (P2) · §13e's metric-scale redirect (P2) · §13f · §13c (P3) · multi-tab folder loss (§10d) ·
`docs/ideas.md` §14f (three P3 gallery leftovers).

---

## 3. LIVE VERIFICATION

`docs/sessions/S33/live-s33.mjs` is the freshest harness and the one to copy for §16 — it imports
`../S32/cdp.mjs` (zero-dep, Node's built-in WebSocket + fetch), asserts a fresh origin, dismisses
the first-run modal by the RIGHT button ("Start exploring", outside `.dialog` — see TRAP 19), drills
into a folder to reach `Generate a design…` (it is not on the home grid; it lives at
`LayoutGallery.tsx:530` and `:762`), reads results back out of **IndexedDB** rather than the DOM,
and aborts on its own guards rather than reporting vacuous passes.

For §16 specifically you need REAL mouse drags, not `element.click()`: `Input.dispatchMouseEvent`
with `mousePressed` → several `mouseMoved` → `mouseReleased`. `docs/sessions/S30/live-s30.mjs` is the
reference for pointer/touch work (real `Input.dispatchTouchEvent`, phone viewport). Locating a canvas
object by CONSEQUENCE rather than by pixel maths is the S23 lesson: sweep candidate points, drag each
~30 px, and check whether the TARGET object's stored centre changed, then ⌘Z back.

`docs/sessions/S33/bench/` holds the generator instrumentation: `score-corpus.mts` (the before/after
score), `plot.mts` (an SVG contact sheet — the fastest way to SEE whether designs got better;
`qlmanage -t -s 1800 -o .` renders it to PNG), `variety.mts`, `calibrate.mts`, `probe-armchair.mts`,
`probe-size.mts`. `docs/sessions/` is gitignored — copy what you need into your own session
directory.

---

## 4. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what
is real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, **and `git push origin main` — standing owner instruction, do not skip it.**
Then write the NEXT kickoff, re-stating this protocol in full.
