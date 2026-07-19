import { useEffect, useRef } from 'react';
import type { Layout, Scene } from '../../engine/types';
import { sceneBounds } from '../../engine/scene';
import Icon from '../ui/Icon';
import Menu, { MenuItem, MenuSeparator } from '../ui/Menu';
import './gallery.css';

/** Miniature plan: walls, furniture, speakers — enough to recognize a design. */
function drawThumb(canvas: HTMLCanvasElement, scene: Scene) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth * dpr;
  const H = canvas.clientHeight * dpr;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#0d1320';
  g.fillRect(0, 0, W, H);
  const b = sceneBounds(scene);
  const bw = Math.max(1, b.max.x - b.min.x);
  const bh = Math.max(1, b.max.y - b.min.y);
  const s = Math.min((W * 0.82) / bw, (H * 0.82) / bh);
  const ox = (W - bw * s) / 2 - b.min.x * s;
  const oy = (H - bh * s) / 2 - b.min.y * s;
  const px = (x: number, y: number) => [x * s + ox, y * s + oy] as const;

  g.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  g.fillStyle = 'rgba(148, 163, 184, 0.12)';
  g.lineWidth = Math.max(1, 1.2 * dpr);
  for (const o of scene.objects) {
    if (o.kind === 'wall') {
      g.strokeStyle = '#8b9bb8';
      g.lineWidth = Math.max(1.5, 2 * dpr);
      g.beginPath();
      g.moveTo(...px(o.a.x, o.a.y));
      g.lineTo(...px(o.b.x, o.b.y));
      g.stroke();
    } else if (o.kind === 'rect') {
      g.save();
      g.translate(...px(o.center.x, o.center.y));
      g.rotate(o.rotation);
      g.strokeStyle = o.role === 'tv' ? 'rgba(79,216,255,0.8)' : 'rgba(148,163,184,0.4)';
      g.lineWidth = dpr;
      g.strokeRect((-o.w / 2) * s, (-o.h / 2) * s, o.w * s, o.h * s);
      g.restore();
    } else {
      const [cx, cy] = px(o.center.x, o.center.y);
      g.strokeStyle = 'rgba(148,163,184,0.4)';
      g.lineWidth = dpr;
      g.beginPath();
      g.arc(cx, cy, o.r * s, 0, Math.PI * 2);
      g.stroke();
    }
  }
  for (const sp of scene.speakers) {
    const [cx, cy] = px(sp.pos.x, sp.pos.y);
    g.fillStyle = '#4fd8ff';
    g.beginPath();
    g.arc(cx, cy, 2.5 * dpr, 0, Math.PI * 2);
    g.fill();
  }
  const [lx, ly] = px(scene.listener.pos.x, scene.listener.pos.y);
  g.fillStyle = '#eef2fa';
  g.beginPath();
  g.arc(lx, ly, 2.5 * dpr, 0, Math.PI * 2);
  g.fill();
}

function Thumb({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawThumb(ref.current, scene);
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
                  {(l.scene.rooms?.length ?? 0) > 0 && ` · ${l.scene.rooms!.length} rooms`}
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
                    Export JSON
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
          <button type="button" className="gallery-new-btn" onClick={p.onImport}>
            <Icon name="import" size={18} />
            Import JSON…
          </button>
        </div>
      </div>
    </div>
  );
}
