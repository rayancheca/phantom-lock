import { describe, expect, it } from 'vitest';
import { MAX_COMPARE, MIN_COMPARE, compareSummary, type SummaryEntry } from '../compare-summary';
import type { VerdictView } from '../../panels/verdict';

/**
 * S20 — the compare summary generalized from exactly two scenarios to N.
 *
 * It is PURE and node-tested for the same reason `verdict.ts` is: the sentence is
 * the one piece of compare that states a conclusion, and a conclusion computed
 * inside a component is a conclusion nobody can test at the boundaries.
 */

const V = (over: Partial<VerdictView> = {}): VerdictView => ({
  kind: 'pair',
  headline: 'No lock yet',
  state: 'searching',
  quality: 0.5,
  locked: false,
  cause: null,
  ...over,
});

const E = (label: string, v: Partial<VerdictView> = {}): SummaryEntry => ({
  label,
  verdict: V(v),
});

const locked = (label: string, quality = 1): SummaryEntry =>
  E(label, { locked: true, state: 'locked', headline: 'Phantom center locked', quality });
const noPair = (label: string): SummaryEntry =>
  E(label, { kind: 'no-pair', quality: 0, headline: 'No stereo pair' });
const noSpk = (label: string): SummaryEntry =>
  E(label, { kind: 'no-speakers', quality: 0, headline: 'No speakers' });

describe('compareSummary — the empty and degenerate cases', () => {
  it('says nothing useful is comparable when NO scenario has a pair', () => {
    for (const entries of [
      [noPair('A'), noPair('B')],
      [noSpk('A'), noSpk('B'), noSpk('C')],
      [noPair('A'), noSpk('B'), noPair('C'), noSpk('D')],
    ]) {
      expect(compareSummary(entries)).toMatch(/stereo pair/i);
    }
  });

  it('handles fewer than two entries without inventing a comparison', () => {
    expect(compareSummary([])).toMatch(/nothing/i);
    expect(compareSummary([locked('Only one')])).toMatch(/Only one/);
    // …and never claims a winner against nobody
    expect(compareSummary([locked('Only one')])).not.toMatch(/vs|than|closer/i);
  });
});

describe('compareSummary — locking', () => {
  it('reports ALL locking, naming the count rather than every label', () => {
    const s = compareSummary([locked('A'), locked('B'), locked('C')]);
    expect(s).toMatch(/all three/i);
  });

  it('says "both" for exactly two, not "all two"', () => {
    const s = compareSummary([locked('A'), locked('B')]);
    expect(s).toMatch(/both/i);
    expect(s).not.toMatch(/all two/i);
  });

  it('names the single locking scenario when exactly one locks', () => {
    const s = compareSummary([E('A', { quality: 0.4 }), locked('B'), E('C', { quality: 0.2 })]);
    expect(s).toContain('B');
    expect(s).toMatch(/only|alone/i);
  });

  it('names the count when SOME lock (more than one, not all)', () => {
    const s = compareSummary([locked('A'), locked('B'), E('C', { quality: 0.3 })]);
    expect(s).toMatch(/2 of 3|two of three/i);
  });

  it('a scenario with no pair is never counted as locking', () => {
    const s = compareSummary([locked('A'), noPair('B')]);
    expect(s).not.toMatch(/both/i);
    expect(s).toContain('A');
  });
});

describe('compareSummary — nothing locks, so quality decides', () => {
  it('names the closest scenario and its score', () => {
    const s = compareSummary([E('A', { quality: 0.31 }), E('B', { quality: 0.77 })]);
    expect(s).toContain('B');
    expect(s).toMatch(/77\s*%/);
  });

  it('calls a near-tie a tie rather than picking a meaningless winner', () => {
    const s = compareSummary([E('A', { quality: 0.5 }), E('B', { quality: 0.52 })]);
    expect(s).toMatch(/same|tie/i);
  });

  it('a tie across MANY entries is still a tie', () => {
    const s = compareSummary([E('A', { quality: 0.6 }), E('B', { quality: 0.61 }), E('C', { quality: 0.6 })]);
    expect(s).toMatch(/same|tie/i);
  });

  it('ignores pair-less scenarios when choosing the closest', () => {
    // B has no pair and quality 0; it must not be described as "closest".
    const s = compareSummary([E('A', { quality: 0.42 }), noPair('B')]);
    expect(s).toContain('A');
    expect(s).not.toMatch(/closest.*B/i);
  });

  it('is deterministic on an exact quality tie (first entry wins, no coin flip)', () => {
    const entries = [E('A', { quality: 0.4 }), E('B', { quality: 0.4 })];
    expect(compareSummary(entries)).toBe(compareSummary(entries));
  });
});

describe('compareSummary — properties that must hold for every N', () => {
  it('never throws, and always returns a non-empty sentence, for N = 0..MAX', () => {
    for (let n = 0; n <= MAX_COMPARE; n++) {
      const entries = Array.from({ length: n }, (_, i) =>
        i % 3 === 0 ? locked(`L${i}`) : i % 3 === 1 ? E(`Q${i}`, { quality: i / 20 }) : noPair(`N${i}`),
      );
      const s = compareSummary(entries);
      expect(typeof s).toBe('string');
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not enumerate every label once the list is long (it stays a sentence)', () => {
    const entries = Array.from({ length: MAX_COMPARE }, (_, i) => locked(`Scenario number ${i}`));
    const s = compareSummary(entries);
    expect(s.length).toBeLessThan(160);
  });

  it('derives "has a pair" from the verdict kind — there is no second source of truth', () => {
    // A kind:'pair' verdict that happens to be quality 0 still counts as comparable;
    // a kind:'no-pair' verdict never does, whatever its quality field says.
    const weird: SummaryEntry = { label: 'W', verdict: V({ kind: 'no-pair', quality: 0.9 }) };
    const s = compareSummary([E('A', { quality: 0.3 }), weird]);
    expect(s).toContain('A');
    expect(s).not.toContain('W');
  });
});

describe('the N bounds', () => {
  it('MIN is 2 (a comparison needs two things) and MAX is a real, small number', () => {
    expect(MIN_COMPARE).toBe(2);
    expect(MAX_COMPARE).toBeGreaterThanOrEqual(6);
    expect(MAX_COMPARE).toBeLessThanOrEqual(12);
  });
});
