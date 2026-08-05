import { useEffect, useRef, useState } from 'react';
import type { LayoutStore } from '../../engine/types';
import { loadStore } from '../../engine/scene';
import { bootstrapPersistence, type PersistMode } from '../../engine/db';
import { initialStoreForBoot, isPristineOrigin } from '../../engine/seed';
import AppInner from './AppInner';

/**
 * Boots persistence (IndexedDB, migrating the legacy localStorage blob on first
 * run; hardened localStorage fallback if IDB is unavailable), then mounts the app
 * once the store is hydrated. A brief splash covers the async load.
 */
export default function App() {
  const [boot, setBoot] = useState<{
    store: LayoutStore;
    mode: PersistMode;
    firstRun: boolean;
  } | null>(null);
  const startedRef = useRef(false);
  /** Ids of records `loadFromIDB` could not reconstruct — reported once mounted. */
  const droppedRef = useRef<string[]>([]);
  /** Folder-level repairs — reported separately; nothing was lost. */
  const noticesRef = useRef<string[]>([]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // On a pristine origin `initialStoreForBoot` seeds the Maple Court demo with a
    // locked pair (a live verdict on first paint) — but ONLY on the confirmed
    // happy-path first run. The degraded fallback (2nd arg + the outer .catch) uses
    // the plain, NON-seeding `loadStore` so a synthetic demo is never injected over
    // records that are merely temporarily unreadable.
    const noteProject = (reason: string) => {
      noticesRef.current.push(reason);
      console.warn(`[phantom-lock] folder repair on load: ${reason}`);
    };
    bootstrapPersistence(
      // The localStorage paths get the SAME folder-notice channel as the IDB one:
      // in degraded mode `loadStore` IS the persistence layer, and a folder list
      // that sanitizes to nothing there was collapsing in total silence — then
      // being written back over the original ~400 ms later.
      () => initialStoreForBoot(localStorage, noteProject),
      () => loadStore(localStorage, noteProject),
      // A record that cannot be reconstructed is dropped so the rest survive —
      // but never silently: a layout vanishing from the gallery with no
      // explanation is indistinguishable from the app losing the user's work.
      (id) => {
        droppedRef.current.push(id);
        console.error(`[phantom-lock] dropped an unreadable layout record: ${id}`);
      },
      // Separate channel: a repaired folder loses NO layout, so it must never
      // reach the "your work may be gone" warning above.
      noteProject,
    )
      .then(setBoot)
      .catch(() =>
        setBoot({ store: loadStore(localStorage, noteProject), mode: 'localStorage', firstRun: false }),
      );
  }, []);

  if (!boot) {
    return (
      <div className="app app-booting" aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="brand">
          <h1>
            PHANTOM<span>LOCK</span>
          </h1>
        </div>
      </div>
    );
  }
  // The welcome shows ONLY on a genuine first run: no prior IDB data (`firstRun`)
  // AND a pristine origin (so a localStorage→IDB migration of real data is excluded,
  // and the "you're looking at the demo" copy is always accurate).
  const showFirstRun = boot.firstRun && isPristineOrigin(localStorage);
  return (
    <AppInner
      initialStore={boot.store}
      persistMode={boot.mode}
      showFirstRun={showFirstRun}
      droppedCount={droppedRef.current.length}
      projectNotices={noticesRef.current}
    />
  );
}
