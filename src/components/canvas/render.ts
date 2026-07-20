import type {
  Scene,
  SceneObject,
  Selection,
  SimSettings,
  SpeakerTrace,
  TraceResult,
  Vec2,
} from '../../engine/types';
import type { AudioMetrics, PairMetrics } from '../../engine/stereo';
import type { Proposal } from '../../engine/optimize';
import type { ListeningField } from '../../engine/bestspot';
import { rectCorners } from '../../engine/geometry';
import { CAPTURE_RADIUS, wallKeptSpans } from '../../engine/raytrace';
import { SPEAKER_MODELS } from '../../engine/speakers';
import { activeListener, sceneBounds, sceneListeners } from '../../engine/scene';
import * as v from '../../engine/vec';

export interface View {
  scale: number; // px per metre
  ox: number;
  oy: number;
  /** View rotation in radians — the whole floor plan spins around the screen. */
  rot: number;
}

/** Rotate a world-space vector into screen orientation. */
export const rotVec = (p: Vec2, rot: number): Vec2 => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export const worldToScreen = (p: Vec2, v: View): Vec2 => {
  const r = rotVec(p, v.rot);
  return { x: r.x * v.scale + v.ox, y: r.y * v.scale + v.oy };
};

export const screenToWorld = (q: Vec2, v: View): Vec2 => {
  const dx = (q.x - v.ox) / v.scale;
  const dy = (q.y - v.oy) / v.scale;
  return rotVec({ x: dx, y: dy }, -v.rot);
};

export type CanvasTheme = 'sound' | 'plan';

export interface WallChain {
  points: Vec2[];
  cursor: Vec2 | null;
}

export interface RenderState {
  scene: Scene;
  settings: SimSettings;
  selection: Selection;
  trace: TraceResult;
  audio: AudioMetrics;
  preview: SceneObject | null;
  chain: WallChain | null;
  proposal: Proposal | null;
  furnitureProposal: SceneObject[] | null;
  bestSpot: ListeningField | null;
  theme: CanvasTheme;
  view: View;
  width: number;
  height: number;
}

/** Ray/node colour palette. */
export const SPEAKER_COLORS = [
  '79, 216, 255',
  '255, 169, 90',
  '196, 143, 255',
  '110, 231, 183',
  '255, 121, 198',
  '255, 220, 100',
];

/**
 * One colour per sound "source": a stereo pair shares a single colour (its
 * rays visually merge into one system), solo speakers get their own.
 */
export function speakerColors(scene: Scene): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  for (const [a, b] of scene.pairs) {
    const color = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
    out.set(a, color);
    out.set(b, color);
    i += 1;
  }
  for (const sp of scene.speakers) {
    if (!out.has(sp.id)) {
      out.set(sp.id, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
      i += 1;
    }
  }
  return out;
}

// --- floorplan underlay -----------------------------------------------------

const imgCache = new Map<string, HTMLImageElement>();
let redrawHook: (() => void) | null = null;

/** The canvas registers a callback so async image loads trigger a repaint. */
export function setRedrawHook(cb: (() => void) | null): void {
  redrawHook = cb;
}

function getUnderlayImage(src: string): HTMLImageElement {
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => redrawHook?.();
    img.src = src;
    if (imgCache.size > 6) imgCache.clear();
    imgCache.set(src, img);
  }
  return img;
}

function drawUnderlay(ctx: CanvasRenderingContext2D, st: RenderState): void {
  const u = st.scene.underlay;
  if (!u) return;
  const img = getUnderlayImage(u.src);
  if (!img.complete || img.naturalWidth === 0) return;
  const { view } = st;
  const c = w2s(u.center, view);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(view.rot + u.rotation);
  const s = view.scale * u.scale;
  ctx.scale(s, s);
  ctx.globalAlpha = u.opacity * (st.theme === 'plan' ? 1 : 0.55);
  ctx.drawImage(img, -u.wPx / 2, -u.hPx / 2, u.wPx, u.hPx);
  ctx.restore();
}

interface ThemeColors {
  bg: string;
  grid: string;
  gridMajor: string;
  gridLabel: string;
  wall: string;
  wallFill: string;
  tv: string;
  tvFill: string;
  select: string;
  ink: string;
  muted: string;
  pillBg: string;
  pillBorder: string;
  listener: string;
  tri: string;
  ok: string;
  bad: string;
  rays: boolean;
}

const THEMES: Record<CanvasTheme, ThemeColors> = {
  sound: {
    bg: '#080b12',
    grid: 'rgba(148, 163, 184, 0.10)',
    gridMajor: 'rgba(148, 163, 184, 0.22)',
    gridLabel: 'rgba(139, 150, 173, 0.7)',
    wall: '#8b9bb8',
    wallFill: 'rgba(139, 155, 184, 0.10)',
    tv: '#9be8ff',
    tvFill: 'rgba(79, 216, 255, 0.10)',
    select: '#ffffff',
    ink: 'rgba(233, 238, 248, 0.85)',
    muted: 'rgba(139, 150, 173, 0.9)',
    pillBg: 'rgba(8, 11, 18, 0.82)',
    pillBorder: 'rgba(148, 163, 184, 0.22)',
    listener: '233, 238, 248',
    tri: 'rgba(233, 238, 248, 0.55)',
    ok: '#3ee08a',
    bad: '#ff6b6b',
    rays: true,
  },
  plan: {
    // Dark cyanotype blueprint — the room-building view. A cyan-tinted graph-paper
    // sibling of `sound`: same near-black studio surface, cooler/brighter structure,
    // no ray field. sound↔plan is a gentle hue shift, not a black↔white flash.
    bg: '#0a1220',
    grid: 'rgba(79, 216, 255, 0.10)',
    gridMajor: 'rgba(79, 216, 255, 0.22)',
    gridLabel: 'rgba(143, 199, 224, 0.65)',
    wall: '#8fc7e0',
    wallFill: 'rgba(143, 199, 224, 0.08)',
    tv: '#9be8ff',
    tvFill: 'rgba(79, 216, 255, 0.10)',
    select: '#4fd8ff',
    ink: 'rgba(219, 236, 246, 0.85)',
    muted: 'rgba(143, 199, 224, 0.7)',
    pillBg: 'rgba(10, 18, 32, 0.85)',
    pillBorder: 'rgba(79, 216, 255, 0.22)',
    listener: '219, 236, 246',
    tri: 'rgba(219, 236, 246, 0.5)',
    ok: '#3ee08a',
    bad: '#ff6b6b',
    rays: false,
  },
};

// Geist Mono leads the stack so canvas numbers share the UI's data identity;
// ui-monospace fallback still renders the few glyphs Geist Mono lacks (★ ∠ ⌀).
// Only 400 (FONT) + 500 (FONT_MD) are vendored — never 600/bold — so the browser
// never faux-synthesises a heavier weight. A repaint fires when the face loads
// (font-ready.ts) so pill widths don't reflow off fallback metrics.
const FONT = '11px "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';
const FONT_MD = '500 12px "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace';

export function fitView(width: number, height: number, bounds: { min: Vec2; max: Vec2 }): View {
  const bw = Math.max(1, bounds.max.x - bounds.min.x);
  const bh = Math.max(1, bounds.max.y - bounds.min.y);
  const availW = Math.max(60, width - 90);
  const availH = Math.max(60, height - 90);
  const scale = Math.max(4, Math.min(400, Math.min(availW / bw, availH / bh)));
  return {
    scale,
    ox: (width - bw * scale) / 2 - bounds.min.x * scale,
    oy: (height - bh * scale) / 2 - bounds.min.y * scale,
    rot: 0,
  };
}

const w2s = worldToScreen;

function drawGrid(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const { view, width, height } = st;
  const step = view.scale >= 55 ? 1 : view.scale >= 22 ? 2 : view.scale >= 9 ? 5 : 10;

  // The view can be rotated, so find the world-space box that covers the
  // visible screen and draw grid lines as world segments across it.
  const corners = [
    screenToWorld({ x: 0, y: 0 }, view),
    screenToWorld({ x: width, y: 0 }, view),
    screenToWorld({ x: 0, y: height }, view),
    screenToWorld({ x: width, y: height }, view),
  ];
  const minX = Math.floor(Math.min(...corners.map((c) => c.x)) / step) * step;
  const maxX = Math.ceil(Math.max(...corners.map((c) => c.x)) / step) * step;
  const minY = Math.floor(Math.min(...corners.map((c) => c.y)) / step) * step;
  const maxY = Math.ceil(Math.max(...corners.map((c) => c.y)) / step) * step;

  ctx.lineWidth = 1;
  for (let x = minX; x <= maxX; x += step) {
    const a = w2s({ x, y: minY }, view);
    const b = w2s({ x, y: maxY }, view);
    ctx.strokeStyle = x % (step * 5) === 0 ? T.gridMajor : T.grid;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = minY; y <= maxY; y += step) {
    const a = w2s({ x: minX, y }, view);
    const b = w2s({ x: maxX, y }, view);
    ctx.strokeStyle = y % (step * 5) === 0 ? T.gridMajor : T.grid;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Blueprint ruler: metre marks hugging the room's own edges, counting from
  // its corner — they travel and rotate with the plan like ink on paper.
  if (st.theme === 'plan' && view.scale >= 18) {
    const bounds = sceneBounds(st.scene);
    const originX = Math.floor(bounds.min.x + 1e-6);
    const originY = Math.floor(bounds.min.y + 1e-6);
    const spanX = Math.ceil(bounds.max.x) - originX;
    const spanY = Math.ceil(bounds.max.y) - originY;
    ctx.font = FONT;
    ctx.fillStyle = T.gridLabel;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let rel = 0; rel <= spanX; rel += step) {
      const p = w2s({ x: originX + rel, y: originY - 0.22 }, view);
      ctx.fillText(`${rel}m`, p.x, p.y);
    }
    for (let rel = step; rel <= spanY; rel += step) {
      const p = w2s({ x: originX - 0.3, y: originY + rel }, view);
      ctx.fillText(`${rel}m`, p.x, p.y);
    }
  }
}

const RAY_BUCKETS = 14;

function drawRays(
  ctx: CanvasRenderingContext2D,
  st: RenderState,
  trace: SpeakerTrace,
  rgb: string,
): void {
  const { view, settings, scene } = st;
  const crowd = scene.speakers.length > 2 ? 0.7 : 1;
  const alphaScale = Math.max(0.14, Math.min(0.8, (230 / settings.rayCount) * crowd));
  const buckets: Path2D[] = Array.from({ length: RAY_BUCKETS }, () => new Path2D());
  const bucketUsed = new Array<boolean>(RAY_BUCKETS).fill(false);

  for (const path of trace.paths) {
    for (let i = 0; i < path.energy.length; i++) {
      const a = (path.energy[i] / (1 + settings.decay * path.cumDist[i])) * alphaScale;
      if (a < 0.006) continue;
      const bi = Math.min(RAY_BUCKETS - 1, Math.floor(Math.min(0.99, a) * RAY_BUCKETS));
      const p0 = w2s(path.points[i], view);
      const p1 = w2s(path.points[i + 1], view);
      buckets[bi].moveTo(p0.x, p0.y);
      buckets[bi].lineTo(p1.x, p1.y);
      bucketUsed[bi] = true;
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < RAY_BUCKETS; i++) {
    if (!bucketUsed[i]) continue;
    ctx.strokeStyle = `rgba(${rgb}, ${((i + 0.5) / RAY_BUCKETS).toFixed(3)})`;
    ctx.stroke(buckets[i]);
  }
  ctx.restore();
}

/** One dot per millisecond of travel: the dots line up into visible wavefronts. */
const WAVE_STEP = 0.343;
/** Hard ceilings so long graze-heavy paths can't flood the canvas. */
const WAVE_MAX_DOTS_PER_PATH = 110;
const WAVE_RAY_STRIDE = 3;
/** Absolute budget per speaker — waves degrade gracefully instead of OOMing. */
const WAVE_MAX_DOTS_TOTAL = 7000;

function drawWaves(
  ctx: CanvasRenderingContext2D,
  st: RenderState,
  trace: SpeakerTrace,
  rgb: string,
): void {
  const { view, settings, scene } = st;
  const crowd = scene.speakers.length > 2 ? 0.75 : 1;
  const alphaScale = Math.max(0.25, Math.min(0.95, (600 / settings.rayCount) * crowd));
  const buckets: Path2D[] = Array.from({ length: RAY_BUCKETS }, () => new Path2D());
  const bucketUsed = new Array<boolean>(RAY_BUCKETS).fill(false);
  const dot = Math.max(1.4, Math.min(2.6, view.scale * 0.03));

  let total = 0;
  for (let pi = 0; pi < trace.paths.length && total < WAVE_MAX_DOTS_TOTAL; pi += WAVE_RAY_STRIDE) {
    const path = trace.paths[pi];
    let dots = 0;
    for (let i = 0; i < path.energy.length && dots < WAVE_MAX_DOTS_PER_PATH; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const segLen = v.dist(a, b);
      if (segLen < 1e-6) continue;
      const cum0 = path.cumDist[i];
      for (
        let k = Math.ceil(cum0 / WAVE_STEP);
        k * WAVE_STEP < cum0 + segLen && dots < WAVE_MAX_DOTS_PER_PATH;
        k++
      ) {
        const dAlong = k * WAVE_STEP - cum0;
        const alpha = (path.energy[i] / (1 + settings.decay * (cum0 + dAlong))) * alphaScale;
        if (alpha < 0.02) {
          dots = WAVE_MAX_DOTS_PER_PATH; // everything further is dimmer — stop this path
          break;
        }
        const p = w2s(v.lerp(a, b, dAlong / segLen), view);
        const bi = Math.min(RAY_BUCKETS - 1, Math.floor(Math.min(0.99, alpha) * RAY_BUCKETS));
        buckets[bi].rect(p.x - dot / 2, p.y - dot / 2, dot, dot);
        bucketUsed[bi] = true;
        dots += 1;
        total += 1;
      }
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < RAY_BUCKETS; i++) {
    if (!bucketUsed[i]) continue;
    ctx.fillStyle = `rgba(${rgb}, ${((i + 0.5) / RAY_BUCKETS).toFixed(3)})`;
    ctx.fill(buckets[i]);
  }
  ctx.restore();
}

function drawBestSpot(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const field = st.bestSpot;
  if (!field?.best) return;
  const { view } = st;
  ctx.save();
  if (st.theme === 'sound') ctx.globalCompositeOperation = 'lighter';
  const r = Math.max(8, 0.22 * view.scale);
  for (const s of field.zone) {
    const p = w2s(s.p, view);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    const a = 0.16 * (s.s / field.bestScore);
    g.addColorStop(0, `rgba(62, 224, 138, ${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(62, 224, 138, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Star marker on the single best spot.
  const p = w2s(field.best, view);
  const R = Math.max(7, 0.14 * view.scale);
  ctx.save();
  ctx.fillStyle = T.ok;
  ctx.strokeStyle = T.bg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? R : R * 0.45;
    const x = p.x + Math.cos(ang) * rad;
    const y = p.y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  labelPill(ctx, T, '★ Best spot', p.x, p.y - R - 14, T.ok, { md: true, solid: true });
  ctx.restore();
}

/** The one annotation primitive. `md` grows it into a headline pill; `solid`
 *  inverts it (colored chip, theme-bg text) for standout markers. */
function labelPill(
  ctx: CanvasRenderingContext2D,
  T: ThemeColors,
  text: string,
  x: number,
  y: number,
  color?: string,
  opts?: { md?: boolean; solid?: boolean },
): void {
  ctx.font = opts?.md ? FONT_MD : FONT;
  const wText = ctx.measureText(text).width;
  const padX = opts?.md ? 8 : 6;
  const h = opts?.md ? 21 : 17;
  const rad = opts?.md ? 7 : 5;
  ctx.beginPath();
  ctx.roundRect(x - wText / 2 - padX, y - h / 2, wText + padX * 2, h, rad);
  if (opts?.solid) {
    ctx.fillStyle = color ?? T.ink;
    ctx.fill();
    ctx.fillStyle = T.bg;
  } else {
    ctx.fillStyle = T.pillBg;
    ctx.fill();
    ctx.strokeStyle = T.pillBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color ?? T.ink;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

/** Rounded selection handle — one primitive for wall ends and chain corners. */
function drawHandle(ctx: CanvasRenderingContext2D, T: ThemeColors, p: Vec2, r = 4.5): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = T.bg;
  ctx.strokeStyle = T.select;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  st: RenderState,
  T: ThemeColors,
  o: SceneObject,
  selected: boolean,
): void {
  const { view } = st;
  if (o.kind === 'wall') {
    const a = w2s(o.a, view);
    const b = w2s(o.b, view);
    ctx.strokeStyle = selected ? T.select : T.wall;
    ctx.lineWidth = Math.max(3, 0.09 * view.scale);
    ctx.lineCap = 'round';
    // Draw the wall with visible gaps where doors cut through it.
    for (const [t0, t1] of wallKeptSpans(o, st.scene.objects, ['door'])) {
      const p0 = w2s(v.lerp(o.a, o.b, t0), view);
      const p1 = w2s(v.lerp(o.a, o.b, t1), view);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    if (selected) {
      for (const p of [a, b]) drawHandle(ctx, T, p, 5);
      const mid = w2s(v.lerp(o.a, o.b, 0.5), view);
      labelPill(ctx, T, `${v.dist(o.a, o.b).toFixed(2)} m · ↕${o.height.toFixed(1)}`, mid.x, mid.y - 16);
    } else if (st.theme === 'plan' && view.scale >= 22) {
      // Blueprint mode: dimension every wall like a real floor plan — the
      // label sits in a pill, offset off the wall along its normal.
      const len = v.dist(o.a, o.b);
      if (len >= 0.4) {
        const mid = w2s(v.lerp(o.a, o.b, 0.5), view);
        const n = v.norm(v.perp(v.sub(o.b, o.a)));
        labelPill(ctx, T, `${len.toFixed(2)} m`, mid.x + n.x * 18, mid.y + n.y * 18, T.ink);
      }
    }
    return;
  }

  const isTv = o.kind === 'rect' && o.role === 'tv';
  const isWindow = o.kind === 'rect' && o.role === 'window';
  const isDoor = o.kind === 'rect' && o.role === 'door';

  if (isDoor && o.kind === 'rect') {
    // Classic plan symbol: leaf + quarter swing arc from the hinge jamb.
    const c = rectCorners(o);
    const jambH = v.lerp(c[0], c[3], 0.5); // hinge side
    const jambL = v.lerp(c[1], c[2], 0.5); // latch side
    const hinge = w2s(jambH, view);
    const open = o.doorOpen !== false;
    const along = Math.atan2(jambL.y - jambH.y, jambL.x - jambH.x);
    const leafAngle = open ? along - Math.PI / 2.6 : along;
    const rPx = o.w * view.scale;
    ctx.strokeStyle = selected ? T.select : T.wall;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.lineTo(hinge.x + Math.cos(leafAngle + view.rot) * rPx, hinge.y + Math.sin(leafAngle + view.rot) * rPx);
    ctx.stroke();
    if (open) {
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hinge.x, hinge.y, rPx, leafAngle + view.rot, along + view.rot, false);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (selected) {
      const p = w2s(o.center, view);
      labelPill(ctx, T, `${o.label} · ${open ? 'open — sound passes' : 'closed'}`, p.x, p.y + 20);
    }
    return;
  }

  ctx.strokeStyle = selected ? T.select : isTv || isWindow ? T.tv : T.wall;
  ctx.fillStyle = isTv ? T.tvFill : isWindow ? T.bg : T.wallFill;
  ctx.lineWidth = selected ? 2.5 : 1.5;

  if (o.kind === 'rect') {
    const c = rectCorners(o).map((p) => w2s(p, view));
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (isWindow) {
      // Classic plan symbol: glass line through the middle of the frame.
      const m1 = w2s(v.lerp(rectCorners(o)[0], rectCorners(o)[3], 0.5), view);
      const m2 = w2s(v.lerp(rectCorners(o)[1], rectCorners(o)[2], 0.5), view);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m1.x, m1.y);
      ctx.lineTo(m2.x, m2.y);
      ctx.stroke();
    }
  } else {
    const p = w2s(o.center, view);
    ctx.beginPath();
    ctx.arc(p.x, p.y, o.r * view.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const p = w2s(o.center, view);
  // Labels fade in with zoom so a zoomed-out plan isn't a wall of caps.
  if ((!isWindow || selected) && (selected || isTv || view.scale >= 26)) {
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isTv || isWindow ? T.tv : T.muted;
    ctx.fillText(o.label.toUpperCase(), p.x, p.y + (isWindow ? -12 : 0));
  }

  if (selected) {
    const deg = o.kind === 'rect' ? Math.round((o.rotation * 180) / Math.PI) : 0;
    const angleTxt = o.kind === 'rect' && deg !== 0 ? ` · ∠${deg}°` : '';
    const dims =
      o.kind === 'rect'
        ? `${o.w.toFixed(2)} × ${o.h.toFixed(2)} m · ↕${o.height.toFixed(2)}${angleTxt}`
        : `⌀ ${(o.r * 2).toFixed(2)} m · ↕${o.height.toFixed(2)}`;
    const below = o.kind === 'rect' ? (Math.max(o.w, o.h) / 2) * view.scale : o.r * view.scale;
    labelPill(ctx, T, dims, p.x, p.y + below + 16);
  }
}

function drawChain(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const chain = st.chain;
  if (!chain || chain.points.length === 0) return;
  const { view } = st;
  const pts = chain.points.map((p) => w2s(p, view));

  ctx.save();
  ctx.strokeStyle = T.select;
  ctx.lineWidth = Math.max(3, 0.09 * view.scale);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  if (chain.cursor) {
    const last = pts[pts.length - 1];
    const cur = w2s(chain.cursor, view);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const lastW = chain.points[chain.points.length - 1];
    const len = v.dist(lastW, chain.cursor);
    if (len > 0.05) {
      // Angle measured on the floor plan (independent of view rotation),
      // 0° = horizontal, 90° = vertical.
      const segAngle =
        Math.round(((Math.atan2(chain.cursor.y - lastW.y, chain.cursor.x - lastW.x) * 180) / Math.PI + 360) % 180);
      labelPill(
        ctx,
        T,
        `${len.toFixed(2)} m · ∠${segAngle}°`,
        (last.x + cur.x) / 2,
        (last.y + cur.y) / 2 - 14,
        T.select,
      );
    }
    // Closing hint: snap ring around the first vertex.
    if (chain.points.length >= 2 && v.dist(chain.cursor, chain.points[0]) < 0.25) {
      ctx.strokeStyle = T.ok;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (const p of pts) drawHandle(ctx, T, p);
  ctx.restore();
}

function drawPairTriangle(
  ctx: CanvasRenderingContext2D,
  st: RenderState,
  T: ThemeColors,
  pair: PairMetrics,
): void {
  const { scene, view } = st;
  const a = scene.speakers.find((s) => s.id === pair.aId);
  const b = scene.speakers.find((s) => s.id === pair.bId);
  if (!a || !b) return;
  const blockedById = new Map(st.trace.bySpeaker.map((s) => [s.id, s.direct.blocked]));

  const A = w2s(a.pos, view);
  const B = w2s(b.pos, view);
  const P = w2s(scene.listener.pos, view);
  const locked = pair.locked;
  const lineColor = locked ? T.ok : T.tri;

  ctx.save();
  if (locked) {
    ctx.fillStyle = 'rgba(62, 224, 138, 0.07)';
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(P.x, P.y);
    ctx.closePath();
    ctx.fill();
  }

  const side = (p0: Vec2, p1: Vec2, blocked: boolean) => {
    ctx.strokeStyle = blocked ? T.bad : lineColor;
    ctx.setLineDash(blocked ? [4, 5] : locked ? [] : [7, 6]);
    ctx.lineWidth = locked ? 2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  };
  side(A, P, Boolean(blockedById.get(pair.aId)));
  side(B, P, Boolean(blockedById.get(pair.bId)));
  side(A, B, false);
  ctx.setLineDash([]);

  // Offset each distance pill along its segment's normal so the three labels
  // never sit on top of each other or the nodes.
  const sidePill = (p0: Vec2, p1: Vec2, txt: string, color: string) => {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const L = Math.hypot(dx, dy) || 1;
    labelPill(ctx, T, txt, (p0.x + p1.x) / 2 - (dy / L) * 13, (p0.y + p1.y) / 2 + (dx / L) * 13, color);
  };
  sidePill(A, P, `${pair.dA.toFixed(2)} m`, blockedById.get(pair.aId) ? T.bad : lineColor);
  sidePill(B, P, `${pair.dB.toFixed(2)} m`, blockedById.get(pair.bId) ? T.bad : lineColor);
  sidePill(A, B, `${pair.base.toFixed(2)} m`, lineColor);

  const mid = w2s(v.lerp(a.pos, b.pos, 0.5), view);
  const apex = w2s(pair.apex, view);
  ctx.strokeStyle = locked ? 'rgba(62, 224, 138, 0.5)' : T.tri;
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ext = v.add(apex, v.scale(v.sub(apex, mid), 0.25));
  const back = v.add(mid, v.scale(v.sub(mid, apex), 0.35));
  ctx.moveTo(back.x, back.y);
  ctx.lineTo(ext.x, ext.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!locked) {
    // The marker sits wherever sound can actually image — the geometric apex
    // when it's reachable, else the wall-aware relocated seat.
    const sweet = w2s(pair.sweet, view);
    ctx.strokeStyle = pair.sweetRelocated ? T.ok : T.tri;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(sweet.x, sweet.y, Math.max(7, 0.16 * view.scale), 0, Math.PI * 2);
    ctx.stroke();
    if (pair.sweetRelocated) {
      // Faint thread from the fictional apex to the real seat, so the jump
      // reads as "moved because of the wall", not a glitch.
      ctx.strokeStyle = T.muted;
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(apex.x, apex.y);
      ctx.lineTo(sweet.x, sweet.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    labelPill(
      ctx,
      T,
      'Sweet spot',
      sweet.x,
      sweet.y - Math.max(16, 0.3 * view.scale),
      pair.sweetRelocated ? T.ok : T.muted,
    );
  }
  ctx.restore();
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  T: ThemeColors,
  view: View,
  pos: Vec2,
  label: string,
  rgb: string,
  isSelected: boolean,
  glow: boolean,
  radiusM = 0.13,
  subLabel?: string,
  filled = false,
): void {
  const p = w2s(pos, view);
  const r = Math.max(9, radiusM * view.scale);
  ctx.save();
  if (glow) {
    ctx.shadowColor = `rgba(${rgb}, 0.9)`;
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = filled ? `rgba(${rgb}, 1)` : T.bg;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = isSelected ? T.select : filled ? T.bg : `rgba(${rgb}, 1)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `500 ${FONT}`;
  ctx.fillStyle = filled ? T.bg : `rgba(${rgb}, 1)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, p.x, p.y + 0.5);
  if (subLabel && view.scale >= 28) {
    ctx.font = FONT;
    ctx.fillStyle = T.muted;
    ctx.fillText(subLabel, p.x, p.y + r + 9);
  }
}

function drawNodes(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const { scene, view, selection, audio } = st;
  const glow = st.theme === 'sound';

  const lp = w2s(scene.listener.pos, view);
  ctx.strokeStyle = audio.allLocked ? 'rgba(62, 224, 138, 0.4)' : T.tri;
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(lp.x, lp.y, CAPTURE_RADIUS * view.scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const colors = speakerColors(scene);
  scene.speakers.forEach((sp) => {
    if (selection?.type === 'speaker' && selection.id === sp.id) {
      const solo = audio.solos.find((s) => s.id === sp.id);
      if (solo) {
        const p = w2s(sp.pos, view);
        ctx.strokeStyle = solo.losBlocked ? T.bad : T.tri;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(lp.x, lp.y);
        ctx.stroke();
        ctx.setLineDash([]);
        labelPill(ctx, T, `${solo.dist3d.toFixed(2)} m`, (p.x + lp.x) / 2, (p.y + lp.y) / 2, T.muted);
      }
    }
    drawNode(
      ctx,
      T,
      view,
      sp.pos,
      sp.label,
      colors.get(sp.id) ?? SPEAKER_COLORS[0],
      (selection?.type === 'speaker' && selection.id === sp.id) ||
        (st.selection?.type === 'multi' && st.selection.speakerIds.includes(sp.id)),
      glow,
      sp.model === 'homepod' ? 0.155 : 0.105,
      SPEAKER_MODELS[sp.model].short,
    );
  });

  // Inactive seats: faint labelled ghosts so every listening spot (couch, bed…)
  // stays visible while only the active one is the solid "YOU" puck.
  const activeId = activeListener(scene).id;
  for (const seat of sceneListeners(scene)) {
    if (seat.id === activeId) continue;
    const sp = w2s(seat.pos, view);
    const r = Math.max(7, 0.1 * view.scale);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = `rgba(${T.listener}, 1)`;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    labelPill(ctx, T, seat.name, sp.x, sp.y - r - 9, T.muted);
  }

  drawNode(
    ctx,
    T,
    view,
    scene.listener.pos,
    'YOU',
    audio.allLocked ? '62, 224, 138' : T.listener,
    selection?.type === 'listener',
    glow,
    0.13,
    undefined,
    true,
  );
}

function drawProposal(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const proposal = st.proposal;
  if (!proposal) return;
  const { view } = st;
  ctx.save();
  ctx.setLineDash([4, 4]);
  for (const [ia, ib] of proposal.pairs) {
    const a = proposal.speakers[ia];
    const b = proposal.speakers[ib];
    if (!a || !b) continue;
    const A = w2s(a.pos, view);
    const B = w2s(b.pos, view);
    ctx.strokeStyle = 'rgba(62, 224, 138, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  for (const sp of proposal.speakers) {
    const p = w2s(sp.pos, view);
    const r = Math.max(10, 0.15 * view.scale);
    ctx.strokeStyle = T.ok;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `500 ${FONT}`;
    ctx.fillStyle = T.ok;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sp.label, p.x, p.y + 0.5);
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** Room names ink onto the plan like a real floorplan (or a Roomba map). */
function drawRoomLabels(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const rooms = st.scene.rooms;
  if (!rooms || rooms.length === 0 || st.view.scale < 14) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of rooms) {
    const p = w2s(r.at, st.view);
    // Zone rooms tint their marked area, Roomba-map style.
    if (r.w && r.h) {
      const c0 = w2s({ x: r.at.x - r.w / 2, y: r.at.y - r.h / 2 }, st.view);
      const c1 = w2s({ x: r.at.x + r.w / 2, y: r.at.y - r.h / 2 }, st.view);
      const c2 = w2s({ x: r.at.x + r.w / 2, y: r.at.y + r.h / 2 }, st.view);
      const c3 = w2s({ x: r.at.x - r.w / 2, y: r.at.y + r.h / 2 }, st.view);
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.closePath();
      // Both themes are dark cyanotype now — one cyan zone tint (was a royal-blue
      // fork for the old cream plan, which would read foreign on the dark plan).
      ctx.fillStyle = 'rgba(79, 216, 255, 0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(79, 216, 255, 0.18)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = FONT_MD;
    ctx.fillStyle = T.gridLabel;
    ctx.fillText(r.name.toUpperCase(), p.x, p.y);
  }
  ctx.restore();
}

function drawRuler(ctx: CanvasRenderingContext2D, st: RenderState, T: ThemeColors): void {
  const { view, height } = st;
  const x = 18;
  const y = height - 20;
  ctx.strokeStyle = T.muted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + view.scale, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + view.scale, y - 4);
  ctx.lineTo(x + view.scale, y + 4);
  ctx.stroke();
  ctx.font = FONT;
  ctx.fillStyle = T.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('1 m', x + view.scale + 7, y + 4);
}

export function renderScene(ctx: CanvasRenderingContext2D, st: RenderState): void {
  const { width, height, settings, scene, selection, preview } = st;
  const T = THEMES[st.theme];
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, width, height);

  drawUnderlay(ctx, st);
  drawRoomLabels(ctx, st, T);
  drawGrid(ctx, st, T);

  if (settings.display !== 'off' && T.rays) {
    const colors = speakerColors(scene);
    st.trace.bySpeaker.forEach((s) => {
      const rgb = colors.get(s.id) ?? SPEAKER_COLORS[0];
      if (settings.display === 'waves') drawWaves(ctx, st, s.trace, rgb);
      else drawRays(ctx, st, s.trace, rgb);
    });
  }

  if (settings.showBestSpot) drawBestSpot(ctx, st, T);

  for (const o of scene.objects) {
    drawObject(
      ctx,
      st,
      T,
      o,
      (selection?.type === 'object' && selection.id === o.id) ||
        (selection?.type === 'multi' && selection.objectIds.includes(o.id)),
    );
  }

  if (preview) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.8;
    drawObject(ctx, st, T, preview, true);
    ctx.restore();
  }
  if (st.furnitureProposal) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.75;
    for (const o of st.furnitureProposal) drawObject(ctx, st, T, o, true);
    ctx.restore();
  }
  drawChain(ctx, st, T);

  if (settings.showTriangle) {
    for (const pair of st.audio.pairs) {
      if (!pair.degenerate) drawPairTriangle(ctx, st, T, pair);
    }
  }
  drawProposal(ctx, st, T);
  drawNodes(ctx, st, T);
  drawRuler(ctx, st, T);
}
