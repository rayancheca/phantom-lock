import { describe, expect, it } from 'vitest';
import {
  MOVE_KINDS,
  applyDragToScene,
  commitDraw,
  previewForDraw,
  type Drag,
} from '../drag-apply';
import type { CircleObj, RectObj, Scene, SceneObject, WallObj } from '../../../engine/types';
import { ROOM_HEIGHT } from '../../../engine/scene';

/**
 * The six scene-writing drag branches, extracted from SimCanvas in S37.
 *
 * Until this split none of them could be exercised by any committed test:
 * jsdom dispatches a plain `Event` for pointer events, so `button`, `pointerId`
 * and `clientX` all arrive `undefined` and SimCanvas's pointer path is
 * structurally unreachable there (TRAP 21). The behaviour was only ever checked
 * by driving real Chrome over CDP.
 *
 * Fixtures are deliberately OFF-AXIS wherever rotation is involved — the S36
 * lesson. At rotation 0 an object's local basis degenerates to the world basis,
 * and a transform that ignores rotation entirely passes every assertion.
 */

const OFF_AXIS = -0.2239; // the owner's own plan, ~-12.83 deg

const rect = (over: Partial<RectObj> = {}): RectObj => ({
  id: 'r1',
  kind: 'rect',
  center: { x: 4, y: 3 },
  w: 2,
  h: 1,
  rotation: OFF_AXIS,
  absorption: 0.3,
  label: 'Sofa',
  role: 'furniture',
  height: 0.9,
  ...over,
});

const wall = (over: Partial<WallObj> = {}): WallObj => ({
  id: 'w1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 10, y: 0 },
  absorption: 0.12,
  label: 'Wall',
  height: ROOM_HEIGHT,
  ...over,
});

function sceneOf(objects: SceneObject[], speakers: Scene['speakers'] = []): Scene {
  return {
    objects,
    speakers,
    pairs: [],
    listener: { pos: { x: 1, y: 1 }, z: 1.2 },
    listeners: [{ id: 'seat1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 }],
    activeListenerId: 'seat1',
    rooms: [],
  } as unknown as Scene;
}

const OPTS = { snapOn: false, shiftKey: false, altKey: false, lastRot: null };
const objIn = (s: Scene, id: string) => s.objects.find((o) => o.id === id)!;

// --- the kinds that write nothing -----------------------------------------

describe('applyDragToScene — the three kinds that write no scene', () => {
  it.each([
    ['pan', { kind: 'pan', pointerId: 1, sx: 0, sy: 0, ox: 0, oy: 0 } as Drag],
    ['band', { kind: 'band', pointerId: 1, shape: 'marquee', additive: false } as Drag],
    ['draw', { kind: 'draw', pointerId: 1, tool: 'rect', anchor: { x: 0, y: 0 } } as Drag],
  ])('%s returns null', (_k, drag) => {
    expect(applyDragToScene(sceneOf([rect()]), drag, { x: 1, y: 1 }, OPTS)).toBeNull();
  });

  it('MOVE_KINDS excludes `handle` — a grip keeps the directional cursor it earned', () => {
    expect(MOVE_KINDS.has('handle')).toBe(false);
    expect(MOVE_KINDS.has('move-rc')).toBe(true);
    // pan and band are view/screen gestures, never a reposition.
    expect(MOVE_KINDS.has('pan')).toBe(false);
    expect(MOVE_KINDS.has('band')).toBe(false);
  });
});

// --- move-multi ------------------------------------------------------------

describe('applyDragToScene — move-multi', () => {
  // ⚠️ Every origin here is deliberately OFF the 0.05 snap grid. With on-grid
  // origins, snapping the delta and snapping each piece give the IDENTICAL
  // answer — measured: at x = 4 / 0 / 2 both move by exactly 0.35 — so the
  // obvious fixture is arithmetically incapable of expressing the bug it is
  // named after. Off-grid, per-piece snapping moves them by 0.37 / 0.39 / 0.38
  // and the group visibly deforms. (The S32 "on-grid corpus cannot see an
  // off-grid bug" lesson, one dimension over.)
  const drag = (): Drag => ({
    kind: 'move-multi',
    pointerId: 1,
    start: { x: 0, y: 0 },
    objects: [
      { id: 'r1', center: { x: 4.03, y: 3 } },
      { id: 'w1', a: { x: 0.01, y: 0 }, b: { x: 10.01, y: 0 } },
    ],
    speakers: [{ id: 's1', pos: { x: 2.02, y: 2 } }],
  });

  it('snaps the DELTA, not each piece — the group keeps its internal layout', () => {
    const scene = sceneOf(
      [rect({ center: { x: 4.03, y: 3 } }), wall({ a: { x: 0.01, y: 0 }, b: { x: 10.01, y: 0 } })],
      [{ id: 's1', pos: { x: 2.02, y: 2 }, z: 1, label: 'L', model: 'homepod', trimDb: 0 }] as Scene['speakers'],
    );
    const res = applyDragToScene(scene, drag(), { x: 0.37, y: 0 }, OPTS)!;
    const r = objIn(res.scene, 'r1') as RectObj;
    const w = objIn(res.scene, 'w1') as WallObj;
    expect(r.center.x - 4.03).toBeCloseTo(0.35, 9);
    expect(w.a.x - 0.01).toBeCloseTo(0.35, 9);
    expect(res.scene.speakers[0].pos.x - 2.02).toBeCloseTo(0.35, 9);
  });

  it('leaves non-members untouched by identity', () => {
    const other = rect({ id: 'r2', center: { x: 20, y: 20 } });
    const scene = sceneOf([rect(), other]);
    const res = applyDragToScene(scene, drag(), { x: 1, y: 1 }, OPTS)!;
    expect(objIn(res.scene, 'r2')).toBe(other);
  });

  it('moves every member from its OWN pointerdown origin, so repeated frames are idempotent', () => {
    const scene = sceneOf([rect(), wall()]);
    const once = applyDragToScene(scene, drag(), { x: 1, y: 1 }, OPTS)!.scene;
    // Re-applying the SAME frame to the ALREADY-MOVED scene must land in the
    // same place — that is what "pure function of the gesture" means, and it is
    // what stops a slow drag travelling further than a quick one.
    const twice = applyDragToScene(once, drag(), { x: 1, y: 1 }, OPTS)!.scene;
    expect((objIn(twice, 'r1') as RectObj).center).toEqual((objIn(once, 'r1') as RectObj).center);
  });
});

// --- node ------------------------------------------------------------------

describe('applyDragToScene — node', () => {
  it('drags the ACTIVE seat through updateActiveListener, keeping the mirror in sync', () => {
    const scene = sceneOf([]);
    const res = applyDragToScene(
      scene,
      { kind: 'node', pointerId: 1, node: 'listener' },
      { x: 5, y: 6 },
      OPTS,
    )!;
    expect(res.scene.listener.pos).toEqual({ x: 5, y: 6 });
    // The mirror invariant: scene.listener must equal the active listeners[] entry.
    const active = res.scene.listeners?.find((l) => l.id === res.scene.activeListenerId);
    expect(active?.pos).toEqual({ x: 5, y: 6 });
  });

  it('z-snaps a speaker onto furniture it is dropped on', () => {
    const table = rect({ id: 't1', center: { x: 5, y: 5 }, w: 2, h: 2, rotation: 0, height: 0.75 });
    const scene = sceneOf([table], [
      { id: 's1', pos: { x: 0, y: 0 }, z: 1.0, label: 'L', model: 'homepod', trimDb: 0 },
    ] as Scene['speakers']);
    const res = applyDragToScene(
      scene,
      { kind: 'node', pointerId: 1, node: { speakerId: 's1' } },
      { x: 5, y: 5 },
      OPTS,
    )!;
    expect(res.scene.speakers[0].z).toBeCloseTo(0.87, 9); // 0.75 surface + 0.12
  });

  it('leaves z alone over bare floor', () => {
    const scene = sceneOf([], [
      { id: 's1', pos: { x: 0, y: 0 }, z: 1.0, label: 'L', model: 'homepod', trimDb: 0 },
    ] as Scene['speakers']);
    const res = applyDragToScene(
      scene,
      { kind: 'node', pointerId: 1, node: { speakerId: 's1' } },
      { x: 30, y: 30 },
      OPTS,
    )!;
    expect(res.scene.speakers[0].z).toBe(1.0);
  });
});

// --- wall-end --------------------------------------------------------------

describe('applyDragToScene — wall-end', () => {
  it('sticks the dragged end to a NEARBY other wall', () => {
    const scene = sceneOf([wall(), wall({ id: 'w2', a: { x: 10, y: 0 }, b: { x: 10, y: 8 } })]);
    const res = applyDragToScene(
      scene,
      { kind: 'wall-end', pointerId: 1, id: 'w1', end: 'b' },
      { x: 9.97, y: 0.02 },
      OPTS,
    )!;
    const w = objIn(res.scene, 'w1') as WallObj;
    expect(w.b).toEqual({ x: 10, y: 0 });
  });

  it('never snaps a wall to ITSELF — the excluded id is the one being dragged', () => {
    // Dragging `a` toward `b` of the same wall must not weld it to its own end.
    const scene = sceneOf([wall()]);
    const res = applyDragToScene(
      scene,
      { kind: 'wall-end', pointerId: 1, id: 'w1', end: 'a' },
      { x: 9.98, y: 0.01 },
      OPTS,
    )!;
    const w = objIn(res.scene, 'w1') as WallObj;
    expect(w.a).toEqual({ x: 9.98, y: 0.01 });
  });

  it('moves only the named end', () => {
    const scene = sceneOf([wall()]);
    const res = applyDragToScene(
      scene,
      { kind: 'wall-end', pointerId: 1, id: 'w1', end: 'b' },
      { x: 3, y: 4 },
      OPTS,
    )!;
    const w = objIn(res.scene, 'w1') as WallObj;
    expect(w.a).toEqual({ x: 0, y: 0 });
    expect(w.b).toEqual({ x: 3, y: 4 });
  });
});

// --- move-wall -------------------------------------------------------------

describe('applyDragToScene — move-wall', () => {
  it('translates BOTH ends by the same delta', () => {
    const scene = sceneOf([wall()]);
    const res = applyDragToScene(
      scene,
      { kind: 'move-wall', pointerId: 1, id: 'w1', start: { x: 0, y: 0 }, a0: { x: 0, y: 0 }, b0: { x: 10, y: 0 } },
      { x: 2, y: 3 },
      OPTS,
    )!;
    const w = objIn(res.scene, 'w1') as WallObj;
    expect(w.a).toEqual({ x: 2, y: 3 });
    expect(w.b).toEqual({ x: 12, y: 3 });
  });

  it('is idempotent — every frame recomputes from a0/b0, never from the live wall', () => {
    const scene = sceneOf([wall()]);
    const d: Drag = { kind: 'move-wall', pointerId: 1, id: 'w1', start: { x: 0, y: 0 }, a0: { x: 0, y: 0 }, b0: { x: 10, y: 0 } };
    let s = scene;
    for (let i = 0; i < 20; i++) s = applyDragToScene(s, d, { x: 2, y: 3 }, OPTS)!.scene;
    const w = objIn(s, 'w1') as WallObj;
    expect(w.a).toEqual({ x: 2, y: 3 });
  });
});

// --- move-rc: the rot0 re-base --------------------------------------------

describe('applyDragToScene — move-rc re-bases on an EXTERNAL rotation (the S23 trap)', () => {
  const d = (rot0: number): Drag => ({
    kind: 'move-rc',
    pointerId: 1,
    id: 'r1',
    start: { x: 0, y: 0 },
    c0: { x: 4, y: 3 },
    rot0,
  });

  it('reports back the rotation it wrote, so the next frame can recognise its own output', () => {
    const scene = sceneOf([rect()]);
    const res = applyDragToScene(scene, d(OFF_AXIS), { x: 0.5, y: 0 }, OPTS)!;
    const r = objIn(res.scene, 'r1') as RectObj;
    expect(res.lastRot).toBe(r.rotation);
  });

  it('KEEPS rot0 when the live rotation is its own previous output', () => {
    // lastRot === the object's live rotation => nobody else wrote it => the
    // gesture's baseline must survive untouched.
    const scene = sceneOf([rect({ rotation: 1.1 })]);
    const res = applyDragToScene(scene, d(OFF_AXIS), { x: 0.5, y: 0 }, { ...OPTS, lastRot: 1.1 });
    expect(res!.rot0).toBe(OFF_AXIS);
  });

  it('RE-BASES rot0 when someone else wrote the rotation mid-gesture', () => {
    // This is the regression: `q`/`e` need only an object selection, which
    // pointerdown has just set, so a rotate can land mid-drag. Without the
    // re-base the next pointermove silently reverts it.
    const scene = sceneOf([rect({ rotation: 1.1 })]);
    const res = applyDragToScene(scene, d(OFF_AXIS), { x: 0.5, y: 0 }, { ...OPTS, lastRot: 0.4 });
    expect(res!.rot0).toBe(1.1);
  });

  it('treats a FIRST frame (lastRot null) as external, so the object keeps its rotation', () => {
    const scene = sceneOf([rect({ rotation: 1.1 })]);
    const res = applyDragToScene(scene, d(OFF_AXIS), { x: 0.5, y: 0 }, { ...OPTS, lastRot: null });
    expect(res!.rot0).toBe(1.1);
  });

  it('uses Object.is, so a -0/+0 rotation is not mistaken for an external edit', () => {
    const scene = sceneOf([rect({ rotation: 0 })]);
    const res = applyDragToScene(scene, d(0.5), { x: 0.5, y: 0 }, { ...OPTS, lastRot: -0 });
    // Object.is(0, -0) is false, so this MUST re-base — the strict-equality
    // version would not, and the two disagree on exactly this input.
    expect(res!.rot0).toBe(0);
  });

  it('Shift suppresses the seat magnet and reports no guide', () => {
    const scene = sceneOf([wall(), rect({ center: { x: 5, y: 0.6 }, rotation: 0 })]);
    const free = applyDragToScene(scene, d(0), { x: 1, y: 0 }, { ...OPTS, shiftKey: true })!;
    expect(free.guide).toBeNull();
  });

  it('a circle has no rotation field and still round-trips', () => {
    const circle: CircleObj = {
      id: 'c1',
      kind: 'circle',
      center: { x: 4, y: 3 },
      r: 0.4,
      absorption: 0.3,
      label: 'Plant',
      height: 0.75,
    };
    const scene = sceneOf([circle]);
    const res = applyDragToScene(
      scene,
      { kind: 'move-rc', pointerId: 1, id: 'c1', start: { x: 0, y: 0 }, c0: { x: 4, y: 3 }, rot0: 0 },
      { x: 1, y: 1 },
      OPTS,
    )!;
    expect(res.lastRot).toBeNull();
    expect((objIn(res.scene, 'c1') as CircleObj).center).toEqual({ x: 5, y: 4 });
  });
});

// --- handle ----------------------------------------------------------------

describe('applyDragToScene — handle', () => {
  it('transforms from obj0, so 30 identical frames give one result — on the ROTATE grip', () => {
    // The grip MUST be 'rot'. An edge grip is idempotent either way: 'e' pins
    // the west edge and moves the east one to the pointer, and the west edge of
    // the already-resized object is in the same place — so a version that reads
    // the LIVE object instead of obj0 returns the identical answer and the test
    // passes while the bug is present (verified as a negative control). A
    // rotation COMPOUNDS: each frame would add the same swept angle again.
    const r0 = rect({ rotation: OFF_AXIS });
    const scene = sceneOf([r0]);
    const drag: Drag = {
      kind: 'handle',
      pointerId: 1,
      id: 'r1',
      handle: 'rot',
      obj0: r0,
      grabAngle: 0, // grabbed due east of the centre
    };
    // Pointer swung to due north of the centre — a quarter turn from grabAngle.
    const pointer = { x: 4, y: 5 };
    let s = scene;
    for (let i = 0; i < 30; i++) s = applyDragToScene(s, drag, pointer, OPTS)!.scene;
    const once = applyDragToScene(scene, drag, pointer, OPTS)!.scene;
    expect((objIn(s, 'r1') as RectObj).rotation).toBeCloseTo(
      (objIn(once, 'r1') as RectObj).rotation,
      12,
    );
    // …and it really did turn, so the assertion is not comparing two no-ops.
    expect((objIn(once, 'r1') as RectObj).rotation).not.toBeCloseTo(OFF_AXIS, 6);
  });

  it('returns a null guide — a resize never re-seats against a wall', () => {
    const r0 = rect();
    const res = applyDragToScene(
      sceneOf([wall(), r0]),
      { kind: 'handle', pointerId: 1, id: 'r1', handle: 'e', obj0: r0, grabAngle: 0 },
      { x: 6.5, y: 3 },
      OPTS,
    )!;
    expect(res.guide).toBeNull();
  });
});

// --- the draw path ---------------------------------------------------------

describe('previewForDraw', () => {
  it('centres a rect between the anchor and the pointer', () => {
    const p = previewForDraw(
      { kind: 'draw', pointerId: 1, tool: 'rect', anchor: { x: 1, y: 1 } },
      { x: 5, y: 4 },
      false,
    );
    expect(p.kind).toBe('rect');
    expect((p as RectObj).center).toEqual({ x: 3, y: 2.5 });
    expect((p as RectObj).w).toBe(4);
    expect((p as RectObj).h).toBe(3);
  });

  it('labels a room draw "Area" and a plain rect "Object"', () => {
    const area = previewForDraw({ kind: 'draw', pointerId: 1, tool: 'room', anchor: { x: 0, y: 0 } }, { x: 2, y: 2 }, false);
    const obj = previewForDraw({ kind: 'draw', pointerId: 1, tool: 'rect', anchor: { x: 0, y: 0 } }, { x: 2, y: 2 }, false);
    expect(area.label).toBe('Area');
    expect(obj.label).toBe('Object');
  });

  it('draws a circle from the CENTRE, so the anchor is the centre and the radius is the distance', () => {
    const p = previewForDraw(
      { kind: 'draw', pointerId: 1, tool: 'circle', anchor: { x: 2, y: 2 } },
      { x: 5, y: 6 },
      false,
    );
    expect((p as CircleObj).center).toEqual({ x: 2, y: 2 });
    expect((p as CircleObj).r).toBeCloseTo(5, 9);
  });

  it('always carries the reserved id "preview", so it can never be committed by accident', () => {
    const p = previewForDraw({ kind: 'draw', pointerId: 1, tool: 'rect', anchor: { x: 0, y: 0 } }, { x: 1, y: 1 }, false);
    expect(p.id).toBe('preview');
  });

  it('snaps the far corner when snap is on, and not when it is off', () => {
    const on = previewForDraw({ kind: 'draw', pointerId: 1, tool: 'rect', anchor: { x: 0, y: 0 } }, { x: 1.03, y: 0.98 }, true);
    const off = previewForDraw({ kind: 'draw', pointerId: 1, tool: 'rect', anchor: { x: 0, y: 0 } }, { x: 1.03, y: 0.98 }, false);
    expect((on as RectObj).w).toBeCloseTo(1.05, 9);
    expect((off as RectObj).w).toBeCloseTo(1.03, 9);
  });
});

describe('commitDraw — the size floors', () => {
  const mint = (prefix: string) => `${prefix}-new`;
  const preview = (over: Partial<RectObj>): SceneObject => ({ ...rect({ rotation: 0 }), id: 'preview', ...over });

  it('mints a fresh id — never keeps "preview"', () => {
    const c = commitDraw(preview({ w: 1, h: 1 }), mint);
    expect(c?.id).toBe('rect-new');
  });

  it.each([
    [0.15, 0.15, true],
    [0.149, 0.2, false],
    [0.2, 0.149, false],
  ])('a %s x %s rect commits: %s', (w, h, ok) => {
    expect(commitDraw(preview({ w, h }), mint) !== null).toBe(ok);
  });

  it.each([
    [0.1, true],
    [0.099, false],
  ])('a circle of radius %s commits: %s', (r, ok) => {
    const c: CircleObj = { id: 'preview', kind: 'circle', center: { x: 0, y: 0 }, r, absorption: 0.3, label: 'Object', height: 0.75 };
    expect(commitDraw(c, mint) !== null).toBe(ok);
  });

  it('THE REASON the opening tool places on pointer-DOWN: a door is below the floor', () => {
    // A door is h 0.1. Routing it through the draw path would silently reject
    // every one, which is why `mode === 'opening'` commits on the click instead.
    expect(commitDraw(preview({ w: 0.9, h: 0.1 }), mint)).toBeNull();
  });
});
