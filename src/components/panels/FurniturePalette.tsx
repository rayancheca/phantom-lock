import type { ReactElement } from 'react';
import { FURNITURE_PRESETS } from '../../engine/scene';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  onAddPreset: (id: string) => void;
  onCustomBox: () => void;
  onCustomCircle: () => void;
  onArrange: () => void;
}

/** Top-view pictograms, one per preset — drawn the way the object reads on the
 *  floor plan so the palette matches the canvas. */
const GLYPHS: Record<string, ReactElement> = {
  bed: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <rect x="6" y="7" width="5.2" height="4" rx="1" />
      <rect x="12.8" y="7" width="5.2" height="4" rx="1" />
      <line x1="4" y1="13" x2="20" y2="13" />
    </>
  ),
  sofa: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="2" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <line x1="7.5" y1="11" x2="7.5" y2="17" />
      <line x1="16.5" y1="11" x2="16.5" y2="17" />
    </>
  ),
  armchair: (
    <>
      <rect x="5" y="6" width="14" height="13" rx="2.5" />
      <line x1="8.5" y1="9.5" x2="8.5" y2="19" />
      <line x1="15.5" y1="9.5" x2="15.5" y2="19" />
      <line x1="8.5" y1="9.5" x2="15.5" y2="9.5" />
    </>
  ),
  desk: (
    <>
      <rect x="3" y="7" width="18" height="8" rx="1" />
      <rect x="9" y="16.5" width="6" height="3.5" rx="1" />
    </>
  ),
  dining: (
    <>
      <rect x="5" y="7" width="14" height="10" rx="1" />
      <circle cx="3.2" cy="12" r="1.4" />
      <circle cx="20.8" cy="12" r="1.4" />
      <circle cx="9" cy="4.8" r="1.4" />
      <circle cx="15" cy="4.8" r="1.4" />
      <circle cx="9" cy="19.2" r="1.4" />
      <circle cx="15" cy="19.2" r="1.4" />
    </>
  ),
  'round-table': (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="9" width="18" height="4" rx="1" />
      <line x1="8" y1="15" x2="16" y2="15" />
      <line x1="12" y1="13" x2="12" y2="15" />
    </>
  ),
  cabinet: (
    <>
      <rect x="3.5" y="8" width="17" height="8" rx="1" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <circle cx="10" cy="12" r="0.6" />
      <circle cx="14" cy="12" r="0.6" />
    </>
  ),
  wardrobe: (
    <>
      <rect x="3.5" y="7" width="17" height="9" rx="1" />
      <line x1="12" y1="7" x2="12" y2="16" />
      <path d="M5 18.5 L7 16 M19 18.5 L17 16" />
    </>
  ),
  bookshelf: (
    <>
      <rect x="4" y="9" width="16" height="6" rx="1" />
      <line x1="8" y1="9" x2="8" y2="15" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="16" y1="9" x2="16" y2="15" />
    </>
  ),
  counter: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1" />
      <circle cx="8" cy="12" r="1.8" />
      <rect x="13" y="10.4" width="5" height="3.2" rx="0.8" />
    </>
  ),
  plant: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 12 c-1 -3 0 -5 2.5 -6 M12 12 c1 -2.5 3.5 -3 5.5 -2 M12 12 c-2.8 -0.5 -5 0.5 -6 3 M12 12 c0.5 2.8 -0.8 4.8 -3.3 5.4" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="10" width="18" height="4" rx="0.8" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="16" y1="10" x2="16" y2="14" />
    </>
  ),
  door: (
    <>
      <line x1="5" y1="17" x2="19" y2="17" />
      <line x1="5" y1="17" x2="5" y2="5" />
      <path d="M5 5 A12 12 0 0 1 19 17" strokeDasharray="2.5 2.5" />
    </>
  ),
};

function Glyph({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden="true"
      style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}
    >
      {GLYPHS[id] ?? <rect x="5" y="7" width="14" height="10" rx="1" />}
    </svg>
  );
}

export default function FurniturePalette({ onAddPreset, onCustomBox, onCustomCircle, onArrange }: Props) {
  return (
    <section className="card" aria-label="Furniture palette">
      <h2>Furniture</h2>
      <button
        type="button"
        className="btn btn-primary btn-block"
        title="Pick items and get a starter arrangement following interior-design rules"
        onClick={onArrange}
      >
        <Icon name="sparkles" size={14} />
        Arrange furniture for me
      </button>
      <div className="palette-grid">
        {FURNITURE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="palette-item"
            title={`${p.label} — ${p.w} × ${p.h} m footprint, ${p.height} m tall. Click to drop it in the room.`}
            onClick={() => onAddPreset(p.id)}
          >
            <span className="palette-icon">
              <Glyph id={p.id} />
            </span>
            <span className="palette-text">
              <span className="palette-name">{p.label}</span>
              <span className="palette-dims">
                {p.kind === 'circle' ? `⌀ ${p.w} m` : `${p.w} × ${p.h} m`} · {p.height} m tall
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="preset-row">
        <button type="button" className="btn" onClick={onCustomBox} title="Drag on the canvas to draw any box">
          <Icon name="box" size={13} />
          Custom box
        </button>
        <button type="button" className="btn" onClick={onCustomCircle} title="Drag on the canvas to draw any round object">
          <Icon name="circle" size={13} />
          Custom circle
        </button>
      </div>
    </section>
  );
}
