import type { RectObj, Scene, Vec2 } from './types';
import { rectCorners } from './geometry';
import { sceneBounds } from './scene';
import * as v from './vec';

/** Base grid resolution for room flood-fills, metres. */
const CELL = 0.3;
/** Grid cap per axis. Beyond this the cell GROWS (see regionOf) rather than the
 *  grid clamping and silently truncating scenes past ~48 m. */
const MAX_CELLS = 160;
/** Walls shorter than a seated ear don't bound a listening region. */
const MIN_BOUNDING_HEIGHT = 1.2;
/** Slack for the on-segment span test in `withinSeg`. The point is already
 *  EXACTLY collinear when that runs, so this only absorbs representation noise
 *  in the endpoint comparison — it is not a proximity threshold. */
const EPS = 1e-9;

export interface Region {
  contains: (p: Vec2) => boolean;
  centroid: Vec2;
  /** Approximate floor area, m². */
  area: number;
}

interface Blocker {
  a: Vec2;
  b: Vec2;
}

/** Is `p` inside segment `b1..b2`'s bounding box? Only called when `p` is already
 *  known to be COLLINEAR with it, so this is a true on-segment test. */
function withinSeg(b1: Vec2, b2: Vec2, p: Vec2): boolean {
  return (
    p.x >= Math.min(b1.x, b2.x) - EPS &&
    p.x <= Math.max(b1.x, b2.x) + EPS &&
    p.y >= Math.min(b1.y, b2.y) - EPS &&
    p.y <= Math.max(b1.y, b2.y) + EPS
  );
}

/**
 * Does blocker `b1..b2` separate cell centre `a1` from cell centre `a2`?
 *
 * The strict form (`d1*d2 < 0 && d3*d4 < 0`) is correct whenever all four
 * determinants are non-zero, and it fails EXACTLY when one is zero — which is
 * why the extra branch below tests `=== 0` rather than a tolerance. A value one
 * ulp from zero still carries the right sign and is handled correctly by the
 * strict test; only an exact zero is ambiguous.
 *
 * **The bug this closes (S25).** A step whose ENDPOINT lands exactly on a
 * blocker's line scored `d4 = 0`, so `d3*d4 < 0` was false and the step was not
 * blocked — and the step OUT of that cell had `d3 = 0`, so it was not blocked
 * either. The fill walked straight through the wall. It is not a rare alignment:
 * the grid origin is `sceneBounds().min - cell`, `sceneBounds` reads door rect
 * CORNERS, and an ordinary door's `h = 0.1` puts `min.y` at -0.05 — which lands a
 * whole cell-centre ROW on a wall 5.5 m away. Measured on an 8x5.5 room: the
 * region read **54.81 m² for 44.00 m²**. Skewed walls are NOT exempt and are
 * worse: a 45-degree hypotenuse can hold an entire anti-diagonal of centres, and
 * one measured **92.16 m² for a 40.05 m² triangle**.
 *
 * **The taxonomy is complete, which is why this is the textbook predicate rather
 * than a patch.** `segsCross` implemented *proper* intersection only, so every
 * *improper* (touching) one leaked, and there are exactly three shapes:
 *   1. `d3`/`d4` zero — a step ENDPOINT lands on the blocker. The whole-ROW case:
 *      an entire line of cell centres sits on a wall, so every step across it is
 *      free. Catastrophic and global.
 *   2. `d1`/`d2` zero — a blocker ENDPOINT lands on the step. A pinhole at a wall
 *      end or a doorway jamb (see below — this one is not optional).
 *   3. all four zero — the step runs collinear INSIDE the wall.
 * All three are covered by the four `=== 0` branches; verified against a hand
 * table including "collinear but entirely beyond the wall's end", which must
 * stay FREE.
 *
 * **`d1`/`d2` is not optional, and the first cut of this fix got it wrong.** It
 * is tempting to handle only `d3`/`d4` and argue that going around a wall's TIP
 * is legitimate. That reasoning fails on the shape the generator actually builds:
 * at an entry door the exterior wall splits into two stubs and the door rect's
 * edges START at exactly the stub ends, so on that cell row THREE blockers each
 * merely touch the step. None blocks alone; together they seal the wall. The
 * partial fix left 4 of 300 generated designs still fully unsealed while passing
 * every other test in `rooms.test.ts` — see the `THE SEAM` fixture, distilled
 * from `one-bed`/seed 6, which exists specifically to discriminate the two.
 *
 * **Over-blocking was the real risk, and it was measured rather than argued.**
 * Blocking a graze could seal a narrow doorway, and `arrange.ts:599` builds its
 * hard walkable-containment constraint from this region. The cell GROWS as
 * `span/158` past ~47 m, so a 0.9 m doorway spans 3.0 cells at an 8 m envelope,
 * 2.4 at 60 m, 1.6 at 90 m and 1.0 at 140 m — it connects at every one.
 *
 * **What `d3`/`d4` versus `d1`/`d2` actually mean.** `d3`/`d4` zero means a cell
 * CENTRE lies on the blocker — that cell is inside the wall, so the step into it
 * must be blocked. `d1`/`d2` zero means a blocker ENDPOINT lies on the step —
 * the step grazes the wall's TIP. BOTH block. The doorway is not protected by
 * declining to block a graze (the first cut tried that and left 4 of 300 designs
 * unsealed); it is protected by arithmetic: a gap of width `G` leaves
 * `ceil(G/cell) − 1` free lanes through it, so at `cell` 0.3 any doorway ≥ 0.6 m
 * keeps at least one. Measured over 1 000 jamb alignments × 5 gap widths: zero
 * sealed.
 *
 * The repair only ever REMOVES steps, never adds one — which is precisely why
 * over-blocking was the risk worth measuring, and it is also why the SEED needs
 * its own handling in `regionOf` (a seed cell sitting on a blocker would have
 * every exit removed and collapse the region to one cell — see the seed nudge in
 * `regionOf`).
 */
function segsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = d(a1, a2, b1);
  const d2 = d(a1, a2, b2);
  const d3 = d(b1, b2, a1);
  const d4 = d(b1, b2, a2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  // A cell centre sitting exactly ON the blocker: that cell is inside the wall.
  if (d3 === 0 && withinSeg(b1, b2, a1)) return true;
  if (d4 === 0 && withinSeg(b1, b2, a2)) return true;
  // A blocker ENDPOINT sitting exactly on the step: the step grazes the wall's tip.
  if (d1 === 0 && withinSeg(a1, a2, b1)) return true;
  if (d2 === 0 && withinSeg(a1, a2, b2)) return true;
  return false;
}

/** Region boundaries: tall walls plus door rects — a door is a room divider
 *  for zoning purposes even when it lets sound through. */
function collectBlockers(scene: Scene, doorsBlock: boolean): Blocker[] {
  const out: Blocker[] = [];
  for (const o of scene.objects) {
    if (o.kind === 'wall' && o.height >= MIN_BOUNDING_HEIGHT) out.push({ a: o.a, b: o.b });
    if (doorsBlock && o.kind === 'rect' && o.role === 'door') {
      const c = rectCorners(o as RectObj);
      out.push({ a: c[0], b: c[1] }, { a: c[3], b: c[2] });
    }
  }
  return out;
}

/**
 * Flood-fill the walkable region around `seed`, bounded by walls and doors.
 * Cheap enough to build per optimizer run (grid ≤ ~120×120 cells).
 */
export function regionOf(scene: Scene, seed: Vec2, opts?: { doorsBlock?: boolean }): Region {
  const blockers = collectBlockers(scene, opts?.doorsBlock ?? true);
  const b = sceneBounds(scene);
  const rawW = b.max.x - b.min.x;
  const rawH = b.max.y - b.min.y;
  // Grow the cell for huge scenes instead of clamping the grid and silently
  // truncating everything past ~48 m. Scenes under ~47.4 m keep the exact 0.3 m
  // cell, so their flood-fills (and every existing test) are unchanged.
  const cell = Math.max(CELL, rawW / (MAX_CELLS - 2), rawH / (MAX_CELLS - 2));
  const pad = cell;
  const minX = b.min.x - pad;
  const minY = b.min.y - pad;
  const cols = Math.min(MAX_CELLS, Math.max(1, Math.ceil((rawW + 2 * pad) / cell)));
  const rows = Math.min(MAX_CELLS, Math.max(1, Math.ceil((rawH + 2 * pad) / cell)));
  const cellCenter = (cx: number, cy: number): Vec2 => ({
    x: minX + (cx + 0.5) * cell,
    y: minY + (cy + 0.5) * cell,
  });
  const cellOf = (p: Vec2) => ({
    cx: Math.floor((p.x - minX) / cell),
    cy: Math.floor((p.y - minY) / cell),
  });

  const raw = cellOf(seed);
  const inGrid = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
  if (!inGrid(raw.cx, raw.cy)) {
    return { contains: () => false, centroid: seed, area: 0 };
  }

  /**
   * NUDGE THE SEED OFF A WALL.
   *
   * `segsCross` blocks any step whose endpoint lies exactly on a blocker, which
   * is what closes the leak — but it applies to the step OUT of a cell as well
   * as the step in. So a seed whose own cell centre sits on a wall has all four
   * exits removed and the fill terminates immediately, returning one cell.
   *
   * That is not exotic: the cell spans ±cell/2, so ANY seat within 0.15 m of a
   * grid-aligned wall lands in it — measured, 640 of 17 600 interior positions on
   * the app's 0.05 m snap grid, and a seat pushed against a wall is ordinary.
   * `optimize.ts`'s listener target has no `area > 2` guard, so the collapse
   * surfaced as "Suggest placement" returning ZERO speakers with a note blaming
   * the user's furniture.
   *
   * The raw seed POINT is off the wall (by up to cell/2) even when its cell
   * centre is not, so its own position picks the side: prefer the neighbour whose
   * centre is nearest the real seed. Falling back to the original cell keeps the
   * old answer when every neighbour is walled too.
   */
  const onBlocker = (p: Vec2): boolean =>
    blockers.some((bl) => {
      const dd =
        (bl.b.x - bl.a.x) * (p.y - bl.a.y) - (bl.b.y - bl.a.y) * (p.x - bl.a.x);
      return dd === 0 && withinSeg(bl.a, bl.b, p);
    });

  /** Flood-fill from one start cell. Returns a fresh grid, so it can be run twice. */
  const fillFrom = (start: { cx: number; cy: number }) => {
    const grid = new Uint8Array(cols * rows);
    const stack = [start.cx + start.cy * cols];
    grid[stack[0]] = 1;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const cx = idx % cols;
      const cy = (idx / cols) | 0;
      const here = cellCenter(cx, cy);
      sumX += here.x;
      sumY += here.y;
      count += 1;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inGrid(nx, ny)) continue;
        const nIdx = nx + ny * cols;
        if (grid[nIdx]) continue;
        const there = cellCenter(nx, ny);
        let crossed = false;
        for (const bl of blockers) {
          if (segsCross(here, there, bl.a, bl.b)) {
            crossed = true;
            break;
          }
        }
        if (crossed) continue;
        grid[nIdx] = 1;
        stack.push(nIdx);
      }
    }
    return { grid, sumX, sumY, count };
  };

  // Candidate start cells: the seed's own cell, unless its centre is ON a wall.
  let starts: Array<{ cx: number; cy: number }> = [raw];
  if (onBlocker(cellCenter(raw.cx, raw.cy))) {
    const free = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      .map(([dx, dy]) => ({ cx: raw.cx + dx, cy: raw.cy + dy }))
      .filter((c) => inGrid(c.cx, c.cy) && !onBlocker(cellCenter(c.cx, c.cy)))
      .map((c) => ({ c, d: v.dist(cellCenter(c.cx, c.cy), seed) }))
      .sort((a, b) => a.d - b.d);
    if (free.length > 0) {
      // The nearest free neighbour wins. On an EXACT tie the seed sits precisely
      // on the wall centreline and its position carries no side information, so
      // fall back to the larger region — "the room you are in" rather than the
      // strip outside the building, which a stable sort would otherwise pick at
      // random. Measured: a seat dragged exactly onto a wall read 8.64 m2 (the
      // outside strip) instead of 43.74.
      const tied = free.filter((f) => Math.abs(f.d - free[0].d) < EPS).map((f) => f.c);
      starts = tied.length > 0 ? tied : [free[0].c];
    }
  }

  const runs = starts.map(fillFrom);
  const best = runs.reduce((a, b) => (b.count > a.count ? b : a));
  const { grid: filled, sumX, sumY, count } = best;

  return {
    contains: (p: Vec2) => {
      const c = cellOf(p);
      return inGrid(c.cx, c.cy) ? filled[c.cx + c.cy * cols] === 1 : false;
    },
    centroid: count > 0 ? { x: sumX / count, y: sumY / count } : seed,
    area: count * cell * cell,
  };
}

/** Do two points share a walkable region (no full wall or doorway between)? */
export function sameRegion(scene: Scene, p: Vec2, q: Vec2): boolean {
  if (v.dist(p, q) < CELL) return true;
  return regionOf(scene, p).contains(q);
}
