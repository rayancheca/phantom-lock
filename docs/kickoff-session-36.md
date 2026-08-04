# KICKOFF — Session 36

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S35 closed the last two responsive defects, and the interesting part is how badly the first
measurement described them.**

- **§17b was filed with a 21-point sweep** across `.room-trigger` reporting "0.143 reachable at
  390 px". That number cannot decide its own question: the sample pitch at 390 px is 8.7 px and
  SC 2.5.8's threshold is 24 px. Re-measured as the widest CONTIGUOUS unoccluded run at 1 px
  resolution, the answers became verdicts — **0 px at 320** (entirely hidden, and it is the first
  Tab stop, so SC 2.4.11 too) and **22 px at 390** (fails 2.5.8 by 2 px). Now ≥40 px everywhere.
- **The root cause was one level up from where it looked.** `.room-trigger` is a flex item with
  `min-width: auto`, so its automatic minimum is its MIN-CONTENT — and the name is `nowrap`. The
  button measured **exactly 174.8 px at 560, 640, 760, 860 AND 1440**: it never shrank anywhere, and
  the ellipsis already on the name could never engage.
- **Reachability is not monotonic in width.** 561 px measured 27 px against 430 px's 46 px, because
  the wordmark returns there. A sweep over round phone widths misses it entirely.
- **§17c was wrong about the offender AND the condition.** It blamed the toolbar rail; every one of
  those elements is clipped by `.toolstrip`'s own scroller and contributes nothing. The real cause
  put the gallery's **Close button entirely off-screen** at 320 and 390 — SC 1.4.10, on the only
  pointer exit from the gallery.
- **The obvious lever was worth zero px.** Hiding the `.segment-label` spans — which were literally
  the blockers — frees nothing, because the switch is `width: min(300px, 40vw)` and never depended
  on its labels.

**Baseline.** `main` is at the S35 merge. `npm test` **1640**, JS **506.04 kB / 165.05 kB gz** (byte-
identical to S34 — S35's diff is CSS and comments), CSS **54.75 kB / 10.21 kB gz**, HTML 1.31 kB.
All gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1560 → 1615 → 1628 → **1640**). Never let it drop; no test may be
newly skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

**PUSH TO GITHUB — standing owner instruction, restated verbatim in S34: *"make sure youre pushing
to github."*** Land session work on `main` via `--ff-only` and `git push origin main` at the end of
EVERY session, and push the kickoff you write too. Never leave work committed only locally.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install`, or symlink.
- ⚠️ **TRAP 3** — **the shell cwd persists between Bash calls, including across a `cd` into /tmp.**
  Absolute paths, always. (S34 hit the zsh variant: `set --` inside a `for` loop silently broke
  `$1`/`$2` and six measurements reported "failed" that had never run.)
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole tree to /tmp and patch THERE.
  S34's baseline comparison was `rsync -a --exclude node_modules --exclude .git` + a symlinked
  `node_modules` + `git show <base>:<file> >` the touched files + a second `vite --port` — that is
  the whole recipe, it takes two minutes, and it turned two panics into two filed defects.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.** S34's audit produced
  6 refutations, ALL of which were corrections to other agents' overstatements rather than to the
  main thread's facts. Its self-review produced 10 findings of which 3 were already fixed, 2 were
  refuted, 1 was pre-existing, and 4 were real.
- ⚠️ **TRAP 10** — `vite preview` silently moves port if taken; use `--strictPort`.
- ⚠️ **TRAP 11** — `git add -A src/` sweeps strays. Run
  `git ls-files --others --exclude-standard src/ public/` before EVERY `git add`. **Include
  `public/`** — S34's self-review reported an agent scratch file left there, and Vite copies
  `public/` verbatim into `dist/`, so a stray there SHIPS. `docs/sessions/` is gitignored, so
  `git add docs/sessions/...` fails loudly — that is working as intended.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree. **And the inverse, new in
  S34:** an agent reading a tree you are actively editing will report YOUR in-progress edits as
  contamination ("a sibling agent wrote into the REAL tree"). Say in the prompt that the tree is live.
- ⚠️ **TRAP 15** — a workflow phase can run long; prefer several small workflows. S34's design pass
  took 20 minutes and landed after the fix was already implemented and verified; its self-review's
  fourth agent landed 40 minutes after the first commit. Read `journal.jsonl` and keep working — but
  do NOT close the session until the stragglers are in, because the 400 % zoom regression came from
  the last agent to report.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. `format:'jpeg'`.
- ⚠️ **TRAP 17** — zsh does not word-split unquoted parameters; quote `--include=*.test.tsx`.
- ⚠️ **TRAP 18** — `npx vite-node` runs engine code outside the suite; imports from a /tmp or
  scratchpad harness must be **absolute**.
- ⚠️ **TRAP 19** — a fresh Chrome profile shows the first-run welcome, a MODAL `Dialog` whose
  `.dialog-scrim` swallows every synthesized mouse event. **The dismiss button is "Start exploring"
  and it renders OUTSIDE `.dialog`.** Assert `!document.querySelector('.dialog-scrim')` before
  driving anything.
- ⚠️ **TRAP 20** — a raw `window.dispatchEvent` is outside React's event system; go through `act()`.
- ⚠️ **TRAP 21** — jsdom dispatches a plain `Event` for pointer events, so `button`/`pointerId`/
  `clientX` arrive `undefined` and any guarded handler bails. Directly load-bearing for §16.
- ⚠️ **TRAP 22** — **a live harness with a wrong selector reports PASS against pre-existing data.**
  Gate every downstream assertion on "did the thing under test actually happen?", and make that guard
  itself a FAILING check. S34's harnesses aborted on their own guards three times (welcome modal
  still up · gallery did not open at 390px · horizontal overflow) instead of reporting vacuous passes
  — that is the behaviour you want, and the third one turned out to be a pre-existing defect that
  needed reframing from `fail()` to "assert it has not MOVED".
- ⚠️ **TRAP 23** — a parameter sweep can be arithmetically incapable of expressing the bug.
- ⚠️ **TRAP 24** — agent workflows can die mid-run on a session/weekly usage limit. Read
  `journal.jsonl` directly rather than waiting on the summary, and SAY SO in the handoff when a
  verification pass was partial. (S33 lost 4 of 6 understanding agents and both skeptics. **S35 lost
  9 of 12** — the entire design/judge/skeptic half of its design workflow — and the session was
  finished by measuring in the main thread instead. That is a legitimate recovery; SAY it in the
  handoff, and prefer several small workflows so one limit does not take the whole plan.)
- ⚠️ **TRAP 25 (new, S34)** — **the Browser pane's `preview_start` server can die mid-session and
  its tools can hang on "Policy check in progress"**. When either happens, fall back to the repo's
  own zero-dep CDP harness (`docs/sessions/S32/cdp.mjs`) — it is the proven path here and it gives
  you a fresh profile per run, which is also the data-safety story.

- ⚠️ **TRAP 26 (new, S35)** — **a read-only agent may still write to your worktree.** An S35
  self-review lens ran its negative controls by patching the real `app.css` and restoring it; I
  caught `@media (width <= 360px)` in a file-modified notice mid-edit. Nothing was lost (`git diff`
  proved the file byte-identical to HEAD) but the race was real and the prompt said read-only in
  bold. Either point measurement agents at a COPIED tree or give them no write tool, and run
  `git diff --stat` after every workflow before trusting your own file state.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0), including the push.
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained TEN entries in S35, several of
   which are about measurement method rather than CSS. Plus `docs/master-plan.md` (Session 35),
   `docs/ideas.md` §16, §15b, §4d, §17b-i.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
   **Prefer several small workflows** — S35 lost 9 of 12 agents in one big one to a usage limit.
4. **Adversarially verify — ALWAYS**, then adjudicate (TRAP 9). S35's self-review produced 17
   findings; 8 were real and one was a HIGH the main thread had missed entirely.
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new behaviour; never below **1640**. Paste the
   coverage line for every file you touch. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then **run the wrong answer past your
   own new tests** — and check each control fails the test written FOR it. Then go looking for the
   controls you did not think of: S35's first eight all passed that bar and self-review found **six
   more that slipped through**.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; **no real screen reader has ever
    been driven on this project**; touch is CDP emulation, not a physical device.

**The meta-lesson from S35, and it is about instruments, not CSS:** report the quantity the
criterion is defined on. A ratio, a fraction of samples, or a proxy can be perfectly reproducible
and still unable to answer the question being asked — and a degenerate maximiser of it (here,
`min-width: 0` scoring a perfect hit test on a 20 px unlabelled stub) can be a conformance failure.
Before optimising a number, ask what the best possible score looks like if the code is wrong.

---

## 2. YOUR TASK

### 2a. §16 — Word-style direct-manipulation handles (P1, owner-requested, ~1 session)

> *"i also want to be able to change the shape and size and rotation of objects with my mouse just
> like in microsoft word"* — owner, 2026-08-03.

**This is now the head of the queue and the only P1.** Full spec in `docs/ideas.md` §16. The two
that will bite:

- **It collides with the S23 wall-seat magnet.** `moveObjectTo` rewrites `rotation` every frame from
  the pointerdown-captured `rot0`, so a resize or rotate must be its OWN `Drag` kind that the magnet
  does not touch — not a flag on the existing one.
- **`rot0` re-basing** (`SimCanvas.tsx:1004`) reads `live.rotation` and cannot distinguish a rotate
  handle from an external `q`/`e` unless it uses the same `lastRotRef` discipline S23 introduced.

Handles must live in the object's ROTATED frame (`rectCorners` gives the basis; Maple Court is a
−12.83° plan, so an axis-aligned assumption is wrong on the owner's own layouts). Grips are canvas
pixels, so the hit-test belongs in a pure node-tested `handleAt(view, obj, screenPt)` in the
`interaction.ts` pattern — **TRAP 21** means the wiring can only be proved over CDP. Undo coalesces
one gesture into one entry (`beginGroup`/`endGroup`) and a no-op resize must return the SAME scene
ref (the S14 lesson). Doors/windows are wall-locked (S17): a grip changes the clear opening only,
rotation stays refused. Decide and document whether a grip dragged past zero mirrors (as Word does)
or clamps.

**Read S35's harnesses before writing your own** — `docs/sessions/S35/verify.mjs` is the shape to
copy for a pointer-reachability question, and `docs/sessions/S32/live-s32.mjs` is the reference for
`Input.dispatchMouseEvent` drags, which §16 needs throughout.

### 2b. Others, in rough order

§15b per-room furniture quotas (P2 — `two-bed`'s `programme` is 0.800 because both beds can land in
one bedroom; `docs/sessions/S33/bench/score-corpus.mts` is the before/after instrument) · ⇧F
(§4d, P2, fully specified) · `App.tsx` decomposition (**1292** lines against an 800 cap, P2) ·
§17b-i (P3 — the trigger's PURPOSE lives only in a hover `title=`, which is the UX-4 rule; the fix
is an `.sr-only` suffix span inside the button and explicitly NOT an `aria-label`, which would break
SC 2.5.3 by dropping the visible text out of the accessible name) · the tray running its idle action
while a move is armed (P3) · `cinema`/`great-room` density (P3) · the `scalePlan` annotation-stroke
gap (P2) · export-all bundle IMPORTER (P2, still write-only) · detection's worst case (P2) · §13e's
metric-scale redirect (P2) · §13f · §13c (P3) · multi-tab folder loss (§10d) · `docs/ideas.md` §14f.

---

## 3. LIVE VERIFICATION

`docs/sessions/S35/` holds the freshest harnesses, and the reachability instrument in them is the
one to reuse:

- `verify.mjs` — the acceptance sweep. Note its instrument: **widest contiguous unoccluded run at
  1 px**, not a fraction of N samples. Note also its guards — it refuses to run if the welcome modal
  is up, if the subject is missing, or if the fix is not actually in the served stylesheet.
- `verify-gallery.mjs` — the same, for the gallery head, in BOTH gallery states. Its sidebar check
  is worth reading: the first version read 0 sidebar labels at every width and would have passed
  vacuously, because the app boots into TUNE where that switch does not render.
- `probe-shapes.mjs` / `probe-candidates.mjs` — how to price competing fixes by injecting each as a
  real `<style>` block with real media queries, rather than as inline properties.
- `probe-reflow.mjs` — carries a worked example of TRAP 22 in its header: its first cut measured the
  header at 83 px when the truth is 57, because it mutated before measuring and never reloaded.

All import `../S32/cdp.mjs` (zero-dep, Node's built-in WebSocket + fetch, fresh Chrome profile per
run — which is the data-safety story). `docs/sessions/S30/live-s30.mjs` is the reference for real
`Input.dispatchTouchEvent` work.

`docs/sessions/` is gitignored — copy what you need into your own session directory.

---

## 4. FINISH

Paste the literal gate tails. Run the self-review, **wait for every agent to report** (TRAP 15),
adjudicate each finding against HEAD, fix what is real and record what you rejected and why. Run
`git diff --stat` after every workflow (TRAP 26). Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, **and `git push origin main` — standing owner instruction, do not skip it.**
Then write the NEXT kickoff, re-stating this protocol in full.
