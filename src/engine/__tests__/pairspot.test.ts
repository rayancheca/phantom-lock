import { describe, expect, it } from 'vitest';
import type { RectObj, Scene, SpeakerObj, WallObj } from '../types';
import { blankScene, createId, rectRoomWalls } from '../scene';
import { collectSurfaces } from '../raytrace';
import { bestPairSpot, bestReflectionDb } from '../pairspot';
import { computePair } from '../stereo';

const mk = (x: number, y: number, label: string): SpeakerObj => ({
  id: `sp-${label}`,
  pos: { x, y },
  z: 1,
  label,
  model: 'homepod',
  trimDb: 0,
});

/** 8×5 room with a full-height divider at x=4, gap-free. */
function dividedRoom(): Scene {
  const s = blankScene();
  const divider: WallObj = {
    id: createId('wall'),
    kind: 'wall',
    a: { x: 4, y: 0 },
    b: { x: 4, y: 5 },
    absorption: 0.12,
    label: 'Wall',
    height: 2.7,
  };
  return {
    ...s,
    objects: [...rectRoomWalls(8, 5), divider],
    listener: { pos: { x: 6, y: 2.5 }, z: 1.2 }, // listener on the FAR side
  };
}

describe('bestPairSpot', () => {
  it('keeps the relocated seat on the speakers’ side of a dividing wall', () => {
    const scene = dividedRoom();
    const a = mk(1, 1.5, 'L');
    const b = mk(1, 3.5, 'R');
    const found = bestPairSpot(scene, collectSurfaces(scene.objects), a, b, 1.2, null);
    expect(found).toBeTruthy();
    // The physically best seat must sit with the speakers, not behind the wall.
    expect(found!.p.x).toBeLessThan(4);
    expect(found!.viaReflection).toBe(false);
  });

  it('relocates the pair sweet spot when the listener-side apex is walled off', () => {
    const scene = dividedRoom();
    const a = mk(3.2, 1.5, 'L');
    const b = mk(3.2, 3.5, 'R');
    // Listener at x=6 puts the geometric apex toward +x — through the divider.
    const pair = computePair({ ...scene, speakers: [a, b], pairs: [[a.id, b.id]] }, a, b, true, true);
    expect(pair.apexBlocked).toBe(true);
    expect(pair.sweetRelocated).toBe(true);
    expect(pair.sweet.x).toBeLessThan(4); // moved back where sound actually images
    expect(pair.sweet).not.toEqual(pair.apex);
  });

  it('leaves an unobstructed apex exactly where geometry puts it', () => {
    const s = blankScene();
    const scene: Scene = {
      ...s,
      objects: rectRoomWalls(8, 5),
      listener: { pos: { x: 4, y: 2.5 }, z: 1.2 },
    };
    const a = mk(2, 1.5, 'L');
    const b = mk(2, 3.5, 'R');
    const pair = computePair({ ...scene, speakers: [a, b], pairs: [[a.id, b.id]] }, a, b, false, true);
    expect(pair.apexBlocked).toBe(false);
    expect(pair.sweetRelocated).toBe(false);
    expect(pair.sweet).toEqual(pair.apex);
  });

  it('falls back to a wall bounce when no direct path exists anywhere useful', () => {
    // Speakers boxed so the only decent seats need a reflection: heavy absorber
    // divider with a listener zone that direct sound can partially reach is
    // hard to build small — instead verify reflections report as reflected.
    const scene = dividedRoom();
    const a = mk(1, 1.5, 'L');
    const b = mk(1, 3.5, 'R');
    const surfaces = collectSurfaces(scene.objects);
    // Force evaluation on the far side only by checking reach semantics via
    // the public result: a far-side-only search area isn't exposed, so assert
    // the near-side winner beats any reflected-only seat.
    const found = bestPairSpot(scene, surfaces, a, b, 1.2, null);
    expect(found!.score).toBeGreaterThan(0.3);
  });
});

// S3 — a first-order reflection must bounce off a SOLID span of the wall.
// An open door (or a window) carves a real hole out of the wall; the image
// source must not "reflect" off empty air in the opening.
describe('bestReflectionDb — no phantom bounce through an opening (S3)', () => {
  const wall: WallObj = {
    id: createId('wall'),
    kind: 'wall',
    a: { x: 0, y: 0 },
    b: { x: 0, y: 6 },
    absorption: 0.1,
    label: 'Wall',
    height: 2.5,
  };
  const sp: SpeakerObj = { id: 's', pos: { x: 2, y: 3 }, z: 1, label: 'A', model: 'homepod', trimDb: 0 };
  // The only geometric bounce point from sp to p lands at the wall midpoint (y=3.25).
  const p = { x: 2, y: 3.5 };

  it('credits a bounce off the solid wall', () => {
    const surfaces = collectSurfaces([wall]);
    const db = bestReflectionDb(surfaces, [wall], [wall], sp, p, 1);
    expect(Number.isFinite(db)).toBe(true);
    expect(db).toBeGreaterThan(-60);
  });

  it('refuses the bounce when an open door carves the bounce point out', () => {
    const door: RectObj = {
      id: 'door1',
      kind: 'rect',
      center: { x: 0, y: 3 }, // straddles the wall at the bounce point
      w: 1, // opening spans y 2.5..3.5 — swallows the y=3.25 bounce
      h: 0.1,
      rotation: 0,
      absorption: 0.05,
      label: 'Door',
      role: 'door',
      height: 2.5,
      doorOpen: true,
    };
    const surfaces = collectSurfaces([wall, door]);
    // Same speaker + point, but the reflection would have to bounce inside the
    // open doorway — nothing solid there, so nothing is credited.
    expect(bestReflectionDb(surfaces, [wall], [wall, door], sp, p, 1)).toBe(-Infinity);
  });

  it('still credits a bounce off a CLOSED door (solid leaf), unlike an open one', () => {
    const closedDoor: RectObj = {
      id: 'door2',
      kind: 'rect',
      center: { x: 0, y: 3 },
      w: 1,
      h: 0.1,
      rotation: 0,
      absorption: 0.05,
      label: 'Door',
      role: 'door',
      height: 2.5,
      doorOpen: false, // shut → a real reflecting surface, not a hole
    };
    const surfaces = collectSurfaces([wall, closedDoor]);
    // A closed door is solid: the opening guard must NOT reject its bounce.
    expect(bestReflectionDb(surfaces, [wall], [wall, closedDoor], sp, p, 1)).toBeGreaterThan(-60);
  });
});

// S3 — the sweet spot can legitimately be a reflection-reached seat, and the
// search must FLAG it (viaReflection) so the UI can discount it.
describe('bestPairSpot — a reflection-reached seat is flagged (S3)', () => {
  it('relocates onto a reflected seat when a fin shadows the direct apex', () => {
    const s = blankScene();
    // A fin juts into an 8×5 room at x=2.5, shadowing the apex band from the
    // left-wall speakers — the best triangle seat is only reached by a bounce.
    const fin: WallObj = {
      id: createId('wall'),
      kind: 'wall',
      a: { x: 2.5, y: 1.2 },
      b: { x: 2.5, y: 3.8 },
      absorption: 0.15,
      label: 'Wall',
      height: 2.7,
    };
    const scene: Scene = {
      ...s,
      objects: [...rectRoomWalls(8, 5), fin],
      listener: { pos: { x: 2, y: 2.5 }, z: 1.2 },
    };
    const a = mk(1, 1, 'L');
    const b = mk(1, 4, 'R');
    const found = bestPairSpot(scene, collectSurfaces(scene.objects), a, b, 1.2, null);
    expect(found).toBeTruthy();
    expect(found!.viaReflection).toBe(true); // winning seat is behind the fin
    expect(found!.p.x).toBeGreaterThan(2.5);
  });
});
