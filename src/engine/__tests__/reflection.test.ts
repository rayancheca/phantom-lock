import { describe, expect, it } from 'vitest';
import type { Scene, SceneObject, SpeakerObj, Surface, Vec2, WallObj } from '../types';
import { EPS, distPointSegment } from '../geometry';
import { collectSurfaces, directPath, traceScene } from '../raytrace';
import { bestPairSpot, bestReflectionDb } from '../pairspot';
import { bestListeningSpot } from '../bestspot';
import { computeAudio } from '../stereo';
import { DEFAULT_SETTINGS } from '../scene';
import { prepareReflections, reflectionDb } from '../reflection';
import { levelAtDb } from '../speakers';
import * as v from '../vec';
import { PROBE_EAR_Z, probePoints, reflectionProbeScenes } from './fixtures/reflection-probes';
import golden from './fixtures/reflection-golden.json';

/**
 * S19 rewrote the reflection search for speed. The contract is BIT-IDENTITY, so
 * the tests have to be able to see a one-ulp difference — an aggregate score
 * comparison cannot, because a per-cell divergence usually washes out of
 * `bestListeningSpot.best`.
 *
 * Three independent nets, because each catches what the others miss:
 *  1. A GOLDEN captured from the pre-optimization engine, sampled directly on
 *     `bestReflectionDb` (9 180 values) as well as end to end. Nothing else can
 *     prove "unchanged" — the optimized engine agreeing with itself proves
 *     nothing.
 *  2. A brute-force ORACLE: the original algorithm, transcribed into this file
 *     and run against randomized scenes. The golden pins fixed inputs; the
 *     oracle explores inputs nobody thought to write down.
 *  3. Structural assertions that the S18 grid cap's inputs did not move.
 *
 * Negative controls (run out of band, `docs/sessions/S19/bench/`): swapping the
 * nested `Math.hypot` for `sqrt(x*x+y*y)` breaks 14 golden entries, `v.norm` for
 * `v.scale(q, 1/wlen)` breaks 1, `proj+(proj-sp)` for `2*proj-sp` breaks 1, and
 * dropping the cell skip's `solos.length === 0` guard breaks 8 —
 * so the harness demonstrably fails when the arithmetic moves. Two further
 * controls (`o.w/2/wlen` → `o.w/(2*wlen)`, and `u < 0` → `u <= 0`) are NOT
 * caught: both need an input landing inside an ulp-wide window, and the corpus
 * does not contain one. Stated rather than hidden.
 */

const g = golden as Record<string, unknown>;

function enc(n: number): number | string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Inf';
  if (n === -Infinity) return '-Inf';
  if (Object.is(n, -0)) return '-0';
  return n;
}

/**
 * The PRE-S19 algorithm, transcribed verbatim from `pairspot.ts` as it stood at
 * commit c95a57b. Deliberately naive — it rebuilds every per-wall constant per
 * call and allocates the `surfaces.filter` array the optimization removed — so
 * it is an independent oracle rather than a paraphrase of the new code.
 */
function referenceReflectionDb(
  surfaces: Surface[],
  walls: WallObj[],
  objects: SceneObject[],
  sp: SpeakerObj,
  p: Vec2,
  earZ: number,
): number {
  let best = -Infinity;
  for (const w of walls) {
    const wlen = v.dist(w.a, w.b);
    if (wlen < EPS) continue;
    const dir = v.norm(v.sub(w.b, w.a));
    const rel = v.sub(sp.pos, w.a);
    const along = v.dot(rel, dir);
    const proj = v.add(w.a, v.scale(dir, along));
    const image = v.add(proj, v.sub(proj, sp.pos));
    const r = v.sub(p, image);
    const q = v.sub(w.b, w.a);
    const denom = r.x * q.y - r.y * q.x;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((w.a.x - image.x) * q.y - (w.a.y - image.y) * q.x) / denom;
    const u = ((w.a.x - image.x) * r.y - (w.a.y - image.y) * r.x) / denom;
    if (t <= 0.02 || t >= 0.98 || u < 0 || u > 1) continue;
    const flat = v.len(r);
    const total = Math.hypot(flat, sp.z - earZ);
    const bounceZ = sp.z + (earZ - sp.z) * t;
    if (bounceZ > w.height) continue;
    let throughOpening = false;
    for (const o of objects) {
      if (o.kind !== 'rect' || o.role !== 'door' || o.doorOpen === false) continue;
      if (distPointSegment(o.center, w.a, w.b) > 0.12) continue;
      const tc = v.dot(v.sub(o.center, w.a), dir) / wlen;
      const half = o.w / 2 / wlen;
      if (u >= tc - half && u <= tc + half) {
        throughOpening = true;
        break;
      }
    }
    if (throughOpening) continue;
    const bounce = v.add(w.a, v.scale(q, u));
    const legSurfaces = surfaces.filter((s) => s.objectId !== w.id);
    if (directPath(legSurfaces, sp.pos, sp.z, bounce, bounceZ).blocked) continue;
    if (directPath(legSurfaces, bounce, bounceZ, p, earZ).blocked) continue;
    const keep = Math.max(0.02, 1 - w.absorption);
    const db = levelAtDb(sp, Math.max(0.3, total)) + 20 * Math.log10(keep);
    if (db > best) best = db;
  }
  return best;
}

const wallsOf = (s: Scene): WallObj[] => s.objects.filter((o): o is WallObj => o.kind === 'wall');

describe('the reflection search is bit-identical to the engine it replaced', () => {
  const scenes = reflectionProbeScenes();

  it('covers every branch of the wall loop across the probe corpus', () => {
    // A corpus that never reaches the interesting `continue`s would pass every
    // assertion below while proving nothing — the S7 "guard a source scan that
    // finds nothing" lesson.
    let finite = 0;
    let infinite = 0;
    for (const { scene } of scenes) {
      const surfaces = collectSurfaces(scene.objects);
      const walls = wallsOf(scene);
      for (const sp of scene.speakers) {
        for (const p of probePoints(scene)) {
          const db = bestReflectionDb(surfaces, walls, scene.objects, sp, p, 1.2);
          if (Number.isFinite(db)) finite++;
          else infinite++;
        }
      }
    }
    // Both outcomes must be well represented: all -Infinity would mean no bounce
    // is ever credited and the whole comparison is vacuous.
    expect(finite).toBeGreaterThan(500);
    expect(infinite).toBeGreaterThan(500);
    expect(scenes.length).toBeGreaterThanOrEqual(12);
  });

  it.each(scenes.map((s) => s.name))(
    'reproduces the pre-optimization bestReflectionDb exactly — %s',
    (name) => {
      const { scene } = scenes.find((s) => s.name === name)!;
      const surfaces = collectSurfaces(scene.objects);
      const walls = wallsOf(scene);
      const out: Array<number | string> = [];
      for (const sp of scene.speakers) {
        for (const p of probePoints(scene)) {
          for (const earZ of PROBE_EAR_Z) {
            out.push(enc(bestReflectionDb(surfaces, walls, scene.objects, sp, p, earZ)));
          }
        }
      }
      const key = `${name} | bestReflectionDb`;
      expect(g[key], `golden entry missing: ${key}`).toBeDefined();
      expect(out).toEqual(g[key]);
    },
  );

  it.each(scenes.map((s) => s.name))(
    'reproduces the pre-optimization downstream observables exactly — %s',
    (name) => {
      const { scene } = scenes.find((s) => s.name === name)!;
      const surfaces = collectSurfaces(scene.objects);
      const [a, b] = scene.speakers;
      if (a && b) {
        const mid = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
        for (const tv of [null, { x: mid.x, y: mid.y + 1.5 }]) {
          const key = `${name} | bestPairSpot | tv=${tv ? 'yes' : 'no'}`;
          expect(g[key], `golden entry missing: ${key}`).toBeDefined();
          expect(bestPairSpot(scene, surfaces, a, b, 1.2, tv)).toEqual(g[key]);
        }
      }
      for (const tvAnchor of [false, true]) {
        for (const coarse of [false, true]) {
          const key = `${name} | field | tv=${tvAnchor} | coarse=${coarse}`;
          expect(g[key], `golden entry missing: ${key}`).toBeDefined();
          expect(bestListeningSpot(scene, tvAnchor, coarse)).toEqual(g[key]);
        }
        const trace = traceScene(scene, DEFAULT_SETTINGS.rayCount, DEFAULT_SETTINGS.maxBounces);
        const key = `${name} | audio | tv=${tvAnchor}`;
        expect(g[key], `golden entry missing: ${key}`).toBeDefined();
        expect(computeAudio(scene, trace, tvAnchor).pairs).toEqual(g[key]);
      }
    },
  );
});

/**
 * The golden pins the inputs somebody thought to write down. This explores the
 * ones nobody did — the brute-force oracle the acceptance criteria ask for.
 */
describe('brute-force oracle over randomized scenes', () => {
  function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  function randomScene(rnd: () => number, origin: number): { scene: Scene; walls: WallObj[] } {
    const objects: SceneObject[] = [];
    const n = 3 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      const ax = origin + rnd() * 14;
      const ay = origin + rnd() * 11;
      const ang = rnd() * Math.PI * 2;
      // Some walls are deliberately (near-)degenerate: zero length, and lengths
      // straddling EPS, so the `wlen < EPS` and `|denom| < 1e-9` guards are hit.
      const len = rnd() < 0.15 ? rnd() * 2e-6 : 0.5 + rnd() * 8;
      objects.push({
        id: `w${i}`,
        kind: 'wall',
        a: { x: ax, y: ay },
        b: { x: ax + Math.cos(ang) * len, y: ay + Math.sin(ang) * len },
        absorption: rnd() < 0.1 ? (rnd() < 0.5 ? 0 : 1) : rnd(),
        label: `w${i}`,
        height: 0.4 + rnd() * 3,
      });
    }
    for (let i = 0; i < 3; i++) {
      const host = objects[i];
      if (host?.kind !== 'wall') continue;
      const f = rnd();
      objects.push({
        id: `d${i}`,
        kind: 'rect',
        center: {
          x: host.a.x + (host.b.x - host.a.x) * f,
          y: host.a.y + (host.b.y - host.a.y) * f,
        },
        w: rnd() * 1.5,
        h: 0.12,
        rotation: rnd() * Math.PI,
        absorption: rnd(),
        label: `d${i}`,
        role: rnd() < 0.5 ? 'door' : 'window',
        height: 1 + rnd(),
        doorOpen: rnd() < 0.5,
      });
    }
    for (let i = 0; i < 2; i++) {
      objects.push({
        id: `c${i}`,
        kind: 'circle',
        center: { x: origin + rnd() * 14, y: origin + rnd() * 11 },
        r: 0.2 + rnd(),
        absorption: rnd(),
        label: `c${i}`,
        height: 0.3 + rnd() * 2.5,
      });
    }
    const speakers: SpeakerObj[] = [];
    for (let i = 0; i < 3; i++) {
      speakers.push({
        id: `s${i}`,
        pos: { x: origin + rnd() * 14, y: origin + rnd() * 11 },
        z: 0.2 + rnd() * 2.4,
        label: `s${i}`,
        model: rnd() < 0.5 ? 'homepod' : 'homepod-mini',
        trimDb: Math.round(rnd() * 12) - 6,
      });
    }
    const listener = { pos: { x: origin + 7, y: origin + 5 }, z: 1.2 };
    const scene: Scene = {
      objects,
      speakers,
      pairs: [[speakers[0].id, speakers[1].id]],
      listener: { ...listener },
      listeners: [{ id: 'L1', name: 'Seat', ...listener }],
      activeListenerId: 'L1',
      rooms: [],
    };
    return { scene, walls: wallsOf(scene) };
  }

  // Origins spanning ordinary metres up to 1e5, because ulp size grows with the
  // coordinate magnitude and `sanitizeScene` clamps no coordinate on the load
  // path — a refactor that reassociates arithmetic diverges there first.
  it.each([0, 1_000, 100_000])(
    'matches the transcribed original on 40 random scenes at origin %i',
    (origin) => {
      const rnd = seeded(0x5eed + origin);
      let compared = 0;
      let finite = 0;
      for (let k = 0; k < 40; k++) {
        const { scene, walls } = randomScene(rnd, origin);
        const surfaces = collectSurfaces(scene.objects);
        const ctx = prepareReflections(surfaces, walls, scene.objects);
        for (const sp of scene.speakers) {
          for (let i = 0; i < 12; i++) {
            const p = { x: origin + rnd() * 14, y: origin + rnd() * 11 };
            const earZ = 0.3 + rnd() * 2.5;
            const expected = referenceReflectionDb(surfaces, walls, scene.objects, sp, p, earZ);
            const actual = reflectionDb(ctx, sp, p, earZ);
            // Object.is, not toBe on a float: it separates +0/-0 and treats NaN
            // as equal to NaN, which is exactly the equality this contract means.
            if (!Object.is(actual, expected)) {
              throw new Error(
                `divergence at origin ${origin}, scene ${k}, speaker ${sp.id}: ` +
                  `expected ${expected}, got ${actual}`,
              );
            }
            compared++;
            if (Number.isFinite(actual)) finite++;
          }
        }
      }
      expect(compared).toBe(40 * 3 * 12);
      // Guard against a vacuous pass: if every answer were -Infinity the two
      // implementations would agree without exercising any of the maths.
      expect(finite).toBeGreaterThan(compared * 0.05);
    },
  );

  it('agrees with the original when the reused context is shared across speakers', () => {
    // The context caches per-(speaker, wall) mirrors in a Map. If that cache
    // ever keyed wrongly, one speaker would silently be evaluated with another's
    // mirror — an error a single-speaker test cannot see.
    const rnd = seeded(0xc0ffee);
    const { scene, walls } = randomScene(rnd, 0);
    const surfaces = collectSurfaces(scene.objects);
    const ctx = prepareReflections(surfaces, walls, scene.objects);
    const pts = Array.from({ length: 30 }, () => ({ x: rnd() * 14, y: rnd() * 11 }));
    // Interleave the speakers so the Map is hit in a different order than filled.
    for (const p of pts) {
      for (const sp of [...scene.speakers].reverse()) {
        expect(
          Object.is(
            reflectionDb(ctx, sp, p, 1.2),
            referenceReflectionDb(surfaces, walls, scene.objects, sp, p, 1.2),
          ),
        ).toBe(true);
      }
    }
  });
});

describe('prepareReflections leaves its inputs — and the grid cap — alone', () => {
  it('does not mutate or resize the surface array the cap measures', () => {
    // `surfaces.length` feeds `cappedStep`'s `perCellCost` at both call sites, so
    // pruning the array itself (rather than a side structure) would silently
    // change the sweep's step and with it every result. This is the guard.
    for (const { scene } of reflectionProbeScenes()) {
      const surfaces = collectSurfaces(scene.objects);
      const before = surfaces.length;
      const snapshot = JSON.stringify(surfaces);
      const ctx = prepareReflections(surfaces, wallsOf(scene), scene.objects);
      reflectionDb(ctx, scene.speakers[0], { x: 1, y: 1 }, 1.2);
      expect(surfaces.length).toBe(before);
      expect(JSON.stringify(surfaces)).toBe(snapshot);
      expect(ctx.surfaces).toBe(surfaces);
    }
  });

  it('finds a blocker its bounding-box fast pass cannot see, via the exhaustive rescan', () => {
    // The rescan exists because a bounding box is a search ORDER, not a filter —
    // `raySegment` can report a hit outside the box it was derived from. That
    // pathology needs ill-conditioned geometry and never occurs in the fixture
    // corpus, which is why these lines were the only ones left uncovered.
    //
    // A circle with a NEGATIVE radius reproduces the same *shape* of failure
    // deterministically: `rayCircle` squares `r`, so it occludes exactly like
    // radius |r|, but `boxOf` computes `c ± r` and yields an INVERTED box that
    // intersects nothing. The fast pass therefore skips it on every query, and
    // only the unfiltered rescan can find it. If someone ever "simplifies" the
    // rescan away, this test fails — which is precisely its job.
    const blocker: Surface = {
      type: 'circle',
      c: { x: 2.5, y: 0.2 },
      r: -1.2, // occludes like 1.2; boxes as an empty, inverted rectangle
      absorption: 0.2,
      height: 3,
      objectId: 'blocker',
    };
    const wall: WallObj = {
      id: 'w',
      kind: 'wall',
      a: { x: 5, y: -3 },
      b: { x: 5, y: 3 },
      absorption: 0.2,
      label: 'w',
      height: 3,
    };
    const sp: SpeakerObj = {
      id: 's',
      pos: { x: 0, y: 0 },
      z: 1,
      label: 's',
      model: 'homepod',
      trimDb: 0,
    };
    const surfaces = [blocker, ...collectSurfaces([wall])];
    const ctx = prepareReflections(surfaces, [wall], [wall]);
    const p = { x: 0.5, y: 0.6 };

    // The reference implementation routes through `directPath`, which has no box
    // test at all — so agreeing with it IS the proof the rescan did its job.
    const expected = referenceReflectionDb(surfaces, [wall], [wall], sp, p, 1.2);
    expect(Object.is(reflectionDb(ctx, sp, p, 1.2), expected)).toBe(true);
    // …and the blocker really is doing something: drop it and the answer moves.
    const withoutBlocker = prepareReflections(collectSurfaces([wall]), [wall], [wall]);
    expect(reflectionDb(withoutBlocker, sp, p, 1.2)).not.toBe(expected);
  });

  it('does not build the door-span table until a wall actually needs it', () => {
    // The table is O(walls x doors-on-that-wall), and "on this wall" is a 0.12 m
    // proximity test — so a payload of near-coincident walls sharing a pile of
    // doors puts every door on every wall. Built eagerly that measured 144.7 MB
    // for ONE context on an import-legal scene, and `computeAudio` builds one
    // per apex-blocked pair. The pre-change code allocated nothing here, so
    // eager construction was a new OOM on an input the importer accepts.
    const objects: SceneObject[] = [];
    for (let i = 0; i < 40; i++) {
      objects.push({
        id: `w${i}`,
        kind: 'wall',
        a: { x: 0, y: i * 1e-5 },
        b: { x: 10, y: i * 1e-5 },
        absorption: 0.1,
        label: `w${i}`,
        height: 2.6,
      });
    }
    for (let i = 0; i < 40; i++) {
      objects.push({
        id: `d${i}`,
        kind: 'rect',
        center: { x: 1 + i * 0.2, y: 0 },
        w: 0.8,
        h: 0.1,
        rotation: 0,
        absorption: 0.2,
        label: `d${i}`,
        role: 'door',
        height: 2.1,
        doorOpen: true,
      });
    }
    const walls = objects.filter((o): o is WallObj => o.kind === 'wall');
    const ctx = prepareReflections(collectSurfaces(objects), walls, objects);
    // Nothing is materialised up front — not one wall, however many doors match.
    expect(ctx.walls.every((w) => w.openings === null)).toBe(true);

    // …and the lazy path, when it IS taken, still produces the original's
    // answer. Driven on a scene that provably reaches the opening test (a
    // partition with an OPEN door), so this cannot pass vacuously.
    const doorScene = reflectionProbeScenes().find((x) =>
      x.name.startsWith('partition with an OPEN door'),
    )!.scene;
    const dSurfaces = collectSurfaces(doorScene.objects);
    const dWalls = wallsOf(doorScene);
    const dCtx = prepareReflections(dSurfaces, dWalls, doorScene.objects);
    expect(dCtx.walls.every((w) => w.openings === null)).toBe(true);
    for (const sp2 of doorScene.speakers) {
      for (const p of probePoints(doorScene)) {
        expect(
          Object.is(
            reflectionDb(dCtx, sp2, p, 1.2),
            referenceReflectionDb(dSurfaces, dWalls, doorScene.objects, sp2, p, 1.2),
          ),
        ).toBe(true);
      }
    }
    // Some wall has now filled its table — otherwise the lazy path was never
    // exercised and the assertions above prove nothing about it.
    expect(dCtx.walls.some((w) => w.openings !== null)).toBe(true);
  });

  it('drops zero-length walls from the prepared list, exactly as the original skipped them', () => {
    const zero: WallObj = {
      id: 'z',
      kind: 'wall',
      a: { x: 2, y: 2 },
      b: { x: 2, y: 2 },
      absorption: 0.2,
      label: 'z',
      height: 2.5,
    };
    const real: WallObj = {
      id: 'r',
      kind: 'wall',
      a: { x: 0, y: 0 },
      b: { x: 5, y: 0 },
      absorption: 0.2,
      label: 'r',
      height: 2.5,
    };
    const ctx = prepareReflections([], [zero, real, zero], [zero, real, zero]);
    expect(ctx.walls).toHaveLength(1);
    expect(ctx.walls[0].wall.id).toBe('r');
  });
});
