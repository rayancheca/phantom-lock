/**
 * A pure, deterministic floorplan RASTERISER — the measurement backbone for
 * `detect.ts`.
 *
 * Why this exists: "did the detector get better?" is unanswerable without
 * ground truth, and ground truth is only exact when the image was *drawn* from
 * a description rather than scanned. So the corpus is CODE: every fixture
 * declares its wall centrelines, and the rasteriser both paints them and hands
 * back the very segments it painted. `detect-score.ts` then scores a detection
 * against those.
 *
 * Constraints that shaped it:
 *  - pure TS, node, no canvas, no deps — the same rule the rest of the engine
 *    lives under, and the reason any of this is provable in the suite at all;
 *  - DETERMINISTIC to the bit. Randomness is a seeded `mulberry32`, never
 *    `Math.random`, so a fixture rendered on CI is byte-identical to one
 *    rendered here. (S18's lesson about wall-clock assertions has a twin: a
 *    corpus that is not reproducible cannot support a ratchet.)
 *  - the photo-realism knobs (blur / noise / lighting / rotation) are applied
 *    to the DRAWING COORDINATES and the ground truth together, so rotating a
 *    fixture never desynchronises the answer from the question.
 */

import type { GrayImage, PxSegment } from '../../detect';
import type { Vec2 } from '../../types';

// ---------------------------------------------------------------------------
// deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — 32 bits of state, uniform in [0,1), identical on every engine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// the declarative plan
// ---------------------------------------------------------------------------

export interface WallSpec {
  a: Vec2;
  b: Vec2;
  /** Stroke thickness in px. Falls back to the plan's `strokeWidth`. */
  thickness?: number;
  /**
   * Draw as two parallel lines with a hollow core, the way architectural plans
   * render a cavity wall. This is the single biggest source of the duplicate
   * detections the owner hit, so it has to be reproducible on demand.
   */
  hollow?: boolean;
  /** Exclude from ground truth — for deliberately-unwanted ink (see `decoy`). */
  decoy?: boolean;
}

export interface BlobSpec {
  kind: 'rect' | 'circle';
  x: number;
  y: number;
  w: number;
  /** Ignored for circles (w is the diameter). */
  h: number;
  /** Degrees. */
  rotation?: number;
  /** Outline only, rather than a solid fill. */
  outline?: number;
}

export interface ArcSpec {
  x: number;
  y: number;
  r: number;
  /** Degrees. */
  from: number;
  to: number;
  thickness?: number;
}

/** A run of short marks — stands in for dimension text and room labels. */
export interface SpeckleSpec {
  x: number;
  y: number;
  len: number;
  vertical?: boolean;
  /** Mark height in px. */
  size?: number;
}

/** Diagonal hatching, as used to fill a wall section or a tiled floor. */
export interface HatchSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Spacing between hatch lines, px. */
  pitch?: number;
  /** Degrees. */
  angle?: number;
}

export interface PhotoSpec {
  /** Box-blur radius in px (applied twice — a cheap gaussian). */
  blur?: number;
  /** Gaussian noise sigma, in luminance units. */
  noise?: number;
  /** Uneven lighting: peak luminance swing across the page. */
  gradient?: number;
  /** <1 flattens the page toward mid grey. */
  contrast?: number;
  /** Whole-plan rotation, degrees. */
  rotate?: number;
  /** Horizontal shear, as dy/dx — a phone held off-square. */
  skew?: number;
}

export interface PlanSpec {
  name: string;
  width: number;
  height: number;
  /** Page luminance, 0-255. */
  paper?: number;
  /** Stroke luminance, 0-255. */
  ink?: number;
  /** Default wall thickness, px. */
  strokeWidth?: number;
  walls: WallSpec[];
  blobs?: BlobSpec[];
  arcs?: ArcSpec[];
  speckles?: SpeckleSpec[];
  hatches?: HatchSpec[];
  photo?: PhotoSpec;
  /** Inverts the page — a white-on-dark blueprint. */
  blueprint?: boolean;
  seed?: number;
}

export interface Fixture {
  name: string;
  img: GrayImage;
  /** The wall centrelines actually painted, in the image's pixel space. */
  truth: PxSegment[];
  /** The stroke width the plan was drawn with, px — tolerance scales off it. */
  strokeWidth: number;
}

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

const DEFAULT_PAPER = 246;
const DEFAULT_INK = 26;
const DEFAULT_STROKE = 3;

/** A single-channel luminance page; RGBA is expanded once at the end. */
interface Page {
  lum: Float32Array;
  width: number;
  height: number;
}

function page(width: number, height: number, paper: number): Page {
  return { lum: new Float32Array(width * height).fill(paper), width, height };
}

/** Alpha-composite `ink` over the page at coverage `cov` in [0,1]. */
function blend(p: Page, x: number, y: number, cov: number, ink: number): void {
  if (cov <= 0) return;
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= p.width || yi >= p.height) return;
  const i = yi * p.width + xi;
  const c = cov > 1 ? 1 : cov;
  p.lum[i] = p.lum[i] * (1 - c) + ink * c;
}

/** Squared distance from p to segment ab, plus the clamped parameter. */
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
}

/**
 * Anti-aliased thick line. Coverage ramps over one pixel either side of the
 * half-width, which is what a real plan (vector-rendered then downscaled)
 * actually looks like — a hard 1-bit brush produces staircase edges that
 * flatter a thinning algorithm unfairly.
 */
export function strokeLine(
  p: Page,
  a: Vec2,
  b: Vec2,
  thickness: number,
  ink: number,
): void {
  const half = Math.max(thickness, 0.5) / 2;
  const pad = Math.ceil(half + 1);
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad));
  const x1 = Math.min(p.width - 1, Math.ceil(Math.max(a.x, b.x) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad));
  const y1 = Math.min(p.height - 1, Math.ceil(Math.max(a.y, b.y) + pad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = distToSeg(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y);
      blend(p, x, y, half + 0.5 - d, ink);
    }
  }
}

function fillRect(p: Page, cx: number, cy: number, w: number, h: number, rotDeg: number, ink: number, outline?: number): void {
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const corner = (sx: number, sy: number): Vec2 => ({
    x: cx + ((sx * w) / 2) * cos - ((sy * h) / 2) * sin,
    y: cy + ((sx * w) / 2) * sin + ((sy * h) / 2) * cos,
  });
  const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  if (outline) {
    for (let i = 0; i < 4; i++) strokeLine(p, pts[i], pts[(i + 1) % 4], outline, ink);
    return;
  }
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(p.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(p.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Rotate the sample back into the rect's own frame.
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const covX = Math.min(1, w / 2 + 0.5 - Math.abs(lx));
      const covY = Math.min(1, h / 2 + 0.5 - Math.abs(ly));
      blend(p, x, y, Math.min(covX, covY), ink);
    }
  }
}

function fillCircle(p: Page, cx: number, cy: number, r: number, ink: number, outline?: number): void {
  if (outline) {
    const steps = Math.max(16, Math.ceil(r * 4));
    let prev: Vec2 = { x: cx + r, y: cy };
    for (let s = 1; s <= steps; s++) {
      const t = (s / steps) * Math.PI * 2;
      const q = { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
      strokeLine(p, prev, q, outline, ink);
      prev = q;
    }
    return;
  }
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(p.width - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(p.height - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      blend(p, x, y, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy), ink);
    }
  }
}

function strokeArc(p: Page, s: ArcSpec, thickness: number, ink: number): void {
  const from = (s.from * Math.PI) / 180;
  const to = (s.to * Math.PI) / 180;
  const steps = Math.max(8, Math.ceil(Math.abs(to - from) * s.r));
  let prev: Vec2 = { x: s.x + s.r * Math.cos(from), y: s.y + s.r * Math.sin(from) };
  for (let i = 1; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    const q = { x: s.x + s.r * Math.cos(t), y: s.y + s.r * Math.sin(t) };
    strokeLine(p, prev, q, thickness, ink);
    prev = q;
  }
}

function drawSpeckle(p: Page, s: SpeckleSpec, ink: number, rand: () => number): void {
  const size = s.size ?? 4;
  const step = size * 1.6;
  const n = Math.max(1, Math.floor(s.len / step));
  for (let i = 0; i < n; i++) {
    // A glyph-ish mark: a short stroke with a random lean, so text never
    // accidentally reads as a clean collinear run.
    const along = i * step + rand() * size * 0.3;
    const ox = s.vertical ? 0 : along;
    const oy = s.vertical ? along : 0;
    const lean = (rand() - 0.5) * size * 0.8;
    strokeLine(
      p,
      { x: s.x + ox, y: s.y + oy },
      { x: s.x + ox + (s.vertical ? size * 0.7 : lean), y: s.y + oy + (s.vertical ? lean : size * 0.7) },
      1.2,
      ink,
    );
  }
}

function drawHatch(p: Page, h: HatchSpec, ink: number): void {
  const pitch = h.pitch ?? 6;
  const angle = ((h.angle ?? 45) * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const diag = Math.hypot(h.w, h.h);
  const n = Math.ceil((2 * diag) / pitch);
  for (let i = -n; i <= n; i++) {
    const ox = h.x + h.w / 2 - dy * i * pitch;
    const oy = h.y + h.h / 2 + dx * i * pitch;
    // Clip by walking the line and only blending inside the box.
    for (let t = -diag; t <= diag; t += 0.5) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      if (x < h.x || y < h.y || x > h.x + h.w || y > h.y + h.h) continue;
      blend(p, x, y, 0.9, ink);
    }
  }
}

// ---------------------------------------------------------------------------
// photo realism
// ---------------------------------------------------------------------------

function boxBlur(p: Page, radius: number): void {
  if (radius <= 0) return;
  const { width: w, height: h } = p;
  const tmp = new Float32Array(w * h);
  const r = Math.round(radius);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        sum += p.lum[y * w + xx];
        n++;
      }
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[yy * w + x];
        n++;
      }
      p.lum[y * w + x] = sum / n;
    }
  }
}

/** Box–Muller, driven by the seeded PRNG so noise is reproducible. */
function gaussian(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function applyPhoto(p: Page, photo: PhotoSpec, rand: () => number): void {
  boxBlur(p, photo.blur ?? 0);
  boxBlur(p, (photo.blur ?? 0) > 0 ? (photo.blur ?? 0) : 0);
  const { width: w, height: h } = p;
  const grad = photo.gradient ?? 0;
  const contrast = photo.contrast ?? 1;
  const noise = photo.noise ?? 0;
  if (grad === 0 && contrast === 1 && noise === 0) return;
  // A single diagonal lighting ramp — a phone photo lit from one side.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = p.lum[i];
      if (contrast !== 1) v = 128 + (v - 128) * contrast;
      if (grad !== 0) v += grad * ((x / w) * 0.6 + (y / h) * 0.4 - 0.5);
      if (noise !== 0) v += gaussian(rand) * noise;
      p.lum[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}

// ---------------------------------------------------------------------------
// the entry point
// ---------------------------------------------------------------------------

/** Rotate + shear a point about the page centre — the "phone held off-square". */
function warp(q: Vec2, spec: PlanSpec): Vec2 {
  const photo = spec.photo;
  if (!photo || ((photo.rotate ?? 0) === 0 && (photo.skew ?? 0) === 0)) return q;
  const cx = spec.width / 2;
  const cy = spec.height / 2;
  const r = ((photo.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = q.x - cx;
  const dy = q.y - cy;
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return { x: cx + rx + ry * (photo.skew ?? 0), y: cy + ry };
}

/**
 * Redraw a plan at `k` times its size — a phone photo of the same drawing.
 *
 * Every corpus fixture rasterises at 700x520 or 900x700, i.e. at or under
 * `detect.ts`'s `WORK_MAX = 900`. So `detectWallsFromUnderlay`'s downscale is a
 * NO-OP on all of them and the corpus has never exercised it, by construction
 * rather than by oversight. A real user's photo is 2-4k px and is downscaled
 * twice before the pipeline sees it, which is precisely where S25 measured a
 * P0 that the product could not produce.
 *
 * Every length the SPEC can express scales together — coordinates, wall and
 * outline thicknesses, blob sizes, arc radii, glyph sizes, hatch pitch, blur.
 *
 * Two annotation stroke widths do NOT, because no spec field exists for them:
 * `drawSpeckle` draws every glyph mark at a hardcoded 1.2 px, and `rasterize`
 * defaults `ArcSpec.thickness` to 1.4. So a scaled-up fixture carries annotation
 * that is relatively THINNER than the original — measured, `oblique-survey`
 * through the 2.5x chain reads 14 walls / structure 0.393 / score 77.8 %, where
 * carrying the annotation widths up too gives 21 / 0.310 / 63.6 % (native
 * 13 / 0.346 / 74.7 %). The resolution tests are therefore a slightly EASIER
 * drawing than the fixture they name; their floors are set with that in mind.
 */
export function scalePlan(spec: PlanSpec, k: number): PlanSpec {
  const s = (v: number | undefined) => (v === undefined ? undefined : v * k);
  return {
    ...spec,
    width: Math.round(spec.width * k),
    height: Math.round(spec.height * k),
    strokeWidth: s(spec.strokeWidth),
    walls: spec.walls.map((w) => ({
      ...w,
      a: { x: w.a.x * k, y: w.a.y * k },
      b: { x: w.b.x * k, y: w.b.y * k },
      thickness: s(w.thickness),
    })),
    blobs: spec.blobs?.map((b) => ({
      ...b,
      x: b.x * k,
      y: b.y * k,
      w: b.w * k,
      h: b.h * k,
      outline: s(b.outline),
    })),
    arcs: spec.arcs?.map((a) => ({ ...a, x: a.x * k, y: a.y * k, r: a.r * k, thickness: s(a.thickness) })),
    speckles: spec.speckles?.map((p) => ({ ...p, x: p.x * k, y: p.y * k, len: p.len * k, size: s(p.size) })),
    hatches: spec.hatches?.map((h) => ({
      ...h,
      x: h.x * k,
      y: h.y * k,
      w: h.w * k,
      h: h.h * k,
      pitch: s(h.pitch),
    })),
    photo: spec.photo ? { ...spec.photo, blur: s(spec.photo.blur) } : spec.photo,
  };
}

/**
 * Area-average downscale to a maximum dimension — the honest node stand-in for
 * the `ctx.drawImage` the app runs in `buildUnderlay` and again in
 * `detectWallsFromUnderlay`.
 *
 * It is NOT bit-identical to Skia, and it must not pretend to be: what it
 * exercises is the RESOLUTION regime, which is what no fixture reached before.
 * Any claim about a specific pixel value still has to come from a browser.
 */
export function downscale(img: GrayImage, maxDim: number): GrayImage {
  const k = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (k >= 1) return img;
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const d = (y * w + x) * 4;
      out[d] = r / n;
      out[d + 1] = g / n;
      out[d + 2] = b / n;
      out[d + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Paint a plan and return it together with the wall centrelines that were
 * painted. `truth` is the ANSWER KEY: everything `detect-score.ts` measures is
 * measured against it, so it must contain exactly the segments a human would
 * call walls — no more (furniture, arcs, text and `decoy` strokes are excluded)
 * and no less.
 */
export function rasterize(spec: PlanSpec): Fixture {
  const paper = spec.paper ?? DEFAULT_PAPER;
  const ink = spec.ink ?? DEFAULT_INK;
  const stroke = spec.strokeWidth ?? DEFAULT_STROKE;
  const rand = rng(spec.seed ?? 1);
  const p = page(spec.width, spec.height, paper);

  for (const wl of spec.walls) {
    const a = warp(wl.a, spec);
    const b = warp(wl.b, spec);
    const t = wl.thickness ?? stroke;
    if (wl.hollow) {
      // Two faces with an empty cavity — the classic cause of double detections.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const off = t / 2;
      const face = Math.max(1, t * 0.28);
      for (const s of [-1, 1]) {
        strokeLine(
          p,
          { x: a.x + nx * off * s, y: a.y + ny * off * s },
          { x: b.x + nx * off * s, y: b.y + ny * off * s },
          face,
          ink,
        );
      }
    } else {
      strokeLine(p, a, b, t, ink);
    }
  }

  for (const b of spec.blobs ?? []) {
    const c = warp({ x: b.x, y: b.y }, spec);
    const rot = (b.rotation ?? 0) + (spec.photo?.rotate ?? 0);
    if (b.kind === 'circle') fillCircle(p, c.x, c.y, b.w / 2, ink, b.outline);
    else fillRect(p, c.x, c.y, b.w, b.h, rot, ink, b.outline);
  }

  for (const a of spec.arcs ?? []) {
    const c = warp({ x: a.x, y: a.y }, spec);
    strokeArc(p, { ...a, x: c.x, y: c.y }, a.thickness ?? 1.4, ink);
  }

  for (const s of spec.speckles ?? []) {
    const c = warp({ x: s.x, y: s.y }, spec);
    drawSpeckle(p, { ...s, x: c.x, y: c.y }, ink, rand);
  }

  for (const h of spec.hatches ?? []) drawHatch(p, h, ink);

  if (spec.photo) applyPhoto(p, spec.photo, rand);

  const data = new Uint8ClampedArray(spec.width * spec.height * 4);
  for (let i = 0; i < spec.width * spec.height; i++) {
    const v = spec.blueprint ? 255 - p.lum[i] : p.lum[i];
    const j = i * 4;
    data[j] = data[j + 1] = data[j + 2] = v;
    data[j + 3] = 255;
  }

  return {
    name: spec.name,
    img: { data, width: spec.width, height: spec.height },
    truth: spec.walls.filter((wl) => !wl.decoy).map((wl) => ({ a: warp(wl.a, spec), b: warp(wl.b, spec) })),
    strokeWidth: stroke,
  };
}
