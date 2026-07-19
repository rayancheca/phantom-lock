import { useCallback } from 'react';
import type { Layout, LayoutStore } from '../../../engine/types';
import { createId } from '../../../engine/scene';
import { updateLayout } from '../store';

export interface LayoutStoreApi {
  /** The active layout (falls back to the first if activeId is stale). */
  active: Layout;
  /** Bound `updateLayout` — replace one layout by id via `fn`, immutably. */
  applyToLayout: (id: string, fn: (l: Layout) => Layout) => void;
  /** Replace the active layout's settings, bumping updatedAt so autosave persists it. */
  setSettings: (next: Layout['settings']) => void;
  /** Deep-copy a layout as a new "… copy" and switch to it. */
  duplicateLayout: (id: string) => void;
  /** Download a single layout as JSON. */
  exportLayout: (id: string) => void;
}

/**
 * Owns layout-store reads + the store operations that are pure (no UI side
 * effects): the `applyToLayout` helper that replaces the duplicated
 * `layouts.map(l => l.id === X ? … : l)` blocks, settings writes, duplicate, and
 * single-layout export. UI-orchestrating CRUD (switch/add/delete/import) stays in
 * App where the selection/toast/workflow side effects live.
 */
export function useLayoutStore(
  store: LayoutStore,
  setStore: (updater: (s: LayoutStore) => LayoutStore) => void,
): LayoutStoreApi {
  const active = store.layouts.find((l) => l.id === store.activeId) ?? store.layouts[0];

  const applyToLayout = useCallback(
    (id: string, fn: (l: Layout) => Layout) => setStore((s) => updateLayout(s, id, fn)),
    [setStore],
  );

  const setSettings = useCallback(
    (next: Layout['settings']) =>
      // Bump updatedAt so the IndexedDB autosave diff (keyed on updatedAt) persists it.
      setStore((s) =>
        updateLayout(s, s.activeId, (l) => ({ ...l, settings: next, updatedAt: Date.now() })),
      ),
    [setStore],
  );

  const duplicateLayout = useCallback(
    (id: string) => {
      const source = store.layouts.find((l) => l.id === id) ?? active;
      const copy = structuredClone(source);
      copy.id = createId('layout');
      copy.name = `${source.name} copy`;
      copy.updatedAt = Date.now();
      setStore((st) => ({ layouts: [...st.layouts, copy], activeId: copy.id }));
    },
    [store.layouts, active, setStore],
  );

  const exportLayout = useCallback(
    (id: string) => {
      const l = store.layouts.find((x) => x.id === id) ?? active;
      const blob = new Blob(
        [JSON.stringify({ name: l.name, scene: l.scene, settings: l.settings }, null, 2)],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [store.layouts, active],
  );

  return { active, applyToLayout, setSettings, duplicateLayout, exportLayout };
}
