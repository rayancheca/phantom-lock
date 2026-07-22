import { useEffect, useRef, useState } from 'react';
import { initSettle, stepSettle, type SettleState } from '../announce';

/** How long a value must hold still before it is spoken. Deliberately NOT the
 *  400 ms autosave debounce: that is too twitchy against a held arrow key
 *  repeating at ~30/s. */
export const SETTLE_MS = 700;

/**
 * Drive the pure settle reducer from a wall clock (S7 / deliverable 2).
 *
 * This hook is a THIN wrapper: `stepSettle` is genuinely the implementation, not
 * a parallel reducer that the tests exercise while the component does something
 * else. Everything decision-making lives in `announce.ts` and is unit-tested;
 * all that happens here is "call it now, and call it again after the window".
 *
 * `quietMs` is injectable so a jsdom test can pass 0 rather than either waiting
 * a real 700 ms or reaching for fake timers (the repo has none, and keeps none).
 */
export function useAnnouncer(next: string, suppressed: boolean, quietMs: number = SETTLE_MS): string {
  const [text, setText] = useState('');
  // Seeded with the boot value, so the value present at mount counts as already
  // announced and the region can never speak on first paint.
  const stateRef = useRef<SettleState>(initSettle(next));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    clear();

    // While an overlay owns the screen, say nothing — but do NOT advance the
    // baseline. Advancing it would swallow the change entirely: deleting the
    // active layout from inside the gallery mutates the scene across several
    // suppressed renders, and the user would then close the gallery to total
    // silence about the fact that they are now looking at a different layout.
    if (suppressed) return;

    const tick = () => {
      const r = stepSettle(stateRef.current, next, Date.now(), quietMs);
      stateRef.current = r.state;
      if (r.announce !== null) setText(r.announce);
      return r.announce !== null;
    };

    // First call registers the pending value and starts its window; the timer
    // re-samples once the window should have elapsed.
    if (!tick()) timerRef.current = setTimeout(tick, quietMs + 10);
    return clear;
  }, [next, suppressed, quietMs]);

  return text;
}
