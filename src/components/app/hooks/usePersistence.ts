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
  const persistedRef = useRef<Map<
    string,
    { updatedAt: number; underlaySrc: string | null; order: number | undefined }
  > | null>(null);
  if (!persistedRef.current) {
    persistedRef.current = new Map(
      // `order: undefined` — deliberately NOT `l.order`, and this is a data fix
      // rather than a nicety.
      //
      // `assembleStore` derives a dense rank for every layout on LOAD and does so
      // with `touch: false`, so no `updatedAt` moves and this diff would see
      // nothing to write. Meanwhile `saveMeta` below rebuilds the whole meta row
      // EVERY cycle, so `Project.order` IS written. On any store saved before
      // S29 the two halves of one shared coordinate space then disagree on disk:
      // the folder tiles have real ranks and the designs have none, `Infinity`
      // sorts last, and on the SECOND boot every folder jumps to the front of the
      // grid with the user having done nothing. Measured end-to-end against a
      // real IndexedDB, and it is permanent once it happens.
      //
      // Seeding the rank as unknown makes the first autosave cycle write each
      // layout exactly once, after which the recorded rank matches and the diff
      // goes quiet again. `underlaySrc` is still seeded truthfully, so that write
      // does NOT re-encode anybody's photo.
      store.layouts.map((l) => [
        l.id,
        { updatedAt: l.updatedAt, underlaySrc: l.scene.underlay?.src ?? null, order: undefined },
      ]),
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
      // The folder list goes FIRST. If a cycle is torn (tab killed inside the
      // pagehide flush, a quota error, an IDB abort) the surviving on-disk state
      // is then "a folder with no members yet" — invisible, and self-correcting on
      // the next write. With the layouts first it would be "layouts pointing at a
      // folder the meta row has never heard of", i.e. orphans that get re-homed
      // into a folder the user never chose. `loadFromIDB` re-derives `activeId`
      // against the layouts it actually finds, so writing meta early is safe.
      try {
        await saveMeta(st.activeId, st.projects);
      } catch {
        anyFailed = true;
      }
      for (const l of st.layouts) {
        const prev = seen.get(l.id);
        const src = l.scene.underlay?.src ?? null;
        // `order` is part of the key: a rank can change without `updatedAt`
        // moving (the load-path derivation above), and an arrangement that is
        // never written is an arrangement the user loses on reload.
        if (!prev || prev.updatedAt !== l.updatedAt || prev.order !== l.order) {
          try {
            await saveLayout(l, !prev || prev.underlaySrc !== src);
            seen.set(l.id, { updatedAt: l.updatedAt, underlaySrc: src, order: l.order });
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
