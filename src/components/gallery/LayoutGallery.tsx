import { useEffect, useRef } from 'react';
import type { Layout, Scene } from '../../engine/types';
import { drawMiniPlan } from '../canvas/thumb';
import Icon from '../ui/Icon';
import Menu, { MenuItem, MenuSeparator } from '../ui/Menu';
import './gallery.css';

function Thumb({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPlan(ref.current, scene, { allSeats: true });
  }, [scene]);
  return <canvas ref={ref} className="gallery-thumb" aria-hidden="true" />;
}

interface GalleryProps {
  layouts: Layout[];
  activeId: string;
  onOpen: (id: string) => void;
  onNewRoom: () => void;
  onNewBlank: () => void;
  onNewApartment: () => void;
  onImport: () => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onExportAll: () => void;
  onCompare?: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Full-screen home for every design — cards with live miniatures. */
export default function LayoutGallery(p: GalleryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        p.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gallery-layer" role="dialog" aria-label="Your layouts">
      <header className="gallery-head">
        <h2>Your layouts</h2>
        <div className="gallery-head-actions">
          {p.onCompare && (
            <button
              type="button"
              className="btn"
              title="Compare two seats or two layouts side by side"
              onClick={p.onCompare}
            >
              <Icon name="grid" size={13} />
              Compare
            </button>
          )}
          <button
            type="button"
            className="btn"
            title="Download every layout as one backup file"
            onClick={p.onExportAll}
          >
            <Icon name="export" size={13} />
            Export all
          </button>
          <button type="button" className="dialog-x" aria-label="Close" onClick={p.onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </header>
      <div className="gallery-grid">
        {p.layouts.map((l) => {
          const walls = l.scene.objects.filter((o) => o.kind === 'wall').length;
          return (
            <div key={l.id} className={`gallery-card ${l.id === p.activeId ? 'gallery-card-active' : ''}`}>
              <button type="button" className="gallery-open" onClick={() => p.onOpen(l.id)}>
                <Thumb scene={l.scene} />
                <span className="gallery-name">{l.name}</span>
                <span className="gallery-meta">
                  {walls} wall{walls === 1 ? '' : 's'} · {l.scene.speakers.length} speaker
                  {l.scene.speakers.length === 1 ? '' : 's'}
                  {(l.scene.rooms?.length ?? 0) > 0 &&
                    ` · ${l.scene.rooms!.length} area${l.scene.rooms!.length === 1 ? '' : 's'}`}
                </span>
              </button>
              <div className="gallery-kebab">
                <Menu
                  label={`${l.name} actions`}
                  align="right"
                  trigger={(open) => (
                    <button
                      type="button"
                      className={`gallery-kebab-btn ${open ? 'room-trigger-open' : ''}`}
                      aria-label={`${l.name} actions`}
                      aria-haspopup="menu"
                      aria-expanded={open}
                    >
                      ⋯
                    </button>
                  )}
                >
                  <MenuItem icon="pencil" onSelect={() => p.onRename(l.id)}>
                    Rename…
                  </MenuItem>
                  <MenuItem icon="duplicate" onSelect={() => p.onDuplicate(l.id)}>
                    Duplicate
                  </MenuItem>
                  <MenuItem icon="export" onSelect={() => p.onExport(l.id)}>
                    Export layout (JSON)
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon="trash" danger onSelect={() => p.onDelete(l.id)}>
                    Delete
                  </MenuItem>
                </Menu>
              </div>
            </div>
          );
        })}
        <div className="gallery-new">
          <button type="button" className="gallery-new-btn" onClick={p.onNewRoom}>
            <Icon name="rectangle" size={18} />
            New room…
          </button>
          <button type="button" className="gallery-new-btn" onClick={p.onNewBlank}>
            <Icon name="pencil" size={18} />
            Empty layout
          </button>
          <button type="button" className="gallery-new-btn" onClick={p.onNewApartment}>
            <Icon name="home" size={18} />
            Maple Court apartment
          </button>
          <button
            type="button"
            className="gallery-new-btn"
            title="Open a Phantom Lock layout file you exported before (not a floorplan photo)"
            onClick={p.onImport}
          >
            <Icon name="import" size={18} />
            Import layout (JSON)…
          </button>
        </div>
      </div>
    </div>
  );
}
