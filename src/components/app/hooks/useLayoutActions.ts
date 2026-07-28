import type { MutableRefObject } from 'react';
import type { Layout, LayoutStore, Scene } from '../../../engine/types';
import {
  apartmentScene,
  blankScene,
  createId,
  importRejection,
  makeLayout,
  rectRoomScene,
  sanitizeLayout,
  sanitizeScene,
} from '../../../engine/scene';
import type { ToastData } from '../../ui/Toast';
import { activeProject, findOrCreateProject } from '../../../engine/projects';
import { initialMode, type ModeEntry } from '../mode';
import type { Deleted } from '../app-types';

interface Args {
  store: LayoutStore;
  setStore: (updater: LayoutStore | ((s: LayoutStore) => LayoutStore)) => void;
  applyToLayout: (id: string, fn: (l: Layout) => Layout) => void;
  reap: (liveIds: Set<string>, keepId?: string) => void;
  setSelection: (sel: null) => void;
  closeFloatingPanels: () => void;
  setResetViewToken: (fn: (n: number) => number) => void;
  applyMode: (entry: ModeEntry, sceneNow?: Scene) => void;
  setDialog: (d: null) => void;
  setGalleryOpen: (b: boolean) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
  lastDeletedRef: MutableRefObject<Deleted | null>;
}

export interface LayoutActions {
  afterLayoutSwitch: (nextScene: Scene) => void;
  switchLayout: (id: string) => void;
  /** `projectId` targets a specific folder (the gallery's per-folder actions);
   *  omitted, the design lands in the folder the user is currently in. */
  addLayout: (kind: 'blank' | 'apartment', projectId?: string) => void;
  addRoomLayout: (w: number, d: number, projectId?: string) => void;
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
    a.applyMode(initialMode(nextScene), nextScene);
  };

  const switchLayout = (id: string) => {
    const next = a.store.layouts.find((l) => l.id === id);
    a.setStore((st) => ({ ...st, activeId: id }));
    if (next) afterLayoutSwitch(next.scene);
  };

  /** New designs land in the folder the user is looking at, never in the default
   *  one — `makeLayout`'s `projectId` default exists for fixtures, not for here. */
  const currentProjectId = (): string => activeProject(a.store).id;

  const addLayout = (kind: 'blank' | 'apartment', projectId?: string) => {
    const pid = projectId ?? currentProjectId();
    const layout =
      kind === 'blank'
        ? makeLayout('New layout', blankScene(), undefined, pid)
        : makeLayout('Maple Court', apartmentScene(), undefined, pid);
    a.setStore((st) => ({ ...st, layouts: [...st.layouts, layout], activeId: layout.id }));
    afterLayoutSwitch(layout.scene);
  };

  const addRoomLayout = (w: number, d: number, projectId?: string) => {
    const layout = makeLayout(
      `Room ${w}×${d}`,
      rectRoomScene(w, d),
      undefined,
      projectId ?? currentProjectId(),
    );
    a.setStore((st) => ({ ...st, layouts: [...st.layouts, layout], activeId: layout.id }));
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
    // A deleted FOLDER is restored by `useProjectActions` (it owns the projects
    // state and the re-home bookkeeping). Check the type BEFORE consuming the
    // single undo slot: nulling it first and returning later would destroy a
    // folder snapshot with no restore and no message. Unreachable today only
    // because `Toast` is single-slot — which is not a guarantee to rely on.
    if (deleted.type === 'project') return;
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
        // Its folder may have been deleted while it was gone. Undo writes STRAIGHT
        // into the live store — it never passes through `assembleStore` — so the
        // orphan repair has to be applied here too, or the restored layout renders
        // in no group at all: present in the store, autosaved back to IndexedDB,
        // and invisible. That is a worse outcome than the delete it is undoing.
        // `updatedAt` MUST bump, or the re-home never reaches disk.
        const restored = st.projects.some((p) => p.id === deleted.layout.projectId)
          ? deleted.layout
          : { ...deleted.layout, projectId: st.projects[0].id, updatedAt: Date.now() };
        layouts.splice(Math.min(deleted.index, layouts.length), 0, restored);
        return { ...st, layouts, activeId: restored.id };
      });
      a.setResetViewToken((n) => n + 1);
      a.applyMode(initialMode(deleted.layout.scene), deleted.layout.scene);
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
    let nextLayout: Layout;
    let replacementId: string | undefined;
    if (remaining.length === 0) {
      // The auto-created replacement keeps the deleted layout's folder, so
      // deleting the last design in "Studio" does not silently move you elsewhere.
      nextLayout = makeLayout('New layout', blankScene(), undefined, layout.projectId);
      replacementId = nextLayout.id;
      a.setStore((st) => ({ ...st, layouts: [nextLayout], activeId: nextLayout.id }));
      a.reap(new Set([nextLayout.id]), id);
    } else {
      nextLayout = remaining[Math.max(0, index - 1)];
      a.setStore((st) => ({ ...st, layouts: remaining, activeId: nextLayout.id }));
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
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Distinguish "not JSON" from "JSON we refuse" — the old code reported
          // every sanitizer failure as a parse error, which sent the user off
          // hunting a syntax problem that did not exist.
          a.showToast('Could not read that file as JSON.', { tone: 'bad' });
          return;
        }
        const sanitized =
          sanitizeLayout(parsed) ??
          (() => {
            const data = parsed as { scene?: unknown };
            const sc = sanitizeScene(data.scene ?? parsed);
            return sc ? makeLayout(file.name.replace(/\.json$/i, '') || 'Imported', sc) : null;
          })();
        if (!sanitized) {
          a.showToast('That file does not look like a Phantom Lock layout.', { tone: 'bad' });
          return;
        }
        // Admission control runs BEFORE anything is committed, so a refused file
        // leaves the user's store exactly as it was.
        const rejection = importRejection(sanitized.scene);
        if (rejection) {
          a.showToast(`${rejection} It was not imported.`, { tone: 'bad' });
          return;
        }
        // The file's own `projectId` is deliberately IGNORED — an id from another
        // store is meaningless here and honouring it would mint a phantom folder or
        // collide with a real one. The exported `project` NAME is what round-trips:
        // it resolves to the matching folder if there is one, otherwise creates it,
        // and falls back to the folder the user is looking at.
        //
        // All of this is resolved BEFORE `setStore` and the updater is left pure —
        // the S5 lesson. Minting an id or a folder inside the updater would run
        // twice under StrictMode, and reading a value back out of it depends on
        // React's eager-state optimization, which silently does not apply when the
        // fiber already has a pending update (the reset below would then be skipped).
        const wantedFolder =
          typeof (parsed as { project?: unknown }).project === 'string'
            ? (parsed as { project: string }).project
            : '';
        const { store: withFolder, projectId } = findOrCreateProject(
          a.store,
          wantedFolder,
          currentProjectId(),
        );
        const layout: Layout = { ...sanitized, id: createId('layout'), projectId };
        a.setStore((st) => ({
          ...st,
          // Fold in any folder the resolution created, without clobbering a
          // concurrent change to the rest of the store.
          projects: withFolder.projects.length > st.projects.length ? withFolder.projects : st.projects,
          layouts: [...st.layouts, layout],
          activeId: layout.id,
        }));
        afterLayoutSwitch(layout.scene);
        a.showToast(`Imported “${layout.name}”`, { tone: 'ok' });
      })
      .catch(() => a.showToast('Could not read that file.', { tone: 'bad' }));
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
