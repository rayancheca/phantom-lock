/**
 * First-run demo seed — UX-4 / Session 16 (item B).
 *
 * A first-timer used to land on the pre-furnished Maple Court apartment with
 * ZERO speakers and an empty readout — the glowing physics that is the whole
 * point was invisible until they placed something. This module seeds the demo
 * apartment with ONE symmetric, locked HomePod pair at the couch seat so the
 * first paint reads a LIVE "Phantom center locked" verdict.
 *
 * Scope discipline (per the UX overhaul: presentation-layer only):
 *   - `apartmentScene()` is left AUDIO-FREE — the gallery "Maple Court apartment"
 *     entry and every hand-built test fixture stay unchanged; this module only
 *     COMPOSES existing engine primitives (`makeSpeaker`, the scene shape). It
 *     adds no engine math, no new type, no persistence-schema change.
 *   - The seed reaches the store ONLY on a pristine origin (`initialStoreForBoot`
 *     below), so an existing stored layout (IDB or localStorage) is never touched.
 *
 * The pair geometry is a ±30° equilateral triangle around the seat→TV axis, both
 * speakers at the same height, in front of the TV with clear line of sight — the
 * exact conditions `stereo.ts` gates `locked` on (equilateral + arrival-symmetric
 * + TV-aligned + LOS-clear + same model). It is asserted end-to-end in
 * `__tests__/seed.test.ts` (traceScene → computeAudio → `pairs[0].locked`), so the
 * coordinates can never silently drift out of lock.
 */
import type { LayoutStore, Scene, Vec2 } from './types';
import {
  apartmentScene,
  loadStore,
  makeLayout,
  makeSpeaker,
  STORAGE_KEY,
  LEGACY_KEY,
} from './scene';

/** Left/right HomePod positions — a ±30° equilateral pair 1.0 m from the couch
 *  seat (2.3, 3.9), straddling the seat→TV axis, in front of the TV so both
 *  sightlines to the seat stay clear. Verified to `locked` in the seed test. */
const SEED_SPEAKER_L: Vec2 = { x: 1.316, y: 3.72 };
const SEED_SPEAKER_R: Vec2 = { x: 1.964, y: 2.958 };

/** The Maple Court demo scene WITH the seeded locked stereo pair. */
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

/** The fresh-origin store: Maple Court with a live locked verdict on boot. */
export function seededDefaultStore(): LayoutStore {
  const home = makeLayout('Maple Court', seededApartmentScene());
  return { layouts: [home], activeId: home.id };
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
 * The store to boot with. On a pristine origin it returns the seeded demo;
 * otherwise it defers to the normal `loadStore` migration path so real saved data
 * (or a localStorage→IDB migration) is never reshaped.
 *
 * This is the ONLY seam that injects the demo pair, and it is called by
 * `bootstrapPersistence` exclusively on first run / IDB-unavailable — a returning
 * IDB user short-circuits before it, so a stored layout can never gain speakers.
 */
export function initialStoreForBoot(storage: Pick<Storage, 'getItem'>): LayoutStore {
  return isPristineOrigin(storage) ? seededDefaultStore() : loadStore(storage);
}
