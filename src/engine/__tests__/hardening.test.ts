import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_OBJECTS,
  MAX_IMPORT_SPAN,
  addRoomShell,
  apartmentScene,
  importRejection,
  loadStore,
  rectRoomScene,
  sanitizeLayoutIsolated,
  sanitizeScene,
  sceneBounds,
} from '../scene';

function mockStorage(data: Record<string, string>): Pick<Storage, 'getItem'> {
  return { getItem: (k: string) => data[k] ?? null };
}

/**
 * The layout JSON boundary is the app's only untrusted input besides a photo.
 * `sanitizeScene` is allow-list reconstruction, so it has no prototype-pollution
 * gadget — but it did have three ways for a hostile record to hurt the user:
 * it could THROW (and `loadStore` swallows a throw by replacing the WHOLE store
 * with defaults, eating every other layout), and it could manufacture a
 * non-finite bound that the engine's grid loops then walk forever.
 */
describe('sanitizeScene — hostile array elements must not throw', () => {
  it('survives a null element in speakers[]', () => {
    expect(() =>
      sanitizeScene({ objects: [], speakers: [null], listener: { pos: { x: 1, y: 1 }, z: 1.2 } }),
    ).not.toThrow();
  });

  it('survives a null element in rooms[]', () => {
    expect(() =>
      sanitizeScene({ objects: [], speakers: [], rooms: [null], listener: { pos: { x: 1, y: 1 }, z: 1.2 } }),
    ).not.toThrow();
  });

  it('drops the malformed entries but keeps the valid siblings', () => {
    const scene = sanitizeScene({
      objects: [],
      speakers: [null, { pos: { x: 2, y: 2 }, z: 1 }, undefined],
      rooms: [null, { name: 'Kitchen', at: { x: 1, y: 1 } }],
      listener: { pos: { x: 1, y: 1 }, z: 1.2 },
    });
    expect(scene).not.toBeNull();
    expect(scene!.speakers).toHaveLength(1);
    expect(scene!.rooms).toHaveLength(1);
    expect(scene!.rooms![0].name).toBe('Kitchen');
  });
});

describe('loadStore — one hostile record must not eat the whole store', () => {
  it('keeps the user’s other layouts when a sibling layout is hostile', () => {
    const good = {
      id: 'layout-good',
      name: 'My real apartment',
      scene: { objects: [], speakers: [], listener: { pos: { x: 1, y: 1 }, z: 1.2 } },
      settings: { rayCount: 360, maxBounces: 5 },
      updatedAt: 1,
    };
    const hostile = {
      id: 'layout-hostile',
      name: 'boom',
      scene: { objects: [], speakers: [null], listener: { pos: { x: 1, y: 1 }, z: 1.2 } },
      settings: { rayCount: 360, maxBounces: 5 },
      updatedAt: 2,
    };
    const store = loadStore(
      mockStorage({
        'phantom-lock:v2': JSON.stringify({ layouts: [good, hostile], activeId: 'layout-good' }),
      }),
    );
    // Before the fix this returned defaultStore() — a single bundled demo, with
    // the user's real layout silently gone.
    expect(store.layouts.some((l) => l.id === 'layout-good')).toBe(true);
    expect(store.layouts.find((l) => l.id === 'layout-good')!.name).toBe('My real apartment');
  });

  it('contains a THROW to the single record that caused it', () => {
    // The null-element guards mean nothing reachable through JSON.parse throws
    // any more, so the per-record isolation is defence-in-depth. Tested directly
    // rather than through `loadStore`, because a throwing getter is exactly what
    // JSON.parse cannot produce — and without this the whole block has ZERO
    // coverage (reverting it leaves every other assertion in this file green).
    const exploding = { id: 'layout-boom', name: 'boom', settings: {}, updatedAt: 2 };
    Object.defineProperty(exploding, 'scene', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(() => sanitizeLayoutIsolated(exploding)).not.toThrow();
    expect(sanitizeLayoutIsolated(exploding)).toBeNull();
    // and a well-formed record still comes back intact through the same wrapper
    expect(
      sanitizeLayoutIsolated({
        id: 'layout-good',
        name: 'My real apartment',
        scene: { objects: [], speakers: [], listener: { pos: { x: 1, y: 1 }, z: 1.2 } },
        settings: { rayCount: 360, maxBounces: 5 },
        updatedAt: 1,
      })?.name,
    ).toBe('My real apartment');
  });
});

describe('sceneBounds — the finite guard must cover all four components', () => {
  it('returns finite bounds for a circle whose extent overflows to Infinity', () => {
    // Both values are finite and pass `isNum`, so the sanitizer accepts them;
    // `center.x + r` is what overflows. The old guard only tested `min.x`.
    const scene = sanitizeScene({
      objects: [{ kind: 'circle', center: { x: 1e308, y: 1e308 }, r: 1e308 }],
      speakers: [],
      listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    });
    expect(scene).not.toBeNull();
    const b = sceneBounds(scene!);
    expect(Number.isFinite(b.min.x)).toBe(true);
    expect(Number.isFinite(b.min.y)).toBe(true);
    expect(Number.isFinite(b.max.x)).toBe(true);
    expect(Number.isFinite(b.max.y)).toBe(true);
  });

  it('keeps the span finite for extreme but individually-finite wall coordinates', () => {
    const scene = sanitizeScene({
      objects: [{ kind: 'wall', a: { x: -1e17, y: 0 }, b: { x: 1e17, y: 1 } }],
      speakers: [],
      listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    });
    expect(scene).not.toBeNull();
    const b = sceneBounds(scene!);
    expect(Number.isFinite(b.max.x - b.min.x)).toBe(true);
    // A span this large makes the fixed-step grid loops non-terminating in
    // IEEE-754 (`x += 0.35` stops advancing), so it must be bounded, not merely finite.
    expect(b.max.x - b.min.x).toBeLessThan(1e6);
  });

  it('keeps every grid step advancing at the clamped extremes', () => {
    // The real termination property: `x += step` must move. A 354-byte payload
    // (one circle, r = 1e308) previously ran 3 000 000 grid-cell bodies without
    // the loop variable changing, then OOM-crashed at 4 094 MB.
    const scene = sanitizeScene({
      objects: [{ kind: 'circle', center: { x: 0, y: 0 }, r: 1e308 }],
      speakers: [],
      listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    });
    const b = sceneBounds(scene!);
    for (const step of [0.25, 0.35, 0.45, 0.7]) {
      expect(b.min.x + step).toBeGreaterThan(b.min.x);
      expect(b.min.y + step).toBeGreaterThan(b.min.y);
    }
  });

  it('does not alter a scene that is merely large but legitimate', () => {
    const scene = sanitizeScene({
      objects: [{ kind: 'wall', a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }],
      speakers: [],
      listener: { pos: { x: 1, y: 1 }, z: 1.2 },
    });
    const b = sceneBounds(scene!);
    expect(b.max.x - b.min.x).toBeCloseTo(300, 5);
  });
});

describe('sanitizeScene — output must not alias the caller’s parse tree', () => {
  it('rebuilds every accepted position as a fresh literal', () => {
    const wallA = { x: 0, y: 0 };
    const spkPos = { x: 2, y: 2 };
    const seatPos = { x: 3, y: 3 };
    const scene = sanitizeScene({
      objects: [{ kind: 'wall', a: wallA, b: { x: 1, y: 1 } }],
      speakers: [{ pos: spkPos, z: 1 }],
      listeners: [{ id: 'seat-1', name: 'Couch', pos: seatPos, z: 1.2 }],
      activeListenerId: 'seat-1',
    })!;
    const wall = scene.objects[0] as { a: unknown };
    expect(wall.a).not.toBe(wallA);
    expect(scene.speakers[0].pos).not.toBe(spkPos);
    expect(scene.listeners![0].pos).not.toBe(seatPos);

    // Mutating the raw input afterwards must not reach the sanitized scene.
    wallA.x = 999;
    spkPos.x = 999;
    expect((scene.objects[0] as { a: { x: number } }).a.x).toBe(0);
    expect(scene.speakers[0].pos.x).toBe(2);
  });

  it('strips foreign keys, including a JSON __proto__ own-property', () => {
    const raw = JSON.parse('{"x":1,"y":2,"junk":"ride-along","__proto__":{"pwned":true}}') as {
      x: number;
      y: number;
    };
    const scene = sanitizeScene({
      objects: [{ kind: 'circle', center: raw, r: 0.5 }],
      speakers: [],
      listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    })!;
    const center = (scene.objects[0] as { center: object }).center;
    expect(Object.getOwnPropertyNames(center).sort()).toEqual(['x', 'y']);
    expect((Object.prototype as unknown as { pwned?: unknown }).pwned).toBeUndefined();
  });
});

describe('sanitizeScene — a colliding id must not move the active seat', () => {
  it('keeps YOU on the seat the user chose when an object steals its id', () => {
    const scene = sanitizeScene({
      // The object claims the same id as the ACTIVE seat. Objects used to be
      // processed first, so the seat was re-issued a fresh id, `activeListenerId`
      // no longer matched, and YOU silently fell back to seats[0].
      objects: [{ kind: 'wall', id: 'seat-bed', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }],
      speakers: [],
      listeners: [
        { id: 'seat-couch', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 },
        { id: 'seat-bed', name: 'Bed', pos: { x: 9, y: 9 }, z: 1.2 },
      ],
      activeListenerId: 'seat-bed',
    })!;
    const active = scene.listeners!.find((l) => l.id === scene.activeListenerId)!;
    expect(active.name).toBe('Bed');
    expect(active.pos).toEqual({ x: 9, y: 9 });
    // The listener mirror must equal the active seat (the S2 desync invariant).
    expect(scene.listener.pos).toEqual({ x: 9, y: 9 });
  });

  it('keeps a stereo pair intact when an object steals a speaker id', () => {
    const scene = sanitizeScene({
      objects: [{ kind: 'wall', id: 'spk-L', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }],
      speakers: [
        { id: 'spk-L', pos: { x: 1, y: 1 }, z: 1 },
        { id: 'spk-R', pos: { x: 2, y: 1 }, z: 1 },
      ],
      pairs: [['spk-L', 'spk-R']],
      listener: { pos: { x: 1.5, y: 2 }, z: 1.2 },
    })!;
    expect(scene.speakers).toHaveLength(2);
    expect(scene.pairs).toHaveLength(1);
  });
});

describe('importRejection — refuse hostile files, never mangle the user’s own', () => {
  const wrap = (objects: unknown[], extra: Record<string, unknown> = {}) =>
    sanitizeScene({
      objects,
      speakers: [],
      listener: { pos: { x: 1, y: 1 }, z: 1.2 },
      ...extra,
    })!;

  it('rejects the 354-byte r=1e308 brick', () => {
    expect(importRejection(wrap([{ kind: 'circle', center: { x: 0, y: 0 }, r: 1e308 }]))).toMatch(
      /larger than any real room/,
    );
  });

  it('rejects a 1e17 wall coordinate', () => {
    expect(
      importRejection(wrap([{ kind: 'wall', a: { x: -1e17, y: 0 }, b: { x: 1e17, y: 1 } }])),
    ).toMatch(/far outside any real room/);
  });

  it('rejects a scene whose span exceeds the limit', () => {
    const far = MAX_IMPORT_SPAN + 50;
    expect(importRejection(wrap([{ kind: 'wall', a: { x: 0, y: 0 }, b: { x: far, y: 0 } }]))).toMatch(
      /spans/,
    );
  });

  it('rejects an absurd object count', () => {
    const many = Array.from({ length: MAX_IMPORT_OBJECTS + 1 }, (_, i) => ({
      kind: 'circle',
      center: { x: (i % 50) * 0.1, y: Math.floor(i / 50) * 0.1 },
      r: 0.1,
    }));
    expect(importRejection(wrap(many))).toMatch(/objects/);
  });

  it('rejects an id long enough to bloat IndexedDB forever', () => {
    expect(
      importRejection(
        wrap([{ kind: 'wall', id: 'x'.repeat(5000), a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }]),
      ),
    ).toMatch(/identifier longer/);
  });

  it('ACCEPTS the layouts the app itself produces', () => {
    // The bundled demo, a max-size room from the UI dialog, and a legitimately
    // large multi-room layout built through "Add a room…". A limit that fires on
    // any of these would be a data-loss bug, not a security fix.
    // (The demo is asserted explicitly because docs/security.md names it, and it
    // is the item most likely to drift as the preset changes.)
    expect(importRejection(apartmentScene())).toBeNull();
    expect(importRejection(sanitizeScene(JSON.parse(JSON.stringify(rectRoomScene(25, 25))))!)).toBeNull();
    let grown = rectRoomScene(6, 6);
    for (let i = 0; i < 20; i++) grown = addRoomShell(grown, `Room ${i}`, 6, 6);
    expect(sceneBounds(grown).max.x).toBeGreaterThan(100); // genuinely large
    expect(importRejection(grown)).toBeNull();
  });
});
