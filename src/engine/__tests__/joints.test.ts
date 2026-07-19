import { describe, expect, it } from 'vitest';
import type { WallObj } from '../types';
import { integrateWall, snapToWalls } from '../joints';

const wall = (ax: number, ay: number, bx: number, by: number, id = `w-${ax}-${ay}-${bx}-${by}`): WallObj => ({
  id,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  absorption: 0.12,
  label: 'Wall',
  height: 2.7,
});

describe('snapToWalls', () => {
  it('prefers endpoints over edges', () => {
    const w = wall(0, 0, 4, 0);
    // 0.2 m from the endpoint AND 0.1 m from the edge — endpoint wins.
    expect(snapToWalls({ x: 0.2, y: 0.1 }, [w])).toEqual({ x: 0, y: 0 });
  });

  it('sticks to the nearest point along a wall for T-joints', () => {
    const w = wall(0, 0, 4, 0);
    const q = snapToWalls({ x: 2, y: 0.12 }, [w]);
    expect(q.x).toBeCloseTo(2);
    expect(q.y).toBeCloseTo(0);
  });

  it('leaves far points alone and respects exclusions', () => {
    const w = wall(0, 0, 4, 0);
    expect(snapToWalls({ x: 2, y: 1 }, [w])).toEqual({ x: 2, y: 1 });
    expect(snapToWalls({ x: 2, y: 0.1 }, [w], new Set([w.id]))).toEqual({ x: 2, y: 0.1 });
  });
});

describe('integrateWall', () => {
  it('splits both walls at a crossing — nothing passes through', () => {
    const existing = wall(0, 0, 4, 0, 'ex');
    const res = integrateWall([existing], wall(2, -1, 2, 1, 'new'));
    const walls = res.objects.filter((o): o is WallObj => o.kind === 'wall');
    // 2 chunks of the old wall + 2 chunks of the new one.
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      const onJunction = (p: { x: number; y: number }) => Math.abs(p.x - 2) < 1e-6 && Math.abs(p.y) < 1e-6;
      expect(onJunction(w.a) || onJunction(w.b) || w.id === 'never').toBe(true);
    }
    expect(res.newIds).toHaveLength(2);
  });

  it('splits only the touched wall on a T-joint', () => {
    const existing = wall(0, 0, 4, 0, 'ex');
    const res = integrateWall([existing], wall(2, 0, 2, 1.5, 'new'));
    const walls = res.objects.filter((o): o is WallObj => o.kind === 'wall');
    expect(walls).toHaveLength(3); // two old chunks + one intact new wall
    expect(res.newIds).toEqual(['new']);
  });

  it('leaves corner-to-corner joins untouched', () => {
    const existing = wall(0, 0, 4, 0, 'ex');
    const res = integrateWall([existing], wall(4, 0, 4, 2, 'new'));
    expect(res.objects.filter((o) => o.kind === 'wall')).toHaveLength(2);
  });
});
