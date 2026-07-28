/**
 * Stage 5: give the design a stereo pair that actually LOCKS.
 *
 * The rule is: return a pair only when the real engine has already confirmed it
 * locks, otherwise return nothing. Never a placed-but-unlocked pair.
 *
 * That is not fastidiousness, it is what the UI can express. `VerdictHero`'s
 * ignition is a false->true EDGE and mount is never an edge (S15), so a design
 * that opens *almost* locked shows a static "Almost there" and offers the user
 * nothing the app makes discoverable. A design that opens locked shows the
 * payoff on first paint — the same argument `seed.ts` won for first run — and a
 * design with no speakers lands on `TuneToolsCard`'s existing empty state,
 * which already says "Nothing to analyze yet" and routes to Suggest.
 *
 * A formula is not enough, hence the LADDER. Two measured facts force it:
 *
 *   - furniture does NOT defeat the lock. A +/-30 degree pair at r = 1.2 m in a
 *     FURNISHED 8x7 room locks at quality 1.00. What defeated it in the earlier
 *     reading was `tv.offAxis = 3.04 m` against `TV_AXIS_TOLERANCE` 0.25 —
 *     aiming the pair's heading at the TV fixes both modes;
 *   - a small office cannot fit a +/-30 pair plus wall clearance at any
 *     comfortable radius, so the radius list has to reach down to 0.65 m before
 *     giving up.
 */

import type { Scene, SpeakerObj, Vec2 } from '../types';
import { DEFAULT_SPEAKER_Z, makeSpeaker } from '../scene';
import { traceScene } from '../raytrace';
import { computeAudio } from '../stereo';
import type { Cell } from './tile';

/**
 * Radii tried, in preference order. 1.2 m first (a comfortable near-field
 * triangle); the 0.65 m floor exists because a 4 x 3.5 office cannot clear the
 * walls at anything larger.
 */
const PAIR_RADII = [1.2, 1.1, 1.0, 0.9, 1.4, 0.8, 0.7, 1.6, 0.65, 1.8] as const;
/** With no TV the heading is free, so sweep it. With a TV it is forced. */
const HEADINGS_NO_TV = 16;
/** +/-30 degrees — a real 60-degree equilateral triangle with the seat. */
const HALF_ANGLE = Math.PI / 6;
/** How far a speaker must stay from anything solid. */
const CLEARANCE = 0.3;

function insideCell(p: Vec2, cell: Cell, margin: number): boolean {
  return (
    p.x >= cell.x + margin &&
    p.x <= cell.x + cell.w - margin &&
    p.y >= cell.y + margin &&
    p.y <= cell.y + cell.h - margin
  );
}

/** Squared distance from p to segment ab. */
function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Cheap, pure clearance test — run before paying for a full trace. */
function pointFree(scene: Scene, p: Vec2, cell: Cell): boolean {
  if (!insideCell(p, cell, CLEARANCE)) return false;
  for (const o of scene.objects) {
    if (o.kind === 'wall') {
      if (distToSeg(p, o.a, o.b) < CLEARANCE) return false;
    } else if (o.kind === 'circle') {
      if (Math.hypot(p.x - o.center.x, p.y - o.center.y) < o.r + CLEARANCE) return false;
    } else if (o.role !== 'door' && o.role !== 'window') {
      // Axis-aligned bound is enough for a reject-early test; the engine has
      // the last word.
      const r = Math.max(o.w, o.h) / 2 + CLEARANCE;
      if (Math.abs(p.x - o.center.x) < r && Math.abs(p.y - o.center.y) < r) return false;
    }
  }
  return true;
}

export interface PairResult {
  speakers: SpeakerObj[];
  pairs: Array<[string, string]>;
  locked: boolean;
}

const EMPTY: PairResult = { speakers: [], pairs: [], locked: false };

/**
 * Search for a verified-locking pair around `seat` inside `cell`.
 *
 * `tvAt` forces the heading when the design has a TV, because `stereo.ts` gates
 * cinema mode on the pair's axis passing within `TV_AXIS_TOLERANCE` of it.
 */
export function findLockingPair(
  scene: Scene,
  seat: Vec2,
  cell: Cell,
  tvAt: Vec2 | null,
  tvAnchor: boolean,
): PairResult {
  // With a TV the heading is nearly forced — `stereo.ts` gates cinema mode on
  // the pair's axis passing within `TV_AXIS_TOLERANCE` (0.25 m) of it — so the
  // TV direction is tried FIRST at every radius. It is not tried EXCLUSIVELY,
  // because in a small furnished room the TV direction is often the one
  // direction with no clearance, and a swept alternative that still locks beats
  // shipping no speakers at all. Measured over 480 designs: sweeping as a
  // fallback took the lock rate from 81 % to 87 %, at 3.1 -> 3.9 ms per design.
  const sweep = Array.from({ length: HEADINGS_NO_TV }, (_, i) => (i * 2 * Math.PI) / HEADINGS_NO_TV);
  const headings: number[] = tvAt ? [Math.atan2(tvAt.y - seat.y, tvAt.x - seat.x), ...sweep] : sweep;

  for (const radius of PAIR_RADII) {
    for (const heading of headings) {
      const left: Vec2 = {
        x: seat.x + radius * Math.cos(heading - HALF_ANGLE),
        y: seat.y + radius * Math.sin(heading - HALF_ANGLE),
      };
      const right: Vec2 = {
        x: seat.x + radius * Math.cos(heading + HALF_ANGLE),
        y: seat.y + radius * Math.sin(heading + HALF_ANGLE),
      };
      if (!pointFree(scene, left, cell) || !pointFree(scene, right, cell)) continue;

      const a = makeSpeaker(left, scene);
      const b = makeSpeaker({ ...right }, { ...scene, speakers: [a] });
      a.z = DEFAULT_SPEAKER_Z;
      b.z = DEFAULT_SPEAKER_Z;
      const candidate: Scene = {
        ...scene,
        speakers: [a, b],
        pairs: [[a.id, b.id]],
      };
      // The ONLY acceptance test is the real engine's own verdict. Anything
      // else would be a second implementation of `locked` that could drift.
      const trace = traceScene(candidate, VERIFY_RAYS, VERIFY_BOUNCES);
      const audio = computeAudio(candidate, trace, tvAnchor);
      if (audio.pairs[0]?.locked) {
        return { speakers: [a, b], pairs: [[a.id, b.id]], locked: true };
      }
    }
  }
  return EMPTY;
}

/**
 * Trace settings for the verification pass only.
 *
 * Deliberately coarse. `computeAudio` reads the trace ONLY through
 * `direct.blocked`, and `traceScene` builds `direct` with an independent
 * `directPath` that takes neither the ray count nor the bounce limit — so the
 * ray fan cannot change a single lock verdict, and paying for 360 rays per
 * candidate would buy nothing. (The same structural fact S20 used to make a
 * compare column cheap.)
 */
const VERIFY_RAYS = 32;
const VERIFY_BOUNCES = 1;
