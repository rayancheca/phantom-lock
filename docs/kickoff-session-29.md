# KICKOFF — Session 29

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Where the project is

Six sessions have landed in a row on `main`:

- **S23** — the furniture wall-seat magnet (drag half).
- **S24** — the generator wrote door/window angles in **degrees into a radians field**.
- **S25** — `rooms.ts` `regionOf` **walked through walls**.
- **S26** — the S25 P0 was **REFUTED**; the monotonic-knob guarantee shipped instead.
- **S27** — detection's threshold was **decided by flat area**. Correct, but it did not land.
- **S28** — landed S27 **and** the fix for its mirror regression, together. See §3.

**Baseline.** `main` is at S28: `npm test` **1407**, JS **481.42 kB / 156.86 kB gz**, CSS 51.55 kB /
9.56 kB gz, HTML 1.31 kB. All three gates green. There is **no unlanded branch** — for the first
time in two sessions, `main` is the whole story.

**TEST COUNT IS A RATCHET** (…1388 → 1393 → **1407**). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

⚠️ **`npm run test:coverage` is still NOT clean**, but it is better and the remaining failure is
named. `main` now fails exactly **1** test under coverage — `generate.test.ts` › *"REPORTS furniture
it could not place instead of dropping the notes"* — with `Test timed out in 5000ms`, not an
assertion failure. The cause is the S18 lesson: v8 instrumentation makes the same work several times
slower, so work inside an `it` that passes under `npm test` blows the 5 000 ms default. **The fix is
always to hoist to module scope, never to raise `testTimeout`** — `detect.test.ts` has now done this
four times (`RESULTS`, `BY_LEVEL`, `TONE_SWEEP`, and S28's `ink reading` sweep, which reuses
`BY_LEVEL` rather than re-detecting). Doing the same for `generate.test.ts` is a genuinely small,
worthwhile task.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install`, or symlink the
  main repo's (S28 did this to build the S27 tree as a live control, then removed the worktree).
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole `src/` tree to /tmp and patch THERE.
  S28 kept `/tmp/s28base` (pre-S27), `/tmp/s28ref` (S27 frozen) and `/tmp/s28cand` side by side all
  session, which is what made every before/after number reproducible on demand.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.** S28 had to overturn
  three: a "0 leaks over 684 readings" safety claim (refuted by one command), a guard constant that a
  *different* agent's fixture already contradicted, and a worst-case leak understated 4–6×. Two agents
  disagreeing is the normal case, not the exception.
- ⚠️ **TRAP 10** — `vite preview` binds `localhost` and silently moves port if 4173 is taken. Read the
  port it prints and pass it as `BASE`.
- ⚠️ **TRAP 11** — workflow agents write scratch into `src/`. Run
  `git ls-files --others --exclude-standard src/` before EVERY gate. (Telling them "/tmp only, the
  repo is READ-ONLY to you" worked again in S28 — zero strays across 11 agents.)
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree.
- ⚠️ **TRAP 15** — a workflow phase can run long; a 2-stage pipeline runs ~2× longer than a flat
  fan-out. S28's bake-off→skeptic chain took ~69 minutes. Prefer several small workflows.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. Keep payloads small
  (`format:'jpeg', quality:90`).
- ⚠️ **TRAP 17** — **zsh does not word-split unquoted parameters.** `set -- $c` leaves `$1` holding the
  whole string, so a parameter sweep silently runs the DEFAULTS and prints identical rows. Sweep in
  Node, or use `${=c}`.
- ⚠️ **TRAP 18 (new, S28)** — **`npx vite-node` is the way to run engine code outside the suite**, and
  imports from a /tmp harness must be **absolute** (`/tmp/x/src/engine/detect`); a relative path from
  outside the repo root does not resolve and the error names the module, not the cause.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`, then
`git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained SIX entries in S28 and the
   detection architecture note changed again. Plus `docs/master-plan.md`, `docs/ideas.md`, and —
   before touching detection — `docs/sessions/S28/bench/` (the reproduction, the adjudication, the
   fixture negative control, and the eight archived agent results).
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1407**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project.

**The meta-lesson, six sessions old:** when you fix a bug, run the *other* wrong answer past your new
test. S28's own suite was green, complete-looking, and **did not catch a one-line regression that
reverts the entire benefit of the session before it** — swapping the candidate order to
`[plain, gradient]` passed `MEAN_FLOOR`, every per-fixture floor, the tone sweep, the monotonic-knob
guarantee and both brand-new candidate tests. Only building that wrong version and measuring it found
it. Budget time for it explicitly.

---

## 2. YOUR TASK

### 2a. §13e — **P1, and the head of the queue. The refusal gates accept images with no floorplan.**

This is **older and larger than anything S27 or S28 touched**, and it is now the most user-visible
defect in the detector. `main`, the S27 engine and the S28 engine accept these **identically**, so no
threshold rule can reach them — they live in `vision/quality.ts`.

Measured in S28's null census:

- **A page of four thin furniture OUTLINES** — no floorplan at all — is offered in **27/27** readings
  (stroke {3,5,7} × tone {26,90,150} × 3 UI levels) at structure up to **1.000** and confidence
  **1.00**. A rectangle's corners meet, and `structureScore` measures exactly that.
- **A null whose two tone populations EACH form joined corners** leaks **27/27**, up to 9 walls at
  structure 0.813, confidence 1.00.
- The **worst single offer**: `no-plan-lines` + grey bars at luminance 120 over 20 % of the page at
  gamma 0.70 — **13 walls at structure 0.846, confidence 1.00**, at both Careful and Thorough.
- Censused over 124 constructions × 3 levels, **52 of the 86** accepted null cells reach confidence
  ≥ 0.90. These are the loud ones.

**What will NOT work, already measured — do not spend the session rediscovering it:**

- **Moving `MIN_STRUCTURE`.** An incumbent-side floor was swept: its very first step, 0.28, already
  refuses 13–24 readings of the owner's own plan, which bottoms at incumbent structure **0.273**.
  Non-viable at every value up to 0.75.
- **`support` or `explained`.** S26 established these cannot separate anything — both are measured
  against the mask the pipeline itself produced, and `no-plan-lines` scores **1.000 on both** at every
  sensitivity, higher than the lowest legitimate `explained` (0.867).
- **Total length, or a challenger-side guard.** Both were measured in S28 and both overlap the
  legitimate population.

**What is worth measuring, in order.** The missing signal is almost certainly *enclosure*: a floorplan
bounds ROOMS, and four furniture outlines bound four furniture-sized boxes. `rooms.ts` already
flood-fills (and S25 made `segsCross` textbook-correct, so it no longer leaks through walls).
Candidates: do the segments enclose regions at BUILDING scale rather than furniture scale · the ratio
of enclosed area to total wall length · whether the segment graph has cycles at all · the distribution
of enclosed region areas (a plan's rooms differ in size by a lot; four furniture boxes do not).
Whatever you choose, **calibrate against the enumerated corpus, not against the attacks** — that is
the S18/S28 lesson and it has now bitten twice in three sessions.

**Acceptance:** the furniture-outline page and the two-tone shelf page become null fixtures · both
refused at all three UI levels · **no legitimate corpus fixture refused, and `oblique-survey` (0.346)
and `apartment-cluttered` (0.425) specifically still accepted** · the owner's plan unchanged at
9 / 15 / 24 walls (74 / 85 / 92 %), verified LIVE · corpus mean holds ≥ 0.92 (it is 0.9497 today,
0.0297 of headroom).

### 2b. §4b — the explicit seat COMMAND (`docs/ideas.md` §4b, P1, ~½ session)

Completes S23. Fully designed and adversarially reviewed already — read
`docs/sessions/S23/spec-v1-REFUTED.md` §7 and `spec-v2-CORRECTED.md`. Four parts, each with a trap
already found and paid for:

1. **`f` / `⇧F`**, reach 1.2 m. Keep `keyboard.ts` **byte-unchanged**. ⚠️ **The quarter turn must be
   applied AFTER the snap** — adding π/2 to the INPUT of a nearest-π snap is annihilated by it. Write
   that test failing-first; as originally specced it is unsatisfiable.
2. **The Inspector button.** ⚠️ Gate on `role === 'furniture' || role === 'tv'`, NOT `role !== 'door'`,
   which also matches **windows**. ⚠️ `InspectorPanel.door.test.tsx:53` passes ten explicit props with
   no spread, so a required eleventh breaks `tsc --noEmit` while `npm test` stays green.
3. **The touch-HUD button** — both surfaces or neither.
4. **The on-canvas snap guide.** ⚠️ Do NOT stroke it with `wallKeptSpans`.

### 2c. Creation-time alignment (P1, small)

`App.tsx:446` (palette drop) and `SimCanvas.tsx:1015` (rubber-band draw) both hardcode `rotation: 0`,
so on the owner's skewed plan **every new rect arrives crooked** before any drag. Same helper as S23's
magnet, ~2 call sites. Smallest change with the biggest everyday effect.

### 2d. The `scalePlan` annotation-stroke gap (P2, small — deferred TWICE now)

`drawSpeckle` hardcodes a 1.2 px mark stroke and `ArcSpec.thickness` defaults to 1.4, and `scalePlan`
cannot carry either because no spec field exists — so the resolution tests run on a slightly EASIER
drawing than the fixture they name. S27 added per-element `ink?:` to the same three spec types and
could have added `thickness?:` alongside, but an agent MEASURED that doing so moves
`apartment-annotated` at 2.5× from 99.7 % to 91.7 %. That is a resolution-test number and must not
ride along inside a byte-identity-preserving change. Its own commit, with the `scalePlan` doc comment
rewritten (its "21 / 0.310 / 63.6 %" figure for `oblique-survey` is not reproducible — measured
17 / 0.471 / 79.1 %).

### 2e. Make `npm run test:coverage` green (P2, genuinely small now)

**One** failure left: `generate.test.ts` › *"REPORTS furniture it could not place instead of dropping
the notes"*, `Test timed out in 5000ms`. Hoist the expensive work to module scope the way
`detect.test.ts` does four times over. Do NOT raise `testTimeout` — the file comments explain at
length why that is the wrong fix.

### 2f. Others

Export-all bundle IMPORTER (P2 — still write-only) · detection's worst case (P2) · §13c, the textured
mid-tone mass gradient weighting does not cover (P3, measured, no advantage but no regression) ·
`App.tsx` decomposition (**1290** lines vs an 800 cap) · the read-only 3D view (P2,
`docs/3d-view-plan.md`).

---

## 3. WHAT S28 DID, AND WHAT IT LEFT

**§13d is DONE, and S27 landed with it.** The engine now reads the page at BOTH threshold rules.
`vision/mask.ts` `inkThresholds` returns the gradient-weighted cut and the plain cut — best guess
first, de-duplicated, at most two — and `detect.ts` `detectWalls` runs the pipeline at the first,
re-running at the second ONLY when the first reading is refused.

- **The bug.** Gradient weighting scales a tone's vote by ~1/thickness. It demotes a flat mass (right
  on `scan-letterbox`) and equally demotes THICK LIGHT WALLS while amplifying THIN DARK LINES — so a
  plotted sheet with screened poché under hairline annotation lost every wall. A 10-wall plan went
  from a 50–73 % read to REFUSED on 5 of 5 seeds.
- **Live proof.** Owner's real plan **9 / 15 / 24 walls at 74 / 85 / 92 %**, identical to S26 and S27.
  The polarity fixture: **14 / 16 / 26 walls** on the fix, and **no proposal card at all** on a build
  of the S27 tree. Both driven through the real UI on a fresh Chrome profile.
- **The null cost is 0 against what shipped.** The acceptance set is `accept(gradient) ∪ accept(plain)`
  — a theorem, verified 591/591 and again 99/99 independently — and **S27 never landed, so `main` IS
  the plain rule**. Over 504 (and independently 1830) null readings, new-vs-`main` is identical for
  the S27 engine alone and for the candidate set. S27 had closed 61 null readings as a *side effect*
  of swapping the rule and paid with the polarity regression; S28 hands them back.
- **No challenger guard survived.** Over an enumerated protected set of 391 legitimate rescues,
  structures run to **0.214** while attacks reach **0.346** — the populations OVERLAP. The 0.45 first
  proposed would refuse 87 of 391 (worst: an 88 %-correct read) and still miss the worst attack.
  "Challenger ≥ `MIN_WALLS`" is provably vacuous; "challenger's own structure ≥ `MIN_STRUCTURE`" costs
  a real 57 %-correct read and buys 0.
- **`MIN_EDGE_FRACTION` → `MIN_EDGE_DENSITY`.** A vote is a boundary pixel (a LENGTH), so dividing by
  AREA was dimensionally wrong and the guard fired more readily the LARGER the image — at 4× it
  starved 9 of 22 legitimate fixtures. Votes/perimeter is flat by construction. The guard STAYS: a page
  straddling 127 gives zero votes and `otsuThreshold`'s initialiser then yields a plausible WRONG mask
  rather than an empty one (100.0 % vs 56.5 %).
- **`DetectionResult.ink`** records which cut answered — without it a fallback that never runs is
  indistinguishable from one that runs and agrees.
- **`screened-poche`** is `scan-letterbox`'s mirror and the two are a matched pair: on one the correct
  cut admits LESS ink and comes from the edge histogram, on the other MORE and from the plain one. It
  is load-bearing on TWO pre-existing assertions — on the S27 engine it scores **0.000** against its
  0.78 floor and drags the mean to **0.9132** against `MEAN_FLOOR` 0.92.
- **`apartment-photo` 0.92 → 0.98 and `apartment-skewed` 0.85 → 0.95** are now the CANDIDATE-ORDER
  guard. See the meta-lesson above.

**Left open, honestly:**

- **§13e, the new P1** — see §2a. Pre-existing on `main`, and the loudest thing in the detector.
- **Per-fixture regressions vs `main` that are S27's, not S28's**, and belong on the record: over 69
  legitimate readings the landed engine beats `main` 18 times and loses 19 — `oblique-survey`
  @Thorough 90.4 → 86.8, `apartment-cluttered` @Careful 77.6 → 75.0. The aggregate still improves
  (94.82 → 95.48 over the 22 pre-S28 fixtures).
- **The starvation branch is the one place the candidate set is NOT a union** — a starved page is read
  by the plain rule alone, S27's rule disarmed with no fallback. The symmetric version was built and
  measured over 13 starved images × 3 levels and is behaviourally INERT (0 rescued, 0 leaked), so it
  is recorded in `mask.ts` rather than changed.
- **Wall-count inflation on nulls both engines accept** — 3 of 1830 readings gain 1–4 walls. Small, but
  a real axis a binary accept/refuse ledger cannot see, and the one that would grow if the candidate
  set were ever widened.
- `sameRegion` still has NO production caller; `optimize.ts:265` still has no `area > 2` guard while
  its two siblings do.

---

## 4. LIVE VERIFICATION

`docs/sessions/S28/{cdp.mjs,live-owner-plan.mjs,live-polarity.mjs}` plus
`docs/sessions/S28/bench/render-fixture.ts` is a working, copyable, zero-dependency harness (Node's
built-in WebSocket + fetch).

**`live-owner-plan.mjs` is the one to copy for anything image-related.** It feeds a real file through
the app's OWN hidden file input, so the image travels `buildUnderlay` → the underlay record →
`detectWallsFromUnderlay` exactly as a user's does, then clicks the real button and reads the real
card. It asserts a fresh profile (`phantom-lock:v2` must be null) before trusting anything.

**`render-fixture.ts` is new in S28 and closes a gap**: it renders any corpus fixture to a real PNG
(minimal RGBA encoder over node's `zlib`, no dependency), so a synthetic fixture can be driven through
the full product chain rather than only through `detectWalls`. That is what let S28 prove the polarity
case live, with the S27 build as a side-by-side control.

**To build a live CONTROL from an older engine**: `git worktree add /tmp/<name> <commit>`, symlink the
main repo's `node_modules`, `npx vite build`, `npx vite preview --port 4174`, then run the harness with
`BASE=http://localhost:4174`. Remove the worktree afterwards (`git worktree remove --force`).

`docs/sessions/` is gitignored, so those files are local-only — copy them into your session directory.
`docs/sessions/S28/bench/owner-plan.png` (the owner's real plan, 1320×1734) and
`docs/sessions/S26/bench/owner-appchain.bin` (the app-chain bytes, 685×900) both survive and are the
artefacts every detection measurement should start from.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what is
real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
