import type { Underlay, Vec2, WallObj } from './types';
import { createId, ROOM_HEIGHT } from './scene';

/** A detected wall segment in image pixel space. */
export interface PxSegment {
  a: Vec2;
  b: Vec2;
}

export interface GrayImage {
  /** RGBA bytes, as in ImageData.data. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// Tunables, expressed as fractions of the image's max dimension so the
// pipeline behaves the same across resolutions.
const MIN_SEG_FRAC = 0.09; // shortest wall worth keeping
const GAP_FRAC = 0.02; // ink gap that still counts as one wall (doors in plans)
const BAND_PX = 1.6; // how far a pixel may sit off the Hough line
const MERGE_RHO_PX = 7; // parallel lines closer than this merge (double-drawn walls)

/** Luminance + Otsu threshold → boolean ink mask (true = wall ink). Handles
 *  both dark-on-light plans and light-on-dark blueprints. */
export function inkMask(img: GrayImage): Uint8Array {
  const { data, width, height } = img;
  const n = width * height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const g = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
    const gi = g | 0;
    gray[i] = gi;
    hist[gi]++;
  }
  // Otsu: threshold maximizing between-class variance.
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thresh = t;
    }
  }
  // Ink is the minority class: invert for white-on-dark blueprints.
  let darkCount = 0;
  for (let i = 0; i < n; i++) if (gray[i] <= thresh) darkCount++;
  const inkIsDark = darkCount <= n - darkCount;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    mask[i] = (gray[i] <= thresh) === inkIsDark ? 1 : 0;
  }
  return mask;
}

/** Remove small connected components — dimension text, door arcs, hatching.
 *  Keeps components whose bounding box spans a meaningful part of the plan. */
export function dropSmallComponents(mask: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const keepSpan = Math.max(width, height) * 0.12;
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const px: number[] = [];
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (top > 0) {
      const i = stack[--top];
      px.push(i);
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 8-connected neighbours.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack[top++] = ni;
          }
        }
      }
    }
    const span = Math.max(maxX - minX, maxY - minY);
    if (span >= keepSpan) {
      for (const i of px) out[i] = 1;
    }
  }
  return out;
}

interface Peak {
  theta: number; // radians
  rho: number; // px
}

/** Hough accumulator over the ink mask; returns line peaks via greedy NMS. */
function houghPeaks(mask: Uint8Array, width: number, height: number): Peak[] {
  const diag = Math.ceil(Math.hypot(width, height));
  const nTheta = 180;
  const acc = new Uint32Array(nTheta * (2 * diag + 1));
  const sinT = new Float64Array(nTheta);
  const cosT = new Float64Array(nTheta);
  for (let t = 0; t < nTheta; t++) {
    sinT[t] = Math.sin((t * Math.PI) / nTheta);
    cosT[t] = Math.cos((t * Math.PI) / nTheta);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let t = 0; t < nTheta; t++) {
        const rho = Math.round(x * cosT[t] + y * sinT[t]) + diag;
        acc[t * (2 * diag + 1) + rho]++;
      }
    }
  }
  const minVotes = Math.max(width, height) * MIN_SEG_FRAC * 0.8;
  const peaks: Peak[] = [];
  const taken: Array<{ t: number; r: number }> = [];
  for (let iter = 0; iter < 48; iter++) {
    let bestV = 0;
    let bestT = -1;
    let bestR = 0;
    for (let t = 0; t < nTheta; t++) {
      for (let r = 0; r <= 2 * diag; r++) {
        const vv = acc[t * (2 * diag + 1) + r];
        if (vv <= bestV) continue;
        let clear = true;
        for (const tk of taken) {
          const dt = Math.min(Math.abs(tk.t - t), nTheta - Math.abs(tk.t - t));
          if (dt <= 3 && Math.abs(tk.r - r) <= MERGE_RHO_PX) {
            clear = false;
            break;
          }
        }
        if (clear) {
          bestV = vv;
          bestT = t;
          bestR = r;
        }
      }
    }
    if (bestT < 0 || bestV < minVotes) break;
    taken.push({ t: bestT, r: bestR });
    peaks.push({ theta: (bestT * Math.PI) / nTheta, rho: bestR - diag });
  }
  return peaks;
}

/** Walk the ink pixels near a Hough line and split them into runs. */
function segmentsOnLine(mask: Uint8Array, width: number, height: number, peak: Peak): PxSegment[] {
  const cos = Math.cos(peak.theta);
  const sin = Math.sin(peak.theta);
  // Collect s (position along line) for every ink pixel within the band.
  const svals: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const d = x * cos + y * sin - peak.rho;
      if (Math.abs(d) > BAND_PX + 1) continue;
      svals.push(-x * sin + y * cos);
    }
  }
  if (svals.length === 0) return [];
  svals.sort((a, b) => a - b);
  const maxDim = Math.max(width, height);
  const gap = maxDim * GAP_FRAC;
  const minLen = maxDim * MIN_SEG_FRAC;
  const out: PxSegment[] = [];
  let runStart = svals[0];
  let prev = svals[0];
  const flush = (s0: number, s1: number) => {
    if (s1 - s0 < minLen) return;
    const pt = (s: number): Vec2 => ({ x: cos * peak.rho - sin * s, y: sin * peak.rho + cos * s });
    out.push({ a: pt(s0), b: pt(s1) });
  };
  for (let i = 1; i < svals.length; i++) {
    if (svals[i] - prev > gap) {
      flush(runStart, prev);
      runStart = svals[i];
    }
    prev = svals[i];
  }
  flush(runStart, prev);
  return out;
}

/** Snap a segment's angle to 0/45/90/135° when within tolerance. */
function snapSegment(seg: PxSegment): PxSegment {
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(ang - snapped) > (6 * Math.PI) / 180) return seg;
  const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
  const ux = Math.cos(snapped);
  const uy = Math.sin(snapped);
  return {
    a: { x: mid.x - (ux * len) / 2, y: mid.y - (uy * len) / 2 },
    b: { x: mid.x + (ux * len) / 2, y: mid.y + (uy * len) / 2 },
  };
}

/** Merge overlapping collinear segments (plans draw walls as double lines). */
function mergeSegments(segs: PxSegment[]): PxSegment[] {
  const merged: PxSegment[] = [];
  const used = new Array<boolean>(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    let cur = segs[i];
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const o = segs[j];
        const d = { x: cur.b.x - cur.a.x, y: cur.b.y - cur.a.y };
        const len = Math.hypot(d.x, d.y) || 1;
        const u = { x: d.x / len, y: d.y / len };
        const angO = Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x);
        const angC = Math.atan2(d.y, d.x);
        let dAng = Math.abs(angO - angC) % Math.PI;
        if (dAng > Math.PI / 2) dAng = Math.PI - dAng;
        if (dAng > (5 * Math.PI) / 180) continue;
        // Perpendicular offset of the other segment's midpoint.
        const mid = { x: (o.a.x + o.b.x) / 2 - cur.a.x, y: (o.a.y + o.b.y) / 2 - cur.a.y };
        const off = Math.abs(-mid.x * u.y + mid.y * u.x);
        if (off > MERGE_RHO_PX) continue;
        // Overlap (or near-touch) along the shared axis?
        const s = (p: Vec2) => (p.x - cur.a.x) * u.x + (p.y - cur.a.y) * u.y;
        const [c0, c1] = [0, len];
        const [o0, o1] = [s(o.a), s(o.b)].sort((a, b) => a - b);
        if (o1 < c0 - 12 || o0 > c1 + 12) continue;
        const lo = Math.min(c0, o0);
        const hi = Math.max(c1, o1);
        cur = {
          a: { x: cur.a.x + u.x * lo, y: cur.a.y + u.y * lo },
          b: { x: cur.a.x + u.x * hi, y: cur.a.y + u.y * hi },
        };
        used[j] = true;
        changed = true;
      }
    }
    merged.push(cur);
  }
  return merged;
}

/** Pure pipeline: RGBA image → wall segments in pixel space. */
export function detectSegments(img: GrayImage): PxSegment[] {
  const mask = dropSmallComponents(inkMask(img), img.width, img.height);
  const peaks = houghPeaks(mask, img.width, img.height);
  const raw: PxSegment[] = [];
  for (const p of peaks) raw.push(...segmentsOnLine(mask, img.width, img.height, p));
  return mergeSegments(raw.map(snapSegment)).map(snapSegment);
}

/** Map a pixel-space point through the underlay transform into world metres. */
export function pxToWorld(p: Vec2, u: Underlay): Vec2 {
  const cx = (p.x - u.wPx / 2) * u.scale;
  const cy = (p.y - u.hPx / 2) * u.scale;
  const cos = Math.cos(u.rotation);
  const sin = Math.sin(u.rotation);
  return { x: u.center.x + cx * cos - cy * sin, y: u.center.y + cx * sin + cy * cos };
}

export function segmentsToWalls(segs: PxSegment[], u: Underlay, workScale: number): WallObj[] {
  return segs.map((s) => ({
    id: createId('wall'),
    kind: 'wall' as const,
    a: pxToWorld({ x: s.a.x / workScale, y: s.a.y / workScale }, u),
    b: pxToWorld({ x: s.b.x / workScale, y: s.b.y / workScale }, u),
    absorption: 0.12,
    label: 'Wall',
    height: ROOM_HEIGHT,
  }));
}

const WORK_MAX = 640;

/** DOM wrapper: rasterize the underlay image and run the pure pipeline.
 *  Returns walls in world metres (via the current underlay calibration). */
export async function detectWallsFromUnderlay(u: Underlay): Promise<WallObj[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('bad image'));
    el.src = u.src;
  });
  const k = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const segs = detectSegments({ data: data.data, width: w, height: h });
  // workScale maps detection pixels back to the underlay's own pixel grid.
  const workScale = w / u.wPx;
  return segmentsToWalls(segs, u, workScale);
}
