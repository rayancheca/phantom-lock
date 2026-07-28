import { describe, expect, it } from 'vitest';
import {
  SLOW_COLUMN_MS,
  forgetColumn,
  initGate,
  isSlow,
  observeCost,
  shouldCompute,
  type GateState,
} from '../column-gate';

/**
 * S20 — the slow-column gate, driven as a state machine.
 *
 * The bug this file exists to prevent: the first version derived its threshold
 * from the LIVE set of computed results, and a deferred column removed its own
 * measurement from that set. The gate therefore re-opened, the column recomputed,
 * and it alternated forever — burning more CPU than no gate at all, and on a heavy
 * scene wedging the tab (React unmounts the tree at the nested-update limit, and
 * this app has no error boundary).
 *
 * So the test that matters is not "does it defer a slow column" but "does it
 * CONVERGE". Every case below runs the loop to a fixed point and asserts one.
 */

/** Run the real component loop: N columns, each with a known cost, until the
 *  compute-set stops changing (or we declare it non-convergent). */
function settle(costs: number[], maxSteps = 40): { steps: number; computed: boolean[] } {
  let state: GateState = initGate();
  const revealed = new Set<number>();
  let prev = '';
  for (let step = 1; step <= maxSteps; step++) {
    const computed = costs.map((_, i) => shouldCompute(state, i, revealed.has(i)));
    // Every column that computes reports its cost; a deferred one reports nothing.
    for (const [i, on] of computed.entries()) {
      if (on) state = observeCost(state, `c${i}`, costs[i]);
    }
    const key = computed.join('');
    if (key === prev) return { steps: step, computed };
    prev = key;
  }
  return { steps: Infinity, computed: costs.map(() => false) };
}

const CHEAP = 0.02;
const SLOW = 200;

describe('the gate CONVERGES — the oscillation that made it worse than nothing', () => {
  it('settles when the slow column is NOT the first (the case that used to loop forever)', () => {
    const { steps, computed } = settle([CHEAP, SLOW]);
    expect(steps).toBeLessThan(5);
    expect(computed[0]).toBe(true); // column 0 always computes
    expect(computed[1]).toBe(false); // …and the expensive one stays deferred
  });

  it('settles when the slow column IS the first', () => {
    const { steps, computed } = settle([SLOW, CHEAP, CHEAP]);
    expect(steps).toBeLessThan(5);
    expect(computed[0]).toBe(true);
    expect(computed.slice(1)).toEqual([false, false]);
  });

  it('settles with every column cheap — nothing is ever deferred', () => {
    const { steps, computed } = settle([CHEAP, CHEAP, CHEAP, CHEAP]);
    expect(steps).toBeLessThan(5);
    expect(computed).toEqual([true, true, true, true]);
  });

  it('settles with every column slow', () => {
    const { steps, computed } = settle([SLOW, SLOW, SLOW]);
    expect(steps).toBeLessThan(5);
    expect(computed).toEqual([true, false, false]);
  });

  it('settles for every mix of cheap and slow up to eight columns', () => {
    // Exhaustive over the shapes the UI can produce, so no arrangement loops.
    for (let mask = 0; mask < 1 << 6; mask++) {
      const costs = Array.from({ length: 6 }, (_, i) => ((mask >> i) & 1 ? SLOW : CHEAP));
      expect(settle(costs).steps).toBeLessThan(5);
    }
  });
});

describe('the water mark is monotonic — evidence is never un-learned', () => {
  it('never lowers, whatever order the costs arrive in', () => {
    let s = initGate();
    for (const ms of [5, 300, 1, 0.02, 250, 0]) s = observeCost(s, 'c0', ms);
    expect(s.worstMs).toBe(300);
    expect(isSlow(s)).toBe(true);
  });

  it('returns the SAME object when nothing moved, so React can bail out', () => {
    const s = observeCost(initGate(), 'c0', 50);
    expect(observeCost(s, 'c1', 50)).toBe(s);
    expect(observeCost(s, 'c1', 10)).toBe(s);
    expect(observeCost(s, 'c1', NaN)).toBe(s);
    expect(observeCost(s, 'c1', Infinity)).toBe(s);
  });

  it('opens exactly at the documented threshold, not around it', () => {
    expect(isSlow(observeCost(initGate(), 'c0', SLOW_COLUMN_MS))).toBe(false);
    expect(isSlow(observeCost(initGate(), 'c0', SLOW_COLUMN_MS + 0.001))).toBe(true);
  });
});

describe('shouldCompute', () => {
  const slow = observeCost(initGate(), 'c0', SLOW);

  it('always computes the first column — the gate needs evidence, not a guess', () => {
    expect(shouldCompute(slow, 0, false)).toBe(true);
  });

  it('computes a revealed column and keeps computing it (reveal is sticky)', () => {
    expect(shouldCompute(slow, 3, true)).toBe(true);
    // …and once revealed it must not flip back, or the user's click is undone
    expect(shouldCompute(observeCost(slow, 'c1', 9999), 3, true)).toBe(true);
  });

  it('computes everything while the evidence stays cheap', () => {
    const cheap = observeCost(initGate(), 'c0', CHEAP);
    for (let i = 0; i < 8; i++) expect(shouldCompute(cheap, i, false)).toBe(true);
  });
});


describe('forgetColumn — removing the slow design must un-stick the gate', () => {
  it('clears the mark when the column that SET it is removed', () => {
    const g = observeCost(initGate(), 'slow-col', SLOW);
    expect(isSlow(g)).toBe(true);
    const after = forgetColumn(g, 'slow-col');
    expect(isSlow(after)).toBe(false);
    expect(after.worstMs).toBe(0);
  });

  it('keeps the mark when a DIFFERENT column is removed', () => {
    const g = observeCost(observeCost(initGate(), 'slow-col', SLOW), 'cheap', CHEAP);
    const after = forgetColumn(g, 'cheap');
    expect(after).toBe(g);
    expect(isSlow(after)).toBe(true);
  });

  it('still converges after a removal — no loop is introduced', () => {
    // Remove the slow column, everything left is cheap: all compute, and stay.
    let state = observeCost(initGate(), 'c1', SLOW);
    state = forgetColumn(state, 'c1');
    for (let step = 0; step < 5; step++) {
      const on = [0, 1].map((i) => shouldCompute(state, i, false));
      expect(on).toEqual([true, true]);
      state = observeCost(state, 'c0', CHEAP);
    }
  });
});
