/**
 * The floorplan CORPUS — the enumerated set of images wall detection is
 * calibrated against.
 *
 * This is the direct descendant of `legit-scenes.ts` and the S18 lesson that
 * produced it: *a threshold calibrated against a subset is a bug waiting to
 * happen*. Every constant in the detection pipeline is tuned against THIS list,
 * and the list is written down so the next session can see what was protected
 * and what was not.
 *
 * The set is chosen so that each entry can break something a different entry
 * cannot:
 *
 *   - stroke weight    hairline (1 px) ... heavy (11 px) ... hollow cavity walls
 *   - content          bare shell / furnished / hatched / annotated with text
 *   - geometry         Manhattan / a genuine 30-degree wall / tiny bathroom walls
 *   - capture          clean vector render / blurred, noisy, unevenly lit photo /
 *                      rotated and skewed phone shot / faint low-contrast scan /
 *                      white-on-dark blueprint
 *   - the null case    an image with NO walls at all, which must be refused
 *
 * `expectWalls` is what a human would draw. It is not asserted directly (the
 * score is), but it makes each fixture's intent legible.
 */

import {
  rasterize,
  type BlobSpec,
  type Fixture,
  type PlanSpec,
  type SpeckleSpec,
  type WallSpec,
} from './floorplan-raster';

/** A fixture plus what a human reading the image would call the right answer. */
export interface CorpusEntry {
  spec: PlanSpec;
  /** How many walls a human would draw. */
  expectWalls: number;
  /** True when the image genuinely contains no floorplan and must be refused. */
  refuse?: boolean;
  why: string;
}

const W = 700;
const H = 520;

/** Outer shell of the standard apartment, as centrelines. */
function shell(t: number) {
  return [
    { a: { x: 60, y: 50 }, b: { x: 640, y: 50 }, thickness: t },
    { a: { x: 640, y: 50 }, b: { x: 640, y: 470 }, thickness: t },
    { a: { x: 640, y: 470 }, b: { x: 60, y: 470 }, thickness: t },
    { a: { x: 60, y: 470 }, b: { x: 60, y: 50 }, thickness: t },
  ];
}

/** Interior walls of the standard apartment, with door gaps already cut. */
function interior(t: number) {
  return [
    // Vertical spine at x=360, door gap y 250..320.
    { a: { x: 360, y: 50 }, b: { x: 360, y: 250 }, thickness: t },
    { a: { x: 360, y: 320 }, b: { x: 360, y: 470 }, thickness: t },
    // Horizontal divider in the left half at y=270, door gap x 150..220.
    { a: { x: 60, y: 270 }, b: { x: 150, y: 270 }, thickness: t },
    { a: { x: 220, y: 270 }, b: { x: 360, y: 270 }, thickness: t },
    // Bathroom box, bottom right.
    { a: { x: 500, y: 350 }, b: { x: 640, y: 350 }, thickness: t },
    { a: { x: 500, y: 350 }, b: { x: 500, y: 470 }, thickness: t },
  ];
}

const FURNITURE = [
  { kind: 'rect' as const, x: 250, y: 150, w: 150, h: 80, rotation: 0 },
  { kind: 'rect' as const, x: 500, y: 140, w: 170, h: 110, rotation: 0 },
  { kind: 'rect' as const, x: 150, y: 390, w: 120, h: 90, rotation: 0 },
  { kind: 'circle' as const, x: 290, y: 400, w: 70, h: 70 },
  { kind: 'rect' as const, x: 570, y: 420, w: 90, h: 55, rotation: 0 },
];

const ANNOTATION = {
  arcs: [
    { x: 360, y: 250, r: 62, from: 90, to: 160 },
    { x: 150, y: 270, r: 62, from: 0, to: 70 },
  ],
  speckles: [
    { x: 120, y: 100, len: 90, size: 5 },
    { x: 420, y: 100, len: 110, size: 5 },
    { x: 100, y: 320, len: 70, size: 5 },
    { x: 690, y: 160, len: 120, size: 5, vertical: true },
  ],
};

// ---------------------------------------------------------------------------
// `oblique-survey` — the surveyed-flat fixture (S26)
// ---------------------------------------------------------------------------

const OB_W = 620;
const OB_H = 760;
/** Exterior poche against thin interior partitions, as a survey draws them. */
const OB_SHELL = 10;
const OB_PART = 6;

type Pt = { x: number; y: number };
const obWall = (a: Pt, b: Pt, thickness: number) => ({ a, b, thickness });

/**
 * The envelope. Read the SHORT entries as the point of the fixture: the 37-57 px
 * steps and notches are what tie the long oblique runs together, and they sit
 * either side of `minSegment`.
 */
const OB_ENV: Pt[] = [
  { x: 96, y: 168 }, // left wall, top
  { x: 286, y: 96 }, // long oblique top-left run
  { x: 322, y: 88 }, // SHORT step (37 px)
  { x: 336, y: 132 }, // SHORT notch (46 px)
  { x: 372, y: 124 }, // SHORT step (37 px)
  { x: 520, y: 560 }, // the long right oblique
  { x: 484, y: 604 }, // SHORT chamfer (57 px)
  { x: 470, y: 646 }, // SHORT (44 px)
  { x: 250, y: 700 }, // oblique bottom
  { x: 150, y: 672 },
  { x: 120, y: 596 }, // SHORT return (82 px)
];

const obLerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function obEnvelope() {
  const out = [];
  for (let i = 0; i < OB_ENV.length; i++) {
    const a = OB_ENV[i];
    const b = OB_ENV[(i + 1) % OB_ENV.length];
    if (i === 8) {
      // The entry door. Openings are what leave endpoints with nothing to meet.
      out.push(obWall(a, obLerp(a, b, 0.34), OB_SHELL));
      out.push(obWall(obLerp(a, b, 0.58), b, OB_SHELL));
    } else {
      out.push(obWall(a, b, OB_SHELL));
    }
  }
  return out;
}

/** Kitchen return, a spine with a door gap, and the closet-scale warren. */
const OB_INTERIOR = [
  obWall({ x: 232, y: 268 }, { x: 288, y: 430 }, OB_PART),
  obWall({ x: 300, y: 466 }, { x: 330, y: 552 }, OB_PART),
  obWall({ x: 150, y: 560 }, { x: 236, y: 536 }, OB_PART),
  obWall({ x: 330, y: 552 }, { x: 404, y: 528 }, OB_PART),
  obWall({ x: 404, y: 528 }, { x: 418, y: 568 }, OB_PART),
  obWall({ x: 424, y: 585 }, { x: 428, y: 596 }, OB_PART),
  obWall({ x: 352, y: 616 }, { x: 428, y: 596 }, OB_PART),
  obWall({ x: 352, y: 616 }, { x: 342, y: 588 }, OB_PART),
  obWall({ x: 404, y: 528 }, { x: 462, y: 512 }, OB_PART),
  obWall({ x: 428, y: 596 }, { x: 486, y: 578 }, OB_PART),
  obWall({ x: 352, y: 616 }, { x: 372, y: 674 }, OB_PART),
  obWall({ x: 462, y: 512 }, { x: 478, y: 556 }, OB_PART),
  obWall({ x: 372, y: 674 }, { x: 430, y: 658 }, OB_PART),
];

const OB_WALLS = [...obEnvelope(), ...OB_INTERIOR];

/**
 * A dimension line beside a wall: glyph-sized marks laid along its own normal.
 * `apartment-annotated` puts four such runs on an otherwise clean plan; a survey
 * drawing dimensions every wall, which is what buries the corners.
 */
function obDimensions(walls: typeof OB_WALLS, offset: number) {
  const out = [];
  for (const wl of walls) {
    const dx = wl.b.x - wl.a.x;
    const dy = wl.b.y - wl.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 40) continue;
    const mx = (wl.a.x + wl.b.x) / 2 + (-dy / len) * offset;
    const my = (wl.a.y + wl.b.y) / 2 + (dx / len) * offset;
    const run = Math.min(len * 0.55, 90);
    const vertical = Math.abs(dy) > Math.abs(dx);
    out.push({
      x: mx - (vertical ? 0 : run / 2),
      y: my - (vertical ? run / 2 : 0),
      len: run,
      size: 5,
      vertical,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// `scan-letterbox` — the THIRD TONE MASS (S27)
// ---------------------------------------------------------------------------

const SL_W = 700;
const SL_H = 520;
const SL_WALL = 9;
/** Everything ANNOTATIVE — dimension lines, strings — is drawn at this weight. */
const SL_ANN = 5;
const SL_PAPER = 246;
/**
 * Three tones, not two.
 *
 * `SL_INK` is a mid grey rather than the corpus default 26 because that is what
 * the owner's scan measures — its ink mode sits at ~99 — and because the
 * near-tie this fixture exists to carry is ARITHMETICALLY IMPOSSIBLE without it:
 * with ink 26 the low cut beats the high one 2287 to 1457 and no second mode
 * forms at any stroke width from 1 to 14. That is worth stating plainly, because
 * a first attempt at this fixture held ink at 26 and swept 540 other
 * combinations without ever reproducing the effect.
 */
const SL_INK = 86;
const SL_GREY = 190;
const SL_BAR = 198;
/** Each bar is this wide, so the pair covers 78/700 = 11.14 % of the page. */
const SL_BARW = 39;

const SL_WALLS: WallSpec[] = [
  { a: { x: 118, y: 50 }, b: { x: 582, y: 50 }, thickness: SL_WALL },
  { a: { x: 582, y: 50 }, b: { x: 582, y: 470 }, thickness: SL_WALL },
  { a: { x: 582, y: 470 }, b: { x: 118, y: 470 }, thickness: SL_WALL },
  { a: { x: 118, y: 470 }, b: { x: 118, y: 50 }, thickness: SL_WALL },
  { a: { x: 370, y: 50 }, b: { x: 370, y: 240 }, thickness: SL_WALL },
  { a: { x: 370, y: 310 }, b: { x: 370, y: 470 }, thickness: SL_WALL },
  { a: { x: 118, y: 270 }, b: { x: 200, y: 270 }, thickness: SL_WALL },
  { a: { x: 270, y: 270 }, b: { x: 370, y: 270 }, thickness: SL_WALL },
  { a: { x: 480, y: 350 }, b: { x: 582, y: 350 }, thickness: SL_WALL },
  { a: { x: 480, y: 350 }, b: { x: 480, y: 470 }, thickness: SL_WALL },
];

/**
 * A light dimension line parallel to each wall, `off` px along its normal.
 *
 * This is the FRAGMENTATION mechanism, copied from the owner's plan rather than
 * invented: when the threshold jumps these become ink, `closeMask` merges each
 * one into its wall, the merged band exceeds `maxHalfWidth`, and
 * `removeThickRegions` then punches holes in the wall itself. Measured on the
 * owner's file, one 663 px envelope run comes back as 165 + 160 + 132.
 */
function slDim(off: number, span: number): WallSpec[] {
  const out: WallSpec[] = [];
  for (const wl of SL_WALLS) {
    const dx = wl.b.x - wl.a.x;
    const dy = wl.b.y - wl.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 60) continue;
    const nx = (-dy / len) * off;
    const ny = (dx / len) * off;
    const mx = (wl.a.x + wl.b.x) / 2;
    const my = (wl.a.y + wl.b.y) / 2;
    const hx = ((dx / len) * (len * span)) / 2;
    const hy = ((dy / len) * (len * span)) / 2;
    out.push({
      a: { x: mx - hx + nx, y: my - hy + ny },
      b: { x: mx + hx + nx, y: my + hy + ny },
      thickness: SL_ANN,
      ink: SL_GREY,
      decoy: true,
    });
  }
  return out;
}

/** Free-standing dimension strings in the margins — they join nothing. */
const SL_STRINGS: WallSpec[] = (
  [
    [72, 60, 72, 460],
    [96, 96, 96, 300],
    [628, 60, 628, 460],
    [604, 300, 604, 440],
    [150, 22, 550, 22],
    [150, 498, 550, 498],
    [170, 40, 350, 40],
    [400, 484, 560, 484],
  ] as number[][]
).map(([ax, ay, bx, by]) => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness: SL_ANN,
  ink: SL_GREY,
  decoy: true,
}));

const SCAN_LETTERBOX: PlanSpec = {
  name: 'scan-letterbox',
  width: SL_W,
  height: SL_H,
  paper: SL_PAPER,
  ink: SL_INK,
  strokeWidth: SL_WALL,
  walls: [...SL_WALLS, ...SL_STRINGS, ...slDim(20, 0.7), ...slDim(-20, 0.56)],
  blobs: [
    // THE POINT OF THIS FIXTURE: two flat mid-grey scanner bars, 11.14 % of the
    // page at luminance 198 — the third tone mass, which is what puts two
    // near-tied peaks in Otsu's criterion.
    { kind: 'rect', x: SL_BARW / 2, y: SL_H / 2, w: SL_BARW, h: SL_H, ink: SL_BAR },
    { kind: 'rect', x: SL_W - SL_BARW / 2, y: SL_H / 2, w: SL_BARW, h: SL_H, ink: SL_BAR },
    { kind: 'rect', x: 250, y: 150, w: 120, h: 66, ink: SL_GREY + 4 },
    { kind: 'rect', x: 496, y: 140, w: 128, h: 80, ink: SL_GREY + 4 },
    { kind: 'rect', x: 190, y: 404, w: 96, h: 66, ink: SL_GREY + 4 },
    { kind: 'circle', x: 300, y: 402, w: 56, h: 56, ink: SL_GREY + 4 },
  ],
  speckles: [
    { x: 200, y: 150, len: 90, size: 6, ink: SL_GREY },
    { x: 430, y: 130, len: 96, size: 6, ink: SL_GREY },
    { x: 190, y: 350, len: 84, size: 6, ink: SL_GREY },
    { x: 420, y: 300, len: 90, size: 6, ink: SL_GREY },
    { x: 500, y: 420, len: 70, size: 6, ink: SL_GREY },
    { x: 60, y: 240, len: 100, size: 6, vertical: true, ink: SL_GREY },
    { x: 646, y: 240, len: 100, size: 6, vertical: true, ink: SL_GREY },
  ],
  photo: { blur: 1, noise: 4, gradient: 10 },
  seed: 27,
};

const OBLIQUE_SURVEY = {
  name: 'oblique-survey',
  width: OB_W,
  height: OB_H,
  strokeWidth: OB_PART,
  walls: OB_WALLS,
  // Solid fixtures only. A thin OUTLINE of a kitchen run is a thin stroke
  // enclosing floor, which no local rule distinguishes from a wall — including
  // one would make this fixture's score a measure of that ambiguity rather than
  // of the thing it exists to hold.
  blobs: [
    { kind: 'rect' as const, x: 200, y: 300, w: 108, h: 62, rotation: -20 },
    { kind: 'rect' as const, x: 175, y: 618, w: 96, h: 40, rotation: -14 },
    { kind: 'circle' as const, x: 300, y: 620, w: 40, h: 40 },
  ],
  arcs: [
    { x: 288, y: 430, r: 34, from: 100, to: 165 },
    { x: 236, y: 536, r: 30, from: 200, to: 265 },
  ],
  speckles: [...obDimensions(OB_WALLS, 26), ...obDimensions(OB_WALLS.slice(0, 9), -30)],
  photo: { rotate: 11, blur: 0.6, noise: 2.5, gradient: 8 },
  seed: 26,
};

// ---------------------------------------------------------------------------
// `screened-poche` — the INK POLARITY case (S28)
// ---------------------------------------------------------------------------

const SP_W = 700;
const SP_H = 520;

/**
 * The wall SCREEN TINT, and the reason this fixture exists.
 *
 * `scan-letterbox` put a third tone mass on the page and asked the threshold to
 * ignore it. This one inverts the POLARITY: the walls are the LIGHT ink and the
 * annotation is the DARK ink. That is not a contrivance, it is how a plotted
 * sheet is normally drawn — wall bodies filled with a 20-30 % grey screen (the
 * standard CTB plot style for poche, and what a photocopier does to a solid
 * fill anyway) while dimension strings, witness lines, figures, leaders, room
 * names and the title strip all plot in fine solid black.
 *
 * Gradient weighting scales a tone's vote by its perimeter-to-area ratio, i.e.
 * by 1/thickness. On `scan-letterbox` that is exactly right — it demotes a flat
 * mass that carries no boundary information. Here the same rule AMPLIFIES the
 * hairline annotation and DEMOTES the wall bodies, and the linework captures
 * the threshold.
 *
 * And it is not a near-tie, which is what makes this fixture robust rather than
 * knife-edge. Measured on the page below, Otsu's criterion has ONE clear winner
 * on each histogram and they disagree:
 *
 *   plain histogram   argmax 217 (100.00 %), runner-up 144 at 57.41 %
 *   edge histogram    argmax 138 (100.00 %), runner-up 208 at 64.93 %
 *
 * 217 admits 16.3 % of the page as ink — the walls and fixtures. 138 admits
 * 0.7 % — the linework only, with every wall on the light side of the cut. The
 * dark ink is 0.64 % of the page by AREA and 6.7 % of it by EDGE VOTE, which is
 * the whole mechanism in two numbers.
 *
 * It is also a MATCHED PAIR with `scan-letterbox`, and that is what makes the
 * two of them pin the rule from both sides. There the correct cut admits LESS
 * ink (6.7 % against 31.9 % at gamma 1.08) and comes from the EDGE histogram;
 * here the correct cut admits MORE (16.3 % against 0.7 %) and comes from the
 * PLAIN one. So "always weight by gradient", "always use the plain histogram",
 * "prefer the candidate admitting less ink" and "prefer the one admitting more"
 * each break exactly one of these two fixtures.
 */
const SP_SCREEN = 196;
const SP_PAPER = 246;
/**
 * Annotation ink and weight. Solid black at a fine pen.
 *
 * Both sit inside a measured plateau rather than on an edge: sweeping each axis
 * alone at the tones below, the failure reproduces for annotation ink 0-95 (i.e.
 * anything from pure black to a mid grey — the whole sweep) and for pen widths
 * 1.5-5 px. At 1.2 px and below it stops reproducing, which is recorded rather
 * than explained: nothing here establishes WHY, only where the edge is.
 */
const SP_ANN_INK = 30;
const SP_ANN_W = 2;
/** Heavy exterior poche against thinner partitions, as a plotted sheet draws them. */
const SP_POCHE = 16;
const SP_PART = 10;

const SP_L = 100;
const SP_R = 612;
const SP_T = 70;
const SP_B = 462;
/** Interior wall lines — and therefore also the dimension stops. */
const SP_VX = 356;
const SP_HY = 268;
const SP_BX = 486;
const SP_BY = 348;

const SP_WALLS: WallSpec[] = [
  { a: { x: SP_L, y: SP_T }, b: { x: SP_R, y: SP_T }, thickness: SP_POCHE, ink: SP_SCREEN },
  { a: { x: SP_R, y: SP_T }, b: { x: SP_R, y: SP_B }, thickness: SP_POCHE, ink: SP_SCREEN },
  { a: { x: SP_R, y: SP_B }, b: { x: SP_L, y: SP_B }, thickness: SP_POCHE, ink: SP_SCREEN },
  { a: { x: SP_L, y: SP_B }, b: { x: SP_L, y: SP_T }, thickness: SP_POCHE, ink: SP_SCREEN },
  { a: { x: SP_VX, y: SP_T }, b: { x: SP_VX, y: 246 }, thickness: SP_PART, ink: SP_SCREEN },
  { a: { x: SP_VX, y: 316 }, b: { x: SP_VX, y: SP_B }, thickness: SP_PART, ink: SP_SCREEN },
  { a: { x: SP_L, y: SP_HY }, b: { x: 186, y: SP_HY }, thickness: SP_PART, ink: SP_SCREEN },
  { a: { x: 256, y: SP_HY }, b: { x: SP_VX, y: SP_HY }, thickness: SP_PART, ink: SP_SCREEN },
  { a: { x: SP_BX, y: SP_BY }, b: { x: SP_R, y: SP_BY }, thickness: SP_PART, ink: SP_SCREEN },
  { a: { x: SP_BX, y: SP_BY }, b: { x: SP_BX, y: SP_B }, thickness: SP_PART, ink: SP_SCREEN },
];

/**
 * Gap left in each dimension run for the figure written in it.
 *
 * 60 px is not cosmetic. `minSegment` is 35 px at the default, and the stops
 * below are close enough together that every surviving chain piece lands under
 * it — which is what a real dimension string looks like and also what keeps
 * this fixture measuring the THRESHOLD rather than measuring how well the
 * detector ignores long annotation lines. Drawn with one figure per side
 * instead, an earlier draft of this fixture scored 64.3 % on a working engine,
 * because a full dimension FRAME is four long straight lines and `joinCorners`
 * welds the building to them — which would have made this fixture a measure of
 * that, not of the threshold. Drawn like this it scores 83.8 %.
 */
const SP_RUN_GAP = 60;

/**
 * One dimension string: a chain BROKEN at each run by its figure, a witness
 * line from just off each wall face out past the chain, and a 45-degree tick at
 * every stop. All of it `decoy` — none of it is a wall.
 */
function spDimString(
  axis: 'h' | 'v',
  base: number,
  stops: number[],
  face: number,
): { walls: WallSpec[]; speckles: SpeckleSpec[] } {
  const walls: WallSpec[] = [];
  const speckles: SpeckleSpec[] = [];
  const pen = { thickness: SP_ANN_W, ink: SP_ANN_INK, decoy: true as const };
  const pt = (along: number, off: number) => (axis === 'h' ? { x: along, y: off } : { x: off, y: along });
  const outward = base < face ? -1 : 1;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    walls.push({ a: pt(s, face + outward * 6), b: pt(s, base + outward * 7), ...pen });
    const d = 6;
    walls.push({
      a: axis === 'h' ? { x: s - d, y: base + d } : { x: base + d, y: s - d },
      b: axis === 'h' ? { x: s + d, y: base - d } : { x: base - d, y: s + d },
      ...pen,
    });
    if (i === stops.length - 1) continue;
    const next = stops[i + 1];
    const mid = (s + next) / 2;
    const half = SP_RUN_GAP / 2;
    if (mid - half > s) walls.push({ a: pt(s, base), b: pt(mid - half, base), ...pen });
    if (next > mid + half) walls.push({ a: pt(mid + half, base), b: pt(next, base), ...pen });
    speckles.push(
      axis === 'h'
        ? { x: mid - 18, y: base - 11, len: 36, size: 5, ink: SP_ANN_INK }
        : { x: base - 11, y: mid - 18, len: 36, size: 5, vertical: true, ink: SP_ANN_INK },
    );
  }
  return { walls, speckles };
}

const SP_DIM_TOP = spDimString('h', 40, [SP_L, 186, 256, SP_VX, 420, SP_BX, SP_R], SP_T);
const SP_DIM_LEFT = spDimString('v', 64, [SP_T, 168, SP_HY, SP_BY, 404, SP_B], SP_L);

/** Leaders to the room names. Both deliberately under `minSegment`. */
const SP_LEADERS: WallSpec[] = [
  { a: { x: 172, y: 146 }, b: { x: 150, y: 160 }, thickness: SP_ANN_W, ink: SP_ANN_INK, decoy: true },
  { a: { x: 416, y: 136 }, b: { x: 394, y: 150 }, thickness: SP_ANN_W, ink: SP_ANN_INK, decoy: true },
];

/** Room names and areas, the title strip, and the door/window tags. */
const SP_TEXT: SpeckleSpec[] = (
  [
    [176, 140, 64],
    [176, 155, 46],
    [420, 130, 70],
    [420, 145, 50],
    [402, 484, 132],
    [402, 498, 96],
    [210, 258, 22],
    [344, 258, 22],
    [476, 338, 22],
    [92, 200, 20],
    [604, 240, 20],
  ] as number[][]
).map(([x, y, len]) => ({ x, y, len, size: 5, ink: SP_ANN_INK }));

/**
 * Solid fixtures at the SAME screen tint as the walls — a bath, a WC, a kitchen
 * run, a bed, a sofa.
 *
 * Every other fixture in this corpus draws furniture and walls in the same
 * DEFAULT ink, so "can `removeThickRegions` separate them when they share a
 * tone?" has only ever been asked at one tone. Here that tone is the light one,
 * which is the case a threshold error deletes first. They cost 3.7 points of
 * score (87.5 % -> 83.8 % on a working engine) and change nothing about the
 * refusal, which is the right trade for a question no other fixture asks.
 */
const SP_FIXTURES: BlobSpec[] = [
  { kind: 'rect', x: 548, y: 400, w: 96, h: 46, ink: SP_SCREEN },
  { kind: 'circle', x: 508, y: 420, w: 34, h: 34, ink: SP_SCREEN },
  { kind: 'rect', x: 420, y: 96, w: 104, h: 40, ink: SP_SCREEN },
  { kind: 'rect', x: 200, y: 370, w: 92, h: 62, ink: SP_SCREEN },
  { kind: 'rect', x: 210, y: 190, w: 110, h: 52, ink: SP_SCREEN },
];

const SCREENED_POCHE: PlanSpec = {
  name: 'screened-poche',
  width: SP_W,
  height: SP_H,
  paper: SP_PAPER,
  ink: SP_SCREEN,
  strokeWidth: SP_PART,
  walls: [...SP_WALLS, ...SP_DIM_TOP.walls, ...SP_DIM_LEFT.walls, ...SP_LEADERS],
  blobs: SP_FIXTURES,
  speckles: [...SP_DIM_TOP.speckles, ...SP_DIM_LEFT.speckles, ...SP_TEXT],
  // Deliberately a clean vector render, like `heavy-poche`. The failure survives
  // blur/noise/lighting/rotation as well (measured, four treatments up to 22
  // degrees off-square, all still refused), so photo realism would only cost
  // score without adding a guard.
  seed: 28,
};

export const CORPUS: CorpusEntry[] = [
  {
    why: 'the simplest possible plan — if this is wrong nothing else matters',
    expectWalls: 4,
    spec: { name: 'clean-rect', width: W, height: H, strokeWidth: 3, walls: shell(3) },
  },
  {
    why: 'heavy strokes: the thickness itself is what manufactured duplicate detections',
    expectWalls: 4,
    spec: { name: 'thick-rect', width: W, height: H, strokeWidth: 11, walls: shell(11) },
  },
  {
    why: 'cavity walls drawn as two faces — the classic architectural double line',
    expectWalls: 4,
    spec: {
      name: 'hollow-rect',
      width: W,
      height: H,
      strokeWidth: 12,
      walls: shell(12).map((w) => ({ ...w, hollow: true })),
    },
  },
  {
    why: 'interior partition plus a door gap: a detection that bridges the gap must cost precision',
    expectWalls: 6,
    spec: {
      name: 'two-room',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [
        ...shell(9),
        { a: { x: 360, y: 50 }, b: { x: 360, y: 250 }, thickness: 9 },
        { a: { x: 360, y: 320 }, b: { x: 360, y: 470 }, thickness: 9 },
      ],
    },
  },
  {
    why: 'the everyday case: four rooms, doors, bathroom — bare, so misses are unambiguous',
    expectWalls: 10,
    spec: { name: 'apartment-bare', width: W, height: H, strokeWidth: 9, walls: [...shell(9), ...interior(9)] },
  },
  {
    why: 'the SAME plan furnished: solid blobs are what the old bbox filter let through',
    expectWalls: 10,
    spec: {
      name: 'apartment-furnished',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
    },
  },
  {
    why: 'furnished plus door arcs and dimension text — everything a real plan carries',
    expectWalls: 10,
    spec: {
      name: 'apartment-annotated',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
      ...ANNOTATION,
    },
  },
  {
    why: 'the owner-facing case: the annotated plan as a PHONE PHOTO — blurred, noisy, unevenly lit',
    expectWalls: 10,
    spec: {
      name: 'apartment-photo',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
      ...ANNOTATION,
      photo: { blur: 1, noise: 6, gradient: 26, contrast: 0.92 },
      seed: 7,
    },
  },
  {
    why: 'the phone held off-square: a 4-degree rotation and a shear defeat any axis-aligned shortcut',
    expectWalls: 10,
    spec: {
      name: 'apartment-skewed',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
      ...ANNOTATION,
      photo: { blur: 1, noise: 5, gradient: 18, rotate: 4, skew: 0.03 },
      seed: 11,
    },
  },
  {
    why: 'a faint scan: Otsu has to find a threshold with almost no contrast to work with',
    expectWalls: 10,
    spec: {
      name: 'apartment-faint',
      width: W,
      height: H,
      paper: 232,
      ink: 150,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
      photo: { blur: 1, noise: 4 },
      seed: 3,
    },
  },
  {
    why: 'white-on-dark blueprint: the ink-is-the-minority-class inversion has to hold',
    expectWalls: 10,
    spec: {
      name: 'blueprint',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
      blueprint: true,
    },
  },
  {
    why: 'A GENUINELY ANGLED WALL. Manhattan regularization must not silently rotate it flat.',
    expectWalls: 6,
    spec: {
      name: 'angled-wall',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [
        ...shell(9),
        // 30 degrees off horizontal, corner to corner across the right half.
        { a: { x: 380, y: 440 }, b: { x: 640, y: 290 }, thickness: 9 },
        { a: { x: 380, y: 440 }, b: { x: 380, y: 470 }, thickness: 9 },
      ],
      blobs: [FURNITURE[1]],
    },
  },
  {
    why: 'hairlines: stroke width is 1 px, so any constant derived from it has nothing to derive from',
    expectWalls: 10,
    spec: { name: 'hairline', width: W, height: H, strokeWidth: 1, walls: [...shell(1), ...interior(1)] },
  },
  {
    why: 'hatched wall fill and a tiled floor — large regions of regular diagonal ink',
    expectWalls: 10,
    spec: {
      name: 'hatched',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      hatches: [
        { x: 510, y: 360, w: 120, h: 100, pitch: 7, angle: 45 },
        { x: 380, y: 300, w: 100, h: 60, pitch: 9, angle: 135 },
      ],
    },
  },
  {
    why: 'closet- and bathroom-scale walls, near whatever minimum length the detector enforces',
    expectWalls: 12,
    spec: {
      name: 'tiny-rooms',
      width: W,
      height: H,
      strokeWidth: 7,
      walls: [
        ...shell(7),
        { a: { x: 60, y: 130 }, b: { x: 170, y: 130 }, thickness: 7 },
        { a: { x: 170, y: 50 }, b: { x: 170, y: 130 }, thickness: 7 },
        { a: { x: 230, y: 50 }, b: { x: 230, y: 120 }, thickness: 7 },
        { a: { x: 230, y: 120 }, b: { x: 310, y: 120 }, thickness: 7 },
        { a: { x: 60, y: 400 }, b: { x: 140, y: 400 }, thickness: 7 },
        { a: { x: 140, y: 400 }, b: { x: 140, y: 470 }, thickness: 7 },
        { a: { x: 560, y: 50 }, b: { x: 560, y: 140 }, thickness: 7 },
        { a: { x: 560, y: 140 }, b: { x: 640, y: 140 }, thickness: 7 },
      ],
    },
  },
  {
    why: 'an OPEN studio: only the shell plus one stub, so "just return the bounding box" is nearly right and must still be visibly short',
    expectWalls: 6,
    spec: {
      name: 'studio-open',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [
        ...shell(9),
        { a: { x: 430, y: 50 }, b: { x: 430, y: 190 }, thickness: 9 },
        { a: { x: 430, y: 190 }, b: { x: 640, y: 190 }, thickness: 9 },
      ],
      // Deliberately re-placed so nothing sits ON a wall: furniture that
      // TOUCHES a wall is the case worth testing (and `apartment-furnished`
      // covers it), whereas furniture drawn straight over one is not a plan any
      // human produced, and would make this fixture assert that the detector
      // can see through a sofa.
      blobs: [
        { kind: 'rect', x: 250, y: 300, w: 150, h: 80 },
        { kind: 'rect', x: 545, y: 300, w: 140, h: 90 },
        { kind: 'rect', x: 150, y: 420, w: 120, h: 70 },
        { kind: 'circle', x: 300, y: 420, w: 70, h: 70 },
      ],
      ...ANNOTATION,
    },
  },
  {
    // Added after a benchmark run found the refusal firing on a legitimate
    // many-room plan: every fixture above is 4-12 walls, so nothing in the set
    // exercised the regime where interior partitions outnumber the shell and
    // most of them end at a doorway rather than a corner. That is the shape
    // whose STRUCTURE score is naturally lowest, which is exactly the shape a
    // structure-based refusal will wrongly reject.
    why: 'A WHOLE FLOOR: 27 walls, most ending at a doorway rather than a corner — the low-structure regime',
    expectWalls: 27,
    spec: {
      name: 'apartment-large',
      width: 900,
      height: 700,
      strokeWidth: 10,
      walls: (() => {
        const t = 10;
        const out = [
          { a: { x: 40, y: 40 }, b: { x: 860, y: 40 }, thickness: t },
          { a: { x: 860, y: 40 }, b: { x: 860, y: 660 }, thickness: t },
          { a: { x: 860, y: 660 }, b: { x: 40, y: 660 }, thickness: t },
          { a: { x: 40, y: 660 }, b: { x: 40, y: 40 }, thickness: t },
          { a: { x: 40, y: 350 }, b: { x: 300, y: 350 }, thickness: t },
          { a: { x: 380, y: 350 }, b: { x: 860, y: 350 }, thickness: t },
        ];
        for (const x of [240, 440, 640]) {
          out.push({ a: { x, y: 40 }, b: { x, y: 160 }, thickness: t });
          out.push({ a: { x, y: 240 }, b: { x, y: 350 }, thickness: t });
          out.push({ a: { x, y: 350 }, b: { x, y: 470 }, thickness: t });
          out.push({ a: { x, y: 550 }, b: { x, y: 660 }, thickness: t });
        }
        for (const y of [160, 500]) {
          out.push({ a: { x: 40, y }, b: { x: 160, y }, thickness: t });
          out.push({ a: { x: 720, y }, b: { x: 860, y }, thickness: t });
        }
        return out;
      })(),
      blobs: [
        { kind: 'rect', x: 140, y: 250, w: 130, h: 60 },
        { kind: 'rect', x: 540, y: 240, w: 150, h: 80 },
        { kind: 'rect', x: 760, y: 590, w: 110, h: 60 },
        { kind: 'circle', x: 340, y: 600, w: 80, h: 80 },
      ],
      photo: { blur: 1, noise: 5, gradient: 18 },
      seed: 41,
    },
  },
  {
    why: 'the same floor as a CLUTTERED photo: heavy furniture, labels everywhere, a real phone capture',
    expectWalls: 27,
    spec: {
      name: 'apartment-cluttered',
      width: 900,
      height: 700,
      strokeWidth: 10,
      walls: (() => {
        const t = 10;
        const out = [
          { a: { x: 40, y: 40 }, b: { x: 860, y: 40 }, thickness: t },
          { a: { x: 860, y: 40 }, b: { x: 860, y: 660 }, thickness: t },
          { a: { x: 860, y: 660 }, b: { x: 40, y: 660 }, thickness: t },
          { a: { x: 40, y: 660 }, b: { x: 40, y: 40 }, thickness: t },
          { a: { x: 40, y: 350 }, b: { x: 300, y: 350 }, thickness: t },
          { a: { x: 380, y: 350 }, b: { x: 860, y: 350 }, thickness: t },
        ];
        for (const x of [240, 440, 640]) {
          out.push({ a: { x, y: 40 }, b: { x, y: 160 }, thickness: t });
          out.push({ a: { x, y: 240 }, b: { x, y: 350 }, thickness: t });
          out.push({ a: { x, y: 350 }, b: { x, y: 470 }, thickness: t });
          out.push({ a: { x, y: 550 }, b: { x, y: 660 }, thickness: t });
        }
        for (const y of [160, 500]) {
          out.push({ a: { x: 40, y }, b: { x: 160, y }, thickness: t });
          out.push({ a: { x: 720, y }, b: { x: 860, y }, thickness: t });
        }
        return out;
      })(),
      blobs: Array.from({ length: 18 }, (_, i) => ({
        kind: 'rect' as const,
        x: 110 + (i % 6) * 140,
        y: 100 + Math.floor(i / 6) * 220,
        w: 84,
        h: 54,
        rotation: (i * 11) % 35,
      })),
      speckles: Array.from({ length: 16 }, (_, i) => ({
        x: 70 + (i % 8) * 100,
        y: 90 + Math.floor(i / 8) * 300,
        len: 62,
        size: 5,
      })),
      arcs: [
        { x: 300, y: 350, r: 66, from: 180, to: 250 },
        { x: 240, y: 160, r: 66, from: 0, to: 70 },
        { x: 640, y: 470, r: 66, from: 90, to: 165 },
      ],
      photo: { blur: 1, noise: 8, gradient: 30, contrast: 0.9, rotate: 2, skew: 0.015 },
      seed: 97,
    },
  },
  {
    // Added after an adversarial pass found that the standard apartment
    // photographed 8, 20, 22, 24 or 26 degrees off-square returned ZERO walls.
    // The corpus rotated by 4 degrees, which is inside the band where the bug
    // did not fire — the S19 lesson verbatim: the corpus followed the code's
    // guards rather than the user's camera.
    why: 'A PHONE SHOT 22 DEGREES OFF-SQUARE — the angle at which wall tracing used to disintegrate',
    expectWalls: 10,
    spec: {
      name: 'apartment-rotated',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [...shell(9), ...interior(9)],
      blobs: FURNITURE,
      photo: { blur: 1, noise: 5, gradient: 20, rotate: 22 },
      seed: 13,
    },
  },
  {
    // The second wrongly-refused shape the same pass found: one global stroke
    // width fits neither population when the exterior is heavy poche and the
    // partitions are hairlines, which is a standard drafting convention.
    why: 'HEAVY POCHE exterior with thin partitions — one stroke-width estimate has to serve both',
    expectWalls: 10,
    spec: {
      name: 'heavy-poche',
      width: W,
      height: H,
      strokeWidth: 22,
      walls: [...shell(22), ...interior(3).map((w) => ({ ...w, thickness: 3 }))],
      blobs: FURNITURE,
    },
  },
  {
    // Added in S26, after the owner's OWN floorplan was measured for the first
    // time and landed in a band no synthetic fixture occupied.
    //
    // Every other entry here is a Manhattan rectangle, or a Manhattan rectangle
    // rotated (which leaves every corner square), or has one oblique wall in an
    // otherwise square room. A real surveyed flat is none of those, and the
    // combination is what makes it hard:
    //
    //   - a NON-ORTHOGONAL envelope: three long oblique runs, no two adjacent
    //     walls at a right angle
    //   - CORNERS BUILT FROM SUB-THRESHOLD JOGS. The steps and notches between
    //     the long runs are 37-57 px against a `minSegment` of 38 px at the
    //     default and 54 px at 'Careful'. They are what HOLDS the long walls
    //     together, so as soon as the length cut removes them the survivors have
    //     nothing to meet — which is the entire mechanism behind this fixture's
    //     low structure, and behind the owner's plan's.
    //   - dimension lines beside every wall over 40 px (20 of the 25), and on
    //     both faces of the first nine envelope runs
    //   - heavy poche outside (10) against thin partitions (6)
    //   - a warren of closet-scale rooms, each with its own doorway
    //
    // Measured: structure 0.222 at 'Careful' (REFUSED before S26's monotonic-knob
    // guarantee, which is what made that guarantee's test fail first) / 0.346 at
    // 'Balanced' / 0.658 at 'Thorough'. The 0.346 is the LOWEST of any legitimate fixture at the
    // default (next is `apartment-cluttered` at 0.425), so this entry is what
    // holds the bottom of the corpus's structure range — the gap the owner's
    // real plan sits in, which nothing synthetic occupied before.
    why: 'A SURVEYED FLAT: oblique envelope, sub-threshold corner jogs, dimensioned walls — the lowest structure margin in the corpus',
    // 25 centrelines are painted; the detector finds 13 at the default, which is
    // why this fixture scores 74.7 % — the lowest in the corpus. `expectWalls` is
    // what a HUMAN would draw, so it is the painted count, not the found count:
    // setting it to 13 would make a partial read look like a complete answer.
    expectWalls: 25,
    spec: OBLIQUE_SURVEY,
  },
  {
    // Added in S27. Every fixture above draws ONE ink tone on ONE paper tone, so
    // every page in the corpus is bimodal — which is precisely the case Otsu is
    // built for, and precisely why nothing here could express the shape that
    // breaks it.
    //
    // The owner's own scan has a THIRD tone mass: flat grey letterbox bars down
    // both side edges, 11.1 % of the page at luminance ~198, verified present in
    // the original 1320x1734 PNG and not introduced by any resampling. With ink,
    // bars and paper the between-class variance has two near-tied maxima, and a
    // small NONLINEAR tone change flips which one wins — 175 -> 208 on their
    // file, taking structure 0.500 -> 0.077 and refusing the plan.
    //
    // Not an exposure bug, and the distinction is measured rather than pedantic:
    // over the owner's file, linear gain (+/-0.3 EV) refuses 0 of 46 and an
    // additive lift refuses 0 of 41, while a gamma curve refuses 26 of 41. Gain
    // preserves tone ratios and lift preserves differences; only a curve moves
    // the grey mass and the paper by different amounts. Tone curves are what
    // phone pipelines, auto-enhance and contrast sliders apply.
    why: 'A THIRD TONE MASS: flat grey scanner bars over 11 % of the page put two near-tied maxima in Otsu\'s criterion — the shape that made the owner\'s plan flip from read to refused',
    expectWalls: 10,
    spec: SCAN_LETTERBOX,
  },
  {
    // Added in S28, and it is `scan-letterbox`'s MIRROR — the two of them
    // together are what pin the threshold rule from both sides.
    //
    // S27 fixed `scan-letterbox` by weighting Otsu's histogram by local
    // gradient, so that a flat mass votes in proportion to its BOUNDARY rather
    // than its area. That is right there and inverted here: gradient weighting
    // scales a tone's vote by roughly 1/thickness, so on a plotted sheet with
    // screened poche walls and hairline black annotation it amplifies the
    // linework, demotes the wall bodies, and the threshold lands with every wall
    // on the paper side of the cut. Measured on the S27 engine: 1 wall,
    // structure 0.000, REFUSED — "This image doesn't have enough clear straight
    // lines to read as a floorplan", about the page below.
    //
    // The pair is what makes the argument, because each one falsifies a
    // different simple rule. On `scan-letterbox` the correct cut admits LESS ink
    // (6.7 % against 31.9 %) and comes from the EDGE histogram; here it admits
    // MORE (16.3 % against 0.7 %) and comes from the PLAIN one. So "always
    // weight by gradient", "always use the plain histogram", "prefer the
    // candidate admitting less ink" and "prefer the one admitting more" each
    // break exactly one of these two. The choice has to be made downstream, on
    // whether the reading is a floorplan — which is the S28 candidate set.
    why: 'THE INK POLARITY: screened poche walls under hairline black annotation, so the LIGHT tone is the structure — the mirror of scan-letterbox, and what a gradient-weighted threshold alone deletes',
    expectWalls: 10,
    spec: SCREENED_POCHE,
  },
  {
    why: 'THE NULL CASE: a photo of a table and some text, no floorplan at all. Detection must REFUSE.',
    expectWalls: 0,
    refuse: true,
    spec: {
      name: 'no-plan',
      width: W,
      height: H,
      strokeWidth: 9,
      walls: [],
      blobs: [
        { kind: 'rect', x: 300, y: 240, w: 260, h: 190, rotation: 12 },
        { kind: 'circle', x: 520, y: 150, w: 120, h: 120 },
        { kind: 'rect', x: 150, y: 420, w: 130, h: 70, rotation: -7 },
      ],
      speckles: [
        { x: 90, y: 90, len: 190, size: 6 },
        { x: 90, y: 120, len: 150, size: 6 },
      ],
      photo: { blur: 1, noise: 8, gradient: 30 },
      seed: 23,
    },
  },
  {
    // A HARDER null case than `no-plan`: long straight lines that survive every
    // shape filter, because they really are thin and really are long. Window
    // blinds, a bookshelf, a radiator, a fence. Nothing joins anything, which
    // is the only thing separating them from a floorplan — and is exactly the
    // signal `MIN_STRUCTURE` exists to read. Added when that threshold was
    // LOWERED, so the loosening had something to be falsified against.
    why: 'THE HARD NULL CASE: parallel straight lines that join nothing. Must REFUSE.',
    expectWalls: 0,
    refuse: true,
    spec: {
      name: 'no-plan-lines',
      width: W,
      height: H,
      strokeWidth: 6,
      walls: Array.from({ length: 9 }, (_, i) => ({
        a: { x: 80, y: 60 + i * 48 },
        b: { x: 620, y: 60 + i * 48 },
        thickness: 6,
        decoy: true,
      })),
      photo: { blur: 1, noise: 6, gradient: 22 },
      seed: 31,
    },
  },
  {
    // The null that S26's own fix let through, before the fix was fixed.
    //
    // Pooling a second reading into the structure gate is safe only if that
    // reading is itself a DETECTION. This image is built to break exactly that:
    // two long shelf edges meeting in an L, plus a scatter of isolated sticks.
    // At the default the length cut keeps only the L, which scores a perfect
    // structure 0.500 while being refused for `MIN_WALLS` — and that 0.500,
    // pooled into the 'Thorough' reading, accepted 11 unrelated sticks at 69 %
    // confidence. Measured, before the guard: OFFERED at 1.5 in 9 of 9 variants
    // over stick lengths 32/34/36 and 7/9/12 sticks.
    //
    // It is also the fixture that RETIRES a comfortable-sounding claim: the two
    // older nulls score structure exactly 0.000, which made "a null fails both
    // arms by a mile" look like a law. It is not one. This one scores 0.500 on
    // the arm that matters.
    why: 'THE NULL THAT BEAT THE POOLED GATE: a shelf L plus loose sticks, whose DEFAULT reading is a perfect 2-segment corner. Must REFUSE.',
    expectWalls: 0,
    refuse: true,
    spec: {
      name: 'no-plan-shelf',
      width: W,
      height: H,
      strokeWidth: 6,
      walls: [
        { a: { x: 90, y: 90 }, b: { x: 600, y: 90 }, thickness: 6, decoy: true },
        { a: { x: 600, y: 90 }, b: { x: 600, y: 430 }, thickness: 6, decoy: true },
        ...Array.from({ length: 9 }, (_, i) => ({
          a: { x: 110 + (i % 3) * 160, y: 170 + Math.floor(i / 3) * 90 },
          b: { x: 110 + (i % 3) * 160 + 34, y: 170 + Math.floor(i / 3) * 90 + 8 },
          thickness: 5,
          decoy: true,
        })),
      ],
      photo: { blur: 1, noise: 6, gradient: 22 },
      seed: 31,
    },
  },
];

/** Rasterise the whole corpus. Deterministic — same bytes on every machine. */
export function corpusFixtures(): Array<Fixture & { entry: CorpusEntry }> {
  return CORPUS.map((entry) => ({ ...rasterize(entry.spec), entry }));
}

export function fixtureByName(name: string): Fixture & { entry: CorpusEntry } {
  const found = corpusFixtures().find((f) => f.name === name);
  if (!found) throw new Error(`no corpus fixture named ${name}`);
  return found;
}
