import type { RectObj, Scene, SceneObject, SpeakerModel, Vec2 } from '../../engine/types';
import { activeListener, createId, makeSpeaker } from '../../engine/scene';
import { closestPointOnSegment, pointInRect } from '../../engine/geometry';
import * as v from '../../engine/vec';
import { makeOpening } from './interaction';

/**
 * Placement primitives shared by the POINTER and KEYBOARD paths (S7).
 *
 * Before this module, appending a speaker lived only inside `SimCanvas`'s
 * `onPointerDown`, so there was no way to place one without a mouse. Extracting
 * it means both paths call ONE definition — the furniture z-snap can never be
 * dropped from one of them — and the logic becomes node-testable.
 *
 * Pure + DOM-free: no `view`, no React, no canvas. Reads only the scene.
 */

/** The 5 cm design grid. Single definition — SimCanvas imports this rather than
 *  declaring its own copy (it previously had one, used at two more sites). */
export const SNAP_STEP = 0.05;

/** How far from the seat a keyboard-placed pod lands, metres. */
const PLACE_RADIUS_M = 1.5;
/** Half of the 60-degree reference triangle: the first two pods land at ±30°. */
const HALF_STAGE_RAD = (30 * Math.PI) / 180;
/** Golden angle. Used from the third pod onward so no finite number of presses
 *  ever lands two pods on the same point (a plain 60° step collides at 7). */
const GOLDEN_RAD = Math.PI * (3 - Math.sqrt(5));

export function snapPoint(p: Vec2, snapOn: boolean): Vec2 {
  if (!snapOn) return p;
  return {
    x: Math.round(p.x / SNAP_STEP) * SNAP_STEP,
    y: Math.round(p.y / SNAP_STEP) * SNAP_STEP,
  };
}

/**
 * If `p` lands on furniture, a speaker standing there sits on TOP of it.
 * Moved verbatim out of `SimCanvas` (it was a closure over `sceneRef` but read
 * only `scene.objects`, so it was always pure).
 */
export function surfaceHeightAt(scene: Scene, p: Vec2): number | null {
  let best: number | null = null;
  for (const o of scene.objects) {
    if (o.kind === 'wall') continue;
    if (o.kind === 'rect' && (o.role === 'door' || o.role === 'window')) continue;
    const inside =
      o.kind === 'rect' ? pointInRect(p, o) : o.kind === 'circle' ? v.dist(p, o.center) <= o.r : false;
    // Standing surfaces only — nobody perches a speaker on a wardrobe.
    if (inside && o.height <= 1.6 && (best === null || o.height > best)) best = o.height;
  }
  return best;
}

/**
 * Where a keyboard-placed speaker lands.
 *
 * Anchored on the ACTIVE SEAT rather than the view centre: the seat is the
 * semantic origin of every metric in the app, it is always meaningful, and it is
 * pure (the view lives inside SimCanvas and could not be read from a node test).
 *
 * The first two pods land at ±30° in FRONT of the seat — a real 60° reference
 * triangle — so two presses of `p` plus the Speakers card's one-click "Pair as
 * stereo" yields a pair that can actually lock. That matters: the payoff of the
 * whole app is the lock, and a keyboard user who can only produce an
 * un-lockable layout has not really been given the feature. From the third pod
 * on it walks the golden angle, which never repeats.
 */
export function keyboardPlacementPoint(scene: Scene): Vec2 {
  const seat = activeListener(scene).pos;
  const n = scene.speakers.length;
  // -90° is straight "up"/in front on the canvas (+y points down).
  const forward = -Math.PI / 2;
  const angle =
    n === 0 ? forward - HALF_STAGE_RAD
    : n === 1 ? forward + HALF_STAGE_RAD
    : forward + HALF_STAGE_RAD + GOLDEN_RAD * (n - 1);
  return {
    x: seat.x + Math.cos(angle) * PLACE_RADIUS_M,
    y: seat.y + Math.sin(angle) * PLACE_RADIUS_M,
  };
}

/**
 * THE single speaker-placement primitive: snap, stand it on any furniture
 * underneath, append. Returns the new scene plus the new id so the caller can
 * select what it just created.
 */
export function placeSpeakerAt(
  scene: Scene,
  p: Vec2,
  model: SpeakerModel,
  snapOn: boolean,
): { scene: Scene; speakerId: string } {
  const speaker = makeSpeaker(snapPoint(p, snapOn), scene, model);
  const surf = surfaceHeightAt(scene, speaker.pos);
  if (surf !== null) speaker.z = Math.round((surf + 0.12) * 100) / 100;
  return {
    scene: { ...scene, speakers: [...scene.speakers, speaker] },
    speakerId: speaker.id,
  };
}

/**
 * Insert a door or window at the MIDPOINT of a wall — the keyboard equivalent of
 * the hover chips, which are unreachable without a pointer (they are set inside
 * the rAF-throttled pointermove path). Returns null when the target is not a wall.
 */
export function openingOnWall(
  scene: Scene,
  wallId: string,
  role: 'door' | 'window',
): { scene: Scene; objectId: string } | null {
  const target = scene.objects.find((o) => o.id === wallId);
  if (!target || target.kind !== 'wall') return null;
  const at: Vec2 = { x: (target.a.x + target.b.x) / 2, y: (target.a.y + target.b.y) / 2 };
  const opening: SceneObject = makeOpening(target, at, role, createId(role));
  return {
    scene: { ...scene, objects: [...scene.objects, opening] },
    objectId: opening.id,
  };
}

/**
 * Drop a door/window on the wall NEAREST `point`, at the closest point on it —
 * the Furnish-palette path. A preset dropped at the scene centre would otherwise
 * float unrotated in mid-room until dragged onto a wall (the advertised route's
 * first result looked broken). Returns null when the scene has no walls, so the
 * caller can fall back to the plain centre drop.
 */
export function openingNearPoint(
  scene: Scene,
  point: Vec2,
  role: 'door' | 'window',
): { scene: Scene; objectId: string } | null {
  let best: Extract<SceneObject, { kind: 'wall' }> | null = null;
  let bestAt: Vec2 = point;
  let bestD = Infinity;
  for (const o of scene.objects) {
    if (o.kind !== 'wall') continue;
    const cp = closestPointOnSegment(point, o.a, o.b);
    const d = v.dist(point, cp.point);
    if (d < bestD) {
      bestD = d;
      best = o;
      bestAt = cp.point;
    }
  }
  if (!best) return null;
  const opening: SceneObject = makeOpening(best, bestAt, role, createId(role));
  return {
    scene: { ...scene, objects: [...scene.objects, opening] },
    objectId: opening.id,
  };
}

// ---------------------------------------------------------------------------
// Seating furniture flush against a wall (S23)
//
// The owner's real floorplan is almost entirely non-axis-aligned, so "push the
// sofa against the wall" is the PRIMARY furnishing gesture, not an edge case —
// and the 5 cm world grid is useless perpendicular to a 13 degree wall (the
// lattice projects onto that normal quasi-densely, so there is no reachable
// zero). Their words, from `docs/ideas.md` §4: "I'm angling the bed but it
// never sits flush against the wall."
//
// The app already had HALF of this: `arrange.ts` `wallSlots` places auto-arranged
// furniture at `rotation = atan2(dir)` offset along the inward normal. So this is
// not a new convention — it is the same one, finally applied to the drag path.
//
// Three properties are load-bearing and each is pinned by a test:
//   1. The snap reads a caller-supplied `rotation`, never the object's live one.
//      SimCanvas passes the PRE-DRAG rotation every frame, so the transform is a
//      pure function of the gesture rather than a feedback loop over its own
//      output — which is what stops a mid-drag ratchet and makes undo exact.
//   2. The gate is on the SIGNED gap. An `|gap|` gate gives the band a NEAR edge,
//      so shoving a piece harder into a wall releases it (measured: a bed jumped
//      0.163 m BACKWARD and then un-rotated while half-buried).
//   3. A candidate needs real footprint OVERLAP with the wall. Without it a 0.7 m
//      closet wall gets a 2.70 m capture window — 3.9x its own length — and acts
//      as a magnet over the whole surrounding floor.
// ---------------------------------------------------------------------------

/** Ambient drag magnet: rotation-only correction fires at this face gap. */
export const WALL_ALIGN_GAP_M = 0.35;
/** Ambient drag magnet: the piece is pulled flush at this face gap. */
export const WALL_SEAT_GAP_M = 0.15;

/**
 * Shorter than this and `v.norm` returns {0,0} and `atan2(0,0)` is 0 — the world
 * horizontal, the one answer never right on a skewed plan. Skip, do not guess.
 * Deliberately NOT `arrange.ts`'s `len < 1.0`, which would exclude the sub-metre
 * partition stubs S22's generator emits.
 */
const MIN_WALL_LEN_M = SNAP_STEP;

/**
 * Two candidate walls on a corner bisector differ by ~1 ulp, and the sign of that
 * difference flips non-monotonically as the pointer moves — so a strict `<` alone
 * makes an 89-degree decision on float noise. Anything inside this is a TIE and
 * falls to document order.
 */
const SEAT_TIE_EPS = 1e-6;

export interface WallSeatOptions {
  /** Face gap at which rotation is corrected. */
  alignGap: number;
  /** Face gap at which the piece is also pulled flush. */
  seatGap: number;
  /** Quantum for the ALONG-wall coordinate, or null for none. */
  grid: number | null;
}

/** Drag-time bands. */
export const DRAG_SEAT: WallSeatOptions = {
  alignGap: WALL_ALIGN_GAP_M,
  seatGap: WALL_SEAT_GAP_M,
  grid: SNAP_STEP,
};

export interface WallSeat {
  wallId: string;
  /** The seated centre when `seated`; the untouched input centre otherwise. */
  center: Vec2;
  /** Snapped rotation, normalised into (-pi, pi]. */
  rotation: number;
  /** Signed face-to-wall clearance at the SNAPPED footprint. 0 means flush. */
  gap: number;
  seated: boolean;
}

const fin = (n: number): boolean => Number.isFinite(n);
const finVec = (p: Vec2): boolean => fin(p.x) && fin(p.y);

/**
 * Real modulo into (-pi, pi]. NOT `rotateSelectedRect`'s single-step subtract,
 * which only normalises inputs already within one turn of the range.
 *
 * Returns 0 rather than NaN for a non-finite input: `sanitizeObject` requires a
 * FINITE rotation (`scene.ts:490`), and a rect that fails it also fails the circle
 * branch, so the object is dropped entirely. A NaN here is silent data loss.
 */
export function normalizeAngle(rad: number): number {
  if (!fin(rad)) return 0;
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/** Half-extent of a `w` x `h` rect at rotation `th`, measured along unit `d`. */
function support(w: number, h: number, th: number, d: Vec2): number {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return Math.abs((w / 2) * (c * d.x + s * d.y)) + Math.abs((h / 2) * (-s * d.x + c * d.y));
}

/**
 * The single wall-seating primitive.
 *
 * Takes `center` and `rotation` SEPARATELY from the dimensions rather than a whole
 * `RectObj`: an object-shaped signature invites passing the object's CURRENT
 * rotation, which is exactly the feedback loop property 1 above exists to prevent.
 *
 * Returns null for: no candidate wall, an opening (`door` / `window` — refused
 * here in the pure function, so a wrong call site still cannot angle-snap one),
 * or any non-finite input or output.
 */
export function wallSeatFor(
  objects: readonly SceneObject[],
  piece: { w: number; h: number; role: RectObj['role'] },
  center: Vec2,
  rotation: number,
  opts: WallSeatOptions,
): WallSeat | null {
  if (piece.role === 'door' || piece.role === 'window') return null;
  if (!finVec(center) || !fin(piece.w) || !fin(piece.h)) return null;
  const rot0 = normalizeAngle(rotation);

  let best: WallSeat | null = null;
  let bestAbs = Infinity;

  for (const w of objects) {
    if (w.kind !== 'wall') continue;
    if (!finVec(w.a) || !finVec(w.b)) continue;
    const edge = v.sub(w.b, w.a);
    const len = Math.hypot(edge.x, edge.y);
    if (!fin(len) || len < MIN_WALL_LEN_M) continue;

    const u = { x: edge.x / len, y: edge.y / len };
    const rel = v.sub(center, w.a);
    const along = rel.x * u.x + rel.y * u.y;
    // The normal on the side the piece's centre is actually on. `v.perp(u) . u` is
    // exactly 0 in IEEE754 (the same two products cancel), so this is a clean split.
    let n = { x: -u.y, y: u.x };
    let off = rel.x * n.x + rel.y * n.y;
    if (off < 0) {
      n = { x: -n.x, y: -n.y };
      off = -off;
    }
    if (!fin(along) || !fin(off)) continue;

    // Nearest HALF turn, so `w` runs along the wall. Not nearest quarter turn: on a
    // building rotated as a whole every wall shares one quarter-turn class, so a
    // piece born at rotation 0 (App.tsx hardcodes that for every palette drop) would
    // land across half the walls and dragging would never fix it.
    const thw = Math.atan2(u.y, u.x);
    const k = Math.round((rot0 - thw) / Math.PI);
    if (!fin(k)) continue;
    let th = normalizeAngle(thw + k * Math.PI);

    // A TV's screen is its local +y face (`bestspot.ts:29`). Point it away from the
    // wall it backs onto. Engine-INVISIBLE today — `bestspot.ts:31` takes Math.abs,
    // so only perpendicularity is scored — but free, correct, and load-bearing for
    // the scheduled read-only 3D view. Position is provably unchanged: every support
    // term is inside a Math.abs, so it is identical under th -> th + pi.
    if (piece.role === 'tv' && -Math.sin(th) * n.x + Math.cos(th) * n.y < 0) {
      th = normalizeAngle(th + Math.PI);
    }

    const halfPerp = support(piece.w, piece.h, th, n);
    const halfAlong = support(piece.w, piece.h, th, u);
    if (!fin(halfPerp) || !fin(halfAlong)) continue;

    // SIGNED, so there is no near edge: pushing past flush keeps the piece seated
    // and pulls it back out, rather than releasing it mid-gesture.
    const gap = off - halfPerp;
    if (!(gap <= opts.alignGap)) continue;

    // Real footprint overlap, so a wall shorter than the piece cannot capture the
    // floor around it. `arrange.ts` restricts its own slots to t in [0.12, 0.88] for
    // the same reason.
    const margin = Math.min(halfAlong, len / 2);
    const overlap = Math.min(along + halfAlong, len) - Math.max(along - halfAlong, 0);
    if (!(overlap >= margin)) continue;

    const absGap = Math.abs(gap);
    // Strict `<` past a tolerance, so an exact tie really does fall to document
    // order instead of being decided by the last bit of a subtraction.
    if (best !== null && absGap >= bestAbs - SEAT_TIE_EPS) continue;

    let out = along;
    if (opts.grid !== null && opts.grid > 0) out = Math.round(out / opts.grid) * opts.grid;
    out = Math.max(margin, Math.min(len - margin, out));

    const seatedCenter = {
      x: w.a.x + u.x * out + n.x * halfPerp,
      y: w.a.y + u.y * out + n.y * halfPerp,
    };
    if (!finVec(seatedCenter) || !fin(th)) continue;

    const seated = gap <= opts.seatGap;
    best = {
      wallId: w.id,
      center: seated ? seatedCenter : center,
      rotation: th,
      gap,
      seated,
    };
    bestAbs = absGap;
  }

  return best;
}

/**
 * The door/window straddle magnet, lifted VERBATIM out of `SimCanvas`'s `move-rc`
 * branch, where it shipped with zero coverage. An opening's relationship to a wall
 * is genuinely different from furniture's — it STRADDLES (centre on the line, the
 * wall's full directed angle, `w` the clear opening that cuts the gap) rather than
 * seating beside — so it stays a separate function with its own threshold.
 *
 * Behaviour is pinned bit-for-bit against the pre-extraction branch by a
 * characterization oracle in `__tests__/wall-seat.test.ts`.
 */
export function openingMagnetFor(
  objects: readonly SceneObject[],
  center: Vec2,
): { center: Vec2; rotation: number } | null {
  let bestWall: { point: Vec2; angle: number; dist: number } | null = null;
  for (const w of objects) {
    if (w.kind !== 'wall') continue;
    const dist = v.dist(center, closestPointOnSegment(center, w.a, w.b).point);
    if (dist < 0.35 && (!bestWall || dist < bestWall.dist)) {
      const { point } = closestPointOnSegment(center, w.a, w.b);
      bestWall = { point, angle: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), dist };
    }
  }
  return bestWall ? { center: bestWall.point, rotation: bestWall.angle } : null;
}

/**
 * The whole `move-rc` object mapping, lifted out of `SimCanvas` so the drag is
 * node-testable. Owns the grid-versus-wall precedence end to end.
 *
 * `rot0` is the PRE-DRAG rotation — every frame snaps from it, never from the
 * object's live value. `opts.seat === null` suppresses the magnet (Shift held).
 *
 * Precedence, when the seat fires: the wall's frame owns BOTH axes. On a -11.73
 * degree wall no point of the world lattice is flush, so "grid-snapped AND flush"
 * is unsatisfiable and one must yield; flush is what was asked for. The 5 cm
 * quantum moves onto the along-wall axis, so 5 cm still feels like 5 cm. This is
 * not a new precedent — the shipped door magnet already discards the grid.
 */
export function moveObjectTo(
  scene: Scene,
  id: string,
  rawCenter: Vec2,
  rot0: number,
  opts: { snapOn: boolean; seat: WallSeatOptions | null },
): { scene: Scene; guide: { wallId: string; seated: boolean } | null } {
  const target = scene.objects.find((o) => o.id === id);
  if (!target || target.kind === 'wall') return { scene, guide: null };

  const grid = snapPoint(rawCenter, opts.snapOn);

  if (target.kind === 'circle') {
    // No rotation field, and rotationally symmetric — structurally nothing to snap.
    return {
      scene: { ...scene, objects: scene.objects.map((o) => (o.id === id ? { ...o, center: grid } : o)) },
      guide: null,
    };
  }

  if (target.role === 'door' || target.role === 'window') {
    const magnet = openingMagnetFor(scene.objects, grid);
    return {
      scene: {
        ...scene,
        objects: scene.objects.map((o) =>
          o.id === id
            ? magnet
              ? { ...o, center: magnet.center, rotation: magnet.rotation }
              : { ...o, center: grid }
            : o,
        ),
      },
      guide: null,
    };
  }

  const seat =
    opts.seat === null
      ? null
      : wallSeatFor(
          scene.objects,
          target,
          grid,
          rot0,
          // The caller's snap setting decides the along-wall quantum. Baking the grid
          // into the band constant silently ignored `settings.snap`, which this path
          // has always honoured.
          { ...opts.seat, grid: opts.snapOn ? SNAP_STEP : null },
        );

  const center = seat?.seated ? seat.center : grid;
  const rotation = seat ? seat.rotation : normalizeAngle(rot0);

  return {
    scene: {
      ...scene,
      objects: scene.objects.map((o) => (o.id === id ? { ...o, center, rotation } : o)),
    },
    guide: seat ? { wallId: seat.wallId, seated: seat.seated } : null,
  };
}
