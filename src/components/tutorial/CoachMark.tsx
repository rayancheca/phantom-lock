import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import { cardPosition, spotlightBox, type CardPosition, type Rect } from './spotlight';
import type { TutorialAnchor } from './types';

interface CoachMarkProps {
  /** Stable per step — drives re-anchoring and the focus move. */
  stepId: string;
  title: string;
  body: string;
  anchor: TutorialAnchor;
  /** "Step 3 of 5" */
  position: number;
  total: number;
  chapterTitle: string;
  /** A `try` step that the user has not satisfied yet. */
  waiting: boolean;
  /** The `try` step's predicate has gone true. */
  satisfied: boolean;
  hint?: string;
  canBack: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
  onShowMe?: () => void;
}

/** Padding around the highlighted element, px. */
const SPOT_PAD = 6;
/** Nominal card size used for placement before it is measured. */
const CARD_W = 340;
const CARD_H = 210;

/**
 * The floating step card + its highlight ring.
 *
 * DELIBERATELY NON-MODAL, and never part of the App's `overlayOpen`. That is the
 * central constraint, not a detail: `overlayOpen` kills every scene and tool key
 * (`keyboard.ts:118`), drops the canvas out of the tab order
 * (`SimCanvas.tsx:1156`), disables Space-pan and the door/window hover chip, and
 * silences the live announcer. A tutorial that set it would switch off the very
 * features it is teaching, and a keyboard user could not perform a single `try`
 * step.
 *
 * The cost of staying non-modal is that app shortcuts remain live while focus is
 * inside this card, and `interactiveTarget` only gates Arrow and Delete — digits,
 * `t`, `q`/`e` would fire straight through and mutate the scene behind the
 * tutorial. So the card swallows its own KEYDOWN, with two carve-outs:
 *   - Escape, which exits the tour (handled here), and
 *   - ⌘/Ctrl chords, so undo/redo keep working.
 * KEYUP is deliberately NOT swallowed: `interaction.ts` disarms canvas panning on
 * Space keyup ABOVE its own target exemption, so eating keyup would strand pan
 * armed forever if a user held Space on the canvas and released here (the S7
 * lesson).
 */
export default function CoachMark({
  stepId,
  title,
  body,
  anchor,
  position,
  total,
  chapterTitle,
  waiting,
  satisfied,
  hint,
  canBack,
  isLast,
  onNext,
  onBack,
  onExit,
  onShowMe,
}: CoachMarkProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  const [place, setPlace] = useState<CardPosition>({ top: 0, left: 0, placement: 'center' });

  const measure = useCallback(() => {
    const el =
      anchor.kind === 'dom' ? document.querySelector<HTMLElement>(anchor.selector) : null;
    // A missing node is EXPECTED, not exceptional: several anchors point at
    // controls that only exist in some states (the pair button appears only with
    // exactly two unpaired same-model speakers). The card then centres itself and
    // the copy still names the control — which is why every dom anchor carries a
    // `label`, asserted by the corpus test.
    const rect = el ? el.getBoundingClientRect() : null;
    const next =
      rect && (rect.width > 0 || rect.height > 0)
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : null;
    setTarget(next);
    const card = cardRef.current;
    const size = card
      ? { width: card.offsetWidth || CARD_W, height: card.offsetHeight || CARD_H }
      : { width: CARD_W, height: CARD_H };
    setPlace(
      cardPosition(next, size, {
        width: window.innerWidth || CARD_W,
        height: window.innerHeight || CARD_H,
      }),
    );
  }, [anchor]);

  // Re-measure on step change and on anything that can move the anchor. Layout
  // effect so the card never paints at a stale position for a frame.
  useLayoutEffect(() => {
    measure();
  }, [measure, stepId]);

  useEffect(() => {
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    // Capture phase: catches scrolling inside the sidebar, not just the window.
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [measure]);

  // Move focus to the card whenever the step changes. This is ALSO the screen
  // reader strategy: focusing a labelled `role="dialog"` announces its name and
  // content, so the tour needs no live region of its own — and therefore cannot
  // fight the app's existing `LiveAnnouncer`, which stays active precisely
  // because this overlay is non-modal.
  useEffect(() => {
    cardRef.current?.focus();
  }, [stepId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onExit();
      return;
    }
    if (e.metaKey || e.ctrlKey) return; // undo/redo stay global
    e.stopPropagation();
  };

  const spot = target ? spotlightBox(target, SPOT_PAD) : null;
  const titleId = `tour-title-${stepId}`;
  const bodyId = `tour-body-${stepId}`;

  return (
    <div className="tour-layer">
      {spot && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ top: spot.y, left: spot.x, width: spot.width, height: spot.height }}
        />
      )}
      <div
        ref={cardRef}
        className={`tour-card tour-card--${place.placement}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ top: place.top, left: place.left }}
      >
        <div className="tour-card-head">
          <p className="tour-eyebrow">
            {chapterTitle} · {position} of {total}
          </p>
          <button type="button" className="tour-x" aria-label="Close the tour" onClick={onExit}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <h2 id={titleId} className="tour-title">
          {title}
        </h2>
        <p id={bodyId} className="tour-body">
          {body}
        </p>

        {waiting && !satisfied && hint && <p className="tour-hint">{hint}</p>}
        {satisfied && (
          <p className="tour-done">
            <Icon name="check" size={13} />
            Done — that is exactly it.
          </p>
        )}

        <div className="tour-actions">
          <button type="button" className="btn btn-ghost" onClick={onBack} disabled={!canBack}>
            Back
          </button>
          {waiting && !satisfied && onShowMe && (
            <button type="button" className="btn" onClick={onShowMe}>
              Show me
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {isLast ? 'Finish' : waiting && !satisfied ? 'Skip' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
