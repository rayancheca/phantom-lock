/**
 * Tests for the MEASURING INSTRUMENT, not for the generator.
 *
 * The S22 lesson, verbatim: if the instrument is wrong, every other number in
 * the session is wrong and nothing else notices. So every sub-score is checked
 * against a hand-built input whose answer is known by ARITHMETIC, and each one
 * has a negative control that must score badly.
 *
 * These deliberately do NOT call `generateDesign`. A test that scores the thing
 * under test cannot tell you whether the scorer or the generator moved.
 */

import { describe, expect, it } from 'vitest';
import {
  ASPECT_MAX,
  DENSITY_ANCHOR,
  FACING_MIN,
  band,
  frontOf,
  intersectionArea,
  meanScore,
  scoreDesign,
} from './design-score';
import type { RectObj, Scene, SceneObject, Vec2 } from '../../types';
import { apartmentScene, blankScene, updateActiveListener } from '../../scene';

/** A closed axis-aligned box of walls — the smallest thing `regionOf` can flood. */
function box(w: number, h: number): SceneObject[] {
  const c: Vec2[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  return c.map((a, i) => ({
    id: `w${i}`,
    kind: 'wall' as const,
    a,
    b: c[(i + 1) % 4],
    absorption: 0.12,
    label: 'Wall',
    height: 2.6,
  }));
}

function rect(label: string, center: Vec2, w: number, h: number, rotation = 0, role: RectObj['role'] = 'furniture'): RectObj {
  return { id: `r-${label}-${center.x}-${center.y}`, kind: 'rect', center, w, h, rotation, absorption: 0.5, label, role, height: 0.8 };
}

/** A scene: a w x h box, a seat at its centre, plus whatever you pass in. */
function sceneWith(w: number, h: number, extra: SceneObject[], rooms?: Scene['rooms']): Scene {
  const s = updateActiveListener(blankScene(), { pos: { x: w / 2, y: h / 2 } });
  return { ...s, objects: [...box(w, h), ...extra], rooms: rooms ?? [] };
}

describe('band', () => {
  it('is 1 at the anchor, 0 at the tolerance, and linear between — checkable by hand', () => {
    expect(band(0.3, 0.3, 0.2)).toBe(1);
    // `toBeCloseTo`, not `toBe`: 0.1 - 0.3 is -0.19999999999999998, so the
    // endpoint lands 1.1e-16 above zero. A scorer is a real-valued measurement
    // and an exact-equality assertion on one is a flake waiting to happen.
    expect(band(0.5, 0.3, 0.2)).toBeCloseTo(0, 12);
    expect(band(0.1, 0.3, 0.2)).toBeCloseTo(0, 12);
    expect(band(0.4, 0.3, 0.2)).toBeCloseTo(0.5, 12);
    expect(band(0.2, 0.3, 0.2)).toBeCloseTo(0.5, 12);
  });

  it('CLAMPS rather than going negative, so one wild room cannot drag a mean below zero', () => {
    expect(band(10, 0.3, 0.2)).toBe(0);
    expect(band(-10, 0.3, 0.2)).toBe(0);
  });
});

describe('density — a BAND, so the scorer cannot be gamed by ordering more furniture', () => {
  // A 10 x 10 box is 100 m² of floor.  `regionOf` measures the walkable area on
  // a 0.3 m grid and reports slightly more than 100 (it counts the boundary
  // row), so the assertions below are all relative to the MEASURED area rather
  // than to the nominal 100 — which is exactly why `detail.coverage` exists.
  it('peaks at the Maple Court anchor', () => {
    // One piece whose footprint is DENSITY_ANCHOR of the measured floor.
    const probe = scoreDesign(sceneWith(10, 10, []), 0, false);
    const target = probe.detail.walkableM2 * DENSITY_ANCHOR;
    const side = Math.sqrt(target);
    const s = scoreDesign(sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, side, side)]), 1, false);
    expect(s.detail.coverage).toBeCloseTo(DENSITY_ANCHOR, 6);
    expect(s.density).toBeCloseTo(1, 6);
  });

  it('THE POINT: an OVERSTUFFED room scores as badly as an empty one', () => {
    const probe = scoreDesign(sceneWith(10, 10, []), 0, false);
    const empty = scoreDesign(sceneWith(10, 10, []), 0, false);
    // Twice the anchor is 57.8 % coverage — a storage unit, not a room.
    const side = Math.sqrt(probe.detail.walkableM2 * DENSITY_ANCHOR * 2);
    const stuffed = scoreDesign(sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, side, side)]), 1, false);
    expect(empty.density).toBe(0);
    expect(stuffed.density).toBe(0);
    // and both are strictly worse than the anchor
    expect(stuffed.density).toBeLessThan(1);
  });

  it('a circle is scored by its true area, not by its bounding box', () => {
    const r = 1;
    const s = scoreDesign(
      sceneWith(10, 10, [{ id: 'c', kind: 'circle', center: { x: 5, y: 5 }, r, absorption: 0.5, label: 'Plant', height: 1.5 }]),
      1,
      false,
    );
    expect(s.detail.footprintM2).toBeCloseTo(Math.PI * r * r, 9);
  });

  it('does NOT count doors and windows as furniture — they occupy no floor', () => {
    const withOpenings = sceneWith(10, 10, [
      rect('Door', { x: 5, y: 0 }, 0.9, 0.1, 0, 'door'),
      rect('Window', { x: 0, y: 5 }, 1.2, 0.12, Math.PI / 2, 'window'),
    ]);
    expect(scoreDesign(withOpenings, 0, false).detail.footprintM2).toBe(0);
  });
});

describe('intersectionArea — the sub-routine my own scratch probe got WRONG', () => {
  const sq = (cx: number, cy: number, s = 1): Vec2[] => [
    { x: cx - s / 2, y: cy - s / 2 },
    { x: cx + s / 2, y: cy - s / 2 },
    { x: cx + s / 2, y: cy + s / 2 },
    { x: cx - s / 2, y: cy + s / 2 },
  ];

  it('gives two unit squares offset by (0.5, 0.5) exactly 0.25 m²', () => {
    expect(intersectionArea(sq(0, 0), sq(0.5, 0.5))).toBeCloseTo(0.25, 12);
  });

  it('is 0 for disjoint squares and full for identical ones', () => {
    expect(intersectionArea(sq(0, 0), sq(5, 5))).toBe(0);
    expect(intersectionArea(sq(0, 0), sq(0, 0))).toBeCloseTo(1, 12);
  });

  it('THE BUG: the answer must not depend on the clip polygon WINDING', () => {
    // The first cut of this omitted the re-orientation, kept the OUTSIDE
    // half-plane on every edge, and dutifully reported that the hand-authored
    // demo contained zero overlaps. A harness that finds nothing because it is
    // broken looks exactly like a harness that finds nothing (TRAP 22).
    const cw = sq(0.5, 0.5);
    const ccw = [...cw].reverse();
    expect(intersectionArea(sq(0, 0), cw)).toBeCloseTo(0.25, 12);
    expect(intersectionArea(sq(0, 0), ccw)).toBeCloseTo(0.25, 12);
    expect(intersectionArea(ccw, sq(0, 0))).toBeCloseTo(0.25, 12);
  });

  it('handles a ROTATED rect, which is the whole reason a bounding box will not do', () => {
    // A unit square turned 45 deg, centred on another unit square. The rotated
    // one is entirely inside the axis-aligned one's circumcircle but pokes out
    // of its edges; the true shared area is the regular octagon 2(sqrt2 - 1).
    // Circumradius of a unit square is sqrt(2)/2, and turning it 45 deg puts a
    // VERTEX on each axis. (Writing the angles as pi/4 + i*pi/2 with that same
    // radius reproduces the ORIGINAL square's corners — which is what the first
    // version of this test did, and it then "passed" nothing.)
    const rot: Vec2[] = [0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2;
      return { x: Math.cos(a) * Math.SQRT1_2, y: Math.sin(a) * Math.SQRT1_2 };
    });
    expect(intersectionArea(rot, sq(0, 0))).toBeCloseTo(2 * (Math.SQRT2 - 1), 9);
  });
});

describe('placement', () => {
  it('is placed / requested, and 1 when nothing was asked for', () => {
    const s = sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, 2, 0.9), rect('Bed', { x: 2, y: 2 }, 2, 1.6)]);
    expect(scoreDesign(s, 4, false).placement).toBe(0.5);
    expect(scoreDesign(s, 2, false).placement).toBe(1);
    expect(scoreDesign(s, 0, false).placement).toBe(1);
  });

  it('CLAMPS at 1 — placing more than was requested is not extra credit', () => {
    const s = sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, 2, 0.9), rect('Bed', { x: 2, y: 2 }, 2, 1.6)]);
    expect(scoreDesign(s, 1, false).placement).toBe(1);
  });
});

describe('programme — does a room hold what its NAME promises', () => {
  const rooms = (name: string) => [{ id: 'z', name, at: { x: 5, y: 5 }, w: 8, h: 8 }];

  it('scores 1 when the bedroom has a bed and 0 when it does not', () => {
    const withBed = sceneWith(10, 10, [rect('Bed', { x: 5, y: 5 }, 2, 1.6)], rooms('Bedroom'));
    const without = sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, 2, 0.9)], rooms('Bedroom'));
    expect(scoreDesign(withBed, 1, false).programme).toBe(1);
    expect(scoreDesign(without, 1, false).programme).toBe(0);
    expect(scoreDesign(without, 1, false).detail.programmeMisses).toEqual(['Bedroom wants a bed']);
  });

  it('THE TRAP: a bed in the WRONG room does not satisfy the right one', () => {
    // Two zones side by side; the bed sits in the living room half.
    const two: Scene['rooms'] = [
      { id: 'a', name: 'Bedroom', at: { x: 2.5, y: 5 }, w: 5, h: 10 },
      { id: 'b', name: 'Living room', at: { x: 7.5, y: 5 }, w: 5, h: 10 },
    ];
    const s = sceneWith(10, 10, [rect('Bed', { x: 7.5, y: 5 }, 2, 1.6), rect('Sofa', { x: 7.5, y: 8 }, 2, 0.9)], two);
    const got = scoreDesign(s, 2, false);
    expect(got.detail.programmeMisses).toEqual(['Bedroom wants a bed']);
    expect(got.programme).toBe(0.5);
  });

  it('is 1 for a scene with no named rooms — nothing was promised', () => {
    expect(scoreDesign(sceneWith(10, 10, []), 0, false).programme).toBe(1);
  });
});

describe('orientation — the sub-score the armchair bug would have failed', () => {
  const tvAt = (p: Vec2) => rect('TV (on stand)', p, 1.5, 0.35, 0, 'tv');

  it('scores 1 for a piece pointing AT its anchor and 0 for one pointing across it', () => {
    // TV at (5,1); armchair at (5,7).  To face the TV the armchair's front must
    // point in -y, i.e. local +y = (0,-1) => rotation = atan2(-0,-1) = pi.
    const facing = sceneWith(10, 10, [tvAt({ x: 5, y: 1 }), rect('Armchair', { x: 5, y: 7 }, 0.9, 0.9, Math.PI)]);
    expect(scoreDesign(facing, 2, false).orientation).toBe(1);

    // Rotated a quarter turn, its front points along +x — square across the TV.
    const across = sceneWith(10, 10, [tvAt({ x: 5, y: 1 }), rect('Armchair', { x: 5, y: 7 }, 0.9, 0.9, Math.PI / 2)]);
    expect(scoreDesign(across, 2, false).orientation).toBe(0);
  });

  it('accepts a HALF TURN, because a rect is symmetric and the app draws no front', () => {
    // rotation 0 => front = (0,1) => pointing AWAY from a TV that is at -y.
    // The absolute dot is still 1, and on screen the two are indistinguishable,
    // so scoring the signed dot would fail pieces for a reason no user can see.
    const s = sceneWith(10, 10, [tvAt({ x: 5, y: 1 }), rect('Armchair', { x: 5, y: 7 }, 0.9, 0.9, 0)]);
    expect(scoreDesign(s, 2, false).orientation).toBe(1);
  });

  it('is STRICTER than the arranger it measures — a slot that just clears the 0.2 cone still fails', () => {
    // The arranger accepts an armchair at dot >= 0.2 (78 deg off).  At 70 deg
    // off, cos = 0.342: past the arranger's gate, short of FACING_MIN.
    expect(FACING_MIN).toBeGreaterThan(0.35);
    const angle = Math.acos(0.342);
    // Armchair at the origin of a frame where the TV lies at bearing `angle`
    // from its front.  Front points +y (rotation 0); put the TV accordingly.
    const chair = { x: 5, y: 5 };
    const tv = { x: chair.x + Math.sin(angle) * 3, y: chair.y + Math.cos(angle) * 3 };
    const s = sceneWith(10, 10, [tvAt(tv), rect('Armchair', chair, 0.9, 0.9, 0)]);
    expect(scoreDesign(s, 2, false).orientation).toBe(0);
  });

  it('is 1 when there is nothing to face — an armchair with no TV is not a failure', () => {
    const s = sceneWith(10, 10, [rect('Armchair', { x: 5, y: 5 }, 0.9, 0.9, 0)]);
    expect(scoreDesign(s, 1, false).orientation).toBe(1);
    expect(scoreDesign(s, 1, false).detail.orientationMisses).toEqual([]);
  });

  it('frontOf agrees with the rotation convention arrange.ts uses for a wall slot', () => {
    // `inwardOf` in arrange.ts is {x:-sin(r), y:cos(r)}; frontOf must be the
    // same vector or the instrument is measuring a different axis than the code.
    for (const r of [0, 0.3, 1.1, -2.2, Math.PI]) {
      const f = frontOf(rect('x', { x: 0, y: 0 }, 1, 1, r));
      expect(f.x).toBeCloseTo(-Math.sin(r), 12);
      expect(f.y).toBeCloseTo(Math.cos(r), 12);
    }
  });
});

describe('reach and proportion', () => {
  it('flags a room the walkable region cannot get to', () => {
    // A sealed inner box in one corner. THE SEAT MUST BE OUTSIDE IT — the flood
    // starts at the listener, so seeding it inside the vault inverts the answer
    // and reports the living room as the unreachable one. (My first fixture did
    // exactly that: `sceneWith` centres the seat, and the seat landed inside.)
    const shift = (w: SceneObject, i: number): SceneObject => {
      const wall = w as Extract<SceneObject, { kind: 'wall' }>;
      return {
        ...wall,
        id: `i${i}`,
        a: { x: wall.a.x + 8, y: wall.a.y + 8 },
        b: { x: wall.b.x + 8, y: wall.b.y + 8 },
      };
    };
    const inner: SceneObject[] = box(3, 3).map(shift);
    const s = sceneWith(12, 12, inner, [
      { id: 'a', name: 'Living room', at: { x: 3, y: 3 }, w: 4, h: 4 },
      { id: 'b', name: 'Vault', at: { x: 9.5, y: 9.5 }, w: 2, h: 2 },
    ]);
    const got = scoreDesign(s, 0, false);
    expect(got.detail.unreachedRooms).toEqual(['Vault']);
    expect(got.reach).toBe(0.5);
  });

  it('scores aspect ratio against ASPECT_MAX, both orientations alike', () => {
    const wide = sceneWith(20, 20, [], [{ id: 'a', name: 'Hall', at: { x: 5, y: 5 }, w: 10, h: 2 }]);
    const tall = sceneWith(20, 20, [], [{ id: 'a', name: 'Hall', at: { x: 5, y: 5 }, w: 2, h: 10 }]);
    expect(ASPECT_MAX).toBeLessThan(5);
    expect(scoreDesign(wide, 0, false).proportion).toBe(0);
    expect(scoreDesign(tall, 0, false).proportion).toBe(0);
    expect(scoreDesign(wide, 0, false).detail.aspects[0]).toBeCloseTo(5, 9);

    const square = sceneWith(20, 20, [], [{ id: 'a', name: 'Hall', at: { x: 5, y: 5 }, w: 4, h: 4 }]);
    expect(scoreDesign(square, 0, false).proportion).toBe(1);
  });
});

describe('the total', () => {
  it('is 1 only when EVERY sub-score is 1, and 0 only when every one is 0', () => {
    const probe = scoreDesign(sceneWith(10, 10, []), 0, false);
    const side = Math.sqrt(probe.detail.walkableM2 * DENSITY_ANCHOR);
    const perfect = scoreDesign(
      sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, side, side)], [{ id: 'z', name: 'Living room', at: { x: 5, y: 5 }, w: 8, h: 8 }]),
      1,
      true,
    );
    expect(perfect.total).toBeCloseTo(1, 6);

    // Nothing placed, nothing locked, a corridor-shaped unreachable room.
    const awful = scoreDesign(sceneWith(10, 10, [], [{ id: 'z', name: 'Bedroom', at: { x: 40, y: 40 }, w: 10, h: 2 }]), 5, false);
    expect(awful.placement).toBe(0);
    expect(awful.density).toBe(0);
    expect(awful.programme).toBe(0);
    expect(awful.reach).toBe(0);
    expect(awful.proportion).toBe(0);
    expect(awful.lock).toBe(0);
    // `orientation` and `spacing` are both VACUOUSLY 1 on an empty room — there
    // is nothing to point and nothing to collide. Weight 2 each out of 16.
    expect(awful.total).toBeCloseTo(4 / 16, 6);
  });

  it('WEIGHTS are load-bearing: moving placement moves the total more than proportion', () => {
    const base = sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, 2, 0.9)], [{ id: 'z', name: 'Living room', at: { x: 5, y: 5 }, w: 4, h: 4 }]);
    const good = scoreDesign(base, 1, false);
    const halfPlacement = scoreDesign(base, 2, false);
    const badProportion = scoreDesign(
      sceneWith(10, 10, [rect('Sofa', { x: 5, y: 5 }, 2, 0.9)], [{ id: 'z', name: 'Living room', at: { x: 5, y: 5 }, w: 8, h: 2 }]),
      1,
      false,
    );
    expect(good.total - halfPlacement.total).toBeGreaterThan(good.total - badProportion.total);
  });
});

describe('CALIBRATION — the hand-authored demo is the ground truth', () => {
  it('scores the Maple Court demo at the density anchor, by construction', () => {
    const s = scoreDesign(apartmentScene(), 9, false);
    // This is the number DENSITY_ANCHOR was read off. If the demo is ever
    // re-authored, this test is what tells you the anchor moved with it.
    expect(s.detail.coverage).toBeCloseTo(DENSITY_ANCHOR, 2);
    expect(s.density).toBeGreaterThan(0.95);
  });

  it('NEGATIVE CONTROL: piling the demo furniture on one spot must score worse', () => {
    const demo = apartmentScene();
    const piled: Scene = {
      ...demo,
      objects: demo.objects.map((o) =>
        o.kind === 'wall' ? o : { ...o, center: { x: demo.listener.pos.x, y: demo.listener.pos.y } },
      ),
    };
    const before = scoreDesign(demo, 9, false);
    const after = scoreDesign(piled, 9, false);
    // Density is UNCHANGED — same footprints, same floor. That is exactly why
    // density alone is not a quality score, and it is what this control exists
    // to prove: `spacing` is the sub-score that has to catch the pile, and it
    // was MISSING until this test failed with the two totals identical.
    expect(after.detail.coverage).toBeCloseTo(before.detail.coverage, 9);
    expect(before.spacing).toBe(1);
    expect(after.spacing).toBe(0);
    expect(after.total).toBeLessThan(before.total);
  });

  it('the demo is free of overlaps and its seating faces its TV', () => {
    // Two independent confirmations that the instrument reads the ground truth
    // the way a human would — if either goes red, the anchor moved.
    const s = scoreDesign(apartmentScene(), 9, false);
    expect(s.detail.overlaps).toEqual([]);
    expect(s.spacing).toBe(1);
    expect(s.detail.orientationMisses).toEqual([]);
  });

  it('TOLERATES the hand-drawing slop the demo actually contains', () => {
    // The demo's worst real overlap is a round table 1.6 % into a couch. Two
    // counters crossing by 2 % of the smaller must read as clean; a piece half
    // inside another must not.
    const slop = sceneWith(10, 10, [
      rect('Counter', { x: 4, y: 5 }, 2, 0.65),
      rect('Counter', { x: 5.96, y: 5 }, 2, 0.65), // 0.04 m deep = 3 % of 1.3 m²
    ]);
    expect(scoreDesign(slop, 2, false).detail.overlaps).toEqual([]);

    const collision = sceneWith(10, 10, [
      rect('Counter', { x: 4, y: 5 }, 2, 0.65),
      rect('Counter', { x: 5, y: 5 }, 2, 0.65), // half inside
    ]);
    expect(scoreDesign(collision, 2, false).spacing).toBe(0);
  });
});

describe('meanScore', () => {
  it('averages field by field and survives an empty list', () => {
    const a = scoreDesign(sceneWith(10, 10, []), 2, true);
    const b = scoreDesign(sceneWith(10, 10, []), 2, false);
    expect(meanScore([a, b]).lock).toBe(0.5);
    expect(meanScore([]).total).toBe(0);
  });
});
