# Phantom Lock — Acoustic Room Planner

A browser-based room planner with a real 2D acoustic ray-tracing engine, built
to find the optimal **HomePod placement** in any layout. Ships with the
Maple Court apartment (~52 m²) digitized from the floorplan; create as many
layouts as you want from scratch.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests (vitest)
npm run build    # type-check + production build
```

## Layouts

- Multiple named layouts, each with its own scene + simulation settings —
  switch, rename, duplicate, delete from the header bar. Everything autosaves.
- `New` starts a blank grid: draw walls (`2`), boxes (`3`), circles (`4`),
  place speakers (`5`). `+ Maple Court` adds a fresh copy of the apartment.
- Export/Import layouts as JSON (import adds a layout, never overwrites).

## Listening spots & scenario compare

- A scene holds **multiple named listening positions** ("Couch", "Bed", …) in
  the **Listening spots** card. Switch the active seat (the "YOU" puck and the
  live verdict follow it), rename or remove seats, and drag each into place.
  Inactive seats stay visible on the canvas as faint labelled markers.
- **Compare** (header, or the Listening spots card) opens a **2-up view**: two
  seats — or two whole layouts — side by side, each with its own verdict, so the
  rolling-TV **couch-vs-bed** decision is made in one glance instead of two tabs.
- Old single-listener layouts and exported JSON upgrade automatically to the
  named-seat model on load; the single-listener export shape still imports.

## The physics engine (2.5D: heights matter)

- Every object has a **height**: bed 0.55 m, desk 0.75 m, couch 0.8 m,
  wardrobe 2.4 m, walls 2.7 m… all editable. Speakers have a shelf height and
  the listener has an ear height (sitting 1.2 / standing 1.7 / lying 0.8).
- Each speaker emits **360–1440 rays** over 360°, reflecting off anything
  taller than the ray's height (angle in = angle out, energy × (1 − absorption)
  per bounce, nearest-hit so nothing is tunnelled through).
- Sound **passes over low furniture**, losing a little energy when it grazes
  within 0.5 m of a top edge — so lying on the bed doesn't "block" your own
  ears; the mattress just grazes the path.
- Line-of-sight checks walk the true 3D line between speaker height and ear
  height. Reflections arriving at your head are plotted on the echogram
  (direct sound ▲ + reflection bars per speaker), with occlusion-checked
  capture so you never "hear" rays through a wall.

## Speakers & stereo pairs

- Layouts start with **zero speakers**; add them from the Speakers panel or
  tool `5` — choosing the model: **HomePod** (0 dB ref, happy 1.0–3.5 m,
  bass to ~40 Hz) or **HomePod mini** (−6 dB, happy 0.7–2.2 m, ~90 Hz).
  Model scales the ray energy, the level math, and the optimizer's distances.
- Each speaker has a **volume trim** (dB); "Match volumes" turns
  louder/nearer speakers down so everything lands at your seat equally —
  the metrics show that trim fixes level balance but can never fix the
  arrival-time offset (ITD).
- Link any two **same-model** speakers as a stereo pair (Apple won't pair a
  HomePod with a mini — the app enforces and explains this). Each pair gets
  full phantom-center analysis and its own **PHANTOM CENTER LOCKED** state.
- "Anchor image to TV" toggle: on = cinema semantics (the phantom center must
  sit on the TV); off = music semantics (the image anchors on you).

## ✨ Suggest placement

Pick a mode, your speaker inventory (n× HomePod + n× mini), and stereo on/off:

- **🎬 TV** — front pair on the listener→TV axis, equilateral with your seat;
  rear speakers mirrored behind you.
- **🎵 Music** — ignores the TV: the pair orients toward your most open side,
  independent speakers spread evenly **around** you for envelopment.

It searches the actual floorplan (line of sight at real heights, wall
clearance for boundary boost, model-appropriate distances), auto-computes
volume trims so every speaker reaches your seat at the same level, and shows
green ghosts — Apply, then fine-tune by dragging.

## Building rooms (blueprint view)

Drawing tools flip the canvas into a light **graph-paper plan view** (toggle
manually with `T`). Walls draw like a floor planner: click corner by corner,
segments snap to 45° angles and the 5 cm grid, lengths label live, click the
first corner to close the room, double-click or `Esc` to finish. "New room"
starts from a W×D rectangle prompt.

## Controls

| | |
|---|---|
| `1`–`5` | select · wall · box · circle · speaker |
| `Q`/`E` | rotate selected box (TV included) |
| arrows | nudge selection (⇧ = 25 cm) |
| `Del` | delete selection · `⌘Z` undo delete |
| scroll / pinch | zoom · right-drag / space-drag = pan |

Click anything to edit its size, angle, height, and material (absorption
presets from glass to acoustic panel) in the inspector.
