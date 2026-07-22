import { useEffect, useState } from 'react';
import Icon from './Icon';
import './ui.css';

export interface ToastData {
  id: number;
  message: string;
  tone?: 'default' | 'bad' | 'ok';
  action?: { label: string; run: () => void };
}

interface ToastProps {
  toast: ToastData | null;
  onDismiss: () => void;
}

const UNDO_MS = 6000;
const PLAIN_MS = 3600;

/** Single-slot toast anchored to the bottom of the stage. Actions (Undo)
 *  extend the lifetime, hover/focus pauses it; a new toast replaces the
 *  current one. */
export default function Toast({ toast, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!toast || paused) return;
    const t = setTimeout(onDismiss, toast.action ? UNDO_MS : PLAIN_MS);
    return () => clearTimeout(t);
    // Keyed on toast.id so re-renders don't restart the countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id, paused]);

  const bad = toast?.tone === 'bad';
  // The Undo button expires with the toast (6 s), and it is the sole recovery
  // path for every destructive action. Naming the persistent keyboard route in
  // the SPOKEN text means the time limit is no longer the only way back
  // (WCAG 2.2.1) — the visual toast still shows the button.
  const message = toast ? `${toast.message}${toast.action ? ' Press Command Z to undo.' : ''}` : '';
  return (
    <>
      {/* The live regions are ALWAYS mounted and hold ONLY the message.
          Three reasons, each a real bug this shape avoids:
          1. A region inserted in the same tick as its text is unreliably
             announced — `role="status"` especially. The old code returned null
             with no toast, so every region was born with its text already in it.
          2. Politeness must not be swapped on a live node. Mutating one div's
             role from status to alert is unreliable across AT, so failures get
             their OWN permanently-assertive region. Failures matter: a failed
             import or a failed "Export all" is a data-loss warning.
          3. `aria-atomic` re-reads the whole region, so the Undo/Dismiss buttons
             must live OUTSIDE it or every announcement ends "...Undo. Dismiss." */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {bad ? '' : message}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {bad ? message : ''}
      </div>
      {toast && (
        <div
          className={`toast toast-${toast.tone ?? 'default'}`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {/* The live region above already speaks this; hiding the visual copy
              stops a screen reader meeting the same sentence twice. */}
          <span className="toast-msg" aria-hidden="true">
            {toast.message}
          </span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action?.run();
                onDismiss();
              }}
            >
              <Icon name="undo" size={13} />
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={onDismiss}>
            <Icon name="x" size={12} />
          </button>
        </div>
      )}
    </>
  );
}
