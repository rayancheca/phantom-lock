/**
 * The gallery drag, as pure geometry (S29).
 *
 * Every decision a drag makes — has it started, what is under the pointer, where
 * would the drop land — is a function of numbers, and lives here so it can be
 * tested in node. That is not tidiness: jsdom reports EVERY rect as 0x0 and has
 * no layout at all, so logic that reads `getBoundingClientRect` inside a
 * component is unprovable in the suite (the S21 `spotlight.ts` lesson). The
 * component's job is reduced to collecting rects and calling these.
 */

/** A grid item, measured. Screen coordinates, as `getBoundingClientRect` gives. */
export interface ItemRect {
  kind: 'layout' | 'project';
  id: string;
  /** Display position within the container, 0-based. */
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** What the pointer is currently proposing. */
export type DropIntent =
  /** Drop onto a design: both go into a NEW folder, at the target's slot. */
  | { kind: 'merge'; targetId: string }
  /** Drop onto a folder tile: join it. */
  | { kind: 'absorb'; projectId: string }
  /** Drop between items: reorder to this display index. */
  | { kind: 'slot'; index: number }
  /** Nothing valid under the pointer. */
  | { kind: 'none' };

/**
 * How far the pointer must travel before a press becomes a drag.
 *
 * There MUST be one. `.gallery-open` is a button covering the whole card whose
 * click switches layout and closes the gallery, so without a threshold every
 * click would be a zero-length drag and the gallery would become unopenable.
 */
export const DRAG_THRESHOLD_PX = 5;

/**
 * Touch has no threshold that works: the gallery scrolls vertically, and a 5 px
 * touch threshold steals every scroll gesture. A coarse pointer therefore picks
 * up on a LONG PRESS instead, which is also the Android gesture.
 */
export const LONG_PRESS_MS = 350;

/**
 * Fraction of a design card, measured from its centre, that means "merge" rather
 * than "reorder to this side".
 *
 * A card is a drop target for two DIFFERENT actions, so its area has to be
 * divided. 0.5 gives the merge zone the central half on each axis — big enough
 * to hit deliberately, and leaving a quarter-width lane down each edge that
 * reads as "put it before/after this one". Folder tiles are NOT divided: their
 * whole area absorbs, because "reorder next to a folder" is served by the gaps.
 */
export const MERGE_CORE = 0.5;

function contains(r: ItemRect, p: Point): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

function inMergeCore(r: ItemRect, p: Point): boolean {
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  const hw = ((r.right - r.left) * MERGE_CORE) / 2;
  const hh = ((r.bottom - r.top) * MERGE_CORE) / 2;
  return Math.abs(p.x - cx) <= hw && Math.abs(p.y - cy) <= hh;
}

/**
 * The slot a drop at `p` would land in, as a display index in the container.
 *
 * Reading order, not raw distance: the grid wraps, so the item whose CENTRE is
 * nearest can easily be on another row. Rows are found first (the pointer's y
 * against each item's vertical span), and only then the horizontal midpoint
 * decides before-or-after. A pointer below every row appends.
 */
export function slotIndexAt(p: Point, items: ItemRect[]): number {
  if (items.length === 0) return 0;
  const ordered = [...items].sort((a, b) => a.index - b.index);
  // The last item whose row starts above the pointer — i.e. the row it is on, or
  // the last row when the pointer is below everything.
  const row = ordered.filter((r) => p.y >= r.top && p.y <= r.bottom);
  if (row.length === 0) {
    // NOT on any row — the gap between two rows, the space under the grid, or
    // above the first row. Here the horizontal midpoint must NOT decide: in a
    // single-column grid every gap is "not on a row", and the x-scan then
    // answered "before the card above" for a pointer clearly BELOW it. Vertical
    // position is the only meaningful signal, so the drop goes after the last
    // item of the last row above — which for the space under the grid is an
    // append, and above the first row is slot 0.
    const above = ordered.filter((r) => r.bottom < p.y);
    if (above.length === 0) return ordered[0].index;
    const lastTop = above.reduce((m, r) => Math.max(m, r.top), -Infinity);
    const lastRow = above.filter((r) => r.top === lastTop);
    return lastRow[lastRow.length - 1].index + 1;
  }
  for (const r of row) {
    if (p.x < (r.left + r.right) / 2) return r.index;
  }
  return row[row.length - 1].index + 1;
}

/**
 * What a drop at `p` would do. `draggedKey` is excluded from every test — an
 * item cannot be dropped onto itself, and it must not compete for its own slot.
 */
export function resolveDrop(
  p: Point,
  items: ItemRect[],
  dragged: { kind: 'layout' | 'project'; id: string },
  /**
   * May a design-on-design drop create a folder here? FALSE inside a drilled-in
   * folder: the model is flat, so `mergeIntoNewProject` would put the new folder
   * on the HOME grid and pull both designs out of the folder the user is looking
   * at, leaving that view empty. Measured on the real store before it shipped.
   */
  canMerge = true,
): DropIntent {
  const others = items.filter((r) => !(r.kind === dragged.kind && r.id === dragged.id));
  const over = others.find((r) => contains(r, p));
  // BOTH container proposals require the dragged item to be a DESIGN. The model
  // is flat — `Layout.projectId` points one way and a `Project` has no parent —
  // so a folder can never go inside anything. Getting this wrong for `absorb`
  // was a real bug found live: a folder dragged onto another folder announced
  // "Drop to move X into Y", and then the commit silently did nothing, because
  // no branch handles a project being absorbed. A drag that proposes an action
  // must either perform it or not propose it.
  if (over && dragged.kind === 'layout') {
    // A folder tile absorbs across its whole area — it is one target, so it does
    // not need dividing the way a design card does.
    if (over.kind === 'project') return { kind: 'absorb', projectId: over.id };
    // A design merges only from its core, leaving an edge lane for reordering.
    if (over.kind === 'layout' && canMerge && inMergeCore(over, p)) {
      return { kind: 'merge', targetId: over.id };
    }
  }
  return { kind: 'slot', index: slotIndexAt(p, others) };
}

/**
 * Where the reorder caret should be drawn for a `slot` intent: the LEFT edge of
 * the item that would be pushed right, or the right edge of the last item when
 * the drop appends. Returns null when there is nothing to draw against.
 */
export function caretRect(
  index: number,
  items: ItemRect[],
  gap: number,
): { x: number; top: number; height: number } | null {
  if (items.length === 0) return null;
  const ordered = [...items].sort((a, b) => a.index - b.index);
  const at = ordered.find((r) => r.index === index);
  if (at) return { x: at.left - gap / 2, top: at.top, height: at.bottom - at.top };
  // No item holds that index — either the drop appends, or the index is the
  // DRAGGED item's own (the caller filters the subject out, and `slotIndexAt`
  // legitimately returns it whenever the pointer sits just before its own slot).
  // Anchoring to the global last item put the caret rows away from the drop on
  // the single most common gesture in the feature; the nearest PRECEDING item is
  // where the drop actually lands.
  const before = ordered.filter((r) => r.index < index);
  const anchor = before.length > 0 ? before[before.length - 1] : ordered[ordered.length - 1];
  return { x: anchor.right + gap / 2, top: anchor.top, height: anchor.bottom - anchor.top };
}

/**
 * Has this press become a drag yet?
 *
 * Split out because the answer differs by pointer type and both halves are easy
 * to get subtly wrong: a fine pointer arms on DISTANCE (so a click stays a
 * click), a coarse one on TIME (so a swipe stays a scroll).
 */
export function dragArmed(
  from: Point,
  to: Point,
  elapsedMs: number,
  coarse: boolean,
): boolean {
  if (coarse) return elapsedMs >= LONG_PRESS_MS;
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD_PX;
}

/**
 * A short, literal sentence for the live region.
 *
 * The whole of the drag's meaning is visual, so a screen-reader user gets
 * nothing at all unless every state change is narrated. Deliberately names the
 * ACTION, not the geometry ("would create a folder", not "over card 3").
 */
export function describeIntent(
  intent: DropIntent,
  nameOf: (kind: 'layout' | 'project', id: string) => string,
  movingName: string,
): string {
  switch (intent.kind) {
    case 'merge':
      return `Drop to put ${movingName} and ${nameOf('layout', intent.targetId)} in a new folder`;
    case 'absorb':
      return `Drop to move ${movingName} into ${nameOf('project', intent.projectId)}`;
    case 'slot':
      return `Position ${intent.index + 1}`;
    default:
      return 'No drop here';
  }
}
