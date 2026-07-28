import { describe, expect, it } from 'vitest';
import { detectSegments, detectWalls, inkMask, pxToWorld, segmentsToWalls, type GrayImage } from '../detect';
import { corpusFixtures, fixtureByName } from './fixtures/floorplan-corpus';
import { scoreDetection } from './fixtures/detect-score';
import { segLength, headingGap, segHeading } from '../vision/types';

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
  'apartment-photo': 0.92,
  'apartment-skewed': 0.85,
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
};

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
