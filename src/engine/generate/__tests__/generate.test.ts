import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  MAX_ENVELOPE_M,
  generateDesign,
  inventoryFor,
  uniqueName,
  formatSeed,
  parseSeed,
  type ArchetypeId,
} from '../index';
import { MIN_ROOM_SIDE } from '../archetypes';
import { chance, lattice, mulberry32, pick, range } from '../rng';
import { envelopeOutline, tileEnvelope } from '../tile';
import { buildShell, DOOR_WIDTH } from '../shell';
import { designName } from '../names';
import {
  MAX_IMPORT_SPAN,
  activeListener,
  blankScene,
  importRejection,
  rectRoomWalls,
  sanitizeScene,
  sceneBounds,
  sceneListeners,
} from '../../scene';
import { arrangeFurniture } from '../../arrange';
import { traceScene } from '../../raytrace';
import { rectCorners } from '../../geometry';
import { makeOpening } from '../../../components/canvas/interaction';
import { computeAudio } from '../../stereo';
import { regionOf } from '../../rooms';
import type { RectObj, Scene, WallObj } from '../../types';

/** A spread of seeds that is the same on every machine and every run. */
const SEEDS = Array.from({ length: 24 }, (_, i) => (i * 2654435761) >>> 0);

/**
 * Every (archetype x seed) design, generated ONCE at module scope.
 *
 * Not a micro-optimisation. MEASURED: the 192-design grid costs ~1.78 s, and
 * nine tests below each walk some prefix of it — while the whole
 * `traceScene` + `computeAudio` pass over the same corpus costs 150 ms, so the
 * generator is ~92 % of the work. Under `npm run test:coverage` the v8
 * instrumentation multiplies that several-fold and the per-test 5 s timeout
 * fires with the code entirely correct.
 *
 * Module scope is evaluated during COLLECTION, which is not subject to
 * `testTimeout`, so the corpus is built once and shared. Raising `testTimeout`
 * would hide the cost rather than remove it, and `detect.test.ts` has taken this
 * same route four times.
 *
 * Sharing is safe because `generateDesign` is a pure function of its options and
 * nothing here mutates a result. The three tests that need a FRESH call — the
 * two determinism comparisons and the id-freshness check — deliberately still
 * call `generateDesign` directly, because ids are the one thing NOT determined
 * by the seed.
 */
const CORPUS = new Map<string, ReturnType<typeof generateDesign>>();
for (const id of ARCHETYPE_IDS) {
  for (const seed of SEEDS) CORPUS.set(`${id}:${seed}`, generateDesign({ archetype: id, seed }));
}
/** A corpus design. Throws rather than silently regenerating an unseeded pair. */
function design(id: ArchetypeId, seed: number): ReturnType<typeof generateDesign> {
  const r = CORPUS.get(`${id}:${seed}`);
  if (!r) throw new Error(`no corpus design for ${id}:${seed} — add the seed to SEEDS`);
  return r;
}

function walls(scene: Scene): WallObj[] {
  return scene.objects.filter((o): o is WallObj => o.kind === 'wall');
}
function rects(scene: Scene, role: string): RectObj[] {
  return scene.objects.filter((o): o is RectObj => o.kind === 'rect' && o.role === role);
}

/** The whole geometry, so "same seed, same design" is checkable in one value. */
function geometrySignature(r: ReturnType<typeof generateDesign>): string {
  return JSON.stringify([
    r.name,
    r.scene.objects.map((o) =>
      o.kind === 'wall'
        ? ['w', o.a.x, o.a.y, o.b.x, o.b.y, o.label]
        : o.kind === 'rect'
          ? ['r', o.center.x, o.center.y, o.w, o.h, o.rotation, o.role ?? '']
          : ['c', o.center.x, o.center.y, o.r],
    ),
    r.scene.speakers.map((s) => [s.pos.x, s.pos.y, s.z]),
    (r.scene.rooms ?? []).map((z) => [z.name, z.at.x, z.at.y, z.w, z.h]),
    sceneListeners(r.scene).map((l) => [l.name, l.pos.x, l.pos.y]),
  ]);
}

describe('rng', () => {
  it('is a total function of the seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect(Array.from({ length: 200 }, a)).toEqual(Array.from({ length: 200 }, b));
  });

  it('is uniform enough not to bias the generator', () => {
    const r = mulberry32(9);
    const xs = Array.from({ length: 4000 }, r);
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it('lattice lands on exact multiples of the step, inclusive of both ends', () => {
    const r = mulberry32(4);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(lattice(r, 4, 6, 0.5));
    expect([...seen].sort((a, b) => a - b)).toEqual([4, 4.5, 5, 5.5, 6]);
  });

  it('pick and chance stay in range, and pick refuses an empty list', () => {
    const r = mulberry32(77);
    for (let i = 0; i < 500; i++) {
      expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']));
      expect(typeof chance(r, 0.5)).toBe('boolean');
      const v = range(r, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
    }
    expect(() => pick(r, [])).toThrow();
  });

  it('formats and parses a seed round-trip', () => {
    for (const s of [0, 1, 0xdeadbeef, 0xffffffff]) {
      expect(parseSeed(formatSeed(s))).toBe(s >>> 0);
      expect(formatSeed(s)).toHaveLength(8);
    }
    expect(parseSeed('nonsense')).toBeNull();
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('0xFF')).toBe(255);
  });
});

describe('tileEnvelope', () => {
  const rooms = ARCHETYPES['two-bed'].rooms;

  it('tiles WITHOUT overlaps or gaps — guillotine makes that structural', () => {
    for (const seed of SEEDS) {
      const cells = tileEnvelope(mulberry32(seed), 12, 8, rooms);
      const area = cells.reduce((a, c) => a + c.w * c.h, 0);
      expect(area).toBeCloseTo(96, 6);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i];
          const b = cells[j];
          const overlap =
            Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
            Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          expect(overlap).toBeCloseTo(0, 9);
        }
      }
    }
  });

  it('never produces a room narrower than a corridor', () => {
    for (const seed of SEEDS) {
      for (const c of tileEnvelope(mulberry32(seed), 9, 6, rooms)) {
        expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(MIN_ROOM_SIDE - 1e-9);
      }
    }
  });

  it('returns FEWER rooms rather than a 1-metre bedroom when the envelope is small', () => {
    const cells = tileEnvelope(mulberry32(1), 5, 4, rooms);
    expect(cells.length).toBeLessThan(rooms.length);
    for (const c of cells) expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(MIN_ROOM_SIDE - 1e-9);
  });

  it('S33: keeps rooms inside the aspect budget', () => {
    // Blind cuts left 10.4 % of rooms worse than 2:1 and put one in 20.4 % of
    // designs — always a named secondary room, because the weight sort hands the
    // last cell to the lowest-weight spec.
    let worse = 0;
    let rooms = 0;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const arch = ARCHETYPES[id];
        const rnd = mulberry32(seed);
        designName(rnd, arch);
        const w = lattice(rnd, arch.width[0], arch.width[1], 0.5);
        const h = lattice(rnd, arch.depth[0], arch.depth[1], 0.5);
        for (const c of tileEnvelope(rnd, w, h, arch.rooms)) {
          rooms++;
          if (Math.max(c.w, c.h) / Math.min(c.w, c.h) > 2.4) worse++;
        }
      }
    }
    // Guard that the sweep is non-vacuous. 24 seeds x 8 archetypes over 1-3
    // rooms each gives 384; asserting a number I had not measured is how a
    // "passing" test ends up sweeping nothing.
    expect(rooms).toBeGreaterThan(300);
    expect(worse / rooms).toBeLessThan(0.01);
  });

  it('S33: does NOT collapse the design space to one cut per envelope', () => {
    // Always taking the squarest cut fixes the aspect and destroys the variety
    // that is most of what "generate a design" sells — measured, distinct room
    // sets over 60 seeds fell 58 -> 34 on `loft` and 60 -> 36 on `railroad`.
    // Drawing at random among the ACCEPTABLE cuts keeps both, and this is the
    // assertion that stops a later "simplification" back to argmax.
    for (const id of ['loft', 'railroad', 'two-bed'] as const) {
      const arch = ARCHETYPES[id];
      const shapes = new Set<string>();
      for (const seed of SEEDS) {
        const rnd = mulberry32(seed);
        designName(rnd, arch);
        const w = lattice(rnd, arch.width[0], arch.width[1], 0.5);
        const h = lattice(rnd, arch.depth[0], arch.depth[1], 0.5);
        shapes.add(
          tileEnvelope(rnd, w, h, arch.rooms)
            .map((c) => `${c.name}:${c.w.toFixed(2)}x${c.h.toFixed(2)}`)
            .sort()
            .join('|'),
        );
      }
      expect(shapes.size, id).toBeGreaterThan(SEEDS.length * 0.7);
    }
  });

  it('gives the heaviest room the largest cell', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const cells = tileEnvelope(mulberry32(seed), 12, 8, rooms);
      const biggest = cells.reduce((b, c) => (c.w * c.h > b.w * b.h ? c : b), cells[0]);
      expect(biggest.name).toBe('Living room');
    }
  });

  it('envelopeOutline returns a closed non-degenerate polygon for every variant', () => {
    for (const variant of ['rect', 'l-notch', 'alcove'] as const) {
      for (const seed of SEEDS.slice(0, 6)) {
        const o = envelopeOutline(mulberry32(seed), 7, 5.5, variant);
        expect(o.length).toBeGreaterThanOrEqual(4);
        for (const p of o) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
    }
  });
});

describe('buildShell', () => {
  const arch = ARCHETYPES['one-bed'];

  it('SHARES an interior wall instead of drawing it twice', () => {
    // The bug `addRoomShell` has by construction: chaining rooms puts two
    // coincident walls on every boundary.
    const cells = [
      { name: 'Living room', x: 0, y: 0, w: 5, h: 6 },
      { name: 'Bedroom', x: 5, y: 0, w: 4, h: 6 },
    ];
    const shell = buildShell(mulberry32(3), cells, arch);
    const onBoundary = walls({ objects: shell.objects } as Scene).filter(
      (w) => Math.abs(w.a.x - 5) < 1e-9 && Math.abs(w.b.x - 5) < 1e-9,
    );
    const totalLength = onBoundary.reduce((a, w) => a + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0);
    // One boundary of length 6, minus the door gap — never 12.
    expect(totalLength).toBeGreaterThan(4);
    expect(totalLength).toBeLessThan(6.01);
  });

  it('VARIANT D: an interior partition is two stubs with a real gap plus a door in it', () => {
    const cells = [
      { name: 'Living room', x: 0, y: 0, w: 5, h: 6 },
      { name: 'Bedroom', x: 5, y: 0, w: 4, h: 6 },
    ];
    const shell = buildShell(mulberry32(3), cells, arch);
    const scene = { objects: shell.objects } as Scene;
    // VERTICAL walls at x = 5 — the horizontal exterior edges also START at
    // x = 5 and would otherwise be counted.
    const boundary = walls(scene).filter(
      (w) => Math.abs(w.a.x - 5) < 1e-9 && Math.abs(w.b.x - 5) < 1e-9,
    );
    expect(boundary).toHaveLength(2); // two stubs, not one solid wall
    const gap = 6 - boundary.reduce((a, w) => a + Math.abs(w.b.y - w.a.y), 0);
    expect(gap).toBeCloseTo(DOOR_WIDTH, 6);
    const doors = rects(scene, 'door').filter((d) => Math.abs(d.center.x - 5) < 1e-9);
    expect(doors).toHaveLength(1);
    expect(doors[0].w).toBeCloseTo(DOOR_WIDTH, 6);
  });

  it('gives every door the full S17 field set, because sanitizeObject clamps but never defaults', () => {
    const shell = buildShell(mulberry32(5), [
      { name: 'Living room', x: 0, y: 0, w: 5, h: 6 },
      { name: 'Bedroom', x: 5, y: 0, w: 4, h: 6 },
    ], arch);
    for (const d of rects({ objects: shell.objects } as Scene, 'door')) {
      expect(d.doorOpen).toBe(true);
      expect(d.swingDeg).toBe(90);
      expect(d.hingeEnd).toBe('start');
      expect(d.swingSide).toBe('in');
    }
  });

  it('emits SIZED room labels — a bare anchor point scores zero in arrange.ts', () => {
    const shell = buildShell(mulberry32(7), [{ name: 'Living room', x: 0, y: 0, w: 5, h: 6 }], arch);
    for (const z of shell.rooms) {
      expect(z.w).toBeGreaterThan(0.2);
      expect(z.h).toBeGreaterThan(0.2);
    }
  });
});

describe('the archetype table', () => {
  it('keeps every envelope inside the span discipline that makes arrange.ts safe', () => {
    // Not decoration: `openSlots` is O(span²), measured 51.5 ms at 25x25 and
    // 6.85 s at the importer's 400 m ceiling. Asserted against EVERY entry
    // rather than a sample — the S18 lesson about enumerated protected sets.
    for (const id of ARCHETYPE_IDS) {
      const a = ARCHETYPES[id];
      expect(a.width[0]).toBeLessThanOrEqual(a.width[1]);
      expect(a.depth[0]).toBeLessThanOrEqual(a.depth[1]);
      expect(a.width[1]).toBeLessThanOrEqual(MAX_ENVELOPE_M);
      expect(a.depth[1]).toBeLessThanOrEqual(MAX_ENVELOPE_M);
      expect(a.width[0]).toBeGreaterThanOrEqual(MIN_ROOM_SIDE);
      expect(a.depth[0]).toBeGreaterThanOrEqual(MIN_ROOM_SIDE);
    }
  });

  it('gives every archetype exactly one primary seat', () => {
    for (const id of ARCHETYPE_IDS) {
      expect(ARCHETYPES[id].rooms.filter((r) => r.seat === 'primary')).toHaveLength(1);
    }
  });

  it('names every room so it MATCHES a ZONE_AFFINITY regex', () => {
    // Rename "Living room" to "Salon" and five of `scoreSlot`'s rules go quiet
    // with no error anywhere. This is the guard against that.
    const affinity = [/bed|sleep|master|guest/i, /kitchen/i, /living|lounge|tv|family/i, /office|study|work|desk/i];
    for (const id of ARCHETYPE_IDS) {
      for (const room of ARCHETYPES[id].rooms) {
        expect(affinity.some((re) => re.test(room.name))).toBe(true);
      }
    }
  });

  it('offers shape variation wherever there is only one room to vary', () => {
    // With a single room there are no cuts, so without this the archetype is
    // literally "a rectangle at N sizes".
    for (const id of ARCHETYPE_IDS) {
      const a = ARCHETYPES[id];
      if (a.rooms.length === 1) expect(a.shape.length).toBeGreaterThan(1);
    }
  });
});

describe('generateDesign', () => {
  it('is DETERMINISTIC in geometry for a given seed', () => {
    for (const id of ARCHETYPE_IDS) {
      const a = generateDesign({ archetype: id, seed: 42 });
      const b = generateDesign({ archetype: id, seed: 42 });
      expect(geometrySignature(a)).toBe(geometrySignature(b));
    }
  });

  it('gives DIFFERENT designs for different seeds — so determinism is not vacuous', () => {
    const sigs = new Set(SEEDS.map((s) => geometrySignature(design('two-bed', s))));
    expect(sigs.size).toBe(SEEDS.length);
  });

  it('mints fresh ids every call, because Layout ids are deduped store-wide', () => {
    const a = generateDesign({ archetype: 'studio', seed: 1 });
    const b = generateDesign({ archetype: 'studio', seed: 1 });
    expect(a.scene.objects[0].id).not.toBe(b.scene.objects[0].id);
  });

  it('keeps the LISTENER MIRROR in sync on every archetype', () => {
    // The S2 trap: a desync silently shows a verdict for one seat while the
    // echogram traces another.
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS.slice(0, 6)) {
        const { scene } = design(id, seed);
        const seat = activeListener(scene);
        expect(scene.listener.pos.x).toBeCloseTo(seat.pos.x, 12);
        expect(scene.listener.pos.y).toBeCloseTo(seat.pos.y, 12);
        expect(scene.listener.z).toBeCloseTo(seat.z, 12);
      }
    }
  });

  it('gives every entity a unique id', () => {
    for (const id of ARCHETYPE_IDS) {
      const { scene } = generateDesign({ archetype: id, seed: 5 });
      const ids = [
        ...scene.objects.map((o) => o.id),
        ...scene.speakers.map((s) => s.id),
        ...sceneListeners(scene).map((l) => l.id),
        ...(scene.rooms ?? []).map((r) => r.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('SURVIVES a save/load round-trip field for field', () => {
    // `sanitizeObject` is allow-list RECONSTRUCTION: anything it does not copy
    // is dropped on the first reload, and a door is the hardest case.
    for (const id of ARCHETYPE_IDS) {
      const { scene } = generateDesign({ archetype: id, seed: 11 });
      const round = sanitizeScene(JSON.parse(JSON.stringify(scene)));
      expect(round).not.toBeNull();
      expect(round!.objects).toHaveLength(scene.objects.length);
      expect(round!.speakers).toHaveLength(scene.speakers.length);
      expect(round!.rooms ?? []).toHaveLength(scene.rooms?.length ?? 0);
      const doorsBefore = rects(scene, 'door');
      const doorsAfter = rects(round!, 'door');
      expect(doorsAfter).toHaveLength(doorsBefore.length);
      for (let i = 0; i < doorsBefore.length; i++) {
        expect(Object.keys(doorsAfter[i]).sort()).toEqual(Object.keys(doorsBefore[i]).sort());
      }
    }
  });

  it('stays well inside every import limit, so a generated design is shareable', () => {
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS.slice(0, 8)) {
        const { scene } = design(id, seed);
        expect(importRejection(scene)).toBeNull();
        const b = sceneBounds(scene);
        expect(b.max.x - b.min.x).toBeLessThan(MAX_ENVELOPE_M + 5);
        expect(b.max.x - b.min.x).toBeLessThan(MAX_IMPORT_SPAN);
      }
    }
  });

  it('furnishes every archetype and never leaves it an empty shell', () => {
    // `arrangeFurniture` tags everything it places `role: 'furniture'`.
    // Measured across seeds rather than at one: the smallest archetype (a
    // 4 x 3.5 office) can legitimately have every slot rejected once the
    // 1.1 m door corridor and 0.35 m clearances are subtracted, and a room
    // that stays empty is a better answer than a desk across the doorway.
    for (const id of ARCHETYPE_IDS) {
      let furnished = 0;
      for (const seed of SEEDS.slice(0, 8)) {
        const { scene } = design(id, seed);
        expect(walls(scene).length).toBeGreaterThanOrEqual(4);
        if (scene.objects.some((o) => o.kind === 'rect' && o.role === 'furniture')) furnished++;
      }
      expect(furnished).toBeGreaterThan(0);
    }
  });

  it('cuts doors and windows, which five of the arranger rules depend on', () => {
    let doors = 0;
    let windows = 0;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS.slice(0, 6)) {
        const { scene } = design(id, seed);
        doors += rects(scene, 'door').length;
        windows += rects(scene, 'window').length;
      }
    }
    expect(doors).toBeGreaterThan(0);
    expect(windows).toBeGreaterThan(0);
  });

  // An opening is emitted ON the line of the wall it cuts: a door's centre is
  // `lerp(a, b, lo)` between two collinear jamb stubs, a window's is a point on
  // its own wall. So the wall it belongs to is the one whose INFINITE LINE passes
  // through its centre — not the nearest wall, which at a corner is often the
  // PERPENDICULAR one and made an early cut of this test fail by exactly 90 deg.
  const hostWalls = (o: RectObj, ws: WallObj[]): WallObj[] =>
    ws.filter((w) => {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const L = Math.hypot(dx, dy);
      if (L < 1e-9) return false;
      const off = ((o.center.x - w.a.x) * -dy + (o.center.y - w.a.y) * dx) / L;
      return Math.abs(off) < 1e-6;
    });

  /** |cos| between the rect's own +w axis and the wall direction. 1 = flush. */
  const flushness = (o: RectObj, w: WallObj): number => {
    const c = rectCorners(o);
    const ax = c[1].x - c[0].x;
    const ay = c[1].y - c[0].y;
    const alen = Math.hypot(ax, ay);
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const wlen = Math.hypot(dx, dy);
    return Math.abs((ax / alen) * (dx / wlen) + (ay / alen) * (dy / wlen));
  };

  it('THE UNIT BUG: every opening sits FLUSH on its wall, on non-horizontal walls too', () => {
    // Asserted through the REAL geometry (rectCorners), never the raw `rotation`
    // field: the whole failure mode was a field holding a plausible-looking number
    // in the wrong UNIT, which a field-equality test would have happily pinned.
    //
    // `edgeAngleDeg` returned DEGREES into a radians field, so this held only for
    // the accidentally-correct 0-degree case. Measured ON THE GENERATED CORPUS
    // (1406 openings over 320 designs): 49.3 % sat on 0-degree walls and were
    // accidentally right; 40.9 % on 90-degree walls (26.62 deg out), 5.5 % on
    // 180 (53.24 out), 3.9 % on -90 (26.62), and a handful on +/-45 (13.31).
    // 50.7 % of every generated opening was wrong.
    let checked = 0;
    let nonAxisAligned = 0;
    let diagonal = 0;
    // The FULL seed list, not a slice. A slice of 8 contains ZERO genuinely
    // diagonal openings — the `l-notch`/`alcove` outline variants only produce
    // them from seed index 8 on — and a corpus without them accepts a fix that
    // snaps every opening to the nearest QUARTER turn: right units, wrong
    // geometry, 40/40 green. Measured, and this is the repo's own "the test
    // corpus follows the code's guards" lesson landing on this very diff.
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const { scene } = design(id, seed);
        const ws = walls(scene);
        for (const role of ['door', 'window'] as const) {
          for (const o of rects(scene, role)) {
            const hosts = hostWalls(o, ws);
            expect(hosts.length, `${id}/${seed} ${role}: no wall lies on this opening`).toBeGreaterThan(0);

            const best = Math.max(...hosts.map((w) => flushness(o, w)));
            expect(
              best,
              `${id}/${seed} ${role}: long axis is ${((Math.acos(Math.min(1, best)) * 180) / Math.PI).toFixed(2)} deg off every wall it lies on`,
            ).toBeCloseTo(1, 9);

            checked++;
            // Guard the guard, twice over. The bug was RIGHT on horizontal walls,
            // and an axis-snap is right on every axis-aligned one — so the corpus
            // must contain both a vertical opening and a genuinely DIAGONAL one or
            // it cannot falsify either wrong answer.
            if (hosts.some((w) => Math.abs(w.b.y - w.a.y) > 1e-6)) nonAxisAligned++;
            if (
              hosts.some((w) => Math.abs(w.b.y - w.a.y) > 1e-6 && Math.abs(w.b.x - w.a.x) > 1e-6)
            ) {
              diagonal++;
            }
          }
        }
      }
    }
    expect(checked, 'no openings were checked at all').toBeGreaterThan(50);
    expect(
      nonAxisAligned,
      'every opening sat on a horizontal wall — the ONE orientation the bug got right',
    ).toBeGreaterThan(20);
    expect(
      diagonal,
      'no DIAGONAL opening in the corpus — a quarter-turn snap would pass this test',
    ).toBeGreaterThan(0);
  });

  it("a generated opening agrees with the UI's own makeOpening on the same wall", () => {
    // The generator must not invent a second definition of "an opening flush on a
    // wall". `interaction.ts` makeOpening is the shipped, user-facing one and uses
    // the raw atan2, so the two must agree up to a half turn (same line, either
    // direction). This is what pins the FIX to the right convention, not just to
    // "some radian value".
    let compared = 0;
    // Full seed list, for the same reason as above.
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const { scene } = design(id, seed);
        const ws = walls(scene);
        for (const o of [...rects(scene, 'door'), ...rects(scene, 'window')]) {
          const hosts = hostWalls(o, ws);
          if (hosts.length === 0) continue;
          const ok = hosts.some((w) => {
            const ui = makeOpening(w, o.center, o.role === 'door' ? 'door' : 'window', 'probe') as RectObj;
            const d = Math.abs(Math.atan2(Math.sin(o.rotation - ui.rotation), Math.cos(o.rotation - ui.rotation)));
            return Math.min(d, Math.PI - d) < 1e-9;
          });
          expect(ok, `${id}/${seed} ${o.role}: disagrees with makeOpening on every wall it lies on`).toBe(true);
          compared++;
        }
      }
    }
    expect(compared, 'nothing was compared').toBeGreaterThan(25);
  });

  it('THE PAYOFF: never ships a placed-but-UNLOCKED pair', () => {
    // The whole reason the pair search is a verified ladder rather than a
    // formula. A design that opens "almost locked" gives the user nothing the
    // app makes discoverable, because the hero ignition needs an EDGE.
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const r = design(id, seed);
        if (r.scene.speakers.length === 0) {
          expect(r.locked).toBe(false);
          continue;
        }
        expect(r.scene.speakers).toHaveLength(2);
        expect(r.scene.pairs).toHaveLength(1);
        // Re-derive from the REAL engine rather than trusting the flag.
        const trace = traceScene(r.scene, 64, 1);
        const audio = computeAudio(r.scene, trace, true);
        expect(audio.pairs[0].locked).toBe(true);
        expect(r.locked).toBe(true);
      }
    }
  });

  it('locks a clear majority of designs — measured, not assumed', () => {
    let locked = 0;
    let total = 0;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        total++;
        if (design(id, seed).locked) locked++;
      }
    }
    // Measured at 87 % over 480 designs; the floor leaves room for the pair
    // search to be retuned without turning the suite red for a 1 % move.
    expect(locked / total).toBeGreaterThan(0.75);
  });

  it('DOORS JOIN THE ROOMS for furnishing — the variant-D check, end to end', () => {
    // `regionOf` never consults `wallKeptSpans`, so a door rect in a SOLID wall
    // cuts an acoustic opening but no walkable one, and every piece of
    // furniture ends up trapped in the seat's room. Two segments with a real
    // gap is what makes the walkable region reach the whole home.
    const r = generateDesign({ archetype: 'two-bed', seed: 21 });
    const walkable = regionOf(r.scene, r.scene.listener.pos, { doorsBlock: false });
    const zoning = regionOf(r.scene, r.scene.listener.pos, { doorsBlock: true });
    expect(walkable.area).toBeGreaterThan(zoning.area * 1.4);
  });

  it('names a second seat where the archetype has one, and hands control back to the first', () => {
    const r = generateDesign({ archetype: 'two-bed', seed: 9 });
    const seats = sceneListeners(r.scene);
    expect(seats.length).toBeGreaterThanOrEqual(2);
    // `addListener` makes the NEW seat active, so the primary has to be
    // restored explicitly or the design opens on the bedroom.
    expect(activeListener(r.scene).name).toBe(seats[0].name);
  });

  it('REPORTS furniture it could not place instead of dropping the notes', () => {
    // Measured across 8 archetypes x 200 seeds, 23.5 % of designs skip at least
    // one requested piece and a handful skip the TV. `arrangeFurniture` says so
    // in its notes; reading `objects` and discarding `notes` made that silent.
    let sawSkip = false;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const r = design(id, seed);
        expect(Array.isArray(r.skipped)).toBe(true);
        if (r.skipped.length > 0) {
          sawSkip = true;
          for (const note of r.skipped) expect(note).toMatch(/skipped/i);
        }
      }
    }
    // S22 asserted `sawSkip === true` here, i.e. it required the CORPUS to keep
    // failing in order to prove the plumbing worked. S33 took skips from 26.3 %
    // of designs to 4.4 %, so that assertion was on its way to becoming a
    // demand that the generator stay broken (the S27 lesson: improving a
    // detector disarms the controls written against its failures). The plumbing
    // is now proved by CONSTRUCTION instead, below, and the corpus is free to
    // reach zero.
    void sawSkip;
  });

  it('the skip REPORTING is proved by construction, not by the corpus failing', () => {
    // A 3.2 x 3.2 room with a 3 x 3 block in it: a bed cannot fit anywhere.
    const s = blankScene();
    const scene = {
      ...s,
      listener: { ...s.listener, pos: { x: 1.6, y: 1.6 } },
      objects: [
        ...rectRoomWalls(3.2, 3.2),
        {
          id: 'blocker', kind: 'rect' as const, center: { x: 1.6, y: 1.6 },
          w: 3, h: 3, rotation: 0, absorption: 0.1, label: 'Block',
          role: 'furniture' as const, height: 1,
        },
      ],
    };
    const required = arrangeFurniture(scene, [{ presetId: 'bed', count: 1 }]);
    expect(required.skipped).toHaveLength(1);
    expect(required.skipped[0]).toMatch(/skipped/i);

    // …and the same piece marked OPTIONAL is silent, which is what lets the
    // inventory order to a coverage budget without crying wolf.
    const optional = arrangeFurniture(scene, [{ presetId: 'bed', count: 1, optional: true }]);
    expect(optional.skipped).toEqual([]);
  });

  it('survives every archetype without throwing, at many seeds', () => {
    for (const id of ARCHETYPE_IDS) {
      for (const seed of [0, 1, 0xffffffff, 123456789]) {
        expect(() => generateDesign({ archetype: id as ArchetypeId, seed })).not.toThrow();
      }
    }
  });
});

describe('inventoryFor', () => {
  it('orders a bed per sleeping room and a sofa for the social one', () => {
    const items = inventoryFor([
      { name: 'Living room', x: 0, y: 0, w: 5, h: 5 },
      { name: 'Bedroom', x: 5, y: 0, w: 4, h: 5 },
      { name: 'Guest bedroom', x: 0, y: 5, w: 4, h: 4 },
    ]);
    const by = Object.fromEntries(items.map((i) => [i.presetId, i.count]));
    expect(by.bed).toBe(2);
    expect(by.sofa).toBe(1);
  });

  it('reads CELL area rather than the bounding box', () => {
    // `suggestInventory` multiplies the full span and over-orders on any
    // non-rectangular plan; this reads what each room actually has.
    const small = inventoryFor([{ name: 'Living room', x: 0, y: 0, w: 3, h: 3 }]);
    const large = inventoryFor([{ name: 'Living room', x: 0, y: 0, w: 6, h: 6 }]);
    const count = (xs: typeof small) => xs.reduce((a, i) => a + i.count, 0);
    expect(count(large)).toBeGreaterThan(count(small));
  });

  it('gives a studio somewhere to sleep', () => {
    const items = inventoryFor([{ name: 'Living room', x: 0, y: 0, w: 5, h: 5 }]);
    expect(items.some((i) => i.presetId === 'bed')).toBe(true);
  });

  it('does NOT put a bed in a one-room OFFICE or HOME CINEMA', () => {
    // `cells.length === 1` is true of `office` and `cinema` too, so the
    // studio-sleeps rule used to furnish every generated home office with a
    // double bed. Found by driving the real UI, not by any corpus score — the
    // bed placed fine and counted toward coverage.
    for (const name of ['Office', 'TV room']) {
      const items = inventoryFor([{ name, x: 0, y: 0, w: 5, h: 5 }]);
      expect(items.some((i) => i.presetId === 'bed'), name).toBe(false);
    }
  });
});

describe('names', () => {
  it('is stable per seed', () => {
    const a = designName(mulberry32(5), ARCHETYPES.studio);
    const b = designName(mulberry32(5), ARCHETYPES.studio);
    expect(a).toBe(b);
  });

  it('disambiguates only within the folder it was given', () => {
    expect(uniqueName('Quiet studio', [])).toBe('Quiet studio');
    expect(uniqueName('Quiet studio', ['Quiet studio'])).toBe('Quiet studio 2');
    expect(uniqueName('Quiet studio', ['Quiet studio', 'Quiet studio 2'])).toBe('Quiet studio 3');
  });
});

describe('S33: the inventory is driven by a coverage BUDGET', () => {
  const total = (xs: ReturnType<typeof inventoryFor>) => xs.reduce((a, i) => a + i.count, 0);

  it('scales with room area rather than stepping over a handful of thresholds', () => {
    // The old rule read six area thresholds, four of which never fired on any
    // of the 960 rooms in the corpus, so a 20 m² and a 50 m² living room were
    // furnished almost identically. Coverage came out at 7.3-18.1 % against the
    // hand-authored demo's 28.9 %.
    const areas = [16, 25, 36, 49].map((a) => {
      const side = Math.sqrt(a);
      return total(inventoryFor([{ name: 'Living room', x: 0, y: 0, w: side, h: side }]));
    });
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i], `area step ${i}`).toBeGreaterThan(areas[i - 1]);
    }
  });

  it('orders the two presets that were previously UNREACHABLE', () => {
    // No cell could ever order `cabinet` or `round-table` — they existed in the
    // palette and in PLACE_ORDER and the generator never asked for either.
    const ids = new Set(
      inventoryFor([{ name: 'Living room', x: 0, y: 0, w: 7, h: 7 }]).map((i) => i.presetId),
    );
    expect(ids.has('cabinet') || ids.has('round-table')).toBe(true);
  });

  it("a room's PROGRAMME is required and its FILL is optional", () => {
    const items = inventoryFor([{ name: 'Bedroom', x: 0, y: 0, w: 7, h: 7 }]);
    const by = Object.fromEntries(items.map((i) => [i.presetId, i]));
    // A bedroom promises a bed and a wardrobe.
    expect(by.bed.optional).toBe(false);
    expect(by.wardrobe.optional).toBe(false);
    // Anything ordered only to use up the remaining floor is optional.
    const fill = items.filter((i) => i.presetId !== 'bed' && i.presetId !== 'wardrobe');
    expect(fill.length).toBeGreaterThan(0);
    for (const f of fill) expect(f.optional, f.presetId).toBe(true);
  });

  it('a preset that is CORE anywhere stays required everywhere', () => {
    // `desk` is fill for a bedroom and core for a study. Summed across both it
    // must come out required, or a study could silently lose its desk.
    const items = inventoryFor([
      { name: 'Bedroom', x: 0, y: 0, w: 7, h: 7 },
      { name: 'Study', x: 7, y: 0, w: 5, h: 5 },
    ]);
    const desk = items.find((i) => i.presetId === 'desk');
    expect(desk).toBeDefined();
    expect(desk!.optional).toBe(false);
  });

  it('caps a room rather than filling it with eleven plants', () => {
    const items = inventoryFor([{ name: 'Living room', x: 0, y: 0, w: 12, h: 12 }]);
    for (const i of items) expect(i.count, i.presetId).toBeLessThanOrEqual(6);
    const plants = items.find((i) => i.presetId === 'plant');
    expect(plants?.count ?? 0).toBeLessThanOrEqual(3);
  });

  it('every id it can order is in PLACE_ORDER, or the arranger drops it silently', () => {
    // `arrangeFurniture` iterates PLACE_ORDER, not `items` — a preset missing
    // from that list is never queued no matter how loudly the inventory asks.
    const asked = new Set<string>();
    for (const name of ['Living room', 'Bedroom', 'Kitchen', 'Study', 'TV room', 'Office']) {
      for (const size of [4, 7, 10]) {
        for (const i of inventoryFor([{ name, x: 0, y: 0, w: size, h: size }])) asked.add(i.presetId);
      }
    }
    const scene = {
      ...blankScene(),
      objects: rectRoomWalls(30, 30),
    };
    for (const id of asked) {
      const res = arrangeFurniture(
        { ...scene, listener: { ...scene.listener, pos: { x: 15, y: 15 } } },
        [{ presetId: id, count: 1 }],
      );
      const placedOrReported = res.objects.length > 0 || res.skipped.length > 0;
      expect(placedOrReported, `${id} is never queued — missing from PLACE_ORDER?`).toBe(true);
    }
  });
});

describe('S33: the corpus-wide quality floors', () => {
  it('places what it promises — under 10 % of designs report a skipped piece', () => {
    // Measured 26.3 % before S33 and 4.4 % after. The floor is set with room to
    // retune, but a return to the old regime turns this red.
    let withSkip = 0;
    let n = 0;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        n++;
        if (design(id, seed).skipped.length > 0) withSkip++;
      }
    }
    expect(withSkip / n).toBeLessThan(0.1);
  });

  it('no archetype furnishes a room to less than a tenth of its floor', () => {
    // The "looks empty / random" complaint, as a number. `great-room` measured
    // 7.3 % and `loft` 8.1 % before S33; both clear 18 % now. The floor is well
    // under that so a retune has room, but a collapse is caught.
    for (const id of ARCHETYPE_IDS) {
      let coverage = 0;
      for (const seed of SEEDS) {
        const r = design(id, seed);
        const furniture = r.scene.objects.filter(
          (o) => o.kind === 'circle' || (o.kind === 'rect' && (o.role === 'furniture' || o.role === 'tv')),
        );
        const area = furniture.reduce(
          (a, o) => a + (o.kind === 'circle' ? Math.PI * o.r * o.r : o.kind === 'rect' ? o.w * o.h : 0),
          0,
        );
        const floor = regionOf(r.scene, r.scene.listener.pos, { doorsBlock: false }).area;
        coverage += area / Math.max(1, floor);
      }
      expect(coverage / SEEDS.length, id).toBeGreaterThan(0.1);
    }
  });
});

/**
 * S39 — `inventoryFor` keeps the room it was already reasoning about.
 *
 * It has always used a per-cell budget and a per-cell tally and then summed
 * both away. These pin the second return shape and, more importantly, pin the
 * two ways the restructure could silently order DIFFERENT furniture.
 */
describe('S39: inventoryFor tags each order with the room that made it', () => {
  const CELLS = [
    { name: 'Living room', x: 0, y: 0, w: 5, h: 5 },
    { name: 'Bedroom', x: 5, y: 0, w: 4, h: 5 },
    { name: 'Guest bedroom', x: 0, y: 5, w: 4, h: 4 },
  ];

  it('returns one item per (room, preset), each carrying its room id', () => {
    const items = inventoryFor(CELLS, ['r0', 'r1', 'r2']);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(['r0', 'r1', 'r2']).toContain(i.room);
    // The two bedrooms each order their own bed, as SEPARATE items — which is
    // the whole point, and is what the queue's `filter` then has to survive.
    const beds = items.filter((i) => i.presetId === 'bed');
    expect(beds).toHaveLength(2);
    expect(beds.map((b) => b.room).sort()).toEqual(['r1', 'r2']);
    for (const b of beds) expect(b.count).toBe(1);
  });

  it('orders EXACTLY what the aggregate form orders, preset for preset', () => {
    // THE GUARD THAT MATTERS. The first prototype of this change built the
    // per-room list by recursing — `inventoryFor([cell])` per cell — which
    // re-triggers the studio-sleeps rule below, whose guard is
    // `cells.length === 1`. A lone "Living room" cell satisfies it, so 300 of
    // 480 designs were ordered a spurious extra bed, 3.2 m2 of it, in the room
    // the listener sits in. Nothing else in the suite could see it.
    for (const cells of [
      CELLS,
      [{ name: 'Living room', x: 0, y: 0, w: 6, h: 6 }],
      [{ name: 'Office', x: 0, y: 0, w: 4, h: 4 }],
      [{ name: 'Kitchen', x: 0, y: 0, w: 4, h: 4 }, { name: 'Living room', x: 4, y: 0, w: 8, h: 8 }],
      [{ name: 'Bedroom', x: 0, y: 0, w: 7, h: 7 }, { name: 'Study', x: 7, y: 0, w: 5, h: 5 }],
    ]) {
      const flat = inventoryFor(cells);
      const perRoom = inventoryFor(cells, cells.map((_, i) => `r${i}`));
      const tally = (xs: typeof flat) => {
        const m = new Map<string, number>();
        for (const i of xs) m.set(i.presetId, (m.get(i.presetId) ?? 0) + i.count);
        return [...m].sort();
      };
      expect(tally(perRoom), cells.map((c) => c.name).join('+')).toEqual(tally(flat));
    }
  });

  it('never gives a MULTI-room plan a studio bed', () => {
    // The same defect stated as the property a reader can check by eye: a
    // living room in a home that also has a bedroom must not order its own bed.
    const items = inventoryFor(CELLS, ['r0', 'r1', 'r2']);
    const livingBeds = items.filter((i) => i.presetId === 'bed' && i.room === 'r0');
    expect(livingBeds).toEqual([]);
  });

  it('still gives a genuine STUDIO somewhere to sleep, tagged to its one room', () => {
    const items = inventoryFor([{ name: 'Living room', x: 0, y: 0, w: 5, h: 5 }], ['only']);
    const bed = items.find((i) => i.presetId === 'bed');
    expect(bed).toBeDefined();
    expect(bed!.room).toBe('only');
    expect(bed!.optional).toBe(false);
  });

  it('carries the same optional flag the aggregate form would, per room', () => {
    // A bedroom's `desk` is fill and a study's is core. Summed they come out
    // required; per room each keeps its own answer, which is what lets the
    // study's desk be pinned while the bedroom's stays free to roam.
    const items = inventoryFor(
      [{ name: 'Bedroom', x: 0, y: 0, w: 7, h: 7 }, { name: 'Study', x: 7, y: 0, w: 5, h: 5 }],
      ['bed', 'study'],
    );
    const desks = Object.fromEntries(items.filter((i) => i.presetId === 'desk').map((i) => [i.room, i.optional]));
    expect(desks.study).toBe(false);
    expect(desks.bed).toBe(true);
  });
});

describe('S39: every bedroom gets its own bed, end to end', () => {
  const inZone = (p: { x: number; y: number }, z: { at: { x: number; y: number }; w?: number; h?: number }) =>
    !!z.w && !!z.h &&
    Math.abs(p.x - z.at.x) <= z.w / 2 + 1e-9 &&
    Math.abs(p.y - z.at.y) <= z.h / 2 + 1e-9;

  it('leaves at most ONE named bedroom without a bed — this corpus had 20', () => {
    // Measured on THIS 24-seed corpus: 120 named bedrooms, of which the pre-S39
    // engine left **20** without a bed and this one leaves **1**. Over the full
    // 60-seed corpus the same defect is 36 of 60 `two-bed` designs, and every
    // one of that corpus's 60 programme misses is a piece ordered in the right
    // quantity and placed successfully in the WRONG room.
    //
    // The bound is 1 rather than 0 because the pin is a PREFERENCE: the one
    // survivor is `railroad`/2654435761, whose 4.4 x 3.5 m Bedroom has no slot
    // a 2.0 x 1.6 m bed fits after its door corridor and wardrobe, so the piece
    // legitimately falls back to the plan rather than being skipped. Refusing
    // instead would take designs skipping a piece from 2 to 38 of 480.
    let bedroomsChecked = 0;
    let without = 0;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const { scene } = design(id, seed);
        const beds = scene.objects.filter((o) => o.kind === 'rect' && o.label === 'Bed');
        for (const z of scene.rooms ?? []) {
          if (!/bed|sleep|master|guest/i.test(z.name) || !z.w || !z.h) continue;
          bedroomsChecked++;
          if (!beds.some((b) => inZone((b as RectObj).center, z))) without++;
        }
      }
    }
    expect(bedroomsChecked).toBe(120);
    expect(without).toBeLessThanOrEqual(1);
  });

  it('fixes five bedrooms that were measurably empty before', () => {
    // A bound of "at most 1 of 120" is satisfied by an engine that simply
    // orders fewer bedrooms, so name the designs. Each of these five is a
    // (archetype, seed, room) the pre-S39 engine left without a bed — verified
    // against a pristine checkout, not asserted from memory.
    const FIXED: Array<[ArchetypeId, number, string]> = [
      ['two-bed', 0, 'Guest bedroom'],
      ['two-bed', 2654435761, 'Bedroom'],
      ['two-bed', 1013904226, 'Bedroom'],
      ['two-bed', 3668339987, 'Guest bedroom'],
      ['two-bed', 2027808452, 'Guest bedroom'],
    ];
    for (const [id, seed, roomName] of FIXED) {
      const { scene } = design(id, seed);
      const zone = (scene.rooms ?? []).find((z) => z.name === roomName);
      expect(zone, `${id}/${seed} has no ${roomName}`).toBeDefined();
      const has = scene.objects.some(
        (o) => o.kind === 'rect' && o.label === 'Bed' && inZone(o.center, zone!),
      );
      expect(has, `${id}/${seed} ${roomName} still has no bed`).toBe(true);
    }
  });

  it('leaves no named study without a desk, and no kitchen without a counter', () => {
    let missed = 0;
    for (const id of ARCHETYPE_IDS) {
      for (const seed of SEEDS) {
        const { scene } = design(id, seed);
        for (const z of scene.rooms ?? []) {
          if (!z.w || !z.h) continue;
          const wants = /office|study|work/i.test(z.name) ? 'Desk'
            : /kitchen/i.test(z.name) ? 'Kitchen counter' : null;
          if (!wants) continue;
          const has = scene.objects.some(
            (o) => o.kind === 'rect' && o.label === wants && inZone(o.center, z),
          );
          if (!has) missed++;
        }
      }
    }
    // Not zero: 2 of 480 designs in the full 60-seed corpus have no slot for
    // the piece inside its own room and legitimately fall back to the plan.
    expect(missed).toBeLessThanOrEqual(1);
  });
});
