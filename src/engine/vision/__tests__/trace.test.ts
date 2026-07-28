import { describe, expect, it } from 'vitest';
import {
  ANNOTATION,
  classify,
  looksLikeAnnotation,
  polylineToSegments,
  Role,
  simplify,
  skeletonToSegments,
  tracePolylines,
  turns,
  type Polyline,
} from '../trace';
import { emptyMask, segLength, type Mask } from '../types';

function skel(w: number, h: number, pixels: Array<[number, number]>): Mask {
  const m = emptyMask(w, h);
  for (const [x, y] of pixels) m.data[y * w + x] = 1;
  return m;
}

function hline(y: number, x0: number, x1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}
function vline(x: number, y0: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}

describe('classify', () => {
  it('labels ends, path pixels and junctions by neighbour count', () => {
    const m = skel(40, 40, [...hline(20, 5, 34), ...vline(20, 20, 34)]);
    const role = classify(m);
    expect(role[20 * 40 + 5]).toBe(Role.End);
    expect(role[20 * 40 + 12]).toBe(Role.Path);
    expect(role[20 * 40 + 20]).toBe(Role.Junction);
    expect(role[0]).toBe(Role.None);
  });
});

describe('tracePolylines', () => {
  it('returns one polyline for a straight run', () => {
    const lines = tracePolylines(skel(40, 20, hline(10, 5, 34)));
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toEqual({ x: 5, y: 10 });
    expect(lines[0][lines[0].length - 1]).toEqual({ x: 34, y: 10 });
  });

  it('splits a T into three branches that all reach the junction', () => {
    const m = skel(40, 40, [...hline(20, 5, 34), ...vline(20, 21, 34)]);
    const lines = tracePolylines(m).filter((l) => l.length > 3);
    expect(lines).toHaveLength(3);
    for (const l of lines) {
      const touches = [l[0], l[l.length - 1]].some((p) => Math.hypot(p.x - 20, p.y - 20) <= 1.5);
      expect(touches).toBe(true);
    }
  });

  it('traces a closed loop that has no junction at all', () => {
    // A ring of degree-2 pixels: nothing to start from except the loop sweep.
    const px: Array<[number, number]> = [
      ...hline(5, 5, 25),
      ...hline(25, 5, 25),
      ...vline(5, 6, 24),
      ...vline(25, 6, 24),
    ];
    const lines = tracePolylines(skel(32, 32, px));
    expect(lines.length).toBeGreaterThan(0);
    const total = lines.reduce((a, l) => a + l.length, 0);
    expect(total).toBeGreaterThan(70); // most of the ring got walked
  });

  it('consumes each path pixel once, so a branch is not emitted twice', () => {
    const lines = tracePolylines(skel(40, 20, hline(10, 5, 34)));
    expect(lines).toHaveLength(1);
  });

  it('returns nothing for an empty skeleton', () => {
    expect(tracePolylines(emptyMask(20, 20))).toEqual([]);
  });
});

describe('simplify (Ramer-Douglas-Peucker)', () => {
  it('collapses a straight run to its two ends', () => {
    const line: Polyline = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 10 }));
    expect(simplify(line, 1)).toEqual([
      { x: 0, y: 10 },
      { x: 39, y: 10 },
    ]);
  });

  it('keeps a real corner', () => {
    const line: Polyline = [
      ...Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 })),
      ...Array.from({ length: 20 }, (_, i) => ({ x: 19, y: i })),
    ];
    const s = simplify(line, 1);
    expect(s.length).toBe(3);
    expect(s[1]).toEqual({ x: 19, y: 0 });
  });

  it('removes the staircase of a rasterised diagonal at a 1-px epsilon', () => {
    const line: Polyline = [];
    for (let i = 0; i < 40; i++) line.push({ x: i, y: Math.round(i * 0.5) });
    expect(simplify(line, 1.5).length).toBeLessThanOrEqual(3);
  });

  it('handles degenerate inputs', () => {
    expect(simplify([], 1)).toEqual([]);
    expect(simplify([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('turns / looksLikeAnnotation', () => {
  const arc = (radius: number, sweepDeg: number, steps: number): Polyline =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = ((sweepDeg * Math.PI) / 180) * (i / steps);
      return { x: radius * Math.cos(t), y: radius * Math.sin(t) };
    });

  it('signs the turn by direction', () => {
    const right: Polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const left: Polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: -10 },
    ];
    expect(turns(right)[0]).toBeCloseTo(Math.PI / 2, 6);
    expect(turns(left)[0]).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('calls a DOOR ARC annotation — monotone turning, no single sharp corner', () => {
    expect(looksLikeAnnotation(arc(60, 80, 5), 40)).toBe(true);
  });

  it('does NOT call an L-shaped wall run annotation — one sharp corner, not many gentle ones', () => {
    const ell: Polyline = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
    ];
    expect(looksLikeAnnotation(ell, 40)).toBe(false);
  });

  it('THE TRAP: does not call a room OUTLINE annotation, even though it turns as much as text does', () => {
    // A rectangle traced as one closed branch: four 90-degree turns, mean turn
    // far above the zigzag threshold. Only the LEG LENGTH separates it from a
    // run of dimension text, which is exactly why `legScale` exists.
    const room: Polyline = [
      { x: 0, y: 0 },
      { x: 280, y: 0 },
      { x: 280, y: 200 },
      { x: 0, y: 200 },
      { x: 0, y: 0 },
    ];
    expect(looksLikeAnnotation(room, 40)).toBe(false);
  });

  it('calls a run of SHORT zigzag legs annotation — dimension text and hatching', () => {
    const text: Polyline = [];
    for (let i = 0; i < 8; i++) {
      text.push({ x: i * 10, y: i % 2 === 0 ? 0 : 9 });
    }
    expect(looksLikeAnnotation(text, 40)).toBe(true);
  });

  it('is fully disabled at legScale 0, so callers opt in', () => {
    // Both rules are now scale-relative: the arc test compares an implied
    // radius against `legScale`, so passing 0 opts out of everything.
    expect(looksLikeAnnotation(arc(60, 80, 5), 0)).toBe(false);
    const text: Polyline = Array.from({ length: 8 }, (_, i) => ({ x: i * 10, y: i % 2 === 0 ? 0 : 9 }));
    expect(looksLikeAnnotation(text, 0)).toBe(false);
  });

  it('does NOT call a gently-bending WALL RUN an arc — the implied radius is too large', () => {
    // Thinning chamfers a right-angle corner into two 45-degree bends, which is
    // monotone and under the max-turn gate. What separates it from a door swing
    // is that a room turns 90 degrees over ~1000 px and a door over ~50: with
    // no radius test, `hollow-rect` was dropped whole and scored ZERO.
    const chamferedCorner: Polyline = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 560, y: 160 },
      { x: 560, y: 500 },
    ];
    expect(looksLikeAnnotation(chamferedCorner, 35)).toBe(false);
    expect(looksLikeAnnotation(arc(50, 80, 4), 35)).toBe(true);
  });

  it('needs at least two legs to say anything', () => {
    expect(looksLikeAnnotation([{ x: 0, y: 0 }, { x: 10, y: 0 }], 40)).toBe(false);
  });

  it('exposes its thresholds so a change is visible in the diff', () => {
    expect(ANNOTATION.arcTotalTurn).toBeCloseTo((45 * Math.PI) / 180, 9);
    expect(ANNOTATION.arcMaxTurn).toBeCloseTo((60 * Math.PI) / 180, 9);
    expect(ANNOTATION.zigzagMeanTurn).toBeCloseTo((35 * Math.PI) / 180, 9);
  });
});

describe('polylineToSegments / skeletonToSegments', () => {
  it('emits one segment per simplified leg and drops short ones', () => {
    // The short leg has to be NON-collinear, or simplification absorbs it
    // before the length filter ever sees it.
    const line: Polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 5 },
    ];
    const segs = polylineToSegments(line, 1, 20);
    expect(segs).toHaveLength(1);
    expect(segLength(segs[0])).toBeCloseTo(100, 5);
  });

  it('drops an annotation polyline entirely when legScale is supplied', () => {
    const arcLine: Polyline = Array.from({ length: 7 }, (_, i) => {
      const t = ((80 * Math.PI) / 180) * (i / 6);
      return { x: 60 * Math.cos(t), y: 60 * Math.sin(t) };
    });
    expect(polylineToSegments(arcLine, 1, 5, 0).length).toBeGreaterThan(0);
    expect(polylineToSegments(arcLine, 1, 5, 40)).toEqual([]);
  });

  it('walks the whole skeleton', () => {
    const m = skel(120, 60, [...hline(30, 5, 114), ...vline(60, 31, 54)]);
    const segs = skeletonToSegments(m, 1.5, 15);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    const total = segs.reduce((a, s) => a + segLength(s), 0);
    expect(total).toBeGreaterThan(120);
  });
});
