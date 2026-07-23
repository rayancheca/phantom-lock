import { useId, useState, type ReactNode } from 'react';
import type { SimSettings } from '../../engine/types';
import type { AppMode } from '../app/mode';
import Icon from '../ui/Icon';
import './legend.css';

interface LegendRow {
  swatch: ReactNode;
  label: string;
}

interface Props {
  appMode: AppMode;
  settings: SimSettings;
}

const dot = (color: string) => <span className="legend-dot" style={{ background: color }} />;

/**
 * A collapsible on-canvas legend keyed to the current mode — UX-4 / Session 16
 * (item I). It explains the glyphs the renderer draws (ray colours, ★ best spot,
 * sweet-spot ring, the 60° triangle, the YOU puck, other seats, blocked sight
 * lines) so a first-timer isn't left decoding the canvas.
 *
 * Read-only: it dispatches no scene/settings commands, so it needs no
 * `overlayOpen` gate. But it IS focusable and sits over the canvas whose key
 * handler (`canvasKeyAction`) only exempts INPUT/TEXTAREA/SELECT — so it swallows
 * its own keydowns/keyups (Space, r…) to keep them from arming pan / rotating the
 * selection. Uses the shared `--overlay-*` dark-glass recipe; the expand honours
 * `prefers-reduced-motion` via legend.css.
 */
export default function Legend({ appMode, settings }: Props) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const rows: LegendRow[] =
    appMode === 'tune'
      ? [
          ...(settings.display !== 'off'
            ? [
                {
                  swatch: (
                    <span className="legend-pair">
                      {dot('var(--accent)')}
                      {dot('var(--accent-r)')}
                    </span>
                  ),
                  label: 'Speakers & their sound rays',
                },
              ]
            : []),
          ...(settings.showBestSpot
            ? [{ swatch: <Icon name="star" size={13} className="legend-star" />, label: 'Best spot' }]
            : []),
          { swatch: <span className="legend-ring" />, label: 'Sweet spot' },
          ...(settings.showTriangle
            ? [{ swatch: <span className="legend-tri" />, label: 'Stereo triangle (60° ideal)' }]
            : []),
          { swatch: dot('var(--ok)'), label: 'YOU — turns green when locked' },
          { swatch: <span className="legend-dot legend-dot-hollow" />, label: 'Other listening spots' },
          { swatch: <span className="legend-line legend-line-dashed" />, label: 'Blocked line of sight' },
        ]
      : [
          { swatch: <span className="legend-line" />, label: 'Walls' },
          { swatch: <span className="legend-line legend-line-dashed" />, label: 'Door swing (dashed = clearance)' },
          { swatch: <span className="legend-square" />, label: 'Furniture' },
          { swatch: <span className="legend-square legend-square-tv" />, label: 'TV (cinema anchor)' },
          { swatch: <span className="legend-square legend-square-area" />, label: 'Marked area' },
          { swatch: dot('var(--text)'), label: 'Your seat (YOU)' },
        ];

  return (
    // No key swallowing here any more. S7 widened `canvasKeyAction`'s target
    // exemption to BUTTON/A/SUMMARY, which covers this component's only
    // focusable node (the toggle) generically — and the blanket
    // stopPropagation was ALSO eating Escape-to-deselect and Cmd-Z while the
    // toggle held focus, which was never the intent.
    <div className="legend">
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={open}
        // Only reference the body while it's actually rendered — a collapsed
        // legend would otherwise dangle an aria-controls IDREF to nothing.
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="layers" size={13} />
        <span>Legend</span>
      </button>
      {open && (
        <ul id={bodyId} className="legend-body" aria-label="Canvas legend">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="legend-swatch" aria-hidden="true">
                {r.swatch}
              </span>
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
