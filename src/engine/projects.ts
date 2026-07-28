/**
 * Projects (folders) — S20.
 *
 * A project groups several designs of one space. The model is deliberately FLAT:
 * `Layout.projectId` points at a `Project.id`, and `LayoutStore.projects` is the
 * folder list. Nesting the layouts inside the projects would change the shape of
 * every read site at once and would let a layout be stranded inside a deleted
 * project; the flat pointer has exactly one direction and cannot dangle after
 * `assembleStore` runs.
 *
 * This module is a pure LEAF — it imports `types` and `ids` only. `assembleStore`
 * takes already-sanitized `Layout[]`, so nothing here needs `scene.ts` and there is
 * no `scene → projects → scene` cycle. (That is also why `createId` moved to
 * `ids.ts`.)
 *
 * THE INVARIANTS, all established at the single `assembleStore` seam:
 *   1. `projects.length >= 1` — always. Consumers never need an empty branch.
 *   2. every `layout.projectId` resolves. An orphan is RE-HOMED, never dropped and
 *      never rendered into no group (data present but unreachable is worse than a
 *      refusal — the layout would still be autosaved back and still be invisible).
 *   3. project ids claim the shared id namespace BEFORE layout ids. Re-issuing a
 *      project id dangles N pointers at once and collapses the user's folder
 *      structure; re-issuing a layout id dangles at most one (`activeId`), which
 *      the very next step re-derives. Strictly-lower damage, by exactly the
 *      argument that puts seats before objects in `sanitizeScene`.
 *   4. nothing here throws on hostile input. A throw in the load path lands in
 *      `loadStore`'s single outer catch, which returns `defaultStore()` — i.e. one
 *      bad record replaces every layout the user owns (the S8 amplifier).
 *
 * Deleting a project NEVER deletes a layout. See `removeProject`.
 */
import { createId } from './ids';
import type { Layout, LayoutStore, Project } from './types';

/**
 * A FIXED literal, not `createId('project')`, so a store that boots before its
 * first successful save produces a byte-identical default project every time —
 * which makes reading the same old-shape record twice produce equal stores.
 */
export const DEFAULT_PROJECT_ID = 'project-default';
/**
 * "My layouts", because `LayoutGallery` already titles itself "Your layouts": a
 * returning user opens the gallery and sees the same words as yesterday, now as
 * one group header, so nothing implies something happened to their work.
 * "Unfiled" was rejected — it reads as a failure state and implies a chore.
 */
export const DEFAULT_PROJECT_NAME = 'My layouts';
/** Same cap as a layout name (`sanitizeLayout`). */
export const MAX_PROJECT_NAME_LEN = 48;
/**
 * UI cap. `addProject` no-ops at it (mirroring `addListener` at `MAX_LISTENERS`).
 * The LOAD path never truncates to it — the S8 split: refuse untrusted files
 * before committing, never mangle data already in the store.
 */
export const MAX_PROJECTS = 200;

export function defaultProject(): Project {
  return { id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME, createdAt: Date.now() };
}

/**
 * Where an orphaned layout is re-homed: the OLDEST folder, ties broken by id.
 *
 * Deliberately NOT `projects[0]`. The repair is recomputed on every load and never
 * persisted (see `assembleStore`), so if the target moved whenever the array
 * reordered, an orphan could appear in a different folder after every reload with
 * no user action in between — a non-deterministic filing system rather than a
 * self-healing one. `createdAt` is minted once and never rewritten, so this target
 * only changes if that specific folder is deleted.
 */
function orphanHome(projects: Project[]): string {
  let best = projects[0];
  for (const p of projects) {
    if (p.createdAt < best.createdAt || (p.createdAt === best.createdAt && p.id < best.id)) best = p;
  }
  return best.id;
}

/** Trimmed, then length-capped. Trimming matters: an untrimmed name renders with
 *  its whitespace in the gallery heading and breaks name-matching on import. */
const cleanName = (raw: unknown, fallback: string): string =>
  typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_PROJECT_NAME_LEN) : fallback;

/**
 * Untrusted `projects` → a clean list. Malformed entries are dropped individually
 * (never take a sibling down), a missing name is DEFAULTED rather than causing a
 * drop, and a duplicate id is re-issued so two folders can never share one.
 *
 * `seen` lets the caller share one id namespace across projects and layouts.
 */
export function sanitizeProjects(raw: unknown, seen: Set<string> = new Set()): Project[] {
  if (!Array.isArray(raw)) return [];
  const out: Project[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id) continue;
    let id = p.id;
    if (seen.has(id)) id = createId('project');
    seen.add(id);
    out.push({
      id,
      name: cleanName(p.name, `Project ${out.length + 1}`),
      createdAt:
        typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
    });
  }
  return out;
}

/**
 * Build a `LayoutStore` from untrusted parts. THE ONLY place a store is assembled,
 * and the only place the four invariants above are established.
 *
 * `layouts` are already through `sanitizeLayout` (which is why this module needs
 * no `scene.ts` import). Nothing here truncates, clamps or rewrites geometry —
 * that is `importRejection`'s job, and only for untrusted imports.
 */
export function assembleStore(
  rawProjects: unknown,
  layouts: Layout[],
  rawActiveId: unknown,
  /**
   * Called when the FOLDER STRUCTURE itself was lost or repaired. Dropping a
   * malformed project is right — losing the filing beats losing the layouts — but
   * doing it in silence is not: the user just finds every design collapsed into
   * one folder with nothing to explain it, which is indistinguishable from the app
   * having eaten their organisation. Mirrors `loadFromIDB`'s existing `onDrop`.
   */
  onProjectLoss?: (reason: string) => void,
): LayoutStore {
  const seen = new Set<string>();

  // 1 + 3 — projects first: they are the TARGET of the projectId references.
  // Wrapped so a throw yields [] instead of escaping to loadStore's outer catch.
  let projects: Project[];
  try {
    projects = sanitizeProjects(rawProjects, seen);
  } catch {
    projects = [];
  }
  // A non-empty raw list that sanitized down to nothing is real, reportable loss —
  // as distinct from `undefined`, which is simply a pre-S20 store being upgraded.
  if (rawProjects !== undefined && rawProjects !== null && projects.length === 0) {
    const had = Array.isArray(rawProjects) ? rawProjects.length : 0;
    onProjectLoss?.(
      had > 0
        ? `${had} folder${had === 1 ? '' : 's'} could not be read`
        : 'the folder list could not be read',
    );
  }
  if (projects.length === 0) {
    const d = defaultProject();
    seen.add(d.id);
    projects = [d];
  }

  // 3 (cont.) — layout ids dedup into the SAME namespace. Two layouts sharing an
  // id is not merely untidy: `updateLayout` would write both, `deleteLayout` would
  // remove both while reporting one, and `persistNow` would `put` both to the same
  // IndexedDB key, silently destroying one. (Pre-existing: nothing deduped layout
  // ids before S20. Fixed here because the shared namespace exists anyway.)
  const known = new Set(projects.map((p) => p.id));
  const home = orphanHome(projects);
  let orphans = 0;
  const finalLayouts = layouts.map((l) => {
    let id = l.id;
    if (seen.has(id)) id = createId('layout');
    seen.add(id);
    // 2 — re-home an orphan. Deliberately WITHOUT bumping `updatedAt`: bumping
    // would make the load path rewrite the user's timestamps, which is the S8
    // "load never mangles" line, and it would not persist anyway (`persistedRef`
    // is seeded from this already-repaired store, so the diff sees no change).
    // The repair is therefore recomputed on every load, which is why `orphanHome`
    // must be STABLE rather than `projects[0]`.
    const projectId = known.has(l.projectId) ? l.projectId : home;
    if (projectId !== l.projectId) orphans += 1;
    return id === l.id && projectId === l.projectId ? l : { ...l, id, projectId };
  });
  if (orphans > 0) {
    onProjectLoss?.(
      `${orphans} layout${orphans === 1 ? '' : 's'} had no folder and moved to the first one`,
    );
  }

  // 4 — activeId resolves against the FINAL layout ids (the pre-existing rule).
  const activeId =
    typeof rawActiveId === 'string' && finalLayouts.some((l) => l.id === rawActiveId)
      ? rawActiveId
      : (finalLayouts[0]?.id ?? '');

  return { layouts: finalLayouts, activeId, projects };
}

// ---------------------------------------------------------------------------
// Store operations. Every one returns the SAME store reference on a no-op, so
// `historyPush`'s reference-dedup drops it and no spurious undo entry appears
// (the S14 rotate-a-wall lesson).

export function addProject(store: LayoutStore, name: string): LayoutStore {
  if (store.projects.length >= MAX_PROJECTS) return store;
  const project: Project = {
    id: createId('project'),
    name: cleanName(name, `Project ${store.projects.length + 1}`),
    createdAt: Date.now(),
  };
  return { ...store, projects: [...store.projects, project] };
}

export function renameProject(store: LayoutStore, id: string, name: string): LayoutStore {
  if (!name.trim() || !store.projects.some((p) => p.id === id)) return store;
  const next = name.trim().slice(0, MAX_PROJECT_NAME_LEN);
  return {
    ...store,
    projects: store.projects.map((p) => (p.id === id ? { ...p, name: next } : p)),
  };
}

/**
 * Remove a folder. Its layouts are RE-HOMED to the adjacent project — deleting a
 * folder is a pure regrouping and never destroys a design.
 *
 * The owner's standing rule is that their saved layouts are never deleted. A
 * cascade delete would remove N layouts behind ONE auto-dismissing undo toast: an
 * unbounded blast radius behind a single time-limited affordance. The app's only
 * destructive layout primitive stays `deleteLayout`, one at a time, each with its
 * own undo.
 *
 * `activeId` is untouched — the active layout still exists, just in another
 * folder — so there is no view reset and `useSceneHistory`'s buckets (keyed on
 * layout id) must NOT be reaped.
 */
export function removeProject(store: LayoutStore, id: string): LayoutStore {
  const index = store.projects.findIndex((p) => p.id === id);
  // Never below one project (mirrors `removeListener`'s ≥1-seat rule).
  if (index < 0 || store.projects.length <= 1) return store;

  const projects = store.projects.filter((p) => p.id !== id);
  const target = projects[Math.max(0, index - 1)];
  return {
    ...store,
    projects,
    layouts: store.layouts.map((l) =>
      // updatedAt MUST bump: it is the entire IndexedDB autosave change detector,
      // so without it the re-home renders correctly and vanishes on reload.
      l.projectId === id ? { ...l, projectId: target.id, updatedAt: Date.now() } : l,
    ),
  };
}

/**
 * Resolve a folder by NAME, creating it if it does not exist — what an imported
 * file needs, since a bundle carries its project's name rather than an id (an id
 * from another store is meaningless, and honouring one would mint a phantom
 * folder or collide with a real one).
 *
 * Matching is case-insensitive on the trimmed name, so re-importing into a store
 * that already has "Maple Court" does not produce a second one. At `MAX_PROJECTS`
 * it returns `fallbackId` rather than failing the import — refusing a layout
 * because the folder cap is full would lose the user's file for a cosmetic reason.
 */
export function findOrCreateProject(
  store: LayoutStore,
  name: string,
  fallbackId: string,
): { store: LayoutStore; projectId: string } {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return { store, projectId: fallbackId };
  const existing = store.projects.find((p) => p.name.trim().toLowerCase() === wanted);
  if (existing) return { store, projectId: existing.id };
  if (store.projects.length >= MAX_PROJECTS) return { store, projectId: fallbackId };
  const next = addProject(store, name);
  return { store: next, projectId: next.projects[next.projects.length - 1].id };
}

/** Move one layout into another folder. The ONLY writer of `projectId`. */
export function moveLayoutToProject(
  store: LayoutStore,
  layoutId: string,
  projectId: string,
): LayoutStore {
  const layout = store.layouts.find((l) => l.id === layoutId);
  if (!layout || layout.projectId === projectId) return store;
  if (!store.projects.some((p) => p.id === projectId)) return store;
  return {
    ...store,
    layouts: store.layouts.map((l) =>
      l.id === layoutId ? { ...l, projectId, updatedAt: Date.now() } : l,
    ),
  };
}

// ---------------------------------------------------------------------------
// Derived readers. `activeProject` is DERIVED rather than stored so it cannot
// desync from the active layout.

function activeLayout(store: LayoutStore): Layout | undefined {
  return store.layouts.find((l) => l.id === store.activeId) ?? store.layouts[0];
}

/**
 * Which folder owns this layout. ONE definition — the gallery, the compare picker
 * and `activeProject` all need it, and three hand-rolled
 * `projects.find(p => p.id === l.projectId) ?? projects[0]`s is exactly the shape
 * that drifted into two divergent verdicts before UX-3 deleted one of them.
 */
export function projectOf(store: LayoutStore, layout: Layout | undefined): Project {
  return store.projects.find((p) => p.id === layout?.projectId) ?? store.projects[0];
}

export function activeProject(store: LayoutStore): Project {
  return projectOf(store, activeLayout(store));
}

/** The layouts in one folder, in store order (which is the display order). */
export function layoutsInProject(store: LayoutStore, projectId: string): Layout[] {
  return store.layouts.filter((l) => l.projectId === projectId);
}
