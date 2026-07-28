/**
 * The tour's scene transforms (S21) — pure, so the tutorial's central promise
 * ("you will be walked to a lock") is provable in a node test against the REAL
 * engine rather than asserted in a comment.
 *
 * These COMPOSE existing primitives and add no acoustics of their own. That is
 * deliberate: the frozen engine set is off-limits, and a tour that computed its
 * own idea of "locked" would be a second implementation destined to drift from
 * the verdict the user is actually reading.
 *
 * Why a practice room rather than the bundled apartment: `keyboardPlacementPoint`
 * puts the first two pods at exactly +/-30 degrees, which locks at quality 0.997
 * in a clean rectangular room — and does NOT lock in the furnished Maple Court
 * demo, where furniture blocks the apex (measured 0.5, `apexBlocked: true`).
 * `actions.test.ts` keeps a negative control on exactly that, so if the apartment
 * ever starts locking, the reason this module exists is re-examined rather than
 * quietly forgotten.
 */
import type { Scene } from '../../engine/types';
import { rectRoomScene, DEFAULT_SETTINGS } from '../../engine/scene';
import { keyboardPlacementPoint, placeSpeakerAt } from '../canvas/placement';

/** Shown in the layout switcher and the gallery — must read as disposable. */
export const PRACTICE_LAYOUT_NAME = 'Tutorial practice room';

/** Metres. Big enough that a +/-30 degree pair fits with clear sightlines. */
const PRACTICE_W = 5;
const PRACTICE_H = 4;

/**
 * A clean, walled, empty room. Walls matter: `initialMode` opens a scene that has
 * them in TUNE, which is where the tour needs to be, and an unwalled scene would
 * also give the ray tracer nothing to reflect off.
 */
export function practiceScene(): Scene {
  return rectRoomScene(PRACTICE_W, PRACTICE_H);
}

/**
 * Drop two UNPAIRED HomePods at the reference positions.
 *
 * Idempotent by design — the runner performs `show` actions on step entry, and a
 * re-render or a back-then-forward must not stack four speakers. When the scene
 * already has two or more, this returns it untouched with the first two ids.
 */
export function placeTwoPods(scene: Scene): { scene: Scene; ids: string[] } {
  if (scene.speakers.length >= 2) {
    return { scene, ids: scene.speakers.slice(0, 2).map((s) => s.id) };
  }
  let next = scene;
  const ids: string[] = [];
  while (next.speakers.length < 2) {
    const placed = placeSpeakerAt(next, keyboardPlacementPoint(next), 'homepod', DEFAULT_SETTINGS.snap);
    next = placed.scene;
    ids.push(placed.speakerId);
  }
  return { scene: next, ids };
}

/**
 * Link the first two speakers as a stereo pair — the tour's "Show me" rescue for
 * the pairing step, and the exact transition the ignition fires on.
 *
 * A no-op when there are not two speakers, so a rescue pressed on an unexpected
 * scene cannot produce a dangling pair id (which `sanitizeScene` would then have
 * to repair on the next load).
 */
export function pairFirstTwo(scene: Scene): Scene {
  if (scene.speakers.length < 2) return scene;
  const [a, b] = scene.speakers;
  if (scene.pairs.some((p) => p.includes(a.id) || p.includes(b.id))) return scene;
  return { ...scene, pairs: [...scene.pairs, [a.id, b.id]] };
}

/** Remove every speaker and pair — re-arms the pairing demo from a clean slate. */
export function clearSpeakers(scene: Scene): Scene {
  return { ...scene, speakers: [], pairs: [] };
}

/**
 * How far to shove a speaker to guarantee the lock drops.
 *
 * The lock basin is only 3-5 cells of the 0.05 m snap grid wide, so 0.30 m is far
 * outside it with room to spare — measured quality 0.000 at that offset. It is
 * intentionally not the minimum: the rescue must work on the FIRST press, and a
 * value tuned to the edge of the basin would become marginal the moment the
 * acoustics are touched. `actions.test.ts` asserts the outcome, not the number.
 */
const BREAK_OFFSET_M = 0.3;

/**
 * Move one speaker far enough to drop the lock — the "Show me" rescue for the
 * "break it on purpose" step, so a user who cannot drag (or is on a keyboard)
 * still gets to see the readout react.
 *
 * Moves the SECOND speaker so the first stays put as a visual reference. A no-op
 * on a scene with fewer than two.
 */
export function breakLock(scene: Scene): Scene {
  if (scene.speakers.length < 2) return scene;
  const target = scene.speakers[1];
  return {
    ...scene,
    speakers: scene.speakers.map((s) =>
      s.id === target.id ? { ...s, pos: { x: s.pos.x + BREAK_OFFSET_M, y: s.pos.y } } : s,
    ),
  };
}
