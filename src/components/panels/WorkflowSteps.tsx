import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import Icon, { type IconName } from '../ui/Icon';
import './panels.css';

export type Step = 'build' | 'furnish' | 'sound' | 'analyze';

interface Props {
  step: Step;
  onStep: (s: Step) => void;
  done: Record<Step, boolean>;
}

const STEPS: Array<{ id: Step; label: string; hint: string; icon: IconName }> = [
  { id: 'build', label: 'Build', hint: 'Trace the walls of your room', icon: 'wall' },
  { id: 'furnish', label: 'Furnish', hint: 'Drop in beds, couches, the TV…', icon: 'box' },
  { id: 'sound', label: 'Sound', hint: 'Place HomePods and yourself', icon: 'speaker' },
  { id: 'analyze', label: 'Analyze', hint: 'Read the numbers, find the sweet spot', icon: 'star' },
];

/**
 * Workflow "channel fader". The four steps read as detents on an audio-console
 * rail: a glowing cyan ring-handle glides to the active step, a signal fill
 * lights every node it has passed, and a frosted carriage springs under the
 * selection. Progress is shown by luminance (reached) — never a checkmark; the
 * small amber LED means the step's heuristic has data ("armed"), not "done".
 * One inline integer var (--active) drives all three compositor-only layers.
 */
export default function WorkflowSteps({ step, onStep, done }: Props) {
  const active = Math.max(0, STEPS.findIndex((s) => s.id === step));
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const go = (index: number) => {
    const i = Math.max(0, Math.min(STEPS.length - 1, index));
    onStep(STEPS[i].id);
    tabs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        go(active + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        go(active - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(STEPS.length - 1);
        break;
    }
  };

  return (
    <nav
      className="steps-bar"
      role="tablist"
      aria-label="Workflow"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      style={{ '--active': active, '--count': STEPS.length } as CSSProperties}
    >
      {/* Fader chrome — one absolute decorative layer, all driven by --active. */}
      <span className="fader-layer" aria-hidden="true">
        <span className="fader-rail">
          <span className="fader-fill" />
        </span>
        <span className="fader-carriage" />
        <span className="fader-cap">
          <span className="fader-cap-ring" />
        </span>
      </span>

      {STEPS.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          type="button"
          role="tab"
          className="step"
          aria-selected={i === active}
          aria-current={i === active ? 'step' : undefined}
          aria-label={`${s.label}${done[s.id] ? ', has data' : ''}`}
          tabIndex={i === active ? 0 : -1}
          data-active={i === active || undefined}
          data-reached={i <= active || undefined}
          data-armed={done[s.id] || undefined}
          title={s.hint}
          onClick={() => onStep(s.id)}
        >
          <span className="step-node">
            <Icon name={s.icon} size={13} />
          </span>
          <span className="step-label">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}
