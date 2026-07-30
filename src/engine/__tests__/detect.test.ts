import { describe, expect, it } from 'vitest';
import {
  detectAtThreshold,
  detectSegments,
  detectWalls,
  inkMask,
  pxToWorld,
  segmentsToWalls,
  WALL_HALF_WIDTH_FRAC,
  WALL_HALF_WIDTH_MAX,
  WORK_MAX,
  type GrayImage,
} from '../detect';
import { inkThresholds } from '../vision/mask';
import { CORPUS, corpusFixtures, fixtureByName } from './fixtures/floorplan-corpus';
import { downscale, rasterize, scalePlan } from './fixtures/floorplan-raster';
import { scoreDetection } from './fixtures/detect-score';
import { segLength, headingGap, segHeading } from '../vision/types';
import { MIN_WALLS } from '../vision/quality';

/** Paint a synthetic floorplan: white page, dark wall strokes. */
function makePlan(
  width: number,
  height: number,
  draw: (set: (x: number, y: number) => void) => void,
): GrayImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 20;
    data[i + 3] = 255;
  };
  draw(set);
  return { data, width, height };
}

function thickLine(
  set: (x: number, y: number) => void,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thick = 3,
) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let dy = -thick; dy <= thick; dy++) {
      for (let dx = -thick; dx <= thick; dx++) set(x + dx, y + dy);
    }
  }
}

describe('inkMask', () => {
  it('marks dark strokes as ink on a light page', () => {
    const img = makePlan(60, 60, (set) => thickLine(set, 10, 30, 50, 30, 2));
    const mask = inkMask(img);
    expect(mask[30 * 60 + 30]).toBe(1);
    expect(mask[5 * 60 + 5]).toBe(0);
  });

  it('handles white-on-dark blueprints by inverting', () => {
    const img = makePlan(60, 60, () => {});
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 15;
    }
    for (let x = 10; x <= 50; x++) {
      for (let dy = -2; dy <= 2; dy++) {
        const i = ((30 + dy) * 60 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 240;
      }
    }
    const mask = inkMask(img);
    expect(mask[30 * 60 + 30]).toBe(1);
    expect(mask[5 * 60 + 5]).toBe(0);
  });
});

describe('detectSegments', () => {
  it('finds all four walls of a rectangular room', () => {
    const img = makePlan(200, 160, (set) => {
      thickLine(set, 30, 30, 170, 30);
      thickLine(set, 30, 130, 170, 130);
      thickLine(set, 30, 30, 30, 130);
      thickLine(set, 170, 30, 170, 130);
    });
    const segs = detectSegments(img);
    expect(segs.length).toBeGreaterThanOrEqual(4);
    const horiz = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 4 && Math.abs(s.b.x - s.a.x) > 100);
    const vert = segs.filter((s) => Math.abs(s.a.x - s.b.x) < 4 && Math.abs(s.b.y - s.a.y) > 70);
    expect(horiz.length).toBeGreaterThanOrEqual(2);
    expect(vert.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores small text-like specks', () => {
    const img = makePlan(200, 160, (set) => {
      thickLine(set, 30, 30, 170, 30);
      for (let k = 0; k < 8; k++) thickLine(set, 60 + k * 10, 80, 63 + k * 10, 83, 1);
    });
    const segs = detectSegments(img);
    for (const s of segs) expect(segLength(s)).toBeGreaterThan(15);
    expect(segs.some((s) => Math.abs(s.b.x - s.a.x) > 100)).toBe(true);
  });

  it('merges double-drawn wall lines into one centreline', () => {
    const img = makePlan(200, 160, (set) => {
      thickLine(set, 30, 60, 170, 60, 1);
      thickLine(set, 30, 65, 170, 65, 1); // parallel twin 5 px away
    });
    const segs = detectSegments(img);
    const horiz = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 4 && Math.abs(s.b.x - s.a.x) > 100);
    expect(horiz).toHaveLength(1);
  });
});

describe('pxToWorld', () => {
  it('maps through translation, scale, and rotation', () => {
    const u = {
      src: '',
      wPx: 100,
      hPx: 100,
      center: { x: 5, y: 5 },
      scale: 0.1,
      rotation: Math.PI / 2,
      opacity: 1,
    };
    expect(pxToWorld({ x: 50, y: 50 }, u)).toEqual({ x: 5, y: 5 });
    const p = pxToWorld({ x: 60, y: 50 }, u);
    expect(p.x).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(6, 6);
  });
});

describe('segmentsToWalls', () => {
  const u = { src: '', wPx: 200, hPx: 200, center: { x: 0, y: 0 }, scale: 0.05, rotation: 0, opacity: 1 };

  it('produces well-formed walls with distinct ids', () => {
    const walls = segmentsToWalls(
      [
        { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
        { a: { x: 100, y: 0 }, b: { x: 100, y: 100 } },
      ],
      u,
      1,
    );
    expect(walls).toHaveLength(2);
    expect(new Set(walls.map((w) => w.id)).size).toBe(2);
    for (const w of walls) {
      expect(w.kind).toBe('wall');
      expect(Number.isFinite(w.a.x)).toBe(true);
      expect(Number.isFinite(w.b.y)).toBe(true);
    }
  });

  it('divides by the work scale, so detection resolution never leaks into world metres', () => {
    const seg = [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }];
    const full = segmentsToWalls(seg, u, 1)[0];
    const halved = segmentsToWalls(seg, u, 2)[0];
    expect(halved.b.x - halved.a.x).toBeCloseTo((full.b.x - full.a.x) / 2, 9);
  });
});

// ---------------------------------------------------------------------------
// The claim this whole rewrite exists to support.
// ---------------------------------------------------------------------------

/**
 * Per-fixture floors, and the aggregate.
 *
 * These are a RATCHET, not a description: the numbers sit a little under what
 * the pipeline actually scores, so ordinary noise does not turn the suite red
 * while a real regression does. The measured values live in
 * `docs/sessions/S22/bench/`, and the pre-S22 engine scored **52.1 %** on this
 * same corpus through this same instrument — every entry here except
 * `clean-rect` and `hairline` is above anything it could reach.
 */
const FLOORS: Record<string, number> = {
  'clean-rect': 0.98,
  'thick-rect': 0.95,
  'hollow-rect': 0.95,
  'two-room': 0.95,
  'apartment-bare': 0.95,
  'apartment-furnished': 0.95,
  'apartment-annotated': 0.88,
  // ⚠️ THESE TWO ARE THE CANDIDATE-ORDER GUARD (S28). Ratcheted from 0.92 and
  // 0.85, and not for tidiness: the S28 candidate set returns the FIRST
  // non-refused reading, so swapping `inkThresholds`' order to [plain, gradient]
  // leaves the accept SET identical (a union is commutative) while returning the
  // plain reading wherever both accept — which silently reverts S27's entire
  // corpus benefit, mean 95.48 % straight back to main's 94.82 %. Measured, that
  // wrong version passes MEAN_FLOOR, every other per-fixture floor, the
  // `scan-letterbox` tone sweep and the monotonic-knob guarantee. These two
  // fixtures are where the gradient rule earns the most, so pinning them at what
  // it actually scores is what makes the order load-bearing.
  //   shipped (gradient first)  100.0 / 97.5     -> passes, 2.0 / 2.5 headroom
  //   [plain, gradient]          96.5 / 89.8     -> FAILS both
  'apartment-photo': 0.98,
  'apartment-skewed': 0.95,
  'apartment-faint': 0.95,
  blueprint: 0.95,
  'angled-wall': 0.9,
  hairline: 0.9,
  hatched: 0.85,
  'tiny-rooms': 0.8,
  'studio-open': 0.85,
  'apartment-large': 0.9,
  'apartment-cluttered': 0.75,
  'apartment-rotated': 0.8,
  'heavy-poche': 0.95,
  'oblique-survey': 0.7,
  'scan-letterbox': 0.95,
  // Measured 83.8 % at the default (80.8 / 83.8 / 74.2 across the three UI
  // levels). It costs score for two reasons worth keeping rather than tuning
  // away: the fixtures are drawn at the SAME screen tint as the walls, which is
  // the only place in the corpus that question is asked at the light tone
  // (worth 3.7 points), and the dimension chain is broken below `minSegment`
  // the way a real one is. On the S27 engine this scores 0 % — it is REFUSED.
  'screened-poche': 0.78,
};

/**
 * The aggregate floor, and a warning about it.
 *
 * This number structurally penalises adding exactly the fixtures the corpus
 * exists to accumulate: a hard case scores low BY DESIGN, so each one spends
 * headroom. Measured — the 20 pre-S26 legit fixtures mean 0.9556; adding
 * `oblique-survey` (0.7470) takes the 21 to 0.9457. Headroom over 0.92 went
 * 0.0356 -> 0.0257, i.e. room for FOUR more ~0.75 fixtures before S26, THREE
 * now.
 *
 * S27 moved it the other way for once. Gradient-weighted thresholding lifted
 * `apartment-photo` (0.965 -> 1.000), `apartment-skewed` (0.898 -> 0.975),
 * `apartment-rotated` (0.849 -> 0.866) and `oblique-survey` (0.747 -> 0.766)
 * while costing `apartment-cluttered` 0.001, taking the 21 to 0.9526; the new
 * `scan-letterbox` scores 1.000 and takes the 22 to **0.9548**. Headroom is back
 * to 0.0348 — room for about three more ~0.75 fixtures.
 *
 * Note what this floor does NOT hold: `scan-letterbox` scores 1.000 on the
 * PRE-S27 engine too (the same 22 mean 0.9482 there), because at its unperturbed
 * exposure both engines read it perfectly. A fixture whose only guard is a floor
 * it always clears would be decoration. What holds it is the tone-curve sweep
 * below, where the pre-S27 engine scores 0 % from gamma 1.03 onward.
 *
 * S28 spent headroom again, and this time in the ordinary direction: adding
 * `screened-poche` (0.838) takes the 23 to **0.9497**, leaving 0.0297 over the
 * floor — room for about two more ~0.75 fixtures. Unlike `scan-letterbox` this
 * one IS held by its own floor, because it is not a knife-edge case: the S27
 * engine scores it **0 %** at its unperturbed exposure, no tone curve required.
 */
const MEAN_FLOOR = 0.92;

/**
 * The whole corpus, detected ONCE at module scope.
 *
 * Not a micro-optimisation. Re-running detection inside each `it` passed under
 * `npm test` and TIMED OUT under `npm run test:coverage`, where v8
 * instrumentation makes the same work several times slower — the S18 lesson in
 * a new costume. Computing once removes the duplication instead of raising a
 * timeout to paper over it.
 */
const RESULTS = corpusFixtures().map((f) => {
  const res = detectWalls(f.img);
  // A refusal is what the user gets, so it is what gets scored. Scoring the raw
  // segments while the app would have shown nothing is exactly how a
  // wrongly-fired refusal stays invisible.
  const segs = res.quality.refusal ? [] : res.segments;
  return { f, res, d: scoreDetection(segs, f.truth, { tolerance: Math.max(6, f.strokeWidth) }) };
});

/**
 * Every fixture read at all three UI levels, also computed ONCE — and for the
 * same reason `RESULTS` is. Detection under `npm run test:coverage` is ~7x
 * slower than under `npm test` (measured), so 69 `detectWalls` calls inside an
 * `it` blow vitest's 5 000 ms default timeout while passing plainly. That is the
 * S18 lesson, and it had already been learned in this exact file.
 *
 * The levels are the three `useWallDetection.SENSITIVITY` can actually send. A
 * test at 0.6 would guard a value no control produces.
 */
const UI_LEVELS = [0.7, 1, 1.5];
const BY_LEVEL = corpusFixtures().map((f) => ({
  f,
  reads: UI_LEVELS.map((s) => detectWalls(f.img, { sensitivity: s })),
}));

/**
 * The tone-curve sweep, computed ONCE at module scope for the same reason
 * `RESULTS` and `BY_LEVEL` are: nine `detectWalls` calls inside an `it` pass
 * plainly under `npm test` and TIME OUT under `npm run test:coverage`, where v8
 * instrumentation makes the same work several times slower. That is the S18
 * lesson, and this file has now learned it three times.
 */
const TONE_SWEEP = (() => {
  const f = fixtureByName('scan-letterbox');
  const gamma = (g: number): GrayImage => {
    const out = new Uint8ClampedArray(f.img.data.length);
    for (let i = 0; i < out.length; i += 4) {
      for (let k = 0; k < 3; k++) out[i + k] = 255 * Math.pow(f.img.data[i + k] / 255, g);
      out[i + 3] = 255;
    }
    return { data: out, width: f.img.width, height: f.img.height };
  };
  return [0.9, 0.95, 0.97, 1, 1.02, 1.03, 1.05, 1.08, 1.1].map((g) => {
    const res = detectWalls(g === 1 ? f.img : gamma(g));
    const d = scoreDetection(res.quality.refusal ? [] : res.segments, f.truth, {
      tolerance: Math.max(6, f.strokeWidth),
    });
    return { g, refusal: res.quality.refusal, score: d.score };
  });
})();

describe('the corpus — accuracy', () => {
  const results = RESULTS;

  for (const { f, d, res } of results) {
    if (f.entry.refuse) continue;
    it(`${f.name} scores at least ${(FLOORS[f.name] * 100).toFixed(0)}% — ${f.entry.why}`, () => {
      expect(FLOORS[f.name]).toBeDefined();
      expect(res.quality.refusal).toBeNull();
      expect(d.score).toBeGreaterThanOrEqual(FLOORS[f.name]);
    });
  }

  it(`means at least ${(MEAN_FLOOR * 100).toFixed(0)}% over the whole corpus`, () => {
    const scored = results.filter((r) => !r.f.entry.refuse);
    const mean = scored.reduce((a, r) => a + r.d.score, 0) / scored.length;
    expect(mean).toBeGreaterThanOrEqual(MEAN_FLOOR);
  });

  it('never DUPLICATES a wall — the failure the owner actually reported', () => {
    for (const { f, d } of results) {
      if (f.entry.refuse) continue;
      expect(d.duplication).toBeGreaterThan(0.9);
    }
  });

  it('never emits a cross-plan beam — precision stays high on every furnished plan', () => {
    for (const name of ['apartment-furnished', 'apartment-annotated', 'studio-open']) {
      const r = results.find((x) => x.f.name === name)!;
      expect(r.d.precision).toBeGreaterThan(0.9);
    }
  });

  /**
   * THE S27 GUARANTEE: a small tone change must not decide whether a plan is
   * read at all.
   *
   * A page carrying a third tone mass puts two near-tied maxima in Otsu's
   * criterion — `scan-letterbox` measures 169 at 100.00 % against 210 at
   * 98.86 %, a 1.14 % gap — and which one wins then decides everything
   * downstream. Measured on the pre-S27 engine, this same fixture reads
   * perfectly at gamma 1.00 and 1.02 (10 walls, structure 0.750, score 100 %)
   * and is REFUSED from gamma 1.03 onward (24 walls, structure 0.125,
   * score 0 %). The owner's real plan does the same thing at 1.05.
   *
   * Note the axis. This is deliberately a gamma curve and NOT a brightness
   * offset or a gain, because those provably cannot cause it: over the owner's
   * file, gain across +/-0.3 EV refuses 0 of 46 and an additive lift refuses
   * 0 of 41, while gamma refuses 26 of 41. A test that perturbed brightness
   * would pass on the broken engine.
   */
  it('reads the same plan the same way when the tone curve moves', () => {
    for (const { g, refusal, score } of TONE_SWEEP) {
      expect(`g=${g}: ${refusal ?? 'ok'}`).toBe(`g=${g}: ok`);
      expect(`g=${g}: score ${score >= 0.9}`).toBe(`g=${g}: score true`);
    }
  });

  it('makes corners meet', () => {
    for (const name of ['clean-rect', 'thick-rect', 'hollow-rect', 'apartment-bare', 'tiny-rooms']) {
      const r = results.find((x) => x.f.name === name)!;
      expect(r.d.junctions).toBeCloseTo(1, 2);
    }
  });
});

describe('the corpus — refusal', () => {
  it('REFUSES every image with no floorplan in it, and says why', () => {
    const nulls = RESULTS.filter((r) => r.f.entry.refuse);
    expect(nulls.length).toBeGreaterThanOrEqual(2);
    for (const { res } of nulls) {
      expect(res.quality.refusal).not.toBeNull();
      expect(res.quality.refusal).toMatch(/floorplan|walls|lines/i);
    }
  });

  it('refuses a blank page', () => {
    const blank = makePlan(400, 300, () => {});
    expect(detectWalls(blank).quality.refusal).not.toBeNull();
  });

  it('does NOT refuse any legitimate plan in the corpus', () => {
    // The direct guard against the class of bug CLAUDE.md names as the worst
    // kind: a threshold that fires on real data. It caught exactly that during
    // S22 — `hairline` was refused because the corner-joining radius collapsed
    // on a thin stroke, and no test then in existence could see it.
    for (const { f, res } of RESULTS) {
      if (f.entry.refuse) continue;
      expect(res.quality.refusal).toBeNull();
    }
  });

  it('reports a confidence that ranks a clean plan above a hard one', () => {
    const at = (n: string) => RESULTS.find((r) => r.f.name === n)!.res.quality.confidence;
    expect(at('apartment-bare')).toBeGreaterThan(0.8);
    expect(at('apartment-bare')).toBeGreaterThanOrEqual(at('apartment-cluttered'));
  });
});

describe('sensitivity', () => {
  it('finds no more walls at low sensitivity and no fewer at high', () => {
    const img = fixtureByName('apartment-annotated').img;
    const low = detectWalls(img, { sensitivity: 0.5 }).segments.length;
    const mid = detectWalls(img, { sensitivity: 1 }).segments.length;
    const high = detectWalls(img, { sensitivity: 1.6 }).segments.length;
    expect(low).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(high);
  });

  it('is clamped, so a hostile value cannot disable the pipeline', () => {
    const img = fixtureByName('apartment-bare').img;
    for (const s of [-5, 0, 1e9, Number.NaN]) {
      const segs = detectWalls(img, { sensitivity: s }).segments;
      expect(Array.isArray(segs)).toBe(true);
      for (const seg of segs) expect(Number.isFinite(segLength(seg))).toBe(true);
    }
  });

  /**
   * THE MONOTONIC-KNOB GUARANTEE (S26).
   *
   * `sensitivity` scales `minSegment`, and `structure` is measured on the
   * segment population that survives it — so asking for FEWER walls
   * mechanically lowers structure, and the user's own pickiness then reads back
   * to them as evidence about their image. Measured on `oblique-survey`:
   * 0.346 at the default, 0.222 at 'Careful' — the same plan, refused only
   * because the knob was turned down.
   *
   * The knob may change WHICH walls are offered. It must never, by itself, turn
   * an image the default accepts into "this doesn't look like a floorplan".
   *
   * The levels swept here are the three `useWallDetection.SENSITIVITY` can
   * actually send. A test at 0.6 would guard a value no control produces.
   */
  it('never lets the KNOB alone turn an accepted plan into a refusal', () => {
    for (const { f, reads } of BY_LEVEL) {
      if (f.entry.refuse) continue;
      if (reads[UI_LEVELS.indexOf(1)].quality.refusal) continue;
      reads.forEach((res, i) => {
        const at = `${f.name}@${UI_LEVELS[i]}`;
        expect(`${at}: ${res.quality.refusal ?? 'ok'}`).toBe(`${at}: ok`);
      });
    }
  });

  it('...and the knob still BITES — the guarantee must not be met by disabling it', () => {
    // Without this the monotonic-knob guarantee above is satisfiable by the
    // crudest possible wrong fix: make `minSegment` ignore sensitivity below 1
    // and 'Careful' becomes a literal no-op, at which point it can never cause a
    // refusal because it can never cause anything. Measured today, 'Careful'
    // returns strictly fewer walls than the default on six fixtures
    // (apartment-annotated 12<13, apartment-photo 11<12, apartment-skewed 9<12,
    // hatched 12<14, apartment-cluttered 16<20, oblique-survey 9<13).
    let strictlyFewer = 0;
    for (const { f, reads } of BY_LEVEL) {
      if (f.entry.refuse) continue;
      const careful = reads[UI_LEVELS.indexOf(0.7)].segments.length;
      const balanced = reads[UI_LEVELS.indexOf(1)].segments.length;
      if (careful < balanced) strictlyFewer++;
    }
    expect(strictlyFewer).toBeGreaterThanOrEqual(4);
  });

  it('...and does NOT rescue a reading that is itself a scatter', () => {
    // The rescue is about the IMAGE, but what gets OFFERED is the user's own
    // reading — so it has to be worth offering.
    //
    // S26 used `oblique-survey` redrawn at 0.7x for this, which then read at
    // 'Careful' as 12 segments with not one of its 24 endpoints meeting another.
    // S27's gradient-weighted threshold reads that same drawing better and it is
    // no longer a scatter (structure 0.000 -> 0.038), so it stopped being a
    // vehicle for this guard. Searching 1 050 scaled and thinned variants of the
    // whole corpus turned up NO replacement — which is a good outcome for the
    // detector and leaves this guard with nothing in the corpus to exercise it.
    //
    // So the vehicle is built on purpose. `minSegment` is
    // `max(12, 0.05 * maxDim / sensitivity)` — 35 px at the default and 50 px at
    // 'Careful' — so corner connectors 45 px long survive the default and are
    // dropped at 'Careful'. The result is a plan that genuinely falls apart into
    // disconnected sticks when the knob is turned down: 11 segments at structure
    // 0.909 at the default, 5 segments at structure EXACTLY 0 at 'Careful'.
    //
    // Verified load-bearing rather than assumed: with the `structure > 0`
    // condition removed from `detect.ts`, this input is ACCEPTED.
    const L = 90;
    const R = 610;
    const T = 70;
    const B = 450;
    const g = 30;
    const stub = 45;
    const scatter = rasterize({
      name: 'knob-scatter',
      width: 700,
      height: 520,
      paper: 246,
      ink: 26,
      strokeWidth: 7,
      walls: [
        // four long runs that stop short of every corner...
        { a: { x: L + g, y: T }, b: { x: R - g, y: T } },
        { a: { x: R, y: T + g }, b: { x: R, y: B - g } },
        { a: { x: R - g, y: B }, b: { x: L + g, y: B } },
        { a: { x: L, y: B - g }, b: { x: L, y: T + g } },
        { a: { x: 350, y: T + g }, b: { x: 350, y: B - g } },
        // ...and the short connectors that close them, which only the default
        // sensitivity is willing to keep
        { a: { x: L + g, y: T }, b: { x: L, y: T + g } },
        { a: { x: R - g, y: T }, b: { x: R, y: T + g } },
        { a: { x: R, y: B - g }, b: { x: R - g, y: B } },
        { a: { x: L, y: B - g }, b: { x: L + g, y: B } },
        { a: { x: 350, y: T + g }, b: { x: 350 - stub, y: T + g } },
        { a: { x: 350, y: B - g }, b: { x: 350 + stub, y: B - g } },
      ],
      photo: { blur: 1, noise: 3 },
      seed: 3,
    });

    const careful = detectWalls(scatter.img, { sensitivity: 0.7 });
    expect(careful.segments.length).toBeGreaterThanOrEqual(MIN_WALLS);
    expect(careful.quality.structure).toBe(0);
    expect(careful.quality.refusal).not.toBeNull();

    // ...and the default reading really would have rescued it, so the assertion
    // above is about the guard and not about there being nothing to pool.
    const dflt = detectWalls(scatter.img, { sensitivity: 1 });
    expect(dflt.segments.length).toBeGreaterThanOrEqual(MIN_WALLS);
    expect(dflt.quality.structure).toBeGreaterThanOrEqual(0.25);
    expect(dflt.quality.refusal).toBeNull();
  });

  it('...and scores the second reading at ITS OWN corner radius, not the user\'s', () => {
    // `cornerRadius` is `max(6, strokeWidth * 2, minSegment * 0.25)`, and on every
    // corpus fixture the stroke term dominates — so scoring the reference
    // segments at the USER's radius is a no-op and no test notices. It is a
    // no-op by corpus coincidence, not by construction (the S19/S22 lesson: the
    // corpus follows the code's guards).
    //
    // Drawn thin, `minSegment * 0.25` takes over and the radii diverge.
    //
    // S26's vehicle was a thin `oblique-survey`; S27 reads that well enough that
    // it is no longer refused at all, so it stopped exercising this. Re-derived
    // by scanning 1 260 thinned and scaled variants for the case that actually
    // straddles the threshold: `apartment-cluttered` drawn at stroke 2 and
    // scaled to 0.85 gives a reference radius of 9.56 px against the user's
    // 13.66 px, and the reference segments score 0.200 at their OWN radius
    // against 0.400 at the user's — one side of MIN_STRUCTURE each.
    //
    // Verified load-bearing: scored at the user's radius, this input is ACCEPTED.
    const base = CORPUS.find((e) => e.spec.name === 'apartment-cluttered')!.spec;
    const thinned = (sw: number, heavy: number) =>
      rasterize(
        scalePlan(
          {
            ...base,
            name: `cluttered-thin-${sw}`,
            strokeWidth: sw,
            walls: base.walls.map((w) => ({
              ...w,
              thickness: (w.thickness ?? 3) > (base.strokeWidth ?? 3) ? heavy : sw,
            })),
          },
          0.85,
        ),
      );
    expect(detectWalls(thinned(2, 3).img, { sensitivity: 0.7 }).quality.refusal).not.toBeNull();
    // ...and the same drawing one step heavier IS accepted, so the assertion above
    // is about the radius rather than about thin strokes being hopeless.
    expect(detectWalls(thinned(3, 4).img, { sensitivity: 0.7 }).quality.refusal).toBeNull();
  });

  it('...and the SUPPORT half of that guard is a real implication, not a coincidence', () => {
    // `detect.ts` gates the second reading on segment COUNT alone, and justifies
    // omitting a support check by arguing that `filterBySupport` has already
    // dropped anything under `MIN_INK_SUPPORT / 1`, so the weighted mean cannot
    // fall below it. That argument has two silent dependencies — the same
    // `supportRadius` reaching both `filterBySupport` and `assessDetection`, and
    // `filterBySupport` using `>=` — and neither was executable. This makes the
    // conclusion one: every reference-eligible reading clears MIN_SUPPORT.
    for (const { f, reads } of BY_LEVEL) {
      const atDefault = reads[UI_LEVELS.indexOf(1)];
      if (atDefault.segments.length < 3) continue;
      expect(`${f.name}: support ${atDefault.quality.support.toFixed(3)}`).toBe(
        atDefault.quality.support >= 0.55
          ? `${f.name}: support ${atDefault.quality.support.toFixed(3)}`
          : `${f.name}: support >= MIN_SUPPORT`,
      );
    }
  });

  it('...and the guarantee does NOT smuggle a null through, at any level', () => {
    // The negative control for the rule above, and it is NOT decorative: the
    // first cut of that rule failed this test. `no-plan-shelf` exists because
    // pooling a second reading is safe only when that reading is itself a
    // DETECTION — its default reading is a clean 2-segment corner scoring a
    // perfect structure 0.500 while being refused for `MIN_WALLS`, and pooling
    // that number accepted 11 unrelated sticks at 'Thorough'.
    //
    // Note what is deliberately NOT asserted here any more: that a null scores
    // structure 0. The two older nulls do, which made "a null fails both arms by
    // a mile" look like a law. `no-plan-shelf` scores 0.500 on the arm that
    // matters, so the safety has to come from the guard, not from the numbers
    // happening to be small.
    for (const { f, reads } of BY_LEVEL) {
      if (!f.entry.refuse) continue;
      reads.forEach((res, i) => {
        const at = `${f.name}@${UI_LEVELS[i]}`;
        expect(`${at}: ${res.quality.refusal ? 'refused' : 'ACCEPTED'}`).toBe(`${at}: refused`);
      });
    }
  });
});

describe('negative controls — the score must be able to FALL', () => {
  // Without these, "the score went up" is unfalsifiable. Each perturbation is
  // something a plausible future edit could reintroduce; each must visibly hurt.
  const f = fixtureByName('apartment-furnished');
  const baseline = scoreDetection(detectWalls(f.img).segments, f.truth, { tolerance: 9 }).score;

  it('duplicating every wall lowers the score', () => {
    const segs = detectWalls(f.img).segments;
    const doubled = [...segs, ...segs.map((s) => ({ a: { ...s.a }, b: { ...s.b } }))];
    expect(scoreDetection(doubled, f.truth, { tolerance: 9 }).score).toBeLessThan(baseline - 0.2);
  });

  it('adding one cross-plan diagonal lowers the score', () => {
    const segs = detectWalls(f.img).segments;
    const beam = { a: { x: 60, y: 50 }, b: { x: 640, y: 470 } };
    expect(scoreDetection([...segs, beam], f.truth, { tolerance: 9 }).score).toBeLessThan(baseline - 0.05);
  });

  it('outlining the furniture lowers the score — so the thickness filter is load-bearing', () => {
    // Simulating "no thickness filter" exactly would mean editing the pipeline,
    // so this asserts the weaker, still-falsifiable thing: what the filter
    // rejects is not silently harmless. A rectangle traced around each blob —
    // precisely what a component-span filter lets through — costs real points.
    const blobOutlines = [
      { a: { x: 175, y: 110 }, b: { x: 325, y: 110 } },
      { a: { x: 325, y: 110 }, b: { x: 325, y: 190 } },
      { a: { x: 415, y: 85 }, b: { x: 585, y: 85 } },
      { a: { x: 585, y: 85 }, b: { x: 585, y: 195 } },
    ];
    const segs = detectWalls(f.img).segments;
    expect(scoreDetection([...segs, ...blobOutlines], f.truth, { tolerance: 9 }).score).toBeLessThan(
      baseline - 0.05,
    );
  });
});

/**
 * The four phone-resolution reads, rasterised and detected ONCE.
 *
 * `oblique-survey` at 2.5x is 1550x1900 and takes ~15x longer to PAINT than its
 * siblings, so doing this per-`it` cost ~750 ms twice in plain node and ~5 s
 * under coverage — which is what put these tests against the 5 000 ms ceiling.
 * Same fix, same reason, as `RESULTS` and `BY_LEVEL` above.
 */
const PHOTO_SCALE = 2.5; // 700x520 -> 1750x1300, an ordinary phone photo
const PHOTOS = ['apartment-bare', 'apartment-annotated', 'tiny-rooms', 'oblique-survey'].map((name) => {
  const entry = CORPUS.find((e) => e.spec.name === name)!;
  const big = rasterize(scalePlan(entry.spec, PHOTO_SCALE));
  // buildUnderlay caps at 1600, then detectWallsFromUnderlay caps at 900.
  const work = downscale(downscale(big.img, 1600), 900);
  const k = work.width / big.img.width;
  const truth = big.truth.map((s) => ({
    a: { x: s.a.x * k, y: s.a.y * k },
    b: { x: s.b.x * k, y: s.b.y * k },
  }));
  const res = detectWalls(work);
  const d = scoreDetection(res.quality.refusal ? [] : res.segments, truth, {
    tolerance: Math.max(6, big.strokeWidth * k),
  });
  return { name, work, res, d };
});

describe('the ink reading — which candidate answered', () => {
  /**
   * The candidate set is only measurable if the result says which cut it used.
   * A fallback that silently never runs looks exactly like one that runs and
   * agrees, so without this every claim about the S28 fix rests on an argument
   * rather than an observation.
   *
   * THE SPLIT IS THE ASSERTION. Exactly one legitimate fixture is read by the
   * runner-up — `screened-poche`, the polarity case S28 exists for — and every
   * other one is read by the best guess. Both halves are load-bearing and each
   * catches a different way of getting this wrong:
   *
   *   all cand 0   would mean the fallback is DEAD CODE, and the P0 unfixed.
   *   any other    would mean the fallback fires on ordinary plans, i.e. the
   *                gradient rule is being second-guessed where it was right,
   *                which is what makes the corpus byte-identical claim true.
   */
  it('reads every legitimate fixture at the FIRST candidate — except the polarity case', () => {
    // Reads `BY_LEVEL` rather than calling `detectWalls` again: 69 fresh calls
    // inside an `it` pass under `npm test` and TIME OUT under
    // `npm run test:coverage`, where v8 instrumentation makes the same work
    // several times slower. That is the S18 lesson, this file has now learned it
    // four times, and the fix is always to stop duplicating the work rather than
    // to raise a timeout. `BY_LEVEL` already holds exactly these readings.
    for (const { f, reads } of BY_LEVEL) {
      if (f.entry.refuse) continue;
      const rescued = f.name === 'screened-poche';
      reads.forEach((r, i) => {
        const at = `${f.name}@${UI_LEVELS[i]}`;
        expect(`${at}: cand ${r.ink.candidateIndex}`).toBe(`${at}: cand ${rescued ? 1 : 0}`);
        expect(`${at}: ${r.ink.rule}`).toBe(`${at}: ${rescued ? 'plain' : 'gradient'}`);
        expect(r.ink.value).toBeGreaterThanOrEqual(0);
        expect(r.ink.value).toBeLessThanOrEqual(255);
        expect(r.ink.starved).toBe(false);
        // the evidence, in the form the starvation floor actually tests
        expect(r.ink.edgeDensity).toBeCloseTo(
          r.ink.edgeVotes / (2 * (f.img.width + f.img.height)),
          9,
        );
      });
    }
  });

  /**
   * ...and the rescue is not cosmetic: the FIRST candidate genuinely cannot read
   * that page. Without this the split above would hold just as well if the
   * gradient rule had merely scored a point lower.
   */
  it('...and the first candidate on the polarity case is a REFUSAL, not a worse read', () => {
    const f = fixtureByName('screened-poche');
    const cands = inkThresholds(f.img);
    expect(cands.thresholds.length).toBe(2);
    const first = detectAtThreshold(f.img, cands.thresholds[0]);
    expect(first.quality.refusal).not.toBeNull();
    expect(first.segments.length).toBeLessThan(MIN_WALLS);
    // ...and the runner-up reads it, which is the whole fix in two lines.
    expect(detectAtThreshold(f.img, cands.thresholds[1]).quality.refusal).toBeNull();
  });

  /**
   * THE CASE THAT MAKES THE STARVATION GUARD LOAD-BEARING, end to end.
   *
   * The tempting argument is that the candidate set makes the guard redundant: a
   * starved page gives `otsuThreshold` zero votes, it falls through to its 127
   * initialiser, the mask comes out EMPTY, the reading is refused for
   * `too-few-lines`, and the plain candidate rescues it anyway. That holds only
   * when the page sits entirely on one side of 127.
   *
   * A flat low-contrast scan that STRADDLES it does not. Squash `hollow-rect`
   * into [125, 136] — a real drawing, cavity walls and all — and nothing clears
   * `EDGE_GATE`, so the gradient histogram is empty. Without the guard the
   * candidate list becomes [127, 130] and the accidental 127 cut produces a
   * plausible, WRONG mask that is ACCEPTED — so the correct plain cut is never
   * reached, because the fallback only runs on a refusal. Measured:
   *
   *   with the guard      cuts [130]        4 walls, 100.0 %
   *   without the guard   cuts [127, 130]   3 walls,  79.1 %
   *
   * `mask.test.ts` pins the helper-level half of this; a hard-filled two-tone
   * page cannot show it, because there every cut in [125, 135] gives the same
   * mask.
   */
  it('a starved page that straddles 127 is read on the PLAIN cut, not the accident', () => {
    const src = fixtureByName('hollow-rect');
    const data = new Uint8ClampedArray(src.img.data.length);
    for (let i = 0; i < data.length; i += 4) {
      const g =
        (src.img.data[i] * 299 + src.img.data[i + 1] * 587 + src.img.data[i + 2] * 114) / 1000;
      data[i] = data[i + 1] = data[i + 2] = Math.round(125 + (g / 255) * 11);
      data[i + 3] = 255;
    }
    const img: GrayImage = { data, width: src.img.width, height: src.img.height };

    const cands = inkThresholds(img);
    expect(cands.edgeVotes).toBe(0);
    expect(cands.starved).toBe(true);
    // The whole point: 127 is not offered, so it cannot win by arriving first.
    expect(cands.thresholds).not.toContain(127);
    expect(cands.thresholds).toHaveLength(1);

    const res = detectWalls(img);
    expect(res.quality.refusal).toBeNull();
    expect(res.segments.length).toBe(4);
    expect(
      scoreDetection(res.segments, src.truth, { tolerance: Math.max(6, src.strokeWidth) }).score,
    ).toBeGreaterThan(0.95);

    // ...and the accident really is worse, so the guard is not decoration: the
    // 127 reading is ACCEPTED, which is exactly why no fallback can save it.
    const wrong = detectAtThreshold(img, 127);
    expect(wrong.quality.refusal).toBeNull();
    expect(
      scoreDetection(wrong.segments, src.truth, { tolerance: Math.max(6, src.strokeWidth) }).score,
    ).toBeLessThan(0.85);
  });

  it('reports a STARVED page as a plain, single-candidate reading', () => {
    // Eleven levels of contrast: nothing clears the gradient gate, so there is
    // one rule and it is the plain one. Deliberately a page that STRADDLES 127,
    // where `otsuThreshold`'s zero-vote initialiser would otherwise produce a
    // plausible wrong mask rather than an empty one — see `mask.test.ts`.
    const w = 200;
    const h = 150;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 0; i < w * h; i++) data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 136;
    const stroke = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 125;
        }
    };
    stroke(20, 20, 179, 25);
    stroke(20, 124, 179, 129);
    stroke(20, 20, 25, 129);
    stroke(174, 20, 179, 129);
    const r = detectWalls({ data, width: w, height: h });
    expect(r.ink.starved).toBe(true);
    expect(r.ink.rule).toBe('plain');
    expect(r.ink.candidateCount).toBe(1);
    expect(r.ink.edgeVotes).toBe(0);
    expect(r.ink.value).not.toBe(127);
  });
});

/**
 * THE REGIME NO FIXTURE REACHED (S26).
 *
 * Every corpus fixture rasterises at 700x520 or 900x700 — at or under
 * `WORK_MAX = 900` — so `detectWallsFromUnderlay`'s downscale is a no-op on all
 * of them and none of these numbers has ever been measured at the resolution a
 * phone photo arrives at. That blind spot is how S25 came to measure a P0 at
 * 1320x1734 and believe it was the app: a full-resolution reading of the
 * owner's plan scores structure 0.231 and is REFUSED, while the same file
 * through the app's own two downscales scores 0.500 and is offered.
 *
 * No fixture can catch a harness/app mismatch — that is not a property of any
 * image. What a fixture CAN do is pin the property the mismatch hid: that a
 * plan photographed at phone resolution still reads once the app has shrunk it.
 */
describe('resolution — the app downscales before the pipeline ever runs', () => {
  it('still reads a plan photographed at phone resolution, after the downscale to WORK_MAX', () => {
    for (const { name, work, res } of PHOTOS) {
      expect(Math.max(work.width, work.height)).toBeLessThanOrEqual(900);
      expect(`${name}: ${res.quality.refusal ?? 'ok'}`).toBe(`${name}: ok`);
      expect(res.segments.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('...and the walls it finds still describe the same plan', () => {
    // Not just "did not refuse": the ground truth rides the same downscales, so
    // this is an accuracy claim at photo resolution, not a liveness one.
    for (const { name, d } of PHOTOS) {
      // A floor rather than a pin: the two downscales are an area average here
      // and Skia in the browser, so the exact figure is not reproducible across
      // them. What IS reproducible is that the read stays good.
      expect(`${name} scored ${(d.score * 100).toFixed(0)}%`).toBe(
        d.score >= 0.6 ? `${name} scored ${(d.score * 100).toFixed(0)}%` : `${name} scored >=60%`,
      );
    }
  });

  it('WORK_MAX keeps the pipeline inside the band its constants were calibrated for', () => {
    // `maxHalfWidth` is `clamp(round(0.018 * maxDim), 3, 24)`. Note the ROUND:
    // the clamp only changes the value once `0.018 * maxDim >= 24.5`, i.e. at
    // maxDim 1362, not 1334 (measured: 1361 -> 24, 1362 -> 25 clamped to 24).
    // Past there a heavy-poche wall keeps getting thicker while the "this is
    // furniture, not a wall" threshold does not. Measured on `heavy-poche` at
    // 2.5x native (1750 px): 97.5 % of the ink is deleted by
    // `removeThickRegions` and the plan is REFUSED.
    //
    // That is latent, not live, and this test is what keeps it latent: the DOM
    // wrapper's WORK_MAX must stay under the point where the clamp bites.
    //
    // The arithmetic bound is a deliberately CONSERVATIVE proxy, not the
    // measured cliff. Swept on `heavy-poche`, the plan is still accepted well
    // past 1362 — 1333 -> 10 walls / 55.3 % of ink removed, 1400 -> 15 walls,
    // 1500 -> 16 walls, all accepted — and falls off between 1500 and 1600
    // (1600 -> 6 walls, 97.6 % removed, REFUSED). So the clamp starts biting
    // before the answer breaks, which is exactly the margin worth keeping.
    const CLAMP_BITES_AT = (WALL_HALF_WIDTH_MAX + 0.5) / WALL_HALF_WIDTH_FRAC; // 1361.1
    expect(WORK_MAX).toBeLessThan(CLAMP_BITES_AT);

    // ...and demonstrate the failure it is holding back, so the bound above is
    // a measured guard rather than an assertion about arithmetic.
    const poche = CORPUS.find((e) => e.spec.name === 'heavy-poche')!;
    const unshrunk = rasterize(scalePlan(poche.spec, 2.5));
    expect(Math.max(unshrunk.img.width, unshrunk.img.height)).toBeGreaterThan(CLAMP_BITES_AT);
    expect(detectWalls(unshrunk.img).quality.refusal).not.toBeNull();
    // The same photo, once the app has shrunk it, reads fine.
    expect(detectWalls(downscale(unshrunk.img, WORK_MAX)).quality.refusal).toBeNull();
  });
});

describe('shape of the output', () => {
  it('emits axis-consistent walls on a Manhattan plan', () => {
    const res = RESULTS.find((r) => r.f.name === 'apartment-bare')!.res;
    for (const s of res.segments) {
      const g = Math.min(headingGap(segHeading(s), 0), headingGap(segHeading(s), Math.PI / 2));
      expect((g * 180) / Math.PI).toBeLessThan(1);
    }
  });

  it('PRESERVES a genuinely angled wall rather than flattening it', () => {
    const res = RESULTS.find((r) => r.f.name === 'angled-wall')!.res;
    const angled = res.segments.filter((s) => {
      const g = Math.min(headingGap(segHeading(s), 0), headingGap(segHeading(s), Math.PI / 2));
      return (g * 180) / Math.PI > 10;
    });
    expect(angled.length).toBeGreaterThanOrEqual(1);
    const d = ((segHeading(angled[0]) * 180) / Math.PI) % 180;
    expect(Math.min(Math.abs(d - 150), Math.abs(d - 30))).toBeLessThan(6);
  });

  it('returns the wall mask and a measured stroke width alongside the segments', () => {
    const entry = RESULTS.find((r) => r.f.name === 'thick-rect')!;
    const res = entry.res;
    expect(res.wallMask.width).toBe(entry.f.img.width);
    expect(res.strokeWidth).toBeGreaterThan(5);
    expect(res.strokeWidth).toBeLessThan(20);
  });

  it('survives degenerate images without throwing', () => {
    for (const [w, h] of [
      [1, 1],
      [1, 200],
      [3, 3],
    ]) {
      expect(() => detectWalls(makePlan(w, h, () => {}))).not.toThrow();
    }
  });
});
