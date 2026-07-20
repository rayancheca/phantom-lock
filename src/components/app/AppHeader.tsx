import type { RefObject } from 'react';
import Icon from '../ui/Icon';
import SegmentSwitch from '../panels/SegmentSwitch';
import { MODE_ITEMS } from './app-constants';
import type { AppMode } from './mode';

interface AppHeaderProps {
  activeName: string;
  onOpenGallery: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onImportFile: (file: File) => void;
  appMode: AppMode;
  onSetMode: (m: AppMode) => void;
  modeArmed: Record<AppMode, boolean>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** The global top bar — only what is truly global: brand, the always-pinned
 *  layout switcher, the DESIGN/TUNE mode switch, and undo/redo. Mode-specific
 *  actions (TV/Music, Suggest, Compare) live in the TUNE context, not here. */
export default function AppHeader({
  activeName,
  onOpenGallery,
  fileRef,
  onImportFile,
  appMode,
  onSetMode,
  modeArmed,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand" title="Phantom Lock — acoustic room planner">
          {/* aria-label names the heading directly, so it survives the ≤560px
              monogram swap (both spans are aria-hidden / display-toggled). */}
          <h1 aria-label="Phantom Lock">
            <span className="wm-full" aria-hidden="true">
              PHANTOM<span>LOCK</span>
            </span>
            <span className="wm-mono" aria-hidden="true">
              P<span>L</span>
            </span>
          </h1>
        </div>
        <button
          type="button"
          className="room-trigger"
          title="All layouts — switch, create, manage"
          onClick={onOpenGallery}
        >
          <span className="room-trigger-name">{activeName}</span>
          <Icon name="layers" size={14} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <SegmentSwitch
        items={MODE_ITEMS}
        value={appMode}
        onSelect={onSetMode}
        armed={modeArmed}
        ariaLabel="Workspace mode"
        variant="mode"
      />

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-icon"
          title="Undo (⌘Z)"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Icon name="redo" size={16} />
        </button>
      </div>
    </header>
  );
}
