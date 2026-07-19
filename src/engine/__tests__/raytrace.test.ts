import { describe, expect, it } from 'vitest';
import { collectSurfaces, directPath, traceSpeaker } from '../raytrace';
import { nearestHit } from '../geometry';
import type { SceneObject, WallObj } from '../types';

const EAR = { pos: { x: 2, y: 5 }, z: 1.2 };

function boxWalls(size: number, absorption = 0.3): WallObj[] {
  const pts = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  return pts.map((a, i) => ({
    id: `w${i}`,
    kind: 'wall' as const,
    a,
    b: pts[(i + 1) % 4],
    absorption,
    label: 'Wall',
    height: 2.7,
  }));
}

const rect = (over: Partial<Extract<SceneObject, { kind: 'rect' }>>): SceneObject => ({
  id: 'r',
  kind: 'rect',
  center: { x: 3.5, y: 5 },
  w: 0.8,
  h: 2,
  rotation: 0,
  absorption: 0.7,
  label: 'Obj',
  role: 'furniture',
  height: 0.55,
  ...over,
});

describe('traceSpeaker in a closed box', () => {
  const surfaces = collectSurfaces(boxWalls(10));
  const result = traceSpeaker(surfaces, { x: 5, y: 5 }, 1.0, EAR, 90, 5);

  it('emits one path per ray', () => {
    expect(result.paths).toHaveLength(90);
  });

  it('never lets a ray escape the box (no pass-through)', () => {
    for (const path of result.paths) {
      for (const p of path.points) {
        expect(p.x).toBeGreaterThanOrEqual(-0.01);
        expect(p.x).toBeLessThanOrEqual(10.01);
        expect(p.y).toBeGreaterThanOrEqual(-0.01);
        expect(p.y).toBeLessThanOrEqual(10.01);
      }
    }
  });

  it('bounces: every ray reflects at least once', () => {
    for (const path of result.paths) {
      expect(path.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('loses energy monotonically along each path', () => {
    for (const path of result.paths) {
      for (let i = 1; i < path.energy.length; i++) {
        expect(path.energy[i]).toBeLessThan(path.energy[i - 1]);
      }
      if (path.energy.length > 1) {
        expect(path.energy[1]).toBeCloseTo(0.7);
      }
    }
  });

  it('captures arrivals near the listener', () => {
    expect(result.arrivals.length).toBeGreaterThan(0);
    for (const a of result.arrivals) {
      expect(a.timeMs).toBeGreaterThan(0);
      expect(a.amp).toBeGreaterThan(0);
      expect(a.amp).toBeLessThanOrEqual(1);
    }
  });
});

describe('height awareness', () => {
  it('rays at 1.0 m fly over a 0.55 m bed but reflect off a 2.4 m wardrobe', () => {
    const bed = rect({ height: 0.55 });
    const wardrobe = rect({ height: 2.4 });

    const overBed = traceSpeaker(collectSurfaces([...boxWalls(10), bed]), { x: 5, y: 5 }, 1.0, EAR, 64, 3);
    // A near-horizontal leftward ray keeps flying straight over the bed
    // (graze vertices don't change direction) until the far wall at x≈0.
    const leftRayOverBed = overBed.paths.find(
      (p) =>
        Math.abs(p.points[1].y - 5) < 0.4 &&
        p.points[1].x < 5 &&
        p.points.some((pt) => pt.x < 0.05 && Math.abs(pt.y - 5) < 0.4),
    );
    expect(leftRayOverBed).toBeDefined();

    const atWardrobe = traceSpeaker(collectSurfaces([...boxWalls(10), wardrobe]), { x: 5, y: 5 }, 1.0, EAR, 64, 3);
    // The same ray must now stop and reflect at the wardrobe's face (x ≈ 3.9).
    const leftRayBlocked = atWardrobe.paths.find(
      (p) => Math.abs(p.points[1].y - 5) < 0.4 && Math.abs(p.points[1].x - 3.9) < 0.15,
    );
    expect(leftRayBlocked).toBeDefined();
  });

  it('grazing over furniture costs some energy but does not reflect', () => {
    // Ray at 1.0 m over a 0.8 m couch → within the 0.5 m graze band.
    const couch = rect({ height: 0.8, absorption: 0.7 });
    const result = traceSpeaker(collectSurfaces([...boxWalls(10), couch]), { x: 5, y: 5 }, 1.0, EAR, 32, 3);
    const grazed = result.paths.find(
      (p) => Math.abs(p.points[1].y - 5) < 0.4 && p.points[1].x < 5 && p.energy.length >= 2,
    );
    expect(grazed).toBeDefined();
    // Energy dropped at the graze without a direction change ending the flight there.
    expect(grazed!.energy[1]).toBeLessThan(grazed!.energy[0]);
    expect(grazed!.energy[1]).toBeGreaterThan(0.4); // graze ≠ full absorption hit
  });
});

describe('directPath (height-aware line of sight)', () => {
  const openBox = collectSurfaces(boxWalls(10));

  it('is clear when nothing blocks the line of sight', () => {
    const d = directPath(openBox, { x: 5, y: 5 }, 1.0, { x: 2, y: 5 }, 1.2);
    expect(d.blocked).toBe(false);
    expect(d.distance).toBeCloseTo(3);
    expect(d.distance3d).toBeCloseTo(Math.hypot(3, 0.2));
  });

  it('is blocked by a full-height interior wall', () => {
    const divider: SceneObject = {
      id: 'div',
      kind: 'wall',
      a: { x: 3.5, y: 0 },
      b: { x: 3.5, y: 10 },
      absorption: 0.1,
      label: 'Wall',
      height: 2.7,
    };
    const surfaces = collectSurfaces([...boxWalls(10), divider]);
    expect(directPath(surfaces, { x: 5, y: 5 }, 1.0, { x: 2, y: 5 }, 1.2).blocked).toBe(true);
  });

  it('lying on the bed: the bed under your ears does not block, only grazes', () => {
    // Bed top 0.55 m; ears at 0.8 m (lying on it); speaker at 1.0 m across the room.
    const bed = rect({ center: { x: 2.5, y: 5 }, w: 2, h: 1.6, height: 0.55 });
    const surfaces = collectSurfaces([...boxWalls(10), bed]);
    const d = directPath(surfaces, { x: 8, y: 5 }, 1.0, { x: 2.5, y: 5 }, 0.8);
    expect(d.blocked).toBe(false);
    expect(d.attenuation).toBeLessThan(1); // grazing the mattress edge costs a little
    expect(d.attenuation).toBeGreaterThan(0.5);
  });

  it('sitting behind a wardrobe IS blocked', () => {
    const wardrobe = rect({ center: { x: 5, y: 5 }, height: 2.4 });
    const surfaces = collectSurfaces([...boxWalls(10), wardrobe]);
    expect(directPath(surfaces, { x: 8, y: 5 }, 1.0, { x: 2, y: 5 }, 1.2).blocked).toBe(true);
  });
});

describe('doors and windows cut real openings', () => {
  const divider: SceneObject = {
    id: 'div',
    kind: 'wall',
    a: { x: 5, y: 0 },
    b: { x: 5, y: 10 },
    absorption: 0.1,
    label: 'Wall',
    height: 2.7,
  };
  const door = (open: boolean): SceneObject => ({
    id: 'door',
    kind: 'rect',
    center: { x: 5, y: 5 },
    w: 0.9,
    h: 0.1,
    rotation: Math.PI / 2, // aligned with the vertical wall
    absorption: 0.25,
    label: 'Door',
    role: 'door',
    doorOpen: open,
    height: 2.05,
  });

  it('an open door lets sound straight through the doorway', () => {
    const surfaces = collectSurfaces([...boxWalls(10), divider, door(true)]);
    expect(directPath(surfaces, { x: 3, y: 5 }, 1.0, { x: 7, y: 5 }, 1.2).blocked).toBe(false);
    // …but only through the doorway — the rest of the wall still blocks.
    expect(directPath(surfaces, { x: 3, y: 2 }, 1.0, { x: 7, y: 2 }, 1.2).blocked).toBe(true);
  });

  it('a closed door blocks the doorway again', () => {
    const surfaces = collectSurfaces([...boxWalls(10), divider, door(false)]);
    expect(directPath(surfaces, { x: 3, y: 5 }, 1.0, { x: 7, y: 5 }, 1.2).blocked).toBe(true);
  });

  it('a window replaces its wall span with its own glass', () => {
    const window: SceneObject = {
      id: 'win',
      kind: 'rect',
      center: { x: 5, y: 5 },
      w: 1.2,
      h: 0.12,
      rotation: Math.PI / 2,
      absorption: 0.04,
      label: 'Window',
      role: 'window',
      height: 2.2,
    };
    const surfaces = collectSurfaces([...boxWalls(10), divider, window]);
    // Still blocked (glass is solid at ear height)…
    expect(directPath(surfaces, { x: 3, y: 5 }, 1.0, { x: 7, y: 5 }, 1.2).blocked).toBe(true);
    // …but the surface hit in the window span belongs to the window, not the wall.
    const hit = nearestHit(surfaces, { x: 3, y: 5 }, { x: 1, y: 0 });
    expect(hit?.surface.objectId).toBe('win');
    expect(hit?.surface.absorption).toBeCloseTo(0.04);
  });
});

describe('capture occlusion', () => {
  it('does not register direct arrivals through a wall the listener hides behind', () => {
    // Interior wall right in front of the listener: rays hit its far side
    // within the capture radius, but the listener is shadowed.
    const shield: SceneObject = {
      id: 'shield',
      kind: 'wall',
      a: { x: 4, y: 5.1 },
      b: { x: 6, y: 5.1 },
      absorption: 0.1,
      label: 'Wall',
      height: 2.7,
    };
    const surfaces = collectSurfaces([...boxWalls(10), shield]);
    const listener = { pos: { x: 5, y: 5.25 }, z: 1.2 };
    const result = traceSpeaker(surfaces, { x: 5, y: 1 }, 1.0, listener, 180, 4);
    // Any zero-bounce arrival would have punched through the shield.
    expect(result.arrivals.filter((a) => a.order === 0)).toHaveLength(0);
  });
});
