import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Scene,
  SceneObject,
  Selection,
  SimSettings,
  SpeakerModel,
  ToolMode,
  TraceResult,
  Vec2,
  WallObj,
} from '../../engine/types';
import type { AudioMetrics } from '../../engine/stereo';
import type { Proposal } from '../../engine/optimize';
import type { ListeningField } from '../../engine/bestspot';
import { hitTestNodes, hitTestObjects } from '../../engine/hit';
import { closestPointOnSegment, distPointSegment, pointInPolygon, pointInRect } from '../../engine/geometry';
import { createId, makeSpeaker, ROOM_HEIGHT, sceneBounds } from '../../engine/scene';
import { integrateWall, snapToWalls } from '../../engine/joints';
import * as v from '../../engine/vec';
import {
  fitView,
  renderScene,
  rotVec,
  screenToWorld,
  setRedrawHook,
  worldToScreen,
  type CanvasTheme,
  type View,
  type WallChain,
} from './render';
import './sim-canvas.css';

const SNAP_STEP = 0.05;
const MIN_SCALE = 8;
const MAX_SCALE = 500;
/** Clicking this close to the chain's first vertex closes the room. */
const CLOSE_RADIUS = 0.25;
/** Wall segments snap to 45° multiples when within this many degrees. */
const ANGLE_SNAP_DEG = 7;

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
  onScene: (s: Scene) => void;
  onSelection: (sel: Selection) => void;
  onDragging: (dragging: boolean) => void;
  /** Two calibration clicks landed — App asks for the real distance. */
  onCalibrate: (a: Vec2, b: Vec2) => void;
  onRoomDrawn: (zone: { center: Vec2; w: number; h: number }) => void;
  /** Double-click on a wall: break it into two at that point. */
  onSplitWall: (id: string, at: Vec2) => void;
}

type DrawTool = 'rect' | 'circle' | 'room';

type Drag =
  | { kind: 'pan'; pointerId: number; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'node'; pointerId: number; node: 'listener' | { speakerId: string } }
  | { kind: 'wall-end'; pointerId: number; id: string; end: 'a' | 'b' }
  | { kind: 'move-wall'; pointerId: number; id: string; start: Vec2; a0: Vec2; b0: Vec2 }
  | { kind: 'move-rc'; pointerId: number; id: string; start: Vec2; c0: Vec2 }
  | { kind: 'draw'; pointerId: number; tool: DrawTool; anchor: Vec2 }
  | { kind: 'band'; pointerId: number; shape: 'marquee' | 'lasso'; additive: boolean }
  | {
      kind: 'move-multi';
      pointerId: number;
      start: Vec2;
      objects: Array<{ id: string; a?: Vec2; b?: Vec2; center?: Vec2 }>;
      speakers: Array<{ id: string; pos: Vec2 }>;
    };

interface Pinch {
  d0: number;
  angle0: number;
  center0: Vec2;
  world0: Vec2;
  view0: View;
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
  onScene,
  onSelection,
  onDragging,
  onCalibrate,
  onRoomDrawn,
  onSplitWall,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [wallHover, setWallHover] = useState<{ id: string; at: Vec2 } | null>(null);
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
  const dragRef = useRef<Drag | null>(null);
  const pointersRef = useRef<Map<number, Vec2>>(new Map());
  const pinchRef = useRef<Pinch | null>(null);
  const spaceRef = useRef(false);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  /** Wall ids committed by the active chain, for Backspace-undo. */
  const chainWallsRef = useRef<string[]>([]);
  /** First click of a two-point scale calibration. */
  const calibRef = useRef<Vec2 | null>(null);
  const [redrawTick, setRedrawTick] = useState(0);

  // Async underlay image loads need a repaint once decoded.
  useEffect(() => {
    setRedrawHook(() => setRedrawTick((n) => n + 1));
    return () => setRedrawHook(null);
  }, []);

  /** Rotate the whole view by dr radians around the canvas centre. */
  const rotateBy = useCallback((dr: number) => {
    const el = containerRef.current;
    setView((prev) => {
      if (!prev || !el) return prev;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const w = screenToWorld({ x: cx, y: cy }, prev);
      const rot = prev.rot + dr;
      const r = rotVec(w, rot);
      return { scale: prev.scale, rot, ox: cx - r.x * prev.scale, oy: cy - r.y * prev.scale };
    });
  }, []);

  const snap = useCallback(
    (p: Vec2): Vec2 =>
      settings.snap
        ? { x: Math.round(p.x / SNAP_STEP) * SNAP_STEP, y: Math.round(p.y / SNAP_STEP) * SNAP_STEP }
        : p,
    [settings.snap],
  );

  /** Snap a wall endpoint to 45° multiples around the previous vertex. */
  const angleSnap = useCallback((from: Vec2, to: Vec2): Vec2 => {
    const d = v.sub(to, from);
    const len = v.len(d);
    if (len < 1e-6) return to;
    const ang = Math.atan2(d.y, d.x);
    const step = Math.PI / 4;
    const snapped = Math.round(ang / step) * step;
    if (Math.abs(ang - snapped) < (ANGLE_SNAP_DEG * Math.PI) / 180) {
      return v.add(from, v.scale(v.fromAngle(snapped), len));
    }
    return to;
  }, []);

  // --- sizing -------------------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size.w > 0 && size.h > 0) {
      setView(fitView(size.w, size.h, sceneBounds(sceneRef.current)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w > 0 && size.h > 0, resetViewToken]);

  // --- drawing ------------------------------------------------------------
  const lastDimsRef = useRef({ w: 0, h: 0, dpr: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const last = lastDimsRef.current;
    if (last.w !== size.w || last.h !== size.h || last.dpr !== dpr) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      lastDimsRef.current = { w: size.w, h: size.h, dpr };
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, {
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
      theme,
      view,
      width: size.w,
      height: size.h,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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
    theme,
    view,
    size,
    redrawTick,
  ]);

  // --- zoom / pan / space -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrlKey+wheel on macOS; ⌘/Ctrl+scroll for mice.
        const sensitivity = e.ctrlKey && !e.metaKey ? 0.012 : 0.002;
        const factor = Math.min(1.3, Math.max(0.75, Math.exp(-e.deltaY * sensitivity)));
        setView((prev) => {
          if (!prev) return prev;
          const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
          const k = scale / prev.scale;
          return {
            ...prev,
            scale,
            ox: e.offsetX - (e.offsetX - prev.ox) * k,
            oy: e.offsetY - (e.offsetY - prev.oy) * k,
          };
        });
      } else if (e.altKey) {
        // ⌥ + two-finger scroll rotates the view around the cursor.
        setView((prev) => {
          if (!prev) return prev;
          const rot = prev.rot + e.deltaY * 0.003;
          const w = screenToWorld({ x: e.offsetX, y: e.offsetY }, prev);
          const r = rotVec(w, rot);
          return { ...prev, rot, ox: e.offsetX - r.x * prev.scale, oy: e.offsetY - r.y * prev.scale };
        });
      } else {
        // Plain two-finger scroll pans, like every floor-planner and Figma.
        setView((prev) =>
          prev ? { ...prev, ox: prev.ox - e.deltaX, oy: prev.oy - e.deltaY } : prev,
        );
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.code === 'Space') spaceRef.current = e.type === 'keydown';
      // R / ⇧R rotate the view in 15° steps around the canvas centre.
      if (e.type === 'keydown' && (e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
        rotateBy(((e.shiftKey ? -15 : 15) * Math.PI) / 180);
      }
      // Backspace while chaining walls: undo the last corner (and its wall).
      if (e.type === 'keydown' && e.key === 'Backspace' && chainRef.current) {
        e.preventDefault();
        const pts = [...chainRef.current.points];
        if (pts.length > 1) {
          pts.pop();
          const lastId = chainWallsRef.current.pop();
          if (lastId) {
            onSceneRef.current({
              ...sceneRef.current,
              objects: sceneRef.current.objects.filter((o) => o.id !== lastId),
            });
          }
          updateChain({ points: pts, cursor: chainRef.current.cursor });
        } else {
          chainWallsRef.current = [];
          updateChain(null);
        }
      }
    };
    const onBlur = () => {
      spaceRef.current = false;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safari trackpads report real twist/pinch gestures — use them when present.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !('GestureEvent' in window)) return;
    let base: { view0: View; center: Vec2; world0: Vec2 } | null = null;
    const start = (ev: Event) => {
      ev.preventDefault();
      const e = ev as unknown as { clientX: number; clientY: number };
      const v0 = viewRef.current;
      if (!v0) return;
      const rect = canvas.getBoundingClientRect();
      const center = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      base = { view0: v0, center, world0: screenToWorld(center, v0) };
    };
    const change = (ev: Event) => {
      ev.preventDefault();
      if (!base) return;
      const e = ev as unknown as { scale: number; rotation: number };
      const b = base;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, b.view0.scale * e.scale));
      const rot = b.view0.rot + (e.rotation * Math.PI) / 180;
      const r = rotVec(b.world0, rot);
      setView({ scale, rot, ox: b.center.x - r.x * scale, oy: b.center.y - r.y * scale });
    };
    const end = (ev: Event) => {
      ev.preventDefault();
      base = null;
    };
    canvas.addEventListener('gesturestart', start);
    canvas.addEventListener('gesturechange', change);
    canvas.addEventListener('gestureend', end);
    return () => {
      canvas.removeEventListener('gesturestart', start);
      canvas.removeEventListener('gesturechange', change);
      canvas.removeEventListener('gestureend', end);
    };
  }, []);

  const cancelDraw = useCallback(() => {
    if (dragRef.current?.kind === 'draw') {
      dragRef.current = null;
      onDragging(false);
    }
    setPreview(null);
    updateChain(null);
    calibRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching tools (or Escape → select) finishes/cancels the in-flight draw.
  useEffect(() => {
    cancelDraw();
    setWallHover(null);
    setBandBoth(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cancelDraw]);

  // --- pointer interaction ------------------------------------------------
  const s2w = useCallback(
    (e: { offsetX: number; offsetY: number }): Vec2 => {
      const vw = view ?? { scale: 60, ox: 0, oy: 0, rot: 0 };
      return screenToWorld({ x: e.offsetX, y: e.offsetY }, vw);
    },
    [view],
  );

  const startDrag = (drag: Drag) => {
    dragRef.current = drag;
    onDragging(true);
  };

  const beginPinchIfTwoPointers = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length !== 2 || !view) return false;
    if (dragRef.current) {
      dragRef.current = null;
      onDragging(false);
      setPreview(null);
    }
    const center0 = v.scale(v.add(pts[0], pts[1]), 0.5);
    pinchRef.current = {
      d0: Math.max(12, v.dist(pts[0], pts[1])),
      angle0: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
      center0,
      world0: screenToWorld(center0, view),
      view0: view,
    };
    return true;
  };

  /** Existing walls the cursor may stick to — never the chain's own pieces. */
  const snapTargets = () => {
    const exclude = new Set(chainWallsRef.current);
    return {
      walls: sceneRef.current.objects.filter((o): o is WallObj => o.kind === 'wall'),
      exclude,
    };
  };

  const addChainPoint = (raw: Vec2) => {
    const cur = sceneRef.current;
    const chainNow = chainRef.current;
    if (!chainNow || chainNow.points.length === 0) {
      chainWallsRef.current = [];
      const t = snapTargets();
      updateChain({ points: [snapToWalls(snap(raw), t.walls, t.exclude)], cursor: null });
      return;
    }
    const last = chainNow.points[chainNow.points.length - 1];
    const closing = chainNow.points.length >= 2 && v.dist(raw, chainNow.points[0]) < CLOSE_RADIUS;
    const t = snapTargets();
    const p = closing
      ? chainNow.points[0]
      : snapToWalls(snap(angleSnap(last, snap(raw))), t.walls, t.exclude);
    if (v.dist(last, p) >= 0.15) {
      const wall: WallObj = {
        id: createId('wall'),
        kind: 'wall',
        a: last,
        b: p,
        absorption: 0.12,
        label: 'Wall',
        height: ROOM_HEIGHT,
      };
      // Joint math: crossings and T-touches split both walls into chunks.
      const joined = integrateWall(cur.objects, wall);
      onScene({ ...cur, objects: joined.objects });
      chainWallsRef.current.push(...joined.newIds);
    }
    if (closing) {
      chainWallsRef.current = [];
      updateChain(null);
    } else {
      updateChain({ points: [...chainNow.points, p], cursor: null });
    }
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

    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      startDrag({
        kind: 'pan',
        pointerId: e.pointerId,
        sx: native.offsetX,
        sy: native.offsetY,
        ox: view.ox,
        oy: view.oy,
      });
      return;
    }
    if (e.button !== 0 || dragRef.current) return;

    const p = s2w(native);
    const tol = 10 / view.scale;

    if (mode === 'calibrate') {
      if (!calibRef.current) {
        calibRef.current = p;
      } else {
        const a = calibRef.current;
        calibRef.current = null;
        onCalibrate(a, p);
      }
      return;
    }

    if (mode === 'wall') {
      addChainPoint(p);
      return;
    }

    if (mode === 'speaker') {
      const cur = sceneRef.current;
      const speaker = makeSpeaker(snap(p), cur, placeModel);
      // Placed on a desk/shelf? The speaker stands on it, not inside it.
      const surf = surfaceHeightAt(speaker.pos);
      if (surf !== null) speaker.z = Math.round((surf + 0.12) * 100) / 100;
      onScene({ ...cur, speakers: [...cur.speakers, speaker] });
      onSelection({ type: 'speaker', id: speaker.id });
      return;
    }

    if (mode === 'marquee' || mode === 'lasso') {
      const additive = e.metaKey || e.ctrlKey || e.shiftKey;
      setBandBoth([{ x: native.offsetX, y: native.offsetY }]);
      startDrag({
        kind: 'band',
        pointerId: e.pointerId,
        shape: mode === 'marquee' ? 'marquee' : 'lasso',
        additive,
      });
      return;
    }

    if (mode !== 'select') {
      startDrag({ kind: 'draw', pointerId: e.pointerId, tool: mode, anchor: snap(p) });
      return;
    }

    // ⌘/Ctrl-click: toggle the clicked thing in and out of a multi-selection.
    if (e.metaKey || e.ctrlKey) {
      const nh = hitTestNodes(scene, p, tol);
      const oh = nh ? null : hitTestObjects(scene, p, tol);
      const cur = selection;
      const objectIds = new Set(
        cur?.type === 'multi' ? cur.objectIds : cur?.type === 'object' ? [cur.id] : [],
      );
      const speakerIds = new Set(
        cur?.type === 'multi' ? cur.speakerIds : cur?.type === 'speaker' ? [cur.id] : [],
      );
      if (nh?.type === 'speaker') {
        speakerIds.has(nh.id) ? speakerIds.delete(nh.id) : speakerIds.add(nh.id);
      } else if (oh?.type === 'object') {
        objectIds.has(oh.id) ? objectIds.delete(oh.id) : objectIds.add(oh.id);
      } else {
        return; // clicked empty space — keep the selection as is
      }
      const total = objectIds.size + speakerIds.size;
      onSelection(
        total === 0
          ? null
          : total === 1 && speakerIds.size === 1
            ? { type: 'speaker', id: [...speakerIds][0] }
            : total === 1
              ? { type: 'object', id: [...objectIds][0] }
              : { type: 'multi', objectIds: [...objectIds], speakerIds: [...speakerIds] },
      );
      return;
    }

    // Dragging any member of a multi-selection moves the whole group.
    if (selection?.type === 'multi') {
      const nh = hitTestNodes(scene, p, tol);
      const oh = nh ? null : hitTestObjects(scene, p, tol);
      const memberHit =
        (nh?.type === 'speaker' && selection.speakerIds.includes(nh.id)) ||
        (oh?.type === 'object' && selection.objectIds.includes(oh.id));
      if (memberHit) {
        startDrag({
          kind: 'move-multi',
          pointerId: e.pointerId,
          start: p,
          objects: scene.objects
            .filter((o) => selection.objectIds.includes(o.id))
            .map((o) =>
              o.kind === 'wall' ? { id: o.id, a: o.a, b: o.b } : { id: o.id, center: o.center },
            ),
          speakers: scene.speakers
            .filter((s) => selection.speakerIds.includes(s.id))
            .map((s) => ({ id: s.id, pos: s.pos })),
        });
        return;
      }
    }

    const nodeHit = hitTestNodes(scene, p, tol);
    if (nodeHit?.type === 'listener') {
      onSelection(nodeHit);
      startDrag({ kind: 'node', pointerId: e.pointerId, node: 'listener' });
      return;
    }
    if (nodeHit?.type === 'speaker') {
      onSelection(nodeHit);
      startDrag({ kind: 'node', pointerId: e.pointerId, node: { speakerId: nodeHit.id } });
      return;
    }

    if (selection?.type === 'object') {
      const sel = scene.objects.find((o) => o.id === selection.id);
      if (sel?.kind === 'wall') {
        for (const end of ['a', 'b'] as const) {
          if (v.dist(p, sel[end]) <= tol * 1.4) {
            startDrag({ kind: 'wall-end', pointerId: e.pointerId, id: sel.id, end });
            return;
          }
        }
      }
    }

    const objHit = hitTestObjects(scene, p, tol);
    if (objHit?.type === 'object') {
      onSelection(objHit);
      const o = scene.objects.find((x) => x.id === objHit.id);
      if (o?.kind === 'wall') {
        startDrag({ kind: 'move-wall', pointerId: e.pointerId, id: o.id, start: p, a0: o.a, b0: o.b });
      } else if (o) {
        startDrag({ kind: 'move-rc', pointerId: e.pointerId, id: o.id, start: p, c0: o.center });
      }
      return;
    }

    onSelection(null);
  };

  const applyPinch = () => {
    const pinch = pinchRef.current;
    const pts = [...pointersRef.current.values()];
    if (!pinch || pts.length < 2) return;
    const d = Math.max(12, v.dist(pts[0], pts[1]));
    const center = v.scale(v.add(pts[0], pts[1]), 0.5);
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (pinch.view0.scale * d) / pinch.d0));
    // Twisting the two fingers rotates the whole plan around them.
    const rot = pinch.view0.rot + (angle - pinch.angle0);
    const r = rotVec(pinch.world0, rot);
    setView({ scale, rot, ox: center.x - r.x * scale, oy: center.y - r.y * scale });
  };

  const applyMove = (native: PointerEvent) => {
    if (pinchRef.current) {
      applyPinch();
      return;
    }
    const drag = dragRef.current;

    // Hovering a wall in select mode offers door/window insertion.
    if (!drag && mode === 'select') {
      const hp = s2w(native);
      let found: { id: string; at: Vec2 } | null = null;
      let bestD = 0.22;
      for (const o of sceneRef.current.objects) {
        if (o.kind !== 'wall') continue;
        const d = distPointSegment(hp, o.a, o.b);
        if (d < bestD) {
          bestD = d;
          found = { id: o.id, at: closestPointOnSegment(hp, o.a, o.b).point };
        }
      }
      setWallHover((prev) =>
        prev && found && prev.id === found.id && v.dist(prev.at, found.at) < 0.04 ? prev : found,
      );
    } else if (wallHover) {
      setWallHover(null);
    }

    // Wall chain preview follows the cursor without a drag.
    if (!drag && mode === 'wall') {
      const chainNow = chainRef.current;
      if (chainNow && chainNow.points.length > 0) {
        const raw = s2w(native);
        const last = chainNow.points[chainNow.points.length - 1];
        const closing = chainNow.points.length >= 2 && v.dist(raw, chainNow.points[0]) < CLOSE_RADIUS;
        const t = snapTargets();
        const cursor = closing
          ? chainNow.points[0]
          : snapToWalls(snap(angleSnap(last, snap(raw))), t.walls, t.exclude);
        updateChain({ points: chainNow.points, cursor });
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

    if (drag.kind === 'move-multi') {
      // Snap the DELTA, not each piece — the group keeps its internal layout.
      const raw = v.sub(p, drag.start);
      const d = {
        x: Math.round(raw.x / SNAP_STEP) * SNAP_STEP,
        y: Math.round(raw.y / SNAP_STEP) * SNAP_STEP,
      };
      const objById = new Map(drag.objects.map((o) => [o.id, o]));
      const spById = new Map(drag.speakers.map((s) => [s.id, s]));
      onScene({
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
      return;
    }

    if (drag.kind === 'node') {
      const sp = snap(p);
      if (drag.node === 'listener') {
        onScene({ ...cur, listener: { ...cur.listener, pos: sp } });
      } else {
        const speakerId = drag.node.speakerId;
        const surf = surfaceHeightAt(sp);
        onScene({
          ...cur,
          speakers: cur.speakers.map((s) =>
            s.id === speakerId
              ? { ...s, pos: sp, z: surf !== null ? Math.round((surf + 0.12) * 100) / 100 : s.z }
              : s,
          ),
        });
      }
      return;
    }

    if (drag.kind === 'wall-end') {
      const others = cur.objects.filter((o): o is WallObj => o.kind === 'wall' && o.id !== drag.id);
      const stuck = snapToWalls(snap(p), others);
      onScene({
        ...cur,
        objects: cur.objects.map((o) =>
          o.id === drag.id && o.kind === 'wall' ? { ...o, [drag.end]: stuck } : o,
        ),
      });
      return;
    }

    if (drag.kind === 'move-wall') {
      const d = v.sub(p, drag.start);
      onScene({
        ...cur,
        objects: cur.objects.map((o) =>
          o.id === drag.id && o.kind === 'wall'
            ? { ...o, a: snap(v.add(drag.a0, d)), b: snap(v.add(drag.b0, d)) }
            : o,
        ),
      });
      return;
    }

    if (drag.kind === 'move-rc') {
      const d = v.sub(p, drag.start);
      onScene({
        ...cur,
        objects: cur.objects.map((o) => {
          if (o.id !== drag.id || o.kind === 'wall') return o;
          let center = snap(v.add(drag.c0, d));
          // Windows and doors magnetise onto the nearest wall.
          if (o.kind === 'rect' && (o.role === 'window' || o.role === 'door')) {
            let bestWall: { point: Vec2; angle: number; dist: number } | null = null;
            for (const w of cur.objects) {
              if (w.kind !== 'wall') continue;
              const dist = distPointSegment(center, w.a, w.b);
              if (dist < 0.35 && (!bestWall || dist < bestWall.dist)) {
                const { point } = closestPointOnSegment(center, w.a, w.b);
                bestWall = { point, angle: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), dist };
              }
            }
            if (bestWall) {
              return { ...o, center: bestWall.point, rotation: bestWall.angle };
            }
          }
          return { ...o, center };
        }),
      });
      return;
    }

    // drag.kind === 'draw' — rect / circle rubber band.
    const a = drag.anchor;
    const b = snap(p);
    if (drag.tool === 'rect' || drag.tool === 'room') {
      setPreview({
        id: 'preview',
        kind: 'rect',
        center: v.lerp(a, b, 0.5),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
        rotation: 0,
        absorption: 0.3,
        label: drag.tool === 'room' ? 'Room' : 'Object',
        role: 'furniture',
        height: 0.9,
      });
    } else {
      setPreview({
        id: 'preview',
        kind: 'circle',
        center: a,
        r: v.dist(a, b),
        absorption: 0.3,
        label: 'Object',
        height: 0.75,
      });
    }
  };

  const rafRef = useRef(0);
  const pendingRef = useRef<PointerEvent | null>(null);
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const native = e.nativeEvent;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: native.offsetX, y: native.offsetY });
    }
    if (!dragRef.current && !pinchRef.current && mode !== 'wall') return;
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

    if (drag.kind === 'band') {
      const pts = bandRef.current;
      setBandBoth(null);
      const vw = view;
      if (!pts || pts.length < 2 || !vw) return;
      const inBand = (world: Vec2): boolean => {
        const s = worldToScreen(world, vw);
        if (drag.shape === 'marquee') {
          const [a, b] = [pts[0], pts[pts.length - 1]];
          return (
            s.x >= Math.min(a.x, b.x) &&
            s.x <= Math.max(a.x, b.x) &&
            s.y >= Math.min(a.y, b.y) &&
            s.y <= Math.max(a.y, b.y)
          );
        }
        return pts.length >= 3 && pointInPolygon(s, pts);
      };
      const cur = sceneRef.current;
      const objectIds = new Set(
        drag.additive && selection?.type === 'multi'
          ? selection.objectIds
          : drag.additive && selection?.type === 'object'
            ? [selection.id]
            : [],
      );
      const speakerIds = new Set(
        drag.additive && selection?.type === 'multi'
          ? selection.speakerIds
          : drag.additive && selection?.type === 'speaker'
            ? [selection.id]
            : [],
      );
      for (const o of cur.objects) {
        const c = o.kind === 'wall' ? v.lerp(o.a, o.b, 0.5) : o.center;
        if (inBand(c)) objectIds.add(o.id);
      }
      for (const s of cur.speakers) {
        if (inBand(s.pos)) speakerIds.add(s.id);
      }
      const total = objectIds.size + speakerIds.size;
      onSelection(
        total === 0
          ? null
          : total === 1 && speakerIds.size === 1
            ? { type: 'speaker', id: [...speakerIds][0] }
            : total === 1
              ? { type: 'object', id: [...objectIds][0] }
              : { type: 'multi', objectIds: [...objectIds], speakerIds: [...speakerIds] },
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
      let commit: SceneObject | null = null;
      if (drawn.kind === 'rect' && drawn.w >= 0.15 && drawn.h >= 0.15) {
        commit = { ...drawn, id: createId('rect') };
      } else if (drawn.kind === 'circle' && drawn.r >= 0.1) {
        commit = { ...drawn, id: createId('circle') };
      }
      if (commit) {
        onScene({ ...cur, objects: [...cur.objects, commit] });
        onSelection({ type: 'object', id: commit.id });
      }
    }
    setPreview(null);
  };

  /** If p lands on furniture, a speaker standing there sits on top of it. */
  const surfaceHeightAt = (p: Vec2): number | null => {
    let best: number | null = null;
    for (const o of sceneRef.current.objects) {
      if (o.kind === 'wall') continue;
      if (o.kind === 'rect' && (o.role === 'door' || o.role === 'window')) continue;
      const inside =
        o.kind === 'rect'
          ? pointInRect(p, o)
          : o.kind === 'circle'
            ? v.dist(p, o.center) <= o.r
            : false;
      // Standing surfaces only — nobody perches a speaker on a wardrobe.
      if (inside && o.height <= 1.6 && (best === null || o.height > best)) best = o.height;
    }
    return best;
  };

  /** Drop a door or window exactly where the wall is being hovered. */
  const insertOpening = (role: 'door' | 'window') => {
    if (!wallHover) return;
    const w = sceneRef.current.objects.find((o) => o.id === wallHover.id);
    if (!w || w.kind !== 'wall') return;
    const dir = v.norm(v.sub(w.b, w.a));
    const obj: SceneObject = {
      id: createId('rect'),
      kind: 'rect',
      center: wallHover.at,
      w: role === 'door' ? 0.9 : 1.2,
      h: role === 'door' ? 0.1 : 0.12,
      rotation: Math.atan2(dir.y, dir.x),
      absorption: role === 'door' ? 0.25 : 0.04,
      label: role === 'door' ? 'Door' : 'Window',
      role,
      height: role === 'door' ? 2.05 : 2.2,
      doorOpen: role === 'door' ? true : undefined,
    };
    onScene({ ...sceneRef.current, objects: [...sceneRef.current.objects, obj] });
    onSelection({ type: 'object', id: obj.id });
    setWallHover(null);
  };

  const cursor = mode === 'select' ? 'default' : 'crosshair';
  const rotDeg = view ? Math.round((((view.rot * 180) / Math.PI + 180) % 360 + 360) % 360) - 180 : 0;

  return (
    <div ref={containerRef} className="sim-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="sim-canvas"
        style={{ cursor }}
        aria-label="Acoustic ray-tracing floorplan. Drag speakers, listener, walls, and furniture."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if (mode === 'wall') {
            updateChain(null);
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
      {band && band.length >= 2 && (
        <svg className="band-overlay" aria-hidden="true">
          {mode === 'marquee' ? (
            <rect
              x={Math.min(band[0].x, band[band.length - 1].x)}
              y={Math.min(band[0].y, band[band.length - 1].y)}
              width={Math.abs(band[band.length - 1].x - band[0].x)}
              height={Math.abs(band[band.length - 1].y - band[0].y)}
            />
          ) : (
            <polygon points={band.map((q) => `${q.x},${q.y}`).join(' ')} />
          )}
        </svg>
      )}
      {wallHover && view && mode === 'select' && (
        <div
          className="wall-actions"
          style={{
            left: worldToScreen(wallHover.at, view).x,
            top: worldToScreen(wallHover.at, view).y,
          }}
        >
          <button type="button" onClick={() => insertOpening('door')}>
            + Door
          </button>
          <button type="button" onClick={() => insertOpening('window')}>
            + Window
          </button>
        </div>
      )}
      {view && (
        <button
          type="button"
          className={`compass ${rotDeg !== 0 ? 'compass-off' : ''}`}
          title={`View rotated ${rotDeg}°. Click to straighten. Rotate: twist two fingers, ⌥-scroll, or R / ⇧R.`}
          aria-label={`Compass, view rotated ${rotDeg} degrees, click to straighten`}
          onClick={() => rotateBy(-(view.rot))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${view.rot}rad)` }}>
            <path d="M12 3 L15.4 12 L12 10.4 L8.6 12 Z" className="compass-n" />
            <path d="M12 21 L8.6 12 L12 13.6 L15.4 12 Z" className="compass-s" />
          </svg>
          <span>{rotDeg === 0 ? 'N' : `${rotDeg}°`}</span>
        </button>
      )}
    </div>
  );
}
