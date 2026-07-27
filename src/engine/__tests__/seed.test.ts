import { describe, expect, it } from 'vitest';
import {
  bedSpotScene,
  fourPodScene,
  seededApartmentScene,
  seededDefaultStore,
  initialStoreForBoot,
  isPristineOrigin,
} from '../seed';
import { apartmentScene, STORAGE_KEY, LEGACY_KEY, defaultStore, sceneListeners } from '../scene';
import type { Scene } from '../types';
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
  it('seeds the populated workspace on a pristine origin (no v2, no v1)', () => {
    const store = initialStoreForBoot(fakeStorage());
    // S20 widened this from one layout to a populated workspace. The assertion is
    // EXTENDED, not relaxed: the ACTIVE layout is still the locked couch pair, so
    // the first paint still reads a live verdict.
    expect(store.layouts).toHaveLength(6);
    expect(store.projects.map((p) => p.name)).toEqual(['Maple Court', 'Sketches']);
    const active = store.layouts.find((l) => l.id === store.activeId)!;
    expect(active.name).toBe('Couch — stereo pair');
    expect(active.scene.speakers).toHaveLength(2);
    expect(active.scene.pairs).toHaveLength(1);
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

  it('seededDefaultStore actives the locked couch layout', () => {
    const store = seededDefaultStore();
    expect(store.layouts).toHaveLength(6);
    expect(store.activeId).toBe(store.layouts[0].id);
    expect(store.layouts[0].name).toBe('Couch — stereo pair');
  });
});

describe('the seeded workspace — folders and variants', () => {
  const store = seededDefaultStore();
  const lockedPairs = (scene: Scene): number => {
    const audio = computeAudio(scene, traceScene(scene, 360, 5), true);
    return audio.pairs.filter((p) => p.locked).length;
  };

  it('spreads six designs over two real folders', () => {
    expect(store.projects).toHaveLength(2);
    const ids = new Set(store.projects.map((p) => p.id));
    for (const l of store.layouts) expect(ids.has(l.projectId)).toBe(true);
    const [maple, sketches] = store.projects;
    expect(store.layouts.filter((l) => l.projectId === maple.id)).toHaveLength(4);
    expect(store.layouts.filter((l) => l.projectId === sketches.id)).toHaveLength(2);
  });

  it('gives every folder a distinct id and every layout a distinct id', () => {
    expect(new Set(store.projects.map((p) => p.id)).size).toBe(2);
    expect(new Set(store.layouts.map((l) => l.id)).size).toBe(store.layouts.length);
  });

  it('the bed variant LOCKS from the bed seat with the TV rolled over', () => {
    const scene = bedSpotScene();
    expect(scene.pairs).toHaveLength(1);
    // the TV really moved, and the active seat really is the bed
    const tv = scene.objects.find((o) => o.kind === 'rect' && o.role === 'tv');
    expect(tv).toBeTruthy();
    expect(sceneListeners(scene).map((s) => s.name)).toEqual(['Couch', 'Bed']);
    expect(scene.listener.z).toBeCloseTo(0.8, 6);
    expect(lockedPairs(scene)).toBe(1);
  });

  it('the four-pod variant carries both pairs and locks the active one', () => {
    const scene = fourPodScene();
    expect(scene.speakers).toHaveLength(4);
    expect(scene.pairs).toHaveLength(2);
    // Every speaker belongs to exactly one pair.
    const paired = scene.pairs.flat();
    expect(new Set(paired).size).toBe(4);
    expect(lockedPairs(scene)).toBeGreaterThanOrEqual(1);
  });

  it('gives the variants genuinely DIFFERENT outcomes, so compare has something to show', () => {
    const bare = store.layouts.find((l) => l.name.startsWith('Bare shell'))!;
    expect(bare.scene.speakers).toHaveLength(0);
    expect(bare.scene.pairs).toHaveLength(0);
    const couch = store.layouts[0];
    expect(lockedPairs(couch.scene)).toBe(1);
    expect(lockedPairs(bare.scene)).toBe(0);
  });

  it('the two Maple Court seat variants each carry BOTH seats, so seat-compare works', () => {
    for (const name of ['Couch — stereo pair', 'Bed — TV rolled over']) {
      const l = store.layouts.find((x) => x.name === name)!;
      expect(sceneListeners(l.scene).map((s) => s.name)).toEqual(['Couch', 'Bed']);
    }
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
