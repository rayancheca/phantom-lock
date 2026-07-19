import type { RectObj, Scene, SpeakerObj, TraceResult, Vec2 } from './types';
import { collectSurfaces, directPath, SPEED_OF_SOUND } from './raytrace';
import { bestPairSpot } from './pairspot';
import { canPair, dist3dTo, levelAtDb } from './speakers';
import * as v from './vec';

/** Max spread between the three triangle sides, as a fraction of the mean. */
export const EQ_TOLERANCE = 0.05;
/** Pair quality at/above which the verdict reads "Almost there" instead of "No lock yet". */
export const CLOSE_QUALITY = 0.55;
/** Max distance (m) of the TV from the perpendicular bisector of the pair base. */
export const TV_AXIS_TOLERANCE = 0.25;
/** Max 3D path mismatch (m) that still counts as a centred arrival for a lock.
 *  0.07 m ≈ 0.2 ms ITD — well below the ~0.6 ms where the phantom visibly pulls
 *  toward the nearer speaker. Guards against a plan-equilateral pair at very
 *  different heights (equal floor distance, unequal 3D path) false-locking. */
export const ITD_LOCK_TOLERANCE_M = 0.07;
/** Below this base width the "pair" is effectively a point source. */
const MIN_BASE = 0.5;

export interface PairMetrics {
  aId: string;
  bId: string;
  aLabel: string;
  bLabel: string;
  /** 3D distances (floor distance + height difference) speaker → ear. */
  dA: number;
  dB: number;
  base: number;
  pathDiff: number;
  /**
   * Inter-channel time difference at the listener. A stereo pair plays
   * correlated content, so any path mismatch delays one channel and drags
   * the phantom image toward the earlier (nearer) speaker.
   */
  itdMs: number;
  /** Level advantage of the nearer speaker, dB. Positive → A louder. */
  ildDb: number;
  /** Angle subtended by the pair at the listener. 60° = equilateral ideal. */
  angleDeg: number;
  /** Spread of the three sides / mean. 0 = perfect equilateral. */
  eqError: number;
  isEquilateral: boolean;
  /** First comb-filter notch caused by the A/B path mismatch, Hz. Null when aligned. */
  combNotchHz: number | null;
  /** TV alignment with the pair's centre axis. Null when the scene has no TV. */
  tv: { offAxis: number; aligned: boolean } | null;
  /** True when either speaker's direct path to the listener is occluded. */
  losBlocked: boolean;
  /** True when the two speakers are different models — Apple won't pair them. */
  modelMismatch: boolean;
  /** Equilateral + TV on axis + clear line of sight → phantom centre locked. */
  locked: boolean;
  /** 0..1 how close to lock — drives the UI meter. */
  quality: number;
  /** True when a wall stands between a speaker and the geometric sweet spot. */
  apexBlocked: boolean;
  /** Where to actually sit: the geometric apex when it's reachable, else the
   *  best real spot found by the wall-aware (reflections included) search. */
  sweet: Vec2;
  sweetRelocated: boolean;
  /** Ideal listener position (floor plan) for the current pair base. */
  apex: Vec2;
  degenerate: boolean;
}

export interface SoloMetrics {
  id: string;
  label: string;
  dist3d: number;
  delayMs: number;
  /** Level at the listener, dB (relative scale, includes model + trim). */
  levelDb: number;
  losBlocked: boolean;
}

export interface AudioMetrics {
  pairs: PairMetrics[];
  solos: SoloMetrics[];
  /** True when at least one pair exists and every pair is locked. */
  allLocked: boolean;
}

export function findTv(scene: Scene): RectObj | null {
  for (const o of scene.objects) {
    if (o.kind === 'rect' && o.role === 'tv') return o;
  }
  return null;
}

export function computePair(
  scene: Scene,
  a: SpeakerObj,
  b: SpeakerObj,
  losBlocked: boolean,
  useTv = true,
): PairMetrics {
  const P = scene.listener;

  const dA = dist3dTo(a, P);
  const dB = dist3dTo(b, P);
  const base = v.dist(a.pos, b.pos);
  const pathDiff = Math.abs(dA - dB);
  const itdMs = (pathDiff / SPEED_OF_SOUND) * 1000;
  // Level difference includes model output and manual trim — trim can fix
  // the balance, but never the arrival-time offset.
  const ildDb = levelAtDb(a, dA) - levelAtDb(b, dB);

  const toA = v.norm(v.sub(a.pos, P.pos));
  const toB = v.norm(v.sub(b.pos, P.pos));
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, v.dot(toA, toB)))) * 180) / Math.PI;

  const degenerate = base < MIN_BASE || dA < 0.2 || dB < 0.2;

  // The stereo triangle is a FLOOR-PLAN construction — apex, subtended angle,
  // and base are all 2D — so its equilateral test must use 2D plan distances
  // too, in ONE consistent metric space. A height shared by both speakers
  // cancels in the arrival time (ITD) and must not read as triangle asymmetry.
  const planA = v.dist(a.pos, P.pos);
  const planB = v.dist(b.pos, P.pos);
  const mean = (planA + planB + base) / 3;
  const spread = Math.max(planA, planB, base) - Math.min(planA, planB, base);
  const eqError = mean > 1e-6 ? spread / mean : 1;
  const isEquilateral = !degenerate && eqError <= EQ_TOLERANCE;

  const combNotchHz = pathDiff > 0.01 && pathDiff < 3 ? SPEED_OF_SOUND / (2 * pathDiff) : null;

  // Centre axis: perpendicular bisector of the pair base, pointing at the listener.
  const mid = v.lerp(a.pos, b.pos, 0.5);
  let axis = v.norm(v.perp(v.sub(b.pos, a.pos)));
  if (v.dot(axis, v.sub(P.pos, mid)) < 0) axis = v.scale(axis, -1);
  const apex = v.add(mid, v.scale(axis, (base * Math.sqrt(3)) / 2));

  const tvObj = useTv ? findTv(scene) : null;
  let tv: PairMetrics['tv'] = null;
  if (tvObj) {
    const offAxis = Math.abs(v.cross(axis, v.sub(tvObj.center, mid)));
    tv = { offAxis, aligned: offAxis <= TV_AXIS_TOLERANCE };
  }

  const modelMismatch = !canPair(a, b);
  // A plan-equilateral triangle can still hide a real arrival-time mismatch
  // when the speakers sit at very different heights; require near-equal 3D
  // arrival so a false lock never slips through (worse than "almost there").
  const arrivalSymmetric = pathDiff <= ITD_LOCK_TOLERANCE_M;
  const locked =
    isEquilateral && arrivalSymmetric && (tv === null || tv.aligned) && !losBlocked && !modelMismatch;

  // The geometric sweet spot is only real if both speakers can actually
  // reach it — a wall in between makes the triangle meaningless.
  const surfaces = collectSurfaces(scene.objects);
  const apexBlocked =
    !degenerate &&
    (directPath(surfaces, a.pos, a.z, apex, P.z).blocked ||
      directPath(surfaces, b.pos, b.z, apex, P.z).blocked);

  // When walls make the geometric apex fictional, relocate the sweet spot to
  // the best physically reachable seat (direct sound first, wall bounces
  // discounted) instead of pointing at a place sound can't image.
  let sweet = apex;
  let sweetRelocated = false;
  if (apexBlocked) {
    const found = bestPairSpot(scene, surfaces, a, b, P.z, tvObj?.center ?? null);
    if (found) {
      sweet = found.p;
      sweetRelocated = true;
    }
  }

  const triQ = degenerate ? 0 : Math.max(0, Math.min(1, 1 - eqError / 0.18));
  const tvQ = tv
    ? Math.max(0, Math.min(1, 1 - Math.max(0, tv.offAxis - TV_AXIS_TOLERANCE) / 0.9))
    : 1;
  // The 3D arrival mismatch caps the quality meter too, so the verdict never
  // shows a near-full "almost there" bar for a pair the lock gate just refused
  // on ITD (a plan-equilateral pair whose speakers sit at very different heights).
  const itdQ = Math.max(0, 1 - Math.max(0, pathDiff - ITD_LOCK_TOLERANCE_M) / 0.2);
  const quality =
    losBlocked || modelMismatch
      ? Math.min(0.5, triQ)
      : triQ * (0.7 + 0.3 * tvQ) * (apexBlocked ? 0.6 : 1) * itdQ;

  return {
    aId: a.id,
    bId: b.id,
    aLabel: a.label,
    bLabel: b.label,
    dA,
    dB,
    base,
    pathDiff,
    itdMs,
    ildDb,
    angleDeg,
    eqError,
    isEquilateral,
    combNotchHz,
    tv,
    losBlocked,
    modelMismatch,
    locked,
    quality,
    apexBlocked,
    sweet,
    sweetRelocated,
    apex,
    degenerate,
  };
}

export function computeAudio(scene: Scene, trace: TraceResult, tvAnchor = true): AudioMetrics {
  const blockedById = new Map(trace.bySpeaker.map((s) => [s.id, s.direct.blocked]));
  const byId = new Map(scene.speakers.map((s) => [s.id, s]));
  const pairedIds = new Set<string>();

  const pairs: PairMetrics[] = [];
  for (const [idA, idB] of scene.pairs) {
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (!a || !b) continue;
    pairedIds.add(idA);
    pairedIds.add(idB);
    const losBlocked = Boolean(blockedById.get(idA) || blockedById.get(idB));
    pairs.push(computePair(scene, a, b, losBlocked, tvAnchor));
  }

  const solos: SoloMetrics[] = scene.speakers
    .filter((s) => !pairedIds.has(s.id))
    .map((s) => {
      const d = dist3dTo(s, scene.listener);
      return {
        id: s.id,
        label: s.label,
        dist3d: d,
        delayMs: (d / SPEED_OF_SOUND) * 1000,
        levelDb: levelAtDb(s, d),
        losBlocked: Boolean(blockedById.get(s.id)),
      };
    });

  return {
    pairs,
    solos,
    allLocked: pairs.length > 0 && pairs.every((p) => p.locked),
  };
}
