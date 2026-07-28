import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import {
  cardPosition,
  positionsEqual,
  rectsEqual,
  spotlightBox,
  type CardPosition,
  type Rect,
} from './spotlight';
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
    // renders `anchor.label` as "Look for …" — which is why every dom anchor
    // carries a label, asserted by the corpus test.
    // The sidebar is its own scroll container, so an anchor can be perfectly
    // mounted and still be off-screen — `getBoundingClientRect` happily returns
    // a non-zero rect for it, and the `position: fixed` ring would then be drawn
    // outside the sidebar's clip, over unrelated chrome or off the viewport
    // entirely. `[data-tour="pair"]` (the tour's climax) is low in the TUNE
    // column and is exactly this case on a short window.
    if (el) {
      const r = el.getBoundingClientRect();
      const offscreen = r.bottom < 0 || r.top > (window.innerHeight || 0);
      if (offscreen) {
        // Reduced motion must be branched HERE: `scroll-behavior` is a
        // scroll-container property and the stylesheet's media query cannot
        // reach an imperative smooth scroll.
        const reduce =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      }
    }
    const rect = el ? el.getBoundingClientRect() : null;
    const next =
      rect && (rect.width > 0 || rect.height > 0)
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : null;
    // Bail out when nothing moved. This is what makes the unconditional
    // re-measure below safe — without it, setState on every render is an
    // infinite loop.
    setTarget((prev) => (rectsEqual(prev, next) ? prev : next));
    const card = cardRef.current;
    const size = card
      ? { width: card.offsetWidth || CARD_W, height: card.offsetHeight || CARD_H }
      : { width: CARD_W, height: CARD_H };
    const nextPlace = cardPosition(next, size, {
      width: window.innerWidth || CARD_W,
      height: window.innerHeight || CARD_H,
    });
    setPlace((prev) => (positionsEqual(prev, nextPlace) ? prev : nextPlace));
  }, [anchor]);

  // Re-measure after EVERY render, not just on step change.
  //
  // The anchor can disappear or move with no event to listen for: the pair
  // button unmounts the moment the pair exists, and the sidebar reflows under
  // it. Measuring only on step change left the ring sitting on the old
  // coordinates, highlighting whatever had slid into them — observed live,
  // pointing at "+ HomePod" immediately after the user paired. A tutorial that
  // points at the wrong control is worse than one that points at nothing.
  //
  // Safe because `measure` no-ops when the rect is unchanged (see `rectsEqual`).
  useLayoutEffect(() => {
    measure();
  });

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

  // Move focus to the card whenever the step changes, so a keyboard user is
  // carried along rather than left wherever they were.
  useEffect(() => {
    cardRef.current?.focus();
  }, [stepId]);

  // Satisfying a step is not a step change, so the effect above never fires for
  // it — and two things go wrong at exactly that moment. (a) The control the
  // user just clicked can UNMOUNT (the pair button renders only while two
  // speakers are unpaired), dropping focus to <body> with nothing to restore it.
  // (b) The app's own LiveAnnouncer is suppressed while `overlayOpen`, which the
  // gallery and compare predicates SET — so the one moment the tour most needs
  // to say "that worked" is the one moment the shared announcer cannot.
  const wasSatisfied = useRef(satisfied);
  useEffect(() => {
    const rose = satisfied && !wasSatisfied.current;
    wasSatisfied.current = satisfied;
    if (!rose) return;
    if (!cardRef.current?.contains(document.activeElement)) cardRef.current?.focus();
  }, [satisfied]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onExit();
      return;
    }
    if (e.metaKey || e.ctrlKey) return; // undo/redo stay global
    e.stopPropagation();
  };

  // Drop the ring once the step is satisfied. Two of the `try` steps succeed by
  // OPENING an opaque full-screen overlay (gallery 0.92, compare 0.94) that this
  // layer sits above at z-62 — the anchor stays mounted underneath, so the ring
  // would keep rendering over a screen that no longer shows it, dimming
  // everything through its 9999px spread for no reason.
  const spot = target && !satisfied ? spotlightBox(target, SPOT_PAD) : null;
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

        {/* Owned by this card rather than the app's announcer, which is silenced
            by `overlayOpen` exactly when two of these steps succeed. Permanently
            mounted and empty while waiting: a region inserted at the moment it
            gains text is unreliably announced. */}
        <p className="sr-only" role="status" aria-live="polite">
          {satisfied ? `That worked. Choose Next to continue${isLast ? ', or Finish' : ''}.` : ''}
        </p>

        {/* When the selector matches nothing the ring cannot point, so NAME the
            control instead — several anchors target controls that exist only in
            certain states. This is what `anchor.label` is for. */}
        {!target && anchor.kind === 'dom' && anchor.label && (
          <p className="tour-where">Look for {anchor.label}.</p>
        )}

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
