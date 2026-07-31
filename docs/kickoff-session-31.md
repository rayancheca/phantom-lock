# KICKOFF — Session 31

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S30 finished the home screen.** All five S29 residuals (§14a–14e) are closed, and three defects
found underneath them are fixed — two of which were in the path S29 had designated as the
WCAG-compliant one. The owner-facing gallery work is **done**; its three leftovers are all P3.

**Baseline.** `main` is at the S30 merge: `npm test` **1536**, JS **500.75 kB / 163.20 kB gz**, CSS
**53.65 kB / 10.00 kB gz**, HTML 1.31 kB. All three gates green. No unlanded branch.

**`npm run test:coverage` is GREEN** — for the first time in the project's history, and verified
over four consecutive runs. If it goes red again the cause is almost certainly a test that has grown
past the 5 s per-test ceiling under v8 instrumentation. **The fix is ALWAYS to hoist the expensive
work to module scope** (evaluated during COLLECTION, which is not timeout-bound), never to raise
`testTimeout`. S30 did this four times; `detect.test.ts` had already done it four times before that.

**TEST COUNT IS A RATCHET** (…1407 → 1471 → **1536**). Never let it drop; no test may be newly
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
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet. S30 hit this: a test
  measured 2.2 s alone and 6.6 s under full parallel load, straddling the 5 s ceiling.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.** S30's reviewers were
  excellent and it still mattered: one HIGH was real and I had introduced it, one MEDIUM was a taste
  call I declined, and one claim about the CSP scanner was overstated (and is now corrected in
  `CLAUDE.md`). Two "passing" tests I wrote turned out to be vacuous and were deleted.
- ⚠️ **TRAP 10** — `vite preview` binds localhost and silently moves port if 4173 is taken. S30 found
  4173 already held by a stale server; use `--strictPort` on a dedicated port so a conflict is LOUD,
  and never measure against a `dist` you did not just build.
- ⚠️ **TRAP 11** — `git add -A src/` sweeps untracked strays into your commit. Run
  `git ls-files --others --exclude-standard src/` before EVERY `git add`.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates. Note the
  inverse too, learned in S30: **`tsc` cannot catch a DROPPED parameter** — a two-argument function
  is assignable where three are expected, so widening a callback's signature and forgetting one
  call site compiles clean and silently ignores the new argument.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree. S30's control agents were
  told to `rsync` to /tmp and did; they also correctly reported seeing MY in-flight edits appear
  mid-run, which is the same race from the other side.
- ⚠️ **TRAP 15** — a workflow phase can run long; prefer several small workflows.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. `format:'jpeg'`.
- ⚠️ **TRAP 17** — **zsh does not word-split unquoted parameters.** S30 lost a whole control run to
  this: `run() { npx vitest run $T; }` passed three paths as ONE argument, matched no file, and
  printed nothing — which looks exactly like "no failures". Write the paths out, or use `${=T}`.
- ⚠️ **TRAP 18** — `npx vite-node` is the way to run engine code outside the suite; imports from a
  /tmp harness must be **absolute**.
- ⚠️ **TRAP 19** — a fresh Chrome profile shows the first-run welcome, a MODAL `Dialog` whose
  `.dialog-scrim` swallows every synthesized mouse event. Dismiss it and assert
  `!document.querySelector('.dialog-scrim')` before driving anything.
- ⚠️ **TRAP 20** — a raw `window.dispatchEvent` is outside React's event system, so `fireEvent` does
  not wrap it and the state update is never flushed. Go through an `act()` helper.
- ⚠️ **TRAP 21 (new, S30)** — **jsdom dispatches a plain `Event` for pointer events.** `button`,
  `pointerId`, `pointerType` and `clientX` all arrive `undefined`, so any handler that guards on
  them bails and the gesture is never registered. Two S30 tests written against that state passed
  VACUOUSLY and were deleted. Before writing a pointer test, probe what actually arrives.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained SIX entries in S30 and the
   gallery architecture changed again. Plus `docs/master-plan.md` (Session 30), `docs/ideas.md`.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1536**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then **run the wrong answer past your
   own new tests.** S30's control pass found **5 holes in 21 controls**, including one total miss —
   and the self-review then found two contracts that mutation proved were untested. Budget for this
   explicitly; it is where the real defects came from both times.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three (and `test:coverage` is green
    now, so a regression there is a real finding rather than a known limitation).
11. **Evidence block.** State honestly: live checks run ONE browser; **no real screen reader has
    ever been driven on this project**; touch is CDP emulation through Chrome's real compositor, not
    a physical device.

**The meta-lesson, eight sessions old:** when you fix a bug, run the *other* wrong answer past your
new test. S30 adds a corollary: **check the container your test measures is the container the code
counts.** A test named for exactly the defect it was meant to catch was decorative, because it
asserted over 3 designs while the code capped on a 5-item mixed sequence.

---

## 2. YOUR TASK

The gallery is finished. The queue is back to detection and the older backlog.

### 2a. §13e — the refusal gates accept images with no floorplan (P1, ½–1 session)

**Unchanged, and now the head of the queue.** S29 reproduced it and archived the evidence
(`docs/sessions/S29/bench/13e-reproduction.txt` and the harness beside it); S30 did not touch it.

- **A page of four thin furniture OUTLINES** is offered **27/27** (stroke {3,5,7} × tone
  {26,90,150} × 3 UI levels) at structure up to **1.000** and confidence **1.00**, 16 walls.
- **A two-tone joined-corner page** leaks **12/12** at structure 0.333–0.667, confidence 0.77–0.93.
- For calibration: the lowest legitimate structures are `oblique-survey` @Careful **0.350**,
  `apartment-cluttered` @Thorough **0.375**, `apartment-rotated` @Careful **0.389**,
  `screened-poche` @Balanced **0.464** — i.e. the furniture page scores HIGHER than every
  legitimate fixture. `structure` cannot separate them.

**What will NOT work, already measured — do not rediscover it:** moving `MIN_STRUCTURE` (its first
step, 0.28, already refuses 13–24 readings of the owner's own plan) · `support` or `explained` (both
measured against the mask the pipeline itself produced; `no-plan-lines` scores **1.000 on both**) ·
total length or a challenger-side guard (both overlap the legitimate population).

**What is worth measuring, in order.** The missing signal is almost certainly *enclosure*: a
floorplan bounds ROOMS, four furniture outlines bound four furniture-sized boxes. `rooms.ts` already
flood-fills, and S25 made `segsCross` textbook-correct so it no longer leaks through walls.
Candidates: enclosure at BUILDING scale vs furniture scale · enclosed area over total wall length ·
whether the segment graph has cycles at all · the distribution of enclosed region areas.
**Calibrate against the enumerated corpus, not against the attacks** — the S18/S28 lesson, which has
now bitten three times in four sessions.

**Acceptance:** both null pages become fixtures and are refused at all three UI levels · no
legitimate corpus fixture refused, and `oblique-survey` (0.346) and `apartment-cluttered` (0.425)
specifically still accepted · the owner's plan unchanged at 9 / 15 / 24 walls (74 / 85 / 92 %),
verified LIVE · corpus mean holds ≥ 0.92.

### 2b. §4b — the explicit seat COMMAND (P1, ~½ session)

Unchanged, fully designed already — read `docs/sessions/S23/spec-v1-REFUTED.md` §7 and
`spec-v2-CORRECTED.md`. Four parts, each with a trap already paid for:
`f`/`⇧F` with **the quarter turn applied AFTER the snap** (adding π/2 to the input of a nearest-π
snap is annihilated by it — write that test failing-first) · the Inspector button gated on
`role === 'furniture' || role === 'tv'`, NOT `role !== 'door'` (which also matches windows) · the
touch-HUD button · the on-canvas snap guide, NOT stroked with `wallKeptSpans`.
⚠️ `InspectorPanel.door.test.tsx:53` passes ten explicit props with no spread, so a required
eleventh breaks `tsc --noEmit` while `npm test` stays green.

### 2c. Creation-time alignment (P1, small)

`App.tsx` and `SimCanvas.tsx` both hardcode `rotation: 0`, so on the owner's skewed plan **every new
rect arrives crooked** before any drag. Same helper as S23's magnet, ~2 call sites. Smallest change
with the biggest everyday effect. Re-grep the line numbers; S29 and S30 both moved them.

### 2d. `App.tsx` decomposition (P2)

**1290+ lines against an 800 cap.** Every new App-level concern has been pushed into `hooks/` to
avoid making it worse, which works but is not a fix. This needs its own session.

### 2e. Others

`docs/ideas.md` §14f (three P3 gallery leftovers, described there) · the `scalePlan`
annotation-stroke gap (P2, deferred four times — adding `thickness?:` moves `apartment-annotated` at
2.5× from 99.7 % to 91.7 %, so it needs its own commit) · export-all bundle IMPORTER (P2, still
write-only) · detection's worst case (P2) · §13c (P3) · multi-tab folder loss (§10d).

---

## 3. WHAT S30 DID, AND WHAT IT LEFT

**All five S29 residuals closed.** Focus survives every commit; Escape is a total four-rung ladder;
a design can be dragged out of a folder; a deleted folder's designs land on the home grid (owner
decision); and touch is **fixed**, not merely documented.

**Three defects found underneath the list, all in the WCAG-compliant path:**

1. Move mode stepped through DISPLAY space, where index `self` and `self+1` are the same outcome —
   so every subject wasted a keypress and the last position was unreachable. The existing test
   asserted the callback ARGUMENT and therefore froze the bug.
2. Fixing that broke the announcement: the live region formatted the now-inflated index, saying
   "Position 6" in a five-item grid. The caret is `aria-hidden`, so that sentence is the entire
   feedback channel for a non-visual user. Found by the a11y lens, not the correctness lens.
3. A click mid-move NAVIGATED instead of committing, which let the breadcrumb commit an `exit` for a
   design that had never been in the folder — announced as "Moved X out. Y was empty and is gone."

**Process that earned its keep:** the negative-control pass found **5 holes in 21 controls**
(including one total miss), and the self-review found **two contracts that mutation proved were
untested** — reverting one line each left all 1524 tests green. Both are now pinned.

**Left open, honestly:** `docs/ideas.md` §14f — the focus ladder's behaviour after a crumb-click
exit (adjudicated a taste call, not a defect), a `MAX_PROJECTS` undo no-op, and `useGalleryDrag`'s
58.9 % coverage, which is structural (TRAP 21).

---

## 4. LIVE VERIFICATION

`docs/sessions/S30/{cdp.mjs,live-s30.mjs}` is a working, copyable, zero-dependency harness (Node's
built-in WebSocket + fetch) covering 19 checks. **Copy `live-s30.mjs` for anything UI-interactive**
— it asserts a fresh profile, dismisses the first-run modal (TRAP 19), drives real
`Input.dispatchMouseEvent` drags in steps, drives real `Input.dispatchTouchEvent` streams with a
phone viewport, and instruments the pointer-event sequence so it can say WHY a gesture ended rather
than only that it did.

`docs/sessions/S28/live-owner-plan.mjs` remains the one to copy for anything image-related: it feeds
a real file through the app's OWN hidden file input, so the image travels the full lossy chain.

`docs/sessions/S26/bench/owner-appchain.bin` (app-chain bytes, 685×900) and
`docs/sessions/S28/bench/owner-plan.png` (the original, 1320×1734) are where every detection
measurement should start.

`docs/sessions/` is gitignored, so these are local-only — copy them into your session directory.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what
is real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
