# KICKOFF — Session 39

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

S38 finished the decomposition S37 started, and fixed the instrument that was supposed to prove it.

| file | S37 | S38 |
|---|---|---|
| `components/canvas/SimCanvas.tsx` | 1046 | **789** ✅ |

Every stateful React component is now inside the project's own 800-line cap. Three files remain over
it and are deliberately left, being cohesive (§18b): `canvas/render.ts` 1172 (a paint pass, not a
component), `engine/scene.ts` 1030, `engine/arrange.ts` 907.

**The interesting half of S38 was the instrument, not the refactor.**

`docs/ideas.md` §18d had the differential filed as "the base leg completes in ~3.5 min and the head
leg stalls past 10". Both halves were wrong. It reproduces on the FIRST leg of a base-vs-**BASE**
control, so no property of the head build can be involved — and the cause was that a freshly launched
headless page is never FOCUSED, so Chrome throttles it, `visibilityState` flips to `hidden`, and
**rAF pauses**. Every rAF-throttled affordance in the app then silently stops updating while
`Runtime.evaluate` keeps answering in 0.2 ms. `gripFound` had been `false` in both legs of every run
the harness ever completed, against builds whose grips were perfect.

One line fixed it (`Emulation.setFocusEmulationEnabled`). Run **~17 min → ~2 min**, grip sweep **184
silent probes → 61 in 2.0 s**, `gripFound` false → **true**. Seven further instrument defects were
fixed on the way, three of them genuine forever-hangs that had simply never fired.

A design lens measured "~5 s per `mouseMoved`" and built the 17-minute arithmetic on it. Re-measured:
23.7 ms and 108.0 ms unfocused across two runs, ~8 ms focused. **Mechanism right, number wrong by two
orders of magnitude** — re-measure a borrowed number before you act on it.

**Baseline.** `main` is at `50e20a9`, pushed. `npm test` **1893**, JS **518.25 kB / 169.03 kB gz**,
CSS **54.90 kB / 10.24 kB gz** (hash `index-j_hTKTEs.css`, byte-identical since S36), HTML 1.31 kB.
All gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1706 → 1789 → **1893**). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

**PUSH TO GITHUB** — standing owner instruction. Land session work on `main` via `--ff-only` and
`git push origin main` at the end of EVERY session. Verify with
`git rev-list --left-right --count origin/main...main` after fetching.

Traps 1–31 carry forward verbatim from the S38 kickoff. The ones S38 exercised hardest, plus three new:

* ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always. (S38 lost a
  `python3` patch to this: the heredoc ran with cwd inside `docs/sessions/S38`, the relative path
  missed, and the "fixed" harness ran unpatched for a whole cycle.)
* ⚠️ **TRAP 9** — adjudicate every agent finding against the tree yourself. S38's review produced 28;
  all four lenses were useful and several findings were duplicates across them. One reported the main
  thread's own in-progress edit as a defect (it was, in fact — but check).
* ⚠️ **TRAP 11** — `git ls-files --others --exclude-standard src/ public/` before EVERY `git add`.
* ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. It bit again in S38: 84 tests passed
  while `tsc` was red on a fixture missing `role`.
* ⚠️ **TRAP 21** — jsdom dispatches a plain `Event` for pointer events. `pick.ts` and `chain.ts` now
  make most of the pointer path testable anyway; what is left in `SimCanvas.tsx` still is not.
* ⚠️ **TRAP 22** — a symmetric failure DIFFS EQUAL. Run base-vs-base first, every time.
* ⚠️ **TRAP 26** — say in the prompt that the tree is LIVE, and `git diff --stat` after every workflow.
* ⚠️ **TRAP 29** — never run `npm test` / `npm run build` / coverage while a CDP harness is driving.
* ⚠️ **TRAP 30** — no backticks or single quotes inside a `node -e '…'` or a heredoc that lands inside
  a template literal. S38 broke `diff-harness.mjs` this way: a comment's backticks terminated the
  enclosing `READ_IDB` template and the file stopped parsing.
* ⚠️ **TRAP 32 (new, S38)** — **an inverted comparison is not the same comparison.** `if (d >= MIN)
  { act }` and `if (d < MIN) return` agree on every real number and disagree on NaN, where BOTH are
  false — so the inverted form falls through and acts. Keep the original operator and branch
  direction when moving code.
* ⚠️ **TRAP 33 (new, S38)** — **the convenience re-export pattern is only safe for a true leaf.**
  Re-exporting `chain.ts` from `interaction.ts` (the pattern `render.ts` uses for `view.ts`) closed a
  runtime cycle, because `chain.ts` needs `placement.ts` and `placement.ts` needs `interaction.ts`.
  ESM hoisting means it builds and passes. Check the transitive imports.
* ⚠️ **TRAP 34 (new, S38)** — **`git grep -c` over-counts suppressions.** `git grep -c
  exhaustive-deps` answers 7; one hit is PROSE saying a file needs none. The real count is **6**.
  Grep for `eslint-disable-next-line react-hooks/exhaustive-deps`.

Commit a baseline, then again after the gate. Land with
`git -C <REPO> merge --ff-only <branch>`, then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0), including the push.
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained eight entries in S38, most of them
   about instruments and about the difference between two expressions that look equivalent. Plus
   `docs/master-plan.md` (Session 38), `docs/ideas.md` §15b.
3. **Orchestrate.** Heavy → multi-agent Workflow. Heavy = changes a data model, touches persistence,
   touches `src/engine`, deletes/overwrites data, or edits more than one file. **§15b touches
   `src/engine/arrange.ts` — it is heavy by definition.**
4. **Adversarially verify — ALWAYS**, then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to `<block>`".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below 1893. Paste the
   coverage line for every file you touch. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then run the wrong answer past your own
   new tests — and **check each control fails the test written FOR it**. S38 ran 38. Three of the
   first 29 passed and all three were fixtures arithmetically incapable of their own bug (four
   sessions running for that). **More importantly: the self-review then found NINE MORE**, each
   verified by its own control, where the suite was green under a plausible wrong implementation —
   a fixture that grabbed an object's exact centre so two drag fields were indistinguishable; a drag
   kind never run through its real consumer at all; a screen-px tolerance that a fixed metric one
   satisfied; an ordering never pinned; and a rule that lived in the component, where no test could
   reach it. **Give the self-review a lens whose whole job is "what is the smallest wrong
   implementation that still passes this test?" and have it BUILD each control.** It is the highest-
   yield agent this project has run.
9. **Data safety.** Fresh headless-Chrome profile (= fresh origin = its own IndexedDB) for live work;
   never touch the owner's layouts. Assert it.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project; touch is CDP emulation, not a physical device.

## 2. YOUR TASK — §15b, per-ROOM furniture quotas

Full specification in `docs/ideas.md` §15b. In short:

`engine/arrange.ts` `inventoryFor` decides what to order **per room** and then sums everything into
one flat `ArrangeItem[]`; `arrangeFurniture` then places by score with no notion of which room a
piece was ordered FOR. `ZONE_AFFINITY` is only a soft pull (+1.6 in the right zone, −0.9 in the
wrong one) and it is not always enough: measured after S33, `two-bed`'s `programme` sub-score is
**0.800** — one bedroom in five is missing its bed, because both beds scored better in the same room.

The fix is to carry a room id on each `ArrangeItem` and give `placeOne` a per-room candidate filter.

**Two things that make this more than a small change:**

1. **`arrange.ts` has TWO callers**, and the second is a shipped user feature: the "Arrange furniture
   for me" dialog runs on the user's own scene with no `MAX_ENVELOPE_M` cap. S33's `SEAT_CLEARANCE`
   cost the bundled demo two of its three plants and announced "No spot survives the rules for a
   plant" three times. **Run the other caller before claiming a placement change is contained.**
2. **Measure with the instrument, not by eye — and then also by eye.** `engine/generate/__tests__/
   design-score.ts` is the test-only scorer built in S33; take a before/after across all 8 archetypes
   × 60 seeds. But S33's own lesson is that the score went DOWN while the design got BETTER when the
   double-bed-in-a-home-office bug was fixed: a metric is a proxy, and when it and a screenshot
   disagree, the screenshot is the customer.

**Acceptance.** `two-bed` `programme` measurably up from 0.800 · no regression in the corpus total
(0.8552) or in no-speaker designs (7/480) · the "Arrange furniture for me" dialog exercised on the
bundled demo, with its notices read · tests for the new per-room filter · negative controls run, each
caught by the test written for it · ratchet respected.

**If §15b lands early**, the queue is §4d (the ⇧F quarter turn, fully specified with S32's
measurements), §16b, §10b (the export-all bundle IMPORTER — still write-only, so the backup users are
told to make cannot be restored), §10d, §2d, §13e's metric-scale redirect, and the owner-approved
read-only 3D view (§5, plan in `docs/3d-view-plan.md`, bundle size explicitly does not matter).

Two P3s S38 filed and did not take: **§18e** (three harness-script absolute checks fail symmetrically,
plus a characterised two-state boot-canvas flake) and **§18f** (`move-multi` snaps its delta
unconditionally, ignoring the app's Snap setting).

## 3. LIVE VERIFICATION

`docs/sessions/S38/` holds the working instrument — **copy from S38, not S37**. See its `README.md`.

* **`cdp.mjs`** — carries the §18d fix and four hang fixes. Fresh Chrome profile per run.
* **`diff-harness.mjs`** — the behaviour differential, now ~2 min for both legs, with an unbuffered
  timestamped `run.log`, per-step `visibilityState` (a step that goes hidden FAILS loudly), a bounded
  and instrumented grip sweep, an 800 ms capture settle that covers the announcer's 700 ms, and an id
  canonicaliser that reaches array elements.
* **`shots.mjs`** — screenshots, both canvas themes + ≤960 px + 390 px + the gallery.
* **`negative-controls.mjs`** — the 30-control runner; copy the shape, it is cheap and it works.

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
