import { useEffect, useState } from 'react';
import type { Scene, SceneObject, Selection, SpeakerObj } from '../../engine/types';
import { activeListener, LISTENER_PRESETS, MATERIALS, sceneListeners } from '../../engine/scene';
import { dist3dTo, MODEL_IDS, SPEAKER_MODELS } from '../../engine/speakers';
import * as v from '../../engine/vec';
import Icon from '../ui/Icon';
import './panels.css';

/** Real-world clear-opening widths (metres): 70 / 80 / 90 cm cover interior,
 *  bedroom, and accessible doors — the common cases as one-click presets. */
const DOOR_WIDTHS = [0.7, 0.8, 0.9] as const;

interface Props {
  scene: Scene;
  selection: Selection;
  onUpdateObject: (id: string, patch: Partial<SceneObject>) => void;
  onDeleteObject: (id: string) => void;
  onUpdateSpeaker: (id: string, patch: Partial<SpeakerObj>) => void;
  onDeleteSpeaker: (id: string) => void;
  onSetPair: (id: string, partnerId: string | null) => void;
  onUpdateListener: (patch: Partial<Scene['listener']>) => void;
  onSplitWall: (id: string) => void;
  onDeleteMulti: (objectIds: string[], speakerIds: string[]) => void;
}

/**
 * Numeric field that doesn't fight typing: keeps its own text while focused,
 * commits every valid parse, and snaps back to the canonical value on blur.
 */
function NumField({
  label,
  value,
  step = 0.05,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const canonical = String(Number(value.toFixed(3)));
  const [text, setText] = useState(canonical);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(canonical);
  }, [canonical, editing]);

  const clamp = (n: number) => {
    let out = n;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={editing ? text : canonical}
        step={step}
        min={min}
        max={max}
        onFocus={() => {
          setEditing(true);
          setText(canonical);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function AbsorptionField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const matched = MATERIALS.find((m) => Math.abs(m.absorption - value) < 0.005);
  return (
    <>
      <label className="field">
        <span>Absorption</span>
        <input
          type="range"
          min={0}
          max={0.95}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <output aria-live="off">{Math.round(value * 100)}%</output>
      </label>
      <label className="field">
        <span>Material</span>
        <select
          value={matched?.id ?? 'custom'}
          onChange={(e) => {
            const mat = MATERIALS.find((m) => m.id === e.target.value);
            if (mat) onChange(mat.absorption);
          }}
        >
          <option value="custom" disabled>
            custom…
          </option>
          {MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({Math.round(m.absorption * 100)}%)
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export default function InspectorPanel({
  scene,
  selection,
  onUpdateObject,
  onDeleteObject,
  onUpdateSpeaker,
  onDeleteSpeaker,
  onSetPair,
  onUpdateListener,
  onSplitWall,
  onDeleteMulti,
}: Props) {
  if (selection?.type === 'multi') {
    const n = selection.objectIds.length + selection.speakerIds.length;
    return (
      <section className="card" aria-label="Selection inspector">
        <h2>
          {n} selected
          <span className="card-tag">group</span>
        </h2>
        <p className="card-sub">
          Drag any member to move the whole group · arrows nudge it · ⌘-click adds or removes one.
        </p>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => onDeleteMulti(selection.objectIds, selection.speakerIds)}
        >
          Delete {n} item{n === 1 ? '' : 's'}
        </button>
      </section>
    );
  }

  if (selection?.type === 'listener') {
    const l = scene.listener;
    const seat = activeListener(scene);
    const seatCount = sceneListeners(scene).length;
    return (
      <section className="card" aria-label="Selection inspector">
        <h2>
          {seat.name}
          <span className="card-tag">seat</span>
        </h2>
        <p className="card-sub">
          x {l.pos.x.toFixed(2)} m · y {l.pos.y.toFixed(2)} m — drag it on the canvas.
          {seatCount > 1 && ' Switch seats in “Listening spots”.'}
        </p>
        <NumField label="Ear height" value={l.z} min={0.2} max={2.2} onChange={(n) => onUpdateListener({ z: n })} />
        <div className="preset-row" role="group" aria-label="Ear height presets">
          {LISTENER_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn ${Math.abs(l.z - p.z) < 0.01 ? 'btn-active' : ''}`}
              onClick={() => onUpdateListener({ z: p.z })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="card-sub">
          Heights matter: sound clears furniture lower than its path. Lying on the bed puts your
          ears above the mattress, so the bed no longer shadows you.
        </p>
      </section>
    );
  }

  if (selection?.type === 'speaker') {
    const sp = scene.speakers.find((s) => s.id === selection.id);
    if (!sp) return null;
    const spec = SPEAKER_MODELS[sp.model];
    const dist = dist3dTo(sp, scene.listener);
    const outOfRange = dist < spec.idealMin || dist > spec.idealMax;
    const partner = scene.pairs.find(([a, b]) => a === sp.id || b === sp.id);
    const partnerId = partner ? (partner[0] === sp.id ? partner[1] : partner[0]) : null;
    const others = scene.speakers.filter((s) => s.id !== sp.id);
    return (
      <section className="card" aria-label="Selection inspector">
        <h2>
          {spec.name} {sp.label}
          <span className="card-tag">speaker</span>
        </h2>
        <label className="field">
          <span>Model</span>
          <select
            value={sp.model}
            onChange={(e) => {
              onUpdateSpeaker(sp.id, { model: e.target.value as SpeakerObj['model'] });
              // A model change can invalidate an existing same-model pair.
              if (partnerId) {
                const other = scene.speakers.find((s) => s.id === partnerId);
                if (other && other.model !== e.target.value) onSetPair(sp.id, null);
              }
            }}
          >
            {MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {SPEAKER_MODELS[id].name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <input
            type="text"
            value={sp.label}
            maxLength={8}
            onChange={(e) => onUpdateSpeaker(sp.id, { label: e.target.value })}
          />
        </label>
        <NumField label="Height" value={sp.z} min={0.1} max={2.4} onChange={(n) => onUpdateSpeaker(sp.id, { z: n })} />
        <label className="field">
          <span>Volume trim</span>
          <input
            type="range"
            min={-12}
            max={6}
            step={0.5}
            value={sp.trimDb}
            onChange={(e) => onUpdateSpeaker(sp.id, { trimDb: parseFloat(e.target.value) })}
          />
          <output aria-live="off">
            {sp.trimDb > 0 ? '+' : ''}
            {sp.trimDb.toFixed(1)} dB
          </output>
        </label>
        <label className="field">
          <span>Stereo pair</span>
          <select
            value={partnerId ?? ''}
            onChange={(e) => onSetPair(sp.id, e.target.value || null)}
            disabled={others.length === 0}
          >
            <option value="">— not paired —</option>
            {others.map((s) => (
              <option key={s.id} value={s.id} disabled={s.model !== sp.model}>
                with {s.label}
                {s.model !== sp.model ? ` (${SPEAKER_MODELS[s.model].short} — model mismatch)` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className={`card-sub ${outOfRange ? 'tone-warn' : ''}`}>
          {spec.name} is happiest {spec.idealMin.toFixed(1)}–{spec.idealMax.toFixed(1)} m from your
          ears (bass reach ≈ {spec.bassHz} Hz) — currently {dist.toFixed(2)} m.
        </p>
        <p className="card-sub">
          {partnerId
            ? 'Paired: the triangle, sweet spot, and phantom-center lock track this pair.'
            : 'Unpaired speakers play independent (mono) zones. Apple only pairs identical models.'}
        </p>
        <button type="button" className="btn btn-danger" onClick={() => onDeleteSpeaker(sp.id)}>
          Delete speaker
        </button>
      </section>
    );
  }

  const obj = selection?.type === 'object' ? scene.objects.find((o) => o.id === selection.id) : undefined;

  // Contextual: the inspector only exists while something is selected.
  if (!obj) return null;

  const patch = (p: Partial<SceneObject>) => onUpdateObject(obj.id, p);

  return (
    <section className="card" aria-label="Selection inspector">
      <h2>
        {obj.kind === 'wall' ? 'Wall' : obj.label || 'Object'}
        <span className="card-tag">{obj.kind}</span>
      </h2>

      {obj.kind !== 'wall' && (
        <label className="field">
          <span>Label</span>
          <input type="text" value={obj.label} maxLength={24} onChange={(e) => patch({ label: e.target.value })} />
        </label>
      )}

      {obj.kind === 'wall' && (
        <>
          <div className="field-pair">
            <NumField label="A.x" value={obj.a.x} onChange={(n) => patch({ a: { ...obj.a, x: n } })} />
            <NumField label="A.y" value={obj.a.y} onChange={(n) => patch({ a: { ...obj.a, y: n } })} />
          </div>
          <div className="field-pair">
            <NumField label="B.x" value={obj.b.x} onChange={(n) => patch({ b: { ...obj.b, x: n } })} />
            <NumField label="B.y" value={obj.b.y} onChange={(n) => patch({ b: { ...obj.b, y: n } })} />
          </div>
          <p className="card-sub">
            Length {v.dist(obj.a, obj.b).toFixed(2)} m — drag the square handles to reshape, or
            double-click the wall on the canvas to break it at that spot.
          </p>
          {v.dist(obj.a, obj.b) >= 0.4 && (
            <button type="button" className="btn btn-block" onClick={() => onSplitWall(obj.id)}>
              <Icon name="scissors" size={13} />
              Split into two walls
            </button>
          )}
        </>
      )}

      {obj.kind === 'rect' && obj.role === 'door' && (
        <>
          {/* Width first, bounded to real door sizes and labelled as the clear
              opening (it doubles as the drawn swing radius). Depth (the leaf
              thickness) and the free Rotation slider are deliberately dropped —
              a door's rotation is wall-locked, and its "depth" is meaningless. */}
          <NumField
            label="Width (clear opening)"
            value={obj.w}
            min={0.6}
            max={2.4}
            onChange={(n) => patch({ w: n })}
          />
          <div className="preset-row" role="group" aria-label="Door width presets">
            {DOOR_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className={`btn ${Math.abs(obj.w - w) < 0.005 ? 'btn-active' : ''}`}
                aria-pressed={Math.abs(obj.w - w) < 0.005}
                onClick={() => patch({ w })}
              >
                {Math.round(w * 100)} cm
              </button>
            ))}
          </div>

          <label className="field">
            <span>Swing</span>
            <input
              type="range"
              min={0}
              max={180}
              step={5}
              value={obj.swingDeg ?? 90}
              onChange={(e) => patch({ swingDeg: Number(e.target.value) })}
            />
            <output aria-live="off">{obj.swingDeg ?? 90}°</output>
          </label>

          <div className="preset-row" role="group" aria-label="Hinge side">
            {(['start', 'end'] as const).map((he) => (
              <button
                key={he}
                type="button"
                className={`btn ${(obj.hingeEnd ?? 'start') === he ? 'btn-active' : ''}`}
                aria-pressed={(obj.hingeEnd ?? 'start') === he}
                onClick={() => patch({ hingeEnd: he })}
              >
                {he === 'start' ? 'Hinge left' : 'Hinge right'}
              </button>
            ))}
          </div>

          <div className="preset-row" role="group" aria-label="Swing direction">
            {(['in', 'out'] as const).map((ss) => (
              <button
                key={ss}
                type="button"
                className={`btn ${(obj.swingSide ?? 'in') === ss ? 'btn-active' : ''}`}
                aria-pressed={(obj.swingSide ?? 'in') === ss}
                onClick={() => patch({ swingSide: ss })}
              >
                {ss === 'in' ? 'Swing in' : 'Swing out'}
              </button>
            ))}
          </div>

          <label className="field field-check">
            <input
              type="checkbox"
              checked={obj.doorOpen !== false}
              onChange={(e) => patch({ doorOpen: e.target.checked })}
            />
            <span>Door is open — sound passes through the doorway</span>
          </label>
          <p className="card-sub">
            The swing arc draws the clearance the leaf needs — it doesn’t change the sound. Only open
            vs closed does. f / ⇧F flip the hinge and swing side.
          </p>
        </>
      )}

      {obj.kind === 'rect' && obj.role !== 'door' && (
        <>
          <div className="field-pair">
            <NumField label="Width" value={obj.w} min={0.1} onChange={(n) => patch({ w: n })} />
            <NumField label="Depth" value={obj.h} min={0.1} onChange={(n) => patch({ h: n })} />
          </div>
          <label className="field">
            <span>Rotation</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round((obj.rotation * 180) / Math.PI)}
              onChange={(e) => patch({ rotation: (parseFloat(e.target.value) * Math.PI) / 180 })}
            />
            <output aria-live="off">{Math.round((obj.rotation * 180) / Math.PI)}°</output>
          </label>
          {obj.role !== 'window' ? (
            <label className="field field-check">
              <input
                type="checkbox"
                checked={obj.role === 'tv'}
                onChange={(e) => patch({ role: e.target.checked ? 'tv' : 'furniture' })}
              />
              <span>This is the TV (phantom-center axis anchor)</span>
            </label>
          ) : (
            <p className="card-sub">Window: cuts the wall and fills the gap with glass. Drag it onto any wall — it snaps.</p>
          )}
        </>
      )}

      {obj.kind === 'circle' && (
        <NumField label="Radius" value={obj.r} min={0.1} onChange={(n) => patch({ r: n })} />
      )}

      <NumField
        label="Height"
        value={obj.height}
        min={0.02}
        max={6}
        onChange={(n) => patch({ height: n })}
      />
      <p className="card-sub">
        Sound flies over anything lower than its path — low furniture only grazes it.
      </p>

      <AbsorptionField value={obj.absorption} onChange={(n) => patch({ absorption: n })} />

      <button type="button" className="btn btn-danger" onClick={() => onDeleteObject(obj.id)}>
        Delete {obj.kind}
      </button>
    </section>
  );
}
