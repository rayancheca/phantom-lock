import { useState } from 'react';
import type { SceneObject } from '../../engine/types';
import type { ArrangeItem } from '../../engine/arrange';
import { FURNITURE_PRESETS } from '../../engine/scene';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  proposal: { objects: SceneObject[]; notes: string[] } | null;
  onSuggestInventory: () => { items: ArrangeItem[]; reasons: string[] };
  onRun: (items: ArrangeItem[]) => void;
  onApply: () => void;
  onClose: () => void;
}

const ARRANGEABLE = FURNITURE_PRESETS.filter((p) => p.place !== 'manual');

export default function ArrangeDialog({ proposal, onSuggestInventory, onRun, onApply, onClose }: Props) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ bed: 1, sofa: 1, tv: 1 });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const bump = (id: string, d: number) => {
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(4, (c[id] ?? 0) + d)) }));
  };

  return (
    <div className="optimize-dialog" role="dialog" aria-label="Arrange furniture">
      <h2>Arrange furniture</h2>
      <p className="card-sub">
        Pick what goes in the room. Placement reasons about function, light, quiet, sound, and feng
        shui: door corridors stay clear, the bed takes a commanding spot on a solid wall, the desk
        sits in daylight, tall storage lands where it tames echoes — and every choice explains
        itself below.
      </p>

      <button
        type="button"
        className="btn btn-primary btn-block"
        title="Analyze the layout — floor area, rooms, what exists — and pick the furniture for you"
        onClick={() => {
          const s = onSuggestInventory();
          const next: Record<string, number> = {};
          for (const it of s.items) next[it.presetId] = it.count;
          setCounts(next);
          setReasons(s.reasons);
          if (s.items.length > 0) onRun(s.items);
        }}
      >
        <Icon name="sparkles" size={14} />
        Decide for me
      </button>
      {reasons.length > 0 && (
        <ul className="proposal-notes">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <div className="arrange-grid">
        {ARRANGEABLE.map((p) => (
          <div key={p.id} className="stepper" role="group" aria-label={`${p.label} count`}>
            <span className="stepper-label">
              {p.label}{' '}
              <span className="palette-dims">
                {p.kind === 'circle' ? `⌀${p.w}` : `${p.w}×${p.h}`}
              </span>
            </span>
            <button type="button" className="btn count-btn" aria-label={`fewer ${p.label}`} onClick={() => bump(p.id, -1)}>
              −
            </button>
            <output aria-live="off">{counts[p.id] ?? 0}</output>
            <button type="button" className="btn count-btn" aria-label={`more ${p.label}`} onClick={() => bump(p.id, 1)}>
              +
            </button>
          </div>
        ))}
      </div>

      <div className="dialog-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={total === 0}
          onClick={() => onRun(Object.entries(counts).map(([presetId, count]) => ({ presetId, count })))}
        >
          <Icon name="sparkles" size={13} />
          {proposal ? 'Rearrange' : 'Preview arrangement'}
        </button>
        {proposal && proposal.objects.length > 0 && (
          <button type="button" className="btn btn-ok" onClick={onApply}>
            <Icon name="check" size={13} />
            Apply {proposal.objects.length} piece{proposal.objects.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>

      {proposal && (
        <ul className="proposal-notes">
          {proposal.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
