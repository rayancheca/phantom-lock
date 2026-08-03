import { describe, expect, it } from 'vitest';
import type { RectObj, Scene, SceneObject, Vec2 } from '../../../engine/types';
import { rectCorners } from '../../../engine/geometry';
import * as v from '../../../engine/vec';
import {
  COMMAND_SEAT,
  DRAG_SEAT,
  SNAP_STEP,
  WALL_SEAT_REACH_M,
  canSeatAgainstWall,
  seatObjectAgainstWall,
  WALL_ALIGN_GAP_M,
  WALL_SEAT_GAP_M,
  moveObjectTo,
  normalizeAngle,
  openingMagnetFor,
  wallSeatFor,
} from '../placement';

// ---------------------------------------------------------------------------
// Fixtures. Angles are deliberately awkward: the owner's real floorplan is
// almost entirely non-axis-aligned, so an axis-aligned corpus would test the
// one regime the feature does not exist for (the S22 "the corpus follows the
// code's guards" lesson).
// ---------------------------------------------------------------------------

const deg = (d: number) => (d * Math.PI) / 180;

/** A wall of length `len` through the origin at `angleDeg`, offset by `at`. */
const wallAt = (id: string, angleDeg: number, len: number, at: Vec2 = { x: 0, y: 0 }): SceneObject => ({
  id,
  kind: 'wall',
  a: { ...at },
  b: { x: at.x + Math.cos(deg(angleDeg)) * len, y: at.y + Math.sin(deg(angleDeg)) * len },
  absorption: 0.12,
  label: 'Wall',
  height: 2.7,
});

const piece = (w: number, h: number, role: RectObj['role'] = 'furniture') => ({ w, h, role });

const SOFA = piece(2.0, 0.9);
const BED = piece(2.0, 1.6);
const TV = piece(1.5, 0.35, 'tv');

const rect = (id: string, center: Vec2, rotation: number, w = 2.0, h = 0.9, role: RectObj['role'] = 'furniture'): SceneObject => ({
  id, kind: 'rect', center, w, h, rotation, absorption: 0.3, label: 'Sofa', role, height: 0.9,
});

const scene = (objects: SceneObject[]): Scene => ({
  objects,
  speakers: [],
  pairs: [],
  listener: { pos: { x: 3, y: 3 }, z: 1.2 },
  listeners: [{ id: 'seat-1', name: 'Couch', pos: { x: 3, y: 3 }, z: 1.2 }],
  activeListenerId: 'seat-1',
});

/**
 * A centre placed beside `w` with an exact intended FACE gap. Probing at a fixed
 * world point instead makes the real gap a function of the wall's angle, which
 * silently walks fixtures across the band edge (a 37deg wall landed at 0.354 vs a
 * 0.35 band) and tests the guard rather than the behaviour.
 *
 * `halfPerp` is always `h/2` here because the snap always puts `w` along the wall.
 */
const beside = (
  w: Extract<SceneObject, { kind: 'wall' }>,
  p: { w: number; h: number },
  alongFrac: number,
  faceGapM: number,
  side: 1 | -1 = 1,
): Vec2 => {
  const u = v.norm(v.sub(w.b, w.a));
  const n = v.scale({ x: -u.y, y: u.x }, side);
  return v.add(v.lerp(w.a, w.b, alongFrac), v.scale(n, p.h / 2 + faceGapM));
};

/** Shortest distance from a point to the infinite line through a,b. */
const perpDist = (p: Vec2, a: Vec2, b: Vec2) => {
  const u = v.norm(v.sub(b, a));
  const rel = v.sub(p, a);
  return Math.abs(-rel.x * u.y + rel.y * u.x);
};

/** The true face-to-wall clearance of a placed rect, measured from its corners. */
const faceGap = (o: RectObj, a: Vec2, b: Vec2) =>
  Math.min(...rectCorners(o).map((c) => perpDist(c, a, b)));

// ---------------------------------------------------------------------------

describe('normalizeAngle', () => {
  it('is a real modulo, not a single-step subtract like rotateSelectedRect', () => {
    // keyboard.ts:212-213 subtracts 2pi ONCE, so it cannot rescue a far-out value.
    expect(normalizeAngle(9 * Math.PI + 0.5)).toBeCloseTo(normalizeAngle(Math.PI + 0.5), 12);
    expect(normalizeAngle(-9 * Math.PI - 0.5)).toBeCloseTo(normalizeAngle(-Math.PI - 0.5), 12);
  });
  it('lands every input in (-pi, pi]', () => {
    for (let i = -50; i <= 50; i++) {
      const r = normalizeAngle(i * 0.37);
      expect(r).toBeGreaterThan(-Math.PI - 1e-12);
      expect(r).toBeLessThanOrEqual(Math.PI + 1e-12);
    }
  });
  it('returns a finite number for a non-finite input rather than propagating NaN', () => {
    // scene.ts:490 drops the whole rect when rotation is non-finite -> silent data loss.
    expect(Number.isFinite(normalizeAngle(Number.NaN))).toBe(true);
    expect(Number.isFinite(normalizeAngle(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe('wallSeatFor — the angle rule', () => {
  it('puts w ALONG the wall on every skewed angle, not on a world axis', () => {
    for (const a of [13, 22, 37, 68, 104, -11.73]) {
      const w = wallAt('w', a, 8) as Extract<SceneObject, { kind: 'wall' }>;
      const r = wallSeatFor([w], SOFA, beside(w, SOFA, 0.4, 0.05), 0, DRAG_SEAT);
      expect(r, `wall ${a}deg`).not.toBeNull();
      // |cos(theta - wallAngle)| == 1 <=> the long side runs along the wall.
      expect(Math.abs(Math.cos(r!.rotation - deg(a))), `wall ${a}deg`).toBeCloseTo(1, 9);
    }
  });

  it('THE ROTATED-BUILDING PROOF: both wall classes of a 22deg building accept a piece born at rotation 0', () => {
    // This is why the snap is nearest-PI and not nearest-PI/2. Under nearest-PI/2 a
    // piece dropped at App.tsx:446's hardcoded rotation 0 lands ACROSS the 112deg
    // walls and dragging never fixes it.
    for (const a of [22, 112]) {
      const w = wallAt('w', a, 8) as Extract<SceneObject, { kind: 'wall' }>;
      const r = wallSeatFor([w], SOFA, beside(w, SOFA, 0.4, 0.05), 0, DRAG_SEAT);
      expect(Math.abs(Math.cos(r!.rotation - deg(a))), `wall ${a}deg`).toBeCloseTo(1, 9);
    }
  });

  it('picks the nearest half-turn, so a piece already roughly aligned barely moves', () => {
    const w = wallAt('w', 30, 8) as Extract<SceneObject, { kind: 'wall' }>;
    const near = wallSeatFor([w], SOFA, beside(w, SOFA, 0.4, 0.05), deg(200), DRAG_SEAT)!;
    expect(normalizeAngle(near.rotation - deg(210))).toBeCloseTo(0, 9);
  });

  it('rotates by at most 90 degrees, whatever the starting angle', () => {
    const w = wallAt('w', 37, 8) as Extract<SceneObject, { kind: 'wall' }>;
    for (let start = -180; start <= 180; start += 7) {
      const r = wallSeatFor([w], SOFA, beside(w, SOFA, 0.4, 0.05), deg(start), DRAG_SEAT)!;
      expect(Math.abs(normalizeAngle(r.rotation - deg(start)))).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    }
  });

  it('aims a TV screen AWAY from the wall it backs onto, from either side', () => {
    // bestspot.ts:31 takes Math.abs so this is engine-invisible today; it is done
    // because it is free and correct for the scheduled 3D view. Documented, not claimed.
    const w = wallAt('w', 37, 8) as Extract<SceneObject, { kind: 'wall' }>;
    const u = v.norm(v.sub(w.b, w.a));
    const mid = v.lerp(w.a, w.b, 0.4);
    for (const side of [1, -1]) {
      // The outward normal on the side the TV actually sits.
      const n = v.scale({ x: -u.y, y: u.x }, side);
      const start = v.add(mid, v.scale(n, 0.2));
      const r = wallSeatFor([w], TV, start, 0, DRAG_SEAT)!;
      const screen = { x: -Math.sin(r.rotation), y: Math.cos(r.rotation) };
      expect(v.dot(screen, n), `side ${side}`).toBeGreaterThan(0);
    }
  });
});

describe('wallSeatFor — the seat is flush and an exact fixed point', () => {
  it('lands the near face exactly on the wall line', () => {
    for (const a of [13, 37, -11.73]) {
      const w = wallAt('w', a, 8) as Extract<SceneObject, { kind: 'wall' }>;
      const r = wallSeatFor([w], SOFA, beside(w, SOFA, 0.4, 0.05), 0, DRAG_SEAT)!;
      expect(r.seated).toBe(true);
      const placed: RectObj = { ...(rect('r', r.center, r.rotation) as RectObj) };
      expect(faceGap(placed, w.a, w.b), `wall ${a}deg`).toBeCloseTo(0, 9);
    }
  });

  it('THE FIXED POINT: re-seating a seated piece is bitwise identical', () => {
    const w = wallAt('w', -21.7, 6) as Extract<SceneObject, { kind: 'wall' }>;
    const objs = [w];
    const first = wallSeatFor(objs, SOFA, beside(w, SOFA, 0.37, 0.04), 0.31, DRAG_SEAT)!;
    const second = wallSeatFor(objs, SOFA, first.center, first.rotation, DRAG_SEAT)!;
    expect(Object.is(second.rotation, first.rotation)).toBe(true);
    expect(second.center.x).toBe(first.center.x);
    expect(second.center.y).toBe(first.center.y);
  });

  it('does not creep over 1000 re-seats', () => {
    const w = wallAt('w', 37, 8) as Extract<SceneObject, { kind: 'wall' }>;
    const objs = [w];
    let cur = wallSeatFor(objs, SOFA, beside(w, SOFA, 0.4, 0.05), 0, DRAG_SEAT)!;
    const start = cur;
    for (let i = 0; i < 1000; i++) cur = wallSeatFor(objs, SOFA, cur.center, cur.rotation, DRAG_SEAT)!;
    expect(v.dist(cur.center, start.center)).toBeLessThan(1e-9);
    expect(Object.is(cur.rotation, start.rotation)).toBe(true);
  });
});

describe('wallSeatFor — C2: the gate is on the SIGNED gap (no near edge)', () => {
  // REFUTED IN REVIEW: gating on |gap| gave the band a near edge, so pushing a
  // piece FURTHER into a wall walked it SEAT -> align -> nothing, dropping the
  // rotation back to rot0 while the piece was half-buried. Measured: a bed
  // released at 0.65 m with a 0.163 m BACKWARD jump, larger than the seat band.
  const w = wallAt('w', 13, 8) as Extract<SceneObject, { kind: 'wall' }>;
  const u = v.norm(v.sub(w.b, w.a));
  const n = { x: -u.y, y: u.x };
  const at = (off: number): Vec2 => v.add(v.add(w.a, v.scale(u, 3)), v.scale(n, off));

  it('stays SEATED when the piece is pushed past flush into the wall', () => {
    for (const off of [0.8, 0.7, 0.65, 0.45, 0.3, 0.05]) {
      const r = wallSeatFor([w], BED, at(off), 0, DRAG_SEAT);
      expect(r, `off ${off}`).not.toBeNull();
      expect(r!.seated, `off ${off}`).toBe(true);
    }
  });

  it('pulls a buried piece back OUT to flush rather than releasing it', () => {
    const r = wallSeatFor([w], BED, at(0.3), 0, DRAG_SEAT)!;
    const placed = rect('r', r.center, r.rotation, BED.w, BED.h) as RectObj;
    expect(faceGap(placed, w.a, w.b)).toBeCloseTo(0, 9);
  });

  it('never reverts rotation to rot0 while the piece overlaps the wall', () => {
    const r = wallSeatFor([w], BED, at(0.1), 0, DRAG_SEAT)!;
    expect(Math.abs(Math.cos(r.rotation - deg(13)))).toBeCloseTo(1, 9);
  });

  it('still releases at the FAR edge, so a piece across the room is untouched', () => {
    expect(wallSeatFor([w], BED, at(0.8 + WALL_ALIGN_GAP_M + 0.01), 0, DRAG_SEAT)).toBeNull();
  });

  it('aligns but does not seat between the seat band and the align band', () => {
    const r = wallSeatFor([w], BED, at(0.8 + WALL_SEAT_GAP_M + 0.05), 0, DRAG_SEAT)!;
    expect(r.seated).toBe(false);
  });
});

describe('wallSeatFor — C3: a short wall cannot capture the floor around it', () => {
  // REFUTED IN REVIEW: the accept window was 2*halfAlong WIDER than the wall, so a
  // 0.7 m closet wall got a 2.70 m window — 3.9x its own length — and acted as a
  // magnet over the surrounding floor. arrange.ts:151 already restricts its own
  // slots to t in [0.12, 0.88] for exactly this reason.
  it('does not capture a 2 m sofa parked beyond the end of a 0.7 m closet wall', () => {
    const objs = [wallAt('closet', 13, 0.7)];
    expect(wallSeatFor(objs, SOFA, { x: 2.2, y: 0.55 }, 0, DRAG_SEAT)).toBeNull();
  });

  it('clamps a piece seated on a short stub to the stub, not hanging off its end', () => {
    const w = wallAt('stub', 37, 1.4) as Extract<SceneObject, { kind: 'wall' }>;
    const u = v.norm(v.sub(w.b, w.a));
    const n = { x: -u.y, y: u.x };
    // Start beside the stub's MIDPOINT so it is genuinely captured (not vacuous),
    // then push along the wall and assert the clamp holds it on the stub.
    const start = v.add(v.add(w.a, v.scale(u, 1.25)), v.scale(n, 0.5));
    const r = wallSeatFor([w], SOFA, start, 0, DRAG_SEAT);
    expect(r, 'must be captured for this test to mean anything').not.toBeNull();
    const along = v.dot(v.sub(r!.center, w.a), u);
    const L = v.dist(w.a, w.b);
    expect(along).toBeGreaterThanOrEqual(-1e-9);
    expect(along).toBeLessThanOrEqual(L + 1e-9);
  });

  it('still seats normally against a long wall', () => {
    expect(wallSeatFor([wallAt('w', 13, 8)], SOFA, { x: 3, y: 0.55 }, 0, DRAG_SEAT)).not.toBeNull();
  });
});

describe('wallSeatFor — refusals and data safety', () => {
  it('refuses doors and windows in the PURE function, not just at the call site', () => {
    const objs = [wallAt('w', 0, 8)];
    expect(wallSeatFor(objs, piece(0.9, 0.1, 'door'), { x: 2, y: 0.2 }, 0, DRAG_SEAT)).toBeNull();
    expect(wallSeatFor(objs, piece(1.2, 0.12, 'window'), { x: 2, y: 0.2 }, 0, DRAG_SEAT)).toBeNull();
  });

  it('returns null when there is no wall at all', () => {
    expect(wallSeatFor([], SOFA, { x: 2, y: 0.5 }, 0, DRAG_SEAT)).toBeNull();
  });

  it('skips a degenerate zero-length wall instead of claiming the world horizontal', () => {
    // v.norm({0,0}) returns {0,0} and atan2(0,0) is 0 — the one answer never right
    // on a skewed plan. It must be SKIPPED, not silently treated as horizontal.
    const zero: SceneObject = {
      id: 'z', kind: 'wall', a: { x: 2, y: 0.4 }, b: { x: 2, y: 0.4 },
      absorption: 0.1, label: 'Wall', height: 2.7,
    };
    expect(wallSeatFor([zero], SOFA, { x: 2, y: 0.5 }, 0, DRAG_SEAT)).toBeNull();
  });

  it('NEVER emits a non-finite rotation or centre — that would DELETE the object', () => {
    // scene.ts:451/490/517 — isNum requires finite, so a NaN rotation makes the rect
    // fail the rect branch, fail the circle branch, and be dropped by sanitizeObject.
    const hostile: SceneObject[] = [
      wallAt('ok', 13, 8),
      { id: 'nan', kind: 'wall', a: { x: Number.NaN, y: 0 }, b: { x: 4, y: 0 }, absorption: 0.1, label: 'W', height: 2.7 },
      { id: 'inf', kind: 'wall', a: { x: 0, y: 0 }, b: { x: Number.POSITIVE_INFINITY, y: 0 }, absorption: 0.1, label: 'W', height: 2.7 },
    ];
    for (const rot of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const c of [{ x: 2, y: 0.5 }, { x: Number.NaN, y: 0.5 }]) {
        const r = wallSeatFor(hostile, SOFA, c, rot, DRAG_SEAT);
        if (r) {
          expect(Number.isFinite(r.rotation)).toBe(true);
          expect(Number.isFinite(r.center.x)).toBe(true);
          expect(Number.isFinite(r.center.y)).toBe(true);
        }
      }
    }
  });

  it('survives a fuzz of hostile inputs without ever emitting a non-finite value', () => {
    const vals = [0, 1e-12, 1e6, 1e300, -1e300, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.5];
    let checked = 0;
    for (const ax of vals) for (const by of vals) for (const cx of vals) {
      const objs = [{ id: 'w', kind: 'wall' as const, a: { x: ax, y: 0 }, b: { x: 4, y: by }, absorption: 0.1, label: 'W', height: 2.7 }];
      const r = wallSeatFor(objs, SOFA, { x: cx, y: 0.5 }, 0.3, DRAG_SEAT);
      if (r) {
        expect(Number.isFinite(r.rotation)).toBe(true);
        expect(Number.isFinite(r.center.x) && Number.isFinite(r.center.y)).toBe(true);
      }
      checked++;
    }
    expect(checked).toBe(vals.length ** 3);
  });
});

describe('moveObjectTo — the drag, end to end', () => {
  const s = scene([wallAt('w', 13, 8), rect('sofa', { x: 3, y: 0.55 }, 0)]);

  it('seats a dragged sofa flush against a skewed wall', () => {
    const out = moveObjectTo(s, 'sofa', { x: 3, y: 0.72 }, 0, { snapOn: true, seat: DRAG_SEAT });
    const o = out.scene.objects.find((x) => x.id === 'sofa') as RectObj;
    const w = s.objects[0] as Extract<SceneObject, { kind: 'wall' }>;
    expect(faceGap(o, w.a, w.b)).toBeCloseTo(0, 9);
    expect(out.guide?.seated).toBe(true);
  });

  it('THE ANTI-RATCHET: Shift restores the exact pre-drag rotation float', () => {
    // SWEEP, do not probe one value. The first cut of this test used 0.4211 alone
    // and passed against a normalizeAngle round-trip that is NOT bit-exact — 12.1 %
    // of already-in-range values come back perturbed, and 0.4211 happens to be one
    // of the 87.9 % that survive. -2.1410631454196234 is a measured failing value
    // and is pinned here by name so the round-trip cannot come back.
    const probes = [0.4211, -2.1410631454196234, 0, Math.PI, -Math.PI + 1e-9, 1.2345678901234];
    for (let i = 0; i < 400; i++) probes.push(-Math.PI + (2 * Math.PI * i) / 400);
    for (const rot0 of probes) {
      const out = moveObjectTo(s, 'sofa', { x: 3, y: 0.72 }, rot0, { snapOn: true, seat: null });
      const o = out.scene.objects.find((x) => x.id === 'sofa') as RectObj;
      expect(Object.is(o.rotation, rot0), `rot0 ${rot0}`).toBe(true);
      expect(out.guide).toBeNull();
    }
  });

  it('still refuses to write a NON-FINITE rotation, which would delete the object', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const out = moveObjectTo(s, 'sofa', { x: 3, y: 7 }, bad, { snapOn: true, seat: null });
      const o = out.scene.objects.find((x) => x.id === 'sofa') as RectObj;
      expect(Number.isFinite(o.rotation), `rot0 ${bad}`).toBe(true);
    }
  });

  it('leaves rot0 bit-exact after a tour past a wall with NO wall in the scene at all', () => {
    const bare = scene([rect('sofa', { x: 3, y: 0.55 }, 0)]);
    const rot0 = -2.1410631454196234;
    const out = moveObjectTo(bare, 'sofa', { x: 4, y: 2 }, rot0, { snapOn: true, seat: DRAG_SEAT });
    const o = out.scene.objects.find((x) => x.id === 'sofa') as RectObj;
    expect(Object.is(o.rotation, rot0)).toBe(true);
  });

  it('restores rot0 exactly after touring past a wall and leaving its field', () => {
    const rot0 = -0.1234;
    const near = moveObjectTo(s, 'sofa', { x: 3, y: 0.72 }, rot0, { snapOn: true, seat: DRAG_SEAT });
    expect((near.scene.objects.find((x) => x.id === 'sofa') as RectObj).rotation).not.toBe(rot0);
    const away = moveObjectTo(s, 'sofa', { x: 3, y: 7 }, rot0, { snapOn: true, seat: DRAG_SEAT });
    expect(Object.is((away.scene.objects.find((x) => x.id === 'sofa') as RectObj).rotation, rot0)).toBe(true);
  });

  it('C5: honours settings.snap — the along-wall coordinate is NOT quantised with snap off', () => {
    const on = moveObjectTo(s, 'sofa', { x: 3.031, y: 0.72 }, 0, { snapOn: true, seat: DRAG_SEAT });
    const off = moveObjectTo(s, 'sofa', { x: 3.031, y: 0.72 }, 0, { snapOn: false, seat: DRAG_SEAT });
    const a = on.scene.objects.find((x) => x.id === 'sofa') as RectObj;
    const b = off.scene.objects.find((x) => x.id === 'sofa') as RectObj;
    expect(a.center).not.toEqual(b.center);
  });

  it('leaves a circle position-only — it has no rotation to snap', () => {
    const cs = scene([
      wallAt('w', 13, 8),
      { id: 'tbl', kind: 'circle', center: { x: 3, y: 0.5 }, r: 0.5, absorption: 0.3, label: 'Table', height: 0.75 },
    ]);
    const out = moveObjectTo(cs, 'tbl', { x: 3.031, y: 0.523 }, 0, { snapOn: true, seat: DRAG_SEAT });
    const o = out.scene.objects.find((x) => x.id === 'tbl');
    expect(o?.kind).toBe('circle');
    expect((o as Extract<SceneObject, { kind: 'circle' }>).center.x).toBeCloseTo(3.05, 9);
    expect((o as Extract<SceneObject, { kind: 'circle' }>).center.y).toBeCloseTo(0.5, 9);
    expect(out.guide).toBeNull();
  });

  it('does not mutate the input scene and leaves every other object referentially identical', () => {
    const before = s.objects[0];
    const out = moveObjectTo(s, 'sofa', { x: 3, y: 0.72 }, 0, { snapOn: true, seat: DRAG_SEAT });
    expect(s.objects[1]).toMatchObject({ center: { x: 3, y: 0.55 } });
    expect(out.scene.objects[0]).toBe(before);
  });

  it('returns the same scene reference for an unknown id', () => {
    expect(moveObjectTo(s, 'nope', { x: 1, y: 1 }, 0, { snapOn: true, seat: DRAG_SEAT }).scene).toBe(s);
  });
});

describe('openingMagnetFor — CHARACTERIZATION ORACLE for the lifted door magnet', () => {
  // The door/window magnet shipped inside SimCanvas.tsx with ZERO coverage. Before
  // moving it, pin it: this is the pre-extraction branch copied VERBATIM, and the
  // extracted function must agree with it bit-for-bit on randomised input.
  const legacy = (objects: readonly SceneObject[], center: Vec2) => {
    let bestWall: { point: Vec2; angle: number; dist: number } | null = null;
    for (const w of objects) {
      if (w.kind !== 'wall') continue;
      const ab = v.sub(w.b, w.a);
      const l2 = v.dot(ab, ab);
      const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, v.dot(v.sub(center, w.a), ab) / l2));
      const point = v.add(w.a, v.scale(ab, t));
      const dist = v.dist(center, point);
      if (dist < 0.35 && (!bestWall || dist < bestWall.dist)) {
        bestWall = { point, angle: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x), dist };
      }
    }
    return bestWall ? { center: bestWall.point, rotation: bestWall.angle } : null;
  };

  it('is bit-identical to the pre-extraction branch over 5000 randomised cases', () => {
    let seed = 20260728;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let agreed = 0;
    let magnetised = 0;
    for (let i = 0; i < 5000; i++) {
      const objs: SceneObject[] = [];
      for (let k = 0, n = 1 + Math.floor(rnd() * 4); k < n; k++) {
        objs.push({
          id: `w${k}`, kind: 'wall',
          a: { x: rnd() * 6 - 3, y: rnd() * 6 - 3 },
          b: { x: rnd() * 6 - 3, y: rnd() * 6 - 3 },
          absorption: 0.1, label: 'W', height: 2.7,
        });
      }
      const c = { x: rnd() * 6 - 3, y: rnd() * 6 - 3 };
      const want = legacy(objs, c);
      const got = openingMagnetFor(objs, c);
      if (want === null) expect(got).toBeNull();
      else {
        expect(got).not.toBeNull();
        expect(Object.is(got!.center.x, want.center.x)).toBe(true);
        expect(Object.is(got!.center.y, want.center.y)).toBe(true);
        expect(Object.is(got!.rotation, want.rotation)).toBe(true);
        magnetised++;
      }
      agreed++;
    }
    expect(agreed).toBe(5000);
    // The oracle is worthless if the magnet never fired — prove it exercised it.
    expect(magnetised).toBeGreaterThan(200);
  });

  it('keeps a door STRADDLING the wall — centre on the line, full wall angle', () => {
    const objs = [wallAt('w', 37, 8)];
    const r = openingMagnetFor(objs, { x: 2, y: 1.6 })!;
    expect(r, 'probe must be within the 0.35 m magnet radius').not.toBeNull();
    const w = objs[0] as Extract<SceneObject, { kind: 'wall' }>;
    expect(perpDist(r.center, w.a, w.b)).toBeCloseTo(0, 9);
    expect(r.rotation).toBeCloseTo(deg(37), 9);
  });
});

describe('moveObjectTo — doors keep their own magnet, unchanged', () => {
  it('magnetises a dragged door onto the wall line, not beside it', () => {
    const s = scene([wallAt('w', 37, 8), rect('door', { x: 2, y: 1.4 }, 0, 0.9, 0.1, 'door')]);
    const out = moveObjectTo(s, 'door', { x: 2, y: 1.45 }, 0, { snapOn: true, seat: DRAG_SEAT });
    const o = out.scene.objects.find((x) => x.id === 'door') as RectObj;
    const w = s.objects[0] as Extract<SceneObject, { kind: 'wall' }>;
    expect(perpDist(o.center, w.a, w.b)).toBeCloseTo(0, 9);
    expect(o.rotation).toBeCloseTo(deg(37), 9);
  });

  it('lets a door dragged away from every wall move freely, keeping its rotation', () => {
    const s = scene([wallAt('w', 37, 8), rect('door', { x: 2, y: 1.4 }, 0.5, 0.9, 0.1, 'door')]);
    const out = moveObjectTo(s, 'door', { x: 20, y: 20 }, 0.5, { snapOn: true, seat: DRAG_SEAT });
    const o = out.scene.objects.find((x) => x.id === 'door') as RectObj;
    expect(o.center.x).toBeCloseTo(20, 9);
    expect(o.center.y).toBeCloseTo(20, 9);
    expect(o.rotation).toBe(0.5);
  });

  it('SNAP_STEP is still the shared 5 cm step', () => expect(SNAP_STEP).toBe(0.05));
});

// ---------------------------------------------------------------------------
// S32 — the EXPLICIT seat command (§4b).
//
// Three properties are load-bearing here and each was forced by a measurement,
// not chosen:
//
//   1. `COMMAND_SEAT`'s reach is 1.2 m — 3.4x the drag band — which re-opens the
//      C3 short-wall capture hazard S23 closed. Measured on a 0.70 m closet stub
//      with a 2.0x0.9 sofa, the one-sided capture area grows 1.20 -> 3.28 m² and
//      a sofa 1.65 m CLEAR of the stub is teleported 1.365 m. So the command band
//      additionally requires the piece to be CONTAINED along the wall.
//   2. The command must be IDEMPOTENT — a second press is a no-op returning the
//      same scene ref, or it pushes a phantom undo entry (the S14 lesson).
//   3. `wallSeatFor` quantises the along coordinate and THEN clamps, so when the
//      clamp fires the output is `margin`, generally NOT a grid multiple.
//      Measured on off-grid wall lengths: 14.3 % of seated results move by up to
//      1.5 cm on re-application. It converges after one step, so it is a settle
//      rather than a drift — but it defeats the same-ref contract above.
// ---------------------------------------------------------------------------

describe('S32 — COMMAND_SEAT and the explicit seat command', () => {
  it('COMMAND_SEAT reaches further than the drag band', () => {
    expect(WALL_SEAT_REACH_M).toBeGreaterThan(WALL_ALIGN_GAP_M);
    expect(COMMAND_SEAT.alignGap).toBe(WALL_SEAT_REACH_M);
  });

  it('can never return seated:false — alignGap and seatGap are the SAME operand', () => {
    // `gap <= alignGap` has already returned true when `seated = gap <= seatGap`
    // is evaluated, so with identical operands the second is bit-identical to the
    // first. A structural property, not a corpus coincidence — but a caller that
    // rendered an unseated result would spin the piece in place without moving it.
    expect(COMMAND_SEAT.seatGap).toBe(COMMAND_SEAT.alignGap);
    const objs = [wallAt('w', 22, 6)];
    let n = 0;
    for (let a = -2; a <= 8; a += 0.13) {
      for (let off = 0.02; off <= 2.2; off += 0.07) {
        const c = { x: a * Math.cos(deg(22)) - off * Math.sin(deg(22)), y: a * Math.sin(deg(22)) + off * Math.cos(deg(22)) };
        const s = wallSeatFor(objs, SOFA, c, 0, COMMAND_SEAT);
        if (s) { n++; expect(s.seated).toBe(true); }
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('THE C3 HAZARD: a 0.70 m closet stub does NOT capture a sofa 1.65 m clear of it', () => {
    // Without the containment rule this is a 1.365 m teleport, on a one-shot key
    // with no pointer feedback to steer it back.
    const stub = [wallAt('w', 0, 0.7)];
    expect(wallSeatFor(stub, SOFA, { x: 1.0, y: 1.65 }, 0, COMMAND_SEAT)).toBeNull();
    expect(wallSeatFor(stub, SOFA, { x: 1.0, y: 1.0 }, 0, COMMAND_SEAT)).toBeNull();
  });

  it('but a real wall still seats a piece parked well out in the room', () => {
    // The containment rule must bite ONLY on short walls. Measured: it is a
    // literal no-op for every wall >= 2.4 m.
    const w = [wallAt('w', 13, 4.0)];
    for (const p of [SOFA, BED, piece(1.4, 0.8), piece(0.9, 0.6)]) {
      const along = 2.0, off = 0.9 + p.h / 2;
      const c = { x: along * Math.cos(deg(13)) - off * Math.sin(deg(13)), y: along * Math.sin(deg(13)) + off * Math.cos(deg(13)) };
      const s = wallSeatFor(w, p, c, 0, COMMAND_SEAT);
      expect(s).not.toBeNull();
      expect(s!.seated).toBe(true);
    }
  });

  it('is a FIXED POINT on off-grid wall lengths — the shipped quantise-then-clamp settle', () => {
    // Off-grid `L` and `w` so that `margin = min(halfAlong, L/2)` is not a grid
    // multiple. An on-grid corpus cannot see this at all.
    let tested = 0;
    for (const L of [0.73, 0.91, 1.13, 1.37, 1.71, 2.13, 2.37, 3.31]) {
      for (const [w, h] of [[2.03, 0.91], [1.97, 1.63], [1.43, 0.83], [1.19, 0.87], [0.93, 0.61]]) {
        const objs = [wallAt('w', 0, L)];
        const p = piece(w, h);
        for (let ax = -1.5; ax <= L + 1.5; ax += 0.031) {
          const s1 = wallSeatFor(objs, p, { x: ax, y: h / 2 + 0.05 }, 0, DRAG_SEAT);
          if (!s1?.seated) continue;
          tested++;
          const s2 = wallSeatFor(objs, p, s1.center, s1.rotation, DRAG_SEAT);
          expect(s2).not.toBeNull();
          expect(v.dist(s2!.center, s1.center)).toBeLessThan(1e-9);
        }
      }
    }
    expect(tested).toBeGreaterThan(1000);
  });

  it('seatObjectAgainstWall returns the SAME REF when nothing would change', () => {
    // (3, 1.5) is a face gap of 0.337 m — inside the 1.2 m reach. (3, 3) measures
    // 1.798 m and is correctly refused, which is a different test.
    const s = scene([wallAt('w', 13, 6), rect('r', { x: 3, y: 1.5 }, 0)]);
    const once = seatObjectAgainstWall(s, 'r');
    expect(once).not.toBe(s);
    expect(seatObjectAgainstWall(once, 'r')).toBe(once);
  });

  it('refuses a piece BEYOND the reach — 1.2 m is a real bound, not decoration', () => {
    // The same fixture the same-ref test uses, moved out to a 1.798 m face gap.
    const s = scene([wallAt('w', 13, 6), rect('r', { x: 3, y: 3 }, 0)]);
    expect(seatObjectAgainstWall(s, 'r')).toBe(s);
    expect(canSeatAgainstWall(s, 'r')).toBe(false);
  });

  it('seatObjectAgainstWall refuses a wall, a circle, an opening and a missing id', () => {
    const s = scene([
      wallAt('w', 13, 6),
      rect('door', { x: 2, y: 0.4 }, 0, 0.9, 0.1, 'door'),
      rect('win', { x: 3, y: 0.4 }, 0, 0.9, 0.1, 'window'),
      { id: 'c', kind: 'circle', center: { x: 3, y: 1 }, r: 0.4, absorption: 0.2, label: 'Plant', height: 1 },
    ]);
    for (const id of ['w', 'door', 'win', 'c', 'nope']) {
      expect(seatObjectAgainstWall(s, id)).toBe(s);
    }
  });

  it('canSeatAgainstWall is FALSE on an ALREADY-SEATED piece — the one case the two can differ', () => {
    // An independent predicate ("is there a candidate wall?") reads TRUE here,
    // because `wallSeatFor` does return a seat — it is just the seat the piece is
    // already in. The button would be enabled and do nothing. A position sweep
    // cannot find this: no arbitrary probe lands exactly flush. Measured as a
    // negative control — the independent form passes all 49 other tests.
    const s = scene([wallAt('w', 13, 6), rect('r', { x: 3, y: 1.5 }, 0)]);
    expect(canSeatAgainstWall(s, 'r')).toBe(true);
    const seated = seatObjectAgainstWall(s, 'r');
    expect(canSeatAgainstWall(seated, 'r')).toBe(false);
  });

  it('canSeatAgainstWall agrees with seatObjectAgainstWall on every case', () => {
    // A disagreement is an enabled button that does nothing — the S14 defect.
    const objs = [wallAt('w', 13, 6)];
    for (let x = -2; x <= 8; x += 0.37) {
      for (let y = -2; y <= 4; y += 0.31) {
        const s = scene([...objs, rect('r', { x, y }, 0)]);
        expect(canSeatAgainstWall(s, 'r')).toBe(seatObjectAgainstWall(s, 'r') !== s);
      }
    }
  });

  it('a seated piece is FLUSH — its nearest face touches the wall line', () => {
    const w = wallAt('w', -11.73, 5);
    const s = scene([w, rect('r', { x: 2, y: 1.0 }, 0)]);   // face gap 0.936 m
    const out = seatObjectAgainstWall(s, 'r');
    const o = out.objects.find((x) => x.id === 'r') as RectObj;
    const wall = w as Extract<SceneObject, { kind: 'wall' }>;
    expect(faceGap(o, wall.a, wall.b)).toBeCloseTo(0, 9);
  });

  it('leaves every OTHER object identical — it maps exactly one', () => {
    const s = scene([wallAt('w', 13, 6), rect('a', { x: 3, y: 3 }, 0), rect('b', { x: 4, y: 3.5 }, 0.3)]);
    const out = seatObjectAgainstWall(s, 'a');
    expect(out.objects.find((x) => x.id === 'b')).toBe(s.objects.find((x) => x.id === 'b'));
    expect(out.speakers).toBe(s.speakers);
  });
});
