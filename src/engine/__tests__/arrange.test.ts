import { describe, expect, it } from 'vitest';
import type { RectObj, Scene, SceneObject, WallObj } from '../types';
import { arrangeFurniture } from '../arrange';
import { blankScene, createId, rectRoomWalls, ROOM_HEIGHT } from '../scene';

/** Arrange only ever returns rects/circles — narrow away walls for .center. */
const placedOf = (objects: SceneObject[]) =>
  objects.filter((o): o is Exclude<SceneObject, WallObj> => o.kind !== 'wall');

function room(w = 5, d = 4): Scene {
  const s = blankScene();
  return { ...s, objects: rectRoomWalls(w, d), listener: { ...s.listener, pos: { x: w / 2, y: d / 2 } } };
}

function addRect(scene: Scene, partial: Partial<RectObj> & Pick<RectObj, 'center' | 'w' | 'h' | 'role'>): Scene {
  const rect: RectObj = {
    id: createId('rect'),
    kind: 'rect',
    rotation: 0,
    absorption: 0.1,
    label: partial.role ?? 'rect',
    height: 2,
    ...partial,
  };
  return { ...scene, objects: [...scene.objects, rect] };
}

const wallsOf = (s: Scene) => s.objects.filter((o): o is WallObj => o.kind === 'wall');

describe('arrangeFurniture placement rules', () => {
  it('refuses to run without a room', () => {
    const res = arrangeFurniture(blankScene(), [{ presetId: 'bed', count: 1 }]);
    expect(res.objects).toHaveLength(0);
    expect(res.notes[0]).toMatch(/Build the room/);
  });

  it('keeps the bed away from the window wall (no headboard under glass)', () => {
    // Window centred on the north wall (y = 0).
    const scene = addRect(room(5, 4), {
      center: { x: 2.5, y: 0 },
      w: 1.2,
      h: 0.12,
      role: 'window',
      height: 2.2,
    });
    const res = arrangeFurniture(scene, [{ presetId: 'bed', count: 1 }]);
    const bed = placedOf(res.objects).find((o) => o.label === 'Bed');
    expect(bed).toBeDefined();
    if (bed) {
      expect(Math.hypot(bed.center.x - 2.5, bed.center.y - 0)).toBeGreaterThan(1.1);
    }
  });

  it('keeps every piece out of the door corridor', () => {
    // Door on the south wall (y = 4), corridor extends into the room.
    const scene = addRect(room(5, 4), {
      center: { x: 2.5, y: 4 },
      w: 0.9,
      h: 0.1,
      role: 'door',
      height: 2.05,
    });
    const res = arrangeFurniture(scene, [
      { presetId: 'bed', count: 1 },
      { presetId: 'sofa', count: 1 },
      { presetId: 'dining', count: 1 },
    ]);
    for (const o of placedOf(res.objects)) {
      // Nothing may sit inside the 1.1 m corridor strip in front of the door.
      const inCorridorX = Math.abs(o.center.x - 2.5) < (0.9 + 0.4) / 2 + 0.4;
      const inCorridorY = o.center.y > 4 - 1.1 - 0.5;
      expect(inCorridorX && inCorridorY).toBe(false);
    }
  });

  it('places the desk near the window for daylight', () => {
    const scene = addRect(room(6, 4), {
      center: { x: 0, y: 2 },
      w: 1.2,
      h: 0.12,
      rotation: Math.PI / 2,
      role: 'window',
      height: 2.2,
    });
    const res = arrangeFurniture(scene, [{ presetId: 'desk', count: 1 }]);
    const desk = placedOf(res.objects).find((o) => o.label === 'Desk');
    expect(desk).toBeDefined();
    if (desk) {
      expect(Math.hypot(desk.center.x - 0, desk.center.y - 2)).toBeLessThan(2.2);
    }
    expect(res.notes.join(' ')).toMatch(/daylight/);
  });

  it('explains each placement in the notes', () => {
    const res = arrangeFurniture(room(), [
      { presetId: 'bed', count: 1 },
      { presetId: 'plant', count: 1 },
    ]);
    expect(res.notes.some((n) => n.startsWith('Bed — '))).toBe(true);
    expect(res.objects.length).toBeGreaterThanOrEqual(1);
  });

  it('never crosses walls and keeps clearances', () => {
    const scene = room(4, 3);
    const res = arrangeFurniture(scene, [
      { presetId: 'bed', count: 1 },
      { presetId: 'wardrobe', count: 1 },
      { presetId: 'desk', count: 1 },
    ]);
    for (const o of placedOf(res.objects)) {
      expect(o.center.x).toBeGreaterThan(0);
      expect(o.center.x).toBeLessThan(4);
      expect(o.center.y).toBeGreaterThan(0);
      expect(o.center.y).toBeLessThan(3);
    }
    expect(wallsOf(scene)).toHaveLength(4);
    expect(ROOM_HEIGHT).toBeGreaterThan(2);
  });
});
