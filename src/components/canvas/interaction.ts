/**
 * Pure, DOM-free helpers for the canvas interaction layer (Session 4).
 *
 * These were extracted OUT of `SimCanvas.tsx` so the interaction logic is
 * unit-testable under the vitest `node` env and so the component stops growing.
 * It was over the 800-line cap from S16 until S38, which finished the job. Nothing here touches `document`, `window`, `canvas`,
 * or `Image` — `watchDevicePixelRatio` takes an injectable `win`.
 */
import type {
  Scene,
  SceneObject,
  Selection,
  SpeakerObj,
  ToolMode,
  Vec2,
  WallObj,
} from '../../engine/types';
import { closestPointOnSegment, distPointSegment, pointInPolygon } from '../../engine/geometry';
import { hitInactiveSeat, hitTestNodes, hitTestObjects } from '../../engine/hit';
import * as v from '../../engine/vec';

// ---------------------------------------------------------------------------
// Fix 1 — dead +Door/+Window hover chips
// ---------------------------------------------------------------------------

export interface WallHover {
  id: string;
  at: Vec2;
}

/**
 * The chip's three screen-space radii (S38: moved down from `SimCanvas.tsx`).
 *
 * They live beside the functions that consume them — `wallHoverAt` takes the
 * appear radius and `chipStaysVisible` takes the other two — rather than in the
 * component, which is fighting the 800-line cap. `WALL_HOVER_APPEAR_PX` in
 * particular now has TWO consumers (`pick.ts`'s opening branch and the
 * component's own two hover paths), so leaving it in the component would have
 * made the component a dependency of the pure module that reads it.
 */
/** Hover this near a wall before the door/window chip appears. */
export const WALL_HOVER_APPEAR_PX = 18;
/** Once shown, the chip stays anchored within this radius so it stays reachable
 *  — otherwise its anchor chases the cursor along the wall. */
export const WALL_HOVER_HOLD_PX = 46;
/** Slack around the chip's own box, covering the gap between wall and chip. */
export const WALL_HOVER_CHIP_MARGIN_PX = 24;

/**
 * Nearest wall to `p` within `maxDist`, plus the closest point on it — the
 * anchor for the door/window insertion chips. Ignores every non-wall object.
 * Pure port of SimCanvas's inline hover scan.
 */
export function wallHoverAt(
  objects: readonly SceneObject[],
  p: Vec2,
  maxDist: number,
): WallHover | null {
  let found: WallHover | null = null;
  let best = maxDist;
  for (const o of objects) {
    if (o.kind !== 'wall') continue;
    const d = distPointSegment(p, o.a, o.b);
    if (d < best) {
      best = d;
      found = { id: o.id, at: closestPointOnSegment(p, o.a, o.b).point };
    }
  }
  return found;
}

/** A screen-space box, in the same coordinates as a DOM `getBoundingClientRect`. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Should the door/window chip stay on screen while the cursor is off every wall?
 *
 * The chip has to survive the trip from the wall to its own buttons, or it can
 * never be clicked. The original test measured a fixed radius from the wall
 * ANCHOR — but the chip is rendered CENTRED ABOVE that anchor
 * (`translate(-50%, calc(-100% - 10px))`) and is far wider than the radius, so
 * "+ Door" and "+ Window" both sit outside it. Moving toward either button
 * dismissed the chip: unreachable by construction, which is exactly what the
 * user hit ("I have the option but I can't click it, it runs away").
 *
 * So the real test is the chip's OWN box, inflated by a small margin to cover
 * the gap between the wall and the chip. Measuring the rendered element also
 * means this cannot drift when the chip's size, padding or zoom changes.
 *
 * `chip` is null for the frame before the element mounts; the anchor radius is
 * kept as the fallback for exactly that case.
 */
export function chipStaysVisible(
  cursor: Vec2,
  anchorScreen: Vec2,
  chip: ScreenRect | null,
  holdPx: number,
  marginPx: number,
): boolean {
  if (v.dist(anchorScreen, cursor) <= holdPx) return true;
  return insideRect(cursor, chip, marginPx);
}

/**
 * Is the cursor within `marginPx` of the chip's own box?
 *
 * Exported separately because the two uses differ. Deciding whether to RELOCATE
 * the chip to a nearer wall must consult ONLY this box — not the anchor radius —
 * or hovering along the wall the chip belongs to would suppress a neighbouring
 * wall's chip. Deciding whether to KEEP the chip when off every wall may use
 * either (see `chipStaysVisible`).
 */
export function insideRect(cursor: Vec2, rect: ScreenRect | null, marginPx: number): boolean {
  if (!rect) return false;
  return (
    cursor.x >= rect.left - marginPx &&
    cursor.x <= rect.right + marginPx &&
    cursor.y >= rect.top - marginPx &&
    cursor.y <= rect.bottom + marginPx
  );
}

/**
 * Build a door/window rect centred at `at`, aligned to the wall's direction.
 * `id` is injected (not generated inside) so the result is deterministic and
 * unit-testable; the caller passes `createId('rect')`.
 */
export function makeOpening(
  wall: WallObj,
  at: Vec2,
  role: 'door' | 'window',
  id: string,
): SceneObject {
  const dir = v.norm(v.sub(wall.b, wall.a));
  return {
    id,
    kind: 'rect',
    center: at,
    w: role === 'door' ? 0.9 : 1.2,
    h: role === 'door' ? 0.1 : 0.12,
    rotation: Math.atan2(dir.y, dir.x),
    absorption: role === 'door' ? 0.25 : 0.04,
    label: role === 'door' ? 'Door' : 'Window',
    role,
    height: role === 'door' ? 2.05 : 2.2,
    doorOpen: role === 'door' ? true : undefined,
    // Swing defaults for a fresh door (plan-symbol only — no acoustic effect).
    // Windows carry none (mirrors `doorOpen: undefined`).
    swingDeg: role === 'door' ? 90 : undefined,
    hingeEnd: role === 'door' ? 'start' : undefined,
    swingSide: role === 'door' ? 'in' : undefined,
  };
}

/** What the chip reducer needs to know about the frame it is deciding for. */
export interface WallHoverContext {
  objects: readonly SceneObject[];
  /** Cursor in the CANVAS's own coordinate frame, px — the same frame `chipBox`
   *  is expressed in, which is why the caller subtracts the host's origin. */
  cursorS: Vec2;
  /** Cursor in world metres. */
  worldPt: Vec2;
  /** The chip's own box, or null when it is not mounted. */
  chipBox: ScreenRect | null;
  /** `WALL_HOVER_APPEAR_PX` in world metres — the caller owns the view scale. */
  appearDist: number;
  /** Project the latched anchor to screen. A callback for the same reason
   *  `selectionFromBand` takes one: this module never imports the camera. */
  project: (w: Vec2) => Vec2;
}

/**
 * Where the +Door/+Window chip should be on the next hover frame (S38: lifted
 * out of `SimCanvas.applyMove`, where it was an inline `setWallHover(prev => …)`
 * and therefore unreachable from any committed test).
 *
 * Three rules in a deliberate order, each of which was a shipped bug:
 *
 * 1. If the cursor is on (or heading for) the chip, KEEP it — even when another
 *    wall is nearer. Without this the chip relocates to whichever wall is closest
 *    as the cursor crosses the plan, so on a dense floorplan it jumps out from
 *    under the pointer and its buttons can never be clicked at all. That is the
 *    "it runs away from the mouse" report.
 * 2. On a wall: keep the SAME wall's latched anchor so the chip does not chase
 *    the cursor along it (a screen-vertical wall's chip would retreat forever),
 *    but switch to a DIFFERENT wall so a neighbour's is reachable.
 * 3. Off every wall: hold while the cursor is still near the chip's BOX, not
 *    merely near the anchor — the chip renders centred ABOVE the anchor and is
 *    wider than `WALL_HOVER_HOLD_PX`, so an anchor-only test dismissed it the
 *    instant the cursor reached for a button.
 *
 * `alive` self-heals a latch whose wall was deleted underneath it.
 */
export function nextWallHover(prev: WallHover | null, ctx: WallHoverContext): WallHover | null {
  const alive = prev !== null && ctx.objects.some((o) => o.id === prev.id);
  if (prev && alive && insideRect(ctx.cursorS, ctx.chipBox, WALL_HOVER_CHIP_MARGIN_PX)) return prev;
  const found = wallHoverAt(ctx.objects, ctx.worldPt, ctx.appearDist);
  if (found) return prev && prev.id === found.id ? prev : found;
  if (!prev || !alive) return null;
  return chipStaysVisible(
    ctx.cursorS,
    ctx.project(prev.at),
    ctx.chipBox,
    WALL_HOVER_HOLD_PX,
    WALL_HOVER_CHIP_MARGIN_PX,
  )
    ? prev
    : null;
}

/**
 * The opening tool's ghost: the door/window that a click right here would cut,
 * or null when the cursor is off every wall. Shares `wallHoverAt` with `pick.ts`'s
 * click path and `makeOpening` with the interpreter that click path feeds, so the
 * ghost cannot promise an opening the click would not create.
 */
export function openingGhost(
  objects: readonly SceneObject[],
  worldPt: Vec2,
  appearDist: number,
  role: 'door' | 'window',
): SceneObject | null {
  const hover = wallHoverAt(objects, worldPt, appearDist);
  const wall = hover ? objects.find((o) => o.id === hover.id) : null;
  if (!hover || !wall || wall.kind !== 'wall') return null;
  return { ...makeOpening(wall, hover.at, role, 'preview'), id: 'preview' };
}

// ---------------------------------------------------------------------------
// Fix 2 — Backspace chain-undo (per-segment wall-id groups)
// ---------------------------------------------------------------------------

// `popChainSegment` MOVED to `chain.ts` in S38 — it is chain code, and it
// predates that module by four sessions. Deliberately NOT re-exported from here,
// unlike `render.ts`'s re-export of `view.ts`: `chain.ts` imports `snapPoint`
// from `placement.ts`, which imports `makeOpening` from THIS file, so the
// convenience re-export closed a genuine runtime cycle
// (interaction -> chain -> placement -> interaction). Its only remaining caller
// was a test, so the import moved instead. Import it from './chain'.

// ---------------------------------------------------------------------------
// Fix 3 — marquee / lasso selection algebra + band geometry
// ---------------------------------------------------------------------------

/** The object + speaker ids a selection currently holds (empty sets for a
 *  non-group selection). Shared by ⌘-click and additive band selection. */
export function selectionSets(sel: Selection): {
  objectIds: Set<string>;
  speakerIds: Set<string>;
} {
  return {
    objectIds: new Set(
      sel?.type === 'multi' ? sel.objectIds : sel?.type === 'object' ? [sel.id] : [],
    ),
    speakerIds: new Set(
      sel?.type === 'multi' ? sel.speakerIds : sel?.type === 'speaker' ? [sel.id] : [],
    ),
  };
}

/** Collapse id sets into the narrowest Selection (null → speaker → object →
 *  multi). Single source of truth for both ⌘-click and band selection. */
export function resolveSelection(
  objectIds: Iterable<string>,
  speakerIds: Iterable<string>,
): Selection {
  const objs = [...objectIds];
  const spks = [...speakerIds];
  const total = objs.length + spks.length;
  if (total === 0) return null;
  if (total === 1 && spks.length === 1) return { type: 'speaker', id: spks[0] };
  if (total === 1) return { type: 'object', id: objs[0] };
  return { type: 'multi', objectIds: objs, speakerIds: spks };
}

/** Is screen point `s` inside the axis-aligned marquee spanning corners a→b? */
export function pointInMarquee(s: Vec2, a: Vec2, b: Vec2): boolean {
  return (
    s.x >= Math.min(a.x, b.x) &&
    s.x <= Math.max(a.x, b.x) &&
    s.y >= Math.min(a.y, b.y) &&
    s.y <= Math.max(a.y, b.y)
  );
}

/**
 * Ids of objects/speakers whose centre (wall: midpoint) falls inside the
 * screen-space band. `project` maps a world point to the same screen frame the
 * band was drawn in (pass `w => worldToScreen(w, view)`) — keeping one frame is
 * what makes the hit test correct under a rotated/panned view. A click-length
 * band (marquee < 2 pts, lasso < 3) selects nothing. Hits only; caller merges base.
 */
export function itemsInBand(
  objects: readonly SceneObject[],
  speakers: readonly SpeakerObj[],
  band: Vec2[],
  shape: 'marquee' | 'lasso',
  project: (w: Vec2) => Vec2,
): { objectIds: string[]; speakerIds: string[] } {
  const objectIds: string[] = [];
  const speakerIds: string[] = [];
  const enough = shape === 'marquee' ? band.length >= 2 : band.length >= 3;
  if (!enough) return { objectIds, speakerIds };
  const inBand = (world: Vec2): boolean => {
    const s = project(world);
    if (shape === 'marquee') return pointInMarquee(s, band[0], band[band.length - 1]);
    return pointInPolygon(s, band);
  };
  for (const o of objects) {
    const c = o.kind === 'wall' ? v.lerp(o.a, o.b, 0.5) : o.center;
    if (inBand(c)) objectIds.push(o.id);
  }
  for (const s of speakers) {
    if (inBand(s.pos)) speakerIds.push(s.id);
  }
  return { objectIds, speakerIds };
}

/**
 * Full marquee/lasso → Selection: seeds from `base` when additive, adds the band
 * hits, and collapses. A click-length band (no drag) contributes nothing, so it
 * DESELECTS — matching a plain empty select-click — or preserves `base` verbatim
 * when additive (so a held listener/selection survives an additive mis-click).
 */
export function selectionFromBand(args: {
  objects: readonly SceneObject[];
  speakers: readonly SpeakerObj[];
  band: Vec2[];
  shape: 'marquee' | 'lasso';
  project: (w: Vec2) => Vec2;
  additive: boolean;
  base: Selection;
}): Selection {
  const { objects, speakers, band, shape, project, additive, base } = args;
  const seed = additive
    ? selectionSets(base)
    : { objectIds: new Set<string>(), speakerIds: new Set<string>() };
  const hits = itemsInBand(objects, speakers, band, shape, project);
  for (const id of hits.objectIds) seed.objectIds.add(id);
  for (const id of hits.speakerIds) seed.speakerIds.add(id);
  if (seed.objectIds.size + seed.speakerIds.size === 0) return additive ? base : null;
  return resolveSelection(seed.objectIds, seed.speakerIds);
}

// ---------------------------------------------------------------------------
// Fix 4 — repaint when devicePixelRatio changes (monitor with a different DPR)
// ---------------------------------------------------------------------------

/**
 * Call `onChange` whenever the device pixel ratio changes (e.g. the window moves
 * to a monitor with a different DPR — which changes neither CSS size nor any
 * React dep, so nothing else re-rasterizes the canvas). Uses the one-shot
 * matchMedia idiom: a `(resolution: Xdppx)` query fires once when leaving that
 * dpr, so we re-arm for the new dpr inside the handler. Returns an unsubscribe
 * that cancels a queued re-arm and removes the live listener (leak-safe on
 * unmount). No-ops when matchMedia is unavailable (old WebKit, vitest node env).
 */
export function watchDevicePixelRatio(
  onChange: () => void,
  win: Pick<Window, 'matchMedia' | 'devicePixelRatio'> | undefined = typeof window !== 'undefined'
    ? window
    : undefined,
): () => void {
  if (!win || typeof win.matchMedia !== 'function') return () => {};
  let mql: MediaQueryList | null = null;
  let cancelled = false;
  function subscribe(): void {
    if (cancelled) return;
    const next = win!.matchMedia(`(resolution: ${win!.devicePixelRatio || 1}dppx)`);
    // Pre-2020 WebKit exposes matchMedia but its MediaQueryList lacks
    // addEventListener (only the deprecated addListener) — no-op rather than throw.
    if (typeof next.addEventListener !== 'function') return;
    mql = next;
    mql.addEventListener('change', handle, { once: true });
  }
  function handle(): void {
    onChange();
    subscribe(); // re-arm for the NEW dpr (the one-shot query won't fire again)
  }
  subscribe();
  return () => {
    cancelled = true;
    mql?.removeEventListener('change', handle);
  };
}

// ---------------------------------------------------------------------------
// Fix 5 — grab / grabbing cursor affordance
// ---------------------------------------------------------------------------

/** Would a pointer-down at `p` begin a drag (speaker, seat, wall, furniture)?
 *  Mirrors the select-mode hit priority so the grab cursor matches draggability. */
export function isDraggableAt(scene: Scene, p: Vec2, tol: number): boolean {
  return Boolean(
    hitTestNodes(scene, p, tol) || hitInactiveSeat(scene, p, tol) || hitTestObjects(scene, p, tol),
  );
}

/** Canvas cursor: crosshair for any drawing tool; in select mode, grabbing while
 *  a drag is live, grab while hovering something draggable, else the default. */
export function hoverCursor(mode: ToolMode, state: { hoverGrab: boolean; dragging: boolean }): string {
  if (mode !== 'select') return 'crosshair';
  if (state.dragging) return 'grabbing';
  if (state.hoverGrab) return 'grab';
  return 'default';
}

// ---------------------------------------------------------------------------
// Fix 6 — canvas keyboard gating (R / Backspace / Space) under overlays
// ---------------------------------------------------------------------------

export type CanvasKeyAction =
  | { kind: 'none' }
  | { kind: 'rotate'; deltaDeg: number }
  | { kind: 'chainBackspace' }
  | { kind: 'space'; armed: boolean };

/**
 * Decide what a canvas window-key event should do. An open overlay (dialog, the
 * full-screen gallery/compare) gates the view-rotate R and the chain-Backspace;
 * Space never arms panning under an overlay but a keyup ALWAYS disarms (so pan
 * can't get stuck armed behind a card).
 *
 * Interactive targets — form fields, and since S7 also buttons/links/summaries —
 * swallow the keydown side: a focused toolbar or legend button must not arm pan
 * on Space or spin the view on `r`. That replaces the ad-hoc `stopPropagation`
 * the Legend carried (which also swallowed Escape and undo).
 *
 * The keyup half of Space is deliberately handled ABOVE that exemption. Holding
 * Space, Tab-ing to a button and releasing there would otherwise never disarm,
 * leaving every later click panning instead of selecting.
 */
export function canvasKeyAction(
  e: {
    type: string;
    key: string;
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    targetTag: string | undefined;
  },
  overlayOpen: boolean,
  hasChain: boolean,
): CanvasKeyAction {
  // A Space keyup ALWAYS disarms, whatever the target — the invariant this
  // function documents. Must come first, or the widened exemption below can
  // strand pan armed forever.
  if (e.code === 'Space' && e.type !== 'keydown') return { kind: 'space', armed: false };

  const interactiveTag =
    e.targetTag === 'INPUT' ||
    e.targetTag === 'TEXTAREA' ||
    e.targetTag === 'SELECT' ||
    e.targetTag === 'BUTTON' ||
    e.targetTag === 'A' ||
    e.targetTag === 'SUMMARY';
  if (interactiveTag) return { kind: 'none' };

  if (e.code === 'Space') {
    return { kind: 'space', armed: !overlayOpen };
  }
  if (overlayOpen) return { kind: 'none' };
  if (e.type === 'keydown' && (e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
    return { kind: 'rotate', deltaDeg: e.shiftKey ? -15 : 15 };
  }
  if (e.type === 'keydown' && e.key === 'Backspace' && hasChain) {
    return { kind: 'chainBackspace' };
  }
  return { kind: 'none' };
}
