import type { MutableRefObject } from 'react';
import type { Layout, LayoutStore, Scene } from '../../../engine/types';
import {
  apartmentScene,
  blankScene,
  createId,
  makeLayout,
  rectRoomScene,
  sanitizeLayout,
  sanitizeScene,
} from '../../../engine/scene';
import type { Step } from '../../panels/WorkflowSteps';
import type { ToastData } from '../../ui/Toast';
import { initialStep } from '../app-constants';
import type { Deleted } from '../app-types';

interface Args {
  store: LayoutStore;
  setStore: (updater: LayoutStore | ((s: LayoutStore) => LayoutStore)) => void;
  applyToLayout: (id: string, fn: (l: Layout) => Layout) => void;
  reap: (liveIds: Set<string>, keepId?: string) => void;
  setSelection: (sel: null) => void;
  closeFloatingPanels: () => void;
  setResetViewToken: (fn: (n: number) => number) => void;
  applyStep: (s: Step, sceneNow?: Scene) => void;
  setDialog: (d: null) => void;
  setGalleryOpen: (b: boolean) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
  lastDeletedRef: MutableRefObject<Deleted | null>;
}

export interface LayoutActions {
  afterLayoutSwitch: (nextScene: Scene) => void;
  switchLayout: (id: string) => void;
  addLayout: (kind: 'blank' | 'apartment') => void;
  addRoomLayout: (w: number, d: number) => void;
  renameLayout: (id: string, name: string) => void;
  deleteLayout: (id: string) => void;
  importLayout: (file: File) => void;
  undoDelete: () => void;
}

/**
 * Layout-level CRUD orchestration: create / switch / rename / duplicate-adjacent
 * / delete / import, plus the shared post-switch reset and the delete undo. These
 * mix a store write with UI side effects (selection, workflow step, toasts), so
 * they receive those as injected deps. `deleteLayout` reaps the removed layout's
 * undo bucket (keeping the just-deleted one for its Undo) — the historyRef leak fix.
 */
export function useLayoutActions(a: Args): LayoutActions {
  const afterLayoutSwitch = (nextScene: Scene) => {
    a.setSelection(null);
    a.closeFloatingPanels();
    a.setResetViewToken((n) => n + 1);
    a.applyStep(initialStep(nextScene), nextScene);
  };

  const switchLayout = (id: string) => {
    const next = a.store.layouts.find((l) => l.id === id);
    a.setStore((st) => ({ ...st, activeId: id }));
    if (next) afterLayoutSwitch(next.scene);
  };

  const addLayout = (kind: 'blank' | 'apartment') => {
    const layout =
      kind === 'blank'
        ? makeLayout('New layout', blankScene())
        : makeLayout('Maple Court', apartmentScene());
    a.setStore((st) => ({ layouts: [...st.layouts, layout], activeId: layout.id }));
    afterLayoutSwitch(layout.scene);
  };

  const addRoomLayout = (w: number, d: number) => {
    const layout = makeLayout(`Room ${w}×${d}`, rectRoomScene(w, d));
    a.setStore((st) => ({ layouts: [...st.layouts, layout], activeId: layout.id }));
    a.setDialog(null);
    a.setGalleryOpen(false);
    afterLayoutSwitch(layout.scene);
  };

  const renameLayout = (id: string, name: string) => {
    a.applyToLayout(id, (l) => ({ ...l, name, updatedAt: Date.now() }));
    a.setDialog(null);
  };

  const undoDelete = () => {
    const deleted = a.lastDeletedRef.current;
    if (!deleted) return;
    a.lastDeletedRef.current = null;

    if (deleted.type === 'layout') {
      a.setStore((st) => {
        if (st.layouts.some((l) => l.id === deleted.layout.id)) return st;
        // Drop the auto-created placeholder if the user hasn't touched it.
        const layouts = st.layouts.filter(
          (l) =>
            l.id !== deleted.replacementId ||
            l.scene.objects.length > 0 ||
            l.scene.speakers.length > 0,
        );
        layouts.splice(Math.min(deleted.index, layouts.length), 0, deleted.layout);
        return { layouts, activeId: deleted.layout.id };
      });
      a.setResetViewToken((n) => n + 1);
      a.applyStep(initialStep(deleted.layout.scene), deleted.layout.scene);
      return;
    }

    // Scene-scoped snapshots go back to the layout they were deleted from,
    // which may no longer be the active one — or may no longer exist.
    a.setStore((st) => {
      if (!st.layouts.some((l) => l.id === deleted.layoutId)) return st; // ref-preserving bail-out
      return {
        ...st,
        layouts: st.layouts.map((l) => {
          if (l.id !== deleted.layoutId) return l;
          const nextScene =
            deleted.type === 'object'
              ? { ...l.scene, objects: [...l.scene.objects, deleted.obj] }
              : deleted.type === 'speaker'
                ? {
                    ...l.scene,
                    speakers: [...l.scene.speakers, deleted.speaker],
                    pairs: [...l.scene.pairs, ...deleted.pairs],
                  }
                : { ...l.scene, speakers: deleted.speakers, pairs: deleted.pairs };
          return { ...l, scene: nextScene, updatedAt: Date.now() };
        }),
      };
    });
  };

  /** Deletes immediately; the toast's Undo restores it. No confirm dialog. */
  const deleteLayout = (id: string) => {
    const index = a.store.layouts.findIndex((l) => l.id === id);
    const layout = a.store.layouts[index];
    if (!layout) return;
    if (id !== a.store.activeId) {
      a.lastDeletedRef.current = { type: 'layout', layout, index };
      const remaining = a.store.layouts.filter((l) => l.id !== id);
      a.setStore((st) => ({ ...st, layouts: st.layouts.filter((l) => l.id !== id) }));
      a.reap(new Set(remaining.map((l) => l.id)), id);
      a.showToast(`Deleted “${layout.name}”`, { action: { label: 'Undo', run: undoDelete } });
      return;
    }
    const remaining = a.store.layouts.filter((l) => l.id !== id);
    let nextLayout;
    let replacementId: string | undefined;
    if (remaining.length === 0) {
      nextLayout = makeLayout('New layout', blankScene());
      replacementId = nextLayout.id;
      a.setStore({ layouts: [nextLayout], activeId: nextLayout.id });
      a.reap(new Set([nextLayout.id]), id);
    } else {
      nextLayout = remaining[Math.max(0, index - 1)];
      a.setStore({ layouts: remaining, activeId: nextLayout.id });
      a.reap(new Set(remaining.map((l) => l.id)), id);
    }
    a.lastDeletedRef.current = { type: 'layout', layout, index, replacementId };
    afterLayoutSwitch(nextLayout.scene);
    a.showToast(`Deleted “${layout.name}”`, { action: { label: 'Undo', run: undoDelete } });
  };

  const importLayout = (file: File) => {
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        const layout =
          sanitizeLayout(parsed) ??
          (() => {
            const data = parsed as { scene?: unknown };
            const sc = sanitizeScene(data.scene ?? parsed);
            return sc ? makeLayout(file.name.replace(/\.json$/i, '') || 'Imported', sc) : null;
          })();
        if (!layout) {
          a.showToast('That file does not look like a Phantom Lock layout.', { tone: 'bad' });
          return;
        }
        layout.id = createId('layout');
        a.setStore((st) => ({ layouts: [...st.layouts, layout], activeId: layout.id }));
        afterLayoutSwitch(layout.scene);
        a.showToast(`Imported “${layout.name}”`, { tone: 'ok' });
      })
      .catch(() => a.showToast('Could not read that file as JSON.', { tone: 'bad' }));
  };

  return {
    afterLayoutSwitch,
    switchLayout,
    addLayout,
    addRoomLayout,
    renameLayout,
    deleteLayout,
    importLayout,
    undoDelete,
  };
}
