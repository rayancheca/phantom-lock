import { describe, expect, it } from 'vitest';
import {
  activeListener,
  addListener,
  apartmentScene,
  blankScene,
  DEFAULT_LISTENER_NAME,
  removeListener,
  renameListener,
  sanitizeScene,
  sanitizeLayout,
  sceneBounds,
  sceneListeners,
  setActiveListener,
  updateActiveListener,
} from '../scene';
import { traceScene } from '../raytrace';
import { computeAudio } from '../stereo';
import type { Scene } from '../types';

/** The mirror invariant: scene.listener ALWAYS equals the active seat's {pos,z}. */
function assertMirrorSynced(scene: Scene): void {
  const active = activeListener(scene);
  expect(scene.listener.pos).toEqual(active.pos);
  expect(scene.listener.z).toBe(active.z);
  expect(scene.activeListenerId).toBe(active.id);
}

describe('sanitizeScene — named listeners migration', () => {
  it('upgrades a v2 single {pos,z} listener into one named seat with identical pos/z', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listener: { pos: { x: 2.3, y: 3.9 }, z: 1.4 },
    })!;
    expect(scene.listeners).toHaveLength(1);
    expect(scene.listeners![0].pos).toEqual({ x: 2.3, y: 3.9 });
    expect(scene.listeners![0].z).toBeCloseTo(1.4);
    expect(scene.listeners![0].name).toBe(DEFAULT_LISTENER_NAME);
    expect(scene.activeListenerId).toBe(scene.listeners![0].id);
    // The back-compat mirror still resolves and matches the seat.
    expect(scene.listener.pos).toEqual({ x: 2.3, y: 3.9 });
    assertMirrorSynced(scene);
  });

  it('upgrades a v1 {x,y} listener into one named seat at ear height 1.2', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listener: { x: 2, y: 3 },
    })!;
    expect(scene.listeners).toHaveLength(1);
    expect(scene.listeners![0].pos).toEqual({ x: 2, y: 3 });
    expect(scene.listeners![0].z).toBeCloseTo(1.2);
    expect(scene.listener.pos).toEqual({ x: 2, y: 3 });
    assertMirrorSynced(scene);
  });

  it('preserves multiple named seats and the active id, mirroring the active one', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listeners: [
        { id: 's1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 },
        { id: 's2', name: 'Bed', pos: { x: 5, y: 5 }, z: 0.8 },
      ],
      activeListenerId: 's2',
    })!;
    expect(scene.listeners).toHaveLength(2);
    expect(scene.listeners!.map((l) => l.name)).toEqual(['Couch', 'Bed']);
    expect(scene.activeListenerId).toBe('s2');
    // Mirror follows the ACTIVE seat (Bed), not the first one.
    expect(scene.listener.pos).toEqual({ x: 5, y: 5 });
    expect(scene.listener.z).toBeCloseTo(0.8);
    assertMirrorSynced(scene);
  });

  it('falls back to the first seat when activeListenerId points at a missing seat', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listeners: [{ id: 's1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 }],
      activeListenerId: 'ghost',
    })!;
    expect(scene.activeListenerId).toBe('s1');
    assertMirrorSynced(scene);
  });

  it('recovers when listeners is an empty array by using the legacy listener', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listeners: [],
      listener: { pos: { x: 4, y: 4 }, z: 1.2 },
    })!;
    expect(scene.listeners!.length).toBeGreaterThanOrEqual(1);
    expect(scene.listener.pos).toEqual({ x: 4, y: 4 });
    assertMirrorSynced(scene);
  });

  it('always yields at least one seat even with no listener data at all', () => {
    const scene = sanitizeScene({ objects: [], speakers: [], pairs: [] })!;
    expect(scene.listeners!.length).toBeGreaterThanOrEqual(1);
    assertMirrorSynced(scene);
  });

  it('drops listener entries with invalid positions and de-dupes colliding seat ids', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listeners: [
        { id: 'x', name: 'Good', pos: { x: 1, y: 1 }, z: 1.2 },
        { id: 'x', name: 'Also good', pos: { x: 2, y: 2 }, z: 1.2 }, // duplicate id
        { id: 'bad', name: 'Bad', pos: { x: NaN, y: 1 }, z: 1.2 }, // invalid pos → dropped
      ],
      activeListenerId: 'x',
    })!;
    const seats = scene.listeners!;
    expect(seats).toHaveLength(2);
    expect(new Set(seats.map((s) => s.id)).size).toBe(2);
    assertMirrorSynced(scene);
  });

  it('clamps a wild seat ear height into a sane range', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [],
      pairs: [],
      listeners: [{ id: 's1', name: 'Seat', pos: { x: 1, y: 1 }, z: 99 }],
      activeListenerId: 's1',
    })!;
    expect(scene.listeners![0].z).toBeLessThanOrEqual(6);
    expect(scene.listener.z).toBeLessThanOrEqual(6);
  });
});

describe('old exported JSON round-trip', () => {
  it('imports an old single-listener exported layout and synthesizes a seat', () => {
    const oldExport = JSON.stringify({
      name: 'My layout',
      scene: {
        objects: [
          { id: 'w1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, absorption: 0.1, label: 'Wall', height: 2.7 },
        ],
        speakers: [],
        pairs: [],
        listener: { pos: { x: 2, y: 2 }, z: 1.2 },
      },
      settings: { rayCount: 360, maxBounces: 5 },
    });
    const layout = sanitizeLayout(JSON.parse(oldExport))!;
    expect(layout).not.toBeNull();
    expect(layout.scene.listeners).toHaveLength(1);
    expect(layout.scene.listener.pos).toEqual({ x: 2, y: 2 });
    assertMirrorSynced(layout.scene);
  });

  it('round-trips a multi-seat scene through JSON without losing seats', () => {
    const src = addListener(apartmentScene(), 'Bed', { x: 4.6, y: 4.6 });
    const roundTripped = sanitizeScene(JSON.parse(JSON.stringify(src)))!;
    expect(roundTripped.listeners).toHaveLength(2);
    expect(roundTripped.listeners!.map((l) => l.name)).toContain('Bed');
    expect(roundTripped.activeListenerId).toBe(src.activeListenerId);
    assertMirrorSynced(roundTripped);
  });
});

describe('listener write helpers keep the mirror synced', () => {
  it('updateActiveListener moves only the active seat and the mirror', () => {
    const base = addListener(blankScene(), 'Bed', { x: 5, y: 5 }); // active = Bed
    const other = base.listeners!.find((l) => l.name !== 'Bed')!;
    const moved = updateActiveListener(base, { pos: { x: 6, y: 6 } });
    expect(activeListener(moved).pos).toEqual({ x: 6, y: 6 });
    expect(moved.listener.pos).toEqual({ x: 6, y: 6 });
    // The inactive seat is untouched.
    expect(moved.listeners!.find((l) => l.id === other.id)!.pos).toEqual(other.pos);
    assertMirrorSynced(moved);
  });

  it('setActiveListener switches the active seat and re-points the mirror', () => {
    const base = addListener(blankScene(), 'Bed', { x: 5, y: 5 }); // active = Bed
    const couch = base.listeners!.find((l) => l.name !== 'Bed')!;
    const switched = setActiveListener(base, couch.id);
    expect(switched.activeListenerId).toBe(couch.id);
    expect(switched.listener.pos).toEqual(couch.pos);
    assertMirrorSynced(switched);
  });

  it('setActiveListener ignores an unknown id', () => {
    const base = blankScene();
    const same = setActiveListener(base, 'nope');
    expect(same.activeListenerId).toBe(base.activeListenerId);
  });

  it('addListener appends a seat, makes it active, and offsets it from the source', () => {
    const base = blankScene();
    const added = addListener(base);
    expect(added.listeners).toHaveLength(2);
    expect(added.activeListenerId).toBe(added.listeners![1].id);
    assertMirrorSynced(added);
  });

  it('renameListener changes only the name', () => {
    const base = blankScene();
    const id = base.listeners![0].id;
    const renamed = renameListener(base, id, 'Couch');
    expect(renamed.listeners![0].name).toBe('Couch');
    expect(renamed.listener.pos).toEqual(base.listener.pos);
    assertMirrorSynced(renamed);
  });

  it('removeListener never drops below one seat', () => {
    const base = blankScene();
    const same = removeListener(base, base.listeners![0].id);
    expect(same.listeners).toHaveLength(1);
  });

  it('removeListener re-activates a survivor when the active seat is removed', () => {
    const base = addListener(blankScene(), 'Bed', { x: 5, y: 5 }); // active = Bed
    const bedId = base.activeListenerId!;
    const pruned = removeListener(base, bedId);
    expect(pruned.listeners).toHaveLength(1);
    expect(pruned.activeListenerId).not.toBe(bedId);
    assertMirrorSynced(pruned);
  });
});

describe('sceneListeners / activeListener helpers are defensive', () => {
  it('synthesizes a seat for a hand-built scene that only has the mirror', () => {
    const handBuilt = { objects: [], speakers: [], pairs: [], listener: { pos: { x: 3, y: 3 }, z: 1.2 } } as Scene;
    const seats = sceneListeners(handBuilt);
    expect(seats.length).toBeGreaterThanOrEqual(1);
    expect(activeListener(handBuilt).pos).toEqual({ x: 3, y: 3 });
  });
});

describe('sceneBounds frames every seat', () => {
  it('expands to include an inactive seat far from the active one', () => {
    const base = addListener(apartmentScene(), 'Far', { x: 30, y: 30 });
    const b = sceneBounds(base);
    expect(b.max.x).toBeGreaterThanOrEqual(30);
    expect(b.max.y).toBeGreaterThanOrEqual(30);
  });
});

describe('engine reads the SAME active seat for tracer and verdict (no desync)', () => {
  function twoSeatScene(): Scene {
    // A speaker to the "north"; two seats at very different distances.
    const scene: Scene = {
      objects: [],
      speakers: [{ id: 'A', pos: { x: 5, y: 1 }, z: 1.0, label: 'A', model: 'homepod', trimDb: 0 }],
      pairs: [],
      listeners: [
        { id: 'near', name: 'Near', pos: { x: 5, y: 2 }, z: 1.2 },
        { id: 'far', name: 'Far', pos: { x: 5, y: 8 }, z: 1.2 },
      ],
      activeListenerId: 'near',
      listener: { pos: { x: 5, y: 2 }, z: 1.2 },
    };
    return scene;
  }

  it('traceScene.direct and computeAudio.solo agree, and both follow the active seat', () => {
    const near = twoSeatScene();
    const traceNear = traceScene(near, 360, 3);
    const audioNear = computeAudio(near, traceNear, false);
    // Both derive from the SAME active seat → identical distance.
    expect(audioNear.solos[0].dist3d).toBeCloseTo(traceNear.bySpeaker[0].direct.distance3d, 6);

    const far = setActiveListener(near, 'far');
    const traceFar = traceScene(far, 360, 3);
    const audioFar = computeAudio(far, traceFar, false);
    expect(audioFar.solos[0].dist3d).toBeCloseTo(traceFar.bySpeaker[0].direct.distance3d, 6);

    // Switching the seat genuinely changes the verdict for both in lockstep.
    expect(audioFar.solos[0].dist3d).toBeGreaterThan(audioNear.solos[0].dist3d + 1);
    expect(traceFar.bySpeaker[0].direct.distance3d).toBeGreaterThan(
      traceNear.bySpeaker[0].direct.distance3d + 1,
    );
  });
});
