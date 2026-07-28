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
}

/** Envelope dimensions are drawn on a 0.5 m lattice. */
const ENVELOPE_STEP = 0.5;

/**
 * Furniture for a set of cells, derived per ROOM and summed.
 *
 * Not `suggestInventory`, which reads the bounding BOX (`arrange.ts:498`
 * multiplies the full span) and therefore over-orders on any non-rectangular
 * plan — measured: a 12x10-bbox plan with a 30 m² floor reported 51 m² and
 * asked for 11 pieces, two of which were then dropped with "No spot survives
 * the rules". The generator knows its own cell areas, so it uses them.
 */
export function inventoryFor(cells: Cell[]): ArrangeItem[] {
  const counts = new Map<string, number>();
  const want = (id: string, n: number) => {
    if (n > 0) counts.set(id, (counts.get(id) ?? 0) + n);
  };
  let bedrooms = 0;
  for (const c of cells) {
    const area = c.w * c.h;
    const name = c.name.toLowerCase();
    if (/bed|sleep|guest|master/.test(name)) {
      bedrooms++;
      want('bed', 1);
      want('wardrobe', 1);
      if (area > 12) want('bookshelf', 1);
    } else if (/kitchen/.test(name)) {
      want('counter', area > 8 ? 2 : 1);
      if (area > 10) want('dining', 1);
    } else if (/office|study|work|desk/.test(name)) {
      want('desk', 1);
      want('bookshelf', 1);
    } else {
      // Living room, TV room, loft — the social space.
      want('sofa', 1);
      want('tv', 1);
      if (area > 16) want('armchair', 1);
      if (area > 22) want('dining', 1);
      if (area > 12) want('plant', 1);
    }
  }
  if (bedrooms === 0 && cells.length === 1) want('bed', 1); // a studio still sleeps
  return [...counts].map(([presetId, count]) => ({ presetId, count }));
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
  const furniture = arrangeFurniture(scene, inventoryFor(cells));
  scene = { ...scene, objects: [...scene.objects, ...furniture.objects] };

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

  return { scene, name, seed: opts.seed >>> 0, archetype: opts.archetype, locked: pair.locked };
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
