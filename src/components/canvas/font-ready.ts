// Canvas numbers/pills are painted with Geist Mono (see FONT/FONT_MD in
// render.ts). On first mount the swap-face may not be loaded yet, so pill
// widths (ctx.measureText) get computed from fallback (ui-monospace) metrics
// and would only correct on some unrelated later repaint — a visible reflow.
// This triggers the load, then repaints exactly once when the faces are ready.
//
// Node-testable: inject a FontFaceSet-like `{ load }`. No-ops when absent
// (vitest node env, or a browser without FontFaceSet).

/** The two Geist Mono weights the canvas actually paints (FONT = 400, and
 *  FONT_MD / former-`bold` = 500). The size in the shorthand is irrelevant to
 *  face selection — only family + weight decide which woff2 loads. */
const CANVAS_FONT_SPECS = ['11px "Geist Mono"', '500 12px "Geist Mono"'] as const;

/**
 * Load the given font specs, then call `onReady` once (on the next tick after
 * all specs settle). Returns an unsubscribe that cancels the pending callback
 * so it can't fire after unmount. No-ops (never calls `onReady`) when the
 * fontset or its `load` method is unavailable.
 *
 * Uses `load(spec)` per weight rather than `document.fonts.ready`: swap faces
 * are lazy — `ready` can resolve before Geist Mono was ever requested, whereas
 * `load(spec)` both *triggers* the fetch and resolves when that face is ready.
 */
export function repaintOnFontLoad(
  onReady: () => void,
  specs: readonly string[] = CANVAS_FONT_SPECS,
  fonts: Pick<FontFaceSet, 'load'> | undefined =
    typeof document !== 'undefined' ? document.fonts : undefined,
): () => void {
  if (!fonts || typeof fonts.load !== 'function') return () => {};
  let cancelled = false;
  // `.catch` per spec so one rejected face can't reject the whole batch — we
  // still repaint once everything settles (the mount paint already used the
  // fallback font). But DON'T swallow it silently: a missing/404'd self-hosted
  // woff2 means the canvas renders in the fallback forever with no other signal,
  // so warn once. (Only fires on an actual failure — the happy path is silent.)
  Promise.all(
    specs.map((s) =>
      fonts.load(s).catch((err) => {
        console.warn(`[repaintOnFontLoad] font not loaded for "${s}"`, err);
        return [] as FontFace[];
      }),
    ),
  )
    .then(() => {
      if (!cancelled) onReady();
    })
    .catch((err) => {
      // Reachable if onReady() itself throws — the per-spec catches above mean
      // the load promises never reject, so this is the ONLY thing that lands
      // here. A silently-dropped repaint failure would be undebuggable.
      console.error('[repaintOnFontLoad] repaint callback failed', err);
    });
  return () => {
    cancelled = true;
  };
}
