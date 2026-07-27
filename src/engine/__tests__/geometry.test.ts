import { describe, expect, it } from 'vitest';
import {
  pointInRect,
  rayCircle,
  rayCircleT,
  raySegment,
  raySegmentT,
  rectCorners,
  surfaceT,
} from '../geometry';
import { norm, reflect } from '../vec';
import type { RectObj, Surface } from '../types';

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

/**
 * S19 added allocation-free `t`-only forms of the ray tests so the engine's
 * hottest loops stop building a `point` and a `normal` (and the `Math.hypot`
 * inside `v.norm`) for every surface they reject. `directOcclusion` and the
 * reflection search read nothing but `t`, so the substitution is only legal if
 * the number is the SAME double and the null↔-1 mapping is total.
 */
describe('raySegmentT / rayCircleT return exactly raySegment / rayCircle .t', () => {
  function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  it('matches on 40 000 randomized segment queries, including degenerate ones', () => {
    const rnd = seeded(0x1234abc);
    let hits = 0;
    let misses = 0;
    for (let i = 0; i < 40_000; i++) {
      const o = { x: rnd() * 20 - 10, y: rnd() * 20 - 10 };
      const ang = rnd() * Math.PI * 2;
      const d = { x: Math.cos(ang), y: Math.sin(ang) };
      const a = { x: rnd() * 20 - 10, y: rnd() * 20 - 10 };
      // One in six is zero-length or near-parallel to the ray — the cases where
      // the `1e-12` denominator guard and the `u` tolerance decide the answer.
      const b =
        i % 6 === 0
          ? { ...a }
          : i % 6 === 1
            ? { x: a.x + d.x * (1 + rnd() * 5), y: a.y + d.y * (1 + rnd() * 5) }
            : { x: rnd() * 20 - 10, y: rnd() * 20 - 10 };
      const full = raySegment(o, d, a, b);
      const t = raySegmentT(o, d, a, b);
      if (full === null) {
        expect(t).toBe(-1);
        misses++;
      } else {
        expect(Object.is(t, full.t)).toBe(true);
        hits++;
      }
    }
    // Neither outcome may be empty, or the assertion above is vacuous.
    expect(hits).toBeGreaterThan(1_000);
    expect(misses).toBeGreaterThan(1_000);
  });

  it('matches on 40 000 randomized circle queries, including rays starting inside', () => {
    const rnd = seeded(0x99fe12);
    let hits = 0;
    let misses = 0;
    for (let i = 0; i < 40_000; i++) {
      const o = { x: rnd() * 20 - 10, y: rnd() * 20 - 10 };
      const ang = rnd() * Math.PI * 2;
      const d = { x: Math.cos(ang), y: Math.sin(ang) };
      const c = { x: rnd() * 20 - 10, y: rnd() * 20 - 10 };
      // Radii large enough that the origin often sits inside the circle.
      const r = i % 5 === 0 ? rnd() * 15 : rnd() * 2;
      const full = rayCircle(o, d, c, r);
      const t = rayCircleT(o, d, c, r);
      if (full === null) {
        expect(t).toBe(-1);
        misses++;
      } else {
        expect(Object.is(t, full.t)).toBe(true);
        hits++;
      }
    }
    expect(hits).toBeGreaterThan(1_000);
    expect(misses).toBeGreaterThan(1_000);
  });

  it('surfaceT dispatches to the right primitive for both surface kinds', () => {
    const o = { x: 0, y: 0 };
    const d = { x: 1, y: 0 };
    const seg: Surface = {
      type: 'seg',
      a: { x: 3, y: -1 },
      b: { x: 3, y: 1 },
      absorption: 0.2,
      height: 2,
      objectId: 'a',
    };
    const circ: Surface = {
      type: 'circle',
      c: { x: 5, y: 0 },
      r: 1,
      absorption: 0.2,
      height: 2,
      objectId: 'b',
    };
    expect(Object.is(surfaceT(seg, o, d), raySegment(o, d, seg.a, seg.b)!.t)).toBe(true);
    expect(Object.is(surfaceT(circ, o, d), rayCircle(o, d, circ.c, circ.r)!.t)).toBe(true);
  });

  it('accepts hits inside the 1e-9 u tolerance, on both sides of the segment', () => {
    // 40 000 random rays never once landed in this band — a ray essentially
    // never grazes an endpoint to within a nanometre by chance — so the
    // tolerance has to be aimed at deliberately. Without this, tightening
    // `u < -1e-9 || u > 1 + 1e-9` to `u < 0 || u > 1` passes the whole suite,
    // while silently letting rays through the ends of every wall in the app.
    const o = { x: 0, y: -1 };
    const a = { x: 1, y: 0 };
    const b = { x: 1, y: 1 };
    // With s = b - a = (0,1) and ao = a - o = (1,1): u = d.y / d.x - 1.
    for (const [dy, expected] of [
      [2 + 5e-10, 1 + 5e-10], // just past b
      [1 - 5e-10, -5e-10], // just before a
    ] as const) {
      const d = { x: 1, y: dy };
      const full = raySegment(o, d, a, b);
      expect(full, `u = ${expected} must still be a hit`).not.toBeNull();
      expect(Object.is(raySegmentT(o, d, a, b), full!.t)).toBe(true);
    }
    // …and just OUTSIDE the band is a miss for both forms.
    for (const dy of [2 + 5e-8, 1 - 5e-8]) {
      const d = { x: 1, y: dy };
      expect(raySegment(o, d, a, b)).toBeNull();
      expect(raySegmentT(o, d, a, b)).toBe(-1);
    }
  });

  it('propagates NaN as a hit rather than a miss, exactly as the full form does', () => {
    // A NaN direction makes every comparison false, so `raySegment` returns a hit
    // whose `t` is NaN. Callers rely on that flowing through to a non-blocking
    // result; mapping it to the -1 miss sentinel would be a behaviour change.
    const o = { x: 0, y: 0 };
    const d = { x: NaN, y: NaN };
    const full = raySegment(o, d, { x: 1, y: -1 }, { x: 1, y: 1 });
    const t = raySegmentT(o, d, { x: 1, y: -1 }, { x: 1, y: 1 });
    expect(full).not.toBeNull();
    expect(Number.isNaN(full!.t)).toBe(true);
    expect(Number.isNaN(t)).toBe(true);
  });
});
