# Phantom Lock — Data & Database Plan

> Answers "where is the data stored?", the risks in the current model, the realistic
> options, a concrete recommendation + schema, and a **non-destructive migration**.
> Written 2026-07-19 after a full audit of the persistence layer + live inspection of
> the running app's `localStorage`.

---

## 1. Where the data is stored **today**

Everything lives in the **browser**, in a **single `localStorage` entry** under the key
`phantom-lock:v2`. There is **no server, no database, no cloud** — Phantom Lock is a pure
client-side SPA with zero runtime deps besides React. The only escape hatch is manual
**per-layout JSON export/import** to files on disk.

So the "database" today is *one JSON string, in one browser profile, on one machine.*
Clearing site data, switching browsers, or using another device = you start over from the
bundled "Maple Court" default.

**Verified live:** with the sample apartment + a stereo pair placed, the whole store was a
single `phantom-lock:v2` key of **4.3 KB**. One imported floorplan photo would add up to
**~2.5 MB** to that same string.

### Exactly how it works

| Aspect | Detail |
|---|---|
| Key | `phantom-lock:v2` (`STORAGE_KEY`, `src/engine/scene.ts:465`). Legacy `phantom-lock:v1` read once for migration. |
| Shape | The **entire** `LayoutStore` = `{ layouts: Layout[], activeId }`, `JSON.stringify`'d whole. Each `Layout` = `{ id, name, scene, settings, updatedAt }`. |
| Images | Floorplan underlays are stored **inline as base64 `data:image/jpeg` URLs** inside the scene. `UnderlayCard.tsx` downscales to ≤1600 px @ q0.72; `sanitizeScene` (`scene.ts:387`) hard-caps each `underlay.src` at **2,500,000 chars ≈ 2.5 MB**. |
| Write | `useState<LayoutStore>` is the source of truth (`App.tsx:104`); a single `useEffect([store])` debounces 400 ms then `localStorage.setItem(STORAGE_KEY, JSON.stringify(store))` (`App.tsx:291-300`). **Every edit rewrites the whole store** — all layouts, all embedded images — as one string. |
| Read | `loadStore(localStorage)` parses + runs a defensive `sanitize*` chain with v1→v2 migration and a `defaultStore()` fallback on any corruption. Called **twice** at init (`App.tsx:104` and again at `:112`). |
| Quota | Browser `localStorage` is typically **~5 MB per origin**, string-only (base64 pays a ~33% size tax vs raw bytes). |

---

## 2. Risks in the current model

| # | Risk | Severity | Why it matters |
|---|---|---|---|
| R1 | **Silent quota failure loses data.** `setItem` is wrapped in `try/catch {}` with an *empty* body (`App.tsx:291-300`). Once photos push the blob past ~5 MB, autosave silently no-ops — you keep editing, see no error, then lose a whole session on reload. | **CRITICAL** | This is the single most important thing to fix regardless of which option below you pick. Confirmed by the audit's skeptic pass. |
| R2 | **Whole-store re-serialization on every change.** The 400 ms debounce `JSON.stringify`s *all* layouts incl. every embedded base64 image, then writes the entire string. A one-layout edit rewrites unrelated layouts' megabytes on the main thread. | HIGH | Scales with total data, not with what changed — compounds the ray-tracer's main-thread jank. |
| R3 | **base64 is the wrong format for images.** Inline `data:` strings inflate binary ~33% and `localStorage` is string-only, so there's no way to store raw bytes there. | MEDIUM | Blobs (IndexedDB/OPFS only) are smaller and skip the encode/decode tax. |
| R4 | **Single key = single point of corruption.** One malformed write corrupts the whole store; recovery silently falls back to `defaultStore()`, discarding all layouts. Strong sanitizers mitigate but there's no backup and no per-layout isolation. | MEDIUM | |
| R5 | **No durable backup / no cross-device story.** Data is trapped in one browser profile. The only backup is manual per-layout JSON export; there's no "export everything" bundle. | LOW | |

---

## 3. The options (least → most ambitious)

| Option | Keeps zero-backend? | Cross-device? | Effort | One-liner |
|---|:---:|:---:|:---:|---|
| **(a)** Harden `localStorage` | ✅ | ❌ | S | Make failures loud + recoverable. A stopgap, not a fix. |
| **(b)** IndexedDB, hand-rolled wrapper ⭐ | ✅ | ❌ | M | ~120 lines, no deps, images as Blobs, per-layout writes, ~GB quota. |
| **(c)** IndexedDB via Dexie | ✅ (adds 1 dep) | ❌ | S | Same target as (b), ergonomic, migrations built-in. |
| **(d)** SQLite-in-WASM (OPFS) | ✅ | ❌ | L | Real SQL. Massive overkill for a handful of JSON docs. |
| **(e)** Real backend (Supabase/Turso) | ❌ | ✅ | XL | True sync + auth + backup. Biggest build + ops + privacy change. |

**(a) Harden localStorage** — catch `QuotaExceededError` explicitly, toast the user, auto-trigger an
"export all" download, split underlay images into their own keys so the text store stays small.
Pros: hours of work, zero deps, kills the silent-data-loss footgun. Cons: does **not** lift the
5 MB ceiling — photos still don't fit; still whole-blob rewrites; a band-aid, not "a database."

**(b) IndexedDB, hand-rolled ⭐ RECOMMENDED** — one IndexedDB database, three object stores:
`layouts` (scene minus image bytes), `underlays` (raw image **Blobs**), `meta` (`activeId` +
schema version). A ~120-line promisified `IDBRequest` wrapper, no dependency. Autosave writes
only the *changed* layout. Pros: keeps the zero-deps ethos; quota jumps from ~5 MB to hundreds of
MB/GB; per-layout writes (no whole-store re-serialize); images as Blobs; async off the critical
path; straightforward reversible migration. Cons: IDB's callback API needs a small wrapper;
load/save become async; you own migrations by hand (small surface here).

**(c) IndexedDB via Dexie** — same target as (b) but through Dexie (~25 KB). Declarative schema,
indexes, versioned migrations out of the box; less bespoke code to maintain. Cons: adds the **first
runtime dependency** to a deliberately zero-dep app. (CLAUDE.md notes the user already OK'd deps
for the 3D view, so this is a legitimate taste call — "own the wrapper" vs "less code.")

**(d) SQLite-in-WASM** — real relational SQL persisted to OPFS. ~1 MB WASM + worker plumbing +
possible COOP/COEP headers, for data that has zero relational-query needs. Only justified if the
app later needs real cross-layout querying. **Not now.**

**(e) Real backend** — hosted Postgres/edge-SQLite + thin API + auth; images to object storage.
The *only* option that gives true cross-device sync, off-device backup, and sharing. Cons: breaks
local-first (infra, secrets, deploy, uptime, CSP, cost), needs auth UX + offline/conflict handling,
and your **home floorplan photos would leave the device** (a real privacy consideration). If you
want this, layer it **on top of (b)** as the offline cache — don't make the app network-dependent.

---

## 4. Recommendation

**Do (b) — hand-rolled IndexedDB — and ship (a)'s quota-toast + export-all safety net alongside it.**

Reasoning tuned to *this* app:

1. **The real pain is the floorplan photos.** They're the only large payload, they blow the
   ~5 MB ceiling, and today they fail **silently**. IndexedDB raises the ceiling to hundreds of MB
   and stores images as real Blobs (smaller, no base64 tax, loaded on demand).
2. **It honors the project's identity** — "zero runtime deps besides React," local-first,
   zero-backend. (b) keeps all of that. Your home photos never leave the device.
3. **The IDB surface here is tiny** — three object stores, per-record writes, one versioned
   migration. ~120 lines of promise-wrapped, unit-testable infra that fits the codebase's
   "many small files, pure + tested engine" style.
4. **It fixes the perf problem for free** — write only the changed layout instead of
   re-stringifying every layout's megabytes on a 400 ms loop.

Take **Dexie (c)** instead of (b) only if you'd rather not maintain a wrapper by hand. Reach for a
**backend (e)** *only* if cross-device sync turns out to be a real requirement (see open questions).
**Do not** reach for SQLite-in-WASM (d) — that's real-database theater for a handful of documents.

---

## 5. Proposed schema (option b)

IndexedDB database `phantom-lock`, **version 1**, three object stores. The key trick: **the engine
and UI types don't change** — only a new persistence module (`src/engine/db.ts`) knows about Blobs
and stores. In memory, `Scene.underlay.src` stays a URL (a fresh `URL.createObjectURL(blob)` on
load), so `render.ts` / `SimCanvas` need no edits.

```ts
// --- store 'meta' (keyPath 'key') — one singleton row ---
interface MetaRecord {
  key: 'root';
  activeId: string;                     // was LayoutStore.activeId
  schemaVersion: 1;                     // for future IDB migrations
  updatedAt: number;
  migratedFromLocalStorage?: boolean;   // set true after the one-time import
}

// --- store 'layouts' (keyPath 'id') — one row per layout ---
// Scene stored WITHOUT image bytes: underlay keeps geometry only + a blob reference.
interface StoredUnderlay {            // Underlay minus `src`
  blobId: string;                    // -> 'underlays' store key
  wPx: number; hPx: number;
  center: Vec2; scale: number; rotation: number; opacity: number;
}
interface StoredScene extends Omit<Scene, 'underlay'> {
  underlay?: StoredUnderlay | null;
}
interface LayoutRecord {
  id: string;                        // keyPath
  name: string;
  scene: StoredScene;
  settings: SimSettings;
  updatedAt: number;                 // index 'updatedAt' for gallery ordering
  order: number;                     // explicit gallery order
}
// db.createObjectStore('layouts', { keyPath: 'id' }).createIndex('updatedAt','updatedAt')

// --- store 'underlays' (keyPath 'id') — raw image bytes ---
interface UnderlayBlobRecord {
  id: string;                        // == StoredUnderlay.blobId
  blob: Blob;                        // real JPEG bytes, NOT base64
  wPx: number; hPx: number;
  mime: string;                      // 'image/jpeg'
}
```

Notes:
- Reads/writes are **per-record**. Autosave writes only the edited layout + the meta row.
- One `onupgradeneeded` creates the three stores + the `updatedAt` index at version 1.
- Underlay rows are trivially reference-counted: on layout delete, delete its `blobId` row;
  on underlay replace, delete the old `blobId` then put the new one.

---

## 6. Migration plan (cannot lose existing data)

The old `phantom-lock:v2` blob is the safety net and is left **intact** until the user is proven
migrated. Every step reuses the existing battle-tested `sanitize*` chain so no new parsing code
ever touches the user's data.

- **Step 0 — Ship "Export all" FIRST** (storage-agnostic). One JSON file containing every layout
  with data-URLs inlined (an array of the existing per-layout export shape). The durable escape
  hatch you can always fall back to. Ship before touching the store.
- **Step 1 — Ship the (a) hardening in the same PR or before.** Replace the empty `catch {}` at
  `App.tsx:291-300` with explicit `QuotaExceededError` handling → toast + auto-invoke Export-all.
  Stops silent loss during the transition window.
- **Step 2 — New `src/engine/db.ts`:** a thin promisified IndexedDB wrapper (`open/get/put/delete/
  getAll`) + typed helpers (`saveLayout`, `loadStore`, `saveMeta`, `putUnderlayBlob`,
  `readUnderlayBlob`). Pure enough to unit-test with `fake-indexeddb` (dev-only) to keep the
  85-test suite green + hold the 80% coverage rule.
- **Step 3 — One-time import on startup** (idempotent, guarded by `meta.migratedFromLocalStorage`):
  1. Open IDB. If `meta.root` exists → already migrated, load from IDB, done.
  2. Else read `localStorage['phantom-lock:v2']` (and v1) through the **existing** `loadStore()`/
     `sanitize*` to get an in-memory `LayoutStore`.
  3. For each layout: if `scene.underlay?.src` is a data-URL, convert to a Blob via
     `await (await fetch(dataUrl)).blob()`, `put` it in `underlays` with a fresh `blobId`, and
     write the layout with `underlay` reduced to geometry + `blobId`. Layouts without an underlay
     copy straight across.
  4. Write the `meta` row (`activeId`, `schemaVersion:1`, `migratedFromLocalStorage:true`).
  5. **Do NOT delete `phantom-lock:v2`.** Leave it as rollback for ≥1 release (optionally rename to
     `phantom-lock:v2:preIDB-backup` so a stray write can't clobber it).
- **Step 4 — Rewire `App.tsx`:** IDB is async, so either render a tiny loading state until the
  first `loadStore()` resolves, or start from `defaultStore()` and hydrate on resolve (only replace
  if IDB actually returned layouts). Collapse the double `loadStore()` (`:104` + `:112`) into one
  hydrate. Change autosave to diff + persist only changed layout records + meta, still debounced.
- **Step 5 — Verification gate:** `npm test` (85 green + new `db.ts` tests), `npm run build`
  (tsc + vite). Manually: import a photo-heavy layout → reload → survives; old key still present;
  Export-all round-trips.

**Rollback:** the untouched `phantom-lock:v2` blob + the Export-all bundle each fully reconstruct
the data. Migration is re-runnable (guarded by the meta flag, reads from still-present localStorage).

---

## 7. Open questions (need your call)

1. ~~**Cross-device sync — the big one.**~~ **ANSWERED 2026-07-19: yes, cross-device sync.** So (b)
   IndexedDB is built now as the offline cache/source of truth (Session 1), and a cloud backend
   (option e) is scheduled as **Session 11** — photos to object storage, IndexedDB stays local
   source of truth, app stays usable offline. (User accepted that home floorplan photos leave the
   device once sync is on.)
2. **Zero-deps vs ergonomics:** strict no-runtime-deps (b, hand-rolled) or is Dexie (c, ~25 KB) OK?
3. **Multi-tab:** do you ever open the app in two tabs? If so we should pick last-write-wins vs a
   `BroadcastChannel`-coordinated policy (today two tabs already race on the single key).
4. **Version history:** is in-session undo/redo enough, or do you want persisted snapshots / named
   versions of a layout (a reason to lean toward a richer store)?
5. **Underlay image ceiling:** on IndexedDB we can safely raise/drop the 1600 px / 2.5 MB caps.
   Keep the downscale for speed, or store closer to full-res now that quota isn't the constraint?
6. **Import/export format:** keep the existing per-layout `.json` shape (inline data-URLs) for
   backward compatibility with files you've already exported? (Recommended: **yes**.)

---

*This plan is executed in **Session 1** of [master-plan.md](master-plan.md). The recommended default
is (b) + (a); if you answer "yes, I want cross-device sync" to Q1, Session 1 changes to build (b) as
the offline cache and adds a later session for the (e) backend.*
