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

/** The four numbers every hit test needs. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A grid item, measured. Screen coordinates, as `getBoundingClientRect` gives. */
export interface ItemRect extends Rect {
  kind: 'layout' | 'project';
  id: string;
  /** Display position within the container, 0-based. */
  index: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The breadcrumb, measured — present ONLY while the gallery is drilled into a
 * folder (S30).
 *
 * An ABSENT rect is the enforcement, not a boolean a caller has to compute
 * correctly: on the home grid there is no breadcrumb to measure, so `exit`
 * becomes UNCONSTRUCTIBLE rather than merely guarded. "Propose only what you can
 * perform" — the hardest S29 lesson — is then structural.
 */
export interface ExitTarget {
  /**
   * Where a design leaving this folder lands: the HOME project. Carried on the
   * target rather than recomputed at commit time, so the sentence the user
   * hears and the write that happens name the same destination by construction.
   */
  projectId: string;
  /** The breadcrumb button's own rect, un-inflated. */
  rect: Rect;
}

/** What the pointer is currently proposing. */
export type DropIntent =
  /** Drop onto a design: both go into a NEW folder, at the target's slot. */
  | { kind: 'merge'; targetId: string }
  /** Drop onto a folder tile: join it. */
  | { kind: 'absorb'; projectId: string }
  /** Drop on the breadcrumb: leave this folder for the home grid. */
  | { kind: 'exit'; projectId: string }
  /** Drop between items: reorder to this display index. */
  | { kind: 'slot'; index: number }
  /** Nothing valid under the pointer. */
  | { kind: 'none' };

/**
 * Hit-slop around the breadcrumb.
 *
 * `.btn` is `padding: 6px 12px` at `--text-sm` (components/app/app.css:110-122)
 * — about 30 px tall, which is a fine CLICK target and a poor DROP target for a
 * moving pointer. Symmetric on all four edges, and small enough that it cannot
 * reach the head's right-hand action cluster at the far end of a
 * `justify-content: space-between` row.
 */
export const EXIT_PAD_PX = 12;

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

function contains(r: Rect, p: Point): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

/** Grow a rect by `n` on every edge. */
function pad(r: Rect, n: number): Rect {
  return { left: r.left - n, top: r.top - n, right: r.right + n, bottom: r.bottom + n };
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
  /**
   * The breadcrumb, when the gallery is drilled into a folder. Absent on the
   * home grid, which is what makes `exit` unconstructible there.
   */
  exit?: ExitTarget,
): DropIntent {
  // TESTED FIRST, and the reason is geometric rather than stylistic.
  //
  // In normal flow the breadcrumb cannot overlap a card — `.gallery-head` and
  // `.gallery-surface` are siblings in a column flex, so their boxes are
  // disjoint. But `.gallery-grid` scrolls with `overflow-y: auto`, and
  // `getBoundingClientRect` reports a scrolled-out card's UNCLIPPED
  // coordinates: the same blindness already written up for the ghost. A card
  // scrolled above the viewport therefore has a rect lying inside the band the
  // breadcrumb occupies, and testing items first would let a card the user
  // cannot see win a drop aimed squarely at a visible control.
  //
  // The layout-only guard is the same one `absorb` carries below: the model is
  // FLAT, and there is no commit branch that takes a folder out of a folder.
  if (exit && dragged.kind === 'layout' && contains(pad(exit.rect, EXIT_PAD_PX), p)) {
    return { kind: 'exit', projectId: exit.projectId };
  }
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

// ---------------------------------------------------------------------------
// Move mode's index space (S30).
//
// A drop index counts the container AS THE USER SEES IT — which, during a
// same-container move, still shows the item being moved. `moveLayoutToProject`
// converts that to a position in the sequence WITHOUT it, and the conversion
// collapses two display indices onto one outcome: `self` and `self + 1` both
// mean "stay put".
//
// The pointer path never notices, because a pointer lands wherever it lands. The
// KEYBOARD path stepped ±1 through display space, and MEASURED against the real
// engine on a three-design grid that gave a subject at display 0:
//
//     at=0 -> 0   at=1 -> 0   at=2 -> 1   at=3 -> 2
//
// So the first ArrowRight was a silent no-op — the live region said "Position 2"
// and nothing moved — and because the old cap was `others.length` (= 2 here) the
// LAST position was unreachable altogether. That is a defect in the path S29
// designated as the WCAG 2.2 SC 2.5.7 mechanism, so it is the one path that has
// to be exactly right.
//
// The fix is to step through the distinct OUTCOMES and convert once, at the
// edge. Both directions are pure, so the round trip is provable in node — but a
// round-trip test alone is satisfied by the identity pair, which is precisely
// today's bug, so the real guard runs these against the real `moveLayoutToProject`.

/**
 * Display index -> step index. Step space has one position per distinct outcome:
 * `0..others.length`, where `others.length` is "after everything else".
 */
export function toStepIndex(display: number, self: number): number {
  if (self < 0) return display;
  return display > self ? display - 1 : display;
}

/**
 * Step index -> display index, the exact inverse for every step position.
 *
 * `w >= self` maps to `w + 1` so that the value survives the engine's
 * without-self conversion: `withoutSelf(w + 1, self) === w` whenever
 * `w + 1 > self`, and `withoutSelf(w, self) === w` whenever `w < self`.
 */
export function toDisplayIndex(step: number, self: number): number {
  if (self < 0) return step;
  return step >= self ? step + 1 : step;
}

/** The highest step index in a container the subject is part of. */
export function maxStepIndex(itemCount: number): number {
  return Math.max(0, itemCount - 1);
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
    case 'exit':
      // Names the HOME PROJECT, not the breadcrumb's "All layouts" label,
      // because that is the name `dropLayout`'s toast uses too — so the
      // announcement and the toast that follows it agree.
      return `Drop to move ${movingName} out to ${nameOf('project', intent.projectId)}`;
    case 'slot':
      return `Position ${intent.index + 1}`;
    default:
      return 'No drop here';
  }
}

// ---------------------------------------------------------------------------
// Where focus goes after a commit (S30).
//
// Every gallery commit DESTROYS the element that holds focus: a merge unmounts
// both cards and mounts a tile, an absorb and an exit unmount the card, and even
// a plain reorder moves the node. Measured in this repo's own React 19 + jsdom:
// when the focused element is removed in a commit, `document.activeElement`
// becomes `document.body` — so without a plan, every drop ends with focus on
// nothing and a keyboard user is returned to the top of the document.
//
// The plan is computed HERE, purely, so that the pointer path and the move-mode
// path cannot disagree about it. That is the S29 lesson made structural rather
// than remembered.

/** An item that can hold focus: the same key space the registry uses. */
export interface FocusTarget {
  kind: 'layout' | 'project';
  id: string;
}

export interface FocusPlan {
  /** Preferred items, most specific first. The first one on screen wins. */
  targets: FocusTarget[];
  /**
   * Display index the subject held BEFORE the commit. Used only when no target
   * survives — whatever slid into that gap is where the eye already is.
   */
  vacated: number;
}

/**
 * Where focus should land after a drop.
 *
 * `madeProjectId` is the folder a merge actually MINTED, or null when it minted
 * none — a merge refused at `MAX_PROJECTS` commits nothing and shows a toast, so
 * planning the folder that was never created would silently fall through to the
 * gap. The subject is appended in EVERY branch, so no plan is ever empty, and it
 * is the right second choice: after a refused merge the subject is still there.
 */
export function focusPlanFor(
  subject: FocusTarget,
  intent: DropIntent,
  madeProjectId: string | null,
  subjectIndex: number,
): FocusPlan {
  const targets: FocusTarget[] = [];
  if (intent.kind === 'merge' && madeProjectId) {
    targets.push({ kind: 'project', id: madeProjectId });
  } else if (intent.kind === 'absorb') {
    targets.push({ kind: 'project', id: intent.projectId });
  }
  // NOT for `exit`: the design leaves for the home grid, which the drilled-in
  // view is not showing. Rung 2 (the subject) covers the case where the folder
  // dissolved and the view fell back to home; where it did not, the subject is
  // genuinely off-screen and the gap is the honest answer.
  targets.push({ kind: subject.kind, id: subject.id });
  return { targets, vacated: subjectIndex };
}

/** One named item, then the gap it may leave. */
export function focusPlanOn(target: FocusTarget, vacated = 0): FocusPlan {
  return { targets: [target], vacated };
}

/**
 * Which display index takes focus when no planned target survived.
 *
 * Clamped rather than wrapped: the item after the one that left is where the eye
 * is, and at the end of the list that is the new last item, never the first.
 */
export function fallbackIndex(vacated: number, count: number): number | null {
  if (count <= 0) return null;
  const v = Number.isFinite(vacated) ? Math.trunc(vacated) : 0;
  return Math.min(Math.max(v, 0), count - 1);
}
