import type { RectObj, Surface, Vec2 } from './types';
import * as v from './vec';

export const EPS = 1e-6;

export interface RayHit {
  t: number;
  point: Vec2;
  normal: Vec2;
}

export interface SurfaceHit extends RayHit {
  surface: Surface;
}

/**
 * Ray (origin o, unit direction d) vs segment ab.
 * Returns the hit with the surface normal flipped to oppose the ray,
 * so reflection works from either side of the wall.
 */
export function raySegment(o: Vec2, d: Vec2, a: Vec2, b: Vec2): RayHit | null {
  const s = v.sub(b, a);
  const denom = v.cross(d, s);
  if (Math.abs(denom) < 1e-12) return null;
  const ao = v.sub(a, o);
  const t = v.cross(ao, s) / denom;
  const u = v.cross(ao, d) / denom;
  if (t < EPS || u < -1e-9 || u > 1 + 1e-9) return null;
  const point = v.add(o, v.scale(d, t));
  let normal = v.norm(v.perp(s));
  if (v.dot(normal, d) > 0) normal = v.scale(normal, -1);
  return { t, point, normal };
}

/** Ray vs circle. Handles rays starting inside the circle. */
export function rayCircle(o: Vec2, d: Vec2, c: Vec2, r: number): RayHit | null {
  const oc = v.sub(o, c);
  const b = v.dot(oc, d);
  const cc = v.dot(oc, oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < EPS) t = -b + sq;
  if (t < EPS) return null;
  const point = v.add(o, v.scale(d, t));
  let normal = v.norm(v.sub(point, c));
  if (v.dot(normal, d) > 0) normal = v.scale(normal, -1);
  return { t, point, normal };
}

export function nearestHit(surfaces: Surface[], o: Vec2, d: Vec2): SurfaceHit | null {
  let best: SurfaceHit | null = null;
  for (const s of surfaces) {
    const hit = s.type === 'seg' ? raySegment(o, d, s.a, s.b) : rayCircle(o, d, s.c, s.r);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, surface: s };
  }
  return best;
}

export function rectCorners(r: RectObj): Vec2[] {
  const c = Math.cos(r.rotation);
  const s = Math.sin(r.rotation);
  const hw = r.w / 2;
  const hh = r.h / 2;
  const local: Array<[number, number]> = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return local.map(([x, y]) => ({
    x: r.center.x + x * c - y * s,
    y: r.center.y + x * s + y * c,
  }));
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = v.sub(b, a);
  const l2 = v.dot(ab, ab);
  if (l2 < EPS * EPS) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, v.dot(v.sub(p, a), ab) / l2));
  return { point: v.add(a, v.scale(ab, t)), t };
}

export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return v.dist(p, closestPointOnSegment(p, a, b).point);
}

export function pointInRect(p: Vec2, r: RectObj): boolean {
  const d = v.sub(p, r.center);
  const local = v.rotate(d, -r.rotation);
  return Math.abs(local.x) <= r.w / 2 && Math.abs(local.y) <= r.h / 2;
}

/** Ray-casting point-in-polygon (for lasso selection). */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
