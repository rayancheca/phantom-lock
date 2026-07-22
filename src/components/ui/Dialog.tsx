import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';
import './ui.css';

interface DialogProps {
  title: string;
  /** Non-modal dialogs skip the scrim so the canvas stays visible (calibration). */
  modal?: boolean;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

/** Token-styled replacement for window.prompt/confirm: the first FIELD is
 *  focused and pre-selected on open, Tab is trapped inside while modal,
 *  Esc closes, Enter submits the wrapping <form>, and focus returns to
 *  wherever it was when the dialog closes. */
export default function Dialog({ title, modal = true, onClose, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mount-only: initial focus + focus restore. Deliberately not re-run on
  // re-renders — re-focusing would steal the caret while the user types.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>('input, select, textarea') ??
      panel?.querySelector<HTMLElement>('button:not(.dialog-x)') ??
      panel?.querySelector<HTMLElement>('button');
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    return () => {
      // The opener may have unmounted (menu items close their menu); fall
      // back to the always-present room trigger so focus never drops to body.
      const target =
        previous && previous.isConnected && previous !== document.body
          ? previous
          : document.querySelector<HTMLElement>('.room-trigger');
      target?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && modal && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (el) => !el.hasAttribute('disabled'),
        );
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        const active = document.activeElement;
        if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        } else if (e.shiftKey && (active === firstEl || !panelRef.current.contains(active))) {
          e.preventDefault();
          lastEl.focus();
        } else if (!panelRef.current.contains(active)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [modal]);

  return (
    <div className={`dialog-layer ${modal ? 'dialog-modal' : 'dialog-floating'}`}>
      {modal && <div className="dialog-scrim" onClick={onClose} />}
      <div className="dialog-panel" role="dialog" aria-modal={modal} aria-label={title} ref={panelRef}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="dialog-x" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
