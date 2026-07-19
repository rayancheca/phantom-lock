import { useEffect, useRef } from 'react';
import { handleKeydown, type KeyCommand, type KeyEnv } from '../keyboard';

/** The gating state the dispatcher reads (editableTarget is derived per event). */
export type KeyDispatchState = Omit<KeyEnv, 'editableTarget'>;

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
      const t = e.target as HTMLElement | null;
      const editableTarget =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      const res = handleKeydown(e, { ...state, editableTarget });
      if (!res) return;
      if (res.preventDefault) e.preventDefault();
      run(res.command);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
