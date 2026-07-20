import Dialog from '../ui/Dialog';

interface Props {
  /** Dismiss + persist the "seen" flag so it never shows again. */
  onDismiss: () => void;
}

/**
 * The one-time welcome shown on a first-ever boot — UX-4 / Session 16 (item B).
 *
 * A first-timer now lands on the Maple Court demo with a SEEDED locked pair, so
 * the verdict already reads "Phantom center locked". This explainer orients them:
 * what the tool is, that the glowing readout is live, and how to drive it. It
 * reuses the modal `Dialog` (focus-trap + Escape + focus-restore + reduced-motion
 * for free) and is gated on a standalone localStorage flag (never the persistence
 * schema), so it appears exactly once.
 */
export default function FirstRunExplainer({ onDismiss }: Props) {
  return (
    <Dialog title="Welcome to Phantom Lock" onClose={onDismiss}>
      <p className="dialog-sub">
        A 2D acoustic planner for HomePod stereo pairs. It ray-traces your room to find where a pair
        <strong> locks the phantom center</strong> — the illusion of sound floating dead-centre
        between two speakers, with nothing in the middle.
      </p>
      <p className="dialog-sub">
        You’re looking at the bundled <strong>Maple Court</strong> demo with a pair already placed,
        so the readout up top already reads <strong>LOCKED</strong>. Drag <strong>YOU</strong> or a
        speaker and watch the verdict change live.
      </p>
      <p className="dialog-sub">
        Two modes: <strong>DESIGN</strong> to draw walls and furniture, <strong>TUNE</strong> to
        place speakers and read the verdict. Tap any dotted term for a plain-English definition.
      </p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onDismiss}>
          Start exploring
        </button>
      </div>
    </Dialog>
  );
}
