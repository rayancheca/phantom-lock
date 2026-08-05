import type { RefObject } from 'react';
import type { Vec2 } from '../../engine/types';
import { worldToScreen, type View } from './view';

/**
 * The three DOM overlays that sit on top of the canvas bitmap, extracted from
 * SimCanvas in S37. All three are presentational: they own no state and make no
 * decisions, so their render GUARDS deliberately stay at the call site — that
 * keeps "is this thing on screen?" answerable by reading SimCanvas alone, which
 * is where the S21 z-index collision had to be diagnosed.
 */

/** The marquee rectangle / lasso polygon, drawn in SCREEN space. */
export function SelectionBand({ band, shape }: { band: Vec2[]; shape: 'marquee' | 'lasso' }) {
  const last = band[band.length - 1];
  return (
    <svg className="band-overlay" aria-hidden="true">
      {shape === 'marquee' ? (
        <rect
          x={Math.min(band[0].x, last.x)}
          y={Math.min(band[0].y, last.y)}
          width={Math.abs(last.x - band[0].x)}
          height={Math.abs(last.y - band[0].y)}
        />
      ) : (
        <polygon points={band.map((q) => `${q.x},${q.y}`).join(' ')} />
      )}
    </svg>
  );
}

interface ChipProps {
  at: Vec2;
  view: View;
  chipRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onInsert: (role: 'door' | 'window') => void;
  onDismiss: () => void;
}

/**
 * The +Door / +Window chip that appears when the cursor is near a wall.
 *
 * ⚠️ It positions itself with the independent `translate` property (in
 * `sim-canvas.css`), NOT with a `transform`: a running `transform` animation
 * REPLACES an element's own transform for its whole duration, which made the
 * chip render at the raw anchor while popping in and then jump ~70 px — the
 * "it runs away from the mouse" report. `getBoundingClientRect` reports the
 * post-animation rect, so that bug is invisible to an API readback.
 */
export function WallActionsChip({ at, view, chipRef, canvasRef, onInsert, onDismiss }: ChipProps) {
  const p = worldToScreen(at, view);
  return (
    <div
      ref={chipRef}
      className="wall-actions"
      // Leaving the chip for anything other than the canvas dismisses it —
      // otherwise it would linger over a sidebar panel, since the canvas has
      // already fired its own pointerleave. Going back to the canvas is
      // handled by the pointermove safe-area test instead.
      onPointerLeave={(e) => {
        const to = e.relatedTarget;
        if (to instanceof Node && canvasRef.current?.contains(to)) return;
        onDismiss();
      }}
      style={{ left: p.x, top: p.y }}
    >
      <button type="button" onClick={() => onInsert('door')}>
        + Door
      </button>
      <button type="button" onClick={() => onInsert('window')}>
        + Window
      </button>
    </div>
  );
}

/** Whole degrees of view rotation, normalised into (-180, 180]. */
export function viewRotationDeg(view: View | null): number {
  return view ? Math.round(((((view.rot * 180) / Math.PI + 180) % 360) + 360) % 360) - 180 : 0;
}

/** The compass — a readout AND the one-click way back to north. */
export function Compass({ view, onStraighten }: { view: View; onStraighten: () => void }) {
  const rotDeg = viewRotationDeg(view);
  return (
    <button
      type="button"
      className={`compass ${rotDeg !== 0 ? 'compass-off' : ''}`}
      title={`View rotated ${rotDeg}°. Click to straighten. Rotate: twist two fingers, ⌥-scroll, or R / ⇧R.`}
      aria-label={`Compass, view rotated ${rotDeg} degrees, click to straighten`}
      onClick={onStraighten}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${view.rot}rad)` }}>
        <path d="M12 3 L15.4 12 L12 10.4 L8.6 12 Z" className="compass-n" />
        <path d="M12 21 L8.6 12 L12 13.6 L15.4 12 Z" className="compass-s" />
      </svg>
      <span>{rotDeg === 0 ? 'N' : `${rotDeg}°`}</span>
    </button>
  );
}
