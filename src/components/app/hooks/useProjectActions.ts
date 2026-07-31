import type { MutableRefObject } from 'react';
import type { LayoutStore } from '../../../engine/types';
import {
  addProject,
  dissolveEmptyProject,
  layoutsInProject,
  mergeIntoNewProject,
  moveLayoutToProject,
  moveProjectToSlot,
  removeProject,
  renameProject,
} from '../../../engine/projects';
import type { ToastData } from '../../ui/Toast';
import type { Deleted } from '../app-types';

interface Args {
  store: LayoutStore;
  setStore: (updater: LayoutStore | ((s: LayoutStore) => LayoutStore)) => void;
  setDialog: (d: null) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
  lastDeletedRef: MutableRefObject<Deleted | null>;
}

export interface ProjectActions {
  newProject: (name: string) => void;
  renameProjectTo: (id: string, name: string) => void;
  moveLayout: (layoutId: string, projectId: string) => void;
  deleteProject: (id: string) => void;
  undoDeleteProject: () => void;
  /** A drag landed a design in a folder, or in a new slot. */
  dropLayout: (layoutId: string, projectId: string, index: number | null) => void;
  /** A drag repositioned a folder tile on the home grid. */
  dropProject: (projectId: string, index: number) => void;
  /** A design was dropped on another design: both into a new folder. */
  mergeLayouts: (dragId: string, targetId: string) => void;
}

/**
 * Folder-level CRUD, kept out of `App.tsx` for the same reason the five sibling
 * hooks were (S5): the file has a hard 800-line cap and this is a cohesive unit
 * that mixes a store write with UI side effects (dialog, toast, undo slot).
 *
 * The load-bearing rule here: **deleting a folder is a pure REGROUPING.**
 * `removeProject` re-homes its designs to the adjacent folder and deletes none of
 * them. A cascade delete would put N designs behind ONE auto-dismissing toast,
 * which is not a recovery affordance the owner's "never delete my layouts" rule
 * can live with — the app's only destructive layout primitive stays `deleteLayout`,
 * one at a time, each with its own undo.
 */
export function useProjectActions(a: Args): ProjectActions {
  const newProject = (name: string) => {
    a.setStore((st) => addProject(st, name));
    a.setDialog(null);
  };

  const renameProjectTo = (id: string, name: string) => {
    a.setStore((st) => renameProject(st, id, name));
    a.setDialog(null);
  };

  const moveLayout = (layoutId: string, projectId: string) => {
    const target = a.store.projects.find((p) => p.id === projectId);
    const layout = a.store.layouts.find((l) => l.id === layoutId);
    const from = a.store.projects.find((p) => p.id === layout?.projectId);
    a.setStore((st) => moveLayoutToProject(st, layoutId, projectId));
    if (!target || !layout) return;
    a.showToast(`Moved “${layout.name}” to “${target.name}”`, {
      tone: 'ok',
      action: from
        ? {
            label: 'Undo',
            run: () => a.setStore((st) => moveLayoutToProject(st, layoutId, from.id)),
          }
        : undefined,
    });
  };

  const undoDeleteProject = () => {
    const d = a.lastDeletedRef.current;
    // Type first, THEN consume — the slot is shared with the layout/scene undos
    // and taking it for a snapshot this handler cannot restore loses that undo.
    if (!d || d.type !== 'project') return;
    a.lastDeletedRef.current = null;
    a.setStore((st) => {
      if (st.projects.some((p) => p.id === d.project.id)) return st;
      const projects = [...st.projects];
      projects.splice(Math.min(d.index, projects.length), 0, d.project);
      const moved = new Set(d.movedLayoutIds);
      // Only the layouts THIS delete moved go back, and only if they are STILL
      // where it put them — a design the user has since filed somewhere else on
      // purpose must not be dragged back. `landedIn` is where `removeProject` sent
      // them, so anything that has moved on since fails the second test.
      const landedIn = st.projects[Math.max(0, d.index - 1)]?.id;
      return {
        ...st,
        projects,
        layouts: st.layouts.map((l) =>
          moved.has(l.id) && l.projectId === landedIn
            ? { ...l, projectId: d.project.id, updatedAt: Date.now() }
            : l,
        ),
      };
    });
  };

  const deleteProject = (id: string) => {
    const index = a.store.projects.findIndex((p) => p.id === id);
    const project = a.store.projects[index];
    if (!project || a.store.projects.length <= 1) return;
    const moved = a.store.layouts.filter((l) => l.projectId === id);
    a.lastDeletedRef.current = {
      type: 'project',
      project,
      index,
      movedLayoutIds: moved.map((l) => l.id),
    };
    a.setStore((st) => removeProject(st, id));
    // Compute the destination the SAME way `removeProject` does — from the array
    // with `id` already removed. Reading it off the unfiltered array names the
    // folder being deleted when it is the first one, so the toast read
    // "moved to «the folder you just deleted»".
    const target = a.store.projects.filter((p) => p.id !== id)[Math.max(0, index - 1)];
    a.showToast(
      moved.length === 0
        ? `Deleted “${project.name}”`
        : `Deleted “${project.name}” — ${moved.length} design${
            moved.length === 1 ? '' : 's'
          } moved to “${target?.name ?? 'the first folder'}”`,
      { action: { label: 'Undo', run: undoDeleteProject } },
    );
  };

  /**
   * A drag that empties a folder removes it — dragging the last icon out of an
   * Android folder makes the folder disappear.
   *
   * Safe WITHOUT a confirm and without touching the shared undo slot precisely
   * because it only ever fires at ZERO layouts: there is nothing to lose. A
   * folder that merely drops to one design is left alone — Android dissolves at
   * one, but here that would move a design the user did not touch.
   */
  const dropLayout = (layoutId: string, projectId: string, index: number | null) => {
    const layout = a.store.layouts.find((l) => l.id === layoutId);
    const from = layout?.projectId;
    const target = a.store.projects.find((p) => p.id === projectId);
    if (!layout || !target) return;
    const leftBehind =
      from && from !== projectId && layoutsInProject(a.store, from).length === 1 ? from : null;
    const fromName = a.store.projects.find((p) => p.id === from)?.name;

    a.setStore((st) => {
      const moved = moveLayoutToProject(st, layoutId, projectId, index);
      return leftBehind ? dissolveEmptyProject(moved, leftBehind) : moved;
    });

    // A reorder inside one folder is its own visible feedback — a toast for it
    // would fire on every drag and say nothing the user cannot see.
    if (from === projectId) return;
    a.showToast(`Moved “${layout.name}” to “${target.name}”`, {
      tone: 'ok',
      action: from
        ? {
            label: 'Undo',
            run: () =>
              a.setStore((st) => {
                // Re-create the folder the move dissolved, so undo restores the
                // whole gesture rather than half of it.
                const restored =
                  leftBehind && !st.projects.some((p) => p.id === leftBehind)
                    ? addProject(st, fromName ?? 'Folder')
                    : st;
                const home =
                  leftBehind && restored !== st
                    ? restored.projects[restored.projects.length - 1].id
                    : from;
                return moveLayoutToProject(restored, layoutId, home, null);
              }),
          }
        : undefined,
    });
  };

  const dropProject = (projectId: string, index: number) => {
    a.setStore((st) => moveProjectToSlot(st, projectId, index));
  };

  const mergeLayouts = (dragId: string, targetId: string) => {
    const drag = a.store.layouts.find((l) => l.id === dragId);
    const target = a.store.layouts.find((l) => l.id === targetId);
    if (!drag || !target) return;
    const fromDrag = drag.projectId;
    const fromTarget = target.projectId;
    // Named after the design that was already standing there, which is the one
    // the user aimed at. `uniqueName` inside `addProjectAt` keeps it distinct.
    const made = mergeIntoNewProject(a.store, dragId, targetId, target.name);
    if (!made) {
      a.showToast('That is the most folders one workspace can hold.', { tone: 'bad' });
      return;
    }
    a.setStore(() => made.store);
    a.showToast(`Put “${drag.name}” and “${target.name}” in a new folder`, {
      tone: 'ok',
      action: {
        label: 'Undo',
        run: () =>
          a.setStore((st) => {
            let next = moveLayoutToProject(st, dragId, fromDrag, null);
            next = moveLayoutToProject(next, targetId, fromTarget, null);
            // The folder is empty again by construction, so this destroys nothing.
            return dissolveEmptyProject(next, made.projectId);
          }),
      },
    });
  };

  return {
    newProject,
    renameProjectTo,
    moveLayout,
    deleteProject,
    undoDeleteProject,
    dropLayout,
    dropProject,
    mergeLayouts,
  };
}
