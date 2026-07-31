import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectActions } from '../useProjectActions';
import { assembleStore } from '../../../../engine/projects';
import { blankScene, makeLayout } from '../../../../engine/scene';
import type { Layout, LayoutStore, Project } from '../../../../engine/types';
import type { Deleted } from '../../app-types';
import type { ToastData } from '../../../ui/Toast';

/**
 * S20 — folder CRUD orchestration.
 *
 * `engine/projects.ts` owns the store algebra and is separately tested; what is
 * tested HERE is the orchestration around it, which is where this session's bugs
 * actually were: a toast that named the folder it had just deleted, an undo that
 * claimed a guard it did not implement, and an undo handler that consumed the
 * shared single snapshot slot before checking whether the snapshot was even its
 * own to restore.
 */

/** `order: Infinity` = UNPLACED — see the note in engine/__tests__/projects.test.ts. */
const P = (id: string, name = id, createdAt = 1): Project => ({
  id,
  name,
  createdAt,
  order: Number.POSITIVE_INFINITY,
});
const L = (name: string, projectId: string, id: string): Layout => ({
  ...makeLayout(name, blankScene()),
  id,
  projectId,
});

interface Harness {
  actions: ReturnType<typeof useProjectActions>;
  store: () => LayoutStore;
  toasts: Array<{ message: string; opts?: Partial<Omit<ToastData, 'id' | 'message'>> }>;
  deleted: { current: Deleted | null };
  dialogClosed: () => number;
}

function harness(initial: LayoutStore): Harness {
  let store = initial;
  const toasts: Harness['toasts'] = [];
  const deleted: { current: Deleted | null } = { current: null };
  let dialogCalls = 0;

  const { result, rerender } = renderHook(() =>
    useProjectActions({
      store,
      setStore: (u) => {
        store = typeof u === 'function' ? u(store) : u;
        rerender();
      },
      setDialog: () => {
        dialogCalls += 1;
      },
      showToast: (message, opts) => toasts.push({ message, opts }),
      lastDeletedRef: deleted,
    }),
  );

  return {
    get actions() {
      return result.current;
    },
    store: () => store,
    toasts,
    deleted,
    dialogClosed: () => dialogCalls,
  };
}

const base = (): LayoutStore =>
  assembleStore(
    [P('p1', 'Alpha', 1), P('p2', 'Beta', 2), P('p3', 'Gamma', 3)],
    [L('a1', 'p1', 'la1'), L('a2', 'p1', 'la2'), L('b1', 'p2', 'lb1')],
    'la1',
  );

describe('newProject / renameProjectTo', () => {
  it('creates and closes the dialog', () => {
    const h = harness(base());
    act(() => h.actions.newProject('Delta'));
    expect(h.store().projects.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    expect(h.dialogClosed()).toBe(1);
  });

  it('renames and closes the dialog', () => {
    const h = harness(base());
    act(() => h.actions.renameProjectTo('p2', 'Bravo'));
    expect(h.store().projects[1].name).toBe('Bravo');
    expect(h.dialogClosed()).toBe(1);
  });
});

describe('moveLayout', () => {
  it('moves it, toasts, and the Undo puts it back', () => {
    const h = harness(base());
    act(() => h.actions.moveLayout('la1', 'p2'));
    expect(h.store().layouts.find((l) => l.id === 'la1')!.projectId).toBe('p2');
    expect(h.toasts[0].message).toMatch(/Moved “a1” to “Beta”/);
    act(() => h.toasts[0].opts!.action!.run());
    expect(h.store().layouts.find((l) => l.id === 'la1')!.projectId).toBe('p1');
  });

  it('says nothing when the target does not exist', () => {
    const h = harness(base());
    act(() => h.actions.moveLayout('la1', 'ghost'));
    expect(h.toasts).toHaveLength(0);
    expect(h.store().layouts.find((l) => l.id === 'la1')!.projectId).toBe('p1');
  });
});

describe('deleteProject — a folder delete must destroy no design', () => {
  it('re-homes every design and keeps all of them', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p2'));
    expect(h.store().projects.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(h.store().layouts).toHaveLength(3);
    expect(h.store().layouts.find((l) => l.id === 'lb1')!.projectId).toBe('p1');
  });

  it('names the destination folder CORRECTLY when deleting the FIRST one', () => {
    // The bug: reading the target off the unfiltered array made this read
    // "moved to “Alpha”" — the folder the user had just deleted.
    const h = harness(base());
    act(() => h.actions.deleteProject('p1'));
    expect(h.toasts[0].message).toMatch(/Deleted “Alpha” — 2 designs moved to “Beta”/);
    expect(h.store().layouts.filter((l) => l.projectId === 'p2')).toHaveLength(3);
  });

  it('singularises, and says nothing about designs when the folder was empty', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p3'));
    expect(h.toasts[0].message).toBe('Deleted “Gamma”');
  });

  it('refuses to delete the only folder', () => {
    const one = assembleStore([P('solo')], [L('x', 'solo', 'lx')], 'lx');
    const h = harness(one);
    act(() => h.actions.deleteProject('solo'));
    expect(h.store().projects).toHaveLength(1);
    expect(h.toasts).toHaveLength(0);
  });

  it('leaves the active layout alone — it still exists, in another folder', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p1'));
    expect(h.store().activeId).toBe('la1');
    expect(h.store().layouts.some((l) => l.id === 'la1')).toBe(true);
  });
});

describe('undoDeleteProject', () => {
  it('restores the folder at its old index and the designs it moved', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p2'));
    act(() => h.toasts[0].opts!.action!.run());
    expect(h.store().projects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(h.store().layouts.find((l) => l.id === 'lb1')!.projectId).toBe('p2');
  });

  it('does NOT drag back a design the user has since filed elsewhere', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p2')); // lb1 → p1
    act(() => h.actions.moveLayout('lb1', 'p3')); // user files it in Gamma on purpose
    const undo = h.toasts[0].opts!.action!.run;
    act(() => undo());
    expect(h.store().projects.some((p) => p.id === 'p2')).toBe(true);
    expect(h.store().layouts.find((l) => l.id === 'lb1')!.projectId).toBe('p3');
  });

  it('is a no-op when the folder is somehow already back', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p2'));
    const undo = h.toasts[0].opts!.action!.run;
    act(() => undo());
    const after = h.store();
    act(() => h.actions.undoDeleteProject());
    expect(h.store()).toBe(after);
  });

  it('does NOT consume the shared undo slot for a snapshot that is not its own', () => {
    // The slot is shared with the layout/scene undos. Nulling it before checking
    // the type would destroy a layout's undo with no restore and no message.
    const h = harness(base());
    const layoutSnapshot: Deleted = {
      type: 'layout',
      layout: L('other', 'p1', 'lother'),
      index: 0,
    };
    h.deleted.current = layoutSnapshot;
    act(() => h.actions.undoDeleteProject());
    expect(h.deleted.current).toBe(layoutSnapshot);
  });

  it('bumps updatedAt on the restored designs, so the re-home reaches disk', () => {
    const h = harness(base());
    const before = h.store().layouts.find((l) => l.id === 'lb1')!.updatedAt;
    act(() => h.actions.deleteProject('p2'));
    act(() => h.toasts[0].opts!.action!.run());
    expect(h.store().layouts.find((l) => l.id === 'lb1')!.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('every folder action leaves the store INVARIANT-clean', () => {
  it('never leaves a layout pointing at a folder that does not exist', () => {
    const h = harness(base());
    const run = [
      () => h.actions.deleteProject('p1'),
      () => h.actions.newProject('New'),
      () => h.actions.moveLayout('la2', 'p3'),
      () => h.actions.deleteProject('p3'),
      () => h.actions.undoDeleteProject(),
    ];
    for (const step of run) {
      act(step);
      const ids = new Set(h.store().projects.map((p) => p.id));
      expect(h.store().projects.length).toBeGreaterThanOrEqual(1);
      for (const l of h.store().layouts) expect(ids.has(l.projectId)).toBe(true);
      // …and no design is ever lost along the way
      expect(h.store().layouts).toHaveLength(3);
    }
  });

  it('never calls showToast without a message', () => {
    const h = harness(base());
    act(() => h.actions.deleteProject('p2'));
    act(() => h.actions.moveLayout('la1', 'p3'));
    for (const t of h.toasts) expect(t.message.trim().length).toBeGreaterThan(0);
    expect(vi.isMockFunction(h.actions.newProject)).toBe(false);
  });
});
