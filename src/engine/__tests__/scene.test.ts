import { describe, expect, it } from 'vitest';
import { apartmentScene, loadStore, sanitizeScene, splitWallAt } from '../scene';

function mockStorage(data: Record<string, string>): Pick<Storage, 'getItem'> {
  return { getItem: (k: string) => data[k] ?? null };
}

describe('loadStore', () => {
  it('returns the apartment as the default layout with no speakers', () => {
    const store = loadStore(mockStorage({}));
    expect(store.layouts).toHaveLength(1);
    expect(store.layouts[0].name).toBe('Maple Court');
    expect(store.layouts[0].scene.speakers).toHaveLength(0);
    expect(store.activeId).toBe(store.layouts[0].id);
  });

  it('migrates a v1 save into a layout alongside the apartment', () => {
    const v1 = JSON.stringify({
      scene: {
        objects: [
          { id: 'w1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, absorption: 0.1, label: 'Wall' },
        ],
        speakers: { L: { x: 1, y: 1 }, R: { x: 3, y: 1 } },
        listener: { x: 2, y: 3 },
      },
      settings: { rayCount: 480, maxBounces: 4, decay: 0.2, showL: true, showR: true, showTriangle: true, snap: true },
    });
    const store = loadStore(mockStorage({ 'phantom-lock:v1': v1 }));
    expect(store.layouts).toHaveLength(2);
    const migrated = store.layouts[1];
    // v1 {L,R} speakers become a linked stereo pair.
    expect(migrated.scene.speakers).toHaveLength(2);
    expect(migrated.scene.pairs).toHaveLength(1);
    expect(migrated.scene.listener.pos).toEqual({ x: 2, y: 3 });
    expect(migrated.scene.listener.z).toBeCloseTo(1.2);
    // Objects without heights get sensible defaults.
    expect(migrated.scene.objects[0]).toMatchObject({ kind: 'wall', height: 2.7 });
    expect(migrated.settings.rayCount).toBe(480);
  });

  it('falls back to defaults on corrupt storage', () => {
    const store = loadStore(mockStorage({ 'phantom-lock:v2': '{not json' }));
    expect(store.layouts).toHaveLength(1);
  });
});

describe('sanitizeScene', () => {
  it('deduplicates colliding object ids', () => {
    const scene = sanitizeScene({
      objects: [
        { id: 'dup', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, absorption: 0.1, label: 'A', height: 2.7 },
        { id: 'dup', kind: 'wall', a: { x: 0, y: 1 }, b: { x: 1, y: 1 }, absorption: 0.1, label: 'B', height: 2.7 },
      ],
      speakers: [],
      pairs: [],
      listener: { pos: { x: 0.5, y: 0.5 }, z: 1.2 },
    });
    expect(scene).not.toBeNull();
    const ids = scene!.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('drops pairs that reference missing or double-booked speakers', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [
        { id: 'a', pos: { x: 0, y: 0 }, z: 1, label: 'A' },
        { id: 'b', pos: { x: 1, y: 0 }, z: 1, label: 'B' },
        { id: 'c', pos: { x: 2, y: 0 }, z: 1, label: 'C' },
      ],
      pairs: [
        ['a', 'b'],
        ['b', 'c'], // b already paired
        ['c', 'ghost'], // missing speaker
      ],
      listener: { pos: { x: 1, y: 2 }, z: 1.2 },
    });
    expect(scene!.pairs).toEqual([['a', 'b']]);
  });

  it('clamps speaker and listener heights into sane ranges', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [{ id: 'a', pos: { x: 0, y: 0 }, z: 99, label: 'A' }],
      pairs: [],
      listener: { pos: { x: 1, y: 1 }, z: -3 },
    });
    expect(scene!.speakers[0].z).toBeLessThanOrEqual(6);
    expect(scene!.listener.z).toBeGreaterThan(0);
  });
});

describe('splitWallAt', () => {
  it('breaks a wall into two joined halves at the projected point', () => {
    const wall = {
      id: 'w',
      kind: 'wall' as const,
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.7,
    };
    const [first, second] = splitWallAt(wall, { x: 1, y: 0.3 });
    expect(first.a).toEqual({ x: 0, y: 0 });
    expect(first.b).toEqual({ x: 1, y: 0 }); // projected onto the wall
    expect(second.a).toEqual({ x: 1, y: 0 });
    expect(second.b).toEqual({ x: 4, y: 0 });
    expect(first.id).not.toBe(second.id);
    expect(first.height).toBe(2.7);

    const [m1, m2] = splitWallAt(wall);
    expect(m1.b).toEqual({ x: 2, y: 0 }); // midpoint by default
    expect(m2.a).toEqual({ x: 2, y: 0 });
  });

  it('never emits a near-zero-length half when the cut lands on an endpoint (S3)', () => {
    const wall = {
      id: 'w',
      kind: 'wall' as const,
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.7,
    };
    // A crossing that resolves ~1 mm from the end used to leave a ~0 m wall.
    const [first, second] = splitWallAt(wall, { x: 3.999, y: 0 });
    const lenOf = (w: { a: { x: number; y: number }; b: { x: number; y: number } }) =>
      Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    expect(lenOf(first)).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(lenOf(second)).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(first.b).toEqual(second.a); // still contiguous
  });
});

describe('apartmentScene', () => {
  it('gives every object a height', () => {
    const scene = apartmentScene();
    for (const o of scene.objects) {
      expect(o.height).toBeGreaterThan(0);
    }
    const bed = scene.objects.find((o) => o.label === 'Bed');
    expect(bed?.height).toBeCloseTo(0.55);
    const tv = scene.objects.find((o) => o.kind === 'rect' && o.role === 'tv');
    expect(tv?.height).toBeCloseTo(1.5);
  });
});
