/**
 * Floorplan image -> wall segments.
 *
 * ## What changed in S22, and why
 *
 * The previous pipeline was `ink -> global Hough -> peaks -> pixels near each
 * peak -> merge`. Measured against the corpus in
 * `__tests__/fixtures/floorplan-corpus.ts` it scored **52.1 %**, and the way it
 * failed was structural rather than a matter of thresholds:
 *
 *   - Hough ran on FILLED strokes, so a 9-px wall offered a band of nearly
 *     equal lines and several survived suppression. Cavity walls came back
 *     doubled every time (duplication 45.7 % on `hollow-rect`).
 *   - `segmentsOnLine` collected every ink pixel within a band of an INFINITE
 *     line, so one diagonal stitched a sofa, a wall and a door arc into a
 *     cross-plan beam. On a furnished plan precision fell to 35.9 %.
 *   - Furniture was rejected by BOUNDING-BOX SPAN, which a sofa passes.
 *   - Nothing was regularised globally, so corners overshot and halves of one
 *     wall landed on different lines.
 *   - Nothing checked whether the answer was any good: an image with no
 *     floorplan in it produced 61 walls.
 *
 * The replacement asks a local, connected question instead of a global one:
 *
 *   1. `inkMaskOf`            Otsu, ink as the minority class (blueprints work)
 *   2. `removeThickRegions`   drop anything locally FATTER than a wall, which
 *                             separates furniture from walls even when they
 *                             touch — a component filter cannot
 *   3. `closeMask`            fill the cavity of a double-drawn wall so it
 *                             thins to one centreline instead of two
 *   4. `removeSmallComponents` dimension text, speckle, stray marks
 *   5. `thin`                 Zhang-Suen to a 1-px skeleton: thickness can no
 *                             longer manufacture duplicates
 *   6. `skeletonToSegments`   follow each branch; only CONNECTED ink can share
 *                             a segment, so a cross-plan beam is unconstructible
 *   7. `regularize`           dominant axis, snap, collinear merge, corners
 *   8. `filterBySupport`      reject geometry with no ink under it
 *   9. `assessDetection`      refuse rather than emit a tangle
 *
 * Corpus scores, before and after, are in `docs/sessions/S22/bench/`.
 *
 * ## Contract
 *
 * The pure core takes RGBA bytes and is DOM-free, so every stage is provable in
 * node. `detectWallsFromUnderlay` is the only part that touches the DOM.
 * Detection output is a PROPOSAL the user confirms — it never writes a scene.
 */

import type { Underlay, Vec2, WallObj } from './types';
import { createId, ROOM_HEIGHT } from './scene';
import type { GrayImage, Mask, PxSegment } from './vision/types';
import { segLength } from './vision/types';
import {
  closeMask,
  countInk,
  inkMaskOf,
  meanStrokeWidth,
  removeSmallComponents,
  removeThickRegions,
} from './vision/mask';
import { thin } from './vision/thin';
import { skeletonToSegments } from './vision/trace';
import { filterBySupport, regularize, type RegularizeOptions } from './vision/regularize';
import { assessDetection, structureScore, MIN_WALLS, type DetectionQuality } from './vision/quality';

export type { GrayImage, PxSegment } from './vision/types';
export type { DetectionQuality, RefusalCause } from './vision/quality';

// ---------------------------------------------------------------------------
// tuning
//
// Every constant below is a FRACTION of the image's larger dimension, or is
// derived from the measured stroke width. They are calibrated against the
// enumerated corpus in `__tests__/fixtures/floorplan-corpus.ts` — re-derive them
// against that list if you change one, the same discipline `grid.ts` follows for
// its cell budget.
//
// That scaling was once described here as making the pipeline "behave the same
// at any resolution". It does NOT, and S26 measured it: the fraction-derived
// constants scale, but the stroke-derived ones ride `meanStrokeWidth`, which is
// not scale-invariant — anti-aliasing makes a thin stroke relatively FATTER
// after a downscale. `heavy-poche` structure moves 0.850 -> 0.450 across a 2x
// downscale, and a real plan moves 0.231 (native 1734 px) -> 0.500 (the 900 px
// the app actually uses). Two consequences, both load-bearing:
//
//   - a measurement is only meaningful WITH the resolution it was taken at, and
//     the only resolution that describes the product is the one
//     `detectWallsFromUnderlay` produces (see `WORK_MAX`);
//   - several constants are ABSOLUTE pixels, not fractions, and they are what
//     breaks the scaling: `WALL_HALF_WIDTH_MIN/MAX`, `CLOSE_MIN/MAX`,
//     `MIN_SEGMENT_PX`, the `epsilon` clamp, the 4-6 px floors below — and
//     `MIN_COMPONENT_PIXELS`, which is a pixel COUNT and therefore scales as k^2
//     rather than k;
//   - `WALL_HALF_WIDTH_MAX` stops being a no-op past maxDim 1362 (the `round`
//     puts the boundary at 24.5/0.018, not 24/0.018), where it starts deleting
//     real poche rather than furniture. `WORK_MAX` keeps the pipeline under
//     that, and a test pins the relationship.
// ---------------------------------------------------------------------------

/**
 * Half-thickness above which ink is furniture, not wall. 1.8 % of the larger
 * dimension admits walls up to ~3.6 % thick — heavier than any plan draws them
 * — while a sofa, a bath or a kitchen island is far fatter.
 */
export const WALL_HALF_WIDTH_FRAC = 0.018;
const WALL_HALF_WIDTH_MIN = 3;
export const WALL_HALF_WIDTH_MAX = 24;

/**
 * Closing radius: fills gaps up to twice this. It must exceed half the widest
 * CAVITY (a double-drawn wall) and stay well under half the narrowest DOOR, or
 * closing would seal the doorways and the plan would come back with no
 * openings at all.
 */
const CLOSE_FRAC = 0.01;
const CLOSE_MIN = 2;
const CLOSE_MAX = 12;

/** Components smaller than this in either dimension are annotation, not wall. */
const MIN_COMPONENT_SPAN_FRAC = 0.045;
/** ...and this many pixels, which catches a sparse run of text marks. */
const MIN_COMPONENT_PIXELS = 24;

/** The shortest run of centreline worth calling a wall. */
const MIN_SEGMENT_FRAC = 0.05;
const MIN_SEGMENT_PX = 12;

/** Max deviation from the plan's own axis that still gets snapped. */
const SNAP_ANGLE_DEG = 9;
/** Max heading difference for two segments to be treated as the same line. */
const PARALLEL_ANGLE_DEG = 20;

/** Fraction of a segment that must sit on ink for it to survive. */
const MIN_INK_SUPPORT = 0.6;

/**
 * Corner-joining radius as a fraction of the minimum wall length — the floor
 * that stops the radius collapsing on a hairline drawing. See the derivation at
 * the call site.
 */
const CORNER_RADIUS_FRAC = 0.25;

export interface DetectOptions {
  /**
   * 0.5 finds fewer, more certain walls; 1.5 finds more and accepts weaker
   * evidence. This is the ONE knob the UI exposes, so that a user whose plan is
   * under- or over-read can steer instead of only discarding.
   */
  sensitivity?: number;
}

export interface DetectionResult {
  segments: PxSegment[];
  quality: DetectionQuality;
  /** Ink judged to be wall, after furniture and annotation were removed. */
  wallMask: Mask;
  /** Measured mean wall thickness in px — what the tuning derived from. */
  strokeWidth: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The default sensitivity — the reading every other reading is judged beside. */
const DEFAULT_SENSITIVITY = 1;

/**
 * The pure pipeline, with everything it learned along the way.
 *
 * `sensitivity` scales exactly two things — the minimum wall length and the
 * required ink support — because those are the two places a correct pipeline
 * can still disagree with a particular drawing about what counts as a wall. It
 * deliberately does NOT scale the furniture threshold or the closing radius:
 * those encode what a wall physically IS, and a user turning a slider should
 * not be able to reclassify their sofa.
 *
 * Stages 1-5 do not depend on `sensitivity` at all, which is what makes the
 * second reading below nearly free: only stages 6-8 are re-run.
 */
export function detectWalls(img: GrayImage, opts: DetectOptions = {}): DetectionResult {
  const sensitivity = clamp(opts.sensitivity ?? DEFAULT_SENSITIVITY, 0.4, 2);
  const maxDim = Math.max(img.width, img.height);

  const maxHalfWidth = clamp(
    Math.round(WALL_HALF_WIDTH_FRAC * maxDim),
    WALL_HALF_WIDTH_MIN,
    WALL_HALF_WIDTH_MAX,
  );
  const closeRadius = clamp(Math.round(CLOSE_FRAC * maxDim), CLOSE_MIN, CLOSE_MAX);
  const minComponentSpan = Math.max(8, MIN_COMPONENT_SPAN_FRAC * maxDim);

  // 1-4: page -> wall ink.
  //
  // The thickness filter runs TWICE, and the second pass is not belt-and-
  // braces: closing is a gap-filling operation, so it MANUFACTURES thick
  // regions that were not in the image. Diagonal hatching at a pitch under
  // `2 * closeRadius` — a hatched wall section, a tiled bathroom floor — fills
  // into a solid mass, and a mass that arrives after the first filter has run
  // is a mass nothing else will ever reject.
  const ink = inkMaskOf(img);
  const deFurnished = removeThickRegions(ink, maxHalfWidth);
  const closed = removeThickRegions(closeMask(deFurnished, closeRadius), maxHalfWidth, maxHalfWidth * 0.5);
  const wallMask = removeSmallComponents(closed, minComponentSpan, MIN_COMPONENT_PIXELS);

  // 5: centrelines.
  const skeleton = thin(wallMask);
  const strokeWidth = meanStrokeWidth(countInk(wallMask), countInk(skeleton));

  // 6: connected runs -> straight spans. The RDP epsilon has to exceed the
  // staircase amplitude of a rasterised diagonal (about half a pixel) but stay
  // under the smallest real bend, so it is tied to the stroke, not the image.
  const epsilon = clamp(strokeWidth * 0.5, 1.2, 6);
  const supportRadius = Math.max(2, strokeWidth * 0.8);

  /** Stages 6-8 at one sensitivity: the part of the answer the knob moves. */
  const read = (s: number) => {
    const minSegment = Math.max(MIN_SEGMENT_PX, (MIN_SEGMENT_FRAC * maxDim) / s);
    const raw = skeletonToSegments(skeleton, epsilon, Math.max(4, minSegment * 0.35), minSegment);

    // 7: make the pieces agree with each other.
    //
    // `cornerRadius` deliberately has a floor tied to the PLAN's scale, not only
    // to the stroke. How far a traced endpoint lands from its true corner is
    // governed by thinning and by the simplification epsilon, and on a hairline
    // drawing both still leave a 6-8 px shortfall while `strokeWidth * 2` has
    // collapsed to 4. Measured: with a stroke-only radius the `hairline` fixture
    // joined 21 % of its corners and was then REFUSED as "not a floorplan" — a
    // perfectly good plan rejected because one constant scaled off the wrong
    // quantity.
    const cornerRadius = Math.max(6, strokeWidth * 2, minSegment * CORNER_RADIUS_FRAC);
    const regOpts: RegularizeOptions = {
      snapAngle: (SNAP_ANGLE_DEG * Math.PI) / 180,
      parallelAngle: (PARALLEL_ANGLE_DEG * Math.PI) / 180,
      mergeDistance: Math.max(4, strokeWidth * 1.1),
      joinGap: Math.max(4, strokeWidth * 1.5),
      cornerRadius,
      minLength: minSegment,
    };
    const tidy = regularize(raw, regOpts);

    // 8: nothing survives that the image does not support.
    const minSupport = clamp(MIN_INK_SUPPORT / s, 0.25, 0.95);
    const segments = filterBySupport(tidy, wallMask, supportRadius, minSupport).filter(
      (seg) => segLength(seg) >= minSegment,
    );
    return { segments, cornerRadius };
  };

  const user = read(sensitivity);

  // 9: is this worth showing?
  //
  // THE MONOTONIC-KNOB GUARANTEE. `structure` is measured on the segments that
  // survived `minSegment`, and `minSegment` is exactly what `sensitivity`
  // scales — so asking for FEWER walls mechanically lowers it, and the user's
  // own pickiness is then reported back to them as evidence about their image.
  // Measured on the `oblique-survey` fixture: 0.346 at the default, 0.222 at
  // 'Careful', the same plan refused only because the knob moved.
  //
  // So a structure refusal is only final if the DEFAULT reading fails too. The
  // knob may change WHICH walls are offered; it must never, by itself, turn an
  // accepted image into "this doesn't look like a floorplan".
  //
  // The second reading is LAZY — it costs nothing unless the first would have
  // been refused for structure, which is the rare case — and it re-runs only
  // stages 6-8, since 1-5 do not depend on `sensitivity`. `confidence` and the
  // reported `structure` still come from the user's own reading, so the numbers
  // on screen always describe the walls on screen.
  const explainRadius = Math.max(3, strokeWidth * 0.9);
  const first = assessDetection(user.segments, wallMask, {
    junctionRadius: user.cornerRadius,
    supportRadius,
    explainRadius,
  });
  // Three conditions, and each one closes a hole the others do not:
  //
  //   cause === 'unstructured'   the ONLY gate a second reading can clear. A
  //                              too-few-lines or broken-lines refusal scores
  //                              structure 0 as well, and its branch precedes
  //                              the structure branch, so running the second
  //                              reading for it is pure dead work on every null.
  //   sensitivity !== default    at the default the second reading IS the first.
  //   structure > 0              the user's own reading must show SOME structure
  //                              to be worth offering. Without this the rescue is
  //                              unconditional on what is actually on screen:
  //                              measured, `oblique-survey` redrawn at 0.7x and
  //                              read at 'Careful' offers 12 segments of which
  //                              NOT ONE of the 24 endpoints meets another —
  //                              a scatter by the metric's own definition, and
  //                              46.4 % accurate against ground truth. This is a
  //                              bright line rather than a tuned constant, and
  //                              the corpus shows why one is enough: across 22
  //                              fixtures x 6 scales x both off-default levels
  //                              only THREE readings reach this branch, at
  //                              0.000 (score 46.4 %) and 0.222 twice (67.6 and
  //                              69.1 %). Residual, recorded rather than hidden:
  //                              a reading with a single joined endpoint would
  //                              still be pooled.
  const needsSecondOpinion =
    first.cause === 'unstructured' && sensitivity !== DEFAULT_SENSITIVITY && first.structure > 0;
  const quality = needsSecondOpinion
    ? (() => {
        const ref = read(DEFAULT_SENSITIVITY);
        // The default reading is EVIDENCE only if it is itself a detection.
        // Without this guard the rule accepts nulls, and the shape is not
        // exotic: a shelf edge meeting an upright is a clean 2-segment corner
        // scoring a PERFECT structure 1.000/0.500 while being refused for
        // `MIN_WALLS`, and pooling that number licensed 11 unrelated sticks at
        // 'Thorough' (measured, 9 of 9 variants — the `no-plan-shelf` fixture).
        //
        // Segment COUNT is the whole guard, and that is provable rather than
        // lucky: `filterBySupport` has already dropped anything under
        // `MIN_INK_SUPPORT / 1 = 0.6`, so every segment reaching here supports
        // at least 0.6 and the length-weighted mean `assessDetection` computes
        // cannot fall below it — comfortably over `MIN_SUPPORT` 0.55. So the
        // support gate can never be the one the reference reading fails.
        const usable = ref.segments.length >= MIN_WALLS;
        return assessDetection(user.segments, wallMask, {
          junctionRadius: user.cornerRadius,
          supportRadius,
          explainRadius,
          referenceStructure: usable ? structureScore(ref.segments, ref.cornerRadius) : undefined,
        });
      })()
    : first;

  return { segments: user.segments, quality, wallMask, strokeWidth };
}

/**
 * Back-compatible entry point: just the segments.
 *
 * Kept because "give me the walls" is the honest shape of the question when the
 * caller is not going to show a confidence, and because every existing test
 * reaches for it.
 */
export function detectSegments(img: GrayImage, opts: DetectOptions = {}): PxSegment[] {
  return detectWalls(img, opts).segments;
}

/**
 * Luminance + Otsu -> boolean ink mask (1 = ink). Handles both dark-on-light
 * plans and light-on-dark blueprints, because ink is taken to be the minority
 * class rather than the dark one.
 */
export function inkMask(img: GrayImage): Uint8Array {
  return inkMaskOf(img).data;
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

/**
 * Working resolution.
 *
 * Raised from 640 in S22. The old cost was dominated by a Hough accumulator
 * that scanned 180 angles per ink pixel and then swept the whole accumulator 48
 * times; the new cost is a handful of linear-time passes plus thinning, whose
 * iteration count is half the stroke width and therefore does NOT grow with
 * resolution the way the accumulator sweep did. More pixels also means thinner
 * strokes relative to the plan, which is the regime every stage here prefers.
 */
export const WORK_MAX = 900;

export interface UnderlayDetection {
  walls: WallObj[];
  quality: DetectionQuality;
}

/**
 * DOM wrapper: rasterize the underlay image and run the pure pipeline.
 *
 * Returns walls AND the quality assessment, so the caller can tell the
 * difference between "nothing found" and "found, but not worth showing" — and
 * say which. On a refusal the walls list is empty by construction, so a caller
 * that ignores `quality` still cannot commit a tangle.
 */
export async function detectWallsFromUnderlay(
  u: Underlay,
  opts: DetectOptions = {},
): Promise<UnderlayDetection> {
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
  if (!ctx) {
    return {
      walls: [],
      quality: {
        confidence: 0,
        refusal: 'This browser could not read the image.',
        // NOT a claim about the image, so the UI must not suggest a knob.
        cause: 'unreadable',
        wallCount: 0,
        support: 0,
        structure: 0,
        explained: 0,
        totalLength: 0,
      },
    };
  }
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const result = detectWalls({ data: data.data, width: w, height: h }, opts);
  // workScale maps detection pixels back to the underlay's own pixel grid.
  const workScale = w / u.wPx;
  return {
    walls: result.quality.refusal ? [] : segmentsToWalls(result.segments, u, workScale),
    quality: result.quality,
  };
}
