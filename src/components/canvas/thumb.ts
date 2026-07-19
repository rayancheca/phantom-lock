import type { Scene } from '../../engine/types';
import { sceneBounds, sceneListeners } from '../../engine/scene';

/**
 * Miniature top-down plan: walls, furniture, speakers, and listening seats —
 * enough to recognize a design at a glance. Shared by the gallery cards and the
 * scenario-compare previews so both read the same. With `allSeats`, every seat
 * is drawn (active filled, inactive hollow); otherwise only the active seat.
 */
export function drawMiniPlan(
  canvas: HTMLCanvasElement,
  scene: Scene,
  opts: { allSeats?: boolean } = {},
): void {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth * dpr;
  const H = canvas.clientHeight * dpr;
  if (W === 0 || H === 0) return;
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

  const seats = opts.allSeats ? sceneListeners(scene) : [{ id: scene.activeListenerId, pos: scene.listener.pos }];
  for (const seat of seats) {
    const [lx, ly] = px(seat.pos.x, seat.pos.y);
    const active = seat.id === scene.activeListenerId;
    g.beginPath();
    g.arc(lx, ly, (active ? 3 : 2.4) * dpr, 0, Math.PI * 2);
    if (active) {
      g.fillStyle = '#eef2fa';
      g.fill();
    } else {
      g.strokeStyle = 'rgba(238,242,250,0.7)';
      g.lineWidth = Math.max(1, 1.2 * dpr);
      g.stroke();
    }
  }
}
