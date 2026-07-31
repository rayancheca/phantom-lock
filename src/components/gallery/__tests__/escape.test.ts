import { describe, expect, it } from 'vitest';
import { escapeAction, type EscapeAction, type EscapeState } from '../escape';

/**
 * The ladder is four rungs over three booleans, so the state space is eight
 * rows and can simply be enumerated. That matters more than it looks: the bug
 * this module fixes was a MISSING rung, and a spot-check of the rungs that do
 * exist can never find a missing one.
 */

const S = (overlayAbove: boolean, moving: boolean, inFolder: boolean): EscapeState => ({
  overlayAbove,
  moving,
  inFolder,
});

describe('escapeAction', () => {
  // Every row written out, most-specific first, so a reader can see the
  // precedence rather than infer it.
  const TABLE: Array<[EscapeState, EscapeAction, string]> = [
    [S(true, true, true), 'yield', 'a menu over a move inside a folder'],
    [S(true, true, false), 'yield', 'a menu over a move on the home grid'],
    [S(true, false, true), 'yield', 'a menu inside a folder'],
    [S(true, false, false), 'yield', 'a menu on the home grid'],
    [S(false, true, true), 'cancel-move', 'a move inside a folder'],
    [S(false, true, false), 'cancel-move', 'a move on the home grid'],
    [S(false, false, true), 'leave-folder', 'drilled into a folder'],
    [S(false, false, false), 'close', 'nothing else is going on'],
  ];

  it.each(TABLE)('%o -> %s (%s)', (state, expected) => {
    expect(escapeAction(state)).toBe(expected);
  });

  it('is TOTAL — every one of the eight states is covered exactly once', () => {
    // Guards the table itself. A rung added later without a row here would
    // leave a state untested, and the enumeration above is only worth
    // something if it is provably complete.
    const seen = new Set<string>();
    for (const [s] of TABLE) seen.add(`${s.overlayAbove}${s.moving}${s.inFolder}`);
    expect(seen.size).toBe(8);
  });

  it('YIELDS to an overlay even mid-move — the rung order is the whole point', () => {
    // THE NEGATIVE CONTROL for the precedence. Putting `moving` first is the
    // obvious alternative ladder and passes every row above except this one:
    // it would cancel the user's move on the keystroke that dismisses a menu
    // they opened over it.
    expect(escapeAction(S(true, true, false))).toBe('yield');
    expect(escapeAction(S(true, true, false))).not.toBe('cancel-move');
  });

  it('does NOT close the gallery whenever anything inner is open', () => {
    // The shipped bug, stated as an assertion: Escape reached 'close' while a
    // menu was open. Any implementation that lets `close` win from a state
    // with an inner claimant fails here.
    const inner = TABLE.filter(([s]) => s.overlayAbove || s.moving || s.inFolder);
    expect(inner).toHaveLength(7);
    for (const [state] of inner) expect(escapeAction(state)).not.toBe('close');
  });
});
