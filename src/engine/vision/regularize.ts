/**
 * GLOBAL regularization — the stage the old pipeline had no equivalent of.
 *
 * Tracing gives locally-correct segments that are globally ragged: a wall
 * traced from a rasterised stroke sits a degree or two off true, two halves of
 * the same wall land on offsets a pixel apart, and corners overshoot or fall
 * short. `snapSegment` used to fix the ANGLE of each segment in isolation,
 * which cannot make two walls agree with each other; regularization looks at
 * every segment at once and asks what STRUCTURE they are evidence for.
 *
 * Four stages, in this order for a reason:
 *
 *  1. `dominantAngle`   estimate the plan's own axis from a length-weighted
 *                       histogram, so a photo shot 4 degrees off-square is
 *                       straightened rather than treated as 40 crooked walls
 *  2. `snapToAxes`      rotate each segment onto the nearest axis IF it is
 *                       already close. A wall at 30 degrees is NOT close, and
 *                       is deliberately left alone — silently flattening a real
 *                       angled wall would be worse than any duplicate
 *  3. `mergeCollinear`  gather segments onto shared lines and emit one span per
 *                       run of ink. This is what collapses duplicates AND
 *                       rejoins fragments, while a run separated by more than
 *                       `joinGap` stays two segments, so DOORWAYS survive
 *  4. `joinCorners`     pull near-meeting endpoints onto the exact intersection
 *                       of their two lines, so corners meet
 */

import type { Mask, PxSegment } from './types';
import { headingGap, segHeading, segLength } from './types';

export interface RegularizeOptions {
  /** Max deviation from a dominant axis that still gets snapped, radians. */
  snapAngle: number;
  /** Max heading difference for two segments to be considered parallel, radians. */
  parallelAngle: number;
  /** Max perpendicular distance for two parallel segments to be the same wall, px. */
  mergeDistance: number;
  /** Along-axis gap that still joins two pieces of one wall, px. */
  joinGap: number;
  /** Endpoint proximity that becomes a shared corner, px. */
  cornerRadius: number;
  /** Segments shorter than this are dropped, px. */
  minLength: number;
}

// ---------------------------------------------------------------------------
// 1. the plan's own axis
// ---------------------------------------------------------------------------

const HIST_BINS = 180; // 0.5 degrees per bin over a 90-degree fold

/**
 * The plan's dominant axis, in [0, PI/2).
 *
 * Headings are folded modulo 90 degrees because a Manhattan floorplan's two
 * axes are the same evidence for the same rotation — folding doubles the sample
 * and removes the question of which axis is "the" one. Bins are
 * length-weighted: one 400-px wall says far more about the plan's orientation
 * than ten 20-px fragments of door frame.
 *
 * Returns 0 for an empty input, which is exactly right — no evidence means no
 * rotation, and `snapToAxes` then snaps to true horizontal/vertical.
 */
export function dominantAngle(segs: PxSegment[]): number {
  if (segs.length === 0) return 0;
  const quarter = Math.PI / 2;
  const hist = new Float64Array(HIST_BINS);
  for (const s of segs) {
    const folded = segHeading(s) % quarter;
    const bin = Math.min(HIST_BINS - 1, Math.floor((folded / quarter) * HIST_BINS));
    hist[bin] += segLength(s);
  }
  // Smooth by one bin either side; a rasterised wall's heading straddles bins.
  let bestBin = 0;
  let best = -1;
  for (let i = 0; i < HIST_BINS; i++) {
    const v = hist[(i - 1 + HIST_BINS) % HIST_BINS] + hist[i] + hist[(i + 1) % HIST_BINS];
    if (v > best) {
      best = v;
      bestBin = i;
    }
  }
  const peak = ((bestBin + 0.5) / HIST_BINS) * quarter;
  // Refine: length-weighted mean of everything within a few degrees of the peak,
  // measured on the circle so the wrap at 0/90 does not drag the mean.
  const window = (4 * Math.PI) / 180;
  let sumSin = 0;
  let sumCos = 0;
  let weight = 0;
  for (const s of segs) {
    const folded = segHeading(s) % quarter;
    let d = folded - peak;
    if (d > quarter / 2) d -= quarter;
    if (d < -quarter / 2) d += quarter;
    if (Math.abs(d) > window) continue;
    const w = segLength(s);
    // Map the 90-degree period onto a full circle before averaging.
    sumSin += w * Math.sin(4 * folded);
    sumCos += w * Math.cos(4 * folded);
    weight += w;
  }
  if (weight === 0) return peak;
  const mean = Math.atan2(sumSin / weight, sumCos / weight) / 4;
  return ((mean % quarter) + quarter) % quarter;
}

// ---------------------------------------------------------------------------
// 2. snap to the dominant axes
// ---------------------------------------------------------------------------

/**
 * Rotate each segment about its midpoint onto the nearer dominant axis, but
 * ONLY when it is already within `snapAngle`.
 *
 * The guard is the whole point. A floorplan is mostly Manhattan and snapping
 * makes it read as drawn rather than sketched — but "mostly" is not "always",
 * and a genuinely angled wall (a bay, a corner cut, a chamfered hall) is real
 * geometry the user would have to redraw if it were flattened. Silently
 * rotating a real wall is a data-quality bug of the same family as a cap that
 * fires on real data, so the tolerance stays tight enough that 30 degrees is
 * never mistaken for 0.
 */
export function snapToAxes(segs: PxSegment[], theta0: number, snapAngle: number): PxSegment[] {
  return segs.map((s) => {
    const h = segHeading(s);
    let bestAxis = theta0;
    let bestGap = Infinity;
    for (const axis of [theta0, theta0 + Math.PI / 2]) {
      const g = headingGap(h, axis);
      if (g < bestGap) {
        bestGap = g;
        bestAxis = axis;
      }
    }
    if (bestGap > snapAngle) return s;
    const len = segLength(s);
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    // Keep the original direction of travel so endpoint order is stable.
    const along = Math.cos(bestAxis) * (s.b.x - s.a.x) + Math.sin(bestAxis) * (s.b.y - s.a.y);
    const sign = along < 0 ? -1 : 1;
    const ux = Math.cos(bestAxis) * sign;
    const uy = Math.sin(bestAxis) * sign;
    return {
      a: { x: mid.x - (ux * len) / 2, y: mid.y - (uy * len) / 2 },
      b: { x: mid.x + (ux * len) / 2, y: mid.y + (uy * len) / 2 },
    };
  });
}

// ---------------------------------------------------------------------------
// 3. collinear grouping and span merge
// ---------------------------------------------------------------------------

interface LineGroup {
  /** Unit direction. */
  ux: number;
  uy: number;
  /** A point on the line. */
  px: number;
  py: number;
  heading: number;
  members: PxSegment[];
  weight: number;
}

function projectAlong(g: LineGroup, p: { x: number; y: number }): number {
  return (p.x - g.px) * g.ux + (p.y - g.py) * g.uy;
}

function projectAcross(g: LineGroup, p: { x: number; y: number }): number {
  return -(p.x - g.px) * g.uy + (p.y - g.py) * g.ux;
}

/** Re-fit the group's line as the length-weighted mean of its members. */
function refit(g: LineGroup): void {
  let sumSin = 0;
  let sumCos = 0;
  let cx = 0;
  let cy = 0;
  let w = 0;
  for (const s of g.members) {
    const len = segLength(s);
    const h = segHeading(s);
    // Double the angle so headings PI apart (the same line) average correctly.
    sumSin += len * Math.sin(2 * h);
    sumCos += len * Math.cos(2 * h);
    cx += (len * (s.a.x + s.b.x)) / 2;
    cy += (len * (s.a.y + s.b.y)) / 2;
    w += len;
  }
  if (w === 0) return;
  const h = Math.atan2(sumSin / w, sumCos / w) / 2;
  g.heading = ((h % Math.PI) + Math.PI) % Math.PI;
  g.ux = Math.cos(g.heading);
  g.uy = Math.sin(g.heading);
  g.px = cx / w;
  g.py = cy / w;
  g.weight = w;
}

/**
 * Gather segments onto shared lines, then emit one segment per uninterrupted
 * RUN of evidence along each line.
 *
 * This single stage does three jobs that look separate but are the same
 * question — "which pieces of ink are the same wall?":
 *
 *   duplicates    two detections of one wall land on the same line with
 *                 overlapping spans, and the union of their spans is one segment
 *   fragments     a wall broken by a rasterisation nick has two spans separated
 *                 by a couple of pixels, which is under `joinGap`, so they join
 *   doorways      a wall broken by a door has spans separated by the door's
 *                 width, which is far over `joinGap`, so they stay TWO walls —
 *                 which is correct, and is what stops a detection from being
 *                 credited with ink that is not there
 */
export function mergeCollinear(segs: PxSegment[], opts: RegularizeOptions): PxSegment[] {
  const ordered = [...segs].sort((a, b) => segLength(b) - segLength(a));
  const groups: LineGroup[] = [];
  for (const s of ordered) {
    const h = segHeading(s);
    let target: LineGroup | null = null;
    for (const g of groups) {
      if (headingGap(h, g.heading) > opts.parallelAngle) continue;
      const da = Math.abs(projectAcross(g, s.a));
      const db = Math.abs(projectAcross(g, s.b));
      if (da > opts.mergeDistance || db > opts.mergeDistance) continue;
      target = g;
      break;
    }
    if (target) {
      target.members.push(s);
      refit(target);
    } else {
      const g: LineGroup = {
        ux: Math.cos(h),
        uy: Math.sin(h),
        px: (s.a.x + s.b.x) / 2,
        py: (s.a.y + s.b.y) / 2,
        heading: h,
        members: [s],
        weight: segLength(s),
      };
      groups.push(g);
    }
  }

  const out: PxSegment[] = [];
  for (const g of groups) {
    const intervals = g.members
      .map((s) => {
        const t0 = projectAlong(g, s.a);
        const t1 = projectAlong(g, s.b);
        return t0 <= t1 ? [t0, t1] : [t1, t0];
      })
      .sort((p, q) => p[0] - q[0]);
    let lo = intervals[0][0];
    let hi = intervals[0][1];
    const flush = () => {
      if (hi - lo < opts.minLength) return;
      out.push({
        a: { x: g.px + g.ux * lo, y: g.py + g.uy * lo },
        b: { x: g.px + g.ux * hi, y: g.py + g.uy * hi },
      });
    };
    for (let i = 1; i < intervals.length; i++) {
      const [s0, s1] = intervals[i];
      if (s0 - hi > opts.joinGap) {
        flush();
        lo = s0;
        hi = s1;
      } else if (s1 > hi) {
        hi = s1;
      }
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. corners
// ---------------------------------------------------------------------------

/** Intersection of two infinite lines, or null when they are parallel. */
function lineIntersection(p: PxSegment, q: PxSegment): { x: number; y: number } | null {
  const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y };
  const s = { x: q.b.x - q.a.x, y: q.b.y - q.a.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((q.a.x - p.a.x) * s.y - (q.a.y - p.a.y) * s.x) / denom;
  return { x: p.a.x + r.x * t, y: p.a.y + r.y * t };
}

function closestOnSegment(p: { x: number; y: number }, s: PxSegment): { q: { x: number; y: number }; t: number } {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2));
  return { q: { x: s.a.x + dx * t, y: s.a.y + dy * t }, t };
}

/**
 * Make corners meet.
 *
 * Two passes, because corners come in two shapes and only one of them is
 * symmetric:
 *
 *   L-corner   two endpoints near each other, walls crossing -> move BOTH to
 *              the exact intersection of the two lines. Using the intersection
 *              rather than the midpoint matters: the midpoint of two endpoints
 *              that both overshoot is still wrong, and both walls end up
 *              slightly off their own line
 *   T-junction one endpoint near the INTERIOR of another wall -> project the
 *              endpoint onto that wall. The through-wall is not touched, so a
 *              long wall is never dragged off true by a stub meeting it
 *
 * Endpoints are moved, never lengths preserved: a wall that has to grow 3 px to
 * reach its corner should grow.
 */
export function joinCorners(segs: PxSegment[], radius: number, parallelAngle: number): PxSegment[] {
  const out = segs.map((s) => ({ a: { ...s.a }, b: { ...s.b } }));
  const ends: Array<'a' | 'b'> = ['a', 'b'];

  // L-corners first: they define exact points that the T-pass can then use.
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (headingGap(segHeading(out[i]), segHeading(out[j])) <= parallelAngle) continue;
      for (const ei of ends) {
        for (const ej of ends) {
          const pi = out[i][ei];
          const pj = out[j][ej];
          if (Math.hypot(pi.x - pj.x, pi.y - pj.y) > radius) continue;
          const x = lineIntersection(out[i], out[j]);
          if (!x) continue;
          // Only accept a corner that is actually near both endpoints; two
          // nearly-parallel walls can intersect far off the page.
          if (Math.hypot(x.x - pi.x, x.y - pi.y) > radius * 2) continue;
          if (Math.hypot(x.x - pj.x, x.y - pj.y) > radius * 2) continue;
          out[i][ei] = { x: x.x, y: x.y };
          out[j][ej] = { x: x.x, y: x.y };
        }
      }
    }
  }

  // T-junctions.
  for (let i = 0; i < out.length; i++) {
    for (const ei of ends) {
      let bestJ = -1;
      let bestD = radius;
      let bestQ: { x: number; y: number } | null = null;
      for (let j = 0; j < out.length; j++) {
        if (j === i) continue;
        if (headingGap(segHeading(out[i]), segHeading(out[j])) <= parallelAngle) continue;
        const { q, t } = closestOnSegment(out[i][ei], out[j]);
        if (t <= 0 || t >= 1) continue; // that is an L-corner, already handled
        const d = Math.hypot(q.x - out[i][ei].x, q.y - out[i][ei].y);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
          bestQ = q;
        }
      }
      if (bestJ >= 0 && bestQ) out[i][ei] = bestQ;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the ink-support test
// ---------------------------------------------------------------------------

/**
 * What fraction of a segment's length actually sits on ink?
 *
 * Every earlier stage can extend a segment: `mergeCollinear` bridges gaps up to
 * `joinGap`, `joinCorners` stretches to an intersection. Each is justified
 * individually and each writes geometry nobody has checked against the image.
 * This is the check — and it is the last line of defence against the failure
 * this whole rewrite exists to remove, a confident wall drawn where there is
 * nothing.
 */
export function inkSupport(seg: PxSegment, mask: Mask, radius: number): number {
  const len = segLength(seg);
  if (len === 0) return 0;
  const n = Math.max(1, Math.ceil(len));
  const r = Math.max(0, Math.round(radius));
  let hit = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(seg.a.x + (seg.b.x - seg.a.x) * t);
    const y = Math.round(seg.a.y + (seg.b.y - seg.a.y) * t);
    let found = false;
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= mask.width || ny >= mask.height) continue;
        if (mask.data[ny * mask.width + nx]) {
          found = true;
          break;
        }
      }
    }
    if (found) hit++;
  }
  return hit / (n + 1);
}

/** Drop segments whose ink support falls below `minFraction`. */
export function filterBySupport(
  segs: PxSegment[],
  mask: Mask,
  radius: number,
  minFraction: number,
): PxSegment[] {
  return segs.filter((s) => inkSupport(s, mask, radius) >= minFraction);
}

/** The whole regularization chain. */
export function regularize(segs: PxSegment[], opts: RegularizeOptions): PxSegment[] {
  if (segs.length === 0) return [];
  const theta0 = dominantAngle(segs);
  const snapped = snapToAxes(segs, theta0, opts.snapAngle);
  const merged = mergeCollinear(snapped, opts);
  const joined = joinCorners(merged, opts.cornerRadius, opts.parallelAngle);
  return joined.filter((s) => segLength(s) >= opts.minLength);
}
