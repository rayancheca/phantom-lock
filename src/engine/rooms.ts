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

function segsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = d(a1, a2, b1);
  const d2 = d(a1, a2, b2);
  const d3 = d(b1, b2, a1);
  const d4 = d(b1, b2, a2);
  return d1 * d2 < 0 && d3 * d4 < 0;
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

  const seedCell = cellOf(seed);
  const inGrid = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows;
  const filled = new Uint8Array(cols * rows);
  if (!inGrid(seedCell.cx, seedCell.cy)) {
    return { contains: () => false, centroid: seed, area: 0 };
  }

  const stack = [seedCell.cx + seedCell.cy * cols];
  filled[stack[0]] = 1;
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
      if (filled[nIdx]) continue;
      const there = cellCenter(nx, ny);
      let crossed = false;
      for (const bl of blockers) {
        if (segsCross(here, there, bl.a, bl.b)) {
          crossed = true;
          break;
        }
      }
      if (crossed) continue;
      filled[nIdx] = 1;
      stack.push(nIdx);
    }
  }

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
