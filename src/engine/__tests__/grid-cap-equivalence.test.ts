import { describe, expect, it } from 'vitest';
import { bestListeningSpot } from '../bestspot';
import { bestPairSpot } from '../pairspot';
import { computeAudio } from '../stereo';
import { collectSurfaces, traceScene } from '../raytrace';
import { DEFAULT_SETTINGS, rectRoomWalls, sceneBounds } from '../scene';
import type { Scene, SpeakerObj } from '../types';
import { MAX_GRID_CELLS, cappedStep, gridCells } from '../grid';
import { legitScenes } from './fixtures/legit-scenes';
import golden from './fixtures/legit-golden.json';

/**
 * The grid cap is only legitimate if it is INVISIBLE to every scene the app can
 * really produce. `legit-golden.json` was captured from the engine as it stood
 * BEFORE the cap existed (`docs/sessions/S18/bench/make-golden.ts`), so this is
 * a genuine before/after comparison, not the cap agreeing with itself.
 *
 * Same discipline as `door-swing-equivalence.test.ts`: prove the change is inert
 * where it must be, with negative controls proving the harness can fail.
 *
 * Two tiers, deliberately:
 *  - Every fixture gets the STEP-IDENTITY check. `cappedStep` feeds exactly one
 *    value into `bestspot.ts:150` / `pairspot.ts:145` — the step — so an
 *    identical step is a TOTAL proof that the loop ran unchanged. It costs 0 ms.
 *  - The fixtures that run in well under a second additionally get the full
 *    end-to-end golden comparison. The 50-room chain is deliberately excluded:
 *    one uncapped pass over it costs ~13 s (that slowness is the very thing
 *    `docs/ideas.md` §2 wants fixed), which would blow the suite's runtime for a
 *    result step-identity already proves. It IS compared end-to-end out of band —
 *    see `docs/sessions/S18/bench/verify-equivalence.ts`.
 */

const asGolden = golden as Record<string, unknown>;
const clone = (x: unknown) => JSON.parse(JSON.stringify(x));

/** Fast enough to run end-to-end inside the suite. */
const CHEAP = new Set(['bundled Maple Court demo', 'maximum-size UI room', '10-room chain']);

/**
 * The chains beyond 400 m span are deliberately NOT protected: `importRejection`
 * refuses them, they already cost tens of seconds per edit, and coarsening them
 * is the usability half of `docs/ideas.md` §2. Their coarsening is asserted
 * below so it stays a decision rather than an accident.
 */
const COARSENED = new Set(['50 max-size rooms (span 1250)', '50 max-size rooms, 16 speakers']);

/** The two cost proxies, exactly as `bestspot.ts` / `pairspot.ts` compute them. */
const bestCost = (scene: { objects: unknown[]; speakers: unknown[] }, surfaces: number) =>
  scene.objects.length + scene.speakers.length * Math.max(1, surfaces);
const pairCost = (scene: { objects: unknown[] }, surfaces: number) =>
  scene.objects.length + 2 * Math.max(1, surfaces);

describe('the grid cap is invisible to every legitimate scene', () => {
  it('has a golden entry for every fixture it claims to (an empty golden proves nothing)', () => {
    expect(Object.keys(asGolden).length).toBe(30);
    for (const name of CHEAP) {
      expect(asGolden[`${name} | tv=false | coarse=false`]).toBeDefined();
    }
  });

  for (const { name, scene } of legitScenes()) {
    if (COARSENED.has(name)) continue;

    it(`leaves both grid steps byte-identical — ${name}`, () => {
      const bounds = sceneBounds(scene);
      const surfaces = collectSurfaces(scene.objects).length;
      const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
      // `Math.max` hands back the identical float when nothing binds, and `step`
      // is the ONLY value the cap feeds into either loop — so an identical step
      // is a total proof that the loop body ran unchanged, not an approximation.
      for (const coarse of [false, true]) {
        const base = Math.max(0.25, Math.min(0.7, span / (coarse ? 13 : 24)));
        expect(cappedStep(bounds, base, bestCost(scene, surfaces))).toBe(base);
      }
      expect(cappedStep(bounds, 0.35, pairCost(scene, surfaces))).toBe(0.35);
    });

    if (!CHEAP.has(name)) continue;

    it(`reproduces the pre-cap best-spot field exactly — ${name}`, () => {
      for (const tvAnchor of [false, true]) {
        for (const coarse of [false, true]) {
          expect(clone(bestListeningSpot(scene, tvAnchor, coarse))).toEqual(
            asGolden[`${name} | tv=${tvAnchor} | coarse=${coarse}`],
          );
        }
      }
    });

    it(`reproduces the pre-cap pair metrics exactly (incl. relocated sweet spots) — ${name}`, () => {
      for (const tvAnchor of [false, true]) {
        const trace = traceScene(scene, DEFAULT_SETTINGS.rayCount, DEFAULT_SETTINGS.maxBounces);
        expect(clone(computeAudio(scene, trace, tvAnchor).pairs)).toEqual(
          asGolden[`${name} | audio | tv=${tvAnchor}`],
        );
      }
    });
  }

  it('NEGATIVE CONTROL — a step change really does move the answer', () => {
    // Without this, every assertion above could be green merely because the
    // engine ignores `step`. `coarse` is the engine's own in-tree step lever.
    const scene = legitScenes()[0].scene;
    expect(bestListeningSpot(scene, false, true)).not.toEqual(bestListeningSpot(scene, false, false));
  });

  it('NEGATIVE CONTROL — the golden would catch a real regression', () => {
    const scene = legitScenes()[0].scene;
    const moved = {
      ...scene,
      speakers: scene.speakers.map((s) => ({ ...s, pos: { x: s.pos.x + 1, y: s.pos.y } })),
    };
    expect(clone(bestListeningSpot(moved, false, false))).not.toEqual(
      asGolden['bundled Maple Court demo | tv=false | coarse=false'],
    );
  });
});

/**
 * A big OPEN hall — the cap fires on its span, but a real answer still exists.
 *
 * The pair is spaced PROPORTIONALLY to the hall. A 2 m-wide stereo pair dropped
 * into a 400 m hall has almost no scoring cell at any resolution, so it would
 * test the fixture's geometry rather than the cap.
 */
function openHall(size: number, speakerCount: number): Scene {
  const speakers: SpeakerObj[] = [];
  const gap = size / 8;
  for (let i = 0; i < speakerCount; i++) {
    speakers.push({
      id: `s${i}`,
      pos: { x: size / 2 - gap / 2 + i * gap, y: size / 2 - size / 6 },
      z: 1,
      label: `S${i}`,
      model: 'homepod',
      trimDb: 0,
    });
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < speakerCount; i += 2) pairs.push([speakers[i].id, speakers[i + 1].id]);
  return {
    objects: rectRoomWalls(size, size),
    speakers,
    pairs,
    listener: { pos: { x: size / 2, y: size / 2 }, z: 1.2 },
  };
}

describe('the scenes the cap DELIBERATELY coarsens', () => {
  for (const { name, scene } of legitScenes()) {
    if (!COARSENED.has(name)) continue;

    it(`coarsens, on purpose, and still answers — ${name}`, () => {
      const bounds = sceneBounds(scene);
      const surfaces = collectSurfaces(scene.objects).length;
      const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y);
      const base = Math.max(0.25, Math.min(0.7, span / 24));
      // Past 400 m the importer refuses the layout, so it is outside the set the
      // cap protects. Pin that this is intentional: a future recalibration that
      // silently starts protecting it would give back the whole bound.
      expect(span).toBeGreaterThan(400);
      const stepped = cappedStep(bounds, base, bestCost(scene, surfaces));
      const paired = cappedStep(bounds, 0.35, pairCost(scene, surfaces));
      expect(stepped > base || paired > 0.35).toBe(true);
    });
  }
});

describe('the grid cap DOES fire on the scenes it exists for', () => {
  it('coarsens an import-legal adversarial payload by orders of magnitude', () => {
    const bounds = { min: { x: 0, y: 0 }, max: { x: 399, y: 399 } };
    // 100 objects, 64 speakers (the MAX_IMPORT_SPEAKERS ceiling), 400 surfaces.
    const step = cappedStep(bounds, 0.7, 100 + 64 * 400);
    expect(step).toBeGreaterThan(0.7);
    const before = gridCells(bounds, 0.7);
    expect(before).toBeGreaterThan(300_000);
    expect(before / gridCells(bounds, step)).toBeGreaterThan(40); // measured 45.6x
  });

  it('coarsens the object-bomb hardest, because its cells cost the most', () => {
    // 5,000 objects => 20,000 surfaces => 47.8 ms PER CELL, measured. The cell
    // ceiling alone cannot see this shape; only the work ceiling can.
    const bounds = { min: { x: 0, y: 0 }, max: { x: 399, y: 399 } };
    const step = cappedStep(bounds, 0.7, 5_000 + 64 * 20_000);
    expect(gridCells(bounds, 0.7) / gridCells(bounds, step)).toBeGreaterThan(1_000);
  });

  it('bounds the LOAD path, which importRejection never sees', () => {
    // A record written straight into IndexedDB is bounded only by
    // MAX_SCENE_SPAN (20 km) — 3.27 billion pairspot cells, an OOM not a stall.
    const bounds = { min: { x: 0, y: 0 }, max: { x: 20_000, y: 20_000 } };
    expect(gridCells(bounds, 0.35)).toBeGreaterThan(3_000_000_000);
    expect(gridCells(bounds, cappedStep(bounds, 0.35, 2 * 4))).toBeLessThanOrEqual(MAX_GRID_CELLS);
  });

  it('still returns a usable answer on a capped scene, rather than nothing', () => {
    // Coarser must mean rougher, never empty — the green ★ has to survive.
    const scene = openHall(400, 2);
    const bounds = sceneBounds(scene);
    const surfaces = collectSurfaces(scene.objects);
    expect(cappedStep(bounds, 0.7, scene.speakers.length * surfaces.length)).toBeGreaterThan(0.7);

    const field = bestListeningSpot(scene, false, false);
    expect(field.best).not.toBeNull();
    expect(field.bestScore).toBeGreaterThan(0);
    expect(field.zone.length).toBeGreaterThan(0);
  });

  it('a capped pair sweep still finds a seat', () => {
    const scene = openHall(400, 2);
    const surfaces = collectSurfaces(scene.objects);
    expect(cappedStep(sceneBounds(scene), 0.35, 2 * surfaces.length)).toBeGreaterThan(0.35);
    const found = bestPairSpot(scene, surfaces, scene.speakers[0], scene.speakers[1], 1.2, null);
    expect(found).not.toBeNull();
  });

  it('bounds the work of the slowest shape that survives the cap', () => {
    // A 400 m span at the 64-speaker import ceiling. This is the CHEAPEST-per-cell
    // adversarial shape (an empty hall has only 4 surfaces), so the work ceiling
    // barely engages and the cell ceiling carries it — which makes it the slowest
    // case that survives the cap, and therefore the honest one to assert on.
    //
    // Asserted as a deterministic CELL COUNT, never as wall-clock: a timing
    // assertion here failed under `--coverage` at 10.18 s against a 10 s bound
    // while the code was completely correct. Real timings live in
    // `docs/sessions/S18/bench/after.txt`, measured without instrumentation.
    const scene = openHall(400, 64);
    const bounds = sceneBounds(scene);
    const surfaces = collectSurfaces(scene.objects).length;
    const step = cappedStep(bounds, 0.7, bestCost(scene, surfaces));
    expect(step).toBeGreaterThan(0.7);
    expect(gridCells(bounds, step)).toBeLessThanOrEqual(MAX_GRID_CELLS);
    expect(gridCells(bounds, 0.7) / gridCells(bounds, step)).toBeGreaterThan(2);
  });
});
