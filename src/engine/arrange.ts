import type { RectObj, Scene, SceneObject, Vec2, WallObj } from './types';
import { pointInRect, rectCorners } from './geometry';
import { createId, FURNITURE_PRESETS, sceneBounds, type FurniturePreset } from './scene';
import { regionOf, type Region } from './rooms';
import * as v from './vec';

export interface ArrangeItem {
  presetId: string;
  count: number;
  /**
   * Pieces ordered to FILL a room rather than to furnish it.
   *
   * A room's programme is a promise — a bedroom has a bed — and failing to place
   * one is a defect worth telling the user about. The extra bookshelf ordered
   * because the room still had floor left is an ambition, and a room that turns
   * out to be full is the system working, not failing. Without the distinction a
   * coverage-targeted inventory reports its own success as a problem: measured,
   * ordering to a 26 % coverage budget took the "had nowhere to go" notice from
   * 26.3 % of designs to 37.1 % while the designs themselves got markedly better.
   *
   * This cannot be used to hide a real failure. An optional piece that does not
   * land still leaves the room emptier, and emptiness is measured directly by
   * the `density` sub-score — so marking everything optional would move the
   * complaint, not silence it.
   */
  optional?: boolean;
}

export interface ArrangeResult {
  objects: SceneObject[];
  notes: string[];
  /**
   * Required pieces that found no home, in prose, one per piece.
   *
   * Structured rather than left for the caller to recover by running a regex
   * over `notes` — which is what `generateDesign` used to do (`/skipped/i`), a
   * coupling that would have broken silently the moment any other note happened
   * to contain the word.
   */
  skipped: string[];
}

/** Walkway margin kept around every placed piece. */
const CLEARANCE = 0.35;
/** Depth of the keep-clear corridor in front of every door. */
const DOOR_CORRIDOR = 1.1;
/**
 * Floor kept clear around the listening seat.
 *
 * This app exists to put a stereo pair around that seat, and `generate/pair.ts`
 * searches radii from 0.65 m to 1.8 m for one — so furniture standing there is
 * furniture standing in the speakers' only home. It is not a hypothetical:
 * S33 removed the armchair's bogus hard reject, 125 more armchairs got placed,
 * and designs shipping with NO speakers went 46 -> 92 of 480 because the chair
 * had taken the pair's floor. The fix restores the priority the app is about.
 *
 * 2.0 m, chosen by sweeping it against the coverage budget rather than by
 * argument. Measured over the corpus at a 0.24 coverage target, designs with NO
 * speakers: **1.6 m -> 82, 2.0 m -> 15, 2.4 m -> 14** of 480, against 46 before
 * this session. 1.6 m looks like it should be enough (the pair reaches 1.8 m)
 * and is not, because `pair.ts` `pointFree` rejects a speaker within
 * `max(w,h)/2 + 0.3` of a piece's CENTRE — an armchair at 1.7 m still vetoes the
 * ring. Past 2.0 m the lock stops improving and only floor is lost.
 */
const SEAT_CLEARANCE = 2.0;

interface Ctx {
  scene: Scene;
  walls: WallObj[];
  centroid: Vec2;
  placed: SceneObject[];
  windows: RectObj[];
  doors: RectObj[];
  corridors: RectObj[];
  /** Where each speaker's sound first bounces on a wall en route to the ear. */
  reflections: Vec2[];
  /** The floor you can actually stand on (doors passable) — nothing may be
   *  placed outside it. */
  walkable: Region | null;
  /** Named zones marked on the plan (Kitchen, Bedroom…). */
  zones: Array<{ name: string; rect: RectObj }>;
}

function makeRect(preset: FurniturePreset, center: Vec2, rotation: number): RectObj {
  return {
    id: createId('rect'),
    kind: 'rect',
    center,
    w: preset.w,
    h: preset.h,
    rotation,
    absorption: preset.absorption,
    label: preset.label,
    role: preset.role ?? 'furniture',
    height: preset.height,
  };
}

/** Separating-axis overlap test between two (inflated) rectangles. */
function rectsOverlap(a: RectObj, b: RectObj, margin: number): boolean {
  const inflate = (r: RectObj): RectObj => ({ ...r, w: r.w + margin * 2, h: r.h + margin * 2 });
  const ca = rectCorners(inflate(a));
  const cb = rectCorners(inflate(b));
  const axes: Vec2[] = [
    v.norm(v.sub(ca[1], ca[0])),
    v.norm(v.sub(ca[3], ca[0])),
    v.norm(v.sub(cb[1], cb[0])),
    v.norm(v.sub(cb[3], cb[0])),
  ];
  for (const axis of axes) {
    const pa = ca.map((c) => v.dot(c, axis));
    const pb = cb.map((c) => v.dot(c, axis));
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

function asRect(o: SceneObject): RectObj | null {
  if (o.kind === 'rect') return o;
  if (o.kind === 'circle') {
    return {
      id: o.id,
      kind: 'rect',
      center: o.center,
      w: o.r * 2,
      h: o.r * 2,
      rotation: 0,
      absorption: o.absorption,
      label: o.label,
      role: 'furniture',
      height: o.height,
    };
  }
  return null;
}

function segCrossesRect(a: Vec2, b: Vec2, rect: RectObj): boolean {
  const c = rectCorners(rect);
  const segs: Array<[Vec2, Vec2]> = [
    [c[0], c[1]],
    [c[1], c[2]],
    [c[2], c[3]],
    [c[3], c[0]],
  ];
  const cross2 = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  for (const [p, q] of segs) {
    const d1 = cross2(a, b, p);
    const d2 = cross2(a, b, q);
    const d3 = cross2(p, q, a);
    const d4 = cross2(p, q, b);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return pointInRect(a, rect) || pointInRect(b, rect);
}

function fits(ctx: Ctx, candidate: RectObj): boolean {
  // Furniture must stand on real floor — never outside the walls.
  if (ctx.walkable && !ctx.walkable.contains(candidate.center)) return false;
  for (const wall of ctx.walls) {
    if (segCrossesRect(wall.a, wall.b, candidate)) return false;
  }
  // Never block a door's swing/walkway — circulation beats everything.
  for (const corridor of ctx.corridors) {
    if (rectsOverlap(candidate, corridor, 0)) return false;
  }
  for (const other of [...ctx.scene.objects, ...ctx.placed]) {
    if (other.kind === 'wall') continue;
    // Windows and doors live in the wall plane — they occupy no floor space
    // (a desk under the window is a classic; door swings are the corridors).
    if (other.kind === 'rect' && (other.role === 'window' || other.role === 'door')) continue;
    const r = asRect(other);
    if (r && rectsOverlap(candidate, r, CLEARANCE / 2)) return false;
  }
  return true;
}

interface Slot {
  center: Vec2;
  rotation: number;
  /** Direction the piece faces (away from its wall). */
  facing: Vec2;
  wallLen: number;
  t: number;
  /**
   * True when the piece may CHOOSE its own heading — an open-floor slot.
   *
   * A wall slot determines both where a piece stands AND which way it points:
   * the wall fixes the rotation and the inward normal fixes the facing. An open
   * slot determines only the first, and pretending otherwise was a real bug for
   * two sessions — see `openSlots`.
   */
  free: boolean;
}

/**
 * The rotation that points a rect's front at `to`.
 *
 * "Front" is local +y, the same axis `inwardOf` reads, so a piece oriented by
 * this function and one seated against a wall mean the same thing by the same
 * convention. Returns null when the two points coincide, because the direction
 * is then undefined and `v.norm` would hand back NaN — which propagates
 * silently through every downstream score.
 */
export function faceToward(from: Vec2, to: Vec2): { rotation: number; facing: Vec2 } | null {
  const d = v.sub(to, from);
  if (Math.hypot(d.x, d.y) < 1e-9) return null;
  const facing = v.norm(d);
  return { rotation: Math.atan2(-facing.x, facing.y), facing };
}

/**
 * Candidate positions against a wall, on EVERY side of it that is real floor.
 *
 * Until S33 this offered one side only: `inward` was flipped to point at the
 * BUILDING centroid, so for an interior partition between two rooms the far
 * room's face was permanently invisible to the arranger. Measured over the
 * corpus, only **65.7 %** of floor-facing wall length was ever offered — every
 * one of the 960 partitions had a dead face, which is a large part of why the
 * rooms furthest from the centroid read as empty.
 *
 * The exterior shell is unaffected: its outward face is not walkable, so the
 * `walkable.contains` test in `fits` rejects it and the slot costs one flood
 * lookup. That is what makes "offer both and let `fits` decide" safe rather
 * than a source of furniture outside the building.
 */
function wallSlots(ctx: Ctx, depth: number): Slot[] {
  const out: Slot[] = [];
  for (const wall of ctx.walls) {
    const len = v.dist(wall.a, wall.b);
    if (len < 1.0) continue;
    const dir = v.norm(v.sub(wall.b, wall.a));
    const perp = v.perp(dir);
    const mid = v.lerp(wall.a, wall.b, 0.5);
    // The centroid-facing side FIRST, so that where both sides are floor and
    // score equally the pre-S33 choice still wins and the diff stays small.
    const towardCentroid = v.dot(perp, v.sub(ctx.centroid, mid)) < 0 ? v.scale(perp, -1) : perp;
    const sides = [towardCentroid, v.scale(towardCentroid, -1)];
    for (const inward of sides) {
      const off = depth / 2 + 0.06;
      // Skip a side with no floor behind it before generating 11 slots for it.
      if (ctx.walkable && !ctx.walkable.contains(v.add(mid, v.scale(inward, off)))) continue;
      for (let t = 0.12; t <= 0.88; t += 0.076) {
        const onWall = v.lerp(wall.a, wall.b, t);
        out.push({
          center: v.add(onWall, v.scale(inward, off)),
          rotation: Math.atan2(dir.y, dir.x),
          facing: inward,
          wallLen: len,
          t,
          free: false,
        });
      }
    }
  }
  return out;
}

/**
 * Candidate positions on open floor.
 *
 * These carry NO heading. Until S33 every open slot was emitted with the
 * CONSTANT world facing {x:0, y:-1} and `rotation: 0`, which had three
 * consequences, all measured over 8 archetypes x 60 seeds:
 *
 *   - the armchair's cone test `dot(toTv, slot.facing) < 0.2 -> reject` reduced
 *     to "is the TV NORTH of this point?", a property of which wall the TV
 *     landed on and not of the slot at all. Skip rate 0/258 when the TV was
 *     north of the room centre, **125/162 (77.2 %)** when it was south — which
 *     is 125 of the 126 skipped pieces in the whole corpus, and the message the
 *     owner screenshotted;
 *   - the facing (0,-1) and the rotation 0 were not even consistent with each
 *     other: rotation 0 puts a rect's front at (0,+1);
 *   - every open-placed piece therefore shipped at rotation 0 and faced nothing.
 *
 * `placeOne` orients a free slot per PRESET before scoring it, so the cone tests
 * became real questions instead of a compass reading.
 */
function openSlots(ctx: Ctx): Slot[] {
  const b = sceneBounds(ctx.scene);
  const out: Slot[] = [];
  for (let x = b.min.x + 0.6; x <= b.max.x - 0.6; x += 0.45) {
    for (let y = b.min.y + 0.6; y <= b.max.y - 0.6; y += 0.45) {
      out.push({ center: { x, y }, rotation: 0, facing: { x: 0, y: 1 }, wallLen: 0, t: 0.5, free: true });
    }
  }
  return out;
}

/**
 * What an open-floor piece should point at, if anything.
 *
 * Only pieces with an unambiguous anchor are listed. A plant has no front, and
 * inventing one would be motion without meaning.
 */
function openAnchor(ctx: Ctx, presetId: string, at: Vec2): Vec2 | null {
  if (presetId !== 'armchair') return null;
  const target = findRole(ctx, 'tv')?.center ?? findByLabel(ctx, 'Sofa')?.center ?? null;
  if (!target) return null;
  // ONLY an anchor in the same room. Without this a reading chair in the
  // bedroom turns to face the living room's TV through a wall — visible on the
  // contact sheet as chairs at arbitrary angles scattered through rooms that
  // have no screen in them, which is precisely the "no logic and thought" the
  // owner reported. A chair with no anchor of its own falls through to the
  // axis-alignment branch and sits square to its room.
  if (ctx.zones.length > 0 && zoneNameAt(ctx, at) !== zoneNameAt(ctx, target)) return null;
  return target;
}

/**
 * Give a free slot a real heading.
 *
 * A piece with an anchor turns to face it. A piece without one aligns its long
 * axis with the zone it stands in — a dining table in a room that is deeper than
 * it is wide should run the same way the room does, and `rotation: 0` for every
 * open piece regardless of the room was the visible half of the same bug.
 */
function orientFree(ctx: Ctx, preset: FurniturePreset, slot: Slot): Slot {
  const anchor = openAnchor(ctx, preset.id, slot.center);
  if (anchor) {
    const turn = faceToward(slot.center, anchor);
    if (turn) return { ...slot, rotation: turn.rotation, facing: turn.facing };
  }
  // A circle has no long axis, so turning it is a no-op that only costs a
  // different-looking `rotation` in the saved file.
  if (preset.kind === 'circle' || preset.w === preset.h) return slot;
  const zone = ctx.zones.find((z) => pointInRect(slot.center, z.rect));
  if (zone && zone.rect.h > zone.rect.w) {
    return { ...slot, rotation: Math.PI / 2, facing: { x: 1, y: 0 } };
  }
  return slot;
}

function minDistToPlaced(ctx: Ctx, p: Vec2): number {
  let best = 4;
  for (const o of [...ctx.placed, ...ctx.scene.objects]) {
    if (o.kind === 'wall') continue;
    if (o.kind === 'rect' && (o.role === 'window' || o.role === 'door')) continue;
    best = Math.min(best, v.dist(p, o.center));
  }
  return best;
}

function findRole(ctx: Ctx, role: RectObj['role']): RectObj | null {
  for (const o of [...ctx.placed, ...ctx.scene.objects]) {
    if (o.kind === 'rect' && o.role === role) return o;
  }
  return null;
}

function findByLabel(ctx: Ctx, label: string): RectObj | null {
  // Just-placed pieces first, then what already lives in the scene — the TV,
  // bed, and dining rules must reason about a PRE-EXISTING sofa/counter, not
  // only pieces arranged in this same run (mirrors findRole).
  for (const o of [...ctx.placed, ...ctx.scene.objects]) {
    if (o.kind === 'rect' && o.label === label) return o;
  }
  return null;
}

function nearest(points: Vec2[], p: Vec2): number {
  let best = Infinity;
  for (const q of points) best = Math.min(best, v.dist(p, q));
  return best;
}

/** Perpendicular distance from p to the ray (origin, dir), if p lies in front. */
function distToRay(p: Vec2, origin: Vec2, dir: Vec2, maxAhead: number): number {
  const rel = v.sub(p, origin);
  const ahead = v.dot(rel, dir);
  if (ahead < 0 || ahead > maxAhead) return Infinity;
  return Math.abs(-rel.x * dir.y + rel.y * dir.x);
}

/** Inward-facing unit direction for a door/window resting on a wall. */
function inwardOf(o: RectObj, centroid: Vec2): Vec2 {
  let inward = { x: -Math.sin(o.rotation), y: Math.cos(o.rotation) };
  if (v.dot(inward, v.sub(centroid, o.center)) < 0) inward = v.scale(inward, -1);
  return inward;
}

/** First-reflection points: mirror the listener across each wall and see
 *  where the speaker→mirror segment crosses that wall. Tall absorbent
 *  furniture placed there tames the early reflections that smear imaging. */
function reflectionPoints(scene: Scene, walls: WallObj[]): Vec2[] {
  const out: Vec2[] = [];
  const L = scene.listener.pos;
  for (const sp of scene.speakers) {
    for (const w of walls) {
      const d = v.norm(v.sub(w.b, w.a));
      const rel = v.sub(L, w.a);
      const along = v.dot(rel, d);
      const proj = v.add(w.a, v.scale(d, along));
      const mirror = v.add(proj, v.sub(proj, L));
      // Intersect speaker→mirror with the wall segment.
      const s1 = sp.pos;
      const s2 = mirror;
      const r = v.sub(s2, s1);
      const q = v.sub(w.b, w.a);
      const denom = r.x * q.y - r.y * q.x;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((w.a.x - s1.x) * q.y - (w.a.y - s1.y) * q.x) / denom;
      const u = ((w.a.x - s1.x) * r.y - (w.a.y - s1.y) * r.x) / denom;
      if (t > 0.05 && t < 0.95 && u >= 0 && u <= 1) {
        out.push(v.add(w.a, v.scale(q, u)));
      }
    }
  }
  return out;
}

interface Evaluated {
  score: number;
  why: string[];
}

/** Which zone names suit each preset — the “bed goes in the bedroom” layer. */
const ZONE_AFFINITY: Record<string, RegExp> = {
  bed: /bed|sleep|master|guest/i,
  wardrobe: /bed|sleep|master|guest|closet|hall/i,
  counter: /kitchen/i,
  // `living|lounge|family` belongs here, and its absence was a self-inflicted
  // mismatch rather than a preference: `inventoryFor` orders a dining table when
  // a LIVING cell is over 22 m², and this rule then charged it -0.9 for standing
  // in that same living room. Measured over the corpus, 404 of 524 dining tables
  // were ordered that way and 53.9 % of multi-room dining placements ended up
  // mismatched — 83 pushed into bedrooms and 18 into studies. Every other preset
  // was under 5 %. A dining table in a living room is an open-plan flat; a dining
  // table in a bedroom is the "no logic and thought" the owner reported.
  dining: /kitchen|dining|living|lounge|family/i,
  sofa: /living|lounge|tv|family/i,
  tv: /living|lounge|tv|family|bed/i,
  armchair: /living|lounge|tv|family|read/i,
  desk: /office|study|work|desk|bed/i,
  bookshelf: /living|office|study|read|hall/i,
};

function zoneNameAt(ctx: Ctx, p: Vec2): string | null {
  for (const z of ctx.zones) {
    if (pointInRect(p, z.rect)) return z.name;
  }
  return null;
}

/** Reward matching zones, punish clear mismatches (a bed in the Kitchen). */
function zoneAffinity(ctx: Ctx, presetId: string, p: Vec2, why: string[]): number {
  if (ctx.zones.length === 0) return 0;
  const want = ZONE_AFFINITY[presetId];
  const here = zoneNameAt(ctx, p);
  if (!want) return 0;
  const existsSomewhere = ctx.zones.some((z) => want.test(z.name));
  if (here && want.test(here)) {
    why.push(`in the ${here}`);
    return 1.6;
  }
  if (existsSomewhere) {
    // The right room exists but this slot isn't in it.
    if (here && ZONE_AFFINITY.bed.test(here) && (presetId === 'counter' || presetId === 'dining')) return -2.5;
    return -0.9;
  }
  return 0;
}

/**
 * The placement brain. Base score favors breathing room; each piece then adds
 * its own rules — function, daylight, quiet, acoustics, and feng shui.
 * Returning null rejects the slot outright.
 */
function scoreSlot(ctx: Ctx, preset: FurniturePreset, slot: Slot): Evaluated | null {
  const why: string[] = [];
  let score = Math.min(2.5, minDistToPlaced(ctx, slot.center)) * 0.6;
  score += zoneAffinity(ctx, preset.id, slot.center, why);
  const winDist = nearest(ctx.windows.map((w) => w.center), slot.center);
  const tv = findRole(ctx, 'tv');

  switch (preset.id) {
    case 'bed': {
      score += slot.wallLen * 0.25 + Math.abs(slot.t - 0.5) * 1.2;
      // Feng shui: solid wall behind the headboard — not under a window.
      if (winDist < 1.1) {
        score -= 2.4;
      } else {
        why.push('headboard on a solid wall');
      }
      for (const door of ctx.doors) {
        const inward = inwardOf(door, ctx.centroid);
        // Commanding position: see the door…
        if (v.dot(v.norm(v.sub(door.center, slot.center)), slot.facing) > 0.15) {
          score += 1.2;
          why.push('sees the door (commanding position)');
        }
        // …but never lie in its direct line ("coffin position").
        if (distToRay(slot.center, door.center, inward, 4) < 0.7) score -= 3;
        else why.push('out of the door line');
      }
      const counter = findByLabel(ctx, 'Kitchen counter');
      if (counter && v.dist(slot.center, counter.center) > 2.5) why.push('away from the kitchen');
      break;
    }
    case 'sofa': {
      if (tv) {
        const toTv = v.sub(tv.center, slot.center);
        const d = v.len(toTv);
        const facing = v.dot(v.norm(toTv), slot.facing);
        if (facing < 0.35) return null;
        score += facing * 1.5 - Math.abs(d - 2.6) * 0.6;
        why.push(`faces the TV at ${d.toFixed(1)} m`);
      }
      // Feng shui: never with its back to a door.
      for (const door of ctx.doors) {
        if (v.dot(v.norm(v.sub(door.center, slot.center)), slot.facing) < -0.5) score -= 1.5;
      }
      why.push('back protected by the wall');
      if (ctx.reflections.length > 0 && nearest(ctx.reflections, slot.center) < 0.9) {
        score += 0.8;
        why.push('its absorption softens a first reflection');
      }
      break;
    }
    case 'tv': {
      const sofa = findByLabel(ctx, 'Sofa');
      if (sofa) {
        const toSofa = v.sub(sofa.center, slot.center);
        const d = v.len(toSofa);
        const facing = v.dot(v.norm(toSofa), slot.facing);
        if (facing < 0.35) return null;
        score += facing * 2 - Math.abs(d - 2.6) * 0.8;
        why.push('opposite the seating');
      }
      // Light: a window right beside the screen means glare.
      if (winDist < 1.2) score -= 1.8;
      else why.push('clear of window glare');
      break;
    }
    case 'desk': {
      // Daylight: beside a window, light across the desk, not behind the screen.
      if (winDist < 1.8) {
        score += 1.6 - winDist * 0.4;
        why.push('by the window for daylight');
      }
      for (const door of ctx.doors) {
        if (v.dot(v.norm(v.sub(door.center, slot.center)), slot.facing) > 0.2) {
          score += 0.7;
          why.push('sees the door while you work');
          break;
        }
      }
      break;
    }
    case 'dining': {
      const counter = findByLabel(ctx, 'Kitchen counter');
      if (counter) {
        const d = v.dist(slot.center, counter.center);
        score += Math.max(0, 2 - Math.abs(d - 1.8));
        why.push('a short carry from the kitchen');
      }
      score -= v.dist(slot.center, ctx.centroid) * 0.25;
      why.push('room to pull chairs out all round');
      break;
    }
    case 'wardrobe':
    case 'cabinet':
    case 'bookshelf': {
      // Tall pieces should not steal a window's light — a heavy PENALTY, not a
      // veto. As a veto this was the second-largest source of skipped pieces
      // once the inventory started ordering to a coverage budget: a bookshelf is
      // `core` for a study, `windowRate` puts windows on half the exterior
      // edges, and in a small study no slot cleared 1 m from every window. 39 of
      // 44 remaining skips were this one rule. A bookshelf beside a window is a
      // compromise; a study with no bookshelf at all is a worse one.
      const clear = Math.max(1.0, preset.w * 0.7);
      if (winDist < clear) {
        score -= 3.2 * (1 - winDist / clear);
      } else {
        why.push('keeps every window clear');
      }
      // …and earn their keep acoustically at first-reflection points.
      if (ctx.reflections.length > 0 && nearest(ctx.reflections, slot.center) < 0.9) {
        score += 1.4;
        why.push(preset.id === 'bookshelf' ? 'diffuses a first reflection' : 'absorbs a first reflection');
      }
      break;
    }
    case 'armchair': {
      // NO hard reject. The old `if (facing < 0.2) return null` was the single
      // biggest defect in the generator, and not because 0.2 was too tight:
      // `openSlots` gave every open slot the fixed world facing (0,-1), so the
      // test asked which way NORTH was. Now `orientFree` has already turned the
      // chair toward its anchor, `facing` is ~1 by construction, and what is
      // left to decide is WHERE — which is a score, not a veto.
      const sofa = findByLabel(ctx, 'Sofa');
      if (tv) {
        const d = v.dist(slot.center, tv.center);
        // Close enough to watch, far enough not to be under it.
        score += 1.4 - Math.abs(d - 2.8) * 0.45;
        why.push(`${d.toFixed(1)} m from the screen`);
      }
      if (sofa) {
        const d = v.dist(slot.center, sofa.center);
        // Conversation distance: a chair 4 m from the sofa is two seating areas.
        score += Math.max(0, 1.2 - Math.abs(d - 2.0) * 0.7);
        why.push('within talking distance of the sofa');
        // …and never parked in the middle of the sofa's view of the screen.
        if (tv) {
          const toTv = v.sub(tv.center, sofa.center);
          const span = v.len(toTv);
          if (span > 0.1 && distToRay(slot.center, sofa.center, v.norm(toTv), span) < 0.9) {
            score -= 2.6;
          } else {
            why.push('clear of the sofa-to-TV sightline');
          }
        }
      }
      break;
    }
    case 'round-table': {
      // Reachable from the seating without being in the walkway.
      const sofa = findByLabel(ctx, 'Sofa');
      if (sofa) {
        const d = v.dist(slot.center, sofa.center);
        score += Math.max(0, 1.8 - Math.abs(d - 1.3) * 1.6);
        why.push('within reach of the sofa');
      }
      score -= v.dist(slot.center, ctx.centroid) * 0.25;
      break;
    }
    case 'plant': {
      // Feng shui: soften corners; light: drink from the window.
      let cornerDist = Infinity;
      for (const w of ctx.walls) {
        cornerDist = Math.min(cornerDist, v.dist(slot.center, w.a), v.dist(slot.center, w.b));
      }
      if (cornerDist < 1.0) {
        score += 1.2;
        why.push('softens a corner (feng shui)');
      }
      if (winDist < 1.6) {
        score += 0.8;
        why.push('light from the window');
      }
      break;
    }
    default: {
      if (preset.id === 'counter') why.push('a working wall of its own');
      break;
    }
  }
  return { score, why };
}

function placeOne(
  ctx: Ctx,
  preset: FurniturePreset,
  notes: string[],
  skipped: string[],
  optional: boolean,
): boolean {
  const isOpen = preset.place === 'open';
  const raw = isOpen ? openSlots(ctx) : wallSlots(ctx, preset.h);

  const seat = ctx.scene.listener.pos;

  let best: { slot: Slot; eval: Evaluated } | null = null;
  for (const candidateSlot of raw) {
    // Open floor near the seat belongs to the stereo pair — see SEAT_CLEARANCE.
    // Scoped to OPEN pieces on purpose: a wall piece stands against a wall,
    // where `pair.ts` cannot put a speaker anyway, and applying the same radius
    // to wall slots empties the `office` archetype outright (a 4 x 3.5 room puts
    // every wall slot 1.29 m from a centred seat).
    if (isOpen && v.dist(candidateSlot.center, seat) < SEAT_CLEARANCE) continue;
    // Orient BEFORE the fit test, not after: a rotated rect sweeps a different
    // footprint, so testing the unrotated one and then storing the rotated one
    // would let a piece be committed into a space it does not fit.
    const slot = candidateSlot.free ? orientFree(ctx, preset, candidateSlot) : candidateSlot;
    const candidate: RectObj | null =
      preset.kind === 'circle'
        ? asRect({
            id: 'c',
            kind: 'circle',
            center: slot.center,
            r: preset.w / 2,
            absorption: 0,
            label: preset.label,
            height: preset.height,
          })
        : makeRect(preset, slot.center, slot.rotation);
    if (!candidate || !fits(ctx, candidate)) continue;
    const evaluated = scoreSlot(ctx, preset, slot);
    if (!evaluated) continue;
    if (!best || evaluated.score > best.eval.score) best = { slot, eval: evaluated };
  }

  if (!best) {
    // An OPTIONAL piece that does not fit means the room filled up, which is the
    // budget working. Only a promised piece is worth interrupting the user for.
    if (!optional) {
      const note = `No spot survives the rules for a ${preset.label.toLowerCase()} — it was skipped.`;
      notes.push(note);
      skipped.push(note);
    }
    return false;
  }
  const placed: SceneObject =
    preset.kind === 'circle'
      ? {
          id: createId('circle'),
          kind: 'circle',
          center: best.slot.center,
          r: preset.w / 2,
          absorption: preset.absorption,
          label: preset.label,
          height: preset.height,
        }
      : makeRect(preset, best.slot.center, best.slot.rotation);
  ctx.placed.push(placed);
  if (best.eval.why.length > 0) {
    notes.push(`${preset.label} — ${best.eval.why.slice(0, 3).join('; ')}.`);
  }
  return true;
}

/**
 * Look at the layout and decide what furniture belongs in it — floor area,
 * named rooms, what already exists, whether there's a kitchen wall or a TV.
 * Returns a ready-to-run shopping list plus the reasoning.
 */
export function suggestInventory(scene: Scene): { items: ArrangeItem[]; reasons: string[] } {
  const b = sceneBounds(scene);
  const area = Math.max(0, (b.max.x - b.min.x) * (b.max.y - b.min.y)) * 0.85; // rough usable m²
  const roomCount = Math.max(1, scene.rooms?.length ?? 1);
  const have = new Set(
    scene.objects.flatMap((o) => (o.kind !== 'wall' && o.label ? [o.label.toLowerCase()] : [])),
  );
  const hasTv = scene.objects.some((o) => o.kind === 'rect' && o.role === 'tv');
  const hasCounter = have.has('kitchen counter') || have.has('counter');

  const counts = new Map<string, number>();
  const reasons: string[] = [];
  const want = (id: string, n: number, why: string) => {
    if (n <= 0) return;
    counts.set(id, (counts.get(id) ?? 0) + n);
    reasons.push(why);
  };

  if (!have.has('bed')) {
    want('bed', Math.min(roomCount, 2), roomCount > 1 ? 'A bed per sleeping room.' : 'Every home starts with the bed.');
    want('wardrobe', 1, 'A wardrobe next to it — tall storage doubles as bass absorption.');
  }
  if (area >= 14 && !have.has('sofa')) {
    want('sofa', 1, 'Enough floor for a living zone — sofa first.');
    if (!hasTv) want('tv', 1, 'A TV opposite the sofa gives cinema mode an anchor.');
  }
  if (area >= 10 && !have.has('desk')) want('desk', 1, 'Space by a window for a desk.');
  if (area >= 20 && !have.has('dining table')) {
    if (hasCounter) want('dining', 1, 'A dining table a short carry from the kitchen.');
    else want('round-table', 1, 'A round table for meals — no kitchen wall found, so it floats free.');
  }
  if (area >= 18 && !have.has('bookshelf')) {
    want('bookshelf', 1, 'A bookshelf earns its keep diffusing first reflections.');
  }
  if (area >= 24 && !have.has('armchair')) want('armchair', 1, 'Room to complete the conversation circle.');
  want('plant', Math.min(3, Math.max(1, Math.floor(area / 14))), 'Plants soften the corners (feng shui).');

  if (counts.size === 0) {
    reasons.push('The layout already has the essentials — nothing new needed.');
  }
  reasons.unshift(
    `Read the layout: ≈${area.toFixed(0)} m² across ${roomCount} room${roomCount === 1 ? '' : 's'}${hasTv ? ', TV present' : ''}${hasCounter ? ', kitchen wall found' : ''}.`,
  );
  return { items: [...counts.entries()].map(([presetId, count]) => ({ presetId, count })), reasons };
}

/** Order matters: anchor pieces first, fillers last. */
const PLACE_ORDER = [
  'bed',
  'wardrobe',
  'counter',
  'sofa',
  'tv',
  'desk',
  'cabinet',
  'bookshelf',
  'dining',
  'round-table',
  'armchair',
  'plant',
];

/**
 * Rule-based arrangement that reasons about function, circulation, daylight,
 * quiet, acoustics, and feng shui: door corridors stay clear, beds take the
 * commanding position on a solid wall, desks sit in the light, tall storage
 * lands on first-reflection points, plants soften corners. Every placement
 * explains itself in the notes.
 */
export function arrangeFurniture(scene: Scene, items: ArrangeItem[]): ArrangeResult {
  const walls = scene.objects.filter((o): o is WallObj => o.kind === 'wall');
  const notes: string[] = [];
  if (walls.length < 3) {
    return {
      objects: [],
      notes: ['Build the room first — the arranger anchors furniture to walls.'],
      skipped: [],
    };
  }
  const mids = walls.map((w) => v.lerp(w.a, w.b, 0.5));
  const centroid = v.scale(
    mids.reduce((acc, m) => v.add(acc, m), { x: 0, y: 0 }),
    1 / mids.length,
  );
  const rects = scene.objects.filter((o): o is RectObj => o.kind === 'rect');
  const doors = rects.filter((o) => o.role === 'door');
  const ctx: Ctx = {
    scene,
    walls,
    centroid,
    placed: [],
    windows: rects.filter((o) => o.role === 'window'),
    doors,
    corridors: doors.map((door) => {
      const inward = inwardOf(door, centroid);
      return {
        ...door,
        id: `${door.id}-corridor`,
        center: v.add(door.center, v.scale(inward, DOOR_CORRIDOR / 2 + door.h / 2)),
        w: door.w + 0.4,
        h: DOOR_CORRIDOR,
      };
    }),
    reflections: scene.speakers.length > 0 ? reflectionPoints(scene, walls) : [],
    // Doors are passable for furnishing (the whole home is one floor), but
    // the outside world is not.
    walkable: (() => {
      const r = regionOf(scene, scene.listener.pos, { doorsBlock: false });
      return r.area > 2 ? r : null;
    })(),
    zones: (scene.rooms ?? []).flatMap((r) =>
      r.w && r.h
        ? [{
            name: r.name,
            rect: {
              id: r.id, kind: 'rect' as const, center: r.at, w: r.w, h: r.h,
              rotation: 0, absorption: 0, label: r.name, role: 'furniture' as const, height: 0,
            },
          }]
        : [],
    ),
  };

  const queue: Array<{ preset: FurniturePreset; optional: boolean }> = [];
  for (const id of PLACE_ORDER) {
    const item = items.find((i) => i.presetId === id);
    const preset = FURNITURE_PRESETS.find((p) => p.id === id);
    if (!item || !preset || item.count <= 0) continue;
    for (let i = 0; i < Math.min(6, item.count); i++) {
      queue.push({ preset, optional: item.optional === true });
    }
  }
  for (const item of items) {
    const preset = FURNITURE_PRESETS.find((p) => p.id === item.presetId);
    if (preset?.place === 'manual' && item.count > 0) {
      notes.push(`${preset.label}s go on walls — drag them there yourself, they snap.`);
    }
  }
  if (queue.length === 0) {
    return { objects: [], notes: [...notes, 'Pick at least one piece of furniture to arrange.'], skipped: [] };
  }

  const skipped: string[] = [];
  let placedCount = 0;
  for (const { preset, optional } of queue) {
    if (placeOne(ctx, preset, notes, skipped, optional)) placedCount += 1;
  }
  if (placedCount > 0) {
    notes.unshift(
      `${placedCount} piece${placedCount === 1 ? '' : 's'} placed — door corridors clear, ${CLEARANCE} m walkways kept.`,
    );
    notes.push('This is a starter arrangement — drag anything to taste.');
  }
  return { objects: ctx.placed, notes, skipped };
}
