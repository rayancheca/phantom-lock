import { useRef } from 'react';
import type { Scene, Underlay } from '../../engine/types';
import { buildUnderlay } from './underlay-import';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  scene: Scene;
  onUnderlay: (u: Underlay | null) => void;
  onCalibrate: () => void;
  calibrating: boolean;
  onDetect: () => void;
  detecting: boolean;
  onError: (message: string) => void;
}

export default function UnderlayCard({
  scene,
  onUnderlay,
  onCalibrate,
  calibrating,
  onDetect,
  detecting,
  onError,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const u = scene.underlay;

  const importImage = (file: File) => {
    buildUnderlay(file)
      .then(onUnderlay)
      .catch(() => onError('Could not read that image.'));
  };

  return (
    <section className="card" aria-label="Floorplan underlay">
      <h2>Your floorplan</h2>
      {!u && (
        <>
          <p className="card-sub">
            Have a plan or a photo? Put it under the grid and trace your walls right over it. (This
            is a picture — to open a saved layout file, use Import layout in the gallery.)
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={14} />
            Import floorplan photo
          </button>
        </>
      )}
      {u && (
        <>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={detecting}
            title="Find the walls in the image automatically — you confirm before anything is added"
            onClick={onDetect}
          >
            <Icon name="sparkles" size={14} />
            {detecting ? 'Reading the plan…' : 'Auto-detect walls'}
          </button>
          <label className="field">
            <span>Visibility</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={u.opacity}
              onChange={(e) => onUnderlay({ ...u, opacity: parseFloat(e.target.value) })}
            />
            <output>{Math.round(u.opacity * 100)}%</output>
          </label>
          <label className="field">
            <span>Rotate</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round((u.rotation * 180) / Math.PI)}
              onChange={(e) => onUnderlay({ ...u, rotation: (parseFloat(e.target.value) * Math.PI) / 180 })}
            />
            <output>{Math.round((u.rotation * 180) / Math.PI)}°</output>
          </label>
          <p className="card-sub">
            Image spans {(u.wPx * u.scale).toFixed(1)} × {(u.hPx * u.scale).toFixed(1)} m.
            {calibrating
              ? ' Now click two points on the image whose real distance you know.'
              : ' Set the true size: calibrate with two clicks on a known distance (a wall, a door…).'}
          </p>
          <div className="preset-row">
            <button
              type="button"
              className={`btn ${calibrating ? 'btn-active' : 'btn-primary'}`}
              onClick={onCalibrate}
            >
              <Icon name="fit" size={13} />
              {calibrating ? 'Click 2 points…' : 'Calibrate scale'}
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Replace
            </button>
            <button type="button" className="btn" onClick={() => onUnderlay(null)}>
              Remove
            </button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importImage(f);
          e.target.value = '';
        }}
      />
    </section>
  );
}
