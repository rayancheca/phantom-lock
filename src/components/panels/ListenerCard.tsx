import type { Scene, Selection } from '../../engine/types';
import { activeListener, sceneListeners } from '../../engine/scene';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  scene: Scene;
  selection: Selection;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onCompare: () => void;
}

/**
 * Manage the named listening positions (seats). The active seat is what the
 * verdict is computed for and the "YOU" puck on the canvas; switch to a seat to
 * position it by dragging, or open Compare to see two seats side by side.
 */
export default function ListenerCard({ scene, selection, onSwitch, onAdd, onRename, onRemove, onCompare }: Props) {
  const seats = sceneListeners(scene);
  const activeId = activeListener(scene).id;
  const listenerSelected = selection?.type === 'listener';

  return (
    <section className="card" aria-label="Listening spots">
      <h2>
        Listening spots
        {seats.length > 1 && <span className="card-tag">{seats.length}</span>}
      </h2>
      <ul className="seat-list" role="radiogroup" aria-label="Active listening spot">
        {seats.map((seat) => {
          const active = seat.id === activeId;
          return (
            <li key={seat.id} className={`seat-row ${active ? 'seat-row-active' : ''} ${active && listenerSelected ? 'seat-row-selected' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                className="seat-pick"
                title={active ? 'Active seat — drag the YOU puck to move it' : `Listen from “${seat.name}”`}
                onClick={() => onSwitch(seat.id)}
              >
                <span className="seat-dot" aria-hidden="true" />
                <span className="sr-only">{active ? 'Active: ' : 'Switch to '}</span>
              </button>
              <input
                className="seat-name"
                value={seat.name}
                maxLength={32}
                aria-label={`Name of seat ${seat.name}`}
                onChange={(e) => onRename(seat.id, e.target.value)}
              />
              <span className="seat-z" title="Ear height">
                {seat.z.toFixed(2)} m
              </span>
              <button
                type="button"
                className="seat-remove"
                aria-label={`Remove seat ${seat.name}`}
                title={seats.length <= 1 ? 'Keep at least one seat' : `Remove “${seat.name}”`}
                disabled={seats.length <= 1}
                onClick={() => onRemove(seat.id)}
              >
                <Icon name="x" size={12} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="preset-row">
        <button type="button" className="btn" onClick={onAdd}>
          <Icon name="plus" size={13} />
          Add spot
        </button>
        {seats.length >= 2 && (
          <button type="button" className="btn" onClick={onCompare} title="See two seats side by side">
            <Icon name="grid" size={13} />
            Compare
          </button>
        )}
      </div>
      <p className="card-sub">
        Add a spot for each place you actually sit — couch, bed — then switch between them and drag the
        YOU puck to position each. Compare shows both verdicts side by side.
      </p>
    </section>
  );
}
