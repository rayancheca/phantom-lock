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

  if (!toast) return null;
  const bad = toast.tone === 'bad';
  return (
    <div
      className={`toast toast-${toast.tone ?? 'default'}`}
      /* Failures are ASSERTIVE. Every error path in the app (a failed import, a
         failed export-all, an unreadable photo) funnels through here, and a
         polite queue can leave a failure unspoken behind other chatter — the
         "Export all" data-loss warning most of all.
         The live region wraps ONLY the message: the Undo/Dismiss buttons must
         not be re-read as part of an aria-atomic announcement. */
      role={bad ? 'alert' : 'status'}
      aria-live={bad ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-msg">{toast.message}</span>
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
  );
}
