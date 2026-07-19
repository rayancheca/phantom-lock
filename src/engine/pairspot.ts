import type { Scene, SpeakerObj, Surface, Vec2, WallObj } from './types';
import { distPointSegment, pointInRect } from './geometry';
import { directPath } from './raytrace';
import { levelAtDb, SPEAKER_MODELS } from './speakers';
import { sceneBounds } from './scene';
import * as v from './vec';

export interface PairSweet {
  p: Vec2;
  /** True when at least one speaker only reaches this spot via a reflection. */
  viaReflection: boolean;
  score: number;
}

const GRID_STEP = 0.35;
/** Reflections carry level but smear imaging — dock them a few dB. */
const REFLECTION_PENALTY_DB = 4;
const UNREACHABLE_DB = -60;

function insideFurnitureOrWall(scene: Scene, p: Vec2): boolean {
  for (const o of scene.objects) {
    if (o.kind === 'wall') {
      if (distPointSegment(p, o.a, o.b) < 0.3) return true;
    } else if (o.kind === 'rect') {
      if (o.height > 1.2 && pointInRect(p, o)) return true;
    } else if (o.height > 1.2 && v.dist(p, o.center) <= o.r) {
      return true;
    }
  }
  return false;
}

/**
 * Strongest first-order wall bounce from speaker to p, in dB (image-source
 * method): mirror the speaker across each wall, require the image→p segment
 * to actually cross that wall below its top, then charge the full folded
 * path length plus the wall's absorption.
 */
export function bestReflectionDb(
  surfaces: Surface[],
  walls: WallObj[],
  sp: SpeakerObj,
  p: Vec2,
  earZ: number,
): number {
  let best = -Infinity;
  for (const w of walls) {
    const dir = v.norm(v.sub(w.b, w.a));
    const rel = v.sub(sp.pos, w.a);
    const along = v.dot(rel, dir);
    const proj = v.add(w.a, v.scale(dir, along));
    const image = v.add(proj, v.sub(proj, sp.pos));
    // Where does image→p cross the wall segment?
    const r = v.sub(p, image);
    const q = v.sub(w.b, w.a);
    const denom = r.x * q.y - r.y * q.x;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((w.a.x - image.x) * q.y - (w.a.y - image.y) * q.x) / denom;
    const u = ((w.a.x - image.x) * r.y - (w.a.y - image.y) * r.x) / denom;
    if (t <= 0.02 || t >= 0.98 || u < 0 || u > 1) continue;
    // Folded 3D path: speaker → wall → ear. Height at the bounce must stay
    // under the wall top or the "reflection" would fly over it.
    const flat = v.len(r); // image→p equals the folded path length in plan
    const total = Math.hypot(flat, sp.z - earZ);
    const bounceZ = sp.z + (earZ - sp.z) * t;
    if (bounceZ > w.height) continue;
    // Both legs of the bounce must themselves be clear — otherwise a wall
    // between speaker and mirror wall would "reflect" straight through it.
    const bounce = v.add(w.a, v.scale(q, u));
    const legSurfaces = surfaces.filter((s) => s.objectId !== w.id);
    if (directPath(legSurfaces, sp.pos, sp.z, bounce, bounceZ).blocked) continue;
    if (directPath(legSurfaces, bounce, bounceZ, p, earZ).blocked) continue;
    const keep = Math.max(0.02, 1 - w.absorption);
    const db = levelAtDb(sp, Math.max(0.3, total)) + 20 * Math.log10(keep);
    if (db > best) best = db;
  }
  return best;
}

/** Level (dB) at p for one speaker: direct path if it exists, else the best
 *  wall bounce with an imaging penalty. -Infinity when nothing arrives. */
function reachDb(
  surfaces: Surface[],
  walls: WallObj[],
  sp: SpeakerObj,
  p: Vec2,
  earZ: number,
): { db: number; reflected: boolean } {
  const d = directPath(surfaces, sp.pos, sp.z, p, earZ);
  if (!d.blocked) {
    const graze = 20 * Math.log10(Math.max(0.05, d.attenuation));
    return { db: levelAtDb(sp, Math.max(0.3, d.distance3d)) + graze, reflected: false };
  }
  return { db: bestReflectionDb(surfaces, walls, sp, p, earZ) - REFLECTION_PENALTY_DB, reflected: true };
}

/**
 * The best real place to sit for ONE stereo pair, walls included: every grid
 * cell is scored on triangle quality, level balance (model + trim + distance
 * + absorption), the model's comfort band, and the TV axis when anchored.
 * Direct sound wins; cells only reached by reflections still count, docked.
 */
export function bestPairSpot(
  scene: Scene,
  surfaces: Surface[],
  a: SpeakerObj,
  b: SpeakerObj,
  earZ: number,
  tvCenter: Vec2 | null,
): PairSweet | null {
  const walls = scene.objects.filter((o): o is WallObj => o.kind === 'wall');
  const bounds = sceneBounds(scene);
  const base = v.dist(a.pos, b.pos);
  if (base < 0.5) return null;
  const spec = SPEAKER_MODELS[a.model];

  let best: PairSweet | null = null;
  for (let x = bounds.min.x + GRID_STEP / 2; x <= bounds.max.x; x += GRID_STEP) {
    for (let y = bounds.min.y + GRID_STEP / 2; y <= bounds.max.y; y += GRID_STEP) {
      const p = { x, y };
      if (insideFurnitureOrWall(scene, p)) continue;

      const ra = reachDb(surfaces, walls, a, p, earZ);
      const rb = reachDb(surfaces, walls, b, p, earZ);
      if (ra.db < UNREACHABLE_DB || rb.db < UNREACHABLE_DB) continue;

      const dA = Math.hypot(v.dist(a.pos, p), a.z - earZ);
      const dB = Math.hypot(v.dist(b.pos, p), b.z - earZ);
      const mean = (dA + dB + base) / 3;
      const spread = Math.max(dA, dB, base) - Math.min(dA, dB, base);
      const triQ = Math.max(0, 1 - spread / mean / 0.25);

      const balance = Math.max(0, 1 - Math.abs(ra.db - rb.db) / 10);

      const dm = (dA + dB) / 2;
      const band =
        dm < spec.idealMin
          ? Math.max(0.2, dm / spec.idealMin)
          : dm > spec.idealMax
            ? Math.max(0.2, 1 - (dm - spec.idealMax) / 2)
            : 1;

      let tvQ = 1;
      if (tvCenter) {
        const mid = v.lerp(a.pos, b.pos, 0.5);
        let axis = v.norm(v.perp(v.sub(b.pos, a.pos)));
        if (v.dot(axis, v.sub(p, mid)) < 0) axis = v.scale(axis, -1);
        const offAxis = Math.abs(v.cross(axis, v.sub(tvCenter, mid)));
        tvQ = Math.max(0.15, Math.min(1, 1 - Math.max(0, offAxis - 0.25) / 1.2));
      }

      const reflected = ra.reflected || rb.reflected;
      const score = (triQ * 0.45 + balance * 0.3 + band * 0.25) * tvQ * (reflected ? 0.75 : 1);
      if (!best || score > best.score) best = { p, viaReflection: reflected, score };
    }
  }
  return best;
}
