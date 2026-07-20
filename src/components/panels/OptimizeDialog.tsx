import { useState } from 'react';
import type { SpeakerModel } from '../../engine/types';
import type { PlacementMode, PlacementOptions, PlacementTarget, Proposal } from '../../engine/optimize';
import { SPEAKER_MODELS } from '../../engine/speakers';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  proposal: Proposal | null;
  defaultMode: PlacementMode;
  rooms: Array<{ id: string; name: string; at: { x: number; y: number } }>;
  /** True when the layout already has hand-placed speakers the apply will overwrite. */
  willReplace: boolean;
  onRun: (opts: PlacementOptions) => void;
  onApply: () => void;
  onClose: () => void;
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper" role="group" aria-label={`${label} count`}>
      <span className="stepper-label">{label}</span>
      <button type="button" className="btn count-btn" aria-label={`fewer ${label}`} onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <output>{value}</output>
      <button type="button" className="btn count-btn" aria-label={`more ${label}`} onClick={() => onChange(Math.min(4, value + 1))}>
        +
      </button>
    </div>
  );
}

export default function OptimizeDialog({
  proposal,
  defaultMode,
  rooms,
  willReplace,
  onRun,
  onApply,
  onClose,
}: Props) {
  const [mode, setMode] = useState<PlacementMode>(defaultMode);
  const [counts, setCounts] = useState<Record<SpeakerModel, number>>({
    homepod: 2,
    'homepod-mini': 0,
  });
  const [stereo, setStereo] = useState(true);
  const [where, setWhere] = useState<string>('listener');
  const [requested, setRequested] = useState<number | null>(null);

  const buildTarget = (): PlacementTarget => {
    if (where === 'house') return { kind: 'house' };
    const room = rooms.find((r) => r.id === where);
    return room ? { kind: 'room', at: room.at, name: room.name } : { kind: 'listener' };
  };
  const total = counts.homepod + counts['homepod-mini'];
  const shortfall = proposal && requested !== null && proposal.speakers.length < requested;

  return (
    <div className="optimize-dialog" role="dialog" aria-label="Suggest speaker placement">
      <h2>Suggest placement</h2>

      <div className="field-row">
        <span className="field-row-label">Where</span>
      </div>
      <div className="where-chips" role="group" aria-label="Optimization target">
        <button
          type="button"
          className={`btn ${where === 'listener' ? 'btn-active' : ''}`}
          aria-pressed={where === 'listener'}
          title="Optimize the walled room your seat sits in — no need to mark an area first"
          onClick={() => setWhere('listener')}
        >
          This room
        </button>
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`btn ${where === r.id ? 'btn-active' : ''}`}
            aria-pressed={where === r.id}
            onClick={() => setWhere(r.id)}
          >
            {r.name}
          </button>
        ))}
        {rooms.length > 0 && (
          <button
            type="button"
            className={`btn ${where === 'house' ? 'btn-active' : ''}`}
            aria-pressed={where === 'house'}
            onClick={() => setWhere('house')}
          >
            Whole house
          </button>
        )}
      </div>
      {where === 'listener' && (
        <p className="card-sub">
          Fills the walled room your seat is in. Add rooms (in Build) or mark an area to target one
          you’re not sitting in.
        </p>
      )}
      {where === 'house' && (
        <p className="card-sub">
          One independent zone per named room or area — big speakers go to big rooms first.
        </p>
      )}

      <div className="field-row">
        <span className="field-row-label">Optimize for</span>
        <div className="count-group" role="group" aria-label="Placement mode">
          <button
            type="button"
            className={`btn ${mode === 'cinema' ? 'btn-active' : ''}`}
            aria-pressed={mode === 'cinema'}
            title="Image anchored on the TV↔listener axis"
            onClick={() => setMode('cinema')}
          >
            <Icon name="film" size={13} />
            TV
          </button>
          <button
            type="button"
            className={`btn ${mode === 'music' ? 'btn-active' : ''}`}
            aria-pressed={mode === 'music'}
            title="Ignore the TV — wrap the sound around wherever you are"
            onClick={() => setMode('music')}
          >
            <Icon name="music" size={13} />
            Music
          </button>
        </div>
      </div>
      <p className="card-sub">
        {mode === 'cinema'
          ? 'Sound stage in front of you, centred on the TV.'
          : 'Envelopment: speakers oriented to your most open side and spread around you — no front-facing anchor.'}
      </p>

      <Stepper label={SPEAKER_MODELS.homepod.name} value={counts.homepod} onChange={(n) => setCounts((c) => ({ ...c, homepod: n }))} />
      <Stepper
        label={SPEAKER_MODELS['homepod-mini'].name}
        value={counts['homepod-mini']}
        onChange={(n) => setCounts((c) => ({ ...c, 'homepod-mini': n }))}
      />

      <label className="field field-check">
        <input
          type="checkbox"
          checked={stereo && total >= 2}
          disabled={total < 2}
          onChange={(e) => setStereo(e.target.checked)}
        />
        <span>Link same-model twos as stereo pairs (Apple can't pair a HomePod with a mini)</span>
      </label>

      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={total === 0}
          onClick={() => {
            setRequested(total);
            onRun({ mode, stereo: stereo && total >= 2, inventory: counts, target: buildTarget() });
          }}
        >
          <Icon name="sparkles" size={13} />
          {proposal ? 'Recompute' : 'Preview placement'}
        </button>
        {proposal && proposal.speakers.length > 0 && (
          <button
            type="button"
            className="btn btn-ok"
            title={willReplace ? 'Replaces your current speakers — one tap to undo afterwards' : undefined}
            onClick={onApply}
          >
            <Icon name="check" size={13} />
            {willReplace ? 'Replace with' : 'Apply'} {proposal.speakers.length} speaker
            {proposal.speakers.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>

      {shortfall && (
        <p className="proposal-shortfall">
          <Icon name="warning" size={13} />
          <span>
            Placed {proposal.speakers.length} of {requested} — the floorplan ran out of spots with
            clear line of sight and sensible distances. Free up wall space or reduce the count.
          </span>
        </p>
      )}
      {proposal && (
        <ul className="proposal-notes">
          {proposal.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {proposal && proposal.speakers.length > 0 && (
        <p className="card-sub">Green ghosts on the canvas show the proposal. Apply, then fine-tune by dragging.</p>
      )}
    </div>
  );
}
