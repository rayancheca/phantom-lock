# KICKOFF — Session 28

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Where the project is

Five sessions landed in a row on `main`:

- **S23** — the furniture wall-seat magnet (drag half).
- **S24** — the generator wrote door/window angles in **degrees into a radians field**.
- **S25** — `rooms.ts` `regionOf` **walked through walls**.
- **S26** — the S25 P0 was **REFUTED**; the monotonic-knob guarantee shipped instead.
- **S27** — detection's threshold was **decided by flat area**. See §3.

**Baseline — READ THIS CAREFULLY.** `main` is still at S26: `npm test` **1388**, JS **479.80 kB /
156.27 kB gz**. The S27 work is on branch `session-27-detect-exposure` (1393 tests, 480.37 kB /
156.51 kB gz, all three gates green) and was deliberately NOT landed — see §2a. Start by deciding
whether to fix that branch forward or rebuild the fix on the candidate design; the branch's tests,
fixtures and measurement harnesses are worth keeping either way.

**TEST COUNT IS A RATCHET** (…1365 → **1388** on main; the unlanded branch is at 1393). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

⚠️ **`npm run test:coverage` is NOT clean and has not been for some time.** `main` fails 5 tests
under it today (all `Test timed out in 5000ms`, not assertion failures); after S27 the branch failed
1. The counts are noisy — they depend on machine load — so treat "did I make it worse?" as the
question, not "is it zero?". The cause is the S18 lesson: v8 instrumentation makes detection several
times slower, so work inside an `it` that passes under `npm test` blows the 5 000 ms default. The fix
is always to hoist to module scope, never to raise a timeout. **Cleaning this up properly is a
worthwhile small task if you want one** (see §2e).

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install` first (or symlink
  the main repo's, which S27 did to check `main` under coverage).
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole `src/` tree to /tmp and patch THERE;
  S27 used `/tmp/s27v` (pre-change engine, env-switchable) and `/tmp/s27g` (guard-disabled variants)
  throughout, which is what made every before/after number reproducible on demand.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet. This bit S27's coverage
  timings directly.
- ⚠️ **TRAP 9** — **adjudicate every reviewer finding against the tree yourself.** In S27 an agent
  refuted the main thread's own FRAMING of the bug ("exposure") and was right — re-measured before a
  word changed. Another proved an impossibility result that turned out to *support* the shipped fix
  rather than refute it, because the fix was not in the class the proof covered. Read carefully.
- ⚠️ **TRAP 10** — `vite preview` binds `localhost` and silently moves port if 4173 is taken. Read the
  port it prints and pass it as `BASE`.
- ⚠️ **TRAP 11** — workflow agents write scratch into `src/`. Run
  `git ls-files --others --exclude-standard src/` before EVERY gate. (Telling them "/tmp only" worked
  in S27 — zero strays across 12 agents.)
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree.
- ⚠️ **TRAP 15** — a workflow phase can run long. Prefer several small workflows over one deep one.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. Keep payloads small.
- ⚠️ **TRAP 17 (new, S27)** — **zsh does not word-split unquoted parameters.** `set -- $c` inside a
  loop leaves `$1` holding the whole string, so a parameter sweep silently runs the DEFAULTS every
  time and prints identical rows you may read as "no effect". Sweep in Node, or use `${=c}`.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`, then
`git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained FOUR entries in S27 and the
   detection architecture note changed. Plus `docs/master-plan.md`, `docs/ideas.md`, and — before
   touching detection — `docs/sessions/S26/bench/README.md` and `docs/sessions/S27/bench/RESULTS.txt`.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below the floor you START from — **1388** if you branch from `main`, **1393** if you build on the S27 branch. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project.

**The meta-lesson, five sessions old now:** when you fix a bug, run the *other* wrong answer past your
new test. S27's own two candidate threshold rules were killed by its own measurements before any agent
reported — one moved 13 of 24 corpus masks, the other 21 of 24 — and the shipped fix then had a real
bug (a zero-padded buffer manufacturing a border edge) that only a REGRESSION check against the old
behaviour caught. The code looked right.

---

## 2. YOUR TASK

### 2a. §13d — **P0. Land S27's fix without its mirror regression.**

**S27 did not land.** Its work is committed on branch `session-27-detect-exposure` (6 commits, all
three gates green, live-verified) and `main` is untouched. The reason is in `docs/ideas.md` §13d and
it was found by S27's own self-review and then reproduced by the main thread.

Gradient weighting scales a tone's weight in the histogram by its perimeter-to-area ratio — by
**1/thickness**. It suppresses flat masses as designed, but it equally AMPLIFIES thin ink and DEMOTES
thick ink. On a plan drawn with **light poché walls and thin dark dimension lines** — an ordinary
architectural convention — the linework captures the threshold and every wall is dropped:

| thin dark dimension lines | pre-S27 | S27 branch |
|---|---|---|
| 0 | ok, 92–100 % | ok, 92–100 % |
| 1 | ok | **REFUSED, 0 %** |
| 2 | ok, 80 % | **REFUSED, 0 %** |
| 4 | ok, 68 % | **REFUSED, 0 %** |

One 3 px dark line — 0.33 % of the page — is enough, on 5 of 5 seeds, at every scale through the app's
real chain. And it is silent in the worst way: `support` and `explained` both read 1.000 (they are
measured against the mask the pipeline itself produced), and the user is told *"This image doesn't
have enough clear straight lines to read as a floorplan"* about ten perfectly clear straight walls.

**The remedy is already designed and measured — do not re-derive it.** Make the gradient-weighted
threshold an additional CANDIDATE rather than a replacement: `otsuCandidates` returns the argmax plus
the near-tied rival, `detectWalls` reads at each, and `assessDetection` picks the winner. An S27
design agent measured that shape **byte-identical on all 24 corpus fixtures at all three UI levels**,
and it took the owner's plan from 38/138 refusals to 0/138. Because it never REMOVES a candidate it
cannot produce this regression. Its full patch is in the S27 workflow journal (run
`wf_6af6103b-100`, the `threshold-rule` agent).

**Acceptance:** the polarity fixture above reads on BOTH engines · the owner's plan still 0/138 ·
corpus mean holds (≥ 95.48 % is achievable; ≥ 92 % is the floor) · all three nulls refused · the
polarity case becomes a corpus fixture, because the corpus is single-ink-tone by construction and
cannot express it (that is exactly how this got shipped past the first review).

Take the smaller S27 findings with it — they are all recorded in `mask.ts` and were left as comments
rather than fixes: `MIN_EDGE_FRACTION` is a fraction of AREA while what it counts scales as PERIMETER
(so `clean-rect` starves at 3×, and 12 of 22 fixtures at 4×), and the starvation fallback silently
re-arms the pre-S27 bug with nothing in `DetectionQuality` recording that it happened.

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

### 2d. The `scalePlan` annotation-stroke gap (P2, small — and S27 deliberately did NOT bundle it)

`drawSpeckle` hardcodes a 1.2 px mark stroke and `ArcSpec.thickness` defaults to 1.4, and `scalePlan`
cannot carry either because no spec field exists — so the resolution tests run on a slightly EASIER
drawing than the fixture they name. S27 added per-element `ink?:` to the same three spec types and
could have added `thickness?:` alongside, but an agent MEASURED that doing so moves
`apartment-annotated` at 2.5× from 99.7 % to 91.7 %. That is a resolution-test number, and it must not
ride along silently inside a change whose whole claim is byte-identity. Its own commit, with the
`scalePlan` doc comment rewritten (its "21 / 0.310 / 63.6 %" figure for `oblique-survey` is not
reproducible — an agent measured 17 / 0.471 / 79.1 %).

### 2e. Make `npm run test:coverage` green (P2, small)

Five timeouts on `main`, all the same shape: expensive work inside an `it`. Hoist each to module
scope the way `RESULTS`, `BY_LEVEL` and now `TONE_SWEEP` already are. Do NOT raise `testTimeout` —
the file comments explain at length why that is the wrong fix.

### 2f. Others

Export-all bundle IMPORTER (P2 — still write-only) · detection's worst case (P2) · §13c, the one case
gradient weighting does not cover (P3) · `App.tsx` decomposition (**1290** lines vs an 800 cap) · the
read-only 3D view (P2, `docs/3d-view-plan.md`).

---

## 3. WHAT S27 DID, AND WHAT IT LEFT

**§13b is SOLVED BUT NOT LANDED** — see §2a for why. The verdict instability was real, and neither
its cause nor its axis was what the section said.

- **Cause.** The owner's file has flat grey **letterbox bars** over **11.1 %** of the page at
  luminance ~198 (verified in the original 1320×1734 PNG, standard deviation 0.0 — digital padding).
  That makes the page trimodal, and Otsu assumes bimodal, so its criterion has two near-tied maxima —
  **175 at 100.00 % against 209 at 98.07 %** — one giving 4.6 % ink and the other 17.4 %.
- **Axis.** Not exposure. Measured: a gamma curve refuses **26 of 41**, linear gain across ±0.3 EV
  refuses **0 of 46**, an additive lift refuses **0 of 41**. Gain preserves ratios and lift preserves
  differences; only a tone CURVE reorders the two optima. A regression test that perturbed brightness
  would have passed on the broken engine. S26's claim that JPEG q0.49–0.51 does the same is refuted.
- **Fix.** `inkMaskOf` chooses its threshold on a **gradient-weighted histogram** (`EDGE_GATE` 16,
  `MIN_EDGE_FRACTION` 2 %). A plain histogram counts AREA; area is the wrong vote for "where does ink
  end?".
- **Result.** Owner **38/138 refusals → 0/138** over gamma 0.70–1.60 × 3 levels. Corpus mean
  **94.82 % → 95.48 %** over the same 22 fixtures; every floor held; all three nulls still refused.
  Real UI re-verified at **9 / 15 / 24 walls (74 / 85 / 92 %)**, identical to S26.
- **New fixture** `scan-letterbox` — the corpus's first page with THREE tone masses. Note the reason
  it needed ink 86 rather than the corpus default 26: with ink 26 the near-tie is arithmetically
  impossible (2287 against 1457), and a 540-combination sweep that held ink at 26 found nothing.
- **Two S26 negative controls were RE-DERIVED**, not relaxed, because detection improved on the
  degraded inputs they used. New vehicles were proven load-bearing by disabling the guard and watching
  the verdict flip.

**Left open, honestly:**

- **§13c** — gradient weighting separates a FLAT mass from thin strokes. A large mid-tone mass that is
  heavily TEXTURED (halftone, dithering, dense hatching over a big area) would still vote like ink.
  Nothing measured exhibits it; P3, not pre-empted.
- **`test:coverage` is not green** (see the banner above and §2e).
- **`scalePlan`'s annotation strokes** (§2d).
- **The Careful margin on the owner's plan is still one junction** — structure 0.278 at 'Careful',
  i.e. 5 of 18 endpoints joined, where 4 of 18 = 0.222 would refuse. Unchanged by S27 and still the
  tightest reachable margin in the app.
- **`sameRegion` still has NO production caller**; **`optimize.ts:265` still has no `area > 2` guard**
  while its two siblings do.
- **§13d, the P0.** The design agent's alternative (read at BOTH near-tied cuts, let
  `assessDetection` choose) was passed over during the session because it is byte-identical on the
  corpus where the gradient fix *improves* it. The self-review then found the mirror regression, which
  that design cannot produce — so it is now the recommended remedy, not a runner-up. §2a has it.

---

## 4. LIVE VERIFICATION

`docs/sessions/S27/{cdp.mjs,live-owner-plan.mjs,live-fixture.mjs}` plus `S23/{shoot,live,live-seat}.mjs`
is a working, copyable, zero-dependency harness (Node's built-in WebSocket + fetch).

**`live-owner-plan.mjs` is the one to copy for anything image-related.** It feeds a real file through
the app's OWN hidden file input, so the image travels `buildUnderlay` → the underlay record →
`detectWallsFromUnderlay` exactly as a user's does, then clicks the real button and reads the real
card. It asserts a fresh profile (`phantom-lock:v2` must be null) before trusting anything.

`docs/sessions/` is gitignored, so those files are local-only — copy them into your session directory.
`docs/sessions/S27/bench/owner-plan.png` (the owner's real plan, 1320×1734) and
`docs/sessions/S26/bench/owner-appchain.bin` (the app-chain bytes, 685×900) both survive and are the
artefacts every detection measurement should start from.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what is
real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
