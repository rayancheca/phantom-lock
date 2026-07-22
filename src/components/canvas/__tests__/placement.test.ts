import { describe, expect, it } from 'vitest';
import type { Scene, SceneObject } from '../../../engine/types';
import {
  SNAP_STEP,
  keyboardPlacementPoint,
  openingOnWall,
  placeSpeakerAt,
  snapPoint,
  surfaceHeightAt,
} from '../placement';

const rect = (
  id: string,
  cx: number,
  cy: number,
  height: number,
  role: 'furniture' | 'tv' | 'window' | 'door' = 'furniture',
): SceneObject => ({
  id,
  kind: 'rect',
  center: { x: cx, y: cy },
  w: 2,
  h: 2,
  rotation: 0,
  absorption: 0.2,
  label: 'Desk',
  role,
  height,
});

const circle = (id: string, cx: number, cy: number, height: number): SceneObject => ({
  id, kind: 'circle', center: { x: cx, y: cy }, r: 1, absorption: 0.3, label: 'Table', height,
});

const wallObj = (id: string, ax = 0, ay = 0, bx = 4, by = 0): SceneObject => ({
  id, kind: 'wall', a: { x: ax, y: ay }, b: { x: bx, y: by }, absorption: 0.12, label: 'Wall', height: 2.7,
});

const scene = (over: Partial<Scene> = {}): Scene => ({
  objects: [],
  speakers: [],
  pairs: [],
  listener: { pos: { x: 3, y: 3 }, z: 1.2 },
  listeners: [{ id: 'seat-1', name: 'Couch', pos: { x: 3, y: 3 }, z: 1.2 }],
  activeListenerId: 'seat-1',
  ...over,
});

describe('snapPoint', () => {
  it('rounds to the 5 cm grid when snapping is on', () =>
    expect(snapPoint({ x: 1.234, y: 2.678 }, true)).toEqual({ x: 1.25, y: 2.7 }));
  it('is identity when snapping is off', () =>
    expect(snapPoint({ x: 1.234, y: 2.678 }, false)).toEqual({ x: 1.234, y: 2.678 }));
  it('handles negative coordinates symmetrically', () =>
    expect(snapPoint({ x: -1.234, y: -2.678 }, true)).toEqual({ x: -1.25, y: -2.7 }));
  it('exports the same 5 cm step the pointer path uses', () => expect(SNAP_STEP).toBe(0.05));
});

describe('surfaceHeightAt (behaviour ported verbatim from SimCanvas)', () => {
  it('returns null over bare floor', () =>
    expect(surfaceHeightAt(scene({ objects: [rect('r', 0, 0, 0.75)] }), { x: 9, y: 9 })).toBeNull());
  it('returns the height of furniture underfoot', () =>
    expect(surfaceHeightAt(scene({ objects: [rect('r', 0, 0, 0.75)] }), { x: 0, y: 0 })).toBe(0.75));
  it('picks the TALLEST overlapping standing surface', () =>
    expect(
      surfaceHeightAt(scene({ objects: [rect('a', 0, 0, 0.75), rect('b', 0, 0, 0.9)] }), { x: 0, y: 0 }),
    ).toBe(0.9));
  it('ignores walls entirely', () =>
    expect(surfaceHeightAt(scene({ objects: [wallObj('w', -2, 0, 2, 0)] }), { x: 0, y: 0 })).toBeNull());
  it('ignores doors', () =>
    expect(surfaceHeightAt(scene({ objects: [rect('d', 0, 0, 0.75, 'door')] }), { x: 0, y: 0 })).toBeNull());
  it('ignores windows', () =>
    expect(surfaceHeightAt(scene({ objects: [rect('n', 0, 0, 0.75, 'window')] }), { x: 0, y: 0 })).toBeNull());
  it('ignores surfaces above 1.6 m — nobody perches a pod on a wardrobe', () =>
    expect(surfaceHeightAt(scene({ objects: [rect('r', 0, 0, 2.4)] }), { x: 0, y: 0 })).toBeNull());
  it('uses the circle radius for round objects', () => {
    const s = scene({ objects: [circle('c', 0, 0, 0.75)] });
    expect(surfaceHeightAt(s, { x: 0.5, y: 0 })).toBe(0.75);
    expect(surfaceHeightAt(s, { x: 1.5, y: 0 })).toBeNull();
  });
  it('respects rect rotation via pointInRect', () => {
    const r = { ...(rect('r', 0, 0, 0.75) as Extract<SceneObject, { kind: 'rect' }>), w: 4, h: 0.5 };
    const s = scene({ objects: [r] });
    expect(surfaceHeightAt(s, { x: 1.5, y: 0 })).toBe(0.75); // along the long axis
    expect(surfaceHeightAt(s, { x: 0, y: 1.5 })).toBeNull(); // across the short axis
  });
});

describe('keyboardPlacementPoint', () => {
  it('places the first pod at a stereo-plausible distance from the active seat', () => {
    const s = scene();
    const p = keyboardPlacementPoint(s);
    expect(Math.hypot(p.x - 3, p.y - 3)).toBeCloseTo(1.5, 6);
  });

  it('places the FIRST TWO pods mirrored about the seat axis, so a pair can lock', () => {
    // The whole point of `p` is that two presses give a usable stereo pair. A
    // naive "step 60 degrees per pod" ring puts pod 1 dead ahead and pod 2 off to
    // one side — an asymmetric layout stereo.ts can never lock.
    const s0 = scene();
    const a = keyboardPlacementPoint(s0);
    const s1 = placeSpeakerAt(s0, a, 'homepod', true).scene;
    const b = keyboardPlacementPoint(s1);
    const seat = { x: 3, y: 3 };
    // Equidistant from the seat...
    expect(Math.hypot(a.x - seat.x, a.y - seat.y)).toBeCloseTo(
      Math.hypot(b.x - seat.x, b.y - seat.y), 6);
    // ...and mirrored in x about the seat, both in front (-y).
    expect(a.x - seat.x).toBeCloseTo(-(b.x - seat.x), 6);
    expect(a.y - seat.y).toBeCloseTo(b.y - seat.y, 6);
    expect(a.y).toBeLessThan(seat.y);
  });

  it('subtends about 60 degrees at the seat for the first pair', () => {
    const s0 = scene();
    const a = keyboardPlacementPoint(s0);
    const b = keyboardPlacementPoint(placeSpeakerAt(s0, a, 'homepod', true).scene);
    const seat = { x: 3, y: 3 };
    const ang = (p: { x: number; y: number }) => Math.atan2(p.y - seat.y, p.x - seat.x);
    const deg = Math.abs(((ang(a) - ang(b)) * 180) / Math.PI);
    expect(deg).toBeGreaterThan(55);
    expect(deg).toBeLessThan(65);
  });

  it('never places two pods on the same point, even past six', () => {
    // A 60-degrees-per-pod ring collides on the 7th press. Verify 12 distinct.
    let s = scene();
    const pts: string[] = [];
    for (let i = 0; i < 12; i++) {
      const p = keyboardPlacementPoint(s);
      pts.push(`${p.x.toFixed(4)},${p.y.toFixed(4)}`);
      s = placeSpeakerAt(s, p, 'homepod', false).scene;
    }
    expect(new Set(pts).size).toBe(12);
  });

  it('anchors on the ACTIVE seat, not the first seat', () => {
    const s = scene({
      listener: { pos: { x: 8, y: 8 }, z: 1.2 },
      listeners: [
        { id: 'seat-1', name: 'Couch', pos: { x: 3, y: 3 }, z: 1.2 },
        { id: 'seat-2', name: 'Bed', pos: { x: 8, y: 8 }, z: 1.2 },
      ],
      activeListenerId: 'seat-2',
    });
    const p = keyboardPlacementPoint(s);
    expect(Math.hypot(p.x - 8, p.y - 8)).toBeCloseTo(1.5, 6);
  });
});

describe('placeSpeakerAt', () => {
  it('appends exactly one speaker and returns its id', () => {
    const s = scene();
    const { scene: next, speakerId } = placeSpeakerAt(s, { x: 1, y: 1 }, 'homepod', false);
    expect(next.speakers).toHaveLength(1);
    expect(next.speakers[0].id).toBe(speakerId);
  });

  it('does not mutate the input scene', () => {
    const s = scene();
    placeSpeakerAt(s, { x: 1, y: 1 }, 'homepod', false);
    expect(s.speakers).toHaveLength(0);
  });

  it('snaps the position when snapping is on', () => {
    const { scene: next } = placeSpeakerAt(scene(), { x: 1.234, y: 1.234 }, 'homepod', true);
    expect(next.speakers[0].pos).toEqual({ x: 1.25, y: 1.25 });
  });

  it('stands the speaker ON furniture (+12 cm, rounded to the cm)', () => {
    const s = scene({ objects: [rect('r', 1, 1, 0.75)] });
    const { scene: next } = placeSpeakerAt(s, { x: 1, y: 1 }, 'homepod', false);
    expect(next.speakers[0].z).toBe(0.87);
  });

  it('leaves z at the model default over bare floor', () => {
    const onFloor = placeSpeakerAt(scene(), { x: 9, y: 9 }, 'homepod', false).scene.speakers[0];
    const onDesk = placeSpeakerAt(
      scene({ objects: [rect('r', 9, 9, 0.75)] }), { x: 9, y: 9 }, 'homepod', false,
    ).scene.speakers[0];
    expect(onFloor.z).not.toBe(onDesk.z);
  });

  it('honours the requested model', () =>
    expect(placeSpeakerAt(scene(), { x: 1, y: 1 }, 'homepod-mini', false).scene.speakers[0].model)
      .toBe('homepod-mini'));
});

describe('openingOnWall', () => {
  it('returns null for a missing id', () =>
    expect(openingOnWall(scene({ objects: [wallObj('w')] }), 'nope', 'door')).toBeNull());

  it('returns null when the target is not a wall', () =>
    expect(openingOnWall(scene({ objects: [rect('r', 0, 0, 0.75)] }), 'r', 'door')).toBeNull());

  it('places the opening at the wall midpoint', () => {
    const res = openingOnWall(scene({ objects: [wallObj('w', 0, 0, 4, 0)] }), 'w', 'door')!;
    const added = res.scene.objects.find((o) => o.id === res.objectId)!;
    expect(added.kind).toBe('rect');
    if (added.kind === 'rect') {
      expect(added.center.x).toBeCloseTo(2, 6);
      expect(added.center.y).toBeCloseTo(0, 6);
      expect(added.role).toBe('door');
    }
  });

  it('creates a window when asked', () => {
    const res = openingOnWall(scene({ objects: [wallObj('w')] }), 'w', 'window')!;
    const added = res.scene.objects.find((o) => o.id === res.objectId)!;
    if (added.kind === 'rect') expect(added.role).toBe('window');
  });

  it('does not mutate the input scene', () => {
    const s = scene({ objects: [wallObj('w')] });
    openingOnWall(s, 'w', 'door');
    expect(s.objects).toHaveLength(1);
  });
});
