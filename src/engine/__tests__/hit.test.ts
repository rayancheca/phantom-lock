import { describe, expect, it } from 'vitest';
import { hitInactiveSeat, hitTestNodes, hitTestObjects } from '../hit';
import { addListener, blankScene } from '../scene';
import type { Scene, SceneObject } from '../types';

function sceneWith(objects: SceneObject[]): Scene {
  return { ...blankScene(), objects };
}
const wall = (id: string, a = { x: 0, y: 0 }, b = { x: 4, y: 0 }): SceneObject => ({
  id,
  kind: 'wall',
  a,
  b,
  absorption: 0.1,
  label: 'W',
  height: 2.7,
});

describe('hitInactiveSeat', () => {
  it('returns null when there is only one seat', () => {
    const scene = blankScene();
    expect(hitInactiveSeat(scene, scene.listener.pos, 0.1)).toBeNull();
  });

  it('finds an inactive seat under the point but never the active one', () => {
    // blankScene seat at (2.5,2.5); adding "Bed" at (5,5) makes Bed active.
    const scene = addListener(blankScene(), 'Bed', { x: 5, y: 5 });
    const couch = scene.listeners!.find((l) => l.name !== 'Bed')!;
    expect(hitInactiveSeat(scene, couch.pos, 0.1)).toBe(couch.id);
    // The active seat (its mirror) is handled by hitTestNodes, not this.
    expect(hitInactiveSeat(scene, scene.listener.pos, 0.1)).toBeNull();
    // Empty space is a miss.
    expect(hitInactiveSeat(scene, { x: 0, y: 0 }, 0.1)).toBeNull();
  });

  it('keeps the active seat as the draggable listener puck', () => {
    const scene = addListener(blankScene(), 'Bed', { x: 5, y: 5 });
    expect(hitTestNodes(scene, scene.listener.pos, 0.1)).toEqual({ type: 'listener' });
  });
});

describe('hitTestNodes', () => {
  it('hits a speaker puck and misses empty space', () => {
    const scene: Scene = {
      ...blankScene(),
      speakers: [{ id: 'A', pos: { x: 6, y: 6 }, z: 1, label: 'A', model: 'homepod', trimDb: 0 }],
    };
    expect(hitTestNodes(scene, { x: 6, y: 6 }, 0.1)).toEqual({ type: 'speaker', id: 'A' });
    expect(hitTestNodes(scene, { x: 0, y: 9 }, 0.1)).toBeNull();
  });
});

describe('hitTestObjects', () => {
  it('hits a wall, a rect, and a circle by their geometry', () => {
    const rect: SceneObject = {
      id: 'r',
      kind: 'rect',
      center: { x: 2, y: 3 },
      w: 1,
      h: 1,
      rotation: 0,
      absorption: 0.2,
      label: 'Box',
      role: 'furniture',
      height: 0.8,
    };
    const circle: SceneObject = {
      id: 'c',
      kind: 'circle',
      center: { x: 6, y: 6 },
      r: 0.5,
      absorption: 0.2,
      label: 'T',
      height: 0.75,
    };
    const scene = sceneWith([wall('w'), rect, circle]);
    expect(hitTestObjects(scene, { x: 2, y: 0 }, 0.1)).toEqual({ type: 'object', id: 'w' });
    expect(hitTestObjects(scene, { x: 2, y: 3 }, 0.1)).toEqual({ type: 'object', id: 'r' });
    expect(hitTestObjects(scene, { x: 6, y: 6 }, 0.1)).toEqual({ type: 'object', id: 'c' });
    expect(hitTestObjects(scene, { x: 9, y: 9 }, 0.1)).toBeNull();
  });

  it('prioritizes a door/window opening over the wall beneath it', () => {
    const door: SceneObject = {
      id: 'd',
      kind: 'rect',
      center: { x: 2, y: 0 },
      w: 0.9,
      h: 0.1,
      rotation: 0,
      absorption: 0.2,
      label: 'Door',
      role: 'door',
      doorOpen: true,
      height: 2.05,
    };
    const scene = sceneWith([wall('w'), door]);
    // A click on the shared line returns the opening, not the wall under it.
    expect(hitTestObjects(scene, { x: 2, y: 0 }, 0.05)).toEqual({ type: 'object', id: 'd' });
  });
});
