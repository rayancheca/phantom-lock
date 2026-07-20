import { describe, expect, it } from 'vitest';
import type { PairMetrics } from '../../../engine/stereo';
import type { AudioMetrics } from '../../../engine/stereo';
import type { TraceResult } from '../../../engine/types';
import {
  blockedFor,
  causeSentence,
  deriveVerdict,
  initIgnition,
  representativePair,
  stepIgnition,
} from '../verdict';

/** Minimal PairMetrics — only the fields deriveVerdict / causeSentence read matter;
 *  the rest are filled with harmless defaults so the shape type-checks. */
function mkPair(over: Partial<PairMetrics>): PairMetrics {
  return {
    aId: 'a',
    bId: 'b',
    aLabel: 'A',
    bLabel: 'B',
    dA: 2,
    dB: 2,
    base: 2,
    pathDiff: 0,
    itdMs: 0,
    ildDb: 0,
    angleDeg: 60,
    eqError: 0,
    isEquilateral: true,
    combNotchHz: null,
    tv: null,
    losBlocked: false,
    modelMismatch: false,
    locked: false,
    quality: 0.5,
    apexBlocked: false,
    sweet: { x: 0, y: 0 },
    sweetRelocated: false,
    apex: { x: 0, y: 0 },
    degenerate: false,
    ...over,
  };
}

function mkAudio(pairs: PairMetrics[], solos: AudioMetrics['solos'] = []): AudioMetrics {
  return { pairs, solos, allLocked: pairs.length > 0 && pairs.every((p) => p.locked) };
}

const EMPTY_TRACE: TraceResult = { bySpeaker: [] };

/** A trace whose listed speaker ids are LOS-blocked (others resolve to undefined). */
function mkTrace(blockedIds: string[]): TraceResult {
  return {
    bySpeaker: blockedIds.map((id) => ({
      id,
      trace: { paths: [], arrivals: [] },
      direct: { distance: 2, distance3d: 2, blocked: true, attenuation: 1 },
    })),
  };
}

const soloFix = { id: 's', label: 'S', dist3d: 2, delayMs: 6, levelDb: 0, losBlocked: false };

describe('deriveVerdict — empty branches (guarded before any reduce)', () => {
  it('no pairs and no solos → "No speakers", searching, quality 0, no cause', () => {
    const v = deriveVerdict(mkAudio([]), EMPTY_TRACE, false);
    expect(v).toMatchObject({ kind: 'no-speakers', headline: 'No speakers', state: 'searching', quality: 0, locked: false, cause: null });
  });

  it('no pairs but solos present → "No stereo pair"', () => {
    const v = deriveVerdict(mkAudio([], [soloFix]), EMPTY_TRACE, false);
    expect(v).toMatchObject({ kind: 'no-pair', headline: 'No stereo pair', locked: false, cause: null });
  });
});

describe('deriveVerdict — single pair (the owner’s common case)', () => {
  it('a locked pair → "Phantom center locked", state locked, best quality, win cause', () => {
    const v = deriveVerdict(mkAudio([mkPair({ locked: true, quality: 0.98 })]), EMPTY_TRACE, false);
    expect(v.kind).toBe('pair');
    expect(v.headline).toBe('Phantom center locked');
    expect(v.state).toBe('locked');
    expect(v.locked).toBe(true);
    expect(v.quality).toBe(0.98);
    expect(v.cause).toContain('60° triangle'); // the win sentence
  });

  it('a close-but-not-locked pair (quality > 0.55) → "Almost there", close', () => {
    const v = deriveVerdict(mkAudio([mkPair({ locked: false, quality: 0.7, angleDeg: 60 })]), EMPTY_TRACE, false);
    expect(v.headline).toBe('Almost there');
    expect(v.state).toBe('close');
    expect(v.locked).toBe(false);
  });

  it('a searching pair (quality <= 0.55) → "No lock yet", searching', () => {
    const v = deriveVerdict(mkAudio([mkPair({ locked: false, quality: 0.4, angleDeg: 40 })]), EMPTY_TRACE, false);
    expect(v.headline).toBe('No lock yet');
    expect(v.state).toBe('searching');
  });

  it('the cause reads LOS-blocked from the trace, not from audio alone', () => {
    const v = deriveVerdict(mkAudio([mkPair({ locked: false, quality: 0.4, aId: 'a', aLabel: 'A' })]), mkTrace(['a']), false);
    expect(v.cause).toContain('A has no line of sight');
  });
});

describe('deriveVerdict — two pairs (four pods) stay coherent', () => {
  it('quality is tied to the BEST pair (a 90% meter under a not-locked headline)', () => {
    const v = deriveVerdict(mkAudio([mkPair({ aId: 'a', quality: 0.9, locked: false }), mkPair({ aId: 'c', quality: 0.4, locked: false })]), EMPTY_TRACE, false);
    expect(v.quality).toBe(0.9);
    expect(v.locked).toBe(false);
    expect(v.headline).toBe('Almost there'); // 0.9 > CLOSE_QUALITY
  });

  it('one pair locks, another does not → the explaining headline, locked=false, best quality', () => {
    const locked = mkPair({ aId: 'a', bLabel: 'B', locked: true, quality: 0.95 });
    const unlocked = mkPair({ aId: 'c', aLabel: 'C', bLabel: 'D', locked: false, quality: 0.3, angleDeg: 40, isEquilateral: false });
    const v = deriveVerdict(mkAudio([locked, unlocked]), EMPTY_TRACE, false);
    expect(v.headline).toBe('One pair locks, another doesn’t');
    expect(v.locked).toBe(false);
    expect(v.quality).toBe(0.95);
    // Cause must describe the FAILING pair, never a triumphant win sentence.
    expect(v.cause).not.toContain('60° triangle');
    expect(v.cause).toContain('40°');
  });

  it('both pairs locked → "Phantom center locked", locked=true', () => {
    const v = deriveVerdict(mkAudio([mkPair({ aId: 'a', locked: true, quality: 0.97 }), mkPair({ aId: 'c', locked: true, quality: 0.99 })]), EMPTY_TRACE, false);
    expect(v.headline).toBe('Phantom center locked');
    expect(v.locked).toBe(true);
    expect(v.state).toBe('locked');
  });

  it('a locked pair that is NOT the highest-quality still surfaces "One pair locks, another doesn’t"', () => {
    // locked and quality are uncorrelated: an apex-blocked pair can lock yet score
    // below a livelier unlocked pair. Gating on best.locked (the old bug) would have
    // said "Almost there"; gating on "any locked" reports the lock correctly.
    const lockedLowQ = mkPair({ aId: 'a', aLabel: 'A', bLabel: 'B', locked: true, quality: 0.43 });
    const unlockedHighQ = mkPair({ aId: 'c', aLabel: 'C', bLabel: 'D', locked: false, quality: 0.72, angleDeg: 50, isEquilateral: false });
    const v = deriveVerdict(mkAudio([lockedLowQ, unlockedHighQ]), EMPTY_TRACE, false);
    expect(v.headline).toBe('One pair locks, another doesn’t');
    expect(v.locked).toBe(false); // not all locked
    expect(v.quality).toBe(0.72); // still the BEST pair's quality
    expect(v.cause).not.toContain('60° triangle'); // names the failing pair, not a win
  });
});

describe('representativePair — the cause is tied to a coherent pair', () => {
  it('single pair → that pair', () => {
    const p = mkPair({ quality: 0.5 });
    expect(representativePair(mkAudio([p]))).toBe(p);
  });

  it('none locked → the best (meter) pair', () => {
    const best = mkPair({ aId: 'a', quality: 0.9, locked: false });
    const worse = mkPair({ aId: 'c', quality: 0.4, locked: false });
    expect(representativePair(mkAudio([best, worse]))).toBe(best);
  });

  it('best locked but not all → the failing pair (never the triumphant one)', () => {
    const best = mkPair({ aId: 'a', quality: 0.95, locked: true });
    const failing = mkPair({ aId: 'c', quality: 0.3, locked: false });
    expect(representativePair(mkAudio([best, failing]))).toBe(failing);
  });

  it('some locked but the BEST pair is the unlocked one → the failing (unlocked) pair', () => {
    const lockedLowQ = mkPair({ aId: 'a', quality: 0.43, locked: true });
    const unlockedHighQ = mkPair({ aId: 'c', quality: 0.72, locked: false });
    expect(representativePair(mkAudio([lockedLowQ, unlockedHighQ]))).toBe(unlockedHighQ);
  });

  it('empty → null', () => {
    expect(representativePair(mkAudio([]))).toBeNull();
  });
});

describe('causeSentence — moved verbatim, still branches correctly', () => {
  it('model mismatch takes priority', () => {
    expect(causeSentence(mkPair({ modelMismatch: true }), false, false, false)).toContain('different models');
  });
  it('both blocked', () => {
    expect(causeSentence(mkPair({}), true, true, false)).toContain('Neither speaker can see your ears');
  });
  it('locked + tv anchored names the TV', () => {
    expect(causeSentence(mkPair({ locked: true, tv: { offAxis: 0, aligned: true } }), false, false, true)).toContain('dead-center on the TV');
  });
});

describe('blockedFor — LOS lookup from the trace', () => {
  it('returns true for a blocked speaker, undefined for an absent one', () => {
    expect(blockedFor(mkTrace(['a']), 'a')).toBe(true);
    expect(blockedFor(mkTrace(['a']), 'z')).toBeUndefined();
  });
});

describe('initIgnition / stepIgnition — THE LOCK edge detector (pure)', () => {
  it('seeds prevLocked to the current value with token 0', () => {
    expect(initIgnition(false)).toEqual({ prevLocked: false, token: 0 });
    expect(initIgnition(true)).toEqual({ prevLocked: true, token: 0 });
  });

  it('CRITICAL: mounting an already-locked scene is NOT an edge (no spurious ignite)', () => {
    expect(stepIgnition(initIgnition(true), true).token).toBe(0);
  });

  it('a false→true rising edge bumps the token', () => {
    expect(stepIgnition({ prevLocked: false, token: 0 }, true).token).toBe(1);
  });

  it('holding locked=true does not re-fire (drag frames)', () => {
    expect(stepIgnition({ prevLocked: true, token: 1 }, true).token).toBe(1);
  });

  it('a true→false falling edge leaves the token unchanged', () => {
    expect(stepIgnition({ prevLocked: true, token: 1 }, false).token).toBe(1);
  });

  it('StrictMode double-invoke with the same value never double-bumps', () => {
    const once = stepIgnition({ prevLocked: false, token: 0 }, true); // edge → token 1
    const twice = stepIgnition(once, true); // same value → no bump
    expect(once.token).toBe(1);
    expect(twice.token).toBe(1);
  });

  it('a lock / unlock / re-lock sequence accumulates two ignitions', () => {
    let s = initIgnition(false);
    for (const locked of [false, true, false, true]) s = stepIgnition(s, locked);
    expect(s.token).toBe(2);
  });
});
