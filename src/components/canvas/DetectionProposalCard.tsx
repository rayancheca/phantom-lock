import { useEffect, useRef } from 'react';
import Icon from '../ui/Icon';
import { SENSITIVITY, type DetectionProposal, type Sensitivity } from '../app/hooks/useWallDetection';
import './detection-card.css';

/**
 * The reviewable "Detected layout" proposal.
 *
 * The list HAS to live here rather than on the canvas, and the reason is
 * structural: `wallProposal !== null` is a term of `overlayOpen`, so while this
 * card is up `keyboard.ts` returns null for every non-Escape key and
 * `SimCanvas` drops out of the tab order. A canvas-driven per-wall reject would
 * therefore be pointer-only — exactly the bar S7 exists to hold.
 *
 * Rows are plain `aria-pressed` toggles, NOT a `role="radiogroup"`: a composite
 * role promises a roving-tabindex contract these rows do not implement, which
 * is the mistake the S7 seat-list had to unwind.
 */

interface Props {
  proposal: DetectionProposal;
  onToggleWall: (id: string) => void;
  onSensitivity: (s: Sensitivity) => void;
  onAccept: () => void;
  onTraceInstead: () => void;
  onDiscard: () => void;
  detecting: boolean;
}

const LEVELS: Sensitivity[] = ['careful', 'balanced', 'thorough'];

function lengthOf(w: { a: { x: number; y: number }; b: { x: number; y: number } }): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

/** "Horizontal", "Vertical" or "Angled" — enough to find a row on the canvas. */
function bearing(w: { a: { x: number; y: number }; b: { x: number; y: number } }): string {
  const dx = Math.abs(w.b.x - w.a.x);
  const dy = Math.abs(w.b.y - w.a.y);
  if (dy < dx * 0.2) return 'Across';
  if (dx < dy * 0.2) return 'Down';
  return 'Angled';
}

export default function DetectionProposalCard({
  proposal,
  onToggleWall,
  onSensitivity,
  onAccept,
  onTraceInstead,
  onDiscard,
  detecting,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const kept = proposal.walls.filter((w) => !proposal.rejected.has(w.id));
  const totalLength = kept.reduce((sum, w) => sum + lengthOf(w), 0);
  const confidence = Math.round(proposal.quality.confidence * 100);

  /**
   * Keep focus inside the list when a row is struck off. Rows are toggles, not
   * removals, so the button survives — but the S20 lesson still applies to the
   * empty case, where the accept button becomes the only live target.
   */
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (kept.length === 0 && listRef.current?.contains(document.activeElement)) {
      acceptRef.current?.focus();
    }
  }, [kept.length]);

  return (
    <div className="optimize-dialog detect-card" role="dialog" aria-label="Detected layout">
      <h2>Detected layout</h2>
      <p className="card-sub">
        Found <strong>{kept.length} wall{kept.length === 1 ? '' : 's'}</strong>
        {' — '}
        {totalLength.toFixed(1)} m, shown as ghost lines over your floorplan. Strike off anything that
        isn&apos;t a wall, then add the rest.
      </p>

      <div className="detect-confidence">
        <span className="detect-confidence-label">Read confidence</span>
        <span className="detect-confidence-value">{confidence}%</span>
        <span className="detect-confidence-bar" aria-hidden="true">
          <span className="detect-confidence-fill" style={{ width: `${confidence}%` }} />
        </span>
      </div>

      <fieldset className="detect-levels">
        <legend>How hard to look</legend>
        <div className="preset-row">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`btn ${proposal.sensitivity === level ? 'btn-active' : ''}`}
              aria-pressed={proposal.sensitivity === level}
              disabled={detecting}
              onClick={() => onSensitivity(level)}
            >
              {SENSITIVITY[level].label}
            </button>
          ))}
        </div>
        <p className="card-sub detect-level-hint">{SENSITIVITY[proposal.sensitivity].hint}</p>
      </fieldset>

      <ul className="detect-list" ref={listRef}>
        {proposal.walls.map((w, i) => {
          const off = proposal.rejected.has(w.id);
          return (
            <li key={w.id}>
              <button
                type="button"
                className={`detect-row ${off ? 'is-off' : ''}`}
                aria-pressed={!off}
                onClick={() => onToggleWall(w.id)}
              >
                <Icon name={off ? 'x' : 'check'} size={12} />
                <span className="detect-row-name">
                  Wall {i + 1} · {bearing(w)}
                </span>
                <span className="detect-row-len">{lengthOf(w).toFixed(2)} m</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="card-sub">
        Lengths come from the current image scale — if they look off, discard, calibrate the scale, and
        detect again.
      </p>

      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-ok"
          ref={acceptRef}
          disabled={kept.length === 0}
          onClick={onAccept}
        >
          <Icon name="check" size={13} />
          Add {kept.length} wall{kept.length === 1 ? '' : 's'}
        </button>
        <button type="button" className="btn" onClick={onTraceInstead}>
          <Icon name="wall" size={13} />
          Trace instead
        </button>
        <button type="button" className="btn" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
