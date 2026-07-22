import { useEffect, useRef } from 'react';
import { handleKeydown, type KeyCommand, type KeyEnv } from '../keyboard';

/** The gating state the dispatcher reads. The three target-derived flags are
 *  computed per EVENT (not per render) — passing them down as props would make
 *  them stale, which is the bug the per-event derivation exists to avoid. */
export type KeyDispatchState = Omit<
  KeyEnv,
  'editableTarget' | 'interactiveTarget' | 'canvasFocused'
>;

interface Args {
  state: KeyDispatchState;
  /** Execute a resolved command (App knows how to run each). */
  run: (command: KeyCommand) => void;
}

/**
 * Global keyboard shortcuts. The window listener mounts ONCE and reads the latest
 * state + dispatcher through a ref, so its dependency array is genuinely empty
 * (no exhaustive-deps suppression). All branching lives in the pure `handleKeydown`.
 */
export function useKeyboardShortcuts({ state, run }: Args): void {
  const ctxRef = useRef({ state, run });
  ctxRef.current = { state, run };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { state, run } = ctxRef.current;
      // `instanceof Element`, NOT `as HTMLElement | null`: a key event dispatched
      // at `window` (which is how the repo's own live-verification technique
      // drives shortcuts — see the S5/S14 lessons) has `e.target === window`.
      // That is truthy, so `t?.closest(...)` would NOT short-circuit and would
      // throw `closest is not a function` inside this listener, killing every
      // shortcut including Escape and undo.
      const el = e.target instanceof Element ? e.target : null;
      const editableTarget =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      const interactiveTarget = !!el?.closest(
        'button, [role="button"], [role="radio"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="option"], [role="checkbox"], summary, a[href], [contenteditable]',
      );
      // Identify the canvas by what it IS, not by a presentational class — a CSS
      // rename would otherwise silently disable n/p/d/w with every test still
      // green. The class stays as a cheap first check for the common case.
      const canvasFocused =
        el?.tagName === 'CANVAS' &&
        (el.classList.contains('sim-canvas') || el.getAttribute('role') === 'application');
      const res = handleKeydown(e, { ...state, editableTarget, interactiveTarget, canvasFocused });
      if (!res) return;
      if (res.preventDefault) e.preventDefault();
      run(res.command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
