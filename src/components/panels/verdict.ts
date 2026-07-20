import type { TraceResult } from '../../engine/types';
import { CLOSE_QUALITY, type AudioMetrics, type PairMetrics } from '../../engine/stereo';

/**
 * The SINGLE source of truth for the stereo readout (UX-3 / S15).
 *
 * Before this module the verdict was derived in TWO places — `verdictOf` in
 * ScenarioCompare and the inline `state`/`causeSentence` in MetricsPanel's
 * PairSection — and they drifted (the `.compare-verdict` bug UX-3 fixes). Both
 * the pinned sidebar `VerdictHero` and the compare column now consume the SAME
 * `deriveVerdict`, so they can never diverge again.
 *
 * Pure + DOM-free (mirrors keyboard.ts / mode.ts / font-ready.ts): zero React,
 * zero engine writes — `stereo.ts` stays a read-only input. Node-testable.
 */

export type VerdictState = 'locked' | 'close' | 'searching';

/** The complete view-model the hero renders. Everything is derivable from
 *  (audio, trace, tvAnchor); the seat NAME is the one thing that is not, so it
 *  stays a separate hero prop. */
export interface VerdictView {
  /** Distinguishes the two empty branches (for teaching copy) from a real pair. */
  kind: 'no-speakers' | 'no-pair' | 'pair';
  /** The three canonical headlines + the multi-pair / empty supersets. */
  headline: string;
  state: VerdictState;
  /** 0..1, the BEST pair's quality (0 when there is no pair). */
  quality: number;
  /** `audio.allLocked` — every pair locked. Drives THE LOCK ignition. */
  locked: boolean;
  /** One plain-English sentence naming the dominant problem (or the win). Null in
   *  the empty branches so the hero can show teaching copy instead of an empty line. */
  cause: string | null;
}

/** LOS-blocked flag for a speaker id, read from the trace (undefined when absent).
 *  Extracted verbatim from the old MetricsPanel lookup so the hero and any
 *  per-pair detail resolve blocked-ness identically. */
export function blockedFor(trace: TraceResult, id: string): boolean | undefined {
  return trace.bySpeaker.find((s) => s.id === id)?.direct.blocked;
}

/** One plain-English sentence naming the dominant problem (or the win).
 *  MOVED VERBATIM out of MetricsPanel (was module-private there); this is now the
 *  single definition, imported by both `deriveVerdict` and the multi-pair
 *  per-pair PairSection detail. */
export function causeSentence(
  pair: PairMetrics,
  blockedA: boolean | undefined,
  blockedB: boolean | undefined,
  tvAnchor: boolean,
): string {
  if (pair.modelMismatch) {
    return 'These two are different models — Apple won’t stereo-pair a HomePod with a mini. Unpair or swap one.';
  }
  if (blockedA && blockedB) return 'Neither speaker can see your ears — only reflections arrive. Clear the paths first.';
  if (blockedA) return `${pair.aLabel} has no line of sight to your ears — move it, or lower whatever blocks it.`;
  if (blockedB) return `${pair.bLabel} has no line of sight to your ears — move it, or lower whatever blocks it.`;

  if (pair.locked) {
    return tvAnchor && pair.tv
      ? 'Equal paths, a 60° triangle, and the image lands dead-center on the TV.'
      : 'Equal paths and a 60° triangle — the phantom center sits right where it should.';
  }

  const nearer = pair.dA < pair.dB ? pair.aLabel : pair.bLabel;
  const farther = pair.dA < pair.dB ? pair.bLabel : pair.aLabel;
  if (pair.itdMs > 0.3) {
    return `The image pulls hard toward ${nearer} — its sound arrives ${pair.itdMs.toFixed(2)} ms earlier. Pull ${nearer} back or bring ${farther} closer.`;
  }
  if (tvAnchor && pair.tv && !pair.tv.aligned) {
    return `The phantom center misses the TV by ${(pair.tv.offAxis * 100).toFixed(0)} cm — slide the pair (or the TV) until they share an axis.`;
  }
  if (Math.abs(pair.angleDeg - 60) > 15) {
    return pair.angleDeg < 60
      ? `The pair only subtends ${pair.angleDeg.toFixed(0)}° at your head — widen it toward 60° for a real stereo stage.`
      : `The pair subtends ${pair.angleDeg.toFixed(0)}° — that’s wider than the 60° reference; pull the speakers together or sit farther back.`;
  }
  if (pair.itdMs > 0.1) {
    return `${nearer} arrives ${pair.itdMs.toFixed(2)} ms early — a few centimetres of nudging will centre the image.`;
  }
  if (Math.abs(pair.ildDb) > 1.5) {
    const louder = pair.ildDb > 0 ? pair.aLabel : pair.bLabel;
    return `${louder} is ${Math.abs(pair.ildDb).toFixed(1)} dB louder at your seat — Match volumes fixes the level (timing is separate).`;
  }
  return 'Close — nudge a speaker or your seat a few centimetres and watch the meters.';
}

/** The pair whose cause sentence coherently explains the aggregate readout:
 *  - allLocked (or a single pair): the BEST (meter) pair — its win sentence is true;
 *  - some (but not all) pairs locked: the lowest-quality UNLOCKED pair — the one
 *    that actually needs work — so the cause agrees with the "One pair locks,
 *    another doesn’t" headline. This is gated on "any pair locked", NOT on the best
 *    pair being locked: `locked` and `quality` are not correlated (an apex-blocked
 *    pair can lock yet score below a livelier unlocked pair, stereo.ts), so the best
 *    pair can be the unlocked one while another is genuinely locked;
 *  - nothing locked: the BEST pair, whose near-miss the meter and headline describe. */
export function representativePair(audio: AudioMetrics): PairMetrics | null {
  if (audio.pairs.length === 0) return null;
  const best = audio.pairs.reduce((a, b) => (b.quality > a.quality ? b : a));
  if (audio.allLocked) return best;
  if (audio.pairs.some((p) => p.locked)) {
    const unlocked = audio.pairs.filter((p) => !p.locked); // non-empty when !allLocked
    return unlocked.reduce((a, b) => (b.quality < a.quality ? b : a));
  }
  return best;
}

/** THE single aggregate verdict for VerdictHero (sidebar + compare). Reproduces
 *  the former ScenarioCompare `verdictOf` EXACTLY for {headline,state,quality,
 *  locked} — so compare has zero regression — and ADDS `kind` + a coherent
 *  `cause`. Guards empty pairs FIRST (a `reduce` on `[]` would throw). */
export function deriveVerdict(audio: AudioMetrics, trace: TraceResult, tvAnchor: boolean): VerdictView {
  if (audio.pairs.length === 0) {
    const hasSolos = audio.solos.length > 0;
    return {
      kind: hasSolos ? 'no-pair' : 'no-speakers',
      headline: hasSolos ? 'No stereo pair' : 'No speakers',
      state: 'searching',
      quality: 0,
      locked: false,
      cause: null,
    };
  }
  const best = audio.pairs.reduce((a, b) => (b.quality > a.quality ? b : a));
  const quality = best.quality;
  const locked = audio.allLocked;
  const state: VerdictState = locked ? 'locked' : quality > CLOSE_QUALITY ? 'close' : 'searching';
  // Gate the "one pair locks" headline on ANY pair being locked, not on the best
  // pair — a locked pair can score below an unlocked one (apex-blocked), so
  // best.locked would silently drop the "another doesn’t" case.
  const someLocked = audio.pairs.some((p) => p.locked);
  const headline = locked
    ? 'Phantom center locked'
    : someLocked
      ? 'One pair locks, another doesn’t'
      : quality > CLOSE_QUALITY
        ? 'Almost there'
        : 'No lock yet';
  const rep = representativePair(audio)!; // non-null: pairs.length > 0
  const cause = causeSentence(rep, blockedFor(trace, rep.aId), blockedFor(trace, rep.bId), tvAnchor);
  return { kind: 'pair', headline, state, quality, locked, cause };
}

// ---- THE LOCK edge detection (pure reducer) --------------------------------

export interface IgnitionState {
  /** The last observed lock value. */
  prevLocked: boolean;
  /** Monotonic; bumped ONLY on a false→true edge. Used as a React remount key. */
  token: number;
}

/** Seed with the CURRENT lock so first mount is never an edge — no spurious
 *  ignite when an already-locked scene loads, TUNE is entered, or a compare
 *  column initialises locked. */
export function initIgnition(locked: boolean): IgnitionState {
  return { prevLocked: locked, token: 0 };
}

/** Advance. Bumps `token` iff this is a rising edge (false→true). Idempotent for a
 *  repeated value → StrictMode double-invoke and drag-frame re-renders with an
 *  unchanged `locked` never re-fire. */
export function stepIgnition(state: IgnitionState, locked: boolean): IgnitionState {
  const edge = locked && !state.prevLocked;
  return { prevLocked: locked, token: edge ? state.token + 1 : state.token };
}
