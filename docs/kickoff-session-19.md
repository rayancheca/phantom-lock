# KICKOFF — Bound the reflection search: the everyday-slowness half + the last CPU residual

Run under the **Standing Operating Protocol** at the top of [`master-plan.md`](master-plan.md) (also in
`CLAUDE.md`, auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

This is [`ideas.md`](ideas.md) **§2b**, created by S18. It is **HEAVY** by the objective triggers: it
touches the engine (`src/engine/pairspot.ts`, `src/engine/bestspot.ts` — the frozen set) and it will edit
more than one file. It therefore MUST get: a multi-agent Workflow (parallel understand → design → an
adversarial skeptic that tries to REFUTE each change against the real code), full implementation (no
stubs/TODOs/`.skip`/`.only`/scope-narrowing), failing-test-first for every new pure behaviour, a
self-review agent pass over the ACTUAL diff, and a handoff with an Evidence block.

---

## Why this exists

S18 capped the grid loops and took an import-legal payload from **264.6 s to 4.9 s** per simulation pass.
It explicitly did **not** deliver the other half of what `ideas.md` §2 promised, and the reason is
structural, not effort. Measured after S18:

| scene | per simulation pass | note |
|---|---|---|
| 50-room "Add a room…" chain, 4 speakers | **14.2 s** | *unchanged* by the cap |
| 100-room chain, 4 speakers | **106.1 s** | *unchanged* by the cap |
| 20 walls / 64 speakers / span 399 (import-legal) | **132.2 s** | the last security residual |

All three are dominated by **`bestReflectionDb`** (`src/engine/pairspot.ts`), the blocked-line-of-sight
fallback. It is O(walls × (objects + surfaces)) per (cell, speaker) and fires on nearly every cell of a
heavily-walled house. S18's cost proxy deliberately omits that term, because **a legitimate multi-room
house is the wall-heaviest thing in the app**: measured, a legit 50-room chain at the 64-speaker import
ceiling scores **20× higher** under a walls-aware model than the wall-heavy *attack* does. So the two
populations are not separable by any cheap static budget — you cannot fix this with another cap. The work
itself has to get cheaper.

Read `docs/security.md` §"Worst-case CPU" for the full table and the reasoning before designing anything.

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO (source of truth): `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Create a fresh per-session
worktree branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. ALWAYS confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST, and pass worktree-relative paths to Read/Edit/Write — otherwise your
  edits silently land in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** Run `npm install` first or every gate
  command fails confusingly. After you land on `main`, `npm install` in the ROOT checkout too.
- ⚠️ **TRAP 3 — the shell cwd persists between Bash calls.** Prefer absolute paths or re-`cd`.
- ⚠️ **TRAP 4 — `.claude/launch.json` is TRACKED.** Do not overwrite it; its `autoPort: true` stops your
  dev server stealing the owner's :5173.
- ⚠️ **TRAP 5 — verify by OBSERVATION/MEASUREMENT, not API readback.** For a PERFORMANCE change this is the
  whole game. Measure wall-clock before AND after on the real payloads, and assert bit-identity separately.
- ⚠️ **TRAP 6 — `git stash` a partial revert and the pop may never run.** S18 stashed the engine edits to
  regenerate a pre-change golden; the regeneration timed out at 10 minutes and the `&&`-chained
  `git stash pop` never executed, leaving the tree silently uncapped. If you stash, pop in a SEPARATE
  command and verify with `git stash list` + `git diff --stat`.
- ⚠️ **TRAP 7 — a wall-clock assertion in the suite WILL flake.** S18's "under 10 s" check passed under
  `npm test` and failed at 10.18 s under `npm run test:coverage`, with correct code. Assert deterministic
  integers (operation counts, cell counts); keep timings in `docs/sessions/<S>/` artifacts.

Commit a baseline, then again after the gate passes. Land with
`git -C <REPO_ROOT> merge --ff-only <branch>` then `git -C <REPO_ROOT> push origin main`.
Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and
PASTE the literal tails to confirm the baseline is green. Baseline as of 2026-07-27: **lint 0 · 757 tests ·
411.66 kB / 132.68 kB gz**. TEST COUNT IS A RATCHET (…666→711→757) — it must never drop, and no test may be
newly skipped/`.only`'d/weakened.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file), `docs/master-plan.md` (protocol + the S18 entry),
   `docs/security.md` (§"Worst-case CPU"), `docs/ideas.md` (§2b/§2c). Map every site before touching it.
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). Do not solo
   heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. Report each verdict. On this project skeptics have
   caught data-loss bugs, a DoS estimate wrong by two orders of magnitude, a reflex-arc render bug a
   screenshot missed, and (S18) a live data-loss-class calibration bug in an already-landed implementation
   plus a reachable infinite loop that a previous session had recorded as closed.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>". A
   split is legitimate ONLY if the shipped slice fully satisfies a NAMED subset of the Acceptance and the
   remainder is rescheduled with its own Acceptance.
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure
   behaviour, never let the count drop below 757. Run `npm run test:coverage`; paste the coverage line for
   every file you touched (≥80%, or state the exact reason). Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` +
   `performance-optimizer`) over the ACTUAL diff. Fix everything real, then re-verify. Prefer plain-text
   returns for reviewer agents; a strict StructuredOutput schema killed one before.
8. **Data safety.** Export-all before any live test that writes persistence; test on a disposable DUPLICATE,
   and prefer a FRESH headless-Chrome profile (fresh origin ⇒ own IndexedDB). NEVER delete the owner's
   layouts.
9. **Verification gate — proven, not paraphrased.** Paste the literal tails of `npm run lint`, `npm test`
   (with count) and `npm run build` (with gz size). Any red = not done.
10. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count · pasted
    gate output · saved artifact paths · each Acceptance bullet → met/deferred. State honestly: live checks
    run ONE browser; no real screen reader has ever been driven.

## 2. YOUR TASK

Make `bestReflectionDb` cheap enough that a legitimately-built large house is usable, **without changing
its output for any scene**. This is an optimization, not a behaviour change: it must be byte-identical
everywhere, not merely "close".

`src/engine/pairspot.ts` `bestReflectionDb` (called from `bestspot.ts` on every occluded speaker-cell pair,
and from `pairspot.ts` `reachDb`) currently, per call:

- loops **every wall** in the scene;
- for each wall surviving the mirror-crossing test, loops **every object** for the open-door check;
- allocates a fresh `surfaces.filter(s => s.objectId !== w.id)` array **per wall, per speaker, per cell** —
  a GC firehose at scale;
- runs **two** `directPath` calls, each O(surfaces).

Angles worth measuring (the design Workflow should compare, not assume):

- **Hoist the per-wall `legSurfaces` filter.** It depends only on the wall, not the cell — so it is
  recomputed millions of times for the same answer. A per-call `Map<wallId, Surface[]>` built once, or an
  index-based skip inside `directPath`, removes an allocation from the innermost loop.
- **Precompute per-wall geometry once per call** (`wlen`, `dir`, the door spans) instead of per cell.
- **Early-out on walls whose mirror image cannot reach the cell** — a cheap bounding test before the
  expensive leg occlusion.
- **A spatial index over walls/surfaces** (uniform grid or simple BVH). `directPath` has no
  broad-phase reject at all today, so every ray tests every surface.
- **Memoise per (speaker, wall)** rather than per (speaker, wall, cell) wherever the quantity allows it.

Whatever you choose, the observable result of `bestReflectionDb`, `bestPairSpot`, `bestListeningSpot`,
`computeAudio` and `traceScene` must not move.

**Reuse S18's harness — it was built for exactly this.** `docs/sessions/S18/bench/` (gitignored) has
`grid-cost.ts` (timing across legit + adversarial payloads), `make-golden.ts` (capture a pre-change golden
from the CURRENT engine — do this FIRST, before you touch anything), `verify-equivalence.ts` (byte-compare
against it), `recalibrate.ts`, and `shoot.mjs` (fresh-profile CDP screenshots). Copy the directory to
`docs/sessions/S19/bench/` and re-point the imports.

## 3. SCOPE GUARD

The frozen set is `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot}.ts`. This task
DELIBERATELY edits `pairspot.ts` and probably `raytrace.ts` (`directPath`/`collectSurfaces`) — authorized,
but each edit gets its own skeptic pass and a byte-identical proof. Do not regress the S7 a11y work, the
S13–S16 design system, the S8 security posture, or the S18 grid cap (its constants are calibrated against
`src/engine/__tests__/fixtures/legit-scenes.ts` — if your change alters `surfaces.length` or object counts,
**re-derive them against that list**).

## 4. ACCEPTANCE

- A 50-room "Add a room…" chain drops from **14.2 s** to **under ~2 s** per simulation pass (state the
  measured before/after on the same machine, same harness).
- The wall-heavy import-legal payload (20 walls / 64 speakers / 32 pairs / span 399) drops from **132.2 s**
  to **under ~10 s**.
- **Byte-identical output** for every scene in `src/engine/__tests__/fixtures/legit-scenes.ts` AND for the
  adversarial payloads — proven against a golden captured from the pre-change engine, with a negative
  control proving the harness can fail. (S18's `verify-equivalence.ts` does this; extend it to cover
  `bestReflectionDb` directly and the adversarial scenes.)
- Any new pure helper is failing-first tested in the node project; the ratchet rises above 757.
- If a spatial index is added, its correctness is tested independently (a brute-force oracle comparison
  over randomized scenes is the right shape).
- Gate green: lint 0 · ≥757 tests · build clean, all three tails pasted.
- `docs/security.md` §"Worst-case CPU" updated with the new residual numbers; `docs/ideas.md` §2b marked
  done (or the remainder rescheduled with its own Acceptance).

## 5. LIVE VERIFICATION

Mostly an engine change, so unit tests + measured benchmarks are the primary proof. But the best-spot ★ and
the verdict ARE observable: seed a disposable large-but-legit layout in a fresh CDP profile, confirm the app
stays responsive while editing, and screenshot the ★/verdict rendering unchanged in BOTH themes. Save to
`docs/sessions/S19/`. No saved artifact = the live check did not happen.

## 6. FINISH

Paste the literal gate tails. Spawn `code-reviewer` + `silent-failure-hunter` + `performance-optimizer` over
the ACTUAL diff; fix everything real; re-verify. Update `CLAUDE.md` (commands/ratchet/bundle size, the
`pairspot`/`raytrace` architecture entries, any new hard-won lesson), `docs/security.md`, `docs/ideas.md`,
and the `docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full. Candidates, in backlog order: **the
auto-detect walls overhaul** (P0, still the only P0 — kickoff already exists at
[`kickoff-session-12.md`](kickoff-session-12.md)), the **guided tutorial mode** (P1, owner-requested, full
design in `docs/ideas.md` §3), **§2c** (bound `traceScene` + `arrange.openSlots`), or snap-furniture-to-a-
wall's-angle (P1).
