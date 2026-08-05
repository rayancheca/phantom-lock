import type { Scene, SceneObject, Vec2, WallObj } from '../../engine/types';
import { ROOM_HEIGHT } from '../../engine/scene';
import { snapToWalls } from '../../engine/joints';
import * as v from '../../engine/vec';
import { snapPoint } from './placement';

/**
 * The wall-chain vertex maths, as pure functions (S38).
 *
 * Extracted from `SimCanvas.tsx` under the 800-line cap, and for one property
 * worth more than the lines: the click path and the cursor-PREVIEW path used to
 * carry the composition
 *
 *     closing ? points[0] : snapToWalls(snap(angleSnap(last, snap(raw))), …)
 *
 * written out twice, verbatim, forty lines apart. They were identical (checked
 * character by character before the move) — which is exactly the arrangement in
 * which a later edit to one silently makes the preview lie about where the click
 * will land. `chainVertex` is now the ONE definition and both callers read it.
 *
 * What deliberately does NOT move: the `chainWallsRef` bookkeeping. One id-group
 * per appended corner is what makes Backspace pop exactly the walls that corner
 * added (a segment crossing an existing wall is split by `integrateWall` into
 * several chunks, so a corner can own more than one id), and that ref is written
 * from four places in the component. Moving the ref without moving all four
 * would put the invariant behind two owners.
 */

/** Clicking this close to the chain's first vertex closes the room. */
export const CLOSE_RADIUS = 0.25;
/** Wall segments snap to 45° multiples when within this many degrees. */
export const ANGLE_SNAP_DEG = 7;
/** Shorter than this and the click appends a corner but creates NO wall. */
export const MIN_SEGMENT_M = 0.15;

/** Where a chain vertex may stick: every wall EXCEPT the chain's own pieces. */
export interface ChainContext {
  /** Mutable, not `readonly`, only because `joints.ts` `snapToWalls` takes
   *  `WallObj[]`. Nothing here writes to it. */
  walls: WallObj[];
  /** Wall ids this chain created. Snapping to your own last segment would peg
   *  every subsequent vertex to it. Mutable for the same reason as `walls`. */
  exclude: Set<string>;
  snapOn: boolean;
}

/** Build a `ChainContext` from the live scene and the per-corner id groups. */
export function chainContext(
  objects: readonly SceneObject[],
  groups: readonly string[][],
  snapOn: boolean,
): ChainContext {
  return {
    walls: objects.filter((o): o is WallObj => o.kind === 'wall'),
    exclude: new Set(groups.flat()),
    snapOn,
  };
}

/** Snap a wall endpoint to 45° multiples around the previous vertex. */
export function angleSnap(from: Vec2, to: Vec2): Vec2 {
  const d = v.sub(to, from);
  const len = v.len(d);
  if (len < 1e-6) return to;
  const ang = Math.atan2(d.y, d.x);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(ang - snapped) < (ANGLE_SNAP_DEG * Math.PI) / 180) {
    return v.add(from, v.scale(v.fromAngle(snapped), len));
  }
  return to;
}

/**
 * Where the next chain vertex lands for a raw world pointer position — the ONE
 * definition, read by both the click and the cursor preview.
 *
 * `closing` is decided on the RAW point, deliberately before any snapping: the
 * close test is "did the user aim at the start?", and asking it after a 45°
 * angle snap has already moved the point would make whether a room can be closed
 * depend on the direction of its last wall.
 *
 * The first vertex takes no `angleSnap` — there is no previous vertex to take an
 * angle from — but it still snaps to the grid and to existing walls.
 */
export function chainVertex(
  points: readonly Vec2[],
  raw: Vec2,
  ctx: ChainContext,
): { at: Vec2; closing: boolean } {
  if (points.length === 0) {
    return { at: snapToWalls(snapPoint(raw, ctx.snapOn), ctx.walls, ctx.exclude), closing: false };
  }
  const last = points[points.length - 1];
  const closing = points.length >= 2 && v.dist(raw, points[0]) < CLOSE_RADIUS;
  if (closing) return { at: points[0], closing: true };
  const snapped = snapPoint(angleSnap(last, snapPoint(raw, ctx.snapOn)), ctx.snapOn);
  return { at: snapToWalls(snapped, ctx.walls, ctx.exclude), closing: false };
}

/** What a click in wall mode does to the chain. */
export interface ChainStep {
  /** The corner to append (or, when `closing`, the first vertex again). */
  at: Vec2;
  /** This click closed the loop — the chain ends. */
  closing: boolean;
  /**
   * The wall to hand to `integrateWall`, or null when the click landed within
   * `MIN_SEGMENT_M` of the previous corner. A null wall still appends a corner,
   * whose id group is then legitimately EMPTY — which is why Backspace tracks
   * groups rather than counting walls.
   */
  wall: WallObj | null;
}

/**
 * Resolve one wall-mode click. Pure: the id factory is injected, the same way
 * `drag-apply.ts` `commitDraw` takes one, so a test gets deterministic ids and
 * the module never reaches for `createId`.
 */
export function chainStep(
  points: readonly Vec2[],
  raw: Vec2,
  ctx: ChainContext,
  newId: (prefix: string) => string,
): ChainStep {
  const vtx = chainVertex(points, raw, ctx);
  if (points.length === 0) return { ...vtx, wall: null };
  const last = points[points.length - 1];
  if (v.dist(last, vtx.at) < MIN_SEGMENT_M) return { ...vtx, wall: null };
  return {
    ...vtx,
    wall: {
      id: newId('wall'),
      kind: 'wall',
      a: last,
      b: vtx.at,
      absorption: 0.12,
      label: 'Wall',
      height: ROOM_HEIGHT,
    },
  };
}

/**
 * Pop the last chain corner and report exactly which wall ids its incoming
 * segment created. `groups[i]` are the ids added for the (i+1)-th point — a
 * segment that crossed an existing wall owns MULTIPLE ids (`integrateWall`
 * splits the new wall into chunks), and a corner too close to add a wall owns
 * an empty group. Pure — never mutates its inputs (slice/copy only).
 *
 * Note: only the chain's OWN chunk ids are removed; an existing wall that the
 * segment crossed stays split into its own fresh-id chunks (they never enter a
 * group). That is acoustically inert and a pre-existing backlog limitation.
 */
export function popChainSegment(
  points: readonly Vec2[],
  groups: readonly string[][],
): { points: Vec2[]; groups: string[][]; removeIds: string[]; ended: boolean } {
  if (points.length <= 1) {
    return { points: [], groups: [], removeIds: [], ended: true };
  }
  return {
    points: points.slice(0, -1),
    groups: groups.slice(0, -1),
    removeIds: [...(groups[groups.length - 1] ?? [])],
    ended: false,
  };
}

/**
 * One Backspace during a live chain: pop the corner AND delete the walls its
 * incoming segment created.
 *
 * Returns the SAME scene reference when nothing was deleted (a corner too short
 * to have made a wall), so the caller's `!==` test decides whether to push an
 * undo entry — `setScene` on an unchanged-but-new object would add a history
 * step that undoes nothing.
 */
export function chainUndo(
  scene: Scene,
  chain: { points: readonly Vec2[]; cursor: Vec2 | null },
  groups: readonly string[][],
): { scene: Scene; chain: { points: Vec2[]; cursor: Vec2 | null } | null; groups: string[][] } {
  const res = popChainSegment(chain.points, groups);
  if (res.ended) return { scene, chain: null, groups: [] };
  const rm = new Set(res.removeIds);
  return {
    scene: rm.size
      ? { ...scene, objects: scene.objects.filter((o) => !rm.has(o.id)) }
      : scene,
    chain: { points: res.points, cursor: chain.cursor },
    groups: res.groups,
  };
}
