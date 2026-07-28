/**
 * The N-up compare's slow-column gate — S20.
 *
 * A compare column is one `computeAudio` pass, and that ranges over five orders of
 * magnitude depending on the scene: 0.02 ms on the seeded demo, ~62 ms on a
 * 30-room house with apex-blocked pairs (`bestPairSpot` sweeps once per blocked
 * pair), ~10.9 s on an adversarial import-legal payload. So no fixed column count
 * is safe by arithmetic, and a cap small enough to bound the slow case would fire
 * on every ordinary one. The control is therefore a MEASUREMENT: keep computing
 * automatically while the evidence says it is cheap, and once it is not, let the
 * user reveal the remaining columns one at a time.
 *
 * THIS IS A PURE STATE MACHINE ON PURPOSE. The first version lived inline in the
 * component and derived its threshold from the live results map — which made it a
 * feedback loop with no hysteresis: a deferred column reported "no result", that
 * deleted the very measurement that had deferred it, the gate re-opened, the
 * column recomputed, and the cycle repeated forever. It never converges, it burns
 * MORE CPU than having no gate at all, and on a heavy scene it wedges the tab.
 * The fix is the water mark below — monotonic, so evidence is never un-learned —
 * and it is testable precisely because it is not tangled up with React.
 */

/**
 * Above this, a column is slow enough that computing the rest automatically would
 * blow the repo's own INP budget (< 200 ms). Deliberately well under it: the gate
 * decides for the columns not yet computed, so the budget has to cover the one
 * being measured plus its render.
 */
export const SLOW_COLUMN_MS = 120;

export interface GateState {
  /**
   * The slowest column measured SO FAR — a high-water mark that the GATE never
   * lowers. That is the whole correctness argument: the gate's own action
   * (deferring a column) removes that column's measurement from the live set, so
   * anything derived from the live set oscillates.
   */
  worstMs: number;
  /** Which column set the mark, so the USER removing that column can clear it. */
  worstUid: string | null;
}

export const initGate = (): GateState => ({ worstMs: 0, worstUid: null });

/** Fold one column's measured cost in. Returns the SAME object when nothing moved,
 *  so a React `useState` setter bails out instead of re-rendering. */
export function observeCost(state: GateState, uid: string, ms: number): GateState {
  if (!Number.isFinite(ms) || ms <= state.worstMs) return state;
  return { worstMs: ms, worstUid: uid };
}

/**
 * The user removed a column. If it was the one holding the mark, forget it —
 * otherwise the gate stays shut for the rest of the session on the strength of a
 * measurement of a column that no longer exists, and every remaining column keeps
 * offering to measure itself at a cost nothing on screen has.
 *
 * Safe against the oscillation: this is driven by a USER ACTION (finite, and each
 * removal re-measures at most once), never by the gate's own deferral — which is
 * the loop the water mark exists to break.
 */
export function forgetColumn(state: GateState, uid: string): GateState {
  return state.worstUid === uid ? initGate() : state;
}

/** Has the evidence crossed the threshold? */
export const isSlow = (state: GateState): boolean => state.worstMs > SLOW_COLUMN_MS;

/**
 * Whether column `index` should compute now.
 *
 * The first column ALWAYS computes: something has to be measured, an empty compare
 * view teaches nothing, and it is what turns the gate from a guess into evidence.
 */
export function shouldCompute(
  state: GateState,
  index: number,
  revealed: boolean,
): boolean {
  return index === 0 || revealed || !isSlow(state);
}
