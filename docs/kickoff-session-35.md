# KICKOFF — Session 35

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S34 answered an owner report that arrived mid-session** — *"why is there no delete layout button
and wheres the generate layout button. impossible to find"* — and the shape of it is worth reading
before you trust any coverage claim in this repo.

- **Generate was not hidden, it was UNREACHABLE.** Both entry points were gated on a folder, so the
  home grid — the screen every session opens on — had no path to it, and a workspace with no folders
  had none at all. **Every gallery test rendered `seededDefaultStore()`, which ships two folders, so
  the 36-test corpus could not express the failing case** — and the failing case is the default one.
- **Delete was there; "too dim" was the wrong diagnosis.** The `⋯` glyph measured 9.09–9.30:1. Its
  own fill measured **1.01–1.10:1** against the backdrop — no boundary. Darkening it buys 0.02.
- **The fix regressed short viewports twice**, each caught only by measuring: the grid collapsed
  137 → 65 px at 844×390, and then the compaction that fixed that failed at 320×200 because the
  labels wrap and `min-height` stops binding.

**Baseline.** `main` is at `85c824e`. `npm test` **1628**, JS **506.04 kB / 165.05 kB gz**, CSS
**53.97 kB / 10.06 kB gz**, HTML 1.31 kB. All gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1543 → 1560 → 1615 → **1628**). Never let it drop; no test may be
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
  verification pass was partial. (S33 lost 4 of 6 understanding agents and both skeptics.)
- ⚠️ **TRAP 25 (new, S34)** — **the Browser pane's `preview_start` server can die mid-session and
  its tools can hang on "Policy check in progress"**. When either happens, fall back to the repo's
  own zero-dep CDP harness (`docs/sessions/S32/cdp.mjs`) — it is the proven path here and it gives
  you a fresh profile per run, which is also the data-safety story.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0), including the push.
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained EIGHT entries in S34. Plus
   `docs/master-plan.md` (Session 34), `docs/ideas.md` §17b, §15b, §16, §4d.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new behaviour; never below **1628**. Paste the
   coverage line for every file you touch. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then **run the wrong answer past your
   own new tests** — and check each control fails the test written FOR it, not merely some test.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three, plus `test:coverage`.
11. **Evidence block.** State honestly: live checks run ONE browser; **no real screen reader has ever
    been driven on this project**; touch is CDP emulation, not a physical device.

**The meta-lesson from S34, and it is about test corpora, not CSS:** a feature can be present,
tested, live-verified and still unreachable from the screen the app opens on. When a control is
conditional, enumerate the CONTAINERS a user can be looking at — home grid · inside a folder · empty
home · empty folder — and check each, rather than checking that the control renders. The shared
fixture that every test in a file uses is exactly the shape that cannot express the default case.

**And a second one, about guards:** a test that measures a CONSTANT to justify a CSS choice is
documentation, not a guard. S34's whole contrast block passed with the fix reverted until one
assertion read `gallery.css` from disk and pinned the rule. Three review lenses found this
independently.

---

## 2. YOUR TASK

### 2a. §17b — the layout switcher is COVERED at phone widths (P1, pre-existing, ~½ session)

**This is the head of the queue, and it is a superset of what S34 just fixed.** `.room-trigger` —
the header pill that opens the gallery, and the ONLY control that opens it — is overlapped by the
DESIGN/TUNE `SegmentSwitch`'s `.segment-label` spans. Measured by sweeping 21 points across the
trigger's width with `document.elementFromPoint`, byte-identically on a pre-S34 baseline tree and on
`main`:

| viewport width | fraction of the trigger that is hit-testable |
|---|---|
| 390 px | **0.143** (3 of 21 points) |
| 560 px | 0.714 |
| 760 px | 0.667 |
| 960 px | 1.000 |
| 1440 px | 1.000 |

On a phone the gallery is very nearly unopenable, which makes *every* layout action — open, rename,
duplicate, export, delete, generate — unreachable. This is the **S21 lesson verbatim** (*"two
absolutely-positioned overlays at the same coordinates is a HIT-TESTING bug, not a cosmetic one"*),
and the S21 fix note applies: anchor the smaller element to the OPPOSITE edge rather than nudging an
offset, because `.toolstrip` has `flex-wrap: wrap` and the header can reflow.

**Acceptance.** `elementFromPoint` reports `SELF` for ≥ 0.95 of the trigger's width at 320, 390, 560,
760, 960 and 1440 px; the DESIGN/TUNE switch stays fully operable at every one of those widths (sweep
IT too, or you will have moved the collision rather than removed it); a CDP guard in the session
harness pins the fractions; the ≤ 960 px bottom rail is re-checked because the header's reflow is
what makes any fixed-height assumption fragile. jsdom cannot see this at all (it ignores `@media`
and reports 0×0 rects), so the guard lives in the CDP harness and the handoff says so.

While you are there, §17c (P3): 430 px of horizontal overflow at 390 px, offenders `.strip-btn` with
right edges at 467 and 557. `docs/sessions/S34/mobile.mjs` already asserts the number has not moved.

### 2b. §16 — Word-style direct-manipulation handles (P1, owner-requested, ~1 session)

> *"i also want to be able to change the shape and size and rotation of objects with my mouse just
> like in microsoft word"* — owner, 2026-08-03.

Unchanged from the S34 kickoff and still owner-requested. The two that will bite: it collides with
the S23 wall-seat magnet (`moveObjectTo` rewrites `rotation` every frame from `rot0`, so a resize or
rotate must be its OWN `Drag` kind the magnet does not touch), and `rot0` re-basing
(`SimCanvas.tsx:1004`) reads `live.rotation` and cannot distinguish a rotate handle from an external
`q`/`e` unless it uses the same `lastRotRef` discipline. Handles must live in the object's ROTATED
frame (`rectCorners` gives the basis; Maple Court is a −12.83° plan). Grips are canvas pixels, so the
hit-test belongs in a pure node-tested `handleAt(view, obj, screenPt)` in the `interaction.ts`
pattern — TRAP 21 means the wiring can only be proved over CDP. Undo coalesces one gesture into one
entry (`beginGroup`/`endGroup`) and a no-op resize returns the SAME scene ref (the S14 lesson).
Doors/windows are wall-locked (S17): a grip changes the clear opening only, rotation stays refused.
Decide and document whether a grip dragged past zero mirrors (as Word does) or clamps.

### 2c. Others

§15b per-room furniture quotas (P2 — `two-bed`'s `programme` is 0.800 because both beds can land in
one bedroom; `docs/sessions/S33/bench/score-corpus.mts` is the before/after instrument) · ⇧F (§4d,
P2, fully specified) · `App.tsx` decomposition (**1292** lines against an 800 cap, P2) · the tray
running its idle action while a move is armed (P3, pre-existing, shared with three other tray
buttons) · `cinema`/`great-room` density (P3) · the `scalePlan` annotation-stroke gap (P2) ·
export-all bundle IMPORTER (P2, still write-only) · detection's worst case (P2) · §13e's
metric-scale redirect (P2) · §13f · §13c (P3) · multi-tab folder loss (§10d) · `docs/ideas.md` §14f.

---

## 3. LIVE VERIFICATION

`docs/sessions/S34/` holds the three freshest harnesses and they are the ones to copy for §17b,
because §17b IS a hit-testing question and that is what they measure:

- `look.mjs` — survey what a container actually offers, with `elementFromPoint` reachability per
  control. This is the shape that found the bug.
- `verify.mjs` — the full end-to-end path with a `fail()` guard before every downstream assertion.
- `mobile.mjs` — 390 px, then 844×390 (short), then 320×200 (400 % zoom). Note how the last two
  assert against the **pre-change baseline number** rather than against zero, because a pre-existing
  defect should be pinned, not ignored and not faked into a pass.

All three import `../S32/cdp.mjs` (zero-dep, Node's built-in WebSocket + fetch, fresh Chrome profile
per run — which is the data-safety story: the owner's layouts live in THEIR browser profile and are
never touched). `docs/sessions/S30/live-s30.mjs` is the reference for real `Input.dispatchTouchEvent`
work, and `docs/sessions/S32/` for `Input.dispatchMouseEvent` drags, which §16 will need.

`docs/sessions/` is gitignored — copy what you need into your own session directory.

---

## 4. FINISH

Paste the literal gate tails. Run the self-review, **wait for every agent to report** (TRAP 15),
adjudicate each finding against HEAD, fix what is real and record what you rejected and why. Update
`CLAUDE.md`, `docs/ideas.md` and the `docs/master-plan.md` progress log with a full Evidence block.
Commit on the session branch, land on `main` via `--ff-only`, **and `git push origin main` — standing
owner instruction, do not skip it.** Then write the NEXT kickoff, re-stating this protocol in full.
