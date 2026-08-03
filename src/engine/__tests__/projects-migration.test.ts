import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  bootstrapPersistence,
  buildExportBundle,
  loadFromIDB,
  openDB,
  saveLayout,
  saveMeta,
  __resetConnectionForTests,
} from '../db';
import { apartmentScene, blankScene, defaultStore, loadStore, makeLayout, STORAGE_KEY } from '../scene';
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  assembleStore,
  findOrCreateProject,
} from '../projects';
import { sanitizeLayout } from '../scene';
import type { LayoutStore } from '../types';

/**
 * S20 — the projects migration, proven by SEEDING THE OLD SHAPE and asserting what
 * comes back, not by round-tripping a fresh write.
 *
 * Two independent read paths carry every returning user:
 *   - IndexedDB: `layouts` records with no `projectId`, a `meta` row with no
 *     `projects` key.
 *   - localStorage: a `phantom-lock:v2` blob whose store literal is `{layouts,
 *     activeId}` and nothing else.
 * Both must load with EVERY layout intact, grouped under one sensible default
 * folder, and neither may ever drop a record because a project pointer is missing.
 */

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

/** Write PRE-S20 records by hand: no `projectId`, no `projects`. */
async function seedOldShapeIDB(names: string[], activeIndex = 0): Promise<string[]> {
  const db = await openDB();
  const ids = names.map((_, i) => `old-layout-${i}`);
  const tx = db.transaction(['layouts', 'meta'], 'readwrite');
  names.forEach((name, i) => {
    tx.objectStore('layouts').put({
      id: ids[i],
      name,
      scene: i === 0 ? apartmentScene() : blankScene(),
      settings: defaultStore().layouts[0].settings,
      updatedAt: 1_700_000_000_000 + i,
      // NO projectId — this is the whole point of the fixture.
    });
  });
  tx.objectStore('meta').put({
    key: 'root',
    activeId: ids[activeIndex],
    schemaVersion: 1,
    updatedAt: 1_700_000_000_000,
    migratedFromLocalStorage: true,
    // NO projects.
  });
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  return ids;
}

describe('OLD-SHAPE IndexedDB records upgrade on read', () => {
  it('keeps every layout and files them all under one default folder', async () => {
    const ids = await seedOldShapeIDB(['Maple Court', 'Studio', 'Cabin'], 1);
    const store = await loadFromIDB();
    expect(store).not.toBeNull();
    expect(store!.layouts).toHaveLength(3);
    expect(store!.layouts.map((l) => l.name)).toEqual(['Maple Court', 'Studio', 'Cabin']);
    // ids survive verbatim — undo buckets and IDB keys are keyed on them
    expect(store!.layouts.map((l) => l.id)).toEqual(ids);
    // exactly one folder, and every layout resolves into it
    expect(store!.projects).toHaveLength(1);
    expect(store!.projects[0].id).toBe(DEFAULT_PROJECT_ID);
    expect(store!.projects[0].name).toBe(DEFAULT_PROJECT_NAME);
    for (const l of store!.layouts) expect(l.projectId).toBe(DEFAULT_PROJECT_ID);
  });

  it('preserves the stored activeId across the upgrade', async () => {
    const ids = await seedOldShapeIDB(['A', 'B', 'C'], 2);
    const store = await loadFromIDB();
    expect(store!.activeId).toBe(ids[2]);
  });

  it('does not rewrite the layouts’ updatedAt (the load path never mangles)', async () => {
    await seedOldShapeIDB(['A', 'B']);
    const store = await loadFromIDB();
    expect(store!.layouts.map((l) => l.updatedAt)).toEqual([1_700_000_000_000, 1_700_000_000_001]);
  });

  it('is idempotent — a second read of the same old records gives the same grouping', async () => {
    await seedOldShapeIDB(['A', 'B']);
    const first = await loadFromIDB();
    const second = await loadFromIDB();
    // Identity and membership are what must be stable — they are what the gallery
    // renders and what `projectId` points at. `createdAt` is deliberately the wall
    // clock at mint ("this folder was created when the migration ran"), so two
    // reads in one session differ by a millisecond; only the first value is ever
    // persisted, so it stabilises on the very next autosave. Asserting it here
    // would be asserting the clock, not the migration.
    expect(second!.projects.map((p) => [p.id, p.name])).toEqual(
      first!.projects.map((p) => [p.id, p.name]),
    );
    expect(second!.layouts.map((l) => l.projectId)).toEqual(first!.layouts.map((l) => l.projectId));
  });

  it('a HOSTILE meta.projects still loads every layout — never a total loss', async () => {
    const ids = await seedOldShapeIDB(['A', 'B']);
    const db = await openDB();
    for (const projects of ['not-an-array', 42, [null, null], [{ id: {} }], {}]) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({
        key: 'root',
        activeId: ids[0],
        projects,
        schemaVersion: 1,
        updatedAt: 1,
        migratedFromLocalStorage: true,
      });
      await new Promise<void>((res) => {
        tx.oncomplete = () => res();
      });
      const store = await loadFromIDB();
      expect(store!.layouts).toHaveLength(2);
      expect(store!.projects.length).toBeGreaterThanOrEqual(1);
      for (const l of store!.layouts) {
        expect(store!.projects.some((p) => p.id === l.projectId)).toBe(true);
      }
    }
  });

  it('REPORTS folder-level loss instead of silently collapsing the filing', async () => {
    const ids = await seedOldShapeIDB(['A', 'B']);
    const db = await openDB();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({
      key: 'root',
      activeId: ids[0],
      projects: [null, null, null], // three folders that cannot be read
      schemaVersion: 1,
      updatedAt: 1,
      migratedFromLocalStorage: true,
    });
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    const dropped: string[] = [];
    const notices: string[] = [];
    const store = await loadFromIDB(
      (id) => dropped.push(id),
      (r) => notices.push(r),
    );
    expect(store!.layouts).toHaveLength(2);
    // The user is TOLD their filing was lost — silence here is indistinguishable
    // from the app having eaten their organisation.
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.join(' ')).toMatch(/folder/i);
    // …and CRUCIALLY not through the drop channel. `onDrop` means "a saved layout
    // could not be reconstructed", which the App turns into a "your work may be
    // gone, export now" warning. No layout was lost here; routing a folder repair
    // through it would raise that alarm on EVERY boot, since the repair is
    // deliberately never persisted and therefore recurs.
    expect(dropped).toEqual([]);
  });

  it('a re-homed orphan is a NOTICE, never a dropped-layout alarm', async () => {
    const db = await openDB();
    const tx = db.transaction(['layouts', 'meta'], 'readwrite');
    tx.objectStore('layouts').put({
      id: 'orphan-x',
      name: 'Orphan',
      scene: blankScene(),
      settings: defaultStore().layouts[0].settings,
      updatedAt: 5,
      projectId: 'ghost-folder',
    });
    tx.objectStore('meta').put({
      key: 'root',
      activeId: 'orphan-x',
      projects: [{ id: 'p-live', name: 'Live', createdAt: 1 }],
      schemaVersion: 1,
      updatedAt: 1,
      migratedFromLocalStorage: true,
    });
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    const dropped: string[] = [];
    const notices: string[] = [];
    const store = await loadFromIDB(
      (id) => dropped.push(id),
      (r) => notices.push(r),
    );
    expect(store!.layouts).toHaveLength(1);
    expect(dropped).toEqual([]);
    expect(notices.join(' ')).toMatch(/no folder/i);
  });

  it('an old record whose projectId names a dead folder is RE-HOMED, never dropped', async () => {
    const db = await openDB();
    const tx = db.transaction(['layouts', 'meta'], 'readwrite');
    tx.objectStore('layouts').put({
      id: 'orphan-1',
      name: 'Orphan',
      scene: blankScene(),
      settings: defaultStore().layouts[0].settings,
      updatedAt: 5,
      projectId: 'a-folder-that-was-deleted',
    });
    tx.objectStore('meta').put({
      key: 'root',
      activeId: 'orphan-1',
      projects: [{ id: 'p-live', name: 'Live', createdAt: 1 }],
      schemaVersion: 1,
      updatedAt: 1,
      migratedFromLocalStorage: true,
    });
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
    });
    const store = await loadFromIDB();
    expect(store!.layouts).toHaveLength(1);
    expect(store!.layouts[0].projectId).toBe('p-live');
  });

  it('round-trips projects once they exist (and saveMeta does not erase them)', async () => {
    const base = defaultStore();
    const store: LayoutStore = {
      ...base,
      projects: [
        { id: 'p1', name: 'Home', createdAt: 10, order: Number.POSITIVE_INFINITY },
        { id: 'p2', name: 'Studio', createdAt: 20, order: Number.POSITIVE_INFINITY },
      ],
      layouts: [
        { ...base.layouts[0], projectId: 'p2' },
        makeLayout('Second', blankScene(), undefined, 'p1'),
      ],
    };
    for (const l of store.layouts) await saveLayout(l);
    await saveMeta(store.activeId, store.projects);
    // A SECOND meta write with the same projects (the autosave loop runs this on
    // every cycle) must not lose them.
    await saveMeta(store.activeId, store.projects);

    const back = await loadFromIDB();
    expect(back!.projects.map((p) => p.name)).toEqual(['Home', 'Studio']);
    expect(back!.layouts.find((l) => l.name === 'Second')!.projectId).toBe('p1');
    expect(back!.layouts.find((l) => l.id === store.layouts[0].id)!.projectId).toBe('p2');
  });
});

describe('OLD-SHAPE localStorage blob upgrades on read', () => {
  const oldBlob = (): string => {
    const s = defaultStore();
    // The pre-S20 literal: exactly {layouts, activeId}, and each layout without a
    // projectId — strip them so this really is the old shape.
    return JSON.stringify({
      layouts: s.layouts.map(({ projectId: _p, ...rest }) => rest),
      activeId: s.activeId,
    });
  };

  it('keeps the layout and files it under the default folder', () => {
    const store = loadStore({ getItem: (k) => (k === STORAGE_KEY ? oldBlob() : null) });
    expect(store.layouts).toHaveLength(1);
    expect(store.projects).toHaveLength(1);
    expect(store.projects[0].id).toBe(DEFAULT_PROJECT_ID);
    expect(store.layouts[0].projectId).toBe(DEFAULT_PROJECT_ID);
    expect(store.activeId).toBe(store.layouts[0].id);
  });

  it('round-trips projects through the localStorage path (degraded mode writes the whole store)', () => {
    const withProjects: LayoutStore = {
      ...defaultStore(),
      projects: [{ id: 'p-alpha', name: 'Alpha', createdAt: 3, order: 0 }],
    };
    const store2: LayoutStore = {
      ...withProjects,
      layouts: withProjects.layouts.map((l) => ({ ...l, projectId: 'p-alpha' })),
    };
    const raw = JSON.stringify(store2); // exactly what usePersistence writes
    const back = loadStore({ getItem: (k) => (k === STORAGE_KEY ? raw : null) });
    expect(back.projects.map((p) => p.name)).toEqual(['Alpha']);
    expect(back.layouts[0].projectId).toBe('p-alpha');
  });

  it('a corrupt projects field never costs the user a layout', () => {
    for (const projects of ['x', 3, [null], { a: 1 }]) {
      const s = defaultStore();
      const raw = JSON.stringify({ layouts: s.layouts, activeId: s.activeId, projects });
      const back = loadStore({ getItem: (k) => (k === STORAGE_KEY ? raw : null) });
      expect(back.layouts).toHaveLength(1);
      expect(back.projects.length).toBeGreaterThanOrEqual(1);
      expect(back.projects.some((p) => p.id === back.layouts[0].projectId)).toBe(true);
    }
  });
});

describe('bootstrapPersistence on OLD-SHAPE data', () => {
  it('reads existing records as a RETURNING user (never firstRun, never re-seeded)', async () => {
    await seedOldShapeIDB(['Their real layout', 'Another']);
    const boot = await bootstrapPersistence(
      () => {
        throw new Error('the seeding loader must NOT run for a returning user');
      },
      () => defaultStore(),
    );
    expect(boot.mode).toBe('idb');
    expect(boot.firstRun).toBe(false);
    expect(boot.store.layouts.map((l) => l.name)).toEqual(['Their real layout', 'Another']);
    expect(boot.store.projects).toHaveLength(1);
  });
});

describe('the export bundle carries the folder, by NAME', () => {
  it('names each layout’s project so it survives a trip to another store', () => {
    const base = defaultStore();
    // A DISTINCTIVE project id. `createId` appends five random base-36
    // characters, so a substring search for a two-character id like "p1" hits a
    // scene id by chance roughly 1 in 1296 times per id — with ~25 ids in the
    // bundle that is a ~2 % flake, and it was measured at 1 failure in 40 runs
    // on `main` (S33). A test that fails 2 % of the time for a reason unrelated
    // to what it checks is worse than no test: it trains you to re-run the gate.
    const projectId = 'project-id-that-appears-nowhere-else';
    const store: LayoutStore = {
      ...base,
      projects: [{ id: projectId, name: 'Maple Court', createdAt: 1, order: 0 }],
      layouts: [{ ...base.layouts[0], projectId }],
    };
    const bundle = buildExportBundle(store);
    expect(bundle.version).toBe(2);
    expect(bundle.layouts[0].project).toBe('Maple Court');
    // ids are deliberately NOT exported — they are meaningless in another store
    expect(JSON.stringify(bundle)).not.toContain(projectId);
    // …and the structured check that does not depend on a string search at all.
    expect(Object.keys(bundle.layouts[0])).not.toContain('projectId');
  });
});


describe('a folder ROUND-TRIPS through the single-layout export/import path', () => {
  /** Exactly what `useLayoutStore.exportLayout` writes to the file. */
  const exported = (l: { name: string; scene: unknown; settings: unknown }, project: string) =>
    JSON.parse(JSON.stringify({ ...l, project }));

  /** Exactly what `useLayoutActions.importLayout` does with it. */
  function importInto(store: LayoutStore, file: Record<string, unknown>): LayoutStore {
    const sanitized = sanitizeLayout(file)!;
    const wanted = typeof file.project === 'string' ? file.project : '';
    const { store: withFolder, projectId } = findOrCreateProject(
      store,
      wanted,
      withFolderFallback(store),
    );
    return {
      ...withFolder,
      layouts: [...withFolder.layouts, { ...sanitized, id: 'imported', projectId }],
      activeId: 'imported',
    };
  }
  const withFolderFallback = (s: LayoutStore): string => s.projects[0].id;

  it('lands in the SAME folder when one of that name already exists', () => {
    const base = assembleStore(
      [
        { id: 'p1', name: 'Maple Court', createdAt: 1, order: 0 },
        { id: 'p2', name: 'Sketches', createdAt: 2, order: 0 },
      ],
      [makeLayout('Existing', blankScene(), undefined, 'p1')],
      undefined,
    );
    const file = exported(
      { name: 'Sent to me', scene: blankScene(), settings: base.layouts[0].settings },
      'Sketches',
    );
    const after = importInto(base, file);
    expect(after.projects).toHaveLength(2); // no duplicate folder minted
    expect(after.layouts.find((l) => l.id === 'imported')!.projectId).toBe('p2');
  });

  it('CREATES the folder when the receiving store has never heard of it', () => {
    const base = assembleStore(
      [{ id: 'p1', name: 'Mine', createdAt: 1, order: 0 }],
      [makeLayout('Existing', blankScene(), undefined, 'p1')],
      undefined,
    );
    const file = exported(
      { name: 'From a friend', scene: blankScene(), settings: base.layouts[0].settings },
      'Their studio',
    );
    const after = importInto(base, file);
    expect(after.projects.map((p) => p.name)).toEqual(['Mine', 'Their studio']);
    const landed = after.layouts.find((l) => l.id === 'imported')!;
    expect(landed.projectId).toBe(after.projects[1].id);
  });

  it('ignores a foreign projectId — no phantom folder, no dangling pointer', () => {
    const base = assembleStore(
      [{ id: 'p1', name: 'Mine', createdAt: 1, order: 0 }],
      [makeLayout('Existing', blankScene(), undefined, 'p1')],
      undefined,
    );
    const file = {
      ...exported({ name: 'X', scene: blankScene(), settings: base.layouts[0].settings }, ''),
      projectId: 'a-project-id-from-someone-elses-store',
    };
    const after = importInto(base, file);
    expect(after.projects).toHaveLength(1);
    expect(after.layouts.find((l) => l.id === 'imported')!.projectId).toBe('p1');
    // …and the whole store still satisfies the invariant
    const ids = new Set(after.projects.map((p) => p.id));
    for (const l of after.layouts) expect(ids.has(l.projectId)).toBe(true);
  });

  it('a PRE-S20 file (no project key at all) still imports, into the current folder', () => {
    const base = assembleStore(
      [{ id: 'p1', name: 'Mine', createdAt: 1, order: 0 }],
      [makeLayout('Existing', blankScene(), undefined, 'p1')],
      undefined,
    );
    const old = { name: 'Old export', scene: blankScene(), settings: base.layouts[0].settings };
    const after = importInto(base, JSON.parse(JSON.stringify(old)));
    expect(after.layouts).toHaveLength(2);
    expect(after.layouts.find((l) => l.id === 'imported')!.projectId).toBe('p1');
  });
});
