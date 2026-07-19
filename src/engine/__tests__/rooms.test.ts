import { describe, expect, it } from 'vitest';
import { blankScene, rectRoomWalls, addRoomShell } from '../scene';
import { regionOf, sameRegion } from '../rooms';
import { bestListeningSpot } from '../bestspot';
import { suggestPlacement } from '../optimize';
import { suggestInventory } from '../arrange';
import type { RectObj, Scene, SpeakerObj } from '../types';

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
    expect(bestReflectionDb(surfaces, walls, sp, { x: 3, y: 3 }, 1.2)).toBeGreaterThan(-40);
    // Far side of a solid divider: every bounce leg is blocked — no phantom paths.
    expect(bestReflectionDb(surfaces, walls, sp, { x: 6, y: 2 }, 1.2)).toBe(-Infinity);
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
