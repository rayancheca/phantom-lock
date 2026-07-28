# KICKOFF — Session 21: the guided tutorial mode (owner-requested)

Run under the Standing Operating Protocol at the top of `docs/master-plan.md` (also in `CLAUDE.md`,
auto-loaded). This is an **ultracode** project: unlimited token/time budget — optimize for correctness
and completeness, never speed.

## Why this one

`docs/ideas.md` §3, **P1, owner-requested**, with a deep design already written up. It is the highest
item on the backlog that the owner asked for by name and that is not yet built. The only P0 —
auto-detect walls (§1, scheduled as S12, kickoff at `docs/kickoff-session-12.md`) — is a bigger,
self-contained accuracy overhaul; take that instead if the owner prefers, but §3 is the one that makes
everything S13–S20 built *discoverable*.

S20 just landed folders and an N-up compare, which changes the tutorial's job: a first-timer now boots
into **six seeded designs across two folders** with a live locked verdict. The tutorial has to teach
that workspace, not an empty canvas — and it now has real material to point at (two designs that lock
from different seats, one with no audio at all, a cross-project comparison).

Read `docs/ideas.md` §3 in full before planning. Do not redesign it from scratch without saying why.

## 0. GIT + THE TRAPS (read before touching a file)

MAIN REPO (source of truth): `/Users/rayankarimcheca/Desktop/Dev/fun/layout`. Create a fresh
per-session worktree branch off `main`.

* ⚠️ **TRAP 1 — the worktree path.** A worktree lives at `<MAIN_REPO>/.claude/worktrees/<name>/` while a
  SEPARATE main checkout sits at the repo root. Confirm with `git rev-parse --show-toplevel` and
  `git branch --show-current` FIRST and pass worktree-relative paths to Read/Edit/Write, or your edits
  land in the wrong checkout and the gate lies to you.
* ⚠️ **TRAP 2 — `node_modules` is NOT shared** into a new worktree. `npm install` first.
* ⚠️ **TRAP 3 — the shell cwd persists** between Bash calls. Prefer absolute paths.
* ⚠️ **TRAP 4 — `.claude/launch.json` is TRACKED.** Do not overwrite it; its `autoPort: true` stops your
  dev server stealing the owner's :5173.
* ⚠️ **TRAP 5 — verify by OBSERVATION, not API readback.** For anything persisted: seed the OLD shape,
  load it, and assert what came back — never just assert what you wrote.
* ⚠️ **TRAP 6 — `git stash` a partial revert and the pop may never run.** If you stash, pop in a
  SEPARATE command and verify with `git stash list` + `git diff --stat`.
* ⚠️ **TRAP 7 — never assert wall-clock in the suite.** S18 had a 10 s assertion pass under `npm test`
  and fail at 10.18 s under `npm run test:coverage`. Assert deterministic integers; keep timings in
  `docs/sessions/<S>/`.
* ⚠️ **TRAP 8 — background agents make the machine noisy.** Any performance number measured while a
  review Workflow is running is ~15 % pessimistic. Re-measure quiet before writing a number into source.
* ⚠️ **TRAP 9 (new, S20) — a reviewer agent reads the tree at the moment it starts.** Three S20
  reviewers reported HIGH findings that two commits had already fixed, because the session kept landing
  work while they ran. Either freeze the tree while a review is in flight, or tell every reviewer the
  exact commit SHA to review and have the verifier adjudicate against HEAD. The verifier caught it; do
  not rely on that.
* ⚠️ **TRAP 10 (new, S20) — `vite preview` binds `localhost`, not `127.0.0.1`.** A CDP harness pointed
  at `http://127.0.0.1:<port>` gets connection-refused while `curl localhost` returns 200.

Commit a baseline, then again after the gate passes. Land with
`git -C <REPO_ROOT> merge --ff-only <branch>` then `git -C <REPO_ROOT> push origin main`. Commit messages
end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Put the message in a file and use
`git commit -F` — backticks in a `-m` string get shell-expanded (hit in S19).

**FIRST ACTION:** `npm install`, then run the full gate (`npm run lint`, `npm test`, `npm run build`) and
PASTE the literal tails. Baseline as of 2026-07-28 (post-S20): **lint 0 · 961 tests · 427.43 kB /
138.02 kB gz**. TEST COUNT IS A RATCHET (…814 → 961) — it must never drop, and no test may be newly
skipped/`.only`'d/weakened.

## 1. THE PROTOCOL (non-negotiable — restate it in the handoff you write)

1. **Git first** (see §0).
2. **Read first.** `CLAUDE.md` (whole file), `docs/master-plan.md` (protocol + the S20 entry),
   `docs/ideas.md` §3, `docs/database-plan.md`. Map every site before touching it.
3. **Orchestrate.** Heavy task → multi-agent Workflow (parallel understand → design → skeptic). A task is
   heavy if it changes a data model, touches persistence, touches `src/engine`, deletes/overwrites data,
   or edits more than one file. Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic that tries to REFUTE it against the real code. Report each verdict. On this project skeptics
   have caught data-loss bugs, a DoS estimate wrong by two orders of magnitude, a memory regression in a
   change that had already passed 162 golden entries, and (S20) both a runtime crash for 100 % of
   returning users hiding behind a "required" type and an infinite render loop no scene-level test could
   see.
5. **Implement fully.** Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>".
6. **Test everything with PROOF.** Keep the suite green, ADD failing-first tests for every new pure
   behaviour, never let the count drop below 961. Run `npm run test:coverage` (now scoped to `src/**`);
   paste the coverage line for every file you touched (≥80 %, or state the exact reason). Vite routes by
   FILENAME: `*.test.ts` → node, `*.test.tsx` → jsdom.
7. **Migrations get an OLD-SHAPE test.** Seed a pre-migration store/record and assert it upgrades
   correctly on read — not just that a fresh write round-trips.
8. **Double-check.** Spawn self-review agents (`code-reviewer` + `silent-failure-hunter` + a domain
   reviewer) over the ACTUAL diff, then an adversarial verifier over their findings — S20's verifier
   refuted 12 of 26. Fix everything real, then re-verify. Prefer plain-text returns for reviewer agents.
9. **Data safety.** Export-all before any live test that writes persistence; test on a disposable
   DUPLICATE, and prefer a FRESH headless-Chrome profile (fresh origin ⇒ own IndexedDB). NEVER delete the
   owner's layouts. A migration that cannot be reverted must not be run.
10. **Verification gate — proven, not paraphrased.** Paste the literal tails of `npm run lint`,
    `npm test` (with count) and `npm run build` (with gz size). Any red = not done.
11. **Hand off with an Evidence block:** agents spawned (role + verdict) · before/after test count ·
    pasted gate output · saved screenshot paths · each Acceptance bullet → met/deferred. State honestly:
    live checks run ONE browser; no real screen reader has ever been driven.

## 2. YOUR TASK

### 2a. Read the existing design
`docs/ideas.md` §3 holds a worked-through tutorial design. Start from it. Where S20 changed the premise
(a populated workspace instead of an empty one, folders, N-up compare), say so and adapt rather than
silently dropping steps.

### 2b. What the tutorial must teach
The app's payoff is **THE LOCK** — the moment `stereo.ts` says the phantom centre is locked and the
`VerdictHero` ignites. Everything else is scaffolding for getting there. A tutorial that explains the
toolbar but never walks a user to a lock has taught nothing. The seeded workspace now hands you a
guaranteed lock on first paint (`engine/seed.ts`, verified end-to-end in `seed.test.ts`) — use it.

Minimum arc: what you're looking at → move a pod and watch the readout react → reach a lock → compare it
against a second seat or design → where your own floorplan comes from.

### 2c. The constraints that are NOT negotiable
- **Skippable and resumable**, and never shown twice unless asked. Gate it the way S16 gated the welcome:
  on `bootstrapPersistence.firstRun` **and** `isPristineOrigin`, plus its own standalone localStorage
  flag — **NEVER the persistence schema** (the S16 lesson).
- **Keyboard-operable at creation**, with visible focus, `prefers-reduced-motion` respected, and no
  meaning carried only by a hover `title=` (the UX-4 rule). Cover it with a PAGE-WIDE axe test —
  `expectNoAxeViolationsOnPage`, not the subtree run, or structural rules like `landmark-unique` and
  `heading-order` are silently skipped (the S20 lesson).
- **It must not mutate the user's data** to demonstrate anything. If a step needs a scene, drive it on a
  seeded demo layout, and say in the copy which layout it is touching.
- **`overlayOpen` must cover it** if it sits over the still-mounted canvas, or it leaks scene/tool keys
  (the S4 lesson, re-learned in S14 and S17).

### 2d. Scope guard
The frozen engine set is `src/engine/{optimize,rooms,stereo,raytrace,pairspot,bestspot,reflection,grid}.ts`.
A tutorial should need NONE of them. If you believe it does, say so explicitly and get a skeptic to agree
before editing. Do not regress: the S7 a11y work, the S13–S16 design system, the S8 security posture
(CSP, `importRejection`), the S18 grid cap, S19's bit-identity (`reflection-golden.json` /
`legit-golden.json` must stay green), or S20's folder invariants (`projects.test.ts`,
`projects-migration.test.ts`).

## 3. ACCEPTANCE
* A first-time user is walked from first paint to a LOCK without reading any documentation.
* The tutorial is skippable, resumable, and shown only on a genuine first run (proven by a test that
  seeds a returning user and asserts it does NOT appear).
* Keyboard-operable, visible focus, reduced-motion respected, page-wide axe clean.
* It mutates no layout the user created.
* New pure logic is failing-first tested; the ratchet rises above 961.
* Gate green: lint 0 · ≥961 tests · build clean, all three tails pasted.
* Live: screenshots of every tutorial step in BOTH themes plus the ≤960 px layout, saved to
  `docs/sessions/S21/`. No saved artifact = the live check did not happen.

## 4. LIVE VERIFICATION
Drive a FRESH headless-Chrome profile. `docs/sessions/S20/shoot.mjs` + `run-shots.mjs` are a working,
copyable harness (fresh `--user-data-dir` ⇒ fresh origin ⇒ the owner's real Maple Court layout is never
loaded or written). Its recipe traps, already handled in that file: `--headless=old` + `--window-size` at
launch (the new compositor deadlocks `captureScreenshot`), JPEG not PNG (Node's built-in WebSocket
silently drops a multi-MB frame), and `localhost` not `127.0.0.1` for `vite preview`. To seed a disposable
store, navigate to a same-origin BLANK page first, `indexedDB.deleteDatabase('phantom-lock')`, set
`localStorage['phantom-lock:v2']`, THEN navigate to the app — booting the app first writes the demo into
IDB and your localStorage seed is ignored (hit in S17 and S19).

## 5. FINISH
Paste the literal gate tails. Run the self-review + verifier over the ACTUAL diff; fix everything real;
re-verify. Update `CLAUDE.md` (commands/ratchet/bundle size, architecture, any new hard-won lesson),
`docs/ideas.md`, and the `docs/master-plan.md` progress log with a full Evidence block. Commit on the
session branch, land on `main` via `--ff-only`, and `git push`.

Then write the NEXT kickoff, re-stating this protocol in full. Candidates, in backlog order: the
auto-detect walls overhaul (**P0**, still the only P0 — kickoff exists at `docs/kickoff-session-12.md`),
snap-furniture-to-a-wall's-angle (P1, `ideas.md` §4), the export-all bundle IMPORTER (P2, `ideas.md`
§10b — the "storage-agnostic safety net" is still write-only), multi-tab folder loss (P2, `ideas.md`
§10d), or `ideas.md` §2d (the last wall-heavy CPU residual, 12–14 s → <10 s).
