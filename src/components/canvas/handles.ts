import type { CircleObj, RectObj, Scene, Selection, ToolMode, Vec2 } from '../../engine/types';
import type { View } from './view';
import { worldToScreen } from './view';
import { SNAP_STEP } from './placement';

/**
 * §16 — Word-style direct-manipulation grips (S36). Pure, DOM-free, node-tested.
 *
 * > "i also want to be able to change the shape and size and rotation of objects
 * > with my mouse just like in microsoft word" — owner, 2026-08-03.
 *
 * Everything here is a pure function of (object, view, pointer). SimCanvas supplies
 * the gesture and nothing else, which is the same split `interaction.ts` and
 * `placement.ts` already use — and the only split that is PROVABLE, because jsdom
 * dispatches a plain `Event` for pointer events (TRAP 21) and can never drive the
 * wiring.
 *
 * THREE contracts that are not obvious and are each load-bearing:
 *
 * 1. THE LOCAL FRAME. Every grip lives in the object's ROTATED frame, where local
 *    +x is `(cos rot, sin rot)` and local +y is `(-sin rot, cos rot)` — verified
 *    against `rectCorners` to 6 decimals. Maple Court is a -12.83 deg plan, so a
 *    world-axis implementation is visibly wrong on the one layout that matters.
 *
 * 2. CLAMP, NEVER MIRROR. Word mirrors a rect dragged through itself. This app
 *    must not, and the reason is measured rather than stylistic. A negative `w`
 *    is INVISIBLE to the two consumers that draw and simulate the object, and
 *    FATAL to the one that selects it:
 *      - `rectCorners` (geometry.ts:108) builds from `hw = r.w / 2` with no sign
 *        guard, so `w = -4` emits the IDENTICAL four corners in swapped winding.
 *        It renders normally and `collectSurfaces` still blocks rays.
 *      - `pointInRect` (geometry.ts:137) compares `Math.abs(local.x)` against the
 *        SIGNED half-extent, so it is false everywhere. Measured over a 41x41
 *        sweep of the footprint: 1587 of 1681 points hit at `w = +4`, and
 *        **0 of 1681** at `w = -4`.
 *    So a mirrored rect is unselectable and undeletable while still absorbing
 *    sound, recoverable only by `n`/`Shift+N` cycling — and then
 *    `sanitizeObject`'s `Math.max(0.05, o.w)` (scene.ts:495) silently collapses
 *    it to a 5 cm sliver on the next save->load. A grip dragged past its anchor
 *    therefore stops at the minimum.
 *
 * 3. THE MINIMUMS ARE THE INSPECTOR'S. `MIN_SPAN_M`/`MIN_RADIUS_M` are 0.1 because
 *    that is what `InspectorPanel` already offers as `min` (lines 420/421/471), NOT
 *    because 0.1 is a nice number — one control must not be able to reach a value
 *    the other refuses. Both sit ABOVE the sanitizer's 0.05 floor and are multiples
 *    of `SNAP_STEP`, so a clamped, snapped result is a FIXED POINT of both the grid
 *    and a save->load round trip (the S32 quantise-then-clamp lesson).
 */

export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type HandleId = ResizeHandleId | 'rot';

/** Smallest `w`/`h` a grip may leave. Mirrors `InspectorPanel` Width/Depth min. */
export const MIN_SPAN_M = 0.1;
/** Smallest circle `r` a grip may leave. Mirrors `InspectorPanel` Radius min.
 *  Deliberately its OWN constant: a radius is not a span, and equal values today
 *  must not let a future change to one silently move the other. */
export const MIN_RADIUS_M = 0.1;
/** A door's clear opening, mirroring the `InspectorPanel` door branch (343/344). */
export const DOOR_MIN_W_M = 0.6;
export const DOOR_MAX_W_M = 2.4;

/**
 * Below this on-screen size (px, the SHORTER side) an object gets no grips at all.
 *
 * Not a taste call — without it the grips eat the object's own move area, which is
 * the app's most-used gesture. A self-review measured the shipped demo at its
 * default fit view (66.23 px/m): the fraction of an object's footprint that would
 * start a RESIZE instead of a MOVE was **Bookshelf 66.5 %, Window 54.6 %, Plant
 * 54.1 %, Cabinet 41 %**. A bookshelf is ~0.3 m deep — 20 px on screen — so two
 * opposing 11 px grip discs cover it completely and there is no interior left.
 *
 * Editors solve this by hiding the handles and making you zoom in, and so does
 * this: below the threshold the object is move-only, and the Inspector still
 * resizes it. `INTERIOR_CORE_PX` then protects the middle of everything larger.
 */
export const MIN_GRIP_SPAN_PX = 46;
/**
 * The object's own interior always MOVES: a grip can only be grabbed within this
 * many px of the outline. Without it a big object is still mostly grip discs at a
 * zoomed-out view, and "select, look, drag to nudge" — the standard placement
 * loop — silently resizes instead.
 */
export const INTERIOR_CORE_PX = 12;
/** Drawn grip radius, screen px. Matches the existing `drawHandle` primitive. */
export const HANDLE_R_PX = 4.5;
/** Grab tolerance, screen px. Comfortably above the 4.5 px glyph so the grip is
 *  reachable without pixel-hunting; well under the 24 px SC 2.5.8 target size,
 *  which the grips do not claim to meet — see the a11y note on `handleTargetFor`. */
export const HANDLE_HIT_PX = 11;
/** How far past the top edge the rotate grip floats, screen px. */
export const ROT_OFFSET_PX = 22;
/** Shift-snap increment for the rotate grip: 15 deg, the Word contract. */
export const ROT_SNAP_RAD = (15 * Math.PI) / 180;

/**
 * Below this (metres, or radians for a turn) a gesture counts as having changed
 * nothing, so the same object reference comes back.
 *
 * It CANNOT be exact equality, and that is worth spelling out because the
 * obvious code is `nw === o.w`. Projecting the pointer into the object's local
 * frame and back is a `cos`/`sin` round trip, which is not bit-exact: dropping a
 * grip on its own exact world position returns `h = 1.9999999999999998` for
 * `h = 2` on the -12.83 deg fixture. So exact equality never fires for precisely
 * the rotated objects this feature exists to serve, and every frame of a
 * stationary pointer would write a new object — the S23 non-bit-exactness lesson,
 * found here by a test rather than by inspection.
 *
 * 1e-9 m is ~5e-7 px at MAX_SCALE and eleven orders below the 0.05 m grid, while
 * sitting comfortably above the ~1e-11 m rounding noise at the 100 km coordinate
 * limit the importer allows.
 */
const NOOP_EPS = 1e-9;

export interface Handle {
  id: HandleId;
  /** Screen-space position, px. */
  at: Vec2;
}

export interface ResizeOpts {
  /** Shift — lock the aspect ratio (corner grips only). */
  aspect: boolean;
  /** Alt — resize about the centre instead of the opposite corner. */
  fromCentre: boolean;
  /** `settings.snap` — quantise the resulting SPAN to the 0.05 m grid. */
  snapOn: boolean;
}

/** Local-frame sign of each resize grip: +x is along `w`, +y is along `h`. */
const SIGN: Record<ResizeHandleId, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

const RECT_HANDLES: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** An OPENING's `w` is its clear opening and its `h` is the leaf/pane thickness —
 *  so only the two along-wall grips are offered. */
const OPENING_HANDLES: ResizeHandleId[] = ['e', 'w'];

/**
 * Doors AND windows: both are holes cut into a wall, both keep `w` as the clear
 * opening and `h` as a thickness the user has no reason to drag, and both are
 * held on their wall by `openingMagnetFor`.
 *
 * Windows are grouped with doors here even though `canRotateSel` does not, and
 * that divergence is deliberate and measured rather than an oversight. A window
 * is built at `w 1.2 / h 0.12` (`makeOpening`), so at an ordinary zoom its n/s
 * grips sit ~3 px either side of its spine: a self-review measured **63 % of a
 * window's footprint** starting a resize, where a mis-aim silently changes the
 * PANE THICKNESS (h 0.12 -> 0.10) or, via the rotate grip, turns it off its wall.
 * And the turn would not even survive: `moveObjectTo` routes every window through
 * `openingMagnetFor`, which overwrites `rotation` with the host wall's angle on
 * the very next drag — the §4d failure, whose lesson is not to ship an affordance
 * the app revokes. `q`/`e` and the Inspector slider still offer window rotation,
 * unchanged; that pre-existing inconsistency is filed as ideas.md §16b.
 */
function isOpening(o: Sizable): boolean {
  return o.kind === 'rect' && (o.role === 'door' || o.role === 'window');
}
const CIRCLE_HANDLES: ResizeHandleId[] = ['n', 'e', 's', 'w'];

type Sizable = RectObj | CircleObj;

/** Local basis of a rect: `[along-w, along-h]`, matching `rectCorners`. */
function basis(rotation: number): [Vec2, Vec2] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [
    { x: c, y: s },
    { x: -s, y: c },
  ];
}

function isRotatable(o: Sizable): o is RectObj {
  // EXACTLY `canRotateSel` (CanvasStage.tsx:103) and `rotateSelectedRect`
  // (keyboard.ts:205). Restated rather than re-derived on purpose: a second,
  // independently-written predicate is how the two drift apart.
  return o.kind === 'rect' && !isOpening(o);
}

/**
 * THE ONE definition of "the grips are live on this object", read by the renderer
 * AND by the pointer hit test — so "drawn" and "grabbable" cannot drift apart (the
 * S30 `containerIntentFor` lesson).
 *
 * `overlayOpen` is in here for the S4 reason: SimCanvas stays mounted underneath
 * the gallery, compare and proposal overlays with its listeners live, so grips
 * drawn there would be a mutate-through-a-dialog path.
 *
 * A11y note, stated precisely rather than flattered:
 *   - SC 2.1.1 is met and untouched: `InspectorPanel`'s Width/Depth/Radius number
 *     fields and its rotation slider are keyboard-operable, and `q`/`e` rotate.
 *   - SC 2.5.7 (Dragging Movements) is met FOR SIZE AND ANGLE: both are reachable
 *     with a single pointer and no dragging, via those same `<input type="number">`
 *     spinners and the range slider. What is NOT reachable that way is the
 *     incidental re-anchoring — an anchored resize also moves `center` — because
 *     the app has no non-drag pointer path for object POSITION at all. That gap is
 *     pre-existing (it is equally true of the plain move drag) and app-wide, not
 *     something these grips introduce; Alt-resize keeps the centre fixed and so
 *     has no such residue.
 *   - SC 2.5.8 (Target Size) is met under the *Equivalent control* exception: the
 *     same Inspector controls are on the same page and comfortably exceed 24 px.
 *     The grips are additionally hidden on coarse pointers.
 * `SelectionActions` is the coarse-pointer surface for ROTATE, nudge and delete —
 * it has no resize button, so touch resizing is the Inspector's job, not its.
 */
export function handleTargetFor(
  scene: Scene,
  selection: Selection,
  opts: { mode: ToolMode; overlayOpen: boolean },
): Sizable | null {
  if (opts.overlayOpen || opts.mode !== 'select') return null;
  if (!selection || selection.type !== 'object') return null;
  const o = scene.objects.find((x) => x.id === selection.id);
  if (!o || o.kind === 'wall') return null;
  return o;
}

/** The object's on-screen size along its own two axes, px. */
export function screenSpan(o: Sizable, view: View): { a: number; b: number } {
  return o.kind === 'circle'
    ? { a: o.r * 2 * view.scale, b: o.r * 2 * view.scale }
    : { a: o.w * view.scale, b: o.h * view.scale };
}

/**
 * Too small on screen for grips to coexist with its own move area.
 *
 * Only the axes that actually CARRY grips are considered, which matters for
 * exactly one case and it is not a corner case: a DOOR's `h` is the leaf
 * thickness, 0.1 m — about 6 px at any ordinary zoom — so a gate on the shorter
 * side would refuse a door grips at every scale and silently delete the one
 * resize a door is for. A door has grips on `w` only, so `w` is what is asked
 * about. (Caught by the door test the moment the gate was added.)
 */
export function tooSmallForGrips(o: Sizable, view: View): boolean {
  const s = screenSpan(o, view);
  if (isOpening(o)) return s.a < MIN_GRIP_SPAN_PX;
  return Math.min(s.a, s.b) < MIN_GRIP_SPAN_PX;
}

/**
 * Is this screen point deep enough inside the object to be a MOVE rather than a
 * grip? Measured in the object's own frame, in screen px.
 */
function insideCore(o: Sizable, view: View, p: Vec2): boolean {
  const c = worldToScreen(o.center, view);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (o.kind === 'circle') {
    return Math.hypot(dx, dy) < o.r * view.scale - INTERIOR_CORE_PX;
  }
  // The object's local axes as they appear ON SCREEN: its own rotation plus the
  // view's. Forgetting `view.rot` here would misjudge the core on a twisted plan.
  const a = o.rotation + view.rot;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const lx = Math.abs(dx * ca + dy * sa);
  const ly = Math.abs(-dx * sa + dy * ca);
  return lx < (o.w * view.scale) / 2 - INTERIOR_CORE_PX && ly < (o.h * view.scale) / 2 - INTERIOR_CORE_PX;
}

/** Every grip for this object, in SCREEN space. Empty when it is too small. */
export function handlesFor(o: Sizable, view: View): Handle[] {
  if (tooSmallForGrips(o, view)) return [];
  const centre = worldToScreen(o.center, view);

  if (o.kind === 'circle') {
    return CIRCLE_HANDLES.map((id) => {
      const s = SIGN[id];
      return {
        id: id as HandleId,
        at: worldToScreen({ x: o.center.x + s.x * o.r, y: o.center.y + s.y * o.r }, view),
      };
    });
  }

  const [ux, uy] = basis(o.rotation);
  const ids = isOpening(o) ? OPENING_HANDLES : RECT_HANDLES;
  const at = (sx: number, sy: number): Vec2 => {
    const lx = (sx * o.w) / 2;
    const ly = (sy * o.h) / 2;
    return worldToScreen(
      { x: o.center.x + lx * ux.x + ly * uy.x, y: o.center.y + lx * ux.y + ly * uy.y },
      view,
    );
  };
  const out: Handle[] = ids.map((id) => ({ id: id as HandleId, at: at(SIGN[id].x, SIGN[id].y) }));

  if (isRotatable(o)) {
    // Offset along the SCREEN direction of local -y, derived from a unit world
    // step rather than from the 'n' grip itself: on a rect squashed to the
    // minimum the grip and the centre coincide on screen and the direction would
    // be 0/0. A unit step can never degenerate, because `view.scale` is > 0.
    const step = worldToScreen({ x: o.center.x - uy.x, y: o.center.y - uy.y }, view);
    const dx = step.x - centre.x;
    const dy = step.y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    const n = at(0, -1);
    out.push({ id: 'rot', at: { x: n.x + (dx / len) * ROT_OFFSET_PX, y: n.y + (dy / len) * ROT_OFFSET_PX } });
  }
  return out;
}

/**
 * Which grip is under this screen point, or null.
 *
 * NEAREST wins, not first-declared: at a small on-screen size the corner and edge
 * grips overlap, and declaration order would make the edge grips unreachable on a
 * short rect because `nw` is listed first and its disc reaches past the midpoint.
 */
export function handleAt(
  o: Sizable,
  view: View,
  screenPt: Vec2,
  tolPx: number = HANDLE_HIT_PX,
): HandleId | null {
  // The object's own interior is always a MOVE. Checked BEFORE the grips, so a
  // press well inside a large object can never be captured by a grip disc that
  // happens to reach in — the "select, look, drag to nudge" loop must not resize.
  if (insideCore(o, view, screenPt)) return null;
  let best: HandleId | null = null;
  let bestD = tolPx;
  for (const h of handlesFor(o, view)) {
    const d = Math.hypot(h.at.x - screenPt.x, h.at.y - screenPt.y);
    if (d <= bestD) {
      bestD = d;
      best = h.id;
    }
  }
  return best;
}

/**
 * The CSS cursor for a grip, chosen from its SCREEN-space direction rather than
 * from its name — so it stays correct on a rotated object AND under a rotated
 * view, both of which this app has.
 */
export function handleCursor(o: Sizable, view: View, id: HandleId): string {
  if (id === 'rot') return 'grab';
  const centre = worldToScreen(o.center, view);
  const h = handlesFor(o, view).find((x) => x.id === id);
  if (!h) return 'default';
  // Screen y grows downward; fold to a half turn since a grip and its opposite
  // share one cursor. Bucket into the four standard resize cursors.
  let a = Math.atan2(h.at.y - centre.y, h.at.x - centre.x);
  if (a < 0) a += Math.PI;
  const oct = Math.round(a / (Math.PI / 4)) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][oct];
}

function snapSpan(span: number, snapOn: boolean): number {
  return snapOn ? Math.round(span / SNAP_STEP) * SNAP_STEP : span;
}

/**
 * Resize `o` so the grabbed grip follows `worldPt`, keeping the OPPOSITE corner or
 * edge exactly where it was (or the centre, with Alt).
 *
 * A pure function of `(o, handle, worldPt, opts)` — never of the object's live
 * value — which is the S23 discipline: every frame recomputes from the gesture's
 * baseline, so a pointer returned to where it began restores the identical float
 * and one undo restores the whole gesture.
 *
 * Returns the SAME REFERENCE when nothing changes, so a click on a grip without a
 * drag cannot push a phantom undo entry (the S14 lesson).
 */
export function resizeObject(o: Sizable, handle: ResizeHandleId, worldPt: Vec2, opts: ResizeOpts): Sizable {
  if (o.kind === 'circle') return resizeCircle(o, handle, worldPt, opts);

  const s = SIGN[handle];
  const opening = isOpening(o);
  const isDoor = o.role === 'door';
  // An opening only ever gets 'e'/'w' from `handlesFor`; this restates it so a
  // caller passing 'n' by hand cannot change the leaf/pane thickness.
  const sy = opening ? 0 : s.y;
  const sx = s.x;

  const [ux, uy] = basis(o.rotation);
  const dx = worldPt.x - o.center.x;
  const dy = worldPt.y - o.center.y;
  const lp = { x: dx * ux.x + dy * ux.y, y: dx * uy.x + dy * uy.y };

  const hw0 = o.w / 2;
  const hh0 = o.h / 2;
  // The fixed point of the gesture, in the ORIGINAL local frame.
  const ax = opts.fromCentre ? 0 : -sx * hw0;
  const ay = opts.fromCentre ? 0 : -sy * hh0;

  let nw = sx === 0 ? o.w : opts.fromCentre ? 2 * Math.abs(lp.x) : sx * (lp.x - ax);
  let nh = sy === 0 ? o.h : opts.fromCentre ? 2 * Math.abs(lp.y) : sy * (lp.y - ay);

  if (opts.aspect && sx !== 0 && sy !== 0) {
    // The ratio IS the constraint, so the grid snap is deliberately skipped here —
    // quantising both spans independently would break the very thing Shift asks for.
    const k = Math.max(nw / o.w, nh / o.h);
    const kMin = Math.max(MIN_SPAN_M / o.w, MIN_SPAN_M / o.h);
    const kk = Math.max(k, kMin);
    nw = o.w * kk;
    nh = o.h * kk;
  } else {
    // Snap THEN clamp: both minimums are multiples of SNAP_STEP, so the
    // composition is closed on the grid and re-applying the gesture is a no-op.
    nw = sx === 0 ? nw : clampSpan(snapSpan(nw, opts.snapOn), isDoor);
    nh = sy === 0 ? nh : Math.max(MIN_SPAN_M, snapSpan(nh, opts.snapOn));
  }

  if (Math.abs(nw - o.w) < NOOP_EPS && Math.abs(nh - o.h) < NOOP_EPS) return o;

  const cx = opts.fromCentre ? 0 : ax + sx * (nw / 2);
  const cy = opts.fromCentre ? 0 : ay + sy * (nh / 2);
  return {
    ...o,
    w: nw,
    h: nh,
    center: {
      x: o.center.x + cx * ux.x + cy * uy.x,
      y: o.center.y + cx * ux.y + cy * uy.y,
    },
  };
}

function clampSpan(span: number, isDoor: boolean): number {
  if (isDoor) return Math.max(DOOR_MIN_W_M, Math.min(DOOR_MAX_W_M, span));
  return Math.max(MIN_SPAN_M, span);
}

function resizeCircle(o: CircleObj, handle: ResizeHandleId, worldPt: Vec2, opts: ResizeOpts): CircleObj {
  const s = SIGN[handle];
  // A circle has no rotation, so its grips are on the world axes.
  const axis = { x: s.x, y: s.y };
  const proj = (worldPt.x - o.center.x) * axis.x + (worldPt.y - o.center.y) * axis.y;
  // Same rule as a rect: the opposite point stays put, unless Alt.
  const diameter = opts.fromCentre ? 2 * Math.abs(proj) : proj + o.r;
  const r = Math.max(MIN_RADIUS_M, snapSpan(diameter, opts.snapOn) / 2);
  if (Math.abs(r - o.r) < NOOP_EPS) return o;
  const shift = opts.fromCentre ? 0 : r - o.r;
  return { ...o, r, center: { x: o.center.x + axis.x * shift, y: o.center.y + axis.y * shift } };
}

/**
 * Rotate `o` by the angle SWEPT since the grab, about its own centre.
 *
 * `grabAngle` is `atan2` of (pointer - centre) captured at pointerdown, so the
 * object does not jump when the gesture starts. Working in WORLD space is correct
 * even under a rotated view: `worldToScreen` is a uniform scale plus a rotation,
 * which is conformal, so the swept angle is identical in both spaces.
 *
 * Refuses a door and returns the SAME reference, matching `rotateSelectedRect`
 * (keyboard.ts:205) exactly.
 */
export function rotateObject(
  o: Sizable,
  worldPt: Vec2,
  grabAngle: number,
  opts: { snap: boolean },
): Sizable {
  if (!isRotatable(o)) return o;
  const a = Math.atan2(worldPt.y - o.center.y, worldPt.x - o.center.x);
  let rot = o.rotation + (a - grabAngle);
  if (opts.snap) rot = Math.round(rot / ROT_SNAP_RAD) * ROT_SNAP_RAD;
  // Normalise into (-PI, PI] exactly as `rotateSelectedRect` does. Computed from
  // the gesture baseline rather than accumulated, so it cannot wander to 100 rad
  // across repeated gestures the way a per-frame delta would.
  rot = rot % (Math.PI * 2);
  if (rot > Math.PI) rot -= Math.PI * 2;
  if (rot <= -Math.PI) rot += Math.PI * 2;
  if (Math.abs(rot - o.rotation) < NOOP_EPS) return o;
  return { ...o, rotation: rot };
}

/**
 * Scene-level wrapper, mirroring `placement.ts` `moveObjectTo`: returns the SAME
 * scene reference when the gesture is a no-op or the target has gone.
 *
 * `obj0` is the object as it was at POINTERDOWN and is the baseline every frame
 * transforms from — it is emphatically NOT re-read from `scene`. Reading the live
 * object would make each frame compound on the previous frame's output: a
 * feedback loop in which a slow drag grows an object faster than a quick one and
 * no pointer position has a single well-defined result. Same discipline as
 * `move-rc`'s `c0`/`rot0` (the S23 lesson), just carried in one object instead of
 * two fields.
 *
 * The object is still looked up by id so a target deleted mid-gesture (undo from
 * the keyboard, a layout switch) is a no-op rather than a resurrection.
 */
export function applyHandleDrag(
  scene: Scene,
  obj0: Sizable,
  handle: HandleId,
  worldPt: Vec2,
  opts: ResizeOpts & { grabAngle: number },
): Scene {
  const live = scene.objects.find((o) => o.id === obj0.id);
  if (!live || live.kind === 'wall') return scene;
  // Write ONLY the fields this gesture owns, onto the LIVE object — never spread
  // `obj0` wholesale. `q`/`e` need nothing but an object selection (keyboard.ts),
  // which a grip drag guarantees, so a rotate can land mid-resize; spreading the
  // baseline would silently revert it on the very next pointermove, which is the
  // S23 bug that `move-rc` carries `lastRotRef` for. Merging by field means the
  // two gestures compose instead of fighting, with no provenance tracking at all.
  // NOTE the shape: the gesture's result is used even when it equals `obj0` (the
  // pointer is back where it started), and the early-out is decided by comparing
  // against LIVE. Short-circuiting on `result === obj0` instead looks equivalent
  // and is not — that is precisely the frame on which the scene is still holding
  // a mid-drag value, so the object would stay stranded at 14.00 x 0.10 m while
  // the pointer says 4 x 2. Caught by a test twice: once when this function was
  // first written, and again when the field-merge above reintroduced it.
  let next: Sizable = live;
  const moved = (a: Vec2, b: Vec2) => !Object.is(a.x, b.x) || !Object.is(a.y, b.y);
  if (handle === 'rot') {
    const turned = rotateObject(obj0, worldPt, opts.grabAngle, { snap: opts.aspect });
    if (turned.kind === 'rect' && live.kind === 'rect' && !Object.is(live.rotation, turned.rotation)) {
      next = { ...live, rotation: turned.rotation };
    }
  } else {
    const sized = resizeObject(obj0, handle, worldPt, opts);
    if (sized.kind === 'circle' && live.kind === 'circle') {
      if (!Object.is(live.r, sized.r) || moved(live.center, sized.center)) {
        next = { ...live, r: sized.r, center: sized.center };
      }
    } else if (sized.kind === 'rect' && live.kind === 'rect') {
      if (!Object.is(live.w, sized.w) || !Object.is(live.h, sized.h) || moved(live.center, sized.center)) {
        next = { ...live, w: sized.w, h: sized.h, center: sized.center };
      }
    }
  }
  // Compare against the LIVE object, NOT against `obj0`. `next === obj0` means
  // "the pointer is back where it started", which is precisely when the scene is
  // still holding some MID-DRAG size — returning early there would strand the
  // object at whatever it was two frames ago while the pointer says otherwise.
  // Against `live` the check keeps its real job (no write when the scene already
  // holds exactly this) and gains the restore.
  if (next === live) return scene;
  return { ...scene, objects: scene.objects.map((o) => (o.id === obj0.id ? next : o)) };
}
