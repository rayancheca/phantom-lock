import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  caretRect,
  dragArmed,
  describeIntent,
  resolveDrop,
  slotIndexAt,
  type ItemRect,
} from '../drag';

/**
 * S29 — the gallery drag, tested as geometry.
 *
 * These cases exist in node rather than jsdom on purpose: jsdom has no layout and
 * reports every rect as 0x0, so a drag that read rects inside the component
 * would be unprovable (the S21 `spotlight.ts` lesson). A 3-column grid of
 * 200x150 cards with a 20 px gap, two rows.
 */

const W = 200;
const H = 150;
const GAP = 20;
const card = (index: number, kind: 'layout' | 'project', id: string): ItemRect => {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const left = col * (W + GAP);
  const top = row * (H + GAP);
  return { kind, id, index, left, top, right: left + W, bottom: top + H };
};

/** a b c / d [F] f — five designs and one folder tile, interleaved. */
const GRID: ItemRect[] = [
  card(0, 'layout', 'a'),
  card(1, 'layout', 'b'),
  card(2, 'layout', 'c'),
  card(3, 'layout', 'd'),
  card(4, 'project', 'F'),
  card(5, 'layout', 'f'),
];
const centre = (r: ItemRect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });

describe('dragArmed — a press is not yet a drag', () => {
  it('needs real travel on a fine pointer, so a click stays a click', () => {
    // Without this the whole card is a button that opens a layout and closes the
    // gallery, so every click would be a zero-length drag.
    const from = { x: 100, y: 100 };
    expect(dragArmed(from, { x: 100, y: 100 }, 0, false)).toBe(false);
    expect(dragArmed(from, { x: 100 + DRAG_THRESHOLD_PX - 1, y: 100 }, 9999, false)).toBe(false);
    expect(dragArmed(from, { x: 100 + DRAG_THRESHOLD_PX, y: 100 }, 0, false)).toBe(true);
    // Diagonal counts: it is a distance, not an axis.
    expect(dragArmed(from, { x: 104, y: 104 }, 0, false)).toBe(true);
  });

  it('needs TIME on a coarse pointer, so a swipe stays a scroll', () => {
    // A 5 px touch threshold would steal every attempt to scroll the gallery.
    const from = { x: 100, y: 100 };
    expect(dragArmed(from, { x: 400, y: 900 }, LONG_PRESS_MS - 1, true)).toBe(false);
    expect(dragArmed(from, { x: 100, y: 100 }, LONG_PRESS_MS, true)).toBe(true);
  });
});

describe('resolveDrop', () => {
  const dragA = { kind: 'layout' as const, id: 'a' };

  it('MERGES when the pointer is in another design’s core', () => {
    expect(resolveDrop(centre(GRID[1]), GRID, dragA)).toEqual({ kind: 'merge', targetId: 'b' });
  });

  it('ABSORBS anywhere on a folder tile, not only its core', () => {
    const tile = GRID[4];
    expect(resolveDrop(centre(tile), GRID, dragA)).toEqual({ kind: 'absorb', projectId: 'F' });
    // near the tile's edge — still absorb, because a folder is one target
    expect(resolveDrop({ x: tile.left + 4, y: tile.top + 4 }, GRID, dragA)).toEqual({
      kind: 'absorb',
      projectId: 'F',
    });
  });

  it('REORDERS from a design’s edge lane, so a card serves both actions', () => {
    const b = GRID[1];
    // just inside b's left edge — outside the merge core
    const near = { x: b.left + 5, y: centre(b).y };
    expect(resolveDrop(near, GRID, dragA)).toEqual({ kind: 'slot', index: 1 });
  });

  it('never proposes dropping an item onto ITSELF', () => {
    // The dragged card is still in the grid; without excluding it, hovering the
    // hole it left would merge a design with itself.
    const out = resolveDrop(centre(GRID[0]), GRID, dragA);
    expect(out.kind).not.toBe('merge');
  });

  it('refuses to merge a FOLDER into a design — the model is flat', () => {
    // Nesting is unexpressible: `Layout.projectId` points one way and there is no
    // parent pointer on `Project`. So a folder dragged onto a design reorders.
    const dragF = { kind: 'project' as const, id: 'F' };
    expect(resolveDrop(centre(GRID[1]), GRID, dragF).kind).toBe('slot');
  });

  it('proposes a slot over empty space', () => {
    const below = { x: 10, y: 10_000 };
    expect(resolveDrop(below, GRID, dragA).kind).toBe('slot');
  });
});

describe('slotIndexAt — reading order, not raw distance', () => {
  const others = GRID.filter((r) => r.id !== 'a');

  it('picks the row first, so a wrapped grid does not jump lines', () => {
    // A point low on row 2 is nearer (euclidean) to a row-1 card than to the
    // row-2 card at the far left; reading order must still put it on row 2.
    const p = { x: 5, y: GRID[3].top + H - 5 };
    expect(slotIndexAt(p, others)).toBe(3);
  });

  it('uses the horizontal midpoint for before-vs-after', () => {
    const b = GRID[1];
    expect(slotIndexAt({ x: b.left + 1, y: centre(b).y }, others)).toBe(1);
    expect(slotIndexAt({ x: b.right - 1, y: centre(b).y }, others)).toBe(2);
  });

  it('appends when the pointer is past the last item', () => {
    expect(slotIndexAt({ x: 10_000, y: 10_000 }, others)).toBe(6);
  });

  it('lands on the first slot above the first row', () => {
    expect(slotIndexAt({ x: 0, y: -500 }, others)).toBe(1);
  });

  it('is total on an empty container', () => {
    expect(slotIndexAt({ x: 0, y: 0 }, [])).toBe(0);
  });
});

describe('caretRect', () => {
  it('draws in the gap BEFORE the item that would be pushed along', () => {
    const r = caretRect(1, GRID, GAP)!;
    expect(r.x).toBe(GRID[1].left - GAP / 2);
    expect(r.height).toBe(H);
  });

  it('draws after the last item when the drop appends', () => {
    const r = caretRect(99, GRID, GAP)!;
    expect(r.x).toBe(GRID[5].right + GAP / 2);
  });

  it('has nothing to draw against in an empty container', () => {
    expect(caretRect(0, [], GAP)).toBeNull();
  });
});

describe('describeIntent — the drag has to be audible', () => {
  const nameOf = (kind: 'layout' | 'project', id: string) =>
    kind === 'project' ? `folder ${id}` : `design ${id}`;

  it('names the ACTION rather than the geometry', () => {
    expect(describeIntent({ kind: 'merge', targetId: 'b' }, nameOf, 'design a')).toMatch(
      /new folder/i,
    );
    expect(describeIntent({ kind: 'absorb', projectId: 'F' }, nameOf, 'design a')).toMatch(
      /into folder F/i,
    );
    expect(describeIntent({ kind: 'slot', index: 2 }, nameOf, 'design a')).toBe('Position 3');
    expect(describeIntent({ kind: 'none' }, nameOf, 'design a')).toMatch(/no drop/i);
  });
});
