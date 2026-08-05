import { describe, expect, it } from 'vitest';
import type { Scene, SceneObject, Vec2, WallObj } from '../../../engine/types';
import { sanitizeScene } from '../../../engine/scene';
import { SNAP_STEP } from '../placement';
import {
  ANGLE_SNAP_DEG,
  CLOSE_RADIUS,
  MIN_SEGMENT_M,
  angleSnap,
  chainContext,
  chainStep,
  chainUndo,
  chainVertex,
  popChainSegment,
} from '../chain';

/**
 * §18a — the wall chain (S38).
 *
 * The property these exist to protect: the CLICK path and the cursor-PREVIEW
 * path used to carry the same four-call composition written out twice, verbatim,
 * **355 lines apart** (`main`'s SimCanvas.tsx:419 and :774). `chainVertex` is now
 * the one definition, so the ghost cannot
 * promise a vertex the click would not land on — and the tests below are what
 * stop a later edit re-splitting them.
 *
 * Fixtures are OFF-GRID by default: a vertex on a 0.05 multiple cannot show a
 * snap that did or did not happen, which is the same blindness that cost S32 and
 * S37 a negative control each.
 */

let n = 0;
const newId = () => `w${++n}`;
const freshIds = () => {
  n = 0;
};

function walls(...ws: Array<[Vec2, Vec2]>): WallObj[] {
  return ws.map(([a, b], i) => ({
    id: `ex${i}`,
    kind: 'wall' as const,
    a,
    b,
    absorption: 0.12,
    label: 'Wall',
    height: 2.5,
  }));
}

const ctx = (over: Partial<ReturnType<typeof chainContext>> = {}) => ({
  ...chainContext([], [], false),
  ...over,
});

function scene(objects: SceneObject[]): Scene {
  const s = sanitizeScene({ objects, speakers: [], listener: { pos: { x: 0, y: 0 }, z: 1.2 } });
  if (!s) throw new Error('fixture did not sanitize');
  return s;
}

// ---------------------------------------------------------------------------

describe('angleSnap', () => {
  it('snaps to a 45° multiple INSIDE the band and preserves the length', () => {
    const from = { x: 1, y: 1 };
    // 3° off horizontal — inside the 7° band.
    const len = 2.37;
    const a = (3 * Math.PI) / 180;
    const to = { x: from.x + len * Math.cos(a), y: from.y + len * Math.sin(a) };
    const out = angleSnap(from, to);
    expect(out.y).toBeCloseTo(from.y, 12); // snapped flat
    expect(Math.hypot(out.x - from.x, out.y - from.y)).toBeCloseTo(len, 12);
  });

  it('leaves a genuinely angled segment ALONE outside the band', () => {
    const from = { x: 1, y: 1 };
    const a = (20 * Math.PI) / 180; // 20° from horizontal, 25° from 45°
    const to = { x: from.x + 2 * Math.cos(a), y: from.y + 2 * Math.sin(a) };
    expect(angleSnap(from, to)).toEqual(to);
  });

  it('the band is EXCLUSIVE, and the boundary is where it matters', () => {
    const from = { x: 0, y: 0 };
    const inside = ANGLE_SNAP_DEG - 0.01;
    const outside = ANGLE_SNAP_DEG + 0.01;
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return angleSnap(from, { x: Math.cos(r), y: Math.sin(r) });
    };
    expect(at(inside).y).toBeCloseTo(0, 9);
    expect(at(outside).y).toBeGreaterThan(0.1);
  });

  it('a zero-length move returns the point unchanged — no atan2 of (0,0)', () => {
    const p = { x: 2.13, y: 3.71 };
    expect(angleSnap(p, p)).toEqual(p);
    expect(Number.isNaN(angleSnap(p, { x: p.x + 1e-9, y: p.y }).x)).toBe(false);
  });

  it('snaps to the NEAREST 45° spoke, including the diagonals', () => {
    const from = { x: 0, y: 0 };
    const r = (46 * Math.PI) / 180;
    const out = angleSnap(from, { x: Math.cos(r), y: Math.sin(r) });
    expect(Math.atan2(out.y, out.x)).toBeCloseTo(Math.PI / 4, 9);
  });
});

// ---------------------------------------------------------------------------

describe('chainVertex', () => {
  it('the FIRST vertex snaps to the grid but takes NO angle snap', () => {
    // There is no previous vertex to take an angle from. Off-grid so the snap
    // is visible: 1.337 -> 1.35, 2.417 -> 2.40.
    const out = chainVertex([], { x: 1.337, y: 2.417 }, ctx({ snapOn: true }));
    expect(out.closing).toBe(false);
    expect(out.at.x).toBeCloseTo(1.35, 10);
    expect(out.at.y).toBeCloseTo(2.4, 10);
  });

  it('with snap OFF the first vertex is the raw point', () => {
    const p = { x: 1.337, y: 2.417 };
    expect(chainVertex([], p, ctx({ snapOn: false })).at).toEqual(p);
  });

  it('the CLOSE test reads the RAW point, before any snapping', () => {
    // ⚠️ The fixture STRADDLES the radius on purpose. `CLOSE_RADIUS` is 0.25 and
    // the grid is 0.05, so a point 0.24 out closes on the RAW distance and does
    // NOT close on the snapped one (0.24 -> 0.25, and the test is strict `<`).
    // My first version used 0.1, which snaps to itself — arithmetically incapable
    // of expressing its own bug, and a negative control walked straight through
    // it. Same family as S32's on-grid corpus and S37's move-multi fixture.
    const pts = [
      { x: 0, y: 0 },
      { x: 4.13, y: 0 },
      { x: 4.13, y: 3.07 },
    ];
    const near = { x: 0.24, y: 0 };
    expect(Math.hypot(near.x, near.y)).toBeLessThan(CLOSE_RADIUS);
    expect(Math.round(near.x / SNAP_STEP) * SNAP_STEP).not.toBeLessThan(CLOSE_RADIUS);

    const out = chainVertex(pts, near, ctx({ snapOn: true }));
    expect(out.closing).toBe(true);
    expect(out.at).toEqual(pts[0]); // the EXACT first vertex, not a snapped near-miss
  });

  it('needs TWO points before it can close — a single segment cannot', () => {
    const pts = [{ x: 0, y: 0 }];
    expect(chainVertex(pts, { x: 0.05, y: 0.05 }, ctx()).closing).toBe(false);
  });

  it('just OUTSIDE the close radius does not close', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 4.13, y: 0 },
      { x: 4.13, y: 3.07 },
    ];
    const out = chainVertex(pts, { x: CLOSE_RADIUS + 0.01, y: 0 }, ctx());
    expect(out.closing).toBe(false);
  });

  it('sticks to an EXISTING wall endpoint, and never to one of its own pieces', () => {
    const ex = walls([{ x: 5, y: 0 }, { x: 5, y: 4 }]);
    const pts = [{ x: 0, y: 0 }];
    // Aim near the existing wall's endpoint (5,0).
    const stuck = chainVertex(pts, { x: 4.94, y: 0.06 }, ctx({ walls: ex }));
    expect(stuck.at).toEqual({ x: 5, y: 0 });

    // …and with that wall EXCLUDED (it is the chain's own), it is not stuck.
    const free = chainVertex(
      pts,
      { x: 4.94, y: 0.06 },
      ctx({ walls: ex, exclude: new Set(['ex0']) }),
    );
    expect(free.at).not.toEqual({ x: 5, y: 0 });
  });

  it('THE POINT OF THE MODULE: the click and the preview agree, bit for bit', () => {
    // Both call this. If a later edit re-splits them, this is the test that goes
    // red — but only because the fixture is off-grid AND off-axis, where the
    // four-call composition is not idempotent under reordering.
    const ex = walls([{ x: 6.13, y: 0 }, { x: 6.13, y: 5 }]);
    const pts = [{ x: 0.13, y: 0.07 }, { x: 3.37, y: 0.09 }];
    const c = ctx({ walls: ex, snapOn: true });
    const raw = { x: 5.913, y: 0.213 };
    const clicked = chainStep(pts, raw, c, newId);
    const previewed = chainVertex(pts, raw, c);
    expect(clicked.at).toEqual(previewed.at);
    expect(clicked.closing).toBe(previewed.closing);
  });
});

// ---------------------------------------------------------------------------

describe('chainStep', () => {
  it('the first click appends a corner and creates NO wall', () => {
    freshIds();
    const out = chainStep([], { x: 1.13, y: 2.07 }, ctx(), newId);
    expect(out.wall).toBeNull();
    expect(out.closing).toBe(false);
  });

  it('the second click creates a wall from the previous corner to the new one', () => {
    freshIds();
    const pts = [{ x: 0.13, y: 0.07 }];
    const out = chainStep(pts, { x: 4.13, y: 0.07 }, ctx(), newId);
    expect(out.wall).not.toBeNull();
    expect(out.wall!.a).toEqual(pts[0]);
    expect(out.wall!.b).toEqual(out.at);
    expect(out.wall!.id).toBe('w1');
    expect(out.wall!.kind).toBe('wall');
  });

  it('a click SHORTER than MIN_SEGMENT_M appends a corner with NO wall', () => {
    // The empty id group this produces is exactly why Backspace tracks groups
    // rather than counting walls.
    freshIds();
    const pts = [{ x: 0.13, y: 0.07 }];
    const short = { x: 0.13 + MIN_SEGMENT_M - 0.01, y: 0.07 };
    const out = chainStep(pts, short, ctx(), newId);
    expect(out.wall).toBeNull();
    expect(out.at).toEqual(short);
  });

  it('…and one hair longer DOES create the wall', () => {
    freshIds();
    const pts = [{ x: 0.13, y: 0.07 }];
    const out = chainStep(pts, { x: 0.13 + MIN_SEGMENT_M + 0.01, y: 0.07 }, ctx(), newId);
    expect(out.wall).not.toBeNull();
  });

  it('the length test uses the SNAPPED vertex, not the raw pointer', () => {
    // A click 0.16 m out with snap ON lands at 0.15 exactly — still >= the floor.
    // A click 0.14 m out snaps to 0.15 too, so it becomes long enough. Either
    // way the wall must be measured to where the corner actually WENT.
    freshIds();
    const pts = [{ x: 0, y: 0 }];
    const out = chainStep(pts, { x: 0.14, y: 0 }, ctx({ snapOn: true }), newId);
    expect(out.at.x).toBeCloseTo(0.15, 10);
    expect(out.wall).not.toBeNull();
    expect(out.wall!.b).toEqual(out.at);
  });

  it('CLOSING still creates its final wall', () => {
    freshIds();
    const pts = [
      { x: 0, y: 0 },
      { x: 4.13, y: 0 },
      { x: 4.13, y: 3.07 },
    ];
    const out = chainStep(pts, { x: 0.08, y: 0.08 }, ctx(), newId);
    expect(out.closing).toBe(true);
    expect(out.wall).not.toBeNull();
    expect(out.wall!.a).toEqual(pts[2]);
    expect(out.wall!.b).toEqual(pts[0]);
  });

  it('a NaN pointer creates NO wall — the guard must be `>=`, not an inverted `<`', () => {
    // The two forms differ on exactly one input and in the dangerous direction:
    // `NaN >= 0.15` is false so no wall is made, while `NaN < 0.15` is ALSO false,
    // so the inverted form falls THROUGH and commits a wall with NaN endpoints.
    // `sanitizeScene` keeps those, and every downstream distance is then NaN.
    // I wrote the inverted form first and a review lens caught it; this is the
    // test that would have.
    freshIds();
    const out = chainStep([{ x: 0, y: 0 }], { x: NaN, y: NaN }, ctx(), newId);
    expect(out.wall).toBeNull();
    // The control that makes it non-vacuous: the same call with a real point DOES
    // create one, so this cannot pass by the branch simply never firing.
    expect(chainStep([{ x: 0, y: 0 }], { x: 3, y: 0 }, ctx(), newId).wall).not.toBeNull();
  });

  it('the id factory is INJECTED — nothing here reaches for createId', () => {
    freshIds();
    const ids: string[] = [];
    const spy = (p: string) => {
      const id = `mine-${p}-${ids.length}`;
      ids.push(id);
      return id;
    };
    const out = chainStep([{ x: 0, y: 0 }], { x: 3, y: 0 }, ctx(), spy);
    expect(out.wall!.id).toBe('mine-wall-0');
  });

  it('a created wall carries the room height and the standard absorption', () => {
    freshIds();
    const out = chainStep([{ x: 0, y: 0 }], { x: 3, y: 0 }, ctx(), newId);
    expect(out.wall!.absorption).toBe(0.12);
    expect(out.wall!.label).toBe('Wall');
    expect(out.wall!.height).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('popChainSegment + chainUndo', () => {
  it('the group list is one SHORTER than the point list, and pops from the end', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
    ];
    const groups = [['w1'], ['w2', 'w2b']];
    const out = popChainSegment(pts, groups);
    expect(out.ended).toBe(false);
    expect(out.points).toEqual(pts.slice(0, 2));
    expect(out.groups).toEqual([['w1']]);
    expect(out.removeIds).toEqual(['w2', 'w2b']); // a crossing owns MULTIPLE ids
  });

  it('one point left ENDS the chain', () => {
    expect(popChainSegment([{ x: 0, y: 0 }], []).ended).toBe(true);
    expect(popChainSegment([], []).ended).toBe(true);
  });

  it('never mutates its inputs', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }];
    const groups = [['w1']];
    popChainSegment(pts, groups);
    expect(pts).toHaveLength(2);
    expect(groups).toEqual([['w1']]);
  });

  it('chainUndo DELETES the popped segment’s walls from the scene', () => {
    const s = scene([
      ...walls([{ x: 0, y: 0 }, { x: 3, y: 0 }], [{ x: 3, y: 0 }, { x: 3, y: 3 }]),
    ]);
    const chain = {
      points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }],
      cursor: { x: 9, y: 9 },
    };
    const out = chainUndo(s, chain, [['ex0'], ['ex1']]);
    expect(out.scene.objects.map((o) => o.id)).toEqual(['ex0']);
    expect(out.chain).toEqual({ points: chain.points.slice(0, 2), cursor: chain.cursor });
    expect(out.groups).toEqual([['ex0']]);
  });

  it('returns the SAME scene reference when the popped corner made no wall', () => {
    // The caller's `!==` test is what stops an undo entry that undoes nothing.
    const s = scene([...walls([{ x: 0, y: 0 }, { x: 3, y: 0 }])]);
    const chain = { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3.05, y: 0 }], cursor: null };
    const out = chainUndo(s, chain, [['ex0'], []]);
    expect(out.scene).toBe(s);
    expect(out.chain!.points).toHaveLength(2);
  });

  it('ending the chain clears the groups and returns the scene untouched', () => {
    const s = scene([...walls([{ x: 0, y: 0 }, { x: 3, y: 0 }])]);
    const out = chainUndo(s, { points: [{ x: 0, y: 0 }], cursor: null }, []);
    expect(out.chain).toBeNull();
    expect(out.groups).toEqual([]);
    expect(out.scene).toBe(s);
  });

  it('the cursor rides along — a Backspace must not strand the preview', () => {
    const s = scene([...walls([{ x: 0, y: 0 }, { x: 3, y: 0 }])]);
    const cursor = { x: 7.13, y: 2.07 };
    const out = chainUndo(
      s,
      { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }], cursor },
      [['ex0'], []],
    );
    expect(out.chain!.cursor).toEqual(cursor);
  });

  it('THE INVARIANT: click, click, click, Backspace, Backspace walks back exactly', () => {
    // The whole reason groups are tracked per SEGMENT, replayed end to end.
    // ⚠️ HONEST LIMIT: the `if (!first)` rule lives in `SimCanvas.addChainPoint`,
    // not in `chain.ts`, so this test RE-STATES it rather than reading it — an
    // edit to the component would not red this. It pins the CONTRACT the
    // component must satisfy (and `chainStep`/`chainUndo`/`popChainSegment`
    // composing correctly under it); the component's own compliance is covered
    // only by the CDP differential.
    freshIds();
    let points: Vec2[] = [];
    let groups: string[][] = [];
    let objects: SceneObject[] = [];
    const clicks: Vec2[] = [
      { x: 0.13, y: 0.07 },
      { x: 4.13, y: 0.07 },
      { x: 4.13, y: 3.07 },
    ];
    for (const raw of clicks) {
      const first = points.length === 0;
      const step = chainStep(points, raw, chainContext(objects, groups, false), newId);
      if (step.wall) objects = [...objects, step.wall];
      if (!first) groups = [...groups, step.wall ? [step.wall.id] : []];
      points = [...points, step.at];
    }
    expect(points).toHaveLength(3);
    expect(groups).toEqual([['w1'], ['w2']]);
    expect(objects).toHaveLength(2);

    // Two Backspaces take it back to one point and no walls.
    let s = scene(objects);
    let chain: { points: Vec2[]; cursor: Vec2 | null } | null = { points, cursor: null };
    let g = groups;
    for (let i = 0; i < 2; i++) {
      const out = chainUndo(s, chain!, g);
      s = out.scene;
      chain = out.chain;
      g = out.groups;
    }
    expect(chain!.points).toHaveLength(1);
    expect(s.objects).toHaveLength(0);

    // One more ends it.
    expect(chainUndo(s, chain!, g).chain).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('chainContext', () => {
  it('keeps only walls, and excludes every id in every group', () => {
    const objs: SceneObject[] = [
      ...walls([{ x: 0, y: 0 }, { x: 3, y: 0 }]),
      {
        id: 'r1',
        kind: 'rect',
        center: { x: 1, y: 1 },
        w: 1,
        h: 1,
        rotation: 0,
        absorption: 0.3,
        label: 'Box',
        role: 'furniture',
        height: 0.8,
      },
    ];
    const c = chainContext(objs, [['a', 'b'], [], ['c']], true);
    expect(c.walls.map((w) => w.id)).toEqual(['ex0']);
    expect([...c.exclude].sort()).toEqual(['a', 'b', 'c']);
    expect(c.snapOn).toBe(true);
  });

  it('an empty scene yields an empty context rather than throwing', () => {
    const c = chainContext([], [], false);
    expect(c.walls).toEqual([]);
    expect(c.exclude.size).toBe(0);
  });

  it('the snap step it feeds is the app-wide 5 cm one', () => {
    expect(SNAP_STEP).toBe(0.05);
  });
});
