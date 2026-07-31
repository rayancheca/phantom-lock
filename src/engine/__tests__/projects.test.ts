import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_ID,
  findOrCreateProject,
  DEFAULT_PROJECT_NAME,
  MAX_PROJECTS,
  MAX_PROJECT_NAME_LEN,
  activeProject,
  addProject,
  assembleStore,
  defaultProject,
  homeItems,
  layoutsInProject,
  moveLayoutToProject,
  moveProjectToSlot,
  removeProject,
  renameProject,
  sanitizeProjects,
} from '../projects';
import { blankScene, makeLayout } from '../scene';
import type { Layout, Project } from '../types';

/**
 * S20 — the projects (folders) data model.
 *
 * The invariants under test are the ones that, if broken, lose the user's work
 * or make it unreachable:
 *   1. a store ALWAYS has ≥1 project
 *   2. every `layout.projectId` ALWAYS resolves to a real project (an orphan is
 *      RE-HOMED, never dropped and never rendered into no group)
 *   3. deleting a project NEVER deletes a layout
 *   4. project ids claim the shared id namespace BEFORE layout ids, because
 *      re-issuing a project id dangles N pointers while re-issuing a layout id
 *      dangles at most one (the same argument that puts seats before objects in
 *      `sanitizeScene`)
 *   5. nothing here ever throws on hostile input — a throw in the load path is
 *      caught by `loadStore`'s single outer try, which returns `defaultStore()`
 *      and replaces every layout the user owns (the S8 amplifier).
 */

const L = (name: string, projectId: string, id?: string): Layout => ({
  ...makeLayout(name, blankScene()),
  ...(id ? { id } : {}),
  projectId,
});

/** `order: Infinity` = UNPLACED, which is what a project that has never been
 *  dragged actually is. A finite literal here would pin a tile ahead of layouts
 *  that are themselves unplaced and quietly change what every case measures. */
const P = (id: string, name = id): Project => ({
  id,
  name,
  createdAt: 1,
  order: Number.POSITIVE_INFINITY,
});

describe('defaultProject', () => {
  it('is a fixed literal id so two cold boots agree', () => {
    expect(defaultProject().id).toBe(DEFAULT_PROJECT_ID);
    expect(defaultProject().id).toBe(defaultProject().id);
    expect(defaultProject().name).toBe(DEFAULT_PROJECT_NAME);
    expect(Number.isFinite(defaultProject().createdAt)).toBe(true);
  });
});

describe('sanitizeProjects', () => {
  it('returns [] for every non-array shape rather than throwing', () => {
    for (const raw of [undefined, null, 0, 'x', {}, true, NaN]) {
      expect(sanitizeProjects(raw)).toEqual([]);
    }
  });

  it('drops malformed entries without taking the good ones down', () => {
    const out = sanitizeProjects([
      null,
      { id: 'p1', name: 'Home', createdAt: 5 },
      'nope',
      { name: 'no id' },
      { id: 'p2', name: 'Studio', createdAt: 6 },
      42,
    ]);
    expect(out.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('defaults a missing/blank name instead of dropping the record', () => {
    const out = sanitizeProjects([{ id: 'p1' }, { id: 'p2', name: '   ' }, { id: 'p3', name: 7 }]);
    expect(out).toHaveLength(3);
    for (const p of out) expect(p.name.trim().length).toBeGreaterThan(0);
  });

  it('slices an over-long name rather than refusing it', () => {
    const [p] = sanitizeProjects([{ id: 'p1', name: 'z'.repeat(500) }]);
    expect(p.name).toHaveLength(MAX_PROJECT_NAME_LEN);
  });

  it('re-issues a duplicate id so two folders can never share one', () => {
    const out = sanitizeProjects([
      { id: 'same', name: 'A', createdAt: 1 },
      { id: 'same', name: 'B', createdAt: 2 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('same');
    expect(out[1].id).not.toBe('same');
    expect(out[1].name).toBe('B'); // the record itself survives, only its id moved
  });

  it('coerces a hostile createdAt to a finite number', () => {
    const out = sanitizeProjects([
      { id: 'p1', name: 'A', createdAt: 'soon' },
      { id: 'p2', name: 'B', createdAt: Infinity },
      { id: 'p3', name: 'C', createdAt: NaN },
    ]);
    for (const p of out) expect(Number.isFinite(p.createdAt)).toBe(true);
  });

  it('honours a pre-claimed id namespace', () => {
    const seen = new Set(['taken']);
    const out = sanitizeProjects([{ id: 'taken', name: 'A' }], seen);
    expect(out[0].id).not.toBe('taken');
  });
});

describe('assembleStore — the single seam that establishes every store invariant', () => {
  it('mints the default project when there are none, and homes every layout into it', () => {
    const st = assembleStore(undefined, [L('a', ''), L('b', 'ghost')], undefined);
    expect(st.projects).toHaveLength(1);
    expect(st.projects[0].id).toBe(DEFAULT_PROJECT_ID);
    expect(st.layouts.map((l) => l.projectId)).toEqual([DEFAULT_PROJECT_ID, DEFAULT_PROJECT_ID]);
  });

  it('RE-HOMES an orphan projectId — never drops the layout, never leaves it groupless', () => {
    const st = assembleStore(
      [P('p1', 'Home')],
      [L('kept', 'p1'), L('orphan', 'deleted-project')],
      undefined,
    );
    expect(st.layouts).toHaveLength(2);
    expect(st.layouts[1].projectId).toBe('p1');
    // every layout is reachable through some group — the invariant the gallery relies on
    const ids = new Set(st.projects.map((p) => p.id));
    for (const l of st.layouts) expect(ids.has(l.projectId)).toBe(true);
  });

  it('does NOT bump updatedAt when repairing — the load path never mangles', () => {
    const orphan = L('orphan', 'gone');
    const st = assembleStore([P('p1')], [orphan], undefined);
    expect(st.layouts[0].updatedAt).toBe(orphan.updatedAt);
  });

  it('gives PROJECT ids the namespace first — a colliding layout id moves, not the project', () => {
    const st = assembleStore([P('shared', 'Home')], [L('x', 'shared', 'shared')], undefined);
    expect(st.projects[0].id).toBe('shared');
    expect(st.layouts[0].id).not.toBe('shared');
    // …and the layout is still in the project it pointed at
    expect(st.layouts[0].projectId).toBe('shared');
  });

  it('dedups two layouts sharing an id (they would collide on one IndexedDB key)', () => {
    const st = assembleStore([P('p1')], [L('a', 'p1', 'dup'), L('b', 'p1', 'dup')], undefined);
    expect(st.layouts).toHaveLength(2);
    expect(new Set(st.layouts.map((l) => l.id)).size).toBe(2);
  });

  it('re-derives activeId against the FINAL layout ids', () => {
    const keep = L('a', 'p1', 'live');
    expect(assembleStore([P('p1')], [keep], 'live').activeId).toBe('live');
    expect(assembleStore([P('p1')], [keep], 'stale').activeId).toBe('live');
    expect(assembleStore([P('p1')], [keep], 42).activeId).toBe('live');
  });

  it('never throws on hostile projects input — a throw here replaces every layout', () => {
    for (const bad of ['x', 42, { a: 1 }, [null], [{ id: {} }], [[[]]]]) {
      const st = assembleStore(bad, [L('a', 'p')], undefined);
      expect(st.layouts).toHaveLength(1);
      expect(st.projects.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('accepts an empty layout list (the store is created empty before seeding)', () => {
    const st = assembleStore(undefined, [], undefined);
    expect(st.layouts).toEqual([]);
    expect(st.projects).toHaveLength(1);
  });

  it('is idempotent — assembling an assembled store changes nothing', () => {
    const once = assembleStore([P('p1', 'Home')], [L('a', 'p1', 'la')], 'la');
    const twice = assembleStore(once.projects, once.layouts, once.activeId);
    expect(twice).toEqual(once);
  });

  it('preserves project ORDER (it is the display order)', () => {
    const st = assembleStore([P('c'), P('a'), P('b')], [], undefined);
    expect(st.projects.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('addProject / renameProject', () => {
  const base = assembleStore([P('p1', 'Home')], [L('a', 'p1')], undefined);

  it('appends a named project', () => {
    const st = addProject(base, 'Studio');
    expect(st.projects).toHaveLength(2);
    expect(st.projects[1].name).toBe('Studio');
    expect(st.projects[1].id).not.toBe(st.projects[0].id);
  });

  it('no-ops at MAX_PROJECTS by returning the SAME reference (no spurious undo entry)', () => {
    let st = base;
    while (st.projects.length < MAX_PROJECTS) st = addProject(st, 'p');
    expect(addProject(st, 'one more')).toBe(st);
  });

  it('renames, slices, and same-refs an unknown id', () => {
    const st = renameProject(base, 'p1', 'Living room');
    expect(st.projects[0].name).toBe('Living room');
    expect(renameProject(base, 'p1', 'y'.repeat(200)).projects[0].name).toHaveLength(MAX_PROJECT_NAME_LEN);
    expect(renameProject(base, 'nope', 'x')).toBe(base);
    expect(renameProject(base, 'p1', '   ')).toBe(base); // a blank name is not a rename
  });
});

/** A home-grid item as a readable label: `name` for a design, `[name]` for a tile. */
const labelOf = (i: ReturnType<typeof homeItems>[number]): string =>
  i.kind === 'layout' ? i.layout.name : `[${i.project.name}]`;

describe('removeProject — deleting a folder must never delete a design', () => {
  const st0 = assembleStore(
    [P('p1', 'Home'), P('p2', 'Studio')],
    [L('a', 'p1'), L('b', 'p2'), L('c', 'p2')],
    undefined,
  );

  it('re-homes the layouts to the HOME project and keeps every one of them', () => {
    const st = removeProject(st0, 'p2');
    expect(st.projects.map((p) => p.id)).toEqual(['p1']);
    expect(st.layouts).toHaveLength(3);
    for (const l of st.layouts) expect(l.projectId).toBe('p1');
  });

  it('sends them HOME, not to the adjacent folder (S30, owner decision)', () => {
    // Needs THREE projects to tell the two rules apart: with only two, "the
    // folder before p2" and "the home project" are the same place. Deleting the
    // LAST folder is the case where the old rule said "Studio" and the new one
    // says home.
    const three = assembleStore(
      [P('p1', 'Home'), P('p2', 'Studio'), P('p3', 'Sketches')],
      [L('a', 'p1', 'la'), L('b', 'p2', 'lb'), L('c', 'p3', 'lc')],
      undefined,
    );
    const st = removeProject(three, 'p3');
    expect(st.layouts.find((l) => l.id === 'lc')!.projectId).toBe('p1');
    expect(st.layouts.find((l) => l.id === 'lc')!.projectId).not.toBe('p2');
  });

  it('lands them AT THE TILE’S SLOT, not appended to the end of the grid', () => {
    // The point of the change: the designs appear where the folder the user
    // deleted was standing, which is where the eye already is. Home holds three
    // designs and the tile sits between the first and the second.
    let st = assembleStore(
      [P('p1', 'Home'), P('p2', 'Studio')],
      [
        L('h0', 'p1', 'lh0'),
        L('h1', 'p1', 'lh1'),
        L('h2', 'p1', 'lh2'),
        L('s0', 'p2', 'ls0'),
        L('s1', 'p2', 'ls1'),
      ],
      undefined,
    );
    st = moveProjectToSlot(st, 'p2', 1);
    expect(homeItems(st).map(labelOf)).toEqual(['h0', '[Studio]', 'h1', 'h2']);

    const after = removeProject(st, 'p2');
    // The folder's own designs take its place, in their own order, and the home
    // designs that straddled it stay put on either side.
    expect(homeItems(after).map(labelOf)).toEqual(['h0', 's0', 's1', 'h1', 'h2']);
  });

  it('refuses the HOME project — it IS the grid, with nowhere to re-home to', () => {
    // Never offered by the UI (a tile is only rendered for a non-home project),
    // so this is what makes it a property of the function rather than of its
    // caller. Removing p1 would promote p2 to be the grid and strand p1's own
    // designs pointing at a project that no longer exists.
    expect(removeProject(st0, 'p1')).toBe(st0);
  });

  it('bumps updatedAt on exactly the moved layouts, so the move actually persists', () => {
    const st = removeProject(st0, 'p2');
    expect(st.layouts[0].updatedAt).toBe(st0.layouts[0].updatedAt); // untouched
    expect(st.layouts[1].updatedAt).toBeGreaterThanOrEqual(st0.layouts[1].updatedAt);
    expect(st.layouts[1]).not.toBe(st0.layouts[1]);
  });

  it('refuses to remove the last project (same reference, so no undo entry)', () => {
    const one = assembleStore([P('only')], [L('a', 'only')], undefined);
    expect(removeProject(one, 'only')).toBe(one);
  });

  it('same-refs an unknown id', () => {
    expect(removeProject(st0, 'nope')).toBe(st0);
  });

  it('leaves activeId alone — the active layout still exists, just in another folder', () => {
    const st = removeProject({ ...st0, activeId: st0.layouts[1].id }, 'p2');
    expect(st.activeId).toBe(st0.layouts[1].id);
    expect(st.layouts.some((l) => l.id === st.activeId)).toBe(true);
  });
});

describe('moveLayoutToProject', () => {
  const st0 = assembleStore([P('p1'), P('p2')], [L('a', 'p1', 'la')], undefined);

  it('moves it AND bumps updatedAt (the entire autosave change detector)', () => {
    const st = moveLayoutToProject(st0, 'la', 'p2');
    expect(st.layouts[0].projectId).toBe('p2');
    expect(st.layouts[0].updatedAt).toBeGreaterThanOrEqual(st0.layouts[0].updatedAt);
  });

  it('same-refs a no-op, an unknown layout, and an unknown project', () => {
    expect(moveLayoutToProject(st0, 'la', 'p1')).toBe(st0);
    expect(moveLayoutToProject(st0, 'nope', 'p2')).toBe(st0);
    expect(moveLayoutToProject(st0, 'la', 'ghost')).toBe(st0);
  });
});

describe('derived readers', () => {
  const st = assembleStore(
    [P('p1', 'Home'), P('p2', 'Studio')],
    [L('a', 'p1', 'la'), L('b', 'p2', 'lb'), L('c', 'p2', 'lc')],
    'lb',
  );

  it('activeProject follows the ACTIVE LAYOUT, so it can never desync', () => {
    expect(activeProject(st).id).toBe('p2');
    expect(activeProject({ ...st, activeId: 'la' }).id).toBe('p1');
    // a stale activeId falls back with the store still coherent
    expect(activeProject({ ...st, activeId: 'gone' }).id).toBe('p1');
  });

  it('layoutsInProject preserves store order and covers every layout exactly once', () => {
    expect(layoutsInProject(st, 'p1').map((l) => l.id)).toEqual(['la']);
    expect(layoutsInProject(st, 'p2').map((l) => l.id)).toEqual(['lb', 'lc']);
    const all = st.projects.flatMap((p) => layoutsInProject(st, p.id));
    expect(all).toHaveLength(st.layouts.length);
  });
});


describe('findOrCreateProject — what makes an exported folder round-trip', () => {
  const st0 = assembleStore([P('p1', 'Maple Court'), P('p2', 'Sketches')], [], undefined);

  it('matches an existing folder by name, case- and whitespace-insensitively', () => {
    for (const name of ['Maple Court', 'maple court', '  MAPLE COURT  ']) {
      const r = findOrCreateProject(st0, name, 'p2');
      expect(r.projectId).toBe('p1');
      expect(r.store).toBe(st0); // no new folder, and no pointless new store identity
    }
  });

  it('creates the folder when the name is new, and files into it', () => {
    const r = findOrCreateProject(st0, 'Cabin', 'p1');
    expect(r.store.projects).toHaveLength(3);
    expect(r.store.projects[2].name).toBe('Cabin');
    expect(r.projectId).toBe(r.store.projects[2].id);
  });

  it('falls back rather than failing when the name is absent', () => {
    expect(findOrCreateProject(st0, '', 'p2').projectId).toBe('p2');
    expect(findOrCreateProject(st0, '   ', 'p2').projectId).toBe('p2');
  });

  it('falls back at MAX_PROJECTS instead of refusing the import', () => {
    let st = st0;
    while (st.projects.length < MAX_PROJECTS) st = addProject(st, 'filler');
    const r = findOrCreateProject(st, 'One too many', 'p1');
    expect(r.projectId).toBe('p1');
    expect(r.store.projects).toHaveLength(MAX_PROJECTS);
  });
});

describe('names are trimmed, not just capped', () => {
  it('trims on sanitize, on create and on rename', () => {
    expect(sanitizeProjects([{ id: 'a', name: '  Padded  ' }])[0].name).toBe('Padded');
    const st = addProject(assembleStore(undefined, [], undefined), '  Spaced  ');
    expect(st.projects[st.projects.length - 1].name).toBe('Spaced');
    expect(renameProject(st, st.projects[0].id, '  Tidy  ').projects[0].name).toBe('Tidy');
  });
});


describe('folder NAMES are unique — they are user-facing identity, not decoration', () => {
  it('de-duplicates on create, because import matches on name', () => {
    let st = assembleStore([P('p1', 'Ideas')], [], undefined);
    st = addProject(st, 'Ideas');
    st = addProject(st, 'Ideas');
    expect(st.projects.map((p) => p.name)).toEqual(['Ideas', 'Ideas 2', 'Ideas 3']);
  });

  it('is case- and whitespace-insensitive about the clash', () => {
    let st = assembleStore([P('p1', 'Ideas')], [], undefined);
    st = addProject(st, '  ideas  ');
    expect(st.projects[1].name).toBe('ideas 2');
  });

  it('de-duplicates on RENAME too, ignoring the folder being renamed', () => {
    const st = assembleStore([P('p1', 'Ideas'), P('p2', 'Other')], [], undefined);
    expect(renameProject(st, 'p2', 'Ideas').projects[1].name).toBe('Ideas 2');
    // …renaming a folder to the name it already has is not a clash with itself
    expect(renameProject(st, 'p1', 'Ideas').projects[0].name).toBe('Ideas');
  });

  it('so an exported layout re-imports into the folder it came from', () => {
    let st = assembleStore([P('p1', 'Ideas')], [], undefined);
    st = addProject(st, 'Ideas'); // becomes "Ideas 2"
    const second = st.projects[1];
    // A layout exported from "Ideas 2" carries that NAME and resolves back to it.
    expect(findOrCreateProject(st, second.name, 'p1').projectId).toBe(second.id);
    expect(findOrCreateProject(st, 'Ideas', 'p1').projectId).toBe('p1');
  });
});
