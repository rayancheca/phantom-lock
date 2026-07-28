import { describe, expect, it } from 'vitest';
import { neighbourCount, thin, thinPass } from '../thin';
import { components, countInk } from '../mask';
import { emptyMask, type Mask } from '../types';

function box(w: number, h: number, rects: Array<[number, number, number, number]>): Mask {
  const m = emptyMask(w, h);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.data[y * w + x] = 1;
  }
  return m;
}

/** Widest run of set pixels down any column, i.e. the stroke's thickness. */
function maxColumnRun(m: Mask): number {
  let worst = 0;
  for (let x = 0; x < m.width; x++) {
    let run = 0;
    for (let y = 0; y < m.height; y++) {
      run = m.data[y * m.width + x] ? run + 1 : 0;
      if (run > worst) worst = run;
    }
  }
  return worst;
}

describe('thin', () => {
  it('reduces a thick horizontal bar to a single-pixel centreline', () => {
    const m = box(60, 30, [[5, 10, 54, 20]]); // 11 px tall
    const s = thin(m);
    expect(maxColumnRun(s)).toBe(1);
    // Thinning shortens a blunt end by about half the stroke width at each end,
    // so a 50-px bar comes back around 39 px, not 50.
    expect(countInk(s)).toBeGreaterThan(35);
  });

  it('does not modify its input', () => {
    const m = box(40, 20, [[5, 8, 34, 12]]);
    const before = Array.from(m.data);
    thin(m);
    expect(Array.from(m.data)).toEqual(before);
  });

  it('PRESERVES CONNECTIVITY — a thick ring stays one component', () => {
    // A hollow rectangle drawn with 7 px walls.
    const m = box(80, 60, [
      [10, 10, 69, 16],
      [10, 43, 69, 49],
      [10, 10, 16, 49],
      [63, 10, 69, 49],
    ]);
    expect(components(m)).toHaveLength(1);
    const s = thin(m);
    expect(components(s)).toHaveLength(1);
    // `maxColumnRun` measures thickness only for horizontal strokes, and a ring
    // has vertical sides — so thinness is checked here as ink count against the
    // ring's perimeter instead: a 1-px ring of a 60x40 rectangle is ~200 px,
    // whereas the 7-px-walled input carries ~1300.
    expect(countInk(s)).toBeLessThan(260);
    expect(countInk(s)).toBeGreaterThan(150);
  });

  it('keeps a T-junction connected and thin', () => {
    const m = box(80, 60, [
      [5, 25, 74, 31], // stem across
      [37, 31, 43, 55], // branch down
    ]);
    const s = thin(m);
    expect(components(s)).toHaveLength(1);
    // A junction pixel is one with 3+ neighbours; a T must produce at least one.
    let junctions = 0;
    for (let y = 1; y < 59; y++) {
      for (let x = 1; x < 79; x++) {
        if (s.data[y * 80 + x] && neighbourCount(s, x, y) >= 3) junctions++;
      }
    }
    expect(junctions).toBeGreaterThan(0);
  });

  it('keeps an X-crossing connected', () => {
    const m = box(80, 80, [
      [5, 37, 74, 43],
      [37, 5, 43, 74],
    ]);
    const s = thin(m);
    expect(components(s)).toHaveLength(1);
  });

  it('does not erase a line end', () => {
    const m = box(60, 30, [[5, 12, 40, 18]]);
    const s = thin(m);
    let minX = 60;
    let maxX = 0;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 60; x++) {
        if (!s.data[y * 60 + x]) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    // Thinning shortens a blunt end by about half the stroke width, no more.
    expect(minX).toBeLessThanOrEqual(9);
    expect(maxX).toBeGreaterThanOrEqual(36);
  });

  it('TERMINATES — reaches a fixed point well inside the iteration cap', () => {
    const m = box(80, 80, [[5, 5, 74, 74]]); // a big solid square
    const s = thin(m, 64);
    // A further pass must remove nothing: the result is a genuine fixed point,
    // not a run that hit the cap.
    expect(thinPass(s, 0) + thinPass(s, 1)).toBe(0);
  });

  it('is idempotent', () => {
    const m = box(60, 40, [[5, 15, 54, 25]]);
    const once = thin(m);
    const twice = thin(once);
    expect(Array.from(twice.data)).toEqual(Array.from(once.data));
  });

  it('leaves a mask that is already 1 px wide alone', () => {
    const m = box(40, 20, [[5, 10, 34, 10]]);
    expect(Array.from(thin(m).data)).toEqual(Array.from(m.data));
  });

  it('handles an empty mask', () => {
    expect(countInk(thin(emptyMask(20, 20)))).toBe(0);
  });
});

describe('neighbourCount', () => {
  it('counts the 8 neighbours and clips at the border', () => {
    const m = box(10, 10, [[4, 4, 6, 6]]);
    expect(neighbourCount(m, 5, 5)).toBe(8);
    expect(neighbourCount(m, 4, 4)).toBe(3);
    const corner = box(10, 10, [[0, 0, 1, 1]]);
    expect(neighbourCount(corner, 0, 0)).toBe(3);
  });
});
