import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Icon, { type IconName } from './Icon';
import './ui.css';

const MenuCtx = createContext<{ close: () => void } | null>(null);

interface MenuProps {
  /** Render the trigger; `open` lets it style itself and set aria-expanded. */
  trigger: (open: boolean) => ReactNode;
  align?: 'left' | 'right';
  label: string;
  children: ReactNode;
}

/** Dependency-free dropdown implementing the ARIA menu keyboard contract:
 *  first item focused on open, arrow-key roving, Home/End, Esc/Tab close,
 *  outside pointerdown closes (and is swallowed so it can't also act on the
 *  canvas), and focus returns to the trigger on close. */
export default function Menu({ trigger, align = 'left', label, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) rootRef.current?.querySelector<HTMLElement>('button')?.focus();
  };

  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        // Swallow the press: dismissing a menu must not also draw on the canvas.
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        const items = [...(popRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        if (items.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === 'Home' ? 0
          : e.key === 'End' ? items.length - 1
          : e.key === 'ArrowDown' ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="menu-root" ref={rootRef}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={`menu-pop menu-${align}`} role="menu" aria-label={label} ref={popRef}>
          <MenuCtx.Provider value={{ close: () => close() }}>{children}</MenuCtx.Provider>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon?: IconName;
  checked?: boolean;
  danger?: boolean;
  detail?: string;
  onSelect: () => void;
  children: ReactNode;
}

export function MenuItem({ icon, checked, danger, detail, onSelect, children }: MenuItemProps) {
  const ctx = useContext(MenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={`menu-item ${danger ? 'menu-item-danger' : ''} ${checked ? 'menu-item-checked' : ''}`}
      onClick={() => {
        ctx?.close();
        onSelect();
      }}
    >
      <span className="menu-item-lead">
        {checked !== undefined ? (
          checked ? (
            <Icon name="check" size={14} />
          ) : (
            <span className="menu-item-blank" />
          )
        ) : icon ? (
          <Icon name={icon} size={15} />
        ) : (
          <span className="menu-item-blank" />
        )}
      </span>
      <span className="menu-item-label">{children}</span>
      {detail && <span className="menu-item-detail">{detail}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="menu-heading" role="presentation">
      {children}
    </div>
  );
}
