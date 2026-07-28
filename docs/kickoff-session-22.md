# KICKOFF — Session 22: auto-detect walls, the accuracy overhaul (the last P0)

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Why this one

`docs/ideas.md` §1 is now the **only remaining P0**, and it is the one thing in the app the owner has
personally found broken by using it: auto-detect walls on a real floorplan photo produces a spidery,
duplicated, non-orthogonal tangle. Everything else on the backlog is additive; this is a feature that
exists and lies.

S21 shipped the guided tour, which raises the stakes: the tour's `build-photo` step tells a first-timer
that importing a floorplan photo and tracing over it "is the fastest way to get your actual home in
here". Auto-detect sits directly behind that promise. A tutorial that routes people into a broken
feature is worse than one that never mentioned it.

A detailed diagnosis already exists — `docs/kickoff-session-12.md`, plus the root-cause analysis in
`docs/master-plan.md` §"Session 12" against `src/engine/detect.ts` (global Hough on filled walls, no
skeletonization, grazing diagonals, furniture blobs kept, no global regularization). **Read both before
planning, and do not redesign from scratch without saying why.**

If the owner would rather have something smaller and additive, the honest alternatives in backlog order
are: snap-furniture-to-a-wall's-angle (P1, `ideas.md` §4) · the export-all bundle IMPORTER (P2, §10b —
the "storage-agnostic safety net" in `db.ts`'s header is still write-only) · multi-tab folder loss (P2,
§10d) · `ideas.md` §2d (the last wall-heavy CPU residual, 12–14 s → <10 s) · or an `App.tsx`
decomposition session (see the honest residual below — it is 1234 lines against a 800 cap).

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO (source of truth): `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Create a fresh
per-session worktree branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. Confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST and pass worktree-relative paths to Read/Edit/Write, or your edits
  land in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** `npm install` first.
- ⚠️ **TRAP 3 — the shell cwd persists between Bash calls.** Prefer absolute paths.
- ⚠️ **TRAP 4 — `.claude/launch.json` is TRACKED.** Do not overwrite it; its `autoPort: true` stops your
  dev server stealing the owner's :5173.
- ⚠️ **TRAP 5 — verify by OBSERVATION, not API readback.** For anything persisted: seed the OLD shape,
  load it, and assert what came back — never just assert what you wrote.
- ⚠️ **TRAP 6 — `git stash` a partial revert and the pop may never run.** If you stash, pop in a SEPARATE
  command and verify with `git stash list` + `git diff --stat`.
- ⚠️ **TRAP 7 — never assert wall-clock in the suite.** S18 had a 10 s assertion pass under `npm test`
  and fail at 10.18 s under `npm run test:coverage`. Assert deterministic integers; keep timings in
  `docs/sessions/<S>/`.
- ⚠️ **TRAP 8 — background agents make the machine noisy.** Any performance number measured while a
  review Workflow is running is ~15 % pessimistic. Re-measure quiet before writing a number into source.
- ⚠️ **TRAP 9 — a reviewer agent reads the tree at the moment it starts.** Freeze the tree while a review
  is in flight, or tell every reviewer the exact commit SHA and have the verifier adjudicate against
  HEAD. S21 did the latter and it worked; three S20 reviewers reported findings two commits had already
  fixed.
- ⚠️ **TRAP 10 — `vite preview` binds `localhost`, not `127.0.0.1`.** A CDP harness pointed at
  `http://127.0.0.1:<port>` gets connection-refused while `curl localhost` returns 200.
- ⚠️ **TRAP 11 (new, S21) — workflow agents write scratch files into `src/`.** Three separate agents left
  `zz-probe.test.ts` / `zz-tour-probe.test.ts` / `zzskeptic.test.ts` in the tree during S21. They would
  have been committed and counted toward the ratchet. Run `git status --short` before EVERY commit.

Commit a baseline, then again after the gate passes. Land with
`git -C <REPO_ROOT> merge --ff-only <branch>` then `git -C <REPO_ROOT> push origin main`. Commit messages
end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. **Put the message in a file and use
`git commit -F`** — backticks in a `-m` string get shell-expanded (hit in S19).

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and
PASTE the literal tails. Baseline as of 2026-07-28 (post-S21): **lint 0 · 1082 tests · 448.23 kB /
144.87 kB gz**. TEST COUNT IS A RATCHET (…814 → 961 → **1082**) — it must never drop, and no test may be
newly skipped/`.only`'d/weakened.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file), `docs/master-plan.md` (protocol + the S21 entry),
   `docs/ideas.md` §1, `docs/kickoff-session-12.md`. Map every site before touching it.
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). A task
   is heavy if it changes a data model, touches persistence, touches `src/engine`, deletes/overwrites
   data, or edits more than one file. **Auto-detect is squarely in `src/engine` and is heavy by
   definition.** Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. Report each verdict. On this project skeptics
   have caught data-loss bugs, a DoS estimate wrong by two orders of magnitude, a runtime crash for
   100 % of returning users hiding behind a "required" type, an infinite render loop no scene-level test
   could see, and (S21) a tutorial whose climax was silently dead on every run after the first.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>".
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure
   behaviour, never let the count drop below 1082. Run `npm run test:coverage` (scoped to `src/**`);
   paste the coverage line for every file you touched (≥80 %, or state the exact reason). Vite routes by
   FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.** Seed a pre-migration store/record and assert it upgrades
   correctly on read — not just that a fresh write round-trips.
8. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a domain
   reviewer) over the ACTUAL diff, then an adversarial verifier over their findings. Fix everything real,
   then re-verify. Prefer plain-text returns for reviewer agents.
9. **Data safety.** Export-all before any live test that writes persistence; test on a disposable
   DUPLICATE, and prefer a FRESH headless-Chrome profile (fresh origin ⇒ own IndexedDB). NEVER delete the
   owner's layouts. A migration that cannot be reverted must not be run.
10. **Verification gate — proven, not paraphrased.** Paste the literal tails of `npm run lint`,
    `npm test` (with count) and `npm run build` (with gz size). Any red = not done.
11. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count ·
    pasted gate output · saved screenshot paths · each Acceptance bullet → met/deferred. State honestly:
    live checks run ONE browser; no real screen reader has ever been driven.

## 2. YOUR TASK

### 2a. Read the diagnosis, then re-measure it

`docs/kickoff-session-12.md` and the master-plan's Session 12 section name five root causes in
`src/engine/detect.ts`. **Verify each against the real code and a real image before designing** — that
analysis predates several sessions and has never been re-checked. Build a corpus of floorplan images
FIRST (the owner's own photo is the one that matters; synthetic ones are for regression), and get a
baseline number for "how wrong is it today" that a later change can be measured against.

### 2b. The bar

Auto-detect does not need to be perfect — it needs to produce walls a human would rather EDIT than
delete. Define that as a measurable score before you optimize, or you cannot tell whether a change
helped. Wall count, orthogonality, duplicate-segment rate and endpoint-connectivity against a
hand-traced ground truth are all reasonable; pick and justify.

### 2c. The constraints that are NOT negotiable

- `detect.ts` has a pure, DOM-free core that is testable without a browser. **Keep it that way** — that
  property is what makes this session's work provable at all.
- The frozen engine set is `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot,reflection,grid}.ts`.
  `detect.ts` is NOT in it and is yours to change; the other eight are not. If you believe you must touch
  one, say so explicitly and get a skeptic to agree first.
- Do not regress: S7 a11y, S13–S16 design system, S8 security posture (CSP, `importRejection`), the S18
  grid cap, S19's bit-identity (`reflection-golden.json` / `legit-golden.json` must stay green), S20's
  folder invariants, or S21's tutorial (`steps.test.ts`'s coverage test will fail if you add a tool
  without a tutorial step — that is working as intended, add the step).
- A detection change that silently reshapes an EXISTING layout is a data-loss bug. Detection output is a
  proposal (`wallProposal`) the user confirms; keep it that way.

### 2d. Scope guard

Auto-detect is a computer-vision problem and it is easy to spend a session on a rabbit hole. If the
measured score says a smaller fix (better preprocessing, or simply rejecting a bad detection and telling
the user rather than emitting a tangle) gets most of the value, **ship that and say so** — "it now
refuses instead of lying" is a legitimate, honest outcome for one session, and better than a half-built
skeletonizer.

## 3. ACCEPTANCE

- A measurable accuracy score exists, with a baseline for the CURRENT implementation and an after number.
- The owner's real floorplan photo produces a materially better result, demonstrated with before/after
  screenshots.
- Detection either produces usable walls or REFUSES with a clear explanation — it never emits a tangle
  silently.
- New pure logic is failing-first tested; the ratchet rises above 1082.
- Gate green: lint 0 · ≥1082 tests · build clean, all three tails pasted.
- Live: screenshots saved to `docs/sessions/S22/`. No saved artifact = the live check did not happen.

## 4. LIVE VERIFICATION

Drive a FRESH headless-Chrome profile. **`docs/sessions/S21/cdp.mjs` + `shoot.mjs` are a working,
copyable, zero-dependency harness** (Node 25's built-in WebSocket + fetch; fresh `--user-data-dir` ⇒
fresh origin ⇒ the owner's real Maple Court layout is never loaded or written). Its recipe traps, already
handled in that file: `--headless=old` + `--window-size` at launch (the new compositor deadlocks
`captureScreenshot`), JPEG not PNG (Node's built-in WebSocket silently drops a multi-MB frame), and
`localhost` not `127.0.0.1` for `vite preview`. Note `docs/sessions/` is gitignored, so those files exist
only in the S21 worktree — **copy them into your session directory before the worktree is pruned.**

To seed a disposable store, navigate to a same-origin BLANK page first,
`indexedDB.deleteDatabase('phantom-lock')`, set `localStorage['phantom-lock:v2']`, THEN navigate to the
app — booting the app first writes the demo into IDB and your localStorage seed is ignored (hit in S17
and S19).

## 5. FINISH

Paste the literal gate tails. Run the self-review + verifier over the ACTUAL diff; fix everything real;
re-verify. Update `CLAUDE.md` (commands/ratchet/bundle size, architecture, any new hard-won lesson),
`docs/ideas.md`, and the `docs/master-plan.md` progress log with a full Evidence block. Commit on the
session branch, land on `main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full.
