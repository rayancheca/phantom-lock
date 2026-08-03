/**
 * The DESIGN-QUALITY SCORE for "Generate a design".
 *
 * The owner's report was an adjective — *"broken as fuck… I want actual good
 * generations with logic and thought not random designs"* — and an adjective
 * cannot tell you whether a change helped. So, exactly as S22 did for wall
 * detection, the instrument comes first: a PURE function of a generated scene
 * that returns a vector of sub-scores, runnable identically over the same
 * enumerated seeds before and after a change.
 *
 * This file is TEST-ONLY. It lives under `__tests__/` and nothing in `src/`
 * imports it, so it never reaches the bundle.
 *
 * ## Where the target numbers come from
 *
 * Not from taste. The only ground truth in this repo is `apartmentScene()` —
 * the hand-authored "Maple Court" demo, a model of the home the owner actually
 * lives in. Measured (`docs/sessions/S33/bench/calibrate.mts`):
 *
 *     walkable floor      51.4 m²
 *     furniture pieces    9
 *     furniture footprint 14.8 m²
 *     DENSITY             28.9 %          <- the anchor for `density`
 *     pieces per 10 m²    1.75
 *
 * Every band below is stated relative to that, and `design-score.test.ts`
 * asserts the demo scores well — so if a future session decides the demo is not
 * a good design, the instrument's own calibration is what they have to argue
 * with, in one place.
 *
 * ## Why a vector and not just a total
 *
 * The sub-scores are NOT independent, and pretending otherwise would let one
 * change look like two wins. Stated plainly:
 *
 *   - `placement` and `density` MOVE TOGETHER — a skipped piece lowers both.
 *   - `programme` also depends on `placement`: a bedroom loses its bed if the
 *     bed was the piece that got skipped.
 *   - `orientation`, `spacing`, `reach`, `proportion` and `lock` are
 *     independent of those three and of each other.
 *
 * `total` is a weighted mean, and the weights are deliberately NOT equal (see
 * `WEIGHTS`). Read the vector; the total exists so a sweep can be sorted.
 *
 * ## Why density is a BAND, not "more is better"
 *
 * A room crammed to 60 % floor coverage is as wrong as one at 8 %, and a scorer
 * that rewards a maximum would push the generator straight into it. `band()`
 * peaks at the anchor and falls off on BOTH sides, so the instrument cannot be
 * gamed by simply ordering more furniture.
 */

import type { CircleObj, RectObj, Scene, SceneObject, Vec2 } from '../../types';
import { rectCorners } from '../../geometry';
import { regionOf } from '../../rooms';
import * as v from '../../vec';

export interface DesignScore {
  /** Weighted mean of the sub-scores, in [0,1]. */
  total: number;
  /** Fraction of REQUESTED furniture that was actually placed. */
  placement: number;
  /** Floor coverage, scored as a band around the Maple Court anchor. */
  density: number;
  /** Fraction of named rooms holding the furniture their name implies. */
  programme: number;
  /** Fraction of pieces with an anchor that actually face that anchor. */
  orientation: number;
  /** Fraction of pieces that do not overlap another piece. */
  spacing: number;
  /** Fraction of named rooms the walkable region reaches. */
  reach: number;
  /** Fraction of rooms inside a sane aspect-ratio band. */
  proportion: number;
  /** 1 when the design ships a locked pair, else 0. */
  lock: number;
  /** Raw numbers behind the scores, for reporting and for debugging a change. */
  detail: ScoreDetail;
}

export interface ScoreDetail {
  requested: number;
  placed: number;
  walkableM2: number;
  footprintM2: number;
  coverage: number;
  pieces: number;
  roomsScored: number;
  /** Rooms whose name implies a piece they do not contain. */
  programmeMisses: string[];
  /** Pieces that have an anchor to face and do not face it. */
  orientationMisses: string[];
  /** Pieces found overlapping another piece. */
  overlaps: string[];
  /** Rooms the walkable region does not reach. */
  unreachedRooms: string[];
  /** Aspect ratio of every named room. */
  aspects: number[];
}

/**
 * Floor coverage of the hand-authored demo. The band peaks here.
 *
 * `DENSITY_TOL` is the half-width at which the score reaches zero. 0.18 puts
 * the zero points at 11 % and 47 %: a room at 11 % reads empty (that is where
 * `great-room` and `loft` sat, at 7.3 % and 8.1 %) and one at 47 % is a
 * storage unit. Everything between scores something.
 */
export const DENSITY_ANCHOR = 0.289;
export const DENSITY_TOL = 0.18;

/**
 * How far off its anchor a piece may point and still count as facing it.
 *
 * cos(50 deg) = 0.643. Chosen because it is well OUTSIDE the arranger's own
 * `armchair` cone (0.2 = 78 deg) and its `sofa`/`tv` cone (0.35 = 70 deg), so
 * the instrument is not merely re-asserting the rule under test — it is a
 * stricter, independent question. A piece that only just clears the arranger's
 * own gate still fails this one.
 */
export const FACING_MIN = 0.643;

/** A room outside this aspect band reads as a corridor, not a room. */
export const ASPECT_MAX = 2.4;

/**
 * Weights. Deliberately unequal, and each one is an argument:
 *
 *   placement 3   the owner's actual screenshot — a piece with nowhere to go
 *   density   3   what "looks empty / random" measures
 *   programme 2   a bedroom without a bed is the most obvious kind of wrong
 *   orientation 2 the armchair bug; a piece pointing nowhere reads as random
 *   spacing   2   furniture standing inside other furniture is a hard defect
 *   reach     2   a room you cannot walk to is a hard defect
 *   proportion 1  a 2.6:1 room is odd, not broken
 *   lock      1   already high, and pair.ts ships a lock or nothing by design
 */
const WEIGHTS = {
  placement: 3,
  density: 3,
  programme: 2,
  orientation: 2,
  spacing: 2,
  reach: 2,
  proportion: 1,
  lock: 1,
} as const;

/**
 * A one-sided-tolerant band: 1 at the anchor, 0 at +/- `tol`, linear between.
 *
 * Linear rather than Gaussian on purpose — a reader can verify any reported
 * number with mental arithmetic, which is the property that made the S22 score
 * arguable rather than merely believable.
 */
export function band(value: number, anchor: number, tol: number): number {
  return Math.max(0, 1 - Math.abs(value - anchor) / tol);
}

function isFurniture(o: SceneObject): o is RectObj | CircleObj {
  if (o.kind === 'circle') return true;
  return o.kind === 'rect' && (o.role === 'furniture' || o.role === 'tv');
}

function footprintOf(o: RectObj | CircleObj): number {
  return o.kind === 'circle' ? Math.PI * o.r * o.r : o.w * o.h;
}

/** The direction a rect's front points: its local +y, matching `inwardOf`. */
export function frontOf(o: RectObj): Vec2 {
  return { x: -Math.sin(o.rotation), y: Math.cos(o.rotation) };
}

/**
 * What each room NAME promises. Keyed the same way `ZONE_AFFINITY` is, because
 * a room name that matches no rule here is a room the arranger also cannot
 * reason about — so the two lists failing together is the correct behaviour.
 */
const PROGRAMME: Array<{ room: RegExp; wants: RegExp; what: string }> = [
  { room: /bed|sleep|master|guest/i, wants: /^bed$/i, what: 'a bed' },
  { room: /kitchen/i, wants: /counter/i, what: 'a counter' },
  { room: /living|lounge|family/i, wants: /sofa|couch/i, what: 'a sofa' },
  { room: /^tv room$/i, wants: /^tv/i, what: 'a TV' },
  { room: /office|study|work/i, wants: /desk/i, what: 'a desk' },
];

/**
 * Which pieces have something they OUGHT to point at, and what.
 *
 * Only pieces with an unambiguous anchor are listed. A bookshelf or a wardrobe
 * has no "front" a user would notice, so scoring its heading would be noise
 * dressed as a measurement.
 */
const ANCHORS: Array<{ piece: RegExp; anchor: RegExp }> = [
  { piece: /^armchair$/i, anchor: /^tv/i },
  // `couch` as well as `sofa`, because `apartmentScene` — the calibration
  // ground truth — labels its seating "Couch"/"Couch 2". Matching only the
  // generator's own vocabulary made the instrument BLIND to the one design it
  // is calibrated against: the pile-everything-on-one-spot negative control
  // scored identically to the demo until this was widened.
  { piece: /^(sofa|couch)/i, anchor: /^tv/i },
  { piece: /^tv/i, anchor: /^(sofa|couch)/i },
];

/**
 * How much of the SMALLER footprint two pieces may share before it counts.
 *
 * Calibrated on the ground truth, not chosen. `apartmentScene()` has exactly two
 * overlapping pairs and both are hand-drawing slop: a round table nudged into a
 * couch (**0.0199 m² = 1.6 %** of the smaller piece) and an L-shaped kitchen
 * whose two counters cross by **0.0021 m² = 0.2 %**. A real collision — the
 * pile-it-all-on-one-spot control — is 100 %. 10 % sits six times above the
 * worst thing a careful human did by hand and an order of magnitude below any
 * defect, so nothing in that gap is a judgement call.
 *
 * Note this is an AREA fraction, not a penetration depth. Depth was tried first
 * and is the wrong quantity: two long counters crossing by 2 mm have a large
 * contact length and a negligible area, and it is the area a person sees.
 */
export const OVERLAP_FRACTION = 0.1;

/** Signed area of a polygon; positive for one winding, negative for the other. */
function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Convex-polygon intersection area (Sutherland–Hodgman).
 *
 * Written out here rather than reused from `arrange.ts` DELIBERATELY: this is a
 * measuring instrument, and measuring "does the arranger overlap things" with
 * the arranger's own overlap test would make the answer true by construction —
 * the one case where an independent second implementation is right rather than
 * the S32 trap.
 *
 * The clip polygon is RE-ORIENTED to a known winding first. That line is not
 * defensive tidiness: the first version of this probe omitted it, kept the
 * outside half-plane on every edge, and reported that the demo had zero
 * overlaps — a harness that answers "nothing found" because it is broken
 * (CLAUDE.md TRAP 22). `design-score.test.ts` pins it with a pair whose answer
 * is known by arithmetic.
 */
export function intersectionArea(subject: Vec2[], clipPoly: Vec2[]): number {
  const cw = signedArea(clipPoly) < 0 ? [...clipPoly].reverse() : clipPoly;
  let out = subject;
  for (let i = 0; i < cw.length; i++) {
    const a = cw[i];
    const b = cw[(i + 1) % cw.length];
    const input = out;
    out = [];
    const side = (p: Vec2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    for (let j = 0; j < input.length; j++) {
      const c = input[j];
      const d = input[(j + 1) % input.length];
      const sc = side(c);
      const sd = side(d);
      if (sc >= 0) out.push(c);
      if ((sc < 0 && sd > 0) || (sc > 0 && sd < 0)) {
        const t = sc / (sc - sd);
        out.push({ x: c.x + t * (d.x - c.x), y: c.y + t * (d.y - c.y) });
      }
    }
    if (out.length === 0) return 0;
  }
  return Math.abs(signedArea(out));
}

function overlaps(a: RectObj, b: RectObj): boolean {
  const ca = rectCorners(a);
  const cb = rectCorners(b);
  const shared = intersectionArea(ca, cb);
  if (shared <= 0) return false;
  const smaller = Math.min(Math.abs(signedArea(ca)), Math.abs(signedArea(cb)));
  return shared / Math.max(1e-9, smaller) > OVERLAP_FRACTION;
}

/** A circle is measured as its bounding square — conservative, and exact for a rect. */
function asFootprint(o: RectObj | CircleObj): RectObj {
  if (o.kind === 'rect') return o;
  return {
    id: o.id, kind: 'rect', center: o.center, w: o.r * 2, h: o.r * 2,
    rotation: 0, absorption: o.absorption, label: o.label, role: 'furniture', height: o.height,
  };
}

function zoneRects(scene: Scene): Array<{ name: string; center: Vec2; w: number; h: number }> {
  return (scene.rooms ?? []).flatMap((r) =>
    r.w && r.h ? [{ name: r.name, center: r.at, w: r.w, h: r.h }] : [],
  );
}

function inZone(p: Vec2, z: { center: Vec2; w: number; h: number }): boolean {
  return (
    Math.abs(p.x - z.center.x) <= z.w / 2 + 1e-9 && Math.abs(p.y - z.center.y) <= z.h / 2 + 1e-9
  );
}

/**
 * Score one generated design.
 *
 * `requested` is how many pieces the inventory asked for — `placed + skipped`
 * from `GenerateResult`. It is a PARAMETER rather than something re-derived
 * here, because re-deriving it would mean reimplementing `inventoryFor` and the
 * two copies would drift (the S15 "one source of truth" lesson).
 */
export function scoreDesign(scene: Scene, requested: number, locked: boolean): DesignScore {
  const furniture = scene.objects.filter(isFurniture);
  const placed = furniture.length;
  const footprint = furniture.reduce((s, o) => s + footprintOf(o), 0);

  // The walkable region is what a person can actually stand on, doors passable
  // — the same question `arrange.ts` asks, so a piece the arranger thought was
  // placeable is measured against the same floor.
  const walk = regionOf(scene, scene.listener.pos, { doorsBlock: false });
  const walkableM2 = Math.max(1e-6, walk.area);
  const coverage = footprint / walkableM2;

  const zones = zoneRects(scene);
  const programmeMisses: string[] = [];
  const unreachedRooms: string[] = [];
  const aspects: number[] = [];

  for (const z of zones) {
    aspects.push(Math.max(z.w, z.h) / Math.min(z.w, z.h));
    if (!walk.contains(z.center)) unreachedRooms.push(z.name);
    for (const rule of PROGRAMME) {
      if (!rule.room.test(z.name)) continue;
      const has = furniture.some((o) => rule.wants.test(o.label) && inZone(o.center, z));
      if (!has) programmeMisses.push(`${z.name} wants ${rule.what}`);
      break; // first matching rule only — a room has one programme
    }
  }

  const zoneOf = (p: Vec2): string | null => zones.find((z) => inZone(p, z))?.name ?? null;

  const orientationMisses: string[] = [];
  let oriented = 0;
  let orientable = 0;
  for (const o of furniture) {
    if (o.kind !== 'rect') continue;
    for (const rule of ANCHORS) {
      if (!rule.piece.test(o.label)) continue;
      // Same ROOM only. Scoring an armchair against a TV two rooms away asks
      // whether it points through a wall at a screen it cannot see — the
      // instrument would then reward turning it, which is the opposite of what
      // a person wants. (The generator had exactly this bug; an instrument
      // sharing the blindness would have hidden it.)
      const target = furniture.find(
        (t) => rule.anchor.test(t.label) && (zones.length === 0 || zoneOf(t.center) === zoneOf(o.center)),
      );
      if (!target) break;
      orientable++;
      const toward = v.norm(v.sub(target.center, o.center));
      // A rect is symmetric under a half turn, so BOTH faces count — scoring
      // the signed dot would fail every piece the arranger placed on the far
      // wall for a reason that is invisible on screen.
      if (Math.abs(v.dot(toward, frontOf(o))) >= FACING_MIN) oriented++;
      else orientationMisses.push(`${o.label} does not face ${target.label}`);
      break;
    }
  }

  const boxes = furniture.map(asFootprint);
  const clashing = new Set<number>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) {
        clashing.add(i);
        clashing.add(j);
      }
    }
  }
  const overlapList = [...clashing].map((i) => boxes[i].label);

  const placement = requested <= 0 ? 1 : Math.min(1, placed / requested);
  const density = band(coverage, DENSITY_ANCHOR, DENSITY_TOL);
  const programme = zones.length === 0 ? 1 : 1 - programmeMisses.length / zones.length;
  const orientation = orientable === 0 ? 1 : oriented / orientable;
  const spacing = placed === 0 ? 1 : 1 - clashing.size / placed;
  const reach = zones.length === 0 ? 1 : 1 - unreachedRooms.length / zones.length;
  const proportion =
    aspects.length === 0 ? 1 : aspects.filter((a) => a <= ASPECT_MAX).length / aspects.length;
  const lock = locked ? 1 : 0;

  const parts = { placement, density, programme, orientation, spacing, reach, proportion, lock };
  let wsum = 0;
  let total = 0;
  for (const k of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    total += parts[k] * WEIGHTS[k];
    wsum += WEIGHTS[k];
  }

  return {
    total: total / wsum,
    ...parts,
    detail: {
      requested,
      placed,
      walkableM2,
      footprintM2: footprint,
      coverage,
      pieces: placed,
      roomsScored: zones.length,
      programmeMisses,
      orientationMisses,
      overlaps: overlapList,
      unreachedRooms,
      aspects,
    },
  };
}

/** Mean of a list of scores, field by field — for reporting a whole corpus. */
export function meanScore(scores: DesignScore[]): Omit<DesignScore, 'detail'> {
  const keys = ['total', 'placement', 'density', 'programme', 'orientation', 'spacing', 'reach', 'proportion', 'lock'] as const;
  const out = {} as Record<(typeof keys)[number], number>;
  for (const k of keys) out[k] = scores.reduce((s, d) => s + d[k], 0) / Math.max(1, scores.length);
  return out as Omit<DesignScore, 'detail'>;
}
