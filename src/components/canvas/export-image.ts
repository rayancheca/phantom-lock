import type { SimSettings, Scene, TraceResult } from '../../engine/types';
import type { AudioMetrics } from '../../engine/stereo';
import type { ListeningField } from '../../engine/bestspot';
import { sceneBounds } from '../../engine/scene';
import { fitView, renderScene, type CanvasTheme } from './render';

export interface PlanImageInput {
  scene: Scene;
  settings: SimSettings;
  trace: TraceResult;
  audio: AudioMetrics;
  bestSpot: ListeningField | null;
  theme: CanvasTheme;
}

/** Long edge of the exported image, in device pixels. */
const LONG_EDGE = 1500;
/** Matches fitView's ~45px-per-side breathing room so the plan isn't edge-to-edge. */
const PADDING = 90;

/**
 * Render the current plan to a PNG Blob for sharing — UX-4 / Session 16 (item H).
 *
 * `renderScene` is pure and fully arg-driven (verified: it reads ONLY the
 * RenderState, never `canvas.clientWidth`/CSS/`document`), so this paints an
 * OFFSCREEN canvas at a fixed high resolution — no live DOM node, no DPR
 * dependency. The canvas is sized to the scene's aspect so there's no letterbox,
 * and the view is fit + centred exactly as on screen. It captures whatever the
 * given `theme` shows (the dark `sound` field with its ray glow, or the `plan`
 * blueprint), so the shared image matches what the user is looking at.
 */
// `async` so ANY throw in the synchronous setup (sceneBounds, canvas allocation,
// getContext, or the renderScene draw) becomes a promise REJECTION — the caller
// relies on `.catch` for its error toast, and a plain function would let a sync
// throw escape that chain as an uncaught exception.
export async function renderPlanToBlob(input: PlanImageInput): Promise<Blob> {
  const { scene, settings, trace, audio, bestSpot, theme } = input;
  const b = sceneBounds(scene);
  const bw = Math.max(1, b.max.x - b.min.x);
  const bh = Math.max(1, b.max.y - b.min.y);
  const scale = LONG_EDGE / Math.max(bw, bh);
  const width = Math.max(480, Math.round(bw * scale) + PADDING);
  const height = Math.max(360, Math.round(bh * scale) + PADDING);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  renderScene(ctx, {
    scene,
    settings,
    selection: null,
    trace,
    audio,
    preview: null,
    chain: null,
    proposal: null,
    furnitureProposal: null,
    bestSpot,
    theme,
    view: fitView(width, height, b),
    width,
    height,
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the plan image'));
    }, 'image/png');
  });
}

/** Filename-safe slug from a layout name, e.g. "Maple Court" → "maple-court". */
export function planImageFilename(layoutName: string): string {
  const slug =
    layoutName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'plan';
  return `phantom-lock-${slug}.png`;
}
