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
 * Minimum local intensity change, as |dx| + |dy| on the blurred page, for a
 * pixel to vote on where the ink/page threshold goes.
 *
 * Calibrated against the enumerated corpus, and the measurement is a PLATEAU
 * rather than a point: the corpus mean is flat at 95.6 % for every gate from 8
 * to 24, and the owner's real plan is accepted at every exposure for every gate
 * from 4 to 56. What bounds it on each side is a different failure:
 *
 *   too low    photographic noise clears it, and the weighting degenerates back
 *              toward the plain histogram it was meant to replace. The corpus's
 *              noisiest fixtures run at sigma 8, which a 3x3 box blur brings to
 *              about 2.7, so |dx| + |dy| of pure noise sits near 5-11.
 *   too high   a genuinely faint drawing stops voting at all. Measured, a plan
 *              with only 20 levels between ink and paper starves above gate 8 —
 *              which is what `MIN_EDGE_DENSITY` exists to catch.
 *
 * 16 sits above the noise and inside the plateau.
 */
const EDGE_GATE = 16;

/**
 * Below this many votes per unit of page PERIMETER, the gradient histogram is
 * too small a sample to be offered as a candidate at all, and the page is read
 * on the plain one alone.
 *
 * ## Why perimeter, and not area
 *
 * A vote is a pixel sitting on an intensity CHANGE, so the vote count tracks the
 * total LENGTH of ink boundary on the page. It therefore grows as k when the
 * same drawing arrives at k times the resolution, while the page area grows as
 * k^2. The pre-S28 rule divided the one by the other, so the statistic it tested
 * fell as 1/k and the guard became MORE likely to fire the LARGER the image —
 * the opposite of what a starvation test should do.
 *
 * Measured, one page-spanning 3 px stroke on an otherwise blank page:
 *
 *          700x520     1400x1040    2800x2080
 *   votes    4 200        8 400       16 800
 *   /area    1.154 %      0.577 %      0.288 %   <- halves every doubling
 *   /perim   1.721        1.721        1.721     <- bit-identical
 *
 * The consequence was not hypothetical. At 3x the old rule starved `clean-rect`
 * and `thick-rect`; at 4x it starved **9 of the 22 legitimate fixtures**
 * (clean-rect, thick-rect, two-room, apartment-bare, apartment-faint,
 * angled-wall, hairline, tiny-rooms, studio-open) plus the `no-plan` null. It
 * cost little on the corpus because on a clean two-tone page the two histograms
 * agree anyway — only `apartment-faint` at 4x actually moved, and it moved in
 * the right direction (73.9/83.5/92.2 % -> 85.7/93.8/96.5 % at the three UI
 * levels). But the page where the two rules DISAGREE is precisely the page
 * carrying a third tone mass, i.e. the one class gradient weighting exists to
 * serve, so a guard that quietly hands that class back to the plain rule as the
 * image gets bigger is a trap rather than a safety net.
 *
 * ## The constant, against the ENUMERATED protected set
 *
 * One page-spanning stroke scores 1.721, so 1.0 is "less than about half a
 * single stroke's worth of boundary on the whole page". Measured over the 25
 * corpus fixtures rasterised at 0.3x .. 4x, plus the owner's real plan through
 * the app chain:
 *
 *   faintest LEGITIMATE reading    4.896  (`clean-rect` at 0.3x)     4.9x clear
 *   faintest reading of any kind   3.197  (`no-plan-shelf` at 0.3x)  3.2x clear
 *   owner's plan, app chain       23.907                            24x  clear
 *   a 24-levels-of-contrast page   0.049                            20x  under
 *   a 20-levels-of-contrast page   0.030                            34x  under
 *   a 4-levels-of-contrast page    0.000                           fires, right
 *
 * Neither margin collapses with k, which is the whole point: under the old
 * shape the low-side margin was 2.2x at 1x and had INVERTED by 4x. Nor does it
 * collapse at the SMALL end, where perimeter normalisation might have been
 * expected to bite — a 40x30 thumbnail of a rectangle with a 2 px stroke still
 * measures 4.171.
 *
 * ONE legitimate reading in the whole sweep falls below 1.0, and it is not a
 * counter-example: `apartment-faint` at 6x measures 0.538, because `scalePlan`
 * scales the fixture's blur along with the plan, so a 6x rendering is an
 * 82-level drawing behind a sigma-6 gaussian and its gradient genuinely has
 * nothing to say. The guard's decision is INERT there — measured, the two cuts
 * are 192 and 190, the masks differ over 0.113 % of the page, and all three UI
 * levels refuse either way.
 *
 * `sqrt(width * height)` behaves identically on everything in evidence: every
 * corpus page and the owner's plan sit at perimeter/sqrt(area) = 4.02-4.04, a
 * 0.6 % spread, so the data cannot separate the two. Perimeter is chosen because
 * it is the quantity the diagnosis names, which keeps this comment and the code
 * it describes talking about the same thing.
 *
 * ## It is still load-bearing under the candidate set — measured, not assumed
 *
 * The tempting argument is that the candidate set makes this guard redundant: a
 * starved page gives `otsuThreshold` zero votes, it falls through to its 127
 * initialiser, the mask comes out EMPTY, the reading is refused for
 * `too-few-lines` and the plain candidate rescues it anyway. That is true only
 * when the page does not STRADDLE 127. `hollow-rect` compressed to an 11-level
 * page spanning [125, 136] gives zero votes, and the accidental 127 cut then
 * produces a non-empty, wrong mask that is ACCEPTED — so the plain candidate
 * never runs. Measured: with this guard 4 walls at 100.0 %, without it 3 walls
 * at 56.5 %, at all three UI levels. `mask.test.ts`'s faint-page case fails
 * outright without it (240 ink pixels become 0).
 */
const MIN_EDGE_DENSITY = 1.0;

/**
 * A histogram in which each pixel votes only if it lies on an intensity CHANGE.
 *
 * A plain histogram counts area, so a large flat region votes in proportion to
 * how much of the page it covers — even though a flat region contains no
 * information at all about where ink ends and page begins. Blank paper is the
 * benign case. The malignant one is a third tone that is neither: a grey scan
 * margin, a shadow, a letterbox bar. Big enough, and it drags the threshold
 * across itself and is admitted as ink.
 *
 * Which tone changes actually trigger it is worth knowing, because the obvious
 * word for it is the wrong one. Measured on the owner's plan through the app's
 * real chain, sweeping each axis independently:
 *
 *   nonlinear tone curve (gamma 0.90-1.30)   26 of 41 REFUSED
 *   linear gain (+/-0.3 EV, the thing a re-shoot changes)   0 of 46
 *   additive lift (+/-40 levels)                            0 of 41
 *
 * So this is NOT an exposure bug: gain preserves tone ratios and lift preserves
 * tone differences, and neither can reorder the two rival optima. A tone CURVE
 * can, because it moves the grey mass and the paper by different amounts — and
 * a tone curve is what every phone pipeline, auto-enhance and contrast slider
 * applies. The refused band is wide rather than a knife edge: continuous from
 * gamma 1.046 to about 1.31.
 *
 * The blur is not cosmetic. Photographic noise puts a gradient on every pixel,
 * so without it the gate admits nearly everything and the weighting decays back
 * into the plain histogram — measured, `apartment-photo` fell from 96.5 % to
 * 89.8 %, through its own floor. A 3x3 box drops noise by about a third while
 * leaving a real wall edge far above the gate.
 */
export function edgeWeightedHistogram(img: GrayImage, gray: Uint8Array): Uint32Array {
  const { width: w, height: h } = img;
  const out = new Uint32Array(256);
  if (w < 3 || h < 3) return out;
  // Both passes CLAMP at the border rather than skipping it. Leaving the border
  // ring of `blur` at its initial zero and then differencing across it
  // manufactures a false edge of ~250 levels around the entire image — measured,
  // that was the ONLY thing voting on an 80x60 page with 4 levels of contrast
  // (268 votes, every one of them the border), and it picked a threshold of 127
  // on a page whose ink and paper are both above 245.
  const blur = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
          s += gray[yy * w + xx];
        }
      }
      blur[y * w + x] = Math.round(s / 9);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xm = x === 0 ? i : i - 1;
      const xp = x === w - 1 ? i : i + 1;
      const ym = y === 0 ? i : i - w;
      const yp = y === h - 1 ? i : i + w;
      const g = Math.abs(blur[xp] - blur[xm]) + Math.abs(blur[yp] - blur[ym]);
      if (g > EDGE_GATE) out[gray[i]]++;
    }
  }
  return out;
}

/** A page's luminance plus the cut points worth trying on it. */
export interface InkThresholds {
  /** Rec.601 luminance, computed once and shared by every candidate. */
  gray: Uint8Array;
  /**
   * Candidate cut points, BEST GUESS FIRST and de-duplicated. Always at least
   * one; at most two.
   */
  thresholds: number[];
  /** True when too little of the page cleared `EDGE_GATE` to weight anything. */
  starved: boolean;
  /** Pixels whose local intensity change cleared `EDGE_GATE`. */
  edgeVotes: number;
  /** ...per unit of page PERIMETER, which is the form `MIN_EDGE_DENSITY` tests. */
  edgeDensity: number;
}

/**
 * Where might ink end and page begin? — as a CANDIDATE SET, not one answer.
 *
 * Two rules disagree about this, each is right about a different page, and
 * neither can be told from the other by looking at the histogram it was
 * computed from:
 *
 *   gradient-weighted   a pixel votes only if it lies on an intensity CHANGE
 *                       (see `edgeWeightedHistogram`). Immune to a large flat
 *                       third tone — a grey scan margin, a letterbox bar — which
 *                       otherwise drags a plain Otsu across itself.
 *   plain               every pixel votes. The only rule that survives ink whose
 *                       weight is UNEVEN, because gradient weighting scales a
 *                       tone's vote by its perimeter-over-area, i.e. by roughly
 *                       1/thickness: it demotes thick strokes and promotes thin
 *                       ones. On the ordinary architectural convention of walls
 *                       poche'd in a light grey and dimension lines drawn in
 *                       thin dark ink, the linework captures the threshold and
 *                       every wall falls on the page side of it.
 *
 * That second failure is not hypothetical and not marginal. Measured on a
 * 700x520 plan with ten walls at stroke 14 / ink 175 on paper 246, adding as few
 * as FOUR thin (stroke 3, ink 26) dimension lines took the gradient-weighted
 * reading from a 57-73 % detection to structure 0.000 and a refusal, on 5 of 5
 * seeds — the user told "this image doesn't have enough clear straight lines"
 * about ten unmistakable walls.
 *
 * So the fix for one polarity must not be a replacement, or it is just the other
 * polarity's bug. `detect.ts` runs the pipeline at `thresholds[0]` and falls
 * back to the next only if that reading is REFUSED — which is why this returns a
 * list rather than a decision. Measured consequences of ordering it this way:
 *
 *   - the two rules AGREE outright on 8 of the 25 corpus fixtures, so there is
 *     only one candidate on those and the fallback is not merely unused, it does
 *     not exist;
 *   - on the other 17 every legitimate fixture is accepted at `thresholds[0]` at
 *     all three UI levels, so the fallback never runs and the corpus result is
 *     byte-identical to the single-candidate engine.
 *
 * Ink is taken to be the MINORITY class at whichever cut is used, which is what
 * makes a white-on-dark blueprint work without a separate code path: a plan is
 * mostly page, whichever colour the page is.
 *
 * Two rules that did NOT work, recorded so they are not retried: breaking a
 * near-tie toward the smaller minority class moved 13 of 24 corpus masks (on a
 * clean page the criterion is a flat plateau spanning an EMPTY histogram valley,
 * so plateau noise satisfies any local-maximum test and "least ink" walks into
 * the anti-aliased edge of the stroke); and picking the emptiest cut within the
 * band moved 21 of 24. Note both of those are *unbounded* candidate sets — any
 * near-tied peak qualifies — which is why they leaked nulls where this does not.
 */
export function inkThresholds(img: GrayImage): InkThresholds {
  const { gray, hist } = luminance(img);
  const n = img.width * img.height;
  const plain = otsuThreshold(hist, n);
  const edges = edgeWeightedHistogram(img, gray);
  let edgeVotes = 0;
  for (let t = 0; t < 256; t++) edgeVotes += edges[t];
  // Starved: a page too faint for the gradient to say anything at all. There is
  // then only one rule, and it is the plain one — offering a cut derived from a
  // handful of votes as a candidate would be offering noise, and `otsuThreshold`
  // on ZERO votes does not even return noise, it returns its 127 initialiser.
  //
  // A zero-pixel image divides 0 by 0, so `edgeDensity` is NaN and `NaN < x` is
  // false — not starved. That is DELIBERATELY the same answer the area rule gave
  // (`0 < 0 * 0.02` is also false) and it costs nothing either way: with no
  // votes and no pixels both histograms are empty, `otsuThreshold` returns 127
  // from both, and the two candidates dedupe to one. Left identical rather than
  // guarded, so this line changes no behaviour anywhere.
  const edgeDensity = edgeVotes / (2 * (img.width + img.height));
  const starved = edgeDensity < MIN_EDGE_DENSITY;
  if (starved) return { gray, thresholds: [plain], starved, edgeVotes, edgeDensity };
  const grad = otsuThreshold(edges, edgeVotes);
  return {
    gray,
    thresholds: grad === plain ? [plain] : [grad, plain],
    starved,
    edgeVotes,
    edgeDensity,
  };
}

/** Binarise a page at one cut, ink = the minority class. */
export function maskAtThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  thresh: number,
): Mask {
  const n = width * height;
  let darkCount = 0;
  for (let i = 0; i < n; i++) if (gray[i] <= thresh) darkCount++;
  const inkIsDark = darkCount <= n - darkCount;
  const out = emptyMask(width, height);
  for (let i = 0; i < n; i++) out.data[i] = (gray[i] <= thresh) === inkIsDark ? 1 : 0;
  return out;
}

/**
 * The single best-guess ink mask — `inkThresholds`' first candidate.
 *
 * Kept because "binarise this page" is the honest shape of the question for a
 * caller that is not going to score the result and pick. `detect.ts` is not such
 * a caller and deliberately does not use this.
 */
export function inkMaskOf(img: GrayImage): Mask {
  const { gray, thresholds } = inkThresholds(img);
  return maskAtThreshold(gray, img.width, img.height, thresholds[0]);
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
