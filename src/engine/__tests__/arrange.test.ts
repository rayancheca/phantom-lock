import { describe, expect, it } from 'vitest';
import type { RectObj, Scene, SceneObject, WallObj } from '../types';
import { arrangeFurniture, faceToward, suggestInventory } from '../arrange';
import { apartmentScene, blankScene, createId, rectRoomWalls, ROOM_HEIGHT } from '../scene';

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

  it('positions a new TV opposite a PRE-EXISTING sofa (S3 findByLabel)', () => {
    // The sofa already lives in the scene (not part of this arrange run), so it
    // sits in scene.objects, never in ctx.placed. Before the fix findByLabel
    // scanned only ctx.placed and missed it, so the TV was placed blind.
    const scene = addRect(room(6, 4), {
      center: { x: 3, y: 3.2 },
      w: 2,
      h: 0.9,
      role: 'furniture',
      label: 'Sofa',
      height: 0.9,
    });
    const res = arrangeFurniture(scene, [{ presetId: 'tv', count: 1 }]);
    const tv = placedOf(res.objects).find((o) => o.kind === 'rect' && o.role === 'tv');
    expect(tv).toBeDefined();
    expect(res.notes.join(' ')).toMatch(/opposite the seating/);
  });
});

describe('S33: an open-floor piece chooses its own heading', () => {
  it('faceToward points a rect FRONT at the target, agreeing with inwardOf', () => {
    // A rect's front is its local +y = (-sin r, cos r). Four cardinal checks,
    // each verifiable by hand.
    const at = { x: 0, y: 0 };
    const north = faceToward(at, { x: 0, y: -1 })!;
    const south = faceToward(at, { x: 0, y: 1 })!;
    const east = faceToward(at, { x: 1, y: 0 })!;
    for (const [turn, want] of [
      [north, { x: 0, y: -1 }],
      [south, { x: 0, y: 1 }],
      [east, { x: 1, y: 0 }],
    ] as const) {
      expect(-Math.sin(turn.rotation)).toBeCloseTo(want.x, 12);
      expect(Math.cos(turn.rotation)).toBeCloseTo(want.y, 12);
      expect(turn.facing.x).toBeCloseTo(want.x, 12);
      expect(turn.facing.y).toBeCloseTo(want.y, 12);
    }
  });

  it('returns null on a DEGENERATE target instead of leaking NaN downstream', () => {
    // v.norm of a zero vector is NaN, and a NaN facing propagates silently
    // through every dot product in scoreSlot — every comparison goes false and
    // the piece is rejected for a reason nothing reports.
    expect(faceToward({ x: 3, y: 4 }, { x: 3, y: 4 })).toBeNull();
    expect(faceToward({ x: 0, y: 0 }, { x: 1e-12, y: 0 })).toBeNull();
  });

  it('THE BUG: an armchair faces the TV whichever wall the TV is on', () => {
    // Before S33 `openSlots` gave every open slot the CONSTANT world facing
    // {0,-1}, so the armchair's cone test asked "is the TV north of here?".
    // Measured over the corpus: 0/258 skips with the TV north of the room
    // centre, 125/162 with it south. The whole point is that BOTH answers below
    // must now be the same.
    for (const tvY of [0.2, 5.8]) {
      const scene = addRect(room(6, 6), {
        center: { x: 3, y: tvY },
        w: 1.5,
        h: 0.35,
        role: 'tv',
        height: 1.5,
      });
      const res = arrangeFurniture(scene, [{ presetId: 'armchair', count: 1 }]);
      const chair = placedOf(res.objects).find(
        (o): o is RectObj => o.kind === 'rect' && o.label === 'Armchair',
      );
      expect(chair, `TV at y=${tvY}`).toBeDefined();
      expect(res.skipped).toEqual([]);

      // …and it actually points at the screen, not merely exists.
      const front = { x: -Math.sin(chair!.rotation), y: Math.cos(chair!.rotation) };
      const toTv = { x: 3 - chair!.center.x, y: tvY - chair!.center.y };
      const len = Math.hypot(toTv.x, toTv.y);
      const dot = (front.x * toTv.x + front.y * toTv.y) / len;
      expect(Math.abs(dot), `TV at y=${tvY}`).toBeGreaterThan(0.9);
    }
  });

  it('keeps SEAT_CLEARANCE of open floor for the stereo pair', () => {
    // `generate/pair.ts` searches radii out to 1.8 m around the seat, and
    // `pointFree` vetoes a speaker within max(w,h)/2 + 0.3 of a piece's centre.
    // An open piece parked on the seat is a design with no speakers.
    const scene = addRect(room(9, 9), {
      center: { x: 4.5, y: 0.2 },
      w: 1.5,
      h: 0.35,
      role: 'tv',
      height: 1.5,
    });
    const res = arrangeFurniture(scene, [{ presetId: 'armchair', count: 1 }, { presetId: 'plant', count: 1 }]);
    const seat = scene.listener.pos;
    for (const p of placedOf(res.objects)) {
      if (p.label !== 'Armchair' && p.label !== 'Plant') continue;
      expect(Math.hypot(p.center.x - seat.x, p.center.y - seat.y)).toBeGreaterThanOrEqual(2.0);
    }
  });

  it('does NOT apply the seat clearance to WALL pieces, which would empty a small room', () => {
    // A 4 x 3.5 office puts every wall slot ~1.3 m from a centred seat. Applying
    // the same 2.0 m radius to wall pieces places nothing at all.
    const res = arrangeFurniture(room(4, 3.5), [{ presetId: 'desk', count: 1 }]);
    expect(placedOf(res.objects).some((o) => o.label === 'Desk')).toBe(true);
  });
});

describe('S33: both faces of a wall are offered', () => {
  it('uses a wall face that points AWAY from the building centroid', () => {
    // Before S33 `inward` was flipped to point at the BUILDING centroid and the
    // other face was never offered, so only 65.7 % of floor-facing wall length
    // was reachable at all.
    //
    // THE FIXTURE MATTERS, and my first attempt at it was worthless. A simple
    // two-room plan does NOT force the issue: the far room has exterior walls of
    // its own, so "a piece landed on each side of the partition" passes with one
    // face — measured, nothing lands against that partition at all, because the
    // base score prefers the long outside walls.
    //
    // An L-shape does force it. With vertices (0,0) (8,0) (8,3) (3,3) (3,8)
    // (0,8), the mean of the wall midpoints is (3.67, 3.67) — which sits in the
    // NOTCH, outside the floor. So for the wall (8,3)-(3,3) the centroid-facing
    // side points into the notch and is not walkable, and the only usable face
    // is the far one. `envelopeOutline`'s `l-notch` variant builds exactly this.
    const pts = [
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 3 },
      { x: 3, y: 3 }, { x: 3, y: 8 }, { x: 0, y: 8 },
    ];
    const s = blankScene();
    const scene: Scene = {
      ...s,
      listener: { ...s.listener, pos: { x: 1.5, y: 1.5 } },
      objects: pts.map((a, i): WallObj => ({
        id: createId('wall'), kind: 'wall', a, b: pts[(i + 1) % pts.length],
        absorption: 0.12, label: 'Wall', height: ROOM_HEIGHT,
      })),
    };
    const res = arrangeFurniture(scene, [{ presetId: 'bookshelf', count: 6 }]);
    const shelves = placedOf(res.objects).filter((o) => o.label === 'Bookshelf');
    // A bookshelf is 0.3 deep, so against that wall from below its centre lands
    // at 3 - 0.15 - 0.06 = 2.79.
    const onTheFarFace = shelves.filter(
      (o) => o.center.y > 2.5 && o.center.y < 3 && o.center.x > 3.3 && o.center.x < 7.7,
    );
    expect(onTheFarFace.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to ONE face when there is no walkable region to consult', () => {
    // `ctx.walkable` is null whenever regionOf comes back at <= 2 m², and `fits`
    // then skips its containment check as well — so offering both sides puts
    // furniture OUTSIDE the building. A 1.2 x 1.2 room floods to 1.44 m².
    // Measured: pre-S33 0 of 2 pieces outside, the first cut of the two-faced
    // change 1 of 2. Found by self-review, not by any of the 8 negative
    // controls, because none of them made the region degenerate.
    const s = blankScene();
    const pts = [
      { x: 0, y: 0 }, { x: 1.2, y: 0 }, { x: 1.2, y: 1.2 }, { x: 0, y: 1.2 },
    ];
    const scene: Scene = {
      ...s,
      listener: { ...s.listener, pos: { x: 0.6, y: 0.6 } },
      objects: pts.map((a, i): WallObj => ({
        id: createId('wall'), kind: 'wall', a, b: pts[(i + 1) % 4],
        absorption: 0.12, label: 'Wall', height: ROOM_HEIGHT,
      })),
    };
    const res = arrangeFurniture(scene, [{ presetId: 'bookshelf', count: 4 }, { presetId: 'plant', count: 2 }]);
    for (const p of placedOf(res.objects)) {
      expect(p.center.x, p.label).toBeGreaterThanOrEqual(0);
      expect(p.center.x, p.label).toBeLessThanOrEqual(1.2);
      expect(p.center.y, p.label).toBeGreaterThanOrEqual(0);
      expect(p.center.y, p.label).toBeLessThanOrEqual(1.2);
    }
  });

  it('still refuses the OUTSIDE face of the exterior shell', () => {
    const res = arrangeFurniture(room(6, 5), [{ presetId: 'bookshelf', count: 6 }]);
    for (const p of placedOf(res.objects)) {
      expect(p.center.x).toBeGreaterThan(0);
      expect(p.center.x).toBeLessThan(6);
      expect(p.center.y).toBeGreaterThan(0);
      expect(p.center.y).toBeLessThan(5);
    }
  });
});

describe('S33: optional fill vs a promised piece', () => {
  it('reports a REQUIRED piece that had nowhere to go', () => {
    // A room already full of furniture: a second bed cannot fit.
    let scene = room(3.2, 3.2);
    scene = addRect(scene, { center: { x: 1.6, y: 1.6 }, w: 3, h: 3, role: 'furniture', height: 1 });
    const res = arrangeFurniture(scene, [{ presetId: 'bed', count: 1 }]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatch(/bed/i);
    expect(res.notes.join(' ')).toMatch(/skipped/i);
  });

  it('stays SILENT about an optional piece that had nowhere to go', () => {
    let scene = room(3.2, 3.2);
    scene = addRect(scene, { center: { x: 1.6, y: 1.6 }, w: 3, h: 3, role: 'furniture', height: 1 });
    const res = arrangeFurniture(scene, [{ presetId: 'bed', count: 1, optional: true }]);
    expect(res.skipped).toEqual([]);
    expect(res.notes.join(' ')).not.toMatch(/skipped/i);
    // …and it genuinely did not place it — the silence is about REPORTING, not
    // about a piece having quietly appeared.
    expect(placedOf(res.objects).some((o) => o.label === 'Bed')).toBe(false);
  });

  it('`skipped` is STRUCTURED, not recovered by grepping the notes', () => {
    const res = arrangeFurniture(room(5, 4), [{ presetId: 'bed', count: 1 }]);
    expect(Array.isArray(res.skipped)).toBe(true);
    expect(res.skipped).toEqual([]);
    expect(placedOf(res.objects).some((o) => o.label === 'Bed')).toBe(true);
  });
});

describe('S33: suggestInventory marks its DECORATION optional', () => {
  it('calls a bed and a sofa required, and a plant decoration', () => {
    const { items } = suggestInventory(room(9, 8));
    const by = Object.fromEntries(items.map((i) => [i.presetId, i]));
    expect(by.bed?.optional).toBe(false);
    expect(by.sofa?.optional).toBe(false);
    expect(by.plant?.optional).toBe(true);
  });

  it('stops the dialog reporting its own decoration budget as a failure', () => {
    // S33's SEAT_CLEARANCE costs open-floor pieces their spots near the seat.
    // On the bundled demo that took two of three plants, and the dialog
    // announced "No spot survives the rules for a plant" three times. A sofa
    // with nowhere to go is worth saying; a third plant is not.
    const scene = apartmentScene();
    const res = arrangeFurniture(scene, suggestInventory(scene).items);
    for (const note of res.skipped) expect(note).not.toMatch(/plant/i);
  });
});

describe('S33: a dining table belongs in the room it was ordered for', () => {
  it('prefers a living-room zone over a bedroom zone', () => {
    // `inventoryFor` orders a dining table when a LIVING cell is big enough, and
    // ZONE_AFFINITY then charged it -0.9 for standing in that same living room
    // while a bedroom scored the same. Measured: 53.9 % of multi-room dining
    // placements were mismatched, 83 pushed into bedrooms.
    const s = blankScene();
    const scene: Scene = {
      ...s,
      listener: { ...s.listener, pos: { x: 2.5, y: 4 } },
      objects: rectRoomWalls(10, 8),
      rooms: [
        { id: 'a', name: 'Living room', at: { x: 2.5, y: 4 }, w: 5, h: 8 },
        { id: 'b', name: 'Bedroom', at: { x: 7.5, y: 4 }, w: 5, h: 8 },
      ],
    };
    const res = arrangeFurniture(scene, [{ presetId: 'dining', count: 1 }]);
    const table = placedOf(res.objects).find((o) => o.label === 'Dining table');
    expect(table).toBeDefined();
    expect(table!.center.x).toBeLessThan(5);
  });
});
