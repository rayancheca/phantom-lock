import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  EXIT_PAD_PX,
  LONG_PRESS_MS,
  caretRect,
  dragArmed,
  describeIntent,
  fallbackIndex,
  focusPlanFor,
  focusPlanOn,
  maxStepIndex,
  resolveDrop,
  slotIndexAt,
  toDisplayIndex,
  toStepIndex,
  type ExitTarget,
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

  it('refuses to ABSORB a folder into a folder — found live, not in review', () => {
    // The bug this pins: `absorb` was proposed for ANY dragged item, so dropping
    // a folder on a folder announced "Drop to move Sketches into Bed" and then
    // committed nothing at all, because no branch handles absorbing a project.
    // A drag must never propose an action it cannot perform.
    const tile2: ItemRect = { ...card(0, 'project', 'G'), index: 6 };
    const grid = [...GRID, tile2];
    const dragG = { kind: 'project' as const, id: 'G' };
    expect(resolveDrop(centre(GRID[4]), grid, dragG).kind).toBe('slot');
    // ...while a DESIGN dropped on that same tile still absorbs.
    expect(resolveDrop(centre(GRID[4]), grid, { kind: 'layout', id: 'a' })).toEqual({
      kind: 'absorb',
      projectId: 'F',
    });
  });

  it('proposes a slot over empty space', () => {
    const below = { x: 10, y: 10_000 };
    expect(resolveDrop(below, GRID, dragA).kind).toBe('slot');
  });
});

describe('the review fixes — each pinned so it cannot silently regress', () => {
  const others = GRID.filter((r) => r.id !== 'a');

  it('a drop BELOW the grid appends; it does not land near the front', () => {
    // The bug: "every item above the pointer" kept row 0 too, and the scan then
    // returned a row-0 index. Measured, a drop in the empty space under the grid
    // sent the card to slot 1.
    expect(slotIndexAt({ x: 10, y: 10_000 }, others)).toBe(6);
    expect(slotIndexAt({ x: 320, y: 10_000 }, others)).toBe(6);
  });

  it('a drop in the GAP between two rows lands on the upper row, not row 0', () => {
    // In a gap the VERTICAL position is the whole answer: the drop lands after
    // the last item of the row above, whatever x is. Letting x decide is what
    // broke the single-column case below.
    const gapY = GRID[2].bottom + 5; // between row 0 and row 1
    expect(slotIndexAt({ x: 10, y: gapY }, others)).toBe(3);
    expect(slotIndexAt({ x: 10_000, y: gapY }, others)).toBe(3);
  });

  it('a single-column grid resolves every inter-card gap correctly', () => {
    const col: ItemRect[] = [0, 1, 2].map((i) => ({
      kind: 'layout', id: `c${i}`, index: i,
      left: 0, right: 300, top: i * 170, bottom: i * 170 + 150,
    }));
    expect(slotIndexAt({ x: 50, y: 160 }, col)).toBe(1);
    expect(slotIndexAt({ x: 50, y: 330 }, col)).toBe(2);
    expect(slotIndexAt({ x: 50, y: 5000 }, col)).toBe(3);
  });

  it('the caret anchors to the PRECEDING item, not the far end of the grid', () => {
    // `slotIndexAt` legitimately returns the dragged item's OWN index when the
    // pointer sits just before its slot, and the caller has filtered it out — so
    // `caretRect` gets an index no item holds. Anchoring to the global last item
    // drew the caret rows away from where the drop would land.
    const withoutD = GRID.filter((r) => r.id !== 'd'); // 'd' is index 3, row 1 start
    const r = caretRect(3, withoutD, GAP)!;
    expect(r.top).toBe(GRID[2].top); // end of ROW 0, where the drop lands
    expect(r.x).toBe(GRID[2].right + GAP / 2);
  });

  it('refuses to MERGE inside a folder, where the flat model cannot express it', () => {
    // With canMerge false a design-on-design drop reorders instead. Measured on
    // the real store: merging inside a folder pulled BOTH designs onto the home
    // grid and left the view the user was looking at empty.
    const dragA = { kind: 'layout' as const, id: 'a' };
    expect(resolveDrop(centre(GRID[1]), GRID, dragA, true).kind).toBe('merge');
    expect(resolveDrop(centre(GRID[1]), GRID, dragA, false).kind).toBe('slot');
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

// ---------------------------------------------------------------------------
// S30 — taking a design OUT of a folder.

/** The breadcrumb, sitting in the header band ABOVE the grid. */
const CRUMB: ExitTarget = {
  projectId: 'home',
  rect: { left: 24, top: -80, right: 140, bottom: -50 },
};
const mid = (t: ExitTarget) => ({
  x: (t.rect.left + t.rect.right) / 2,
  y: (t.rect.top + t.rect.bottom) / 2,
});

describe('resolveDrop — the exit intent', () => {
  it('proposes exit when a DESIGN is over the breadcrumb', () => {
    expect(resolveDrop(mid(CRUMB), GRID, { kind: 'layout', id: 'a' }, true, CRUMB)).toEqual({
      kind: 'exit',
      projectId: 'home',
    });
  });

  it('is UNCONSTRUCTIBLE with no breadcrumb — the home grid passes none', () => {
    // The enforcement is an ABSENT rect, not a boolean a caller has to compute
    // correctly. With no target there is no argument that produces `exit`.
    const out = resolveDrop(mid(CRUMB), GRID, { kind: 'layout', id: 'a' }, true);
    expect(out.kind).not.toBe('exit');
  });

  it('never proposes exit for a FOLDER — the model is flat', () => {
    // Same guard `absorb` carries. A drag must either perform the action it
    // proposes or not propose it, and no commit branch takes a folder out of a
    // folder.
    const out = resolveDrop(mid(CRUMB), GRID, { kind: 'project', id: 'F' }, true, CRUMB);
    expect(out.kind).not.toBe('exit');
  });

  it('BEATS a card whose unclipped rect reaches into the header band', () => {
    // THE REASON exit is hit-tested first. `.gallery-grid` is `overflow-y: auto`
    // and `getBoundingClientRect` reports a scrolled-out card's UNCLIPPED
    // coordinates, so a card the user cannot see has a rect overlapping the
    // breadcrumb. Items-first would let it win a drop aimed at a visible control.
    const scrolledOut: ItemRect = {
      kind: 'layout',
      id: 'ghost',
      index: 0,
      left: 0,
      top: -120,
      right: 300,
      bottom: -20,
    };
    const p = mid(CRUMB);
    // The overlap is real: the hidden card genuinely contains the drop point.
    expect(p.x >= scrolledOut.left && p.x <= scrolledOut.right).toBe(true);
    expect(p.y >= scrolledOut.top && p.y <= scrolledOut.bottom).toBe(true);
    expect(resolveDrop(p, [scrolledOut], { kind: 'layout', id: 'a' }, true, CRUMB)).toEqual({
      kind: 'exit',
      projectId: 'home',
    });
  });

  it('pads by EXIT_PAD_PX on ALL FOUR edges, and no further', () => {
    // Probing one edge only would be satisfied by a pad applied to that edge
    // alone — and "a pointer dragging up from the grid approaches from below" is
    // exactly the asymmetric version someone would write. Both probes are
    // expressed against the constant so the test pins the SHAPE, not a window.
    const r = CRUMB.rect;
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const edges: Array<[string, (n: number) => { x: number; y: number }]> = [
      ['left', (n) => ({ x: r.left - n, y: cy })],
      ['right', (n) => ({ x: r.right + n, y: cy })],
      ['top', (n) => ({ x: cx, y: r.top - n })],
      ['bottom', (n) => ({ x: cx, y: r.bottom + n })],
    ];
    for (const [edge, at] of edges) {
      const inside = resolveDrop(at(EXIT_PAD_PX - 1), [], { kind: 'layout', id: 'a' }, true, CRUMB);
      const outside = resolveDrop(at(EXIT_PAD_PX + 1), [], { kind: 'layout', id: 'a' }, true, CRUMB);
      expect(`${edge}:${inside.kind}`).toBe(`${edge}:exit`);
      expect(`${edge}:${outside.kind}`).not.toBe(`${edge}:exit`);
    }
  });

  it('leaves every other drop untouched — the grid still merges and reorders', () => {
    // A regression guard on the new FIRST branch: with a breadcrumb present but
    // far away, every pre-S30 answer must be unchanged.
    const onCard = { x: 100, y: 75 };
    expect(resolveDrop(onCard, GRID, { kind: 'layout', id: 'b' }, true, CRUMB)).toEqual({
      kind: 'merge',
      targetId: 'a',
    });
    expect(
      resolveDrop(centre(GRID[4]), GRID, { kind: 'layout', id: 'a' }, true, CRUMB).kind,
    ).toBe('absorb');
  });
});

describe('describeIntent — exit', () => {
  const nameOf = (kind: 'layout' | 'project', id: string) =>
    kind === 'project' ? `folder ${id}` : `design ${id}`;

  it('names the DESTINATION, matching the toast that follows', () => {
    expect(describeIntent({ kind: 'exit', projectId: 'home' }, nameOf, 'design a')).toMatch(
      /out to folder home/i,
    );
  });
});

// ---------------------------------------------------------------------------
// S30 — move mode's index space.

describe('toStepIndex / toDisplayIndex', () => {
  it('maps a CONCRETE non-identity value — identity is the bug being fixed', () => {
    // A round-trip property alone is satisfied by the identity pair, which is
    // precisely the pre-S30 behaviour. This is the line that fails on it.
    expect(toDisplayIndex(0, 0)).toBe(1);
    expect(toDisplayIndex(1, 0)).toBe(2);
    expect(toStepIndex(2, 0)).toBe(1);
    // Below the subject the two spaces do coincide, and must.
    expect(toDisplayIndex(0, 2)).toBe(0);
    expect(toStepIndex(0, 2)).toBe(0);
  });

  it('round-trips for every (step, self) in a ten-item container', () => {
    for (let self = 0; self < 10; self += 1) {
      for (let step = 0; step <= 9; step += 1) {
        expect(toStepIndex(toDisplayIndex(step, self), self)).toBe(step);
      }
    }
  });

  it('gives every step index a DISTINCT display index', () => {
    // The property that makes each keypress move something: two steps that
    // collapsed onto one display index would be a wasted press.
    for (let self = 0; self < 6; self += 1) {
      const seen = new Set<number>();
      for (let step = 0; step <= maxStepIndex(6); step += 1) seen.add(toDisplayIndex(step, self));
      expect(seen.size).toBe(maxStepIndex(6) + 1);
    }
  });

  it('has exactly as many positions as there are items', () => {
    // `others.length` was one short, which is why the last slot was unreachable.
    expect(maxStepIndex(3)).toBe(2);
    expect(maxStepIndex(1)).toBe(0);
    expect(maxStepIndex(0)).toBe(0);
  });

  it('passes an index through unchanged when the subject is not in the container', () => {
    expect(toDisplayIndex(3, -1)).toBe(3);
    expect(toStepIndex(3, -1)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// S30 — where focus goes after a commit.

describe('focusPlanFor', () => {
  const subject = { kind: 'layout' as const, id: 'a' };

  it('puts the NEW FOLDER first after a merge', () => {
    const plan = focusPlanFor(subject, { kind: 'merge', targetId: 'b' }, 'made-1', 3);
    expect(plan.targets[0]).toEqual({ kind: 'project', id: 'made-1' });
    expect(plan.vacated).toBe(3);
  });

  it('falls back to the SUBJECT when a merge minted nothing', () => {
    // The MAX_PROJECTS refusal commits nothing and toasts, so planning a folder
    // that was never created would skip straight past to the gap — while the
    // subject is in fact still exactly where it was.
    const plan = focusPlanFor(subject, { kind: 'merge', targetId: 'b' }, null, 3);
    expect(plan.targets).toEqual([{ kind: 'layout', id: 'a' }]);
  });

  it('puts the receiving folder first after an absorb', () => {
    const plan = focusPlanFor(subject, { kind: 'absorb', projectId: 'F' }, null, 1);
    expect(plan.targets[0]).toEqual({ kind: 'project', id: 'F' });
  });

  it('plans NO folder for an exit — the design leaves for a view we are not on', () => {
    const plan = focusPlanFor(subject, { kind: 'exit', projectId: 'home' }, null, 2);
    expect(plan.targets).toEqual([{ kind: 'layout', id: 'a' }]);
  });

  it('always ends with the subject, so a plan is never empty', () => {
    const intents = [
      { kind: 'merge', targetId: 'b' },
      { kind: 'absorb', projectId: 'F' },
      { kind: 'exit', projectId: 'home' },
      { kind: 'slot', index: 2 },
      { kind: 'none' },
    ] as const;
    for (const intent of intents) {
      const plan = focusPlanFor(subject, intent, 'made-1', 0);
      expect(plan.targets.length).toBeGreaterThan(0);
      expect(plan.targets[plan.targets.length - 1]).toEqual({ kind: 'layout', id: 'a' });
    }
  });

  it('focusPlanOn names one target and carries the gap', () => {
    expect(focusPlanOn({ kind: 'project', id: 'F' }, 4)).toEqual({
      targets: [{ kind: 'project', id: 'F' }],
      vacated: 4,
    });
  });
});

describe('fallbackIndex', () => {
  it('takes the vacated slot, clamped to the shortened list', () => {
    expect(fallbackIndex(2, 5)).toBe(2);
    // The item that left was last: the new last is where the eye is, NOT a wrap
    // to the front.
    expect(fallbackIndex(4, 3)).toBe(2);
    expect(fallbackIndex(-3, 3)).toBe(0);
  });

  it('has no answer for an empty container', () => {
    expect(fallbackIndex(0, 0)).toBeNull();
    expect(fallbackIndex(2, -1)).toBeNull();
  });

  it('sends a non-finite vacated index to the FRONT, never to NaN', () => {
    // Defensive only — `vacated` comes from `findIndex`, so it is an integer
    // >= -1. But `Infinity` is the store's own "unplaced" rank and would sail
    // through a bare `Math.min`, so both unusable values resolve to the same
    // predictable place rather than to a NaN index that reads as `undefined`.
    expect(fallbackIndex(Number.POSITIVE_INFINITY, 4)).toBe(0);
    expect(fallbackIndex(Number.NaN, 4)).toBe(0);
  });
});
