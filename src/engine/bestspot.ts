import type { RectObj, Scene, SpeakerObj, Surface, Vec2, WallObj } from './types';
import { distPointSegment, pointInRect } from './geometry';
import { collectSurfaces, directPath } from './raytrace';
import { levelAtDb, SPEAKER_MODELS } from './speakers';
import { bestReflectionDb } from './pairspot';
import { findTv } from './stereo';
import { sceneBounds } from './scene';
import * as v from './vec';

/** Perceived-quality weight per model — a mini matched in level still gives
 *  up the bass octave, so a spot carried by minis scores lower. */
const CAPABILITY: Record<string, number> = { homepod: 1, 'homepod-mini': 0.65 };

/**
 * How good p is as a TV seat: needs line of sight to the screen, a viewing
 * angle inside the panel's useful cone, and a sane viewing distance.
 */
function tvViewQuality(surfaces: Surface[], tv: RectObj, p: Vec2, earZ: number): number {
  const screenZ = Math.max(0.5, tv.height * 0.8);
  // Exclude the TV's own surfaces — the sight ray starts inside its rect.
  const others = surfaces.filter((s) => s.objectId !== tv.id);
  if (directPath(others, tv.center, screenZ, p, earZ).blocked) return 0.1;
  const d = v.dist(tv.center, p);
  const dist = d < 1.2 ? Math.max(0.3, d / 1.2) : d > 4.5 ? Math.max(0.3, 1 - (d - 4.5) / 3) : 1;
  // Panel normal from the rect's rotation (long axis = screen face).
  const normal = { x: -Math.sin(tv.rotation), y: Math.cos(tv.rotation) };
  const toP = v.norm(v.sub(p, tv.center));
  const cos = Math.abs(v.dot(normal, toP));
  const angle = cos >= 0.55 ? 1 : Math.max(0.25, cos / 0.55);
  return dist * angle;
}

export interface ListeningField {
  /** The single best place to be, or null when nothing scores. */
  best: Vec2 | null;
  bestScore: number;
  /** Near-optimal neighbourhood — rendered as the glowing convergence zone. */
  zone: Array<{ p: Vec2; s: number }>;
}

const EMPTY: ListeningField = { best: null, bestScore: 0, zone: [] };

function insideFurnitureOrWall(scene: Scene, p: Vec2): boolean {
  for (const o of scene.objects) {
    if (o.kind === 'wall') {
      if (distPointSegment(p, o.a, o.b) < 0.3) return true;
    } else if (o.kind === 'rect') {
      // Sitting on a bed/sofa is fine — only tall furniture excludes a spot.
      if (o.height > 1.2 && pointInRect(p, o)) return true;
    } else if (o.height > 1.2 && v.dist(p, o.center) <= o.r) {
      return true;
    }
  }
  return false;
}

/** Equilateral quality of a pair heard from point p (plus TV axis when anchored). */
function pairQualityAt(
  a: SpeakerObj,
  b: SpeakerObj,
  p: Vec2,
  earZ: number,
  tvCenter: Vec2 | null,
): number {
  const dA = Math.hypot(v.dist(a.pos, p), a.z - earZ);
  const dB = Math.hypot(v.dist(b.pos, p), b.z - earZ);
  const base = v.dist(a.pos, b.pos);
  if (base < 0.5) return 0;
  // Triangle shape is a floor-plan (2D) quantity — consistent with computePair's
  // equilateral test — while the distance band below stays 3D (height matters
  // for level, not for the horizontal ±30° imaging geometry).
  const pA = v.dist(a.pos, p);
  const pB = v.dist(b.pos, p);
  const mean = (pA + pB + base) / 3;
  const spread = Math.max(pA, pB, base) - Math.min(pA, pB, base);
  let q = Math.max(0, 1 - spread / mean / 0.25);

  // Stay inside the model's comfortable distance band.
  const spec = SPEAKER_MODELS[a.model];
  const dm = (dA + dB) / 2;
  if (dm < spec.idealMin) q *= Math.max(0.2, dm / spec.idealMin);
  if (dm > spec.idealMax) q *= Math.max(0.2, 1 - (dm - spec.idealMax) / 2);

  if (tvCenter) {
    const mid = v.lerp(a.pos, b.pos, 0.5);
    let axis = v.norm(v.perp(v.sub(b.pos, a.pos)));
    if (v.dot(axis, v.sub(p, mid)) < 0) axis = v.scale(axis, -1);
    const offAxis = Math.abs(v.cross(axis, v.sub(tvCenter, mid)));
    q *= Math.max(0.15, Math.min(1, 1 - Math.max(0, offAxis - 0.25) / 1.2));
  }
  return q;
}

/** Level uniformity + distance comfort for independent (mono) speakers. */
function soloQualityAt(solos: SpeakerObj[], p: Vec2, earZ: number, atten: Map<string, number>): number {
  const levels: number[] = [];
  let band = 0;
  let cap = 0;
  for (const sp of solos) {
    const d = Math.hypot(v.dist(sp.pos, p), sp.z - earZ);
    const capW = CAPABILITY[sp.model] ?? 1;
    // Quality-weighted level: a level-matched mini still sounds thinner, so
    // it must sit closer before the field treats its side as covered.
    levels.push(
      levelAtDb(sp, d) + 20 * Math.log10(Math.max(0.05, atten.get(sp.id) ?? 1)) + (capW - 1) * 8,
    );
    cap += capW;
    const spec = SPEAKER_MODELS[sp.model];
    band +=
      d < spec.idealMin
        ? Math.max(0.2, d / spec.idealMin)
        : d > spec.idealMax
          ? Math.max(0.2, 1 - (d - spec.idealMax) / 2)
          : 1;
  }
  band /= solos.length;
  cap /= solos.length;
  if (solos.length === 1) return band * cap;
  const spread = Math.max(...levels) - Math.min(...levels);
  return (Math.max(0, 1 - spread / 10) * 0.6 + band * 0.4) * (0.7 + 0.3 * cap);
}

/**
 * Grid-search the floorplan for the best place to listen from, given the
 * current speakers, their models/trims, pairing, and (in cinema mode) the TV.
 * Occlusion-aware: spots a speaker can't reach score nothing from it.
 */
export function bestListeningSpot(scene: Scene, tvAnchor: boolean, coarse = false): ListeningField {
  if (scene.speakers.length === 0) return EMPTY;
  const surfaces: Surface[] = collectSurfaces(scene.objects);
  const bounds = sceneBounds(scene);
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
  const step = Math.max(0.25, Math.min(0.7, span / (coarse ? 13 : 24)));
  const earZ = scene.listener.z;
  const tvRect = tvAnchor ? findTv(scene) : null;
  const tv = tvRect?.center ?? null;

  const walls = scene.objects.filter((o): o is WallObj => o.kind === 'wall');
  const byId = new Map(scene.speakers.map((s) => [s.id, s]));
  const pairs = scene.pairs
    .map(([a, b]) => [byId.get(a), byId.get(b)] as const)
    .filter((x): x is readonly [SpeakerObj, SpeakerObj] => Boolean(x[0] && x[1]));
  const pairedIds = new Set(scene.pairs.flat());
  const solos = scene.speakers.filter((s) => !pairedIds.has(s.id));

  let best: Vec2 | null = null;
  let bestScore = 0;
  const samples: Array<{ p: Vec2; s: number }> = [];

  for (let x = bounds.min.x + step / 2; x <= bounds.max.x; x += step) {
    for (let y = bounds.min.y + step / 2; y <= bounds.max.y; y += step) {
      const p = { x, y };
      if (insideFurnitureOrWall(scene, p)) continue;

      const atten = new Map<string, number>();
      let anyReached = false;
      let pairScore = 0;
      let validPairs = 0;
      for (const sp of scene.speakers) {
        const d = directPath(surfaces, sp.pos, sp.z, p, earZ);
        if (!d.blocked) {
          atten.set(sp.id, d.attenuation);
          anyReached = true;
          continue;
        }
        // No direct path — mono or paired, a clear first-order wall bounce
        // still carries sound there. Credit it as an equivalent (dimmer,
        // image-smeared) transmission instead of writing the cell off.
        const straight = Math.hypot(v.dist(sp.pos, p), sp.z - earZ);
        const cleanDb = levelAtDb(sp, Math.max(0.3, straight));
        const reflDb = bestReflectionDb(surfaces, walls, scene.objects, sp, p, earZ);
        const t =
          reflDb > -200 ? Math.min(1, Math.pow(10, (reflDb - cleanDb) / 20)) * 0.6 : 0;
        atten.set(sp.id, t);
        if (t > 0.03) anyReached = true;
      }
      if (!anyReached) continue;

      for (const [a, b] of pairs) {
        const attA = atten.get(a.id) ?? 0;
        const attB = atten.get(b.id) ?? 0;
        if (attA <= 0 || attB <= 0) continue; // occluded pair contributes nothing
        validPairs += 1;
        pairScore += pairQualityAt(a, b, p, earZ, tv) * Math.min(attA, attB);
      }
      const pairPart = validPairs > 0 ? pairScore / validPairs : 0;

      const reachableSolos = solos.filter((s) => (atten.get(s.id) ?? 0) > 0);
      const soloPart = reachableSolos.length > 0 ? soloQualityAt(reachableSolos, p, earZ, atten) : 0;

      let score: number;
      if (pairs.length > 0 && solos.length > 0) {
        score = pairPart * 0.7 + soloPart * 0.3;
      } else if (pairs.length > 0) {
        score = pairPart;
      } else {
        score = soloPart;
      }
      // Punish spots that some speakers can't reach at all.
      const reachRatio =
        [...atten.values()].filter((a) => a > 0).length / Math.max(1, scene.speakers.length);
      score *= 0.4 + 0.6 * reachRatio;

      // Cinema: the best seat must also be a good TV seat — line of sight to
      // the screen, inside its viewing cone, at a sane distance. Music mode
      // skips this entirely, so the two modes genuinely disagree.
      if (tvRect) {
        score *= 0.25 + 0.75 * tvViewQuality(surfaces, tvRect, p, earZ);
      }

      if (score <= 0.02) continue;
      samples.push({ p, s: score });
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }

  if (!best) return EMPTY;
  const zone = samples
    .filter((s) => s.s >= bestScore * 0.82)
    .sort((a, b) => b.s - a.s)
    .slice(0, 90);
  return { best, bestScore, zone };
}
