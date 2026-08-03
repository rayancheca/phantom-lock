# KICKOFF — Session 32

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S31 produced two refutations and no new feature.** That is what the measurements said, and both
are written up so nobody re-derives them.

- **§13e is REFUTED at the `vision/quality.ts` seam.** No cohesion-style signal can separate a
  floorplan from a page of furniture outlines. Pinned by
  `src/engine/__tests__/indistinguishable.test.ts` (7 tests). Redirected to metric scale; **P1 → P2**.
- **Creation-time alignment was BUILT, live-verified, and REVERTED** because the plan's axis is
  bistable on the owner's own plan. Fully specified now as `docs/ideas.md` **§4c**.

**Baseline.** `main` is at the S31 merge: `npm test` **1543**, JS **500.75 kB / 163.20 kB gz**, CSS
**53.65 kB / 10.00 kB gz**, HTML 1.31 kB — asset content hashes **byte-identical to S30's**, because
S31's whole shipped diff is tests and comments. All gates green, `test:coverage` green. No unlanded
branch.

**TEST COUNT IS A RATCHET** (…1471 → 1536 → **1543**). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install`, or symlink.
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole tree to /tmp and patch THERE.
  S31 used this twice (`rsync -a --exclude node_modules` + a symlinked `node_modules`) to build the
  naive fix and sweep it; it is cheap and it is what turned an argument into a measurement.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.** S31 is the strongest
  case yet: an owner-plan lens reported span 0.347 and it does NOT reproduce (0.8346 at the same
  cell, minimum 0.7172) — and I had already published it in a commit and two files before checking.
  A skeptic's junction-degree numbers also could not be reproduced and were dropped. In the same
  pass, two of that skeptic's OTHER findings were completely right and fixed. Verify each one.
- ⚠️ **TRAP 10** — `vite preview` silently moves port if taken; use `--strictPort` on a dedicated port.
- ⚠️ **TRAP 11** — `git add -A src/` sweeps strays. Run
  `git ls-files --others --exclude-standard src/` before EVERY `git add`.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates. And `tsc`
  cannot catch a DROPPED parameter.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree.
- ⚠️ **TRAP 15** — a workflow phase can run long; prefer several small workflows.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. `format:'jpeg'`.
- ⚠️ **TRAP 17** — zsh does not word-split unquoted parameters. Write paths out, or use `${=T}`.
- ⚠️ **TRAP 18** — `npx vite-node` runs engine code outside the suite; imports from a /tmp or
  scratchpad harness must be **absolute**.
- ⚠️ **TRAP 19** — a fresh Chrome profile shows the first-run welcome, a MODAL `Dialog` whose
  `.dialog-scrim` swallows every synthesized mouse event. Dismiss it and assert
  `!document.querySelector('.dialog-scrim')` before driving anything.
- ⚠️ **TRAP 20** — a raw `window.dispatchEvent` is outside React's event system; go through `act()`.
- ⚠️ **TRAP 21** — jsdom dispatches a plain `Event` for pointer events, so `button`/`pointerId`/
  `clientX` arrive `undefined` and any guarded handler bails. Probe before writing a pointer test.
- ⚠️ **TRAP 22 (new, S31)** — **a live harness with a wrong selector reports PASS against
  pre-existing data.** S31's first §2c run printed `preset button found: null`, added nothing, and
  then asserted the rotation of a rect the DEMO shipped with — two vacuous PASSes. Gate every
  downstream assertion on "did the thing under test actually happen?", and make that guard itself a
  FAILING check when it did not.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained EIGHT entries in S31, and two
   backlog items changed status. Plus `docs/master-plan.md` (Session 31), `docs/ideas.md` §4c/§13e.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1543**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then **run the wrong answer past your
   own new tests.** S31's six negative controls were all caught (no holes) — and the self-review
   still found the one thing they could not: whether the FEATURE'S INPUT was stable. Budget for a
   lens that asks about inputs, not just outputs.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; **no real screen reader has
    ever been driven on this project**; touch is CDP emulation, not a physical device.

**The meta-lesson, from S31:** a feature can be correct, tested, negative-controlled AND
live-verified and still be unshippable — because tests check outputs and the fatal question was
about an INPUT ("is the plan's axis stable?"). When the premise fails on real data, revert and write
the spec; `docs/ideas.md` §4c is what that looks like.

---

## 2. YOUR TASK

### 2a. §4b — the explicit seat COMMAND (P1, ~½ session)

Unchanged and fully designed — read `docs/sessions/S23/spec-v1-REFUTED.md` §7 and
`spec-v2-CORRECTED.md`. Four parts, each with a trap already paid for:
`f`/`⇧F` with **the quarter turn applied AFTER the snap** (adding π/2 to the input of a nearest-π
snap is annihilated by it — write that test failing-first) · the Inspector button gated on
`role === 'furniture' || role === 'tv'`, NOT `role !== 'door'` (which also matches windows) · the
touch-HUD button · the on-canvas snap guide, NOT stroked with `wallKeptSpans`.
⚠️ `InspectorPanel.door.test.tsx:53` passes ten explicit props with no spread, so a required
eleventh breaks `tsc --noEmit` while `npm test` stays green.

**This is the cleanest P1 left and it does not depend on anything S31 touched.**

### 2b. §4c — creation-time alignment, second attempt (P1, needs its own measurement)

`docs/ideas.md` §4c has the full spec, every number from S31's attempt, and an explicit Acceptance
list. **Read it before writing a line.** The three things that killed the first attempt:
axis bistability on the owner's plan (one 4.6 m wall flips it 12.83°), Snap producing non-round
dimensions in a rotated frame, and `arrange.ts:169` being an unfixed third creation site.
Strongly consider the alternative named there: a **per-layout STORED axis** the user sets once,
which removes the instability by construction rather than by threshold.

### 2c. Others

`App.tsx` decomposition (**1290** lines against an 800 cap, P2) · the `scalePlan` annotation-stroke
gap (P2, deferred five times) · export-all bundle IMPORTER (P2, still write-only) · detection's
worst case (P2) · §13e's metric-scale redirect (P2, needs a calibrated-scale flow first) · §13c (P3)
· multi-tab folder loss (§10d) · `docs/ideas.md` §14f (three P3 gallery leftovers).

---

## 3. LIVE VERIFICATION

`docs/sessions/S31/{cdp.mjs,live-s31.mjs}` is a working zero-dependency harness (Node's built-in
WebSocket + fetch). `live-s31.mjs` is the one to copy for anything that creates scene objects — it
asserts a fresh profile, dismisses the first-run modal (TRAP 19), drives real
`Input.dispatchMouseEvent` drags in steps, and **reads the result back out of IndexedDB** rather than
from the DOM. Note its guard pattern after TRAP 22.

`docs/sessions/S30/live-s30.mjs` remains the reference for gallery/touch work (real
`Input.dispatchTouchEvent` streams, phone viewport). `docs/sessions/S28/live-owner-plan.mjs` is the
one for anything image-related: it feeds a real file through the app's OWN hidden file input, so the
image travels the full lossy chain.

`docs/sessions/S26/bench/owner-appchain.bin` (app-chain bytes, 685×900) and
`docs/sessions/S28/bench/owner-plan.png` (the original, 1320×1734) are where every detection
measurement should start. `docs/sessions/` is gitignored — copy what you need into your own
session directory.

---

## 4. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what
is real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
