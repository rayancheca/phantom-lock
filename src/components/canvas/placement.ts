import type { Scene, SceneObject, SpeakerModel, Vec2 } from '../../engine/types';
import { activeListener, createId, makeSpeaker } from '../../engine/scene';
import { pointInRect } from '../../engine/geometry';
import * as v from '../../engine/vec';
import { makeOpening } from './interaction';

/**
 * Placement primitives shared by the POINTER and KEYBOARD paths (S7).
 *
 * Before this module, appending a speaker lived only inside `SimCanvas`'s
 * `onPointerDown`, so there was no way to place one without a mouse. Extracting
 * it means both paths call ONE definition — the furniture z-snap can never be
 * dropped from one of them — and the logic becomes node-testable.
 *
 * Pure + DOM-free: no `view`, no React, no canvas. Reads only the scene.
 */

/** The 5 cm design grid. Single definition — SimCanvas imports this rather than
 *  declaring its own copy (it previously had one, used at two more sites). */
export const SNAP_STEP = 0.05;

/** How far from the seat a keyboard-placed pod lands, metres. */
const PLACE_RADIUS_M = 1.5;
/** Half of the 60-degree reference triangle: the first two pods land at ±30°. */
const HALF_STAGE_RAD = (30 * Math.PI) / 180;
/** Golden angle. Used from the third pod onward so no finite number of presses
 *  ever lands two pods on the same point (a plain 60° step collides at 7). */
const GOLDEN_RAD = Math.PI * (3 - Math.sqrt(5));

export function snapPoint(p: Vec2, snapOn: boolean): Vec2 {
  if (!snapOn) return p;
  return {
    x: Math.round(p.x / SNAP_STEP) * SNAP_STEP,
    y: Math.round(p.y / SNAP_STEP) * SNAP_STEP,
  };
}

/**
 * If `p` lands on furniture, a speaker standing there sits on TOP of it.
 * Moved verbatim out of `SimCanvas` (it was a closure over `sceneRef` but read
 * only `scene.objects`, so it was always pure).
 */
export function surfaceHeightAt(scene: Scene, p: Vec2): number | null {
  let best: number | null = null;
  for (const o of scene.objects) {
    if (o.kind === 'wall') continue;
    if (o.kind === 'rect' && (o.role === 'door' || o.role === 'window')) continue;
    const inside =
      o.kind === 'rect' ? pointInRect(p, o) : o.kind === 'circle' ? v.dist(p, o.center) <= o.r : false;
    // Standing surfaces only — nobody perches a speaker on a wardrobe.
    if (inside && o.height <= 1.6 && (best === null || o.height > best)) best = o.height;
  }
  return best;
}

/**
 * Where a keyboard-placed speaker lands.
 *
 * Anchored on the ACTIVE SEAT rather than the view centre: the seat is the
 * semantic origin of every metric in the app, it is always meaningful, and it is
 * pure (the view lives inside SimCanvas and could not be read from a node test).
 *
 * The first two pods land at ±30° in FRONT of the seat — a real 60° reference
 * triangle — so two presses of `p` plus the Speakers card's one-click "Pair as
 * stereo" yields a pair that can actually lock. That matters: the payoff of the
 * whole app is the lock, and a keyboard user who can only produce an
 * un-lockable layout has not really been given the feature. From the third pod
 * on it walks the golden angle, which never repeats.
 */
export function keyboardPlacementPoint(scene: Scene): Vec2 {
  const seat = activeListener(scene).pos;
  const n = scene.speakers.length;
  // -90° is straight "up"/in front on the canvas (+y points down).
  const forward = -Math.PI / 2;
  const angle =
    n === 0 ? forward - HALF_STAGE_RAD
    : n === 1 ? forward + HALF_STAGE_RAD
    : forward + HALF_STAGE_RAD + GOLDEN_RAD * (n - 1);
  return {
    x: seat.x + Math.cos(angle) * PLACE_RADIUS_M,
    y: seat.y + Math.sin(angle) * PLACE_RADIUS_M,
  };
}

/**
 * THE single speaker-placement primitive: snap, stand it on any furniture
 * underneath, append. Returns the new scene plus the new id so the caller can
 * select what it just created.
 */
export function placeSpeakerAt(
  scene: Scene,
  p: Vec2,
  model: SpeakerModel,
  snapOn: boolean,
): { scene: Scene; speakerId: string } {
  const speaker = makeSpeaker(snapPoint(p, snapOn), scene, model);
  const surf = surfaceHeightAt(scene, speaker.pos);
  if (surf !== null) speaker.z = Math.round((surf + 0.12) * 100) / 100;
  return {
    scene: { ...scene, speakers: [...scene.speakers, speaker] },
    speakerId: speaker.id,
  };
}

/**
 * Insert a door or window at the MIDPOINT of a wall — the keyboard equivalent of
 * the hover chips, which are unreachable without a pointer (they are set inside
 * the rAF-throttled pointermove path). Returns null when the target is not a wall.
 */
export function openingOnWall(
  scene: Scene,
  wallId: string,
  role: 'door' | 'window',
): { scene: Scene; objectId: string } | null {
  const target = scene.objects.find((o) => o.id === wallId);
  if (!target || target.kind !== 'wall') return null;
  const at: Vec2 = { x: (target.a.x + target.b.x) / 2, y: (target.a.y + target.b.y) / 2 };
  const opening: SceneObject = makeOpening(target, at, role, createId(role));
  return {
    scene: { ...scene, objects: [...scene.objects, opening] },
    objectId: opening.id,
  };
}
