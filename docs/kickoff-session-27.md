# KICKOFF — Session 27

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Where the project is

Four sessions landed in a row on `main`:

- **S23** — the furniture wall-seat magnet (drag half).
- **S24** — the generator wrote door/window angles in **degrees into a radians field**.
- **S25** — `rooms.ts` `regionOf` **walked through walls**; 19 of 300 generated designs had escaped
  the building. Now 0.
- **S26** — **the S25 P0 was REFUTED**, and a different defect was found underneath it. See §3.

**Baseline as of 2026-07-29 (`main` @ `33cc9ca`):** `npm run lint` 0 · `npm test` **1388** (67 files) ·
`npm run build` **479.80 kB / 156.27 kB gz** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML.

**TEST COUNT IS A RATCHET** (…1354 → 1356 → 1365 → **1388**). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install` first.
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. `cp` aside / `git show <sha>:<file> > /tmp/…`,
  measure, restore — each step its own command, verified with `git status`. S26's old-vs-new comparison
  is a worked example: `git show main:src/engine/detect.ts > /tmp/oldengine/detect.ts`, rewrite its
  relative imports to absolute ones pointing at the live siblings, bundle from /tmp.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every reviewer finding against the tree yourself.** In S26 this cut both
  ways and it was the most valuable rule in the session: agents found **two real holes in the main
  thread's own fix** (both shipped-and-reproduced), corrected **the main thread's own harness** (it had
  repeated the very error it was diagnosing), and were themselves **refuted three times** — a stale
  "the evidence doesn't exist" claim, a margin figure that was a measurement artifact, and a
  confidently-stated mechanism (strokeWidth) that controlled substitution disproved. Read every
  finding, re-measure the load-bearing ones, record what you rejected and why.
- ⚠️ **TRAP 10** — `vite preview` binds `localhost`, not `127.0.0.1` — **and it silently moves port if
  4173/4174 are taken.** S26's first run got a 404 from someone else's server on 4173. Read the port
  vite prints and pass it as `BASE`.
- ⚠️ **TRAP 11** — workflow agents write scratch into `src/`. Run
  `git ls-files --others --exclude-standard src/` before EVERY gate.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree. Tell them "/tmp only"; it works.
- ⚠️ **TRAP 15** — a workflow phase can run long. Prefer several small workflows over one deep one.
- ⚠️ **TRAP 16 (new, S26)** — **Node's built-in WebSocket silently drops a multi-MB CDP frame.** A
  harness that shipped a 1218×1600 ImageData back from the page just timed out, with no error. Keep CDP
  payloads small (≤ ~2.5 MB worked; ~7.8 MB did not) or write to disk from the page side.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`, then
`git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained 5 entries in S26 and its three S25
   detection entries were **rewritten** (one of them was simply wrong). Plus `docs/master-plan.md`,
   `docs/ideas.md`, and — before touching detection — `docs/sessions/S26/bench/README.md`.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1388**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff. In S26 they found two shipped bugs the
   main thread had introduced an hour earlier. This step is not a formality.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project.

**The meta-lesson, which fired again in S26 and is now four sessions old:** when you fix a bug, run the
*other* wrong answer past your new test. S26's monotonic-knob test passed with the knob **disabled**;
its `referenceStructure` was scored at the wrong corner radius with **66/66 green**; two wrong contracts
for a new public option passed because it had no unit tests. Every one of those was found by writing the
wrong version deliberately. A test that only distinguishes "old" from "new" is half a test.

---

## 2. YOUR TASK — §13b. It is the head of the queue and it is well-characterised.

### 2a. §13b — the detection verdict is UNSTABLE under exposure (**P1 — high**, ~1 session)

Measured on the owner's real plan, through the app's real chain, applying a gamma curve as a stand-in
for a slightly different exposure of the same drawing (`docs/sessions/S26/bench/otsu-mechanism.txt`):

| gamma | Otsu cut | raw ink px | strokeWidth | walls @1.0 | structure | verdict |
|---|---|---|---|---|---|---|
| 1.00 | 175 | 32 376 | 14.0 | 15 | 0.500 | ok |
| 1.02 | 174 | 32 376 | 14.0 | 15 | 0.500 | ok |
| **1.05** | **208** | **107 365** | 10.7 | 13 | **0.077** | **REFUSED** |
| 1.15 | 205 | 107 931 | 10.4 | 12 | 0.083 | REFUSED |
| 1.50 | 195 | 109 927 | 12.0 | 17 | 0.353 | ok |

**A 5 % darkening triples the ink and the plan is refused.** The mechanism is settled and it is NOT
what it first looks like: an independent skeptic reproduced the same discontinuity along a different
axis (JPEG quality 0.49–0.51) and showed by controlled substitution that forcing `strokeWidth` back to
its correct value leaves structure at 0.000, and injecting the correct dominant angle does too. Stroke
width and the 69°→0.5° dominant-axis flip are **symptoms**. The cause is the **Otsu threshold**, which
is bimodal on this image: it swallows the whole annotation layer in one step.

**Why this plan in particular:** its dimension lines are drawn in a LIGHTER TONE than its walls
(measured — poché ≈96–103, annotation 120–173, paper ≈203), so the Otsu cut sits right at the top of the
annotation band. Any plan drawn that way is exposed.

**Order of work:**

1. **Build a fixture that pins the discontinuity.** `floorplan-raster.ts` currently has ONE ink value
   for the whole page, so it *cannot* draw light annotation against dark walls — which is exactly the
   property that makes the real plan fragile. An S26 agent prototyped the fix and **verified it
   byte-identical on all 22 pre-existing fixtures**: add an optional `ink?: number` to `WallSpec`,
   `BlobSpec` and `SpeckleSpec` and thread it as `wl.ink ?? ink` at the five draw sites in `rasterize`.
   Do that first; without it no fixture can reproduce this.
2. **Then fix the ink model**, not the threshold. Candidates, in order: a hysteresis or bimodality check
   around the Otsu cut; a two-class ink model that keeps light annotation OUT of the wall mask rather
   than letting one global threshold decide; and only then anything downstream.
3. **Re-measure the owner's photo at every step** through `browser-resample.mjs` (both stages) — and
   read `docs/sessions/S26/bench/README.md` first, which exists because three sessions running measured
   the wrong chain.

**Acceptance:** a fixture that reproduces the light-annotation-on-dark-walls shape and pins the
discontinuity · the owner's plan's verdict stable across a ±10 % exposure sweep · both/all three nulls
still refused · corpus mean floor (0.92) held, with the current headroom of 2.6 points stated.

**Prototyped in S26 and deliberately NOT shipped:** a graded `structureScore` (a distance falloff
instead of the binary `<= radius`). Measured, it lifts every legit fixture while leaving BOTH original
nulls at exactly 0.000 — so it does not weaken the discriminator. It was held back because the Otsu
instability is upstream of it and shipping it first would look like a threshold move in disguise.
Reconsider it AFTER §13b, not before.

### 2b. Creation-time alignment (P1, small — do this second)

`App.tsx:446` (palette drop) and `SimCanvas.tsx:1015` (rubber-band draw) both hardcode `rotation: 0`, so
on the owner's skewed plan **every new rect arrives crooked** before any drag. Same helper as S23's
magnet, ~2 call sites. Smallest change with the biggest everyday effect.

### 2c. §4b — the explicit seat COMMAND (`docs/ideas.md` §4b, P1, ~½ session — third)

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

### 2d. Others

Export-all bundle IMPORTER (P2 — still write-only) · detection's worst case (P2) · `App.tsx`
decomposition (1290 lines vs an 800 cap) · the read-only 3D view (P2, `docs/3d-view-plan.md`).

---

## 3. WHAT S26 DID, AND WHAT IT LEFT

**The P0 is gone — it was never real.** S25's "detection REFUSES the owner's own floorplan at the
default" measured the ORIGINAL 1320×1734 file. The app has two unconditional lossy stages in front of
`detectWalls` (`buildUnderlay` 1600 + JPEG q0.72, then `WORK_MAX` 900). Through the real chain the plan
is accepted at all three levels: **9 / 15 / 24 walls at 74 / 85 / 92 %**, confirmed by driving the real
UI with the owner's actual file (`docs/sessions/S26/shots/`).

**What shipped instead:**

- **The monotonic-knob guarantee.** The knob may change WHICH walls are offered; it can never, by
  itself, turn an accepted image into "this doesn't look like a floorplan." Three guard conditions,
  each measured.
- **A refusal now carries a `RefusalCause`**, and the toast names the level that would actually help —
  skipping the one the engine already tried, and saying nothing at all for a browser failure.
- **Two corpus fixtures**: `oblique-survey` (lowest structure margin in the corpus, 0.346 at the
  default) and `no-plan-shelf` (the null that beat the first cut of the fix).
- **A `resolution` test block** — the corpus had never exercised the app's downscale, by construction.

**Left open, honestly:**

- **§13b above** is the real remaining defect.
- **The Careful margin on the owner's plan is ONE junction** — structure 0.278, i.e. 5 of 18 endpoints
  joined, where 4 of 18 = 0.222 would refuse. Tightest reachable margin in the app.
- **Corpus mean is 94.6 % against a `MEAN_FLOOR` of 0.92** — 2.6 points, down from 3.6, because
  `oblique-survey` scores 74.7 % by design. Adding another hard fixture will need the floor revisited.
- **`scalePlan` does not scale two annotation stroke widths** (`drawSpeckle`'s hardcoded 1.2 px and
  `ArcSpec.thickness`'s 1.4 default) because no spec field exists for them. The resolution tests
  therefore run on a slightly EASIER drawing than the fixture they name; the comment says so and the
  floors are set with it in mind. The `ink?:` work in §2a is the natural moment to fix this too.
- **A residual in the pooling guard, recorded rather than hidden:** the user's reading must have
  `structure > 0` to be rescued. A reading with a single joined endpoint out of many would still be
  pooled. The measured corpus gap is 0.000 vs 0.222, so nothing sits near the line today.
- **`sameRegion` still has NO production caller** (S25's note, unchanged).
- **`optimize.ts:265` still has no `area > 2` guard** while its two siblings do.

---

## 4. LIVE VERIFICATION

`docs/sessions/S26/{cdp.mjs,live-owner-plan.mjs,live-fixture.mjs}` plus `S23/{shoot,live,live-seat}.mjs`
is a working, copyable, zero-dependency harness (Node's built-in WebSocket + fetch).

**`live-owner-plan.mjs` is the newest worked example and the one to copy for anything image-related:**
it feeds a real file through the app's OWN hidden file input, so the image travels `buildUnderlay` → the
underlay record → `detectWallsFromUnderlay` exactly as a user's does, then clicks the real button and
reads the real card. It asserts a fresh profile (`phantom-lock:v2` must be null) before trusting
anything. That run is the only evidence in S26 that needed no argument.

`docs/sessions/` is gitignored, so those files are local-only — copy them into your session directory.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what is
real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
