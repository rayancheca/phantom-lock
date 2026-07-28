# KICKOFF — Session 23

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Where the project is

S22 closed the **last P0**. Auto-detect walls went from a spidery tangle (52.1 % on the new corpus,
61 hallucinated walls on an image containing no floorplan) to **95.6 % and a refusal**, with a
reviewable proposal; and the owner-requested **"Generate a design"** shipped — eight archetypes,
seeded and deterministic, 88 % of designs opening on a locked stereo pair.

**There is no P0 left.** Everything remaining is additive, and the honest ordering is below.

Baseline as of 2026-07-28 (post-S22, `main` @ `05febbb`):
`npm run lint` 0 · `npm test` **1316** (66 files) · `npm run build` **476.00 kB / 154.75 kB gz** JS
+ **51.55 kB / 9.56 kB gz** CSS + 1.31 kB HTML.

**TEST COUNT IS A RATCHET** (…814 → 961 → 1084 → **1316**). It must never drop, and no test may be
newly skipped / `.only`'d / weakened.

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO (source of truth): `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Create a fresh
per-session worktree branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. Confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST and pass worktree-relative paths to Read/Edit/Write, or your edits
  land in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** `npm install` first.
- ⚠️ **TRAP 3 — the shell cwd persists between Bash calls, and a tool result can RESET it.** S22 lost
  two commands to this: a `python3` heredoc ran against the main checkout after the cwd silently
  reverted. Prefer absolute paths, or re-`cd` in every command that writes.
- ⚠️ **TRAP 4 — `.claude/launch.json` is TRACKED.** Do not overwrite it; its `autoPort: true` stops your
  dev server stealing the owner's :5173.
- ⚠️ **TRAP 5 — verify by OBSERVATION, not API readback.** For anything persisted: seed the OLD shape,
  load it, and assert what came back — never just assert what you wrote.
- ⚠️ **TRAP 6 — `git stash` a partial revert and the pop may never run.** If you stash, pop in a SEPARATE
  command and verify with `git stash list` + `git diff --stat`. To re-measure a PRE-change baseline,
  `cp` the new file aside, `git checkout <sha> -- <file>`, measure, `cp` back — each step its own
  command, each verified with `git status`. S22 did exactly this to re-measure the old detector.
- ⚠️ **TRAP 7 — never assert wall-clock in the suite.** It has now bitten twice. S18 had a 10 s assertion
  pass under `npm test` and fail at 10.18 s under `npm run test:coverage`; S22 had a test that
  re-detected the whole corpus pass under `npm test` and TIME OUT under coverage. Assert deterministic
  integers, and hoist expensive shared work to module scope rather than raising a timeout.
- ⚠️ **TRAP 8 — background agents make the machine noisy.** Any performance number measured while a
  review Workflow is running is ~15 % pessimistic. Re-measure quiet before writing a number into source.
- ⚠️ **TRAP 9 — a reviewer agent reads the tree at the moment it starts.** Freeze the tree while a review
  is in flight, or tell every reviewer the exact commit SHA and adjudicate against HEAD. S22's reviewers
  correctly flagged uncommitted docs as "missing"; that was a timing artifact, not a defect. Read every
  finding before acting — but check each one against the tree yourself.
- ⚠️ **TRAP 10 — `vite preview` binds `localhost`, not `127.0.0.1`.** A CDP harness pointed at
  `http://127.0.0.1:<port>` gets connection-refused while `curl localhost` returns 200.
- ⚠️ **TRAP 11 — workflow agents write scratch files into `src/`.** Run `git status --short` before
  EVERY commit. (S22's agents were clean; S21's were not.)
- ⚠️ **TRAP 12 (new, S22) — a green `npm test` proves nothing about types.** Vitest strips types with
  esbuild. A `Partial<ComponentProps<...>>` in a test widened `vi.fn()` to a plain function and
  `mockClear` stopped type-checking; only `npm run build` saw it. Run all three gates.

Commit a baseline, then again after the gate passes. Land with
`git -C <REPO_ROOT> merge --ff-only <branch>` then `git -C <REPO_ROOT> push origin main`. Commit messages
end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. **Put the message in a file and use
`git commit -F`** — backticks in a `-m` string get shell-expanded.

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and
PASTE the literal tails.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file — its "Hard-won lessons" list gained eight entries in S22),
   `docs/master-plan.md` (protocol + the S22 entry), `docs/ideas.md`. Map every site before touching it.
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). A task
   is heavy if it changes a data model, touches persistence, touches `src/engine`, deletes/overwrites
   data, or edits more than one file. Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. On this project skeptics have caught data-loss
   bugs, a DoS estimate wrong by two orders of magnitude, a runtime crash for 100 % of returning users
   hiding behind a "required" type, an infinite render loop, a tutorial whose climax was silently dead,
   and (S22) a detector that returned **ZERO walls** for any plan photographed 8–26° off-square, which
   the corpus could not see because it rotated by 4°.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>".
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure
   behaviour, never let the count drop below **1316**. Run `npm run test:coverage`; paste the coverage
   line for every file you touched (≥80 %, or state the exact reason). Vite routes by FILENAME:
   `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.** Seed a pre-migration record and assert it upgrades on read.
8. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a domain
   reviewer) over the ACTUAL diff, then adjudicate each finding against HEAD yourself. Fix everything
   real; record what you deliberately did NOT fix, and why.
9. **Data safety.** Export-all before any live test that writes persistence; prefer a FRESH
   headless-Chrome profile (fresh origin ⇒ own IndexedDB). NEVER delete the owner's layouts.
10. **Verification gate — proven, not paraphrased.** Paste the literal tails of all three gates.
11. **Hand off with an Evidence block.** State honestly: live checks run ONE browser; no real screen
    reader has ever been driven on this project.

## 2. YOUR TASK — pick ONE, in this order

The queue, honestly ordered. Ask the owner if they have a preference; otherwise take **2a**.

### 2a. Snap furniture to a wall's angle — P1 (`docs/ideas.md` §4, ~½ session)

The oldest unaddressed P1 and the one that shows up in ordinary use: dragging a sofa against an angled
wall leaves it visibly off-axis, and the user has to rotate by hand. S22 made angled walls much more
common — the generator's `l-notch` shape variant deliberately produces chamfered corners, and detection
now PRESERVES a genuine 30° wall instead of flattening it. So this is more visible than it was.

Note `canvas/placement.ts` already owns `snapPoint`/`surfaceHeightAt`/`placeSpeakerAt` and is pure and
node-tested — that is where the angle snap belongs, not in `SimCanvas`.

### 2b. The export-all bundle IMPORTER — P2 (`docs/ideas.md` §10b, ~½ session)

`db.ts`'s header calls the export bundle a "storage-agnostic safety net", and it is still WRITE-ONLY:
`buildExportBundle` (version 2, carrying each layout's project NAME) has no reader. A backup you cannot
restore is not a backup. This is the highest-value P2 because it closes a claim the code already makes.

### 2c. Measure detection's worst case — P2 (`docs/ideas.md` §12, new in S22)

S22's self-review raised a real shape without a reproduction: nothing caps how many candidate segments
reach `regularize`, and `mergeCollinear`/`joinCorners`/`structureScore` degrade toward O(n²). No cap was
added deliberately — S18's lesson is that a cap calibrated against a subset is a data-loss bug. Build
the adversarial images, measure, write the number into `docs/security.md` beside the engine's, and only
then decide whether a bound is needed.

### 2d. `App.tsx` decomposition — P2

It is **1290 lines** against an 800-line cap and has been over it since S5. S21 and S22 both added their
logic to `hooks/` for exactly this reason (`useTutorial`, `useWallDetection`, `useGenerateDesign`), which
works but leaves the file itself untouched. A dedicated session could take the remaining orchestration
out.

### 2e. The read-only 3D view — P2 (`docs/3d-view-plan.md`)

Owner-approved Three.js: *"bundle size does NOT matter, cool matters."* Must be read-only and touch
nothing else. Note it needs `worker-src`/`connect-src` loosened in `src/security-headers.ts` — the
intended values are already recorded there as `FUTURE_LOOSENING`, and the drift test will fail until
`public/_headers` and `vercel.json` match.

## 3. THINGS S22 LEFT ON THE TABLE (small, honest, pick up in passing)

- **Detection has never been run against the owner's OWN floorplan photo.** Every accuracy number is
  from the synthetic corpus. The harness takes one directly:
  `npx esbuild docs/sessions/S22/bench/score-corpus.ts --bundle --platform=node --format=esm
  --outfile=/tmp/b.mjs && node /tmp/b.mjs --image <file.png>`. If the owner supplies a photo, run it
  FIRST — it is the only measurement that can still surprise us.
- Two corpus fixtures sit below 92 %: `hatched` (91.6 %) and `apartment-cluttered` (82.3 %). Both lose
  precision or coverage rather than duplicating.
- 12 % of generated designs ship with no speakers and land on the existing "Nothing to analyze yet"
  empty state. Honest, but a line saying *why* would be better than silence.
- The generator's first-reflection-absorber layer never fires, because furniture is placed before
  speakers (deliberate — `fits()` cannot see speakers). A second arrange pass after the pair lands
  would recover it.

## 4. LIVE VERIFICATION

Drive a FRESH headless-Chrome profile. **`docs/sessions/S22/{cdp.mjs,shoot.mjs,live.mjs,live-detect.mjs}`
are a working, copyable, zero-dependency harness** (Node 25's built-in WebSocket + fetch). `live.mjs`
and `live-detect.mjs` are worked examples: they drive the gallery, a dialog, a file input and the canvas,
and assert 15 named checks. Recipe traps already handled there: `--headless=old` + `--window-size` at
launch, JPEG not PNG, `localhost` not `127.0.0.1`, and `--remote-debugging-port=0` read back from
`DevToolsActivePort` so you provably attach to the process you just spawned.

`docs/sessions/` is gitignored, so those files exist only in the S22 worktree — **copy them into your
session directory before that worktree is pruned.**

To feed the app an image without leaving the browser, paint it onto a canvas in the page, `toBlob` it
into a `File`, and set it on the app's own hidden `input[type=file]` via `DataTransfer` — that way the
image travels the real `buildUnderlay` path rather than being injected past it. `live-detect.mjs` does
exactly this.

## 5. FINISH

Paste the literal gate tails. Run the self-review + adjudicate every finding against HEAD; fix what is
real, record what you deliberately did not fix and why. Update `CLAUDE.md`, `docs/ideas.md`, and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full.
