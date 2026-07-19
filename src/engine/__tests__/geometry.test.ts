import { describe, expect, it } from 'vitest';
import { pointInRect, rayCircle, raySegment, rectCorners } from '../geometry';
import { norm, reflect } from '../vec';
import type { RectObj } from '../types';

describe('raySegment', () => {
  it('hits a perpendicular wall at the expected point with an opposing normal', () => {
    // Arrange
    const o = { x: 0, y: 0 };
    const d = { x: 1, y: 0 };

    // Act
    const hit = raySegment(o, d, { x: 2, y: -1 }, { x: 2, y: 1 });

    // Assert
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(2);
    expect(hit!.point.x).toBeCloseTo(2);
    expect(hit!.point.y).toBeCloseTo(0);
    expect(hit!.normal.x).toBeCloseTo(-1);
    expect(hit!.normal.y).toBeCloseTo(0);
  });

  it('returns null when the segment is behind the ray', () => {
    expect(raySegment({ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 })).toBeNull();
  });

  it('returns null for a parallel segment', () => {
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 1 })).toBeNull();
  });

  it('returns null when the ray misses the segment extent', () => {
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 3 })).toBeNull();
  });
});

describe('reflect', () => {
  it('obeys angle of incidence = angle of reflection', () => {
    // 45° down-right onto a horizontal floor (normal pointing up).
    const d = norm({ x: 1, y: 1 });
    const r = reflect(d, { x: 0, y: -1 });
    expect(r.x).toBeCloseTo(Math.SQRT1_2);
    expect(r.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('reverses a head-on ray', () => {
    const r = reflect({ x: 1, y: 0 }, { x: -1, y: 0 });
    expect(r.x).toBeCloseTo(-1);
    expect(r.y).toBeCloseTo(0);
  });
});

describe('rayCircle', () => {
  it('hits the near side of a circle', () => {
    const hit = rayCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, 1);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(2);
    expect(hit!.normal.x).toBeCloseTo(-1);
  });

  it('escapes from inside a circle', () => {
    const hit = rayCircle({ x: 3, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }, 1);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(1);
  });

  it('misses a circle off to the side', () => {
    expect(rayCircle({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 5 }, 1)).toBeNull();
  });
});

describe('rects', () => {
  const rect: RectObj = {
    id: 'r',
    kind: 'rect',
    center: { x: 0, y: 0 },
    w: 2,
    h: 1,
    rotation: Math.PI / 2,
    absorption: 0.1,
    label: 'r',
    role: 'furniture',
    height: 0.5,
  };

  it('pointInRect respects rotation', () => {
    // Rotated 90°: extents swap, so x is now the short axis.
    expect(pointInRect({ x: 0.4, y: 0.9 }, rect)).toBe(true);
    expect(pointInRect({ x: 0.9, y: 0.4 }, rect)).toBe(false);
  });

  it('rectCorners produces a rectangle with the right diagonal', () => {
    const c = rectCorners(rect);
    const diag = Math.hypot(c[0].x - c[2].x, c[0].y - c[2].y);
    expect(diag).toBeCloseTo(Math.hypot(2, 1));
  });
});
