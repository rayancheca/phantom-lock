/**
 * Binary-image stage of wall detection: page -> ink -> *just the wall ink*.
 *
 * The old pipeline decided "is this a wall?" from a connected component's
 * BOUNDING BOX SPAN, which is why a sofa survived it — a 150x80 px blob spans
 * plenty. The discriminator that actually separates walls from furniture is
 * LOCAL THICKNESS: a wall is a long thin stroke, a sofa is a fat lump, and that
 * distinction holds even when the two TOUCH and share one component (which is
 * the normal case on a real plan and the case a component filter can never
 * handle).
 *
 * Local thickness is exactly what a Euclidean distance transform measures, so
 * everything here is built on one exact EDT:
 *
 *   removeThickRegions  drop every pixel covered by an inscribed disc bigger
 *                       than a wall could be — furniture, solid fixtures, the
 *                       filled poche of a very heavy plan
 *   closeMask           fill cavity walls (drawn as two thin faces with a gap)
 *                       so they thin to ONE centreline instead of two
 *   dilate / erode      both are a threshold on a distance transform, so they
 *                       cost O(pixels) regardless of radius
 */

import type { GrayImage, Mask } from './types';
import { emptyMask } from './types';

// ---------------------------------------------------------------------------
// thresholding
// ---------------------------------------------------------------------------

/** Rec.601 luminance plus its 256-bin histogram. */
export function luminance(img: GrayImage): { gray: Uint8Array; hist: Uint32Array } {
  const n = img.width * img.height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const g = (img.data[j] * 299 + img.data[j + 1] * 587 + img.data[j + 2] * 114) / 1000;
    const gi = g | 0;
    gray[i] = gi;
    hist[gi]++;
  }
  return { gray, hist };
}

/** Otsu: the threshold maximising between-class variance. */
export function otsuThreshold(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thresh = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
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
  return thresh;
}

/**
 * Luminance + Otsu -> ink mask. Ink is taken to be the MINORITY class, which is
 * what makes a white-on-dark blueprint work without a separate code path: a
 * plan is mostly page, whichever colour the page is.
 */
export function inkMaskOf(img: GrayImage): Mask {
  const { gray, hist } = luminance(img);
  const n = img.width * img.height;
  const thresh = otsuThreshold(hist, n);
  let darkCount = 0;
  for (let i = 0; i < n; i++) if (gray[i] <= thresh) darkCount++;
  const inkIsDark = darkCount <= n - darkCount;
  const out = emptyMask(img.width, img.height);
  for (let i = 0; i < n; i++) out.data[i] = (gray[i] <= thresh) === inkIsDark ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------------------
// the exact Euclidean distance transform
// ---------------------------------------------------------------------------

const INF = 1e20;

/** Felzenszwalb & Huttenlocher's 1-D lower envelope of parabolas. */
function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * EXACT Euclidean distance from every pixel to the nearest pixel where
 * `mask.data` is `target`. O(width x height) and exact — a Chamfer
 * approximation carries several percent error, and every thickness threshold
 * downstream is a comparison against this number, so the error would land
 * straight on the wall/furniture decision boundary.
 */
export function distanceTo(mask: Mask, target: 0 | 1): Float64Array {
  const { width: w, height: h, data } = mask;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h) + 1);
  const z = new Float64Array(Math.max(w, h) + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = data[i] === target ? 0 : INF;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    dt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    dt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

/** Every pixel within `radius` of an ink pixel. */
export function dilate(mask: Mask, radius: number): Mask {
  if (radius <= 0) return mask;
  const dist = distanceTo(mask, 1);
  const out = emptyMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = dist[i] <= radius ? 1 : 0;
  return out;
}

/** Every ink pixel further than `radius` from the background. */
export function erode(mask: Mask, radius: number): Mask {
  if (radius <= 0) return mask;
  const dist = distanceTo(mask, 0);
  const out = emptyMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = dist[i] > radius ? 1 : 0;
  return out;
}

/**
 * Morphological closing — fill gaps narrower than `2 * radius`.
 *
 * This is what turns a CAVITY WALL (two thin faces with a hollow core, the way
 * architectural plans draw an exterior wall) into one solid stroke, so thinning
 * yields a single centreline. Without it every such wall is detected twice —
 * measured on the corpus as a duplication score of 45.7 %.
 *
 * The radius therefore has to exceed half the widest cavity and stay well below
 * half the narrowest DOOR OPENING, or closing would seal the doors shut too.
 */
export function closeMask(mask: Mask, radius: number): Mask {
  if (radius <= 0) return mask;
  return erode(dilate(mask, radius), radius);
}

// ---------------------------------------------------------------------------
// wall / not-wall
// ---------------------------------------------------------------------------

/**
 * Delete every pixel that lies inside an inscribed disc of radius greater than
 * `maxHalfWidth` — i.e. every pixel belonging to something FATTER than a wall.
 *
 * Why a disc and not a component: on a real plan the sofa touches the wall, the
 * kitchen counter touches two, and the bath is drawn inside the bathroom walls.
 * They share one connected component with the structure, so no component-level
 * rule (bbox span, area, aspect ratio) can separate them. Local thickness can,
 * and it does it pixel by pixel — the wall survives right up to where the blob
 * begins.
 *
 * Implemented as: erode by `maxHalfWidth` to find the fat cores, then dilate
 * the cores back out far enough to swallow the rim they came from. The rim
 * matters — without that second step every blob leaves a thin outline behind,
 * and an outline is exactly what the rest of the pipeline is looking for, so
 * the furniture would come back as a rectangle of four "walls".
 */
export function removeThickRegions(mask: Mask, maxHalfWidth: number, rim?: number): Mask {
  const cores = erode(mask, maxHalfWidth);
  let any = false;
  for (let i = 0; i < cores.data.length; i++) {
    if (cores.data[i]) {
      any = true;
      break;
    }
  }
  if (!any) return mask;
  // How wide is a blob's rim? Not `maxHalfWidth`: the farthest a boundary pixel
  // can sit from the eroded core is at a CORNER, and for a right angle that
  // distance is `maxHalfWidth * sqrt(2)`. Using the smaller figure leaves the
  // four corner pixels of every rectangular blob behind — measured exactly 4 on
  // a 41x31 test blob — and while four stray pixels never became a wall, the
  // rule the code claims to implement should be the rule it implements.
  //
  // `rim` overrides that, and the override earns its keep on the pass that runs
  // AFTER closing: a mass that closing created out of hatching has no thick rim
  // to remove — it is filled gaps between strokes that were already thin — so
  // the full rim only reaches out and eats whatever wall happens to run within
  // `maxHalfWidth` of the hatched area, which on a tiled bathroom floor is both
  // of them.
  const swallowed = dilate(cores, rim ?? maxHalfWidth * Math.SQRT2 + 1);
  const out = emptyMask(mask.width, mask.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = mask.data[i] && !swallowed.data[i] ? 1 : 0;
  return out;
}

export interface Component {
  pixels: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 8-connected components of an ink mask. */
export function components(mask: Mask): Component[] {
  const { width: w, height: h, data } = mask;
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const out: Component[] = [];
  for (let start = 0; start < n; start++) {
    if (!data[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const pixels: number[] = [];
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (top > 0) {
      const i = stack[--top];
      pixels.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (data[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack[top++] = ni;
          }
        }
      }
    }
    out.push({ pixels, minX, maxX, minY, maxY });
  }
  return out;
}

/**
 * Drop components too small to be a wall. Both tests are needed and neither is
 * redundant: `minSpan` kills a compact blob of noise that happens to be large,
 * and `minPixels` kills a sparse scatter of speckles whose bounding box is wide
 * (dimension text laid along a wall is exactly that shape).
 */
export function removeSmallComponents(mask: Mask, minSpan: number, minPixels: number): Mask {
  const out = emptyMask(mask.width, mask.height);
  for (const c of components(mask)) {
    const span = Math.max(c.maxX - c.minX, c.maxY - c.minY);
    if (span < minSpan || c.pixels.length < minPixels) continue;
    for (const i of c.pixels) out.data[i] = 1;
  }
  return out;
}

/** How many pixels are set. */
export function countInk(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i];
  return n;
}

/**
 * Mean stroke width, as ink area over centreline length.
 *
 * `skeletonPixels` must be the thinned version of the same mask. The estimate
 * is robust in the way that matters here — it does not care about the shape of
 * the stroke, only how much ink each unit of centreline carries.
 */
export function meanStrokeWidth(inkPixels: number, skeletonPixels: number): number {
  return skeletonPixels === 0 ? 0 : inkPixels / skeletonPixels;
}
