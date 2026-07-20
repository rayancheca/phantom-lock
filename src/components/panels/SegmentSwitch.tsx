import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import Icon, { type IconName } from '../ui/Icon';
import './panels.css';

export interface SegmentItem<Id extends string> {
  id: Id;
  label: string;
  icon: IconName;
}

interface Props<Id extends string> {
  items: Array<SegmentItem<Id>>;
  value: Id;
  onSelect: (id: Id) => void;
  /** Optional amber "armed" LED per segment (heuristic satisfied — has data). */
  armed?: Partial<Record<Id, boolean>>;
  ariaLabel: string;
  /** 'mode' = the header DESIGN/TUNE switch; 'substep' = the sidebar Build/Furnish. */
  variant: 'mode' | 'substep';
}

/**
 * A 2-up (N-up) segmented `tablist`: a frosted accent thumb slides under the
 * selected segment via a single `transform: translateX` (compositor-only), the
 * amber LED marks "has data". Unlike the retired 4-step fader these are PARALLEL
 * toggles, not a progression — so it's a clean segmented control, not a rail.
 *
 * Reuses the console visual tokens and the exact roving-tabindex + arrow/Home/End
 * keyboard contract from the old WorkflowSteps, so the ARIA + reduced-motion
 * behaviour is preserved.
 */
export default function SegmentSwitch<Id extends string>({ items, value, onSelect, armed, ariaLabel, variant }: Props<Id>) {
  const active = Math.max(0, items.findIndex((s) => s.id === value));
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const go = (index: number) => {
    const i = Math.max(0, Math.min(items.length - 1, index));
    onSelect(items[i].id);
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
        go(items.length - 1);
        break;
    }
  };

  return (
    <div
      className={`segment-switch segment-switch--${variant}`}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      style={{ '--active': active, '--count': items.length } as CSSProperties}
    >
      <span className="segment-thumb" aria-hidden="true" />
      {items.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          type="button"
          role="radio"
          className="segment"
          aria-checked={i === active}
          aria-label={`${s.label}${armed?.[s.id] ? ', has data' : ''}`}
          tabIndex={i === active ? 0 : -1}
          data-active={i === active || undefined}
          data-armed={armed?.[s.id] || undefined}
          onClick={() => onSelect(s.id)}
        >
          <span className="segment-node">
            <Icon name={s.icon} size={14} />
          </span>
          <span className="segment-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
