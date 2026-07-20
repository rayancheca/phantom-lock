import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  /** Render + download the current plan as a PNG. */
  onExportImage: () => void;
  /** Copy the verdict headline + cause + seat name to the clipboard (or, with no
   *  pair yet, surface a "place a pair first" toast — see App.copyVerdict). */
  onCopyVerdict: () => void;
}

/**
 * Shareable output — UX-4 / Session 16 (item H). A tool whose payoff is a verdict
 * can now hand you a picture of the plan and the verdict sentence in words. Both
 * are keyboard-operable buttons; nothing leaves the app except on the user's own
 * click (the image downloads locally; the verdict goes to the clipboard).
 *
 * "Copy verdict" stays ENABLED even with no pair so the reason is reachable by
 * keyboard/touch (the handler toasts "no verdict yet") instead of hiding it in a
 * disabled control's `title=` (an a11y self-review finding).
 */
export default function ShareCard({ onExportImage, onCopyVerdict }: Props) {
  return (
    <section className="card" aria-label="Share">
      <h2>Share</h2>
      <div className="preset-row">
        <button
          type="button"
          className="btn"
          title="Download the plan as a PNG image"
          onClick={onExportImage}
        >
          <Icon name="image" size={13} />
          Export plan image
        </button>
        <button
          type="button"
          className="btn"
          title="Copy the verdict sentence to the clipboard"
          onClick={onCopyVerdict}
        >
          <Icon name="export" size={13} />
          Copy verdict
        </button>
      </div>
    </section>
  );
}
