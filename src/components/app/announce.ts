import type { VerdictView } from '../panels/verdict';
import type { AppMode } from './mode';

/**
 * The off-screen text mirror of scene state + the verdict (S7 / deliverable 2).
 *
 * `VerdictHero` is deliberately NOT a live region — it recomputes on every drag
 * frame and would flood a screen reader. This module produces a SETTLED,
 * debounced sentence instead, reusing `deriveVerdict`'s own prose so there is
 * still exactly one definition of the readout (verdict.ts stays byte-unchanged;
 * the speech-only unit expansion lives here).
 *
 * Pure + DOM-free, so the settle behaviour is unit-testable with an injected
 * clock rather than fake timers (the repo has none, and keeps none).
 */

export interface AnnounceInput {
  appMode: AppMode;
  seatName: string;
  seatCount: number;
  speakerCount: number;
  wallCount: number;
  /** Non-wall objects. */
  objectCount: number;
  areaCount: number;
  showBestSpot: boolean;
  bestSpotFound: boolean;
  /** Null in DESIGN — building a room should not narrate acoustics. */
  verdict: VerdictView | null;
}

/** Expand the symbols the UI shows into words a screen reader says correctly.
 *  Applied ONLY on the mirror path, so `verdict.ts` stays byte-unchanged. */
export function speakableUnits(s: string): string {
  return s
    .replace(/(\d)\s*ms\b/g, '$1 milliseconds')
    .replace(/(\d)\s*dB\b/g, '$1 decibels')
    .replace(/(\d)\s*°/g, '$1 degrees')
    .replace(/(\d)\s*cm\b/g, '$1 centimetres')
    .replace(/(\d)\s*m\b/g, '$1 metres');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The stable inventory: what is in the room. Changes rarely, so it is only
 *  spoken when it actually changes (see `announcementFor`). */
export function sceneSentence(i: AnnounceInput): string {
  const counts = [
    plural(i.wallCount, 'wall'),
    plural(i.objectCount, 'object'),
    plural(i.areaCount, 'area'),
    plural(i.speakerCount, 'speaker'),
    plural(i.seatCount, 'listening spot'),
  ].join(', ');
  // Omit the clause entirely when the overlay is off: `bestSpot` is null both
  // when the overlay is disabled AND when no spot was found, and reporting
  // "not found" for the former would be false.
  const best = !i.showBestSpot
    ? ''
    : i.bestSpotFound
      ? ' Best listening spot found.'
      : ' No best listening spot found.';
  return `${counts}.${best}`;
}

/** The readout: what the room SOUNDS like at this seat. Empty in DESIGN. */
export function verdictSentence(i: AnnounceInput): string {
  const v = i.verdict;
  if (!v) return '';
  // Leading with the seat name is load-bearing: switching to a different
  // already-locked seat then announces "Bed: phantom center locked", which
  // cannot be misheard as a lock the user just achieved (the S15 lesson,
  // applied to prose rather than to an animation).
  const lead = `${i.seatName}: `;
  if (v.kind === 'no-speakers') return `${lead}no speakers yet. Place a stereo pair to get a verdict.`;
  if (v.kind === 'no-pair') return `${lead}no stereo pair. Pair two matching speakers to get a verdict.`;
  // Quality is quantised to 5% so ordinary sub-perceptual jitter does not churn
  // the sentence (and therefore the settle window) on every frame.
  const q = Math.round(v.quality * 20) * 5;
  const cause = v.cause ? ` ${speakableUnits(v.cause)}` : '';
  // Headline VERBATIM, not lower-cased: what is spoken should match what the
  // VerdictHero shows, so a sighted helper and a screen-reader user are
  // describing the same words.
  return `${lead}${v.headline}.${cause} Quality ${q} percent.`;
}

/** Did anything about the room's INVENTORY change? (Verdict changes don't count.) */
export function countsChanged(a: AnnounceInput, b: AnnounceInput): boolean {
  return (
    a.wallCount !== b.wallCount ||
    a.objectCount !== b.objectCount ||
    a.areaCount !== b.areaCount ||
    a.speakerCount !== b.speakerCount ||
    a.seatCount !== b.seatCount ||
    a.showBestSpot !== b.showBestSpot ||
    a.bestSpotFound !== b.bestSpotFound
  );
}

/**
 * The full announcement.
 *
 * The inventory clause is included ONLY on the first announcement or when a
 * count actually changed. Without that, every deliberate arrow-nudge — which is
 * spaced SLOWER than the settle window, so the debounce does not suppress it —
 * would re-read the entire ~45-word inventory inside an `aria-atomic` region.
 */
export function announcementFor(i: AnnounceInput, prev: AnnounceInput | null): string {
  const verdict = verdictSentence(i);
  const includeScene = prev === null || countsChanged(i, prev);
  const scene = includeScene ? sceneSentence(i) : '';
  return [verdict, scene].filter(Boolean).join(' ').trim();
}

// --- the settle reducer -----------------------------------------------------

export interface SettleState {
  /** The last value actually spoken. */
  announced: string;
  /** The value waiting out its quiet window, if any. */
  pending: string | null;
  /** When `pending` was first seen (injected clock, ms). */
  pendingSince: number;
}

/** Seed with the CURRENT value so mount is never an announcement — the exact
 *  analogue of `initIgnition` in verdict.ts. */
export function initSettle(current: string): SettleState {
  return { announced: current, pending: null, pendingSince: 0 };
}

/**
 * Advance the reducer. `announce` is non-null on exactly the tick a value has
 * been stable for `quietMs`.
 *
 * Two properties matter and are tested:
 *  - a value that returns to the already-announced one cancels (A -> B -> A is
 *    silent), so a nudge-and-undo does not speak;
 *  - a DIFFERENT value arriving mid-window restarts the window, so a drag emits
 *    once after it stops rather than once per intermediate state.
 */
export function stepSettle(
  state: SettleState,
  next: string,
  now: number,
  quietMs: number,
): { state: SettleState; announce: string | null } {
  if (next === state.announced) {
    // Includes the net-zero round trip: drop anything pending.
    return { state: { ...state, pending: null, pendingSince: 0 }, announce: null };
  }
  if (state.pending !== next) {
    return { state: { ...state, pending: next, pendingSince: now }, announce: null };
  }
  if (now - state.pendingSince >= quietMs) {
    return { state: { announced: next, pending: null, pendingSince: 0 }, announce: next };
  }
  return { state, announce: null };
}
