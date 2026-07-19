/**
 * IndexedDB persistence — Session 1 of the master plan.
 *
 * Replaces the single `localStorage['phantom-lock:v2']` blob (which silently lost
 * data once floorplan photos blew the ~5 MB quota) with an IndexedDB store:
 *   - `layouts`   one record per layout (scene geometry, WITHOUT image bytes)
 *   - `underlays` the floorplan photo as a real Blob, keyed by layout id
 *   - `meta`      a singleton { activeId, schemaVersion, migratedFromLocalStorage }
 *
 * Design notes:
 *   - In memory, `Scene.underlay.src` stays a `data:` URL, exactly as before — so
 *     render.ts / SimCanvas / the JSON export path need ZERO changes. Only this
 *     module knows about Blobs. The image is stored as a Blob (no base64 tax, no
 *     localStorage quota) and only rewritten when it actually changes.
 *   - Every layout loaded from IDB is run back through the existing `sanitizeLayout`
 *     trust boundary, and each record is isolated so one bad blob can't wipe the rest.
 *   - The old localStorage key is NEVER deleted — it is a FROZEN pre-migration
 *     snapshot (not a live backup; it stops updating once we're on IDB). The live
 *     safety net is the "Export all" bundle the user can download at any time.
 *   - No runtime deps: a thin promise wrapper over the raw IDB API. Fully unit-
 *     testable in Node via `fake-indexeddb` (image helpers avoid fetch/FileReader).
 */
import type { Layout, LayoutStore, Scene, Underlay } from './types';
import { defaultStore, sanitizeLayout, STORAGE_KEY } from './scene';

export const DB_NAME = 'phantom-lock';
export const DB_VERSION = 1;
const STORE_LAYOUTS = 'layouts';
const STORE_UNDERLAYS = 'underlays';
const STORE_META = 'meta';
const META_KEY = 'root';

/** Underlay minus the heavy `src` — the bytes live in the `underlays` store. */
type StoredUnderlay = Omit<Underlay, 'src'>;
interface StoredScene extends Omit<Scene, 'underlay'> {
  underlay?: StoredUnderlay | null;
}
interface LayoutRecord {
  id: string;
  name: string;
  scene: StoredScene;
  settings: Layout['settings'];
  updatedAt: number;
}
interface UnderlayRecord {
  id: string; // == layout id
  blob: Blob;
  wPx: number;
  hPx: number;
  mime: string;
}
interface MetaRecord {
  key: typeof META_KEY;
  activeId: string;
  schemaVersion: number;
  updatedAt: number;
  migratedFromLocalStorage: boolean;
}

export type PersistMode = 'idb' | 'localStorage';

// ---------------------------------------------------------------------------
// Image helpers — deliberately fetch-free / FileReader-free so they run in both
// the browser and the Node test environment.

/** `data:image/jpeg;base64,...` → Blob, decoding base64 by hand. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma); // after "data:"
  const mime = header.split(';')[0] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(header);
  const payload = dataUrl.slice(comma + 1);
  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Blob → `data:` URL via arrayBuffer + base64 (no FileReader). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

// ---------------------------------------------------------------------------
// Thin promise wrapper over IndexedDB.

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
let dbInstance: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LAYOUTS)) {
        db.createObjectStore(STORE_LAYOUTS, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORE_UNDERLAYS)) {
        db.createObjectStore(STORE_UNDERLAYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    // A future DB_VERSION bump held open by another tab would otherwise hang the
    // boot splash forever — reject so the caller can fall back / retry instead.
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'));
  });
  return dbPromise;
}

/** Test-only: close + forget the cached connection so the DB can be deleted/re-opened. */
export function __resetConnectionForTests(): void {
  dbInstance?.close();
  dbInstance = null;
  dbPromise = null;
}

// ---------------------------------------------------------------------------
// Scene <-> record conversion.

function stripUnderlay(scene: Scene): StoredScene {
  if (!scene.underlay) return { ...scene, underlay: scene.underlay };
  const { src: _src, ...geometry } = scene.underlay;
  return { ...scene, underlay: geometry };
}

/** Rebuild a raw (pre-sanitize) scene object, re-attaching the image `src`. */
function attachUnderlay(scene: StoredScene, src: string | null): Record<string, unknown> {
  if (!scene.underlay) return scene as unknown as Record<string, unknown>;
  return { ...scene, underlay: src ? { ...scene.underlay, src } : null };
}

// ---------------------------------------------------------------------------
// Public CRUD.

/**
 * Persist one layout. `writeImage` controls whether the (possibly large) blob is
 * re-encoded and written — the caller passes false when only geometry changed, so
 * a drag doesn't rewrite a 2 MB photo on every debounce.
 */
export async function saveLayout(layout: Layout, writeImage = true): Promise<void> {
  const db = await openDB();
  const record: LayoutRecord = {
    id: layout.id,
    name: layout.name,
    scene: stripUnderlay(layout.scene),
    settings: layout.settings,
    updatedAt: layout.updatedAt,
  };
  const underlay = layout.scene.underlay;
  // Encode the image BEFORE opening the write transaction. A malformed data URL
  // must not throw mid-transaction (which would poison the whole autosave loop);
  // if it can't be encoded we still persist the geometry, just without the photo.
  let blob: Blob | null = null;
  if (writeImage && underlay?.src) {
    try {
      blob = dataUrlToBlob(underlay.src);
    } catch {
      blob = null;
    }
  }
  const tx = db.transaction([STORE_LAYOUTS, STORE_UNDERLAYS], 'readwrite');
  tx.objectStore(STORE_LAYOUTS).put(record);
  if (writeImage) {
    const under = tx.objectStore(STORE_UNDERLAYS);
    if (blob) {
      const rec: UnderlayRecord = {
        id: layout.id,
        blob,
        wPx: underlay!.wPx,
        hPx: underlay!.hPx,
        mime: blob.type || 'image/jpeg',
      };
      under.put(rec);
    } else if (!underlay?.src) {
      under.delete(layout.id);
    }
  }
  await txDone(tx);
}

export async function removeLayout(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([STORE_LAYOUTS, STORE_UNDERLAYS], 'readwrite');
  tx.objectStore(STORE_LAYOUTS).delete(id);
  tx.objectStore(STORE_UNDERLAYS).delete(id);
  await txDone(tx);
}

export async function saveMeta(activeId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_META, 'readwrite');
  const rec: MetaRecord = {
    key: META_KEY,
    activeId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    migratedFromLocalStorage: true,
  };
  tx.objectStore(STORE_META).put(rec);
  await txDone(tx);
}

async function readMeta(db: IDBDatabase): Promise<MetaRecord | undefined> {
  const tx = db.transaction(STORE_META, 'readonly');
  return reqToPromise(tx.objectStore(STORE_META).get(META_KEY) as IDBRequest<MetaRecord | undefined>);
}

/**
 * Load the whole store from IDB, resolving each layout's image blob back to a
 * `data:` URL and running it through the `sanitizeLayout` trust boundary.
 * Returns null if the store has never been migrated (no meta row).
 */
export async function loadFromIDB(): Promise<LayoutStore | null> {
  const db = await openDB();
  const meta = await readMeta(db);
  if (!meta) return null;

  const tx = db.transaction([STORE_LAYOUTS, STORE_UNDERLAYS], 'readonly');
  const layoutStore = tx.objectStore(STORE_LAYOUTS);
  const underlayStore = tx.objectStore(STORE_UNDERLAYS);
  const records = await reqToPromise(layoutStore.getAll() as IDBRequest<LayoutRecord[]>);

  const layouts: Layout[] = [];
  for (const rec of records) {
    // Per-record isolation: a single unreadable image/record must never abort
    // the whole load (which would fall back to the stale localStorage snapshot).
    try {
      let src: string | null = null;
      if (rec.scene.underlay) {
        try {
          const ur = await reqToPromise(
            underlayStore.get(rec.id) as IDBRequest<UnderlayRecord | undefined>,
          );
          if (ur?.blob) src = await blobToDataUrl(ur.blob);
        } catch {
          // Lost the photo blob — keep the layout, just without its underlay.
          src = null;
        }
      }
      const raw = {
        id: rec.id,
        name: rec.name,
        scene: attachUnderlay(rec.scene, src),
        settings: rec.settings,
        updatedAt: rec.updatedAt,
      };
      const clean = sanitizeLayout(raw);
      if (clean) layouts.push(clean);
    } catch {
      // Drop this one record rather than losing every layout.
    }
  }
  if (layouts.length === 0 && records.length > 0) {
    // Records exist but all failed to reconstruct — surface as a hard failure so
    // the caller does NOT silently overwrite them by treating this as "first run".
    throw new Error('IndexedDB layouts unreadable');
  }
  if (layouts.length === 0) return null;

  const activeId = layouts.some((l) => l.id === meta.activeId) ? meta.activeId : layouts[0].id;
  return { layouts, activeId };
}

/**
 * One-time, idempotent import from the legacy localStorage blob. Reuses the
 * battle-tested `loadStore`/`sanitize*` chain so no new parsing touches the data,
 * then writes every layout + the meta row. The old localStorage key is left intact.
 */
export async function migrateFromLocalStorage(store: LayoutStore): Promise<LayoutStore> {
  for (const layout of store.layouts) {
    await saveLayout(layout, true);
  }
  await saveMeta(store.activeId);
  return store;
}

/**
 * Full boot sequence. Prefers IDB; migrates the localStorage blob on first run;
 * falls back to a hardened localStorage path if IDB is entirely unavailable
 * (private mode, disabled storage) so the app always renders.
 */
export async function bootstrapPersistence(
  loadLegacy: () => LayoutStore,
): Promise<{ store: LayoutStore; mode: PersistMode }> {
  try {
    await openDB();
    const existing = await loadFromIDB();
    if (existing) return { store: existing, mode: 'idb' };
    // First run on IDB: migrate whatever the legacy loader produces (real saved
    // data, or the bundled default apartment).
    const legacy = loadLegacy();
    const migrated = await migrateFromLocalStorage(legacy);
    return { store: migrated, mode: 'idb' };
  } catch {
    // IDB unavailable — degrade to localStorage, but the caller wires the
    // hardened (non-silent) autosave path for this mode.
    let store: LayoutStore;
    try {
      store = loadLegacy();
    } catch {
      store = defaultStore();
    }
    return { store, mode: 'localStorage' };
  }
}

// ---------------------------------------------------------------------------
// Export bundle — the storage-agnostic safety net.

interface ExportedLayout {
  name: string;
  scene: Scene; // underlay.src is a data: URL in memory, so this is self-contained
  settings: Layout['settings'];
}
export interface ExportBundle {
  app: 'phantom-lock';
  kind: 'layout-bundle';
  version: 1;
  exportedAt: number;
  layouts: ExportedLayout[];
}

export function buildExportBundle(store: LayoutStore): ExportBundle {
  return {
    app: 'phantom-lock',
    kind: 'layout-bundle',
    version: 1,
    exportedAt: Date.now(),
    layouts: store.layouts.map((l) => ({ name: l.name, scene: l.scene, settings: l.settings })),
  };
}

/** Legacy key kept as rollback; exposed for the migration note / tests. */
export const LEGACY_LOCALSTORAGE_KEY = STORAGE_KEY;
