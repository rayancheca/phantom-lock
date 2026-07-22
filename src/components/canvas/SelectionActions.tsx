import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import type { Selection } from '../../engine/types';
import Icon, { type IconName } from '../ui/Icon';
import './sim-canvas.css';

/** Fixed nudge step for touch — coarser than the fine 0.05 m keyboard step. */
const TOUCH_NUDGE_M = 0.1;

/**
 * Press-and-hold repeat, tuned to feel like OS key-repeat: one step on press,
 * then a pause, then a steady stream.
 *
 * Without it these buttons can only ever make single steps, which became a real
 * problem once the rotate step dropped to a fine 1° — reaching an arbitrary wall
 * angle would take dozens of separate taps.
 */
const HOLD_DELAY_MS = 350;
const HOLD_INTERVAL_MS = 45;

/**
 * Fire `step(held)` once immediately, then repeatedly while the pointer is held.
 * `held` is false only for that first call, so the caller can coalesce a whole
 * gesture into a single undo entry exactly as a held key does.
 */
function useHoldRepeat(): { start: (step: (held: boolean) => void) => void; stop: () => void } {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (delayRef.current !== null) clearTimeout(delayRef.current);
    if (tickRef.current !== null) clearInterval(tickRef.current);
    delayRef.current = null;
    tickRef.current = null;
  }, []);

  const start = useCallback(
    (step: (held: boolean) => void) => {
      stop(); // never stack two repeats (a second pointerdown before pointerup)
      step(false);
      delayRef.current = setTimeout(() => {
        tickRef.current = setInterval(() => step(true), HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    },
    [stop],
  );

  // A timer that outlived the component would keep mutating the scene after the
  // selection (and this HUD) is gone.
  useEffect(() => stop, [stop]);

  return { start, stop };
}

function ActionButton({
  label,
  onStep,
  disabled,
  icon,
  transform,
  repeatable = true,
}: {
  label: string;
  /** Called once per step; `held` is true for repeats within a press-and-hold. */
  onStep: (held: boolean) => void;
  disabled?: boolean;
  icon: IconName;
  /** Optional CSS transform applied to the icon (rotate a chevron, flip the arc). */
  transform?: string;
  /** Destructive actions opt out — holding Delete must not delete repeatedly. */
  repeatable?: boolean;
}) {
  const hold = useHoldRepeat();

  // Touch-only widget: aria-label alone names it (no redundant title tooltip).
  // Pointer events drive the hold, so `onClick` is deliberately NOT used — it
  // would fire a second step after pointerdown already ran one.
  return (
    <button
      type="button"
      className="sel-action"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        // Keep receiving pointerup even if the finger slides off the button.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (repeatable) hold.start(onStep);
        else onStep(false);
      }}
      onPointerUp={hold.stop}
      onPointerCancel={hold.stop}
      onLostPointerCapture={hold.stop}
      onKeyDown={(e) => {
        // Enter/Space keep the button operable without a pointer; OS key-repeat
        // supplies the continuous case, mirroring the q/e contract.
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // suppress the synthetic click this would otherwise fire
        onStep(repeatable ? e.repeat : false);
      }}
    >
      <span className="sel-action-ico" style={transform ? ({ transform } as CSSProperties) : undefined}>
        <Icon name={icon} size={18} />
      </span>
    </button>
  );
}

interface Props {
  selection: Selection;
  /** True while a blocking overlay is open OR the wall tool is active — the HUD
   *  hides, matching the keyboard dispatcher's gates so its buttons can't fire a
   *  command the keyboard path would block. */
  hidden: boolean;
  /** Rotate is meaningful only for a rect selection (computed by the parent from
   *  the scene) — otherwise the button is disabled, never a silent no-op. */
  canRotate: boolean;
  /** `held` is true for repeats within one press-and-hold, so the whole gesture
   *  collapses into a single undo entry. */
  onRotate: (dir: -1 | 1, held: boolean) => void;
  onNudge: (dx: number, dy: number, held: boolean) => void;
  onDelete: () => void;
}

/**
 * On-selection touch handles — rotate / nudge / delete for the selected object,
 * so touch users reach what was keyboard-only (Q/E, arrows, Del). Touch-only
 * (shown under `(hover:none) and (pointer:coarse)`), fixed at the bottom of the
 * stage above the mobile tool rail — deliberately decoupled from the rAF-coupled
 * pan/zoom transform so it's deterministic.
 *
 * Dispatch reuses App's keyboard command path verbatim (no logic duplication),
 * and every button supports press-and-hold to repeat.
 *
 * It MUST stay gated by `hidden` (which the parent sets from
 * `overlayOpen || mode === 'wall'`): these buttons sit at `z-index:7` above the
 * canvas-anchored optimizer/arrange/wall-proposal cards, so leaving them live
 * would let a tap mutate the scene straight through an open dialog — the exact
 * gate the keyboard dispatcher applies.
 */
export default function SelectionActions({ selection, hidden, canRotate, onRotate, onNudge, onDelete }: Props) {
  if (!selection || hidden) return null;
  const canDelete = selection.type !== 'listener';

  return (
    <div className="selection-actions" role="group" aria-label="Selection actions">
      <div className="sel-group" role="group" aria-label="Rotate">
        {/* The rotate icon draws a clockwise arc; mirror it for counter-clockwise. */}
        <ActionButton label="Rotate left" icon="rotate" transform="scaleX(-1)" onStep={(h) => onRotate(-1, h)} disabled={!canRotate} />
        <ActionButton label="Rotate right" icon="rotate" onStep={(h) => onRotate(1, h)} disabled={!canRotate} />
      </div>
      <div className="sel-group sel-nudge" role="group" aria-label="Nudge">
        <ActionButton label="Nudge up" icon="chevron-down" transform="rotate(180deg)" onStep={(h) => onNudge(0, -TOUCH_NUDGE_M, h)} />
        <ActionButton label="Nudge down" icon="chevron-down" onStep={(h) => onNudge(0, TOUCH_NUDGE_M, h)} />
        <ActionButton label="Nudge left" icon="chevron-down" transform="rotate(90deg)" onStep={(h) => onNudge(-TOUCH_NUDGE_M, 0, h)} />
        <ActionButton label="Nudge right" icon="chevron-down" transform="rotate(-90deg)" onStep={(h) => onNudge(TOUCH_NUDGE_M, 0, h)} />
      </div>
      <ActionButton label="Delete selection" icon="trash" onStep={onDelete} disabled={!canDelete} repeatable={false} />
    </div>
  );
}
