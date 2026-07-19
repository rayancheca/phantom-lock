import type { Step } from './WorkflowSteps';
import type { RoomLabel } from '../../engine/types';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  step: Step;
  hasWalls: boolean;
  rooms: RoomLabel[];
  onCreateRoom: () => void;
  onDeleteRoom: (id: string) => void;
  onInsertRectRoom: () => void;
  onDrawWalls: () => void;
}

/** One sentence up front; the full how-to hides behind a disclosure. */
const GUIDES: Record<Step, { title: string; hint: string; lines: string[] }> = {
  build: {
    title: 'Build the room',
    hint: 'Trace your walls corner by corner — or drop in a rectangle and edit from there.',
    lines: [
      'Got a floorplan photo? Import it below and trace right over it.',
      'Click corner by corner — labels show length, lines snap straight.',
      'Click your first corner again to close the room. Backspace undoes a corner, Esc finishes.',
      'Add windows and doors from the Furnish palette — they snap onto walls.',
    ],
  },
  furnish: {
    title: 'Furnish it',
    hint: 'Add the furniture that shapes the sound — heights matter, so a wardrobe blocks what a couch lets pass.',
    lines: [
      'Click an item to drop it into the room, then drag it into place.',
      'Q / E rotate · arrow keys nudge · Del removes.',
      'Mark one box as “the TV” so cinema mode knows where the screen is.',
      'Windows and doors snap onto walls and change how sound escapes.',
    ],
  },
  sound: {
    title: 'Place the sound',
    hint: 'Add your HomePods, then drag YOU to where you actually sit or lie.',
    lines: [
      'Add speakers below, then click the canvas to place each one.',
      'Set your ear height — sitting, standing, or lying changes what reaches you.',
      'Select a speaker to link two of the same model as a stereo pair.',
      'Or let Suggest placement find the spots for you.',
    ],
  },
  analyze: {
    title: 'Read the room',
    hint: 'Drag yourself or any speaker and watch the verdict update live.',
    lines: [],
  },
};

export default function GuidePanel({ step, hasWalls, rooms, onCreateRoom, onDeleteRoom, onInsertRectRoom, onDrawWalls }: Props) {
  const guide = GUIDES[step];
  return (
    <section className="card card-guide" aria-label={`Guide: ${guide.title}`}>
      <h2>{guide.title}</h2>
      <p className="guide-hint">{guide.hint}</p>
      {step === 'build' && hasWalls && (
        <>
          <div className="preset-row">
            <button
              type="button"
              className="btn btn-primary"
              title="Drag a box over part of the plan and name it — Kitchen, Bedroom… (Roomba-style)"
              onClick={onCreateRoom}
            >
              <Icon name="plus" size={14} />
              Create room
            </button>
            <button
              type="button"
              className="btn"
              title="Attach a new walled room shell next to the current plan"
              onClick={onInsertRectRoom}
            >
              <Icon name="rectangle" size={14} />
              Add a wing…
            </button>
          </div>
          {rooms.length > 0 && (
            <div className="room-chips">
              {rooms.map((r) => (
                <span key={r.id} className="room-chip">
                  {r.name}
                  <button
                    type="button"
                    aria-label={`Remove ${r.name}`}
                    onClick={() => onDeleteRoom(r.id)}
                  >
                    <Icon name="x" size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {step === 'build' && !hasWalls && (
        <div className="preset-row">
          <button type="button" className="btn btn-primary" onClick={onInsertRectRoom}>
            <Icon name="rectangle" size={14} />
            Start with a rectangle
          </button>
          <button type="button" className="btn" onClick={onDrawWalls}>
            <Icon name="wall" size={14} />
            Draw walls myself
          </button>
        </div>
      )}
      {guide.lines.length > 0 && (
        <details className="guide-more">
          <summary>How this works</summary>
          <ol className="guide-list">
            {guide.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
