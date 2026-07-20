# Phantom Lock — UI/UX & Layout Overhaul Plan

> A presentation-layer redesign plan, written to be executed across **four sequenced sessions**
> (UX-1…UX-4) under the Standing Operating Protocol in `CLAUDE.md`. Dated 2026-07-19.
> **This is a plan, not code.** It changes CSS tokens, component JSX/structure, layout, the canvas
> renderer's *chrome/overlays*, motion, and information architecture — it does **not** touch
> `src/engine`, persistence, or the scene data model.
>
> Produced from a 6-agent design workflow (4 independent redesign directions + a rubric judge +
> an independent UX/IA-flow audit) reconciled with a live walkthrough of the running app.

---

## 0. The one idea: **"Anechoic Console"**

Turn the whole app into **one acoustically-treated dark room where the glowing canvas is the only
light source**, and make **THE LOCK** — the moment a stereo pair locks the phantom center at your
seat — the emotional and visual climax you'd screenshot.

Everything below serves that: it is an **evolution** of the existing dark studio-console DNA, not a
re-theme. That DNA is *load-bearing*, not decorative — the additive ray-glow (`render.ts`
`globalCompositeOperation='lighter'`) only exists on near-black, so "go dark" isn't a style choice we
could reverse. The redesign deepens and unifies what's already opinionated, then fixes the specific
things that make it read "unfinished" instead of "premium instrument."

**Why this direction** (chosen over 3 alternatives — see §9): it scores highest on product-fit and
feasibility while keeping the "wow." A HomePod owner already lives in Apple's pro-app dark surfaces
(Logic, Final Cut, Apple TV cinema-dark); tuning speaker placement *is* a mastering task (chasing
unity, symmetry, a locked phantom center), so a mastering-suite/anechoic metaphor gives the task the
right mental model — a focused instrument, not a dashboard-by-numbers.

Rejected: an editorial serif/brass identity (off-metaphor, adds a 4th hue, higher risk); a
canvas-first "kill the sidebar" HUD (biggest rewrite, regresses the readout workflow the owner lives
in); a light-default warm companion (fights the load-bearing dark canvas). Their **best ideas were
grafted in** (color-role discipline, the pinned "verdict never scrolls away," the on-canvas legend and
dark-glass overlay recipe, the tap-to-learn jargon layer, the forgiving empty state).

---

## 1. What's wrong now — honest audit

**Visual (from the design panel + `ultrareview.md` §3.8):**
1. **Split-personality theme — the single most visible flaw.** Chrome is dark (`app.css`), but the
   Build/Furnish canvas flips to a **bright cream blueprint** (`render.ts` `THEMES.plan` bg `#f5f3ec`),
   with a whole forked light-overlay branch (`panels.css` `.stage-plan`). The most-used first step
   looks like two apps stitched together and the sound↔plan toggle is a jarring black↔white flash.
2. **Typography has no voice.** `'Avenir Next'` with **no `@font-face`** (`tokens.css`) → every
   Windows/Linux visitor silently drops to system-ui. The scale is compressed to ~2× (`--text-xs`
   11px → `--text-display` only ~23px); nothing carries weight. The canvas hardcodes a generic
   `11px ui-monospace`. There is no display/data pairing.
3. **Pervasive 10–11px dim text** in the lowest tier (`--text-3` at `0.7rem` for eyebrows, meta, dims)
   — a legibility + a11y liability.
4. **The verdict — the product's whole payoff — is buried.** It renders at 16px, **3rd** in the
   sidebar under Speakers + Listener (`Sidebar.tsx`, `panels.css` `.verdict-state`).
5. **The sidebar is a dashboard-by-numbers stack** — uniform-weight cards, uniform `--space-2` gaps,
   3px meters everywhere; no rhythm distinguishing a hero readout from a detail row. (A banned pattern.)
6. **Empty state is the softened banned pattern** — a centered card + headline + 3 stacked CTAs.
7. **Two perpetual header breathing animations** (`capBreathe`, `nodePulse`) — motion with no
   information.

**UX / information-architecture (from the flow audit — grounded in the real components):**
- **[HIGH] Broken first run.** A first-timer lands on **Sound (step 3 of 4)** of a pre-furnished
  apartment they didn't build, with **zero speakers** and an empty Audio card — no orientation, no
  visible payoff.
- **[HIGH] Tools silently teleport across steps AND flip the theme.** `TOOL_OWNER` makes the `2` key
  jump Analyze→Build and flip dark→light; theme has **two conflicting controllers** (steps force it,
  the Toolbar toggle also sets it).
- **[HIGH] Jargon is undefined and hidden in hover `title=` tooltips** (phantom center, ITD, ILD,
  lock, 60° angle, comb notch) — invisible on touch.
- **[HIGH] Two different things are both called "room."** A walled *Room shell* vs a *Zone* (a named
  `RoomLabel` region for optimizer targeting). The optimizer's most powerful targeting is gated behind
  the obscure one.
- **[HIGH] Mobile is desktop-hover + keyboard.** Rotate (Q/E/R), nudge (arrows), delete (Del), theme
  (T) are keyboard-only → unreachable on touch; the floating toolbar **covers the shrunken canvas**;
  the layout switcher gets squeezed out.
- **[MED] The core job is de-emphasized.** "Listening spots" (couch vs bed — the owner's literal
  reason to use this) read as a secondary buried list; Compare (the 2-up couch-vs-bed verdict) is a
  button that *vanishes* when not available instead of teaching how to unlock it.
- **[MED] Stereo pairing** (which unlocks the entire verdict) is only reachable via an Inspector
  dropdown — undiscoverable.
- **[MED] Header actions are inert chrome in Build/Furnish** (TV/Music, Suggest, Compare only mean
  something in Sound/Analyze); the TV/Music toggle is duplicated.
- **[MED] Destructive optimizer.** "Apply N speakers" silently **replaces** hand-placed speakers.
- **[MED] Import is confused** — "import a floorplan photo" (a real intent) is hidden in a Build card,
  while the Gallery's "Import JSON…" is a different thing with a similar name.
- **[LOW] No shareable output** — export is JSON-for-reimport only; a tool whose payoff is a verdict
  can't hand you a picture of it.

---

## 2. The recommended system ("Anechoic Console" — concrete)

### 2.1 Palette (re-derive the ladder **in place** — keep every token name for zero churn)
Warm-graphite black with a faint blue-violet undertone; add **one new rung** for the hero.
```
--surface-0 #070910   deepest / canvas frame        --surface-3 #1e2636  raised (dialogs, toolbar)
--surface-1 #0d1119   chrome (topbar + sidebar)      --surface-4 #28324a  NEW — verdict hero + fader carriage
--surface-2 #141a26   cards
```
Stage frame gets a subtle vignette, not a flat fill:
`radial-gradient(120% 100% at 50% 0%, #0c1120, #060810)`.

**Color-role discipline (the key fix for the "cyan doubles as accent" muddiness):**
- **Channel identity ONLY:** L = cyan `--accent #4fd8ff`, R = amber `#ffa95a` (nudged from `#ffa04f`
  so L and R read as *equal-weight partners*).
- **Acoustic status ONLY:** `--ok #40e08a` / `--warn #f5c04e` / `--bad #ff6b6b`.
- **Chrome / primary emphasis** routes to a **new named `--signal` gradient**
  `linear-gradient(90deg, var(--accent), var(--ok))` — used everywhere "signal approaching lock" is
  shown (quality meters, the fader, the locked verdict fill). One consistent visual language.
- Text tiers widen: `--text #f2f5fc`, `--text-2 #a6b1c8`, `--text-3 #8592ad` **reserved for ≥12px**.
- Nit: rename the mislabelled alpha tokens (`--ok-10` is actually 0.12 → `--ok-12`, etc.).

### 2.2 Typography — retire the macOS-only face for a self-hosted, zero-dep 3-role pairing
All OFL variable faces, subset to woff2, **preload only the 2 critical weights** (perf budget).
- **Display** — **Space Grotesk** (500/700): wordmark, verdict hero, step labels, card titles. Its
  technical, mono-adjacent character *is* the instrument voice.
- **Body/UI** — **Geist Sans** (400/500/600): labels, prose, buttons.
- **Data** — **Geist Mono** (400/500): every `tabular-nums` value, canvas pills, eyebrows, `kbd` —
  one intentional numeric identity (design rule: data-viz as part of the system).
- **Canvas caveat:** `render.ts` can't read CSS vars — hardcode `'Geist Mono'` in its `FONT` strings
  **and gate first paint on `document.fonts.load()`** (via the existing `setRedrawHook`) so numbers
  don't reflow.
- **Fix the compressed scale** — from ~11→23px (2×) to a real **11→44px (4×)** range:
  ```
  --text-xs 11px (mono eyebrows/pills/kbd ONLY)   --text-xl 22px (card group titles)
  --text-sm 13px   --text-base 14px   --text-lg 17px   --text-2xl 30px (gallery/section heads)
  --text-hero clamp(2rem, 1.2rem + 2.6vw, 2.75rem)  = 32→44px, the VERDICT headline
  ```
  Tracking: `-0.01em` on the hero; the wide `0.2em` letter-spacing survives **only** on mono eyebrows.
  Floor prose at ≥13px; 11px is mono-only.

### 2.3 Canvas & theme — unify the room (highest-leverage single change)
- The **sound** canvas stays `#080b12`, physically untouched — the additive glow is preserved.
- **Recolor `THEMES.plan` from cream `#f5f3ec` → a dark cyanotype blueprint** (bg `#0a1220`, grid
  `rgba(79,216,255,.10)`/major `.22`, walls `#8fc7e0`, dimension ink cyan). Blueprints historically
  *are* white/cyan-on-blue, so it still reads unmistakably "technical floor plan" while living in the
  same dark room. The sound↔plan toggle becomes a **gentle hue shift, not a black↔white flash.**
- Because plan is now dark, **collapse the entire `.stage`/`.stage-plan` light-overlay fork**
  (`panels.css`) into **one dark-glass overlay recipe** — deletes the plan-mode grid-label contrast
  bug and a whole duplicate CSS branch.

### 2.4 Motion — event-driven only
Delete both perpetual header loops (`capBreathe`, `nodePulse`). The **only** ambient motion is the
canvas rays. Everything else is `transform`/`opacity`/`clip-path` on state change.

### 2.5 The signature moment — **THE LOCK**
When a pair transitions to `locked`, the readout column's verdict headline **ignites**: `PHANTOM
CENTER LOCKED` in the big Space Grotesk hero, the cyan→green `--signal` gradient **sweeping through
the letterforms**, with a soft green bloom — reusing the existing `verdict-in` keyframe. Respect
`prefers-reduced-motion` (cross-fade instead of sweep). This is the payoff of the entire app; give it
a designed beat.

---

## 3. Information architecture (the UX half)

The current 4 equal steps + free navigation + tool/theme teleporting is the root of most UX friction.
**Recommended IA (confirm §8):**

- **Two modes that each own the canvas theme** — **DESIGN** (Build + Furnish → dark cyanotype plan)
  and **TUNE** (place speakers *and* read the verdict → dark sound). Merging **Sound + Analyze** is
  the important one: the verdict should be visible **while** you position speakers and drag YOU — that
  is the core loop, currently split across two steps. Build vs Furnish stay as sub-steps within DESIGN.
  A tool **never** silently changes the mode or theme; the toolbar shows only the current mode's tools;
  digit shortcuts bind only to tools present in that mode. **Theme has exactly one controller: the mode.**
- **Global header holds only what is truly global:** brand, the layout switcher (always pinned), undo/
  redo, and the DESIGN/TUNE switch. **Move TV/Music, Suggest placement, and Compare into the TUNE
  context** (they're inert in DESIGN today) and de-duplicate the TV/Music toggle.
- **The readout column leads with the verdict** in TUNE: `verdict hero` (headline + plain-English
  cause + quality meter, with the active seat named — "At: Couch") **FIRST**, then Speakers, Seats,
  the selection Inspector, then Echogram. The payoff never sits below the edit controls.
- **Seats are a first-class TUNE primitive** shown adjacent to the verdict, visually bound to the YOU
  puck. **Compare is always present in TUNE**; when nothing is comparable it *teaches* the unlock
  ("add a second listening spot, or duplicate this layout") instead of vanishing.
- **The selection Inspector rises to prominence whenever something is selected** (both modes) — it's
  the "edit what I just clicked" surface, not the bottom of a scroll stack.
- **Rename the colliding "room" concepts:** walled **Room shell** vs a targeting **Zone/Area**; let
  the optimizer target real walled regions (`regionOf` already computes them) so "optimize the bedroom"
  isn't gated behind drawing a hidden zone.
- **Import has two clearly separated homes:** "Import a floorplan **photo**" (a DESIGN entry, also at
  first run) vs "Import a saved **layout** (JSON)" (a gallery/data action). Export gains a shareable
  output.
- **Nothing load-bearing lives only in a hover `title=`.** Every metric/affordance has a visible,
  tappable info/label; touch parity for rotate/nudge/delete lives on the selected object itself.

---

## 4. Component-by-component treatment
- **Top bar:** Space Grotesk wordmark (collapses to a `PL` monogram when width is tight so the
  switcher never disappears); the DESIGN/TUNE switch; layout switcher; undo/redo. Strip the perpetual
  loops from the workflow indicator.
- **Verdict hero (new):** extracted from `MetricsPanel` onto `--surface-4` at `--text-hero`; the
  `causeSentence` gets room to breathe; hosts THE LOCK moment; **reused verbatim in `ScenarioCompare`**
  so both scenarios show the same hero.
- **Metrics:** a **spec-sheet table** treatment (ITD / level / angle / lock) in Geist Mono
  `tabular-nums`, each row's label carrying a `<Term>` info affordance.
- **Speakers card:** a **"Pair these two"** one-click action when exactly two same-model speakers are
  unpaired (unblocks the verdict without hunting the Inspector dropdown).
- **Toolbar:** desktop stays a floating dock but restyled; **mobile un-floats to a bottom rail** (§6).
- **Empty states:** replace the centered-card starter with a mode-aware, editorial empty state; the
  empty TUNE offers "Nothing to analyze yet — suggest 4 HomePod spots?" wired to the existing Suggest.
- **Dialogs/Toasts:** unified dark-glass; every scene-mutating **apply** gets the same undo toast that
  deletes already get (consistency); optimizer apply reads **"Replace with N speakers"** when it will
  overwrite hand-placed ones.
- **Gallery / Compare:** promoted section heads at `--text-2xl`; Compare hero reuse (above).
- **Echogram & meters:** treated as first-class data-viz in the system (Geist Mono axes, `--signal`
  fills), not an afterthought.

---

## 5. Learnability & onboarding
- **`<Term>` tap-to-learn jargon layer** (zero-dep): a dotted-underline term → accessible popover with
  a one-line plain-English definition (phantom center / lock / ITD / sweet spot / comb notch),
  replacing the touch-invisible `title=` tooltips. A short glossary reachable from TUNE.
- **On-canvas legend**, collapsible, keyed to the current mode (L/R ray colors, ★ best-spot, sweet-spot
  ring, triangle, YOU puck, inactive-seat dots, solid-vs-dashed rays) — mirroring the existing Controls
  toggles.
- **Fix the boot:** a dismissible first-run explainer, and **seed the demo apartment with a placed
  stereo pair** so first run lands on a **live locked verdict** — the glowing physics that is the whole
  point is visible before you do anything.

---

## 6. Responsive / mobile (fix the two named breaks)
- At ≤960px, **un-float the toolbar** and dock it to a **bottom, full-width, horizontally-scrollable
  rail** inside the canvas region with **40px touch targets**, so it never covers the shrunken canvas.
- **Pin the layout switcher** in the top bar (monogram the wordmark if tight) so it never disappears.
- **On-selection touch handles** for rotate / delete / nudge on the selected object (promote the
  Inspector's rotation control onto the selection); drop the keyboard-referencing mode-hint on touch.
- Because plan is now dark, there is **no theme-flash** on mobile either.

---

## 7. Accessibility (build it in at creation — coordinate with Session 7)
Every new interactive surface: keyboard-operable, visible focus ring, `prefers-reduced-motion`
honored (THE LOCK degrades to a cross-fade), contrast ≥4.5:1 (the widened `--text-3` + ≥13px floor
help). The `<Term>` popovers, the bottom rail, and on-selection handles all ship with a11y at
creation. Session 7's systematic audit then validates the whole surface.

---

## 8. Decisions — CONFIRMED (owner, 2026-07-19)
1. **Aesthetic: "Anechoic Console"** ✅ (deepened dark mastering-suite) — confirmed by the owner.
   Consistent with the app they already built. UX-1 does not re-litigate this.
2. **IA model: DESIGN / TUNE modes** ✅ — the owner delegated this call ("whichever you believe to be
   best"); the settled decision is the **two-mode** model:
   - **DESIGN** (dark cyanotype plan canvas) keeps **Build** and **Furnish** as sub-steps — they're
     genuinely different tasks (walls vs furniture), so that structure is preserved.
   - **TUNE** (dark sound canvas) **merges the old Sound + Analyze** into one place-and-read loop so the
     verdict is live *while* you position speakers and drag YOU.
   - **The mode owns the canvas theme** (one controller — kills the tool-teleports-and-flips-theme bug);
     tools never change the mode; digit shortcuts bind only to the current mode's tools; TV/Music +
     Suggest + Compare live in TUNE.
   The owner can still redirect at UX-2 kickoff, but UX-1's foundations are compatible with either IA,
   so UX-1 is unblocked regardless.

---

## 9. Alternatives considered (design panel scores, /10)
| Direction | rubric | product-fit | feasibility | a11y | wow | verdict |
|---|---|---|---|---|---|---|
| **A — Anechoic (dark evolution)** | 9 | 9 | 9 | 8 | 8 | **chosen spine** |
| B — Onyx & Brass (editorial monograph) | 9 | 7 | 6 | 7 | 8 | graft color-role discipline + spec-sheet metrics; reject brass/serif |
| C — Sonar Deck (canvas-first glass HUD) | 8 | 7 | 5 | 6 | 9 | graft "verdict never scrolls" + dark-glass overlay + on-canvas legend; reject sidebar-kill |
| D — Golden Hour (warm guided companion) | 7 | 7 | 6 | 8 | 7 | graft `<Term>` jargon + forgiving empty state; reject light default |

---

## 10. Execution — four sequenced sessions
Each runs under the full Standing Operating Protocol (multi-agent workflow, adversarial verification,
full implementation, tests + live proof in **both** now-dark themes + the ≤960px layout, self-review,
gate, handoff). All four are **presentation-layer only** — no engine/persistence/data-model changes.
Because they touch shared CSS/components, run them **in order**.

### UX-1 — Design foundations (tokens · type · theme unification · motion)
The base everything sits on. Deepen the palette ladder + add `--surface-4`; **self-host Space Grotesk /
Geist Sans / Geist Mono** (woff2 subsets, preload 2 weights) + widen the type scale to 11→44px + floor
prose ≥13px + hardcode `Geist Mono` in `render.ts` gated on `document.fonts.load()`; impose color-role
discipline + the `--signal` gradient; **recolor `THEMES.plan` → dark cyanotype and collapse the
`.stage-plan` light fork**; delete `capBreathe`/`nodePulse`; rename the alpha tokens.
*Acceptance:* one coherent dark room in every step; no black↔white flash on the theme toggle; fonts
self-hosted (no macOS dependency) with no canvas-number reflow; perf budget held (preload ≤2 weights);
`npm run lint`/`test`/`build` green; screenshots of all 4 steps in the unified theme.

### UX-2 — Shell & IA (modes · header scope · canvas hero framing · responsive)
Introduce DESIGN/TUNE (or the confirmed IA from §8); theme owned by mode; tools no longer teleport the
step/theme; scope TV/Music + Suggest + Compare to TUNE and de-dup the toggle; **fix the mobile toolbar**
(bottom rail) + pin the switcher + on-selection touch handles + drop keyboard hints on touch.
*Acceptance:* a tool never changes the mode/theme; header shows only context-appropriate actions; on
≤960px the toolbar never overlaps the canvas and the switcher is always reachable; touch rotate/delete/
nudge work; behavior otherwise identical; gate green; before/after mobile screenshots.

### UX-3 — The readout & THE LOCK (verdict hero · compare-first-class · lock moment · data-viz)
Extract the verdict into the pinned `--surface-4` hero at `--text-hero`, name the active seat, reuse it
in `ScenarioCompare`; ship THE LOCK ignition (reduced-motion safe); spec-sheet metrics; Compare always
present + teaches unlock; Echogram/meters as first-class data-viz.
*Acceptance:* the verdict leads the TUNE column and is never scrolled away; THE LOCK fires on the
locked transition and degrades under reduced-motion; Compare is always reachable and self-teaching;
gate green; screenshots of unlocked→LOCKED and the 2-up compare.

### UX-4 — Learnability, empty states & shareable output (micro-UX)
The `<Term>` jargon layer + glossary + on-canvas legend; first-run explainer + seed the demo with a
placed pair; editorial empty states; "Pair these two" in Speakers; "Replace with N speakers" warning +
uniform undo toasts on every apply; rename Room-shell vs Zone/Area + let the optimizer target walled
regions; separate "Import photo" vs "Import JSON"; **"Export plan as image" + "Copy verdict"** shareable
output.
*Acceptance:* no load-bearing meaning hidden in a hover tooltip; a first-timer is oriented and sees a
live verdict; every apply is reversible with a toast; a plan image + verdict sentence can be shared;
gate green; a first-run walkthrough screenshot sequence.

---

## 11. Relationship to the existing roadmap
- **Session 7 (a11y):** overlaps UX-2/UX-3 (touch parity, focus, reduced-motion). Coordinate — the
  overhaul builds a11y in *at creation*; S7 remains the systematic audit + contrast test + aria-live
  mirror. Prefer running S7 **after** UX-2/UX-3 so it audits the redesigned surface.
- **Session 8 (design polish + onboarding + hardening + README):** its **design + onboarding items are
  absorbed/expanded** by UX-1…UX-4. What remains of S8 is **security hardening (CSP + headers + import
  size cap) + the README rewrite** — and the README should wait until the overhaul lands so its
  screenshots match the shipped UI.
- **Session 12 (auto-detect walls)** and **Session 9 (3D view)** are independent of this overhaul.
- **Suggested order:** UX-1 → UX-2 → UX-3 → UX-4 → S7 (a11y audit) → S8-remainder (hardening + README).
