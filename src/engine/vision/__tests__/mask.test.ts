import { describe, expect, it } from 'vitest';
import {
  closeMask,
  components,
  countInk,
  dilate,
  distanceTo,
  erode,
  inkMaskOf,
  inkThresholds,
  luminance,
  meanStrokeWidth,
  otsuThreshold,
  removeSmallComponents,
  removeThickRegions,
} from '../mask';
import { emptyMask, type Mask } from '../types';
import type { GrayImage } from '../types';

function page(w: number, h: number, value = 250): GrayImage {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
  }
  return { data, width: w, height: h };
}

function ink(img: GrayImage, x0: number, y0: number, x1: number, y1: number, value = 20): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    }
  }
}

function mask(w: number, h: number, set: Array<[number, number, number, number]>): Mask {
  const m = emptyMask(w, h);
  for (const [x0, y0, x1, y1] of set) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.data[y * w + x] = 1;
  }
  return m;
}

describe('luminance + otsuThreshold', () => {
  it('separates a bimodal page into its two classes', () => {
    const img = page(40, 40);
    ink(img, 10, 10, 20, 20);
    const { hist } = luminance(img);
    const t = otsuThreshold(hist, 1600);
    // Ink is 20 and page is 250; the split may sit anywhere between, inclusive
    // of the ink value itself (the comparison downstream is `<=`).
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(250);
  });

  it('never returns a threshold that puts everything in one class', () => {
    const flat = luminance(page(20, 20, 128));
    const t = otsuThreshold(flat.hist, 400);
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
  });
});

describe('inkMaskOf', () => {
  it('marks dark strokes as ink on a light page', () => {
    const img = page(40, 40);
    ink(img, 5, 18, 34, 21);
    const m = inkMaskOf(img);
    expect(m.data[20 * 40 + 20]).toBe(1);
    expect(m.data[5 * 40 + 5]).toBe(0);
  });

  it('inverts for a blueprint, because ink is the MINORITY class not the dark one', () => {
    const img = page(40, 40, 15);
    ink(img, 5, 18, 34, 21, 240);
    const m = inkMaskOf(img);
    expect(m.data[20 * 40 + 20]).toBe(1);
    expect(m.data[5 * 40 + 5]).toBe(0);
  });

  /**
   * THE S27 DEFECT, in one page.
   *
   * A plain intensity histogram counts a large FLAT region once per pixel, so a
   * region that is neither ink nor page — a grey margin, a shadow, a scan
   * border — votes in proportion to its AREA. Big enough, and it drags the
   * threshold across itself and is called ink.
   *
   * This is not hypothetical: the owner's own floorplan carries flat grey
   * letterbox bars at luminance ~198 over 11.1 % of the page, and Otsu's
   * criterion scored the two rival cuts within 2 % of each other. A 5 % exposure
   * change flipped which one won, tripled the ink, and the plan was refused as
   * "not a floorplan". See `docs/ideas.md` Section 13b.
   *
   * The fix is to weight each pixel by its local intensity CHANGE: a flat region
   * has none, so only the boundaries of things vote — which is what a threshold
   * between ink and page is supposed to be derived from in the first place.
   */
  it('does NOT call a large flat mid-tone region ink, however much of the page it covers', () => {
    const img = page(120, 90, 250);
    // a margin band of a third tone — neither the ink below nor the page around
    ink(img, 0, 0, 21, 89, 150);
    ink(img, 98, 0, 119, 89, 150);
    // the actual drawing
    ink(img, 30, 20, 90, 23, 20);
    ink(img, 30, 60, 90, 63, 20);
    ink(img, 30, 20, 33, 63, 20);

    const m = inkMaskOf(img);
    expect(m.data[45 * 120 + 60]).toBe(0); // blank page, between the strokes
    expect(m.data[21 * 120 + 60]).toBe(1); // a real stroke
    expect(m.data[45 * 120 + 10]).toBe(0); // INSIDE the left margin band
    expect(m.data[45 * 120 + 108]).toBe(0); // INSIDE the right margin band
  });

  /**
   * The same shape pushed as far as it actually goes, so the working range is
   * written down rather than assumed.
   *
   * At 40 % of the page the mid-tone already outweighs everything the drawing
   * puts on the paper, and "ink is the minority class" would be no help at all
   * — a threshold above the band makes the PAPER the minority and the strokes
   * stop being ink. Gradient weighting still gets it right because a flat band
   * contributes only its two boundaries however wide it is.
   *
   * Measured limit, for the next person: with a drawing this sparse (two
   * strokes) it holds to 50 % and breaks at 60 %, where the band's own two
   * boundaries finally outvote the drawing's edges; with five strokes it holds
   * to at least 77 %. The case this was built for — the owner's grey letterbox
   * bars — is 11.1 %.
   */
  it('still finds the ink when a flat mid-tone covers 40 % of the page', () => {
    const img = page(120, 90, 250);
    ink(img, 0, 0, 23, 89, 150);
    ink(img, 96, 0, 119, 89, 150);
    ink(img, 32, 15, 87, 18, 20);
    ink(img, 32, 70, 87, 73, 20);

    const m = inkMaskOf(img);
    expect(m.data[16 * 120 + 59]).toBe(1); // a stroke
    expect(m.data[55 * 120 + 59]).toBe(0); // paper between the strokes
    expect(m.data[45 * 120 + 12]).toBe(0); // inside the flat mid-tone
  });

  /**
   * THE SHAPE OF THE STARVATION GUARD.
   *
   * A vote is a pixel on an intensity CHANGE, so the vote count is a LENGTH and
   * grows as k when the same drawing arrives at k times the resolution. The
   * pre-S28 guard divided it by AREA, which grows as k^2 — so the statistic fell
   * as 1/k and the guard grew MORE likely to fire the larger the image, handing
   * a phone-resolution plan back to the plain histogram.
   *
   * This pins the INVARIANT rather than the constant: one page-spanning stroke
   * must score the same at every resolution.
   */
  it('measures edge evidence per unit of PAGE PERIMETER, so it does not decay with resolution', () => {
    const densities: number[] = [];
    const areaFractions: number[] = [];
    for (const k of [1, 2, 4]) {
      const img = page(700 * k, 520 * k, 246);
      // one stroke straight across the middle, 3 px at every scale
      ink(img, 0, 260 * k, 700 * k - 1, 260 * k + 2, 30);
      const t = inkThresholds(img);
      // Load-bearing, not decorative: this drawing's area fraction is 1.154 % at
      // every k, UNDER the old 2 % floor, so the pre-S28 rule starved on a
      // single clean stroke at every resolution.
      expect(t.starved).toBe(false);
      densities.push(t.edgeDensity);
      areaFractions.push(t.edgeVotes / (700 * k * 520 * k));
    }
    // The perimeter-normalised statistic is IDENTICAL across a 4x range...
    expect(densities[1]).toBeCloseTo(densities[0], 6);
    expect(densities[2]).toBeCloseTo(densities[0], 6);
    // ...and it is the same drawing, so a correct statistic MUST be flat here.
    // The old one is not: it halves on every doubling, which is the defect.
    expect(areaFractions[1]).toBeCloseTo(areaFractions[0] / 2, 4);
    expect(areaFractions[2]).toBeCloseTo(areaFractions[0] / 4, 4);
  });

  /**
   * The consequence on a plan rather than a synthetic stroke. Under the pre-S28
   * area rule the simplest fixture in the corpus starved at 3x — an ordinary
   * phone photo — and 9 of the 22 legitimate fixtures starved at 4x.
   */
  it('does NOT starve on a legitimate plan at phone resolution', () => {
    for (const k of [1, 2, 3, 4]) {
      const img = page(700 * k, 520 * k, 246);
      ink(img, 60 * k, 50 * k, 640 * k, 50 * k + 4 * k, 30);
      ink(img, 60 * k, 470 * k, 640 * k, 470 * k + 4 * k, 30);
      ink(img, 60 * k, 50 * k, 60 * k + 4 * k, 470 * k, 30);
      ink(img, 640 * k, 50 * k, 640 * k + 4 * k, 470 * k, 30);
      const t = inkThresholds(img);
      expect(t.starved).toBe(false);
      // and it is not a near miss at any of them
      expect(t.edgeDensity).toBeGreaterThan(4);
    }
  });

  /**
   * THE GUARD IS LOAD-BEARING, and the obvious argument that it is not is wrong.
   *
   * That argument: a starved page gives `otsuThreshold` zero votes, it returns
   * its 127 initialiser, the mask comes out EMPTY, the reading is refused and
   * the plain candidate rescues it anyway. True only when the page does not
   * STRADDLE 127. This one spans [125, 136] — eleven levels, nothing clears
   * `EDGE_GATE` — so the accidental 127 cut splits it into a plausible, WRONG
   * mask that a downstream reading will happily accept. Measured end to end in
   * S28: with the guard 4 walls at 100.0 %, without it 3 walls at 56.5 %.
   */
  it('offers only the PLAIN cut on a starved page, even when 127 would split it', () => {
    const img = page(200, 150, 136);
    ink(img, 20, 20, 179, 25, 125);
    ink(img, 20, 124, 179, 129, 125);
    ink(img, 20, 20, 25, 129, 125);
    ink(img, 174, 20, 179, 129, 125);
    const t = inkThresholds(img);
    expect(t.edgeVotes).toBe(0);
    expect(t.starved).toBe(true);
    // ONE candidate, and it is the plain histogram's — not [127, plain].
    expect(t.thresholds).toHaveLength(1);
    expect(t.thresholds[0]).toBe(otsuThreshold(luminance(img).hist, 200 * 150));
    expect(t.thresholds[0]).not.toBe(127);
    // ...and the mask that follows is the real drawing, not the 127 accident.
    const m = inkMaskOf(img);
    expect(m.data[22 * 200 + 100]).toBe(1); // the top wall
    expect(m.data[75 * 200 + 100]).toBe(0); // the floor between the walls
  });

  it('RECORDS the evidence the starvation floor was tested on', () => {
    const normal = page(120, 90, 250);
    ink(normal, 30, 20, 90, 23, 20);
    ink(normal, 30, 60, 90, 63, 20);
    ink(normal, 30, 20, 33, 63, 20);
    const good = inkThresholds(normal);
    expect(good.starved).toBe(false);
    expect(good.edgeVotes).toBeGreaterThan(0);
    expect(good.edgeDensity).toBeCloseTo(good.edgeVotes / (2 * (120 + 90)), 9);

    const faint = page(80, 60, 250);
    ink(faint, 10, 28, 69, 31, 246);
    const bad = inkThresholds(faint);
    expect(bad.starved).toBe(true);
    expect(bad.edgeVotes).toBe(0);
    expect(bad.edgeDensity).toBe(0);
  });

  it('falls back to the plain histogram when the page is too faint to have edges', () => {
    // 4 levels of separation: nothing clears the gradient gate, so the choice
    // must degrade to exactly what it was before gradient weighting existed —
    // never to "no ink at all".
    const faint = page(80, 60, 250);
    ink(faint, 10, 28, 69, 31, 246);
    const m = inkMaskOf(faint);
    expect(m.data[29 * 80 + 40]).toBe(1);
    expect(m.data[10 * 80 + 40]).toBe(0);
  });
});

describe('distanceTo', () => {
  it('is EXACT — matches a brute-force nearest-pixel search', () => {
    const m = mask(24, 18, [
      [3, 3, 4, 4],
      [18, 12, 19, 14],
    ]);
    const dist = distanceTo(m, 1);
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 24; x++) {
        let best = Infinity;
        for (let yy = 0; yy < 18; yy++) {
          for (let xx = 0; xx < 24; xx++) {
            if (!m.data[yy * 24 + xx]) continue;
            best = Math.min(best, Math.hypot(x - xx, y - yy));
          }
        }
        expect(dist[y * 24 + x]).toBeCloseTo(best, 9);
      }
    }
  });

  it('is 0 on the target set itself', () => {
    const m = mask(10, 10, [[4, 4, 5, 5]]);
    const d = distanceTo(m, 1);
    expect(d[4 * 10 + 4]).toBe(0);
    expect(d[0]).toBeCloseTo(Math.hypot(4, 4), 9);
  });
});

describe('dilate / erode / closeMask', () => {
  it('dilate grows by exactly the radius', () => {
    const m = mask(30, 30, [[15, 15, 15, 15]]);
    const d = dilate(m, 3);
    expect(d.data[15 * 30 + 12]).toBe(1); // exactly 3 away
    expect(d.data[15 * 30 + 11]).toBe(0); // 4 away
  });

  it('erode removes a stroke thinner than twice the radius', () => {
    const thin = mask(30, 30, [[5, 15, 25, 16]]); // 2 px tall
    expect(countInk(erode(thin, 3))).toBe(0);
    const fat = mask(30, 30, [[5, 10, 25, 22]]); // 13 px tall
    expect(countInk(erode(fat, 3))).toBeGreaterThan(0);
  });

  it('fills a gap narrower than twice the radius and leaves a wider one', () => {
    // Two 9-px-tall runs with a 6-px gap between them.
    const m = mask(60, 24, [
      [5, 6, 25, 14],
      [32, 6, 54, 14],
    ]);
    expect(closeMask(m, 5).data[10 * 60 + 28]).toBe(1);
    expect(closeMask(m, 2).data[10 * 60 + 28]).toBe(0);
  });

  it('needs the STROKE to be thick relative to the gap, not just the radius to exceed half of it', () => {
    // "Closing fills gaps up to 2r" is the naive reading and it is FALSE. What
    // dilation builds across a gap is a neck whose height falls off with
    // distance from the stroke ends, and the erode half then removes any neck
    // thinner than 2r. So a 3-px stroke bridges a 6-px gap at radius 5 but NOT
    // an 8-px one, while a 9-px stroke bridges both. Pinned because the closing
    // radius in `detect.ts` is therefore chosen against real WALL THICKNESS,
    // not against gap width alone.
    const thin = (gap: number) =>
      closeMask(
        mask(60, 24, [
          [5, 9, 25, 11],
          [26 + gap, 9, 54, 11],
        ]),
        5,
      ).data[10 * 60 + 26 + Math.floor(gap / 2)];
    expect(thin(6)).toBe(1);
    expect(thin(8)).toBe(0);
  });

  it('closeMask is a no-op at radius 0', () => {
    const m = mask(20, 20, [[5, 5, 9, 9]]);
    expect(Array.from(closeMask(m, 0).data)).toEqual(Array.from(m.data));
  });
});

describe('removeThickRegions', () => {
  it('keeps a thin wall and deletes a fat blob', () => {
    const m = mask(80, 60, [
      [5, 29, 74, 31], // 3 px wall
      [20, 40, 60, 55], // 16 px blob
    ]);
    const out = removeThickRegions(m, 5);
    expect(out.data[30 * 80 + 40]).toBe(1);
    expect(out.data[47 * 80 + 40]).toBe(0);
  });

  it('THE POINT: separates a blob that TOUCHES a wall — which no component filter can', () => {
    // One 8-connected component: a wall with a sofa pushed up against it.
    const m = mask(80, 60, [
      [5, 29, 74, 31],
      [20, 31, 60, 50],
    ]);
    expect(components(m)).toHaveLength(1);
    const out = removeThickRegions(m, 5);
    expect(out.data[30 * 80 + 10]).toBe(1); // wall, clear of the blob
    expect(out.data[45 * 80 + 40]).toBe(0); // deep inside the blob
  });

  it('swallows the blob RIM too — an outline left behind would read as four walls', () => {
    const m = mask(80, 60, [[20, 20, 60, 50]]);
    const out = removeThickRegions(m, 5);
    expect(countInk(out)).toBe(0);
  });

  it('a smaller rim leaves less of the neighbourhood eaten', () => {
    const m = mask(90, 60, [
      [5, 29, 84, 31], // wall
      [40, 36, 70, 55], // blob 5 px below it
    ]);
    const wide = removeThickRegions(m, 5);
    const narrow = removeThickRegions(m, 5, 1);
    expect(countInk(narrow)).toBeGreaterThan(countInk(wide));
  });

  it('is a no-op when nothing is thick', () => {
    const m = mask(40, 40, [[5, 19, 34, 20]]);
    expect(removeThickRegions(m, 8)).toBe(m);
  });
});

describe('components / removeSmallComponents', () => {
  it('finds 8-connected components with their bounding boxes', () => {
    const m = mask(40, 40, [
      [2, 2, 6, 6],
      [20, 20, 30, 24],
    ]);
    const cs = components(m).sort((a, b) => a.minX - b.minX);
    expect(cs).toHaveLength(2);
    expect(cs[0]).toMatchObject({ minX: 2, maxX: 6, minY: 2, maxY: 6 });
    expect(cs[1]).toMatchObject({ minX: 20, maxX: 30, minY: 20, maxY: 24 });
  });

  it('joins diagonal neighbours (8-connected, not 4)', () => {
    const m = mask(10, 10, [
      [2, 2, 2, 2],
      [3, 3, 3, 3],
    ]);
    expect(components(m)).toHaveLength(1);
  });

  it('drops by span AND by pixel count — neither test alone is enough', () => {
    const m = mask(80, 40, [
      [2, 2, 4, 4], // small every way
      [10, 10, 70, 12], // wide and solid: a wall
    ]);
    // A sparse wide scatter: wide bbox, few pixels. Text laid along a wall.
    for (let k = 0; k < 8; k++) m.data[30 * 80 + 5 + k * 8] = 1;

    const bySpanOnly = removeSmallComponents(m, 20, 0);
    const byBoth = removeSmallComponents(m, 20, 30);
    expect(bySpanOnly.data[11 * 80 + 40]).toBe(1);
    expect(byBoth.data[11 * 80 + 40]).toBe(1);
    // Individually the scatter marks are 1 px, so both filters kill them; the
    // pixel test is what kills them once closing has joined them into one run.
    expect(byBoth.data[30 * 80 + 5]).toBe(0);
    expect(countInk(byBoth)).toBeLessThanOrEqual(countInk(bySpanOnly));
  });
});

describe('meanStrokeWidth', () => {
  it('is ink area over centreline length', () => {
    expect(meanStrokeWidth(900, 100)).toBe(9);
  });

  it('is 0 rather than Infinity when there is no skeleton', () => {
    expect(meanStrokeWidth(900, 0)).toBe(0);
  });
});
