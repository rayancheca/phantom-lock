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
import type { Layout, LayoutStore, Project, Scene, Underlay } from './types';
import { defaultStore, sanitizeLayout, STORAGE_KEY } from './scene';
import { assembleStore, defaultProject, homeItems, layoutsInProject } from './projects';

export const DB_NAME = 'phantom-lock';
export const DB_VERSION = 1;
const STORE_LAYOUTS = 'layouts';
const STORE_UNDERLAYS = 'underlays';
const STORE_META = 'meta';
const META_KEY = 'root';

/** Underlay minus the heavy `src` — the bytes live in the `underlays` store. */
type StoredUnderlay = Omit<Underlay, 'src'>;
/** A folder as it exists ON DISK: `order` is absent on every pre-S29 row. */
type StoredProject = Omit<Project, 'order'> & { order?: number };
interface StoredScene extends Omit<Scene, 'underlay'> {
  underlay?: StoredUnderlay | null;
}
interface LayoutRecord {
  id: string;
  name: string;
  scene: StoredScene;
  settings: Layout['settings'];
  updatedAt: number;
  /**
   * Owning project. OPTIONAL, because optional-on-disk is the TRUTH: every record
   * written before S20 genuinely has no such key, and typing it required would be
   * a lie the compiler then lets you dereference. (`LayoutRecord` is a separate
   * interface from `Layout`, so nothing here is checked against the in-memory
   * type — this is a silent-drop site, which is why it must be listed explicitly
   * in both `saveLayout`'s literal and `loadFromIDB`'s `raw`.)
   */
  projectId?: string;
  /**
   * Slot within this layout's container. OPTIONAL for the same reason
   * `projectId` is: every record written before S29 genuinely has no such key.
   * `sanitizeLayout` defaults it to `Infinity` ("unplaced") and `normalizeOrder`
   * re-derives a dense rank, so a missing value costs nothing.
   */
  order?: number;
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
  /** The folder list. It rides the singleton meta row rather than a fourth object
   *  store ON PURPOSE: a new store would need a DB_VERSION bump, and this file's
   *  `openDB` REJECTS on `onblocked` (an old tab still holding v1), which routes
   *  the user through `bootstrapPersistence`'s catch into localStorage mode —
   *  where autosave then overwrites the FROZEN pre-migration snapshot. Adding a
   *  field to an existing record needs no schema change at all: IndexedDB stores
   *  structured clones with no declared schema. Absent on pre-S20 rows.
   *
   *  Typed as `StoredProject[]`, not `Project[]`: `Project.order` is REQUIRED in
   *  memory and genuinely absent on every pre-S29 row, and claiming otherwise
   *  would let a reader dereference a field that is not there. Nothing reads
   *  this as a `Project` anyway — `loadFromIDB` hands it to `assembleStore` as
   *  `unknown` and `sanitizeProjects` is the trust boundary. */
  projects?: StoredProject[];
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
    projectId: layout.projectId,
    // `Infinity` does not survive a structured clone as a number the reader can
    // use, and an unplaced layout has no rank worth storing anyway — omit the
    // key entirely so the record is indistinguishable from a pre-S29 one, which
    // is exactly what `sanitizeLayout` already handles.
    order: Number.isFinite(layout.order) ? layout.order : undefined,
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

/**
 * `projects` is a REQUIRED parameter, not optional. This function rebuilds the
 * whole meta record, so an optional argument would let every autosave tick erase
 * the user's folders — a guaranteed bug, not a theoretical one. Required means the
 * compiler stops at both call sites (`usePersistence` and `migrateFromLocalStorage`).
 */
export async function saveMeta(activeId: string, projects: Project[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_META, 'readwrite');
  const rec: MetaRecord = {
    key: META_KEY,
    activeId,
    projects,
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
/**
 * `onDrop` is called once per record that could not be reconstructed.
 *
 * Dropping the record is right — losing one layout beats losing all of them —
 * but doing it in silence is not: the user simply finds a layout missing from
 * the gallery with nothing to explain it, which is indistinguishable from the
 * app having eaten their work. The caller surfaces the count.
 */
export async function loadFromIDB(
  onDrop?: (id: string) => void,
  /**
   * FOLDER-level notices — a SEPARATE channel from `onDrop` on purpose. `onDrop`
   * means "a saved layout could not be reconstructed", which the App turns into a
   * "your work may be gone, export now" warning. A folder being repaired loses no
   * layout at all, so routing it through `onDrop` would tell the user their work
   * was destroyed every single boot (the repair is deliberately not persisted, so
   * it recurs) — a false alarm about the one thing they must be able to trust.
   */
  onProjectNotice?: (reason: string) => void,
): Promise<LayoutStore | null> {
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
        // `undefined` on every pre-S20 record — sanitizeLayout defaults it and
        // assembleStore re-homes it below. The second silent-drop site.
        projectId: rec.projectId,
        // ...and `undefined` on every pre-S29 record. `normalizeOrder` (invariant
        // 5, inside `assembleStore`) re-derives the rank.
        order: rec.order,
      };
      const clean = sanitizeLayout(raw);
      if (clean) layouts.push(clean);
      else onDrop?.(String(rec?.id ?? '(unknown id)'));
    } catch {
      // Drop this one record rather than losing every layout — but say so.
      onDrop?.(String(rec?.id ?? '(unknown id)'));
    }
  }
  if (layouts.length === 0 && records.length > 0) {
    // Records exist but all failed to reconstruct — surface as a hard failure so
    // the caller does NOT silently overwrite them by treating this as "first run".
    throw new Error('IndexedDB layouts unreadable');
  }
  if (layouts.length === 0) return null;

  // `meta.projects` is undefined on a pre-S20 row: assembleStore then mints the
  // default folder and homes every layout into it, and it also re-derives activeId
  // against the final ids exactly as the hand-rolled check here used to.
  //
  // WRAPPED, and this is load-bearing. Everything from here down used to sit
  // OUTSIDE every try in this function. A throw at this point does not merely fail
  // the grouping: it escapes `bootstrapPersistence`'s try, lands in its catch, and
  // switches the app to `mode: 'localStorage'` — where the fallback loader reads
  // the FROZEN pre-migration snapshot (months stale, or absent) and autosave
  // overwrites that snapshot ~400 ms later. The user's IndexedDB records would be
  // perfectly intact, invisible, and their one rollback artifact destroyed.
  //
  // So: records that reconstructed MUST reach the caller. Grouping is the only
  // thing allowed to degrade, and it degrades to "one default folder holding
  // everything" — which is exactly the pre-S20 shape.
  try {
    return assembleStore(meta.projects, layouts, meta.activeId, onProjectNotice);
  } catch {
    onProjectNotice?.('the folder structure could not be read');
    const fallback = defaultProject();
    return {
      layouts: layouts.map((l) => ({ ...l, projectId: fallback.id })),
      activeId: layouts.some((l) => l.id === meta.activeId) ? meta.activeId : layouts[0].id,
      projects: [fallback],
    };
  }
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
  // Without `store.projects` here, a localStorage-mode user who regains IDB
  // loses every folder at the migration moment.
  await saveMeta(store.activeId, store.projects);
  return store;
}

/**
 * Full boot sequence. Prefers IDB; migrates the localStorage blob on first run;
 * falls back to a hardened localStorage path if IDB is entirely unavailable
 * (private mode, disabled storage) so the app always renders.
 *
 * `firstRun` is true only when there was NO prior IDB data (the migrate branch) —
 * a returning user with a stored layout gets `false`. The caller pairs this with a
 * pristine-origin check to decide whether to show the first-run welcome, so an
 * existing user (like a localStorage→IDB migration) never sees it.
 *
 * `loadLegacy` runs ONLY on the confirmed happy-path first-run migration (so it is
 * the seam that may seed the demo). `loadFallback` (defaults to `loadLegacy`) runs
 * in the DEGRADED catch branch — reached when IDB is unavailable OR when existing
 * IDB records fail to reconstruct — where the caller should pass a NON-seeding
 * loader so we never inject a synthetic "already-locked" demo over a user whose
 * real data is merely temporarily unreadable.
 */
export async function bootstrapPersistence(
  loadLegacy: () => LayoutStore,
  loadFallback: () => LayoutStore = loadLegacy,
  onDrop?: (id: string) => void,
  onProjectNotice?: (reason: string) => void,
): Promise<{ store: LayoutStore; mode: PersistMode; firstRun: boolean }> {
  try {
    await openDB();
    const existing = await loadFromIDB(onDrop, onProjectNotice);
    if (existing) return { store: existing, mode: 'idb', firstRun: false };
    // First run on IDB: migrate whatever the legacy loader produces (real saved
    // data, or the bundled default apartment / seeded demo).
    const legacy = loadLegacy();
    const migrated = await migrateFromLocalStorage(legacy);
    return { store: migrated, mode: 'idb', firstRun: true };
  } catch {
    // IDB unavailable (or records unreadable) — degrade to localStorage, but the
    // caller wires the hardened (non-silent) autosave path for this mode. Not a
    // first run, and NOT a place to seed synthetic data over possibly-real records.
    let store: LayoutStore;
    try {
      store = loadFallback();
    } catch {
      store = defaultStore();
    }
    return { store, mode: 'localStorage', firstRun: false };
  }
}

// ---------------------------------------------------------------------------
// Export bundle — the storage-agnostic safety net.

interface ExportedLayout {
  name: string;
  scene: Scene; // underlay.src is a data: URL in memory, so this is self-contained
  settings: Layout['settings'];
  /**
   * Owning project's NAME, not its id — an id is meaningless in another store, and
   * honouring an imported id would let a file mint a folder that collides with one
   * the user already has. Absent in a v1 bundle.
   *
   * ⚠ The SINGLE-layout export/import path reads this (via `findOrCreateProject`).
   * The BUNDLE has no reader at all — `importLayout` handles one layout, and an
   * "Export all" bundle has never been importable (pre-existing, `docs/ideas.md`
   * §10b). So in a bundle this field is currently write-only: it is emitted so a
   * future importer can restore the filing, not because one exists today.
   */
  project?: string;
}
export interface ExportBundle {
  app: 'phantom-lock';
  kind: 'layout-bundle';
  /**
   * 2 since S20 (each layout carries its project name). The bump is honest
   * signalling only — v1 and v2 bundles are mutually readable, because the field
   * is additive and a reader that does not know it simply groups everything into
   * the default folder.
   */
  version: 1 | 2;
  exportedAt: number;
  layouts: ExportedLayout[];
}

export function buildExportBundle(store: LayoutStore): ExportBundle {
  const nameOf = new Map(store.projects.map((p) => [p.id, p.name]));
  // READING ORDER, not `store.layouts` array order.
  //
  // Since S29 the array order is NOT the display order — `order` is, and a
  // mutation writes a new rank without moving the array element. `loadFromIDB`
  // fills the array from `getAll()`, which is ascending by layout id, so mapping
  // the array straight through would export a user's designs in id order and
  // silently lose the arrangement the bundle is supposed to preserve.
  //
  // Walking the home grid and expanding each folder in place reproduces exactly
  // what is on screen, top to bottom. `version` stays 2: the ORDER of the list
  // was always the only ordering signal a bundle carried, so this changes what
  // that list contains, not the format.
  const ordered: Layout[] = [];
  for (const item of homeItems(store)) {
    if (item.kind === 'layout') ordered.push(item.layout);
    else ordered.push(...layoutsInProject(store, item.project.id));
  }
  // Belt and braces: anything the walk could not reach (a pointer `assembleStore`
  // has not repaired, on a hand-built store) is still exported. Losing a design
  // from a BACKUP because its folder pointer was odd is the one outcome this
  // file exists to prevent.
  const seen = new Set(ordered.map((l) => l.id));
  for (const l of store.layouts) if (!seen.has(l.id)) ordered.push(l);
  return {
    app: 'phantom-lock',
    kind: 'layout-bundle',
    version: 2,
    exportedAt: Date.now(),
    layouts: ordered.map((l) => ({
      name: l.name,
      scene: l.scene,
      settings: l.settings,
      project: nameOf.get(l.projectId),
    })),
  };
}

/** Legacy key kept as rollback; exposed for the migration note / tests. */
export const LEGACY_LOCALSTORAGE_KEY = STORAGE_KEY;
