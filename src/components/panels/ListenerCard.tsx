import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Scene, Selection } from '../../engine/types';
import { activeListener, MAX_LISTENERS, sceneListeners } from '../../engine/scene';
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
 *
 * The seat list is a proper `radiogroup`: only the active radio is a tab stop and
 * the arrow keys move selection between seats (matching the app's ARIA bar).
 */
export default function ListenerCard({ scene, selection, onSwitch, onAdd, onRename, onRemove, onCompare }: Props) {
  const seats = sceneListeners(scene);
  const activeId = activeListener(scene).id;
  const listenerSelected = selection?.type === 'listener';
  const pickRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onPickKey = (e: ReactKeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % seats.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + seats.length) % seats.length;
    else return;
    e.preventDefault();
    const seat = seats[next];
    onSwitch(seat.id);
    pickRefs.current[seat.id]?.focus();
  };

  return (
    <section className="card" aria-label="Listening spots">
      <h2>
        Listening spots
        {seats.length > 1 && <span className="card-tag">{seats.length}</span>}
      </h2>
      <ul className="seat-list" role="radiogroup" aria-label="Active listening spot">
        {seats.map((seat, i) => {
          const active = seat.id === activeId;
          return (
            <li key={seat.id} className={`seat-row ${active ? 'seat-row-active' : ''} ${active && listenerSelected ? 'seat-row-selected' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${active ? 'Active seat' : 'Listen from'} ${seat.name}`}
                title={active ? 'Active seat — drag the YOU puck to move it' : `Listen from “${seat.name}”`}
                className="seat-pick"
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  pickRefs.current[seat.id] = el;
                }}
                onClick={() => onSwitch(seat.id)}
                onKeyDown={(e) => onPickKey(e, i)}
              >
                <span className="seat-dot" aria-hidden="true" />
              </button>
              <input
                className="seat-name"
                value={seat.name}
                maxLength={32}
                aria-label={`Name of seat ${seat.name}`}
                onChange={(e) => onRename(seat.id, e.target.value)}
                onBlur={(e) => {
                  if (!e.target.value.trim()) onRename(seat.id, `Seat ${i + 1}`);
                }}
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
        <button
          type="button"
          className="btn"
          onClick={onAdd}
          disabled={seats.length >= MAX_LISTENERS}
          title={seats.length >= MAX_LISTENERS ? `Up to ${MAX_LISTENERS} seats` : 'Add a listening spot'}
        >
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
