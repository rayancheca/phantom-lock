/**
 * The ACCURACY SCORE for wall detection.
 *
 * "Did the detector get better?" needs a number, and the number has to be one
 * a bad answer cannot game. Three degenerate outputs have to score badly by
 * construction, because each is something a plausible implementation actually
 * emits:
 *
 *   - emit nothing                  -> 0        (no length delivered)
 *   - emit the bounding box only    -> ~0.7     (honest: most walls, no interior)
 *   - emit every wall twice         -> ~0.5     (half the output is deletion work)
 *   - emit a cross-plan diagonal    -> falls by that diagonal's whole length
 *
 * The headline is an intersection-over-union ON WALL LENGTH, which is the same
 * thing as asking **what fraction of the user's editing work the detector did
 * for them**:
 *
 *        score = hit / (hit + miss + off + redundant)
 *
 *   hit        GT wall length that some detection covers (union — covering a
 *              stretch twice does not count twice)
 *   miss       GT wall length nobody covered — the user has to draw it
 *   off        detected length that lies on no wall — the user has to delete it
 *   redundant  detected length that lies on a wall already covered by another
 *              detection — the duplicate walls, also deletion work
 *
 * Fragmentation (one real wall returned as several collinear pieces) is
 * deliberately NOT in that ratio: this app stores walls as individual objects
 * and `integrateWall` splits them at junctions anyway, so a split is nearly
 * free for the user. It is applied as a small separate factor and reported.
 *
 * Everything is length-based and sampled at a fixed pitch, so the score is a
 * deterministic function of the two segment lists — no wall clock, no
 * randomness, nothing that can flake in CI (CLAUDE.md TRAP 7).
 */

import type { PxSegment } from '../../detect';

export interface ScoreDetail {
  /** The headline, in [0,1]. */
  score: number;
  /** Fraction of ground-truth wall length that was found. */
  coverage: number;
  /** Fraction of detected length that lies on a real wall, counted once. */
  precision: number;
  /** 1 = no duplicates; 0.5 = every wall delivered twice. */
  duplication: number;
  /** 1 = one detection per wall; falls as walls arrive in pieces. */
  fragmentation: number;
  /** Fraction of ground-truth corners with a detected endpoint nearby. */
  junctions: number;
  /** Raw lengths, in px, for reporting. */
  lengths: { hit: number; miss: number; off: number; redundant: number; truth: number; detected: number };
  /** How many detections were returned. */
  count: number;
}

export interface ScoreOptions {
  /**
   * How far off a wall's centreline a detection may sit and still count, in px.
   * Scale this off the plan's stroke width: a detection that lands on the far
   * FACE of a hollow wall is a correct answer, not a near miss.
   */
  tolerance?: number;
  /** Max angle between a detection and the wall it is credited against, degrees. */
  angleTolerance?: number;
  /** Sampling pitch along segments, px. */
  pitch?: number;
  /** How near a ground-truth corner a detected endpoint must land, px. */
  junctionRadius?: number;
}

const DEFAULT_TOLERANCE = 6;
const DEFAULT_ANGLE = 22;
const DEFAULT_PITCH = 0.5;
const DEFAULT_JUNCTION = 10;

function len(s: PxSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/** Undirected angle of a segment, in [0, PI). */
function heading(s: PxSegment): number {
  const a = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  return ((a % Math.PI) + Math.PI) % Math.PI;
}

/** Smallest angle between two undirected headings, radians. */
function angleGap(p: number, q: number): number {
  const d = Math.abs(p - q) % Math.PI;
  return d > Math.PI / 2 ? Math.PI - d : d;
}

function distToSeg(px: number, py: number, s: PxSegment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.a.x) * dx + (py - s.a.y) * dy) / l2));
  return Math.hypot(px - (s.a.x + dx * t), py - (s.a.y + dy * t));
}

/** Sample points along a segment at `pitch`, always including both ends. */
function samples(s: PxSegment, pitch: number): Array<{ x: number; y: number }> {
  const n = Math.max(1, Math.ceil(len(s) / pitch));
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
  }
  return out;
}

/**
 * Which detections cover this sample of a ground-truth wall? A detection
 * qualifies when it passes within `tolerance` AND runs roughly parallel — the
 * parallelism gate is what stops a diagonal beam being credited with every
 * wall it happens to cross.
 */
function coveringIndices(
  x: number,
  y: number,
  gtHeading: number,
  detected: PxSegment[],
  headings: number[],
  tolerance: number,
  angleTol: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < detected.length; i++) {
    if (angleGap(gtHeading, headings[i]) > angleTol) continue;
    if (distToSeg(x, y, detected[i]) <= tolerance) out.push(i);
  }
  return out;
}

/**
 * Score a detection against ground truth. Both lists are in the same pixel
 * space; `truth` is the answer key produced by `floorplan-raster.ts`.
 */
export function scoreDetection(
  detected: PxSegment[],
  truth: PxSegment[],
  opts: ScoreOptions = {},
): ScoreDetail {
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  const angleTol = ((opts.angleTolerance ?? DEFAULT_ANGLE) * Math.PI) / 180;
  const pitch = opts.pitch ?? DEFAULT_PITCH;
  const jr = opts.junctionRadius ?? DEFAULT_JUNCTION;

  const dHead = detected.map(heading);
  const tHead = truth.map(heading);
  const truthLen = truth.reduce((a, s) => a + len(s), 0);
  const detLen = detected.reduce((a, s) => a + len(s), 0);

  // --- GT side: how much wall was found, and by how many detections? --------
  let hit = 0;
  let coveredSamples = 0;
  let coverSum = 0;
  let excessPieces = 0;
  for (let g = 0; g < truth.length; g++) {
    const pts = samples(truth[g], pitch);
    const step = len(truth[g]) / Math.max(1, pts.length - 1);
    const pieces = new Set<number>();
    let localSamples = 0;
    let localCover = 0;
    for (const p of pts) {
      const cov = coveringIndices(p.x, p.y, tHead[g], detected, dHead, tol, angleTol);
      if (cov.length === 0) continue;
      hit += step;
      coveredSamples++;
      coverSum += cov.length;
      localSamples++;
      localCover += cov.length;
      for (const i of cov) pieces.add(i);
    }
    // Fragmentation is SPLITTING, not duplication, and the two have to be
    // separated or a duplicated wall is charged twice for one fault: it would
    // lose points as a duplicate AND again as a fragment, and the headline for
    // "every wall delivered twice" would read 0.45 instead of the 0.50 the
    // ratio actually says.
    //
    // The correction is the MEAN simultaneous coverage, not the peak. Two
    // halves of a split wall both cover the single sample where they abut, so a
    // peak-based correction reads that one shared pixel as "this wall was
    // duplicated" and excuses the split entirely.
    const typical = localSamples === 0 ? 0 : Math.max(1, Math.round(localCover / localSamples));
    if (pieces.size > typical) excessPieces += pieces.size - typical;
  }
  // A sample is one `step` of length; the ends double-count half a step each
  // way, which is below the tolerance the score is ever read at.
  hit = Math.min(hit, truthLen);

  // --- detection side: how much of what we emitted lies on a real wall? -----
  let onWall = 0;
  for (let d = 0; d < detected.length; d++) {
    const pts = samples(detected[d], pitch);
    const step = len(detected[d]) / Math.max(1, pts.length - 1);
    for (const p of pts) {
      let ok = false;
      for (let g = 0; g < truth.length; g++) {
        if (angleGap(dHead[d], tHead[g]) > angleTol) continue;
        if (distToSeg(p.x, p.y, truth[g]) <= tol) {
          ok = true;
          break;
        }
      }
      if (ok) onWall += step;
    }
  }
  onWall = Math.min(onWall, detLen);

  const off = Math.max(0, detLen - onWall);
  const redundant = Math.max(0, onWall - hit);
  const miss = Math.max(0, truthLen - hit);

  const denom = hit + miss + off + redundant;
  const iou = denom === 0 ? 0 : hit / denom;

  const duplication = coveredSamples === 0 ? 0 : coveredSamples / coverSum;
  const fragmentation = truth.length === 0 ? 1 : Math.max(0, 1 - excessPieces / truth.length);

  // --- junctions: do corners actually meet? ---------------------------------
  const corners: Array<{ x: number; y: number }> = [];
  const ends = truth.flatMap((s) => [s.a, s.b]);
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      if (Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) <= jr) {
        if (!corners.some((c) => Math.hypot(c.x - ends[i].x, c.y - ends[i].y) <= jr)) {
          corners.push(ends[i]);
        }
        break;
      }
    }
  }
  const detEnds = detected.flatMap((s) => [s.a, s.b]);
  const met = corners.filter((c) => detEnds.some((e) => Math.hypot(e.x - c.x, e.y - c.y) <= jr)).length;
  const junctions = corners.length === 0 ? 1 : met / corners.length;

  // Fragmentation is real but cheap to fix by hand, so it shades the headline
  // rather than driving it.
  const score = iou * (1 - 0.1 * (1 - fragmentation));

  return {
    score,
    coverage: truthLen === 0 ? 1 : hit / truthLen,
    precision: detLen === 0 ? 0 : onWall / detLen,
    duplication,
    fragmentation,
    junctions,
    lengths: { hit, miss, off, redundant, truth: truthLen, detected: detLen },
    count: detected.length,
  };
}

/** One-line summary for benchmark output. */
export function formatScore(name: string, d: ScoreDetail): string {
  const pct = (x: number) => (x * 100).toFixed(1).padStart(5);
  return (
    `${name.padEnd(30)} score ${pct(d.score)}%  cover ${pct(d.coverage)}%  prec ${pct(d.precision)}%  ` +
    `dup ${pct(d.duplication)}%  frag ${pct(d.fragmentation)}%  junc ${pct(d.junctions)}%  n=${String(d.count).padStart(3)}`
  );
}
