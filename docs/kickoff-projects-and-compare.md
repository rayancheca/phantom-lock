# KICKOFF — Projects (folders) + N-up compare, across layouts *and* projects

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness and
completeness, never speed.

## Why this exists — the owner asked for it directly

Verbatim, mid-S19:

> "can you create several layouts just to fill up the app and then make folders for projects so i can save
> projects and have multiple designs for one project and be able to compare multiple layouts at once. as
> many as needed. and be able to compare different projects as well."

Four things, and they are not the same feature:

1. **Seed several layouts** so the app is not empty when exploring — a populated gallery.
2. **Projects as folders**: a layout belongs to a project; a project holds many *design variants* of the
   same space.
3. **Compare N layouts at once**, "as many as needed" — today `ScenarioCompare` is hard-wired to exactly
   **two** columns.
4. **Compare across projects**, not only within one.

This is HEAVY by every objective trigger in the protocol: it changes the **data model**, touches
**persistence** (`engine/db.ts` + `engine/scene.ts` `loadStore`), and edits far more than one file. So it
MUST get a multi-agent Workflow, an adversarial skeptic that tries to REFUTE the migration against the real
code, failing-test-first for every new pure behaviour, a self-review pass over the ACTUAL diff, and a
handoff with an Evidence block.

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO (source of truth): `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Create a fresh per-session
worktree branch off `main`.

- ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. Confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST and pass worktree-relative paths to Read/Edit/Write, or your edits land
  in the wrong checkout and the gate lies to you.
- ⚠️ **TRAP 2 — `node_modules` is NOT shared into a new worktree.** `npm install` first.
- ⚠️ **TRAP 3 — the shell cwd persists between Bash calls.** Prefer absolute paths.
- ⚠️ **TRAP 4 — `.claude/launch.json` is TRACKED.** Do not overwrite it; its `autoPort: true` stops your dev
  server stealing the owner's :5173.
- ⚠️ **TRAP 5 — verify by OBSERVATION, not API readback.** For a migration that means: seed an OLD-shape
  record, load it, and assert what came back — never just assert what you wrote.
- ⚠️ **TRAP 6 — `git stash` a partial revert and the pop may never run.** If you stash, pop in a SEPARATE
  command and verify with `git stash list` + `git diff --stat`.
- ⚠️ **TRAP 7 — never assert wall-clock in the suite.** S18 had a 10 s assertion pass under `npm test` and
  fail at 10.18 s under `npm run test:coverage`. Assert deterministic integers; keep timings in
  `docs/sessions/<S>/`.
- ⚠️ **TRAP 8 (new, S19) — background agents make the machine noisy.** Any performance number measured while
  a review Workflow is running is ~15 % pessimistic. Re-measure quiet, or quote a range and say why.

Commit a baseline, then again after the gate passes. Land with
`git -C <REPO_ROOT> merge --ff-only <branch>` then `git -C <REPO_ROOT> push origin main`. Commit messages
end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Put the message in a file and use
`git commit -F`** — backticks in a `-m` string get shell-expanded (hit in S19).

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and
PASTE the literal tails. Baseline as of 2026-07-27 (post-S19): **lint 0 · 810 tests · 413.79 kB /
133.52 kB gz**. TEST COUNT IS A RATCHET (…760→810) — it must never drop, and no test may be newly
skipped/`.only`'d/weakened.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file), `docs/master-plan.md` (protocol + the S19 entry),
   `docs/database-plan.md`, `docs/ideas.md`. Map every site before touching it.
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). Do not solo
   heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. Report each verdict. On this project skeptics have
   caught data-loss bugs, a DoS estimate wrong by two orders of magnitude, a live calibration bug in an
   already-landed plan, and (S19) a **144 MB-per-context memory regression** in a change that was otherwise
   provably correct and had already passed 162 golden entries.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>".
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure
   behaviour, never let the count drop below 810. Run `npm run test:coverage`; paste the coverage line for
   every file you touched (≥80 %, or state the exact reason). Vite routes by FILENAME: `*.test.ts` → node,
   `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.** Seed a pre-migration store/record and assert it upgrades correctly
   **on read** — not just that a fresh write round-trips.
8. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a data-model
   reviewer) over the ACTUAL diff. Fix everything real, then re-verify. Prefer plain-text returns for
   reviewer agents; a strict StructuredOutput schema killed one.
9. **Data safety.** Export-all before any live test that writes persistence; test on a disposable DUPLICATE,
   and prefer a FRESH headless-Chrome profile (fresh origin ⇒ own IndexedDB). **NEVER delete the owner's
   layouts.** A migration that cannot be reverted must not be run.
10. **Verification gate — proven, not paraphrased.** Paste the literal tails of `npm run lint`, `npm test`
    (with count) and `npm run build` (with gz size). Any red = not done.
11. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count · pasted
    gate output · saved screenshot paths · each Acceptance bullet → met/deferred. State honestly: live checks
    run ONE browser; no real screen reader has ever been driven.

## 2. YOUR TASK

### 2a. The data model — this is the hard part, and it is a MIGRATION

Today (`engine/db.ts`, `engine/scene.ts`, `components/app/hooks/useLayoutStore.ts`): a `Store` is
`{ version, activeId, layouts: Layout[] }`, and a `Layout` is `{ id, name, scene, settings }`. IndexedDB
holds `layouts` / `underlays` / `meta`. There is no grouping concept at all.

Add projects. **Decide the shape in the design Workflow, then defend it against a skeptic** — the two
obvious candidates have different failure modes:

- **A: `projectId` on each layout** + a `projects: Project[]` list. Cheap to migrate (every existing layout
  gets a default project), cheap to reassign, and an orphaned `projectId` is recoverable.
- **B: layouts nested inside projects.** Reads better, but every existing read site
  (`useLayoutStore`, `useLayoutActions`, the gallery, compare, export/import) changes shape at once, and a
  bug strands layouts inside a deleted project.

Whichever wins, the migration MUST be:
- **Additive and reversible.** Old records keep loading; a downgrade must not lose layouts.
- **Backed by an old-shape test** that seeds a v2 store with no projects and asserts every layout survives
  with a sane default project.
- **Isolated per record** — the S8 lesson: one `try` around a whole store is a data-loss amplifier; sanitize
  each record so a hostile or corrupt one cannot replace every layout the user owns.
- Careful with **id collisions**: `sanitizeScene` processes referenced-by-id entities FIRST (seats, then
  speakers, then objects) for exactly this reason. A new `projectId` reference joins that hierarchy.

### 2b. Seed several layouts

The owner wants the app populated. `engine/seed.ts` already seeds the Maple Court demo with a verified
LOCKED pair on genuine first run (`bootstrapPersistence.firstRun && isPristineOrigin`) — extend that, do NOT
invent a second seeding path, and **never seed in the degraded/error boot branch** (the S16 lesson: that
branch fires when existing records fail to reconstruct, and seeding there hides a user's real data behind a
fake layout). Variants should be genuinely different (a couch spot vs a bed spot, TV vs music, a mini pair),
so the gallery and compare have something real to show.

### 2c. N-up compare

`components/compare/ScenarioCompare.tsx` is hard-wired to two `(layout, seat)` scenarios. Generalize to N:
- N columns, horizontally scrollable, each an independent `(project, layout, seat)` selection.
- Each column already renders the shared `<VerdictHero variant="compare">` from `deriveVerdict(...)` on a
  memoised `Computed` — keep that; do NOT reintroduce a local verdict (UX-3 deleted a divergent one).
- Stays **read-only** (immutable `setActiveListener`).
- `canCompare` (threaded App → Sidebar → `ListenerCard`) must widen: ≥2 seats OR ≥2 layouts OR ≥2 projects.
- **Performance is now the constraint, and S19 is why this is feasible at all.** Each column costs a full
  `traceScene` + `computeAudio` + `bestListeningSpot`. On the bundled demo that is ~50–60 ms, so 6 columns is
  ~350 ms — fine. On a large layout it is ~0.5 s *per column*. Decide and DOCUMENT a policy: memoise per
  `(layout, seat)`, compute lazily as columns scroll into view, or cap N with a stated reason. Do not let an
  N-up compare silently become an N× freeze.
- Keyboard + a11y at creation: the column list needs a sane tab order, visible focus, and
  `prefers-reduced-motion` respect. `overlayOpen` must still cover compare (the S4 lesson — `SimCanvas` stays
  mounted underneath with a live `window` keydown listener).

### 2d. Cross-project compare + gallery

The gallery (`components/gallery/LayoutGallery.tsx`) becomes project-aware: group cards by project, allow
create / rename / delete / move-between-projects. Deletes get **undo toasts, never confirms** (design
system). Deleting a project must not orphan its layouts silently — decide the semantics and test it.

## 3. SCOPE GUARD

The frozen engine set is `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot,reflection,grid}.ts`.
**This task should not need to touch any of them** — it is data-model + UI. If you believe it does, say so
explicitly and get a skeptic to agree before editing. Do not regress: the S7 a11y work, the S13–S16 design
system, the S8 security posture (CSP, `importRejection` — note **import/export must round-trip projects**),
the S18 grid cap, or S19's bit-identity (`reflection-golden.json` / `legit-golden.json` must stay green).

## 4. ACCEPTANCE

- A layout belongs to a project; projects can be created, renamed, deleted, and layouts moved between them.
- An OLD-shape store (v2, no projects) loads with every layout intact under a sensible default project,
  proven by a test that seeds the old shape and asserts on **read**.
- Export/import round-trips projects; `importRejection` gains whatever bound the new arrays need, calibrated
  so it does NOT reject anything the UI can build (the S8/S18 lesson: a cap that fires on real data is a
  data-loss bug).
- Compare handles N ≥ 2 columns, across layouts AND across projects, read-only, with a documented and
  measured performance policy.
- The app ships seeded with several genuinely different layouts on genuine first run only.
- New pure logic is failing-first tested; ratchet rises above 810.
- Gate green: lint 0 · ≥810 tests · build clean, all three tails pasted.
- Live: screenshots in BOTH themes, the ≤960 px stacked layout, and an N-up compare with N ≥ 3, saved to
  `docs/sessions/S20/`. No saved artifact = the live check did not happen.

## 5. LIVE VERIFICATION

Drive a FRESH headless-Chrome profile (fresh origin ⇒ its own IndexedDB; the owner's real Maple Court layout
is never loaded or written). `docs/sessions/S19/bench/shoot.mjs` is a working harness — copy it, and note its
two recipe traps: `--headless=old` + `--window-size` at launch (the new compositor can deadlock
`captureScreenshot`), and JPEG not PNG (Node's built-in WebSocket silently drops a multi-MB frame). To seed a
disposable store, navigate to a same-origin BLANK page first, `indexedDB.deleteDatabase('phantom-lock')`, set
`localStorage['phantom-lock:v2']`, THEN navigate to the app — booting the app first writes the demo into IDB
and your localStorage seed is ignored (hit twice now, S17 and S19).

## 6. FINISH

Paste the literal gate tails. Spawn `code-reviewer` + `silent-failure-hunter` + a data-model reviewer over
the ACTUAL diff; fix everything real; re-verify. Update `CLAUDE.md` (commands/ratchet/bundle size, the data
model, any new hard-won lesson), `docs/database-plan.md`, `docs/ideas.md`, and the `docs/master-plan.md`
progress log with a full Evidence block. Commit on the session branch, land on `main` via `--ff-only`, and
`git push`.

Then write the NEXT kickoff, re-stating this protocol in full. Candidates, in backlog order: the auto-detect
walls overhaul (**P0, still the only P0** — kickoff exists at `kickoff-session-12.md`), the guided tutorial
mode (P1, owner-requested, full design in `docs/ideas.md` §3), snap-furniture-to-a-wall's-angle (P1), or
`ideas.md` §2d (the last wall-heavy CPU residual, 12–14 s → <10 s).
