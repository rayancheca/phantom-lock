# KICKOFF — Grid-loop iteration cap: close S8's honest worst-case-CPU limit (Phantom Lock)

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

This is `docs/ideas.md` **P0** ("auto-detect overhaul + **grid-loop iteration cap**"). The auto-detect
half has its own kickoff (`docs/kickoff-session-12.md`); THIS kickoff is the grid-loop cap. It is
**HEAVY** by the objective triggers: it **touches the engine** (`src/engine/bestspot.ts`,
`src/engine/pairspot.ts`) — the frozen-set files — and it edits more than one file. It therefore MUST
get: a multi-agent Workflow (parallel understand → design → an adversarial skeptic that tries to REFUTE
each change against the real code), full implementation (no stubs/TODOs/`.skip`/`.only`/scope-narrowing),
failing-test-first for every new pure behaviour, a self-review agent pass over the ACTUAL diff, and a
handoff with an Evidence block.

## Why this exists

S8 hardened the import boundary but documented an **honest, unclosed limit** (`docs/security.md`
§"Known limit — worst-case CPU is mitigated, not closed", lines ~165-180): a payload hand-tuned to sit
**just under every import limit** — measured at **200 speakers / span 399 m / 100 objects, every value
inside `importRejection`'s bounds** — costs **~157 s for a single simulation pass**, and because the
layout persists, the freeze **recurs on every reload** until the layout is deleted. Cost is multiplicative
in `objects × pairs × span²`. A legitimate 10-room house already costs ~200 ms; a 50-room house ~11 s.
S8 could not close this without an **iteration cap inside the grid loops**, which were frozen that session.
This session closes it.

Note (2026-07-23): `MAX_IMPORT_SPEAKERS` was tightened to **64** after S8 (see `scene.ts`), so re-measure
the current worst case against the CURRENT limits before quoting a number — the 157 s figure predates that
tightening. The limit is mitigated further but the *class* (unbounded grid work under the import ceiling)
is still open until the cap lands.

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO (source of truth): `<REPO_ROOT>` (`/Users/<you>/…/Dev/fun/layout`). `main` is at **c78020b**
(S17 doors+swing landed 2026-07-23), clean, in sync with `origin/main`. Create a fresh per-session
worktree branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. ALWAYS confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST, and pass worktree-relative paths to Read/Edit/Write — otherwise your
  edits silently land in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** Run `npm install` first or every gate
  command fails confusingly. Corollary: after you land on `main`, the ROOT checkout's `node_modules` may be
  stale; `npm install` there before trusting its gate.
- ⚠️ **TRAP 3 — the shell cwd persists between Bash calls.** A `cd` in one call is still in effect in the
  next. Prefer absolute paths or re-`cd` every time. (Note: some tool wrappers reset the cwd back to the
  worktree between calls — verify with `pwd` if unsure.)
- ⚠️ **TRAP 4 — `.claude/launch.json` is a TRACKED file.** Do not overwrite it; its `autoPort: true` is what
  stops your dev server from stealing the owner's port on :5173.
- ⚠️ **TRAP 5 — verify claims by OBSERVATION/MEASUREMENT, not API readback.** For a PERFORMANCE cap this is
  the whole game: a cap that "looks fixed" but still degrades on a slightly different payload is a lie.
  MEASURE the actual wall-clock of a simulation pass on the pathological payload before AND after, and
  assert bit-identical output on legitimate scenes. (S17's reflex-arc bug hid in a screenshot that was read
  too fast; a perf regression hides just as easily behind a green test.)
- ⚠️ **TRAP 6 — a cap that changes results for a legitimate scene is a correctness bug, not a fix.** The
  frozen engine's outputs are load-bearing (the verdict, the sweet spot, the best-spot ★). The cap must be
  **bit-identical** for every scene under its threshold, and only coarsen/bound work for scenes that exceed
  it. This is the exact discipline S8 used for `MAX_SCENE_SPAN` (bound the DERIVED value, never the stored
  data) — study it.

There are several stale worktrees from earlier sessions. Ignore them; don't reuse or clean them up.

Commit a baseline, then commit again after the gate passes. Land with:
```
git -C <REPO_ROOT> merge --ff-only <branch>
git -C <REPO_ROOT> push origin main
```
Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. The owner wants
visible GitHub contribution activity — push `main` after the gate lands.

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and
PASTE the literal tails to confirm the baseline is green before changing anything. Baseline as of
2026-07-23: **lint 0 · 711 tests · build 410.66 kB / 132.32 kB gz**. TEST COUNT IS A RATCHET
(…659→666→**711**) — it must never drop, and no test may be newly skipped/`.only`'d/weakened.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file), `docs/master-plan.md` (protocol + progress log),
   `docs/security.md` (§"Known limit" + the whole worst-case section), `docs/ideas.md` (P0 entry). Map
   every site before touching it.
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). Do not solo
   heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. Report each verdict. (Skeptics on this project
   have caught data-loss, a DoS estimate wrong by 2 orders of magnitude, and — S17 — a reflex-arc render bug
   a screenshot missed.)
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>". No
   stubs/TODOs/placeholders/scope-narrowing. A split is legitimate ONLY if the shipped slice fully satisfies
   a NAMED subset of the Acceptance and the remainder is rescheduled with its own Acceptance.
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure
   behaviour, never let the count drop below 711. Run `npm run test:coverage`; paste the coverage line for
   every file you touched (≥80%, or state the exact reason). Vite routes by FILENAME: `*.test.ts` → node
   project, `*.test.tsx` → jsdom project. **For this task, add a PERFORMANCE test** that measures the sim
   pass on the pathological payload is under a bound (use an injected clock or `performance.now()` deltas;
   avoid flakiness by asserting the CELL-COUNT bound, a deterministic integer, not just wall-clock).
7. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a domain
   reviewer, e.g. `performance-optimizer`) over the ACTUAL diff. Fix everything real, then re-verify. Prefer
   plain-text returns for reviewer agents; a strict StructuredOutput schema killed one before.
8. **Data safety.** Before any live test that writes persistence, Export-all and save to
   `docs/sessions/<S>/backup.json` (gitignored). Test on a disposable DUPLICATE — never the owner's real
   "Maple Court" layout — and prefer a FRESH headless-Chrome profile (fresh origin ⇒ own IndexedDB) so the
   owner's data is never touched. NEVER delete the owner's layouts.
9. **Verification gate — proven, not paraphrased.** Paste the literal terminal tails of `npm run lint`,
   `npm test` (with count) and `npm run build` (with gz size). Any red = not done.
10. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count · pasted
    gate output · saved artifact paths · each Acceptance bullet → met/deferred. No Evidence block =
    incomplete. State honestly: live checks run ONE browser; no real screen reader has ever been driven.

## 2. YOUR TASK — cap the grid loops without changing any real scene's output

**The two grid loops (frozen-set files):**
- `src/engine/bestspot.ts:150-151` — `bestListeningSpot` walks `for (x = min.x+step/2; x <= max.x; x += step)`
  × `y`, with `step = max(0.25, min(0.7, span/(coarse?13:24)))` (`:133`). Per cell it runs occlusion +
  reflections for ALL speakers (capability-weighted). This is the whole-room best-spot search (green ★).
- `src/engine/pairspot.ts:141-142` — `bestPairSpot` walks the same grid with a fixed `GRID_STEP`, per BLOCKED
  pair, doing a wall-aware seat search. Called from `stereo.ts` `computePair`.
- (`arrange.ts:167` has a third grid loop, but arrange.ts is NOT frozen and is not on the hot verdict path —
  scope it in only if the design shows it shares the same unbounded-work class; otherwise leave it.)

**The problem:** `step` has a FLOOR (0.25 / GRID_STEP) but the bounds come from `sceneBounds` (span-clamped
to `MAX_SCENE_SPAN` = 20 km, far above any import limit). Under the import ceiling (span ≤ 400 m) the cell
count is `(span/step)²` ≈ `(400/0.25)² = 2.56 M` cells, each doing per-speaker occlusion+reflection work —
the ~157 s (pre-64-speaker-cap) freeze. A legit 10-room house (span ~15 m) is `(15/0.6)² ≈ 625` cells — fine.

**The fix (design it in the Workflow, skeptic-check it):** bound the TOTAL cell count. The natural approach:
compute the cell count `(span_x/step)·(span_y/step)`; if it exceeds a cap `MAX_GRID_CELLS`, **increase `step`**
(coarsen) until the count is under the cap. Critically:
- **Bit-identical for every real scene.** Pick `MAX_GRID_CELLS` so that NO scene reachable under the import
  limits AND no legitimate app-produced scene (a 50-room house is the practical ceiling) ever hits the cap —
  i.e. the cap only ever fires on the adversarial span-399 payload. Prove this: the largest legit cell count
  must sit safely below `MAX_GRID_CELLS`. A test must ACCEPT the bundled demo, a max-size UI room, and a
  ~50-room "Add a room…" layout with byte-identical output (`toEqual` vs the pre-cap result).
- **Consistency between the two loops.** `bestspot` and `pairspot` both search over `sceneBounds`; decide
  whether the cap is a shared helper (e.g. `cappedStep(bounds, baseStep, maxCells)` in a small pure module)
  used by both, so the logic has one definition and one test.
- **Do NOT clamp `sceneBounds` further** — that would flatten geometry (the S8 lesson). Bound the DERIVED
  step/cell-count locally inside each loop, leaving the scene untouched.
- **The engine outputs must not shift for capped scenes in a way that breaks an invariant** (e.g. the verdict
  reading a seat the tracer didn't). For an adversarial scene the RESULT changing is acceptable (it was
  garbage anyway); what matters is (a) termination in bounded time, (b) no crash, (c) real scenes unchanged.

## 3. SCOPE GUARD

The frozen set is `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot}.ts`. This task DELIBERATELY
edits `bestspot.ts` + `pairspot.ts` (and maybe a new pure `engine/grid.ts` helper) — that is the whole point,
so it is authorized, but each edit gets its own skeptic pass and a bit-identical-on-real-scenes proof.
`raytrace/stereo/optimize/rooms` should stay byte-unchanged unless the design proves otherwise (verify with
`git diff --stat`). Do not regress the S7 a11y work, the S13–S16 design system, or the S8 security posture.

## 4. READ FIRST (in order)

`CLAUDE.md` → `docs/master-plan.md` (protocol + S8 + S17 progress entries) → `docs/security.md` (the whole
worst-case-CPU section — it has the measured numbers and the reasoning) → `docs/ideas.md` (P0) → the code:
`src/engine/bestspot.ts` (the whole `bestListeningSpot`), `src/engine/pairspot.ts` (`bestPairSpot`),
`src/engine/scene.ts` (`sceneBounds` + `MAX_SCENE_SPAN` + `clampSpan` — the model for bounding a derived
value; `importRejection` + the `MAX_IMPORT_*` limits), and their existing tests (`bestspot.test.ts`,
`pairspot.test.ts`, `hardening.test.ts`).

## 5. ⚠️ DATA SAFETY — same as always

The owner's real "Maple Court" layout lives in IndexedDB on `localhost:5173`. NEVER delete it. Back up before
any write test. Prefer a fresh headless-Chrome profile for interactive testing. See `CLAUDE.md` "Accessibility"
+ the S16/S17 lessons for the fresh-profile CDP recipe (navigate to a same-origin BLANK HTML page first, set
`localStorage['phantom-lock:v2']`, then load the app so `initialStoreForBoot` picks it up).

## 6. LIVE VERIFICATION

This is mostly an ENGINE change (pure functions), so the primary proof is UNIT TESTS + a MEASURED perf
benchmark, not screenshots. But the best-spot ★ and the verdict ARE observable, so ALSO: seed a disposable
large-but-legit layout (e.g. a 20-room "Add a room…" chain) in a fresh CDP profile, confirm the app stays
responsive (no multi-second freeze on load/edit), and screenshot the ★/verdict rendering unchanged. State the
before/after sim-pass timing you measured.

## 7. ACCEPTANCE

- The pathological payload (re-measured against the CURRENT import limits: max speakers / span ~399 / max
  objects, every value inside `importRejection`) simulates in **bounded, sub-second-ish time** (state the
  measured before/after; define the bound you hit), and does not crash.
- **Every legitimate scene is bit-identical:** the bundled demo, a max-size UI room, and a ~50-room layout
  produce `toEqual` output from `bestListeningSpot` + `bestPairSpot`/`computeAudio` vs the pre-cap engine
  (assert with a seeded fixture, not just a fresh one).
- The cap is a bounded CELL COUNT (a deterministic integer), tested directly, not just a flaky wall-clock.
- New pure guards are failing-first tested in the node vitest project; the ratchet rises above 711.
- Frozen files OTHER than `bestspot`/`pairspot` (+ any new `grid.ts`) are byte-unchanged (`git diff --stat`).
- The S8 security posture is intact (CSP drift test green); `docs/security.md`'s "Known limit" section is
  UPDATED to say the limit is now closed, with the new measured numbers.
- Gate green: lint 0 · ≥711 tests · build clean, all three tails pasted.

## 8. FINISH

Paste the literal gate tails. Spawn `code-reviewer` + `silent-failure-hunter` + `performance-optimizer` over
the ACTUAL diff; fix everything real; re-verify. Save evidence (the perf measurements, the bit-identical
proof output, any screenshots) to `docs/sessions/<S>/` (gitignored). Update `CLAUDE.md` (commands/ratchet/
bundle size, the `bestspot`/`pairspot` architecture entries + any new `grid.ts`, and the new hard-won lesson —
the derived-value-cap discipline), `docs/security.md` (mark the worst-case-CPU limit CLOSED with numbers),
`docs/ideas.md` (mark the grid-loop-cap half of P0 done), and the `docs/master-plan.md` progress log with a
full Evidence block. Commit on the session branch, land on `main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full. Candidates, in backlog order: the auto-detect
walls overhaul (Session 12 — kickoff exists at `docs/kickoff-session-12.md`), the **guided tutorial mode**
(P1, owner-requested, full design already written in `docs/ideas.md`), or snap-furniture-to-wall-angle (P1).
