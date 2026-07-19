import { describe, expect, it } from 'vitest';
import { bestListeningSpot } from '../bestspot';
import { arrangeFurniture } from '../arrange';
import { pointInRect, rectCorners } from '../geometry';
import type { Scene, SpeakerObj, WallObj } from '../types';
import * as v from '../vec';

function box(size: number): WallObj[] {
  const pts = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  return pts.map((a, i) => ({
    id: `w${i}`,
    kind: 'wall' as const,
    a,
    b: pts[(i + 1) % 4],
    absorption: 0.12,
    label: 'Wall',
    height: 2.7,
  }));
}

const spk = (id: string, x: number, y: number): SpeakerObj => ({
  id,
  pos: { x, y },
  z: 1.0,
  label: id.toUpperCase(),
  model: 'homepod',
  trimDb: 0,
});

describe('bestListeningSpot', () => {
  it('returns nothing without speakers', () => {
    const scene: Scene = { objects: box(8), speakers: [], pairs: [], listener: { pos: { x: 4, y: 4 }, z: 1.2 } };
    expect(bestListeningSpot(scene, true).best).toBeNull();
  });

  it('converges near the equilateral apex of a stereo pair', () => {
    const a = spk('a', 3, 2);
    const b = spk('b', 5, 2);
    const scene: Scene = {
      objects: box(8),
      speakers: [a, b],
      pairs: [['a', 'b']],
      listener: { pos: { x: 4, y: 5 }, z: 1.2 },
    };
    const field = bestListeningSpot(scene, false);
    expect(field.best).not.toBeNull();
    // Apex of the equilateral triangle: (4, 2 + √3) ≈ (4, 3.73).
    expect(Math.abs(field.best!.x - 4)).toBeLessThan(0.8);
    expect(Math.abs(field.best!.y - 3.73)).toBeLessThan(0.9);
    expect(field.zone.length).toBeGreaterThan(0);
  });

  it('never proposes a spot a wall hides from every speaker', () => {
    // Divider splits the box; speakers on the left half.
    const divider: WallObj = {
      id: 'div',
      kind: 'wall',
      a: { x: 4, y: 0 },
      b: { x: 4, y: 8 },
      absorption: 0.1,
      label: 'Wall',
      height: 2.7,
    };
    const scene: Scene = {
      objects: [...box(8), divider],
      speakers: [spk('a', 2, 3), spk('b', 2, 5)],
      pairs: [],
      listener: { pos: { x: 2, y: 4 }, z: 1.2 },
    };
    const field = bestListeningSpot(scene, false);
    expect(field.best).not.toBeNull();
    expect(field.best!.x).toBeLessThan(4);
    for (const s of field.zone) {
      expect(s.p.x).toBeLessThan(4);
    }
  });
});

describe('arrangeFurniture', () => {
  const scene: Scene = { objects: box(6), speakers: [], pairs: [], listener: { pos: { x: 3, y: 3 }, z: 1.2 } };

  it('needs walls to anchor to', () => {
    const empty: Scene = { objects: [], speakers: [], pairs: [], listener: { pos: { x: 2, y: 2 }, z: 1.2 } };
    const res = arrangeFurniture(empty, [{ presetId: 'bed', count: 1 }]);
    expect(res.objects).toHaveLength(0);
  });

  it('places furniture inside the room without overlaps', () => {
    const res = arrangeFurniture(scene, [
      { presetId: 'bed', count: 1 },
      { presetId: 'sofa', count: 1 },
      { presetId: 'tv', count: 1 },
      { presetId: 'round-table', count: 1 },
    ]);
    expect(res.objects.length).toBeGreaterThanOrEqual(3);
    // All corners inside the 6×6 box.
    for (const o of res.objects) {
      if (o.kind === 'wall') continue;
      const corners =
        o.kind === 'rect'
          ? rectCorners(o)
          : [
              { x: o.center.x - o.r, y: o.center.y },
              { x: o.center.x + o.r, y: o.center.y },
              { x: o.center.x, y: o.center.y - o.r },
              { x: o.center.x, y: o.center.y + o.r },
            ];
      for (const c of corners) {
        expect(c.x).toBeGreaterThan(-0.01);
        expect(c.x).toBeLessThan(6.01);
        expect(c.y).toBeGreaterThan(-0.01);
        expect(c.y).toBeLessThan(6.01);
      }
    }
    // No rect centre may sit inside another placed rect.
    const rects = res.objects.filter((o) => o.kind === 'rect');
    for (const a of rects) {
      for (const b of rects) {
        if (a.id === b.id) continue;
        expect(pointInRect(a.center, b)).toBe(false);
      }
    }
    // The sofa faces the TV.
    const sofa = res.objects.find((o) => o.label === 'Sofa');
    const tv = res.objects.find((o) => o.kind === 'rect' && o.role === 'tv');
    expect(sofa && tv).toBeTruthy();
    if (sofa?.kind === 'rect' && tv?.kind === 'rect') {
      expect(v.dist(sofa.center, tv.center)).toBeGreaterThan(1.2);
    }
  });
});
