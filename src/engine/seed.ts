/**
 * First-run demo seed — UX-4 / Session 16 (item B), extended in S20.
 *
 * A first-timer used to land on the pre-furnished Maple Court apartment with
 * ZERO speakers and an empty readout — the glowing physics that is the whole
 * point was invisible until they placed something. This module seeds the demo
 * apartment with a symmetric, locked HomePod pair so the first paint reads a LIVE
 * "Phantom center locked" verdict.
 *
 * S20 widens that from one layout to a small POPULATED WORKSPACE: two projects
 * (folders) holding six designs, so the gallery, the folder grouping and the N-up
 * compare all have something real to show on first paint — and so comparing
 * WITHIN a project (three variants of Maple Court) and ACROSS projects both work
 * immediately. The variants are deliberately different in OUTCOME, not just in
 * geometry: two lock, one has no audio at all, and the sketches are empty rooms.
 *
 * Scope discipline (per the UX overhaul: presentation-layer only):
 *   - `apartmentScene()` is left AUDIO-FREE — the gallery "Maple Court apartment"
 *     entry and every hand-built test fixture stay unchanged; this module only
 *     COMPOSES existing engine primitives. It adds no engine math and no new type.
 *   - The seed reaches the store ONLY on a pristine origin (`initialStoreForBoot`),
 *     so an existing stored layout (IDB or localStorage) is never touched, and
 *     never in `bootstrapPersistence`'s degraded catch branch (the S16 lesson —
 *     that branch also fires when real records are merely unreadable).
 *   - This file stays a LEAF: it imports `./scene`, `./projects` and `./types`, and
 *     nothing imports it back. Importing it into `scene.ts` would create
 *     `scene → seed → scene`.
 *
 * Every locking pair below is a ±30° equilateral triangle around the seat→TV axis,
 * both speakers at the same height, with clear line of sight — the exact conditions
 * `stereo.ts` gates `locked` on. The coordinates were solved in
 * `docs/sessions/S20/bench/seed-solver.mts` and are re-asserted end-to-end in
 * `__tests__/seed.test.ts` (traceScene → computeAudio → `pairs[0].locked`), so they
 * can never silently drift out of lock.
 */
import type { Layout, LayoutStore, Scene, Vec2 } from './types';
import {
  addListener,
  apartmentScene,
  blankScene,
  createId,
  loadStore,
  makeLayout,
  makeSpeaker,
  rectRoomScene,
  renameListener,
  sceneListeners,
  setActiveListener,
  updateActiveListener,
  STORAGE_KEY,
  LEGACY_KEY,
} from './scene';
import { assembleStore } from './projects';

/** Left/right HomePod positions — a ±30° equilateral pair 1.0 m from the couch
 *  seat (2.3, 3.9), straddling the seat→TV axis, in front of the TV so both
 *  sightlines to the seat stay clear. Verified to `locked` in the seed test. */
const SEED_SPEAKER_L: Vec2 = { x: 1.316, y: 3.72 };
const SEED_SPEAKER_R: Vec2 = { x: 1.964, y: 2.958 };

/** On the bed, lying down. */
const BED_SEAT: Vec2 = { x: 4.35, y: 4.9 };
const BED_SEAT_Z = 0.8;
/** Where the rolling TV stand ends up when it is wheeled over to the bed — the
 *  owner's real setup (couch spot ↔ bed spot). */
const BED_TV: Vec2 = { x: 3.55, y: 3.35 };
/** The ±30° pair for the bed seat at r = 1.1 m around the seat→BED_TV axis. */
const BED_SPEAKER_L: Vec2 = { x: 3.424, y: 4.306 };
const BED_SPEAKER_R: Vec2 = { x: 4.402, y: 3.801 };

/** Add one homepod pair to a scene, appending to whatever speakers it already has. */
function withPair(scene: Scene, l: Vec2, r: Vec2): Scene {
  const a = makeSpeaker(l, scene);
  const b = makeSpeaker(r, { ...scene, speakers: [...scene.speakers, a] });
  return {
    ...scene,
    speakers: [...scene.speakers, a, b],
    pairs: [...scene.pairs, [a.id, b.id]],
  };
}

/** Both named seats — Couch and Bed — with `active` made the active one. */
function withBothSeats(scene: Scene, active: 'couch' | 'bed'): Scene {
  const withCouch = renameListener(scene, sceneListeners(scene)[0].id, 'Couch');
  // addListener makes the new seat active and inherits the source seat's height,
  // so drop to lying-down height afterwards through the seat helper.
  const withBed = updateActiveListener(addListener(withCouch, 'Bed', BED_SEAT), { z: BED_SEAT_Z });
  const seats = sceneListeners(withBed);
  const target = seats.find((s) => s.name === (active === 'couch' ? 'Couch' : 'Bed'))!;
  return setActiveListener(withBed, target.id);
}

/** The Maple Court demo scene WITH the seeded locked stereo pair at the couch. */
export function seededApartmentScene(): Scene {
  const base = apartmentScene();
  const a = makeSpeaker(SEED_SPEAKER_L, base, 'homepod'); // label "A"
  const b = makeSpeaker(SEED_SPEAKER_R, { ...base, speakers: [a] }, 'homepod'); // label "B"
  return {
    ...base,
    speakers: [a, b],
    pairs: [[a.id, b.id]],
  };
}

/** Variant: the TV rolled over to the bed, with its own locked pair. */
export function bedSpotScene(): Scene {
  const base = apartmentScene();
  const rolled: Scene = {
    ...base,
    objects: base.objects.map((o) =>
      o.kind === 'rect' && o.role === 'tv' ? { ...o, center: BED_TV } : o,
    ),
  };
  return withPair(withBothSeats(rolled, 'bed'), BED_SPEAKER_L, BED_SPEAKER_R);
}

/** Variant: all four HomePods — the couch pair and the bed pair at once. The
 *  owner owns exactly four, so this is the "everything placed" reference. */
export function fourPodScene(): Scene {
  const withCouchPair = withPair(withBothSeats(apartmentScene(), 'couch'), SEED_SPEAKER_L, SEED_SPEAKER_R);
  return withPair(withCouchPair, BED_SPEAKER_L, BED_SPEAKER_R);
}

/**
 * The fresh-origin store: two folders, six designs, a live locked verdict on the
 * active one. `activeId` MUST stay the locked couch layout so the first paint
 * reads a real verdict rather than an empty readout.
 */
export function seededDefaultStore(): LayoutStore {
  const maple = { id: createId('project'), name: 'Maple Court', createdAt: Date.now() };
  const sketches = { id: createId('project'), name: 'Sketches', createdAt: Date.now() };

  const couch = makeLayout(
    'Couch — stereo pair',
    withBothSeats(seededApartmentScene(), 'couch'),
    undefined,
    maple.id,
  );
  const layouts: Layout[] = [
    couch,
    makeLayout('Bed — TV rolled over', bedSpotScene(), undefined, maple.id),
    makeLayout('Four pods — couch + bed', fourPodScene(), undefined, maple.id),
    makeLayout('Bare shell — no audio yet', apartmentScene(), undefined, maple.id),
    makeLayout('Room 5×4', rectRoomScene(5, 4), undefined, sketches.id),
    makeLayout('Empty layout', blankScene(), undefined, sketches.id),
  ];
  return assembleStore([maple, sketches], layouts, couch.id);
}

/**
 * A truly PRISTINE origin — never a Phantom Lock user before (no `phantom-lock:v2`
 * and no `phantom-lock:v1` in localStorage). Throw-proof: a storage that rejects
 * reads is treated as NOT pristine (so we never seed over a state we can't inspect).
 * Used both to gate the seed and (with the boot's `firstRun`) the welcome.
 */
export function isPristineOrigin(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(STORAGE_KEY) == null && storage.getItem(LEGACY_KEY) == null;
  } catch {
    return false;
  }
}

/**
 * The store to boot with. On a pristine origin it returns the seeded workspace;
 * otherwise it defers to the normal `loadStore` migration path so real saved data
 * (or a localStorage→IDB migration) is never reshaped.
 *
 * This is the ONLY seam that injects the demo, and it is called by
 * `bootstrapPersistence` exclusively on the confirmed happy-path first run — a
 * returning IDB user short-circuits before it, so a stored layout can never gain
 * speakers or folders.
 */
export function initialStoreForBoot(
  storage: Pick<Storage, 'getItem'>,
  onProjectNotice?: (reason: string) => void,
): LayoutStore {
  return isPristineOrigin(storage) ? seededDefaultStore() : loadStore(storage, onProjectNotice);
}
