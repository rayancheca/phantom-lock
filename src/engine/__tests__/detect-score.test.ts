/**
 * Tests for the MEASURING INSTRUMENT.
 *
 * `detect-score.ts` is what the whole session's "52.1 % -> 97.8 %" claim rests
 * on, and `floorplan-raster.ts` is what produces the questions it answers. If
 * either is wrong, every number in the handoff is wrong and nothing else in the
 * suite would notice. So both are tested against hand-built cases whose right
 * answer is known by arithmetic rather than by running the detector.
 */

import { describe, expect, it } from 'vitest';
import { scoreDetection } from './fixtures/detect-score';
import { rasterize, rng, type PlanSpec } from './fixtures/floorplan-raster';
import { CORPUS, corpusFixtures } from './fixtures/floorplan-corpus';
import type { PxSegment } from '../detect';

/** A 200x100 rectangle of four walls, as ground truth. */
const RECT: PxSegment[] = [
  { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
  { a: { x: 200, y: 0 }, b: { x: 200, y: 100 } },
  { a: { x: 200, y: 100 }, b: { x: 0, y: 100 } },
  { a: { x: 0, y: 100 }, b: { x: 0, y: 0 } },
];

/** The same rectangle plus one interior wall — 700 px of truth in total. */
const RECT_PLUS_INTERIOR: PxSegment[] = [...RECT, { a: { x: 100, y: 0 }, b: { x: 100, y: 100 } }];

describe('scoreDetection — the degenerate outputs it must punish', () => {
  it('scores a perfect detection at 1', () => {
    const d = scoreDetection(RECT, RECT);
    expect(d.score).toBeCloseTo(1, 2);
    expect(d.coverage).toBeCloseTo(1, 2);
    expect(d.precision).toBeCloseTo(1, 2);
  });

  it('scores an empty detection at 0 — "find nothing" must never look safe', () => {
    const d = scoreDetection([], RECT);
    expect(d.score).toBe(0);
    expect(d.coverage).toBe(0);
  });

  it('halves the score when every wall is delivered twice', () => {
    // The duplicate lies exactly ON a real wall, so PRECISION cannot see it.
    // That is why the score counts redundant length as work the user must undo.
    const doubled = [...RECT, ...RECT.map((s) => ({ a: { ...s.a }, b: { ...s.b } }))];
    const d = scoreDetection(doubled, RECT);
    expect(d.precision).toBeCloseTo(1, 2); // precision is blind to it...
    expect(d.duplication).toBeCloseTo(0.5, 1); // ...duplication is not
    expect(d.score).toBeGreaterThan(0.45);
    expect(d.score).toBeLessThan(0.55);
  });

  it('marks a bounding-box-only answer as visibly short of the interior', () => {
    const d = scoreDetection(RECT, RECT_PLUS_INTERIOR);
    // 600 of 700 px of truth found, nothing spurious.
    expect(d.coverage).toBeCloseTo(600 / 700, 2);
    expect(d.precision).toBeCloseTo(1, 2);
    expect(d.score).toBeGreaterThan(0.8);
    expect(d.score).toBeLessThan(0.9);
  });

  it('tanks on a cross-plan diagonal beam — the exact failure this rewrite exists to remove', () => {
    const beam: PxSegment = { a: { x: 0, y: 0 }, b: { x: 200, y: 100 } };
    const d = scoreDetection([...RECT, beam], RECT);
    expect(d.precision).toBeLessThan(0.8);
    expect(d.score).toBeLessThan(0.8);
  });

  it('penalises a split wall only mildly — the app stores walls as separate objects anyway', () => {
    const split: PxSegment[] = [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { a: { x: 100, y: 0 }, b: { x: 200, y: 0 } },
      ...RECT.slice(1),
    ];
    const d = scoreDetection(split, RECT);
    expect(d.coverage).toBeCloseTo(1, 2);
    expect(d.fragmentation).toBeLessThan(1);
    expect(d.score).toBeGreaterThan(0.9);
  });

  it('does not credit a perpendicular crossing as coverage', () => {
    // A vertical line crossing the top wall touches it, but is not it. Without
    // the parallelism gate a diagonal beam would be credited with every wall it
    // crosses, and the score would reward exactly the wrong thing.
    const crossing: PxSegment[] = [{ a: { x: 100, y: -50 }, b: { x: 100, y: 50 } }];
    const d = scoreDetection(crossing, [RECT[0]]);
    expect(d.coverage).toBeLessThan(0.1);
  });

  it('reports junctions: a closed rectangle meets at every corner, a scatter does not', () => {
    expect(scoreDetection(RECT, RECT).junctions).toBeCloseTo(1, 2);
    const shrunk = RECT.map((s) => ({
      a: { x: s.a.x + (s.b.x - s.a.x) * 0.2, y: s.a.y + (s.b.y - s.a.y) * 0.2 },
      b: { x: s.a.x + (s.b.x - s.a.x) * 0.8, y: s.a.y + (s.b.y - s.a.y) * 0.8 },
    }));
    expect(scoreDetection(shrunk, RECT).junctions).toBeLessThan(0.5);
  });

  it('treats an off-by-tolerance detection as a hit and an off-by-more one as a miss', () => {
    const near = RECT.map((s) => ({ a: { x: s.a.x, y: s.a.y + 3 }, b: { x: s.b.x, y: s.b.y + 3 } }));
    const far = RECT.map((s) => ({ a: { x: s.a.x, y: s.a.y + 40 }, b: { x: s.b.x, y: s.b.y + 40 } }));
    expect(scoreDetection(near, RECT, { tolerance: 6 }).coverage).toBeGreaterThan(0.7);
    expect(scoreDetection(far, RECT, { tolerance: 6 }).coverage).toBeLessThan(0.3);
  });
});

describe('floorplan-raster — the corpus generator', () => {
  const base: PlanSpec = {
    name: 't',
    width: 120,
    height: 80,
    strokeWidth: 5,
    walls: [{ a: { x: 20, y: 40 }, b: { x: 100, y: 40 } }],
  };

  it('paints ink where it says it did, and page everywhere else', () => {
    const f = rasterize(base);
    const at = (x: number, y: number) => f.img.data[(y * f.img.width + x) * 4];
    expect(at(60, 40)).toBeLessThan(80); // on the wall
    expect(at(60, 10)).toBeGreaterThan(200); // page
  });

  it('hands back the centrelines it painted as ground truth', () => {
    const f = rasterize(base);
    expect(f.truth).toEqual([{ a: { x: 20, y: 40 }, b: { x: 100, y: 40 } }]);
  });

  it('excludes decoy strokes from ground truth but still paints them', () => {
    const f = rasterize({
      ...base,
      walls: [...base.walls, { a: { x: 20, y: 70 }, b: { x: 100, y: 70 }, decoy: true }],
    });
    expect(f.truth).toHaveLength(1);
    expect(f.img.data[(70 * f.img.width + 60) * 4]).toBeLessThan(80);
  });

  it('rotates the ground truth with the drawing, so the answer key never desynchronises', () => {
    const f = rasterize({ ...base, photo: { rotate: 90 } });
    // A horizontal wall through the page centre becomes vertical through it.
    expect(f.truth[0].a.x).toBeCloseTo(60, 5);
    expect(f.truth[0].b.x).toBeCloseTo(60, 5);
    expect(Math.abs(f.truth[0].b.y - f.truth[0].a.y)).toBeCloseTo(80, 5);
  });

  it('inverts the page for a blueprint, keeping ink the minority class', () => {
    const plain = rasterize(base);
    const blue = rasterize({ ...base, blueprint: true });
    const i = (40 * base.width + 60) * 4;
    expect(plain.img.data[i] + blue.img.data[i]).toBe(255);
  });

  it('is DETERMINISTIC — the same spec gives byte-identical pixels', () => {
    const noisy: PlanSpec = { ...base, photo: { noise: 20, blur: 1, gradient: 30 }, seed: 9 };
    expect(Array.from(rasterize(noisy).img.data)).toEqual(Array.from(rasterize(noisy).img.data));
  });

  it('changes with the seed, so a "deterministic" claim is not vacuous', () => {
    const a = rasterize({ ...base, photo: { noise: 20 }, seed: 1 });
    const b = rasterize({ ...base, photo: { noise: 20 }, seed: 2 });
    expect(Array.from(a.img.data)).not.toEqual(Array.from(b.img.data));
  });

  it('draws a hollow wall as two faces with a gap between them', () => {
    const f = rasterize({
      ...base,
      walls: [{ a: { x: 20, y: 40 }, b: { x: 100, y: 40 }, thickness: 14, hollow: true }],
    });
    const at = (y: number) => f.img.data[(y * f.img.width + 60) * 4];
    expect(at(33)).toBeLessThan(90); // upper face
    expect(at(40)).toBeGreaterThan(200); // the cavity
    expect(at(47)).toBeLessThan(90); // lower face
  });
});

describe('rng', () => {
  it('is uniform enough and repeatable', () => {
    const a = rng(42);
    const b = rng(42);
    const values = Array.from({ length: 500 }, () => a());
    expect(values).toEqual(Array.from({ length: 500 }, () => b()));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });
});

describe('the corpus itself', () => {
  it('has a fixture for every regime the tuning is calibrated against', () => {
    const names = CORPUS.map((c) => c.spec.name);
    // These are not decoration: each one is a regime a constant was tuned for,
    // and deleting one silently un-protects that regime.
    for (const required of [
      'hollow-rect', // the closing radius
      'apartment-furnished', // the thickness filter
      'apartment-photo', // Otsu under noise and uneven lighting
      'apartment-skewed', // the dominant-angle estimate
      'blueprint', // the minority-class inversion
      'angled-wall', // the snap tolerance
      'hairline', // every stroke-derived constant, at its floor
      'hatched', // the SECOND thickness pass
      'tiny-rooms', // the minimum wall length
      'apartment-large', // the low-structure regime the refusal must not reject
      'no-plan', // the refusal
    ]) {
      expect(names).toContain(required);
    }
  });

  it('rasterises every entry, with ground truth and non-blank pixels', () => {
    for (const f of corpusFixtures()) {
      expect(f.img.width * f.img.height).toBeGreaterThan(1000);
      if (f.entry.refuse) {
        expect(f.truth).toHaveLength(0);
      } else {
        expect(f.truth.length).toBeGreaterThan(0);
      }
      // A guard against a silently blank fixture: the S7 lesson that a scan
      // finding nothing must fail rather than pass. It is written against the
      // MODAL page value rather than a fixed "dark" cutoff, because two
      // fixtures break that assumption in opposite directions — `blueprint`
      // draws light ink on a dark page, and `apartment-faint` draws ink at
      // luminance 150, which no dark threshold would count at all.
      const hist = new Uint32Array(256);
      for (let i = 0; i < f.img.data.length; i += 4) hist[f.img.data[i]]++;
      let page = 0;
      for (let v = 1; v < 256; v++) if (hist[v] > hist[page]) page = v;
      let inked = 0;
      for (let i = 0; i < f.img.data.length; i += 4) if (Math.abs(f.img.data[i] - page) > 30) inked++;
      expect(inked).toBeGreaterThan(200);
    }
  });
});
