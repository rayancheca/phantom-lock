import { describe, expect, it } from 'vitest';
import { seededApartmentScene, seededDefaultStore, initialStoreForBoot, isPristineOrigin } from '../seed';
import { apartmentScene, STORAGE_KEY, LEGACY_KEY, defaultStore } from '../scene';
import { traceScene } from '../raytrace';
import { computeAudio } from '../stereo';

/** In-memory localStorage stand-in for the pristine-gate. */
function fakeStorage(seed: Record<string, string> = {}): Pick<Storage, 'getItem'> {
  const map = new Map(Object.entries(seed));
  return { getItem: (k: string) => map.get(k) ?? null };
}

describe('seed — first-run demo pair', () => {
  it('places exactly two homepods as one stereo pair', () => {
    const scene = seededApartmentScene();
    expect(scene.speakers).toHaveLength(2);
    expect(scene.speakers.every((s) => s.model === 'homepod')).toBe(true);
    expect(scene.pairs).toHaveLength(1);
    const [a, b] = scene.pairs[0];
    const ids = new Set(scene.speakers.map((s) => s.id));
    expect(ids.has(a) && ids.has(b)).toBe(true);
  });

  it('yields a LOCKED verdict end-to-end (traceScene → computeAudio)', () => {
    const scene = seededApartmentScene();
    const trace = traceScene(scene, 360, 5);
    const audio = computeAudio(scene, trace, true); // tvAnchor default (cinema)
    expect(audio.pairs).toHaveLength(1);
    const pair = audio.pairs[0];
    // The whole point of the seed: first paint reads "Phantom center locked".
    expect(pair.locked).toBe(true);
    expect(audio.allLocked).toBe(true);
    // And neither speaker is occluded from the seat.
    expect(trace.bySpeaker.every((s) => !s.direct.blocked)).toBe(true);
  });

  it('leaves apartmentScene() itself audio-free (gallery apartment unchanged)', () => {
    const bare = apartmentScene();
    expect(bare.speakers).toHaveLength(0);
    expect(bare.pairs).toHaveLength(0);
  });

  it('keeps the bundled walls + furniture — only audio is added', () => {
    const bare = apartmentScene();
    const seeded = seededApartmentScene();
    // Ids are freshly minted per call, so compare structure, not identity.
    expect(seeded.objects.map((o) => [o.kind, o.label])).toEqual(
      bare.objects.map((o) => [o.kind, o.label]),
    );
  });
});

describe('initialStoreForBoot — pristine-origin gate', () => {
  it('seeds the demo pair on a pristine origin (no v2, no v1)', () => {
    const store = initialStoreForBoot(fakeStorage());
    expect(store.layouts).toHaveLength(1);
    expect(store.layouts[0].name).toBe('Maple Court');
    expect(store.layouts[0].scene.speakers).toHaveLength(2);
    expect(store.layouts[0].scene.pairs).toHaveLength(1);
  });

  it('does NOT seed when a v2 store exists (migration-shape: old seedless data loads unchanged)', () => {
    // An OLD Maple Court saved with zero speakers must load with zero speakers.
    const oldStore = defaultStore(); // bundled apartment, 0 speakers
    const raw = JSON.stringify({ layouts: oldStore.layouts, activeId: oldStore.activeId });
    const store = initialStoreForBoot(fakeStorage({ [STORAGE_KEY]: raw }));
    expect(store.layouts[0].scene.speakers).toHaveLength(0);
    expect(store.layouts[0].scene.pairs).toHaveLength(0);
  });

  it('does NOT seed when only a v1 legacy blob exists', () => {
    const legacy = JSON.stringify({ scene: apartmentScene() });
    const store = initialStoreForBoot(fakeStorage({ [LEGACY_KEY]: legacy }));
    // v1 present → not pristine → the legacy migration path (never the seed).
    const seeded = store.layouts.some((l) => l.scene.speakers.length > 0);
    expect(seeded).toBe(false);
  });

  it('seededDefaultStore is a single active Maple Court layout', () => {
    const store = seededDefaultStore();
    expect(store.layouts).toHaveLength(1);
    expect(store.activeId).toBe(store.layouts[0].id);
  });
});

describe('isPristineOrigin', () => {
  it('is true only when neither storage key is present', () => {
    expect(isPristineOrigin(fakeStorage())).toBe(true);
    expect(isPristineOrigin(fakeStorage({ [STORAGE_KEY]: '{}' }))).toBe(false);
    expect(isPristineOrigin(fakeStorage({ [LEGACY_KEY]: '{}' }))).toBe(false);
  });

  it('treats a throwing storage as NOT pristine (never seed over an opaque state)', () => {
    const throwing: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(isPristineOrigin(throwing)).toBe(false);
  });
});
