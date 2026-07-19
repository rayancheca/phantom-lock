# Read-only 3D view — implementation plan

Goal: a **fifth view** (toggle next to Blueprint/Sound view in the toolstrip) that renders the
current scene in 3D for *looking*, never editing. Polycam-vibe: orbit, zoom, admire. Zero effect
on the 2D editor, engine, or persistence. User verdict: use Three.js, bundle size irrelevant,
make it **cool**; only constraint is it must not make the app feel slow.

## Approach

1. `npm i three @types/three` (react-three-fiber optional — plain three keeps it simpler and
   the scene is rebuilt-on-change, not per-frame reactive).
2. New `src/components/three/ThreeView.tsx` (+ lazy `React.lazy`/dynamic `import('three')` so
   the 2D app's initial load stays untouched — dynamic import also satisfies the perf rule).
3. App state: `view3d: boolean`; toolstrip button "3D" toggles. When on, render `<ThreeView
   scene={scene} audio={audio} trace={trace} bestSpot={bestSpot} theme … />` in `.stage`
   INSTEAD of SimCanvas (keep sidebar live — metrics still update if user later edits in 2D).
   Esc or the button exits. Read-only: NO pointer handlers except OrbitControls.

## Scene construction (rebuild on `scene` change, dispose old)

- **Floor**: big plane, near-black (#0d1320) w/ subtle grid (GridHelper, low opacity).
- **Walls**: for each WallObj — BoxGeometry(length, height, 0.1) positioned/rotated from a→b,
  color like THEMES.sound.wall, slight emissive; doors: use `wallKeptSpans(wall, objects,
  ['door'])` to build wall chunks with real gaps; windows: second pass — translucent blue glass
  panes (opacity 0.25) in the window rect at its height.
- **Furniture**: RectObj → box (w × height × h) at center, rotated; CircleObj → cylinder.
  Material: dark slate, rounded not needed. TV: thin emissive cyan-tinted panel.
- **Speakers**: HomePod ≈ capsule/cylinder r=0.07 h=0.17 at (pos, z); mini ≈ sphere r=0.05.
  Color from `speakerColors(scene)` rgb strings. Add a soft PointLight per speaker (their
  channel color, low intensity) — this is the "cool".
- **Listener**: small glowing sphere at (listener.pos, listener.z) + subtle ring.
- **Room labels**: `scene.rooms` → THREE.Sprite text (canvas-generated) floating at 2.2 m.
- **Rays (the money shot)**: `trace.bySpeaker[].trace.paths` → THREE.Line segments with
  additive blending, per-speaker color, opacity ∝ path energy; cap total segments (~4–6k)
  for perf. Alternatively LineSegments with vertex colors in one geometry (fast).
- **Best spot**: green translucent cylinder column of light at `bestSpot.best`.

## Rendering

- WebGLRenderer antialias, `setPixelRatio(min(devicePixelRatio, 2))`, ACESFilmic tone mapping.
- Ambient 0.3 + one directional; fog near-black for depth.
- OrbitControls (from three/examples/jsm) — damped, maxPolarAngle ~85°, initial camera at
  ~(roomW, roomDiag*0.9, roomD) looking at bounds center.
- Render loop ONLY while visible; `renderer.setAnimationLoop(null)` + full dispose on unmount.
- Resize via ResizeObserver on the container.

## Contracts / cautions

- Y-up in three vs y-down floorplan: map world (x, y) → three (x, z) with z = y; heights → y.
- Rebuild-not-mutate: on `scene` change dispose geometries/materials (`.dispose()`) to avoid
  GPU leaks; a `buildScene(scene): THREE.Group` pure-ish helper keeps it testable-ish.
- Don't import three statically in App.tsx — lazy component only (initial bundle unchanged).
- Toolstrip button follows existing ToolButton pattern (`ICONS` path map in Toolbar.tsx).
- Theme: 3D always uses the dark "sound" palette (it's a showpiece); plan theme N/A.
- Keyboard: while 3D open, gate the 2D shortcuts (reuse `overlayOpen`-style early return or
  simply `if (view3d) return` in App's onKey except Escape/T).
- Tests: keep three out of vitest (jsdom lacks WebGL) — no unit tests for ThreeView; verify in
  browser, keep `npm run build` green (three is the first real dependency; expect +~150 kB gz).
