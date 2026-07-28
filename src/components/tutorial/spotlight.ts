/**
 * Spotlight + coach-mark geometry (S21) — pure.
 *
 * The DOM layer's whole job is "read a rect, hand it here", which is what makes
 * the placement provable: jsdom reports every element as 0x0 (`src/test/axe.ts`),
 * so nothing about where the highlight lands could be verified in the a11y suite.
 * Everything below is therefore total on degenerate input — a zero rect, a
 * viewport smaller than the card — because those are the shapes it will actually
 * be handed under test and on a phone.
 *
 * Positions are applied as React inline `style` props only. The S8 security test
 * scans source text for the imperative style-attribute setter and fails the
 * suite on it (which is why this note describes it rather than spelling it out),
 * and the CSP's `style-src` would block it at runtime anyway.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Placement = 'above' | 'below' | 'center';

export interface CardPosition {
  top: number;
  left: number;
  placement: Placement;
}

/** Gap between the highlighted element and the card, px. */
const GAP = 14;
/** Minimum breathing room from the viewport edge, px. */
const MARGIN = 12;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * Rect equality, to the nearest 0.5 px.
 *
 * This is what makes it safe to re-measure after EVERY render. The anchor can
 * vanish or move without any event firing — the pair button unmounts the instant
 * the pair exists, and the sidebar reflows under it — so a listener-only strategy
 * leaves the ring highlighting whatever slid into the old coordinates, which in a
 * tutorial is worse than no ring at all. Re-measuring unconditionally fixes that,
 * but only if an unchanged measurement provably does NOT call setState: otherwise
 * the effect re-renders, re-measures, and loops forever.
 *
 * The tolerance matters: `getBoundingClientRect` returns subpixel floats that can
 * jitter in the last bits between identical layouts, and an exact `===` compare
 * would then flip-flop forever.
 */
export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  const near = (p: number, q: number) => Math.abs(p - q) < 0.5;
  return near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);
}

/** Same idea for the computed card position. */
export function positionsEqual(a: CardPosition, b: CardPosition): boolean {
  return (
    Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && a.placement === b.placement
  );
}

/** The highlight ring: the target rect grown by `pad`, clipped to the viewport origin. */
export function spotlightBox(target: Rect, pad: number): Rect {
  const x = Math.max(0, target.x - pad);
  const y = Math.max(0, target.y - pad);
  return {
    x,
    y,
    // Grow from the ORIGINAL edges, so an element clipped at the top/left keeps
    // its far edge rather than losing the padding twice.
    width: Math.max(0, target.x + target.width + pad - x),
    height: Math.max(0, target.y + target.height + pad - y),
  };
}

/**
 * Where to put the step card.
 *
 * Below the target by preference, flipped above when that would run off the
 * bottom, and centred when there is no anchor (a narration step, or a selector
 * that matched nothing — which is a real case, since several anchors point at
 * controls that only exist in certain states, like the pair button).
 *
 * The final clamp is unconditional rather than part of the above/below choice:
 * when the viewport is smaller than the card, NEITHER placement fits and the
 * only sane answer is a finite on-screen coordinate.
 */
export function cardPosition(target: Rect | null, card: Size, view: Size): CardPosition {
  if (!target) {
    return {
      top: Math.max(0, (view.height - card.height) / 2),
      left: Math.max(0, (view.width - card.width) / 2),
      placement: 'center',
    };
  }

  const below = target.y + target.height + GAP;
  const fitsBelow = below + card.height + MARGIN <= view.height;
  const placement: Placement = fitsBelow ? 'below' : 'above';
  const rawTop = fitsBelow ? below : target.y - GAP - card.height;

  // Horizontally centred on the target, then pulled back on screen.
  const rawLeft = target.x + target.width / 2 - card.width / 2;

  return {
    top: clamp(rawTop, MARGIN, Math.max(MARGIN, view.height - card.height - MARGIN)),
    left: clamp(rawLeft, MARGIN, Math.max(MARGIN, view.width - card.width - MARGIN)),
    placement,
  };
}
