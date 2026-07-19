import { useCallback, useRef } from 'react';
import type { LayoutStore, Scene, Selection } from '../../../engine/types';
import { emptyBucket, historyPush, historyRedo, historyUndo, type HistoryBucket } from '../history';
import { updateLayout } from '../store';

type SceneUpdater = Scene | ((s: Scene) => Scene);

export interface SceneHistory {
  /** Commit a scene edit to the active layout, recording undo history.
   *  `coalesce` folds the edit into the current undo entry (held-key repeat). */
  setScene: (next: SceneUpdater, opts?: { coalesce?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  /** Open a coalescing group (drag start) — all edits until endGroup collapse
   *  into a single undo entry. */
  beginGroup: () => void;
  /** Close the coalescing group (drag end). */
  endGroup: () => void;
  /** Drop undo buckets for layouts no longer live (leak fix), keeping `keepId`
   *  (a just-deleted layout that can still be undeleted). */
  reap: (liveIds: Set<string>, keepId?: string) => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface Args {
  store: LayoutStore;
  setStore: (updater: (s: LayoutStore) => LayoutStore) => void;
  setSelection: (sel: Selection) => void;
}

/**
 * Per-layout undo/redo. History bookkeeping is decoupled from the store updater
 * (the updater is pure), so it no longer relies on StrictMode's double-invoke to
 * dedupe and undo/redo no longer double-pop in dev. Coalescing is gesture-scoped
 * (drag boundaries via begin/endGroup, held-key repeat via `coalesce`) instead of
 * a 400 ms wall-clock timer.
 */
export function useSceneHistory({ store, setStore, setSelection }: Args): SceneHistory {
  const storeRef = useRef(store);
  storeRef.current = store;
  const historyRef = useRef(new Map<string, HistoryBucket>());
  /** The open coalescing group: `active` while a gesture runs, `started` once its
   *  first edit has pushed the pre-gesture scene. */
  const groupRef = useRef({ active: false, started: false });

  const bucketFor = useCallback((id: string): HistoryBucket => {
    let b = historyRef.current.get(id);
    if (!b) {
      b = emptyBucket();
      historyRef.current.set(id, b);
    }
    return b;
  }, []);

  const activeScene = (st: LayoutStore): Scene =>
    (st.layouts.find((l) => l.id === st.activeId) ?? st.layouts[0]).scene;

  const setScene = useCallback(
    (next: SceneUpdater, opts?: { coalesce?: boolean }) => {
      const st = storeRef.current;
      const activeId = st.activeId;
      const g = groupRef.current;
      const coalesce = opts?.coalesce === true || (g.active && g.started);
      historyRef.current.set(activeId, historyPush(bucketFor(activeId), activeScene(st), { coalesce }));
      if (g.active && !coalesce) g.started = true;
      setStore((s) =>
        updateLayout(s, activeId, (l) => ({
          ...l,
          scene: typeof next === 'function' ? next(l.scene) : next,
          updatedAt: Date.now(),
        })),
      );
    },
    [setStore, bucketFor],
  );

  const undo = useCallback(() => {
    const st = storeRef.current;
    const activeId = st.activeId;
    const res = historyUndo(bucketFor(activeId), activeScene(st));
    if (res) {
      historyRef.current.set(activeId, res.bucket);
      const target = res.scene;
      setStore((s) => updateLayout(s, activeId, (l) => ({ ...l, scene: target, updatedAt: Date.now() })));
    }
    setSelection(null); // matches pre-refactor: clears selection even on an empty stack
  }, [setStore, setSelection, bucketFor]);

  const redo = useCallback(() => {
    const st = storeRef.current;
    const activeId = st.activeId;
    const res = historyRedo(bucketFor(activeId), activeScene(st));
    if (res) {
      historyRef.current.set(activeId, res.bucket);
      const target = res.scene;
      setStore((s) => updateLayout(s, activeId, (l) => ({ ...l, scene: target, updatedAt: Date.now() })));
    }
    setSelection(null);
  }, [setStore, setSelection, bucketFor]);

  const beginGroup = useCallback(() => {
    groupRef.current = { active: true, started: false };
  }, []);
  const endGroup = useCallback(() => {
    groupRef.current = { active: false, started: false };
  }, []);

  const reap = useCallback((liveIds: Set<string>, keepId?: string) => {
    for (const id of [...historyRef.current.keys()]) {
      if (!liveIds.has(id) && id !== keepId) historyRef.current.delete(id);
    }
  }, []);

  const bucket = historyRef.current.get(store.activeId);
  const canUndo = (bucket?.past.length ?? 0) > 0;
  const canRedo = (bucket?.future.length ?? 0) > 0;

  return { setScene, undo, redo, beginGroup, endGroup, reap, canUndo, canRedo };
}
