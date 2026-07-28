/**
 * Zhang-Suen thinning: a binary mask -> its 1-pixel-wide skeleton.
 *
 * This is the single change that removes the duplicate-wall failure at its
 * root. The old pipeline ran a Hough transform over FILLED wall strokes, so a
 * 9-px wall offered the accumulator a whole band of nearly-equal lines and the
 * greedy peak suppression kept several of them — the wall's own thickness was
 * manufacturing the duplicates. Thinning collapses the stroke to its centreline
 * first, so "one wall" is one run of pixels before anything tries to fit a line
 * to it.
 *
 * The algorithm (Zhang & Suen 1984) deletes boundary pixels in two alternating
 * sub-iterations, each with conditions chosen so that deletion can never break
 * a connected component or eat a line end. It is order-independent within a
 * sub-iteration — every deletion is decided against the SAME snapshot — which
 * is why the pass buffers its marks instead of editing in place, and is also
 * why the result does not depend on scan order.
 */

import type { Mask } from './types';

/** Neighbour offsets P2..P9, clockwise from north — the paper's numbering. */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // P2  N
  [1, -1], // P3  NE
  [1, 0], // P4  E
  [1, 1], // P5  SE
  [0, 1], // P6  S
  [-1, 1], // P7  SW
  [-1, 0], // P8  W
  [-1, -1], // P9  NW
];

/**
 * One Zhang-Suen sub-iteration. `step` 0 applies the first sub-iteration's
 * conditions (which erode the south-east boundary) and 1 the second.
 * Returns how many pixels were deleted.
 */
export function thinPass(mask: Mask, step: 0 | 1): number {
  const { width: w, height: h, data } = mask;
  const doomed: number[] = [];
  const n = new Uint8Array(8);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!data[i]) continue;
      let count = 0;
      for (let k = 0; k < 8; k++) {
        const v = data[(y + NEIGHBOURS[k][1]) * w + (x + NEIGHBOURS[k][0])];
        n[k] = v;
        count += v;
      }
      // B(P1): 2..6 neighbours — fewer is a line end, more is interior.
      if (count < 2 || count > 6) continue;
      // A(P1): exactly one 0->1 transition walking the ring. More than one
      // means the pixel joins two arms, and deleting it would disconnect them.
      let transitions = 0;
      for (let k = 0; k < 8; k++) if (n[k] === 0 && n[(k + 1) % 8] === 1) transitions++;
      if (transitions !== 1) continue;
      // The two triples that pick which boundary this sub-iteration erodes.
      const [p2, p3, p4, p5, p6, p7, p8, p9] = [n[0], n[1], n[2], n[3], n[4], n[5], n[6], n[7]];
      if (step === 0) {
        if (p2 && p4 && p6) continue;
        if (p4 && p6 && p8) continue;
      } else {
        if (p2 && p4 && p8) continue;
        if (p2 && p6 && p8) continue;
      }
      void p3;
      void p5;
      void p7;
      void p9;
      doomed.push(i);
    }
  }
  for (const i of doomed) data[i] = 0;
  return doomed.length;
}

/**
 * Thin to a skeleton. Returns a NEW mask; the input is not modified.
 *
 * Terminates because every iteration that changes anything removes at least one
 * pixel and none is ever added, so the loop is bounded by the ink count. The
 * explicit `maxIterations` is a belt-and-braces bound on that argument, not a
 * quality knob: half a wall's thickness is the real iteration count, so a 24-px
 * stroke needs ~12 rounds and the cap is never the thing that stops it.
 */
export function thin(mask: Mask, maxIterations = 64): Mask {
  const out: Mask = { data: Uint8Array.from(mask.data), width: mask.width, height: mask.height };
  for (let iter = 0; iter < maxIterations; iter++) {
    const removed = thinPass(out, 0) + thinPass(out, 1);
    if (removed === 0) break;
  }
  return out;
}

/**
 * The Rutovitz CROSSING NUMBER: how many 0->1 transitions there are walking the
 * 8-neighbour ring. This — not the raw neighbour count — is what says how many
 * BRANCHES pass through a skeleton pixel.
 *
 * The distinction is not academic, and getting it wrong loses walls. Zhang-Suen
 * does not guarantee a strictly 8-connected 1-px result: at most slopes it
 * leaves a staircase, and a staircase pixel legitimately has THREE neighbours
 * while lying in the middle of a single unbranched line:
 *
 *     ##...................
 *     ..###................
 *     ....###..............
 *
 * Counting neighbours calls every one of those a junction. Measured on an
 * isolated straight line with nothing else in the image, the raw count reports
 * 128 false junctions at 8 degrees, 203 at 30 and 310 at 40; the crossing
 * number reports ZERO at every angle, while still reporting real T- and
 * X-junctions. Since branch tracing stops at junctions, the neighbour-count
 * version shattered every non-axis-aligned wall into sub-threshold fragments —
 * a plan photographed 8 degrees off-square returned no walls at all.
 */
export function crossingNumber(mask: Mask, x: number, y: number): number {
  const { width: w, height: h, data } = mask;
  const at = (k: number): number => {
    const nx = x + NEIGHBOURS[k][0];
    const ny = y + NEIGHBOURS[k][1];
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return 0;
    return data[ny * w + nx];
  };
  let transitions = 0;
  for (let k = 0; k < 8; k++) if (at(k) === 0 && at((k + 1) % 8) === 1) transitions++;
  return transitions;
}

/** How many of the 8 neighbours are set. */
export function neighbourCount(mask: Mask, x: number, y: number): number {
  const { width: w, height: h, data } = mask;
  let c = 0;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    c += data[ny * w + nx];
  }
  return c;
}

export { NEIGHBOURS };
