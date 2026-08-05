import { useEffect, useRef, useState } from 'react';
import { renderScene, setRedrawHook, type RenderState } from './render';
import { watchDevicePixelRatio } from './interaction';
import { repaintOnFontLoad } from './font-ready';

/**
 * Owns the canvas bitmap: the backing store, the draw call, and the three
 * out-of-band repaint triggers. Extracted from SimCanvas in S37.
 *
 * The three triggers exist because each fires when NOTHING in `state` has
 * changed, so the draw effect below would otherwise never re-run:
 *   - `setRedrawHook` — an underlay image finished decoding.
 *   - `watchDevicePixelRatio` — the window moved to a monitor with a different
 *     DPR, which changes neither the CSS size nor any dep, leaving a stale and
 *     visibly blurry backing store.
 *   - `repaintOnFontLoad` — canvas pill widths come from `ctx.measureText`, so a
 *     first paint before Geist Mono resolves sizes them off fallback metrics.
 *
 * ⚠️ The draw effect's dependency array is spread member by member rather than
 * taking the state object, because SimCanvas builds that object inline and a
 * new literal every render would repaint on every render. No unit test can see
 * a mistake here — jsdom has no canvas pixels — so it is checked by the CDP
 * differential instead.
 */
export function useCanvasPainter(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  size: { w: number; h: number },
  state: Omit<RenderState, 'width' | 'height'> | null,
): void {
  const [redrawTick, setRedrawTick] = useState(0);
  const lastDimsRef = useRef({ w: 0, h: 0, dpr: 0 });
  const bump = () => setRedrawTick((n) => n + 1);

  // Async underlay image loads need a repaint once decoded.
  useEffect(() => {
    setRedrawHook(bump);
    return () => setRedrawHook(null);
  }, []);

  // Re-rasterize when the device pixel ratio changes (window dragged to a
  // monitor with a different DPR — which changes neither CSS size nor any dep,
  // so the draw effect below would otherwise keep the stale, blurry backing store).
  useEffect(() => watchDevicePixelRatio(bump), []);

  // Repaint once Geist Mono is ready so canvas pill widths (ctx.measureText)
  // don't reflow off fallback metrics on the first paint (FOUT guard). No-ops
  // in the vitest node env (no document.fonts); cleanup cancels a late repaint.
  useEffect(() => repaintOnFontLoad(bump), []);

  const s = state;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !s || size.w === 0) return;
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
    renderScene(ctx, { ...s, width: size.w, height: size.h });
    // Member by member, NOT [s]: SimCanvas builds `state` as an inline literal,
    // so a whole-object dep would be a fresh reference every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasRef,
    s?.scene,
    s?.settings,
    s?.selection,
    s?.trace,
    s?.audio,
    s?.preview,
    s?.chain,
    s?.proposal,
    s?.furnitureProposal,
    s?.bestSpot,
    s?.snapGuide,
    s?.handleTarget,
    s?.theme,
    s?.view,
    size,
    // The TICK, never the setter. A useState setter is identity-stable, so
    // listing it would silently disconnect all three out-of-band triggers —
    // the underlay decode, the DPR change and the font load would each bump a
    // counter nothing depends on, and the stale bitmap would stay on screen.
    redrawTick,
  ]);
}
