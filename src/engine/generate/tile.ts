/**
 * Stage 1 of the solver: divide an envelope into room rectangles.
 *
 * GUILLOTINE subdivision — repeatedly split the largest cell in two. It is the
 * right tool for one structural reason: every cut partitions one rectangle into
 * exactly two, so "the rooms tile the envelope without overlaps or gaps" is
 * true BY CONSTRUCTION. There is no repair pass, and no test that could ever
 * fail on a real input. A packing algorithm would need both.
 *
 * Cut positions live on a 0.1 m lattice, which is what makes the space of
 * distinct floorplans finite and countable rather than a continuum of
 * millimetre variations nobody could tell apart.
 */

import { MIN_ROOM_SIDE, type RoomSpec, type ShapeVariant } from './archetypes';
import { lattice, pick, type Rng } from './rng';

export interface Cell {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cut fraction range — never closer than ~38 % to either edge. */
const CUT_LO = 0.38;
const CUT_HI = 0.62;
const CUT_STEP = 0.1;

function area(c: Cell): number {
  return c.w * c.h;
}

/**
 * Split `cell` across its longer side. Returns null when neither half would
 * clear `MIN_ROOM_SIDE` — the caller then tries the next-largest cell, and a
 * tiling that runs out of splittable cells legitimately returns FEWER rooms
 * than the archetype asked for. Three rooms is a correct answer; a 1.1 m
 * "bedroom" is not.
 */
function split(rnd: Rng, cell: Cell): [Cell, Cell] | null {
  const vertical = cell.w >= cell.h;
  const span = vertical ? cell.w : cell.h;
  if (span < MIN_ROOM_SIDE * 2) return null;
  const lo = Math.max(CUT_LO, MIN_ROOM_SIDE / span);
  const hi = Math.min(CUT_HI, 1 - MIN_ROOM_SIDE / span);
  if (hi <= lo) return null;
  const frac = lattice(rnd, lo, hi, CUT_STEP / 2);
  const at = Math.round(span * frac * 10) / 10;
  if (at < MIN_ROOM_SIDE || span - at < MIN_ROOM_SIDE) return null;
  return vertical
    ? [
        { ...cell, w: at },
        { ...cell, x: cell.x + at, w: cell.w - at },
      ]
    : [
        { ...cell, h: at },
        { ...cell, y: cell.y + at, h: cell.h - at },
      ];
}

/**
 * Tile an envelope into one cell per room, largest cell to heaviest room.
 *
 * Rooms are assigned AFTER all the cutting, by sorting cells and specs by size
 * and weight together — so the "Living room" reliably gets the biggest cell
 * regardless of which order the cuts happened to fall in.
 */
export function tileEnvelope(rnd: Rng, w: number, h: number, rooms: RoomSpec[]): Cell[] {
  let cells: Cell[] = [{ name: '', x: 0, y: 0, w, h }];
  while (cells.length < rooms.length) {
    // Try the largest cell first, then the next, so one stubborn sliver does
    // not end the whole subdivision.
    const order = [...cells].sort((a, b) => area(b) - area(a));
    let done = false;
    for (const target of order) {
      const halves = split(rnd, target);
      if (!halves) continue;
      cells = cells.filter((c) => c !== target).concat(halves);
      done = true;
      break;
    }
    if (!done) break;
  }
  const bySize = [...cells].sort((a, b) => area(b) - area(a));
  const byWeight = [...rooms].sort((a, b) => b.weight - a.weight);
  bySize.forEach((c, i) => {
    c.name = byWeight[Math.min(i, byWeight.length - 1)].name;
  });
  // Return in a stable geometric order so downstream indices are reproducible.
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Shape variation for archetypes that would otherwise be "a rectangle at N
 * sizes". With one room there are no cuts to vary, so `studio`, `cinema` and
 * `office` would each yield only as many designs as they have envelope sizes —
 * 42, 49 and 20. Clipping a corner or insetting a bay multiplies that by the
 * choice of corner and depth.
 *
 * Returned as an ordered outline rather than a cell list, because a notched
 * room is no longer a rectangle and the wall builder needs its actual corners.
 */
export function envelopeOutline(
  rnd: Rng,
  w: number,
  h: number,
  variant: ShapeVariant,
): Array<{ x: number; y: number }> {
  const rect = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  if (variant === 'rect') return rect;

  // Depth of the bite, on the same 0.1 m lattice as the cuts, and always
  // leaving MIN_ROOM_SIDE of room behind it.
  const maxCut = Math.min(w, h) - MIN_ROOM_SIDE;
  if (maxCut < 1) return rect;
  const cut = lattice(rnd, 1, Math.min(maxCut, Math.min(w, h) * 0.4), 0.5);
  const corner = pick(rnd, [0, 1, 2, 3] as const);

  if (variant === 'l-notch') {
    // Clip one corner square, giving a genuine L.
    const c = [
      [
        { x: cut, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
        { x: 0, y: cut },
      ],
      [
        { x: 0, y: 0 },
        { x: w - cut, y: 0 },
        { x: w, y: cut },
        { x: w, y: h },
        { x: 0, y: h },
      ],
      [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h - cut },
        { x: w - cut, y: h },
        { x: 0, y: h },
      ],
      [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: cut, y: h },
        { x: 0, y: h - cut },
      ],
    ][corner];
    // The diagonal chamfers above are deliberate on two of the four corners:
    // they give the plan a genuinely angled wall, which is a shape the app must
    // handle and a shape a purely Manhattan generator would never produce.
    return c;
  }

  // 'alcove': a shallow bay inset into one wall.
  const bay = Math.min(cut, 1.5);
  const along = lattice(rnd, 0.25, 0.55, 0.05);
  if (corner % 2 === 0) {
    const x0 = Math.round(w * along * 10) / 10;
    const x1 = Math.min(w - 0.5, x0 + Math.max(1.2, w * 0.3));
    return corner === 0
      ? [
          { x: 0, y: 0 },
          { x: x0, y: 0 },
          { x: x0, y: -bay },
          { x: x1, y: -bay },
          { x: x1, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ]
      : [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: x1, y: h },
          { x: x1, y: h + bay },
          { x: x0, y: h + bay },
          { x: x0, y: h },
          { x: 0, y: h },
        ];
  }
  const y0 = Math.round(h * along * 10) / 10;
  const y1 = Math.min(h - 0.5, y0 + Math.max(1.2, h * 0.3));
  return corner === 1
    ? [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: y0 },
        { x: w + bay, y: y0 },
        { x: w + bay, y: y1 },
        { x: w, y: y1 },
        { x: w, y: h },
        { x: 0, y: h },
      ]
    : [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
        { x: 0, y: y1 },
        { x: -bay, y: y1 },
        { x: -bay, y: y0 },
        { x: 0, y: y0 },
      ];
}
