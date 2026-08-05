import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scene, Vec2 } from '../../engine/types';
import { sceneBounds } from '../../engine/scene';
import * as v from '../../engine/vec';
import { fitView, rotVec, screenToWorld, type View } from './render';

const MIN_SCALE = 8;
const MAX_SCALE = 500;

interface Pinch {
  d0: number;
  angle0: number;
  center0: Vec2;
  world0: Vec2;
  view0: View;
}

interface Args {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Live scene, for the fit-on-reset bounds. A ref, because the fit effect is
   *  keyed on the reset token and must not re-run on every scene edit. */
  sceneRef: React.RefObject<Scene>;
  resetViewToken: number;
  /** True while a marquee/lasso band is being dragged. The band is stored in
   *  SCREEN space, so ANY view change under it desyncs the selection — which is
   *  why every entry point here consults this, not just one of them. */
  isBandDragging: () => boolean;
}

export interface CanvasCamera {
  view: View | null;
  setView: React.Dispatch<React.SetStateAction<View | null>>;
  size: { w: number; h: number };
  /** Rotate the whole view by dr radians around the canvas centre. */
  rotateBy: (dr: number) => void;
  /** Screen (offset) coordinates -> world. */
  s2w: (e: { offsetX: number; offsetY: number }) => Vec2;
  /** Live pointer positions, keyed by pointerId — shared with the drag machine. */
  pointersRef: React.RefObject<Map<number, Vec2>>;
  /** Non-null while a two-finger pinch owns the gesture. */
  pinchRef: React.RefObject<Pinch | null>;
  /** Arm a pinch if exactly two pointers are down. Returns whether it armed. */
  armPinch: () => boolean;
  /** Apply the current two-pointer geometry to the view. */
  applyPinch: () => void;
}

/**
 * The canvas CAMERA — view state, sizing, and every gesture that moves the view
 * rather than the scene. Extracted from SimCanvas in S37.
 *
 * ⚠️ Only the `wheel` listener moved out of SimCanvas's mount-once key effect.
 * The window keydown/keyup/blur handler STAYS there, deliberately: splitting it
 * per concern (Space to the pointer machine, rotate to here, chain Backspace to
 * the chain) would register two window keydown listeners, call `canvasKeyAction`
 * twice per keystroke, and put the "a Space keyup ALWAYS disarms" invariant
 * behind two handler paths. `wheel` is safe to move because it targets the
 * CANVAS, not window, so the registration order between the two is unobservable.
 */
export function useCanvasCamera(a: Args): CanvasCamera {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const pointersRef = useRef<Map<number, Vec2>>(new Map());
  const pinchRef = useRef<Pinch | null>(null);
  const bandRef = useRef(a.isBandDragging);
  bandRef.current = a.isBandDragging;

  /** Rotate the whole view by dr radians around the canvas centre. */
  const rotateBy = useCallback(
    (dr: number) => {
      const el = a.containerRef.current;
      setView((prev) => {
        if (!prev || !el) return prev;
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        const w = screenToWorld({ x: cx, y: cy }, prev);
        const rot = prev.rot + dr;
        const r = rotVec(w, rot);
        return { scale: prev.scale, rot, ox: cx - r.x * prev.scale, oy: cy - r.y * prev.scale };
      });
    },
    [a.containerRef],
  );

  const s2w = useCallback(
    (e: { offsetX: number; offsetY: number }): Vec2 => {
      const vw = view ?? { scale: 60, ox: 0, oy: 0, rot: 0 };
      return screenToWorld({ x: e.offsetX, y: e.offsetY }, vw);
    },
    [view],
  );

  // --- sizing -------------------------------------------------------------
  useEffect(() => {
    const el = a.containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [a.containerRef]);

  useEffect(() => {
    // Don't refit/reset the view mid-band-drag — the band is stored in screen
    // space, so moving the view under it would desync the marquee selection.
    if (size.w > 0 && size.h > 0 && !bandRef.current()) {
      setView(fitView(size.w, size.h, sceneBounds(a.sceneRef.current)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w > 0 && size.h > 0, a.resetViewToken]);

  // --- wheel: pan / zoom / rotate ------------------------------------------
  useEffect(() => {
    const canvas = a.canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Freeze the view while dragging a marquee/lasso band — the band is stored
      // in screen space, so a mid-drag pan/zoom would desync the selection.
      if (bandRef.current()) return;
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
        setView((prev) => (prev ? { ...prev, ox: prev.ox - e.deltaX, oy: prev.oy - e.deltaY } : prev));
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [a.canvasRef]);

  // Safari trackpads report real twist/pinch gestures — use them when present.
  useEffect(() => {
    const canvas = a.canvasRef.current;
    if (!canvas || !('GestureEvent' in window)) return;
    let base: { view0: View; center: Vec2; world0: Vec2 } | null = null;
    const start = (ev: Event) => {
      ev.preventDefault();
      if (bandRef.current()) return; // freeze view during a band drag
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
  }, [a.canvasRef]);

  /** Arm a pinch when a second pointer lands. The CALLER is responsible for
   *  tearing down any in-flight drag first — that cleanup touches the drag
   *  machine's state, which this hook deliberately knows nothing about. */
  const armPinch = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length !== 2 || !view) return false;
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

  return { view, setView, size, rotateBy, s2w, pointersRef, pinchRef, armPinch, applyPinch };
}
