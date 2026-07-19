# Phantom Lock — Acoustic Room Planner

**Find the objectively best place to put your speakers — and the best place to sit —
with a real 2.5D acoustic ray-tracing engine that runs entirely in your browser.**

Most "speaker placement" advice is folklore. Phantom Lock instead *simulates* the room:
it casts hundreds of sound rays per speaker, bounces them off walls and furniture at their
real heights, checks true 3D line-of-sight to your ears, and turns the result into one
plain-English verdict — **is the stereo phantom center locked, and if not, why not?** It
ships with a bundled sample apartment (~52 m²) so you can start immediately, and you can
draw any number of your own layouts from a floorplan photo or from scratch.

Zero runtime dependencies beyond React. The physics is a hand-written TypeScript engine
(~85% of the codebase), covered by **140 unit tests**.

---

## What makes it non-trivial

- **It's 2.5D, not 2D.** Every object has a height — a bed grazes sound, a wardrobe blocks
  it, a wall stops it. Rays and line-of-sight walk the true 3D line between speaker height
  and ear height, so lying on the bed doesn't shadow your own ears but a tall shelf does.
- **Real stereo imaging.** For any same-model pair it computes the inter-channel time
  difference (ITD), level balance (ILD), subtended angle, comb-filter notch (`f = c/2Δ`),
  and the exact ±30° equilateral "sweet spot" — then relocates that spot when a wall makes
  the geometric ideal physically unreachable.
- **Image-source reflections that respect the room.** First-order wall bounces are found by
  the image-source method, occlusion-checked on *both* legs, and — as of the latest pass —
  refused when they'd pass through an open doorway instead of reflecting off solid wall.
- **It answers a real question:** *where do my speakers go so both the couch and the bed
  sound right?* Multiple named listening positions + a 2-up scenario compare make that a
  one-glance decision instead of a spreadsheet.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests (vitest) — 140, all green
npm run build    # type-check (tsc --noEmit) + production build
```

No API keys, no backend, no environment setup. Layouts persist locally in IndexedDB; a
one-click "Export all" writes a portable JSON backup of every layout.

---

## Architecture

```
src/
├── engine/                 pure TypeScript, fully unit-tested — no DOM, no React
│   ├── raytrace.ts         ray casting, 3D line-of-sight, graze attenuation, door gaps
│   ├── stereo.ts           pair metrics (ITD/ILD/angle), phantom-center lock verdict
│   ├── pairspot.ts         per-pair wall-aware sweet-spot search + image-source bounces
│   ├── bestspot.ts         the green-★ "best place to sit" field for all speakers
│   ├── optimize.ts         "Suggest placement" (listener / room / whole-house targets)
│   ├── rooms.ts            flood-fill room regions (walkable vs sound zones)
│   ├── arrange.ts          rule-based furniture arranger (light, quiet, feng shui…)
│   ├── detect.ts           floorplan photo → walls (Otsu → Hough → merge)
│   ├── scene.ts            presets, sanitize/migrate, multi-listener model
│   └── db.ts               hand-rolled IndexedDB persistence (images as Blobs)
└── components/             React 19 + Vite UI (canvas renderer, panels, dialogs, gallery)
```

**Data flow:** the canvas / panels mutate an immutable `Scene`; `traceScene` produces ray
arrivals; `computeAudio` turns those into the verdict; the renderer draws the ray field and
overlays. The engine never imports React, so every acoustic claim is unit-testable in
isolation — which is why the physics has real tests and the "advice" is trustworthy.

---

## Technical deep-dive

**The hardest decision was the metric space for the stereo lock.** A phantom center is
"locked" when the listener forms an equilateral triangle with the pair (equal distance →
zero ITD, ±30° → correct width) *and* the TV (in cinema mode) sits on that axis. The trap:
the sweet-spot geometry is a **2D floor-plan** construction, but arrival time and level are
genuinely **3D** (speaker height matters). Early versions mixed the two — measuring the
triangle with 3D leg lengths but a 2D base — so a pair mounted symmetrically at head height
could *never* lock, even when it was acoustically perfect. The fix computes the triangle in
one consistent 2D space, keeps 3D only for ITD/level, **and** adds a separate 3D
arrival-symmetry gate so a pair that's plan-symmetric but at mismatched heights (equal floor
distance, unequal path) is honestly reported as *not* locked. A false "locked" is worse than
an honest "almost there," and both the lock flag and the quality meter now agree.

**Reflections were the other subtle one.** The image-source method mirrors a speaker across a
wall and charges the folded path — but a naïve implementation happily "reflects" off the
empty air inside a doorway. The engine now requires the bounce point to land on solid wall
(the same door/window openings the forward ray tracer already carves out), while keeping
closed doors and windows as real reflectors. The alternative — mirroring every furniture
rect — was rejected as far more expensive for a first-order model.

Other decisions worth a look: the listener is stored as a `listeners[]` array with the
legacy single `scene.listener` kept as a **derived mirror**, so ~13 engine read-sites and
every old saved layout keep working unchanged; and persistence migrates the original
`localStorage` blob into IndexedDB non-destructively (the old key is kept as a frozen
rollback).

---

## Using it

**Build** → draw walls corner-by-corner (snaps to 45° and a 5 cm grid), or drop a floorplan
photo and let auto-detection trace the walls, then calibrate scale with two clicks.

**Furnish** → place furniture by hand, or hit *Arrange for me* and let the rule engine reason
about circulation, daylight, quiet, first-reflection absorption, and feng shui.

**Sound** → add HomePods / HomePod minis, link same-model pairs, then *Suggest placement*
(🎬 cinema anchors the image on the TV; 🎵 music wraps the pair around you). Apply the green
ghosts and drag to fine-tune.

**Analyze** → read the verdict: **PHANTOM CENTER LOCKED**, the timing/level/angle breakdown,
the glowing ray field, and the green ★ best-seat. Define a "Couch" and a "Bed" listening
spot, move the rolling TV, and open **Compare** to see both verdicts side by side.

### Controls

| | |
|---|---|
| `1`–`5` | select · wall · box · circle · speaker |
| `Q`/`E` | rotate selected box (TV included) |
| arrows | nudge selection (⇧ = 25 cm) |
| `Del` | delete selection · `⌘Z` undo |
| scroll / pinch | zoom · right-drag / space-drag = pan |
| `T` | toggle sound (dark) / plan (blueprint) view |

Everything autosaves. Export/Import layouts as JSON (import adds, never overwrites).

---

## Screenshots

> 🚧 **Placeholders — coming soon.** The UI is under active development, so live screenshots
> are intentionally deferred until the surface settles (rather than shipping shots that go
> stale every session). The captured walkthrough will follow the golden path end-to-end:

1. **Boot** — the bundled *Maple Court* apartment loads in the dark "sound" view.
2. **Build** — drawing walls in the light blueprint view (live length labels).
3. **Furnish** — *Arrange for me* placing furniture with its stated reasoning.
4. **Suggest placement** — the optimizer dialog + green-ghost speaker preview.
5. **Analyze** — the glowing ray field, verdict panel, and green-★ best seat.
6. **Compare** — couch vs bed verdicts side by side for the rolling-TV decision.

<!-- docs/screenshots/01-boot.png … 06-compare.png -->

---

## Development

- `npm test` — vitest engine suite (140 tests). The engine is the source of truth; add a
  failing test first for every new acoustic behavior.
- `npm run build` — `tsc --noEmit` + a production Vite build.
- The project follows a session-based roadmap (`docs/master-plan.md`) with an
  adversarial-review operating protocol (`CLAUDE.md`); `docs/ultrareview.md` is a full audit.

Built with React 19 + Vite + TypeScript. No runtime dependencies beyond React.
