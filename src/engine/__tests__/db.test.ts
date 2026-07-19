import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapPersistence,
  buildExportBundle,
  DB_NAME,
  blobToDataUrl,
  dataUrlToBlob,
  loadFromIDB,
  migrateFromLocalStorage,
  openDB,
  removeLayout,
  saveLayout,
  saveMeta,
  __resetConnectionForTests,
} from '../db';
import { apartmentScene, blankScene, makeLayout } from '../scene';
import type { LayoutStore, Underlay } from '../types';

// 1×1 transparent PNG — a valid, tiny image data URL.
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function underlay(src: string): Underlay {
  return { src, wPx: 100, hPx: 80, center: { x: 4, y: 3 }, scale: 0.04, rotation: 0, opacity: 0.55 };
}

function reset(): Promise<void> {
  __resetConnectionForTests();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

beforeEach(reset);

describe('image helpers', () => {
  it('round-trips a data URL through Blob and back', async () => {
    const blob = dataUrlToBlob(PNG_1PX);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
    const back = await blobToDataUrl(blob);
    expect(back).toBe(PNG_1PX);
  });
});

describe('layout persistence', () => {
  it('saves and loads a layout with no underlay', async () => {
    const layout = makeLayout('Test', blankScene());
    await saveLayout(layout);
    await saveMeta(layout.id);

    const loaded = await loadFromIDB();
    expect(loaded).not.toBeNull();
    expect(loaded!.layouts).toHaveLength(1);
    expect(loaded!.layouts[0].name).toBe('Test');
    expect(loaded!.layouts[0].id).toBe(layout.id);
    expect(loaded!.activeId).toBe(layout.id);
    expect(loaded!.layouts[0].scene.underlay ?? null).toBeNull();
  });

  it('stores the underlay image as a Blob and restores it as a data URL', async () => {
    const scene = { ...blankScene(), underlay: underlay(PNG_1PX) };
    const layout = makeLayout('With photo', scene);
    await saveLayout(layout);
    await saveMeta(layout.id);

    const loaded = await loadFromIDB();
    const back = loaded!.layouts[0].scene.underlay;
    expect(back).toBeTruthy();
    expect(back!.src).toBe(PNG_1PX);
    expect(back!.wPx).toBe(100);
    expect(back!.opacity).toBeCloseTo(0.55);
  });

  it('does not rewrite the image blob when writeImage is false, but keeps it', async () => {
    const scene = { ...blankScene(), underlay: underlay(PNG_1PX) };
    const layout = makeLayout('With photo', scene);
    await saveLayout(layout, true);
    await saveMeta(layout.id);

    // Geometry-only edit: move the listener, save without rewriting the image.
    const moved = { ...layout, scene: { ...scene, listener: { pos: { x: 1, y: 1 }, z: 1.2 } } };
    await saveLayout(moved, false);

    const loaded = await loadFromIDB();
    expect(loaded!.layouts[0].scene.listener.pos.x).toBe(1);
    // The image survived even though we didn't rewrite it.
    expect(loaded!.layouts[0].scene.underlay?.src).toBe(PNG_1PX);
  });

  it('keeps a layout whose underlay blob is missing (per-record isolation)', async () => {
    const layout = makeLayout('Lost photo', { ...blankScene(), underlay: underlay(PNG_1PX) });
    await saveLayout(layout, true);
    await saveMeta(layout.id);
    // Simulate an evicted/lost image blob: delete just the underlays row.
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('underlays', 'readwrite');
      tx.objectStore('underlays').delete(layout.id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    const loaded = await loadFromIDB();
    expect(loaded).not.toBeNull();
    expect(loaded!.layouts[0].name).toBe('Lost photo');
    // The layout survives; only the unreadable photo is dropped.
    expect(loaded!.layouts[0].scene.underlay ?? null).toBeNull();
  });

  it('does not throw when the underlay data URL is malformed; keeps the geometry', async () => {
    const scene = { ...blankScene(), underlay: underlay('data:image/jpeg;base64,not valid base64!!') };
    const layout = makeLayout('Bad img', scene);
    await expect(saveLayout(layout, true)).resolves.toBeUndefined();
    await saveMeta(layout.id);
    const loaded = await loadFromIDB();
    expect(loaded!.layouts[0].name).toBe('Bad img');
    expect(loaded!.layouts[0].scene.underlay ?? null).toBeNull();
  });

  it('removes a layout and its underlay', async () => {
    const a = makeLayout('A', blankScene());
    const b = makeLayout('B', { ...blankScene(), underlay: underlay(PNG_1PX) });
    await saveLayout(a);
    await saveLayout(b);
    await saveMeta(a.id);

    await removeLayout(b.id);
    const loaded = await loadFromIDB();
    expect(loaded!.layouts.map((l) => l.name)).toEqual(['A']);
  });
});

describe('migration', () => {
  it('migrates a localStorage-shaped store into IDB idempotently', async () => {
    const store: LayoutStore = {
      layouts: [
        makeLayout('Maple Court', apartmentScene()),
        makeLayout('Photo', { ...blankScene(), underlay: underlay(PNG_1PX) }),
      ],
      activeId: '',
    };
    store.activeId = store.layouts[1].id;

    await migrateFromLocalStorage(store);
    const loaded = await loadFromIDB();
    expect(loaded!.layouts).toHaveLength(2);
    expect(loaded!.activeId).toBe(store.layouts[1].id);
    expect(loaded!.layouts.find((l) => l.name === 'Photo')!.scene.underlay?.src).toBe(PNG_1PX);
  });
});

describe('bootstrapPersistence', () => {
  it('migrates the legacy store on first run, then loads from IDB on the second', async () => {
    let legacyCalls = 0;
    const legacy = (): LayoutStore => {
      legacyCalls += 1;
      return { layouts: [makeLayout('Legacy', apartmentScene())], activeId: 'x' };
    };

    const first = await bootstrapPersistence(legacy);
    expect(first.mode).toBe('idb');
    expect(first.store.layouts[0].name).toBe('Legacy');
    expect(legacyCalls).toBe(1);

    __resetConnectionForTests();
    const second = await bootstrapPersistence(legacy);
    expect(second.mode).toBe('idb');
    expect(second.store.layouts[0].name).toBe('Legacy');
    // The legacy loader must NOT be consulted again once migrated.
    expect(legacyCalls).toBe(1);
  });
});

describe('export bundle', () => {
  it('builds a self-contained bundle of every layout', () => {
    const store: LayoutStore = {
      layouts: [makeLayout('One', blankScene()), makeLayout('Two', apartmentScene())],
      activeId: 'x',
    };
    const bundle = buildExportBundle(store);
    expect(bundle.app).toBe('phantom-lock');
    expect(bundle.kind).toBe('layout-bundle');
    expect(bundle.layouts.map((l) => l.name)).toEqual(['One', 'Two']);
    expect(bundle.layouts[0].scene).toBeTruthy();
  });
});
