import type {
  Arrival,
  DirectPath,
  RayPath,
  Scene,
  SceneObject,
  SpeakerTrace,
  Surface,
  TraceResult,
  Vec2,
} from './types';
import { closestPointOnSegment, distPointSegment, EPS, rayCircle, raySegment, rectCorners } from './geometry';
import { gainOf } from './speakers';
import * as v from './vec';

export const SPEED_OF_SOUND = 343; // m/s
export const CAPTURE_RADIUS = 0.35; // listener "head + shoulders" capture zone, metres
/**
 * Sound passing this close above an object's top edge still loses some energy
 * to it (a crude diffraction model); higher than this and it sails over untouched.
 */
export const GRAZE_BAND = 0.5;

/** Rays that miss everything are clipped at this range so open scenes still render. */
const MAX_RANGE = 60;
/** Offset off a surface after reflecting so a ray never re-hits the surface it just left. */
const NUDGE = 5e-4;
/** Rays die once their energy falls below this. */
const MIN_ENERGY = 0.02;
/** Amplitude roll-off per metre used for arrival strength (display-domain, not physical SPL). */
const ARRIVAL_ROLLOFF = 0.25;
/** Hard cap on tracer steps per ray (bounces + graze pass-throughs). */
const MAX_STEPS = 40;

/**
 * The parts of a wall that remain solid once the openings sitting on it
 * (doors, windows) are cut out. Returned as [t0, t1] spans along a→b.
 */
export function wallKeptSpans(
  wall: { a: Vec2; b: Vec2 },
  objects: SceneObject[],
  cutRoles: ReadonlyArray<'door' | 'window'>,
): Array<[number, number]> {
  const len = v.dist(wall.a, wall.b);
  if (len < EPS) return [[0, 1]];
  const dir = v.scale(v.sub(wall.b, wall.a), 1 / len);
  const cuts: Array<[number, number]> = [];
  for (const o of objects) {
    if (o.kind !== 'rect') continue;
    if (o.role !== 'door' && o.role !== 'window') continue;
    if (!cutRoles.includes(o.role)) continue;
    if (distPointSegment(o.center, wall.a, wall.b) > 0.12) continue; // not on this wall
    const tc = v.dot(v.sub(o.center, wall.a), dir) / len;
    const half = o.w / 2 / len;
    const t0 = Math.max(0, tc - half);
    const t1 = Math.min(1, tc + half);
    if (t1 > t0) cuts.push([t0, t1]);
  }
  if (cuts.length === 0) return [[0, 1]];
  cuts.sort((x, y) => x[0] - y[0]);
  const kept: Array<[number, number]> = [];
  let cursor = 0;
  for (const [c0, c1] of cuts) {
    if (c0 > cursor + 1e-4) kept.push([cursor, c0]);
    cursor = Math.max(cursor, c1);
  }
  if (cursor < 1 - 1e-4) kept.push([cursor, 1]);
  return kept;
}

export function collectSurfaces(objects: SceneObject[]): Surface[] {
  const out: Surface[] = [];
  for (const o of objects) {
    if (o.kind === 'wall') {
      if (v.dist(o.a, o.b) > EPS) {
        // Doors and windows carve real openings out of the wall; the window's
        // own glass (and a closed door's leaf) fill the hole with their material.
        for (const [t0, t1] of wallKeptSpans(o, objects, ['door', 'window'])) {
          out.push({
            type: 'seg',
            a: v.lerp(o.a, o.b, t0),
            b: v.lerp(o.a, o.b, t1),
            absorption: o.absorption,
            height: o.height,
            objectId: o.id,
          });
        }
      }
    } else if (o.kind === 'rect') {
      // An open door is a passage — it contributes no surfaces at all.
      if (o.role === 'door' && o.doorOpen !== false) continue;
      const c = rectCorners(o);
      for (let i = 0; i < 4; i++) {
        out.push({
          type: 'seg',
          a: c[i],
          b: c[(i + 1) % 4],
          absorption: o.absorption,
          height: o.height,
          objectId: o.id,
        });
      }
    } else {
      out.push({
        type: 'circle',
        c: o.center,
        r: o.r,
        absorption: o.absorption,
        height: o.height,
        objectId: o.id,
      });
    }
  }
  return out;
}

interface StepHit {
  t: number;
  point: Vec2;
  normal: Vec2;
  surface: Surface;
}

/**
 * Nearest surface that a ray travelling at height `z` interacts with:
 * solid hit when the surface top is at/above the ray, graze when the ray
 * skims within GRAZE_BAND above the top, ignored when well above.
 */
function nearestInteraction(surfaces: Surface[], o: Vec2, d: Vec2, z: number): StepHit | null {
  let best: StepHit | null = null;
  for (const s of surfaces) {
    if (s.height + GRAZE_BAND <= z) continue;
    const hit = s.type === 'seg' ? raySegment(o, d, s.a, s.b) : rayCircle(o, d, s.c, s.r);
    if (hit && (!best || hit.t < best.t)) best = { ...hit, surface: s };
  }
  return best;
}

/** Energy fraction surviving a graze over a surface top at ray height z. */
function grazeFactor(surface: Surface, z: number): number {
  const clearance = Math.max(0, z - surface.height);
  const proximity = 1 - clearance / GRAZE_BAND; // 1 at the top edge → 0 at the band edge
  return 1 - 0.5 * surface.absorption * Math.max(0, proximity);
}

/**
 * Occlusion-aware capture: the ray segment ab passes near the listener, but
 * a thin wall can sit between the flight path and the listener's head.
 */
function captureOnSegment(
  a: Vec2,
  b: Vec2,
  z: number,
  cumStart: number,
  energy: number,
  listener: { pos: Vec2; z: number },
  surfaces: Surface[],
  order: number,
): Arrival | null {
  const { point, t } = closestPointOnSegment(listener.pos, a, b);
  const d = v.dist(listener.pos, point);
  if (d > CAPTURE_RADIUS) return null;
  if (d > 0.02) {
    // Test from slightly before the closest point along the flight path —
    // when the segment ends ON a wall, the wall itself must still be able
    // to shadow a listener standing just behind it.
    const segLen = v.dist(a, b);
    const backoff = Math.min(0.03, t * segLen);
    const pTest = segLen > EPS ? v.lerp(a, b, Math.max(0, t - backoff / segLen)) : point;
    const reach = directOcclusion(surfaces, pTest, z, listener.pos, listener.z);
    if (reach.blocked) return null;
  }
  const travelled = cumStart + t * v.dist(a, b);
  return {
    timeMs: (travelled / SPEED_OF_SOUND) * 1000,
    amp: energy / (1 + ARRIVAL_ROLLOFF * travelled),
    order,
  };
}

/**
 * Emit `rayCount` rays over 360° from `origin` at height `z`, reflecting them
 * off every surface (angle of incidence = angle of reflection) and attenuating
 * by each surface's absorption. Rays never pass through solid geometry: the
 * nearest interaction wins at every step. Low furniture below the ray height
 * only grazes the ray (partial energy loss, no reflection).
 */
export function traceSpeaker(
  surfaces: Surface[],
  origin: Vec2,
  z: number,
  listener: { pos: Vec2; z: number },
  rayCount: number,
  maxBounces: number,
  gain = 1,
): SpeakerTrace {
  const paths: RayPath[] = [];
  const arrivals: Arrival[] = [];

  for (let i = 0; i < rayCount; i++) {
    const ang = ((i + 0.5) / rayCount) * Math.PI * 2;
    let dir = v.fromAngle(ang);
    let pos = origin;
    let energy = gain;
    let cum = 0;
    let bounces = 0;
    const points: Vec2[] = [pos];
    const energies: number[] = [];
    const cums: number[] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      const hit = nearestInteraction(surfaces, pos, dir, z);
      const end = hit ? hit.point : v.add(pos, v.scale(dir, MAX_RANGE));

      const arr = captureOnSegment(pos, end, z, cum, energy, listener, surfaces, bounces);
      if (arr) arrivals.push(arr);

      points.push(end);
      energies.push(energy);
      cums.push(cum);

      if (!hit) break;
      cum += hit.t;

      if (hit.surface.height >= z) {
        // Solid hit: absorb and reflect.
        energy *= 1 - hit.surface.absorption;
        bounces += 1;
        if (energy < MIN_ENERGY || bounces > maxBounces) break;
        dir = v.reflect(dir, hit.normal);
        // Step off along the surface normal (not just the direction) so
        // concave corners can't leak the ray through the adjacent wall.
        pos = v.add(v.add(hit.point, v.scale(hit.normal, NUDGE)), v.scale(dir, NUDGE));
      } else {
        // Graze: skim over the top edge, lose a little energy, keep flying.
        energy *= grazeFactor(hit.surface, z);
        if (energy < MIN_ENERGY) break;
        pos = v.add(hit.point, v.scale(dir, NUDGE));
      }
    }

    paths.push({ points, energy: energies, cumDist: cums });
  }

  return { paths, arrivals };
}

/**
 * Walk the straight 3D line between two points (each with its own height) and
 * account for every surface crossing: a surface blocks only if its top is at
 * or above the line's height at the crossing; lower tops graze.
 */
function directOcclusion(
  surfaces: Surface[],
  from: Vec2,
  zFrom: number,
  to: Vec2,
  zTo: number,
): { blocked: boolean; attenuation: number } {
  const d = v.dist(from, to);
  if (d < EPS) return { blocked: false, attenuation: 1 };
  const dir = v.scale(v.sub(to, from), 1 / d);
  let attenuation = 1;
  for (const s of surfaces) {
    const hit = s.type === 'seg' ? raySegment(from, dir, s.a, s.b) : rayCircle(from, dir, s.c, s.r);
    if (!hit || hit.t >= d - 0.02) continue;
    const zAt = zFrom + (zTo - zFrom) * (hit.t / d);
    if (s.height >= zAt) return { blocked: true, attenuation: 0 };
    if (s.height + GRAZE_BAND > zAt) attenuation *= grazeFactor(s, zAt);
  }
  return { blocked: false, attenuation };
}

/** Line-of-sight check from a speaker to the listener, height-aware. */
export function directPath(
  surfaces: Surface[],
  from: Vec2,
  zFrom: number,
  to: Vec2,
  zTo: number,
): DirectPath {
  const d = v.dist(from, to);
  const occ = directOcclusion(surfaces, from, zFrom, to, zTo);
  return {
    distance: d,
    distance3d: Math.hypot(d, zTo - zFrom),
    blocked: occ.blocked,
    attenuation: occ.attenuation,
  };
}

export function traceScene(scene: Scene, rayCount: number, maxBounces: number): TraceResult {
  const surfaces = collectSurfaces(scene.objects);
  return {
    bySpeaker: scene.speakers.map((sp) => ({
      id: sp.id,
      trace: traceSpeaker(surfaces, sp.pos, sp.z, scene.listener, rayCount, maxBounces, gainOf(sp)),
      direct: directPath(surfaces, sp.pos, sp.z, scene.listener.pos, scene.listener.z),
    })),
  };
}
