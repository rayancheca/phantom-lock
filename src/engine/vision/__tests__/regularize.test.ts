import { describe, expect, it } from 'vitest';
import {
  dominantAngle,
  filterBySupport,
  inkSupport,
  joinCorners,
  mergeCollinear,
  regularize,
  snapToAxes,
  type RegularizeOptions,
} from '../regularize';
import { emptyMask, headingGap, segHeading, segLength, type Mask, type PxSegment } from '../types';

const OPTS: RegularizeOptions = {
  snapAngle: (9 * Math.PI) / 180,
  parallelAngle: (20 * Math.PI) / 180,
  mergeDistance: 8,
  joinGap: 12,
  cornerRadius: 12,
  minLength: 20,
};

const seg = (ax: number, ay: number, bx: number, by: number): PxSegment => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

const deg = (r: number) => (r * 180) / Math.PI;

function inkMask(w: number, h: number, segs: PxSegment[], thickness = 3): Mask {
  const m = emptyMask(w, h);
  for (const s of segs) {
    const n = Math.ceil(segLength(s)) * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = s.a.x + (s.b.x - s.a.x) * t;
      const y = s.a.y + (s.b.y - s.a.y) * t;
      for (let dy = -thickness; dy <= thickness; dy++) {
        for (let dx = -thickness; dx <= thickness; dx++) {
          const px = Math.round(x + dx);
          const py = Math.round(y + dy);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          m.data[py * w + px] = 1;
        }
      }
    }
  }
  return m;
}

describe('dominantAngle', () => {
  it('is 0 for an axis-aligned plan', () => {
    expect(deg(dominantAngle([seg(0, 0, 200, 0), seg(0, 0, 0, 150)]))).toBeCloseTo(0, 3);
  });

  it('recovers the rotation of a plan photographed off-square', () => {
    const rot = (7 * Math.PI) / 180;
    const r = (s: PxSegment): PxSegment => ({
      a: { x: s.a.x * Math.cos(rot) - s.a.y * Math.sin(rot), y: s.a.x * Math.sin(rot) + s.a.y * Math.cos(rot) },
      b: { x: s.b.x * Math.cos(rot) - s.b.y * Math.sin(rot), y: s.b.x * Math.sin(rot) + s.b.y * Math.cos(rot) },
    });
    const segs = [seg(0, 0, 200, 0), seg(200, 0, 200, 150), seg(200, 150, 0, 150), seg(0, 150, 0, 0)].map(r);
    expect(deg(dominantAngle(segs))).toBeCloseTo(7, 0);
  });

  it('is LENGTH-weighted — one long wall outvotes several short crooked ones', () => {
    const segs = [
      seg(0, 0, 400, 0), // the plan's real axis
      seg(0, 50, 20, 58), // three short, badly drawn scraps
      seg(0, 70, 20, 78),
      seg(0, 90, 20, 98),
    ];
    expect(deg(dominantAngle(segs))).toBeCloseTo(0, 0);
  });

  it('returns 0 for no evidence rather than NaN', () => {
    expect(dominantAngle([])).toBe(0);
  });

  it('folds the two axes together — a plan of only verticals gives the same answer', () => {
    const a = dominantAngle([seg(0, 0, 200, 0)]);
    const b = dominantAngle([seg(0, 0, 0, 200)]);
    expect(headingGap(a, b)).toBeCloseTo(0, 6);
  });
});

describe('snapToAxes', () => {
  it('straightens a wall that is a couple of degrees off', () => {
    const out = snapToAxes([seg(0, 0, 200, 7)], 0, OPTS.snapAngle);
    expect(deg(segHeading(out[0]))).toBeCloseTo(0, 3);
    expect(segLength(out[0])).toBeCloseTo(segLength(seg(0, 0, 200, 7)), 6);
  });

  it('THE ONE THAT MATTERS: leaves a genuinely angled wall alone', () => {
    // Silently rotating a real 30-degree wall flat would be a data-quality bug
    // of the same family as a cap that fires on real data.
    const angled = seg(0, 0, 200, 115); // ~30 degrees
    const out = snapToAxes([angled], 0, OPTS.snapAngle);
    expect(out[0]).toEqual(angled);
  });

  it('snaps about the MIDPOINT, so a wall does not slide along the plan', () => {
    const s = seg(100, 50, 300, 56);
    const out = snapToAxes([s], 0, OPTS.snapAngle)[0];
    expect((out.a.x + out.b.x) / 2).toBeCloseTo(200, 6);
    expect((out.a.y + out.b.y) / 2).toBeCloseTo(53, 6);
  });

  it('snaps to the rotated axis pair, not to true horizontal', () => {
    const theta = (6 * Math.PI) / 180;
    const out = snapToAxes([seg(0, 0, 200, 22)], theta, OPTS.snapAngle)[0];
    expect(deg(segHeading(out))).toBeCloseTo(6, 1);
  });

  it('keeps the direction of travel, so endpoint order is stable', () => {
    const out = snapToAxes([seg(200, 3, 0, 0)], 0, OPTS.snapAngle)[0];
    expect(out.a.x).toBeGreaterThan(out.b.x);
  });
});

describe('mergeCollinear', () => {
  it('collapses two detections of the same wall into one', () => {
    const out = mergeCollinear([seg(0, 100, 300, 100), seg(0, 104, 300, 104)], OPTS);
    expect(out).toHaveLength(1);
    expect(segLength(out[0])).toBeCloseTo(300, 0);
  });

  it('rejoins two fragments separated by a nick', () => {
    const out = mergeCollinear([seg(0, 100, 140, 100), seg(146, 100, 300, 100)], OPTS);
    expect(out).toHaveLength(1);
    expect(segLength(out[0])).toBeCloseTo(300, 0);
  });

  it('DOORWAYS SURVIVE — a gap wider than joinGap stays two walls', () => {
    const out = mergeCollinear([seg(0, 100, 120, 100), seg(190, 100, 300, 100)], OPTS);
    expect(out).toHaveLength(2);
  });

  it('does not merge two genuinely separate parallel walls', () => {
    const out = mergeCollinear([seg(0, 100, 300, 100), seg(0, 180, 300, 180)], OPTS);
    expect(out).toHaveLength(2);
  });

  it('does not merge perpendicular walls that cross', () => {
    const out = mergeCollinear([seg(0, 100, 300, 100), seg(150, 0, 150, 250)], OPTS);
    expect(out).toHaveLength(2);
  });

  it('drops a merged run shorter than minLength', () => {
    expect(mergeCollinear([seg(0, 0, 10, 0)], OPTS)).toHaveLength(0);
  });

  it('re-fits the shared line as a length-weighted mean, so a long wall dominates', () => {
    // One 400-px wall at y=100 and one 40-px scrap at y=106: the merged line
    // should sit close to the long one, not halfway.
    const out = mergeCollinear([seg(0, 100, 400, 100), seg(10, 106, 50, 106)], OPTS);
    expect(out).toHaveLength(1);
    expect(out[0].a.y).toBeLessThan(102);
  });

  it('handles an empty input', () => {
    expect(mergeCollinear([], OPTS)).toEqual([]);
  });
});

describe('joinCorners', () => {
  it('pulls an L-corner onto the exact intersection of the two lines', () => {
    // Both walls overshoot; the midpoint of the two endpoints would be wrong.
    const out = joinCorners([seg(0, 0, 100, 0), seg(104, -6, 104, 120)], 12, OPTS.parallelAngle);
    expect(out[0].b.x).toBeCloseTo(104, 3);
    expect(out[0].b.y).toBeCloseTo(0, 3);
    expect(out[1].a.x).toBeCloseTo(104, 3);
    expect(out[1].a.y).toBeCloseTo(0, 3);
  });

  it('projects a T-junction onto the through-wall WITHOUT moving it', () => {
    const through = seg(0, 0, 300, 0);
    const stub = seg(150, 7, 150, 200);
    const out = joinCorners([through, stub], 12, OPTS.parallelAngle);
    expect(out[0]).toEqual(through); // the long wall is untouched
    expect(out[1].a.y).toBeCloseTo(0, 3);
  });

  it('leaves endpoints that are nowhere near each other alone', () => {
    const input = [seg(0, 0, 100, 0), seg(250, 60, 250, 200)];
    expect(joinCorners(input, 12, OPTS.parallelAngle)).toEqual(input);
  });

  it('does not invent a corner from two nearly-parallel walls whose lines meet far away', () => {
    const input = [seg(0, 0, 200, 0), seg(205, 3, 400, 8)];
    const out = joinCorners(input, 12, OPTS.parallelAngle);
    for (const s of out) {
      expect(Math.abs(s.a.x)).toBeLessThan(500);
      expect(Math.abs(s.b.x)).toBeLessThan(500);
    }
  });

  it('does not mutate its input', () => {
    const input = [seg(0, 0, 100, 0), seg(104, -6, 104, 120)];
    const snapshot = JSON.stringify(input);
    joinCorners(input, 12, OPTS.parallelAngle);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('inkSupport / filterBySupport', () => {
  it('is 1 for a segment drawn straight down the middle of its own ink', () => {
    const s = seg(20, 50, 180, 50);
    expect(inkSupport(s, inkMask(200, 100, [s]), 3)).toBeCloseTo(1, 2);
  });

  it('is 0 for a segment over blank page', () => {
    const mask = inkMask(200, 100, [seg(20, 50, 180, 50)]);
    expect(inkSupport(seg(20, 10, 180, 10), mask, 3)).toBeCloseTo(0, 2);
  });

  it('falls to about half when half the segment is unsupported', () => {
    const mask = inkMask(300, 100, [seg(0, 50, 150, 50)]);
    const support = inkSupport(seg(0, 50, 300, 50), mask, 3);
    expect(support).toBeGreaterThan(0.4);
    expect(support).toBeLessThan(0.6);
  });

  it('REJECTS a wall bridged across a gap the image does not support', () => {
    const mask = inkMask(400, 100, [seg(0, 50, 120, 50), seg(280, 50, 400, 50)]);
    const bridged = seg(0, 50, 400, 50);
    expect(filterBySupport([bridged], mask, 3, 0.8)).toEqual([]);
    expect(filterBySupport([bridged], mask, 3, 0.5)).toEqual([bridged]);
  });

  it('is 0 for a zero-length segment rather than NaN', () => {
    expect(inkSupport(seg(5, 5, 5, 5), inkMask(20, 20, []), 2)).toBe(0);
  });
});

describe('regularize (the whole chain)', () => {
  it('turns a ragged rectangle into four clean walls that meet', () => {
    const ragged = [
      seg(2, 3, 298, 6), // each wall a little off, each corner overshooting
      seg(301, 1, 297, 197),
      seg(299, 202, 4, 198),
      seg(1, 201, 3, 2),
    ];
    const out = regularize(ragged, OPTS);
    expect(out).toHaveLength(4);
    // Mutual consistency, NOT alignment to true horizontal. Given four walls
    // each a degree off in its own direction, the estimator legitimately
    // concludes the whole PLAN is rotated by their weighted mean (~0.75 degrees
    // here) and squares everything to that. Asserting true horizontal would be
    // asserting that a photo taken off-square is straightened to the camera
    // rather than to the building.
    const axis = dominantAngle(out);
    for (const s of out) {
      const g = Math.min(headingGap(segHeading(s), axis), headingGap(segHeading(s), axis + Math.PI / 2));
      expect(deg(g)).toBeLessThan(0.5);
    }
    // Every endpoint now coincides with another.
    const ends = out.flatMap((s) => [s.a, s.b]);
    for (const e of ends) {
      const partners = ends.filter((o) => o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 0.5);
      expect(partners.length).toBeGreaterThan(0);
    }
  });

  it('collapses a duplicated rectangle to four walls, not eight', () => {
    const rect = [seg(0, 0, 300, 0), seg(300, 0, 300, 200), seg(300, 200, 0, 200), seg(0, 200, 0, 0)];
    const doubled = [...rect, ...rect.map((s) => ({ a: { ...s.a, y: s.a.y + 4 }, b: { ...s.b, y: s.b.y + 4 } }))];
    expect(regularize(doubled, OPTS).length).toBeLessThanOrEqual(5);
  });

  it('returns nothing for nothing', () => {
    expect(regularize([], OPTS)).toEqual([]);
  });
});
