import type { Vec2 } from '../../engine/types';

/**
 * The world<->screen transform, and NOTHING else (S36).
 *
 * Moved VERBATIM out of `render.ts` so `handles.ts` can project a grip without
 * importing the renderer — `render.ts` has to import `handles.ts` to DRAW the
 * grips, and the two together would be a `render -> handles -> render` cycle.
 * This is the same move S20 made for `ids.ts` and S19 for `reflection.ts`:
 * a pure leaf plus a re-export from the original, so every existing importer of
 * `render.ts` is byte-unchanged and nothing has to be found and updated.
 *
 * A LEAF: it imports the `Vec2` type only. Keep it that way — anything that
 * reaches back into the renderer re-creates the cycle this file exists to break.
 */

export interface View {
  scale: number; // px per metre
  ox: number;
  oy: number;
  /** View rotation in radians — the whole floor plan spins around the screen. */
  rot: number;
}

/** Rotate a world-space vector into screen orientation. */
export const rotVec = (p: Vec2, rot: number): Vec2 => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export const worldToScreen = (p: Vec2, v: View): Vec2 => {
  const r = rotVec(p, v.rot);
  return { x: r.x * v.scale + v.ox, y: r.y * v.scale + v.oy };
};

export const screenToWorld = (q: Vec2, v: View): Vec2 => {
  const dx = (q.x - v.ox) / v.scale;
  const dy = (q.y - v.oy) / v.scale;
  return rotVec({ x: dx, y: dy }, -v.rot);
};
