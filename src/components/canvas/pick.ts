import type {
  CircleObj,
  RectObj,
  Scene,
  Selection,
  ToolMode,
  Vec2,
  WallObj,
} from '../../engine/types';
import { hitInactiveSeat, hitTestNodes, hitTestObjects } from '../../engine/hit';
import * as v from '../../engine/vec';
import type { View } from './view';
import type { Drag } from './drag-apply';
import { handleAt } from './handles';
import { WALL_HOVER_APPEAR_PX, resolveSelection, selectionSets, wallHoverAt } from './interaction';
import { snapPoint } from './placement';

/**
 * What a pointerdown MEANS — the twelve-branch ladder, as a pure function (S38).
 *
 * `SimCanvas.onPointerDown` used to interleave the decision with the effects it
 * causes (`startDrag`, `onScene`, `onSelection`, `setBandBoth`, `calibRef`), so
 * no part of it could be exercised by a committed test: jsdom dispatches a plain
 * `Event` for pointer events, which means `button`, `pointerId` and `clientX`
 * all arrive `undefined` and the handler bails at its first guard (TRAP 21). The
 * whole ladder was reachable only by driving real Chrome over CDP.
 *
 * The split is decision-vs-effect, NOT logic-vs-glue. Everything that reads
 * state to choose a branch lives here; everything that writes state lives in the
 * component, which interprets the returned `PickAction` and does nothing else.
 * That is what makes the ORDER of a branch's effects a property of one small
 * interpreter rather than of twelve hand-written sequences.
 *
 * ⚠️ The ORDER OF THE TESTS in `resolvePointerDown` is load-bearing and was
 * chosen by measurement, not taste — see the grip comment below. It is now
 * pinned by tests instead of by a comment.
 */

/**
 * Everything the ladder reads. Deliberately plain data: no refs, no event, no
 * canvas — which is precisely what lets a test construct one by hand.
 */
export interface PickInput {
  scene: Scene;
  selection: Selection;
  mode: ToolMode;
  view: View;
  /** Pointer position in canvas-relative screen px. */
  screenPt: Vec2;
  /** `screenPt` in world metres. The caller owns the camera transform. */
  worldPt: Vec2;
  /** `PointerEvent.button`: 0 left, 1 middle, 2 right. */
  button: number;
  pointerId: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** Space is held, so any button pans. */
  spaceHeld: boolean;
  /** A drag is already live — everything below the pan branch refuses. */
  dragActive: boolean;
  /** The first click of a two-click scale calibration, or null. */
  calibFirst: Vec2 | null;
  /**
   * The object whose §16 grips are live, or null. Passed in rather than derived
   * here, because the component already computes it once per render for the
   * RENDERER — and "a grip is drawn" and "a grip is grabbable" being the same
   * value is the whole point of that single derivation (S36).
   */
  handleTarget: RectObj | CircleObj | null;
  snapOn: boolean;
}

/**
 * What the component must do about it.
 *
 * One `drag` member rather than one per gesture, so the interpreter that applies
 * `activateSeat` → `selection` → `startDrag` exists exactly once. Three branches
 * carry extras and the rest carry none.
 */
export type PickAction =
  /** Nothing happens: a wrong button, a live drag, or a ⌘-click on empty space. */
  | { kind: 'none' }
  /**
   * Begin `drag`. `activateSeat` and then `selection` are applied FIRST, in that
   * order — which is the order the twelve branches used, and the order a seat
   * needs (it must become the active "YOU" puck before the drag moves it).
   */
  | { kind: 'drag'; drag: Drag; selection?: Selection; activateSeat?: string; bandOrigin?: Vec2 }
  /** Set the selection and nothing else. `null` deselects. */
  | { kind: 'select'; selection: Selection }
  /** Speaker tool: drop a pod. The scene write is the caller's — `placeSpeakerAt`
   *  mints an id, so keeping it out here is what keeps this function pure. */
  | { kind: 'place-speaker'; at: Vec2 }
  /** Wall tool: append a chain vertex. */
  | { kind: 'chain-point'; at: Vec2 }
  /** Calibrate, click one of two. */
  | { kind: 'calibrate-start'; at: Vec2 }
  /** Calibrate, click two of two. */
  | { kind: 'calibrate-finish'; a: Vec2; b: Vec2 }
  /** Opening tool found a wall to cut. */
  | { kind: 'insert-opening'; wall: WallObj; at: Vec2; role: 'door' | 'window' }
  /** Opening tool found no wall. A silent no-op on the advertised primary route
   *  is indistinguishable from a broken app, so the user is told. */
  | { kind: 'notice'; message: string };

/**
 * The effects a `PickAction` may cause. The component supplies them; the ORDER
 * lives in `applyPickAction` below, which is the point — twelve hand-written
 * sequences became one, and a test can assert the sequence with spies.
 */
export interface PickEffects {
  setBand: (band: Vec2[] | null) => void;
  activateSeat: (id: string) => void;
  select: (sel: Selection) => void;
  startDrag: (drag: Drag) => void;
  placeSpeaker: (at: Vec2) => void;
  chainPoint: (at: Vec2) => void;
  /** `null` clears it — the second click must forget the first BEFORE the
   *  measurement dialog opens, or a third click resumes a dead measurement. */
  setCalibFirst: (at: Vec2 | null) => void;
  calibrate: (a: Vec2, b: Vec2) => void;
  insertOpening: (wall: WallObj, at: Vec2, role: 'door' | 'window') => void;
  notice: (message: string) => void;
}

/**
 * Perform what `resolvePointerDown` decided — and nothing else.
 *
 * ⚠️ The order inside the `drag` case is load-bearing, and its cost is INVISIBLE
 * in the final scene: `activateSeat` writes the scene while the drag's coalescing
 * group is still closed, so the seat switch lands as its OWN undo entry and the
 * reposition that follows as another. Start the drag first and the two merge into
 * one step, so a single ⌘Z that should have undone the move also undoes the seat
 * change. Pinned by a test that counts history entries, not scenes.
 */
export function applyPickAction(act: PickAction, fx: PickEffects): void {
  switch (act.kind) {
    case 'none':
      return;
    case 'drag':
      if (act.bandOrigin) fx.setBand([act.bandOrigin]);
      if (act.activateSeat) fx.activateSeat(act.activateSeat);
      if (act.selection !== undefined) fx.select(act.selection);
      fx.startDrag(act.drag);
      return;
    case 'select':
      fx.select(act.selection);
      return;
    case 'place-speaker':
      fx.placeSpeaker(act.at);
      return;
    case 'chain-point':
      fx.chainPoint(act.at);
      return;
    case 'calibrate-start':
      fx.setCalibFirst(act.at);
      return;
    case 'calibrate-finish':
      fx.setCalibFirst(null);
      fx.calibrate(act.a, act.b);
      return;
    case 'insert-opening':
      fx.insertOpening(act.wall, act.at, act.role);
      return;
    case 'notice':
      fx.notice(act.message);
      return;
  }
}

const NONE: PickAction = { kind: 'none' };

export function resolvePointerDown(input: PickInput): PickAction {
  const { scene, selection, mode, view, screenPt, worldPt: p, pointerId, handleTarget } = input;

  // Middle button, right button or a held Space pans, whatever the tool is.
  if (input.button === 1 || input.button === 2 || input.spaceHeld) {
    return {
      kind: 'drag',
      drag: {
        kind: 'pan',
        pointerId,
        sx: screenPt.x,
        sy: screenPt.y,
        ox: view.ox,
        oy: view.oy,
      },
    };
  }
  if (input.button !== 0 || input.dragActive) return NONE;

  const tol = 10 / view.scale;

  if (mode === 'calibrate') {
    return input.calibFirst
      ? { kind: 'calibrate-finish', a: input.calibFirst, b: p }
      : { kind: 'calibrate-start', at: p };
  }

  if (mode === 'wall') return { kind: 'chain-point', at: p };

  if (mode === 'speaker') return { kind: 'place-speaker', at: p };

  if (mode === 'marquee' || mode === 'lasso') {
    return {
      kind: 'drag',
      bandOrigin: screenPt,
      drag: {
        kind: 'band',
        pointerId,
        shape: mode === 'marquee' ? 'marquee' : 'lasso',
        // ⚠️ Shift counts as additive HERE and deliberately NOT in the ⌘-click
        // branch below, which reads meta/ctrl only. Two different sets, kept as
        // two expressions on purpose: sharing one `additive` local silently
        // makes ⇧-click toggle multi-membership.
        additive: input.metaKey || input.ctrlKey || input.shiftKey,
      },
    };
  }

  if (mode === 'opening') {
    // Placed on the CLICK, never via a 'draw' drag: a door is h:0.1, below the
    // pointerup draw-commit floor (w,h >= 0.15), so the draw path would silently
    // reject it. ⇧ cuts a window instead of a door.
    const role: 'door' | 'window' = input.shiftKey ? 'window' : 'door';
    const hover = wallHoverAt(scene.objects, p, WALL_HOVER_APPEAR_PX / view.scale);
    const wall = hover ? scene.objects.find((o) => o.id === hover.id) : null;
    if (hover && wall && wall.kind === 'wall') {
      return { kind: 'insert-opening', wall, at: hover.at, role };
    }
    return { kind: 'notice', message: `Click a wall to cut a ${role}.` };
  }

  if (mode !== 'select') {
    // `mode` has narrowed to exactly `DrawTool` ('rect' | 'circle' | 'room') —
    // every other member returned above, so this is checked by the compiler
    // rather than asserted.
    return {
      kind: 'drag',
      drag: { kind: 'draw', pointerId, tool: mode, anchor: snapPoint(p, input.snapOn) },
    };
  }

  // ⌘/Ctrl-click: toggle the clicked thing in and out of a multi-selection.
  if (input.metaKey || input.ctrlKey) {
    const nh = hitTestNodes(scene, p, tol);
    const oh = nh ? null : hitTestObjects(scene, p, tol);
    const { objectIds, speakerIds } = selectionSets(selection);
    if (nh?.type === 'speaker') {
      if (speakerIds.has(nh.id)) speakerIds.delete(nh.id);
      else speakerIds.add(nh.id);
    } else if (oh?.type === 'object') {
      if (objectIds.has(oh.id)) objectIds.delete(oh.id);
      else objectIds.add(oh.id);
    } else {
      return NONE; // clicked empty space — keep the selection as is
    }
    return { kind: 'select', selection: resolveSelection(objectIds, speakerIds) };
  }

  // Dragging any member of a multi-selection moves the whole group. ABOVE the
  // individual node/object hits, or grabbing one member would collapse the
  // selection to it and move it alone.
  if (selection?.type === 'multi') {
    const nh = hitTestNodes(scene, p, tol);
    const oh = nh ? null : hitTestObjects(scene, p, tol);
    const memberHit =
      (nh?.type === 'speaker' && selection.speakerIds.includes(nh.id)) ||
      (oh?.type === 'object' && selection.objectIds.includes(oh.id));
    if (memberHit) {
      return {
        kind: 'drag',
        drag: {
          kind: 'move-multi',
          pointerId,
          start: p,
          objects: scene.objects
            .filter((o) => selection.objectIds.includes(o.id))
            .map((o) =>
              o.kind === 'wall' ? { id: o.id, a: o.a, b: o.b } : { id: o.id, center: o.center },
            ),
          speakers: scene.speakers
            .filter((s) => selection.speakerIds.includes(s.id))
            .map((s) => ({ id: s.id, pos: s.pos })),
        },
      };
    }
  }

  const nodeHit = hitTestNodes(scene, p, tol);
  if (nodeHit?.type === 'listener') {
    return { kind: 'drag', selection: nodeHit, drag: { kind: 'node', pointerId, node: 'listener' } };
  }
  if (nodeHit?.type === 'speaker') {
    return {
      kind: 'drag',
      selection: nodeHit,
      drag: { kind: 'node', pointerId, node: { speakerId: nodeHit.id } },
    };
  }
  // An inactive seat: activate it (it becomes the "YOU" puck) and start dragging
  // so it can be repositioned in the same gesture.
  const seatHit = hitInactiveSeat(scene, p, tol);
  if (seatHit) {
    return {
      kind: 'drag',
      activateSeat: seatHit,
      selection: { type: 'listener' },
      drag: { kind: 'node', pointerId, node: 'listener' },
    };
  }

  // §16 grips (S36). Deliberately BELOW the node and seat tests, and
  // `drawHandles` paints below `drawNodes` to match: a speaker puck or a seat
  // wins over a grip in BOTH the paint order and the hit test, so the two can
  // never disagree. Putting the grips first was measured against the shipped
  // demo and rejected — a pod parked at the head of the Bed sits within 11 px of
  // a grip, and dragging that pod would have resized the bed instead. Pods are
  // the primary thing a user drags; a grip lost under one is recoverable by
  // deselecting, moving the pod, or the Inspector, which resize has and dragging
  // a pod does not.
  if (handleTarget) {
    const grip = handleAt(handleTarget, view, screenPt);
    if (grip) {
      return {
        kind: 'drag',
        drag: {
          kind: 'handle',
          pointerId,
          id: handleTarget.id,
          handle: grip,
          obj0: handleTarget,
          grabAngle: Math.atan2(p.y - handleTarget.center.y, p.x - handleTarget.center.x),
        },
      };
    }
  }

  // A selected wall's own endpoints, BEFORE the generic object hit — otherwise
  // the wall's body swallows the grab and the endpoint could never be dragged.
  if (selection?.type === 'object') {
    const sel = scene.objects.find((o) => o.id === selection.id);
    if (sel?.kind === 'wall') {
      for (const end of ['a', 'b'] as const) {
        if (v.dist(p, sel[end]) <= tol * 1.4) {
          return { kind: 'drag', drag: { kind: 'wall-end', pointerId, id: sel.id, end } };
        }
      }
    }
  }

  const objHit = hitTestObjects(scene, p, tol);
  if (objHit?.type === 'object') {
    const o = scene.objects.find((x) => x.id === objHit.id);
    if (o?.kind === 'wall') {
      return {
        kind: 'drag',
        selection: objHit,
        drag: { kind: 'move-wall', pointerId, id: o.id, start: p, a0: o.a, b0: o.b },
      };
    }
    if (o) {
      return {
        kind: 'drag',
        selection: objHit,
        drag: {
          kind: 'move-rc',
          pointerId,
          id: o.id,
          start: p,
          c0: o.center,
          rot0: o.kind === 'rect' ? o.rotation : 0,
        },
      };
    }
    // `hitTestObjects` returned an id the scene does not hold. Unreachable today
    // — it scans `scene.objects` — but the original selected first and looked up
    // second, so an id with no object still CHANGED the selection. Preserved.
    return { kind: 'select', selection: objHit };
  }

  return { kind: 'select', selection: null };
}
