/**
 * Stage 2-4 of the solver: cells -> walls, doors, windows and zones.
 *
 * Two findings from measuring the real engine shaped every line here, and both
 * are invisible until you look:
 *
 * **Shared walls must be shared exactly once.** `addRoomShell` appends rooms
 * flush, so chaining it puts TWO coincident walls on every boundary. The
 * generator therefore builds its own wall set from a canonicalised edge map: an
 * edge seen twice is interior, seen once is exterior, and each unique edge
 * emits exactly one wall.
 *
 * **A door rect in a solid wall does not join two rooms for furnishing.**
 * `rooms.ts` `collectBlockers` pushes the WHOLE wall segment for every wall at
 * `height >= MIN_BOUNDING_HEIGHT`; it never consults `wallKeptSpans`, and doors
 * only ever ADD blockers. Measured on one two-room plan built four ways:
 *
 *     A solid partition, no door        zoning 19.9  walkable 19.9  in-right-room 0
 *     B solid partition + door rect     zoning 19.9  walkable 19.9  in-right-room 0
 *     C partition split, 0.9 m gap      zoning 41.3  walkable 41.3  in-right-room 3
 *     D split + door rect in the gap    zoning 19.9  walkable 41.3  in-right-room 4
 *
 * Only D gets both semantics right — rooms stay distinct ZONES for the
 * optimizer while furniture reaches the whole home. B is the naive
 * construction, and it confines every piece of furniture to the seat's room.
 */

import type { RectObj, RoomLabel, SceneObject, Vec2, WallObj } from '../types';
import { createId } from '../ids';
import { ROOM_HEIGHT } from '../scene';
import type { Archetype } from './archetypes';
import type { Cell } from './tile';
import { chance, lattice, type Rng } from './rng';

/** Clear opening of a generated door — matches the 'door' furniture preset. */
export const DOOR_WIDTH = 0.9;
/** An interior edge shorter than this cannot carry a door and two stubs. */
const MIN_DOORED_WALL = DOOR_WIDTH + 1.2;
/** An exterior edge shorter than this gets no window. */
const MIN_WINDOW_WALL = 2;
const WALL_ABSORPTION = 0.12;

interface Edge {
  a: Vec2;
  b: Vec2;
  /** How many cells claim this stretch: 2 = interior, 1 = exterior. */
  count: number;
}

/**
 * Every wall stretch, each emitted exactly once, with its cell count.
 *
 * Matching whole cell edges against each other is WRONG and the failure is
 * silent. A guillotine tiling is not conforming: cut a 5.3-wide room off the
 * left and then cut the right-hand block horizontally, and the boundary at
 * x = 5.3 is one 7 m edge on the left and TWO 3.5 m edges on the right. Keyed
 * whole, none of the three matches any other, all three are counted exterior,
 * and the boundary is drawn THREE TIMES with no door in any of them — measured
 * exactly that on `two-bed` seed 21, where the walkable region then equalled
 * the zoning region and every piece of furniture was trapped in one room.
 *
 * So edges are gathered per AXIS LINE and reduced to atomic intervals at every
 * breakpoint any of them contributes. An atomic interval covered twice is
 * interior; covered once is exterior. Every cell is an axis-aligned rectangle,
 * so this is exact rather than approximate.
 */
function collectEdges(cells: Cell[]): Edge[] {
  // key: "v|<x>" or "h|<y>". Coordinates come off a 0.5 m envelope lattice and
  // a 0.1 m cut lattice, so three decimals is exact and cannot mis-key.
  const lines = new Map<string, Array<[number, number]>>();
  const add = (key: string, lo: number, hi: number) => {
    const list = lines.get(key);
    if (list) list.push([lo, hi]);
    else lines.set(key, [[lo, hi]]);
  };
  for (const c of cells) {
    add(`v|${c.x.toFixed(3)}`, c.y, c.y + c.h);
    add(`v|${(c.x + c.w).toFixed(3)}`, c.y, c.y + c.h);
    add(`h|${c.y.toFixed(3)}`, c.x, c.x + c.w);
    add(`h|${(c.y + c.h).toFixed(3)}`, c.x, c.x + c.w);
  }

  const out: Edge[] = [];
  for (const [key, spans] of lines) {
    const vertical = key.startsWith('v|');
    const at = Number(key.slice(2));
    const cuts = [...new Set(spans.flat())].sort((p, q) => p - q);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const lo = cuts[i];
      const hi = cuts[i + 1];
      if (hi - lo < 1e-6) continue;
      const mid = (lo + hi) / 2;
      const count = spans.filter(([s0, s1]) => s0 <= mid && mid <= s1).length;
      if (count === 0) continue;
      // Merge with the previous stretch when it has the same count, so a wall
      // that happens to be broken by an unrelated neighbour's corner stays ONE
      // wall rather than arriving as fragments.
      const prev = out[out.length - 1];
      const a = vertical ? { x: at, y: lo } : { x: lo, y: at };
      const b = vertical ? { x: at, y: hi } : { x: hi, y: at };
      if (
        prev &&
        prev.count === count &&
        Math.abs((vertical ? prev.b.x : prev.b.y) - at) < 1e-9 &&
        Math.abs((vertical ? prev.b.y : prev.b.x) - lo) < 1e-9 &&
        vertical === Math.abs(prev.a.x - prev.b.x) < 1e-9
      ) {
        prev.b = b;
      } else {
        out.push({ a, b, count });
      }
    }
  }
  // Insertion order is a deterministic function of the cell order, which is
  // itself sorted — so the wall list is stable for a given seed.
  return out;
}

function wall(a: Vec2, b: Vec2, label: string): WallObj {
  return {
    id: createId('wall'),
    kind: 'wall',
    a: { ...a },
    b: { ...b },
    absorption: WALL_ABSORPTION,
    label,
    height: ROOM_HEIGHT,
  };
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function len(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Angle of the edge, which a door or window rect must adopt to sit flush. */
function edgeAngleDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function opening(
  centre: Vec2,
  width: number,
  angleDeg: number,
  role: 'door' | 'window',
): RectObj {
  const base: RectObj = {
    id: createId(role),
    kind: 'rect',
    center: { ...centre },
    w: width,
    h: role === 'door' ? 0.1 : 0.12,
    rotation: angleDeg,
    absorption: role === 'door' ? 0.25 : 0.04,
    label: role === 'door' ? 'Door' : 'Window',
    height: role === 'door' ? 2.05 : 2.2,
    role,
  };
  if (role === 'door') {
    // `sanitizeObject` CLAMPS these but never defaults them, so a door written
    // without them renders differently from one written with 90 degrees.
    base.doorOpen = true;
    base.swingDeg = 90;
    base.hingeEnd = 'start';
    base.swingSide = 'in';
  }
  return base;
}

export interface Shell {
  objects: SceneObject[];
  rooms: RoomLabel[];
  /** Interior door centres, so the caller can reason about circulation. */
  doors: Vec2[];
}

/**
 * Build every wall, door, window and zone for a tiling.
 *
 * `outline`, when given, replaces the exterior of a SINGLE-cell tiling with a
 * notched or bayed shape — that is how the one-room archetypes get variety
 * beyond "a rectangle at N sizes".
 */
export function buildShell(
  rnd: Rng,
  cells: Cell[],
  arch: Archetype,
  outline?: Vec2[],
): Shell {
  const objects: SceneObject[] = [];
  const doors: Vec2[] = [];

  const emitDoored = (a: Vec2, b: Vec2, label: string): void => {
    const length = len(a, b);
    if (length < MIN_DOORED_WALL) {
      objects.push(wall(a, b, label));
      return;
    }
    // Variant D: two stubs with a REAL gap, and the door rect inside the gap.
    const half = DOOR_WIDTH / 2 / length;
    const t = lattice(rnd, 0.3, 0.7, 0.05);
    const lo = Math.max(half, Math.min(1 - half, t));
    objects.push(wall(a, lerp(a, b, lo - half), label));
    objects.push(wall(lerp(a, b, lo + half), b, label));
    const centre = lerp(a, b, lo);
    objects.push(opening(centre, DOOR_WIDTH, edgeAngleDeg(a, b), 'door'));
    doors.push(centre);
  };

  if (outline && cells.length === 1) {
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      objects.push(wall(a, b, 'Wall'));
    }
  } else {
    for (const e of collectEdges(cells)) {
      if (e.count > 1) emitDoored(e.a, e.b, 'Partition');
      else objects.push(wall(e.a, e.b, 'Wall'));
    }
  }

  // One entry door, on the longest exterior edge — built the same way, so the
  // walkable region reaches the front door rather than stopping at it.
  const exterior = objects
    .filter((o): o is WallObj => o.kind === 'wall' && o.label === 'Wall')
    .sort((p, q) => len(q.a, q.b) - len(p.a, p.b));
  const front = exterior[0];
  if (front && len(front.a, front.b) >= MIN_DOORED_WALL) {
    const idx = objects.indexOf(front);
    objects.splice(idx, 1);
    emitDoored(front.a, front.b, 'Wall');
  }

  // Windows on the remaining exterior walls. Not decoration: five of
  // `scoreSlot`'s rules key off them and two are hard rejections — a desk gains
  // up to +1.6 near one, a bed loses 2.4 under one, and a wardrobe that would
  // block one is refused outright. A plan with no windows silently loses the
  // whole daylight layer.
  for (const w of objects.filter((o): o is WallObj => o.kind === 'wall' && o.label === 'Wall')) {
    const length = len(w.a, w.b);
    if (length < MIN_WINDOW_WALL) continue;
    if (!chance(rnd, arch.windowRate)) continue;
    const width = Math.min(1.6, length * 0.35);
    const margin = width / 2 / length + 0.05;
    const t = lattice(rnd, margin, 1 - margin, 0.05);
    objects.push(opening(lerp(w.a, w.b, t), width, edgeAngleDeg(w.a, w.b), 'window'));
  }

  // Zones. `arrange.ts` builds its zone list ONLY from rooms carrying both `w`
  // and `h` (a bare anchor point contributes nothing), and `sanitizeScene`
  // keeps them only when both exceed 0.2 — one condition, two consumers.
  const rooms: RoomLabel[] = cells.map((c) => ({
    id: createId('room'),
    name: c.name,
    at: { x: c.x + c.w / 2, y: c.y + c.h / 2 },
    w: c.w,
    h: c.h,
  }));

  return { objects, rooms, doors };
}
