import type { CSSProperties } from 'react';
import type { Selection } from '../../engine/types';
import Icon, { type IconName } from '../ui/Icon';
import './sim-canvas.css';

/** Fixed nudge step for touch — coarser than the fine 0.05 m keyboard step. */
const TOUCH_NUDGE_M = 0.1;

interface Props {
  selection: Selection;
  /** True while a blocking overlay is open OR the wall tool is active — the HUD
   *  hides, matching the keyboard dispatcher's gates so its buttons can't fire a
   *  command the keyboard path would block. */
  hidden: boolean;
  /** Rotate is meaningful only for a rect selection (computed by the parent from
   *  the scene) — otherwise the button is disabled, never a silent no-op. */
  canRotate: boolean;
  onRotate: (dir: -1 | 1) => void;
  onNudge: (dx: number, dy: number) => void;
  onDelete: () => void;
}

function ActionButton({
  label,
  onClick,
  disabled,
  icon,
  transform,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: IconName;
  /** Optional CSS transform applied to the icon (rotate a chevron, flip the arc). */
  transform?: string;
}) {
  // Touch-only widget: aria-label alone names it (no redundant title tooltip).
  return (
    <button type="button" className="sel-action" aria-label={label} disabled={disabled} onClick={onClick}>
      <span className="sel-action-ico" style={transform ? ({ transform } as CSSProperties) : undefined}>
        <Icon name={icon} size={18} />
      </span>
    </button>
  );
}

/**
 * On-selection touch handles — rotate / nudge / delete for the selected object,
 * so touch users reach what was keyboard-only (Q/E, arrows, Del). Touch-only
 * (shown under `(hover:none) and (pointer:coarse)`), fixed at the bottom of the
 * stage above the mobile tool rail — deliberately decoupled from the rAF-coupled
 * pan/zoom transform so it's deterministic.
 *
 * Dispatch reuses App's keyboard command path verbatim (no logic duplication).
 * It is NON-BLOCKING and MUST NOT join `overlayOpen`: the user is editing on the
 * canvas and wants rotate/nudge/delete keys live — the deliberate inverse of the
 * S4 lesson. Only its buttons catch taps (container is `pointer-events:none`).
 */
export default function SelectionActions({ selection, hidden, canRotate, onRotate, onNudge, onDelete }: Props) {
  if (!selection || hidden) return null;
  const canDelete = selection.type !== 'listener';

  return (
    <div className="selection-actions" role="group" aria-label="Selection actions">
      <div className="sel-group" role="group" aria-label="Rotate">
        {/* The rotate icon draws a clockwise arc; mirror it for counter-clockwise. */}
        <ActionButton label="Rotate left" icon="rotate" transform="scaleX(-1)" onClick={() => onRotate(-1)} disabled={!canRotate} />
        <ActionButton label="Rotate right" icon="rotate" onClick={() => onRotate(1)} disabled={!canRotate} />
      </div>
      <div className="sel-group sel-nudge" role="group" aria-label="Nudge">
        <ActionButton label="Nudge up" icon="chevron-down" transform="rotate(180deg)" onClick={() => onNudge(0, -TOUCH_NUDGE_M)} />
        <ActionButton label="Nudge down" icon="chevron-down" onClick={() => onNudge(0, TOUCH_NUDGE_M)} />
        <ActionButton label="Nudge left" icon="chevron-down" transform="rotate(90deg)" onClick={() => onNudge(-TOUCH_NUDGE_M, 0)} />
        <ActionButton label="Nudge right" icon="chevron-down" transform="rotate(-90deg)" onClick={() => onNudge(TOUCH_NUDGE_M, 0)} />
      </div>
      <ActionButton label="Delete selection" icon="trash" onClick={onDelete} disabled={!canDelete} />
    </div>
  );
}
