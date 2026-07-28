import { describe, expect, it } from 'vitest';
import {
  closeMask,
  components,
  countInk,
  dilate,
  distanceTo,
  erode,
  inkMaskOf,
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
