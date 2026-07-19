import type { SimSettings } from '../../engine/types';
import './panels.css';

interface Props {
  settings: SimSettings;
  onChange: (s: SimSettings) => void;
}

export default function ControlsCard({ settings, onChange }: Props) {
  const set = (patch: Partial<SimSettings>) => onChange({ ...settings, ...patch });

  return (
    <section className="card" aria-label="Simulation settings">
      <h2>Simulation</h2>
      <label className="field">
        <span>Rays / speaker</span>
        <input
          type="range"
          min={360}
          max={1440}
          step={120}
          value={settings.rayCount}
          onChange={(e) => set({ rayCount: parseInt(e.target.value, 10) })}
        />
        <output>{settings.rayCount}</output>
      </label>
      <label className="field">
        <span>Bounces</span>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={settings.maxBounces}
          onChange={(e) => set({ maxBounces: parseInt(e.target.value, 10) })}
        />
        <output>{settings.maxBounces}</output>
      </label>
      <label className="field">
        <span>Decay / m</span>
        <input
          type="range"
          min={0.05}
          max={0.6}
          step={0.05}
          value={settings.decay}
          onChange={(e) => set({ decay: parseFloat(e.target.value) })}
        />
        <output>{settings.decay.toFixed(2)}</output>
      </label>
      <div className="field-row">
        <span className="field-row-label">Sound field</span>
        <div className="count-group" role="group" aria-label="Sound field display">
          {(['rays', 'waves', 'off'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`btn count-btn ${settings.display === d ? 'btn-active' : ''}`}
              aria-pressed={settings.display === d}
              title={
                d === 'rays'
                  ? 'Reflected sound rays'
                  : d === 'waves'
                    ? 'Wavefronts — each band of dots is 1 ms of travel'
                    : 'Hide the sound field'
              }
              onClick={() => set({ display: d })}
            >
              {d === 'rays' ? 'Rays' : d === 'waves' ? 'Waves' : 'Off'}
            </button>
          ))}
        </div>
      </div>
      <div className="toggle-grid">
        <label className="field field-check">
          <input
            type="checkbox"
            checked={settings.showBestSpot}
            onChange={(e) => set({ showBestSpot: e.target.checked })}
          />
          <span>Best spot</span>
        </label>
        <label className="field field-check">
          <input
            type="checkbox"
            checked={settings.showTriangle}
            onChange={(e) => set({ showTriangle: e.target.checked })}
          />
          <span>Triangles</span>
        </label>
        <label className="field field-check">
          <input type="checkbox" checked={settings.snap} onChange={(e) => set({ snap: e.target.checked })} />
          <span>Snap 5 cm</span>
        </label>
      </div>
    </section>
  );
}
