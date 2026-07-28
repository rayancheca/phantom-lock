/**
 * The compare summary, generalized from exactly two scenarios to N — S20.
 *
 * Pure and node-tested, for the same reason `panels/verdict.ts` is: this sentence
 * is the one place compare states a CONCLUSION, and a conclusion computed inside a
 * component is a conclusion nobody can test at the boundaries. The 2-up version
 * lived in a `useMemo` inside `ScenarioCompare` and had four hand-written branches
 * that do not generalize (`l`/`r`, "both", "A locks; B does not").
 *
 * It reads ONLY the shared `VerdictView` — the same view-model `VerdictHero`
 * renders — so the sentence and the columns can never disagree. In particular
 * "does this scenario have a pair at all" is DERIVED from `verdict.kind`, never
 * passed in: `deriveVerdict` already makes `kind === 'pair'` exactly equivalent to
 * "there is a pair", and accepting it as a field would be a second source of truth
 * that can desync.
 */
import type { VerdictView } from '../panels/verdict';

/** A comparison needs two things. */
export const MIN_COMPARE = 2;
/**
 * The most columns the UI will show at once.
 *
 * This is a LEGIBILITY bound, not a CPU control, and it is important not to
 * mis-sell it. Measured per column (`docs/sessions/S20/bench/`), a column is
 * 0.03 ms on the seeded demo but ~58 ms on a 30-room house with four apex-blocked
 * pairs and ~10.9 s on an adversarial import-legal payload — so no value of N is
 * "safe" by arithmetic, and a cap small enough to bound the slow cases would fire
 * on every ordinary one. The CPU answer is the slow-column gate in
 * `ScenarioCompare` (measure the first column; stop auto-computing the rest when
 * it is slow), not this number.
 *
 * 8 is chosen because it comfortably exceeds every real use — the seeded
 * workspace has 6 designs, and the app caps a scene at 32 seats — while keeping
 * the horizontally-scrolled track and its ~8-10 tab stops per column navigable.
 */
export const MAX_COMPARE = 8;

export interface SummaryEntry {
  /** How the user sees this column named, e.g. "Maple Court · Couch". */
  label: string;
  verdict: VerdictView;
}

const pct = (q: number): string => `${Math.round(q * 100)}%`;

/** Quality difference below which two scenarios are called the same, not ranked. */
const TIE_BAND = 0.04;

const COUNT_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const countWord = (n: number): string => COUNT_WORD[n] ?? String(n);

/**
 * One sentence describing how N scenarios compare.
 *
 * Reproduces the 2-up wording where it still applies ("Both lock…", "X locks; Y
 * does not", "they score about the same", "Closer to a lock: …") so the two-column
 * case reads exactly as it did, and generalizes the rest by COUNT rather than by
 * enumerating labels — eight names in one sentence is not a summary.
 */
export function compareSummary(entries: SummaryEntry[], notMeasured = 0): string {
  if (entries.length === 0) {
    return notMeasured > 0
      ? `${notMeasured} column${notMeasured === 1 ? '' : 's'} not measured yet.`
      : 'Nothing to compare yet.';
  }
  return `${sentence(entries)}${trailer(notMeasured)}`;
}

/**
 * A conclusion must not silently cover less than what is on screen. When the
 * slow-column gate has deferred some columns, "All three lock — every one is
 * cinema-ready" is a true statement about three entries and a FALSE impression
 * about the eight the user is looking at.
 */
function trailer(notMeasured: number): string {
  if (notMeasured <= 0) return '';
  return ` (${notMeasured} more column${notMeasured === 1 ? '' : 's'} not measured yet.)`;
}

function sentence(entries: SummaryEntry[]): string {

  // "Has a pair" is the verdict's own kind — no second source of truth.
  const comparable = entries.filter((e) => e.verdict.kind === 'pair');
  if (comparable.length === 0) {
    return entries.length === 1
      ? `${entries[0].label} has no stereo pair to measure yet.`
      : 'None of these has a stereo pair to compare yet.';
  }

  const lockedOnes = comparable.filter((e) => e.verdict.locked);
  const n = comparable.length;

  if (entries.length === 1 || n === 1) {
    const only = comparable[0];
    return only.verdict.locked
      ? `${only.label} locks — cinema-ready.`
      : `${only.label} is at ${pct(only.verdict.quality)} of a lock.`;
  }

  if (lockedOnes.length === n) {
    return n === 2
      ? `Both lock — ${comparable[0].label} and ${comparable[1].label} are cinema-ready.`
      : `All ${countWord(n)} lock — every one is cinema-ready.`;
  }

  if (lockedOnes.length === 1) {
    const win = lockedOnes[0];
    return n === 2
      ? `${win.label} locks; ${comparable.find((e) => e !== win)!.label} does not.`
      : `${win.label} is the only one that locks.`;
  }

  if (lockedOnes.length > 1) {
    return `${lockedOnes.length} of ${n} lock — including ${lockedOnes[0].label}.`;
  }

  // Nothing locks: rank by quality, but refuse to name a winner inside the tie band.
  // `reduce` keeps the FIRST entry on an exact tie, so the sentence is deterministic.
  const best = comparable.reduce((a, b) => (b.verdict.quality > a.verdict.quality ? b : a));
  const worst = comparable.reduce((a, b) => (b.verdict.quality < a.verdict.quality ? b : a));
  if (best.verdict.quality - worst.verdict.quality < TIE_BAND) {
    return `None locks yet — they all score about the same (${pct(best.verdict.quality)}).`;
  }
  return `Closer to a lock: ${best.label} (${pct(best.verdict.quality)} vs ${pct(worst.verdict.quality)}).`;
}
