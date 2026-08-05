import type {
  CircleObj,
  RectObj,
  Scene,
  SceneObject,
  Vec2,
  WallObj,
} from '../../engine/types';
import { updateActiveListener } from '../../engine/scene';
import { snapToWalls } from '../../engine/joints';
import * as v from '../../engine/vec';
import { applyHandleDrag, type HandleId } from './handles';
import { DRAG_SEAT, SNAP_STEP, moveObjectTo, surfaceHeightAt } from './placement';

export type DrawTool = 'rect' | 'circle' | 'room';

/**
 * Every live pointer gesture the canvas understands.
 *
 * ⚠️ This is carried in a REF and `move-rc` re-bases `rot0` IN PLACE. That is
 * not sloppiness — see `applyDragToScene`'s `rot0` result below. Freezing this
 * record, lifting it into state, or copying it into a local before applying a
 * move all silently revert a mid-gesture `q`/`e` on the next pointermove, which
 * is the S23 regression verbatim.
 */
export type Drag =
  | { kind: 'pan'; pointerId: number; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'node'; pointerId: number; node: 'listener' | { speakerId: string } }
  | { kind: 'wall-end'; pointerId: number; id: string; end: 'a' | 'b' }
  | { kind: 'move-wall'; pointerId: number; id: string; start: Vec2; a0: Vec2; b0: Vec2 }
  // `rot0` is REQUIRED so any future drag path that forgets it is a compile error.
  // Every frame snaps from it rather than from the object's live rotation, which is
  // what makes the transform a pure function of the gesture: leaving a wall's field
  // restores the identical float, and one undo restores centre AND rotation.
  | { kind: 'move-rc'; pointerId: number; id: string; start: Vec2; c0: Vec2; rot0: number }
  // §16 (S36). Its OWN kind, deliberately, so the S23 wall-seat magnet never sees
  // it: `moveObjectTo` rewrites `rotation` from `rot0` on every frame, and a
  // resize or rotate sharing the move branch would fight it exactly as a mid-drag
  // `q`/`e` did. `obj0` is the object as it was at pointerdown — every frame is
  // recomputed from it rather than from the live value, which is what makes the
  // gesture a pure function of the pointer and one undo restore all of it.
  | {
      kind: 'handle';
      pointerId: number;
      id: string;
      handle: HandleId;
      obj0: RectObj | CircleObj;
      /** atan2 of (pointerdown - centre); only the 'rot' grip reads it. */
      grabAngle: number;
    }
  | { kind: 'draw'; pointerId: number; tool: DrawTool; anchor: Vec2 }
  | { kind: 'band'; pointerId: number; shape: 'marquee' | 'lasso'; additive: boolean }
  | {
      kind: 'move-multi';
      pointerId: number;
      start: Vec2;
      objects: Array<{ id: string; a?: Vec2; b?: Vec2; center?: Vec2 }>;
      speakers: Array<{ id: string; pos: Vec2 }>;
    };

/** Drag kinds that reposition scene items (→ 'grabbing' cursor). `handle` is
 *  deliberately NOT here: a resize or rotate gesture keeps the directional
 *  cursor its grip earned, which `handleCursor` supplies from the grip's
 *  SCREEN direction. */
export const MOVE_KINDS = new Set<Drag['kind']>([
  'node',
  'wall-end',
  'move-wall',
  'move-rc',
  'move-multi',
]);

export interface DragApplyResult {
  /** The next scene. May be the SAME ref when nothing changed. */
  scene: Scene;
  /** `move-rc` only: the wall the seat magnet captured this frame. */
  guide: { wallId: string; seated: boolean } | null;
  /**
   * `move-rc` only: the baseline rotation the caller must write back into the
   * (mutable) Drag record. It differs from the one passed in exactly when an
   * external `q`/`e` landed mid-gesture and the branch re-based on it.
   */
  rot0: number;
  /**
   * `move-rc` only: the rotation this branch just WROTE. The caller keeps it so
   * the next frame can tell the branch's own output apart from someone else's
   * edit. Null when the moved object is not a rect.
   */
  lastRot: number | null;
}

export interface DragApplyOptions {
  snapOn: boolean;
  /** Suppresses the seat magnet on a move; aspect-lock on a resize; 15° on a rotate. */
  shiftKey: boolean;
  /** Resize about the centre. */
  altKey: boolean;
  /** What the previous frame of THIS gesture wrote as the object's rotation. */
  lastRot: number | null;
}

const snapTo = (p: Vec2, on: boolean): Vec2 =>
  on
    ? { x: Math.round(p.x / SNAP_STEP) * SNAP_STEP, y: Math.round(p.y / SNAP_STEP) * SNAP_STEP }
    : p;

/**
 * Apply one frame of a scene-writing drag — extracted from SimCanvas in S37.
 *
 * Returns null for the three kinds that write no scene (`pan` and `band` move
 * the view or a screen-space band; `draw` produces a preview — see
 * `previewForDraw`). Everything here is a pure function of
 * (scene, drag, pointer, modifiers), which is what finally makes the drag
 * transforms testable: jsdom cannot deliver a usable PointerEvent, so before
 * this split none of these six branches could be exercised by any committed
 * test.
 */
export function applyDragToScene(
  scene: Scene,
  drag: Drag,
  p: Vec2,
  opts: DragApplyOptions,
): DragApplyResult | null {
  const cur = scene;
  const snap = (q: Vec2) => snapTo(q, opts.snapOn);
  const plain = (next: Scene): DragApplyResult => ({
    scene: next,
    guide: null,
    rot0: drag.kind === 'move-rc' ? drag.rot0 : 0,
    lastRot: null,
  });

  if (drag.kind === 'move-multi') {
    // Snap the DELTA, not each piece — the group keeps its internal layout.
    const raw = v.sub(p, drag.start);
    const d = {
      x: Math.round(raw.x / SNAP_STEP) * SNAP_STEP,
      y: Math.round(raw.y / SNAP_STEP) * SNAP_STEP,
    };
    const objById = new Map(drag.objects.map((o) => [o.id, o]));
    const spById = new Map(drag.speakers.map((s) => [s.id, s]));
    return plain({
      ...cur,
      objects: cur.objects.map((o) => {
        const orig = objById.get(o.id);
        if (!orig) return o;
        if (o.kind === 'wall' && orig.a && orig.b) {
          return { ...o, a: v.add(orig.a, d), b: v.add(orig.b, d) };
        }
        if (o.kind !== 'wall' && orig.center) return { ...o, center: v.add(orig.center, d) };
        return o;
      }),
      speakers: cur.speakers.map((s) => {
        const orig = spById.get(s.id);
        return orig ? { ...s, pos: v.add(orig.pos, d) } : s;
      }),
    });
  }

  if (drag.kind === 'node') {
    const sp = snap(p);
    if (drag.node === 'listener') return plain(updateActiveListener(cur, { pos: sp }));
    const speakerId = drag.node.speakerId;
    const surf = surfaceHeightAt(cur, sp);
    return plain({
      ...cur,
      speakers: cur.speakers.map((s) =>
        s.id === speakerId
          ? { ...s, pos: sp, z: surf !== null ? Math.round((surf + 0.12) * 100) / 100 : s.z }
          : s,
      ),
    });
  }

  if (drag.kind === 'wall-end') {
    const others = cur.objects.filter((o): o is WallObj => o.kind === 'wall' && o.id !== drag.id);
    const stuck = snapToWalls(snap(p), others);
    return plain({
      ...cur,
      objects: cur.objects.map((o) =>
        o.id === drag.id && o.kind === 'wall' ? { ...o, [drag.end]: stuck } : o,
      ),
    });
  }

  if (drag.kind === 'move-wall') {
    const d = v.sub(p, drag.start);
    return plain({
      ...cur,
      objects: cur.objects.map((o) =>
        o.id === drag.id && o.kind === 'wall'
          ? { ...o, a: snap(v.add(drag.a0, d)), b: snap(v.add(drag.b0, d)) }
          : o,
      ),
    });
  }

  // §16 (S36). Everything is recomputed from `drag.obj0`, the object as it was
  // at pointerdown — never from its live value — so the gesture is a pure
  // function of the pointer: returning the pointer to where it started restores
  // the identical floats, and the whole drag is one undo entry.
  //
  // It deliberately does NOT re-seat against a wall. An Inspector Width/Depth
  // edit does not re-seat either, so a grip introduces no new behaviour class,
  // and `seatObjectAgainstWall`'s COMMAND_SEAT reaches 1.2 m — enough to
  // teleport a piece that was never near a wall (the S32 reach lesson). The
  // existing explicit `F` command is the way to re-seat after resizing.
  if (drag.kind === 'handle') {
    return plain(
      applyHandleDrag(cur, drag.obj0, drag.handle, p, {
        // Shift is aspect-lock on a resize and 15° snapping on a rotate; Alt is
        // resize-about-centre. The Word contract.
        aspect: opts.shiftKey,
        fromCentre: opts.altKey,
        snapOn: opts.snapOn,
        grabAngle: drag.grabAngle,
      }),
    );
  }

  if (drag.kind === 'move-rc') {
    const d = v.sub(p, drag.start);

    // RE-BASE on an external rotation. `q`/`e` are not gated on drag state
    // (`keyboard.ts` needs only an object selection, which pointerdown has just
    // set), so a rotate can land mid-gesture. Every frame snaps from `rot0`, so
    // without this the next pointermove would silently revert that rotate — a
    // regression against the pre-S23 branch, which wrote only `center`. Comparing
    // against what THIS branch last wrote keeps the drag a pure function of
    // (rot0, pointer) — an external edit re-bases it, its own output never does.
    const live = cur.objects.find((o) => o.id === drag.id);
    const rot0 =
      live && live.kind === 'rect' && !Object.is(live.rotation, opts.lastRot)
        ? live.rotation
        : drag.rot0;

    // Furniture seats flush against the nearest wall at its own angle; openings
    // keep their straddle magnet; circles are position-only. All of it lives in
    // the pure, node-tested `moveObjectTo` — this branch only supplies the
    // gesture. Shift suppresses the magnet for a free move.
    const { scene: next, guide } = moveObjectTo(cur, drag.id, v.add(drag.c0, d), rot0, {
      snapOn: opts.snapOn,
      seat: opts.shiftKey ? null : DRAG_SEAT,
    });
    const wrote = next.objects.find((o) => o.id === drag.id);
    return {
      scene: next,
      guide,
      rot0,
      lastRot: wrote && wrote.kind === 'rect' ? wrote.rotation : null,
    };
  }

  // pan / band / draw write no scene.
  return null;
}

/** The rubber-band ghost for a `draw` gesture. Never enters the scene — the
 *  commit happens on pointerup through `commitDraw`. */
export function previewForDraw(drag: Drag & { kind: 'draw' }, p: Vec2, snapOn: boolean): SceneObject {
  const a = drag.anchor;
  const b = snapTo(p, snapOn);
  if (drag.tool === 'rect' || drag.tool === 'room') {
    return {
      id: 'preview',
      kind: 'rect',
      center: v.lerp(a, b, 0.5),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
      rotation: 0,
      absorption: 0.3,
      label: drag.tool === 'room' ? 'Area' : 'Object',
      role: 'furniture',
      height: 0.9,
    };
  }
  return {
    id: 'preview',
    kind: 'circle',
    center: a,
    r: v.dist(a, b),
    absorption: 0.3,
    label: 'Object',
    height: 0.75,
  };
}

/**
 * Turn a finished `draw` ghost into a real object, or refuse it.
 *
 * The floors are why the `opening` tool places on pointer-DOWN instead: a door
 * is h 0.1, below the 0.15 rect floor here, so routing it through the draw path
 * would silently reject every door.
 */
export function commitDraw(drawn: SceneObject, mintId: (prefix: string) => string): SceneObject | null {
  if (drawn.kind === 'rect' && drawn.w >= 0.15 && drawn.h >= 0.15) {
    return { ...drawn, id: mintId('rect') };
  }
  if (drawn.kind === 'circle' && drawn.r >= 0.1) {
    return { ...drawn, id: mintId('circle') };
  }
  return null;
}
