import { describe, expect, it } from 'vitest';
import { computePair } from '../stereo';
import type { Scene, SpeakerObj, Vec2 } from '../types';

const SQRT3 = Math.sqrt(3);

const spk = (id: string, x: number, y: number, z = 1.2): SpeakerObj => ({
  id,
  pos: { x, y },
  z,
  label: id.toUpperCase(),
  model: 'homepod',
  trimDb: 0,
});

function makeScene(listener: Vec2, tvCenter: Vec2 | null, speakers: SpeakerObj[]): Scene {
  const objects = tvCenter
    ? [
        {
          id: 'tv',
          kind: 'rect' as const,
          center: tvCenter,
          w: 1.2,
          h: 0.2,
          rotation: 0,
          absorption: 0.05,
          label: 'TV',
          role: 'tv' as const,
          height: 1.5,
        },
      ]
    : [];
  return { objects, speakers, pairs: [], listener: { pos: listener, z: 1.2 } };
}

describe('computePair', () => {
  it('locks a perfect equilateral triangle with a centred TV', () => {
    const a = spk('a', 0, 0);
    const b = spk('b', 2, 0);
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, { x: 1, y: -0.2 }, [a, b]), a, b, false);
    expect(m.isEquilateral).toBe(true);
    expect(m.locked).toBe(true);
    expect(m.itdMs).toBeCloseTo(0, 5);
    expect(m.angleDeg).toBeCloseTo(60, 1);
    expect(m.combNotchHz).toBeNull();
    expect(m.apex.x).toBeCloseTo(1);
    expect(m.apex.y).toBeCloseTo(SQRT3);
  });

  it('does not lock when the listener sits off-centre', () => {
    const a = spk('a', 0, 0);
    const b = spk('b', 2, 0);
    const m = computePair(makeScene({ x: 0.5, y: 1 }, { x: 1, y: -0.2 }, [a, b]), a, b, false);
    expect(m.locked).toBe(false);
    expect(m.dA).toBeLessThan(m.dB);
    expect(m.itdMs).toBeGreaterThan(0.1);
    expect(m.ildDb).toBeGreaterThan(0); // A is nearer → louder
    expect(m.combNotchHz).not.toBeNull();
  });

  it('does not lock when the TV is far off the centre axis', () => {
    const a = spk('a', 0, 0);
    const b = spk('b', 2, 0);
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, { x: 2.2, y: -0.2 }, [a, b]), a, b, false);
    expect(m.isEquilateral).toBe(true);
    expect(m.tv?.aligned).toBe(false);
    expect(m.locked).toBe(false);
  });

  it('locks on the triangle alone when there is no TV', () => {
    const a = spk('a', 0, 0);
    const b = spk('b', 2, 0);
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, null, [a, b]), a, b, false);
    expect(m.tv).toBeNull();
    expect(m.locked).toBe(true);
  });

  it('never locks with an occluded line of sight, even when equilateral', () => {
    const a = spk('a', 0, 0);
    const b = spk('b', 2, 0);
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, null, [a, b]), a, b, true);
    expect(m.isEquilateral).toBe(true);
    expect(m.locked).toBe(false);
    expect(m.quality).toBeLessThanOrEqual(0.5);
  });

  it('treats a collapsed pair as degenerate, never locked', () => {
    const a = spk('a', 1, 0);
    const b = spk('b', 1.1, 0);
    const m = computePair(makeScene({ x: 1, y: 2 }, null, [a, b]), a, b, false);
    expect(m.degenerate).toBe(true);
    expect(m.locked).toBe(false);
  });

  it('uses true 3D distances: speaker height counts', () => {
    const a = spk('a', 0, 0, 2.2); // 1 m above the 1.2 m ears
    const b = spk('b', 2, 0, 1.2);
    const m = computePair(makeScene({ x: 1, y: 1 }, null, [a, b]), a, b, false);
    const floorDist = Math.hypot(1, 1);
    expect(m.dB).toBeCloseTo(floorDist);
    expect(m.dA).toBeCloseTo(Math.hypot(floorDist, 1));
    expect(m.dA).toBeGreaterThan(m.dB);
  });

  it('computes the comb-filter notch from the path mismatch', () => {
    // dA = 1, dB = 2 → Δ = 1 m → notch at 343 / 2 = 171.5 Hz.
    const a = spk('a', 0, 1);
    const b = spk('b', 0, -2);
    const m = computePair(makeScene({ x: 0, y: 0 }, null, [a, b]), a, b, false);
    expect(m.pathDiff).toBeCloseTo(1);
    expect(m.combNotchHz).toBeCloseTo(171.5);
  });

  it('never locks a HomePod + mini pair (Apple restriction) and folds trims into balance', () => {
    const a = spk('a', 0, 0);
    const b = { ...spk('b', 2, 0), model: 'homepod-mini' as const };
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, null, [a, b]), a, b, false);
    expect(m.modelMismatch).toBe(true);
    expect(m.locked).toBe(false);
    // Equal distances, but the mini is ~6 dB quieter → A louder by 6.
    expect(m.ildDb).toBeCloseTo(6, 1);
    // Trimming A by −6 dB balances the pair (but can't fix the lock).
    const aTrimmed = { ...a, trimDb: -6 };
    const m2 = computePair(makeScene({ x: 1, y: SQRT3 }, null, [aTrimmed, b]), aTrimmed, b, false);
    expect(m2.ildDb).toBeCloseTo(0, 1);
  });
});

// S3 — the equilateral/lock test must live in ONE metric space. The triangle
// shape (apex, subtended angle, base) is a floor-plan (2D) construction, so
// eqError/isEquilateral must be 2D too — a common height on BOTH speakers
// cancels in the arrival time and must not read as triangle asymmetry. But a
// plan-symmetric pair at DIFFERENT heights hides a real ITD, so `locked` must
// additionally require near-equal 3D arrival (a false lock is worse than a
// false "almost there").
describe('computePair — plan vs 3D lock consistency (S3)', () => {
  it('locks a plan-equilateral pair even when both speakers are elevated', () => {
    // Both speakers 1 m above the 1.2 m ears; still a perfect floor triangle.
    const a = spk('a', 0, 0, 2.2);
    const b = spk('b', 2, 0, 2.2);
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, null, [a, b]), a, b, false);
    expect(m.itdMs).toBeCloseTo(0, 5); // equal 3D distance → perfectly centred
    expect(m.isEquilateral).toBe(true); // was false: mixed 2D base + 3D legs → eqError ~0.11
    expect(m.locked).toBe(true);
  });

  it('refuses to lock a plan-symmetric pair whose heights differ (ITD guard)', () => {
    // Equal FLOOR distance to the seat, but very different heights → big ITD.
    const a = spk('a', 0, 0, 1.2);
    const b = spk('b', 2, 0, 2.5);
    const m = computePair(makeScene({ x: 1, y: SQRT3 }, null, [a, b]), a, b, false);
    expect(m.isEquilateral).toBe(true); // the floor triangle IS equilateral…
    expect(m.pathDiff).toBeGreaterThan(0.3); // …but the 3D arrival is skewed…
    expect(m.itdMs).toBeGreaterThan(1);
    expect(m.locked).toBe(false); // …so it must NOT lock (a naive 2D-only fix would)
    // …and the quality meter must reflect that, not read a near-full "almost
    // there" bar (the arrival mismatch caps quality, not just the lock flag).
    expect(m.quality).toBeLessThan(0.5);
  });
});
