# KICKOFF — Session 38

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

S37 decomposed the two oversized components against the project's own 800-line cap. **The App half
is done; the SimCanvas half is not**, and the residual is specified rather than left implicit.

| file | before | after |
|---|---|---|
| `components/app/App.tsx` | 1292 | **85** (boot wrapper) |
| `components/app/AppInner.tsx` | — | **707** ✅ |
| `components/canvas/SimCanvas.tsx` | 1447 | **1042** ❌ |

Eleven new modules; `run-command.ts` and `drag-apply.ts` are pure and reached **100 %** and
**98.08 %** coverage respectively, which matters because both cover logic that was UNREACHABLE from
`npm test` before — jsdom dispatches a plain `Event` for pointer events, so SimCanvas's entire
pointer path could only ever be checked by driving real Chrome (TRAP 21).

**The interesting part of S37 was not the refactor — it was how much of the risk lived in the
instruments rather than the code.**

* The behaviour differential's own base-vs-base control, on a byte-identical tree, returned **three
  divergences and two symmetric failures**. All five were the harness: a font-load repaint racing
  the capture, IndexedDB `getAll` returning records in random key order, and a sweep that selected a
  WALL when only rects and circles carry grips. A symmetric failure DIFFS EQUAL, so without the
  absolute `checks` array the run would have looked clean.
* Twenty-one negative controls were run against the new tests. All were eventually caught — but
  **three passed on the first attempt and every one was a hole in the TEST**, not a clean bill.
* Four adversarial review lenses produced 38 checked-clean verifications and 30 real findings. None
  was a behaviour change; all 30 were comment rot, vacuous assertions, or dead code — which is
  exactly what a mechanical move leaves behind. One of them corrected a factual error this session
  had already written into `CLAUDE.md`.

**Baseline.** `main` is at the S37 merge, pushed. `npm test` **1790**, JS **516.78 kB / 168.47 kB
gz**, CSS **54.90 kB / 10.24 kB gz** (hash `index-j_hTKTEs.css`, byte-identical since S36 — the
cleanest evidence that moving `import './app.css'` did not perturb the cascade), HTML 1.31 kB. All
gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1640 → 1706 → **1790**). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

**PUSH TO GITHUB** — standing owner instruction. Land session work on `main` via `--ff-only` and
`git push origin main` at the end of EVERY session. Verify with
`git rev-list --left-right --count origin/main...main` after fetching.

Traps 1–28 carry forward verbatim from the S37 kickoff. The ones S37 exercised hardest, plus three
new ones:

* ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
* ⚠️ **TRAP 6** — never `git stash` a partial revert. S37's 21 negative controls all ran in an
  `rsync`-ed copy at `/tmp/pl-nc` with a symlinked `node_modules`.
* ⚠️ **TRAP 9** — adjudicate every agent finding against the tree yourself. S37's review produced 30;
  all were real, but several were duplicates across lenses and two were already fixed by the round in
  flight. One claimed two mangled comments where only one was mine — the other was intentional prose.
* ⚠️ **TRAP 11** — `git ls-files --others --exclude-standard src/ public/` before EVERY `git add`.
* ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. It bit TWICE in S37: 47 tests
  passed while `tsc` was red on `target: 'selection'` (the union member is `'deselect'`) and
  `'homepodmini'` (it is `'homepod-mini'`). Vitest strips types with esbuild.
* ⚠️ **TRAP 15/24** — prefer several small workflows; agents die on usage limits. S37's 7-agent
  design workflow lost 2 that way and the surviving plan had to be adjudicated by hand.
* ⚠️ **TRAP 21** — jsdom dispatches a plain `Event` for pointer events (`button`/`pointerId`/
  `clientX` all `undefined`), so the SimCanvas pointer path is structurally untestable there. This is
  the whole argument for `pick.ts` below.
* ⚠️ **TRAP 22** — a harness that silently measures nothing reports a clean run. Every step must
  assert its own precondition AND there must be absolute checks, because a symmetric failure diffs
  equal.
* ⚠️ **TRAP 26** — an agent told to be read-only may still write. Say the tree is LIVE in the prompt,
  and run `git diff --stat` after every workflow.
* ⚠️ **TRAP 27** — a live harness reading persisted state must wait out the ~400 ms autosave debounce.
* ⚠️ **TRAP 28** — DESIGN/Build re-arms the WALL tool, so a canvas harness that does not explicitly
  arm Select is drawing, not selecting. Assert `aria-pressed === 'true'` before any probe.
* ⚠️ **TRAP 29 (new, S37)** — **never run `npm test` / `npm run build` / coverage while a CDP harness
  is driving.** S37 did, twice, and the fixed sleeps in the harness raced: three steps that a
  byte-identical tree had just passed started failing, which reads exactly like a regression. If you
  must work in parallel, write documentation, not code.
* ⚠️ **TRAP 30 (new, S37)** — do NOT put backticks or single quotes inside a `node -e '…'` shell
  string. It cost three separate mangles: a shell-expanded backtick silently deleted a word from a
  comment, and stripped quotes turned `mode === 'marquee'` into `mode === marquee`. Write the script
  to a file and run `node file.mjs`.
* ⚠️ **TRAP 31 (new, S37)** — a line-range splice that searches forward for a closing token will
  overrun a ONE-LINE effect. `useEffect(() => repaintOnFontLoad(bump), []);` ends in `, []);`, not
  `}, []);`, so a search for the latter ran on and swallowed two following blocks. tsc caught it;
  assert the moved blocks are present exactly once afterwards.

Commit a baseline, then again after the gate. Land with
`git -C <REPO> merge --ff-only <branch>`, then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0), including the push.
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained nine entries in S37, and most are
   about instruments rather than code. Plus `docs/master-plan.md` (Session 37), `docs/ideas.md` §18.
3. **Orchestrate.** Heavy → multi-agent Workflow. Heavy = changes a data model, touches persistence,
   touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to `<block>`".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below 1790. Paste the
   coverage line for every file you touch. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then run the wrong answer past your own
   new tests — and **check each control fails the test written FOR it**. S37 ran 21; three passed
   first time and all three were holes in the tests.
9. **Data safety.** Fresh headless-Chrome profile (= fresh origin = its own IndexedDB) for live work;
   never touch the owner's layouts. Assert it.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project; touch is CDP emulation, not a physical device.

## 2. YOUR TASK — §18a, finish the SimCanvas decomposition

Full specification with line ranges in `docs/ideas.md` §18a. In short:

**`canvas/pick.ts` — the pointerdown ladder (~190 lines). DO THIS FIRST IN THE SESSION, NOT LAST.**
`onPointerDown` is a twelve-branch ladder mixing decision with side effects (`startDrag`, `onScene`,
`onSelection`, `setBandBoth`, `calibRef`). Turning it into `resolvePointerDown(...) -> PickAction`
makes it unit-testable for the first time. It is also where the S36 grip-vs-pod hit-test ORDERING
lives — grips are tested BELOW the node and seat tests, and `drawHandles` paints below `drawNodes` to
match — which is currently an invariant with a comment and no test.

S37 deferred it deliberately, not for lack of lines: it is the most-used interaction path in the app,
an action union is a redesign rather than a move, and it deserves its own differential rather than
the tail end of a long session. That is why it goes first.

**`canvas/chain.ts` — the wall chain (~55 lines).** `CLOSE_RADIUS`, `ANGLE_SNAP_DEG`, `angleSnap`,
`snapTargets`, `addChainPoint`, and the cursor-preview arm of `applyMove`. The `chainWallsRef`
bookkeeping stays put — one id-group per appended corner is what makes Backspace pop exactly the
walls that corner added.

**Acceptance.** SimCanvas < 800 · every branch of the pointerdown ladder has a test · negative
controls run and each caught by the test written for it · the differential re-run base-vs-head comes
back identical · ratchet respected · suppression count stays at 6.

**Two known gaps in S37's own work, worth closing while you are in these files:**

1. **`DragApplyOptions` is the one thing whose SHAPE changed**, and nothing tests the WIRING. The
   handle/move-rc branches used to read `native.shiftKey` / `native.altKey` / `settings.snap`
   directly at the SimCanvas call site; they now arrive through an options object. The wiring was
   verified by hand against `git show e379395:` and is correct — but six mutations of it survive the
   entire 1790-test suite, because the tests test the function and not the call site. `pick.ts` gives
   you the seam to fix this properly.
2. **Three of the four new canvas modules ship with no unit tests of their own** (`useCanvasCamera`,
   `useCanvasPainter`, `CanvasOverlays`). The first two are jsdom-hostile by nature — no canvas
   pixels, no layout — which is precisely why the CDP differential exists. `CanvasOverlays` is
   ordinary presentational JSX and could take an axe test cheaply.

**If §18a lands early**, the rest of the queue is §15b (per-room furniture quotas, P2), §4d (the ⇧F
quarter turn, fully specified with S32's measurements), §16b, §10b (the export-all bundle IMPORTER —
still write-only, so the backup users are told to make cannot be restored), §10d, §2d, §13e's
metric-scale redirect, and the owner-approved read-only 3D view (§5, plan in `docs/3d-view-plan.md`,
bundle size explicitly does not matter).

## 3. LIVE VERIFICATION

`docs/sessions/S37/` holds the reusable instrument and it is the one to copy:

* **`diff-harness.mjs`** — the BEHAVIOUR DIFFERENTIAL. Serves two `dist` directories on two ports,
  drives both through one fixed 36-step script in real headless Chrome, and diffs a signature after
  every step: an FNV hash of the canvas bitmap (which, because `renderScene` is a pure function of
  `RenderState`, pins scene + selection + trace + audio + bestSpot + preview + chain + proposal +
  snapGuide + handleTarget + theme + view in one number, and is id-independent), the spec-sheet
  metrics (engine output as text), both aria-live regions, the DOM state, and a canonicalised dump of
  the persisted IndexedDB store. **Run base-vs-base first as a control, and run it with NOTHING else
  on the machine (TRAP 29).**
* **`shots.mjs`** — screenshots, both canvas themes plus ≤960 px and 390 px.
* **`cdp.mjs`** — zero-dep, Node's built-in WebSocket + fetch, fresh Chrome profile per run.

`docs/sessions/` is gitignored — copy what you need into your own session directory.

**Kill your harness processes at the end.** Target them by their `T/pl-s21-` profile prefix, never by
a broad `pkill -f "remote-debugging-port"`, which can reach the owner's real browser.

## 4. FINISH

Paste the literal gate tails. Run the self-review, wait for every agent (TRAP 15), adjudicate each
finding against HEAD, fix what is real and record what you rejected and why. Run `git diff --stat`
after every workflow (TRAP 26). Update `CLAUDE.md`, `docs/ideas.md` and the `docs/master-plan.md`
progress log with a full Evidence block. Commit on the session branch, land on `main` via
`--ff-only`, and `git push origin main` — standing owner instruction, do not skip it. Then write the
NEXT kickoff, re-stating this protocol in full.
