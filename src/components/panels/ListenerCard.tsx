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
  /** True when there are ≥2 seats OR ≥2 layouts to compare (App's canCompare). */
  canCompare: boolean;
}

/**
 * Manage the named listening positions (seats). The active seat is what the
 * verdict is computed for and the "YOU" puck on the canvas; switch to a seat to
 * position it by dragging, or open Compare to see two seats side by side.
 *
 * The seat list is a plain list of buttons, one per seat, EVERY one a tab stop.
 * It was a `radiogroup` with a roving tabindex until S7; see the note on the
 * <ul> for why that was both invalid and less reachable.
 */
export default function ListenerCard({ scene, selection, onSwitch, onAdd, onRename, onRemove, onCompare, canCompare }: Props) {
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
      {/* A plain list, NOT role="radiogroup". Each row holds a pick button, a
          rename field and a remove button; a radiogroup may only own radios, so
          the override orphaned every <li> from its list (axe: `listitem`) and
          promised a one-tab-stop composite contract the rows do not implement.
          The pick carries aria-current instead, and every seat is a real tab
          stop — dropping the roving tabindex is what keeps seats 2..N reachable
          now that no composite-widget contract supplies arrow navigation.
          The arrow handler stays as an additive convenience.
          Explicit role="list": WebKit strips list semantics from a list with
          `list-style: none` (panels.css), which makes the element generic —
          and aria-label on a generic element is not exposed at all. The label
          is dropped here because the wrapping <section> already carries it. */}
      <ul className="seat-list" role="list">
        {seats.map((seat, i) => {
          const active = seat.id === activeId;
          return (
            <li key={seat.id} className={`seat-row ${active ? 'seat-row-active' : ''} ${active && listenerSelected ? 'seat-row-selected' : ''}`}>
              <button
                type="button"
                /* aria-current, not aria-pressed: exactly one seat is active
                   and clicking the active one is a no-op, so "toggle button,
                   pressed" wrongly implies it can be un-pressed. The name is
                   also kept STABLE across the state — a name that changes with
                   state announces the state twice and breaks voice-control
                   targeting ("click Listen from Bed" renaming itself mid-use). */
                aria-current={active ? 'true' : undefined}
                aria-label={`Listen from ${seat.name}`}
                title={active ? 'Active seat — drag the YOU puck to move it' : `Listen from “${seat.name}”`}
                className="seat-pick"
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
                {seat.z.toFixed(2)} m{/* the title is hover-only — name the number */}
                <span className="sr-only"> ear height</span>
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
        {/* Always present in TUNE. Gated on canCompare (≥2 seats OR ≥2 layouts) so
            the degenerate same-seat compare is never reachable; when it can't fire
            the card-sub below teaches how to unlock it. Mode-neutral title covers
            both the two-seats and two-layouts cases. */}
        <button
          type="button"
          className="btn"
          onClick={onCompare}
          disabled={!canCompare}
          title={canCompare ? 'Compare two setups side by side' : 'Add a second listening spot, or duplicate this layout, to compare'}
        >
          <Icon name="grid" size={13} />
          Compare
        </button>
      </div>
      <p className="card-sub">
        {canCompare
          ? 'Add a spot for each place you actually sit — couch, bed — then switch between them and drag the YOU puck to position each. Compare shows both verdicts side by side.'
          : 'Compare weighs two readouts side by side. Add a second listening spot, or duplicate this layout, and Compare lights up.'}
      </p>
    </section>
  );
}
