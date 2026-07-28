/**
 * The tour's scene transforms — and the ONE test that proves the session's
 * headline acceptance bullet: a first-timer is walked to a LOCK.
 *
 * This drives the REAL engine (traceScene -> computeAudio), not a stub, so the
 * tour's promise cannot silently rot when the acoustics change. It is the same
 * discipline as `seed.test.ts`, which asserts the seeded demo still locks.
 */
import { describe, expect, it } from 'vitest';
import { traceScene } from '../../../engine/raytrace';
import { computeAudio } from '../../../engine/stereo';
import { DEFAULT_SETTINGS } from '../../../engine/scene';
import { apartmentScene } from '../../../engine/scene';
import { PRACTICE_LAYOUT_NAME, breakLock, pairFirstTwo, placeTwoPods, practiceScene } from '../actions';
import type { Scene } from '../../../engine/types';

const lockedIn = (scene: Scene): boolean => {
  const trace = traceScene(scene, DEFAULT_SETTINGS);
  return computeAudio(scene, trace, DEFAULT_SETTINGS.tvAnchor).pairs.some((p) => p.locked);
};

describe('tutorial actions', () => {
  it('the practice room is a real, walled room', () => {
    const s = practiceScene();
    expect(s.objects.some((o) => o.kind === 'wall')).toBe(true);
    expect(s.speakers).toHaveLength(0);
    expect(s.pairs).toHaveLength(0);
  });

  it('places exactly two unpaired HomePods', () => {
    const { scene, ids } = placeTwoPods(practiceScene());
    expect(scene.speakers).toHaveLength(2);
    expect(ids).toHaveLength(2);
    expect(scene.pairs).toHaveLength(0); // still nothing to lock
    expect(scene.speakers.every((s) => s.model === 'homepod')).toBe(true);
  });

  // ---- THE ACCEPTANCE PROOF ------------------------------------------------

  it('is NOT locked before the user pairs (so the ignition has an edge to fire on)', () => {
    const { scene } = placeTwoPods(practiceScene());
    expect(lockedIn(scene)).toBe(false);
  });

  it('IS locked immediately after pairing — the tour reaches the lock', () => {
    const { scene } = placeTwoPods(practiceScene());
    const paired = pairFirstTwo(scene);
    expect(lockedIn(paired)).toBe(true);
  });

  it('the pairing transition is a genuine false -> true edge in one scene', () => {
    // This is what makes VerdictHero ignite: same layout, same seat, no remount,
    // `locked` flipping false -> true. Mount is never an edge (S15), so a tour
    // that merely lands on an already-locked scene shows no celebration at all.
    const { scene } = placeTwoPods(practiceScene());
    const before = lockedIn(scene);
    const after = lockedIn(pairFirstTwo(scene));
    expect([before, after]).toEqual([false, true]);
    // ...and the seat did not move, so the hero's key is unchanged.
    expect(pairFirstTwo(scene).listener.pos).toEqual(scene.listener.pos);
  });

  it('the lock is comfortable, not marginal — it must survive engine drift', () => {
    const paired = pairFirstTwo(placeTwoPods(practiceScene()).scene);
    const trace = traceScene(paired, DEFAULT_SETTINGS);
    const pair = computeAudio(paired, trace, DEFAULT_SETTINGS.tvAnchor).pairs[0];
    expect(pair.locked).toBe(true);
    // Measured at 0.997 with a clean 60-degree triangle and no apex blockage.
    expect(pair.quality).toBeGreaterThan(0.9);
    expect(pair.apexBlocked).toBe(false);
    expect(pair.angleDeg).toBeCloseTo(60, 1);
  });

  it('WHY a practice room and not the demo apartment: the apartment does not lock', () => {
    // A negative control for the design decision in steps.ts. The furnished
    // apartment blocks the apex, so the same two-pods-and-pair recipe fails
    // there. If this ever starts passing, the practice room is no longer needed
    // and the comment in steps.ts is stale.
    const { scene } = placeTwoPods(apartmentScene());
    expect(lockedIn(pairFirstTwo(scene))).toBe(false);
  });

  it('breakLock actually drops the lock on the first press', () => {
    // The rescue for "break it on purpose". It must work immediately — a user
    // pressing "Show me" and seeing nothing change is worse than no rescue.
    const paired = pairFirstTwo(placeTwoPods(practiceScene()).scene);
    expect(lockedIn(paired)).toBe(true);
    expect(lockedIn(breakLock(paired))).toBe(false);
  });

  it('breakLock keeps both speakers and the pair intact — it moves, never deletes', () => {
    const paired = pairFirstTwo(placeTwoPods(practiceScene()).scene);
    const broken = breakLock(paired);
    expect(broken.speakers).toHaveLength(2);
    expect(broken.pairs).toEqual(paired.pairs);
    // Only the second speaker moved; the first is a fixed visual reference.
    expect(broken.speakers[0].pos).toEqual(paired.speakers[0].pos);
    expect(broken.speakers[1].pos).not.toEqual(paired.speakers[1].pos);
  });

  it('breakLock is a no-op below two speakers', () => {
    expect(breakLock(practiceScene()).speakers).toHaveLength(0);
  });

  // ---- purity + safety ------------------------------------------------------

  it('never mutates the scene it is given', () => {
    const base = practiceScene();
    const snapshot = JSON.stringify(base);
    const { scene } = placeTwoPods(base);
    pairFirstTwo(scene);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('pairFirstTwo is a no-op on a scene without two speakers', () => {
    const s = practiceScene();
    expect(pairFirstTwo(s).pairs).toHaveLength(0);
    const one = placeTwoPods(s).scene;
    const single: Scene = { ...one, speakers: [one.speakers[0]] };
    expect(pairFirstTwo(single).pairs).toHaveLength(0);
  });

  it('placing pods twice does not silently stack four speakers', () => {
    // The runner performs `show` actions on step entry; a re-render or a
    // back-then-forward must not double-apply.
    const once = placeTwoPods(practiceScene()).scene;
    const twice = placeTwoPods(once).scene;
    expect(twice.speakers).toHaveLength(2);
  });

  it('names the practice layout distinctly so it is obvious what to delete', () => {
    expect(PRACTICE_LAYOUT_NAME).toMatch(/tutorial/i);
  });
});
