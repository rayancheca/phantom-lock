/**
 * `bandRect` — the rubber-band rectangle, expressed in the PLAN's frame.
 *
 * Dragging a box out on a building that is not square to the world used to give
 * a world-axis-aligned box, which then had to be rotated by hand. This builds it
 * on the plan's own axis instead.
 *
 * The two properties that matter, and both are tested rather than argued:
 *   - at axis 0 it is BIT-IDENTICAL to the arithmetic it replaced, so every
 *     square plan is untouched;
 *   - the dragged points stay OPPOSITE CORNERS of the result, so the band still
 *     follows the pointer exactly at any axis.
 */
import { describe, expect, it } from 'vitest';
import { bandRect } from '../placement';
import { rectCorners } from '../../../engine/geometry';
import type { Vec2 } from '../../../engine/types';

const DEG = Math.PI / 180;

/** The expression `bandRect` replaced, verbatim. */
function legacy(a: Vec2, b: Vec2) {
  return {
    center: { x: a.x + (b.x - a.x) * 0.5, y: a.y + (b.y - a.y) * 0.5 },
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    rotation: 0,
  };
}

/** Deterministic pseudo-random, so a failure is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('bandRect', () => {
  it('is BIT-IDENTICAL to the old world-axis arithmetic when the axis is 0', () => {
    const r = rng(12345);
    for (let i = 0; i < 2000; i++) {
      const a = { x: (r() - 0.5) * 400, y: (r() - 0.5) * 400 };
      const b = { x: (r() - 0.5) * 400, y: (r() - 0.5) * 400 };
      const got = bandRect(a, b, 0);
      const want = legacy(a, b);
      expect(Object.is(got.w, want.w), `w at i=${i}`).toBe(true);
      expect(Object.is(got.h, want.h), `h at i=${i}`).toBe(true);
      expect(Object.is(got.center.x, want.center.x)).toBe(true);
      expect(Object.is(got.center.y, want.center.y)).toBe(true);
      expect(got.rotation).toBe(0);
    }
  });

  /**
   * THE ONE THAT MATTERS: the band must still land under the pointer. If the
   * two dragged points are not opposite corners, the box drifts away from the
   * cursor as the axis grows — which is exactly how a plausible-looking wrong
   * formula would fail.
   */
  it('keeps the two dragged points as OPPOSITE CORNERS at any axis', () => {
    const r = rng(999);
    for (const deg of [0, 7, -13, 22, -31, 44, -44]) {
      for (let i = 0; i < 200; i++) {
        const a = { x: (r() - 0.5) * 60, y: (r() - 0.5) * 60 };
        const b = { x: (r() - 0.5) * 60, y: (r() - 0.5) * 60 };
        const band = bandRect(a, b, deg * DEG);
        const corners = rectCorners({
          id: 'x',
          kind: 'rect',
          center: band.center,
          w: band.w,
          h: band.h,
          rotation: band.rotation,
          absorption: 0.3,
          label: 'x',
          role: 'furniture',
          height: 1,
        });
        const near = (p: Vec2) =>
          corners.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 1e-9);
        expect(near(a), `a not a corner at ${deg} deg, i=${i}`).toBe(true);
        expect(near(b), `b not a corner at ${deg} deg, i=${i}`).toBe(true);
      }
    }
  });

  it('reports the extents in the ROTATED frame, not the world frame', () => {
    // A 3 x 0 drag along a 30 degree axis is 3 long and 0 deep in that frame,
    // whatever its world-axis bounding box says.
    const a = { x: 0, y: 0 };
    const b = { x: 3 * Math.cos(30 * DEG), y: 3 * Math.sin(30 * DEG) };
    const band = bandRect(a, b, 30 * DEG);
    expect(band.w).toBeCloseTo(3, 9);
    expect(band.h).toBeCloseTo(0, 9);
    // ...and the world-axis version would have called it 2.598 x 1.5.
    expect(legacy(a, b).w).toBeCloseTo(2.598, 3);
    expect(legacy(a, b).h).toBeCloseTo(1.5, 3);
  });

  it('never returns a negative extent, whichever way the drag went', () => {
    for (const [a, b] of [
      [{ x: 5, y: 5 }, { x: 1, y: 1 }],
      [{ x: 1, y: 5 }, { x: 5, y: 1 }],
      [{ x: -3, y: 2 }, { x: -9, y: -4 }],
    ] as Array<[Vec2, Vec2]>) {
      for (const deg of [0, 17, -40]) {
        const band = bandRect(a, b, deg * DEG);
        expect(band.w).toBeGreaterThanOrEqual(0);
        expect(band.h).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('collapses to a zero-size rect when the drag has not moved', () => {
    const p = { x: 2, y: -7 };
    const band = bandRect(p, p, 23 * DEG);
    expect(band.w).toBe(0);
    expect(band.h).toBe(0);
    expect(band.center).toEqual(p);
  });
});
