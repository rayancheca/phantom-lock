import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DB_NAME,
  loadFromIDB,
  openDB,
  saveLayout,
  saveMeta,
  __resetConnectionForTests,
} from '../db';
import { blankScene, defaultStore, makeLayout, sanitizeLayout } from '../scene';
import {
  addProjectAt,
  assembleStore,
  dissolveEmptyProject,
  homeItems,
  homeProject,
  isHomeProject,
  layoutsInProject,
  mergeIntoNewProject,
  moveLayoutToProject,
  moveProjectToSlot,
  normalizeOrder,
  removeProject,
  MAX_PROJECTS,
} from '../projects';
import type { Layout, LayoutStore, Project } from '../types';

/**
 * S29 — the persisted arrangement.
 *
 * Display order before this existed was `getAll()` KEY order, i.e. lexicographic
 * by layout id, so any arrangement was silently discarded. Everything here is
 * about the coordinate that replaced it.
 *
 * The cases that matter are the ones a prior design pass MEASURED as broken in
 * the draft, and each of those carries a NEGATIVE CONTROL — the other wrong
 * answer — because the S28 lesson is that a suite which only ever sees the
 * correct implementation cannot tell you the guard is load-bearing.
 */

/** UNPLACED — what a project that has never been dragged actually is. */
const P = (id: string, name = id): Project => ({
  id,
  name,
  createdAt: 1,
  order: Number.POSITIVE_INFINITY,
});
const L = (id: string, projectId: string): Layout => ({
  ...makeLayout(id, blankScene()),
  id,
  projectId,
});

const ids = (store: LayoutStore, projectId: string) =>
  layoutsInProject(store, projectId).map((l) => l.id);
const homeIds = (store: LayoutStore) =>
  homeItems(store).map((i) => (i.kind === 'layout' ? i.layout.id : `[${i.project.id}]`));

describe('normalizeOrder — the single writer of every slot', () => {
  it('IS THE IDENTITY on a store where nothing has been placed', () => {
    // The migration property. Every key is Infinity, so the enumeration index
    // decides, and that index is the array order handed in — which is exactly
    // today's behaviour. A pre-S29 store must not be reshuffled by upgrading.
    const raw: LayoutStore = {
      layouts: [L('a', 'p1'), L('b', 'p1'), L('c', 'p1')],
      activeId: 'a',
      projects: [P('p1')],
    };
    expect(ids(normalizeOrder(raw), 'p1')).toEqual(['a', 'b', 'c']);
    expect(normalizeOrder(raw).layouts.map((l) => l.order)).toEqual([0, 1, 2]);
  });

  it('gives every container a DENSE rank sequence 0..n-1, independently', () => {
    const st = assembleStore(
      [P('p1'), P('p2')],
      [L('a', 'p1'), L('b', 'p2'), L('c', 'p2'), L('d', 'p1')],
      undefined,
    );
    expect(layoutsInProject(st, 'p1').map((l) => l.order)).toEqual([0, 1]);
    expect(layoutsInProject(st, 'p2').map((l) => l.order)).toEqual([0, 1]);
  });

  it('is IDEMPOTENT — normalise twice is normalise once', () => {
    const once = assembleStore([P('p1'), P('p2')], [L('a', 'p1'), L('b', 'p2')], undefined);
    const twice = normalizeOrder(once);
    // Same reference: nothing moved, so the no-op rule holds and no spurious
    // undo entry or autosave write is produced.
    expect(twice).toBe(once);
  });

  it('survives every hostile order value without dropping or duplicating one', () => {
    const hostile: unknown[] = [
      NaN,
      Infinity,
      -Infinity,
      '3',
      'abc',
      null,
      undefined,
      {},
      [],
      -0,
      1e308,
      -1e308,
      true,
      Number.MAX_SAFE_INTEGER,
      0.1 + 0.2,
    ];
    for (const bad of hostile) {
      const raw: LayoutStore = {
        layouts: [
          { ...L('a', 'p1'), order: bad as number },
          { ...L('b', 'p1'), order: 1 },
          { ...L('c', 'p1'), order: bad as number },
        ],
        activeId: 'a',
        projects: [P('p1')],
      };
      const out = layoutsInProject(normalizeOrder(raw), 'p1');
      expect(out).toHaveLength(3);
      expect(new Set(out.map((l) => l.id)).size).toBe(3);
      expect(out.map((l) => l.order)).toEqual([0, 1, 2]);
      // Deterministic: the same input twice gives the same permutation.
      expect(layoutsInProject(normalizeOrder(raw), 'p1').map((l) => l.id)).toEqual(
        out.map((l) => l.id),
      );
    }
  });

  it('NaN at any position never makes the comparator itself NaN', () => {
    // `rank()` maps NaN to Infinity BEFORE the subtraction, so `a - b` is always
    // a real number. Swept because a NaN comparator corrupts a sort silently and
    // only for some array lengths.
    for (let n = 2; n <= 12; n++) {
      for (let pos = 0; pos < n; pos++) {
        const layouts = Array.from({ length: n }, (_, i) => ({
          ...L(`l${i}`, 'p1'),
          order: i === pos ? NaN : i,
        }));
        const out = layoutsInProject(
          normalizeOrder({ layouts, activeId: 'l0', projects: [P('p1')] }),
          'p1',
        );
        expect(out).toHaveLength(n);
        expect(out.map((l) => l.order)).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });

  it('does NOT rewrite updatedAt on the load path, and DOES on a mutation', () => {
    // The whole difference between a saved arrangement and a lost one. Load must
    // not mangle; a mutation must mark every moved layout dirty or
    // `usePersistence` (which diffs on updatedAt alone) never writes it.
    const raw: LayoutStore = {
      layouts: [
        { ...L('a', 'p1'), order: 5, updatedAt: 111 },
        { ...L('b', 'p1'), order: 9, updatedAt: 222 },
      ],
      activeId: 'a',
      projects: [P('p1')],
    };
    const loaded = normalizeOrder(raw, { touch: false });
    expect(loaded.layouts.map((l) => l.order)).toEqual([0, 1]);
    expect(loaded.layouts.map((l) => l.updatedAt)).toEqual([111, 222]);

    const touched = normalizeOrder(raw, { touch: true });
    expect(touched.layouts.every((l) => l.updatedAt > 1000)).toBe(true);
  });

  it('bumps updatedAt on EVERY layout whose rank moved, not only the dragged one', () => {
    // THE PARTIAL-WRITE BUG. Measured on the draft: bumping only the dragged card
    // leaves the others unwritten, and the container comes back in a third order
    // that is neither the old nor the new one.
    const base = assembleStore(
      [P('p1')],
      [L('a', 'p1'), L('b', 'p1'), L('c', 'p1')],
      undefined,
    );
    // Pinned into the past — a fixture built with `Date.now()` shares a
    // millisecond with the mutation, so the assertion would fail on correct code.
    const st: LayoutStore = {
      ...base,
      layouts: base.layouts.map((l) => ({ ...l, updatedAt: 1_700_000_000_000 })),
    };
    // Move 'c' to the front: a and b both shift down a slot.
    const after = moveLayoutToProject(st, 'c', 'p1', 0);
    expect(ids(after, 'p1')).toEqual(['c', 'a', 'b']);
    for (const l of after.layouts) {
      expect(l.updatedAt).toBeGreaterThan(1_700_000_000_000);
    }
  });
});

describe('every writer of projectId re-stamps the slot', () => {
  it('moveLayoutToProject APPENDS instead of carrying the old rank across', () => {
    // MEASURED BUG: without the re-stamp, where a design lands is decided by its
    // position in the folder it LEFT — a design that was first in its old folder
    // jumps to the FRONT of its new one, ahead of designs the user arranged.
    const st = assembleStore(
      [P('home'), P('other')],
      [L('h1', 'home'), L('h2', 'home'), L('a1', 'other'), L('a2', 'other')],
      undefined,
    );
    expect(ids(st, 'other')).toEqual(['a1', 'a2']);
    // h1 is rank 0 in its own container — the worst case for the bug.
    const moved = moveLayoutToProject(st, 'h1', 'other');
    expect(ids(moved, 'other')).toEqual(['a1', 'a2', 'h1']);
  });

  it('removeProject APPENDS the re-homed designs instead of RIFFLE-SHUFFLING', () => {
    // MEASURED BUG: two independently-arranged sequences with colliding ranks
    // interleave as A1 B1 A2 B2 A3 B3.
    const st = assembleStore(
      [P('A'), P('B')],
      [L('A1', 'A'), L('A2', 'A'), L('A3', 'A'), L('B1', 'B'), L('B2', 'B'), L('B3', 'B')],
      undefined,
    );
    expect(ids(st, 'A')).toEqual(['A1', 'A2', 'A3']);
    expect(ids(st, 'B')).toEqual(['B1', 'B2', 'B3']);
    const gone = removeProject(st, 'B');
    expect(ids(gone, 'A')).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
    // ...and specifically NOT the riffle.
    expect(ids(gone, 'A')).not.toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
  });

  it('keeps every design when a folder is removed (the owner rule, unchanged)', () => {
    const st = assembleStore([P('A'), P('B')], [L('a', 'A'), L('b', 'B')], undefined);
    const gone = removeProject(st, 'B');
    expect(gone.layouts).toHaveLength(2);
    expect(gone.layouts.every((l) => l.projectId === 'A')).toBe(true);
  });
});

describe('the HOME grid — designs and folder tiles in one coordinate space', () => {
  const build = () =>
    assembleStore(
      [P('home'), P('f1'), P('f2')],
      [L('a', 'home'), L('b', 'home'), L('x', 'f1'), L('y', 'f2')],
      undefined,
    );

  it('is projects[0], and that project is never a tile on its own grid', () => {
    const st = build();
    expect(homeProject(st).id).toBe('home');
    expect(isHomeProject(st, 'home')).toBe(true);
    expect(homeIds(st)).toEqual(['a', 'b', '[f1]', '[f2]']);
    expect(homeIds(st)).not.toContain('[home]');
  });

  it('lets a folder tile sit BETWEEN two designs — the point of the shared space', () => {
    const st = build();
    // Drop f2's tile into slot 1, between 'a' and 'b'.
    const moved = moveProjectToSlot(st, 'f2', 1);
    expect(homeIds(moved)).toEqual(['a', '[f2]', 'b', '[f1]']);
  });

  it('refuses to move the home project itself (it has no tile)', () => {
    const st = build();
    expect(moveProjectToSlot(st, 'home', 2)).toBe(st);
  });

  it('derives each tile count from the store, never from a stored number', () => {
    const st = build();
    const f1 = homeItems(st).find((i) => i.kind === 'project' && i.project.id === 'f1');
    expect(f1 && f1.kind === 'project' && f1.count).toBe(1);
  });
});

describe('mergeIntoNewProject — drop one design on another', () => {
  const build = () =>
    assembleStore(
      [P('home')],
      [L('a', 'home'), L('b', 'home'), L('c', 'home')],
      undefined,
    );

  it('puts BOTH designs in one new folder, in ONE store write', () => {
    const st = build();
    const out = mergeIntoNewProject(st, 'a', 'b', 'Bedroom');
    expect(out).not.toBeNull();
    expect(out!.store.projects).toHaveLength(2);
    expect(ids(out!.store, out!.projectId)).toEqual(['b', 'a']); // target first
    expect(out!.store.layouts).toHaveLength(3); // nothing created, nothing lost
  });

  it('places the new tile at the TARGET design’s slot — the Android gesture', () => {
    const st = build();
    expect(homeIds(st)).toEqual(['a', 'b', 'c']);
    // Drop 'a' onto 'b' (slot 1). The folder appears where 'b' was standing.
    const out = mergeIntoNewProject(st, 'a', 'b', 'Bedroom')!;
    expect(homeIds(out.store)).toEqual([`[${out.projectId}]`, 'c']);
    const tile = homeItems(out.store)[0];
    expect(tile.kind === 'project' && tile.count).toBe(2);
  });

  it('returns the id it minted, so the caller can name and rename it', () => {
    const out = mergeIntoNewProject(build(), 'a', 'b', 'Bedroom')!;
    expect(out.store.projects.some((p) => p.id === out.projectId)).toBe(true);
    expect(out.store.projects.find((p) => p.id === out.projectId)!.name).toBe('Bedroom');
  });

  it('REFUSES rather than silently no-opping, so a drop can explain itself', () => {
    const st = build();
    expect(mergeIntoNewProject(st, 'a', 'a', 'X')).toBeNull(); // onto itself
    expect(mergeIntoNewProject(st, 'a', 'nope', 'X')).toBeNull();
    expect(mergeIntoNewProject(st, 'nope', 'b', 'X')).toBeNull();
  });

  it('REFUSES at the folder cap instead of appearing to do nothing', () => {
    let st = build();
    for (let i = st.projects.length; i < MAX_PROJECTS; i++) {
      const made = addProjectAt(st, `F${i}`, null);
      st = made!.store;
    }
    expect(st.projects).toHaveLength(MAX_PROJECTS);
    expect(mergeIntoNewProject(st, 'a', 'b', 'One too many')).toBeNull();
  });

  it('bumps updatedAt on both, or the merge vanishes on reload', () => {
    // The fixture's timestamps are pinned into the past on purpose: built with
    // `Date.now()` they land in the SAME millisecond as the mutation, and
    // `toBeGreaterThan` would fail on correct code while a
    // `toBeGreaterThanOrEqual` would pass on code that bumps nothing at all.
    const base = build();
    const st: LayoutStore = {
      ...base,
      layouts: base.layouts.map((l) => ({ ...l, updatedAt: 1_700_000_000_000 })),
    };
    const out = mergeIntoNewProject(st, 'a', 'b', 'Bedroom')!;
    for (const id of ['a', 'b']) {
      const l = out.store.layouts.find((x) => x.id === id)!;
      expect(l.updatedAt).toBeGreaterThan(1_700_000_000_000);
    }
  });
});

describe('dissolveEmptyProject — dragging the last design out', () => {
  it('removes a folder a drag has emptied', () => {
    const st = assembleStore([P('home'), P('f')], [L('a', 'home'), L('x', 'f')], undefined);
    const emptied = moveLayoutToProject(st, 'x', 'home');
    expect(layoutsInProject(emptied, 'f')).toHaveLength(0);
    const gone = dissolveEmptyProject(emptied, 'f');
    expect(gone.projects.map((p) => p.id)).toEqual(['home']);
    expect(gone.layouts).toHaveLength(2); // no design was harmed
  });

  it('REFUSES while the folder still holds anything — the whole safety argument', () => {
    // At zero layouts there is nothing to lose, which is why this needs no
    // confirm and no undo slot. One layout is a different question entirely.
    const st = assembleStore([P('home'), P('f')], [L('a', 'home'), L('x', 'f')], undefined);
    expect(dissolveEmptyProject(st, 'f')).toBe(st);
  });

  it('REFUSES on the home project and on the last folder', () => {
    const st = assembleStore([P('home')], [L('a', 'home')], undefined);
    expect(dissolveEmptyProject(st, 'home')).toBe(st);
    const two = assembleStore([P('home'), P('f')], [L('a', 'home')], undefined);
    expect(dissolveEmptyProject(two, 'home')).toBe(two);
  });
});

// ---------------------------------------------------------------------------
// Persistence. The arrangement is only real if it survives a reload.

function reset(): Promise<void> {
  __resetConnectionForTests();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('the arrangement round-trips through IndexedDB', () => {
  beforeEach(reset);

  it('comes back in the order the user left it, NOT in id order', async () => {
    // The ids are deliberately chosen so lexicographic order is the REVERSE of
    // the arrangement — otherwise the test passes on an engine with no ordering
    // at all, which is what shipped before S29.
    const base = defaultStore();
    const layouts: Layout[] = ['zz', 'mm', 'aa'].map((id, i) => ({
      ...makeLayout(`Design ${id}`, blankScene(), undefined, base.projects[0].id),
      id: `layout-${id}`,
      order: i,
      updatedAt: 1_700_000_000_000 + i,
    }));
    for (const l of layouts) await saveLayout(l, false);
    await saveMeta(layouts[0].id, base.projects);

    const back = await loadFromIDB();
    expect(back).not.toBeNull();
    // The ARRAY comes back in id order — `getAll()` is ascending by key and
    // nothing re-sorts it. That is fine and is why `LayoutStore.layouts` carries
    // a warning: display order is `order`, read through `layoutsInProject`.
    expect(back!.layouts.map((l) => l.id)).toEqual(['layout-aa', 'layout-mm', 'layout-zz']);
    // ...and the arrangement is the one the user left, which is its REVERSE.
    expect(ids(back!, base.projects[0].id)).toEqual(['layout-zz', 'layout-mm', 'layout-aa']);
  });

  it('survives a REORDER written back and read again', async () => {
    const base = defaultStore();
    const pid = base.projects[0].id;
    let store: LayoutStore = assembleStore(
      base.projects,
      ['a', 'b', 'c'].map((id) => ({
        ...makeLayout(id, blankScene(), undefined, pid),
        id: `layout-${id}`,
      })),
      undefined,
    );
    // Drag 'c' to the front.
    store = moveLayoutToProject(store, 'layout-c', pid, 0);
    expect(ids(store, pid)).toEqual(['layout-c', 'layout-a', 'layout-b']);
    for (const l of store.layouts) await saveLayout(l, false);
    await saveMeta(store.activeId, store.projects);

    const back = await loadFromIDB();
    expect(ids(back!, pid)).toEqual(['layout-c', 'layout-a', 'layout-b']);
  });

  it('round-trips a folder tile’s slot on the home grid', async () => {
    const base = defaultStore();
    const pid = base.projects[0].id;
    let store: LayoutStore = assembleStore(
      base.projects,
      ['a', 'b'].map((id) => ({
        ...makeLayout(id, blankScene(), undefined, pid),
        id: `layout-${id}`,
      })),
      undefined,
    );
    store = addProjectAt(store, 'Sketches', null)!.store;
    const tileId = store.projects[1].id;
    store = moveProjectToSlot(store, tileId, 0); // tile first, ahead of both designs
    expect(homeIds(store)).toEqual([`[${tileId}]`, 'layout-a', 'layout-b']);

    for (const l of store.layouts) await saveLayout(l, false);
    await saveMeta(store.activeId, store.projects);
    const back = await loadFromIDB();
    expect(homeIds(back!)).toEqual([`[${tileId}]`, 'layout-a', 'layout-b']);
  });
});

describe('OLD-SHAPE records upgrade without reshuffling anything', () => {
  beforeEach(reset);

  /** PRE-S29 records: no `order` on the layouts, no `order` on the projects. */
  async function seedPreS29(recIds: string[]): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(['layouts', 'meta'], 'readwrite');
    recIds.forEach((id, i) => {
      tx.objectStore('layouts').put({
        id,
        name: `Design ${i}`,
        scene: blankScene(),
        settings: defaultStore().layouts[0].settings,
        updatedAt: 1_700_000_000_000 + i,
        projectId: 'p-old',
        // NO order — the whole point of the fixture.
      });
    });
    tx.objectStore('meta').put({
      key: 'root',
      activeId: recIds[0],
      // NO order on the project either.
      projects: [{ id: 'p-old', name: 'Old folder', createdAt: 5 }],
      schemaVersion: 1,
      updatedAt: 1_700_000_000_000,
      migratedFromLocalStorage: true,
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  it('preserves what the old engine showed — which is getAll() KEY order', () => {
    // Honest about what is recoverable: a pre-S29 store never recorded an
    // arrangement, so the only faithful upgrade is the order the old engine
    // actually displayed. Deliberately non-lexicographic ids, because the S20
    // fixture used `old-layout-0/1/2` which is sorted by construction and
    // therefore proves nothing about order.
    return seedPreS29(['zz-a', 'aa-b', 'mm-c']).then(async () => {
      const back = await loadFromIDB();
      expect(back!.layouts.map((l) => l.id)).toEqual(['aa-b', 'mm-c', 'zz-a']);
      expect(ids(back!, 'p-old')).toEqual(['aa-b', 'mm-c', 'zz-a']);
      // ...and every one has a real dense rank now.
      expect(layoutsInProject(back!, 'p-old').map((l) => l.order)).toEqual([0, 1, 2]);
    });
  });

  it('is IDEMPOTENT — two reads of the same old records agree', async () => {
    await seedPreS29(['zz-a', 'aa-b', 'mm-c']);
    const first = await loadFromIDB();
    const second = await loadFromIDB();
    expect(second!.layouts.map((l) => l.id)).toEqual(first!.layouts.map((l) => l.id));
    expect(second!.layouts.map((l) => l.order)).toEqual(first!.layouts.map((l) => l.order));
  });

  it('does not rewrite the old updatedAt timestamps just by reading them', async () => {
    // Load never mangles. If reading bumped them, the autosave diff would rewrite
    // every record on every boot.
    await seedPreS29(['zz-a', 'aa-b', 'mm-c']);
    const back = await loadFromIDB();
    for (const l of back!.layouts) expect(l.updatedAt).toBeLessThan(1_700_000_001_000);
  });

  it('handles a PARTIAL upgrade — some records ordered, some not', async () => {
    // The real state after a torn autosave: `persistNow` writes layouts one at a
    // time and isolates per-record failures, so a mixed store is reachable
    // without any implementation mistake.
    const db = await openDB();
    const tx = db.transaction(['layouts', 'meta'], 'readwrite');
    const mk = (id: string, order?: number) => ({
      id,
      name: id,
      scene: blankScene(),
      settings: defaultStore().layouts[0].settings,
      updatedAt: 1_700_000_000_000,
      projectId: 'p-old',
      ...(order === undefined ? {} : { order }),
    });
    tx.objectStore('layouts').put(mk('zz-a', 1));
    tx.objectStore('layouts').put(mk('aa-b'));
    tx.objectStore('layouts').put(mk('mm-c', 0));
    tx.objectStore('meta').put({
      key: 'root',
      activeId: 'zz-a',
      projects: [{ id: 'p-old', name: 'Old folder', createdAt: 5 }],
      schemaVersion: 1,
      updatedAt: 1_700_000_000_000,
      migratedFromLocalStorage: true,
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const back = await loadFromIDB();
    // Ordered ones keep their relative arrangement; the unwritten one goes to the
    // END rather than interleaving. Predictable, which is the property the
    // `Infinity` fallback buys — an array-index fallback would put it in the
    // middle and produce an order that is neither the old nor the new one.
    expect(ids(back!, 'p-old')).toEqual(['mm-c', 'zz-a', 'aa-b']);
    expect(layoutsInProject(back!, 'p-old')).toHaveLength(3);
    expect(layoutsInProject(back!, 'p-old').map((l) => l.order)).toEqual([0, 1, 2]);
  });

  it('a hostile order on disk cannot drop a layout', async () => {
    const db = await openDB();
    const tx = db.transaction(['layouts', 'meta'], 'readwrite');
    for (const [id, order] of [
      ['a', NaN],
      ['b', 'nope'],
      ['c', null],
    ] as const) {
      tx.objectStore('layouts').put({
        id,
        name: id,
        scene: blankScene(),
        settings: defaultStore().layouts[0].settings,
        updatedAt: 1_700_000_000_000,
        projectId: 'p-old',
        order,
      });
    }
    tx.objectStore('meta').put({
      key: 'root',
      activeId: 'a',
      projects: [{ id: 'p-old', name: 'Old folder', createdAt: 5, order: 'junk' }],
      schemaVersion: 1,
      updatedAt: 1_700_000_000_000,
      migratedFromLocalStorage: true,
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    const back = await loadFromIDB();
    expect(back!.layouts).toHaveLength(3);
    expect(layoutsInProject(back!, 'p-old').map((l) => l.order)).toEqual([0, 1, 2]);
  });
});

describe('sanitizeLayout carries the slot — the THIRD silent-drop site', () => {
  it('reads a stored order back', () => {
    const clean = sanitizeLayout({ ...makeLayout('x', blankScene()), order: 7 });
    expect(clean!.order).toBe(7);
  });

  it('defaults a missing one to UNPLACED rather than to a slot', () => {
    const raw = { ...makeLayout('x', blankScene()) } as Record<string, unknown>;
    delete raw.order;
    expect(sanitizeLayout(raw)!.order).toBe(Number.POSITIVE_INFINITY);
  });
});
