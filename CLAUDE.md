# Phantom Lock — project context for Claude

Browser-based 2D acoustic room planner (React 19 + Vite + TS, **zero runtime deps besides React**).
Finds optimal HomePod placement via a real 2.5D ray-tracing engine. The user owns 4 HomePods,
lives in the bundled "Maple Court" apartment, has a rolling TV stand (couch spot ↔ bed spot).

## ⚠️ OPERATING PROTOCOL — the quality bar (CANONICAL · append-only · READ FIRST)

The owner's standing directive: **make this perfect. Never be lazy, never take shortcuts, use as many
agents as the work warrants, spend as many tokens/seconds as it takes.** Token/time budget is NOT a
constraint — optimize for correctness and completeness, never speed. This is an **ultracode** project.

This protocol is **canonical and append-only**: do not weaken, soften, reword-down, or delete any clause
without explicit owner approval quoted in your handoff. Confirm the next kickoff you write re-states it.

**Objective triggers (no self-grading of "non-trivial").** A task is **heavy** — and MUST get a
multi-agent Workflow **and** an adversarial skeptic pass — if it does ANY of: changes a data model or
migration · touches persistence · touches the engine (`src/engine`) · deletes/overwrites data · or edits
more than one file. When unsure, treat it as heavy.

Every session MUST:

1. **Git first.** A git repo exists (as of 2026-07-19). Create a per-session branch, commit a baseline,
   and commit again after the gate passes — so the change is diffable and revertable. A migration that
   cannot be reverted must not be run.
2. **Read first.** `docs/master-plan.md` (your session + roadmap), `docs/ultrareview.md`,
   `docs/database-plan.md`, this file. Map every site you'll touch before touching it.
3. **Orchestrate.** For any heavy task, run a multi-agent Workflow (parallel understanding/design/review →
   synthesize). Do not solo heavy work.
4. **Adversarially verify — ALWAYS.** Every heavy change and every serious finding gets an independent
   skeptic agent that tries to REFUTE it against the real code. (This caught real data-loss bugs in S1 and
   a seat/verdict desync trap in the S2 plan.) Report each verdict.
5. **Implement fully.** No stubs, TODOs, placeholder returns, `.skip`/`.only`, scope-narrowing, or faked
   completion. A split is legitimate ONLY if the shipped slice fully satisfies a NAMED subset of the
   session's Acceptance criteria and the remainder is rescheduled as its own block with its own Acceptance.
   Map every Acceptance bullet to "met (with evidence)" or "deferred to <block>" — none left unaddressed.
6. **Test everything — and PROVE it.**
   - *Automated:* keep the suite green and ADD tests for every new behavior (failing-test-first for every
     new pure-function behavior). Run `npm run test:coverage`; paste the coverage line for every file you
     touched (≥80%, or state the exact reason). **Test count is a ratchet — it must not decrease**
     (95 at S1 → 126 at S2 → 140 at S3 → 181/182 at S4 → 239 at S5 → 245 at S13 → 296 at S14 → **322** at S15/2026-07-20) and no test may be newly skipped/only'd/
     weakened; state before/after counts.
   - *Migrations:* seed an OLD-shape store/record and assert it upgrades correctly on read — not just
     fresh-fixture writes.
   - *Live:* any change to scene data, persistence, engine output, or UI is "observable" by definition.
     Drive the browser preview, exercise it, read the console, inspect persisted/DOM state, and SAVE
     screenshots to `docs/sessions/S<n>/` (both the dark "sound" and light "plan" themes for canvas/UI
     changes; check the ≤960 px stacked layout for new UI). Reference the files in the handoff. No saved
     artifact = the live check did not happen.
   - *New interactive UI* must be keyboard-operable, show a visible focus state, respect
     `prefers-reduced-motion`, and not regress contrast (`--text-3`) or the design system — at creation.
7. **Double-check your own work.** After implementing, spawn a self-review agent (`code-reviewer` /
   `security-reviewer` / `silent-failure-hunter` / domain reviewer) over the actual diff to hunt bugs, data
   loss, edge cases, and laziness. Fix everything real it finds, then re-verify.
8. **Data safety.** Before any live test that writes persistence, run Export-all and save the bundle to
   `docs/sessions/S<n>/backup.json`. Test on a disposable DUPLICATE layout — never the user's real active
   "Maple Court" layout — and never hand-mutate IndexedDB to "reset".
9. **Verification gate — proven, not paraphrased.** Paste the literal terminal tail of `npm test` (with the
   test count) and `npm run build` (with the emitted size). Any red = not done.
10. **Hand off with an Evidence block.** Update the master-plan checklist + progress log; update this file /
    memory if architecture or preferences changed; write the next kickoff (re-stating this protocol). The
    handoff MUST include an **Evidence block**: agents spawned (role + verdict) · before/after test count ·
    pasted gate output · saved screenshot paths · each Acceptance bullet → met/deferred. No Evidence block =
    the session is incomplete.

State honestly per session: live checks run ONE browser (not cross-browser); ESLint/`npm run lint` doesn't
exist until Session 5; automated a11y/contrast tests land in Session 7 — until then, meet these by hand and
say so.

## Commands

- `npm run dev` — Vite (user usually has this running on :5173 already; autoPort will move yours)
- `npm test` — vitest, **1915 tests** across TWO projects, all green as of 2026-08-05. `|node|` (pure logic) + `|dom|` (jsdom + axe, **10** files) — see `vite.config.ts` `test.projects`. Ratchet: never let the count drop (95→126→140→181→239→245→296→322→340→613→644→649→655→659→666→711→760→814→961→1084→1316→1354→1356→1365→1388→1393→1407→1471→1536→1543→1560→1615→1628→1640→1706→1789→1893→**1915**; ⚠️ the tree actually measured **1790** at the S38 baseline, so the 1789 recorded by S37 was one short). **S39 added +22** — §15b, per-room furniture quotas. `arrange.test.ts` 21→**35** and `generate.test.ts` 52→**60**. The first test in the arrange block is THE PRECONDITION and is load-bearing for the other nine: it asserts that WITHOUT room ids both beds land in the same bedroom, because a fixture whose beds would split on their own cannot express the bug at all. The end-to-end bound is `at most 1 of 120 named bedrooms without a bed` — measured at **20 of 120** on a pristine checkout — and is paired with a test naming FIVE (archetype, seed, room) triples that were empty before, because a bound of 1-in-120 is also satisfied by an engine that simply orders fewer bedrooms. **21 negative controls were run in a copied tree and all 21 are caught by the test written FOR them**, but TWO escaped on the first attempt and both were flaws in the CONTROL rather than holes in the tests: one replaced the unresolvable-id guard with a bogus far-away zone, which the soft fallback absorbs so the two are behaviourally identical (the real defect that guard prevents is a crash on `want.id`), and one made the studio-sleeps rule write to every per-cell map — arithmetically incapable of differing, since that rule only fires when `cells.length === 1` and `perCell[0]` IS every cell. **S38 added +103** — §18a, the rest of the SimCanvas decomposition. `canvas/__tests__/pick.test.ts` **53** is the first committed coverage the pointerdown ladder has ever had (jsdom dispatches a plain `Event` for pointer events, so the whole path was unreachable — TRAP 21), and it pins the S36 grip-vs-pod ORDERING that was an invariant with a comment and no test: the fixture puts a speaker puck exactly ON a grip's screen position and asserts the overlap before asserting the winner, because a fixture where the two do NOT overlap passes under either order. It runs every provenance assertion over TWO views (`rot: 0` and `rot: 0.7`), since at rot 0 `Math.atan2` over world and over screen deltas is BIT-identical and a rot-0 corpus cannot express a `grabAngle` bug at all. Drag records are asserted THROUGH `applyDragToScene`, never by field equality — `drag-apply.test.ts` hand-builds those records, so the SimCanvas→drag-apply seam was untested in both directions. `chain.test.ts` **31** pins the vertex maths and replays click/click/click/Backspace/Backspace end to end. `interaction.test.ts` **+12** for the two lifted reducers. **29 negative controls were run in a copied tree; three PASSED on the first attempt and all three were holes in the TESTS** — the close-radius fixture used a point 0.1 m out, which snaps to ITSELF on a 0.05 grid (0.24 straddles); the multi-selection test grabbed a rect with no puck on it, so the whole multi block could move below the NODE hits and still pass (the forcing case is grabbing a member that IS a speaker); and the ⌘-click short-circuit test used a SPEAKER over a rect, where the first branch fires whatever `oh` holds (the forcing case is the LISTENER over a rect). After strengthening, **38/38 are caught by the test written FOR them** — nine of those controls were added AFTER self-review, one per confirmed finding, because the review verified by its OWN controls that my tests passed under nine plausible wrong implementations (a move-rc fixture that grabbed the object's exact centre, so `c0` and `start` were indistinguishable; `move-wall`'s `a0`/`b0` never run through the consumer, so a swap passed; a fixed metric pick tolerance passing where only smaller ones were caught; the seat-vs-puck order; the first vertex's `snapToWalls`; the OUTER grid snap, invisible on axis-aligned fixtures; `toBeGreaterThan(0)` on a wall height that must be `ROOM_HEIGHT`; and the first-vertex id-group rule, which lived in the component and so could not be red-ed at all) — the thirtieth was added during self-review, for a guard whose polarity I had flipped: `NaN >= 0.15` is false so the original creates no wall, but `NaN < 0.15` is ALSO false, so the inverted form falls through and commits a wall with NaN endpoints. **S37 added +83** — the decomposition (§18). Both new files test logic that was UNREACHABLE from `npm test` before: `app/__tests__/run-command.test.ts` **47** covers the command dispatcher (the escape ladder per target, the notice pre-empt running BEFORE the switch, `{coalesce}` reaching setScene on both held-key paths, `cycle` routing a seat entry to `switchSeat`, and the flip-door same-ref ROUTER including that ⇧F deliberately does NOT fall through — §4d), and `canvas/__tests__/drag-apply.test.ts` **36** covers the six scene-writing drag branches, which jsdom can never reach because it dispatches a plain `Event` for pointer events (TRAP 21). **Twenty negative controls were run in a copied tree; all twenty were caught**, but TWO of them passed on the first attempt and both were holes in the TESTS: the move-multi fixture put every origin ON the 0.05 snap grid, where snapping the delta and snapping each piece are arithmetically IDENTICAL (measured: both move by exactly 0.35 at x = 4 / 0 / 2; off-grid they diverge to 0.37 / 0.39 / 0.38), and the handle-idempotence test used an EDGE grip, which is idempotent either way because 'e' pins the west edge — only a ROTATE compounds. **S36 added +66** — §16's grips. `canvas/__tests__/handles.test.ts` **45** is deliberately built on OFF-AXIS fixtures (every rect at the owner's -12.83 deg), because with rotation 0 the local basis degenerates to the world basis and a transform that ignores rotation entirely passes every assertion — the S32 'on-grid corpus cannot see an off-grid bug' lesson one dimension over. Two of its tests found REAL bugs on first run (the non-bit-exact no-op check, and the restore-on-return-home). `handles-render.test.ts` **6** pins the NEGATIVE and ORDERING properties a screenshot cannot settle: grips painted BEFORE every node — so a puck's opaque disc covers a grip, matching the pointerdown ladder, which tests grips BELOW the nodes (`render.ts:1169-1170` draws handles then nodes; **this line said "after" until S38 and was backwards**) — and absent from both ghost paths. `announce.test.ts` gained **6** for `spokenSelection`. **16 negative controls were run in a copied tree; 15 were caught by the test written for them**, and three tests had to be strengthened first — the tie-break fixture was arithmetically incapable of expressing its own bug (a 12 px half-extent against an 11 px hit disc, so the grips never overlapped). The one control that passed, clamp/snap ORDERING, is redundant-by-construction rather than a hole: every bound is a multiple of `SNAP_STEP`, and that property is now pinned instead. **S35 added +12** — the header/gallery narrow-width contract, in the new `components/app/__tests__/header-responsive.test.ts`. It reads `app.css` and `gallery.css` FROM DISK and pins the DECLARATIONS, because jsdom ignores `@media` entirely and reports every rect as 0x0, so no committed test can evaluate a responsive hit test — the behavioural proof is a CDP harness in the gitignored `docs/sessions/S35/`. Eighteen negative controls, each caught by the test written FOR it. Six of them were found by self-review AFTER the first eight passed: an unscoped `.segment-label` in a DIFFERENT media block (the scope check read only one block), a selector LIST whose sibling compound blanks the sidebar, `min-width: auto` satisfying `/width:\s*auto/`, `.topbar-left` satisfying `/\.topbar\b/`, the 40px segment padding pinned by nothing, and `min-height` missing from the icon-only trigger. **S34 added +13** — the owner's "impossible to find" report. `gallery.a11y.test.tsx` 36→**42**: the two that pin the actual bug (Generate reachable from the HOME grid, and from a workspace with NO folders — the shape `seededDefaultStore()` cannot express, since it ships two) plus four regression guards for paths that already worked and had no test. `contrast.test.ts` 112→**119**, and the one that matters is `gallery.css actually GIVES the trigger that border` — every other assertion in that block is token arithmetic that stays green if the CSS fix is deleted, which three self-review lenses independently demonstrated before it was added. **S33 added +55** — the generator quality work (§15). `generate/__tests__/design-score.test.ts` **29** tests for the MEASURING INSTRUMENT, not the generator: every sub-score is checked against a hand-built input whose answer is known by arithmetic, and each has a negative control. Three of them found defects IN THE INSTRUMENT before it was used for anything — a missing `spacing` sub-score (the pile-everything-on-one-spot control scored identically to the demo, because density is blind to it by construction), an `ANCHORS` list that matched only the generator's vocabulary and so could not see the demo's "Couch", and an `intersectionArea` that did not re-orient the clip polygon and reported the hand-authored demo as overlap-free. `arrange.test.ts` 7→**18** (the constant-world-facing bug asserted over BOTH TV walls, `faceToward`'s degenerate guard, the seat clearance and the reason it must NOT apply to wall pieces, the optional/required split, and the both-faces wall on an L-shaped fixture whose centroid falls OUTSIDE the floor — the obvious two-room fixture does not force the issue and my first version of that test was worthless). `generate.test.ts` 40→**50** (the coverage budget, the optional merge rule, a PLACE_ORDER completeness check, two corpus floors, the aspect budget, and a variety floor that stops a later "simplification" back to argmax). **S32 added +17** — `canvas/__tests__/wall-seat.test.ts` 38→**50** (COMMAND_SEAT's structural `seated:true`, the C3 short-wall refusal, the off-grid FIXED-POINT sweep that catches the shipped quantise-then-clamp settle, and the ALREADY-SEATED case that is the ONLY input on which an independent `canSeat` predicate disagrees) and the new `canvas/__tests__/snap-guide.test.ts` **5**, which pins C8 with a recording stub because the property that matters is a NEGATIVE one. **S31 added +7** — the §13e REFUTATION. `engine/__tests__/indistinguishable.test.ts` **7** is unusual and deliberate: it pins a NEGATIVE result, so each test says what to CONCLUDE if it goes red rather than asserting a feature (the one-component theorem, the terrace-vs-cluster inversion, the `two-room` shrink ladder, and the overlap itself). Its heavy work is at MODULE scope for the coverage ceiling, and a naive cohesion floor built in a throwaway tree turns 3 of the 7 red. **S30 added +65** — the four S29 gallery residuals (§14a–14e) plus three defects found underneath them. `gallery/__tests__/escape.test.ts` **11** (the Escape ladder enumerated over all EIGHT states, because the bug was a MISSING rung and a spot-check of the rungs that exist can never find one), `drag.test.ts` 23→**49** (the exit intent incl. *"BEATS a card whose unclipped rect reaches into the header band"*, the four-edge symmetric pad, the step-index space with a CONCRETE non-identity value — a round-trip test alone is satisfied by the identity pair, which IS the bug — the focus planner, and `containerIntentFor`), `gallery.a11y.test.tsx` 15→**36**, and `useProjectActions.test.tsx` **+5**. **S29 added +64** — `engine/__tests__/order.test.ts` **33** (the persisted arrangement, with FIVE negative controls built and run: index fallback · no re-stamp in `moveLayoutToProject` · none in `removeProject` · `touch:false` on mutations · merge appending instead of taking the target's slot — each caught exactly one test), `components/gallery/__tests__/drag.test.ts` **23** (pure drag geometry), and the rewritten `gallery.a11y.test.tsx` **15**. **S28 added +14** — the candidate set is only measurable if the
result says which cut read the page, so `detect.test.ts` gained a two-part `ink reading` block (every
legitimate fixture answers at candidate 0 EXCEPT `screened-poche`, which answers at candidate 1 — both
halves load-bearing, since all-cand-0 would mean the fallback is dead code and any other would mean the
gradient rule is being second-guessed where it was right; plus the proof that candidate 0 on that
fixture is a REFUSAL rather than a worse read) and a starved-page reading that deliberately STRADDLES
127; `mask.test.ts` gained the perimeter-floor cases; `useWallDetection.test.tsx` gained the ink-datum
plumbing. The corpus gained `screened-poche`, which is load-bearing on TWO existing assertions — on the
S27 engine it scores **0.000** against its 0.78 floor AND drags the corpus mean to **0.9132** against
`MEAN_FLOOR` 0.92. **S27 added +5** — three in `vision/__tests__/mask.test.ts` (a flat mid-tone mass must not be called ink; the same at 40 % of the page, where 'ink is the minority class' would actively mislead; and the starvation fallback on a page too faint to have edges), and two in `detect.test.ts` (the tone-curve sweep over `scan-letterbox`, and the corpus gaining that fixture). The two S26 negative controls in the `sensitivity` block were RE-DERIVED rather than added — see the lessons. **S26 added +23** — the detection corpus gained TWO fixtures (`oblique-survey`, the lowest structure margin in the corpus; and `no-plan-shelf`, the null that beat the first cut of S26's own fix). `detect.test.ts` gained the monotonic-knob guarantee plus FOUR negative controls that each catch a different wrong version of it (the knob must still BITE — disabling 'Careful' passed the suite otherwise; a scatter must not be rescued; the second reading must be scored at ITS OWN corner radius, which is a no-op on every other fixture; and no null may slip through) and a three-test `resolution` block for the app's downscale chain, which NO fixture had ever exercised. `quality.test.ts` gained five for `referenceStructure` (two WRONG contracts passed without them), and `useWallDetection.test.tsx` gained eight for the cause-aware refusal hint. **S25 added +9** (`rooms.test.ts`, the wall-line leak), **S24 added +2**, **S23 added +38** (`canvas/__tests__/wall-seat.test.ts`), **S22 added +232.** Wall detection (+159): `engine/__tests__/detect.test.ts` **43** — the corpus regression (a per-fixture score FLOOR plus a mean floor, scored through the same instrument that measured the pre-S22 engine at 52.1 %), the refusal suite including *"does NOT refuse any legitimate plan in the corpus"*, and three NEGATIVE CONTROLS that must lower the score (duplicate every wall · add one cross-plan diagonal · outline the furniture) · `detect-score.test.ts` **20** — tests for the MEASURING INSTRUMENT itself, because every number in the S22 handoff rests on it: a perfect detection scores 1, an empty one 0, "every wall twice" ~0.5, a bbox-only answer visibly short, and the rasteriser is asserted deterministic AND seed-sensitive · `vision/__tests__/mask.test.ts` **21** (incl. the EXACT distance transform against a brute-force search, and *"separates a blob that TOUCHES a wall — which no component filter can"*) · `thin.test.ts` **12** (connectivity preserved on a thick ring, T- and X-junctions, a genuine fixed point) · `trace.test.ts` **21** (incl. *"THE TRAP: does not call a room OUTLINE annotation"* and the chamfered-corner control) · `regularize.test.ts` **31** (incl. *"THE ONE THAT MATTERS: leaves a genuinely angled wall alone"*) · `quality.test.ts` **11** (the pinned refusal thresholds). The generator (+58): `engine/generate/__tests__/generate.test.ts` **37** — incl. *"THE PAYOFF: never ships a placed-but-UNLOCKED pair"* (re-derived from the real `traceScene`→`computeAudio`, not from the flag), the VARIANT-D door proof measured end to end through `regionOf`, the listener-mirror check on every archetype, and the ZONE_AFFINITY name guard · `hooks/__tests__/useGenerateDesign.test.tsx` **11** (the ONLY store writer: preview writes nothing, keep adds exactly one, undo restores) · `gallery/__tests__/generate-dialog.a11y.test.tsx` **10** (PAGE-WIDE axe).
- `npm run lint` — **(S5)** flat ESLint (`eslint.config.js`): @eslint/js + typescript-eslint + eslint-plugin-react-hooks `recommended-latest`, scoped to `src`, ignoring `.claude`/`dist`/`coverage`. Clean (0 problems) as of 2026-07-19. exhaustive-deps is enforced; **6** documented survivor suppressions remain, all mount-once effects — `AppInner.tsx:127` · `canvas/SimCanvas.tsx:267` · `canvas/useCanvasCamera.ts:118` · `compare/ScenarioCompare.tsx:315` · `tutorial/TutorialRunner.tsx:132` · `ui/Toast.tsx:31` — see each file. (Counted in S38 and UNCHANGED by it, on both `main` and the branch. The figure previously here was **5** and named `Menu`/`LayoutGallery`, which no longer carry one, and `SimCanvas:250/398`, which no longer exist — stale since the S21/S37 extractions moved the effects. ⚠️ `git grep -c exhaustive-deps` answers **7**: `hooks/useKeyboardShortcuts.ts:21` is PROSE saying it needs none. Grep for `eslint-disable-next-line react-hooks/exhaustive-deps` instead — S38's first count made exactly that mistake and a review lens caught it.)
- `npm run build` — tsc --noEmit + vite build (**518.98 kB / 169.28 kB gzip** JS + **54.90 kB / 10.24 kB gz** CSS + **1.31 kB** HTML. Set in S39. **The CSS asset HASH is byte-identical to S36/S37/S38's** (`index-j_hTKTEs.css`) — S39 touches no stylesheet, and that hash is the cheapest available proof of it. JS +0.67 kB / +0.23 kB gz for `ArrangeItem.room`, the `id` on `Ctx.zones`, `pinnedZone`, the `filter`-based queue with its global `MAX_PER_PRESET`, and `inventoryFor`'s `perCell` accumulator. Prior baseline: **518.25 kB / 169.03 kB gzip** JS + **54.90 kB / 10.24 kB gz** CSS + **1.31 kB** HTML. Set in S38, which finished the decomposition. **The CSS asset HASH is byte-identical to S36's and S37's** (`index-j_hTKTEs.css`) — S38 touches no stylesheet, and that hash is the cheapest available proof of it. JS +1.43 kB / +0.55 kB gz for the module boundaries themselves: `pick.ts` (the PickInput/PickAction/PickEffects interfaces and the interpreter switch), `chain.ts`, `useFinePointer.ts`, and the two new exported helpers in `interaction.ts`. Code motion is not free at the byte level — each extraction adds an interface, an args object and a return literal — and that is the price of the 800-line cap; S37 paid +5.02 kB for the same reason. Prior baseline: **516.85 kB / 168.50 kB gzip** JS + **54.90 kB / 10.24 kB gz** CSS + **1.31 kB** HTML. Set in S37, the decomposition. **The CSS asset HASH is byte-identical to S36's** (`index-j_hTKTEs.css`) across all seven commits, which is the cleanest available evidence that moving `import './app.css'` into the new `AppInner.tsx` did not perturb the cascade — Rollup emits CSS in module-graph traversal order, so a stylesheet that moves ahead of the component stylesheets it overrides is a real hazard, not a theoretical one. JS +5.02 kB / +1.32 kB gz for the module boundaries themselves: seven new App-side files (`run-command.ts` + six hooks) and four canvas ones (`drag-apply.ts`, `useCanvasCamera.ts`, `useCanvasPainter.ts`, `CanvasOverlays.tsx`). Code motion is not free at the byte level — each extraction adds an interface, an args object and a return literal — and that is the price of the 800-line cap. Prior baseline: **511.83 kB / 167.18 kB gzip** JS + **54.90 kB / 10.24 kB gz** CSS + **1.31 kB** HTML. Set in S36; JS +5.79 kB / +2.13 kB gz for `canvas/handles.ts`, `canvas/view.ts`, the `drawHandles` pass, the `handle` Drag kind, the size/core gates and `spokenSelection`. CSS is +0.15 kB for ONE legend swatch — the grips themselves are drawn on the canvas and cost the stylesheet nothing. Prior baseline: **506.04 kB / 165.05 kB gzip** JS + **54.75 kB / 10.21 kB gz** CSS + **1.31 kB** HTML. Set in S35, whose diff is CSS and comments only: the JS is **byte-identical** to S34's, which is the cleanest available evidence that a responsive fix changed no behaviour. CSS +0.78 kB / +0.15 kB gz for the header's `min-width: 0` plus its three narrow-width blocks (720 monogram / 480 brand+icon-switch / 344 icon-only trigger) and the gallery head's wrap rules. Prior baseline: **506.04 kB / 165.05 kB gzip** JS + **53.97 kB / 10.06 kB gz** CSS + **1.31 kB** HTML. Set in S34; JS +0.27 kB / +0.07 kB gz for the home tray's Generate button and CSS +0.32 kB / +0.06 kB gz for the kebab border, the `.gallery-new-lead` rule and the `max-height: 640px` compaction (which grew a second time when a self-review lens measured at 320x200). Prior baseline: **505.86 kB / 165.02 kB gzip** JS + **53.65 kB / 10.00 kB gz** CSS + **1.31 kB** HTML. Set in S33; JS +2.63 kB / +0.85 kB gz and CSS UNCHANGED vs S32's 503.23/164.17 for `faceToward`/`orientFree`/`openAnchor`/`SEAT_CLEARANCE`/the two-faced `wallSlots`/the `optional`+`skipped` plumbing in `arrange.ts`, the coverage-budget `inventoryFor` + `programmeFor` in `generate/index.ts`, and the aspect-aware `split` in `tile.ts`. Everything under `generate/__tests__/` (including the whole `design-score.ts` instrument) is TEST-ONLY and tree-shakes out. Prior baseline: **503.23 kB / 164.17 kB gzip** JS + **53.65 kB / 10.00 kB gz** CSS + **1.31 kB** HTML. Set in S32; JS +2.48 kB / +0.97 kB gz and CSS UNCHANGED vs S31's 500.75/163.20 for `COMMAND_SEAT`/`WALL_SEAT_REACH_M`/`seatObjectAgainstWall`/`canSeatAgainstWall`/`WallSeatOptions.contain` in `canvas/placement.ts`, `drawSnapGuide` + the `RenderState.snapGuide` field in `render.ts`, the `snapGuide` state in `SimCanvas.tsx`, the Inspector button, the fourth `SelectionActions` button and the `flush` icon. Prior baseline: **500.75 kB / 163.20 kB gzip** JS + **53.65 kB / 10.00 kB gz** CSS + **1.31 kB** HTML — **UNCHANGED by S31**, whose whole diff is tests and comments. The asset content HASHES are byte-identical to S30's, which is the cleanest available evidence that a refutation changed no behaviour. Set in S30; JS +3.94 kB / +1.49 kB gz and CSS +0.20 kB / +0.04 kB gz vs S29's 496.81/161.71 + 53.45/9.96 for the new `gallery/escape.ts`, the exit intent + focus planner + step-index space + `containerIntentFor` in `gallery/drag.ts`, the focus ladder / `commitOn` / touch guard in `useGalleryDrag.ts`, and the click-as-destination + breadcrumb wiring in `LayoutGallery.tsx`. Prior baseline: **496.81 kB / 161.71 kB gzip** JS + **53.45 kB / 9.96 kB gz** CSS + **1.31 kB** HTML after S29; JS +15.39 kB / +4.85 kB gz and CSS +1.90 kB / +0.40 kB gz vs S28's 481.42/156.86 + 51.55/9.56 for the ordering model in `projects.ts`, `gallery/drag.ts` + `gallery/useGalleryDrag.ts`, the rewritten `LayoutGallery.tsx` and its CSS. Prior baseline: **481.42 kB / 156.86 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S28; JS +1.05 kB / +0.35 kB gz and CSS UNCHANGED vs S27's 480.37/156.51 for `inkThresholds`/`maskAtThreshold`/`InkThresholds` in `vision/mask.ts`, the `pipelineAt`/`detectAtThreshold`/`inkReading` split plus the `InkReading` type in `detect.ts`, and the ink datum carried through `useWallDetection`. Prior baseline: **480.37 kB / 156.51 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S27; JS +0.56 kB / +0.24 kB gz and CSS UNCHANGED vs S26's 479.80/156.27 for `edgeWeightedHistogram` and the two constants in `vision/mask.ts` — everything under `engine/__tests__/fixtures/` (including the new `scan-letterbox` fixture and the per-element `ink?:` plumbing) is TEST-ONLY and tree-shakes out. Prior baseline: **479.80 kB / 156.27 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S26; JS +0.74 kB / +0.32 kB gz and CSS UNCHANGED vs S25's 479.06/155.95 for the lazy second reading in `detectWalls`, the `RefusalCause` field, and `nextLevelHint` — everything under `engine/__tests__/fixtures/` (including the new `oblique-survey` fixture and the `scalePlan`/`downscale` helpers) is TEST-ONLY and tree-shakes out. Prior baseline: **479.06 kB / 155.95 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S23; JS +2.25 kB / +0.86 kB gz and CSS UNCHANGED vs S22's 476.00/154.75 for the `wallSeatFor`/`moveObjectTo`/`openingMagnetFor` additions to `canvas/placement.ts` and the `move-rc` rewiring in `SimCanvas.tsx`. Prior baseline: **476.00 kB / 154.75 kB gzip** JS + **51.55 kB / 9.56 kB gz** CSS + **1.31 kB** HTML after S22; JS +26.69 kB / +9.54 kB gz and CSS +2.21 kB / +0.39 kB gz vs S21's 449.31/145.21 + 49.34/9.17 for the whole `engine/vision/` directory (types/mask/thin/trace/regularize/quality), the rewritten `engine/detect.ts`, the whole `engine/generate/` directory (rng/archetypes/tile/shell/names/pair/index), `hooks/useWallDetection.ts` + `hooks/useGenerateDesign.ts`, `canvas/DetectionProposalCard.tsx` + `gallery/GenerateDialog.tsx` and their CSS. Everything under `engine/__tests__/fixtures/` (the floorplan rasteriser, the corpus and the accuracy score) is TEST-ONLY and tree-shakes out. Prior baseline: **449.31 kB / 145.21 kB gzip** JS + **49.34 kB / 9.17 kB gz** CSS + **1.31 kB** HTML after S21; JS +20.80 kB / +6.85 kB gz and CSS +4.11 kB / +0.58 kB gz vs S20's 427.43/138.02 + 44.84/8.52 for the whole `components/tutorial/` directory (types/machine/progress/steps/actions/spotlight + the three components + `tutorial.css`), `hooks/useTutorial.ts`, and the header/welcome wiring. Prior baseline: **427.43 kB / 138.02 kB gzip** JS + **44.84 kB / 8.52 kB gz** CSS + **1.31 kB** HTML after S20; JS +13.58 kB / +4.48 kB gz vs S19's 413.85/133.54 for `engine/projects.ts` + `engine/ids.ts` + the widened `seed.ts` + the N-up `ScenarioCompare` + `compare-summary.ts`/`compute-scenario.ts`/`column-gate.ts` + `hooks/useProjectActions.ts` + the folder-grouped gallery. `npm run test:coverage` is scoped to `src/**` so gitignored session scratch cannot skew the figure the protocol asks to be pasted, and **is GREEN as of S30** — four tests straddled the 5 s per-test ceiling under v8 instrumentation with the code entirely correct, and each was moved to module scope (evaluated during COLLECTION, which is not timeout-bound). The biggest was `corpusFixtures()`, which re-rasterised all 25 fixtures on EVERY call while `fixtureByName` discards all but one — seven lookups cost 175 rasterisations. **The fixtures are now SHARED, so treat them as immutable.** Prior baseline: **413.85 kB / 133.54 kB gzip** JS + **43.18 kB / 8.24 kB gz** CSS + **1.31 kB** HTML after S19; JS +2.13 kB / +0.83 kB gz vs S18's 411.72/132.71 for the new `engine/reflection.ts`, the three `t`-only helpers in `geometry.ts`, and the two caller-level skips. Prior baseline: **411.72 kB / 132.71 kB gzip** after S18; +1.0 kB / +0.36 kB gz vs S17's 410.66/132.32 for `engine/grid.ts` + the two call sites. Prior baseline for context: **410.66 kB / 132.32 kB gzip** after S17; JS +~2.5 kB gz vs S8's 130.1 for the new `canvas/door-swing.ts` module + the door inspector branch + the opening tool. Pre-S8 baseline for context: **403.5 kB / 130.1 kB gz**; JS +0.6 kB gz for `importRejection`/`cleanVec`/`clampSpan`, HTML 0.87→1.31 kB for the injected CSP meta. `src/security-headers.ts` is BUILD/TEST-ONLY — imported by `vite.config.ts`, never by a client module, so it does not reach the bundle (verified by grep against `dist/assets/*.js`). Pre-S8 was ~402 kB / 129.5 kB gz; JS +2.4 kB gz / CSS +0.19 kB gz vs S16 for `selection-cycle.ts`/`placement.ts`/`canvas-help.ts`/`announce.ts`/`useAnnouncer.ts`/`LiveAnnouncer.tsx` + the a11y CSS). `src/styles/contrast.ts` and everything under `src/test/` are TEST-ONLY and tree-shake out of the bundle. Self-hosted fonts are static assets in `public/fonts/` (7 Latin-subset woff2 + `LICENSE.md`, ~148 kB total, 2 preloaded ≈36 kB — NOT in the JS/CSS bundle). Run all four (lint/test/build) before claiming done.

**GitHub (as of 2026-07-19):** the repo is public at **github.com/rayancheca/phantom-lock** (`origin`, default
branch `main`). The owner wants visible contribution activity, so **push `main` after every session lands the
gate** (land per-session branch work onto `main`, then `git push`). The bundled demo apartment's real address
was scrubbed to the placeholder **"Maple Court"** across all history — keep it that way; `docs/sessions/` and
`coverage/` are gitignored (local-only). **Screenshot policy CHANGED in S8 by explicit owner decision** — the
owner, asked directly whether README screenshots of the bundled "Maple Court" demo (which is modelled on their
real home) could be published to the public repo, answered: *"pulbish and change the rules. idc about privacy"*.
So the former "never publish the real-floorplan screenshots" clause is **retired**: `docs/screenshots/` is
committed and published, and README screenshots of the bundled demo are allowed. The **street address** stays
scrubbed to the "Maple Court" placeholder (unchanged, and no reason to undo it), and secrets/credentials scanning
is unchanged. Do not re-tighten this without the owner saying so.

## Architecture map

**Engine (`src/engine/`, pure TS, fully unit-tested):**
- `raytrace.ts` — ray casting, `directPath` (3D LOS with graze attenuation), `collectSurfaces`, `wallKeptSpans` (door gaps). **(S19)** `directOcclusion` reads only `hit.t`, so it now calls `geometry.ts`'s `surfaceT` — the same `t` without building `point`/`normal` (and without the `Math.hypot` inside `v.norm`). That change alone took the span-399 object-bomb payload 4.9 s → 0.12 s. It deliberately has **no** height prefilter: dropping surfaces below both endpoints rests on `zAt >= min(zFrom,zTo)`, exact in real arithmetic but only to an ulp in floating point, and a wrongly-skipped surface would silently drop a factor out of an `attenuation` product that is on screen in the Echogram.
- `geometry.ts` — ray/segment/circle primitives. **(S19)** adds `raySegmentT`/`rayCircleT`/`surfaceT`: `raySegment`/`rayCircle`'s `t` with the `point`/`normal` construction dropped, `-1` as the miss sentinel (every accepted `t` is `>= EPS`, so it is unambiguous) and NaN still flowing through as a hit. Identity vs the full forms is asserted over 80 000 randomized queries plus a deterministic case inside the 1e-9 `u` tolerance band.
- `stereo.ts` — `computeAudio`/`computePair`: pair metrics (ITD/ILD/angle/lock), `apexBlocked`, relocated `sweet` spot. **(S3)** the equilateral test (`eqError`/`isEquilateral`) is now pure **2D plan** distances — consistent with the 2D apex/angle/base — while `dA`/`dB` stay 3D for ITD/level; `locked` also requires 3D arrival symmetry (`pathDiff ≤ ITD_LOCK_TOLERANCE_M` = 0.07 m ≈ 0.2 ms) so an elevated-but-plan-symmetric pair locks yet a mismatched-height pair never false-locks.
- `pairspot.ts` — `bestPairSpot` (per-pair wall-aware seat search — runs once per apex-BLOCKED pair, so up to 32× per `computeAudio`; its fixed `GRID_STEP` 0.35 gives 4× the cells `bestspot` walks over the same bounds), `bestReflectionDb` (image-source first-order bounces, **both legs occlusion-checked**). **(S18)** its sweep step is `cappedStep(bounds, GRID_STEP, objects + 2·surfaces)`. **(S19)** `bestReflectionDb`'s body MOVED to `reflection.ts`; what remains here is a thin wrapper that builds a prepared context per call — right for a one-off query, WRONG inside a sweep (`bestPairSpot` calls `prepareReflections` once and `reflectionDb` per cell). Also S19: `reachDb`'s two calls now short-circuit the **computation**, not just the predicate — `||` stopped evaluating the test but `rb` had already been computed. **(S3)** a bounce is now only credited when its point `u` lands on a **solid (kept) span** of the wall — surfaces filtered by `objectId === w.id` — so reflections no longer pass through door/window openings; plus an explicit zero-length-wall guard.
- `bestspot.ts` — `bestListeningSpot` field (green ★ + glow): occlusion + reflections for ALL speakers, capability-weighted (mini 0.65), TV-mode gates score on `tvViewQuality`. **(S18)** its sweep step is `cappedStep(bounds, baseStep, objects + speakers·surfaces)`. **(S19)** two changes: `tvViewQuality`'s per-cell `surfaces.filter` is hoisted to once per sweep, and — when every speaker is paired — a cell whose pure GEOMETRY (`pairQualityAt`) is zero for every pair is skipped **before any occlusion work**, which is the entire cost of the cell. The proof and its one NaN caveat are in the code; `solos.length === 0` is load-bearing and policed by a negative control (dropping it breaks 8 of 162 golden entries). Deliberately `=== 0`, never a threshold: skipping `q < 0.05` also passes the whole corpus and is still wrong.
- **`reflection.ts` (S19, pure leaf — imports `types`/`geometry`/`speakers`/`vec` only):** the first-order wall-bounce search, prepared once per sweep instead of re-derived per grid cell. `prepareReflections(surfaces, walls, objects)` hoists per-wall constants (edge vector, `v.norm`'d direction, length, `20·log10(keep)`, and the open-door spans as a raw `[lo,hi]` interval list — turning an O(objects) scan inside the innermost loop into a couple of comparisons) and lazily caches per-(speaker, wall) mirror images; `reflectionDb(ctx, sp, p, earZ)` returns the identical double `bestReflectionDb` did. `isBlocked` replaces `surfaces.filter(...)` + two `directPath` calls with an allocation-free scan that skips the excluded object in place — legal because `bestReflectionDb` reads only `.blocked`, a pure existential over surfaces, so any visit order and any witness give the same boolean. **`directOcclusion` is left byte-unchanged**, which keeps the four `.attenuation` readers (`reachDb`, `bestListeningSpot`'s LOS test, `optimize.ts`'s score, and the on-screen Echogram via `traceScene`) out of the blast radius BY CONSTRUCTION. Bounding boxes and the per-leg last-blocker slot are a **search ORDER, not a filter** — a negative is settled by an unfiltered rescan, so neither needs a conservatism proof, which matters because `raySegment`'s near-parallel band can report a hit outside the box it was derived from and `addRoomShell` builds exactly that flush-collinear geometry. Measured: 7.7 µs → 1.0 µs per call.
- **`grid.ts` (S18, pure leaf — imports `types` ONLY, takes `bounds` as a parameter so there is no `scene→grid→scene` cycle):** bounds the two grid sweeps. `axisCells`/`gridCells` are UPPER bounds on what `for (t = min + step/2; t <= max; t += step)` really iterates (`floor(span/step) + 2`; the exact `floor(span/step − 0.5) + 1` is NOT a bound — float drift makes the real walk exceed it, measured 9 123 times in 560 000 samples). `cellBudget(perCellCost) = min(MAX_GRID_CELLS 160 000, MAX_GRID_WORK 1.5e8 / perCellCost)` — TWO ceilings because they catch different shapes and neither alone suffices (a 400 m square with 20 walls has 1.24 M cells but a work product *below* several legit scenes; a 5 000-object scene costs 47.8 ms per cell so even 100 cells is 5 s). `cappedStep` solves `(spanX/s + 2)(spanY/s + 2) ≤ budget` in closed form via the quadratic root, and **returns `baseStep` through `Math.max` — the identical float — whenever nothing binds, so bit-identity is STRUCTURAL, not a tested coincidence.** `minAdvancingStep` floors every step at `2·|coord|·ε` (closes a pre-existing non-termination class — see the lessons). Both constants are calibrated against the ENUMERATED protected set in `__tests__/fixtures/legit-scenes.ts`; re-derive them against that list if you touch either.
- `optimize.ts` — `suggestPlacement` with `target: listener | room | house`; TV-behind-wall falls back to music with a note. **(S3)** whole-house `placeAcrossHouse` keeps a **per-room** `Map<roomId, Vec2[]>` and adds a dominant separation reward (`sepR·SEP_WEIGHT`, `MIN_HOUSE_SEP` = 1.0 m) so two pods sharing a room never stack on the same point — yet the most-separated valid spot always wins, so a pod is never silently dropped.
- `rooms.ts` — `regionOf` flood-fill regions (`doorsBlock` option: true for sound zones, false for walkable floor). **(S25) `segsCross` is the TEXTBOOK intersection, not the proper-only one** — it required a strict `d1*d2 < 0 && d3*d4 < 0`, which is right only when all four determinants are non-zero, and the app manufactures zeros: the grid origin is `sceneBounds().min − cell` and `sceneBounds` reads door rect CORNERS, so an ordinary door's `h = 0.1` lands a whole cell-centre ROW on a wall metres away and the fill walked straight through. Measured 19 → **0** fully-unsealed designs over a 300-design corpus. THREE degenerate shapes, all covered by the four `=== 0` branches; the `d1`/`d2` pair is NOT optional (a partial fix left 4 of 300 unsealed — see `THE SEAM` fixture). Over-blocking was measured, not argued: a 0.9 m doorway still connects at 3.0, 2.4, 1.6 and 1.0 cells as the cell grows. **(S3)** the grid cell is now **adaptive** (`max(0.3, span/158)`) instead of a hard 160-cell clamp, so scenes wider than ~48 m no longer silently truncate; bit-identical for spans ≤ 47.4 m.
- `arrange.ts` — furniture placement brain (door corridors, daylight, feng shui, first-reflection absorbers, `ZONE_AFFINITY`, walkable containment) + `suggestInventory` ("Decide for me"). **(S33)** four changes, all measured over 8 archetypes x 60 seeds: (1) a `Slot` now carries `free`, and an open-floor slot is ORIENTED per preset by `orientFree`/`faceToward` before it is fit-tested — until S33 `openSlots` emitted the CONSTANT world facing `{x:0,y:-1}` with `rotation: 0`, which is not even self-consistent (rotation 0 puts a rect's front at `(0,+1)`) and reduced the armchair's cone test to "is the TV north of this point?"; (2) `wallSlots` offers EVERY side of a wall that is real floor, because `inward` was flipped toward the BUILDING centroid and one face of all 960 partitions was therefore unreachable (only **65.7 %** of floor-facing wall length was ever offered) — the exterior shell is unaffected because `fits`'s `walkable.contains` rejects its outward face; (3) `SEAT_CLEARANCE` 2.0 m keeps OPEN pieces off the listening seat, scoped to open pieces because applying it to wall slots empties a 4x3.5 office outright; (4) `ArrangeItem.optional` + a structured `ArrangeResult.skipped` separate a room's PROGRAMME (a promise) from its FILL (an ambition) — and kill the `/skipped/i` regex `generateDesign` used to run over the notes. `openAnchor` is scoped to the SAME ZONE, or a bedroom's reading chair turns to face the living room's TV through a wall. Two hard rejects became penalties (`armchair`'s cone, the tall-piece window rule); `sofa`'s and `tv`'s remain. **(S39) a room now keeps the furniture it was promised.** `ArrangeItem.room` carries a `RoomLabel.id`, `Ctx.zones` entries gained an `id` to join against, and `placeOne` scores that room's slots FIRST. Before it, `inventoryFor` reasoned per room and summed the room away, so everything was placed by one global argmax — and **all 60 corpus programme misses were WRONG-ROOM**, a piece ordered in the right quantity and placed successfully in the wrong room. `zoneAffinity` provably cannot fix that: `ZONE_AFFINITY.bed` matches "Bedroom" and "Guest bedroom" IDENTICALLY, so both candidates get the same +1.6 and the term cancels out of the argmax — swept to 3.0 and 6.0 and to a −3.0 penalty, the count of designs putting both beds in one bedroom stayed at exactly **34/60** every time. `pinnedZone` holds the three clauses, each a measurement: only a REQUIRED piece is pinned (pinning fill too costs no-speaker 7 → **14**, and buys nothing since every piece `programme` asks about is `core`); a pin may pull a piece OUT of the seat's room but never push one IN, which is `SEAT_CLEARANCE`'s principle one level up (without it 7 → **9** — see `docs/ideas.md` §15c, the TV); and a pin is a PREFERENCE, so `placeOne` recurses ONCE with `room` dropped when nothing survives the filter (refusing outright takes designs skipping a piece 9 → **69** of 480). ⚠️ The queue builder is `items.filter`, NOT `items.find` — with per-room items several entries share a `presetId`, and `find` places ONE bed and leaves `skipped` empty because the second was never queued. `MAX_PER_PRESET` 6 stays GLOBAL per preset, so this change moves pieces without ever ordering more (measured: a 10 000-item array still queues 6, in 5 ms). The outer loop MUST stay preset-major: `scoreSlot` reads `findRole(ctx,'tv')` and `findByLabel(ctx,'Sofa')`, which scan the whole plan and return the first hit, so room-major would position the second room's TV against the first room's sofa.
- **`detect.ts` + `vision/` (REWRITTEN in S22):** floorplan image → walls. Measured against the enumerated corpus in `__tests__/fixtures/floorplan-corpus.ts`, the old Hough pipeline scored **52.1 %** and emitted **61 walls** on an image containing no floorplan; the replacement scores **95.6 %** and refuses. The failure was structural: Hough voted over FILLED strokes (so thickness manufactured duplicates, and `MERGE_RHO_PX` served as both the NMS window and the collinear-merge window, making that merge path *unreachable*), `segmentsOnLine` gathered ink within a band of an INFINITE line (so one diagonal stitched a sofa, a wall and a door arc into a cross-plan beam), furniture was rejected by BOUNDING-BOX SPAN, and nothing checked the answer. The new pipeline asks a local, connected question: `inkMaskOf` → `removeThickRegions` (drop anything locally FATTER than a wall — the only discriminator that works when furniture TOUCHES a wall, which a component filter cannot) → `closeMask` (fill a cavity wall so it thins to ONE centreline) → `removeSmallComponents` → `thin` (Zhang-Suen) → `skeletonToSegments` (follow each branch: a cross-plan beam is unconstructible because nothing connects its ends) → `regularize` (dominant axis → snap → collinear merge → corner join) → `filterBySupport` → `assessDetection`. **`detectWallsFromUnderlay` now returns `{walls, quality}`** and returns ZERO walls on a refusal, so a caller that ignores `quality` still cannot commit a tangle. `WORK_MAX` raised 640 → 900 (the old cost was a 180-angle accumulator swept 48 times; thinning's iteration count is half the stroke width and does not grow with resolution). Deliberately NOT routed through `integrateWall`: measured, feeding N detected walls through it sequentially yields exactly **N²/2** objects (40 → 800), and `joinCorners` already makes corners meet. **(S26) two structural facts about this pipeline that were not written down before.** (1) `detectWalls` is PURE and takes whatever bytes you hand it — the app's own chain puts **two** unconditional lossy stages in front of it (`buildUnderlay` caps at 1600 and re-encodes JPEG q0.72; `detectWallsFromUnderlay` then caps at `WORK_MAX` 900), so any measurement that calls `detectWalls` on a source file is measuring a path no user can reach. That mistake produced a P0 in S25 and repeated inside S26. `WORK_MAX` is now EXPORTED and a test asserts it stays under `WALL_HALF_WIDTH_MAX / WALL_HALF_WIDTH_FRAC` = 1333, the point past which the poché clamp starts deleting real walls (measured: `heavy-poche` at 2.5× loses 97.5 % of its ink and is refused — latent only because the wrapper shrinks first). (2) `detectWalls` now takes a LAZY second reading at the default sensitivity, and refuses for structure only if BOTH readings fall short: `sensitivity` scales `minSegment` and `structure` is measured on the segments that survive it, so turning the knob DOWN mechanically lowered structure and reported the user's own pickiness back as evidence about their image. Stages 1–5 do not depend on `sensitivity`, so the second reading re-runs only 6–8, and only when the first would have been refused. The stated, tested invariant: **the knob may change WHICH walls are offered; it can never, by itself, turn an accepted image into "this doesn't look like a floorplan"** — ⚠️ **and that holds for the `unstructured` cause ONLY**, which the sentence omitted for two sessions. The rescue fires for that cause and no other, so a `too-few-lines` refusal is not covered: measured over a swept family of sparse 3-wall plans, **31 are accepted at 'Balanced' and refused at 'Careful' — identically on `main` and on the S28 engine**, single candidate, so it is neither new nor caused by the candidate set. Filed as `docs/ideas.md` §13f. **(S28) stage 1 is now a CANDIDATE SET, not one rule.** `inkThresholds` returns the gradient-weighted cut and the plain cut — best guess first, de-duplicated, at most two — and `detectWalls` runs the pipeline at the first, re-running at the second ONLY when the first reading is refused. This exists because S27's gradient rule and the pre-S27 plain rule are each right about a different page and each catastrophically wrong about the other's: gradient weighting scales a tone's vote by ~1/thickness, so it demotes a flat mass (right on `scan-letterbox`) and equally demotes THICK LIGHT WALLS under thin dark annotation (wrong on `screened-poche` — 10 walls, REFUSED). The two fixtures are a MATCHED PAIR and are what forbid every simpler rule: on one the correct cut admits LESS ink and comes from the edge histogram, on the other it admits MORE and comes from the plain one. **The null cost is zero against what shipped**: the acceptance set is `accept(gradient) ∪ accept(plain)` (a theorem, verified 591/591), S27 never landed so `main` IS the plain rule, and over 504 null readings new-vs-`main` is 61 for the S27 engine alone and 61 for the candidate set. NO challenger guard survived measurement — over an enumerated 391 legitimate rescues structures run to 0.214 while attacks reach 0.346, so the populations OVERLAP and no floor separates them; the 0.45 first proposed would refuse 87 of the 391 and still miss the worst attack. `DetectionResult.ink` records which cut answered, because a fallback that silently never runs is indistinguishable from one that runs and agrees.
  - `vision/mask.ts` — Otsu + an EXACT Felzenszwalb distance transform, on which `dilate`/`erode`/`closeMask`/`removeThickRegions` are all thresholds, so each is O(pixels) regardless of radius. The blob rim is swallowed at `maxHalfWidth · √2 + 1` (a right-angle corner is the farthest boundary point from the eroded core; the smaller figure leaves exactly four corner pixels behind). **(S27) the Otsu threshold is chosen on a GRADIENT-WEIGHTED histogram** (`edgeWeightedHistogram`): a 3×3 box blur, then |dx|+|dy| central differences, and a pixel votes only if that clears `EDGE_GATE` 16 — so a large FLAT region contributes only its two boundaries however much of the page it covers. A plain histogram counts AREA, which is what let the owner's flat grey letterbox bars (11.1 % of the page at ~198) put two near-tied maxima in the criterion (175 at 100.00 % vs 209 at 98.07 %) and a tone curve decide whether ink was 4.6 % or 17.4 %. Below `MIN_EDGE_FRACTION` 2 % of the page clearing the gate it falls back to the plain histogram, which is exactly the pre-S27 decision. Both loops CLAMP at the border — leaving the blur ring at zero and differencing across it manufactures a false ~250-level edge around the whole image, which on an 80×60 page was the ONLY thing voting. **(S28) the starvation guard is `MIN_EDGE_DENSITY` — votes per unit page PERIMETER, not a fraction of AREA.** A vote is a boundary pixel, i.e. a LENGTH, so it grows as k while area grows as k², and the old shape therefore fired MORE readily the LARGER the image: measured, at 4× it starved 9 of the 22 legitimate fixtures. Votes/perimeter is flat (1.721 / 1.721 / 1.721 on one page-spanning stroke at 1×/2×/4×) and the new floor of 1.0 is a verified no-op at 1× on all 25 fixtures. The guard STAYS rather than becoming redundant under the candidate set, and the reason is measured: a page that STRADDLES 127 gives zero votes and `otsuThreshold`'s 127 initialiser then produces a plausible WRONG mask rather than an empty one, so the plain candidate never runs — `hollow-rect` compressed to [125,136] reads 100.0 % with the guard and 56.5 % without.
  - `vision/thin.ts` — Zhang-Suen, plus **`crossingNumber`**, which `classify` uses instead of a raw neighbour count. Not academic: thinning leaves staircases, a staircase pixel has three neighbours in the middle of an unbranched line, tracing stops at junctions — so the neighbour-count version shattered every non-axis-aligned wall and a plan photographed 8/20/22/24/26° off-square returned **zero walls**.
  - `vision/trace.ts` — skeleton → graph → polylines → RDP → segments, plus `looksLikeAnnotation` (door arcs and dimension text). The arc rule compares an **implied radius** against the plan's scale, because thinning chamfers a right-angle corner into two 45° bends and a turn-only rule dropped a whole room outline.
  - `vision/regularize.ts` — `dominantAngle` (length-weighted, folded mod 90°, so a photo shot off-square is straightened to the BUILDING) → `snapToAxes` (which deliberately leaves a genuine 30° wall alone) → `mergeCollinear` (one span per uninterrupted run: duplicates collapse, fragments rejoin, DOORWAYS survive) → `joinCorners` (L-corners to the exact line intersection, T-junctions projected without moving the through-wall) → `inkSupport`.
  - `vision/quality.ts` — the refusal. Three independently-failing signals (support / structure / explained). `MIN_STRUCTURE` is **0.25**, lowered from 0.40 after that fired on a 22°-rotated photo (0.364) and on heavy-poché-with-thin-partitions (0.313) — each an 83–96 % correct read thrown away. **(S26)** the S25 note here — "it is still too high, the owner's plan scores 0.231 and is REFUSED" — was **WRONG and is retired**: that number came from the original 1320×1734 file, and the app puts two lossy stages in front of `detectWalls` (`buildUnderlay` 1600 + JPEG q0.72, then `WORK_MAX` 900). Through the real chain the owner's plan measures **0.278 / 0.500 / 0.646** at Careful / Balanced / Thorough and is accepted at all three — confirmed by driving the real UI. `MIN_STRUCTURE` is NOT known to be too high; do not lower it. Two things did change: `QualityOptions.referenceStructure?` lets `detect.ts` pool a second reading into the structure gate (the monotonic-knob guarantee — see below), and it is now recorded that **`support` and `explained` cannot separate anything** — `no-plan-lines` scores 1.000 on BOTH at every sensitivity, higher than the lowest legit `explained` (0.867), because both are measured against the mask the pipeline itself produced. `structure` is the only signal with separating power. See `docs/ideas.md` §13.
- `joints.ts` — wall snapping (`snapToWalls`) + `integrateWall` (crossings split BOTH walls into chunks)
- `scene.ts` — presets, sanitize, `addRoomShell`, `loadStore` (legacy localStorage `phantom-lock:v2` reader — now only used as the migration source + IDB-unavailable fallback). **Multi-listener (Session 2):** the source of truth is `scene.listeners: NamedListener[]` (`{id,name,pos,z}`) + `scene.activeListenerId`; `scene.listener` is a **mirror** always kept equal to the active seat so every engine/UI read-site is unchanged. Write ONLY through the helpers — `updateActiveListener` / `setActiveListener` / `addListener` (no-op at `MAX_LISTENERS`=32) / `renameListener` / `removeListener` — each runs `syncActiveListener` (which clones the mirror `Vec2`, never aliases). `sanitizeScene` migrates v2 single `{pos,z}`, v1 `{x,y}`, and the new `listeners[]` shape, truncating to the cap **without dropping the active seat**. Constructors + `addRoomShell` seed the fields (`addRoomShell` recenters ALL seats on a first room). `sceneListeners`/`activeListener` are defensive readers for hand-built scenes.
- `db.ts` — **IndexedDB persistence (Session 1)**: stores `layouts`/`underlays` (image Blobs)/`meta`; `bootstrapPersistence()` migrates the legacy localStorage blob on first run (keeps the old key as rollback), `saveLayout(layout, writeImage)` does per-record async writes, `loadFromIDB()` re-runs `sanitizeLayout`; hardened localStorage fallback when IDB is unavailable. In memory `Scene.underlay.src` stays a data URL so render/UI/export are unchanged. **(S20) folders ride the EXISTING stores — `DB_VERSION` stays 1 and `onupgradeneeded` is byte-unchanged:** `LayoutRecord.projectId?` (optional on disk, which is the truth for every pre-S20 row) and `MetaRecord.projects?`. A fourth object store would need a version bump, and `openDB` REJECTS on `onblocked` (an old tab holding v1) → `bootstrapPersistence`'s catch → localStorage mode → autosave overwrites the FROZEN pre-migration snapshot. Adding a field to an existing record needs no schema change at all (IDB stores structured clones). **`saveMeta(activeId, projects)` takes projects as a REQUIRED parameter** — it rebuilds the whole meta row and runs unconditionally every autosave cycle, so a 1-arg version was a 400 ms fuse on total folder loss. `saveLayout`'s record literal and `loadFromIDB`'s `raw` literal are built field-by-field and are therefore SILENT-DROP sites: any future per-layout field must be added to both. `loadFromIDB`'s call to `assembleStore` is WRAPPED — an assembly throw must never reach `bootstrapPersistence`'s catch, which puts a stale frozen snapshot on screen and then overwrites it. `buildExportBundle` is **version 2**: each layout carries its project's NAME (ids are meaningless in another store).
- **`projects.ts` (S20, pure LEAF — imports `types` + `ids` only; ORDERING added S29):** folders.
  **(S29) `order` is a coordinate WITHIN A CONTAINER**, and there are two kinds: HOME (the home
  project's own designs PLUS every other project as a folder TILE, sharing ONE coordinate space —
  which is exactly what lets a tile sit between two designs) and a folder's contents.
  `normalizeOrder(store, {touch})` is the ONLY writer and canonicalises each container to dense
  integer ranks; every other operation expresses intent as a FRACTIONAL order and lets
  normalisation make it integral, so no caller reasons about collisions. `homeProject` is
  **`projects[0]`**, NOT the oldest by `createdAt` — an adversarial pass broke that identity
  (`sanitizeProjects` defaults a missing `createdAt` to `Date.now()`, so one old record ties every
  project, and `findOrCreateProject` lets an IMPORT steal it). `homeItems` is the mixed home
  sequence; `mergeIntoNewProject` is ATOMIC and returns the id it minted (`addProject` cannot —
  it mints inside itself, which is why a merge built from it would leave an empty folder on an
  interruption); `dissolveEmptyProject` refuses unless the folder holds NOTHING, which is the
  whole reason it needs no confirm and no undo slot. **Every writer of `projectId` re-stamps
  `order`** — without it `moveLayoutToProject` decided where a design landed from its position in
  the folder it LEFT, and `removeProject` riffle-shuffled two arranged sequences into
  `A1 B1 A2 B2 A3 B3`. `slotOrder` is MIDPOINT insertion against the container's REAL sequence,
  never `at - 0.5`: ranks are dense only immediately after normalisation, and a delete leaves a
  hole while a new design carries `Infinity`. The model is FLAT — `Layout.projectId` → `Project.id`, `LayoutStore.projects` is the list — because the pointer has ONE direction and cannot dangle, and because deleting a folder can then be a pure regrouping. `assembleStore(rawProjects, layouts, rawActiveId, onProjectLoss?)` is the SINGLE seam establishing every store invariant: ≥1 project · every `projectId` resolves (an orphan is RE-HOMED, never dropped and never rendered into no group) · **project ids claim the shared id namespace BEFORE layout ids** (re-issuing a project id dangles N pointers at once; a layout id dangles at most `activeId`, which the next line re-derives) · layout ids dedup store-wide (pre-existing bug: two layouts sharing an id made `updateLayout` write both and `persistNow` `put` both to one IDB key) · nothing throws on hostile input. It takes ALREADY-SANITIZED `Layout[]`, which is what keeps it a leaf and avoids a `scene → projects → scene` cycle. `orphanHome` is the OLDEST project by `createdAt` (tie-broken by id), NOT `projects[0]`: the repair is recomputed on every load and never persisted, so an unstable target would move an orphan between folders across reloads. **(S30, owner decision) `removeProject` re-homes a deleted folder's designs onto the HOME GRID at the tile's slot** — it was the ADJACENT folder, which made sense under the S20 sectioned-list IA and reads on the S29 home screen as the designs leaping into a folder the user never opened. The new sequence is rebuilt EXPLICITLY as a list of ids rather than by interpolating between neighbouring ranks: the gap above a midpoint insertion is only 0.5, so any fixed fractional step overshoots the next item once the folder holds enough designs. It also refuses the HOME project — home IS the grid, so there is nowhere to re-home to — and `deleteProject` carries the same guard, because without it the action wrote an undo snapshot and toasted "Deleted …" over a store `removeProject` had declined to change. `removeProject` NEVER deletes a layout. `moveLayoutToProject` is the ONLY writer of `projectId` and bumps `updatedAt` (the entire autosave change detector). `activeProject` is DERIVED from the active layout — there is deliberately no `activeProjectId` state (the S14 "one controller" lesson one level up).
- **`generate/` (S22, a LEAF CONSUMER at the top of the graph — the position `seed.ts` occupies; QUALITY overhauled S33):** **(S33)** `inventoryFor` orders to a COVERAGE BUDGET (`COVERAGE_TARGET` 0.24) against a per-room `programmeFor` of `core` (required) + `fill` (optional, each capped), replacing six area thresholds of which **four never fired on any of the 960 rooms in the corpus** and which left `cabinet`/`round-table` unorderable by any cell. The target is calibrated on `apartmentScene()` — 14.8 m² of furniture on 51.4 m² of walkable floor, **28.9 %** — not chosen. The studio-sleeps rule is gated on the single room being a LIVING space: `cells.length === 1` is also true of `office` and `cinema`, so it used to put a double bed in every generated home office, which NO corpus score could see (the bed placed fine and counted toward coverage) and only driving the real UI caught. `tile.ts` `split` draws from the cuts that leave both halves inside `ASPECT_BUDGET` 2.0 rather than blind — always taking the SQUAREST cut was measured first and REJECTED because it collapses the design space (distinct room sets over 60 seeds 58 → 34 on `loft`). `loft`/`great-room` envelopes were trimmed: one "living room" was routinely larger than the whole Maple Court apartment. Scored by the test-only instrument `generate/__tests__/design-score.ts`: **total 0.7856 → 0.8552**, skips 26.3 % → **1.9 %**, no-speaker designs 46 → **7** of 480, coverage 12.7 % → 18.4 %, cost 10.1 → 22.3 ms. "Generate a design". Eight hand-authored ARCHETYPES × randomised envelopes, guillotine room tiling, doors, windows, furniture and a verified stereo pair, deterministic per 32-bit seed. Measured over 192 designs (24 seeds x 8 archetypes) **after the S24 unit fix**: **91.1 % open on a LOCKED pair** (pre-fix 88 %, measured on a different corpus — the direction of this number is corpus-dependent, so do not read it as a benefit of the fix), 477/480 distinct shells, 3.9 ms mean / 18.5 ms worst, zero import rejections, zero mirror desyncs, zero fields lost to a round-trip. It imports `scene`/`arrange`/`raytrace`/`stereo`; **nothing in `src/engine/` may import it back** (that makes `scene → generate → arrange → scene` AND `scene → generate → stereo → pairspot → scene` at once). Determinism covers GEOMETRY, never ids — `Layout.id` must stay `createId` because `assembleStore` dedups layout ids store-wide. `tile.ts` is guillotine subdivision, so "tiles without overlaps or gaps" is structural rather than tested. **(S24) `edgeAngleRad` returns RADIANS** — it returned degrees into `RectObj.rotation` until S24, so 50.7 % of every generated opening was drawn at the wrong angle (0° walls were accidentally right; 90° out by 26.62°, 180° by 53.24°). `wallKeptSpans` is rotation-BLIND, so the acoustic opening was never affected — what moved was the drawn symbol, the ZONING flood-fill (`collectBlockers` reads `rectCorners`), the furniture arranger's door corridors, and a window's own surfaces. **`shell.ts` emits interior partitions as TWO stubs with a real gap and the door rect inside it** — `rooms.ts` `collectBlockers` pushes the whole wall segment and never consults `wallKeptSpans`, so a door in a SOLID wall opens an acoustic path but no walkable one and every piece of furniture stays trapped in the seat's room (measured post-S24 on `two-bed`/seed 21: walkable 91.26 m² vs zoning 38.88 m² with the gap; equal without it — the previously documented 59.3 m² was computed from the BUGGY door rotation). `collectEdges` reduces each axis line to **atomic intervals** rather than matching whole cell edges, because a guillotine tiling is NOT conforming — a 7 m boundary faces two 3.5 m edges, none of the three match, and the wall is drawn three times with no door in any of them. `pair.ts` is a verified LADDER (ten radii × the TV direction then a 16-way sweep) accepting only what the real `traceScene`→`computeAudio` already reports as locked, so a design ships locked or with NO speakers — never placed-but-unlocked, which the hero's edge-triggered ignition cannot celebrate. Furniture is placed BEFORE speakers (`arrange.ts` `fits()` iterates objects and its own placed list, and speakers are neither), at the documented cost that the first-reflection-absorber layer never fires.
- **`ids.ts` (S20, pure leaf):** `createId`, moved verbatim out of `scene.ts` so `projects.ts` can mint ids without the cycle. `scene.ts` re-exports it, so every existing importer is unchanged.
- **`seed.ts` (S16, widened S20):** first-run demo. Now seeds a populated WORKSPACE — 2 folders × 6 designs, deliberately different in OUTCOME (couch pair locks · bed variant with the TV rolled over locks from its own Bed seat · four-pod variant · a bare audio-free shell · two sketches). Coordinates solved in `docs/sessions/S20/bench/seed-solver.mts` and re-asserted end-to-end in `seed.test.ts`. Still gated on `isPristineOrigin` + `bootstrapPersistence.firstRun`, and still NEVER reached from the degraded catch branch.
- `types.ts` — `Selection` includes `{ type:'multi', objectIds, speakerIds }`; `ToolMode` includes `'room' | 'marquee' | 'lasso'`; `RoomLabel {id,name,at,w?,h?}` = zone; `NamedListener extends ListenerState {id,name}`; `Scene.listeners?`/`activeListenerId?` are OPTIONAL (so hand-built test fixtures with only `listener` still type-check) but always populated for real data. **(S20)** `Project {id,name,createdAt}`; `Layout.projectId` and `LayoutStore.projects` are **REQUIRED in memory** — that is exactly what turns the seven non-spreading `setStore` literals into compile errors — while the DISK types (`LayoutRecord`/`MetaRecord` in `db.ts`) keep them optional, because optional-on-disk is the truth for every pre-S20 record. Note the split surfaces under `npm run build` (`tsc --noEmit`), NOT under `npm test`: vitest strips types with esbuild, so a green suite proves nothing about it

**UI:**
- `components/app/App.tsx` — **(S37) 85 lines: the async-bootstrap wrapper and NOTHING else.** It must keep `export default function App` — `src/main.tsx:4` and `shell.a11y.test.tsx:5` both import it from that path, so the split had to run in this direction. **`components/app/AppInner.tsx` (S37, 707)** is the editor, moved verbatim; `import './app.css'` moved with it and stays the LAST import, because Rollup emits CSS in module-graph traversal order and a stylesheet that moves ahead of the component stylesheets it overrides changes the cascade (verified, not argued: the emitted CSS asset hash is byte-identical). **(S14/UX-2) the IA axis is now `appMode: 'design'|'tune'` + `designSubStep: 'build'|'furnish'`, and `theme` is a DERIVED `const` `modeTheme(appMode)` — NOT state.** The mode is the SINGLE theme controller (killed the old 3-way fight between `applyStep`/`applyTool`/the `t` key). `applyMode(entry, scene)` enters a mode+sub-step (+re-arms the wall tool on a fresh DESIGN/Build canvas); `setModeTo`/`setSubStep` are its thin wrappers (header switch PRESERVES the last sub-step, reading fresh `designSubStep` from the render closure); `applyTool(t)` sets the tool and MAY flip the DESIGN sub-step (`subStepForTool`) but NEVER the mode/theme; `runKeyCommand`'s `mode-toggle` (the `t` key) flips the mode. `initialMode(scene)` seeds boot + layout-switch. `AppInner` composes the extracted hooks + renders `<AppHeader>`/`<CanvasStage>`/`<Sidebar>`/`<AppDialogs>`. **Extracted hooks (`components/app/hooks/`):**
  - `useSceneHistory({store,setStore,setSelection})` — per-layout undo/redo. `setScene`/`undo`/`redo` are now **pure store updaters** (history bookkeeping moved OUT of the `setStore` callback → no StrictMode double-invoke reliance, fixes the dev double-pop). Coalescing is **gesture-scoped** (`beginGroup`/`endGroup` wired to `onDragging` drag boundaries + `opts.coalesce` from `e.repeat` for held keys) — NOT a 400 ms timer. `reap(liveIds, keepId)` drops deleted-layout undo buckets (the leak fix). Pure logic lives in `components/app/history.ts` (`historyPush`/`historyUndo`/`historyRedo`/`reapHistory`, unit-tested).
  - `useLayoutStore(store,setStore)` — `active`, `applyToLayout` (the `updateLayout(store,id,fn)` helper from `store.ts` that replaced the 6 duplicated `layouts.map` blocks), `setSettings`, `duplicateLayout`, `exportLayout`.
  - **`useProjectActions({...})` (S20)** — folder CRUD: create / rename / move-a-layout / delete + the delete undo. Split out of `App.tsx` for the 800-line cap, like its five siblings. Deleting a folder is a pure REGROUPING (`removeProject` re-homes, deletes nothing); the undo restores only the layouts THAT delete moved and only if they are still where it put them. Checks the `Deleted` type BEFORE consuming the shared single undo slot.
  - `useLayoutActions({...})` — layout CRUD orchestration (switch/add/rename/delete/import/`undoDelete`). `deleteLayout` calls `reap(…, keepId=deletedId)` so undo-after-undelete keeps the bucket.
  - `usePersistence({store,persistMode,showToast})` — autosave (per-layout IDB diff via `persistedRef`, photo re-encoded only when changed), pagehide/visibility flush, LOUD "Export all" toast on failure; returns `exportAll` (stays `useCallback([])` reading a `storeRef`).
  - `useSimulation(scene,settings,dragging)` — the `trace`/`audio`/`bestSpot` memo chain (identical deps; `DRAG_RAYS` lives here). **S6 moves this into a Web Worker.**
  - `useKeyboardShortcuts({state,run})` — mount-once (`[]`-deps) window `keydown` reading a `ctxRef` (killed the App keydown exhaustive-deps suppression); all branching is in the pure `components/app/keyboard.ts` `handleKeydown` (+ `nudgeSelection`/`rotateSelectedRect`, unit-tested).
  - **`useSceneEdits.ts` (S37)** — every edit that writes the SCENE rather than the store: objects, speakers, pairs, the listener, multi-deletes, the seat roster, `seatSelection`/`splitWall`/`addPreset`/`matchVolumes`. None memoized (nothing here is an effect dep), and the delete paths snapshot `lastDeletedRef` from the PRE-delete scene. That ref is PASSED IN — the app has ONE undo slot, shared with `useProposals`/`useLayoutActions`/`useProjectActions`, and a second `useRef` here would silently split it in two.
  - **`useProposals.ts` (S37)** — the optimizer + arranger cards, and `closeFloatingPanels`. ⚠️ `discardDetectionRef` and `closeFloatingPanels` move as ONE unit: the callback is mount-once and created early (mode and layout switches call it) while `useWallDetection` is created far below, so the ref IS that forward reference. `closeFloatingPanels` keeps `useCallback([])` because `applyMode` and `useLayoutActions` depend on its identity — adding `detection.discard` to that array is the obvious fix and is exactly wrong.
  - **`useBuildActions.ts` (S37)** — underlay import, two-click calibration, areas, room shells. `handleCalibrate` exits the calibrate tool ABOVE its too-close early return; `addRoom` snapshots `hasWalls` BEFORE the write.
  - **`useSpokenMirror.ts` (S37)** — the S7 off-screen readout. Its baseline effect keeps NO dependency array, deliberately.
  - **`useCompare.ts` (S37)** / **`useShareActions.ts` (S37)** — the N-up compare entry point (+ the `compare` state), and export-plan-image / copy-verdict.
  - **`../run-command.ts` (S37, pure module, node-tested)** — the keyboard/HUD command dispatcher, moved verbatim behind an explicit `CommandContext`. `keyboard.ts` decides WHICH command a keystroke means; this decides what a command DOES, which is what lets the touch HUD dispatch the identical commands with zero duplication. ⚠️ The context literal is built INSIDE the call, every call, and the wrapper is left unmemoized: `useKeyboardShortcuts` is mount-once and delivers commands through a render-assigned ref, so a context hoisted into a `useMemo` would serve the first render's scene/selection/settings forever.
  - `app-constants.ts` (`MODE_HINT` per-tool hints + `MODE_ITEMS`/`SUBSTEP_ITEMS` switch items) + `app-types.ts` (`Deleted`/`DialogState`).
  - **`useTutorial.ts` (S21)** — the guided tour's seam into the App: menu open/close plus the mapping from a
    declarative action NAME to a real app command. The runner never edits a scene itself, so the tutorial can
    never become a second implementation that drifts from the app and then teaches something untrue. The ONLY
    action that creates anything is `practice-room`, which finds-or-creates the disposable "Tutorial practice
    room" (reuse by NAME, so a re-run cannot litter the gallery) filed into `activeProject(store).id`.
  - **`components/app/mode.ts` (S14/UX-2, pure + node-tested, `__tests__/mode.test.ts` 45 tests)** — the IA truth: `modeTheme(mode)` (the single theme controller), `toolMode`/`subStepForTool`/`isToolInMode` (tool→mode/sub-step gating), `DIGIT_TOOL`/`digitTool(digit, mode)` (mode-scoped digit shortcuts — no cross-mode leak), `initialMode(scene)`. Retired `PLAN_STEPS`/`TOOL_OWNER`/`initialStep`/the `WorkflowSteps` `Step` type.
- **`components/canvas/drag-apply.ts` (S37, pure leaf):** the `Drag` union, `MOVE_KINDS`, and the six scene-writing branches of `applyMove` — `applyDragToScene` plus `previewForDraw`/`commitDraw`. This is where the drag geometry finally became testable: jsdom dispatches a plain `Event` for pointer events, so `button`/`pointerId`/`clientX` all arrive `undefined` and SimCanvas's pointer path is structurally unreachable from `npm test` (TRAP 21). ⚠️ The `Drag` record is carried in a REF and `move-rc` re-bases `rot0` IN PLACE; a pure function cannot mutate, so it RETURNS the re-based baseline and the rotation it wrote, and SimCanvas writes both back. Freezing the record, lifting it into state, or copying it before applying a move all silently revert a mid-gesture `q`/`e` on the next frame — the S23 regression verbatim. The comparison stays `Object.is`, which disagrees with `===` on TWO inputs and in OPPOSITE directions: `Object.is(0, -0)` is false where `===` is true (harmless — it re-bases), and `Object.is(NaN, NaN)` is TRUE where `===` is false, so under `===` a NaN rotation would re-base every frame and the drag would stop being a pure function of the gesture. A self-review lens caught this session first writing "exactly one input".
- **`components/canvas/useCanvasCamera.ts` (S37):** view state, sizing, fit-on-reset, `rotateBy`, `s2w`, the wheel listener, the Safari `GestureEvent` handler and the pinch maths. ⚠️ ONLY the `wheel` listener left SimCanvas's mount-once key effect — the window keydown/keyup/blur handler stays, because splitting it per concern would register two window keydown listeners, call `canvasKeyAction` twice per keystroke, and put the "a Space keyup ALWAYS disarms" invariant behind two handler paths. `wheel` is safe because it targets the CANVAS, so ordering between the two is unobservable. `isBandDragging` is passed as a FUNCTION (read at event time from inside mount-once listeners, where a captured boolean would be the mount value forever).
- **`components/canvas/useCanvasPainter.ts` (S37):** the backing store, the draw call, and the three out-of-band repaint triggers (underlay decode / DPR change / font load), each of which fires when NOTHING in the render state has changed. The render state is destructured IN THE PARAMETER LIST so the effect body touches only locals — that is what lets the dep array be a list eslint can verify with no suppression. The dep is `redrawTick`, never `setRedrawTick`: a useState setter is identity-stable, so listing the setter disconnects all three triggers and leaves a stale bitmap on screen, which no test in the suite can see.
- **`components/canvas/CanvasOverlays.tsx` (S37):** the marquee/lasso band SVG, the +Door/+Window chip and the compass. Their render GUARDS deliberately stay at the SimCanvas call site, so "is this on screen?" stays answerable by reading SimCanvas alone — which is where the S21 z-index collision had to be diagnosed.
- `components/canvas/SimCanvas.tsx` — **789 lines after S38, UNDER the 800 cap for the first time since S16 — but by only 11 lines, which is no margin. New App-level logic must go into a `canvas/` module, not this file.** What remains is state, effects and wiring: the drag machine (`startDrag`/`cancelDraw`/pinch teardown), the mount-once key listener, `applyMove`'s dispatch, `onPointerMove`'s rAF throttle, `onPointerUp`'s commit, and the JSX. The next natural cut is `resolvePointerUp` (`docs/ideas.md` §18a). All pointer/keyboard interaction: wall chains, marquee/lasso band select, ⌘-click toggle, group drag, speaker height auto-snap onto furniture (`surfaceHeightAt`), wall-hover door/window chips. **(S4)** takes an `overlayOpen` prop that gates the canvas R/Backspace keys; the wall-hover chip anchor is **identity-latched** (stays put on the same wall, switches to a neighbour, self-heals on delete/`onPointerLeave`); `chainWallsRef` is now `string[][]` (per-corner id groups); a `grab`/`grabbing` cursor; a matchMedia DPR-repaint effect; the view is frozen while a marquee/lasso band is dragged. Pure logic lives in `interaction.ts`, `pick.ts` and `chain.ts`.
- `components/canvas/interaction.ts` — **(S4)** pure, DOM-free, node-tested helpers extracted OUT of SimCanvas: `wallHoverAt`/`makeOpening` (door/window chip), `popChainSegment` (Backspace chain-undo), `selectionSets`/`resolveSelection`/`itemsInBand`/`selectionFromBand` (marquee/lasso + ⌘-click selection algebra), `watchDevicePixelRatio` (DPR-change listener, injectable `win`), `isDraggableAt`/`hoverCursor` (grab affordance), `canvasKeyAction` (R/Backspace/Space gating). 98.9% covered.
- **`components/canvas/pick.ts` (S38, pure leaf — imports `types`/`hit`/`vec`/`view`/`drag-apply`/`handles`/`interaction`/`placement`):** what a pointerdown MEANS. `resolvePointerDown(input) -> PickAction` is the twelve-branch ladder as a pure function of plain data — no refs, no event, no canvas — and `applyPickAction(act, effects)` performs it. The split is decision-vs-effect, NOT logic-vs-glue: everything that READS state to choose a branch is here, everything that WRITES is an injected effect. That is what finally made the app's most-used interaction path testable, since jsdom dispatches a plain `Event` for pointer events and `button`/`pointerId`/`clientX` all arrive `undefined` (TRAP 21).
  ⚠️ **The ORDER OF THE TESTS is load-bearing and is now pinned by tests rather than by a comment.** Grips sit BELOW the node and seat hit tests, and `drawHandles` paints below `drawNodes` to match, so a pod or a seat wins over a grip in BOTH the paint order and the hit test (S36, measured against the shipped demo). The multi-member drag sits ABOVE the individual hits, or grabbing one member collapses the selection to it. A selected wall's endpoints sit ABOVE the generic object hit, or the wall body swallows the grab.
  ⚠️ **`applyPickAction`'s order is also load-bearing, and its cost is INVISIBLE in the final scene:** `activateSeat` → `selection` → `startDrag`, because `onActivateSeat` writes the scene while the drag's coalescing group is still closed, so the seat switch is its own undo entry. Start the drag first and one ⌘Z undoes both.
  Two provenances that a rot-0 fixture cannot tell apart and that are therefore tested at `rot: 0.7`: `grabAngle` is WORLD-space (at rot 0, `Math.atan2` over world and over screen deltas is bit-identical), and the pan/band origins are SCREEN-space. It takes the `scene` PROP, not `sceneRef.current` — the same value at event time, and the one the painter and `handleTarget` are given, so the hit test agrees with the pixels aimed at (this closed §18c-1).
- **`components/canvas/chain.ts` (S38, pure leaf):** the wall chain. `chainVertex` is THE ONE definition of where the next vertex lands — the click path and the cursor-PREVIEW path each carried the same `closing ? points[0] : snapToWalls(snap(angleSnap(last, snap(raw))), …)` composition written out twice, verbatim, forty lines apart. `closing` is decided on the RAW point, deliberately before any snapping, or whether a room can be closed would depend on the direction of its last wall. `chainStep` takes an INJECTED id factory (the `commitDraw` pattern) and returns `wall: null` for a sub-`MIN_SEGMENT_M` click — which still appends a corner, whose id group is then legitimately EMPTY, and is why Backspace tracks groups rather than counting walls. `popChainSegment` MOVED here from `interaction.ts`, where it had sat since S4, and is re-exported from there so every importer is byte-unchanged (the `view.ts`/`ids.ts` pattern). ⚠️ The `chainWallsRef` bookkeeping deliberately does NOT move: it is written from four places in the component, and the FIRST vertex must push no group, because `popChainSegment` pairs `groups[i]` with the segment ENDING at `points[i+1]`.
- **`components/canvas/useFinePointer.ts` (S38):** the `(hover: none) and (pointer: coarse)` gate that hides the §16 grips from a finger, lifted out of SimCanvas. Defaults to true where `matchMedia` is absent, and keeps the Safari ≤ 13 `addListener` fallback.
- **`components/canvas/handles.ts` (S36, pure leaf — imports `types`/`view`/`placement` only):** §16's
  Word-style resize/rotate grips. `handleTargetFor(scene, selection, {mode, overlayOpen})` is THE ONE
  definition of "the grips are live", read by the renderer AND the pointerdown hit test so drawn ⟺
  grabbable is structural (the S30 `containerIntentFor` lesson). `handlesFor` places 8 resize grips +
  a rotate grip in the object's **ROTATED frame** (local +x = `(cos θ, sin θ)`, local +y =
  `(−sin θ, cos θ)`, verified against `rectCorners` to 6 dp); a DOOR gets only `e`/`w` (its `w` is the
  clear opening, its `h` the leaf thickness) and no rotate grip, matching `canRotateSel` VERBATIM
  rather than re-deriving it; a circle gets 4 cardinal grips on the WORLD axes, because a circle has
  no rotation field and there is no object frame to align to. `handleAt` takes the NEAREST grip, not
  the first — at a small on-screen size the corner and edge discs overlap and declaration order makes
  the edge grips unreachable. `resizeObject` keeps the OPPOSITE corner/edge exactly fixed (Alt = about
  the centre, Shift = aspect lock from the DOMINANT axis ratio) and **CLAMPS rather than mirrors** —
  see the lessons. `rotateObject` turns by the angle swept since the grab, normalised into (−π, π];
  Shift snaps to **15° WORLD increments, deliberately NOT the plan's axis** (S31 measured
  `dominantAngle` bistable on the owner's own plan). `applyHandleDrag(scene, obj0, …)` transforms from
  the pointerdown BASELINE, never the live object, and compares its result against the LIVE object so
  a pointer returning home restores the original. `NOOP_EPS` is 1e-9 because exact equality is
  unreachable through a cos/sin round trip. Everything is a pure function of (object, view, pointer);
  SimCanvas supplies only the gesture, which is the only split jsdom can prove (TRAP 21).
- **`components/canvas/view.ts` (S36, pure leaf — imports the `Vec2` type ONLY):** `View`/`rotVec`/
  `worldToScreen`/`screenToWorld`, moved VERBATIM out of `render.ts` so `handles.ts` can project a
  grip without a `render → handles → render` cycle. `render.ts` re-exports them, so every existing
  importer is unchanged (the S20 `ids.ts` pattern). Note the re-export does NOT bind the names
  locally — `render.ts` needs a plain `import` as well, and does.
- `components/canvas/render.ts` — pure canvas renderer; `THEMES` ('sound' dark glow / 'plan' **dark cyanotype** blueprint since S13); `labelPill` is the single annotation primitive. `FONT`/`FONT_MD` are Geist Mono (400/500), first paint gated on `document.fonts.load()` via `canvas/font-ready.ts`
- `components/canvas/font-ready.ts` — **(S13)** `repaintOnFontLoad(onReady, specs?, fonts?)`: triggers `document.fonts.load()` then ONE `setRedrawTick` repaint so canvas Geist-Mono numbers don't reflow off fallback metrics (FOUT guard). Injectable fontset → node-testable (`__tests__/font-ready.test.ts`, 5 tests), no-ops when `document.fonts` absent
- `components/gallery/LayoutGallery.tsx` — **(S29, owner-requested) THE HOME SCREEN.** ONE flat grid
  where a design card and a FOLDER TILE are peers, the way an Android launcher treats an icon and a
  folder. Drop a design on a design → a new folder AT THE TARGET'S SLOT; on a tile → it joins; in a
  gap → it moves there; click a tile → drill in. Positions are PERSISTED (`Layout.order`).
  `<ul role="list">` + `<li role="listitem">`, **NOT `role="grid"`** (measured: without real `row`
  elements that raises `aria-required-children` + `aria-required-parent`, both critical, and the
  grid wraps by `auto-fill` so React does not know the row count — plus it would promise a full
  arrow-key contract, the S7 radiogroup lesson). `role="application"` appears ONLY while moving, on
  a wrapper that is always in the DOM (every other placement raises a violation; `display:contents`
  was rejected because browsers have stripped the role off such an element). The drag surface is
  the EXISTING `.gallery-open` button — `.gallery-card` is a div holding two focusable buttons, so
  a `role="button"`/`tabIndex` on it is an instant `nested-interactive` violation. Escape is a
  LADDER inside the gallery's own handler reading a REF (that handler is window-CAPTURE and
  `stopPropagation()`s, so a React `onKeyDown` for move-cancel is structurally DEAD, not racing).
  Pure geometry lives in `gallery/drag.ts`, the state machine in `gallery/useGalleryDrag.ts`.
  **(S30) the five residuals closed.** A design can now be dragged OUT of a folder — the breadcrumb
  is a drop target (`{kind:'exit'}`, hit-tested FIRST because `.gallery-grid` is `overflow-y:auto`
  and a scrolled-out card's UNCLIPPED rect reaches into the header band), `O` is its keyboard twin,
  and clicking it mid-move is the single-pointer path. **While moving, an item click is a
  DESTINATION, not navigation** — otherwise clicking a tile drilled INTO it with the move still
  armed and the breadcrumb then committed an exit for a design that had never been in that folder.
  Focus is re-homed after every commit by ONE ladder (`focusPlanFor` pure in `drag.ts`, applied in a
  `useLayoutEffect`), and `onCommit` returns the merged project id so the plan can name the new tile.
  Escape is `gallery/escape.ts`, a total function over `{overlayAbove, moving, inFolder}` —
  `overlayAbove` FIRST so a menu opened mid-move is what Escape dismisses, and `inFolder` derived
  from the RESOLVED container so a stale drill-in cannot swallow the key. **`containerIntentFor` is
  the ONE definition of what dropping onto something does**, shared by the pointer hit-test, the `F`
  key and the click path, so the three cannot drift.
  **(retired S29) the S20 section-per-folder IA:** one `<section aria-labelledby>` per project with its name, a store-DERIVED design count (never a stored number), per-folder “New design” + a kebab (Rename / Add apartment / Add a room / Delete), and a per-card “Move to “X””. Deleting a folder re-homes its designs and is undoable; the last folder cannot be deleted.
- `components/panels/ListenerCard.tsx` — **seat manager** (Session 2): a `radiogroup` of listening spots (roving tabindex + arrow keys), switch/add/rename/remove. **(S15/UX-3) Compare is now ALWAYS present in TUNE** (was gated at ≥2 seats) — `disabled={!canCompare}` (threaded App→Sidebar→here; `canCompare` = ≥2 seats OR ≥2 layouts) with a mode-neutral enabled title ("Compare two setups side by side" — covers the two-seats AND two-layouts cases) and a **self-teaching** `card-sub` when it can't fire ("Compare weighs two readouts side by side. Add a second listening spot, or duplicate this layout, and Compare lights up.").
- **`components/panels/verdict.ts` (S15/UX-3, pure + node-tested, `__tests__/verdict.test.ts` 26 tests)** — the SINGLE source of truth for the readout (killed the drift between ScenarioCompare's `verdictOf` and MetricsPanel's inline verdict, the `.compare-verdict` bug). `deriveVerdict(audio, trace, tvAnchor): VerdictView` reproduces the old `verdictOf` EXACTLY for `{locked, quality}` (compare's summary reads only those) and adds `kind`/`headline`/`cause`; the headline gates "One pair locks, another doesn't" on **any** pair locked (`some(p.locked)`, NOT `best.locked` — locked ≠ highest-quality when apex-blocked); `representativePair` ties the cause to the best (meter) pair, or the lowest-quality UNLOCKED pair when some-but-not-all lock; `causeSentence` MOVED here verbatim from MetricsPanel. **THE LOCK edge detector** is a pure reducer — `initIgnition(locked)` seeds `prevLocked` to the CURRENT value (mount is never an edge) and `stepIgnition` bumps a monotonic `token` ONLY on a false→true rising edge.
- **`components/panels/VerdictHero.tsx` (S15/UX-3)** — the verdict lifted onto the opaque `--surface-4` hero rung at `--text-hero`, pure presentational (props: `view: VerdictView` + `seatName` + `variant: 'sidebar'|'compare'`), NOT an aria-live region. Mounted FIRST + `position:sticky;top:0;z-index:1` in the TUNE sidebar column (leads the readout, never scrolls away) and verbatim in each `ScenarioCompare` column (`variant="compare"`). **THE LOCK ignition:** `useLockIgnition(view.locked)` mirrors the reducer's `token` into a `useState` and applies it as the headline's `key` — a keyed remount replays the one-shot `lock-sweep` (the `--signal` cyan→green gradient swept through the letterforms via `background-clip:text` + a green bloom). Each consumer KEYS the hero to the displayed entity (Sidebar: `key={activeListener(scene).id}`; Compare: `key` per scenario) so switching to a *different already-locked* seat/scenario remounts (reseeds → no spurious celebration) while a genuine in-place drag-to-lock (same key) still ignites.
- `components/compare/ScenarioCompare.tsx` — **N-up scenario compare** (Session 2 as 2-up, generalized in **S20**): N independent `(project, layout, seat)` columns on a horizontally-scrollable track, so it compares seats within a design, designs within a folder, AND designs across folders. `MIN_COMPARE` 2 / `MAX_COMPARE` 8 (a **legibility** bound, NOT a CPU control — see `compare-summary.ts`). The column's React key is a stable uid so a neighbour's removal does not remount it, while the `VerdictHero` inside is keyed on the **entity** (`layoutId:seatId`) so a picker change reseeds the LOCK ignition. Pointing a column at a design shows it from that design's OWN active seat, not `seats[0]`. `compare-summary.ts` (pure, node-tested) holds the N-way sentence and derives “has a pair” from `verdict.kind` — no second source of truth. **(S15/UX-3)** the divergent local `verdictOf` + `.compare-verdict` are DELETED; each Column now renders the shared `<VerdictHero variant="compare">` (from `deriveVerdict(audio, trace, tvAnchor)`, computed on the already-memoised `Computed` object — no recompute) above the read-only `MetricsPanel` (`hideSuggest`) spec-sheet. Stays read-only (immutable `setActiveListener`). Reachable from the gallery + ListenerCard (the duplicate header Compare was removed in UX-2).
- **`components/tutorial/` (S21) — the guided tour.** Entry points: a "Tour" button in the global header (visible
  text, not a hover title) and "Take the tour" as the primary action on the first-run welcome. `steps.ts` is 7
  chapters of PURE DATA, each step `show` (the runner acts and narrates) or `try` (waits on a pure
  `done(ctx)` predicate); `machine.ts` is the reducer, which treats a persisted chapter/step as UNTRUSTED input
  (clamp, never index — a throw here takes the whole editor down with it); `progress.ts` is a STANDALONE
  localStorage key (`phantom-lock:tutorial`, never the persistence schema — the S16 rule) holding `seen`/`done`/
  `resume`; `actions.ts` holds the pure scene transforms; `spotlight.ts` is the pure placement geometry (jsdom
  reports every rect as 0×0, so this had to be pure to be provable at all). **THE SPINE is chapter `lock`, and its
  shape is forced by measurement, not taste** — see the lessons below. `CoachMark.tsx` is deliberately NON-MODAL
  and NOT in `overlayOpen`; `ChapterMenu.tsx` is a modal `Dialog` and IS. Chapters are independently launchable,
  which is what makes the button useful forever rather than once — and is exactly why any chapter that writes a
  scene must carry `needsPractice`.
- **`components/panels/SegmentSwitch.tsx` (S14/UX-2)** — generic N-up `radiogroup` (was the retired 4-step "fader" `WorkflowSteps.tsx`): a frosted accent thumb slides via one `transform`, amber armed-LED, roving-tabindex + arrow/Home/End keyboard lifted verbatim. Used TWICE: header DESIGN/TUNE (`variant="mode"`) + sidebar Build/Furnish (`variant="substep"`).
- **`components/panels/TuneToolsCard.tsx` (S14/UX-2)** — the TUNE-context home for the (de-duplicated) TV/Music writer (`.mode-toggle`) + Suggest placement, re-homed out of the global header (both were inert in DESIGN). MetricsPanel/OptimizeDialog now only MIRROR `settings.tvAnchor`.
- **`components/canvas/SelectionActions.tsx` (S14/UX-2)** — on-selection touch HUD (rotate/nudge/delete) shown ONLY on `(hover:none) and (pointer:coarse)`, pinned above the mobile bottom rail. Dispatches the SAME `runKeyCommand` commands as the keyboard (zero logic dup). `role="group"`; rotate disabled unless the selection is a rect; delete disabled for a listener; HIDDEN when `overlayOpen || mode==='wall'` (so its buttons can't fire a command the keyboard path blocks).
- `components/app/AppHeader.tsx` — **(S14/UX-2) rescoped to ONLY global chrome:** brand (dual-span wordmark → `PL` monogram ≤560px, `aria-label="Phantom Lock"`) + pinned layout switcher + `<SegmentSwitch variant="mode">` + undo/redo. TV/Music + Compare + Suggest MOVED into TUNE.
- **Doors & swing (S17):** a door is a `RectObj` with `role:'door'` + `doorOpen?` + the PLAN-ONLY swing fields
  `swingDeg?`(0–180, default 90)/`hingeEnd?`('start'|'end')/`swingSide?`('in'|'out') — clamped in `scene.ts`
  `sanitizeObject`, defaulted in `interaction.ts` `makeOpening`. **`components/canvas/door-swing.ts`** is the pure,
  node-tested hinge/side/angle math (`doorSwing(o)` → `{hingeWorld, latchWorld, alongAngle, leafAngle, arcStart,
  arcEnd, radiusM, swingDeg}`); `render.ts` draws jamb ticks + leaf (solid=open, dashed=closed) + the swing arc from
  it. The **`InspectorPanel` door branch** (before the generic rect branch) shows Width(0.6–2.4, "clear opening")
  + 70/80/90 cm presets + a Swing slider(`<output aria-live=off>`) + Hinge/Swing `aria-pressed` flip pairs(role=group,
  NOT radiogroup) + the doorOpen checkbox, and DROPS Depth/Rotation (keeps shared Height+Absorption). Creation: the
  DESIGN/Build **`opening` tool** (digit 5, click a wall — ⇧=window — placing on pointer-DOWN since a door's h:0.1 is
  below the draw-commit floor; ghost via the canvas `preview` path), the `d`/`w` keys on a selected wall, the hover
  chip (DESIGN+`!overlayOpen`-gated), and the Furnish palette (`addPreset`→`placement.ts` `openingNearPoint`, nearest
  wall). `f`/`⇧F` flip hinge/swing (`keyboard.ts` `flipDoor`, DESIGN-scoped, same-ref no-op on a non-door).
- `components/panels/Toolbar.tsx` — floating dock; per-mode tools (DESIGN/Build: wall · **door/window (S17)** · DESIGN/Furnish: rect/circle · TUNE: speaker) + Fit. **(S14) theme-toggle + undo/redo removed** (theme is the mode's; undo/redo moved to the header). At ≤960px the whole `.toolstrip` un-floats to a bottom, full-width, horizontally-scrollable rail (CSS-only, no JSX change).
- `components/app/Sidebar.tsx` — mode-driven column: DESIGN leads with the Build/Furnish `<SegmentSwitch>` (then Guide + UnderlayCard/FurniturePalette); **(S15/UX-3) TUNE leads with the pinned `<VerdictHero>`** (then `<TuneToolsCard>` + Guide + Speakers + Seats + Audio + Controls + Echogram). Inspector always. Threads `canCompare` (from App) to `ListenerCard`. `GuidePanel` re-keyed to `build`/`furnish`/`tune`. `.sidebar` gained `scroll-padding-top:150px` so a keyboard-focused card scrolls clear of the sticky hero (WCAG 2.4.11).
- `components/ui/` — Icon (no emoji anywhere! + `redo`/`rotate` added S14), Dialog (focus trap/restore), Toast (single-slot, hover-pause), Menu (full ARIA keyboard contract)
- `components/panels/` — sidebar cards; **(S15/UX-3) `MetricsPanel` is now a per-pair DETAIL view under the `VerdictHero`**: the four metrics (ITD / level / angle / lock) render as a **Geist-Mono `tabular-nums` spec sheet** (`SpecRow`/`.spec-sheet` — dotted-underline labels as the visible affordance, right-aligned value column, tone fills on the 3 status rows + `--signal` on the Lock row), keeping the `<details>` "Distances & detail". Its inline per-pair `.verdict` block now renders ONLY when `pairCount > 1` (multi-pair detail); a single pair shows the hero as the sole verdict, so no double-verdict. Imports the shared `causeSentence` from `verdict.ts` (one definition).

## Design system (do not regress)

**"Anechoic Console" (UX-1 / S13):** one unified dark room — BOTH canvas themes are dark. Elevation over borders
(`styles/tokens.css` surface-**0..4** ladder — `--surface-4` #28324a is a UX-3 hero/carriage rung, no consumer yet).
The app shell backdrop is a top-lit vignette **`--app-backdrop`** (`radial-gradient(120% 100% at 50% 0%, #0c1120, #060810)`,
on `body` + `.stage`; it never paints over the opaque canvas). Sentence-case titles; all-caps mono ONLY for tiny eyebrows
+ canvas pills; `--text/-2/-3` emphasis tiers (**text-3 reserved ≥12px** now); motion tokens `--dur-1/2/3`; destructive
actions get undo toasts never confirms; icons via `ui/Icon.tsx`.

**Typography (S13, self-hosted, zero runtime dep):** 3 roles — `--font-display` **Space Grotesk** (500/700: wordmark,
UX-3 verdict hero), `--font-ui` **Geist Sans** (400/500/600: body/UI), `--font-mono` **Geist Mono** (400/500: data,
pills, kbd, **and the canvas** `FONT`/`FONT_MD`). Latin-subset woff2 vendored in `public/fonts/` (7 faces + `LICENSE.md`,
both OFL; ~148 kB total, Geist Mono has no 600/bold → `FONT_MD` + former-`bold` canvas sites use weight **500**). `@font-face`
in `styles/fonts.css` (imported first in `global.css`), `font-display:swap`; **2 preloads** in `index.html` (Geist Sans 400
+ Space Grotesk 500, `crossorigin`). Canvas can't read CSS, so `canvas/font-ready.ts` `repaintOnFontLoad()` fires ONE
repaint via `setRedrawTick` once Geist Mono loads (FOUT/reflow guard; injectable fontset → node-testable, no-ops in vitest).
Type scale is **px** (`--text-xs 11` mono-only … `--text-2xl 30`, `--text-hero clamp(2rem,1.2rem+2.6vw,2.75rem)`); prose
floored ≥13px (`--text-sm`).

**Color-role discipline (S13):** cyan `--accent` / amber `--accent-r` (`#ffa95a`) = L/R channel identity ONLY; `--ok`
(`#3ee08a`, one green app-wide) / `--warn` / `--bad` = acoustic status ONLY; **`--signal`** (`linear-gradient(accent→ok)`)
is the "approaching lock" sweep on `.quality-fill` (the old `.fader-fill` consumer was deleted with the fader in UX-2).
Alpha tokens are `--ok-12/--warn-12/--bad-12` (0.12).

**Information architecture — DESIGN / TUNE (S14/UX-2, do not regress):** TWO modes, each OWNING one canvas theme (the mode
is the SINGLE theme controller — see `mode.ts` `modeTheme`). **DESIGN** = dark cyanotype `plan` canvas, keeps **Build** +
**Furnish** as sub-steps (sidebar `<SegmentSwitch variant="substep">`). **TUNE** = dark `sound` canvas, merges the old
Sound + Analyze into one place-and-read loop (verdict live while positioning). A tool NEVER changes the mode/theme; digit
shortcuts bind only to the current mode's tools (`digitTool(digit, mode)` — no cross-mode leak); the `t` key switches the
MODE (which flips the theme as a consequence), never the theme directly. The **global header** holds ONLY brand + pinned
switcher (`PL` monogram ≤560px) + DESIGN/TUNE switch + undo/redo; TV/Music + Suggest + Compare live in TUNE.
**Responsive (≤960px):** the toolbar un-floats to a bottom full-width horizontally-scrollable rail (40px targets) that
never covers the canvas; the mode-hint repositions to the top (and hides entirely on touch); on-selection touch handles
(`SelectionActions`) appear on coarse pointers for rotate/nudge/delete.

**The readout & THE LOCK (S15/UX-3, do not regress):** the verdict is the app's payoff and now LEADS the TUNE column as
`VerdictHero` on the opaque **`--surface-4`** hero rung at **`--text-hero`** (Space Grotesk 700), `position:sticky;top:0;
z-index:1` so it never scrolls away (bg MUST stay opaque + z-index, or later-DOM cards paint over it). **THE LOCK** is the
signature moment: on a genuine false→true `locked` transition the headline ignites — the **`--signal`** cyan→green gradient
swept through the letterforms (`background-clip:text`, `background-size:220%`, animated `background-position`) + a green
`text-shadow` bloom, via the `lock-sweep` keyframe applied ONLY on the `.is-igniting` class (NOT the resting `.verdict-hero--locked`
headline — else an already-locked layout animates on first paint). Event-driven, one-shot (no perpetual loop). Reduced-motion
swaps `lock-sweep` for the opacity-only `lock-fade` (no positional/transform movement). A `forced-colors` fallback restores a
solid `CanvasText` (transparent gradient-clipped text is invisible in Windows High Contrast). State colours are scoped to
`.verdict-hero--locked/--close/--searching` (own modifiers, no collision with the per-pair `.verdict-*`). Metrics are a
Geist-Mono `tabular-nums` **spec sheet** (`.spec-sheet`/`.spec-row`): dotted-underline labels (visible affordance; the
focusable `<Term>` popover is UX-4), right-aligned value column, ok/warn/bad **tone** fills on the 3 status rows and `--signal`
ONLY on the Lock row + the aggregate quality meter (color-role discipline: the plan's "`--signal` on the four rows" was NOT
taken — `--signal` can't encode ok/warn/bad status; documented deviation).

**Canvas themes** (`render.ts` `THEMES`): `sound` (dark `#080b12`, additive ray-glow — load-bearing, untouched) and
`plan` (**dark cyanotype** `#0a1220`, cyan grid, steel-blue `#8fc7e0` walls, dimension ink — recolored from the old cream
blueprint in S13; `rays:false`). The sound↔plan toggle is a **gentle hue shift, not a black↔white flash**. Canvas overlays
adapt via `--overlay-*` vars on `.stage` — ONE dark-glass recipe; `.stage-plan` inherits it (the light fork was deleted in
S13). Only ambient motion is the canvas rays (`capBreathe`/`nodePulse` header loops deleted).

**Learnability, empty states & shareable output (S16/UX-4, do not regress):** no load-bearing meaning lives only in a hover
`title=`. The **`<Term>`** primitive (`components/ui/Term.tsx`) is a dotted-underline jargon term that IS a real `<button>`
(`aria-expanded`/`aria-controls`/`aria-describedby`, Escape window-capture+stopProp + outside-pointerdown swallow like `Menu`,
`prefers-reduced-motion`, 2px accent focus ring) opening an accessible popover; its base reset is wrapped in **`:where(.term)`**
(0 specificity) so a composed label class (`class="term spec-label"`) always wins the font cascade — do NOT un-`:where` it or the
Geist-Mono spec sheet reverts to Geist-Sans. Definitions are the single pure `panels/glossary.ts` `GLOSSARY` (11 terms), read by
both `Term` and the TUNE `GlossaryCard` `<details>`. `MetricsPanel.SpecRow`/`Row` take an optional `term?: TermKey` → `<Term>` on
the label (itd/ild/angle-60/lock/path-mismatch/comb-notch). **On-canvas `Legend`** (`components/canvas/Legend.tsx` + `legend.css`,
mounted in `CanvasStage` `.stage`) is a collapsible disclosure keyed to `appMode` (TUNE: ray colours, ★ best spot, sweet-spot ring,
60° triangle, YOU-green-when-locked, other seats, dashed=blocked; DESIGN: walls/furniture/TV/area/seat), `--overlay-*` glass,
reduced-motion; it swallows its own keydown/keyup (`stopPropagation`) so a focused toggle can't arm canvas pan (Space) / rotate
(`r`). **Editorial empty states**: `TuneToolsCard` leads with a "Nothing to analyze yet — suggest a stereo pair…" lead (routes to
the single Suggest CTA) when `speakerCount===0`; the empty `MetricsPanel` copy is distinct (no echo). **Speakers** get a one-click
"Pair X + Y as stereo" when exactly two unpaired same-model speakers exist. **Optimizer**: the "Where" picker ALWAYS shows with a
"This room" default (`{kind:'listener'}` = `regionOf(listener)`, a walled region **without a hidden zone**) + area chips + Whole
house; the Apply button reads "Replace with N speakers" when it overwrites; every apply (optimizer + arrange + placed) now emits the
same **undo toast** deletes get. **Rename**: the RoomLabel marker is now "**Area**" (GuidePanel "Mark an area", MODE_HINT, the canvas
drag label, the room-name dialog), the walled shell stays "**Room**" ("Add a room…"); gallery "Import layout (JSON)…"/"Export layout
(JSON)" + "N areas" badge; UnderlayCard "Import floorplan photo" (+ a first-run starter "Start from a floorplan photo" entry via the
shared `panels/underlay-import.ts` `buildUnderlay`). **Shareable output** (`ShareCard`): "Export plan image" (`canvas/export-image.ts`
`renderPlanToBlob` — offscreen `renderScene` → PNG, sized to the scene aspect) + "Copy verdict" (`deriveVerdict` headline+cause+seat →
`navigator.clipboard?.writeText`, guarded). **First run** (`engine/seed.ts`): on a pristine origin the Maple Court demo is seeded with
a fixed ±30° equilateral **locked** homepod pair at the couch seat (a LIVE verdict on first paint), + a dismissible `FirstRunExplainer`
(reuses `Dialog`) gated on **genuine first run** (`bootstrapPersistence.firstRun` = no prior IDB data, AND `isPristineOrigin`) + a
standalone `phantom-lock:intro-dismissed` localStorage flag — NEVER the persistence schema. `apartmentScene()` stays audio-free.

## Accessibility (S7 / 2026-07-22 — do not regress)

**The canvas is a keyboard-operable, AT-legible widget.** `SimCanvas`'s `<canvas>` carries
`tabIndex={overlayOpen ? -1 : 0}` · `role="application"` · `aria-roledescription="Floorplan editor"` ·
`aria-label="Room plan"` · `aria-describedby="sim-canvas-help"` (an `.sr-only` `<p>` holding `canvas-help.ts`'s
`CANVAS_HELP` key map). `role="application"` is DELIBERATE over `img`: browse mode would swallow the
single-letter keys, making the whole model unreachable for exactly the users it exists for — which is also why
the key map must be published via `aria-describedby`.

**The canvas key map** (all in the pure `app/keyboard.ts` dispatcher — the canvas has ZERO React key handlers,
so nothing double-handles): `n`/`Shift+N` cycle · `p` place a pod (**TUNE only**) · `d`/`w` cut a door/window
into a **selected wall** (**DESIGN only**) · arrows nudge · `q`/`e` rotate · `Delete` remove · `Escape` deselect.
The new keys are **mode-scoped exactly like the digit shortcuts** (`mode.ts` `digitTool`) — a letter key must not
become the loophole that reintroduces the cross-mode leak S14 structurally removed.

**Pure modules (node-tested):**
- `canvas/selection-cycle.ts` — `cycleOrder`/`stepCycle`/`selectionForEntry`/`describePosition`. Deterministic
  traversal over EVERY seat, speaker and object (seats → speakers → objects in reading order, cm-rounded, `id`
  tie-broken) so the order can't shift under a user mid-cycle. This is what makes walls/furniture/inactive seats
  reachable at all — before S7 they were pointer-only.
- `canvas/placement.ts` — `SNAP_STEP`/`snapPoint`/`surfaceHeightAt`/`keyboardPlacementPoint`/`placeSpeakerAt`/
  `openingOnWall`. **(S23) plus the wall-seat magnet:** `normalizeAngle`/`wallSeatFor`/`moveObjectTo`/
  `openingMagnetFor` + `DRAG_SEAT`/`WALL_ALIGN_GAP_M` 0.35/`WALL_SEAT_GAP_M` 0.15 — see the S23 lessons.
  **(S32) plus the EXPLICIT command:** `COMMAND_SEAT`/`WALL_SEAT_REACH_M` 1.2/`seatObjectAgainstWall`/
  `canSeatAgainstWall`, and a REQUIRED `WallSeatOptions.contain`. `canSeatAgainstWall` IS the command
  (`seat(...) !== scene`), never a parallel predicate — a negative control proved the independent form
  passes 49 of 50 tests and disagrees on exactly the ALREADY-SEATED case, which is an enabled button
  that does nothing. `COMMAND_SEAT.seatGap === alignGap` is load-bearing: same `gap`, same operator,
  so `seated:false` is structurally unreachable and the command can never spin a piece in place
  without moving it. `surfaceHeightAt` MOVED out of SimCanvas (it only ever read `scene.objects`), and the POINTER
  path now calls the same `placeSpeakerAt`, so the furniture z-snap cannot drift between the two paths.
  `keyboardPlacementPoint` puts the first two pods at **±30°** in front of the seat (a real 60° triangle, so two
  `p` presses + "Pair as stereo" can actually LOCK), then walks the **golden angle** so no finite count collides.
- `app/announce.ts` — `speakableUnits`/`sceneSentence`/`verdictSentence`/`countsChanged`/`announcementFor` +
  the `initSettle`/`stepSettle` reducer (injected clock → no fake timers anywhere in the suite).
- `styles/contrast.ts` — WCAG maths with real alpha compositing + `fadeElement` (element `opacity` fades the
  glyph AND its own fill over the parent; modelling only the glyph overstates every disabled state).

**The spoken mirror.** `VerdictHero` stays NOT a live region. `LiveAnnouncer` mounts **TWO** `.sr-only`
`role="status"` `aria-live="polite"` `aria-atomic` regions as the last child of the app root, because the two
change kinds need opposite cadences: **selection** is discrete (immediate) and **the readout** is continuous
(settled, `SETTLE_MS` 700). The scene inventory clause is spoken ONLY when a count changes — a deliberate
arrow-nudge is SLOWER than the settle window, so without that every keypress re-reads ~45 words. Reuses
`deriveVerdict`, so spoken and visible readouts cannot drift (`verdict.ts` stays byte-unchanged; the
speech-only unit expansion lives in `announce.ts`). Suppressed on `overlayOpen`, and the suppressed path
deliberately does NOT advance the baseline (else deleting the active layout from inside the gallery would
close to total silence).

**Contrast is enforced by a test, not a comment** (`styles/__tests__/contrast.test.ts`, 112 assertions over the
real `tokens.css` + `render.ts` `THEMES`, read from DISK). `--text-3` × `--surface-4` = **4.08 (FAILS)** and is
guarded: the only `--surface-4` consumer is `.verdict-hero`, which uses `--text-2` (5.92). The design system's
own "`--text-3` is ≥12px only" rule is a second executable guard, frozen at its **10** pre-existing 11px sites.

**S7 contrast fixes:** `--border-input` (0.75 alpha) — form-field boundaries were 1.19:1 and a field's border is
the only thing distinguishing it from its panel (fills differ by 1.08:1); the alpha must clear 3:1 on BOTH edges
because a translucent border paints over the element's own background. Sound `gridLabel` 0.7→0.82 (3.75→4.76;
those are real 11px ruler NUMBERS). `<Term>`/`.spec-label` underline `--border-strong`→`--text-3` (1.65→6.04 —
the entire UX-4 "there is an explanation here" affordance was invisible). The three disabled states became
**tier-drops rather than opacity fades** (2.08/3.48/1.60 → ≥4.5), using `--text-2` for `.btn:disabled` because
`.where-chips .btn` renders at 11px and `--text-3` is reserved for ≥12px.

**Automated a11y**: `vite.config.ts` `test.projects` = `node` (byte-identical to the pre-S7 config) + `dom`
(jsdom, `src/test/a11y-env.ts`). `src/test/axe.ts` scopes subtree runs to the WCAG tags and runs the full set
page-wide. **`color-contrast` is DISABLED in jsdom and this is a real limit, not a shortcut** — jsdom does not
resolve `var()`, so `getComputedStyle().color` returns the literal string `"var(--text-3)"`; that is exactly why
the token test exists. jsdom also cannot prove: the ≤960px layout (it ignores `@media` entirely), visible focus
rings, `prefers-reduced-motion`, `forced-colors`, `target-size` (disabled by default AND meaningless at 0×0
rects), or canvas pixels. Those are proven in real headless Chrome over CDP.

## Security (S8 / 2026-07-22 — do not regress) — full posture in `docs/security.md`

**CSP.** Declared ONCE in `src/security-headers.ts` (build/test-only, never bundled) and delivered two ways:
a build-time `<meta http-equiv>` injected by the `cspMeta()` plugin in `vite.config.ts` (`apply:'build'` +
`transformIndexHtml` + `injectTo:'head-prepend'`), and real HTTP headers in `public/_headers` (→ `dist/_headers`,
where Netlify/Cloudflare look) + `vercel.json`. `preview.headers` is a **verification harness only** — it ships
nothing. `default-src 'none'` with **no nonce and no hash** (the build emits one module script, zero inline
script/style, no modulepreload polyfill). `frame-ancestors` is **header-only** (ignored in meta per CSP3 §3.3,
and Chrome logs an ERROR if it sees it there). `src/__tests__/security-headers.test.ts` fails if the three copies
drift, or if any source file reaches for `setAttribute('style')`/`insertRule`/`innerHTML`/`eval`/`new Function`.
**Forward note:** `worker-src 'none'` + `connect-src 'none'` are correct today but will block the planned S6 Web
Worker and the approved Three.js 3D view — intended loosened values are in `FUTURE_LOOSENING`.

**The input boundary — LOAD never mangles, IMPORT rejects.** This split is the whole design. The load path
(`sanitizeScene`/`loadStore`) clamps no coordinate and truncates no array, because an adversarial pass measured
that clamping silently flattens a legitimate 42-room layout (75 walls onto one line) which autosave then
overwrites — worse than the DoS it prevents. Untrusted files are refused by `importRejection` **before anything
is committed** (span 400 m, coord 100 km, 5 000 objects, 200 speakers, 500 areas, 256-char ids), asserted by a
test to ACCEPT the bundled demo, a max-size UI room, and a 20-room "Add a room…" layout.

**Worst-case CPU — BOUNDED as of S18 (grid sweeps) and S19 (the reflection search).**
S18's `engine/grid.ts` took an import-legal payload at 64 speakers / span 360 m / 100
objects from **264.6 s to 4.9 s** per simulation pass and made cost flat in span, but it
explicitly could NOT fix everyday slowness: a legitimate 50-room chain's grids are never
capped at all, so it still cost 13.7 s per edit. S19's `engine/reflection.ts` closed that
by making the work cheaper rather than capping it — **50-room chain 13.7 s → ~0.5 s (24–27×),
100-room 102.8 s → ~2 s, object bomb 4.9 s → ~0.13 s, wall-heavy span 399 129.7 s → 12–14 s**
— all bit-identical against a golden captured from the pre-S19 engine.

**Do not upgrade the claim further without measuring.** One residual is left, with numbers
in `docs/security.md` §"Worst-case CPU": the wall-heavy import-legal payload sits at **12–14 s**,
of which `computeAudio` is 8.5–9.8 s — `bestPairSpot` sweeping ~154 000 cells once per apex-blocked
pair, 32 times, and returning `null` for every one. The S19 cell-skip has no analogue there
because its gate is *reachability*, not geometry. Follow-up: `docs/ideas.md` §2d. Separately
`arrange.ts` `openSlots` (6.85 s at span 399, ~370 ms per existing object, extrapolating to
30+ minutes at the ceiling) is now the single worst unbounded path left — `docs/ideas.md` §2c.

## Hard-won lessons

- **A prototype's validity check must exercise the path the prototype CHANGED — mine did not, and it
  nearly cost the session (S39):** the throwaway per-room prototype was checked with "does it order
  the same total?", measured by calling the ONE-ARG `inventoryFor` in both trees. That function is
  byte-identical in both by construction, so the check proved nothing about the two-arg form I had
  just written. The two-arg form built its per-room list by RECURSING — `inventoryFor([cell])` per
  cell — which re-triggers the studio-sleeps rule, whose guard is `cells.length === 1` and which a
  lone "Living room" cell satisfies. **300 of 480 designs were ordered a spurious extra bed, 3.2 m²
  of it, in the room the listener sits in**, and the resulting 7 → 29 no-speaker regression looked
  exactly like an intrinsic cost of the feature. I had already swept a mitigation against it for
  three runs before checking. Point the validity probe at the NEW function, and prefer restructuring
  the real loop over recursing into a function whose guards assume a different input shape.
- **A soft weight can be ARITHMETICALLY INCAPABLE of the job, and the tell is in the regex, not the
  magnitude (S39):** the obvious cheap fix for "both beds land in one bedroom" is a bigger
  `zoneAffinity` reward. `ZONE_AFFINITY.bed` is `/bed|sleep|master|guest/i`, which matches "Bedroom"
  and "Guest bedroom" IDENTICALLY — so both candidate slots receive the same +1.6 and the term
  cancels out of the argmax at ANY size. Measured at rewards 3.0 and 6.0 and at a −3.0 mismatch
  penalty: designs putting both beds in one bedroom stayed at exactly **34/60** in all three, with
  ZERO designs converting. Before sweeping a constant, check whether the term it scales can even
  distinguish the two candidates you are trying to separate.
- **The instrument's DENOMINATOR moves when the thing under test moves (S39):** `design-score.ts`
  computes `density = footprint / regionOf(scene).area`, `regionOf` sizes and origins its flood grid
  from `sceneBounds`, and `sceneBounds` includes every furniture rect — while `collectBlockers` never
  does. So relocating a piece re-phases the grid and changes the reported walkable area with **zero
  change in what anyone can stand on**. One candidate's headline +0.0041 TOTAL became **−0.0026**
  once its own footprint was scored against the baseline's denominator; on 199 designs the
  denominator moved while the footprint was byte-identical. `docs/sessions/S39/bench/density-counterfactual.mts`
  exists so this is one command. Any density or TOTAL number here is provisional until it is run.
- **"It is a denominator artefact" is a claim about ONE build, and it did not survive the build that
  shipped (S39):** measured on an intermediate variant, `orientation`'s fall was exactly that — that
  variant pinned the TV, which co-located 47 more (sofa, TV) pairs and so made them measurable at
  all, and 25 MORE pieces faced their anchor in absolute terms. The variant that SHIPPED does not pin
  the TV, so `orientable` is **unchanged at 1730** and `oriented` simply **fell by 11**: a real,
  one-directional regression in 8 designs, all on the living room's sofa↔TV axis, and disabling only
  the pin restores exactly the old 0.7696. I had already written the artefact reading into three
  files. Re-run every attribution against the final build, not the variant that motivated it. (Two
  probe bugs on the way, both of which inverted a conclusion: recovering `orientable` by inverting
  the published ratio divides by zero for a fully-oriented design, and a probe that hardcodes the
  live tree as its BASELINE reports zero delta when you point it at the live tree as the candidate.)
- **DECOMPOSE a cost before accepting or rejecting the trade that carries it (S39):** the per-room
  quota cost 2 designs their stereo pair, which the acceptance forbade, and the obvious readings were
  "crowding" and "the feature is unshippable". Both were wrong. Testing one variant that pinned every
  core piece EXCEPT the TV isolated the entire cost to that single preset (7 vs 9 no-speaker designs,
  and every TV landing in a byte-identical zone), which turned an unshippable design into a shippable
  one plus a defect filed with thirteen named reproducers. The seat-room clause that shipped is a
  PRINCIPLE — a pin may pull a piece out of the seat's room, never push one in — and it was adopted
  only after measuring that it gives numbers identical to the special case it replaces.
- **A negative control that PASSES is sometimes a flaw in the CONTROL (S39):** 15 were run and 15 are
  caught, but two escaped first time and neither was a hole in the tests. One replaced the
  unresolvable-room-id guard with a bogus far-away zone — which the soft fallback absorbs, making the
  two behaviourally identical (the real defect that guard prevents is a crash on `want.id`). The other
  made the studio-sleeps rule write to every per-cell map, which cannot differ, because that rule only
  fires when `cells.length === 1` and `perCell[0]` IS every cell. Three questions, not one: does the
  control apply, can it differ, and does the test written for it go red.
- **`find` returns one, and per-room items share a presetId (S39):** the queue's `items.find(i => i.presetId === id)`
  was correct only while every preset appeared once. With per-room orders it places ONE bed and leaves
  `skipped` EMPTY, because the second item is never queued at all — strictly worse than the bug being
  fixed and completely silent. Whenever a list gains a second key, grep every `find` over it.
- **An inverted guard is not equivalent to the guard it replaces, and NaN is where they part (S38):**
  `if (dist >= MIN) { create }` and `if (dist < MIN) return null` read as the same rule and are the
  same rule for every real number. On NaN both comparisons are FALSE, so the first creates nothing
  and the second falls through and commits a wall with NaN endpoints — which `sanitizeScene` keeps,
  and which poisons every downstream distance. I wrote the inverted form while moving the chain code;
  a review lens caught it. When "simplifying" a comparison during a MOTION, keep the original operator
  and the original branch direction, or you are not moving code, you are rewriting it.
- **A convenience re-export can close an import CYCLE, and the reason it existed was weak (S38):**
  moving `popChainSegment` into `chain.ts` and re-exporting it from `interaction.ts` — the pattern
  `render.ts` uses for `view.ts` and `scene.ts` for `ids.ts` — created
  `interaction → chain → placement → interaction`, because `chain.ts` needs `snapPoint` and
  `placement.ts` needs `makeOpening`. ESM hoisting means it built and passed, so nothing failed. The
  re-export existed ONLY so one test would not have to change its import line. Check the transitive
  imports before copying the re-export pattern; the two files it is safe for are both true leaves.
- **A PAUSED rAF looks exactly like a broken feature, and CDP will keep answering in 0.2 ms while it
  lies to you (S38 — this is the §18d root cause):** a freshly launched headless page reports
  `document.hasFocus() === false`, Chrome then throttles it, and `document.visibilityState` flips to
  `'hidden'` part way through a run. `SimCanvas.onPointerMove` throttles `applyMove` through rAF, so
  every hover affordance, the grab cursor, the whole §16 grip cursor and every drag frame silently
  stop updating — while `Runtime.evaluate` stays fast, so nothing looks wrong. S37's harness reported
  "no resize cursor anywhere around the selection" against a build whose grips were perfect, and did
  it in BOTH legs of every run it ever completed. One line fixes it —
  `Emulation.setFocusEmulationEnabled {enabled:true}` — and the whole run went **17 min → ~2 min**,
  the grip sweep **184 probes → 61 probes in 2.0 s**, and `gripFound` false → **true**. Record
  `visibilityState` on EVERY capture and fail the step when it is not `visible`; a harness that
  measures a throttled page is worse than no harness.
- **"0 % CPU means blocked" is a good heuristic and it was wrong here — probe the browser directly
  (S38):** the node process sat at 0.0 % for eight minutes and every explanation I reached for was a
  deadlock. Attaching a second WebSocket to the same Chrome and evaluating one expression took **2 ms**
  and returned `visibilityState: "hidden"` — which named the real cause in a single measurement.
  Before theorising about which `await` never settles, ask the other side of the connection whether
  it is alive. (A design lens, reasoning from the same log, concluded "~5 s per `mouseMoved`" and
  built a 17-minute arithmetic on it; re-measured, unfocused hovers cost 23.7 ms in one run and
  108.0 ms in another and focused ones ~8 ms. Mechanism right, number wrong by two orders.)
- **A filed symptom is a hypothesis, and this one was wrong about WHICH LEG (S38):** §18d said "the
  base leg completes in ~3.5 min and the head leg stalls", which points the next session at the head
  build or at leg-2 teardown. It reproduces on the FIRST leg of a base-vs-BASE control, so no property
  of the head build can be involved. Re-derive a filed symptom from a control before you act on it —
  the same lesson S35 learned about §17c blaming the wrong element.
- **Run the control, then run it SWAPPED (S38):** base-vs-base proved the four divergences were
  instrument artefacts (identical steps, identical fields, identical hashes on byte-identical
  directories). Swapping the legs proved something the control could not: with head as leg 1, three of
  the four vanished entirely. That is what separates "leg-order noise" from "a real difference the
  control happens to share", and it cost one extra minute. Three distinct boot hashes appeared across
  five runs of the SAME two directories, with the assignment to base/head varying — conclusive, and
  unarguable in a way that reading the diff never is.
- **A signal that is not SETTLED is worse than no signal, and the tell is that it flips direction
  (S38):** the `live` region diverged base-vs-head, and on the next run of the same pair it diverged
  the other way. `announce.ts` settles the readout over `SETTLE_MS` 700 while `capture()` slept 120 ms,
  so the scene-inventory clause was caught on some runs and not others. A divergence that changes sign
  between runs is a race by definition — do not read it as a behaviour difference, and do not leave it
  in the instrument. Raising the capture settle to 800 ms took the run to 0 divergences; it only became
  affordable because the grip sweep had stopped costing minutes.
- **A canonicaliser that walks OBJECT PROPERTIES will miss ids in an ARRAY (S38):** the differential's
  idb signature replaced every id-looking string sitting at a property, and `scene.pairs` is
  `[[speakerIdA, speakerIdB]]` — a bare array element. So the one signal that exists to prove the
  persisted store diffed on nothing but random `createId` output, in every run the harness has ever
  done. Canonicalise at the SCALAR, not at the property.
- **Check that each negative control fails the test written FOR it — 29 controls, three holes, and all
  three fixtures were arithmetically incapable of their own bug (S38):** (a) the close-radius test used
  a point 0.1 m out, and 0.1 snaps to ITSELF on a 0.05 grid, so "the close test reads the RAW point"
  could not fail; 0.24 straddles (raw closes, snapped does not). (b) The multi-selection test grabbed a
  rect with no puck on it, so the whole multi block could be moved below the NODE hits and still pass —
  the forcing case is grabbing a member that IS a speaker. (c) The ⌘-click short-circuit test used a
  SPEAKER over a rect, where the first branch fires whatever `oh` holds; the forcing case is the
  LISTENER over a rect, where `nh` is a listener and the `else if` then toggles furniture the user
  never aimed at. **Fourth session running for this exact lesson.** The general form is now well
  established: ask what your fixture's parameters make IMPOSSIBLE, and prefer a fixture that STRADDLES
  a boundary over one that sits comfortably inside it.
- **Splitting decision from effect makes the ORDER testable, which is the point — the lines are a
  bonus (S38):** `applyPickAction(act, effects)` did not have to leave the component. It did because
  the `activateSeat` → `selection` → `startDrag` order is load-bearing for undo GRANULARITY and its
  cost is invisible in the final scene: start the drag first and the seat switch merges into the move,
  so one ⌘Z undoes both. Twelve hand-written sequences cannot be asserted; one interpreter plus spies
  can. Any time an ordering matters and the final state does not show it, that is the shape to reach for.
- **The spec's own line arithmetic was optimistic, and measuring early is what saved the session
  (S38):** §18a said its two named cuts were "enough" for the 800 cap; they land at **810**. Five were
  needed. A design lens had predicted exactly this and told me to measure early — which is why the
  extra three were chosen for cohesion (pure-function lifts into the module that already owns their
  helpers) rather than grabbed in a panic at the gate. Landing at 789 leaves only 11 lines of margin,
  and that is recorded as a warning rather than dressed up as success.
- **`git show main:<file>` is the cheapest verification tool in the box (S38):** every claim about
  "what the code used to do" in this session was checked against the real pre-change file rather than
  against memory, and it caught my own first-vertex id-group divergence before any test could — the
  old code returned early for the first chain point and pushed NO group, while my rewrite pushed an
  empty one. `popChainSegment` pairs `groups[i]` with the segment ENDING at `points[i+1]`, so a
  leading entry puts the two lists out of step.

- **The differential harness caught MY harness bug, twice, before it ever judged the code (S37):**
  base-vs-base on a byte-identical tree is the control every behaviour differential needs, and it
  came back with THREE divergences and TWO symmetric failures. All five were the instrument.
  (a) The canvas hash differed at steps 0–1 and agreed from step 2 on — the signature of
  `repaintOnFontLoad`'s one FOUT repaint landing before one capture and after the other; fixed by
  awaiting `document.fonts.ready`. (b) `getAll` returns IDB records in KEY order and the keys are
  `createId` values, so the six seeded layouts came back in two different orders and scrambled both
  the diff and every `k<n>` id ordinal; fixed by sorting first. (c) The grip probe found nothing
  because the object it selected was a WALL — the sweep accepted any live-region text containing
  `m`, and only rects and circles carry grips. Note the shape of the failure: a symmetric failure
  DIFFS EQUAL, so a harness with no absolute checks would have reported a clean run.
- **NEVER run the gates while a CDP harness is driving (S37):** the harness paces itself with fixed
  sleeps, so an `npm test` / `npm run build` / `test:coverage` running alongside it starves the
  browser and the sleeps race. Measured: three steps that a byte-identical tree had just passed
  started failing mid-run — the marquee tool "did not arm", the multi-delete "changed nothing" —
  which reads exactly like a regression in the code under test. Two of this session's four
  differential runs were contaminated that way and had to be thrown out. If you want to work in
  parallel with a live run, write DOCUMENTATION, not code.
- **A harness that redirects stdout buffers it, so "no output" is not "no failures" (S37):** with
  `> differential.txt` Node buffers, and a run that had already recorded three failures showed only
  its opening banner for minutes. Do not infer progress from a quiet log — check the process, the
  profile directories it has created, or make the harness flush.
- **`button` names the button that CHANGED, so `mouseReleased` must not say `'none'` (S37):** fixing
  the hover probe by keying `button` on `buttons === 0` also caught every mouseRELEASE, turning each
  scripted click into a press with no matching release. Four steps that a byte-identical tree had
  just passed started failing. When a harness change makes previously-passing steps fail, the
  harness is wrong — that is what a base-vs-base control is FOR.
- **A green `npm test` proves nothing about types, and it bit twice in one session (S37):** vitest
  strips types with esbuild, so 47 new tests passed while `tsc --noEmit` was red on `target:
  'selection'` (the real union member is `'deselect'`) and `'homepodmini'` (it is `'homepod-mini'`).
  The first even passed for a *reason*: the escape dispatcher's last rung is an `else`, so any
  unrecognised target lands there. Run the build, not just the suite. (TRAP 12, again.)
- **`noUnusedLocals` + `verbatimModuleSyntax` make `tsc` the real gate for code motion (S37):** every
  extraction left dead imports behind, and the build named each one. That is worth knowing before
  starting: the compiler will find what you forgot to take and what you forgot to leave, so the
  expensive review effort belongs on the things it CANNOT see — when a value is read, effect order,
  and render count.
- **Moving a `useRef` into a hook's return makes eslint stop believing it is stable (S37):**
  `discardDetectionRef.current = detection.discard` in an effect with deps `[detection.discard]` was
  clean for four sessions; the moment the ref came from a hook rather than a local, exhaustive-deps
  demanded it by name. Listing it is a literal no-op (a useRef object is identity-fixed for the
  component's life) and it keeps the project's suppression count at 6. Prefer satisfying the rule
  honestly over adding a suppression — the count is a ratchet worth having.
- **A mechanical qualifier will hit a destructuring KEY, and a line-range splice will overrun a
  one-line effect (S37):** rewriting `scene` to `ctx.scene` across a moved body turned
  `const { scene: next } = placeSpeakerAt(...)` into a syntax error — caught instantly by tsc. Worse
  was silent: a splice that searched forward for `}, []);` ran straight past
  `useEffect(() => repaintOnFontLoad(bump), []);` — a ONE-LINER ending in `, []);` — and swallowed
  the next two blocks. Both restored verbatim and asserted present exactly once. Mechanical edits
  are the right tool for 1200 lines of motion, and every one of them needs a structural check
  afterwards, not a glance.
- **Alpha-rename a callback parameter that now shadows the hook's own args (S37):** four pair filters
  read `([a, b]) => a !== id && b !== id`, which became a shadow of `a: Args` the moment they moved
  into a hook. All four were self-contained, so behaviour was already identical — but leaving a
  shadow of the args object is a trap for the next edit, and renaming to `[x, y]` is provably safe.
  The reverse discipline applies to `deleteRoom`, where my first cut dropped the pre-delete lookup
  and cost the toast the area's NAME: when moving a body, the parts that look like noise (a lookup
  whose only consumer is a toast string) are exactly the parts that get dropped.
- **Check that each negative control fails the test written FOR it — twenty controls, two holes
  (S37):** both misses were fixtures arithmetically incapable of expressing their own bug.
  (a) The move-multi test put every origin ON the 0.05 snap grid, where snapping the DELTA and
  snapping each PIECE give identical answers (measured: both move by exactly 0.35 at x = 4 / 0 / 2);
  off-grid they diverge to 0.37 / 0.39 / 0.38. (b) The handle-idempotence test used an EDGE grip,
  which is idempotent either way because `'e'` pins the west edge and the already-resized object's
  west edge has not moved — only a ROTATE compounds. Third session running for this exact lesson;
  the general form is *ask what your fixture's parameters make impossible*.
- **Ship the half you can prove and NAME the half you cannot (S37, the S32 lesson applied to
  scope):** SimCanvas landed at 1042 against the 800 cap, not under it. The remaining cut —
  `pick.ts`, the twelve-branch pointerdown ladder — is the most-used interaction path in the app and
  turning it pure is a redesign rather than a move, so it deserves its own session and its own
  differential rather than the tail end of a long one. Filed as `docs/ideas.md` §18a with the line
  ranges and the acceptance, so the next attempt starts from the analysis rather than repeating it.

- **A new affordance can eat the gesture it sits on top of, and only a MEASUREMENT over the
  real corpus shows it (S36):** the grips shipped with a flat 11 px hit tolerance and no
  relation to the object's on-screen size. Self-review measured the shipped demo at its own
  default fit view (66.23 px/m) and found the fraction of an object's footprint that starts a
  RESIZE instead of a MOVE at **Bookshelf 66.5 %, Window 54.6 %, Plant 54.1 %, Cabinet 41 %** —
  and 100 % once zoomed out past an ordinary threshold. "Select it, look at it, drag it to
  nudge" is the app's most-used gesture and it was silently resizing. Two gates fix it — hide
  the grips below `MIN_GRIP_SPAN_PX` (46 px on the shorter side, the way real editors make you
  zoom in) and reserve an `INTERIOR_CORE_PX` (12 px) core that is always a move — taking the
  worst case to **16.6 %**. The general rule: when you add a pointer target on top of an
  existing one, measure what FRACTION of the old target you just took.
- **A size gate must be asked about the axes that actually carry grips (S36):** the first cut
  gated on `min(w, h)`, which is right for furniture and catastrophic for a DOOR — a door's `h`
  is the leaf thickness, 0.1 m, about 6 px at any ordinary zoom — so every door lost its grips
  at every scale and the one resize a door is FOR silently disappeared. A door has grips on `w`
  only, so `w` is the question. Caught by the door test the moment the gate landed.
- **Write only the fields the gesture OWNS, and the composition problem disappears (S36):**
  `q`/`e` need nothing but an object selection, which a grip drag guarantees, so a rotate can
  land mid-resize — measured, the next pointermove reverted it exactly (`Object.is(end.rotation,
  obj0.rotation) === true`). `move-rc` solves this with `lastRotRef` provenance tracking. The
  cheaper answer for a new branch is not to spread the baseline at all: merge `{w,h,center}` (or
  `{rotation}`) onto the LIVE object and the two gestures compose with no tracking whatsoever.
  ⚠️ And note the shape that makes it work — the gesture's result is used even when it EQUALS
  the baseline, with the early-out decided against LIVE. Short-circuiting on `result === obj0`
  looks equivalent and strands the object at its mid-drag size the moment the pointer comes
  home. That bug was written, caught by a test, fixed — and then reintroduced by the field-merge
  refactor and caught by the same test again.
- **Refusing an affordance the app will revoke is better than matching a predicate (S36):** the
  first cut gave a WINDOW the full grip set, on the reasoning that `canRotateSel` refuses only
  doors and a second predicate is how the two drift. Measured, that was wrong twice over: a
  window is built at `w 1.2 / h 0.12`, so **63 % of its footprint** started a resize and a
  mis-aim changed the PANE THICKNESS — and `openingMagnetFor` overwrites a window's rotation on
  the very next drag, so the rotate grip shipped a turn the app destroys (the §4d lesson). Both
  openings now get along-wall grips only. Consistency with an existing predicate is a good
  default and not a trump card; the pre-existing `q`/`e` inconsistency is filed as §16b rather
  than propagated.
- **An invalid value can be INVISIBLE to the code that draws it and FATAL to the code that
  selects it (S36):** the mirror-vs-clamp question for a resize grip looked like taste until it
  was measured. `rectCorners` builds from `hw = r.w / 2` with no sign guard, so `w = -4` emits the
  IDENTICAL four corners in reversed winding — it renders normally and `collectSurfaces` still
  blocks rays. But `pointInRect` compares `Math.abs(local.x)` against the **signed** half-extent,
  so it is false everywhere: measured over a 41x41 sweep of the footprint, **1587 of 1681 points
  hit at `w = +4` and 0 of 1681 at `w = -4`.** The object becomes unselectable and undeletable
  while still absorbing sound, recoverable only by `n`/`Shift+N`, and then `sanitizeObject`'s
  `Math.max(0.05, o.w)` collapses it to a 5 cm sliver on the next save→load. When two consumers
  disagree about whether a value is legal, find the one that silently accepts it.
- **A no-op check CANNOT be exact equality across a cos/sin round trip, and the failure is
  invisible on the axis-aligned fixture you would naturally write (S36):** `if (nw === o.w)` looks
  obviously right. Projecting the pointer into the object's local frame and back is not bit-exact
  — dropping a grip on its own exact world position returns `h = 1.9999999999999998` for `h = 2`
  on a -12.83 deg rect. So the check never fires for precisely the rotated objects the feature
  exists to serve, and a stationary pointer allocates a new object every frame. Caught by a test,
  not by inspection, and pinned by sweeping every angle rather than one. Same family as S23's
  `atan2(sin, cos)` finding.
- **"Nothing changed since the baseline" and "nothing to write" are different questions (S36):**
  `applyHandleDrag` compared its computed object against the gesture BASELINE and returned the
  scene untouched when they matched. That is exactly the moment the pointer has come HOME — while
  the scene is still holding some mid-drag value — so the object stayed stranded at 14.00 x 0.10 m
  instead of returning to 4 x 2. Compare against the LIVE object: the check keeps its real job (no
  write when the scene already holds this) and gains the restore.
- **A drag gesture must transform from a pointerdown SNAPSHOT, never from the live object (S36):**
  re-reading the object each frame makes every frame compound on the last, so a SLOW drag grows a
  piece more than a quick one and no pointer position has one well-defined result. I wrote that
  bug, caught it on re-read, and the test that pins it replays 30 identical frames and demands
  idempotence. Every existing branch already did this (`c0`/`rot0`/`a0`/`b0`); the new kind just
  carries the whole object.
- **Check that each negative control fails the test written FOR it — one of mine could not
  express its own bug (S36):** the "prefers the NEAREST grip" test used a 0.4 m rect at 60 px/m,
  giving a 12 px half-extent against an 11 px hit disc. The grips therefore never overlapped, and
  a first-match `handleAt` — the exact defect the test names — passed. 0.2 m gives 6 px and it
  fails. Two more of the sixteen controls exposed the same class (an aspect-lock test that only
  checked the ratio, which the wrong implementation also preserves). TRAP 23, self-inflicted.
- **Distinguish "my test is weak" from "the code is redundant" (S36, the S32 lesson again):** the
  clamp/snap ORDERING control was a literal no-op on all 93 tests. Not a hole — `MIN_SPAN_M`,
  `MIN_RADIUS_M`, `DOOR_MIN_W_M` and `DOOR_MAX_W_M` are all exact multiples of `SNAP_STEP`, so the
  two orders provably commute. The right response is to pin the PROPERTY that makes them commute
  (an off-grid bound turns it red), not to invent an assertion about ordering that cannot fail.
- **Pick a feature's limits from the CONTROL the user already has, not from the sanitizer (S36):**
  `sanitizeObject` floors `w`/`h`/`r` at 0.05, and `InspectorPanel` offers `min={0.1}`. Clamping a
  grip at the sanitizer's floor would let a drag reach a value the number field refuses to show —
  two controls over one quantity disagreeing. Using the Inspector's 0.1 also happens to make the
  result a fixed point of both the 0.05 grid and a save→load round trip, which the lower number
  would not.
- **A live-region that speaks a DIMENSION cannot stay un-settled once dimensions become
  draggable (S36):** `selection-cycle.ts` `labelOf` renders `"Sofa, 4.00 by 2.00 m"`, and the
  selection region is immediate by design because selecting is discrete. A resize grip turns that
  into ~60 distinct strings a second into an `aria-atomic` `role="status"`. Muting it for the
  duration of any drag loses nothing — the selection was announced at pointerdown and the final
  geometry is announced at pointerup — and it also closes a rarer pre-existing version, since
  `describePosition` appends a position-sorted ordinal that a plain MOVE could already churn.
  No correctness lens found this; the a11y lens did.
- **A harness that reads persisted state must wait for the DEBOUNCE, and the tell is that
  everything fails identically (S36):** three live checks reported "changed nothing" — including
  the pre-existing body MOVE, which is what gave it away. Instrumenting the canvas showed the
  gesture arriving perfectly (pointerdown, six pointermoves, pointerup, correct offsets); the
  harness was simply reading IndexedDB 140 ms after a ~400 ms autosave debounce. When a new
  feature and an old one fail the same way, suspect the instrument. (Also: `undo` calls
  `setSelection(null)`, so anything grip-related after a ⌘Z must re-select first — otherwise a
  working feature reports "0.0 deg swept".)
- **Which object a pointer can REACH is a fact about the screen, so measure it (S36):** the live
  harness first chose "the biggest rect in the scene" and went looking for it. The biggest rect is
  overlapped by others, so `hitTestObjects` hands every click to whatever is on top and the sweep
  never selected it — the harness aborted on its own guard rather than passing vacuously (TRAP 22
  working). Sweep first, see which rects are actually selectable, then pick from those and match
  back to the persisted scene by geometry. Also: a click-probe sweep at an 18 px pitch over a
  1176x810 canvas is 2925 probes at three CDP round trips each; 55 px plus a local refine is the
  same answer in a twentieth of the time.
- **DESIGN/Build re-arms the WALL tool, so a canvas harness that does not arm Select is DRAWING
  (S36):** `applyMode` re-arms `wall` on a fresh DESIGN/Build canvas. The first live run's probe
  clicks were adding wall chains, not selecting. Arm the Select tool explicitly and assert
  `aria-pressed === 'true'` before any probe — and note `handleTargetFor` requires
  `mode === 'select'` anyway, so the grips do not exist in any other tool.
- **A hit test is a MEASUREMENT, and the sample pitch decides which criterion you can even
  evaluate (S35):** the §17b filing used a 21-point sweep across `.room-trigger` and reported
  "0.143 reachable at 390 px". That number cannot settle the question it was being asked: the pitch
  at 390 px is 8.7 px, SC 2.5.8's threshold is 24 px — 2.75 pitches — so the exposed strip was
  bracketed at 17.5–26.2 px, straddling the line. Re-measured as the widest CONTIGUOUS unoccluded
  run at 1 px resolution (which is what "target" means — occluded area is not part of one), the
  answers become verdicts: **0 px at 320** (entirely hidden, and it is the FIRST Tab stop, so SC
  2.4.11 as well) and **22 px at 390** (fails 2.5.8 by 2 px). Report the quantity the criterion is
  defined on, not a fraction of however many points you happened to sample.
- **Reachability is NOT monotonic in viewport width, and the cliffs are made by the very rules
  meant to relieve the pressure (S35):** 561 px measured **27 px** exposed against 430 px's 46 px,
  because the wordmark returns at 561 and costs 96.6 px; 721 px has the same shape from the Tour
  label. A sweep over round phone widths — 320/390/560/768/1024 — samples 560 and 720 and misses
  both. Any responsive guard here must sample **breakpoint+1**. The fix followed from the same
  observation: the monogram rule moved 560 → 720 because `app.css` already said that rule exists
  "so the layout switcher beside it is never squeezed out", which is precisely the failure.
- **The obvious lever can be worth exactly ZERO, and only measurement says so (S35):** the blockers
  were literally the `.segment-label` spans, so hiding them is the first thing anyone reaches for.
  It frees **0 px** — `.segment-switch--mode` is `width: min(300px, 40vw)`, not content-sized, so
  its box never depended on its labels. And `width: auto` ALONE is a *regression* at 390 (its
  max-content, 160.4 px, exceeds the 156 px box it replaces). The two only work as a pair. Measure
  each lever's px before ranking them; the causal-looking one was decorative.
- **A perfect score on the stated metric can be a conformance FAILURE (S35):** `min-width: 0` alone
  takes the hit test to 1.000 — on a 20 × 30 unlabelled stub. 20 < 24, so it fails SC 2.5.8 in its
  own right, and it deletes "which layout am I in?" from the screen. Whenever the acceptance is a
  ratio, ask what a degenerate maximiser looks like and write the second criterion (here: a target
  size AND a surviving label) before you start optimising.
- **A shared class name is a blast radius, and I found the second consumer only because two review
  lenses looked (S35):** the fix clipped `.brand` at ≤480 to buy header space, reasoning entirely
  about the header. `.brand` has a SECOND consumer — the async-bootstrap splash, whose *entire*
  content is that wordmark — so every phone-width cold start would have shown a blank screen until
  boot finished. The diff's own doctrine three declarations later scoped `.segment-label` for
  exactly this reason and I did not apply it to the neighbouring rule. `grep` for every consumer of
  a class before you put it in a media query, and note that jsdom can never catch this: it ignores
  `@media` entirely.
- **A horizontal sweep is structurally blind to a height, and the comment will still claim it
  (S35):** clipping `.room-trigger-name` takes it out of flex flow, so the only in-flow child left
  is a 14 px icon and the button collapses to 6 + 14 + 6 = **26 px** tall — while the comment beside
  it claimed the 40 px house standard and `min-width: 40px` made the *width* true. The 1 px sweep
  runs along the element's vertical centre, so it reported 40 and could never report 26. When a rule
  restores one dimension, ask what happened to the other.
- **Check that a negative control fails the test written FOR it — and then go looking for the
  controls you did not think of (S35, the S33 lesson twice over):** eight controls all landed on
  their own test, which felt like proof. Self-review then found **six more that PASSED**: an
  unscoped `.segment-label` in a *different* media block (the scope check read only one block), a
  selector LIST whose sibling compound blanks the sidebar, `min-width: auto` satisfying
  `/width:\s*auto/` (a longer property ends with the shorter one), `.topbar-left` satisfying
  `/\.topbar\b/` (`\b` matches before a hyphen, and that selector can never match anything), the
  40 px segment padding pinned by nothing, and the missing `min-height`. Regex guards over CSS need
  the same adversarial pass as the code.
- **Re-diagnose a filed defect before fixing it; §17c was wrong about the offender AND the condition
  (S35):** it blamed the toolbar rail's `.strip-btn` children at "right edges 467, 557". Measured,
  every one of those is inside `.toolstrip`'s own `overflow-x: auto` and contributes **nothing** to
  `documentElement.scrollWidth` — with the gallery CLOSED the document does not overflow at all.
  The real cause was `.gallery-head`, whose 329 px of non-wrapping actions put its right edge at a
  fixed 430 px at every viewport, putting the **Close button entirely off-screen** at 320 and 390.
  That is SC 1.4.10 Reflow on the gallery's only pointer exit (Escape is the other, and a touch user
  has no Escape) — not the cosmetic P3 it was filed as. The tell was one extra column in the probe:
  for each overflowing element, does an ancestor clip it?
- **A probe that mutates before it measures reports a number from a state that never shipped
  (S35):** the first reflow probe read the one-row header as 83 px; it is 57 px. It cleared inline
  styles as its first action and never reloaded between sizes, so its "before" carried state. Four
  fresh loads settled it. The probe now reloads per size AND asserts the baseline equals the
  independently-confirmed 57 px, so a future drift fails loudly instead of quietly re-deciding the
  design. Same family as TRAP 22: a harness that silently measures the wrong thing is worse than no
  harness.
- **Tell a read-only agent the tree is live, and it may still write to it (S35):** a self-review
  lens ran its negative controls by patching `app.css` in the REAL worktree and restoring it —
  I caught `@media (width <= 360px)` in a file-modified notice mid-edit. Nothing was lost (`git
  diff` proved app.css byte-identical to HEAD), but the race was real and the instruction not to
  write was explicit. The S24 lesson stands and needs enforcing, not repeating: point measurement
  agents at a COPIED tree, or give them no write tool at all.

- **A feature can be present, tested, live-verified and still UNREACHABLE from the screen the app
  opens on (S34):** "Generate a design" had two entry points and both were gated on `{folder && …}`.
  Every gallery test rendered `seededDefaultStore()`, which ships two folders, so the corpus could
  not express the failing case at all — and the failing case is the DEFAULT one, since `defaultStore()`
  has exactly one project and no tiles. The owner found it in a sentence; 36 a11y tests and four
  sessions of gallery work did not. When a control is conditional, enumerate the CONTAINERS a user can
  be looking at (home grid · inside a folder · empty home · empty folder) and check each, rather than
  checking that the control renders.
- **"Too dim" is the wrong diagnosis when the GLYPH is fine and the BODY is not (S34):** the card's
  `⋯` measured **9.09–9.30:1** for its glyph and **1.01–1.10:1** for its own fill against the
  backdrop. So the affordance failed 1.4.11 as a *boundary*, not as text — and the intuitive fix is
  actively backwards: every backdrop here is near-black, so darkening the fill moves 0.6 alpha to 0.85
  alpha and buys **0.02**. Only a stroke can create a boundary on near-black. Measure the component's
  parts separately before choosing which one to change (the S33 "check whether the arguments are real
  before tuning the threshold" lesson, in CSS).
- **Composite against the surface the element is really ON, which is often not its parent (S34):** the
  first cut of the kebab contrast test used `--surface-1`/`--surface-2`. Wrong: `.gallery-kebab` is
  `top:14px` and `.gallery-thumb` is a 130px canvas starting 8px down, so the 28×28 chip sits ENTIRELY
  over the mini-plan CANVAS (`#0d1320`, read from `thumb.ts`) on a card and over `.folder-mosaic`
  (`--surface-0`) on a tile — surfaces it never touches. The conclusion happened to survive (5.93 vs
  6.04) which is exactly why it would have gone unnoticed. Caught by an adversarial lens, not by the
  suite. Corollary that killed a second finding: because that canvas is OPAQUE, `.gallery-card:hover`
  swapping to `--surface-2` is invisible under the chip, so the "you omitted the hover surfaces"
  objection is refuted by the same fact.
- **A contrast test that reads only TOKENS is documentation, not a guard (S34):** the whole S34
  contrast block passed with `border: none` restored — the ratios are properties of the palette, not
  of the rule that uses them. Three self-review lenses found this independently and all three were
  right. One assertion that reads `gallery.css` from disk and pins `var(--text-3)` in the
  `.gallery-kebab-btn` rule turns the block load-bearing; verified by reverting the border (reds) and
  by swapping it to `--border-strong` (reds). Whenever a test measures a CONSTANT to justify a CSS
  choice, add the line that proves the CSS made that choice.
- **A bottom tray with no shrinkable minimum takes its growth out of the CONTENT (S34):**
  `.gallery-new` is content-sized while `.gallery-surface` is `flex: 1 1 0; min-height: 0`, so one
  extra 72px tray row came entirely out of the grid — at 844×390 the grid collapsed **137 → 65px** and
  showed **61 of a 196px card**. Invisible at 1440×900 (224px on both trees) and invisible at 390×640,
  because the defect keys on HEIGHT, not width; a responsive check that only narrows the viewport
  cannot find it. jsdom ignores `@media` entirely, so the guard has to live in the CDP harness, and it
  asserts against the PRE-change baseline number rather than against zero.
  **And `min-height` was only half the fix.** At 320x200 — a 1280px display at 400 % zoom, SC 1.4.10's
  reflow target — the two longest labels WRAP under the stacked column layout, so those buttons render
  62px and the 44px floor never binds: tray 193px against a pre-S34 190px, with two buttons entirely
  below the fold where before none were. A ROW layout (what `.gallery-new-lead` already did, and why it
  was the one button unaffected) gives the text the full button width and takes the tray to 174px. The
  residual is structural — five buttons need three rows where four needed two — so the tray is bounded
  to `50vh` and scrolls ITSELF; without that its overflow escapes an `inset: 0` overlay and the only
  recovery is scrolling the document behind it. The guarantee to assert is REACHABILITY (5 of 5 after
  scrolling the tray), not "nothing is below the fold", because the pre-S34 screen was already clipped
  by 78px there.
- **Measure a suspected regression on a BASELINE TREE before attributing it (S34):** two of the things
  the 390px sweep turned up — the layout switcher being 85.7 % covered by the DESIGN/TUNE labels, and
  430px of horizontal overflow — looked like consequences of the diff. `rsync` to /tmp, `git show
  HEAD:<file>` the four touched files back, serve it on a second port, and both reproduced
  byte-identically (0.142857 and 430 with the same six offenders). That turned two panics into two
  filed P1/P3 defects (`docs/ideas.md` §17b/§17c) and kept the commit message honest. The harness now
  asserts the overflow has not MOVED rather than asserting it is absent — a pre-existing defect should
  be pinned, not ignored and not faked into a pass.
- **Six negative controls, and check each fails the test written FOR it (S34):** border→none,
  border→`--border-strong`, home button deleted, home button re-pointed at a folder, in-folder button
  re-pointed at home, and the Delete `MenuItem` deleted. All six caught, each by its own test — which
  also refutes a review claim that four of the six new tests were decoration: they are decoration
  against "delete the feature" and load-bearing against the plausible *regressions* (NC5 and NC6 fail
  exactly those two). "Does reverting the whole change red it?" and "does any realistic wrong version
  red it?" are different questions, and the second is the one that matters.
- **A workflow phase can outlive its usefulness — read `journal.jsonl` and keep working (S34):** the
  design pass took 20 minutes and landed AFTER the fix was implemented and verified, so its value was
  retrospective. It was still worth reading: it produced the wrong-backdrop correction independently.
  But two of its agents also reported the main thread's own in-progress edits as "a sibling agent
  wrote into the REAL tree", which is the TRAP-14 smell in reverse — an agent reading a tree you are
  actively editing will describe your work as contamination. Say in the prompt that the tree is live.

- **A CONSTANT dressed as a variable defeats every test written around it (S33):** `openSlots`
  emitted every open-floor slot with `facing: {x:0, y:-1}` and `rotation: 0`. Downstream,
  `scoreSlot`'s armchair rule reads `dot(toTv, slot.facing)` — which LOOKS like "does this chair
  face the TV?" and actually computes "is the TV north of here?". The tell was available without
  reading a line of the rule: the facing and the rotation disagreed with each other (rotation 0 puts
  a rect's front at `(0,+1)`), and every open-placed piece in 480 designs shipped at rotation 0.
  Measured, skips were **0/258** with the TV north of the room centre and **125/162** with it south
  — 125 of the corpus's 126. `docs/ideas.md` had it filed for a session as "the cone is too tight",
  which is what you conclude if you read the rule and not its inputs. When a predicate misbehaves,
  check whether its arguments are real before tuning its threshold.
- **Fixing one defect can pay for it with a worse one, and only the instrument sees the bill (S33):**
  removing the armchair's bogus reject placed 125 more armchairs and took designs shipping with NO
  speakers from **46 to 92 of 480** — the chair had taken the floor `pair.ts` searches for a stereo
  triangle. The skip rate looked like a triumph in isolation. This is the whole argument for scoring
  a VECTOR and not a scalar, and for building it before the first change rather than after.
- **Calibrate a target on the artefact you have, not on a number you like (S33):** every constant in
  the quality instrument is read off `apartmentScene()`, the hand-authored demo modelling the home
  the owner actually lives in — 28.9 % floor coverage, 1.75 pieces per 10 m², and its two real
  furniture overlaps are hand-drawing slop at 1.6 % and 0.2 % of the smaller piece, which is what
  sets `OVERLAP_FRACTION`. That turns "is 26 % the right coverage?" from taste into a claim someone
  can argue with in one place. It also caught something no synthetic fixture would: the demo TOUCHES
  four pairs exactly, so a zero-tolerance overlap test flags all four on float noise alone.
- **A negative control that PASSES is a hole in the TEST, not a clean bill (S33, again):** eight
  wrong answers were run past the new suite and all eight were caught — but one was caught only by a
  corpus-wide floor, not by the test written for it. The dedicated "furnishes the far side of a
  partition" test passed with the fix reverted, because a two-room fixture does not force the issue:
  the far room has exterior walls of its own, and measured, nothing lands against that partition at
  all. The forcing fixture is an L-shape whose wall-midpoint centroid falls in the NOTCH, outside
  the floor — then the centroid-facing side of one wall is not walkable and the far face is the only
  option. Check that each control fails the test you wrote it for, not merely some test.
- **The score can go DOWN while the design gets better, and that is the moment to trust your eyes
  (S33):** driving the real UI turned up a kept design reading "Bright office — **Bed**, Desk,
  Cabinet, Cabinet, Bookshelf". `cells.length === 1` is true of `office` and `cinema` as well as
  `studio`, so the studio-sleeps rule furnished every generated home office with a double bed. No
  corpus score could see it: the bed placed successfully and counted 3.2 m² toward coverage.
  Removing it dropped office density 0.444 → 0.029 and the corpus total 0.8651 → 0.8509. A metric is
  a proxy; when it and a screenshot disagree, the screenshot is the customer.
- **Ask what a metric's DENOMINATOR contains before believing the ratio (S33):** the instrument's
  `orientation` originally scored an armchair against ANY TV in the scene, so a bedroom chair was
  measured on whether it pointed through a wall at a screen in another room — and the generator had
  exactly that bug, so an instrument sharing the blindness would have rewarded the wrong fix. Both
  were scoped to the same ZONE. An instrument that shares a blind spot with the code under test is
  worse than no instrument, because it produces a number.
- **The lens no negative control covered is where the bug was (S33):** eight controls were run past
  the new suite and all eight were caught, which felt like proof. The one real defect the diff
  introduced was found afterwards, BY HAND, in the lens none of them touched: `ctx.walkable` is null
  whenever `regionOf` returns 2 m² or less, `fits` then skips its containment check too, and the new
  two-faced `wallSlots` therefore had nothing to reject a wall's outward face with — measured on a
  1.2 x 1.2 room, pre-S33 placed 0 of 2 pieces outside the building and S33 as first written placed
  1 of 2. Every control perturbed the LOGIC; none perturbed the ENVIRONMENT the logic runs in. When
  you add a branch guarded by `if (x && ...)`, construct the input where `x` is absent.
- **`arrange.ts` has TWO callers and the second one is a shipped user feature (S33):** every change
  in the placement brain also lands in the "Arrange furniture for me" dialog, on the user's own
  scene, with no `MAX_ENVELOPE_M` cap. S33's `SEAT_CLEARANCE` cost the bundled demo two of its three
  plants and the dialog announced "No spot survives the rules for a plant" three times. Cost was
  fine (50-room chain 24.1 → 25.8 ms) and the MESSAGING was not. Fixed by giving `suggestInventory`
  the same programme/fill taxonomy — but the general point is to run the OTHER caller before
  claiming a placement change is contained.
- **A flaky test in the gate is a defect even when it is not yours (S33):** a full-suite run went red
  on `projects-migration.test.ts`, which searches the whole exported JSON for the substring `p1"`.
  `createId` appends five random base-36 characters, so a scene id ends in `p1` about 1 in 1296
  times and the bundle holds ~25 ids. Measured on `main`: **1 failure in 40 runs**. Confirm
  pre-existing before diagnosing your own diff (a worktree at the base commit and a loop settles it
  in a minute), then fix it rather than re-running — a 2 % flake trains you to ignore a red gate.

- **REACH AND CAPTURE ARE THE SAME NUMBER (S32):** the explicit seat command wants to reach further
  than the ambient drag magnet — that is the whole point of an explicit command — but the band that
  decides "how far will I reach for a wall" is the same band that decides "how far away can a wall
  grab me". At `WALL_SEAT_REACH_M` 1.2 the C3 short-wall hazard S23 closed at 0.35 reopens 3.4x
  wider: measured on a 0.70 m closet stub with a 2.0x0.9 sofa, the one-sided capture area grows
  **1.20 -> 3.28 m²** and the worst jump **1.083 -> 1.540 m**, so a sofa sitting **1.65 m CLEAR** of
  the stub is teleported 1.365 m. And it is strictly worse than the drag version: the drag user
  steers frame by frame and sees it happening, a one-shot key gives them nothing. The fix is to
  decouple the two by demanding full along-wall CONTAINMENT for the command band — measured a
  literal no-op for every wall >= 2.4 m, so it bites the stubs and nothing else. Whenever you widen
  a band, ask what ELSE that number controls.
- **An on-grid corpus cannot see an off-grid bug, and I wrote the blind sweep myself first (S32):**
  `wallSeatFor` quantised the along coordinate and THEN clamped, so when the clamp fired the output
  was `margin` — generally not a grid multiple — and re-application re-quantised it. My first sweep
  reported **0 slides in 1737 seated results** and was worthless: every wall length and piece width
  I picked put `margin = min(halfAlong, len/2)` exactly on the 0.05 grid, so rounding could not move
  it. Re-run with off-grid `L` and `w`: **14.3 % slide, worst 1.5 cm**. It converges after one step,
  so it is a settle rather than a drift — but it defeats the "seating a seated piece changes
  nothing" contract the whole command rests on. When a sweep finds nothing, check whether the
  parameters you chose can even express the failure. (The S19/S22 lesson, self-inflicted.)
- **A negative control that PASSES is information, and it has two very different meanings (S32):**
  six wrong answers were run past the new suite; four failed as intended and two passed. One was a
  real hole — an independent `canSeatAgainstWall` predicate disagrees with the command on exactly
  one input, an ALREADY-SEATED piece, which no position sweep lands on, so a test was added. The
  other was NOT a hole: `RectObj['role']` is exactly `furniture | tv | window | door`, so the
  command's `role` guard is provably equivalent to `wallSeatFor`'s own door/window refusal and
  nothing can observe the difference. That one is annotated in the code as redundant-by-construction
  rather than dressed up as tested. Distinguish "my test is weak" from "the code is redundant".
- **Ship the half you can prove and SPEC the half you cannot — before it lands, not after (S32):**
  ⇧F was designed, and then measured against shipped `main`: the quarter-turned class is not
  representable in the drag magnet's output space (`wallSeatFor` under `DRAG_SEAT` emits only
  `thw + k*pi`, and `moveObjectTo` writes `seat.rotation` whenever ANY candidate exists, seated or
  not), so **4 of 5 realistic pieces lose the turn on the very next drag** — the desk losing it at
  `seated=false`, i.e. without the piece even moving. Deferred to `docs/ideas.md` §4d with every
  number, including the correct REFERENCE-ANGLE form and the measured reason a TV must be refused
  the turn (`tvViewQuality` x0.25 across the whole room). This is S31's revert lesson applied one
  step earlier, which is much cheaper.
- **A clear-state line placed inside a guard that cannot match is dead code presented as a safety
  net (S32):** the obvious third site to clear the snap guide is `cancelDraw`'s `dragRef.current =
  null`, which sits INSIDE `if (kind === 'draw' || kind === 'band')`. A `move-rc` drag is neither,
  so a clear there executes only when no halo can exist. The statements that really do run on every
  mode change are the ones BELOW the closing brace. Found by an adversarial pass reading the
  surrounding lines rather than the line itself.

- **"The plan has an axis" is an ASSUMPTION, and on the one real building it is false (S31):**
  creation-time alignment was built, tested (14 tests, 6 negative controls all caught), live-verified
  end to end (the palette drop and the rubber band both persisted -12.829° through IndexedDB, the
  canvas pill read ∠-13°) — and then **reverted**, because a self-review lens asked the one question
  the tests could not: is the axis STABLE? It is not. Maple Court has two wall populations (12.358 m
  folded to 77.75°, 7.840 m to 0.25°), and `dominantAngle` is winner-take-all, so **one ordinary 4.6 m
  wall drawn square flips the answer from -12.829° to exactly 0.000°** — verified independently.
  Four of the owner's six layouts are that plan. A margin gate does not rescue it: the real margin is
  1.58x, so a 1.5x gate still flips on a small edit and a 2x gate turns the feature off on the only
  plan it was built for. Two further regressions were measured in the same pass — with Snap ON a
  2.00 x 1.00 drag reads **1.728 x 1.419**, because the endpoints snap to the WORLD grid while the
  extents are projections onto a rotated one; and `arrange.ts` `openSlots` still emits `rotation: 0`,
  so "Decide for me" would place a table at 0° beside a palette sofa at -12.83°. Three lessons:
  a feature can be correct, tested and live-verified and still be unshippable; the question tests do
  not ask is usually "is this input STABLE?"; and when the premise fails on real data, revert and
  write the spec — `docs/ideas.md` §4c now carries every number so the next attempt starts from them.
- **A NEGATIVE RESULT is a deliverable, and the way to ship one is a proof plus tests that go
  RED when it stops being true (S31):** `docs/ideas.md` §13e sat as a P1 for three sessions on the
  reading that the refusal gates were too loose. They are not — the information is not in the image.
  The honest output was not a threshold but `__tests__/indistinguishable.test.ts`, seven tests that
  each say what to CONCLUDE if they fail, plus a rewritten §13e naming the seam where the missing
  information actually lives (metric scale, `Underlay.scale`, which `detectWalls` structurally
  cannot see because it takes raw pixels). The build emitted byte-identical asset hashes, which is
  the cleanest possible evidence that a refutation changed no behaviour.
- **Every "ratio to the whole" statistic is BLIND to a single-component input (S31):** each candidate
  was `(property of the largest component) / (the same property of all segments)`, so on a
  one-component reading numerator = denominator and it reads exactly 1.000 whatever the image
  depicts. Pushing four furniture outlines together until their edges touch reaches that for free.
  It is the same blind spot as `structure`, one level up — `structure` fails because a closed box
  satisfies a local endpoint test perfectly. Before measuring a family of candidates, ask what the
  whole family is structurally unable to see; here that question was worth more than the 18
  formulations that were measured.
- **The corpus can be blind to a whole dimension AND the dimension can be free to an attacker
  (S31):** the one formulation escaping the theorem normalises by the PAGE, and it dies to FRAMING —
  padding a legitimate fixture with plain paper takes `clean-rect` 0.819 → 0.511, while cropping the
  attack tight lifts it 0.445 → 0.572. All 26 corpus fixtures are drawn to fill their page, so the
  corpus could not express this at all. Framing is involuntary for a user and free for an attacker,
  which is what makes it disqualifying rather than merely inconvenient. (S26's "blind by
  construction" lesson, in a new dimension.)
- **BUILD the naive fix in a throwaway tree and sweep it — the wrong answer is the fastest proof
  (S31):** arguing that a cohesion floor is unsafe is weak; `rsync`ing to /tmp, adding the gate,
  and sweeping 0.35 / 0.45 / 0.55 is decisive. It breaks 4 / 8 / 11 tests in `detect.test.ts`,
  refusing `apartment-rotated` and `oblique-survey` outright — and even 0.35, far below the 0.522
  needed to reach the tight cluster, already refuses a plan photographed at phone resolution. That
  run also proved the new tests are load-bearing (3 of 7 go red) rather than decorative.
- **An agent's headline number is a HYPOTHESIS until you re-measure it yourself (S31):** the
  owner-plan lens reported that the owner's own floorplan, merely photographed smaller, collapses to
  span 0.347 — below the attack band. It does not reproduce: the same file over the same sweep gives
  0.8346 at k=0.55 and a minimum of 0.7172. A different agent disputed it, and the disagreement was
  only settleable by measuring. **I had already published the wrong figure in a commit message and
  in two files**, so the correction had to be made in place rather than quietly dropped. The
  companion claim from a different lens (bistability) DID reproduce, and re-measuring it through the
  app's real two-step chain produced a sharper statement than the original: `apartment-rotated`
  moves 0.9882 → 0.5554 at IDENTICAL 900x669 pixel dimensions, so the flip is resampling PHASE, not
  resolution. Verify borrowed numbers before they reach a comment; comments here are load-bearing.
- **A live harness with a wrong selector reports PASS against pre-existing data (S31):** the first
  §2c run printed `preset button found: null`, added nothing, and then happily asserted the rotation
  of a rect the DEMO had shipped with — two vacuous PASSes. The fix is structural, not a better
  selector: gate every downstream assertion on "did the thing I was testing actually happen?", and
  make the guard itself a FAILING check when it did not. Same class as S30's jsdom pointer traps.
- **Reuse the function, then pin the property you depend on (S31):** `planAxis` reuses
  `vision/regularize.ts` `dominantAngle` — the very function that straightens a photographed plan —
  so "the axis the detector found" and "the axis new objects arrive on" cannot drift apart. The
  hazard is the mirror image: a future session tuning it for DETECTION would silently move
  PLACEMENT. `__tests__/plan-axis.test.ts` pins the placement-side properties, so that change goes
  red rather than shipping. Reuse without a pinned property is coupling; with one it is a contract.
- **Make a no-op STRUCTURAL, then test it anyway (S31, from the REVERTED §2c work — keep the
  technique, it is why the revert was clean):** `planAxis` returns `=== 0` exactly on a
  Manhattan plan and `bandRect` at axis 0 is bit-identical to the arithmetic it replaced, because
  `cos 0` is exactly 1 and `sin 0` exactly 0 — so "a square plan is untouched" is a property of the
  code rather than a coincidence. The same discipline as `grid.ts` `cappedStep` returning `baseStep`
  through `Math.max`. It is still tested over 2 000 randomised drags, because a structural argument
  that nobody re-derives is a comment.
- **An index space that the ENGINE collapses will waste a keypress in the UI, and an
  argument-asserting test freezes it (S30):** a drop index counts the container as the user SEES it,
  which during a same-container move still shows the item being moved — so `moveLayoutToProject`'s
  without-self conversion maps display `self` and `self + 1` onto the SAME outcome. The pointer path
  never notices, because a pointer lands wherever it lands. The keyboard path stepped ±1 through
  that space, so measured on a three-design grid a subject at display 0 had `at=0` and `at=1` both
  no-ops — the live region said "Position 2" and nothing moved — and the cap of `others.length` put
  the LAST position out of reach entirely. This was in the path S29 designated as the WCAG 2.5.7
  mechanism. The existing test asserted `toHaveBeenCalledWith(id, home, 1)` and never the outcome,
  so it PINNED the bug. Step through distinct OUTCOMES and convert once at the edge; assert by
  feeding the recorded argument through the real engine.
- **Fixing the index space silently broke the only thing a blind user hears (S30):** the fix
  deliberately inflates the display index by one for every position at or after the subject, and
  `describeIntent` was formatting that raw number — so the live region said "Position 2" for the
  slot the item was already in, and "Position 6" in a five-item grid. The caret is `aria-hidden`, so
  that sentence is the ENTIRE feedback channel. Two lessons: when you change what a number MEANS,
  grep every consumer of it; and a11y review is not a formality — no correctness lens found this,
  because the landing position was right.
- **A mode that claims "or click a destination" must make every click a destination (S30):** move
  mode's own doc comment said it, and only the breadcrumb implemented it. So an item's idle action
  still ran mid-move: clicking a folder tile drilled INTO it with the move armed, after which the
  breadcrumb committed an `exit` for a design that had never been in that folder — a no-op write
  announced as "Moved X out. Y was empty and is gone." Clicking a design opened it and closed the
  gallery, abandoning the move without a word. Fixing it also gave `merge`/`absorb`/`slot` their
  first single-pointer-without-dragging path, which is what SC 2.5.7 actually asks for.
- **`touch-action` is latched at touchstart, but `preventDefault` is not (S30):** `pan-y` keeps the
  grid scrollable and cannot be switched to `none` once a long press has armed, so a mainly-VERTICAL
  touch drag was measured as `pointerdown → pointermove → pointercancel` — the scroller taking the
  gesture. A non-passive `touchmove` handler is evaluated PER EVENT, and an armed long press sits
  exactly in the window before a pan has begun, so it can still refuse it. Gate it on
  `press.current?.armed` and an ordinary swipe never reaches it. **Verify BOTH directions, and check
  the regression probe is not vacuous** — the "does a swipe still scroll?" check passed at 1440×900
  because nothing overflowed there; at 390×700 it is 650 px of overflow and scrollTop 0 → 387.
- **jsdom dispatches a plain `Event` for pointer events, so the whole pointer path is unreachable
  (S30):** `button`, `pointerId`, `pointerType` and `clientX` all arrive `undefined`, so
  `onItemPointerDown` bails at `e.button !== 0` and a press is NEVER registered — verified by
  observing that Escape still closes the gallery after a `fireEvent.pointerDown`, which it would not
  if `pressed` were true. Two tests written against that state were therefore VACUOUS and were
  deleted rather than kept. This is why `useGalleryDrag.ts` sits at 58.9 % while `drag.ts` is at
  98.4 %, and why the armed-touch and un-armed-press checks live in the CDP harness instead.
- **A negative control is only as good as the CONTAINER it measures (S30):** the test named "reaches
  the LAST position — the old cap left it unreachable" was decorative. It asserted over the three
  DESIGNS while `stepMove` caps on the MIXED home sequence (designs PLUS folder tiles), and the
  fixture's two tiles supplied enough slack that a cap short by one, two or even three still passed.
  Count the container the CODE counts. Related, from the same sweep: every move-mode test moved
  `items[0]`, where `self === 0` makes the step index and the committed index coincide — so a
  seed-at-zero bug was invisible to all of them, and was caught only by an incidental hardcoded
  argument assertion in an unrelated test.

- **A feature can persist HALF of one coordinate space and look completely fine (S29):**
  `saveMeta` rebuilds the whole meta row every autosave cycle, so `Project.order` was
  written; layouts are diff-gated on `updatedAt`, and the load path derives their ranks
  with `touch:false` (correctly — reading must not rewrite timestamps), so `Layout.order`
  was never written at all. On every pre-S29 store the two halves then disagree on disk:
  tiles have real ranks, designs have none, `Infinity` sorts last, and on the SECOND boot
  every folder jumps to the front of the grid **with the user having done nothing**. It is
  permanent once it happens. Neither the suite nor the live run could see it — the tests
  saved with `for (const l of store.layouts) await saveLayout(l)`, which is write-everything
  and not what the app does, and the live run used a FRESH profile, which takes the one
  migration path that writes every record. When you add a persisted field, ask which
  writer covers it and whether that writer is the same one that covers its neighbours.
- **A drag must either perform the action it proposes or not propose it (S29):** the same
  bug shipped twice in one session, once in the pointer path (`absorb` was offered for a
  FOLDER subject, and no commit branch handles absorbing a project) and once in the
  keyboard path after the pointer one was fixed. Both announced *"Drop to move X into Y"*
  and then did nothing. Whenever two input methods produce the same commits, their
  proposal functions have to be the same function or mirror each other line for line —
  fixing one and not the other leaves the CANONICAL path broken, which here was the
  WCAG 2.5.7 one.
- **WCAG 2.2 SC 2.5.7 is NOT satisfied by a keyboard alternative (S29):** the Understanding
  doc is explicit that the alternative must work *"by a single pointer without dragging"*,
  so a keyboard path alone satisfies SC 2.1.1 and nothing else. That makes MOVE MODE the
  canonical mechanism (entered from a menu item, driven by clicks or keys) and the drag an
  accelerator on top. And it has to actually WORK from that entry point: closing the kebab
  returns focus to the kebab BUTTON, where the arrow keys were not handled, so the
  compliant path entered a mode the user could not drive.
- **A drop shadow can be an affordance that does not exist (S29):** measured against the
  composited `.gallery-layer` pixel, PURE BLACK tops out at **1.042:1** and `--shadow-3` at
  1.013:1 — so "lift" cannot be a shadow on this surface, however plausible the CSS looks
  and however faithfully `getComputedStyle` echoes it back. Elevation is a luminance step
  plus a lit rim instead. The S7 canvas-focus-ring trap in a new costume.
- **`overflow-y: auto` clips the OTHER axis too, and `getBoundingClientRect` cannot see it
  (S29):** used `overflow-x` computes to `auto`, so `.gallery-grid` clips both ways and an
  absolutely-positioned drag ghost is invisible outside it while the API reports it
  perfectly placed. `position: fixed` escapes — but `.gallery-layer` carries
  `backdrop-filter`, which makes IT the containing block for fixed descendants, so the
  ghost's coordinates are layer-relative and raw `clientX/clientY` offsets it by however
  far down the page the layer starts.
- **In a gap between rows, horizontal position must not decide anything (S29):** the
  reading-order slot rule scanned x whenever the pointer was not inside an item, which is
  right on a row and wrong everywhere else — in a SINGLE-COLUMN grid every gap is "not on a
  row", and x then answered "before the card above" for a pointer clearly below it. Worse,
  the first version kept every item above the pointer from EVERY row, so a drop in the
  space beneath the grid landed near the front. Vertical position is the whole answer off-row.
- **`at - 0.5` is only an insertion point while ranks are dense, and three ordinary paths
  leave gaps (S29):** `useLayoutActions` deletes a layout without re-ranking, and a new
  design carries `Infinity` until something normalises it. So a drag to "slot 2" was a
  silent no-op on a container with a hole, and "append" landed FIRST in a folder of new
  designs. Midpoint insertion against the container's real sequence is total; index
  arithmetic against an assumed one is not.


- **A fix that REPLACES a rule inherits the mirror of whatever the rule was wrong about (S28):**
  S27 swapped Otsu's plain histogram for a gradient-weighted one because a plain histogram counts
  AREA and a large flat mass therefore votes in proportion to how much of the page it covers. True,
  and it fixed the owner's plan. But gradient weighting scales a tone's vote by roughly
  **1/thickness**, so the same rule that demotes a flat mass also demotes THICK LIGHT WALLS and
  amplifies THIN DARK LINES — and a plotted sheet with screened poché under hairline annotation is an
  ordinary drafting convention, not a contrivance. Measured, that plan went from a 50-73 % read to
  REFUSED on 5 of 5 seeds, told the user their image had no clear straight lines, and passed every
  test in the suite. The general shape: when a fix is "use B instead of A", ask what A was RIGHT
  about, because you have just thrown it away. Keeping both as candidates costs one `if` and cannot
  have a polarity at all.
- **"0 leaks over N readings" is a claim about your N constructions, not about your rule (S28):** a
  design agent reported 0 leaks over 684 null readings for exactly the rule that shipped. The rule's
  acceptance set is `accept(gradient) ∪ accept(plain)`, which is a UNION — so it can only ever ADD
  acceptances, and "no leaks" was refutable by construction. Re-pointing a *different* agent's
  polarity-repainted nulls at the same engine found two immediately (23 walls at structure 0.261).
  Two agents in the same run reported leaks and one did not, and the one that did not had simply not
  built the leaking constructions. When a safety claim is a negative, look for the structural bound
  first: here it says the honest question is not "does it leak" but "which of these leaks are NEW".
- **Measure against what SHIPPED, not against your own branch (S28):** the census first read "+19
  null acceptances" against the S27 branch, which was the tree in front of it — and the S27 branch
  never landed. `main` is the plain-histogram engine, so the CHALLENGER is `main`'s own rule and every
  null the challenger accepts, users already have today. Re-framed against `main`: **new null
  acceptances attributable to the fix, 0.** The two numbers describe the same code; only one of them
  describes the product. Check what `git show main:<file>` actually contains before choosing a
  baseline — it took one grep to settle.
- **When two populations OVERLAP, no threshold separates them, and a floor calibrated on constructed
  attacks is a data-loss bug (S28):** a challenger-only structure floor of 0.45 was proposed on a
  claimed 1.49× margin, measured against one agent's own constructions. Against an *enumerated*
  protected set of 391 legitimate rescues the structures run down to **0.214** while the attack family
  reaches **0.346** — inverted, not tight. It would have refused 87 real reads (worst: an 88 %-correct
  plan), left this session's own new fixture 0.014 above a refusal cliff, and still not closed the
  worst attack (0.667, above every legitimate rescue). The tell was available before any sweep: a
  DIFFERENT agent had measured the new fixture at 0.464 and the two never saw each other. Cross-check
  agents' constants against each other's numbers — that is the main thread's job, not theirs.
- **Two fixtures that each falsify the opposite simplification are worth more than either alone
  (S28):** `scan-letterbox` needs the cut that admits LESS ink, from the edge histogram;
  `screened-poche` needs the one that admits MORE, from the plain histogram. Together they kill
  "always weight by gradient", "always use the plain histogram", "prefer the smaller ink class" and
  "prefer the larger" in one move, and they are the reason the choice has to be made downstream on
  whether the reading is a floorplan. A fixture that only holds a floor it always clears is
  decoration; a fixture that makes a whole CLASS of rules unshippable is a proof.
- **A new corpus fixture should be load-bearing on the assertions that already exist, not just its
  own (S28):** `screened-poche` scores 0.000 on the S27 engine against its own 0.78 floor — and it
  also drags the 23-fixture mean to 0.9132 against the pre-existing `MEAN_FLOOR` of 0.92. Two
  independent red tests from one fixture, neither of which had to be written. Worth checking for
  deliberately: it is what stops a later "simplification" from passing because only the new,
  most-suspicious-looking assertion was consulted.
- **Dimensional analysis is a real bug-finding tool (S28):** `MIN_EDGE_FRACTION` compared a count of
  boundary pixels — a LENGTH, growing as k — against a fraction of page AREA, growing as k². So the
  starvation guard became more likely to fire the LARGER the image, which is backwards, and at 4× it
  starved 9 of the 22 legitimate fixtures. The corrected statistic is flat by construction (1.721 /
  1.721 / 1.721 at 1×/2×/4× on the same drawing). Note also what did NOT follow: the guard was still
  load-bearing, because a page STRADDLING 127 gives zero votes and `otsuThreshold`'s 127 initialiser
  then yields a plausible WRONG mask rather than an empty one — measured 100.0 % vs 56.5 %. "This
  guard has the wrong shape" and "this guard is unnecessary" are different claims.

- **A histogram counts AREA, and area is the wrong vote for "where does ink end?" (S27):** Otsu is a
  function of the intensity histogram alone, so a large FLAT region votes in proportion to how much
  of the page it covers — even though a flat region carries no information about the ink/paper
  boundary at all. The owner's plan has grey letterbox bars over 11.1 % of the page, which put two
  near-tied maxima in the criterion (175 at 100.00 % against 209 at 98.07 %) where one gives 4.6 %
  ink and the other 17.4 %. A design agent then proved the general case: over **6 080 three-mode
  histograms, 1 539 have the CORRECT cut as argmax and a WRONG cut as a near-tied rival reaching
  100.00 % of it**, because a page and its mirror are the same histogram with the middle mode's ROLE
  swapped. **No function of the histogram alone can separate them.** The fix therefore has to use
  information the histogram discards — here, whether a pixel sits on an intensity CHANGE. Two
  tie-breaks were tried and measured first: "least ink among near-ties" moved 13 of 24 corpus masks
  and "emptiest cut in the band" moved 21 of 24, both because on a clean page the criterion is a flat
  plateau spanning an EMPTY histogram valley, so plateau noise satisfies any local-maximum test.
- **Name the axis you actually measured, not the one that sounds right (S27):** this was written up
  for two sessions as an *exposure* instability. It is not. Sweeping each axis independently over the
  owner's file: a gamma curve refuses **26 of 41**, linear gain across ±0.3 EV refuses **0 of 46**,
  an additive lift refuses **0 of 41**. Gain preserves tone RATIOS and lift preserves tone
  DIFFERENCES, so neither can reorder two near-tied optima; only a tone CURVE moves two modes by
  different amounts. The practical consequence is not semantic: a regression test that perturbed
  brightness — the obvious thing to write — would have passed on the broken engine. (S26's companion
  claim that JPEG quality 0.49–0.51 shows the same jump is also refuted: through the real chain the
  cut is 173 at every quality from 30 to 100.)
- **A synthetic fixture can be arithmetically incapable of reproducing the bug, and sweeping harder
  will not tell you (S27):** the first attempt at the third-tone fixture held `ink` at the corpus
  default 26 and swept 540 combinations of margin tone, margin width, stroke width and annotation
  tone without ever reproducing the flip. The reason is arithmetic, not tuning: with ink 26 / bars
  198 / paper 246 the two candidate cuts score 2287 against 1457, a 1.57× margin, and no second mode
  forms at any stroke width from 1 to 14. The near-tie REQUIRES a mid-grey ink mode — which is what
  the owner's scan actually has (its ink sits at ~99, not black). Measure the real artefact's tone
  structure and reproduce THAT, rather than varying the parameters you happened to think of.
- **Improving a detector silently disarms the negative controls that were written against its
  failures (S27):** two of S26's controls pinned guards in `detect.ts` by using inputs that read
  badly — an `oblique-survey` scaled to 0.7× that came back as a pure scatter, and a thin redraw
  whose corner radii diverged. S27 reads both well enough that neither is degraded any more, so both
  tests failed while the guards they protect were still correct and still needed. Searching 1 050 and
  1 260 scaled/thinned variants found NO replacement in the corpus. The fix is to build a vehicle on
  purpose and prove it load-bearing by DISABLING the guard and watching the verdict flip — not to
  relax the assertion. (The constructed one exploits `minSegment` scaling with 1/sensitivity: corner
  connectors 45 px long survive the default's 35 px cut and are dropped by 'Careful''s 50 px, so the
  plan genuinely falls apart into disconnected sticks when the knob is turned down.)
- **Zero-padding an intermediate buffer and then differencing across it invents an edge (S27):**
  `edgeWeightedHistogram`'s blur array was allocated as `new Uint8Array(w*h)` and filled only on the
  interior, and the gradient pass then read those zeros — manufacturing a ~250-level step around the
  entire image. On an 80×60 page with 4 levels of contrast that border ring was the ONLY thing that
  cleared the gate (268 votes, every one of them the border), and it chose threshold 127 for a page
  whose ink and paper are both above 245. It was invisible on big images because real edges drown it.
  Found by checking a REGRESSION against the old behaviour rather than by reading the code: the fix
  looked right and the faint-page test said otherwise.

- **⚠️ MEASURE THE CHAIN, NOT THE FUNCTION — the same error landed three times at three depths (S26):**
  S25 read the owner's floorplan at **0.231** and filed a P0: "detection refuses their own plan at the
  default". It does not. `detectWalls` is pure and takes whatever bytes you hand it; the APP hands it
  bytes that have been through **two** unconditional lossy stages — `buildUnderlay` caps at 1600 and
  re-encodes **JPEG q0.72**, then `detectWallsFromUnderlay` caps at `WORK_MAX` 900. Through the real
  chain the plan is **accepted at all three levels** (structure 0.278 / 0.500 / 0.646). And the error
  repeated *inside this session*: S26's own first harness fixed the 900 stage and forgot the JPEG
  stage, reading 0.588 instead of 0.500 — caught only because an agent went looking for it. The rule:
  a harness that calls the pure function is measuring the pure function, and every stage between the
  user's file and that call is part of the answer. Enumerate them from the UI inward before you trust
  a number, and settle it by **driving the real UI** — that run (`docs/sessions/S26/live-owner-plan.mjs`)
  matched wall-for-wall and is the only evidence that needed no argument.
- **A refusal threshold and the knob that feeds it must not be the same lever (S26):** `sensitivity`
  scales `minSegment`, and `structure` is measured on the segments that survive it — so asking for
  FEWER walls mechanically lowers structure and the user's own pickiness is reported back as evidence
  about their image. Measured on the `oblique-survey` fixture: 0.346 accepted at the default, **0.222
  REFUSED at 'Careful'**, the same plan. The fix is not a lower constant but a stated invariant — the
  knob may change WHICH walls are offered and can never, by itself, turn an accepted image into "this
  doesn't look like a floorplan" — enforced by taking a second reading at the default and refusing only
  if both fall short. Pooling two readings is safe here for a reason worth checking before copying it:
  a null fails BOTH by a mile rather than by a near-miss (`no-plan-lines` measures exactly 0.000 at
  every level, because its lines are isolated, not almost-touching).
- **`support` and `explained` are measured against the pipeline's OWN mask, so they cannot separate
  anything (S26):** the obvious way to soften a structure refusal is "don't refuse when support is
  near-perfect and explained is high". Measured, that admits the null: `no-plan-lines` scores
  **support 1.000 and explained 1.000** at every sensitivity, while the lowest legit `explained` is
  0.867 — the null scores HIGHER than real plans on both. A set of clean straight lines is
  tautologically well-supported by, and fully explanatory of, the mask it produced. `structure` is the
  only signal with separating power, which is exactly why weakening it needs care.
- **A corpus can be blind to a whole dimension BY CONSTRUCTION, and the tell is arithmetic (S26):**
  every floorplan fixture rasterises at 700×520 or 900×700 — all at or under `WORK_MAX = 900` — so
  `k = min(1, 900/maxDim)` is exactly 1 for all 22 and the app's downscale was a no-op on every one.
  The corpus had never seen the resolution regime a phone photo arrives at, which is the hole S25 fell
  into. No fixture can catch a harness/app mismatch (that is not a property of any image), but a test
  CAN pin the property the mismatch hid: rasterise at 2.5×, push it through both of the app's
  downscales, and assert the read survives. When you add a guard, ask what its inputs cannot express.
- **A personal artefact can be the only valid fixture AND unpublishable at the same time (2026-07-29):**
  the regression guard here is the owner's own photo, but `src/engine/__tests__/fixtures/` is committed
  to a PUBLIC repo while the photo is a picture of their home. `docs/sessions/` is gitignored, so
  measurements can live there, but a committed test cannot reference them. The resolution is a
  SYNTHETIC fixture reproducing the measured characteristics — `oblique-survey`: an oblique envelope
  whose corners are sub-`minSegment` jogs, dimension lines beside every wall, heavy poché against thin
  partitions, a warren of closet-scale rooms. It now holds the bottom of the corpus's structure range
  (0.346 at the default, against `apartment-cluttered`'s 0.425), which is the gap the real plan sits
  in. Also: a photo dropped in the repo root is one `git add -A` from being published; it is covered by
  an `IMG_*` rule in `.gitignore`.

- **A "proper intersection" predicate is a LEAK whenever your geometry manufactures zeros (S25):**
  `rooms.ts` `segsCross` required a strict `d1*d2 < 0 && d3*d4 < 0`, which is correct exactly when
  all four determinants are non-zero — and this app produces exact zeros constantly, because the
  flood-fill grid origin is `sceneBounds().min − cell` and `sceneBounds` reads door rect CORNERS. An
  ordinary door's `h = 0.1` puts `min.y` at −0.05, which lands an entire cell-centre ROW on a wall
  5.5 m away; every step across it scored 0, was not blocked, and the region walked through the wall.
  Measured 54.81 m² for a 44.00 m² room, and **19 of 300** generated multi-room designs had a zoning
  region that had escaped the building entirely — which silently turns `optimize.ts`'s "This room"
  target into the whole house. Skewed walls are NOT exempt and are worse: a 45° hypotenuse can hold a
  whole anti-diagonal of centres, measured at 92.16 m² for a 40.05 m² triangle. The fix is the
  textbook predicate (proper test plus four `=== 0` branches with an on-segment span check), and
  `=== 0` rather than a tolerance is the RIGHT comparison: a determinant one ulp from zero still
  carries the correct sign and the strict test handles it, so only an exact zero is ambiguous.
- **Half a degeneracy fix passes every test you thought to write (S25):** the obvious repair handles
  only `d3`/`d4` (a cell CENTRE on the blocker) and argues that `d1`/`d2` (a blocker ENDPOINT on the
  step) should stay free, because going around a wall's tip is legitimate and blocking it might seal
  a doorway. That argument fails on the shape the generator actually builds: at an entry door the
  exterior wall splits into two stubs and the door rect's edges START at exactly the stub ends, so on
  that cell row THREE blockers each merely TOUCH the step — none blocks alone, together they seal the
  wall, and the fill threads the seam. The partial fix left **4 of 300** designs fully unsealed while
  passing all 22 other tests in the file. Distil the surviving failure into a named fixture (`THE
  SEAM`, from `one-bed`/seed 6) and keep a three-way ladder — strict → 5 fail, partial → 1 fails,
  full → 23 pass — or the next session's "simplification" silently reopens it. Fourth session running
  for "the corpus follows the code's guards".
- **A predicate that blocks a step blocks it in BOTH directions — including out of the seed (S25):**
  the leak fix makes `segsCross` block any step touching a blocker, which is right, but the flood
  fill applies it to the step OUT of a cell as well as the step in. So a seed whose own cell centre
  sits on a wall has all four exits removed and `regionOf` returns a single 0.09 m² cell. The cell
  spans ±cell/2, so ANY seat within 0.15 m of a grid-aligned wall lands in it — measured, 640 of
  17 600 interior positions on the app's 0.05 m snap grid, and a seat pushed against a wall is
  ordinary. `optimize.ts:265` is the one region consumer with no `area > 2` guard, so it surfaced as
  "Suggest placement" returning ZERO speakers behind a note blaming the user's furniture. Fix it at
  the SEED, not in the predicate (exempting the seed inside `segsCross` would reopen the leak): the
  raw seed POINT is off the wall even when its cell centre is not, so its position picks the side.
  And handle the exact tie — a seat dragged precisely onto the centreline carries no side
  information, and a stable sort silently picked the strip OUTSIDE the building (8.64 m² instead of
  43.74), so run both fills and keep the larger.
- **Re-measure a reviewer's CRITICAL before you act on it — two of them here were quantisation, not
  bugs (S25):** one agent reported that the `=== 0` gate is unsound because at H = 4.0 the on-wall
  cell centre is one ulp short and the leak "reproduces byte-for-byte". The arithmetic was right (it
  IS one ulp off at H = 4.0/3.7/6.1) and the conclusion was wrong: a non-zero determinant with the
  correct sign is exactly what the strict test handles, and all three heights are sealed at 0.35,
  0.5 and 0.8 m beyond the wall. Its evidence — `contains(4, 4.1) === true` — was half-cell
  quantisation: y = 4.1 maps to the cell centred one ulp BELOW the wall, legitimately inside the
  room. A second CRITICAL ("34 % of import-legal coordinate offsets reopen the leak") dissolved the
  same way: across 41 offsets to 100 km, `contains(0.5 m beyond)` is false at every one, and the
  area moving 43.74 → 46.17 is one extra boundary ROW (8 m × 0.3 = 2.43 m²). `contains` is
  grid-quantised BY CONSTRUCTION — a point up to half a cell outside a wall maps to the boundary
  cell — so it is the wrong probe for "did it leak". Probe well clear of the wall instead.
- **When a repair might over-block, find the axis that shrinks the margin and measure along it
  (S25):** the risk here was sealing a doorway, and the margin is the doorway measured IN CELLS —
  which shrinks because `rooms.ts` grows the cell as `span/158` past ~47 m. So the test sweeps
  envelope sizes: a 0.9 m door spans 3.0 cells at 8 m, 2.4 at 60 m, 1.6 at 90 m, 1.0 at 140 m, and it
  connects at every one. That is a real answer; "it should be fine, the gap is 3 cells" would have
  been an assumption that quietly stops holding on a large plan.

- **A unit bug survives every DETERMINISM test, because both sides move together (S24):**
  `generate.test.ts`'s `geometrySignature` includes `o.rotation`, and it is compared only against
  another run of the SAME code — so `edgeAngleDeg` feeding degrees into a radians field was pinned
  for *stability*, never for *correctness*, across 37 tests and two sessions. 50.7 % of every
  generated opening was drawn at the wrong angle (0° walls accidentally right, 90° out by 26.62°,
  180° by 53.24°) and the suite was green throughout. A determinism fingerprint proves reproducibility
  and nothing else; correctness needs an assertion against something OUTSIDE the code under test — here,
  "the opening's long axis is parallel to a wall whose line it lies on", measured through `rectCorners`.
  Never assert the raw field: the failure mode was a plausible number in the wrong unit, which a
  field-equality test would have happily frozen.
- **Right units is not right geometry — write the negative control that has the units right (S24):**
  after the fix landed green, an axis-snapping variant (`round(raw / (π/2)) * (π/2)`) — correct radians,
  visibly wrong on any diagonal wall — ALSO passed all 40 tests. The corpus (`SEEDS.slice(0, 8)`) held
  zero diagonal openings, because the `l-notch`/`alcove` outline variants only emit ±45° ones from seed
  index 8 on. Widening both tests to the full seed list makes the wrong fix fail at
  `studio/3428989595 window: 45.00 deg off` for +0.3 s, and the test now asserts `diagonal > 0` so the
  corpus cannot silently lose them again. Third session running for "the corpus follows the code's
  guards" — when you fix a bug, run the OTHER wrong answer past your new test, not just the old one.
- **Associate an opening with its wall by the LINE it lies on, not the nearest wall (S24):** a generated
  door sits in a real gap between two collinear jamb stubs, so at a corner the *nearest* wall is often
  the PERPENDICULAR one. A nearest-wall test failed by exactly 90° on 35 of 816 openings with the code
  fully correct — a false failure from the harness. Filter by perpendicular offset from the wall's
  infinite line (exact by construction: the centre is `lerp(a, b, t)` on that line), then assert
  parallelism. The tell is a failure of exactly 90.00°, which is a harness bug, not a geometry bug.
- **Give a tree-mutating skeptic its OWN copy (S24):** the impact workflow was told it could apply and
  revert the fix to measure. It did — six times — while the main thread was editing the same files, and
  it left eight scratch `zz*.test.ts` files in `src/` that joined `npm test` and broke the gate twice.
  Nothing was lost (the agent backed up by sha and restored byte-identically, and `git status` proved
  it), but the race was real and avoidable. Either point measurement agents at a copied tree, or forbid
  writes entirely and have them report what they would measure. And run `git ls-files --others
  --exclude-standard src/` before every gate, not just `git status`.

- **A magnet's band must be gated on the SIGNED gap, never `|gap|` (S23):** an absolute-value gate
  gives the band a NEAR edge as well as a far one, so pushing a piece FURTHER into a wall walks it
  SEAT → align → nothing. Measured on a 2.0×1.6 bed against a 13° wall: at 0.65 m of centre offset the
  seat released and the centre jumped **0.163 m BACKWARD** — larger than the seat band itself, so the
  design's own "provable jump bound" was false — and below 0.45 m the rotation reverted to its pre-drag
  value while the bed was half-buried in the wall. At the default 60 px/m that is a 9 px overshoot to
  lose the seat and 21 px to lose the angle, well inside ordinary mouse slop, and "shove it harder to
  make sure it's stuck" is exactly the gesture a magnet invites. Gate on `gap <= band` and a piece
  pushed past flush simply stays seated and is pulled back out.
- **Snap to the nearest HALF turn, not the nearest quarter turn — and the owner's building decides it
  (S23):** on a plan rotated as a whole, every wall lies in the SAME quarter-turn class (22° and 112°
  differ by exactly 90°). So under nearest-π/2 the face a piece presents to a wall is fixed forever by
  its birth rotation, and `App.tsx` hardcodes every palette drop to `rotation: 0` — a sofa dropped on a
  22° plan lands parallel to the 22° walls and **perpendicular** to the 112° walls, sticking a metre
  into the room, and dragging it to another wall never fixes it. Nearest-π puts `w` along the wall
  unconditionally, which is what `arrange.ts` `wallSlots`, `interaction.ts` `makeOpening` and
  `generate/shell.ts` already do. Half the owner's walls would otherwise refuse to seat anything.
- **A quarter-turn applied to the INPUT of a nearest-π snap is annihilated by it (S23):** `k =
  round((θ + π/2 − θw)/π)` just shifts `k` by an integer, landing in the same π-class. Measured over 7
  wall angles with the Sofa preset: a literal **no-op** on 13/22/37/68° walls, and on 0/104/−11.73° a
  180° flip whose four `rectCorners` are **bit-identical** — so the advertised "turn it a quarter turn"
  key does nothing, on every wall, while still pushing an undo entry and jumping the Inspector's
  rotation slider 180°. Apply the turn AFTER the snap and derive `halfPerp`/`halfAlong` from the result.
  This mattered because the whole justification for choosing π over π/2 was "⇧F covers the residual
  ambiguity" — a design that rests on an escape hatch must verify the hatch opens.
- **A wall shorter than the piece will capture the floor around it unless you require real OVERLAP
  (S23):** an accept window of `along ∈ (−halfAlong, L + halfAlong)` is `2·halfAlong` WIDER than the
  wall, so a 0.7 m closet wall gets a **2.70 m capture window — 3.9× its own length** — and a 2 m sofa
  parked in open floor gets yanked onto it. Require
  `overlap = min(along+halfAlong, L) − max(along−halfAlong, 0) ≥ min(halfAlong, L/2)` and clamp the
  output. `arrange.ts:151` already restricts its own wall slots to `t ∈ [0.12, 0.88]` for exactly this
  reason — when the app's own model already disagrees with your design, the model is usually right.
- **`Math.atan2(Math.sin(r), Math.cos(r))` is NOT bit-exact, and a one-value test will not catch it
  (S23):** measured, **12.1 %** of values already inside (−π, π] come back perturbed by ~4e-16. Calling
  it on a no-op path silently rewrote the rotation on every frame of a Shift-drag — contradicting the
  exact invariant the feature advertises ("leaving a wall's field restores the identical float"). The
  test that was supposed to guard it probed the single value `0.4211`, which happens to be one of the
  87.9 % that survive, so it **passed by luck**. Sweep the range, and pin a measured failing value by
  name. This is the S19/S22 "the corpus follows the code's guards" lesson landing on a fresh diff.
- **A drag that writes a field every frame silently reverts any OTHER writer of that field (S23):**
  `keyboard.ts`'s `q`/`e` needs only an object selection, which pointerdown has just set, so a rotate
  can land mid-gesture — and because every frame re-derives rotation from the pointerdown-captured
  `rot0`, the next pointermove threw it away. Pre-S23 the branch wrote only `center`, so it survived.
  Fix by comparing the object's live value against what the branch ITSELF last wrote: different means
  someone else wrote it, so re-base. That keeps the gesture a pure function of its inputs (an external
  edit re-bases it, its own output never does) instead of degrading into a feedback loop. Reset the
  marker per GESTURE, not per mount.
- **Read the app's real store, not the seed you wrote (S23):** a live harness that seeded
  `localStorage['phantom-lock:v2']` and then asserted against that same key measured **nothing** — the
  app autosaves to IndexedDB and never writes the legacy key again, so the read returned the frozen
  seed forever and every assertion would have passed against a value the app never produced. Worse, on
  a pristine origin the app ignores that key entirely and seeds its own first-run demo. Boot once, write
  the probe layout straight into IDB, reload (it is no longer a first run), and assert the layout
  switcher actually shows your layout's name before trusting a single number.
- **Locate a canvas object by CONSEQUENCE, not by pixel maths or DOM selectors (S23):** deriving the
  world→screen transform means re-implementing the app's fit logic in the harness, and probing for a
  selection through `.inspector`-style selectors guesses at markup. Instead sweep candidate points,
  drag each by ~30 px, and check whether the TARGET object's stored centre changed — then ⌘Z back. It
  cannot silently test the wrong object, it needs no knowledge of the view, and it survives markup
  changes. The drag direction still has to match the app's axis convention (+y is DOWN here), which one
  run's numbers will tell you immediately.


- **A component filter cannot separate furniture from a wall it TOUCHES; local thickness can (S22):** the old
  detector rejected furniture by BOUNDING-BOX SPAN, which a sofa passes, and no component-level rule (span, area,
  aspect ratio) can do better once the sofa is pushed against the wall and they share one connected component —
  which is the normal case on a real plan. What separates them pixel by pixel is the largest inscribed disc: a
  wall is thin everywhere, a sofa is fat in the middle. That is exactly what a distance transform measures, so
  `removeThickRegions` is an erode-then-dilate on an EXACT Felzenszwalb EDT. Two details that are not optional:
  the rim must be swallowed at `maxHalfWidth · √2 + 1` rather than `+1.5` (a right-angle corner is the farthest
  boundary point from the eroded core — measured, exactly four pixels of every rectangular blob survived the
  smaller figure), and the filter must run AGAIN after closing, because closing MANUFACTURES thick regions that
  were not in the image: hatching at a pitch under `2·closeRadius` fills into a solid mass that arrives after the
  first pass has already run.
- **`classify` by CROSSING NUMBER, never by neighbour count — and the corpus will not tell you (S22):**
  Zhang-Suen does not guarantee a strictly 8-connected 1-px skeleton; at most slopes it leaves a staircase, and a
  staircase pixel has THREE neighbours while lying mid-line. Branch tracing stops at junctions, so labelling those
  pixels junctions shatters every non-axis-aligned wall into sub-threshold fragments. Measured on an isolated
  straight line: 0 false junctions at 4°, **128 at 8°, 203 at 30°, 310 at 40°** — and a plan photographed 8, 20,
  22, 24 or 26 degrees off-square returned **ZERO walls**. The Rutovitz crossing number reports 0 at every angle
  while still reporting real T- and X-junctions. The corpus could not see it because it rotated by 4° and its one
  angled fixture was 30°, i.e. calibrated at exactly the two angles where the bug does not fire — the S19 lesson
  verbatim: *the test corpus follows the code's guards*.
- **A refusal is a cap, and a cap that fires on real data is a data-loss bug (S22):** `MIN_STRUCTURE` 0.40 looked
  well-clear of the null cases (which measure 0.00) and refused two legitimate plans — a 22°-rotated photo at
  0.364 and heavy-poché-with-thin-partitions at 0.313, each an 83–96 % correct read thrown away with a message
  blaming the user's image. Calibrate a refusal against MEASURED legitimate lows, not against the failures it is
  aimed at, and when you loosen one add the harder null fixture that gives the loosening something to be
  falsified against (`no-plan-lines`: long straight lines that join nothing).
- **The harness must score what the USER gets, or a wrongly-fired refusal is invisible (S22):** the benchmark
  scored `detectSegments` while the app showed `detectWalls(...).quality.refusal`. `hairline` scored 98.0 % in the
  harness and was REFUSED in the app, and nothing in the run said so. Score the refusal as zero and print the
  reason; the instrument has to model the product, not the function.
- **Build the measuring instrument first, and TEST IT (S22):** "did detection get better?" has no answer without
  ground truth, and ground truth is only exact when the image was *drawn* from a description. The corpus is
  therefore CODE — a deterministic pure-TS rasteriser that hands back the centrelines it painted. The score is an
  intersection-over-union on wall LENGTH, i.e. what fraction of the user's editing work was done for them, which
  makes duplicates and hallucinations both count as deletion work; precision alone is blind to a duplicate,
  because a duplicate lies exactly ON a real wall. `detect-score.test.ts` tests the instrument against hand-built
  cases whose answers are known by arithmetic — a perfect detection scores 1, an empty one 0, "every wall twice"
  0.5 — because if the instrument is wrong every other number in the session is wrong and nothing else notices.
  It also caught a real defect in itself: fragmentation double-counted duplicates until it subtracted the MEAN
  simultaneous coverage rather than the peak (two abutting halves both cover the single pixel where they meet, so
  a peak-based correction reads one shared pixel as "duplicated" and excuses the split entirely).
- **A guillotine tiling is NOT conforming, so matching whole edges silently draws walls three times (S22):** cut a
  room off the left and then cut the right-hand block horizontally, and the boundary is one 7 m edge on the left
  facing two 3.5 m edges on the right. Keyed whole, none of the three matches any other, all three count as
  exterior, and the wall is emitted three times with no door in any of them — after which the walkable region
  equals the zoning region and every piece of furniture is trapped in one room. Reduce each axis line to atomic
  intervals and count coverage instead. The tell was not a crash; it was `walkable === zoning`.
- **A door rect in a solid wall joins two rooms acoustically and not at all for furnishing (S22):**
  `rooms.ts` `collectBlockers` pushes the WHOLE wall segment for every wall at `height >= MIN_BOUNDING_HEIGHT` and
  never consults `wallKeptSpans`; doors only ever ADD blockers. Measured four ways on one two-room plan, only
  "two stubs with a real gap PLUS the door rect inside the gap" gets both semantics right — rooms stay distinct
  ZONES for `optimize.ts` while furniture reaches the whole home. The naive construction, which is also what the
  UI's own `opening` tool produces on an existing wall, confines every piece of furniture to the seat's room.
- **Ship a verified lock or ship nothing — never "almost" (S22):** `VerdictHero`'s ignition is a false→true EDGE
  and mount is never an edge (S15), so a generated design that opens *almost* locked shows a static "Almost
  there" and gives the user nothing the app makes discoverable. So the pair search is a LADDER that accepts only
  what the real `traceScene`→`computeAudio` already reports as locked, and returns zero speakers otherwise — which
  lands on `TuneToolsCard`'s existing empty state. Measured: 88 % of 480 designs open locked, 0 open unlocked.
  Also: furniture does NOT defeat a ±30° pair (a furnished 8×7 room locks at quality 1.00); what defeats it is
  `tv.offAxis` against `TV_AXIS_TOLERANCE` 0.25, so the heading is aimed at the TV first and swept only as a
  fallback.
- **`integrateWall` is the wrong home for detector output, and the reason is quadratic OUTPUT (S22):** the old
  Session-12 plan called for committing detected walls through it. Measured, feeding N walls through it
  sequentially produces exactly **N²/2 objects** — 40 walls → 800, 60 → 1 800 — which multiplies `collectSurfaces`
  and therefore every engine sweep S18 and S19 spent two sessions bounding. Its `EPS = 0.02` is also in NORMALISED
  parameter space, so it silently drops a chunk shorter than 2 % of a wall's length: a 10 m wall crossed twice
  0.10 m apart comes back 9.900 m, a 10 cm acoustic hole. `joinCorners` already makes corners meet, so the
  acceptance bullet was retired rather than met.

- **Two absolutely-positioned overlays at the same coordinates is a HIT-TESTING bug, not a cosmetic one (S21):** `.legend` and `.toolstrip` were both `top:12px; left:12px`, and the legend's `z-index:6` beat the strip's `auto` — so `elementFromPoint` at the centre of the primary "Select & move" tool returned `.legend-toggle` and the button was **unclickable at every desktop width**. It survived a screenshot review because the strip simply looked like it started at "Box select". Two lessons: assert reachability with `elementFromPoint`, not by eye; and fix a collision by anchoring the smaller element to the OPPOSITE edge rather than nudging an offset — `.toolstrip` has `flex-wrap: wrap`, so any fix assuming a fixed strip height breaks again the moment it wraps. The existing `@media (max-width:960px)` comment already reasoned about the bottom rail; the author had solved one regime and never checked the other.
- **A fixed CDP debugging port silently attaches you to a PREVIOUS browser (S21):** `--remote-debugging-port=9333` plus a lingering instance means the new Chrome fails to bind and `/json/list` hands you the OLD one — with its old profile. A run that believed it was on a fresh origin found `intro-dismissed`, `tutorial:{seen:true}` and a practice room already active, which would have quietly invalidated every first-run and data-safety claim made from it. Use `--remote-debugging-port=0` and read the real port from `<profile>/DevToolsActivePort`, so you provably attach to the process you just spawned. The tell is state that cannot exist on a fresh profile — check for it explicitly rather than trusting `mkdtemp`.

- **A tutorial's payoff step must be built backwards from the ENGINE, and the numbers decide the design (S21):**
  the guided tour's whole job is to walk someone to THE LOCK, and three measurements — not opinions — fixed its
  shape. (a) The lock is a PRECISION condition: with one speaker pinned, only **3–5 cells** of the 0.05 m snap
  grid lock at all, a target ~0.05–0.10 m across and a handful of pixels at default zoom. So "drag it until it
  locks" is not a step, it is a trap that stalls the tour on its own climax. (b) `keyboardPlacementPoint` puts the
  first two pods at exactly ±30°, which locks at **quality 0.997** in a CLEAN rectangular room and does **not**
  lock in the furnished Maple Court demo (`apexBlocked`, 0.5) — hence a disposable practice room rather than
  borrowing the demo. (c) `VerdictHero`'s ignition is a false→true EDGE and mount is never an edge (S15), so a step
  that merely lands on an already-locked scene shows a static headline and no celebration. The resolution is to
  split the work by who is good at it: the RUNNER does the precision placement (`show`), and the USER makes the
  pairing click (`try`) — which IS the edge. Measure first; a tutorial designed from intuition would have shipped
  a climax that silently does nothing.
- **Reuse-by-name means the SECOND run starts from the FIRST run's end state (S21):** the practice layout is found
  by name and reused, which is right (a re-run must not litter the gallery with copies) — but it meant the room
  still held the previous run's locked pair. `placeTwoPods` was idempotent and no-oped, `ctx.locked` was already
  true when the pairing step opened, and because the ignition needs an EDGE there was no celebration. The tour's
  climax was dead on every run after the first, with nothing on screen to indicate it. Any step that depends on a
  transition must RE-ARM its precondition on entry (`armPairDemo` clears before placing) rather than assume a
  clean slate. Idempotence is the right property for a `show` action and the WRONG one for a step whose whole
  point is a state change.
- **A non-modal overlay cannot join `overlayOpen`, and that has a price you must pay explicitly (S21):** setting it
  kills every scene and tool key (`keyboard.ts:118`), drops the canvas out of the tab order
  (`SimCanvas.tsx:1156`), disables Space-pan and the hover chip, and silences the announcer — so a tutorial that
  set it would switch off the very features it teaches and make every `try` step impossible on a keyboard. But
  staying out means app shortcuts are live while focus is in the card, and `interactiveTarget` gates **only Arrow
  and Delete** — digits, `t`, `q`/`e` fire straight through a focused button and mutate the scene behind the
  tour. So the card swallows its own KEYDOWN with carve-outs for Escape and ⌘-chords, and deliberately does NOT
  swallow keyup, because `interaction.ts` disarms Space-pan on keyup ABOVE its own target exemption (the S7
  lesson) — eating keyup would strand panning armed forever.
- **An independently-launchable chapter is a data-safety hole unless it declares what it writes (S21):** the
  chapter menu is what makes the tour re-enterable documentation rather than one-shot onboarding, but it also
  means a user can jump straight into a chapter whose first action writes a scene — landing on whatever layout is
  active, i.e. THEIRS. `TutorialChapter.needsPractice` marks a chapter as scene-writing and `onStart` enters the
  disposable room BEFORE dispatching, with a corpus test asserting that every chapter containing a writing action
  carries the flag. Fixing it by moving the step would have worked once; the test is what stops the next session
  reintroducing it.
- **A spotlight measured only on step change will confidently point at the wrong thing (S21):** the anchor can
  vanish with no event to listen for — the pair button unmounts the instant the pair exists, and the sidebar
  reflows into the gap — so the ring kept its last rect and ended up drawn around "+ HomePod" the moment the user
  completed the tour's most important action. Re-measure after EVERY render instead, which is only safe with a
  reliable "nothing moved" answer or the effect loops forever; hence `rectsEqual`/`positionsEqual` comparing to
  the nearest half pixel, because `getBoundingClientRect` jitters in the last bits between identical layouts and
  an exact compare would flip-flop indefinitely. Found by driving the real browser, not by a test.
- **The CSP source scanner is comment-blind (S21) — but LESS than this said (corrected S30):**
  `security-headers.test.ts` greps source TEXT, so a comment can fail the suite. Re-read in S30, the
  patterns match CALL or ASSIGNMENT syntax — `setAttribute('style'`, `.insertRule(`, `eval(`,
  `new Function(`, `.innerHTML =` — so merely NAMING one in prose is fine; only writing the call form
  trips it. The one true bare-identifier match is `dangerouslySetInnerHTML`. The original wording
  pushed authors into vaguer comments than the guard requires. Same class of self-inflicted failure as the `--text-3` ratchet, which
  also fired on this diff for an 11px eyebrow — both guards were right and both were fixed rather than suppressed.

- **Make the shape REQUIRED in memory and OPTIONAL on disk — and know which gate catches which (S20):** `Layout.projectId`/`LayoutStore.projects` are required, which is exactly what turned the seven non-spreading `setStore` literals (duplicate / new / new-room / undo-delete / delete-last / delete-active / import — i.e. every layout CRUD action) into compile errors instead of silent folder resets. But the DISK types must stay optional, because every pre-S20 record genuinely has no such key and a required `MetaRecord.projects` lets you write `meta.projects.map(...)` that compiles clean and throws for 100 % of returning users on their first load. Two further traps in the same file: `saveLayout` and `loadFromIDB` build their record literals FIELD BY FIELD (so a new per-layout field round-trips to IDB and vanishes on the next read unless added to both), and `saveMeta` rebuilds the whole meta row on EVERY autosave cycle (so a 1-arg signature is a 400 ms fuse on total folder loss — making `projects` a required parameter is what stops it). And note the required/optional split surfaces under `npm run build`, NOT `npm test`: vitest strips types with esbuild, so a green suite proves nothing about it.
- **A cap is not always the tool — sometimes the honest control is a MEASUREMENT (S20):** an N-up view multiplies whatever one column costs, and a column here ranges over five orders of magnitude — 0.02 ms on the seeded demo, 62 ms on a 30-room house with apex-blocked pairs, ~10.9 s on an adversarial import-legal payload. No fixed N is safe by arithmetic, and a cap small enough to bound the slow case fires on every ordinary one (the S18 lesson inverted: there a cap calibrated against a subset caused data loss; here a cap *justified* against a subset licenses a freeze). So `MAX_COMPARE` is documented as a **legibility** bound and the real control measures the columns it does compute, then stops auto-computing once one exceeds the INP budget. Do not let a doc comment cross-check a cap against the one scene where the optimization works — the next session will believe it.
- **Half a speedup is still worth shipping, but say which half (S20):** a compare column reads the trace ONLY through `.direct.blocked`, and `traceScene` builds `direct` with an independent `directPath` taking neither `rayCount` nor `maxBounces` — so dropping the ray fan is exact BY CONSTRUCTION and 247–865× cheaper. It is also a ~1× no-op on any scene where `computeAudio` dominates (apex-blocked pairs → `bestPairSpot` sweeps), which is precisely the slow case. Both facts are true; the module comment states both, because a comment that only reports the 1565× would have sent the next session looking for a bug when a column takes 62 ms.
- **A repair applied only at the load boundary is not applied at all if UNDO writes past it (S20):** `assembleStore` re-homes an orphaned `projectId`, but `undoDelete` writes straight into the live store and never passes through it. Delete a layout, delete its folder, undo the layout → it comes back pointing at a folder that no longer exists, renders in NO group, is autosaved back to IndexedDB, and is invisible. Present-but-unreachable is worse than the delete it was undoing. Every write path that bypasses the sanitizer needs the same repair, and it must bump `updatedAt` or the repair never reaches disk. Related: the repair target must be STABLE (`orphanHome` = oldest project by `createdAt`, not `projects[0]`) because it is recomputed on every load and never persisted — an unstable target moves an orphan between folders across reloads with no user action in between.
- **`<section aria-label>` is a landmark, so N of them is a defect the WCAG-tags-only axe run cannot see (S20):** eight compare columns each rendering `VerdictHero` + `MetricsPanel` mint sixteen `region` landmarks with two distinct names. `landmark-unique` is a **best-practice** rule, so `expectNoAxeViolations` (WCAG tags only) passes clean on exactly the thing being broken — use `expectNoAxeViolationsOnPage`. The fix is to DROP the name in the compare variant (a `<section>` without an accessible name is not a landmark) and let each column name itself. Same class of thinking for focus: removing a column can disable every Remove button in the same commit, and `.focus()` on a disabled button is a no-op that drops focus to `<body>` — aim the ladder at a control the action itself re-enables.
- **Ragged columns defeat the point of a comparison view (S20):** at `--text-hero` a headline like “One pair locks, another doesn't” wraps to three lines in a 280–360 px column, so every column started its spec sheet at a different height and scanning four of them meant re-finding each row in each one. Invisible to every unit test and to `getComputedStyle` — it only fell out of measuring `getBoundingClientRect().top` of each column's metrics card in headless Chrome (193 vs 147 px heroes → 675 vs 630 px card tops). A type-step down plus a `min-height` fixed it; the proof is that all four card tops now read 666.

- **Bound the DERIVED value or make the WORK cheaper — a cap is not the only tool, and sometimes it structurally cannot be (S19):** S18 capped the grid sweeps and correctly reported that this did nothing for a legitimate 50-room chain, because that scene's grids are never capped — its cost is per-CALL work. The two shapes load the SAME term (`bestReflectionDb`, 94–100 % of a pass in both) through opposite factors: the chain is 45 901 calls × 315 µs, the wall-heavy attack 16.0 M calls × 7.7 µs. So the fix had to attack both axes — hoist everything independent of the grid cell OUT of it, and skip the calls whose results are provably discarded. Neither alone reaches the target.
- **`blocked` is an existential, so it may be computed in any order; `attenuation` is a left-fold, so it may not (S19):** `directOcclusion` returns the *literal* `attenuation: 0` on the blocked branch, and the per-surface predicate reads no loop-carried state — so "is anything blocking" is order-independent and can return on any witness. But the unblocked branch multiplies graze factors **in array order**, and float multiplication does not reassociate (measured: 35 % of three-factor products differ when reordered). The discipline that follows: give the `blocked`-only callers their own helper and leave `directOcclusion` byte-unchanged, so the four `.attenuation` readers — including the on-screen Echogram — are out of the blast radius BY CONSTRUCTION rather than by argument.
- **A bounding box over segments is a search ORDER, not a filter (S19):** it is tempting to reject a surface whose AABB misses the query box. It is not sound: in the near-parallel band just above `raySegment`'s `1e-12` guard, `t` is a ratio of two catastrophically-cancelling cross products and can be reported inside `[EPS, d)` for a segment whose true crossing is far outside the box — and `addRoomShell` appends rooms flush, so exactly-collinear walls are what the app actually builds. The fix costs nothing: trust a POSITIVE from the fast pass (it ran the exact predicate) and settle a NEGATIVE with an unfiltered rescan. Both answers are then exact and no conservatism proof is needed anywhere. Same reasoning licenses the per-leg "last blocker" hint and the height prefilter *inside* that helper — but NOT inside `directOcclusion`, where a wrongly-skipped surface would silently drop a factor out of a product that is on screen.
- **Move the expensive arithmetic BELOW the guards that reject almost everything (S19):** `bestReflectionDb` computed `Math.hypot(flat, sp.z - earZ)` — a nested hypot, unreplaceable under bit-identity — before the two leg-occlusion checks that reject nearly every candidate on a wall-heavy scene. Nothing between reads it and both guards are pure, so deferring it is exact and free. Also worth knowing before optimizing: `Math.hypot` measures **6.4 ns** against 0.7 ns for `sqrt(x*x+y*y)` — 9× slower but only 6 ns, so it was NOT the bottleneck; the win came from not calling it at all. Measure before assuming which primitive is slow.
- **A negative control that passes is a hole in the CORPUS, not a clean bill of health (S19):** four "harmless simplification" perturbations were run against the golden. Swapping the nested hypot for `sqrt(x*x+y*y)` broke 14 entries immediately. But swapping `v.norm(q)` for `v.scale(q, 1/wlen)` — a 45 %-divergent rewrite in general, and exactly what a "share the wall-direction helper" refactor produces — passed everything, because every fixture wall was AXIS-ALIGNED, where both forms give ±1 bitwise. Adding one skewed room with irrational wall lengths and one seeded pseudo-random scene made it fail. Two controls still pass and are recorded rather than hidden (`o.w/2/wlen` → `o.w/(2*wlen)`, and `u < 0` → `u <= 0`): both need an input landing inside an ulp-wide window. Run the controls, and when one passes, ask what the corpus is missing.
- **40 000 random rays never hit a 1e-9 tolerance band — aim at it deliberately (S19):** `raySegment` accepts `u ∈ [−1e-9, 1+1e-9]` so hits may land just past an endpoint. Tightening that to `u < 0 || u > 1` passed the entire randomized identity suite, because a random ray essentially never grazes an endpoint to within a nanometre. Every tolerance constant needs a test that *constructs* an input inside it; fuzzing alone will not find one.
- **The test corpus follows the code's guards, and `legit-scenes.ts` had none for these (S19):** `withSpeakers` always uses an even count and pairs (0,1),(2,3),… so the protected set contains **no solo speaker and no zero-pair scene** — precisely the two conditions the new cell-skip branches on. Dropping the `solos.length === 0` guard passed the whole suite until ALL-SOLO / MIXED / coincident-pair fixtures were added; it now breaks 8 of 162 golden entries. When you add a predicate, add the fixture that makes its guard load-bearing, or the guard is untested by construction.
- **Re-capturing a "pre-change" golden means putting the OLD engine back, and stash is the wrong tool (S19):** the corpus had to grow twice after the engine was already rewritten. Each time the fix was to copy the new files aside, `git checkout <pre-change-commit> -- <engine files>`, regenerate, then copy back — each step its own command, verified with `git status`. Never `git stash && regenerate && git stash pop` chained with `&&`: S18 lost that race when the regeneration timed out and the tree was left silently uncapped.
- **A skeptic's job includes refuting the SPEEDUP, not just the correctness (S19):** the design agent that proposed the two caller-level skips measured them against the pre-session baseline and claimed 117× on the 50-room chain. The independent skeptic re-measured on top of the already-landed `reflection.ts` and found 5.9× — and, more usefully, found the proposal had *under-sold* the same change on the payload it declared unreachable. Performance proposals go stale the moment a sibling change lands; re-measure every number on the tree you are actually shipping.

- **A performance cap is calibrated against an ENUMERATED protected set, or it is a data-loss bug (S18):**
  the first cut of the grid cap was calibrated against a 50-room chain of default 6×6 m rooms and looked
  fine. A design agent measured it against the UI's actual `clampDim` maximum and found it fired on a
  **16-room chain of 25×25 m rooms — span exactly 400 m, `importRejection`-ACCEPTED, coarsening with only
  two speakers.** That is the S8 lesson ("a cap that fires on real data is a data-loss bug, not a fix")
  reappearing in the CPU domain. "No legitimate scene" is **not a decidable predicate** — `addRoomShell`
  appends flush with no gap and no room limit, so cell count grows without bound in room count and no
  finite budget survives every UI-buildable layout. The fix is to write the protected set down as a
  fixture list (`engine/__tests__/fixtures/legit-scenes.ts`), test every entry, and make the constants'
  doc comments point at it. Calibrate against a subset and you will reintroduce exactly this bug.
- **ONE ceiling is never enough — cheap-cell and expensive-cell attacks are disjoint (S18):** a 400 m
  square with 20 walls reaches 1 243 528 pairspot cells at a work product *below* several legitimate
  scenes, so a work budget cannot see it; a 5 000-object scene costs **47.8 ms per cell**, so a cell
  budget large enough for real layouts still allows minutes of work. `grid.ts` therefore caps BOTH
  `cells` and `cells × perCellCost`, and each one is load-bearing for a shape the other misses.
- **Bound the DERIVED value through `Math.max`, and bit-identity becomes structural (S18):** `cappedStep`
  returns its `baseStep` argument via `Math.max`, which yields the *identical float*, and `step` is the
  only value the cap feeds into either loop — so "unchanged below the threshold" is a property of the
  code, not a coincidence a test happens to catch. Still prove it: capture a golden from the PRE-cap
  engine *before* wiring anything up (there is exactly one moment when the old engine exists), and keep
  a negative control — `bestListeningSpot`'s own `coarse` flag is an in-tree step lever that demonstrably
  moves the answer, so it proves the harness can fail.
- **Span is not the only way a `t += step` loop fails to terminate — the ORIGIN is (S18):** S8 clamped the
  span and recorded termination as closed. It was not. Whether the accumulator advances depends on
  `ulp(t)`, i.e. the box's absolute coordinates: a room of an **ordinary 400 m span** parked at
  x ≈ 4.6e15 cannot advance a 0.35 m step, and past ≈ 1e21 `clampSpan` rounds both ends to the midpoint
  so the span is exactly **0** and every `span > 0` guard waves it straight through. Both are reachable
  through the load path (`sanitizeScene` clamps no coordinate; `importRejection` guards only the JSON
  importer). Floor every step at `2·|coord|·ε`. This also breaks the cell PROJECTION: `t += step` rounds
  *down*, so more cells fit than `span/step` predicts (measured 502 real against 500 projected) — the
  projection must be origin-aware or the budget it feeds is unsound.
- **A closed-form cap must solve the projection you actually use, slack included (S18):** the obvious
  `step = √(area / budget)` ignores the `+2`-per-axis slack in `axisCells` and lands **over** budget
  (measured 2 116 cells against a 1 953 budget). Solve `(spanX/s + 2)(spanY/s + 2) ≤ budget` properly —
  it is one quadratic root. An iterative `while (cells > budget) step *= k` would add float noise and
  need its own termination proof; the closed form needs neither.
- **Assert the deterministic integer, never the wall clock (S18):** a `performance.now()` assertion that
  the capped sweep finishes "in under 10 s" passed under `npm test` and **failed at 10.18 s under
  `npm run test:coverage`**, with the code completely correct — v8 instrumentation is the difference.
  Cell counts are exact integers and cannot flake; timings belong in a saved benchmark artifact
  (`docs/sessions/S18/bench/`), not in the suite.
- **Cap the term that is actually unbounded, and say which ones you did not (S18):** this cap closes
  `span²`. It does **not** touch `bestReflectionDb` (O(walls × (objects + surfaces)), and deliberately so:
  a legitimate multi-room house is the wall-heaviest thing in the app, so a walls-aware budget fires on
  real data — measured **20× higher** for a legit 50-room chain than for the wall-heavy attack. Nor
  `traceScene`, which `MAX_RANGE` 60 makes span-independent by construction. Consequence to state plainly
  rather than bury: a 50-room chain still costs 14.2 s per edit and a 100-room chain 106.1 s, **unchanged**
  — so the "everyday slowness" half of `ideas.md` §2 was NOT delivered by this work and is rescheduled
  as §2b. Shipping the half you can prove, and naming the half you cannot, beats claiming both.
- **LOS rays from an object's center hit the object's own surfaces** — always filter `s.objectId !== obj.id` (the TV self-occlusion bug made TV/Music modes identical).
- Image-source reflections MUST occlusion-check both legs or they pass through walls.
- `setScene` history push guards against StrictMode double-runs (`h.past.top !== l.scene`).
- Windows/doors occupy no floor space in collision checks; door corridors are hard constraints.
- Vite HMR errors about deleted files (e.g. RoomMenu.tsx) are stale-buffer noise; hard reload clears.
- App-level keyboard shortcuts must gate on `overlayOpen` (dialogs/optimizer/arrange · `compare` · **and S21's tutorial chapter MENU, but deliberately NOT its step CARD**).
- **Listener mirror invariant:** `scene.listener` MUST always equal the active `listeners[]` entry. Never write `scene.listener` directly (that desyncs the tracer from the verdict — the S2 trap); go through the `scene.ts` seat helpers. `sanitizeScene` re-derives the mirror on every load, so on-disk drift self-heals; a live desync would silently show a verdict for one seat while the echogram traces another.
- **Stereo lock lives in ONE metric space (S3):** `eqError`/apex/subtended-angle are 2D **plan** geometry; keep `dA`/`dB` 3D only for ITD + level, and gate `locked` on 3D arrival symmetry (`pathDiff ≤ 0.07 m`). Mixing a 2D `base` with 3D legs in `eqError` made elevated symmetric pairs un-lockable; a naive 2D-only fix then false-locks unequal-height pairs — you need BOTH halves.
- **Image-source reflections must hit a SOLID span (S3):** a bounce point inside a door/window opening reflects off nothing. Check the bounce param against the wall's kept surfaces (`objectId === w.id`), not the raw a→b segment — same openings the forward tracer already respects via `wallKeptSpans`/`collectSurfaces`.
- **`overlayOpen` must cover EVERY overlay that sits over the still-mounted canvas (S4):** `SimCanvas` stays mounted under the full-screen `LayoutGallery`/`ScenarioCompare` and the `wallProposal` card, and its `window` keydown listener stays live. `LayoutGallery` only `stopPropagation`s Escape, so R/Backspace leaked through until `overlayOpen` (ONE shared App const) was extended to include `galleryOpen` + `wallProposal`. Gate the canvas key handler on it via an `overlayOpenRef` (the keydown effect has `[]` deps, so a prop read directly would be stale).
- **A hover chip anchored to `closestPointOnSegment` chases the cursor (S4):** on a screen-vertical wall the closest point's screen-y tracks the cursor, so the chip retreats ahead of it forever. Latch the anchor on **wall identity** (keep the same wall's anchor, switch to a different wall at once, hold briefly off-walls to stay reachable) — a plain screen-radius hold instead captures neighbouring walls and parks over empty space. Also re-check the wall still exists (self-heal on delete) and clear on `onPointerLeave` (no pointermove fires off-canvas).
- **The Browser-pane tab is `document.hidden` → `requestAnimationFrame` is paused (S4):** `SimCanvas.onPointerMove` throttles `applyMove` through rAF, so hover/drag/marquee-band interactions **cannot be driven live** in the preview. Keyboard + pointerdown paths work (Fix 6 was proven that way). Verify rAF-gated UI via unit tests + agent code-trace, and say so. **(S5)** you CAN still drive keyboard shortcuts + button clicks by dispatching `window.dispatchEvent(new KeyboardEvent('keydown', …))` / `el.click()` from `javascript_tool`, then observe the result in **IndexedDB** (after the ~400 ms autosave) — a numeric proof of undo/redo (S5 verified nudge→⌘Z→⇧⌘Z as 2.30→2.55→2.30→2.55 this way). Note React flushes async, so `wait` a tick before reading the DOM/IDB.
- **History coalescing is gesture-scoped, not a timer (S5):** the pre-refactor 400 ms wall-clock window coalesced ALL edits (drags AND rapid discrete taps). The new model coalesces (a) a pointer drag = one undo entry via `beginGroup`/`endGroup` on `onDragging`, and (b) a **held** key (arrow-nudge AND q/e-rotate) via `opts.coalesce = e.repeat`. Consequence (intended, documented): rapid *discrete* non-drag bursts — a fast wall-chain, placing 4 pods quickly, two quick deletes — are now **separate** undo steps (each independently undoable, which is more correct). If you touch keyboard scene-edits, wire `coalesce: e.repeat` for held keys — the self-review caught that rotate had been left without it while nudge had it.
- **The history leak fix must keep `keepId` (S5):** `reap(liveIds, keepId)` drops undo buckets for layouts no longer in the store, but a just-deleted layout can still be un-deleted (the toast Undo), so `deleteLayout` passes `keepId = deletedId`. Dropping the bucket eagerly would silently lose the restored layout's scene-undo stack (an unsanctioned 4th behavior change). `undoDelete`'s dropped-placeholder bucket is left for the next `deleteLayout` to reap (bounded).
- **Decouple history from the `setStore` updater (S5):** the pre-refactor `setScene`/`undo`/`redo` mutated `historyRef` INSIDE the `setStore` updater and relied on StrictMode's dev double-invoke to dedupe (and undo actually *double-popped* in dev). The fix: do all history bookkeeping in the callback body (reading `storeRef.current`) and pass React a **pure** updater. Safe because no handler fires two scene-mutating `setScene` calls in one synchronous tick (verified); if a future batched multi-edit handler is added, revisit (it would read a stale pre-edit snapshot).
- **Theme-keyed colors can hide OUTSIDE `THEMES` (S13):** recoloring `THEMES.plan` cream→cyanotype was NOT enough — `drawRoomLabels` had a hardcoded `st.theme === 'plan' ? royalblue : cyan` zone fill/stroke (`render.ts:939/941`) that would paint a foreign royal-blue box on the new dark plan. When recoloring a theme, **grep `theme === 'plan'`/`'sound'`** for literal colors outside the `THEMES` object (the D2 agent + skeptic both caught this). The other `theme === 'plan'` sites are behavior gates (underlay opacity, ruler/dimension visibility), not colors — leave them.
- **The canvas FONT stack MUST keep the `ui-monospace` fallback (S13):** `labelPill` draws `★` (best-spot), `∠` (angle), `⌀` (diameter) via `ctx.fillText`, and **Geist Mono lacks all three**. Canvas 2D does per-glyph font fallback, so `'Geist Mono', ui-monospace, …` renders digits/letters in Geist Mono and those 3 symbols in the fallback — correct, but only because the fallback is kept. Never reduce the canvas FONT to a single family. Geist Mono is vendored **400/500 only** (no bold), so `FONT_MD` + the former `bold ${FONT}` sites use weight **500** to avoid faux-bold synthesis.
- **The stage-frame vignette can't live on `.stage` alone (S13):** `SimCanvas` mounts unconditionally and `renderScene` opaquely fills the whole bitmap every frame, so the canvas covers 100% of `.stage` — a `background` there is never seen. `--app-backdrop` goes on **`body` + `.stage`**; it's visible during the async-bootstrap **splash** (the wordmark "powers on" over the vignette) and behind any translucent chrome, and composites *below* the opaque canvas child so the render.ts bg is untouched.
- **Font-load repaint is a real FOUT guard, and its error paths must not be silent (S13):** canvas pills size from `ctx.measureText`; on first mount Geist Mono may be a swap-face → pill widths computed from fallback metrics until some later repaint. `font-ready.ts` `repaintOnFontLoad` triggers `document.fonts.load()` then ONE `setRedrawTick`. A per-spec `.catch` keeps a 404'd face from blocking the repaint, and the outer `.catch` is **reachable** (an `onReady` throw lands there) — both now `console.warn`/`console.error` **only on real failure** (silent-failure-hunter caught the original silent swallows + a "this is unreachable" comment that was false). Injectable fontset → node-testable, no-ops when `document.fonts` is absent.
- **Make `theme` a DERIVED value, not state, to guarantee one controller (S14/UX-2):** the split-personality/tool-teleport bugs came from THREE writers of `theme` state (`applyStep`, the `applyTool` `TOOL_OWNER` teleport, the `t` key). The fix is structural, not a new guard: delete the `theme` `useState` and make it `const theme = modeTheme(appMode)`. Now it's impossible to desync — a tool can only touch the mode's SUB-step, and the `t` key toggles the mode. `theme` still threads through the same `CanvasStage → SimCanvas/render` prop path, so every render read-site is byte-identical (verified: zero `render.ts`/`SimCanvas.tsx` diff). Prove it live by dispatching `keydown` and reading the rendered `.stage-plan` class + the mode `radio`'s `aria-checked` — DOM/React state updates even though the canvas rAF is paused in the preview tab.
- **A non-blocking on-canvas HUD still needs the `overlayOpen`/wall-mode gates (S14/UX-2):** `SelectionActions` dispatches the SAME `rotate`/`nudge`/`delete` commands as the keyboard, but via `onClick` → `runKeyCommand` directly, BYPASSING `handleKeydown` (where the `overlayOpen` + `mode!=='wall'` gates live). Left ungated, its `z-index:7` buttons stay tappable ON TOP of the (z-index:auto) canvas-anchored `OptimizeDialog`/`ArrangeDialog`/`wallProposal` cards on phone viewports — a real, reachable mutate-through-a-dialog bug (both self-review agents caught it; the original "deliberate inverse of the S4 lesson" comment was WRONG). Fix: HIDE the HUD when `overlayOpen || mode==='wall'`, mirroring the keyboard gates. The S4 lesson about `SimCanvas`'s OWN keydown listener staying live is a different concern.
- **Disable an affordance for the no-op case, don't let it silently do nothing (S14/UX-2):** `Selection.type==='object'` spans wall/rect/circle, but `rotateSelectedRect` only rotates rects. A "Rotate" button enabled on a wall (the most common DESIGN selection) is a silent no-op — AND, because `setScene` spreads a new (referentially-identical) scene, it pushed a spurious undo entry. Two fixes: (a) the parent computes `canRotate = selection is a rect` from the scene and disables the button; (b) `rotateSelectedRect` returns the SAME `scene` ref when the target isn't a rect, so `historyPush`'s reference-dedup drops the no-op on BOTH the HUD and keyboard `q`/`e` paths.
- **CDP `(pointer:coarse)` emulation needs touch enabled AND the media features (S14/UX-2):** to screenshot the touch surfaces (bottom rail, HUD, hidden mode-hint) via headless-Chrome-over-CDP, `Emulation.setDeviceMetricsOverride{mobile:true}` alone did NOT flip `(hover:none) and (pointer:coarse)`; you must also call `Emulation.setTouchEmulationEnabled{enabled:true}` + `Emulation.setEmulatedMedia{features:[pointer/any-pointer=coarse, hover/any-hover=none]}`, and RE-assert them after navigations. Verify by probing `matchMedia('(pointer: coarse)').matches` + the element's `getComputedStyle().display` before trusting the pixels. (Node 25 has a built-in `WebSocket` + `fetch`, so a zero-dep CDP client drives this when Playwright isn't installed.)
- **THE LOCK ignition must be keyed to the DISPLAYED entity, not just the component (S15/UX-3):** the ignition ref-seed (`initIgnition` reseeds `prevLocked` to the current lock so mount is never an edge) only runs at MOUNT. Switching to a *different* already-locked seat/layout/compare-scenario is a post-mount `locked` false→true on the SAME mounted `VerdictHero`, so it fired the celebration for a lock the user didn't just achieve — the mount-suppression didn't cover it (self-review caught this; it's the exact case my own live test walked into). Fix is structural: `key` the hero to the entity it shows (`key={activeListener(scene).id}` in the sidebar; `key` per scenario in compare) so a discrete jump REMOUNTS (reseeds → no ignite) while a genuine in-place drag-to-lock (same seat = same key, no remount) still fires. Proven live: switch-to-locked → `igniting:false`; nudge-off-apex-then-back (same seat) → `igniting:true, anim:lock-sweep`.
- **`locked` and `quality` are uncorrelated — gate the multi-pair headline on ANY pair locked, not `best.locked` (S15/UX-3):** `stereo.ts` `locked` ignores `apexBlocked` but `quality` is ×0.6 when apex-blocked, so a fully-locked pair can score below a livelier unlocked pair. The old `verdictOf` gated "One pair locks, another doesn't" on `best.locked`, silently dropping the case where the locked pair isn't the highest-quality. `deriveVerdict` gates on `audio.pairs.some(p=>p.locked)` and draws the cause from the lowest-quality UNLOCKED pair — `{locked:allLocked, quality:best.quality}` stay identical to `verdictOf` (compare's summary reads only those, so no regression).
- **`background-clip:text` + transparent fill is invisible in `forced-colors` (S15/UX-3):** Windows High Contrast strips the gradient background and the `-webkit-text-fill-color:transparent`/`color:transparent` leaves nothing — add a `@media (forced-colors: active)` fallback restoring `CanvasText` + `background:none`. And keep the opaque surface on the hero's PARENT, never on the clipped headline (clip:text hides that element's own box background).
- **CDP `Page.captureScreenshot` over Node's built-in WebSocket must be JPEG, not a huge PNG (S15/UX-3):** a 2× DPR 1440-wide PNG base64 is multi-MB and the built-in `WebSocket` receive silently never delivers that message (the command times out while `Runtime.evaluate` works fine). Use `format:'jpeg', quality:90` (and/or DPR 1) — payloads drop to ~400 kB and land. Also: `--headless=new`'s compositor can deadlock `captureScreenshot`; `--headless=old` + `--window-size` at launch (NOT `Emulation.setDeviceMetricsOverride`) is reliable. To drive a genuine in-place lock in CDP (rAF runs there, unlike the paused preview tab): centre the scene bbox on the seat so a canvas-centre `Input.dispatchMouseEvent` selects the YOU puck, then `Input.dispatchKeyEvent` Arrow-nudge off-and-back (reversible integer steps re-lock exactly).
- **The first-run welcome must gate on genuine first run, not flag-absence (S16/UX-4):** the owner is an IDB-first-run migrated user with NO localStorage keys (`phantom-lock:v2`/`v1` both absent), so a "pristine origin" check alone does NOT exclude them — they'd wrongly see a "you're looking at the Maple Court demo with a pair" welcome over their real 0-speaker layout. The only reliable first-run signal is `loadFromIDB()` returning null (no meta row) → `bootstrapPersistence` now returns `firstRun`; the welcome shows on `boot.firstRun && isPristineOrigin(localStorage)`. Proven live: a fresh headless-Chrome profile (fresh origin) shows the welcome + seeded LOCKED verdict; the owner's origin (reloaded) shows neither.
- **The demo seed must live in a LEAF module, never imported back into `scene.ts` (S16/UX-4):** `engine/seed.ts` imports `scene.ts` (for `apartmentScene`/`makeSpeaker`/`loadStore`) and is consumed only by the App boot wiring. Importing `seed.ts` INTO `scene.ts` would create `scene→seed→optimize→scene` AND `scene→seed→stereo→pairspot→scene` cycles (optimize.ts + pairspot.ts both import scene.ts). Using fixed verified coords means `seed.ts` needs neither optimize nor stereo — it imports scene only. The lock is asserted end-to-end in `seed.test.ts` (traceScene→computeAudio→`pairs[0].locked`) so the coords can't silently drift.
- **Never seed synthetic data in the degraded/error boot path (S16/UX-4):** `bootstrapPersistence`'s catch branch fires when IDB is unavailable OR when existing records fail to reconstruct (`loadFromIDB` throws "unreadable"). Seeding an already-locked demo there would hide a user's temporarily-unreadable real data behind a fake layout. Fix: `bootstrapPersistence(loadLegacy, loadFallback = loadLegacy)` — the App passes the seeding `initialStoreForBoot` as `loadLegacy` (happy-path first run only) and the plain non-seeding `loadStore` as `loadFallback` (catch). No data loss either way (localStorage-mode autosave never writes IDB), but the demo now only appears on a confirmed first run.
- **The on-canvas Legend leaks Space/`r` to the canvas unless it swallows its own keys (S16/UX-4):** `canvasKeyAction` (interaction.ts) exempts only INPUT/TEXTAREA/SELECT — NOT BUTTON — so a focused legend toggle `<button>`, on Space, both toggles itself AND arms canvas pan (`armed=!overlayOpen`), and `r` rotates the selection. `SimCanvas` listens on `window` in the BUBBLE phase, so `onKeyDown`/`onKeyUp={e=>e.stopPropagation()}` on the legend root stops the leak without `preventDefault` (Enter/Space still toggle the button). A read-only legend needs no `overlayOpen` gate (it dispatches no commands), unlike `SelectionActions`.
- **`renderScene` is offscreen-safe; `drawMiniPlan` is not (S16/UX-4):** the export-image renderer paints a detached `<canvas>` because `renderScene` reads ONLY its `RenderState` (never `canvas.clientWidth`/CSS/`document`/`devicePixelRatio`) and `THEMES` are literal hex — verified by an adversarial skeptic. `drawMiniPlan` (thumb.ts) sizes from `canvas.clientWidth` (=0 offscreen) and early-returns. An offscreen renderer that does sync work (`sceneBounds`/`getContext`/`renderScene`) BEFORE its `new Promise` must be `async` so a sync throw becomes a rejection the caller's `.catch` (→ error toast) can see — else it escapes as an uncaught exception.
- **`clipboard.writeText` needs transient user activation; a programmatic click doesn't count (S16/UX-4):** in headless CDP an `element.click()` on "Copy verdict" rejects with `NotAllowedError` → the app's graceful "Could not copy" toast fires (proving the error path). A real `Input.dispatchMouseEvent` at the button's rect IS a user gesture → `writeText` succeeds and "Verdict copied" fires. Verify the success path with a synthesized mouse event, not `.click()`. (Also: the layout switcher is `.room-trigger` with a `title`, not an `aria-label` — CDP `querySelector('[aria-label^=…]')` misses it though the a11y tree shows the title as the name.)

- **An inset `box-shadow` is INVISIBLE on a `<canvas>` (S7):** the canvas paints its bitmap as *replaced content* on top of its own background, and `renderScene` fills it opaquely every frame — so `box-shadow: inset` (the obvious way to draw a focus ring inside an `overflow:hidden` wrapper) is completely covered. Proven by pixel-diffing the focused vs blurred edge strip: byte-identical. **Outlines** paint in the overlay phase, above content, so the ring must be `outline` + a NEGATIVE `outline-offset`. The ring also sits over pannable content, where `--accent` alone measures 1.03:1 against the best-spot green — so it needs a second dark ring (on `.sim-canvas-wrap` via `:has()`) to guarantee one contrasting edge. Always pixel-verify a focus indicator on a canvas; `getComputedStyle` reporting the shadow proves only that the CSS applied, not that anything is visible.
- **`?raw`/`?inline` CSS imports are EMPTY under vitest (S7):** `test.css` defaults to false, so vitest stubs CSS modules — `import tokens from '../tokens.css?raw'` yields `""`, silently. A contrast test built on that would have passed every assertion against an empty token map: a green suite proving nothing. Read stylesheets with `readFileSync` (which needs `@types/node` + `"node"` in `tsconfig.compilerOptions.types`, since this repo pins `types: ["vite/client"]`), and give any source-scanning test a guard that fails when the scan finds nothing.
- **`e.target` is not always an Element (S7):** a key event dispatched at `window` — the repo's OWN live-verification technique (S5/S14) — has `e.target === window`, which is truthy, so `t?.closest(...)` does NOT short-circuit and throws `closest is not a function` inside the global keydown listener, killing every shortcut including Escape and undo. Derive with `e.target instanceof Element ? e.target : null`, never with an `as HTMLElement | null` cast plus optional chaining. (The pre-existing `t.tagName` read was accidentally safe because `window.tagName` is merely `undefined`.)
- **A `<header>` inside `role="dialog"` is still a `banner` landmark (S7):** `role=dialog` is not sectioning content, so `<header class="dialog-head">` inside the shared `Dialog` (and the gallery/compare heads) mapped to a SECOND `banner` alongside the real topbar — axe `landmark-no-duplicate-banner`, and a rotor with two "banner" entries. Use a `<div>` for in-dialog heads. Found by the automated axe pass, not by reading the code.
- **A `role="radiogroup"` may only own radios (S7):** the seat list was `<ul role="radiogroup">` whose `<li>`s each held a radio PLUS a rename `<input>` and a remove `<button>`. That orphaned every `<li>` from its list (axe `listitem`) and promised a one-tab-stop composite contract the rows do not implement. Dropping to a plain list of `aria-pressed` toggles means the roving tabindex must go too — under a non-composite role there is no arrow-key contract, so `tabIndex={active ? 0 : -1}` would strand seats 2..N with no announced way to reach them.
- **`<output>` is an implicit `role="status"` live region (S7):** the ten `<output>` value displays next to sliders meant every drag of Rays/Bounces/Absorption/opacity/rotation double-spoke on each step. `aria-live="off"` keeps the semantics and the visual while silencing the unintended announcements.
- **Mode-scope EVERY new canvas key, not just digits (S7):** S14 made tools mode-scoped via `digitTool(digit, mode)`. A letter key is the obvious loophole — `p` placing a speaker while the user is in DESIGN on the cyanotype canvas is the exact cross-mode leak that was structurally removed. Gate new keys on `env.appMode` and prove it live (3× `p` in DESIGN must leave the entity count unchanged).
- **Gate `interactiveTarget` PER KEY, not per ladder (S7):** blocking the whole mutating ladder whenever a `<button>` has focus looks safe but silently kills `t`, the digits and `q`/`e` the moment the user clicks any sidebar or toolbar button — the single most common interaction. Only Arrow and Delete genuinely collide (ListenerCard and SegmentSwitch both drive roving focus with Arrow and neither stops propagation); Escape and ⌘Z must stay global.
- **A widened target exemption must not break "keyup always disarms" (S7):** adding BUTTON/A/SUMMARY to `canvasKeyAction`'s early return would strand canvas panning armed forever if the user holds Space, Tabs to a button and releases there — `window` never blurs and the canvas never had focus, so neither disarm path fires. Handle the Space **keyup** above the exemption, unconditionally.

- **A security cap that fires on real data is a data-loss bug, not a fix (S8):** the obvious hardening for the
  354-byte brick was to clamp coordinates in `sanitizeScene`. Measured consequence: `addRoomShell` appends each
  room to the RIGHT, so 42 legitimate 6 m rooms (or 11 at the UI's 25 m `clampDim` max) exceed any sane clamp —
  75 walls collapse onto a single line, silently, and `usePersistence` writes the mangled scene back ~400 ms
  later. Permanent, unrecoverable. The fix is to **separate the populations**: REJECT untrusted imports before
  committing (the user keeps their file), and never touch data already in the store. When a guard must bound the
  engine anyway, bound the **derived value** (`sceneBounds`'s returned box) rather than the stored data.
- **Span can be infinite while every bound is finite (S8):** a circle at the ORIGIN with `r: 1e308` yields bounds
  of ±1e308 — both `Number.isFinite` — but a span of `Infinity`, one ulp of 2.2e292, and `x += 0.7` that cannot
  move. A circle at (1e308, 1e308) is the *other* case, where `max.x` overflows to `Infinity` while `min.x` stays
  finite (which is why the old one-sided `!Number.isFinite(min.x)` guard let it through). You need BOTH the
  four-component finite check AND a span bound; neither alone is sufficient.
- **Id de-duplication order encodes a trust hierarchy (S8):** `sanitizeScene` dedupes ids in document order, so
  whoever is processed FIRST keeps its id. With objects first, an imported object whose id collided with the
  active seat's forced the *seat* to be re-issued — `activeListenerId` then failed to match and YOU silently fell
  back to `seats[0]`, i.e. the S2 seat/verdict desync arriving through the import path. The same hole unlinked
  stereo pairs when an object stole a speaker id (caught by my own test, not by inspection). Process the entities
  that are REFERENCED BY ID first (seats ← `activeListenerId`, speakers ← `pairs`) and objects last — objects are
  the only ones nothing references (`objectId` in the tracer is derived at runtime).
- **One `try` around a whole store is a data-loss amplifier (S8):** `loadStore` wrapped every layout in a single
  try/catch that fell through to `defaultStore()`, so one hostile record (`speakers:[null]` → TypeError) silently
  replaced EVERY layout the user owned — and autosave then persisted the replacement. Fix both ends: null-guard
  the throw sites, AND sanitize each record in isolation so a future throw is contained to the record that caused
  it. The v1 legacy branch needs the same wrapper or the total-loss path stays armed.
- **`apply:'build'` is mandatory for a CSP in a Vite app, and the failure is misdirecting (S8):** a CSP in the
  SOURCE `index.html` breaks `npm run dev` — `@vitejs/plugin-react` injects an inline react-refresh preamble
  (`script-src`), `/@vite/client` opens an HMR WebSocket (`connect-src`) and pushes CSS via `style.textContent`
  (`style-src`). Three directives, none of them the one you'd suspect. Inject at build time only.
- **`upgrade-insecure-requests` fails invisibly, and localhost cannot catch it (S8):** with it enabled the same
  `dist/` served over plain http on a LAN IP is a total outage — and it does NOT surface as a CSP violation, so a
  violation-counting harness reports success while the app is dead. `127.0.0.1` is potentially-trustworthy so the
  upgrade never fires there. Any "safe over plain http" check must use a LAN IP or hostname (verified working at
  `192.168.1.72`).
- **Prove a CSP with a NEGATIVE CONTROL, or "0 violations" is unfalsifiable (S8):** every CSP run in this session
  injects an inline `<script>` and asserts it is blocked AND raises a violation. Without it, a policy that failed
  to apply at all would look identical to a perfect one. Same discipline as the S7 focus-ring pixel-diff: a policy
  that parses is not a policy that enforces.
- **A CSS `transform` used for POSITIONING is silently clobbered by any `transform` animation (post-S8):** the
  +Door/+Window chip (`.wall-actions`) positioned itself with `transform: translate(-50%, calc(-100% - 10px))`,
  but its `pop-in` keyframe also animates `transform` — and a running animation REPLACES the element's own
  `transform` for its whole duration. So the chip rendered at the raw anchor while popping in, then jumped ~70px
  the instant the animation ended: the "it runs away from the mouse" report. Fix: position with the INDEPENDENT
  `translate` property, which composes with an animated `transform` instead of being overridden. And `getBoundingClientRect`
  reports the *post-animation* rect, so this is invisible to an API-readback check — it only fell out of dumping
  the element's position + opacity + `elementFromPoint` mid-interaction (the TRAP-5 discipline).
- **An on-canvas overlay chip needs BOTH the relocate-guard and a pointerleave carve-out (post-S8):** the same
  chip had two more independent kill switches. (a) The hover scan kept `prev.id === found.id ? prev : found`, so
  crossing within the appear-radius of ANY nearer wall relocated it — deadly on a 15-wall floorplan; fix: test
  the chip's own screen box (`insideRect`, pure/tested) BEFORE the nearest-wall test so a chip you're reaching for
  can't be stolen. (b) The canvas's `onPointerLeave` cleared the hover unconditionally, and the chip overlays the
  canvas, so moving onto "+ Door" fired pointerleave and destroyed it; fix: ignore a leave whose `relatedTarget`
  is inside the chip, and have the chip clear itself on its own leave. Three independent causes, each sufficient
  alone — the lesson is to drive the REAL trajectory end-to-end (place a door, assert count 0→1), not to stop at
  the first fix that makes one probe pass.

- **Door swing is PLAN-SYMBOL ONLY — verified by an adversarial acoustics trace, not assumed (S17):** doors gained
  `swingDeg?`(0–180, default 90) / `hingeEnd?`('start'|'end') / `swingSide?`('in'|'out') on `RectObj`, drawn by
  `canvas/door-swing.ts` (pure hinge/angle math) + `render.ts`, edited in the door-only `InspectorPanel` branch, and
  flipped by `f`/`⇧F` (`flipDoor`, DESIGN-scoped). The engine NEVER reads them: all 12 door read-sites bottom out in
  `{role, doorOpen, w, rectCorners(center,w,h,rotation), absorption, height}` — `doorOpen` stays the SOLE acoustic
  switch, `w` is the clear opening that cuts the wall gap. `door-swing-equivalence.test.ts` proves `traceScene`/
  `computeAudio`/`bestListeningSpot` are byte-identical across swing values (open AND closed) with a `doorOpen`
  negative control; the 6 frozen engine files are byte-unchanged. The ONE intended visible delta for a migrated door:
  its OPEN leaf standardises from the arbitrary `Math.PI/2.6`≈69.23° to 90° (hinge jamb + swing side preserved).
- **`ctx.arc(…, false)` with `startAngle > endAngle` draws the REFLEX arc, not the minor wedge (S17):** the door
  clearance arc naively called `arc(hinge, r, leafAngle, alongAngle, false)`. For `swingSide:'out'` the leaf angle
  exceeds `alongAngle`, so anticlockwise=false swept the `360−swingDeg` reflex arc — a 90°-out door drew a ~270°
  near-circle. Invisible to any test that only checks `getComputedStyle`/DOM (this is raw canvas), and my first
  screenshot CAPTURED it but I under-read it — the code-reviewer caught it. Fix: `doorSwing` returns
  `arcStart=min(leafAngle,alongAngle)`, `arcEnd=max(...)`; since `|leafAngle−alongAngle| = swingRad ≤ π`, min→max is
  always the swing wedge. Guarded by a node test asserting `arcEnd−arcStart == swingDeg` for both directions × several
  angles. Lesson: for a canvas drawing bug, extract the geometry into a pure helper and TEST it — a screenshot alone
  needs careful reading and a code reviewer's eye.
- **A 0°-swing OPEN door was pixel-identical to an unbroken wall (S17):** at `swingDeg:0`+open the leaf drew flush,
  solid, in `T.wall`, exactly filling the gap `wallKeptSpans` had cut — and in the `sound` theme there is no
  dimension pill, ever, so the door vanished. Silent-failure-hunter caught it. Fix: draw JAMB TICKS at both opening
  ends ALWAYS (a door is never mistaken for a wall), and draw the leaf only when it's off the wall — an open door
  shows the swung leaf only if `swingDeg>0` (an open 0° door is a bare ticked passage), a closed door always shows its
  dashed leaf. Lesson: a control that exposes a value (slider min=0) must render every value it allows without
  colliding with another symbol.
- **Door creation is a DESIGN concern — scope every route to it, and the chip's `overlayOpen` gate was a real fix
  (S17):** the new `opening` tool (ToolMode `'opening'`, `DIGIT_TOOL.design['5']`, `subStepForTool→'build'`), the
  `d`/`w` keys, and the hover chip are now all DESIGN-only. The chip's render+scan gate gained `theme==='plan' &&
  !overlayOpen` — not just tidiness: `insertOpening` calls `onScene` directly, bypassing the keyboard `overlayOpen`
  gate, so +Door/+Window could mutate the scene behind an open OptimizeDialog/ArrangeDialog (the S14
  mutate-through-a-dialog class). A door's rotation is wall-locked: the inspector drops the rotation slider, so
  `rotateSelectedRect` + `canRotateSel` now no-op/disable on doors (`q`/`e` + touch HUD) — a "wall-locked" claim must
  be ENFORCED, not just commented, or `q`/`e` silently detaches the door from its wall with no way to see the drift.
- **Headless canvas click-drive: activate tools via the DOM button, not a synthetic digit key (S17):** in the
  fresh-profile CDP harness a synthesised `'5'` keydown did NOT activate the opening tool (the active tool stayed
  Move), and a canvas click then did nothing. Clicking the real `.strip-btn` "Door / window" button worked, and the
  subsequent wall click placed a door (IDB doors 6→7, read back). Also: seed a disposable layout by navigating FIRST
  to a same-origin BLANK HTML page (not the app, not a `.md` served as octet-stream — that DENIES localStorage),
  setting `localStorage['phantom-lock:v2']`, THEN navigating to the app so `loadFromIDB` is empty and
  `initialStoreForBoot` loads it; booting the app first seeds Maple Court into IDB and your localStorage is ignored.

## NEXT UP: read-only 3D view — see docs/3d-view-plan.md

User approved Three.js (or any dep): **bundle size does NOT matter, "cool" matters;
efficiency only matters if the app gets slow.** It must be read-only and touch nothing else.

## Other known gaps (backlog)

**Unscheduled ideas live in `docs/ideas.md`, prioritized.** As of 2026-08-05 there is **no P0 and no P1**. **S39 closed §15b** — a room now keeps the furniture its name promised (`programme` 0.9583 → 0.9986, `two-bed` 0.800 → **1.000**), and filed §15c (the TV lands in the BEDROOM in 13 of 480 designs while the sofa and listener stay in the living room — fixing it costs 2 designs their pair, so it is a real trade with all thirteen seeds recorded) and §15d (a pre-existing `ArrangeDialog` defect: "Rearrange" strips the `optional` flags the previous click set, resurrecting S33's plant message one click later). The head of the queue is now **§4d** (the ⇧F quarter turn, fully specified with S32's measurements), then §15c, §16b, §10b, §10d, §2d, §13e's metric-scale redirect, and the owner-approved read-only 3D view (§5). **S38 closed §18a and §18d**: SimCanvas is 1046 → **789**, under the 800 cap. Every STATEFUL React component is now within it; three files still are not and are deliberately left, being cohesive (§18b): `canvas/render.ts` **1172** — which lives under `components/` but is a pure paint pass, not a component — plus `engine/scene.ts` 1030 and `engine/arrange.ts` 907. The behaviour differential now works and is fast (**~2 min**, was 17 or a hang): the root cause was that the headless page was never FOCUSED, so Chrome threw it into `hidden` and paused rAF, which silently blinded every rAF-throttled probe. The head of the queue is now **§15b** (per-room furniture quotas, P2), then **§4d** (the ⇧F quarter turn, fully specified with S32's measurements), §16b, §10b (the export-all bundle IMPORTER — still write-only, so the backup users are told to make cannot be restored), §10d, §2d, §13e's metric-scale redirect, and the owner-approved read-only 3D view (§5). New P3s from S38: §18e (three harness-script checks fail symmetrically, reachable for the first time now that the grip probe works) and §18f (`move-multi` snaps its delta unconditionally, ignoring the app's Snap setting). Historical context follows. As of 2026-08-04: **S35 closed §17b and §17c** — the header no longer covers the gallery trigger at phone widths (exposed 0 px at 320 → 40 px, SC 2.4.11 + 2.5.8), and the gallery head no longer pushes its own Close button off-screen (SC 1.4.10). §17c was re-diagnosed in the process: it had blamed the toolbar rail, which is fully clipped by its own scroller and contributes nothing. **The head of the queue is now §16, the Word-style resize/rotate handles the owner asked for**, with §15b (per-room furniture quotas, P2) behind it. S33 closed §15. Historical context follows. As of 2026-07-31 there was no P0 —
S28 closed §13d and **S30 closed the whole of §14 (the home-screen residuals 14a–14e)**, so the
owner-facing gallery work is done and its three leftovers are all P3 (`docs/ideas.md` §14f).
**S31 REFUTED §13e** (it is not closable at the `vision/quality.ts` seam — see the banner below)
and **closed creation-time alignment**. The head of the queue is now **§4b**. The
one S25 raised — *§13, detection REFUSES the owner's own floorplan at the default* — was **REFUTED in
S26**: its numbers came from feeding the original 1320×1734 file to `detectWalls`, and the app has two
unconditional lossy stages in front of that (`buildUnderlay` 1600 + JPEG q0.72, then
`detectWallsFromUnderlay` `WORK_MAX` 900). Through the real chain, and confirmed by driving the real UI
with the owner's actual file, the plan is **accepted at all three levels** — Careful 9 walls / 74 % /
structure 0.278 · Balanced 15 / 85 % / 0.500 · Thorough 24 / 92 % / 0.646.

**S27 AND S28 BOTH LANDED, together, in S28.** S27's gradient-weighted threshold was correct and had a
MIRROR regression, which is why it sat unlanded for a session: gradient weighting scales a tone's
weight by ~1/thickness, so on a plan with **light poché walls and thin dark dimension lines** the
linework captures the threshold and every wall is deleted — a 10-wall plan goes from a 50-73 % read to
**REFUSED**, silently, telling the user their image "doesn't have enough clear straight lines". S28
fixed it by keeping BOTH rules as candidates rather than replacing one with the other (§13d, now done).

**§13b (S27's half)** — the verdict was unstable not under *exposure* but under a nonlinear TONE CURVE
(measured: gamma refuses 26 of 41, linear gain across ±0.3 EV refuses 0 of 46, an additive lift 0 of 41),
because flat grey letterbox bars over 11.1 % of the owner's page put two near-tied maxima in Otsu's
criterion. The threshold is chosen on a gradient-weighted histogram: owner **38/138 refusals → 0/138**
over gamma 0.70–1.60 × 3 levels, corpus mean **94.82 % → 95.48 %**, every floor held, all three nulls
still refused, and the real UI re-verified at 9 / 15 / 24 walls (74 / 85 / 92 %).

**§13e was REFUTED IN S31, and the refutation is the deliverable.** The finding stands — a page of
four thin furniture OUTLINES is offered **27/27** at structure up to 1.000 and confidence 1.00,
identically by `main`, S27 and S28 — but the diagnosis ("the gates are too loose, add a fourth
signal") is false. **No function of the detected segments can separate the two populations.** Three
proofs, all re-measured by hand: (1) THE THEOREM — every candidate is a ratio
`(largest component)/(all segments)`, so a ONE-COMPONENT reading scores identically **1.000**
whatever the image depicts, and pushing the boxes together until they touch reaches that for free;
(2) THE INVERSION — a legitimate terrace of three detached dwellings scores 0.333 where a tight
furniture cluster scores 0.522; (3) SIZE CARRIES NOTHING — the required-accept fixture `two-room`
IS two rectangles sharing a wall, and reads identically at 100/60/45/30 % of the page. The naive fix
was built in a throwaway tree and breaks 4/8/11 tests in `detect.test.ts` at floors 0.35/0.45/0.55.
Pinned by `src/engine/__tests__/indistinguishable.test.ts` (7 tests), each saying what to conclude
if it goes red. **The redirect:** the missing information is METRIC SCALE — `Underlay.scale` is
metres-per-pixel and `detectWallsFromUnderlay` already holds it, while `detectWalls` takes raw
pixels and structurally cannot know how big anything is. It needs a calibrated-scale flow first
(`underlay-import.ts` seeds `scale = 8 / wPx`, an explicit guess), so it is **P2**, not P1.

**S32 shipped §4b's plain-`F` half** (the key, the Inspector button, the touch-HUD button, the snap
guide) and DEFERRED ⇧F to **§4d** on a measurement: the quarter-turned class is not representable in
the ambient drag magnet, so 4 of 5 realistic pieces lose the turn on the very next drag. S32 also
recorded the owner's two 2026-08-03 reports with measurements — **§15 generator quality** (26.3 % of
480 designs skip a piece, and **125 of 126 skips are the `armchair`**, the one preset in `scoreSlot`
that RETURNS NULL instead of scoring; plus 9.6 % ship with zero speakers) and **§16 Word-style
resize/rotate handles**. Both are **P1** and owner-facing.

The queue is now **§15/§16** (owner-reported) — then **creation-time
alignment, which S31 BUILT, MEASURED AND REVERTED** (`docs/ideas.md` §4c now carries the full spec
and the numbers — the axis is BISTABLE on the owner's own plan: one 4.6 m wall drawn square flips it
from -12.829° to exactly 0), the export-all bundle IMPORTER, multi-tab folder loss, the last wall-heavy CPU
residual, and an `App.tsx` decomposition (**1290** lines against an 800 cap).

- **(S22 done)** Auto-detect walls rebuilt: **52.1 % → 95.6 %** on the enumerated corpus, and it now REFUSES an
  image with no floorplan rather than emitting 61 confident walls. The proposal is reviewable (per-wall strike-off,
  a confidence readout, three named sensitivity levels). Residuals, honestly: `hatched` 91.6 % and
  `apartment-cluttered` 82.3 % — both losses are PRECISION or coverage, never duplication, so the failure
  direction is "a few extra to delete" or "a couple to draw", never a tangle. Detection has never been run against
  the owner's OWN floorplan photo; the harness for that is `docs/sessions/S22/bench/score-corpus.ts --image <f.png>`.

- Drag-release doesn't split walls crossed mid-drag (only creation does, via `integrateWall`).
- Proper image-source reflection off window glass / closed-door leaves (mirror the rect with its own material, not the host wall's) — S3 keeps them solid but approximates with wall absorption; a bounce landing on a coplanar door/window leaf is still governed by leg occlusion.
- Marquee/lasso band *drag* still not driven live (the Browser-pane tab runs `document.hidden`, so rAF — which throttles `applyMove` — is paused); the selection/deselect logic is unit-tested and 3-agent-traced (S4).
- README.md predates gallery/zones/detection/multi-select — needs a rewrite eventually.
- `{type:'multi'}` selection has no listener slot, so a `{type:'listener'}` base is silently dropped from an additive marquee/⌘-click (pre-existing; unchanged by S4). Add a `listenerId?`/`includeListener` if this ever matters.
- **React hook/component tests are still deferred to S10 — but the blocker is GONE.** ~~needs jsdom + RTL, which the repo doesn't have~~ **(corrected S8):** S7 added `jsdom`, `@testing-library/react`, `@testing-library/dom` and `fake-indexeddb`, so hook tests are writable **today**. They just have to be named `*.test.tsx` — `vite.config.ts` routes by FILENAME, not directory (`src/**/*.test.ts` → node project, `src/**/*.test.tsx` → jsdom project). The S5 pure logic (`history.ts`/`keyboard.ts`/`store.ts`) is ≥96% unit-covered; the hooks (`useSceneHistory`/`useLayoutStore`/`useLayoutActions`/`usePersistence`/`useSimulation`/`useKeyboardShortcuts`) + the 4 JSX components (`AppHeader`/`CanvasStage`/`Sidebar`/`AppDialogs`) are 0% unit-covered — S10 owns "component tests for the extracted hooks (S5)".
- **(S5, LOW/theoretical)** `splitWall`/`addPreset` now compute ids from the render-scope `scene` (not the updater's `s`). Behaviour-identical for the single-call-per-gesture wiring today; if a future caller fires two scene-mutating calls in one synchronous handler, `splitWall` could leave a phantom `{type:'object'}` selection pointing at an un-added id. Harden the guard if that wiring ever appears.
- **(S38 done) SimCanvas is UNDER the cap** — 1447 (pre-S37) → 1042 (S37) → **789**. S38 took out `pick.ts` (the twelve-branch pointerdown ladder, now a pure `resolvePointerDown` + `applyPickAction` — where the S36 grip-vs-pod ORDERING lives, and it now has tests instead of a comment), `chain.ts`, `nextWallHover`/`openingGhost` into `interaction.ts`, and `useFinePointer`. ⚠️ **11 lines of margin.** New logic goes in a `canvas/` module, not the component. The next cut, if one is needed, is `resolvePointerUp` — `docs/ideas.md` §18a.
- **(S4 done)** grab/grabbing cursor on draggable objects; door/window hover chips wired; canvas keys overlay-gated.
- **(S5, then S37)** App.tsx was decomposed to 789 lines in S5, grew back to 1292 by S36, and was split again in **S37** — now **85** (the async-bootstrap wrapper, which must keep `export default function App` because `main.tsx` and `shell.a11y.test.tsx` import it from that path) plus **`AppInner.tsx` at 707**, under the cap. The S5 note that follows is kept for its history; new App-level logic must go into a `hooks/` module (S21 put the tutorial's in `useTutorial.ts` for exactly this reason), and the file needs its own decomposition session; ESLint (`npm run lint`) added + all exhaustive-deps suppressions re-derived (12 → 5 documented survivors); dead `setHistVersion` + both `setTimeout(fn,0)` selection hacks removed; the 3 history bugs (leak / impure updater / 400 ms→gesture coalescing) fixed.
