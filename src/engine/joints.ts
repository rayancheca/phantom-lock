import type { SceneObject, Vec2, WallObj } from './types';
import { createId } from './scene';
import * as v from './vec';

const ENDPOINT_R = 0.25;
const EDGE_R = 0.18;
const EPS = 0.02;

/** Nearest point on segment ab to p, with its parameter t. */
function closestOnSeg(p: Vec2, a: Vec2, b: Vec2): { q: Vec2; t: number } {
  const ab = v.sub(b, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, v.dot(v.sub(p, a), ab) / len2));
  return { q: v.add(a, v.scale(ab, t)), t };
}

/** Magnetic wall snapping: endpoints first (corner joints), then the nearest
 *  point along a wall (T-joints). Falls back to the input point. */
export function snapToWalls(p: Vec2, walls: WallObj[], excludeIds?: Set<string>): Vec2 {
  let best: { q: Vec2; d: number } | null = null;
  for (const w of walls) {
    if (excludeIds?.has(w.id)) continue;
    for (const end of [w.a, w.b]) {
      const d = v.dist(p, end);
      if (d < ENDPOINT_R && (!best || d < best.d)) best = { q: end, d };
    }
  }
  if (best) return best.q;
  for (const w of walls) {
    if (excludeIds?.has(w.id)) continue;
    const { q } = closestOnSeg(p, w.a, w.b);
    const d = v.dist(p, q);
    if (d < EDGE_R && (!best || d < best.d)) best = { q, d };
  }
  return best ? best.q : p;
}

function segIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): { t: number; u: number } | null {
  const r = v.sub(a2, a1);
  const s = v.sub(b2, b1);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const qp = v.sub(b1, a1);
  const t = (qp.x * s.y - qp.y * s.x) / denom;
  const u = (qp.x * r.y - qp.y * r.x) / denom;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? { t, u } : null;
}

const chunk = (w: WallObj, a: Vec2, b: Vec2): WallObj => ({ ...w, id: createId('wall'), a, b });

/**
 * Add a wall so that nothing passes through anything: every crossing or
 * T-touch splits BOTH walls at the junction, leaving jointed chunks.
 * Returns the new objects list plus the ids of the added chunks.
 */
export function integrateWall(
  objects: SceneObject[],
  wall: WallObj,
): { objects: SceneObject[]; newIds: string[] } {
  const cuts: number[] = [];
  let out: SceneObject[] = [];
  for (const o of objects) {
    if (o.kind !== 'wall') {
      out.push(o);
      continue;
    }
    const hit = segIntersect(wall.a, wall.b, o.a, o.b);
    if (!hit) {
      out.push(o);
      continue;
    }
    cuts.push(hit.t);
    // Split the existing wall unless the junction sits at one of its ends.
    if (hit.u > EPS && hit.u < 1 - EPS) {
      const q = v.lerp(o.a, o.b, hit.u);
      out.push(chunk(o, o.a, q), chunk(o, q, o.b));
    } else {
      out.push(o);
    }
  }
  // Split the new wall into chunks between its junctions.
  const ts = [0, ...cuts.filter((t) => t > EPS && t < 1 - EPS).sort((x, y) => x - y), 1];
  const newIds: string[] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < EPS) continue;
    const piece = chunk(wall, v.lerp(wall.a, wall.b, ts[i]), v.lerp(wall.a, wall.b, ts[i + 1]));
    if (i === 0) piece.id = wall.id;
    out = [...out, piece];
    newIds.push(piece.id);
  }
  return { objects: out, newIds };
}
