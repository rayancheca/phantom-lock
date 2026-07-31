# KICKOFF — Session 30

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for
correctness and completeness, never speed.

## Where the project is

**S29 landed the owner-requested Android home-screen gallery.** The session opened on the detection
backlog (§13e) and the owner redirected it mid-turn; the detection work was reproduced, archived and
parked rather than lost.

**Baseline.** `main` is at `355768d`: `npm test` **1471**, JS **496.81 kB / 161.71 kB gz**, CSS
**53.45 kB / 9.96 kB gz**, HTML 1.31 kB. All three gates green. No unlanded branch.

**TEST COUNT IS A RATCHET** (…1393 → 1407 → **1471**). Never let it drop; no test may be newly
skipped / `.only`'d / weakened.

⚠️ **`npm run test:coverage` is still NOT clean** — unchanged from S29, which did not touch it. One
failure: `generate.test.ts` › *"REPORTS furniture it could not place instead of dropping the notes"*,
`Test timed out in 5000ms`, not an assertion failure. v8 instrumentation makes the same work several
times slower. **The fix is always to hoist to module scope, never to raise `testTimeout`** —
`detect.test.ts` has done this four times. Still a genuinely small, worthwhile task (§2e below).

---

## 0. GIT + THE TRAPS

MAIN REPO: `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Fresh per-session branch off `main`.

- ⚠️ **TRAP 1** — a worktree lives at `<REPO>/.claude/worktrees/<name>/`. Confirm with
  `git rev-parse --show-toplevel` and use ABSOLUTE paths.
- ⚠️ **TRAP 2** — `node_modules` is not shared into a new worktree. `npm install`, or symlink.
- ⚠️ **TRAP 3** — the shell cwd persists between Bash calls. Absolute paths, always.
- ⚠️ **TRAP 4** — `.claude/launch.json` is TRACKED; its `autoPort` stops your dev server stealing :5173.
- ⚠️ **TRAP 5** — verify by OBSERVATION, not API readback. S29 is the strongest evidence yet: the
  ghost's clipping is invisible to `getBoundingClientRect`, and a drop shadow that
  `getComputedStyle` echoes back perfectly is a **1.042:1** affordance nobody can see.
- ⚠️ **TRAP 6** — never `git stash` a partial revert. Copy a whole `src/` tree to /tmp and patch
  THERE. S29's five negative controls used `cp file.GOOD` + restore + `shasum` verification each time.
- ⚠️ **TRAP 7** — never assert wall-clock in the suite.
- ⚠️ **TRAP 8** — background agents make the machine noisy; re-measure quiet.
- ⚠️ **TRAP 9** — **adjudicate every agent finding against the tree yourself.** S29's reviewers were
  mostly right and it still mattered: two independently measured the same CRITICAL (which was real
  and was fixed), one proposed a fix that was measurably worse than the alternative, and one asserted
  a `.gitignore` comment was false — it was, and correcting it was right.
- ⚠️ **TRAP 10** — `vite preview` binds `localhost` and silently moves port if 4173 is taken.
- ⚠️ **TRAP 11** — **`git add -A src/` sweeps untracked strays into your commit.** S29 hit this
  twice with a Finder duplicate (`db 2.ts`, since deleted at the owner's request) and caught it both
  times only because `git ls-files --others --exclude-standard src/` was run first. Run it before
  EVERY `git add`, not just before the gate.
- ⚠️ **TRAP 12** — a green `npm test` proves nothing about types. Run all three gates. S29's
  required-in-memory / optional-on-disk split was caught **only** by `tsc --noEmit`.
- ⚠️ **TRAP 13** — a live harness that reads back its own localStorage seed measures NOTHING.
- ⚠️ **TRAP 14** — never let a measurement agent write into your worktree.
- ⚠️ **TRAP 15** — a workflow phase can run long; prefer several small workflows.
- ⚠️ **TRAP 16** — Node's built-in WebSocket silently drops a multi-MB CDP frame. `format:'jpeg'`.
- ⚠️ **TRAP 17** — **zsh does not word-split unquoted parameters.** Sweep in Node, or use `${=c}`.
- ⚠️ **TRAP 18** — `npx vite-node` is the way to run engine code outside the suite; imports from a
  /tmp harness must be **absolute**.
- ⚠️ **TRAP 19 (new, S29)** — **a fresh Chrome profile shows the first-run welcome, and it is a
  MODAL `Dialog` whose `.dialog-scrim` swallows every synthesized mouse event.** This made a working
  drag look completely broken: the button never received `pointerdown` at all, and
  `elementFromPoint` at the card's centre returned `DIV.dialog-scrim`. Dismiss it (`.dialog-x`) and
  assert `!document.querySelector('.dialog-scrim')` before driving anything.
- ⚠️ **TRAP 20 (new, S29)** — **a raw `window.dispatchEvent` is outside React's event system**, so
  `fireEvent` does not wrap it and the state update it causes is never flushed before your next
  assertion. Every Escape in `gallery.a11y.test.tsx` goes through an `act()` helper for this reason.

Commit a baseline, then again after the gate. Land with `git -C <REPO> merge --ff-only <branch>`,
then `git push origin main`. Commit messages end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Use `git commit -F <file>`.

**FIRST ACTION:** `npm install`, then run all three gates and PASTE the literal tails.

---

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (§0).
2. **Read first.** `CLAUDE.md` in full — "Hard-won lessons" gained SIX entries in S29 and the
   gallery/projects architecture changed substantially. Plus `docs/master-plan.md`, `docs/ideas.md`,
   and — before touching the gallery — `docs/sessions/S29/DESIGN.md`.
3. **Orchestrate.** Heavy → multi-agent Workflow. **Heavy** = changes a data model, touches
   persistence, touches `src/engine`, deletes/overwrites data, or edits more than one file.
4. **Adversarially verify — ALWAYS**, and then adjudicate (TRAP 9).
5. **Implement fully.** Every Acceptance bullet → "met (with evidence)" or "deferred to <block>".
6. **Test with PROOF.** Failing-test-first for new pure behaviour; never below **1471**. Paste the
   coverage line for every file touched. Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.** S29's is `order.test.ts` — note it deliberately uses ids
   `zz-a / aa-b / mm-c`, because the S20 fixture used `old-layout-0/1/2`, which is lexicographically
   sorted by construction and therefore proves nothing about order.
8. **Double-check.** Self-review agents over the ACTUAL diff. S29's found a CRITICAL the author had
   shipped, plus four HIGHs — this step is not ceremonial.
9. **Data safety.** Fresh headless-Chrome profile for live work; never touch the owner's layouts.
10. **Gate — proven, not paraphrased.** Literal tails of all three.
11. **Evidence block.** State honestly: live checks run ONE browser; no real screen reader has ever
    been driven on this project; **no touch device has ever been driven** (new limit, see §2a).

**The meta-lesson, seven sessions old:** when you fix a bug, run the *other* wrong answer past your
new test. S29's reviewers built wrong implementations and found **two** that passed all 66 tests —
the merge-slot guard and a `touch:true` variant — plus two correct FIXES that also passed, proving
the bugs they fixed were unpinned. Budget time for this explicitly.

---

## 2. YOUR TASK

### 2a. §14a–14e — finish the home screen (P1, ~½ session, owner-facing)

S29 shipped the feature and named five residuals. In rough value order:

1. **§14b — focus after a merge.** The focused card is REMOVED from the DOM when two designs merge,
   and nothing re-homes focus, so it falls to `<body>`. Same after an auto-dissolve. Small, and it
   is the clearest remaining a11y gap. ⚠️ CLAUDE.md records that `.focus()` on a removed or
   disabled element is a no-op that drops focus to `<body>` — aim at an element the action itself
   creates (the new tile), and do it in an effect after the commit, not in the handler.
2. **§14c — Escape with a kebab menu open closes the WHOLE gallery** and strands focus on `<body>`
   (`Menu`'s `close()` focuses a button in a subtree React is unmounting). **PRE-EXISTING on `main`,
   not an S29 regression** — but S29 promoted that menu to the canonical move entry point, so it is
   hit far more often. Add a menu rung to the Escape ladder, or have `Menu` use
   `stopImmediatePropagation`. ⚠️ Both handlers are window-CAPTURE on the same node, and
   `stopPropagation()` does NOT stop a co-registered listener there — that is measured, and it is
   why the fix has to be inside one of the two handlers.
3. **§14e — no drag takes a design OUT of a folder.** The drill-in view shows only that folder's
   contents and the breadcrumb is not a drop target. Making the breadcrumb a drop target completes
   the gesture and is what makes "drag the last design out and the folder disappears" reachable by
   DRAG (S29 made it reachable via the kebab, which now routes through `dropLayout`).
4. **§14a — touch.** `touch-action: pan-y` keeps the grid scrollable, but the browser fixes
   `touch-action` at touchstart, so it cannot become `none` once a long press has armed: a touch
   drag moving mainly VERTICALLY scrolls and fires `pointercancel`. **No touch device has been
   driven.** CDP can emulate one (`Emulation.setTouchEmulationEnabled` + the media features — see
   the S14 lesson in CLAUDE.md for the exact incantation, and verify with
   `matchMedia('(pointer: coarse)').matches` before trusting the pixels).
5. **§14d — `removeProject` files a deleted folder's designs into the ADJACENT folder**, not onto
   the home grid. Pre-existing S20 behaviour whose *meaning* changed with the new IA. The toast does
   name the destination, so it is disclosed rather than silent. Worth re-deciding with the owner.

**Acceptance:** focus lands somewhere sensible after every gesture · Escape does the least
surprising thing at every rung · a design can be dragged out of a folder · touch is either verified
or its limits are stated with a measurement behind them.

### 2b. §13e — the refusal gates accept images with no floorplan (P1, ½–1 session)

**Unchanged and still the head of the detection queue.** S29 reproduced it and archived the evidence
(`docs/sessions/S29/bench/13e-reproduction.txt`, and the harness beside it), then parked it when the
owner redirected. Reproduced exactly as filed:

- **A page of four thin furniture OUTLINES** is offered **27/27** (stroke {3,5,7} × tone {26,90,150}
  × 3 UI levels) at structure up to **1.000** and confidence **1.00**, 16 walls.
- **A two-tone joined-corner page** leaks **12/12** at structure 0.333–0.667, confidence 0.77–0.93.
- For calibration, the reproduction also printed the whole corpus: the lowest legitimate structures
  are `oblique-survey` @Careful **0.350**, `apartment-cluttered` @Thorough **0.375**,
  `apartment-rotated` @Careful **0.389**, `screened-poche` @Balanced **0.464** — i.e. the furniture
  page scores HIGHER than every legitimate fixture. `structure` cannot separate them.

**What will NOT work, already measured — do not rediscover it:** moving `MIN_STRUCTURE` (its first
step, 0.28, already refuses 13–24 readings of the owner's own plan) · `support` or `explained` (both
measured against the mask the pipeline itself produced; `no-plan-lines` scores **1.000 on both**) ·
total length or a challenger-side guard (both overlap the legitimate population).

**What is worth measuring, in order.** The missing signal is almost certainly *enclosure*: a
floorplan bounds ROOMS, four furniture outlines bound four furniture-sized boxes. `rooms.ts` already
flood-fills, and S25 made `segsCross` textbook-correct so it no longer leaks through walls.
Candidates: enclosure at BUILDING scale vs furniture scale · enclosed area over total wall length ·
whether the segment graph has cycles at all · the distribution of enclosed region areas.
**Calibrate against the enumerated corpus, not against the attacks** — that is the S18/S28 lesson
and it has now bitten three times in four sessions.

**Acceptance:** both null pages become fixtures and are refused at all three UI levels · no
legitimate corpus fixture refused, and `oblique-survey` (0.346) and `apartment-cluttered` (0.425)
specifically still accepted · the owner's plan unchanged at 9 / 15 / 24 walls (74 / 85 / 92 %),
verified LIVE · corpus mean holds ≥ 0.92.

### 2c. §4b — the explicit seat COMMAND (P1, ~½ session)

Unchanged, fully designed already — read `docs/sessions/S23/spec-v1-REFUTED.md` §7 and
`spec-v2-CORRECTED.md`. Four parts, each with a trap already paid for:
`f`/`⇧F` with **the quarter turn applied AFTER the snap** (adding π/2 to the input of a nearest-π
snap is annihilated by it — write that test failing-first) · the Inspector button gated on
`role === 'furniture' || role === 'tv'`, NOT `role !== 'door'` (which also matches windows) · the
touch-HUD button · the on-canvas snap guide, NOT stroked with `wallKeptSpans`.
⚠️ `InspectorPanel.door.test.tsx:53` passes ten explicit props with no spread, so a required
eleventh breaks `tsc --noEmit` while `npm test` stays green.

### 2d. Creation-time alignment (P1, small)

`App.tsx` and `SimCanvas.tsx` both hardcode `rotation: 0`, so on the owner's skewed plan **every new
rect arrives crooked** before any drag. Same helper as S23's magnet, ~2 call sites. Smallest change
with the biggest everyday effect. (Note S29 moved App.tsx's line numbers — re-grep rather than
trusting the old ones.)

### 2e. Make `npm run test:coverage` green (P2, small)

One failure, named above. Hoist to module scope the way `detect.test.ts` does four times over. Do
NOT raise `testTimeout`.

### 2f. Others

The `scalePlan` annotation-stroke gap (§2d in the old numbering, P2 — deferred three times now;
adding `thickness?:` moves `apartment-annotated` at 2.5× from 99.7 % to 91.7 %, so it needs its own
commit) · export-all bundle IMPORTER (P2, still write-only) · detection's worst case (P2) · §13c
(P3) · multi-tab folder loss (§10d) · **`App.tsx` is now 1295 lines against an 800 cap**.

---

## 3. WHAT S29 DID, AND WHAT IT LEFT

**The gallery is an Android home screen.** ONE flat grid where a design card and a FOLDER TILE are
peers. Drop a design on a design → a folder appears **at the target's slot**; on a tile → it joins;
in a gap → it moves there; click a tile → drill in. **Positions persist.**

The owner chose this shape explicitly over a smaller "new labelled row below" option, and chose
saved positions, when asked.

**The data model.** `Layout.order` and `Project.order`, required in memory and optional on disk.
`order` is a coordinate WITHIN A CONTAINER: HOME (the home project's own designs **plus** every
other project as a tile, sharing one space — which is what lets a tile sit between two designs) or a
folder's contents. `normalizeOrder` is the only writer and canonicalises each container to dense
integer ranks; everything else expresses intent as a FRACTIONAL order. `DB_VERSION` stays 1.

**Five things measurement forced that intuition got wrong:**

1. **Display order was ALREADY broken.** `getAll()` is ascending by layout id, so the seeded demo
   re-sorted itself on its first ever reload, before any user action.
2. **The fallback for a missing order is `Infinity`, not the array index** — sharing one numeric
   space with stored orders makes a partially-persisted container come back in a THIRD order that is
   neither the old nor the new one (24 of 32 write subsets of a 5-item container).
3. **Every writer of `projectId` must re-stamp `order`.** Without it `moveLayoutToProject` decided
   where a design landed from its position in the folder it LEFT, and `removeProject` riffle-shuffled
   two arranged sequences into `A1 B1 A2 B2 A3 B3`.
4. **There are THREE field-by-field silent-drop sites, not the two `CLAUDE.md` named** — the third is
   `sanitizeLayout`'s return literal in `scene.ts`. A field added to the two in `db.ts` and not to
   that one round-trips to disk and is erased on every read.
5. **`buildExportBundle` mapped the array**, which is no longer display order — a backup would have
   been written in id order with the arrangement silently gone.

**Bugs the process caught, in order of how they were found:**

- **Live browser, two:** a click-suppression FLAG that a merge's own DOM removal stranded, so the
  next click anywhere was eaten; and `absorb` being proposed for a folder subject, announcing an
  action no commit branch performs.
- **Self-review, one CRITICAL + four HIGH:** the arrangement was persisted for FOLDERS and not for
  DESIGNS (`saveMeta` runs unconditionally, layouts are diff-gated on `updatedAt`, and the load path
  correctly does not touch it) — so on the SECOND boot after upgrading, every folder tile jumps to
  the front of the grid with the user having done nothing, permanently. Plus `slotOrder` assuming
  dense ranks, `slotIndexAt` resolving against row 0 off-row, the keyboard twin of the absorb bug,
  and move mode being inoperable from the menu that is its WCAG-compliant entry point.

**Left open, honestly:**

- §14a–14e above — and note **§14a and §14e are capability gaps, not polish**: touch drag is partly
  unsupported and no drag takes a design out of a folder.
- **No touch device has ever been driven on this project.** New honesty line for the Evidence block.
- `sameRegion` still has NO production caller; `optimize.ts:265` still has no `area > 2` guard while
  its two siblings do.
- The reviewers' list of **behaviours the diff changed that no test covers** is in the S29 workflow
  journal and is worth mining before adding tests blind.

---

## 4. LIVE VERIFICATION

`docs/sessions/S29/{cdp.mjs,live-gallery.mjs}` is a working, copyable, zero-dependency harness
(Node's built-in WebSocket + fetch), and `live-gallery.mjs` is the one to copy for anything
UI-interactive. It asserts a fresh profile before touching anything, **dismisses the first-run modal
(TRAP 19)**, drives real `Input.dispatchMouseEvent` drags in steps, and — the part worth stealing —
verifies a canvas actually PAINTED by reading its pixels back rather than trusting that it mounted.

`docs/sessions/S28/live-owner-plan.mjs` remains the one to copy for anything image-related: it feeds
a real file through the app's OWN hidden file input, so the image travels the full lossy chain a
user's does.

`docs/sessions/S26/bench/owner-appchain.bin` (the app-chain bytes, 685×900) and
`docs/sessions/S28/bench/owner-plan.png` (the original, 1320×1734) both survive and are where every
detection measurement should start.

`docs/sessions/` is gitignored, so these are local-only — copy them into your session directory.

---

## 5. FINISH

Paste the literal gate tails. Run the self-review, adjudicate every finding against HEAD, fix what
is real and record what you rejected and why. Update `CLAUDE.md`, `docs/ideas.md` and the
`docs/master-plan.md` progress log with a full Evidence block. Commit on the session branch, land on
`main` via `--ff-only`, `git push`. Then write the NEXT kickoff, re-stating this protocol in full.
