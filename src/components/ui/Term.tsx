import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { glossaryEntry, type TermKey } from '../panels/glossary';
import './ui.css';

interface TermProps {
  /** Which glossary entry backs this term. */
  termKey: TermKey;
  /** The visible label text (usually the same words the definition explains). */
  children: ReactNode;
  /** Extra classes on the trigger (e.g. `spec-label` to keep the spec-sheet look). */
  className?: string;
}

/**
 * A dotted-underline jargon term that reveals a one-line plain-English definition
 * — UX-4 / Session 16 (item A). This is the accessible replacement for the
 * hover-only `title=` tooltips: the trigger is a real `<button>` (keyboard- and
 * touch-reachable, visible focus ring), and the popover is a proper disclosure
 * (`aria-expanded` + `aria-controls` + `aria-describedby`).
 *
 * Dismissal mirrors `Menu.tsx`: Escape (window-capture + stopPropagation) and an
 * outside pointerdown both close it, so a term sitting over the canvas can't leak
 * keys/clicks through. Respects `prefers-reduced-motion` via `.term-pop` in ui.css.
 */
export default function Term({ termKey, children, className }: TermProps) {
  const entry = glossaryEntry(termKey);
  const [open, setOpen] = useState(false);
  const popId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  // Unknown key → render the label as inert text rather than a dead button.
  if (!entry) return <span className={className}>{children}</span>;

  return (
    <span className="term-anchor" ref={anchorRef}>
      <button
        type="button"
        ref={btnRef}
        className={`term${className ? ` ${className}` : ''}`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-describedby={open ? popId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open && (
        <span id={popId} role="note" className="term-pop">
          <strong className="term-pop-name">{entry.term}</strong>
          <span className="term-pop-def">{entry.def}</span>
        </span>
      )}
    </span>
  );
}
