# KICKOFF — Session 26

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Where the project is

Three sessions landed in a row on `main`:

- **S23** — the furniture wall-seat magnet (drag half). Drag a sofa or the TV within 0.35 m of a wall's
  FACE and it takes the wall's angle; within 0.15 m it seats flush. Shift escapes.
- **S24** — the generator wrote door/window angles in **degrees into a radians field**. 50.7 % of every
  generated opening was drawn wrong. Fixed; `wallKeptSpans` is rotation-blind so the acoustics were
  never affected, but the drawn symbol, the zoning fill, the furniture arranger and window surfaces all
  were.
- **S25** — `rooms.ts` `regionOf` **walked through walls**. `segsCross` implemented *proper* segment
  intersection only, and the app manufactures exact zeros (grid origin ← `sceneBounds` ← door rect
  corners). 19 of 300 generated multi-room designs had a zoning region that had escaped the building.
  Now 0.

**Baseline as of 2026-07-29 (`main` @ `ea3ef6a`):** `npm run lint` 0 · `npm test` **1365** (67 files) ·
`npm run build` **479.06 kB / 155.95 kB gz** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML.

**TEST COUNT IS A RATCHET** (…1316 → 1354 → 1356 → 1364 → **1365**). Never let it drop; no test may be
newly skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install` first.
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always. (S24 lost a
  command to this inside a single batch.)
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. `cp` aside, `git checkout <sha> -- <file>`,
  measure, `cp` back — each step its own command, verified with `git status`.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite (bitten in S18 and S22).
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every reviewer finding against the tree yourself.** In S25 the reviewers
  raised two CRITICALs and both were wrong (see §3); in S24 one HIGH was right and saved the diff. Read
  every finding, re-measure the load-bearing ones, and record which you rejected and why.
- ⚠️ **TRAP 10** — `vite preview` binds `localhost`, not `127.0.0.1`.
- ⚠️ **TRAP 11** — workflow agents write scratch files into `src/`. Run
  `git ls-files --others --exclude-standard src/` before EVERY gate, not just `git status`.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING; the app
  autosaves to IndexedDB and ignores the legacy key on a pristine origin. Boot once, write the probe
  layout into IDB, reload, and assert the layout switcher shows your layout's name.
- ⚠️ **TRAP 14 (new, S24/S25)** — **never let a measurement agent write into your worktree.** S24's
  skeptic applied and reverted the fix six times while the main thread was editing the same files and
  left eight `zz*.test.ts` files in `src/` that joined `npm test` and broke the gate twice. S25's
  agents were told to write probes to `/tmp` only and did — that instruction works, use it. Give
  measurement agents a COPIED tree, or forbid writes and have them report what they would measure.
- ⚠️ **TRAP 15 (new, S25)** — a workflow phase can run long enough to stall the session. S25's design
  phase ran over an hour after its decision had already been made and measured in the main thread;
  `TaskStop` is the right move. Prefer several small workflows over one deep one.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`, then
`git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>` — backticks in a
`-m` string get shell-expanded.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained 4 entries in S23, 4 in S24 and 5 in
   S25 — plus `docs/master-plan.md` and `docs/ideas.md`.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1365**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project.

**And the meta-lesson from the last three sessions, because it fired every time:** when you fix a bug,
run the *other* wrong answer past your new test. S24's axis-snap variant passed all 40 tests; S25's
partial fix passed 22 of 23. A test that only distinguishes "old" from "new" is half a test.

---

## 2. YOUR TASK — §13 FIRST. It is a P0 and it breaks the owner's primary use case.

The owner was asked to choose between §4b and creation-time alignment and answered *"idk both. or you
pick idrc."* Both are scheduled below — but a P0 landed after that question was asked, and it outranks
them.

### 2a. §13 — detection REFUSES the owner's own floorplan (**P0**, ~1 session)

Measured 2026-07-29 on their real plan (`IMG_7421.jpeg`, repo root, **gitignored — never commit it**),
through the REAL app path `detectWalls` (which includes the refusal), NOT `detectSegments`:

| sensitivity | walls | confidence | support | structure | explained | verdict |
|---|---|---|---|---|---|---|
| 0.6 | 9 | 62.2 % | 1.000 | 0.111 | 0.645 | REFUSED |
| **1.0 (default)** | **13** | **71.5 %** | **1.000** | **0.231** | **0.816** | **REFUSED** |
| 1.5 | 21 | 87.4 % | 1.000 | 0.548 | 0.866 | ok |

At the default the app says *"The lines in this image don't join up into rooms, so it doesn't look like
a floorplan."* **Look at `docs/sessions/S25/bench/owner-plan-default.png` before you touch anything —
that message is false.** The trace covers the left exterior wall, both angled top walls, the long right
diagonal, the kitchen partition, the small-room partitions and the bathroom.

**The corpus is the thing that is wrong**, and this is the whole difficulty: nulls measure **0.000**,
the lowest LEGIT fixture is **0.425**, and the real photo sits at **0.231** in a gap no synthetic
occupies. Full per-fixture table in `docs/ideas.md` §13.

**Order of work, and do not skip step 1:**

1. **Build a synthetic corpus fixture that reproduces the real plan's characteristics** — dense
   dimension-line annotation on every wall, thick filled poché, chamfered corners, a non-rectangular
   envelope, ~10° skew — and confirm it measures ≈0.23. Without it there is no regression guard, because
   the only real artefact is a photo of the owner's home and
   `src/engine/__tests__/fixtures/` is COMMITTED to a public repo.
2. **Fix the ROOT CAUSE, not the constant.** `structure` RISES with sensitivity (0.111 → 0.231 → 0.548)
   because more segments means more endpoints that meet — so the default is UNDER-reading (13 segments
   for a 20+-wall plan) and `joinCorners` is not closing corners that are chamfered and buried in
   annotation. Fixing that raises the metric legitimately.
3. **Only then** reconsider `MIN_STRUCTURE`, with the null margin (0.000) as headroom.
4. Re-run the owner's photo at every step. The harness's `--image` flag uses `detectSegments` and
   therefore CANNOT see a refusal — that is the S22 "score what the USER gets" lesson, still unfixed in
   that file. Use `detectWalls`; a working runner is `docs/sessions/S25/bench/` (see `owner-floorplan.txt`
   for the output shape) and the JPEG needs `sips -s format png IMG_7421.jpeg --out /tmp/floorplan.png`
   first, since the reader is PNG-only.

**Acceptance:** the owner's plan is ACCEPTED at the default sensitivity with a confidence readout that
is not a lie · the two null fixtures still REFUSE · every existing corpus fixture keeps its score floor
· the new annotated fixture is in the committed corpus and pins ≈0.23.

### 2b. Creation-time alignment (P1, small — do this second)

`App.tsx:446` (palette drop) and `SimCanvas.tsx:1015` (rubber-band draw) both hardcode `rotation: 0`, so
on the owner's skewed plan **every new rect arrives crooked** before any drag. Same helper as S23's
magnet, ~2 call sites. Smallest change with the biggest everyday effect — which is why it goes ahead of
§4b now that the owner has said "both".

### 2c. §4b — the explicit seat COMMAND (`docs/ideas.md` §4b, P1, ~½ session — third)

Completes S23 and makes the feature discoverable. Fully designed and adversarially reviewed already —
read `docs/sessions/S23/spec-v1-REFUTED.md` §7 for the API and `spec-v2-CORRECTED.md` for corrections.
Four parts, each with a trap already found and paid for:

1. **`f` / `⇧F`**, reach 1.2 m. Keep `keyboard.ts` **byte-unchanged** — `f` already emits `flip-door`
   for any object selection in DESIGN and `flipDoor`'s same-ref-on-a-non-door contract IS the router;
   resolve in App. ⚠️ **The quarter turn must be applied AFTER the snap.** Adding π/2 to the INPUT of a
   nearest-π snap is annihilated by it (measured: a literal no-op on 13/22/37/68° walls). Write that
   test failing-first — as originally specced it is unsatisfiable.
2. **The Inspector button.** ⚠️ Gate on `role === 'furniture' || role === 'tv'`, NOT the existing
   `role !== 'door'` block, which also matches **windows** — every window would show a permanently
   disabled "Seat against wall" with a false hint. ⚠️ `InspectorPanel.door.test.tsx:53` passes ten
   explicit props with no spread, so a required eleventh breaks `tsc --noEmit` while `npm test` stays
   green (the S20 lesson).
3. **The touch-HUD button** — `SelectionActions` is coarse-pointer only, so a HUD-only button is
   invisible on a mouse. Both surfaces or neither.
4. **The on-canvas snap guide.** ⚠️ Do NOT stroke it with `wallKeptSpans` — that deletes door openings,
   so it would draw a gap exactly where the magnet is about to seat a sofa.

`ideas.md` §4's *"a no-op must not be silent"* belongs to this block: the button must be **disabled with
a reason**, not inert.

### 2d. Others

Export-all bundle IMPORTER (P2 — `db.ts` calls it a "safety net" and it is still write-only) · detection's
worst case (P2, measure before capping) · `App.tsx` decomposition (1290 lines vs an 800 cap) · the
read-only 3D view (P2, `docs/3d-view-plan.md`; needs `worker-src`/`connect-src` loosened, and the drift
test fails until `public/_headers` and `vercel.json` match).

---

## 3. THINGS S25 LEFT ON THE TABLE

- **Detection HAS now been run against the owner's own floorplan (2026-07-29) and it FAILED** — see §2a
  above and `docs/ideas.md` §13. It is the new P0. The 95.6 % corpus figure is not falsified (that
  measures accuracy on synthetic fixtures, and the trace on the real plan is genuinely good); what is
  falsified is the REFUSAL's calibration.
- **`sameRegion` has NO production caller** — the definition plus two test assertions, nothing else. Any
  "consumers verified" claim about it is vacuous. Its `dist(p, q) < CELL` short-circuit also hardcodes
  `CELL` while `regionOf` grows the cell past ~47 m spans, so it would be inconsistent with the region it
  queries if it were ever wired up. Delete it or wire it, but do not keep counting it as a consumer.
- **`optimize.ts:265` has no `area > 2` guard** while its two siblings do (`optimize.ts:426`,
  `arrange.ts:599`). S25 removed the trigger that exposed this, but the asymmetry is still there —
  defence in depth would be to add it.
- **`regionOf(doorsBlock:false)` escapes the wall envelope** on 300 of 300 generated multi-room designs
  (expected — no door blockers, so it flows out the entry door). So `walkable.area` is NOT floor area.
  Measured benign: 0 of 3192 placed pieces landed outside the envelope. Do not read it as floor area.
- **The S25 fix runs the flood fill TWICE** when the seed sits exactly on a wall centreline (rare, and
  only then). If `regionOf` ever shows up in a profile, that is the branch to look at first.

---

## 4. LIVE VERIFICATION

`docs/sessions/S23/{cdp.mjs,shoot.mjs,live.mjs,live-detect.mjs,live-seat.mjs}` is a working, copyable,
zero-dependency harness (Node's built-in WebSocket + fetch). **`live-seat.mjs` is the newest worked
example** and carries two recipes worth reusing: seeding a probe layout into **IndexedDB after a first
boot** (TRAP 13), and **locating a canvas object by consequence** — sweep points, drag each ~30 px,
check whether the target's stored centre moved, then ⌘Z. No view maths, no DOM selectors, and it cannot
silently test the wrong object. World **+y is DOWN**.

`docs/sessions/` is gitignored, so those files are local-only — copy them into your session directory.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what is
real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
