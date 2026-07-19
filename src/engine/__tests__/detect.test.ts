import { describe, expect, it } from 'vitest';
import { detectSegments, inkMask, pxToWorld, type GrayImage } from '../detect';

/** Paint a synthetic floorplan: white page, dark wall strokes. */
function makePlan(width: number, height: number, draw: (set: (x: number, y: number) => void) => void): GrayImage {
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

function thickLine(set: (x: number, y: number) => void, x0: number, y0: number, x1: number, y1: number, thick = 3) {
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
    // Invert: dark page, light stroke.
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
      // "Text": scattered short marks that must not become walls.
      for (let k = 0; k < 8; k++) thickLine(set, 60 + k * 10, 80, 63 + k * 10, 83, 1);
    });
    const segs = detectSegments(img);
    for (const s of segs) {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      expect(len).toBeGreaterThan(15);
    }
    // The single long wall survives.
    expect(segs.some((s) => Math.abs(s.b.x - s.a.x) > 100)).toBe(true);
  });

  it('merges double-drawn wall lines into one centreline', () => {
    const img = makePlan(200, 160, (set) => {
      thickLine(set, 30, 60, 170, 60, 1);
      thickLine(set, 30, 65, 170, 65, 1); // parallel twin 5px away
    });
    const segs = detectSegments(img);
    const horiz = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 4 && Math.abs(s.b.x - s.a.x) > 100);
    expect(horiz.length).toBe(1);
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
    // Image centre maps to the underlay centre.
    expect(pxToWorld({ x: 50, y: 50 }, u)).toEqual({ x: 5, y: 5 });
    // +x in image space becomes +y after a 90° rotation.
    const p = pxToWorld({ x: 60, y: 50 }, u);
    expect(p.x).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(6, 6);
  });
});
