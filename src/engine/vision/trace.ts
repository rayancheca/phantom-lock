/**
 * Skeleton -> polylines -> straight segments.
 *
 * The old pipeline asked a global Hough accumulator "which infinite lines does
 * this ink support?", which is why a single line could stitch together ink from
 * a wall, a sofa and a door arc that merely happened to be collinear — the
 * cross-plan diagonal beams the owner saw. Here the question is local and
 * connected instead: FOLLOW each run of skeleton pixels, and only ink that is
 * literally joined can end up in the same segment. A diagonal beam across the
 * room cannot be produced by construction, because nothing connects its ends.
 *
 * Stages: classify pixels by neighbour count -> walk each branch between
 * endpoints/junctions -> Ramer-Douglas-Peucker to drop the staircase noise a
 * rasterised line always carries -> emit the surviving vertex-to-vertex spans.
 */

import type { Mask, PxSegment } from './types';
import { crossingNumber, neighbourCount, NEIGHBOURS } from './thin';

export type Polyline = Array<{ x: number; y: number }>;

/** Pixel roles in a thinned skeleton. */
export const enum Role {
  None = 0,
  End = 1,
  Path = 2,
  Junction = 3,
}

/**
 * Role per skeleton pixel, from the CROSSING NUMBER rather than the neighbour
 * count — see `crossingNumber` for why, and for the measurement. In short: a
 * staircase pixel in the middle of a diagonal line has three neighbours but one
 * crossing pair, and calling it a junction severs the wall it sits on.
 *
 * The neighbour count is still consulted for the isolated and terminal cases,
 * where the crossing number cannot distinguish them (a lone pixel and a line
 * end both have a crossing number of 0 and 1 respectively only by accident of
 * the ring being empty).
 */
export function classify(skeleton: Mask): Uint8Array {
  const { width: w, height: h, data } = skeleton;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!data[i]) continue;
      const n = neighbourCount(skeleton, x, y);
      if (n === 0) {
        out[i] = Role.None;
        continue;
      }
      const c = crossingNumber(skeleton, x, y);
      out[i] = c <= 1 ? Role.End : c === 2 ? Role.Path : Role.Junction;
    }
  }
  return out;
}

/**
 * Walk every branch of the skeleton graph.
 *
 * A branch runs from one node (endpoint or junction) along degree-2 pixels to
 * the next node. Degree-2 pixels are consumed as they are walked so each branch
 * is emitted once; node pixels are NOT consumed, because a junction genuinely
 * belongs to every branch that meets there — that shared endpoint is what makes
 * corners line up later.
 *
 * Closed loops (a ring of degree-2 pixels with no node anywhere on it — a round
 * room, or a circular fixture that survived filtering) have no node to start
 * from, so they get a second sweep that starts anywhere on the ring.
 */
export function tracePolylines(skeleton: Mask): Polyline[] {
  const { width: w, height: h } = skeleton;
  const role = classify(skeleton);
  const used = new Uint8Array(w * h);
  const out: Polyline[] = [];

  const at = (i: number) => ({ x: i % w, y: (i / w) | 0 });
  const neighboursOf = (i: number): number[] => {
    const x = i % w;
    const y = (i / w) | 0;
    const res: number[] = [];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (role[ni] !== Role.None) res.push(ni);
    }
    return res;
  };

  const walk = (from: number, first: number): void => {
    const line: Polyline = [at(from)];
    let prev = from;
    let cur = first;
    for (;;) {
      line.push(at(cur));
      if (role[cur] !== Role.Path) break; // reached a node
      used[cur] = 1;
      const next = neighboursOf(cur).find((n) => n !== prev && !(role[n] === Role.Path && used[n]));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (line.length >= 2) out.push(line);
  };

  for (let i = 0; i < w * h; i++) {
    if (role[i] !== Role.End && role[i] !== Role.Junction) continue;
    for (const n of neighboursOf(i)) {
      if (role[n] === Role.Path && used[n]) continue;
      // A node adjacent to another node is a one-pixel branch; emitting it is
      // harmless (it is shorter than any length threshold) and skipping it
      // would drop the only record that the two nodes touch.
      walk(i, n);
    }
  }
  // Loops with no node on them.
  for (let i = 0; i < w * h; i++) {
    if (role[i] !== Role.Path || used[i]) continue;
    used[i] = 1;
    const start = neighboursOf(i)[0];
    if (start === undefined) continue;
    walk(i, start);
  }
  return out;
}

/** Perpendicular distance from p to the line through a and b. */
function perpDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/**
 * Ramer-Douglas-Peucker. Iterative rather than recursive: a skeleton branch can
 * be thousands of pixels long, and the worst case for RDP is depth O(n).
 */
export function simplify(line: Polyline, epsilon: number): Polyline {
  if (line.length < 3) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi <= lo + 1) continue;
    let worst = 0;
    let worstAt = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDistance(line[i], line[lo], line[hi]);
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst <= epsilon || worstAt < 0) continue;
    keep[worstAt] = 1;
    stack.push([lo, worstAt], [worstAt, hi]);
  }
  const out: Polyline = [];
  for (let i = 0; i < line.length; i++) if (keep[i]) out.push(line[i]);
  return out;
}

/** Signed turn at each interior vertex of a polyline, in radians. */
export function turns(line: Polyline): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < line.length; i++) {
    const ax = line[i].x - line[i - 1].x;
    const ay = line[i].y - line[i - 1].y;
    const bx = line[i + 1].x - line[i].x;
    const by = line[i + 1].y - line[i].y;
    out.push(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  return out;
}

/** Curve tests, as fractions/radians. Exported so a test can pin them. */
export const ANNOTATION = {
  /** Monotone turning past this total says "arc", not "wall". */
  arcTotalTurn: (45 * Math.PI) / 180,
  /** ...provided no single turn is a real corner. */
  arcMaxTurn: (60 * Math.PI) / 180,
  /**
   * ...and provided the implied radius is small. A door arc is drawn at roughly
   * a door's width; a room outline that happens to bend gently is not an arc at
   * any radius a plan would draw. Expressed as a multiple of the minimum wall
   * length so it scales with the image like everything else.
   */
  arcRadiusFactor: 3,
  /** Mean turn past this, on short legs, says "text" or "hatching". */
  zigzagMeanTurn: (35 * Math.PI) / 180,
} as const;

/**
 * Does this branch read as ANNOTATION rather than a wall?
 *
 * Two shapes, and both had to be named explicitly because both survived every
 * other filter on the corpus:
 *
 *   an ARC       a door swing. Thin, long enough, real ink under it, and after
 *                simplification a chain of straight chords that all bend the
 *                SAME WAY. That monotone turning is the signature — a wall
 *                corner turns once, sharply; an arc turns repeatedly, gently.
 *
 *   a ZIGZAG     dimension text or hatching, whose marks the closing step
 *                joins into one component. It turns as much as a room outline
 *                does, so turning alone cannot separate them — what does is LEG
 *                LENGTH. A room traced as one loop has legs hundreds of pixels
 *                long; a run of text has legs the size of a glyph. Hence the
 *                `legScale` argument, and hence the test is only applied to
 *                branches whose legs are short.
 */
export function looksLikeAnnotation(simplified: Polyline, legScale: number): boolean {
  const legCount = simplified.length - 1;
  if (legCount < 2) return false;
  const t = turns(simplified);
  if (t.length === 0) return false;
  const total = t.reduce((a, v) => a + Math.abs(v), 0);
  const maxTurn = Math.max(...t.map(Math.abs));
  let path = 0;
  for (let i = 0; i + 1 < simplified.length; i++) {
    path += Math.hypot(simplified[i + 1].x - simplified[i].x, simplified[i + 1].y - simplified[i].y);
  }

  const monotone = t.every((v) => v > 0) || t.every((v) => v < 0);
  if (monotone && total > ANNOTATION.arcTotalTurn && maxTurn < ANNOTATION.arcMaxTurn) {
    // The implied radius is the discriminator, and it had to be added: thinning
    // CHAMFERS a right-angle corner, so a plain rectangular room came back as
    // two 45-degree bends — monotone, under the max-turn gate, and therefore
    // read as an arc. The whole ring was dropped and `hollow-rect` scored ZERO.
    // A door arc turns 45 degrees over ~50 px; a room turns it over ~1000.
    const impliedRadius = total > 0 ? path / total : Infinity;
    if (impliedRadius < legScale * ANNOTATION.arcRadiusFactor) return true;
  }

  if (legCount >= 3 && path / legCount < legScale && total / t.length > ANNOTATION.zigzagMeanTurn) {
    return true;
  }
  return false;
}

/**
 * Polyline -> straight spans. Each simplified vertex-to-vertex leg becomes one
 * candidate segment; legs shorter than `minLength` are dropped rather than
 * merged, because a short leg at a corner is a rasterisation artefact and
 * absorbing it would bend the wall it sits on.
 *
 * `legScale` is the length below which a leg is "short" for the annotation
 * test — pass the same minimum-wall scale the caller uses elsewhere.
 */
export function polylineToSegments(
  line: Polyline,
  epsilon: number,
  minLength: number,
  legScale = 0,
): PxSegment[] {
  const simple = simplify(line, epsilon);
  if (legScale > 0 && looksLikeAnnotation(simple, legScale)) return [];
  const out: PxSegment[] = [];
  for (let i = 0; i + 1 < simple.length; i++) {
    const a = simple[i];
    const b = simple[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < minLength) continue;
    out.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  }
  return out;
}

/** Trace + simplify the whole skeleton in one call. */
export function skeletonToSegments(
  skeleton: Mask,
  epsilon: number,
  minLength: number,
  legScale = 0,
): PxSegment[] {
  const out: PxSegment[] = [];
  for (const line of tracePolylines(skeleton)) {
    out.push(...polylineToSegments(line, epsilon, minLength, legScale));
  }
  return out;
}
