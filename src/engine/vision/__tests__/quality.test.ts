import { describe, expect, it } from 'vitest';
import {
  assessDetection,
  explainedFraction,
  MIN_STRUCTURE,
  MIN_SUPPORT,
  MIN_WALLS,
  structureScore,
} from '../quality';
import { emptyMask, segLength, type Mask, type PxSegment } from '../types';

const seg = (ax: number, ay: number, bx: number, by: number): PxSegment => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

const RECT = [seg(0, 0, 300, 0), seg(300, 0, 300, 200), seg(300, 200, 0, 200), seg(0, 200, 0, 0)];

function inkFor(w: number, h: number, segs: PxSegment[], thickness = 3): Mask {
  const m = emptyMask(w, h);
  for (const s of segs) {
    const n = Math.ceil(segLength(s)) * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      for (let dy = -thickness; dy <= thickness; dy++) {
        for (let dx = -thickness; dx <= thickness; dx++) {
          const px = Math.round(s.a.x + (s.b.x - s.a.x) * t + dx);
          const py = Math.round(s.a.y + (s.b.y - s.a.y) * t + dy);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          m.data[py * w + px] = 1;
        }
      }
    }
  }
  return m;
}

describe('structureScore', () => {
  it('is 1 for a closed rectangle — every endpoint is a corner', () => {
    expect(structureScore(RECT, 6)).toBeCloseTo(1, 3);
  });

  it('is 0 for a scatter of unrelated sticks — the "photo of furniture" case', () => {
    const scatter = [seg(10, 10, 90, 12), seg(150, 60, 220, 58), seg(40, 150, 110, 155)];
    expect(structureScore(scatter, 6)).toBe(0);
  });

  it('falls as walls stop reaching each other', () => {
    const shrunk = RECT.map((s) => ({
      a: { x: s.a.x + (s.b.x - s.a.x) * 0.15, y: s.a.y + (s.b.y - s.a.y) * 0.15 },
      b: { x: s.a.x + (s.b.x - s.a.x) * 0.85, y: s.a.y + (s.b.y - s.a.y) * 0.85 },
    }));
    expect(structureScore(shrunk, 6)).toBeLessThan(0.2);
  });

  it('counts an endpoint landing on another wall INTERIOR — a T-junction joins', () => {
    // A T has four endpoints and only ONE of them touches anything, so the
    // score is 0.25 — the assertion worth making is that touching the interior
    // counts at all, which the detached control isolates.
    const touching = [seg(0, 0, 300, 0), seg(150, 0, 150, 200)];
    const detached = [seg(0, 0, 300, 0), seg(150, 40, 150, 200)];
    expect(structureScore(touching, 6)).toBeCloseTo(0.25, 3);
    expect(structureScore(detached, 6)).toBe(0);
  });

  it('is 0 for no segments rather than NaN', () => {
    expect(structureScore([], 6)).toBe(0);
  });
});

describe('explainedFraction', () => {
  it('is ~1 when the segments cover the ink they came from', () => {
    expect(explainedFraction(RECT, inkFor(320, 220, RECT), 4)).toBeGreaterThan(0.95);
  });

  it('falls when most of the ink was not described', () => {
    const mask = inkFor(320, 220, [...RECT, seg(150, 0, 150, 200), seg(0, 100, 300, 100)]);
    expect(explainedFraction(RECT, mask, 4)).toBeLessThan(0.8);
  });

  it('is 0 for an empty mask rather than NaN', () => {
    expect(explainedFraction(RECT, emptyMask(50, 50), 4)).toBe(0);
  });
});

describe('assessDetection', () => {
  const mask = inkFor(320, 220, RECT);

  it('accepts a clean rectangle with high confidence and no refusal', () => {
    const q = assessDetection(RECT, mask, { junctionRadius: 8, supportRadius: 4, explainRadius: 4 });
    expect(q.refusal).toBeNull();
    expect(q.confidence).toBeGreaterThan(0.85);
    expect(q.wallCount).toBe(4);
    expect(q.totalLength).toBeCloseTo(1000, 0);
  });

  it('refuses when there are too few walls, and SAYS which cause', () => {
    const q = assessDetection([RECT[0]], mask, { junctionRadius: 8, supportRadius: 4, explainRadius: 4 });
    expect(q.refusal).toMatch(/enough clear straight lines/);
  });

  it('refuses geometry the image does not support', () => {
    const blank = emptyMask(320, 220);
    const q = assessDetection(RECT, blank, { junctionRadius: 8, supportRadius: 4, explainRadius: 4 });
    expect(q.support).toBeLessThan(MIN_SUPPORT);
    expect(q.refusal).toMatch(/too broken up/);
  });

  it('refuses a scatter that does not join into rooms — the null-image case', () => {
    const scatter = [seg(10, 10, 90, 12), seg(150, 60, 220, 58), seg(40, 150, 110, 155), seg(200, 180, 280, 182)];
    const q = assessDetection(scatter, inkFor(320, 220, scatter), {
      junctionRadius: 8,
      supportRadius: 4,
      explainRadius: 4,
    });
    expect(q.structure).toBeLessThan(MIN_STRUCTURE);
    expect(q.refusal).toMatch(/don't join up into rooms/);
  });

  it('gives an empty detection a zero confidence and a refusal, never a silent pass', () => {
    const q = assessDetection([], mask, { junctionRadius: 8, supportRadius: 4, explainRadius: 4 });
    expect(q.confidence).toBe(0);
    expect(q.refusal).not.toBeNull();
    expect(q.wallCount).toBe(0);
  });

  it('reports every component, so a caller can explain itself', () => {
    const q = assessDetection(RECT, mask, { junctionRadius: 8, supportRadius: 4, explainRadius: 4 });
    expect(Object.keys(q).sort()).toEqual(
      ['cause', 'confidence', 'explained', 'refusal', 'structure', 'support', 'totalLength', 'wallCount'].sort(),
    );
  });

  it('names WHICH gate refused, so the UI never has to string-match a sentence', () => {
    const opts = { junctionRadius: 8, supportRadius: 4, explainRadius: 4 };
    expect(assessDetection(RECT, mask, opts).cause).toBeNull();
    expect(assessDetection([RECT[0]], mask, opts).cause).toBe('too-few-lines');
    // Four parallel bars in open space: enough of them, well supported, joining
    // nothing.
    const bars = [0, 40, 80, 120].map((y) => seg(20, y + 20, 280, y + 20));
    const barMask = inkFor(300, 200, bars);
    expect(assessDetection(bars, barMask, opts).cause).toBe('unstructured');
  });
});

/**
 * `referenceStructure` — the second reading `detect.ts` pools in.
 *
 * Covered here directly rather than only through a corpus fixture, because two
 * WRONG contracts passed the whole suite when this option had no unit tests:
 * letting the pooled value waive a SUPPORT refusal, and reporting the pooled
 * value as the caller's own `structure`.
 */
describe('assessDetection — referenceStructure', () => {
  const opts = { junctionRadius: 8, supportRadius: 4, explainRadius: 4 };
  /** Four parallel bars: plenty of walls, well supported, structure 0. */
  const BARS = [0, 40, 80, 120].map((y) => seg(20, y + 20, 280, y + 20));
  const barMask = inkFor(300, 200, BARS);

  it('omitting it reproduces the pre-S26 verdict exactly', () => {
    const withOut = assessDetection(BARS, barMask, opts);
    const withSelf = assessDetection(BARS, barMask, { ...opts, referenceStructure: undefined });
    expect(withSelf).toEqual(withOut);
    expect(withOut.cause).toBe('unstructured');
  });

  it('a high reference clears the STRUCTURE gate', () => {
    const q = assessDetection(BARS, barMask, { ...opts, referenceStructure: 0.9 });
    expect(q.refusal).toBeNull();
    expect(q.cause).toBeNull();
  });

  it('...but NEVER waives a support refusal — pooling touches one gate only', () => {
    // Geometry drawn where there is no ink at all: support 0, which no second
    // reading can speak to.
    const empty = emptyMask(300, 200);
    const q = assessDetection(RECT, empty, { ...opts, referenceStructure: 1 });
    expect(q.cause).toBe('broken-lines');
    expect(q.refusal).not.toBeNull();
  });

  it('...and reports the CALLER\'s own structure, not the pooled one', () => {
    // The number on screen must describe the walls on screen. Reporting the
    // pooled value would print a structure the offered segments do not have.
    const q = assessDetection(BARS, barMask, { ...opts, referenceStructure: 0.9 });
    expect(q.structure).toBe(structureScore(BARS, opts.junctionRadius));
    expect(q.structure).toBeLessThan(MIN_STRUCTURE);
  });

  it('pins the refusal thresholds, so loosening one is visible in the diff', () => {
    // Calibrated against the enumerated corpus, and both moves are recorded in
    // `quality.ts`: 0.40 wrongly refused a plan photographed 22 degrees
    // off-square (0.364) and a heavy-poche plan with thin partitions (0.313),
    // each a 83-96 % correct read thrown away.
    expect(MIN_WALLS).toBe(3);
    expect(MIN_SUPPORT).toBe(0.55);
    expect(MIN_STRUCTURE).toBe(0.25);
  });
});
