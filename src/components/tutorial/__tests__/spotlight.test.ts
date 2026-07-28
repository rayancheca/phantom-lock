/**
 * Spotlight geometry — pure, and pure for a concrete reason: jsdom gives every
 * element a 0x0 rect (`src/test/axe.ts`), so the a11y suite can never prove the
 * highlight lands on anything. Keeping the maths here means it is provable in
 * node against injected rects, and the DOM layer is reduced to "read a rect,
 * hand it over".
 */
import { describe, expect, it } from 'vitest';
import { cardPosition, spotlightBox, type Rect } from '../spotlight';

const VIEW = { width: 1440, height: 900 };
const CARD = { width: 320, height: 200 };
const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe('spotlightBox', () => {
  it('pads the target on every side', () => {
    expect(spotlightBox(r(100, 100, 50, 40), 8)).toEqual({ x: 92, y: 92, width: 66, height: 56 });
  });

  it('never returns a negative origin — a padded edge element must stay on screen', () => {
    const b = spotlightBox(r(2, 1, 10, 10), 8);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
  });

  it('a zero-size rect (jsdom, or a hidden node) yields a zero-size box, not NaN', () => {
    const b = spotlightBox(r(0, 0, 0, 0), 8);
    expect(Number.isFinite(b.width) && Number.isFinite(b.height)).toBe(true);
    expect(b.width).toBeGreaterThanOrEqual(0);
  });
});

describe('cardPosition', () => {
  it('prefers below the target when there is room', () => {
    const p = cardPosition(r(600, 100, 200, 40), CARD, VIEW);
    expect(p.top).toBeGreaterThan(140);
    expect(p.placement).toBe('below');
  });

  it('flips above when the target is near the bottom edge', () => {
    const p = cardPosition(r(600, 820, 200, 40), CARD, VIEW);
    expect(p.placement).toBe('above');
    expect(p.top).toBeLessThan(820);
  });

  it('keeps the card fully on screen horizontally for a target at the right edge', () => {
    const p = cardPosition(r(1400, 400, 40, 40), CARD, VIEW);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + CARD.width).toBeLessThanOrEqual(VIEW.width);
  });

  it('keeps the card on screen for a target at the left edge', () => {
    const p = cardPosition(r(0, 400, 40, 40), CARD, VIEW);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });

  it('never pushes the card off the top when flipping above a tall target', () => {
    const p = cardPosition(r(600, 30, 200, 40), CARD, VIEW);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });

  it('centres the card when there is no anchor at all', () => {
    const p = cardPosition(null, CARD, VIEW);
    expect(p.placement).toBe('center');
    expect(p.left).toBe((VIEW.width - CARD.width) / 2);
    expect(p.top).toBe((VIEW.height - CARD.height) / 2);
  });

  it('a viewport smaller than the card still yields finite, non-negative coords', () => {
    // The <=960px layout, or a phone in landscape.
    const p = cardPosition(r(10, 10, 20, 20), { width: 320, height: 400 }, { width: 300, height: 380 });
    expect(Number.isFinite(p.left) && Number.isFinite(p.top)).toBe(true);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic — same inputs, same output', () => {
    const a = cardPosition(r(600, 400, 100, 50), CARD, VIEW);
    const b = cardPosition(r(600, 400, 100, 50), CARD, VIEW);
    expect(a).toEqual(b);
  });
});
