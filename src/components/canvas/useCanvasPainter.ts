import { useEffect, useRef, useState } from 'react';
import { renderScene, setRedrawHook, type RenderState } from './render';
import { watchDevicePixelRatio } from './interaction';
import { repaintOnFontLoad } from './font-ready';

/** Everything `renderScene` needs except the pixel dimensions, with a nullable
 *  view — the canvas has no view until it has been sized at least once. */
type PaintState = Omit<RenderState, 'width' | 'height' | 'view'> & {
  view: RenderState['view'] | null;
};

/**
 * Owns the canvas bitmap: the backing store, the draw call, and the three
 * out-of-band repaint triggers. Extracted from SimCanvas in S37.
 *
 * The three triggers exist because each fires when NOTHING in the render state
 * has changed, so the draw effect would otherwise never re-run:
 *   - `setRedrawHook` — an underlay image finished decoding.
 *   - `watchDevicePixelRatio` — the window moved to a monitor with a different
 *     DPR, which changes neither the CSS size nor any dep, leaving a stale and
 *     visibly blurry backing store.
 *   - `repaintOnFontLoad` — canvas pill widths come from `ctx.measureText`, so a
 *     first paint before Geist Mono resolves sizes them off fallback metrics.
 *
 * The render state is destructured IN THE PARAMETER LIST and the effect body
 * touches only those locals. That is what lets the dependency array be a list
 * eslint can verify, with no suppression: SimCanvas builds the argument as an
 * inline literal, so depending on the object itself would repaint on every
 * render, and depending on nothing would need a suppression to hide it.
 */
export function useCanvasPainter(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  size: { w: number; h: number },
  {
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
  }: PaintState,
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
      snapGuide,
      handleTarget,
      theme,
      view,
      width: size.w,
      height: size.h,
    });
    // `redrawTick` is a dep and its SETTER is not — a useState setter is
    // identity-stable, so listing the setter would silently disconnect all three
    // out-of-band triggers above and leave a stale bitmap on screen.
  }, [
    canvasRef,
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
    size,
    redrawTick,
  ]);
}
