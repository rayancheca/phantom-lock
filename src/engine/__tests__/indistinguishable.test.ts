/**
 * WHY A FLOORPLAN AND A PAGE OF FURNITURE OUTLINES CANNOT BE TOLD APART HERE.
 *
 * `docs/ideas.md` Section 13e stood as a P1 for three sessions: a page of four
 * thin furniture OUTLINES is offered 27/27 readings at structure up to 1.000 and
 * confidence 1.00, and the obvious reading of that is "the refusal gates are too
 * loose". S31 measured it instead, and the obvious reading is wrong.
 *
 * The gates are not too loose. The information is not in the image.
 *
 * `assessDetection` is a pure function of the detected SEGMENTS and the wall
 * mask. This file pins, as executable statements, the measurements behind that —
 * so that the next session spends its budget on the seam where the missing
 * information actually lives (metric scale; see the redirect at the bottom of
 * this file and in `docs/ideas.md` Section 13e) rather than on another threshold
 * sweep.
 *
 * ⚠️ WHAT IS AND IS NOT PROVED HERE, because the distinction decides what a
 * future session may skip. The tests below compute exactly three statistics —
 * cohesion, containment, span — and the THEOREM they demonstrate covers that
 * RATIO-TO-THE-WHOLE family only. It says nothing about enclosure, cycle counts,
 * or junction degree, which are not of that form. Those are refuted separately
 * and by measurement, recorded in `vision/quality.ts` and `docs/ideas.md`
 * Section 13e: enclosure is dead on the corpus's own numbers (two legitimate
 * fixtures score 0.000 because one door gap floods the interior), and a
 * T-junction rule refuses `clean-rect`/`thick-rect`/`hollow-rect`, which have
 * none by construction.
 *
 * The argument that DOES generalise is the corpus one, and the shrink ladder
 * below is its executable half: `clean-rect` (floor 0.98) is one closed
 * rectangle and `two-room` (floor 0.95) is two rectangles sharing a wall, so the
 * null constructions are drawings this suite already demands be accepted.
 *
 * Read these tests as a PROOF OBLIGATION, not as approval of the current
 * behaviour. If someone finds a genuinely separating signal, several of these
 * will fail — and that failure is the good news, not a regression. Each one says
 * what to conclude if it goes red.
 */
import { describe, expect, it } from 'vitest';
import { detectWalls } from '../detect';
import { rasterize, type PlanSpec, type WallSpec } from './fixtures/floorplan-raster';
import type { GrayImage, PxSegment } from '../vision/types';
import { segLength } from '../vision/types';

const W = 700;
const H = 520;
/** The three levels the UI exposes, as `DetectOptions.sensitivity`. */
const UI = [0.7, 1, 1.5] as const;
const LEVEL = ['Careful', 'Balanced', 'Thorough'] as const;

// ---------------------------------------------------------------------------
// the candidate signals, recomputed here rather than exported from the engine
//
// None of them ships. Keeping them local is deliberate: they are the signals
// this file REFUTES, and exporting a refuted signal from `vision/` would put
// dead code in the bundle and invite a future caller to gate on it.
// ---------------------------------------------------------------------------

/** The pipeline's own junction radius, from the constants `detect.ts` publishes. */
function junctionRadius(img: GrayImage, strokeWidth: number, sensitivity: number): number {
  const maxDim = Math.max(img.width, img.height);
  const minSegment = Math.max(12, (0.05 * maxDim) / sensitivity);
  return Math.max(6, strokeWidth * 2, minSegment * 0.25);
}

function distToSegment(p: { x: number; y: number }, s: PxSegment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2));
  return Math.hypot(p.x - (s.a.x + dx * t), p.y - (s.a.y + dy * t));
}

/**
 * Segments in one connected component, where "connected" is symmetrised
 * endpoint-to-SEGMENT contact.
 *
 * Symmetrised on purpose: `structureScore` asks the one-sided question — does MY
 * endpoint touch anything — which a closed box satisfies perfectly while saying
 * nothing about whether the boxes belong to one another.
 */
function componentsOf(segs: PxSegment[], radius: number): number[][] {
  const adj: number[][] = segs.map(() => []);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const touch =
        distToSegment(segs[i].a, segs[j]) <= radius ||
        distToSegment(segs[i].b, segs[j]) <= radius ||
        distToSegment(segs[j].a, segs[i]) <= radius ||
        distToSegment(segs[j].b, segs[i]) <= radius;
      if (touch) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const seen = new Array(segs.length).fill(false);
  const out: number[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (seen[i]) continue;
    const group: number[] = [];
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const k = stack.pop() as number;
      group.push(k);
      for (const m of adj[k]) {
        if (!seen[m]) {
          seen[m] = true;
          stack.push(m);
        }
      }
    }
    out.push(group);
  }
  return out;
}

function largestComponent(segs: PxSegment[], radius: number): number[] {
  let best: number[] = [];
  let bestLen = -1;
  for (const g of componentsOf(segs, radius)) {
    const len = g.reduce((a, i) => a + segLength(segs[i]), 0);
    if (len > bestLen) {
      bestLen = len;
      best = g;
    }
  }
  return best;
}

function totalLength(segs: PxSegment[]): number {
  return segs.reduce((a, s) => a + segLength(s), 0);
}

/** Length in the largest connected component / total length. */
function cohesion(segs: PxSegment[], radius: number): number {
  if (segs.length === 0) return 0;
  const big = largestComponent(segs, radius);
  return big.reduce((a, i) => a + segLength(segs[i]), 0) / Math.max(1e-9, totalLength(segs));
}

function bboxOf(segs: PxSegment[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segs) {
    x0 = Math.min(x0, s.a.x, s.b.x);
    y0 = Math.min(y0, s.a.y, s.b.y);
    x1 = Math.max(x1, s.a.x, s.b.x);
    y1 = Math.max(y1, s.a.y, s.b.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Fraction of total wall length whose midpoint lies inside the largest
 * component's own footprint.
 *
 * The most promising of the candidates, because a plan the tracer FRAGMENTED
 * still has its fragments interleaved inside one footprint (so it stays high
 * where `cohesion` collapses), while separate objects sit outside each other's.
 */
function containment(segs: PxSegment[], radius: number): number {
  if (segs.length === 0) return 0;
  const big = largestComponent(segs, radius);
  const b = bboxOf(big.map((i) => segs[i]));
  let inside = 0;
  for (const s of segs) {
    const mx = (s.a.x + s.b.x) / 2;
    const my = (s.a.y + s.b.y) / 2;
    if (mx >= b.x0 - radius && mx <= b.x1 + radius && my >= b.y0 - radius && my <= b.y1 + radius) {
      inside += segLength(s);
    }
  }
  return inside / Math.max(1e-9, totalLength(segs));
}

/** bbox diagonal of the largest component / bbox diagonal of everything. */
function spanFraction(segs: PxSegment[], radius: number): number {
  if (segs.length === 0) return 0;
  const all = bboxOf(segs);
  const big = bboxOf(largestComponent(segs, radius).map((i) => segs[i]));
  const d = Math.hypot(all.w, all.h);
  return d > 0 ? Math.hypot(big.w, big.h) / d : 0;
}

// ---------------------------------------------------------------------------
// the drawings
// ---------------------------------------------------------------------------

/** A closed rectangle as four wall centrelines. */
function rect(x: number, y: number, w: number, h: number, t: number): WallSpec[] {
  return [
    { a: { x, y }, b: { x: x + w, y }, thickness: t },
    { a: { x: x + w, y }, b: { x: x + w, y: y + h }, thickness: t },
    { a: { x: x + w, y: y + h }, b: { x, y: y + h }, thickness: t },
    { a: { x, y: y + h }, b: { x, y }, thickness: t },
  ];
}

/**
 * The corpus `two-room` centrelines, VERBATIM — a shell plus one partition with
 * a door gap. It carries a 0.95 accuracy floor in `detect.test.ts`, so the suite
 * already requires this drawing to be accepted.
 *
 * Note what it is geometrically: TWO RECTANGLES SHARING A WALL.
 */
const TWO_ROOM: WallSpec[] = [
  { a: { x: 60, y: 50 }, b: { x: 640, y: 50 }, thickness: 9 },
  { a: { x: 640, y: 50 }, b: { x: 640, y: 470 }, thickness: 9 },
  { a: { x: 640, y: 470 }, b: { x: 60, y: 470 }, thickness: 9 },
  { a: { x: 60, y: 470 }, b: { x: 60, y: 50 }, thickness: 9 },
  { a: { x: 360, y: 50 }, b: { x: 360, y: 250 }, thickness: 9 },
  { a: { x: 360, y: 320 }, b: { x: 360, y: 470 }, thickness: 9 },
];

/** Scale the same centrelines about the page centre, thinning the stroke with them. */
function shrink(walls: WallSpec[], k: number, dx = 0, dy = 0): WallSpec[] {
  const cx = W / 2;
  const cy = H / 2;
  const m = (p: { x: number; y: number }) => ({
    x: cx + (p.x - cx) * k + dx,
    y: cy + (p.y - cy) * k + dy,
  });
  return walls.map((w) => ({
    ...w,
    a: m(w.a),
    b: m(w.b),
    thickness: Math.max(2, Math.round((w.thickness ?? 9) * k)),
  }));
}

function plan(name: string, walls: WallSpec[], strokeWidth = 9): PlanSpec {
  return { name, width: W, height: H, strokeWidth, walls };
}

/** A dwelling: shell, one partition with a door gap. Used at several sizes. */
function unit(x: number, y: number, w: number, h: number, t: number): WallSpec[] {
  const mx = x + Math.round(w * 0.55);
  return [
    ...rect(x, y, w, h, t),
    { a: { x: mx, y }, b: { x: mx, y: y + Math.round(h * 0.45) }, thickness: t },
    { a: { x: mx, y: y + Math.round(h * 0.68) }, b: { x: mx, y: y + h }, thickness: t },
  ];
}

/** Section 13e's own attack, verbatim: four thin furniture outlines, no plan. */
const FURNITURE_PAGE: PlanSpec = {
  name: 'furniture-outlines',
  width: W,
  height: H,
  strokeWidth: 5,
  ink: 40,
  walls: [],
  blobs: [
    { kind: 'rect', x: 200, y: 150, w: 190, h: 120, outline: 5 },
    { kind: 'rect', x: 480, y: 130, w: 150, h: 90, outline: 5 },
    { kind: 'rect', x: 230, y: 380, w: 220, h: 110, outline: 5 },
    { kind: 'rect', x: 520, y: 370, w: 130, h: 140, outline: 5 },
  ],
  photo: { blur: 1, noise: 6, gradient: 22 },
  seed: 41,
};

/**
 * Four furniture outlines that SHARE EDGES, so the tracer returns them as ONE
 * connected component. The cheapest possible defeat of the whole signal family
 * — see the theorem in the test that uses it.
 */
const FURNITURE_TOUCHING: PlanSpec = {
  ...FURNITURE_PAGE,
  name: 'furniture-touching',
  blobs: [
    { kind: 'rect', x: 200, y: 180, w: 160, h: 120, outline: 5 },
    { kind: 'rect', x: 360, y: 180, w: 160, h: 120, outline: 5 },
    { kind: 'rect', x: 200, y: 300, w: 160, h: 120, outline: 5 },
    { kind: 'rect', x: 360, y: 300, w: 160, h: 120, outline: 5 },
  ],
};

/** The same four boxes pushed into a tight block — the ADVERSARIAL arrangement. */
const FURNITURE_TIGHT: PlanSpec = {
  ...FURNITURE_PAGE,
  name: 'furniture-tight',
  blobs: [
    { kind: 'rect', x: 250, y: 180, w: 150, h: 100, outline: 5 },
    { kind: 'rect', x: 415, y: 180, w: 120, h: 100, outline: 5 },
    { kind: 'rect', x: 250, y: 295, w: 150, h: 110, outline: 5 },
    { kind: 'rect', x: 415, y: 295, w: 120, h: 110, outline: 5 },
  ],
};

/** A legitimate sheet holding two DETACHED dwellings. Ordinary architectural output. */
const DETACHED_DUPLEX: PlanSpec = {
  name: 'detached-duplex',
  width: 900,
  height: 640,
  strokeWidth: 9,
  walls: [...unit(50, 90, 340, 460, 9), ...unit(510, 90, 340, 460, 9)],
  seed: 7,
};

/**
 * Three dwellings on one sheet — a terrace. The same shape as the duplex and
 * just as ordinary, but it inverts against the null by a wide enough margin
 * (0.333 against 0.522) that the assertion below is not a knife-edge.
 */
const TERRACE_OF_THREE: PlanSpec = {
  name: 'terrace-of-three',
  width: 900,
  height: 640,
  strokeWidth: 9,
  walls: [...unit(40, 90, 250, 460, 9), ...unit(330, 90, 250, 460, 9), ...unit(620, 90, 250, 460, 9)],
  seed: 7,
};

// ---------------------------------------------------------------------------
// EVERY detection runs ONCE, at module scope.
//
// Not a micro-optimisation — the same lesson `detect.test.ts` records twice.
// Detection inside an `it` passes under `npm test` and straddles the 5 s
// per-test ceiling under `npm run test:coverage`, where v8 instrumentation makes
// the identical work several times slower. Module scope is evaluated during
// COLLECTION, which is not timeout-bound.
// ---------------------------------------------------------------------------

interface Reading {
  accepted: boolean;
  n: number;
  structure: number;
  support: number;
  explained: number;
  confidence: number;
  cohesion: number;
  containment: number;
  span: number;
}

function readAll(spec: PlanSpec): Reading[] {
  const { img } = rasterize(spec);
  return UI.map((s) => {
    const r = detectWalls(img, { sensitivity: s });
    const radius = junctionRadius(img, r.strokeWidth, s);
    return {
      accepted: r.quality.refusal === null,
      n: r.segments.length,
      structure: r.quality.structure,
      support: r.quality.support,
      explained: r.quality.explained,
      confidence: r.quality.confidence,
      cohesion: cohesion(r.segments, radius),
      containment: containment(r.segments, radius),
      span: spanFraction(r.segments, radius),
    };
  });
}

const SHRINK_LADDER = [1, 0.6, 0.45, 0.3].map((k) => ({
  k,
  readings: readAll(plan(`two-room-${k}`, shrink(TWO_ROOM, k))),
}));
const TWO_ROOM_CORNER = readAll(plan('two-room-corner', shrink(TWO_ROOM, 0.45, -140, -110)));

const COPY_LADDER = [1, 2, 3, 4].map((count) => {
  const boxes = [
    rect(200, 150, 190, 120, 3),
    rect(480, 130, 150, 90, 3),
    rect(230, 380, 220, 110, 3),
    rect(520, 370, 130, 140, 3),
  ].slice(0, count);
  return { count, readings: readAll(plan(`copies-${count}`, boxes.flat(), 3)) };
});

const FURNITURE = readAll(FURNITURE_PAGE);
const TIGHT = readAll(FURNITURE_TIGHT);
const DUPLEX = readAll(DETACHED_DUPLEX);
const TERRACE = readAll(TERRACE_OF_THREE);
const TOUCHING = readAll(FURNITURE_TOUCHING);

const at = (rs: Reading[], level: (typeof LEVEL)[number]) => rs[LEVEL.indexOf(level)];

describe('Section 13e — size on the page carries no signal', () => {
  /**
   * The tightest form of the argument. `two-room` is a required-accept corpus
   * fixture; shrinking it is the ONLY difference between it and "two boxes
   * pushed together", which is the cheapest null anyone has built.
   *
   * IF THIS FAILS: some constant became scale-sensitive. That is worth knowing
   * on its own — it would mean a plan's verdict depends on how much margin the
   * photographer left, which is the S26 lesson in a new place.
   */
  it('reads the SAME six wall centrelines identically at 100 %, 60 %, 45 % and 30 % of the page', () => {
    const full = SHRINK_LADDER[0].readings;
    for (const { k, readings } of SHRINK_LADDER) {
      readings.forEach((r, i) => {
        expect(r.accepted, `two-room at ${k * 100}% must be accepted at ${LEVEL[i]}`).toBe(true);
        // 30 % loses one short partition stub to `minSegment` at 'Careful'; that
        // is the length cut doing its documented job, not a change of verdict.
        expect(Math.abs(r.structure - full[i].structure)).toBeLessThan(0.1);
        expect(Math.abs(r.confidence - full[i].confidence)).toBeLessThan(0.05);
      });
    }
  });

  it('...and does not change its mind when the same plan is pushed into a corner', () => {
    TWO_ROOM_CORNER.forEach((r, i) => {
      expect(r.accepted).toBe(true);
      expect(r.cohesion).toBeCloseTo(1, 5);
      expect(r.containment).toBeCloseTo(1, 5);
      expect(Math.abs(r.structure - at(SHRINK_LADDER[0].readings, LEVEL[i]).structure)).toBeLessThan(0.1);
    });
  });

  /**
   * The ladder from the corpus's own `clean-rect` (one closed rectangle, floor
   * 0.98) to the Section 13e attack (four of them). Every rung is the previous
   * rung repeated, so any threshold that refuses the last rung must be placed
   * somewhere on a ladder whose every step is a legitimate drawing of rooms.
   */
  it('accepts one, two, three AND four closed rectangles — the attack is the corpus fixture, repeated', () => {
    for (const { count, readings } of COPY_LADDER) {
      for (const r of readings) {
        expect(r.accepted, `${count} rectangle(s) must be accepted`).toBe(true);
      }
    }
    // The signals decline monotonically with the copy count while the VERDICT
    // never moves — i.e. they are measuring "how many objects", not "is this a
    // plan". That is precisely why they cannot be a gate.
    const cohesions = COPY_LADDER.map((c) => at(c.readings, 'Balanced').cohesion);
    for (let i = 1; i < cohesions.length; i++) {
      expect(cohesions[i]).toBeLessThan(cohesions[i - 1]);
    }
    expect(cohesions[0]).toBeCloseTo(1, 5);
    expect(cohesions[3]).toBeLessThan(0.35);
  });
});

describe('Section 13e — every candidate gate OVERLAPS the protected population', () => {
  /**
   * THE INVERSION, and the single most important assertion in this file.
   *
   * A legitimate sheet holding two detached dwellings scores LOWER on both
   * cohesion and containment than a page of four furniture outlines pushed into
   * a tight block. Two ordinary constructions, the wrong way round.
   *
   * IF THIS FAILS: the inversion has closed and a cohesion-style floor may have
   * become viable. Re-run the full protected set before believing it — the
   * corpus alone puts the floor at 0.760 for `spanFrac`, and S31's own
   * constructions dropped that to 0.401.
   */
  it('ranks legitimate detached dwellings BELOW a tight furniture cluster, at every level', () => {
    LEVEL.forEach((level, i) => {
      const tight = TIGHT[i];
      expect(tight.accepted, `the null must be accepted at ${level} for the inversion to bite`).toBe(true);
      // A terrace of three: the wide-margin case, 0.333 against 0.522.
      expect(TERRACE[i].accepted).toBe(true);
      expect(TERRACE[i].cohesion).toBeLessThan(tight.cohesion);
      expect(TERRACE[i].containment).toBeLessThan(tight.containment);
      // A duplex: the ORDINARY case, and a near-tie (0.500 against 0.522). Kept
      // because the terrace could be dismissed as a site plan and this cannot —
      // two dwellings on one sheet is the most common multi-unit drawing there
      // is. If the pipeline ever moves this pair the other way round, the
      // inversion has not gone away; re-measure the terrace before concluding.
      expect(DUPLEX[i].accepted).toBe(true);
      expect(DUPLEX[i].cohesion).toBeLessThan(tight.cohesion);
    });
  });

  /**
   * The furniture page is accepted with a PERFECT reading on all three shipped
   * signals. Stated as an explicit fact rather than left implicit, because it is
   * what makes the case hopeless at this seam: there is no headroom anywhere.
   *
   * IF THIS FAILS: something upstream changed what the page reads as. Re-measure
   * Section 13e from scratch; the numbers below are the S31 baseline.
   */
  it('reads the furniture page as a flawless floorplan on support, structure and explained', () => {
    const r = at(FURNITURE, 'Careful');
    expect(r.accepted).toBe(true);
    expect(r.n).toBeGreaterThanOrEqual(15);
    expect(r.support).toBeGreaterThan(0.95);
    expect(r.structure).toBeGreaterThan(0.75);
    expect(r.explained).toBeGreaterThan(0.9);
    expect(r.confidence).toBeGreaterThan(0.95);
  });

  /**
   * THE THEOREM, and the reason no amount of reformulating helps.
   *
   * Every candidate in this family has the shape
   *
   *     (some property of the largest component) / (the same property of ALL segments)
   *
   * so on a reading with ONE component the numerator IS the denominator and the
   * statistic is identically 1.000 — whatever the image depicts. Pushing the
   * furniture boxes together until their edges touch is enough to get there,
   * and it costs the attacker nothing.
   *
   * This is the SAME blind spot as `structure`, one level up: `structure` fails
   * because a closed box satisfies a local endpoint test perfectly, and the
   * cohesion family fails because a closed box IS a single component, so "the
   * largest structure spans the drawing" is trivially true — the drawing is the
   * box. A ratio-to-the-whole cannot ask whether the whole is a floorplan.
   *
   * IF THIS FAILS: either the tracer stopped merging touching outlines, or a
   * proposed signal is no longer a ratio-to-the-whole — the second would be
   * real progress and is exactly what Section 13e's redirect asks for.
   */
  it('scores a PERFECT 1.000 on every cohesion-family signal when the null has one component', () => {
    TOUCHING.forEach((r, i) => {
      expect(r.accepted, `touching furniture must still be accepted at ${LEVEL[i]}`).toBe(true);
      expect(r.cohesion).toBeCloseTo(1, 5);
      expect(r.containment).toBeCloseTo(1, 5);
      expect(r.span).toBeCloseTo(1, 5);
    });
    // ...and it beats every legitimate multi-part sheet on all three, which is
    // the overlap stated at its most extreme: a perfect score for the null.
    expect(TOUCHING[1].cohesion).toBeGreaterThan(TERRACE[1].cohesion);
    expect(TOUCHING[1].span).toBeGreaterThan(DUPLEX[1].span);
  });

  /**
   * The overlap, signal by signal. For each candidate there is a LEGITIMATE
   * drawing scoring at or below some NULL drawing — so no floor on it separates
   * the populations at any value.
   *
   * ⚠️ NOTE WHAT THIS TEST IS NOT. It compares signal VALUES, which a new gate
   * does not change, so it cannot catch someone shipping a bad gate — the two
   * tests above and `detect.test.ts`'s "does NOT refuse any legitimate plan"
   * are what do that. Measured, by building the naive fix in a throwaway tree
   * and sweeping it: a cohesion floor breaks 3 of the 6 tests in this file at
   * every value tried, and in `detect.test.ts` breaks 4 tests at 0.35, 8 at
   * 0.45 and 11 at 0.55 — including `apartment-rotated` (a phone shot 22
   * degrees off-square) and `oblique-survey` outright. Even 0.35, far below the
   * 0.522 a floor would need to reach the tight cluster, already refuses a plan
   * photographed at phone resolution. There is no safe value, and that is a
   * measurement rather than an opinion.
   */
  it('finds no separating value for cohesion, containment or span', () => {
    // Only drawings whose legitimacy is not in question: dwellings with shells,
    // partitions and door gaps. Deliberately NOT the copy ladder — four bare
    // rectangles is the very thing under dispute, and using it here would make
    // the argument circular.
    const legit = [
      ...DUPLEX.map((r, i) => ({ what: `detached-duplex/${LEVEL[i]}`, r })),
      ...TERRACE.map((r, i) => ({ what: `terrace-of-three/${LEVEL[i]}`, r })),
    ];
    const nulls = [
      ...TIGHT.map((r, i) => ({ what: `furniture-tight/${LEVEL[i]}`, r })),
      ...FURNITURE.map((r, i) => ({ what: `furniture-spread/${LEVEL[i]}`, r })),
    ];
    for (const key of ['cohesion', 'containment', 'span'] as const) {
      const legitMin = Math.min(...legit.map((e) => e.r[key]));
      const nullMax = Math.max(...nulls.map((e) => e.r[key]));
      expect(
        legitMin,
        `${key}: the lowest LEGITIMATE reading (${legitMin.toFixed(3)}) must sit at or below the ` +
          `highest NULL reading (${nullMax.toFixed(3)}), or a floor would exist`,
      ).toBeLessThanOrEqual(nullMax);
    }
  });
});
