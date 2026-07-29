import { describe, expect, it } from 'vitest';
import { blankScene, createId, rectRoomWalls, addRoomShell } from '../scene';
import { regionOf, sameRegion } from '../rooms';
import { bestListeningSpot } from '../bestspot';
import { collectSurfaces, directPath } from '../raytrace';
import { suggestPlacement } from '../optimize';
import { suggestInventory } from '../arrange';
import type { RectObj, Scene, SpeakerObj, WallObj } from '../types';

const pairwiseMin = (pts: Array<{ x: number; y: number }>): number => {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  return m;
};

function houseWithTwoRooms(): Scene {
  const s = blankScene();
  let scene: Scene = { ...s, objects: rectRoomWalls(4, 4), listener: { ...s.listener, pos: { x: 2, y: 2 } } };
  scene = addRoomShell(scene, 'Kitchen', 3, 4); // flush to the right: x 4..7
  return scene;
}

describe('regionOf', () => {
  it('separates rooms across a shared wall', () => {
    const scene = houseWithTwoRooms();
    expect(sameRegion(scene, { x: 2, y: 2 }, { x: 5.5, y: 2 })).toBe(false);
    expect(sameRegion(scene, { x: 1, y: 1 }, { x: 3, y: 3 })).toBe(true);
    const kitchen = regionOf(scene, { x: 5.5, y: 2 });
    expect(kitchen.area).toBeGreaterThan(6);
    expect(kitchen.contains({ x: 2, y: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The wall-line leak (S25, docs/ideas.md 12b)
//
// `segsCross` required a STRICT `d3 * d4 < 0`, so a flood-fill step whose
// endpoint landed exactly ON a blocker's line scored 0 and was not blocked — and
// the step out of that cell was not blocked either, so the fill walked straight
// through the wall. Whether it fires depends on the grid ORIGIN, which is
// `sceneBounds().min - cell`, and `sceneBounds` reads door/window rect CORNERS.
// So an ordinary door is enough to move the grid onto a wall.
// ---------------------------------------------------------------------------

const wallSeg = (id: string, ax: number, ay: number, bx: number, by: number): WallObj => ({
  id, kind: 'wall', a: { x: ax, y: ay }, b: { x: bx, y: by },
  absorption: 0.12, label: 'Wall', height: 2.7,
});

const doorRect = (id: string, cx: number, cy: number, rotation: number): RectObj => ({
  id, kind: 'rect', center: { x: cx, y: cy }, w: 0.9, h: 0.1, rotation,
  absorption: 0.25, label: 'Door', role: 'door', height: 2.05, doorOpen: true,
});

const sceneOf = (objects: Array<WallObj | RectObj>, seat: { x: number; y: number }): Scene => {
  const s = blankScene();
  return {
    ...s,
    objects,
    listener: { ...s.listener, pos: seat },
    listeners: [{ id: 'seat-1', name: 'Seat', pos: seat, z: 1.2 }],
    activeListenerId: 'seat-1',
  };
};

/**
 * An 8 x 5.5 room with a door on the BOTTOM wall. The door's h = 0.1 rect puts
 * `sceneBounds().min.y` at -0.05, so the grid origin is -0.35 and the cell-centre
 * row k = 19 sits at y = 5.5000 — EXACTLY the top wall. This is not a contrived
 * alignment: it is what the generator emits on every plan with a horizontal door.
 */
function roomWithGridOnTopWall(): Scene {
  return sceneOf(
    [
      wallSeg('w-b', 0, 0, 8, 0),
      wallSeg('w-t', 0, 5.5, 8, 5.5),
      wallSeg('w-l', 0, 0, 0, 5.5),
      wallSeg('w-r', 8, 0, 8, 5.5),
      doorRect('d', 4, 0, 0),
    ],
    { x: 4, y: 2.75 },
  );
}

describe('regionOf — does not leak through a wall a cell-centre row lands on', () => {
  it('THE LEAK: a 44 m2 room does not report a 55 m2 region', () => {
    const scene = roomWithGridOnTopWall();
    // Prove the fixture really is degenerate, or the test proves nothing.
    const minY = -0.05 - 0.3;
    const rowOnWall = minY + (19 + 0.5) * 0.3;
    expect(rowOnWall, 'fixture is not degenerate — no cell row on the wall').toBeCloseTo(5.5, 12);

    const r = regionOf(scene, { x: 4, y: 2.75 }, { doorsBlock: true });
    // Pre-fix this read 54.81 m2. Grid quantisation means it cannot be exactly
    // 44.00, but it must not EXCEED the room at all — the fill is now strictly
    // inside the walls, so the only error is the sub-cell fringe it cannot reach.
    expect(r.area).toBeGreaterThan(40);
    expect(r.area).toBeLessThanOrEqual(44);
  });

  it('does not contain a point on the far side of the wall it leaked through', () => {
    const scene = roomWithGridOnTopWall();
    const r = regionOf(scene, { x: 4, y: 2.75 }, { doorsBlock: true });
    expect(r.contains({ x: 4, y: 5.7 })).toBe(false);
  });

  it('MERGES NO ROOMS: a solid partition on a cell row still separates', () => {
    // Same trick, applied to an INTERIOR partition: the seat's zone must not
    // reach the other room. This is what optimize.ts's "This room" target reads.
    const scene = sceneOf(
      [
        wallSeg('w-b', 0, 0, 8, 0),
        wallSeg('w-t', 0, 8.5, 8, 8.5),
        wallSeg('w-l', 0, 0, 0, 8.5),
        wallSeg('w-r', 8, 0, 8, 8.5),
        wallSeg('w-mid', 0, 5.5, 8, 5.5),
        doorRect('d', 4, 0, 0),
      ],
      { x: 4, y: 2.75 },
    );
    const r = regionOf(scene, { x: 4, y: 2.75 }, { doorsBlock: true });
    expect(r.contains({ x: 4, y: 7 }), 'the seat zone reached the far room').toBe(false);
  });

  it('SKEWED WALLS TOO: a 45-degree wall leaks, so the repair cannot assume axis alignment', () => {
    // MEASURED, not assumed. A whole ANTI-DIAGONAL of cell centres lies on
    // `x + y = c` exactly when `(c - minX - minY) / cell` is an integer. At
    // c = 8.95 it is 32.0000, and the pre-fix region reads 92.16 m2 for a
    // 40.05 m2 triangle — a 2.3x leak, worse than the axis-aligned case.
    //
    // This is the case that matters for the owner's real floorplan, which is
    // almost entirely non-axis-aligned.
    const c = 8.95;
    const scene = sceneOf(
      [
        wallSeg('w-b', 0, 0, c, 0),
        wallSeg('w-l', 0, 0, 0, c),
        wallSeg('w-diag', 0, c, c, 0),
        doorRect('d', c / 2, 0, 0),
      ],
      { x: 1.5, y: 1.5 },
    );
    const r = regionOf(scene, { x: 1.5, y: 1.5 }, { doorsBlock: true });
    const triangle = (c * c) / 2;
    // Pre-fix: 92.16 m2 against a 40.05 m2 triangle.
    expect(r.area, `leaked past the hypotenuse (triangle is ${triangle.toFixed(2)} m2)`).toBeLessThan(
      triangle * 1.05,
    );
  });

  it('THE SEAM: a doorway gap in an EXTERIOR wall does not leak the whole building', () => {
    // Distilled from the real generator design `one-bed`/seed 6, which still
    // leaked after a partial fix that handled only the "cell centre ON a wall"
    // case. Here the degeneracy is the OTHER one: the entry door splits the
    // exterior wall into two stubs at y = 1.65 and y = 2.55, the door rect's
    // edges START at exactly those points, and both are cell-centre rows.
    //
    // At y = 1.65 THREE blockers each have an ENDPOINT on the step — the stub,
    // and both door edges — so each merely TOUCHES and none of them blocks,
    // while collectively they seal the wall. The fill threads the seam and
    // escapes the building.
    //
    // This is exactly the corpus hole the S24 lesson warns about: without this
    // fixture the partial fix passes every other test in this file.
    const scene = sceneOf(
      [
        wallSeg('w-b', 0, 0, 7, 0),
        wallSeg('w-t', 0, 7, 7, 7),
        wallSeg('w-r', 7, 0, 7, 7),
        // The left exterior wall, split for the entry door.
        wallSeg('w-l1', 0, 0, 0, 1.65),
        wallSeg('w-l2', 0, 2.55, 0, 7),
        // The door rect filling the 0.9 m gap: edges at x = +/-0.05, y 1.65..2.55.
        { ...doorRect('d-entry', 0, 2.1, Math.PI / 2) },
      ],
      { x: 5, y: 3.5 },
    );

    // Prove the fixture is degenerate: bounds.min.y is 0 and the door rect puts
    // bounds.min.x at -0.05, so the grid rows land exactly on the stub ends.
    const rowsOnSeam = [1.65, 2.55].every((y) => {
      const k = (y - -0.3) / 0.3 - 0.5;
      return Math.abs(k - Math.round(k)) < 1e-9;
    });
    expect(rowsOnSeam, 'fixture is not degenerate — no cell row on the stub ends').toBe(true);

    const zone = regionOf(scene, { x: 5, y: 3.5 }, { doorsBlock: true });
    // A point OUTSIDE the left wall. Pre-fix the zone covered the whole padded
    // grid (60.8 m2 for a 49 m2 building).
    expect(zone.contains({ x: -0.2, y: 2.1 }), 'the zone escaped through the door seam').toBe(false);
    expect(zone.area, 'the zone is larger than the building').toBeLessThanOrEqual(49);
  });
});

describe('regionOf — the repair must NOT over-block', () => {
  it('a real doorway gap still connects both sides for walkable containment', () => {
    // arrange.ts:599 builds its hard walkable-containment constraint from
    // regionOf(..., { doorsBlock: false }). If the repair sealed a doorway,
    // every piece of furniture would be trapped in the seat's room.
    const scene = sceneOf(
      [
        wallSeg('w-b', 0, 0, 8, 0),
        wallSeg('w-t', 0, 8.5, 8, 8.5),
        wallSeg('w-l', 0, 0, 0, 8.5),
        wallSeg('w-r', 8, 0, 8, 8.5),
        // A partition with a REAL 0.9 m gap, exactly as the generator emits it.
        wallSeg('w-mid-l', 0, 5.5, 3.55, 5.5),
        wallSeg('w-mid-r', 4.45, 5.5, 8, 5.5),
        doorRect('d-mid', 4, 5.5, 0),
        doorRect('d', 4, 0, 0),
      ],
      { x: 4, y: 2.75 },
    );
    const walk = regionOf(scene, { x: 4, y: 2.75 }, { doorsBlock: false });
    expect(walk.contains({ x: 4, y: 7 }), 'the doorway was sealed by the repair').toBe(true);
  });

  it('a 0.9 m doorway survives the cell GROWING on a large scene', () => {
    // Past ~47.4 m the cell grows as span/158 (S3), so the doorway spans fewer
    // cells: 3.0 at 8 m, 2.4 at 60 m, 1.6 at 90 m, 1.0 at 140 m. The repair
    // blocks a step that merely TOUCHES a wall tip, so a narrow gap was the
    // plausible way to over-block. Measured: it connects at every scale.
    for (const S of [8, 60, 90, 140]) {
      const mid = S / 2;
      const scene = sceneOf(
        [
          wallSeg('b', 0, 0, S, 0),
          wallSeg('t', 0, S, S, S),
          wallSeg('l', 0, 0, 0, S),
          wallSeg('r', S, 0, S, S),
          wallSeg('m1', 0, mid, S / 2 - 0.45, mid),
          wallSeg('m2', S / 2 + 0.45, mid, S, mid),
        ],
        { x: S / 2, y: mid / 2 },
      );
      const walk = regionOf(scene, { x: S / 2, y: mid / 2 }, { doorsBlock: false });
      expect(walk.contains({ x: S / 2, y: mid + S / 4 }), `${S} m envelope: doorway sealed`).toBe(true);
    }
  });

  it('an open-plan room is still one region', () => {
    const scene = sceneOf(
      [
        wallSeg('w-b', 0, 0, 8, 0),
        wallSeg('w-t', 0, 5.5, 8, 5.5),
        wallSeg('w-l', 0, 0, 0, 5.5),
        wallSeg('w-r', 8, 0, 8, 5.5),
        doorRect('d', 4, 0, 0),
      ],
      { x: 1, y: 1 },
    );
    const r = regionOf(scene, { x: 1, y: 1 }, { doorsBlock: true });
    expect(r.contains({ x: 7, y: 5 }), 'the room split into pieces').toBe(true);
    expect(r.area).toBeGreaterThan(35);
  });
});

describe('room-aware placement', () => {
  it('keeps candidates inside the target room', () => {
    const scene = houseWithTwoRooms();
    const res = suggestPlacement(scene, {
      mode: 'music',
      stereo: false,
      inventory: { homepod: 2 },
      target: { kind: 'room', at: { x: 5.5, y: 2 }, name: 'Kitchen' },
    });
    expect(res.speakers.length).toBeGreaterThan(0);
    for (const sp of res.speakers) {
      expect(sp.pos.x).toBeGreaterThan(4); // never leaks into the living room
    }
    expect(res.focus).toEqual({ x: 5.5, y: 2 });
  });

  it('falls back from cinema when the TV is walled off', () => {
    const scene = houseWithTwoRooms();
    const tv: RectObj = {
      id: 'tv1', kind: 'rect', center: { x: 5.5, y: 0.6 }, w: 1.4, h: 0.3,
      rotation: 0, absorption: 0.05, label: 'TV', role: 'tv', height: 1.5,
    };
    const withTv = { ...scene, objects: [...scene.objects, tv] };
    const res = suggestPlacement(withTv, { mode: 'cinema', stereo: true, inventory: { homepod: 2 } });
    expect(res.notes.join(' ')).toMatch(/no line of sight|another room/i);
  });

  it('whole-house mode puts one zone per room', () => {
    const scene = houseWithTwoRooms();
    const withRooms = {
      ...scene,
      rooms: [
        { id: 'r1', name: 'Living', at: { x: 2, y: 2 } },
        ...(scene.rooms ?? []),
      ],
    };
    const res = suggestPlacement(withRooms, {
      mode: 'music', stereo: true, inventory: { homepod: 2 }, target: { kind: 'house' },
    });
    expect(res.speakers).toHaveLength(2);
    expect(res.pairs).toHaveLength(0); // zones can't stereo-pair across rooms
    const sides = res.speakers.map((sp) => sp.pos.x > 4);
    expect(new Set(sides).size).toBe(2); // one in each room
  });
});

describe('mode-dependent listening field', () => {
  it('TV mode and music mode disagree about the best spot', () => {
    const s = blankScene();
    const mk = (x: number, y: number, label: string): SpeakerObj => ({
      id: `sp-${label}`, pos: { x, y }, z: 1, label, model: 'homepod', trimDb: 0,
    });
    const tv: RectObj = {
      id: 'tv1', kind: 'rect', center: { x: 1, y: 0.4 }, w: 1.4, h: 0.3,
      rotation: 0, absorption: 0.05, label: 'TV', role: 'tv', height: 1.5,
    };
    const scene: Scene = {
      ...s,
      objects: [...rectRoomWalls(6, 5), tv],
      speakers: [mk(1, 2, 'A'), mk(5, 2, 'B')],
      listener: { pos: { x: 3, y: 2.5 }, z: 1.2 },
    };
    const tvField = bestListeningSpot(scene, true);
    const musicField = bestListeningSpot(scene, false);
    expect(tvField.best).toBeTruthy();
    expect(musicField.best).toBeTruthy();
    const moved = Math.hypot(
      (tvField.best!.x - musicField.best!.x),
      (tvField.best!.y - musicField.best!.y),
    );
    // The field grid steps ~0.25 m in this room — any shift ≥ one cell proves
    // the two modes genuinely disagree (it was exactly 0 before the fix).
    expect(moved).toBeGreaterThanOrEqual(0.2);
  });
});

describe('suggestInventory', () => {
  it('reads the layout and proposes a sensible shopping list', () => {
    const scene = houseWithTwoRooms();
    const { items, reasons } = suggestInventory(scene);
    const ids = items.map((i) => i.presetId);
    expect(ids).toContain('bed');
    expect(reasons[0]).toMatch(/m²/);
  });
});

describe('occlusion-checked reflections', () => {
  it('allows same-side bounces and refuses through-wall bounces', async () => {
    const { bestReflectionDb } = await import('../pairspot');
    const { collectSurfaces } = await import('../raytrace');
    const scene = houseWithTwoRooms(); // divider at x=4, no door
    const walls = scene.objects.filter((o): o is import('../types').WallObj => o.kind === 'wall');
    const surfaces = collectSurfaces(scene.objects);
    const sp = { id: 's', pos: { x: 1, y: 2 }, z: 1, label: 'A', model: 'homepod' as const, trimDb: 0 };
    // Same side: bouncing off the north wall to a left-side point works.
    expect(bestReflectionDb(surfaces, walls, scene.objects, sp, { x: 3, y: 3 }, 1.2)).toBeGreaterThan(-40);
    // Far side of a solid divider: every bounce leg is blocked — no phantom paths.
    expect(bestReflectionDb(surfaces, walls, scene.objects, sp, { x: 6, y: 2 }, 1.2)).toBe(-Infinity);
  });
});

describe('arrange containment + zones', () => {
  it('never places furniture outside the walkable floor', async () => {
    const { arrangeFurniture } = await import('../arrange');
    const scene = houseWithTwoRooms(); // listener in left room; no door to right
    const res = arrangeFurniture(scene, [
      { presetId: 'bed', count: 1 },
      { presetId: 'sofa', count: 1 },
      { presetId: 'plant', count: 2 },
    ]);
    for (const o of res.objects) {
      if (o.kind === 'wall') continue;
      // Left room is [0,4]x[0,4]; anything beyond is outside walkable floor.
      expect(o.center.x).toBeGreaterThan(0);
      expect(o.center.x).toBeLessThan(4);
      expect(o.center.y).toBeGreaterThan(0);
      expect(o.center.y).toBeLessThan(4);
    }
  });

  it('sends the bed to the Bedroom zone and the counter to the Kitchen zone', async () => {
    const { arrangeFurniture } = await import('../arrange');
    const { blankScene, rectRoomWalls } = await import('../scene');
    const base = blankScene();
    const scene: Scene = {
      ...base,
      objects: rectRoomWalls(8, 5),
      listener: { pos: { x: 4, y: 2.5 }, z: 1.2 },
      rooms: [
        { id: 'z1', name: 'Bedroom', at: { x: 2, y: 2.5 }, w: 4, h: 5 },
        { id: 'z2', name: 'Kitchen', at: { x: 6, y: 2.5 }, w: 4, h: 5 },
      ],
    };
    const res = arrangeFurniture(scene, [
      { presetId: 'bed', count: 1 },
      { presetId: 'counter', count: 1 },
    ]);
    const bed = res.objects.find((o) => o.label === 'Bed');
    const counter = res.objects.find((o) => o.label === 'Kitchen counter');
    expect(bed && bed.kind !== 'wall' && bed.center.x).toBeLessThan(4);
    expect(counter && counter.kind !== 'wall' && counter.center.x).toBeGreaterThan(4);
    expect(res.notes.join(' ')).toMatch(/in the (Bedroom|Kitchen)/);
  });
});

describe('whole-house placement never stacks speakers (S3)', () => {
  it('gives each of 4 pods across 2 rooms its own spot', () => {
    const scene = houseWithTwoRooms();
    const withRooms: Scene = {
      ...scene,
      rooms: [{ id: 'r1', name: 'Living', at: { x: 2, y: 2 } }, ...(scene.rooms ?? [])],
    };
    // 4 pods, 2 rooms → round-robin puts 2 in each room. Before the fix the
    // per-speaker search recomputed the SAME best point, stacking them exactly.
    const res = suggestPlacement(withRooms, {
      mode: 'music',
      stereo: true,
      inventory: { homepod: 4 },
      target: { kind: 'house' },
    });
    expect(res.speakers).toHaveLength(4);
    expect(res.speakers.filter((s) => s.pos.x > 4)).toHaveLength(2); // 2 in the kitchen
    expect(res.speakers.filter((s) => s.pos.x < 4)).toHaveLength(2); // 2 in the living room
    expect(pairwiseMin(res.speakers.map((s) => s.pos))).toBeGreaterThan(0.5);
  });

  it('separates 4 pods packed into a single room', () => {
    const scene = houseWithTwoRooms();
    const oneRoom: Scene = { ...scene, rooms: [{ id: 'r1', name: 'Living', at: { x: 2, y: 2 } }] };
    const res = suggestPlacement(oneRoom, {
      mode: 'music',
      stereo: false,
      inventory: { homepod: 4 },
      target: { kind: 'house' },
    });
    // All 4 land in the one named room — and none may coincide.
    expect(res.speakers.length).toBeGreaterThanOrEqual(3);
    expect(pairwiseMin(res.speakers.map((s) => s.pos))).toBeGreaterThan(0.5);
  });
});

describe('regionOf — large scenes are not silently truncated (S3)', () => {
  it('reaches the far end of a 60 m room instead of clamping near ~48 m', () => {
    const s = blankScene();
    const scene: Scene = { ...s, objects: rectRoomWalls(60, 4), listener: { pos: { x: 2, y: 2 }, z: 1.2 } };
    const region = regionOf(scene, { x: 2, y: 2 });
    // Before the adaptive-cell fix the grid saturated ~48 m from the origin,
    // so a point 58 m along fell outside the grid and read as unreachable.
    expect(region.contains({ x: 30, y: 2 })).toBe(true);
    expect(region.contains({ x: 58, y: 2 })).toBe(true);
    expect(region.area).toBeGreaterThan(150); // ~60×4 floor, minus wall margins
  });
});

describe('regionOf — doorsBlock gates zoning through doorways (S3)', () => {
  it('treats a door as passable floor when false, a divider when true', () => {
    const s = blankScene();
    // A divider at x=4 with a 1 m gap (y 1.5..2.5); a door fills the gap.
    const divTop: WallObj = {
      id: createId('wall'), kind: 'wall', a: { x: 4, y: 0 }, b: { x: 4, y: 1.5 },
      absorption: 0.12, label: 'Wall', height: 2.7,
    };
    const divBot: WallObj = {
      id: createId('wall'), kind: 'wall', a: { x: 4, y: 2.5 }, b: { x: 4, y: 4 },
      absorption: 0.12, label: 'Wall', height: 2.7,
    };
    const door: RectObj = {
      id: 'door1', kind: 'rect', center: { x: 4, y: 2 }, w: 1, h: 0.12,
      rotation: Math.PI / 2, absorption: 0.05, label: 'Door', role: 'door', height: 2.05,
    };
    const scene: Scene = {
      ...s,
      objects: [...rectRoomWalls(8, 4), divTop, divBot, door],
      listener: { pos: { x: 2, y: 2 }, z: 1.2 },
    };
    // Furnishing view: the doorway is walkable floor → both sides connect.
    expect(regionOf(scene, { x: 2, y: 2 }, { doorsBlock: false }).contains({ x: 6, y: 2 })).toBe(true);
    // Zoning view: the door divides the rooms → the far side is its own zone.
    expect(regionOf(scene, { x: 2, y: 2 }, { doorsBlock: true }).contains({ x: 6, y: 2 })).toBe(false);
  });
});

describe('cinema optimizer + field respect TV line of sight (S3)', () => {
  it('falls back to music placement (and still places speakers) when the TV is walled off', () => {
    const scene = houseWithTwoRooms();
    const tv: RectObj = {
      id: 'tv1', kind: 'rect', center: { x: 5.5, y: 0.6 }, w: 1.4, h: 0.3,
      rotation: 0, absorption: 0.05, label: 'TV', role: 'tv', height: 1.5,
    };
    const withTv = { ...scene, objects: [...scene.objects, tv] };
    const res = suggestPlacement(withTv, { mode: 'cinema', stereo: true, inventory: { homepod: 2 } });
    expect(res.notes.join(' ')).toMatch(/no line of sight|another room/i);
    expect(res.speakers.length).toBeGreaterThan(0); // fell back, did not give up
  });

  it('picks a cinema best-spot that can actually see the screen', () => {
    const s = blankScene();
    const mk = (x: number, y: number, label: string): SpeakerObj => ({
      id: `sp-${label}`, pos: { x, y }, z: 1, label, model: 'homepod', trimDb: 0,
    });
    // An occluding partial wall between the room's right half and the TV.
    const baffle: WallObj = {
      id: 'baffle', kind: 'wall', a: { x: 3.5, y: 0 }, b: { x: 3.5, y: 2.2 },
      absorption: 0.2, label: 'Wall', height: 2.7,
    };
    const tv: RectObj = {
      id: 'tv1', kind: 'rect', center: { x: 1, y: 0.4 }, w: 1.4, h: 0.3,
      rotation: 0, absorption: 0.05, label: 'TV', role: 'tv', height: 1.5,
    };
    const scene: Scene = {
      ...s,
      objects: [...rectRoomWalls(6, 5), baffle, tv],
      speakers: [mk(1, 2, 'A'), mk(2, 2, 'B')],
      listener: { pos: { x: 1.5, y: 3 }, z: 1.2 },
    };
    const field = bestListeningSpot(scene, true); // cinema mode weights the TV seat
    expect(field.best).toBeTruthy();
    // The winning seat must have a clear sight line to the screen (tvViewQuality
    // sinks to 0.1 behind the baffle, so the field must avoid that dead zone).
    // Exclude the TV's own rect, exactly as tvViewQuality does — the sight ray
    // starts inside it, so its own edges must not self-occlude.
    const surfaces = collectSurfaces(scene.objects).filter((s) => s.objectId !== tv.id);
    expect(directPath(surfaces, tv.center, 1.2, field.best!, 1.2).blocked).toBe(false);
    // …and it is not hiding in the baffle's TV shadow (x > 3.5, y < 2.2).
    expect(field.best!.x < 3.5 || field.best!.y > 2.2).toBe(true);
  });
});
