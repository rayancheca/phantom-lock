import type {
  CircleObj,
  Layout,
  LayoutStore,
  RectObj,
  Scene,
  SceneObject,
  SimSettings,
  SpeakerModel,
  SpeakerObj,
  Vec2,
  WallObj,
} from './types';
import { closestPointOnSegment, rectCorners } from './geometry';
import { vec } from './vec';
import * as v from './vec';

let idCounter = 0;
export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const ROOM_HEIGHT = 2.7;
export const DEFAULT_SPEAKER_Z = 1.0;
export const LISTENER_PRESETS = [
  { id: 'sitting', label: 'Sitting', z: 1.2 },
  { id: 'standing', label: 'Standing', z: 1.7 },
  { id: 'lying', label: 'Lying down', z: 0.8 },
] as const;

export interface Material {
  id: string;
  label: string;
  absorption: number;
}

export const MATERIALS: Material[] = [
  { id: 'glass', label: 'Glass / TV screen', absorption: 0.04 },
  { id: 'concrete', label: 'Concrete', absorption: 0.05 },
  { id: 'brick', label: 'Brick', absorption: 0.07 },
  { id: 'drywall', label: 'Drywall', absorption: 0.12 },
  { id: 'wood', label: 'Wood / cabinet', absorption: 0.22 },
  { id: 'carpet', label: 'Rug / carpet', absorption: 0.45 },
  { id: 'curtain', label: 'Curtain', absorption: 0.6 },
  { id: 'sofa', label: 'Sofa / upholstery', absorption: 0.7 },
  { id: 'bed', label: 'Bed / mattress', absorption: 0.75 },
  { id: 'panel', label: 'Acoustic panel', absorption: 0.9 },
];

export interface FurniturePreset {
  id: string;
  label: string;
  kind: 'rect' | 'circle';
  w: number; // diameter for circles
  h: number;
  height: number;
  absorption: number;
  role?: 'tv' | 'window' | 'door';
  /** Auto-arrange rule: hug a wall, sit in open space, or skip (openings). */
  place?: 'wall' | 'open' | 'manual';
}

export const FURNITURE_PRESETS: FurniturePreset[] = [
  { id: 'bed', label: 'Bed', kind: 'rect', w: 2.0, h: 1.6, height: 0.55, absorption: 0.75, place: 'wall' },
  { id: 'sofa', label: 'Sofa', kind: 'rect', w: 2.0, h: 0.9, height: 0.8, absorption: 0.7, place: 'wall' },
  { id: 'armchair', label: 'Armchair', kind: 'rect', w: 0.9, h: 0.9, height: 0.8, absorption: 0.7, place: 'open' },
  { id: 'desk', label: 'Desk', kind: 'rect', w: 1.6, h: 0.7, height: 0.75, absorption: 0.22, place: 'wall' },
  { id: 'dining', label: 'Dining table', kind: 'rect', w: 1.6, h: 0.9, height: 0.75, absorption: 0.3, place: 'open' },
  { id: 'round-table', label: 'Round table', kind: 'circle', w: 1.1, h: 1.1, height: 0.75, absorption: 0.3, place: 'open' },
  { id: 'tv', label: 'TV (on stand)', kind: 'rect', w: 1.5, h: 0.35, height: 1.5, absorption: 0.05, role: 'tv', place: 'wall' },
  { id: 'cabinet', label: 'Cabinet', kind: 'rect', w: 1.2, h: 0.45, height: 1.9, absorption: 0.25, place: 'wall' },
  { id: 'wardrobe', label: 'Wardrobe', kind: 'rect', w: 1.5, h: 0.6, height: 2.4, absorption: 0.3, place: 'wall' },
  { id: 'bookshelf', label: 'Bookshelf', kind: 'rect', w: 0.9, h: 0.3, height: 2.0, absorption: 0.4, place: 'wall' },
  { id: 'counter', label: 'Kitchen counter', kind: 'rect', w: 1.8, h: 0.65, height: 0.9, absorption: 0.22, place: 'wall' },
  { id: 'plant', label: 'Plant', kind: 'circle', w: 0.6, h: 0.6, height: 1.5, absorption: 0.5, place: 'open' },
  { id: 'window', label: 'Window', kind: 'rect', w: 1.2, h: 0.12, height: 2.2, absorption: 0.04, role: 'window', place: 'manual' },
  { id: 'door', label: 'Door', kind: 'rect', w: 0.9, h: 0.1, height: 2.05, absorption: 0.25, role: 'door', place: 'manual' },
];

export const DEFAULT_SETTINGS: SimSettings = {
  rayCount: 360,
  maxBounces: 5,
  decay: 0.22,
  display: 'rays',
  showTriangle: true,
  showBestSpot: true,
  snap: true,
  tvAnchor: true,
};

function wall(a: Vec2, b: Vec2, absorption = 0.12, label = 'Wall', height = ROOM_HEIGHT): WallObj {
  return { id: createId('wall'), kind: 'wall', a, b, absorption, label, height };
}

function rect(
  label: string,
  center: Vec2,
  w: number,
  h: number,
  rotationDeg: number,
  absorption: number,
  height: number,
  role: RectObj['role'] = 'furniture',
): RectObj {
  return {
    id: createId('rect'),
    kind: 'rect',
    center,
    w,
    h,
    rotation: deg(rotationDeg),
    absorption,
    label,
    role,
    height,
  };
}

function circle(label: string, center: Vec2, r: number, absorption: number, height: number): CircleObj {
  return { id: createId('circle'), kind: 'circle', center, r, absorption, label, height };
}

/**
 * Maple Court apartment (~52 m²), digitized from the floorplan.
 * Metres; x → right, y → down. Ships with no speakers — add them one by one
 * or use "Suggest placement".
 */
export function apartmentScene(): Scene {
  // Outer boundary, clockwise.
  const outline: Vec2[] = [
    vec(0.0, 2.16), // top-left step
    vec(0.57, 1.49), // top-left corner
    vec(4.28, 0.72), // top wall (~4.0 m)
    vec(4.59, 0.05), // 0.73 m notch at top-right
    vec(5.85, 5.57), // right wall (5.6 m, sloping)
    vec(6.65, 6.08), // step toward bathroom
    vec(7.27, 8.92), // bathroom outer wall (~2.8 m)
    vec(5.77, 9.18), // bathroom bottom (~1.58 m)
    vec(5.05, 9.95), // entry nook
    vec(2.68, 10.77), // bottom wall
    vec(0.57, 10.41), // kitchen bottom (~2.2 m)
    vec(0.0, 10.0), // kitchen step back to left wall
  ];

  const walls: WallObj[] = [];
  for (let i = 0; i < outline.length; i++) {
    walls.push(wall(outline[i], outline[(i + 1) % outline.length]));
  }
  // The closing edge (0,10) → (0,2.16) is the 7.84 m left wall.

  const interior: WallObj[] = [
    wall(vec(2.42, 3.35), vec(3.4, 6.86), 0.12, 'Partition'),
    wall(vec(5.6, 6.42), vec(5.86, 9.16), 0.12, 'Bathroom wall'),
    wall(vec(5.6, 6.42), vec(6.65, 6.08), 0.12, 'Bathroom wall'),
  ];

  const furniture: SceneObject[] = [
    rect('TV', vec(1.3, 3.05), 1.5, 0.35, -50, 0.05, 1.5, 'tv'),
    rect('Desk', vec(3.2, 1.3), 1.8, 0.6, -12, 0.22, 0.75),
    rect('Bed', vec(4.6, 4.6), 2.0, 1.55, -13, 0.75, 0.55),
    rect('Couch', vec(1.95, 5.35), 0.85, 2.1, -15, 0.7, 0.8),
    rect('Couch 2', vec(1.75, 7.25), 1.9, 0.85, -6, 0.7, 0.8),
    rect('Closets', vec(4.6, 7.75), 1.3, 2.3, -10, 0.35, 2.4),
    rect('Counter', vec(0.33, 8.85), 0.65, 2.4, 0, 0.22, 0.9),
    rect('Counter', vec(1.7, 10.25), 2.1, 0.62, -10, 0.22, 0.9),
    circle('Table', vec(1.05, 5.85), 0.55, 0.3, 0.75),
  ];

  return {
    objects: [...walls, ...interior, ...furniture],
    speakers: [],
    pairs: [],
    listener: { pos: vec(2.3, 3.9), z: 1.2 },
  };
}

export function blankScene(): Scene {
  return {
    objects: [],
    speakers: [],
    pairs: [],
    listener: { pos: vec(2.5, 2.5), z: 1.2 },
  };
}

export function nextSpeakerLabel(scene: Scene): string {
  const used = new Set(scene.speakers.map((s) => s.label));
  for (let i = 0; i < 26; i++) {
    const label = String.fromCharCode(65 + i);
    if (!used.has(label)) return label;
  }
  return `S${scene.speakers.length + 1}`;
}

export function makeSpeaker(pos: Vec2, scene: Scene, model: SpeakerModel = 'homepod'): SpeakerObj {
  return {
    id: createId('spk'),
    pos,
    z: DEFAULT_SPEAKER_Z,
    label: nextSpeakerLabel(scene),
    model,
    trimDb: 0,
  };
}

/** Four walls of a w×d rectangle at the origin. */
export function rectRoomWalls(w: number, d: number): WallObj[] {
  const outline: Vec2[] = [vec(0, 0), vec(w, 0), vec(w, d), vec(0, d)];
  return outline.map((a, i) => wall(a, outline[(i + 1) % outline.length]));
}

/** Empty rectangular room — the usual floor-planner starting point. */
export function rectRoomScene(w: number, d: number): Scene {
  return {
    objects: rectRoomWalls(w, d),
    speakers: [],
    pairs: [],
    listener: { pos: vec(w / 2, d / 2), z: 1.2 },
  };
}

/**
 * Break a wall into two at a point (projected onto the wall; defaults to the
 * midpoint). Both halves keep the original material and height.
 */
export function splitWallAt(wall: WallObj, at?: Vec2): [WallObj, WallObj] {
  const cut = at
    ? closestPointOnSegment(at, wall.a, wall.b).point
    : v.lerp(wall.a, wall.b, 0.5);
  const first: WallObj = { ...wall, id: createId('wall'), b: cut };
  const second: WallObj = { ...wall, id: createId('wall'), a: cut };
  return [first, second];
}

export function sceneBounds(scene: Scene): { min: Vec2; max: Vec2 } {
  const pts: Vec2[] = [scene.listener.pos, ...scene.speakers.map((s) => s.pos)];
  for (const o of scene.objects) {
    if (o.kind === 'wall') pts.push(o.a, o.b);
    else if (o.kind === 'rect') pts.push(...rectCorners(o));
    else pts.push(vec(o.center.x - o.r, o.center.y - o.r), vec(o.center.x + o.r, o.center.y + o.r));
  }
  const min = vec(Infinity, Infinity);
  const max = vec(-Infinity, -Infinity);
  for (const p of pts) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  if (!Number.isFinite(min.x)) return { min: vec(0, 0), max: vec(8, 8) };
  if (max.x - min.x < 2) {
    min.x -= 1;
    max.x += 1;
  }
  if (max.y - min.y < 2) {
    min.y -= 1;
    max.y += 1;
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Persistence — validate everything that crosses the JSON boundary.

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isVec = (p: unknown): p is Vec2 =>
  typeof p === 'object' && p !== null && isNum((p as Vec2).x) && isNum((p as Vec2).y);

const clampH = (h: unknown, fallback: number): number =>
  isNum(h) ? Math.max(0.02, Math.min(6, h)) : fallback;

function sanitizeObject(raw: unknown, seenIds: Set<string>): SceneObject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const absorption = isNum(o.absorption) ? Math.max(0, Math.min(1, o.absorption)) : 0.2;
  const label = typeof o.label === 'string' ? o.label.slice(0, 40) : 'Object';
  let id = typeof o.id === 'string' ? o.id : createId('obj');
  if (seenIds.has(id)) id = createId('obj');
  seenIds.add(id);
  if (o.kind === 'wall' && isVec(o.a) && isVec(o.b)) {
    return { id, kind: 'wall', a: o.a, b: o.b, absorption, label, height: clampH(o.height, ROOM_HEIGHT) };
  }
  if (o.kind === 'rect' && isVec(o.center) && isNum(o.w) && isNum(o.h) && isNum(o.rotation)) {
    return {
      id,
      kind: 'rect',
      center: o.center,
      w: Math.max(0.05, o.w),
      h: Math.max(0.05, o.h),
      rotation: o.rotation,
      absorption,
      label,
      role:
        o.role === 'tv' ? 'tv' : o.role === 'window' ? 'window' : o.role === 'door' ? 'door' : 'furniture',
      doorOpen: o.role === 'door' ? o.doorOpen !== false : undefined,
      height: clampH(o.height, 0.9),
    };
  }
  if (o.kind === 'circle' && isVec(o.center) && isNum(o.r)) {
    return {
      id,
      kind: 'circle',
      center: o.center,
      r: Math.max(0.05, o.r),
      absorption,
      label,
      height: clampH(o.height, 0.75),
    };
  }
  return null;
}

export function sanitizeScene(raw: unknown): Scene | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.objects)) return null;

  const seenIds = new Set<string>();
  const objects = s.objects
    .map((o) => sanitizeObject(o, seenIds))
    .filter((o): o is SceneObject => o !== null);

  // Listener: v2 shape {pos, z} with a v1 fallback ({x, y} directly).
  let listener = { pos: vec(2, 2), z: 1.2 };
  const rawListener = s.listener as Record<string, unknown> | undefined;
  if (rawListener && isVec(rawListener.pos)) {
    listener = { pos: rawListener.pos, z: clampH(rawListener.z, 1.2) };
  } else if (isVec(s.listener)) {
    listener = { pos: s.listener as Vec2, z: 1.2 };
  }

  // Speakers: v2 array, with a v1 fallback ({L, R} object → pair).
  const speakers: SpeakerObj[] = [];
  let pairs: Array<[string, string]> = [];
  if (Array.isArray(s.speakers)) {
    for (const raw2 of s.speakers) {
      const sp = raw2 as Record<string, unknown>;
      if (!isVec(sp.pos)) continue;
      let id = typeof sp.id === 'string' ? sp.id : createId('spk');
      if (seenIds.has(id)) id = createId('spk');
      seenIds.add(id);
      speakers.push({
        id,
        pos: sp.pos,
        z: clampH(sp.z, DEFAULT_SPEAKER_Z),
        label: typeof sp.label === 'string' ? sp.label.slice(0, 8) : `S${speakers.length + 1}`,
        model: sp.model === 'homepod-mini' ? 'homepod-mini' : 'homepod',
        trimDb: isNum(sp.trimDb) ? Math.max(-24, Math.min(12, sp.trimDb)) : 0,
      });
    }
    if (Array.isArray(s.pairs)) {
      const ids = new Set(speakers.map((x) => x.id));
      const used = new Set<string>();
      for (const p of s.pairs) {
        if (!Array.isArray(p) || p.length !== 2) continue;
        const [a, b] = p as [string, string];
        if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
        if (!ids.has(a) || !ids.has(b) || used.has(a) || used.has(b)) continue;
        used.add(a);
        used.add(b);
        pairs.push([a, b]);
      }
    }
  } else if (typeof s.speakers === 'object' && s.speakers !== null) {
    const sp = s.speakers as Record<string, unknown>;
    if (isVec(sp.L) && isVec(sp.R)) {
      const l: SpeakerObj = { id: createId('spk'), pos: sp.L, z: DEFAULT_SPEAKER_Z, label: 'L', model: 'homepod', trimDb: 0 };
      const r: SpeakerObj = { id: createId('spk'), pos: sp.R, z: DEFAULT_SPEAKER_Z, label: 'R', model: 'homepod', trimDb: 0 };
      speakers.push(l, r);
      pairs = [[l.id, r.id]];
    }
  }

  // Optional floorplan tracing underlay. Since images now live as Blobs in
  // IndexedDB (not inline in a ~5 MB localStorage blob), this cap is only a sanity
  // bound against absurd inputs, not a storage limit — hence generous (~12 MB).
  let underlay: Scene['underlay'] = null;
  const u = s.underlay as Record<string, unknown> | null | undefined;
  if (
    u &&
    typeof u.src === 'string' &&
    u.src.startsWith('data:image/') &&
    u.src.length < 16_000_000 &&
    isNum(u.wPx) &&
    isNum(u.hPx) &&
    isVec(u.center) &&
    isNum(u.scale)
  ) {
    underlay = {
      src: u.src,
      wPx: Math.max(1, u.wPx),
      hPx: Math.max(1, u.hPx),
      center: u.center,
      scale: Math.max(0.0005, Math.min(1, u.scale)),
      rotation: isNum(u.rotation) ? u.rotation : 0,
      opacity: isNum(u.opacity) ? Math.max(0.05, Math.min(1, u.opacity)) : 0.5,
    };
  }

  // Room name labels survive import/reload; anything malformed is dropped.
  const rawRooms = (s as { rooms?: unknown }).rooms;
  const rooms = Array.isArray(rawRooms)
    ? rawRooms.flatMap((r) => {
        const rr = r as { id?: unknown; name?: unknown; at?: { x?: unknown; y?: unknown } };
        const rw = (r as { w?: unknown }).w;
        const rh = (r as { h?: unknown }).h;
        return typeof rr.name === 'string' && isNum(rr.at?.x) && isNum(rr.at?.y)
          ? [{
              id: typeof rr.id === 'string' ? rr.id : createId('room'),
              name: rr.name.slice(0, 32),
              at: { x: rr.at.x, y: rr.at.y },
              ...(isNum(rw) && isNum(rh) && rw > 0.2 && rh > 0.2 ? { w: rw, h: rh } : {}),
            }]
          : [];
      })
    : [];
  return { objects, speakers, pairs, listener, underlay, rooms };
}

/** Append a named rectangular room shell flush with the current bounds. */
export function addRoomShell(scene: Scene, name: string, w: number, d: number): Scene {
  const hasAny = scene.objects.some((o) => o.kind === 'wall');
  const b = hasAny ? sceneBounds(scene) : { min: vec(0, 0), max: vec(0, 0) };
  const ox = hasAny ? b.max.x : 0;
  const oy = hasAny ? b.min.y : 0;
  const walls = rectRoomWalls(w, d).map((wl) =>
    wl.kind === 'wall'
      ? { ...wl, a: { x: wl.a.x + ox, y: wl.a.y + oy }, b: { x: wl.b.x + ox, y: wl.b.y + oy } }
      : wl,
  );
  const room = { id: createId('room'), name, at: { x: ox + w / 2, y: oy + d / 2 } };
  return {
    ...scene,
    objects: [...scene.objects, ...walls],
    rooms: [...(scene.rooms ?? []), ...(name.trim() ? [room] : [])],
    listener: hasAny ? scene.listener : { ...scene.listener, pos: { x: w / 2, y: d / 2 } },
  };
}

export function sanitizeSettings(raw: unknown): SimSettings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (!isNum(s.rayCount) || !isNum(s.maxBounces)) return null;
  return {
    rayCount: Math.max(360, Math.min(1440, Math.round(s.rayCount))),
    maxBounces: Math.max(1, Math.min(10, Math.round(s.maxBounces))),
    decay: isNum(s.decay) ? Math.max(0.05, Math.min(0.6, s.decay)) : DEFAULT_SETTINGS.decay,
    display:
      s.display === 'waves' || s.display === 'off'
        ? s.display
        : s.showRays === false || s.showL === false
          ? 'off'
          : 'rays',
    showTriangle: s.showTriangle !== false,
    showBestSpot: s.showBestSpot !== false,
    snap: s.snap !== false,
    tvAnchor: s.tvAnchor !== false,
  };
}

// ---------------------------------------------------------------------------
// Layout store.

export const STORAGE_KEY = 'phantom-lock:v2';
const LEGACY_KEY = 'phantom-lock:v1';

export function makeLayout(name: string, scene: Scene, settings = DEFAULT_SETTINGS): Layout {
  return { id: createId('layout'), name, scene, settings, updatedAt: Date.now() };
}

export function defaultStore(): LayoutStore {
  const home = makeLayout('Maple Court', apartmentScene());
  return { layouts: [home], activeId: home.id };
}

export function sanitizeLayout(raw: unknown): Layout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const l = raw as Record<string, unknown>;
  const scene = sanitizeScene(l.scene);
  if (!scene) return null;
  return {
    id: typeof l.id === 'string' ? l.id : createId('layout'),
    name: typeof l.name === 'string' && l.name.trim() ? l.name.slice(0, 48) : 'Layout',
    scene,
    settings: sanitizeSettings(l.settings) ?? DEFAULT_SETTINGS,
    updatedAt: isNum(l.updatedAt) ? l.updatedAt : Date.now(),
  };
}

/** Load the layout store, migrating a v1 single-scene save if present. */
export function loadStore(storage: Pick<Storage, 'getItem'>): LayoutStore {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed.layouts)) {
        const layouts = parsed.layouts
          .map(sanitizeLayout)
          .filter((l): l is Layout => l !== null);
        if (layouts.length > 0) {
          const activeId =
            typeof parsed.activeId === 'string' && layouts.some((l) => l.id === parsed.activeId)
              ? parsed.activeId
              : layouts[0].id;
          return { layouts, activeId };
        }
      }
    }
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, unknown>;
      const scene = sanitizeScene(parsed.scene);
      if (scene) {
        const migrated = makeLayout(
          'My layout (imported)',
          scene,
          sanitizeSettings(parsed.settings) ?? DEFAULT_SETTINGS,
        );
        const home = makeLayout('Maple Court', apartmentScene());
        return { layouts: [home, migrated], activeId: home.id };
      }
    }
  } catch {
    // Corrupt storage — fall through to defaults.
  }
  return defaultStore();
}
