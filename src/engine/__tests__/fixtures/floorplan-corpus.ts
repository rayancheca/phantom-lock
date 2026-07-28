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

import { rasterize, type Fixture, type PlanSpec } from './floorplan-raster';

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
