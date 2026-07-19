import type { Scene, SpeakerModel, Surface, Vec2 } from './types';
import { distPointSegment, pointInRect } from './geometry';
import { collectSurfaces, directPath } from './raytrace';
import { findTv } from './stereo';
import { SPEAKER_MODELS } from './speakers';
import { DEFAULT_SPEAKER_Z, sceneBounds } from './scene';
import { regionOf, type Region } from './rooms';
import * as v from './vec';

export type PlacementMode = 'cinema' | 'music';

export type PlacementTarget =
  | { kind: 'listener' }
  | { kind: 'room'; at: Vec2; name: string }
  | { kind: 'house' };

export interface PlacementOptions {
  /** cinema = image anchored on the TV/listener axis; music = envelop the listener. */
  mode: PlacementMode;
  /** Link same-model twos into stereo pairs. */
  stereo: boolean;
  inventory: Partial<Record<SpeakerModel, number>>;
  /** Where to optimize: around you (default), a named room, or the whole house. */
  target?: PlacementTarget;
}

export interface ProposedSpeaker {
  pos: Vec2;
  z: number;
  label: string;
  model: SpeakerModel;
  trimDb: number;
}

export interface Proposal {
  speakers: ProposedSpeaker[];
  /** Index pairs into `speakers` that should be linked as stereo pairs. */
  pairs: Array<[number, number]>;
  mode: PlacementMode;
  notes: string[];
  /** Listening point the proposal was optimized around (room targets). */
  focus?: Vec2;
  targetName?: string;
}

const MIN_WALL_CLEARANCE = 0.25;
const IDEAL_WALL_CLEARANCE = 0.5;
/** Sitting beside furniture (e.g. flanking the TV) is fine — just not inside it. */
const MIN_FURNITURE_CLEARANCE = 0.05;
const MIN_DIST = 0.7;

interface Ctx {
  scene: Scene;
  surfaces: Surface[];
  wallSurfaces: Surface[];
  furnitureSurfaces: Surface[];
  listener: Vec2;
  listenerZ: number;
  /** Candidates must stay inside this walkable region (null = anywhere). */
  region: Region | null;
}

function clearanceOf(surfaces: Surface[], p: Vec2): number {
  let best = Infinity;
  for (const s of surfaces) {
    const d =
      s.type === 'seg' ? distPointSegment(p, s.a, s.b) : Math.abs(v.dist(p, s.c) - s.r);
    best = Math.min(best, d);
  }
  return best;
}

function insideFurniture(ctx: Ctx, p: Vec2): boolean {
  for (const o of ctx.scene.objects) {
    if (o.kind === 'rect' && pointInRect(p, o)) return true;
    if (o.kind === 'circle' && v.dist(p, o.center) <= o.r) return true;
  }
  return false;
}

function isValid(ctx: Ctx, p: Vec2): boolean {
  const d = v.dist(p, ctx.listener);
  if (d < MIN_DIST || d > 4.5) return false;
  if (ctx.region && !ctx.region.contains(p)) return false;
  if (insideFurniture(ctx, p)) return false;
  if (clearanceOf(ctx.wallSurfaces, p) < MIN_WALL_CLEARANCE) return false;
  if (clearanceOf(ctx.furnitureSurfaces, p) < MIN_FURNITURE_CLEARANCE) return false;
  return !directPath(ctx.surfaces, p, DEFAULT_SPEAKER_Z, ctx.listener, ctx.listenerZ).blocked;
}

/** Higher is better. Assumes `p` already passed isValid. `ideal` = model sweet band centre. */
function spotScore(ctx: Ctx, p: Vec2, ideal: number): number {
  const d = v.dist(p, ctx.listener);
  const distScore = 1 - Math.min(1, Math.abs(d - ideal) / 1.6);
  const cWall = clearanceOf(ctx.wallSurfaces, p);
  const clearScore = Math.min(1, cWall / IDEAL_WALL_CLEARANCE);
  const direct = directPath(ctx.surfaces, p, DEFAULT_SPEAKER_Z, ctx.listener, ctx.listenerZ);
  return distScore * 0.45 + clearScore * 0.35 + direct.attenuation * 0.2;
}

const rot = (dir: Vec2, angDeg: number): Vec2 => v.rotate(dir, (angDeg * Math.PI) / 180);

const sweep = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let d = from; d <= to + 1e-9; d += step) out.push(d);
  return out;
};

function modelDistances(model: SpeakerModel): { dists: number[]; ideal: number } {
  const spec = SPEAKER_MODELS[model];
  const lo = Math.max(MIN_DIST + 0.2, spec.idealMin);
  const hi = spec.idealMax;
  return { dists: sweep(lo, hi, 0.1), ideal: (lo + hi) / 2 };
}

/** The TV/listener axis for cinema mode — only if the screen is actually
 *  visible from the listening point (not through a wall in another room). */
function tvDirection(ctx: Ctx): { dir: Vec2 | null; tvBlocked: boolean } {
  const tv = findTv(ctx.scene);
  if (!tv) return { dir: null, tvBlocked: false };
  const d = v.sub(tv.center, ctx.listener);
  if (v.len(d) <= 0.3) return { dir: null, tvBlocked: false };
  const screenZ = Math.max(0.5, tv.height * 0.8);
  // The sight ray starts inside the TV's own rect — don't let it occlude itself.
  const others = ctx.surfaces.filter((s) => s.objectId !== tv.id);
  if (directPath(others, tv.center, screenZ, ctx.listener, ctx.listenerZ).blocked) {
    return { dir: null, tvBlocked: true };
  }
  return { dir: v.norm(d), tvBlocked: false };
}

function roomDirection(ctx: Ctx): Vec2 {
  const b = sceneBounds(ctx.scene);
  const center = v.scale(v.add(b.min, b.max), 0.5);
  const d = v.sub(center, ctx.listener);
  return v.len(d) > 0.1 ? v.norm(d) : { x: 0, y: -1 };
}

/** Music mode: the most open direction from the listener wins. */
function openDirection(ctx: Ctx, model: SpeakerModel): Vec2 {
  const { dists, ideal } = modelDistances(model);
  let best: { dir: Vec2; score: number } | null = null;
  for (let ang = 0; ang < 360; ang += 15) {
    const dir = v.fromAngle((ang * Math.PI) / 180);
    for (const d of dists) {
      const p = v.add(ctx.listener, v.scale(dir, d));
      if (!isValid(ctx, p)) continue;
      const score = spotScore(ctx, p, ideal);
      if (!best || score > best.score) best = { dir, score };
    }
  }
  return best?.dir ?? roomDirection(ctx);
}

/** Best valid spot near a target bearing (degrees off front) over a distance sweep. */
function bestSpotAt(
  ctx: Ctx,
  front: Vec2,
  bearingDeg: number,
  model: SpeakerModel,
): { pos: Vec2; score: number } | null {
  const { dists, ideal } = modelDistances(model);
  let best: { pos: Vec2; score: number } | null = null;
  for (const wobble of [0, -8, 8, -16, 16, -25, 25]) {
    const dir = rot(front, bearingDeg + wobble);
    for (const d of dists) {
      const p = v.add(ctx.listener, v.scale(dir, d));
      if (!isValid(ctx, p)) continue;
      const score = spotScore(ctx, p, ideal) - Math.abs(wobble) * 0.004;
      if (!best || score > best.score) best = { pos: p, score };
    }
  }
  return best;
}

/**
 * Symmetric stereo pair: both speakers at distance d and ±30° around an axis
 * form an equilateral triangle with the listener by construction.
 * `rotations` controls how far the axis may swing from `front`.
 */
function bestStereoPair(
  ctx: Ctx,
  front: Vec2,
  centerBearing: number,
  model: SpeakerModel,
  rotations: number[],
): { a: Vec2; b: Vec2; score: number } | null {
  const { dists, ideal } = modelDistances(model);
  let best: { a: Vec2; b: Vec2; score: number } | null = null;
  for (const rotOff of rotations) {
    for (const d of dists) {
      const a = v.add(ctx.listener, v.scale(rot(front, centerBearing + rotOff - 30), d));
      const b = v.add(ctx.listener, v.scale(rot(front, centerBearing + rotOff + 30), d));
      if (!isValid(ctx, a) || !isValid(ctx, b)) continue;
      const score =
        (spotScore(ctx, a, ideal) + spotScore(ctx, b, ideal)) / 2 + d * 0.05 - Math.abs(rotOff) * 0.004;
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  return best;
}

/** Which of the two pair spots is "left" from the listener's point of view. */
function orderLeftRight(ctx: Ctx, front: Vec2, a: Vec2, b: Vec2): [Vec2, Vec2] {
  const sideA = v.cross(front, v.sub(a, ctx.listener));
  // Screen coords are y-down: negative cross → counter-clockwise from front → listener's left.
  return sideA < 0 ? [a, b] : [b, a];
}

/** Trims so every proposed speaker lands at the same level at the listener. */
function applyTrims(ctx: Ctx, speakers: ProposedSpeaker[], notes: string[]): void {
  if (speakers.length < 2) return;
  const levels = speakers.map(
    (sp) =>
      SPEAKER_MODELS[sp.model].refDb -
      20 * Math.log10(Math.max(0.1, Math.hypot(v.dist(sp.pos, ctx.listener), sp.z - ctx.listenerZ))),
  );
  const target = Math.min(...levels);
  let any = false;
  const parts: string[] = [];
  speakers.forEach((sp, i) => {
    const trim = Math.round((target - levels[i]) * 10) / 10;
    sp.trimDb = trim;
    if (Math.abs(trim) >= 0.5) any = true;
    parts.push(`${sp.label} ${trim <= 0 ? '' : '+'}${trim.toFixed(1)} dB`);
  });
  if (any) {
    notes.push(`Volume trims so every speaker hits your seat equally: ${parts.join(', ')}.`);
  }
}

const CINEMA_ROTS = [0, -8, 8, -16, 16, -25, 25];
const MUSIC_ROTS = sweep(-180, 170, 10);

export function suggestPlacement(scene: Scene, opts: PlacementOptions): Proposal {
  const surfaces = collectSurfaces(scene.objects);
  const wallIds = new Set(scene.objects.filter((o) => o.kind === 'wall').map((o) => o.id));
  const target = opts.target ?? { kind: 'listener' as const };

  if (target.kind === 'house') return placeAcrossHouse(scene, surfaces, wallIds, opts);

  const focus = target.kind === 'room' ? target.at : scene.listener.pos;
  const ctx: Ctx = {
    scene,
    surfaces,
    wallSurfaces: surfaces.filter((s) => wallIds.has(s.objectId)),
    furnitureSurfaces: surfaces.filter((s) => !wallIds.has(s.objectId)),
    listener: focus,
    listenerZ: scene.listener.z,
    region: regionOf(scene, focus),
  };

  const notes: string[] = [];
  if (target.kind === 'room') {
    notes.push(`Optimized for “${target.name}” — applying also moves YOU there.`);
  }
  const speakers: ProposedSpeaker[] = [];
  const pairs: Array<[number, number]> = [];
  const z = DEFAULT_SPEAKER_Z;

  // Inventory, big speakers first — they carry the main image.
  const models: SpeakerModel[] = [];
  for (const id of ['homepod', 'homepod-mini'] as SpeakerModel[]) {
    for (let i = 0; i < Math.min(4, opts.inventory[id] ?? 0); i++) models.push(id);
  }
  if (models.length === 0) {
    return { speakers, pairs, mode: opts.mode, notes: ['Pick at least one speaker to place.'] };
  }

  // Front axis.
  const { dir: tvDir, tvBlocked } = tvDirection(ctx);
  let front: Vec2;
  if (opts.mode === 'cinema') {
    front = tvDir ?? openDirection(ctx, models[0]);
    if (tvBlocked) {
      notes.push(
        'The TV has no line of sight from this listening spot (it is behind a wall or in another room) — placing for music-style envelopment here instead. Target the TV\u2019s room to get a cinema pair.',
      );
    } else if (!tvDir) {
      notes.push('No TV in this layout — anchored on the open side of the room instead.');
    }
  } else {
    front = openDirection(ctx, models[0]);
    notes.push('Music mode: anchored on your most open side; geometry wraps around you, not the TV.');
  }
  const axisRots = opts.mode === 'cinema' ? CINEMA_ROTS : MUSIC_ROTS;

  // Group into same-model pairs (max 2) + leftover monos.
  const pairGroups: SpeakerModel[] = [];
  const monos: SpeakerModel[] = [];
  if (opts.stereo) {
    const counts = new Map<SpeakerModel, number>();
    for (const m of models) counts.set(m, (counts.get(m) ?? 0) + 1);
    for (const [m, c] of counts) {
      let left = c;
      while (left >= 2 && pairGroups.length < 2) {
        pairGroups.push(m);
        left -= 2;
      }
      for (let i = 0; i < left; i++) monos.push(m);
    }
    if (pairGroups.length === 0 && models.length >= 2) {
      notes.push('No two speakers share a model — Apple only stereo-pairs identical models, so these stay independent.');
    }
  } else {
    monos.push(...models);
  }

  // Place pairs: first at the front axis, second mirrored behind.
  pairGroups.forEach((model, pi) => {
    const centerBearing = pi === 0 ? 0 : 180;
    const found = bestStereoPair(ctx, front, centerBearing, model, pi === 0 ? axisRots : CINEMA_ROTS);
    if (!found) {
      notes.push(
        pi === 0
          ? 'No room for a symmetric ±30° pair with clear line of sight — try a wider spot for the listener.'
          : 'No symmetric rear spots with line of sight — rear pair skipped.',
      );
      return;
    }
    const [l, r] = orderLeftRight(ctx, front, found.a, found.b);
    const base = speakers.length;
    const short = SPEAKER_MODELS[model].short;
    speakers.push(
      { pos: l, z, label: pi === 0 ? 'L' : 'RL', model, trimDb: 0 },
      { pos: r, z, label: pi === 0 ? 'R' : 'RR', model, trimDb: 0 },
    );
    pairs.push([base, base + 1]);
    notes.push(
      pi === 0
        ? `${short} stereo pair at ±30°, ${v.dist(l, ctx.listener).toFixed(1)} m — an equilateral triangle with your seat.`
        : `Rear ${short} pair mirrors the front for surround fill.`,
    );
  });

  // Place monos.
  if (monos.length > 0) {
    const hasPairs = pairs.length > 0;
    let bearings: number[];
    if (opts.mode === 'music' && !hasPairs) {
      // Envelopment: even ring around the listener.
      bearings = monos.map((_, i) => (360 / monos.length) * i);
      notes.push('Music mode, independent speakers: spread evenly around you for envelopment.');
    } else if (opts.mode === 'music') {
      // Pairs hold front/back — monos take the sides.
      bearings = monos.map((_, i) => (i % 2 === 0 ? 90 : -90) + Math.floor(i / 2) * 30);
    } else {
      const fans: Record<number, number[]> = { 1: [0], 2: [-40, 40], 3: [-55, 0, 55], 4: [-67, -22, 22, 67] };
      bearings = hasPairs ? monos.map((_, i) => (i % 2 === 0 ? 150 : -150)) : (fans[monos.length] ?? monos.map((_, i) => i * 45 - 60));
    }
    const monoLabels = 'ABCDEF';
    monos.forEach((model, i) => {
      // Fills matter more than exact bearings — walk away from the target
      // angle until something placeable turns up.
      let spot: { pos: Vec2; score: number } | null = null;
      for (const off of [0, 30, -30, 60, -60, 120, -120, 180]) {
        spot = bestSpotAt(ctx, front, bearings[i] + off, model);
        if (spot) break;
      }
      if (spot) {
        speakers.push({ pos: spot.pos, z, label: monoLabels[i] ?? `S${i}`, model, trimDb: 0 });
      } else {
        notes.push(`No clear spot anywhere for a ${SPEAKER_MODELS[model].short} — the room is too tight around you.`);
      }
    });
  }

  if (speakers.length === 0) {
    notes.push('Nothing placeable: every candidate was inside furniture, hugging a wall, or occluded.');
  } else {
    applyTrims(ctx, speakers, notes);
    const minis = speakers.filter((s) => s.model === 'homepod-mini').length;
    if (minis > 0) {
      notes.push('Minis are kept closer to you than HomePods — they run out of steam past ~2.2 m.');
    }
  }
  notes.push('Speaker height assumed 1.0 m (shelf/stand). Adjust each speaker after applying.');

  return {
    speakers,
    pairs,
    mode: opts.mode,
    notes,
    focus: target.kind === 'room' ? focus : undefined,
    targetName: target.kind === 'room' ? target.name : undefined,
  };
}

/** Whole-house mode: one zone per named room, biggest rooms claim the big
 *  speakers first. Stereo pairs need a shared room, so zones stay independent. */
function placeAcrossHouse(
  scene: Scene,
  surfaces: Surface[],
  wallIds: Set<string>,
  opts: PlacementOptions,
): Proposal {
  const notes: string[] = [];
  const wallSurfaces = surfaces.filter((s) => wallIds.has(s.objectId));
  const furnitureSurfaces = surfaces.filter((s) => !wallIds.has(s.objectId));

  const models: SpeakerModel[] = [];
  for (const id of ['homepod', 'homepod-mini'] as SpeakerModel[]) {
    for (let i = 0; i < Math.min(4, opts.inventory[id] ?? 0); i++) models.push(id);
  }
  if (models.length === 0) {
    return { speakers: [], pairs: [], mode: opts.mode, notes: ['Pick at least one speaker to place.'] };
  }

  const zones = (scene.rooms ?? [])
    .map((room) => ({ room, region: regionOf(scene, room.at) }))
    .filter((z) => z.region.area > 2);
  if (zones.length === 0) {
    return {
      speakers: [],
      pairs: [],
      mode: opts.mode,
      notes: ['No named rooms yet — add rooms in Build (“Add a room”), then optimize the whole house.'],
    };
  }
  zones.sort((a, b) => b.region.area - a.region.area);

  const speakers: ProposedSpeaker[] = [];
  models.forEach((model, i) => {
    const { room, region } = zones[i % zones.length];
    let best: { pos: Vec2; score: number } | null = null;
    for (let ang = 0; ang < 360; ang += 15) {
      for (const d of sweep(0.3, 2.6, 0.2)) {
        const p = v.add(region.centroid, v.scale(v.fromAngle((ang * Math.PI) / 180), d));
        if (!region.contains(p)) continue;
        let inside = false;
        for (const o of scene.objects) {
          if (o.kind === 'rect' && pointInRect(p, o)) inside = true;
          if (o.kind === 'circle' && v.dist(p, o.center) <= o.r) inside = true;
        }
        if (inside) continue;
        const cw = clearanceOf(wallSurfaces, p);
        if (cw < MIN_WALL_CLEARANCE) continue;
        if (clearanceOf(furnitureSurfaces, p) < MIN_FURNITURE_CLEARANCE) continue;
        const score = Math.min(1, cw / IDEAL_WALL_CLEARANCE) + Math.max(0, 1 - Math.abs(d - 1.2) / 1.4);
        if (!best || score > best.score) best = { pos: p, score };
      }
    }
    if (best) {
      const n = speakers.filter((s) => s.label.startsWith(room.name.slice(0, 3))).length + 1;
      speakers.push({
        pos: best.pos,
        z: DEFAULT_SPEAKER_Z,
        label: `${room.name.slice(0, 3)}${n}`.slice(0, 8),
        model,
        trimDb: 0,
      });
    } else {
      notes.push(`No clear spot in “${room.name}” — it was skipped.`);
    }
  });

  if (speakers.length > 0) {
    notes.unshift(
      `Whole-house: one zone per room, biggest rooms get the HomePods first (${zones
        .slice(0, Math.min(zones.length, speakers.length))
        .map((z) => z.room.name)
        .join(', ')}).`,
    );
    notes.push('Stereo pairs need to share a room — these play as independent zones.');
    notes.push('Volume trims left flat: each room is its own listening zone.');
  }
  return { speakers, pairs: [], mode: opts.mode, notes };
}
