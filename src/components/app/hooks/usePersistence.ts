import { useCallback, useEffect, useRef } from 'react';
import type { LayoutStore } from '../../../engine/types';
import { STORAGE_KEY } from '../../../engine/scene';
import { buildExportBundle, removeLayout, saveLayout, saveMeta, type PersistMode } from '../../../engine/db';
import type { ToastData } from '../../ui/Toast';

interface Args {
  store: LayoutStore;
  persistMode: PersistMode;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
}

/** Autosave engine: per-layout IndexedDB writes (isolated so one bad record can't
 *  block the rest) with a hardened localStorage fallback, a 400 ms debounce, a
 *  pagehide/visibility flush, and a LOUD "Export all" toast on any failure —
 *  never a silent quota loss. Returns the storage-agnostic Export-all safety net. */
export function usePersistence({ store, persistMode, showToast }: Args): { exportAll: () => void } {
  /** What we last wrote per layout, so autosave rewrites only what changed and
   *  only re-encodes the (large) photo blob when the image itself changed. Seeded
   *  from the first render's store (= the initial store). */
  const persistedRef = useRef<Map<string, { updatedAt: number; underlaySrc: string | null }> | null>(null);
  if (!persistedRef.current) {
    persistedRef.current = new Map(
      store.layouts.map((l) => [l.id, { updatedAt: l.updatedAt, underlaySrc: l.scene.underlay?.src ?? null }]),
    );
  }
  const saveFailedRef = useRef(false);
  /** Always the latest store, so persist callbacks read fresh state without
   *  re-binding (keeps the pagehide/flush listeners stable). */
  const storeRef = useRef(store);
  storeRef.current = store;
  /** Serialize persist cycles — a slow blob write must not race a newer one over
   *  the shared persistedRef Map. */
  const persistingRef = useRef(false);
  const rerunRef = useRef(false);

  /** The storage-agnostic safety net: every layout in one self-contained file. */
  const exportAll = useCallback(() => {
    const bundle = buildExportBundle(storeRef.current);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phantom-lock-layouts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const warnSaveFailed = useCallback(
    (message: string) => {
      if (saveFailedRef.current) return;
      saveFailedRef.current = true;
      showToast(message, { tone: 'bad', action: { label: 'Export all', run: exportAll } });
    },
    [exportAll, showToast],
  );

  /** Persist the current store. IndexedDB by default (per-layout, isolated so one
   *  bad record can't block the rest); hardened localStorage fallback otherwise.
   *  Any failure is LOUD, never silent. */
  const persistNow = useCallback(async () => {
    if (persistMode !== 'idb') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storeRef.current));
        saveFailedRef.current = false;
      } catch {
        warnSaveFailed(
          'Storage is full — your changes are no longer being saved. Export your layouts to keep them.',
        );
      }
      return;
    }
    if (persistingRef.current) {
      rerunRef.current = true; // a save is running; run once more with the latest state
      return;
    }
    persistingRef.current = true;
    try {
      const st = storeRef.current;
      const seen = persistedRef.current!;
      let anyFailed = false;
      for (const l of st.layouts) {
        const prev = seen.get(l.id);
        const src = l.scene.underlay?.src ?? null;
        if (!prev || prev.updatedAt !== l.updatedAt) {
          try {
            await saveLayout(l, !prev || prev.underlaySrc !== src);
            seen.set(l.id, { updatedAt: l.updatedAt, underlaySrc: src });
          } catch {
            anyFailed = true; // isolate: keep persisting the other layouts
          }
        }
      }
      const live = new Set(st.layouts.map((l) => l.id));
      for (const id of [...seen.keys()]) {
        if (!live.has(id)) {
          try {
            await removeLayout(id);
            seen.delete(id);
          } catch {
            anyFailed = true;
          }
        }
      }
      try {
        await saveMeta(st.activeId);
      } catch {
        anyFailed = true;
      }
      if (anyFailed) {
        warnSaveFailed('Could not save everything to the database — export your layouts to keep them safe.');
      } else {
        saveFailedRef.current = false; // clean cycle — allow a fresh warning if it fails later
      }
    } finally {
      persistingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void persistNow();
      }
    }
  }, [persistMode, warnSaveFailed]);

  // Autosave, debounced.
  useEffect(() => {
    const t = setTimeout(() => void persistNow(), 400);
    return () => clearTimeout(t);
  }, [store, persistNow]);

  // Best-effort flush when the tab is hidden/closed so an edit made inside the
  // 400 ms debounce window isn't lost (localStorage writes synchronously here).
  useEffect(() => {
    const flush = () => void persistNow();
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [persistNow]);

  return { exportAll };
}
