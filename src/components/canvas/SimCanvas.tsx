import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CircleObj,
  RectObj,
  Scene,
  SceneObject,
  Selection,
  SimSettings,
  SpeakerModel,
  ToolMode,
  TraceResult,
  Vec2,
} from '../../engine/types';
import type { AudioMetrics } from '../../engine/stereo';
import type { Proposal } from '../../engine/optimize';
import type { ListeningField } from '../../engine/bestspot';
import { hitTestObjects } from '../../engine/hit';
import { createId } from '../../engine/scene';
import { integrateWall } from '../../engine/joints';
import * as v from '../../engine/vec';
import { worldToScreen, type CanvasTheme, type WallChain } from './render';
import { handleAt, handleCursor, handleTargetFor, type HandleId } from './handles';
import {
  MOVE_KINDS,
  applyDragToScene,
  commitDraw,
  previewForDraw,
  type Drag,
} from './drag-apply';
import {
  WALL_HOVER_APPEAR_PX,
  canvasKeyAction,
  hoverCursor,
  isDraggableAt,
  makeOpening,
  nextWallHover,
  openingGhost,
  selectionFromBand,
  type WallHover,
} from './interaction';
// The placement primitives are shared with the KEYBOARD path, so there is
// exactly one definition of each (S7). `surfaceHeightAt` used to be a closure
// here even though it only ever read `scene.objects`.
import { placeSpeakerAt } from './placement';
import { chainContext, chainStep, chainUndo, chainVertex } from './chain';
import { applyPickAction, resolvePointerDown, type PickEffects } from './pick';
import { Compass, SelectionBand, WallActionsChip } from './CanvasOverlays';
import { useCanvasCamera } from './useCanvasCamera';
import { useCanvasPainter } from './useCanvasPainter';
import { useFinePointer } from './useFinePointer';
import { CANVAS_HELP } from './canvas-help';
import './sim-canvas.css';

interface Props {
  scene: Scene;
  settings: SimSettings;
  selection: Selection;
  mode: ToolMode;
  theme: CanvasTheme;
  placeModel: SpeakerModel;
  trace: TraceResult;
  audio: AudioMetrics;
  proposal: Proposal | null;
  furnitureProposal: SceneObject[] | null;
  bestSpot: ListeningField | null;
  resetViewToken: number;
  /** True while any blocking overlay (dialog, full-screen gallery/compare) is
   *  open — gates the canvas view-rotate and chain-undo keys. */
  overlayOpen: boolean;
  onScene: (s: Scene) => void;
  onSelection: (sel: Selection) => void;
  onDragging: (dragging: boolean) => void;
  /** Two calibration clicks landed — App asks for the real distance. */
  onCalibrate: (a: Vec2, b: Vec2) => void;
  onRoomDrawn: (zone: { center: Vec2; w: number; h: number }) => void;
  /** Double-click on a wall: break it into two at that point. */
  onSplitWall: (id: string, at: Vec2) => void;
  /** Clicked an inactive listening seat — make it the active one. */
  onActivateSeat: (id: string) => void;
  /** Transient hint (e.g. the opening tool clicked off every wall — a silent
   *  no-op there is indistinguishable from a broken app on the live region). */
  onNotice: (msg: string) => void;
}

export default function SimCanvas({
  scene,
  settings,
  selection,
  mode,
  theme,
  placeModel,
  trace,
  audio,
  proposal,
  furnitureProposal,
  bestSpot,
  resetViewToken,
  overlayOpen,
  onScene,
  onSelection,
  onDragging,
  onCalibrate,
  onRoomDrawn,
  onSplitWall,
  onActivateSeat,
  onNotice,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** The +Door/+Window chip, measured so it can keep itself alive under the cursor. */
  const chipRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Declared here, ahead of the camera, because the camera reads both at EVENT
  // time from inside mount-once listeners.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const dragRef = useRef<Drag | null>(null);
  const { view, setView, size, rotateBy, s2w, pointersRef, pinchRef, armPinch, applyPinch } =
    useCanvasCamera({
      containerRef,
      canvasRef,
      sceneRef,
      resetViewToken,
      // A function, not a boolean: the camera reads it at EVENT time from inside
      // mount-once listeners, where a captured boolean would be the mount value
      // forever. `dragRef` is the drag machine's, so the camera never sees it.
      isBandDragging: () => dragRef.current?.kind === 'band',
    });
  const [wallHover, setWallHover] = useState<WallHover | null>(null);
  /** Hovering something draggable in select mode (→ 'grab' cursor). */
  const [hoverGrab, setHoverGrab] = useState(false);
  /** A reposition drag is live (→ 'grabbing' cursor). */
  const [grabbing, setGrabbing] = useState(false);
  /** The wall the seat magnet has captured this drag. Identity-preserving setter,
   *  so React bails out — it changes at most twice per gesture. */
  const [snapGuide, setSnapGuide] = useState<{ wallId: string; seated: boolean } | null>(null);
  const finePointer = useFinePointer();
  /** Which grip the pointer is hovering, for the directional resize cursor. */
  const [hoverHandle, setHoverHandle] = useState<HandleId | null>(null);
  /** Screen-space rubber band: 2 pts = marquee corners, 3+ = lasso path. */
  const [band, setBand] = useState<Vec2[] | null>(null);
  const bandRef = useRef<Vec2[] | null>(null);
  const setBandBoth = (b: Vec2[] | null) => {
    bandRef.current = b;
    setBand(b);
  };
  const [preview, setPreviewState] = useState<SceneObject | null>(null);
  const [chain, setChain] = useState<WallChain | null>(null);
  // Mirrors in refs so pointer-up / clicks read the freshest values.
  const previewRef = useRef<SceneObject | null>(null);
  const chainRef = useRef<WallChain | null>(null);
  const setPreview = useCallback((p: SceneObject | null) => {
    previewRef.current = p;
    setPreviewState(p);
  }, []);
  const updateChain = useCallback((c: WallChain | null) => {
    chainRef.current = c;
    setChain(c);
  }, []);
  /** The rotation the move-rc branch last WROTE, so an external `q`/`e` mid-drag
   *  can be told apart from the branch's own output and re-base `rot0`. */
  const lastRotRef = useRef<number | null>(null);
  const spaceRef = useRef(false);
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;
  const overlayOpenRef = useRef(overlayOpen);
  overlayOpenRef.current = overlayOpen;
  /** Wall ids committed by the active chain, grouped per corner, for
   *  Backspace-undo (a segment that crossed a wall owns multiple ids). */
  const chainWallsRef = useRef<string[][]>([]);
  /** First click of a two-point scale calibration. */
  const calibRef = useRef<Vec2 | null>(null);

  // Drop the opening-tool ghost the moment the tool changes, so a stale ghost
  // can't linger or be picked up by the rect/circle draw-commit path.
  useEffect(() => {
    if (mode !== 'opening') setPreview(null);
  }, [mode, setPreview]);


  /**
   * The object whose §16 grips are live, or null (S36).
   *
   * Derived, never stored — and read by BOTH the renderer (via `RenderState`)
   * and the pointerdown hit test, so "a grip is drawn" and "a grip is grabbable"
   * are the same condition by construction rather than by two guards that agree
   * today (the S30 `containerIntentFor` lesson).
   */
  const handleTarget: RectObj | CircleObj | null = finePointer
    ? handleTargetFor(scene, selection, { mode, overlayOpen })
    : null;


  // --- drawing ------------------------------------------------------------
  useCanvasPainter(canvasRef, size, {
    scene,
    settings,
    selection,
    trace,
    audio,
    preview,
    chain,
    proposal,
    furnitureProposal,
    bestSpot,
    snapGuide,
    handleTarget,
    theme,
    view,
  });

  // --- zoom / pan / space -------------------------------------------------
  // Space / view-rotate / chain-Backspace. Deliberately ONE window listener:
  // splitting it per concern would call `canvasKeyAction` twice per keystroke
  // and put the "a Space keyup ALWAYS disarms" invariant behind two paths.
  // It no longer touches the canvas element (the wheel listener moved to
  // useCanvasCamera in S37), so it no longer bails when the ref is empty —
  // that guard would have silently dropped the whole key contract.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const action = canvasKeyAction(
        {
          type: e.type,
          key: e.key,
          code: e.code,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          targetTag: t?.tagName,
        },
        overlayOpenRef.current,
        Boolean(chainRef.current),
      );
      if (action.kind === 'space') {
        // Never arm pan behind an overlay; a keyup always disarms.
        spaceRef.current = action.armed;
        // The canvas is focusable now, so Space on it would scroll the page.
        // role="application" has no activation semantics, so Space here means
        // exactly one thing (arm pan) — there is nothing to double-fire.
        if (t?.classList?.contains('sim-canvas')) e.preventDefault();
      } else if (action.kind === 'rotate') {
        if (dragRef.current?.kind === 'band') return; // freeze view during a band drag
        rotateBy((action.deltaDeg * Math.PI) / 180);
      } else if (action.kind === 'chainBackspace') {
        // Undo the last corner and every wall id its segment added (a crossing
        // splits the new wall into several chunks — remove the whole group).
        e.preventDefault();
        const undo = chainUndo(sceneRef.current, chainRef.current!, chainWallsRef.current);
        chainWallsRef.current = undo.groups;
        // Same ref when the popped corner created no wall — writing it anyway
        // would push an undo entry that undoes nothing.
        if (undo.scene !== sceneRef.current) onSceneRef.current(undo.scene);
        updateChain(undo.chain);
      }
    };
    const onBlur = () => {
      spaceRef.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const cancelDraw = useCallback(() => {
    // Cancel an in-flight rubber-band draw AND a marquee/lasso band — otherwise
    // a tool switch mid-band strands dragRef, leaving the view frozen.
    if (dragRef.current?.kind === 'draw' || dragRef.current?.kind === 'band') {
      dragRef.current = null;
      onDragging(false);
      setGrabbing(false);
    }
    setPreview(null);
    // Outside the guard above: that branch matches only 'draw'/'band', and a
    // move-rc drag is neither — a clear placed inside it could never fire.
    setSnapGuide(null);
    updateChain(null);
    chainWallsRef.current = []; // keep id-groups in sync when the chain ends
    calibRef.current = null;
  }, [onDragging, updateChain, setPreview]);

  // Switching tools (or Escape → select) finishes/cancels the in-flight draw.
  useEffect(() => {
    cancelDraw();
    setWallHover(null);
    setBandBoth(null);
    setHoverGrab(false);
    setGrabbing(false);
  }, [mode, cancelDraw]);

  // --- pointer interaction ------------------------------------------------

  const startDrag = (drag: Drag) => {
    dragRef.current = drag;
    // Per GESTURE, not per mount: a stale value from the previous drag would read
    // as an external rotate on this one's first frame.
    lastRotRef.current = null;
    onDragging(true);
    setGrabbing(MOVE_KINDS.has(drag.kind));
  };

  /** A 2nd finger promotes to a pinch. The view maths lives in the camera; the
   *  teardown below belongs to the DRAG machine and stays here. */
  const beginPinchIfTwoPointers = () => {
    if (pointersRef.current.size !== 2 || !view) return false;
    if (dragRef.current) {
      dragRef.current = null;
      onDragging(false);
      setPreview(null);
      setSnapGuide(null);
      setGrabbing(false);
    }
    // A 2nd finger promotes to a pinch — drop any half-drawn selection band.
    setBandBoth(null);
    return armPinch();
  };

  /** The chain's snap targets for the CURRENT scene and id groups. The vertex
   *  maths itself is pure, in `chain.ts`; this supplies only the live state. */
  const chainCtx = () =>
    chainContext(sceneRef.current.objects, chainWallsRef.current, settings.snap);

  const addChainPoint = (raw: Vec2) => {
    const cur = sceneRef.current;
    const points = chainRef.current?.points ?? [];
    const first = points.length === 0;
    if (first) chainWallsRef.current = [];
    const step = chainStep(points, raw, chainCtx(), createId);
    let group: string[] = [];
    if (step.wall) {
      // Joint math: crossings and T-touches split both walls into chunks.
      const joined = integrateWall(cur.objects, step.wall);
      onScene({ ...cur, objects: joined.objects });
      group = joined.newIds;
    }
    if (step.closing) {
      chainWallsRef.current = [];
      updateChain(null);
    } else {
      // One id-group per appended SEGMENT (empty when the click was too short to
      // create a wall), so Backspace pops exactly the walls that corner added.
      // The FIRST vertex opens the chain and owns no segment, so it pushes
      // nothing: `popChainSegment` pairs groups[i] with the segment ENDING at
      // points[i+1], and a leading entry would put the two lists out of step.
      if (!first) chainWallsRef.current.push(group);
      updateChain({ points: [...points, step.at], cursor: null });
    }
  };

  /**
   * The effects `applyPickAction` is allowed to cause. Every one is a closure
   * over this component's state; the ORDER they run in belongs to `pick.ts`,
   * which is what makes it assertable by a test rather than by reading twelve
   * hand-written sequences.
   */
  const pickEffects: PickEffects = {
    setBand: setBandBoth,
    activateSeat: onActivateSeat,
    select: onSelection,
    startDrag,
    placeSpeaker: (at) => {
      // The SAME primitive the keyboard `p` path calls, so the furniture z-snap
      // can never be dropped from one of the two.
      const { scene: next, speakerId } = placeSpeakerAt(
        sceneRef.current,
        at,
        placeModel,
        settings.snap,
      );
      onScene(next);
      onSelection({ type: 'speaker', id: speakerId });
    },
    chainPoint: (at) => addChainPoint(at),
    setCalibFirst: (at) => {
      calibRef.current = at;
    },
    calibrate: onCalibrate,
    insertOpening: (wall, at, role) => {
      const obj = makeOpening(wall, at, role, createId('rect'));
      onScene({ ...sceneRef.current, objects: [...sceneRef.current.objects, obj] });
      onSelection({ type: 'object', id: obj.id });
      setPreview(null);
    },
    notice: onNotice,
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured.
    }
    const native = e.nativeEvent;
    pointersRef.current.set(e.pointerId, { x: native.offsetX, y: native.offsetY });
    if (beginPinchIfTwoPointers()) return;
    if (pinchRef.current) return;

    const act = resolvePointerDown({
      // The PROP, not `sceneRef.current` — the two are the same object at event
      // time (`sceneRef.current = scene` is a render-body assignment and this app
      // uses no concurrent feature: no startTransition, useDeferredValue, Suspense
      // or lazy anywhere in `src`), so this is byte-identical today. It is the
      // prop because `useCanvasPainter` and `handleTarget` are BOTH given the
      // prop: a hit test must agree with the pixels the user aimed at. Scene
      // WRITES still read the ref, which is the freshest value at write time.
      scene,
      selection,
      mode,
      view,
      screenPt: { x: native.offsetX, y: native.offsetY },
      worldPt: s2w(native),
      button: e.button,
      pointerId: e.pointerId,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      spaceHeld: spaceRef.current,
      dragActive: Boolean(dragRef.current),
      calibFirst: calibRef.current,
      handleTarget,
      snapOn: settings.snap,
    });
    applyPickAction(act, pickEffects);
  };


  const applyMove = (native: PointerEvent) => {
    if (pinchRef.current) {
      applyPinch();
      return;
    }
    const drag = dragRef.current;

    // Opening tool: ghost the door/window at the nearest wall point so the user
    // sees exactly where a click will cut (⇧ previews a window). Reuses the
    // canvas `preview` path — zero new DOM, so no transform-clobber / motion work.
    if (!drag && mode === 'opening' && view) {
      setPreview(
        openingGhost(
          sceneRef.current.objects,
          s2w(native),
          WALL_HOVER_APPEAR_PX / view.scale,
          native.shiftKey ? 'window' : 'door',
        ),
      );
      return;
    }

    // Select-mode hover: offer door/window insertion on a wall, and show a grab
    // cursor over anything draggable. Only runs on a no-drag hover. Scoped to the
    // DESIGN (plan) canvas and gated on overlays — `insertOpening` writes the
    // scene directly, so without the overlay gate the chip would mutate behind an
    // open dialog (the S14 mutate-through-a-dialog class), and it has no business
    // popping over the TUNE sound canvas.
    if (!drag && mode === 'select' && theme === 'plan' && !overlayOpenRef.current && view) {
      const cursorS = { x: native.offsetX, y: native.offsetY };
      const hp = s2w(native);
      // `getBoundingClientRect` is viewport-relative while the anchor and cursor
      // are canvas-relative, so the host's origin comes off before the reducer
      // (which is pure, and compares the two in one frame) ever sees the box.
      const box = chipRef.current?.getBoundingClientRect();
      const host = containerRef.current?.getBoundingClientRect();
      const chipBox =
        box && host
          ? {
              left: box.left - host.left,
              top: box.top - host.top,
              right: box.right - host.left,
              bottom: box.bottom - host.top,
            }
          : null;
      setWallHover((prev) =>
        nextWallHover(prev, {
          objects: sceneRef.current.objects,
          cursorS,
          worldPt: hp,
          chipBox,
          appearDist: WALL_HOVER_APPEAR_PX / view.scale,
          project: (w) => worldToScreen(w, view),
        }),
      );
      const grab = isDraggableAt(sceneRef.current, hp, 10 / view.scale);
      setHoverGrab((prev) => (prev === grab ? prev : grab));
    } else {
      // A drag is live or we left select mode — drop any hover affordance.
      if (wallHover) setWallHover(null);
      if (hoverGrab) setHoverGrab(false);
    }

    // §16: the directional resize cursor is a grip's only affordance before you
    // press, so it is what makes an 11 px target findable at all. Deliberately
    // OUTSIDE the block above, which is gated on `theme === 'plan'` for the
    // door/window chip — the grips are live in TUNE too, and a self-review found
    // this update stranded inside that gate, leaving an 11 px capture zone on the
    // sound canvas with no cursor warning at all.
    if (!drag && mode === 'select' && handleTarget && view) {
      const grip = handleAt(handleTarget, view, { x: native.offsetX, y: native.offsetY });
      setHoverHandle((prev) => (prev === grip ? prev : grip));
    } else if (hoverHandle && !drag) {
      setHoverHandle(null);
    }

    // Wall chain preview follows the cursor without a drag. `chainVertex` is the
    // SAME function the click path runs, so the ghost cannot promise a vertex the
    // click would not land on.
    if (!drag && mode === 'wall') {
      const chainNow = chainRef.current;
      if (chainNow && chainNow.points.length > 0) {
        const { at } = chainVertex(chainNow.points, s2w(native), chainCtx());
        updateChain({ points: chainNow.points, cursor: at });
      }
      return;
    }
    if (!drag || native.pointerId !== drag.pointerId) return;

    if (drag.kind === 'pan') {
      setView((prev) =>
        prev
          ? { ...prev, ox: drag.ox + (native.offsetX - drag.sx), oy: drag.oy + (native.offsetY - drag.sy) }
          : prev,
      );
      return;
    }

    if (drag.kind === 'band') {
      const pts = bandRef.current ?? [];
      const here = { x: native.offsetX, y: native.offsetY };
      if (drag.shape === 'marquee') {
        setBandBoth([pts[0] ?? here, here]);
      } else if (pts.length === 0 || v.dist(pts[pts.length - 1], here) > 6) {
        setBandBoth([...pts, here]);
      }
      return;
    }

    const cur = sceneRef.current;
    const p = s2w(native);

    // The six scene-writing branches live in the pure `drag-apply.ts`. This
    // supplies only the gesture — and then writes back the two values the
    // move-rc branch owns but cannot store itself: the re-based `rot0` (which
    // MUST land on the mutable Drag record, or a mid-gesture q/e is reverted on
    // the next frame — the S23 regression) and the rotation it just wrote, which
    // is how the next frame tells its own output from an external edit.
    const res = applyDragToScene(cur, drag, p, {
      snapOn: settings.snap,
      shiftKey: native.shiftKey,
      altKey: native.altKey,
      lastRot: lastRotRef.current,
    });
    if (res) {
      if (drag.kind === 'move-rc') {
        drag.rot0 = res.rot0;
        lastRotRef.current = res.lastRot;
        // Identity-preserving: React bails out unless the captured wall or the
        // seated flag actually changed, so this is at most two renders per gesture.
        setSnapGuide((prev) =>
          prev?.wallId === res.guide?.wallId && prev?.seated === res.guide?.seated
            ? prev
            : res.guide,
        );
      }
      onScene(res.scene);
      return;
    }

    // Only 'draw' reaches here — 'pan' and 'band' returned far above and every
    // scene-writing kind returned just now. The guard is what lets TypeScript
    // see it, and it is a real belt-and-braces against a future eighth kind.
    if (drag.kind !== 'draw') return;
    setPreview(previewForDraw(drag, p, settings.snap));
  };

  const rafRef = useRef(0);
  const pendingRef = useRef<PointerEvent | null>(null);
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const native = e.nativeEvent;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: native.offsetX, y: native.offsetY });
    }
    // Select-mode hovers (wall chips + grab cursor) and the opening-tool ghost
    // must flow through too.
    if (
      !dragRef.current &&
      !pinchRef.current &&
      mode !== 'wall' &&
      mode !== 'select' &&
      mode !== 'opening'
    )
      return;
    pendingRef.current = native;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (pendingRef.current) applyMove(pendingRef.current);
    });
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) pinchRef.current = null;
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    // Flush any move still queued behind the rAF throttle.
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (pendingRef.current) {
      applyMove(pendingRef.current);
      pendingRef.current = null;
    }

    dragRef.current = null;
    onDragging(false);
    setGrabbing(false);
    setSnapGuide(null);

    if (drag.kind === 'band') {
      const pts = bandRef.current;
      setBandBoth(null);
      if (!view) return;
      // A click-length band (no real drag) deselects — parity with an empty
      // select-click — unless additive, which preserves the current selection.
      onSelection(
        selectionFromBand({
          objects: sceneRef.current.objects,
          speakers: sceneRef.current.speakers,
          band: pts ?? [],
          shape: drag.shape,
          project: (w) => worldToScreen(w, view),
          additive: drag.additive,
          base: selection,
        }),
      );
      return;
    }

    const drawn = previewRef.current;
    if (drag.kind === 'draw' && drag.tool === 'room' && drawn?.kind === 'rect') {
      if (drawn.w >= 0.8 && drawn.h >= 0.8) {
        onRoomDrawn({ center: drawn.center, w: drawn.w, h: drawn.h });
      }
      setPreview(null);
      return;
    }
    if (drag.kind === 'draw' && drawn) {
      const cur = sceneRef.current;
      const commit = commitDraw(drawn, createId);
      if (commit) {
        onScene({ ...cur, objects: [...cur.objects, commit] });
        onSelection({ type: 'object', id: commit.id });
      }
    }
    setPreview(null);
  };

  /** Drop a door or window exactly where the wall is being hovered. */
  const insertOpening = (role: 'door' | 'window') => {
    if (!wallHover) return;
    const w = sceneRef.current.objects.find((o) => o.id === wallHover.id);
    if (!w || w.kind !== 'wall') return;
    const obj = makeOpening(w, wallHover.at, role, createId('rect'));
    onScene({ ...sceneRef.current, objects: [...sceneRef.current.objects, obj] });
    onSelection({ type: 'object', id: obj.id });
    setWallHover(null);
  };

  // A live grip drag keeps its own cursor for the whole gesture; otherwise a
  // hovered grip wins over the plain 'grab'. `handleCursor` derives the direction
  // from the grip's SCREEN position, so it stays right on a rotated object under
  // a rotated view — both of which this app has.
  const gripCursorFor = dragRef.current?.kind === 'handle' ? dragRef.current.handle : hoverHandle;
  const cursor =
    handleTarget && view && gripCursorFor
      ? handleCursor(handleTarget, view, gripCursorFor)
      : hoverCursor(mode, { hoverGrab, dragging: grabbing });

  return (
    <div ref={containerRef} className="sim-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="sim-canvas"
        style={{ cursor }}
        /* The canvas IS the product, and until S7 it had no focusable element at
           all — every wall, seat and piece of furniture was pointer-only (WCAG
           2.1.1). `role="application"` is the deliberate choice over `img`: a
           screen reader keeps browse mode on over an `img`, which would swallow
           the single-letter keys (n/p/d/w/r/q/e) and the arrows into quick-nav,
           making the whole key map unreachable for exactly the users it exists
           for. The role is scoped to this ONE element, it publishes its key map
           via aria-describedby, and the off-screen live mirror carries the
           content browse mode would otherwise have provided. */
        tabIndex={overlayOpen ? -1 : 0}
        role="application"
        aria-roledescription="Floorplan editor"
        aria-label="Room plan"
        aria-describedby="sim-canvas-help"
        onBlur={() => {
          // Element-level blur, not just window blur: Tab away mid-Space must
          // not leave panning armed.
          spaceRef.current = false;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          // No pointermove fires once the cursor is off the canvas, so clear the
          // hover affordances here or a door/window chip would linger over a panel.
          //
          // EXCEPT when the cursor is leaving the canvas INTO the chip itself:
          // the chip overlays the canvas, so reaching for "+ Door" fires
          // pointerleave here and used to destroy the chip the instant it was
          // touched — the affordance could never be clicked at all. The chip
          // clears itself on its own pointerleave (below).
          const to = e.relatedTarget;
          if (to instanceof Node && chipRef.current?.contains(to)) return;
          if (!dragRef.current) {
            setWallHover(null);
            setHoverGrab(false);
            // …and the §16 grip cursor, or it lingers after the pointer has left
            // and can then name a grip the newly-selected object does not offer
            // (a circle has no 'nw'), which `handleCursor` answers 'default' to.
            setHoverHandle(null);
            // Clear the opening-tool ghost too — otherwise the dashed door/window
            // ghost freezes on the plan when the cursor moves onto a panel.
            if (mode === 'opening') setPreview(null);
          }
        }}
        onDoubleClick={(e) => {
          if (mode === 'wall') {
            updateChain(null);
            chainWallsRef.current = []; // finishing the chain clears its id-groups
            return;
          }
          if (mode !== 'select' || !view) return;
          const p = s2w(e.nativeEvent);
          const hit = hitTestObjects(scene, p, 10 / view.scale);
          if (hit?.type === 'object') {
            const o = scene.objects.find((x) => x.id === hit.id);
            if (o?.kind === 'wall' && v.dist(o.a, o.b) >= 0.4) {
              onSplitWall(o.id, p);
            }
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <p id="sim-canvas-help" className="sr-only">
        {CANVAS_HELP}
      </p>
      {band && band.length >= 2 && (
        <SelectionBand band={band} shape={mode === 'marquee' ? 'marquee' : 'lasso'} />
      )}
      {wallHover && view && mode === 'select' && theme === 'plan' && !overlayOpen && (
        <WallActionsChip
          at={wallHover.at}
          view={view}
          chipRef={chipRef}
          canvasRef={canvasRef}
          onInsert={insertOpening}
          onDismiss={() => setWallHover(null)}
        />
      )}
      {view && (
        <Compass
          view={view}
          onStraighten={() => {
            if (dragRef.current?.kind === 'band') return; // don't move the view mid-band-drag
            rotateBy(-view.rot);
          }}
        />
      )}
    </div>
  );
}
