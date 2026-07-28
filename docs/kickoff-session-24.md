# KICKOFF — Session 24

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Where the project is

S23 shipped the **drag half** of "snap furniture to a wall's angle". Dragging a furniture rect or the TV
now takes the nearest wall's angle at 0.35 m of face clearance and seats flush at 0.15 m; Shift
suppresses. It matters more than the backlog said: the owner supplied their **real floorplan** this
session and it is almost entirely non-axis-aligned, so this is the primary furnishing gesture. The app
already did this for AUTO-arranged furniture (`arrange.ts` `wallSlots`), so S23 closed an inconsistency
rather than adding a feature.

**Baseline as of 2026-07-28 (post-S23, `main` @ `d687727`):** `npm run lint` 0 · `npm test` **1354**
(67 files) · `npm run build` **478.25 kB / 155.61 kB gz** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB**
HTML.

**TEST COUNT IS A RATCHET** (…1084 → 1316 → **1354**). It must never drop, and no test may be newly
skipped / `.only`'d / weakened.

---

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Create a fresh per-session branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. Confirm with `git rev-parse --show-toplevel` and pass
  worktree-relative paths, or your edits land in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** `npm install` first.
- ⚠️ **TRAP 3 — the shell cwd persists between Bash calls and a tool result can reset it.** S23 lost a
  command to this within one batch (two commands each doing a relative `cd`). **Use absolute paths.**
- ⚠️ **TRAP 4 — `.claude/launch.json` is TRACKED.** Do not overwrite it; `autoPort: true` stops your dev
  server stealing the owner's :5173.
- ⚠️ **TRAP 5 — verify by OBSERVATION, not API readback.** Seed the OLD shape, load it, assert what came
  back — never just assert what you wrote.
- ⚠️ **TRAP 6 — `git stash` a partial revert and the pop may never run.** To re-measure a pre-change
  baseline: `cp` the new file aside, `git checkout <sha> -- <file>`, measure, `cp` back — each step its
  own command, each verified with `git status`. S23 used exactly this for a negative control.
- ⚠️ **TRAP 7 — never assert wall-clock in the suite.** It has bitten twice (S18, S22). Assert
  deterministic integers; timings belong in `docs/sessions/S<n>/bench/`.
- ⚠️ **TRAP 8 — background agents make the machine noisy.** Re-measure quiet before writing a number.
- ⚠️ **TRAP 9 — a reviewer agent reads the tree at the moment it starts.** Adjudicate every finding
  against HEAD yourself. In S23 the skeptics were right about three things and **wrong about one** (see
  below) — read every finding, check each one.
- ⚠️ **TRAP 10 — `vite preview` binds `localhost`, not `127.0.0.1`.**
- ⚠️ **TRAP 11 — workflow agents write scratch files into `src/`.** `git status --short` before EVERY
  commit.
- ⚠️ **TRAP 12 — a green `npm test` proves nothing about types.** Vitest strips types with esbuild. Run
  all three gates.
- ⚠️ **TRAP 13 (new, S23) — a live harness that reads back its own seed measures NOTHING.** Seeding
  `localStorage['phantom-lock:v2']` and asserting against that key returns the frozen seed forever: the
  app autosaves to **IndexedDB** and never writes the legacy key again. Worse, on a pristine origin the
  app ignores that key and seeds its own first-run demo. Boot once, write the probe layout straight into
  IDB, reload, and **assert the layout switcher shows your layout's name** before trusting a number.

Commit a baseline, then again after the gate passes. Land with
`git -C <REPO_ROOT> merge --ff-only <branch>` then `git -C <REPO_ROOT> push origin main`. Commit messages
end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Put the message in a file and use
`git commit -F` — backticks in a `-m` string get shell-expanded.

**FIRST ACTION:** `npm install`, then run the full gate and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file — "Hard-won lessons" gained **seven** entries in S23),
   `docs/master-plan.md` (protocol + the S23 entry), `docs/ideas.md`. Map every site before touching it.
3. **Orchestrate.** Heavy → multi-agent Workflow (parallel understand → design → skeptic). A task is
   **heavy** if it changes a data model, touches persistence, touches `src/engine`, deletes/overwrites
   data, or **edits more than one file**. Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. In S23 both skeptics returned `BROKEN` /
   `SOUND_WITH_FIXES` with 15 defects, and the CRITICAL one killed a design the three judges had
   unanimously ranked first. **This step is the one that earns its keep — do not skip it, and if the
   agents die on a usage limit, re-run them rather than proceeding.**
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>".
6. **Test everything with PROOF.** Failing-test-first for every new pure behaviour; never let the count
   drop below **1354**. Paste the coverage line for every file you touched (≥80 %, or the exact reason).
   Vite routes by FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.**
8. **Double-check.** Self-review agents over the ACTUAL diff, then adjudicate each finding against HEAD.
   Fix what is real; record what you deliberately did not fix, and why.
9. **Data safety.** Export-all before any live test that writes persistence; prefer a FRESH
   headless-Chrome profile. NEVER delete the owner's layouts.
10. **Verification gate — proven, not paraphrased.** Paste literal tails of all three gates.
11. **Hand off with an Evidence block.** State honestly: live checks run ONE browser; no real screen
    reader has ever been driven on this project.

---

## 2. YOUR TASK — take §4b unless the owner says otherwise

### 2a. §4b — the explicit seat COMMAND (`docs/ideas.md` §4b, P1, ~½ session)

The natural completion of S23, and the piece that makes the feature discoverable. Four parts, all
designed and adversarially reviewed already — read `docs/sessions/S23/spec-v1-REFUTED.md` §7 for the API
and `spec-v2-CORRECTED.md` for every correction:

1. **`f` / `⇧F`** with reach `WALL_SEAT_REACH_M` 1.2 m. Keep `keyboard.ts` **byte-unchanged** — `f`
   already emits `flip-door` for any object selection in DESIGN, and `flipDoor`'s same-ref-on-a-non-door
   contract IS the router. Resolve in App: try `flipDoor`, and on the same ref fall through to the seat.
   **⚠️ The quarter turn must be applied AFTER the snap** — adding π/2 to the INPUT of a nearest-π snap
   is annihilated by it (measured: a literal no-op on 13/22/37/68° walls, a footprint-identical 180° flip
   on the rest). Write that test failing-first; as originally specced it is unsatisfiable.
2. **The Inspector button.** ⚠️ Gate on `role === 'furniture' || role === 'tv'`, NOT on the existing
   `role !== 'door'` block — that block matches **windows**, which `wallSeatFor` refuses forever, so
   every window would render a permanently-disabled "Seat against wall" with a false hint. ⚠️
   `InspectorPanel.door.test.tsx:53` passes ten explicit props with no spread, so a required eleventh
   breaks `tsc --noEmit` while `npm test` stays green (the S20 lesson).
3. **The touch-HUD button**, because `SelectionActions` is the coarse-pointer surface and the Inspector
   is the desktop one — a HUD-only button is invisible on a mouse.
4. **The on-canvas snap guide.** ⚠️ Do NOT stroke it with `wallKeptSpans` — that deletes door openings,
   so it would draw a gap exactly where the magnet is about to seat a sofa across a doorway.

`ideas.md` §4's *"a no-op must not be silent"* requirement (the S14 lesson) belongs to THIS block: the
button must be **disabled with a reason**, not silently inert.

### 2b. Creation-time alignment (P1, small)

`App.tsx:446` (palette drop) and `SimCanvas.tsx:1015` (rubber-band draw) both hardcode `rotation: 0`, so
on the owner's skewed plan **every new rect arrives crooked** before any drag. Same helper, ~2 more call
sites. Likely the biggest remaining everyday win. Think about whether a preset should teleport to a wall
on drop or only straighten.

### 2c. The `generate/shell.ts` degrees-into-radians bug (P1, small — a real shipped defect)

**Confirmed in S23, filed not folded.** `edgeAngleDeg` (`shell.ts:140`) returns DEGREES; `opening()`
(`shell.ts:144-158`) writes it into `RectObj.rotation`, which `types.ts:27` documents as RADIANS. Both
call sites pass degrees (`shell.ts:209` doors, `:250` windows). A vertical wall's generated door renders
at **116.62° instead of 90°**. Generated **windows** are acoustically wrong too (`raytrace.ts:98` skips
only *open doors*, so a window rect contributes rotated surfaces). Not caught because
`generate.test.ts:49` fingerprints `rotation` only for DETERMINISM — it pins the wrong value's
*stability*. The fix is one line but it **moves S22's determinism baselines**, so it needs its own block
and a failing-first test that asserts CORRECTNESS through `rectCorners`, not the raw field.

### 2d. Others, unchanged

Export-all bundle IMPORTER (P2, `db.ts` calls it a "safety net" and it is still write-only) · detection's
worst case (P2, measure before capping — the S18 lesson) · `App.tsx` decomposition (1290 lines vs an 800
cap) · the read-only 3D view (P2, `docs/3d-view-plan.md`; needs `worker-src`/`connect-src` loosened, and
the drift test will fail until `public/_headers` and `vercel.json` match).

---

## 3. THINGS S23 LEFT ON THE TABLE

- **Detection has STILL never been run against the owner's own floorplan photo.** They supplied it as a
  chat image this session, which the harness cannot read — it needs a **file path**. Ask for one and run
  it FIRST: `npx esbuild docs/sessions/S23/bench/score-corpus.ts --bundle --platform=node --format=esm
  --outfile=/tmp/b.mjs && node /tmp/b.mjs --image <file.png>`. It is the only measurement left that can
  still falsify the 95.6 % claim. What their plan already tells us: it is heavily dimensioned, has door
  arcs everywhere, thin interior partitions against thick exterior poché, and a hatched kitchen — which
  is close to the two corpus fixtures that score worst (`hatched` 91.6 %, `apartment-cluttered` 82.3 %).
- **`wallSeatFor` is 96 lines** against the 50-line guideline. Cohesive and at 100 % statement coverage,
  so it was recorded rather than split. Split it if you are in there anyway.
- **Shift-drag is currently the ONLY escape** for a deliberately perpendicular piece (it holds `rot0`
  exactly). Real limitation, documented not hidden; §4b's `⇧F` is the proper answer.
- **The magnet does not check door openings**, so it will seat a sofa flush across a doorway.
  `arrange.ts` treats door corridors as hard constraints — the app's own model disagrees. Worth fixing
  with §4b's guide work.
- **`move-multi` (group drag) does not seat**, deliberately: seating each member independently destroys
  the internal layout that branch exists to preserve.

---

## 4. LIVE VERIFICATION

Drive a FRESH headless-Chrome profile. `docs/sessions/S23/{cdp.mjs,shoot.mjs,live.mjs,live-detect.mjs,
live-seat.mjs}` are a working, copyable, zero-dependency harness (Node 25's built-in WebSocket + fetch).
**`live-seat.mjs` is the newest worked example** and carries two S23 recipes worth reusing: seeding a
probe layout **into IndexedDB after a first boot** (TRAP 13), and **locating a canvas object by
consequence** — sweep candidate points, drag each ~30 px, check whether the target's stored centre moved,
then ⌘Z. That needs no view-transform maths and no DOM selectors, and it cannot silently test the wrong
object. Mind the axis convention: **world +y is DOWN**.

`docs/sessions/` is gitignored, so those files exist only locally — copy them into your session directory.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review + adjudicate every finding against HEAD; fix what is
real, record what you deliberately did not. Update `CLAUDE.md`, `docs/ideas.md`, and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, and `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
