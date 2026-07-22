import type {
  CircleObj,
  Layout,
  LayoutStore,
  ListenerState,
  NamedListener,
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
export const DEFAULT_LISTENER_Z = 1.2;
export const DEFAULT_LISTENER_NAME = 'Listening spot';
/** Upper bound on named seats a single scene may carry (bounds import blow-up). */
export const MAX_LISTENERS = 32;

/**
 * Ceiling on the search region `sceneBounds` will hand back (metres).
 *
 * Every grid loop in the engine — `bestspot.ts:150`, `pairspot.ts:141`,
 * `arrange.ts:167` — walks `for (x = min.x; x <= max.x; x += step)` with a step
 * floored at 0.25. Past |x| ≈ 2^51 that addition is a no-op in IEEE-754 and the
 * loop never advances: a measured 354-byte payload (one circle, `r: 1e308`) ran
 * 3 000 000 grid-cell bodies without the loop variable moving, then died with
 * "heap out of memory" at 4 094 MB — and, because the layout persists, it
 * re-crashed on every reload.
 *
 * This bound is deliberately applied to the RETURNED BOX ONLY, never to stored
 * coordinates. Clamping the scene itself would silently flatten a legitimate
 * layout the app's own "Add a room…" produced (measured: 42 appended 6 m rooms,
 * or 11 at the UI's 25 m maximum, collapse 75 walls onto one line) and autosave
 * would then overwrite the good data ~400 ms later. A clipped search region is
 * recoverable; mangled geometry is not.
 *
 * 20 km is ~66× the largest scene anyone can practically work in (a 50-room
 * house spans 300 m and already costs ~11 s per edit), so no real layout is
 * affected. It guarantees termination; it does NOT by itself bound worst-case
 * CPU — see `docs/security.md`.
 */
export const MAX_SCENE_SPAN = 20_000;

/** Fresh copy of a position — the mirror must never alias a seat's Vec2. */
function cloneVec(p: Vec2): Vec2 {
  return { x: p.x, y: p.y };
}
export const LISTENER_PRESETS = [
  { id: 'sitting', label: 'Sitting', z: 1.2 },
  { id: 'standing', label: 'Standing', z: 1.7 },
  { id: 'lying', label: 'Lying down', z: 0.8 },
] as const;

// ---------------------------------------------------------------------------
// Named listening positions (seats). The source of truth is `scene.listeners`
// + `scene.activeListenerId`; `scene.listener` is a mirror always kept equal to
// the active seat so every engine/UI read-site works unchanged. All writes go
// through the helpers below, and `sanitizeScene` re-derives the mirror on every
// load, so on-disk drift self-heals.

function makeNamedListener(pos: Vec2, z: number, name: string, id?: string): NamedListener {
  return { id: id ?? createId('seat'), name, pos, z };
}

/** The scene's seats — guaranteed non-empty. Real scenes always carry
 *  `listeners`; for a hand-built scene that only set the mirror, synthesize one. */
export function sceneListeners(scene: Scene): NamedListener[] {
  if (scene.listeners && scene.listeners.length > 0) return scene.listeners;
  return [makeNamedListener(scene.listener.pos, scene.listener.z, DEFAULT_LISTENER_NAME, 'seat-active')];
}

/** The active seat (the one `scene.listener` mirrors). */
export function activeListener(scene: Scene): NamedListener {
  const seats = sceneListeners(scene);
  return seats.find((l) => l.id === scene.activeListenerId) ?? seats[0];
}

/** Re-derive `scene.listener` (and normalize `activeListenerId`) from the active
 *  seat. The single place the mirror invariant is enforced. */
export function syncActiveListener(scene: Scene): Scene {
  const seats = sceneListeners(scene);
  const active = seats.find((l) => l.id === scene.activeListenerId) ?? seats[0];
  return {
    ...scene,
    listeners: seats,
    activeListenerId: active.id,
    listener: { pos: cloneVec(active.pos), z: active.z },
  };
}

/** New scene fields for a single seat at {pos,z}. Spread into constructors. */
function singleSeatFields(
  pos: Vec2,
  z: number,
  name = DEFAULT_LISTENER_NAME,
): Pick<Scene, 'listeners' | 'activeListenerId' | 'listener'> {
  const seat = makeNamedListener(pos, z, name);
  return { listeners: [seat], activeListenerId: seat.id, listener: { pos: cloneVec(seat.pos), z: seat.z } };
}

/** Move/adjust the ACTIVE seat, keeping the mirror in sync. */
export function updateActiveListener(scene: Scene, patch: Partial<ListenerState>): Scene {
  const seats = sceneListeners(scene);
  const activeId = seats.some((l) => l.id === scene.activeListenerId)
    ? scene.activeListenerId
    : seats[0].id;
  const listeners = seats.map((l) => (l.id === activeId ? { ...l, ...patch } : l));
  return syncActiveListener({ ...scene, listeners, activeListenerId: activeId });
}

/** Make a different seat active. Unknown ids are ignored. */
export function setActiveListener(scene: Scene, id: string): Scene {
  const seats = sceneListeners(scene);
  if (!seats.some((l) => l.id === id)) return scene;
  return syncActiveListener({ ...scene, listeners: seats, activeListenerId: id });
}

/** Add a new named seat (default offset from the active one) and make it active.
 *  No-op at the seat cap so we never create seats a later load would silently drop. */
export function addListener(scene: Scene, name?: string, at?: Vec2): Scene {
  const seats = sceneListeners(scene);
  if (seats.length >= MAX_LISTENERS) return scene;
  const src = seats.find((l) => l.id === scene.activeListenerId) ?? seats[0];
  const pos = at ?? { x: src.pos.x + 0.6, y: src.pos.y + 0.6 };
  const seat = makeNamedListener(pos, src.z, name?.trim() ? name.trim().slice(0, 32) : `Seat ${seats.length + 1}`);
  return syncActiveListener({ ...scene, listeners: [...seats, seat], activeListenerId: seat.id });
}

/** Rename a seat (position/height and the mirror are unaffected). */
export function renameListener(scene: Scene, id: string, name: string): Scene {
  const seats = sceneListeners(scene);
  const listeners = seats.map((l) => (l.id === id ? { ...l, name: name.slice(0, 32) } : l));
  return { ...scene, listeners };
}

/** Remove a seat. Never drops below one; a removed active seat hands off to a
 *  survivor. Unknown ids are a true no-op (no new object identity → no undo noise). */
export function removeListener(scene: Scene, id: string): Scene {
  const seats = sceneListeners(scene);
  if (seats.length <= 1 || !seats.some((l) => l.id === id)) return scene;
  const listeners = seats.filter((l) => l.id !== id);
  const activeListenerId = listeners.some((l) => l.id === scene.activeListenerId)
    ? scene.activeListenerId
    : listeners[0].id;
  return syncActiveListener({ ...scene, listeners, activeListenerId });
}

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
 * Maple Court apartment, digitized from the floorplan. The outline below encloses
 * ~55 m² by the shoelace formula; walls carry no thickness, so the true interior
 * area is slightly smaller.
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
    rect('Counter', vec(0.33, 8.8), 0.65, 2.3, 0, 0.22, 0.9),
    rect('Counter', vec(1.65, 10.2), 2.1, 0.62, 10, 0.22, 0.9),
    circle('Table', vec(1.05, 5.85), 0.55, 0.3, 0.75),
  ];

  return {
    objects: [...walls, ...interior, ...furniture],
    speakers: [],
    pairs: [],
    ...singleSeatFields(vec(2.3, 3.9), DEFAULT_LISTENER_Z),
  };
}

export function blankScene(): Scene {
  return {
    objects: [],
    speakers: [],
    pairs: [],
    ...singleSeatFields(vec(2.5, 2.5), DEFAULT_LISTENER_Z),
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
    ...singleSeatFields(vec(w / 2, d / 2), DEFAULT_LISTENER_Z),
  };
}

/** A wall half shorter than this is a point, not a wall. */
const MIN_WALL_LEN = 0.02;

/**
 * Break a wall into two at a point (projected onto the wall; defaults to the
 * midpoint). Both halves keep the original material and height; the cut is
 * pulled in from either endpoint so neither half collapses to a near-zero
 * fragment (a wall under 2·MIN_WALL_LEN is simply split at its midpoint).
 */
export function splitWallAt(wall: WallObj, at?: Vec2): [WallObj, WallObj] {
  let cut: Vec2;
  if (at) {
    const len = v.dist(wall.a, wall.b);
    const { t } = closestPointOnSegment(at, wall.a, wall.b);
    // Pull the cut in from either endpoint so neither half degenerates.
    const minFrac = len > 2 * MIN_WALL_LEN ? MIN_WALL_LEN / len : 0.5;
    const clamped = Math.max(minFrac, Math.min(1 - minFrac, t));
    cut = v.lerp(wall.a, wall.b, clamped);
  } else {
    cut = v.lerp(wall.a, wall.b, 0.5);
  }
  const first: WallObj = { ...wall, id: createId('wall'), b: cut };
  const second: WallObj = { ...wall, id: createId('wall'), a: cut };
  return [first, second];
}

export function sceneBounds(scene: Scene): { min: Vec2; max: Vec2 } {
  // Frame every seat (not just the active mirror) so switching seats never
  // leaves one off-canvas; falls back to the mirror for hand-built scenes.
  const seatPts =
    scene.listeners && scene.listeners.length > 0
      ? scene.listeners.map((l) => l.pos)
      : [scene.listener.pos];
  const pts: Vec2[] = [...seatPts, ...scene.speakers.map((s) => s.pos)];
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
  // The empty-scene guard has to test all four components, not just `min.x`.
  // A circle at (1e308, 1e308) with r = 1e308 passes `isNum` on every field yet
  // overflows `center + r` to +Infinity, so `min.x` stays finite while `max.x`
  // does not — the one-sided check let a non-finite box straight through.
  if (
    !Number.isFinite(min.x) ||
    !Number.isFinite(min.y) ||
    !Number.isFinite(max.x) ||
    !Number.isFinite(max.y)
  ) {
    return { min: vec(0, 0), max: vec(8, 8) };
  }
  if (max.x - min.x < 2) {
    min.x -= 1;
    max.x += 1;
  }
  if (max.y - min.y < 2) {
    min.y -= 1;
    max.y += 1;
  }
  // A finite box can still carry an unwalkable span: a circle at the ORIGIN with
  // r = 1e308 yields bounds of ±1e308 — both finite, span Infinity — where one
  // ulp is 2.2e292 and `x += 0.7` cannot move. Bound the region we hand to the
  // grid loops. `scene` is not touched, so nothing is mangled or persisted.
  clampSpan(min, max, 'x');
  clampSpan(min, max, 'y');
  return { min, max };
}

/** Shrink one axis around its midpoint until it spans at most MAX_SCENE_SPAN. */
function clampSpan(min: Vec2, max: Vec2, axis: 'x' | 'y'): void {
  const span = max[axis] - min[axis];
  if (!(span > MAX_SCENE_SPAN)) return; // `!(>)` also catches a NaN span
  const mid = min[axis] / 2 + max[axis] / 2; // halve first: avoids overflowing the sum
  min[axis] = mid - MAX_SCENE_SPAN / 2;
  max[axis] = mid + MAX_SCENE_SPAN / 2;
}

// ---------------------------------------------------------------------------
// Persistence — validate everything that crosses the JSON boundary.

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isVec = (p: unknown): p is Vec2 =>
  typeof p === 'object' && p !== null && isNum((p as Vec2).x) && isNum((p as Vec2).y);

const clampH = (h: unknown, fallback: number): number =>
  isNum(h) ? Math.max(0.02, Math.min(6, h)) : fallback;

/**
 * Rebuild an accepted position as a fresh two-key literal.
 *
 * The sanitizer is allow-list *reconstruction*, but every Vec2 was assigned by
 * reference (`a: o.a`), so the "sanitized" scene was a live view onto the
 * attacker's parse tree: mutating the raw object afterwards changed the stored
 * scene, arbitrary extra keys rode into IndexedDB and every export, and a JSON
 * `"__proto__"` key survived as an own property on the Vec2. (No pollution
 * gadget — `JSON.parse` makes it an own data property — but it has no business
 * being persisted.) Callers must pass an `isVec`-checked value.
 */
const cleanVec = (p: Vec2): Vec2 => ({ x: p.x, y: p.y });

function sanitizeObject(raw: unknown, seenIds: Set<string>): SceneObject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const absorption = isNum(o.absorption) ? Math.max(0, Math.min(1, o.absorption)) : 0.2;
  const label = typeof o.label === 'string' ? o.label.slice(0, 40) : 'Object';
  let id = typeof o.id === 'string' ? o.id : createId('obj');
  if (seenIds.has(id)) id = createId('obj');
  seenIds.add(id);
  if (o.kind === 'wall' && isVec(o.a) && isVec(o.b)) {
    return {
      id,
      kind: 'wall',
      a: cleanVec(o.a),
      b: cleanVec(o.b),
      absorption,
      label,
      height: clampH(o.height, ROOM_HEIGHT),
    };
  }
  if (o.kind === 'rect' && isVec(o.center) && isNum(o.w) && isNum(o.h) && isNum(o.rotation)) {
    return {
      id,
      kind: 'rect',
      center: cleanVec(o.center),
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
      center: cleanVec(o.center),
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

  // Seats claim their ids FIRST, before objects and speakers.
  //
  // `activeListenerId` is matched against the seats' FINAL ids, but ids are
  // deduplicated in document order. With objects processed first, an imported
  // object whose id collided with the active seat's forced the SEAT to take a
  // fresh id — so the pointer no longer matched and silently fell back to
  // `seats[0]`: the "Bed" seat survived under a new id while YOU loaded onto the
  // Couch, and every verdict was then computed for a seat the user never chose.
  // That is the S2 seat/verdict desync trap arriving through the import path.
  // Whoever claims an id first keeps it, so the seats must go first.

  // Listening positions. New shape: `listeners[]` + `activeListenerId`.
  // Back-compat: v2 single `listener` {pos,z}, or v1 {x,y}. Always ≥1 seat, and
  // `scene.listener` is re-derived as a mirror of the active seat.
  const seats: NamedListener[] = [];
  const rawSeats = (s as { listeners?: unknown }).listeners;
  if (Array.isArray(rawSeats)) {
    // Scan a bounded slice so a pathological import can't blow up, yet collect
    // beyond MAX_LISTENERS so the truncation below can still keep the ACTIVE seat.
    const scanLimit = Math.min(rawSeats.length, MAX_LISTENERS * 8);
    for (let i = 0; i < scanLimit; i++) {
      const raw2 = rawSeats[i];
      if (typeof raw2 !== 'object' || raw2 === null) continue;
      const rl = raw2 as Record<string, unknown>;
      if (!isVec(rl.pos)) continue; // drop malformed seats rather than crash
      let id = typeof rl.id === 'string' ? rl.id : createId('seat');
      if (seenIds.has(id)) id = createId('seat');
      seenIds.add(id);
      seats.push({
        id,
        name:
          typeof rl.name === 'string' && rl.name.trim() ? rl.name.slice(0, 32) : `Seat ${seats.length + 1}`,
        pos: cleanVec(rl.pos),
        z: clampH(rl.z, DEFAULT_LISTENER_Z),
      });
    }
  }
  if (seats.length === 0) {
    // Legacy single listener: v2 {pos,z} or v1 {x,y}, else a safe default.
    let pos = vec(2, 2);
    let z = DEFAULT_LISTENER_Z;
    const rawListener = s.listener as Record<string, unknown> | undefined;
    if (rawListener && isVec(rawListener.pos)) {
      pos = cleanVec(rawListener.pos);
      z = clampH(rawListener.z, DEFAULT_LISTENER_Z);
    } else if (isVec(s.listener)) {
      pos = cleanVec(s.listener as Vec2);
    }
    const id = createId('seat');
    seenIds.add(id);
    seats.push({ id, name: DEFAULT_LISTENER_NAME, pos, z });
  }
  const rawActive = (s as { activeListenerId?: unknown }).activeListenerId;
  let activeListenerId =
    typeof rawActive === 'string' && seats.some((l) => l.id === rawActive) ? rawActive : seats[0].id;
  // Cap stored seats, but never drop the active one — that would silently jump
  // YOU (and every verdict) to an unrelated seat on the next load.
  //
  // Precisely: the rescue holds for any active seat found within the scan window
  // above (index ≤ 255). A hand-crafted file that puts the active seat at index
  // 256+ still falls back to seat 0 — measured exactly at that boundary. Not
  // reachable from app-produced data (`addListener` no-ops at MAX_LISTENERS=32),
  // and `importRejection` has no seat limit, so this is a documented edge rather
  // than a guarantee.
  let finalSeats = seats;
  if (seats.length > MAX_LISTENERS) {
    finalSeats = seats.slice(0, MAX_LISTENERS);
    if (!finalSeats.some((l) => l.id === activeListenerId)) {
      finalSeats[MAX_LISTENERS - 1] = seats.find((l) => l.id === activeListenerId)!;
    }
  }
  const activeSeat = finalSeats.find((l) => l.id === activeListenerId) ?? finalSeats[0];
  activeListenerId = activeSeat.id;
  const listener: ListenerState = { pos: cloneVec(activeSeat.pos), z: activeSeat.z };

  // Speakers: v2 array, with a v1 fallback ({L, R} object → pair).
  const speakers: SpeakerObj[] = [];
  let pairs: Array<[string, string]> = [];
  if (Array.isArray(s.speakers)) {
    for (const raw2 of s.speakers) {
      // `speakers: [null]` used to throw here on the `sp.pos` read, and a throw
      // in `loadStore` is caught by ONE outer try that then returns
      // `defaultStore()` — i.e. a single hostile record silently replaced every
      // layout the user owned. The seats/objects loops already null-check; these
      // two (speakers, rooms) were the only ones that did not.
      if (typeof raw2 !== 'object' || raw2 === null) continue;
      const sp = raw2 as Record<string, unknown>;
      if (!isVec(sp.pos)) continue;
      let id = typeof sp.id === 'string' ? sp.id : createId('spk');
      if (seenIds.has(id)) id = createId('spk');
      seenIds.add(id);
      speakers.push({
        id,
        pos: cleanVec(sp.pos),
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
      const l: SpeakerObj = { id: createId('spk'), pos: cleanVec(sp.L), z: DEFAULT_SPEAKER_Z, label: 'L', model: 'homepod', trimDb: 0 };
      const r: SpeakerObj = { id: createId('spk'), pos: cleanVec(sp.R), z: DEFAULT_SPEAKER_Z, label: 'R', model: 'homepod', trimDb: 0 };
      speakers.push(l, r);
      pairs = [[l.id, r.id]];
    }
  }

  // Objects LAST — only now that the seats and speakers hold their ids.
  //
  // Objects are the only entities nothing else references by id (`objectId` in
  // the tracer is derived at runtime), so they are the safe ones to re-issue on
  // a collision. Seats are referenced by `activeListenerId` and speakers by
  // `pairs`, so re-issuing either silently breaks a cross-reference: the same
  // hostile file would otherwise move YOU to a different seat, or unlink a
  // stereo pair so the verdict reads "No stereo pair".
  const objects = s.objects
    .map((o) => sanitizeObject(o, seenIds))
    .filter((o): o is SceneObject => o !== null);

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
      center: cleanVec(u.center),
      scale: Math.max(0.0005, Math.min(1, u.scale)),
      rotation: isNum(u.rotation) ? u.rotation : 0,
      opacity: isNum(u.opacity) ? Math.max(0.05, Math.min(1, u.opacity)) : 0.5,
    };
  }

  // Room name labels survive import/reload; anything malformed is dropped.
  const rawRooms = (s as { rooms?: unknown }).rooms;
  const rooms = Array.isArray(rawRooms)
    ? rawRooms.flatMap((r) => {
        // `rooms: [null]` threw here on the `.w` read — the second of the two
        // store-eating throw sites (see the speakers loop above).
        if (typeof r !== 'object' || r === null) return [];
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
  return { objects, speakers, pairs, listener, listeners: finalSeats, activeListenerId, underlay, rooms };
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
  const base: Scene = {
    ...scene,
    objects: [...scene.objects, ...walls],
    rooms: [...(scene.rooms ?? []), ...(name.trim() ? [room] : [])],
  };
  if (hasAny) return base; // an added room leaves seats put
  // A first room recenters the active seat into it — and shifts every OTHER seat
  // by the same delta so none is stranded outside the brand-new room.
  const seats = sceneListeners(base);
  const active = seats.find((l) => l.id === base.activeListenerId) ?? seats[0];
  const dx = w / 2 - active.pos.x;
  const dy = d / 2 - active.pos.y;
  const moved = seats.map((l) => ({ ...l, pos: { x: l.pos.x + dx, y: l.pos.y + dy } }));
  return syncActiveListener({ ...base, listeners: moved });
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
export const LEGACY_KEY = 'phantom-lock:v1';

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

// ---------------------------------------------------------------------------
// Import admission control.
//
// These limits apply ONLY to a file the user is importing right now — never to
// data already in the store. That split is deliberate and load-bearing:
//
//   * An imported file is untrusted and the user has not invested anything in
//     it yet, so REFUSING it costs nothing and they keep the file.
//   * Their own saved layouts are the opposite: clamping or truncating those on
//     load would silently destroy work (a legitimate 42-room layout built with
//     "Add a room…" flattens 75 walls onto one line) and autosave would then
//     overwrite the good record ~400 ms later. So the load path never mangles.
//
// Honest scope: these bounds reject every pathological payload measured (the
// 354-byte `r: 1e308` brick, 1e17 coordinates, 200 000 objects, span ≥ 600) and
// they guarantee termination. They do NOT keep an accepted import fast, and they
// do NOT bound worst-case CPU for a payload hand-tuned to sit just under every
// limit: a scene at 200 speakers / span 399 m / 100 objects — every value inside
// these limits — was measured at ~157 s for one simulation pass, and it persists,
// so the freeze recurs on every load until the layout is deleted. The cost is
// multiplicative in objects × pairs × span², and a legitimate 10-room
// house already costs ~200 ms. Truly bounding that needs an iteration cap
// inside the grid loops themselves (`bestspot.ts` / `pairspot.ts`), which are
// frozen this session. See `docs/security.md`.

/** Largest span (m) an imported scene may occupy on either axis. */
export const MAX_IMPORT_SPAN = 400;
/** Largest coordinate magnitude (m) any imported point may carry. */
export const MAX_IMPORT_COORD = 100_000;
export const MAX_IMPORT_OBJECTS = 5_000;
/**
 * 64 speakers (⇒ ≤32 pairs). Tightened from 200 after measurement: `bestspot`
 * loops every speaker per grid cell and `pairspot` runs a full grid per blocked
 * pair, so this is the sharpest axis in the cost product — 200 speakers at a
 * near-maximum span cost ~18 s on their own with no furniture at all. 64 is
 * still 16× more than the app's own optimizer will ever place, and this is a
 * planner for a handful of HomePods.
 */
export const MAX_IMPORT_SPEAKERS = 64;
export const MAX_IMPORT_ROOMS = 500;
/** Ids round-trip into IndexedDB forever and key a Map per grid cell. */
export const MAX_IMPORT_ID_LEN = 256;

/**
 * Why a scene may not be imported, or `null` if it is acceptable.
 *
 * Returns a REASON rather than a repaired scene on purpose — the caller shows
 * it to the user and leaves the store untouched. Nothing here mutates `scene`.
 */
export function importRejection(scene: Scene): string | null {
  if (scene.objects.length > MAX_IMPORT_OBJECTS) {
    return `That layout has ${scene.objects.length.toLocaleString()} objects (limit ${MAX_IMPORT_OBJECTS.toLocaleString()}).`;
  }
  if (scene.speakers.length > MAX_IMPORT_SPEAKERS) {
    return `That layout has ${scene.speakers.length.toLocaleString()} speakers (limit ${MAX_IMPORT_SPEAKERS}).`;
  }
  if ((scene.rooms?.length ?? 0) > MAX_IMPORT_ROOMS) {
    return `That layout has ${scene.rooms!.length.toLocaleString()} areas (limit ${MAX_IMPORT_ROOMS}).`;
  }

  const tooLong = (id: string): boolean => id.length > MAX_IMPORT_ID_LEN;
  if (
    scene.objects.some((o) => tooLong(o.id)) ||
    scene.speakers.some((sp) => tooLong(sp.id)) ||
    (scene.listeners ?? []).some((l) => tooLong(l.id))
  ) {
    return `That layout contains an identifier longer than ${MAX_IMPORT_ID_LEN} characters.`;
  }

  // Reject on raw coordinates BEFORE consulting sceneBounds, whose returned box
  // is span-clamped and would therefore hide exactly the values we want to catch.
  const pts: Vec2[] = [
    ...(scene.listeners ?? []).map((l) => l.pos),
    ...scene.speakers.map((sp) => sp.pos),
  ];
  for (const o of scene.objects) {
    if (o.kind === 'wall') pts.push(o.a, o.b);
    else pts.push(o.center);
  }
  for (const p of pts) {
    if (Math.abs(p.x) > MAX_IMPORT_COORD || Math.abs(p.y) > MAX_IMPORT_COORD) {
      return 'That layout has coordinates far outside any real room.';
    }
  }
  // Sizes are only lower-clamped by the sanitizer, so a single circle can span
  // the universe from a perfectly ordinary centre.
  for (const o of scene.objects) {
    const extent = o.kind === 'circle' ? o.r * 2 : o.kind === 'rect' ? Math.max(o.w, o.h) : 0;
    if (extent > MAX_IMPORT_SPAN) {
      return 'That layout contains an object larger than any real room.';
    }
  }

  const b = sceneBounds(scene);
  const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y);
  if (span > MAX_IMPORT_SPAN) {
    return `That layout spans ${Math.round(span).toLocaleString()} m (limit ${MAX_IMPORT_SPAN} m).`;
  }
  return null;
}

/**
 * Sanitize one record without letting it take its siblings down with it.
 *
 * `loadStore` wraps everything in a single try/catch that falls through to
 * `defaultStore()`, so before the null-element guards landed, ONE malformed
 * layout replaced every layout the user owned — and autosave then wrote the
 * replacement back. Both guards are worth having: this one bounds the blast
 * radius of any FUTURE throw to the single record that caused it.
 */
export function sanitizeLayoutIsolated(raw: unknown): Layout | null {
  try {
    return sanitizeLayout(raw);
  } catch {
    return null; // drop this record, keep the rest of the user's work
  }
}

/** Load the layout store, migrating a v1 single-scene save if present. */
export function loadStore(storage: Pick<Storage, 'getItem'>): LayoutStore {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed.layouts)) {
        const layouts = parsed.layouts
          .map(sanitizeLayoutIsolated)
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
      // Isolated for the same reason as the v2 branch above: a throw here would
      // land in the outer catch and discard the migration wholesale.
      let scene: Scene | null = null;
      try {
        scene = sanitizeScene(parsed.scene);
      } catch {
        scene = null;
      }
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
