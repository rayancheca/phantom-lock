/**
 * "Make me a design" — a seeded procedural floorplan generator.
 *
 * ## Module position
 *
 * This directory is a LEAF CONSUMER at the top of the graph, the position
 * `seed.ts` occupies and for the same reason. It imports `scene`, `arrange`,
 * `raytrace` and `stereo`; nothing in `src/engine/` may import it BACK. Doing so
 * creates two cycles at once — `scene -> generate -> arrange -> scene` and
 * `scene -> generate -> stereo -> pairspot -> scene` — which is a strictly
 * larger blast radius than `seed.ts` carries, since that file deliberately
 * avoided `optimize`/`stereo` by using fixed solved coordinates. The only
 * permitted consumers are the App wiring and the tests.
 *
 * ## What determinism covers
 *
 * GEOMETRY, and not ids. `createId` mixes `Date.now()`, a counter and
 * `Math.random()`, so the same seed gives the same walls, the same furniture and
 * the same speaker positions with different ids every time. That is the right
 * trade: `Layout.id` must stay `createId` because `assembleStore` dedups layout
 * ids store-wide, so ten designs generated from one seed with deterministic ids
 * would have nine of them silently re-keyed.
 *
 * ## Order of operations, and why furniture comes before speakers
 *
 * `arrange.ts`'s `fits()` iterates `scene.objects` and its own placed list —
 * SPEAKERS ARE NEITHER — so arranging after placing drops a wardrobe on top of
 * a HomePod. Furnishing first costs one documented thing: `ctx.reflections` is
 * gated on `scene.speakers.length > 0`, so the first-reflection-absorber layer
 * never fires in a generated design. A bookshelf on a reflection point is worth
 * less than a speaker inside a wardrobe.
 */

import type { Scene, SceneObject, Vec2 } from '../types';
import {
  DEFAULT_LISTENER_Z,
  FURNITURE_PRESETS,
  activeListener,
  addListener,
  blankScene,
  renameListener,
  setActiveListener,
  updateActiveListener,
} from '../scene';
import { arrangeFurniture, type ArrangeItem } from '../arrange';
import { ARCHETYPES, MAX_ENVELOPE_M, type ArchetypeId } from './archetypes';
import { envelopeOutline, tileEnvelope, type Cell } from './tile';
import { buildShell } from './shell';
import { designName } from './names';
import { findLockingPair } from './pair';
import { lattice, mulberry32, pick, randomSeed } from './rng';

export { ARCHETYPES, ARCHETYPE_IDS, MAX_ENVELOPE_M } from './archetypes';
export type { Archetype, ArchetypeId } from './archetypes';
export { formatSeed, parseSeed, randomSeed } from './rng';
export { uniqueName } from './names';

export interface GenerateOptions {
  archetype: ArchetypeId;
  /** uint32. */
  seed: number;
  /** Cinema (TV-anchored) or music. Defaults to true, matching DEFAULT_SETTINGS. */
  tvAnchor?: boolean;
}

export interface GenerateResult {
  scene: Scene;
  name: string;
  seed: number;
  archetype: ArchetypeId;
  /**
   * False when the ladder found no verified lock — the scene then has ZERO
   * speakers, never an unlocked pair.
   */
  locked: boolean;
  /**
   * What the arranger could not place, in its own words.
   *
   * `arrangeFurniture` explains every skipped piece ("No spot survives the
   * rules for a plant — it was skipped."), and dropping those notes on the
   * floor is a silent failure: measured across 8 archetypes x 200 seeds,
   * **23.5 % of designs skip at least one requested piece**, and a handful of
   * `railroad` seeds skip the TV itself. Carried here so the UI can say so.
   */
  skipped: string[];
}

/** Envelope dimensions are drawn on a 0.5 m lattice. */
const ENVELOPE_STEP = 0.5;

/**
 * Floor coverage a generated room aims for.
 *
 * Measured off `apartmentScene()` — the hand-authored Maple Court demo, a model
 * of the home the owner actually lives in: 14.8 m² of furniture on 51.4 m² of
 * walkable floor, i.e. **28.9 %**. Aimed slightly under that because the budget
 * is spent against a cell's RECTANGULAR area while the score is measured against
 * the WALKABLE region, which is smaller once walls and door corridors are taken
 * out.
 *
 * The old rule ordered a fixed handful of pieces from six area thresholds, four
 * of which never fired on any of the 960 rooms in the corpus, and left `cabinet`
 * and `round-table` unreachable — no cell could ever order them. Coverage came
 * out at 7.3–18.1 % against the demo's 28.9 %, which is what "looks random /
 * empty" actually measures: `great-room` had more than twice Maple Court's floor
 * and FEWER pieces on it.
 */
const COVERAGE_TARGET = 0.24;

/**
 * What each kind of room is FOR, in two tiers.
 *
 * `core` is what the room's name promises and is ordered unconditionally — a
 * bedroom has a bed at 12 m² and at 40 m². `fill` is then cycled, one piece at a
 * time, until the coverage budget is met, so a big room gets more of the same
 * programme rather than a different one. Each entry carries its own cap, because
 * "logic and thought" means three plants and not eleven.
 *
 * Every id here MUST also appear in `arrange.ts` `PLACE_ORDER`: that list is
 * what `arrangeFurniture` iterates, so a preset missing from it is silently
 * dropped no matter how loudly the inventory asks for it.
 */
interface RoomProgramme {
  core: string[];
  fill: Array<{ id: string; max: number }>;
}

function programmeFor(name: string): RoomProgramme {
  const n = name.toLowerCase();
  if (/bed|sleep|guest|master/.test(n)) {
    return {
      core: ['bed', 'wardrobe'],
      fill: [
        { id: 'bookshelf', max: 2 },
        { id: 'cabinet', max: 2 },
        { id: 'armchair', max: 1 },
        { id: 'plant', max: 2 },
        { id: 'desk', max: 1 },
      ],
    };
  }
  if (/kitchen/.test(n)) {
    return {
      core: ['counter', 'dining'],
      fill: [
        { id: 'counter', max: 3 },
        { id: 'cabinet', max: 2 },
        { id: 'plant', max: 2 },
      ],
    };
  }
  if (/office|study|work|desk/.test(n)) {
    return {
      core: ['desk', 'bookshelf'],
      fill: [
        // A sofa first, and not as padding: the `office` archetype's own blurb
        // is "a small room to work and listen in", so seating belongs there on
        // its merits. It is also the only piece in this programme with real
        // footprint — without it an office furnished to 10.9 % of its floor,
        // because everything else here is 0.3 m² of shelf.
        { id: 'sofa', max: 1 },
        { id: 'cabinet', max: 2 },
        { id: 'bookshelf', max: 3 },
        { id: 'armchair', max: 1 },
        { id: 'plant', max: 2 },
      ],
    };
  }
  // Living room, TV room, loft — the social space.
  return {
    core: ['sofa', 'tv'],
    fill: [
      { id: 'armchair', max: 2 },
      { id: 'round-table', max: 1 },
      { id: 'bookshelf', max: 2 },
      { id: 'cabinet', max: 2 },
      { id: 'dining', max: 1 },
      { id: 'plant', max: 3 },
      { id: 'sofa', max: 2 },
    ],
  };
}

/** Plan-view footprint of a preset, m². A circle is `w` across. */
function footprintOf(presetId: string): number {
  const p = FURNITURE_PRESETS.find((q) => q.id === presetId);
  if (!p) return 0;
  return p.kind === 'circle' ? Math.PI * (p.w / 2) ** 2 : p.w * p.h;
}

/**
 * Furniture for a set of cells, derived per ROOM and summed.
 *
 * Not `suggestInventory`, which reads the bounding BOX (`arrange.ts` multiplies
 * the full span) and therefore over-orders on any non-rectangular plan —
 * measured: a 12x10-bbox plan with a 30 m² floor reported 51 m² and asked for 11
 * pieces, two of which were then dropped with "No spot survives the rules". The
 * generator knows its own cell areas, so it uses them.
 */
export function inventoryFor(cells: Cell[], roomIds?: readonly string[]): ArrangeItem[] {
  const counts = new Map<string, { count: number; optional: boolean }>();
  /**
   * The same tallies, kept per CELL as well as summed.
   *
   * Written as a second accumulator inside the existing loop rather than by
   * recursing per cell. Recursing looks equivalent and is not: the
   * studio-sleeps rule below is guarded on `cells.length === 1`, which a lone
   * "Living room" cell satisfies, so a per-cell recursion orders **a spurious
   * bed in 300 of 480 designs** — 3.2 m2 of it, in the room the listener sits
   * in. The first prototype of this change did exactly that and produced a lock
   * regression I nearly attributed to the feature.
   */
  const perCell: Array<Map<string, { count: number; optional: boolean }>> = cells.map(() => new Map());
  let bedrooms = 0;

  for (const [cellIndex, c] of cells.entries()) {
    const budget = c.w * c.h * COVERAGE_TARGET;
    const programme = programmeFor(c.name);
    if (/bed|sleep|guest|master/.test(c.name.toLowerCase())) bedrooms++;

    // Per-CELL tallies: the caps are what one room may hold, not what the whole
    // home may. Two bedrooms order two beds; one bedroom does not order two.
    const here = new Map<string, number>();
    let used = 0;
    const take = (id: string, optional: boolean) => {
      here.set(id, (here.get(id) ?? 0) + 1);
      const mine = perCell[cellIndex].get(id);
      perCell[cellIndex].set(id, {
        count: (mine?.count ?? 0) + 1,
        optional: (mine?.optional ?? true) && optional,
      });
      const prev = counts.get(id);
      counts.set(id, {
        count: (prev?.count ?? 0) + 1,
        // A preset ordered by ANY room's core is required overall. Only a piece
        // that is pure fill everywhere it appears may be quietly dropped.
        optional: (prev?.optional ?? true) && optional,
      });
      used += footprintOf(id);
    };

    for (const id of programme.core) take(id, false);

    // Cycle the fill list rather than exhausting each entry in turn, so a room
    // gets variety before it gets a third bookshelf. Stops as soon as a whole
    // pass adds nothing, which is what makes the loop total.
    for (let pass = 0; pass < 8 && used < budget; pass++) {
      let added = false;
      for (const entry of programme.fill) {
        if (used >= budget) break;
        if ((here.get(entry.id) ?? 0) >= entry.max) continue;
        take(entry.id, true);
        added = true;
      }
      if (!added) break;
    }
  }

  // A studio still sleeps — and that bed is a promise, not a filler.
  //
  // Gated on the room being a LIVING space. `cells.length === 1` alone is true
  // of `office` ("Office") and `cinema` ("TV room") as well as `studio`, so the
  // old form put a double bed in every generated home office — caught by driving
  // the real UI in S33, where the kept design was "Bright office: Bed, Desk,
  // Cabinet, Cabinet, Bookshelf…". No corpus score could see it: the bed was
  // placed successfully and counted toward coverage, which is exactly the kind
  // of thing that reads as "no logic and thought".
  if (bedrooms === 0 && cells.length === 1 && /living|lounge|studio|loft/i.test(cells[0].name)) {
    const prev = counts.get('bed');
    counts.set('bed', { count: (prev?.count ?? 0) + 1, optional: false });
    const mine = perCell[0].get('bed');
    perCell[0].set('bed', { count: (mine?.count ?? 0) + 1, optional: false });
  }

  // With room ids, the SAME tallies are returned per cell instead of summed, so
  // `arrangeFurniture` can keep each room's promise in that room. Without them
  // the aggregate below is byte-identical to the pre-S39 return, which is what
  // makes this invisible to `suggestInventory`'s caller and to the 25 test call
  // sites that pass no ids.
  if (roomIds) {
    const out: ArrangeItem[] = [];
    perCell.forEach((m, i) => {
      for (const [presetId, e] of m) {
        out.push({ presetId, count: e.count, optional: e.optional, room: roomIds[i] });
      }
    });
    return out;
  }
  return [...counts].map(([presetId, e]) => ({ presetId, count: e.count, optional: e.optional }));
}

/**
 * Generate one design.
 *
 * Every stage is a pure function of `(rng, previous stage)`, and the rng is a
 * total function of the seed — so this whole call is deterministic in geometry.
 */
export function generateDesign(opts: GenerateOptions): GenerateResult {
  const arch = ARCHETYPES[opts.archetype];
  const rnd = mulberry32(opts.seed);

  // The name is drawn FIRST so that adding a geometry draw later cannot shift
  // every existing design's name.
  const name = designName(rnd, arch);

  const w = Math.min(MAX_ENVELOPE_M, lattice(rnd, arch.width[0], arch.width[1], ENVELOPE_STEP));
  const h = Math.min(MAX_ENVELOPE_M, lattice(rnd, arch.depth[0], arch.depth[1], ENVELOPE_STEP));
  const cells = tileEnvelope(rnd, w, h, arch.rooms);
  const variant = pick(rnd, arch.shape);
  const outline = cells.length === 1 ? envelopeOutline(rnd, w, h, variant) : undefined;
  const shell = buildShell(rnd, cells, arch, outline);

  // The seat sits at the CENTRE of its cell, deliberately. Deriving it from the
  // sofa->TV vector was measured and made things much worse (36/63 cinema locks
  // against 59/63): `scoreSlot`'s "sofa faces the TV at ~2.6 m" rule is
  // satisfied by a CORNER arrangement, so stepping from the sofa toward the TV
  // walks you into the TV. Leave the seat in the open and rotate the pair.
  const primaryCell = pickSeatCell(cells, arch.rooms.findIndex((r) => r.seat === 'primary'), arch);
  const seat: Vec2 = { x: primaryCell.x + primaryCell.w / 2, y: primaryCell.y + primaryCell.h / 2 };

  // Seats are built through the PUBLIC helpers only. Writing `scene.listener`
  // directly is the S2 trap: it desynchronises the tracer from the verdict, and
  // the mirror invariant is what every engine read-site depends on.
  let scene: Scene = blankScene();
  scene = updateActiveListener(scene, { pos: seat, z: DEFAULT_LISTENER_Z });
  scene = renameListener(scene, activeListener(scene).id, primaryCell.name || 'Listening spot');
  scene = { ...scene, objects: [...shell.objects], rooms: shell.rooms };

  // Furnish BEFORE placing speakers — see the module header.
  // `shell.rooms` is built as `cells.map(...)` (`shell.ts`), so it is PARALLEL
  // to the cells and the i-th id names the i-th cell's zone. That parity is
  // what lets a piece be ordered for a room and then placed in it.
  const furniture = arrangeFurniture(scene, inventoryFor(cells, shell.rooms.map((r) => r.id)));
  scene = { ...scene, objects: [...scene.objects, ...furniture.objects] };
  const skipped = furniture.skipped;

  const tv = scene.objects.find((o): o is Extract<SceneObject, { kind: 'rect' }> =>
    o.kind === 'rect' && o.role === 'tv',
  );
  const pair = findLockingPair(scene, seat, primaryCell, tv ? tv.center : null, opts.tvAnchor ?? true);
  scene = { ...scene, speakers: pair.speakers, pairs: pair.pairs };

  // A second named seat where the archetype has one — always through the
  // helpers, never by writing `scene.listener`, and `addListener` makes the new
  // seat active so control has to be handed back explicitly (as `seed.ts` does).
  const secondary = cells.find((c) => c !== primaryCell && isSeatRoom(c, arch, 'secondary'));
  if (secondary) {
    const active = scene.activeListenerId;
    scene = addListener(scene, secondary.name, {
      x: secondary.x + secondary.w / 2,
      y: secondary.y + secondary.h / 2,
    });
    if (active) scene = setActiveListener(scene, active);
  }

  return { scene, name, seed: opts.seed >>> 0, archetype: opts.archetype, locked: pair.locked, skipped };
}

function isSeatRoom(cell: Cell, arch: { rooms: Array<{ name: string; seat: string }> }, want: string): boolean {
  return arch.rooms.some((r) => r.name === cell.name && r.seat === want);
}

/** The cell holding the primary seat — the largest one bearing its name. */
function pickSeatCell(cells: Cell[], primaryIndex: number, arch: { rooms: Array<{ name: string; seat: string }> }): Cell {
  void primaryIndex;
  const named = cells.filter((c) => isSeatRoom(c, arch, 'primary'));
  const pool = named.length > 0 ? named : cells;
  return pool.reduce((best, c) => (c.w * c.h > best.w * best.h ? c : best), pool[0]);
}

/** A design from a fresh random seed — the "surprise me" path. */
export function generateRandom(archetype: ArchetypeId, tvAnchor?: boolean): GenerateResult {
  return generateDesign({ archetype, seed: randomSeed(), tvAnchor });
}
