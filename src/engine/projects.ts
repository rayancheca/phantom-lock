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
  return { id: DEFAULT_PROJECT_ID, name: DEFAULT_PROJECT_NAME, createdAt: Date.now(), order: 0 };
}

// ---------------------------------------------------------------------------
// Ordering (S29) — the Android home screen.
//
// `order` is a coordinate WITHIN A CONTAINER, and there are exactly two kinds:
//
//   HOME     the home project's own layouts, PLUS every other project as a
//            folder tile. One shared coordinate space, which is the whole point:
//            it is what lets a folder tile sit BETWEEN two designs.
//   a folder the layouts inside it.
//
// `normalizeOrder` is the ONLY writer, and it canonicalises each container to
// dense integer ranks 0..n-1. Everything else expresses an intent as a
// FRACTIONAL order (2.5 to land between ranks 2 and 3, or max+1 to append) and
// lets normalisation make it integral again — so no caller ever has to reason
// about collisions, and a collision cannot survive a mutation.

/**
 * The home surface. It has to BE a project, because every `Layout.projectId`
 * must resolve (invariant 2) and there is therefore no "unfiled" state.
 *
 * `projects[0]`, deliberately — NOT the oldest by `createdAt`, which was the
 * first design and which an adversarial pass broke: `sanitizeProjects` defaults
 * a missing `createdAt` to `Date.now()`, so one old record can tie every project
 * at once, and `findOrCreateProject` lets an IMPORT mint a project that steals
 * the identity. Array order is already persisted verbatim in the meta row,
 * already documented as the display order (`types.ts`), and is the one thing the
 * user can deliberately rearrange.
 */
export function homeProject(store: LayoutStore): Project {
  return store.projects[0];
}

/** Is this project the home surface (rendered AS the grid, never as a tile)? */
export function isHomeProject(store: LayoutStore, projectId: string): boolean {
  return store.projects[0]?.id === projectId;
}

const rank = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Infinity);

/**
 * An item on the home grid: either one of the home project's designs, or another
 * project shown as a folder tile. Enumerated layouts-first, which is what breaks
 * a tie between a layout and a folder (see `normalizeOrder`).
 */
export type HomeItem =
  | { kind: 'layout'; layout: Layout }
  | { kind: 'project'; project: Project; count: number };

/**
 * The home grid, in display order. Layouts and folder tiles interleaved by their
 * shared `order`, which `normalizeOrder` has already made a dense integer rank —
 * so this is a merge of two already-sorted lists, not a re-sort.
 */
export function homeItems(store: LayoutStore): HomeItem[] {
  const home = homeProject(store);
  if (!home) return [];
  const items: HomeItem[] = [];
  for (const l of store.layouts) {
    if (l.projectId === home.id) items.push({ kind: 'layout', layout: l });
  }
  for (let i = 1; i < store.projects.length; i++) {
    const project = store.projects[i];
    items.push({
      kind: 'project',
      project,
      // DERIVED, never stored — a stored count is a second source of truth that
      // drifts the moment a layout is deleted through any of several paths.
      count: store.layouts.reduce((n, l) => n + (l.projectId === project.id ? 1 : 0), 0),
    });
  }
  return items.sort((a, b) => {
    const d = orderOf(a) - orderOf(b);
    return d !== 0 ? d : 0;
  });
}

const orderOf = (i: HomeItem): number =>
  i.kind === 'layout' ? rank(i.layout.order) : rank(i.project.order);

/**
 * Canonicalise every container to dense integer ranks 0..n-1. THE single seam
 * for ordering, exactly as `assembleStore` is the single seam for structure.
 *
 * Sort key is `(rank(order), enumerationIndex)`, where the enumeration puts every
 * layout before every project. Three properties, each measured rather than
 * assumed:
 *
 *   - A store where NOTHING has an order is the IDENTITY. Every key is `Infinity`,
 *     so the enumeration index decides, and that index is the array order the
 *     caller handed in. This is what makes the S29 migration a no-op on a
 *     pre-S29 store rather than a reshuffle.
 *   - The fallback is `Infinity` and NOT the array index, which was the draft's
 *     bug. Sharing one numeric space with stored orders means a partially
 *     persisted container comes back in a THIRD order that is neither the old nor
 *     the new one — measured, 24 of 32 write subsets of a 5-item container. With
 *     `Infinity` an unwritten item goes to the END: still wrong, but predictable,
 *     and `touch` below is what stops it happening at all.
 *   - Hostile values cannot drop or duplicate anything: `rank()` maps NaN,
 *     strings, null and objects to `Infinity` BEFORE the comparator sees them, so
 *     `a - b` can never itself be NaN. The index tiebreak is written out rather
 *     than resting on ES2019 sort stability.
 *
 * `touch` bumps `updatedAt` on every layout whose rank actually MOVED, and is
 * the difference between a saved arrangement and a lost one: `usePersistence`
 * diffs on `updatedAt` alone, so a drag that bumps only the dragged card leaves
 * every other card unwritten. It must be FALSE on the load path — rewriting the
 * user's timestamps as a side effect of reading is the "load never mangles" line.
 *
 * Returns the SAME store reference when nothing moved (the no-op rule).
 */
export function normalizeOrder(
  store: LayoutStore,
  opts: { touch?: boolean } = {},
): LayoutStore {
  const home = store.projects[0];
  if (!home) return store;

  // container id -> the entries in it, in enumeration order.
  type Entry = { seq: number; key: number; layout?: Layout; project?: Project };
  const containers = new Map<string, Entry[]>();
  const bucket = (id: string): Entry[] => {
    const found = containers.get(id);
    if (found) return found;
    const made: Entry[] = [];
    containers.set(id, made);
    return made;
  };
  // Every project gets a bucket even when empty, so a container that exists but
  // holds nothing is still a defined (empty) sequence rather than absent.
  for (const p of store.projects) bucket(p.id);

  let seq = 0;
  for (const l of store.layouts) {
    // A dangling pointer is `assembleStore`'s job, not this function's; bucket it
    // under its own id so nothing is silently dropped if the two ever disagree.
    bucket(l.projectId).push({ seq: seq++, key: rank(l.order), layout: l });
  }
  for (let i = 1; i < store.projects.length; i++) {
    const p = store.projects[i];
    bucket(home.id).push({ seq: seq++, key: rank(p.order), project: p });
  }

  const newOrder = new Map<string, number>();
  for (const entries of containers.values()) {
    entries.sort((a, b) => (a.key !== b.key ? a.key - b.key : a.seq - b.seq));
    entries.forEach((e, i) => newOrder.set(e.layout ? e.layout.id : e.project!.id, i));
  }

  let changed = false;
  const now = Date.now();
  const layouts = store.layouts.map((l) => {
    const next = newOrder.get(l.id);
    // `Object.is`, not `===`: a stored `-0` is `=== 0` and would survive as the
    // canonical rank, so "every rank is a dense non-negative integer" would be
    // true of the sort and false of the data.
    if (next === undefined || Object.is(next, l.order)) return l;
    changed = true;
    return { ...l, order: next, updatedAt: opts.touch ? now : l.updatedAt };
  });
  const projects = store.projects.map((p, i) => {
    // The home project is the container, not an item in it. Pinned at 0 so the
    // field always holds a defined number and no consumer needs a branch.
    const next = i === 0 ? 0 : newOrder.get(p.id);
    if (next === undefined || Object.is(next, p.order)) return p;
    changed = true;
    return { ...p, order: next };
  });
  return changed ? { ...store, layouts, projects } : store;
}

/** Highest rank currently used in a container, or -1 when it is empty. */
function maxRankIn(store: LayoutStore, projectId: string): number {
  let max = -1;
  for (const l of store.layouts) {
    if (l.projectId === projectId) max = Math.max(max, rank(l.order) === Infinity ? -1 : l.order);
  }
  if (isHomeProject(store, projectId)) {
    for (let i = 1; i < store.projects.length; i++) {
      const o = rank(store.projects[i].order);
      if (o !== Infinity) max = Math.max(max, o);
    }
  }
  return max;
}

/**
 * The fractional order that lands an item at visual index `at` in a container
 * whose ranks are already dense integers: `at - 0.5` sits strictly between
 * `at - 1` and `at`. `null` appends.
 */
function slotOrder(store: LayoutStore, projectId: string, at: number | null): number {
  return at === null ? maxRankIn(store, projectId) + 1 : at - 0.5;
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
      // Absent on every pre-S29 record, and junk on a hostile one. `Infinity`
      // rather than a made-up integer: it means "unplaced", and `normalizeOrder`
      // sends unplaced items to the end of their container in array order —
      // which for an all-old store is the identity.
      order:
        typeof p.order === 'number' && Number.isFinite(p.order) ? p.order : Number.POSITIVE_INFINITY,
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

  // 5 — every container is a dense integer rank sequence. `touch: false` is
  // load-path discipline: re-deriving the arrangement must not rewrite the
  // user's `updatedAt` timestamps, which is both the S8 "load never mangles"
  // line and pointless (`persistedRef` is seeded from this already-repaired
  // store, so the autosave diff would see no change anyway).
  return normalizeOrder({ layouts: finalLayouts, activeId, projects }, { touch: false });
}

// ---------------------------------------------------------------------------
// Store operations. Every one returns the SAME store reference on a no-op, so
// `historyPush`'s reference-dedup drops it and no spurious undo entry appears
// (the S14 rotate-a-wall lesson).

/**
 * Make `name` unique among `taken`, appending " 2", " 3"… — because folder names
 * are USER-FACING IDENTITY here, not decoration: `findOrCreateProject` matches an
 * import on name, and two folders called "Ideas" would silently file the second
 * one's exports into the first. It also mints two identical `aria-label`s in the
 * gallery. Bounded by `MAX_PROJECTS`, so the loop always terminates.
 */
function uniqueName(taken: Project[], name: string): string {
  const used = new Set(taken.map((p) => p.name.trim().toLowerCase()));
  if (!used.has(name.trim().toLowerCase())) return name;
  for (let n = 2; n <= MAX_PROJECTS + 1; n++) {
    const candidate = `${name} ${n}`.slice(0, MAX_PROJECT_NAME_LEN);
    if (!used.has(candidate.trim().toLowerCase())) return candidate;
  }
  return name;
}

export function addProject(store: LayoutStore, name: string): LayoutStore {
  const next = addProjectAt(store, name, null);
  return next ? next.store : store;
}

/**
 * `addProject` that reports the id it minted, and can place the tile at a given
 * slot on the home grid.
 *
 * The id matters: `addProject` mints it INSIDE itself and returns only the
 * store, so a caller running inside a `setStore` updater can never learn it —
 * which is why a merge could not name its own folder in a toast or open the
 * rename dialog. `findOrCreateProject` already digs it out with
 * `next.projects[next.projects.length - 1]`; this is that pattern made honest.
 *
 * Returns `null` at `MAX_PROJECTS` rather than the same store, so the caller can
 * say WHY nothing happened. A silent no-op behind a drag reads as a broken drop.
 */
export function addProjectAt(
  store: LayoutStore,
  name: string,
  at: number | null,
): { store: LayoutStore; projectId: string } | null {
  if (store.projects.length >= MAX_PROJECTS) return null;
  const home = store.projects[0];
  const project: Project = {
    id: createId('project'),
    name: uniqueName(store.projects, cleanName(name, `Project ${store.projects.length + 1}`)),
    createdAt: Date.now(),
    order: home ? slotOrder(store, home.id, at) : 0,
  };
  const next = normalizeOrder(
    { ...store, projects: [...store.projects, project] },
    { touch: true },
  );
  return { store: next, projectId: project.id };
}

/**
 * Drop one design onto another: BOTH move into a brand-new folder, which takes
 * the target's slot on the home grid — the Android gesture, where the folder
 * appears exactly where the icon you dropped onto was.
 *
 * ATOMIC on purpose. Built out of `addProject` + two `moveLayoutToProject`s it
 * would be three store writes with two visible intermediate states (a folder
 * that exists and is empty, then one holding a single design), and an
 * interruption between them leaves the empty folder behind for ever.
 *
 * `null` when the folder cap is reached or the two ids do not name two distinct
 * real layouts — never a silent same-store return, for the reason above.
 */
export function mergeIntoNewProject(
  store: LayoutStore,
  dragId: string,
  targetId: string,
  name: string,
): { store: LayoutStore; projectId: string } | null {
  if (dragId === targetId) return null;
  const drag = store.layouts.find((l) => l.id === dragId);
  const target = store.layouts.find((l) => l.id === targetId);
  if (!drag || !target) return null;
  // The new tile inherits the TARGET's slot. Read before anything moves: once
  // both layouts leave the home container that rank is free, so the tile lands
  // exactly where the design the user aimed at was standing.
  const home = store.projects[0];
  const at = target.projectId === home?.id ? rank(target.order) : null;
  const made = addProjectAt(store, name, Number.isFinite(at as number) ? (at as number) : null);
  if (!made) return null;
  const now = Date.now();
  const moved = made.store.layouts.map((l) => {
    if (l.id !== dragId && l.id !== targetId) return l;
    // The target keeps precedence — it was already there and the dragged design
    // joined it, which is the order Android shows in the folder preview too.
    return {
      ...l,
      projectId: made.projectId,
      order: l.id === targetId ? 0 : 1,
      updatedAt: now,
    };
  });
  return {
    store: normalizeOrder({ ...made.store, layouts: moved }, { touch: true }),
    projectId: made.projectId,
  };
}

export function renameProject(store: LayoutStore, id: string, name: string): LayoutStore {
  if (!name.trim() || !store.projects.some((p) => p.id === id)) return store;
  const next = uniqueName(
    store.projects.filter((p) => p.id !== id),
    name.trim().slice(0, MAX_PROJECT_NAME_LEN),
  );
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
  // APPEND the re-homed designs rather than carrying their old ranks across.
  // Measured on the pre-S29 tree: without this, two independently-arranged
  // sequences land in one container with colliding ranks and are RIFFLE-SHUFFLED
  // — `A1 B1 A2 B2 A3 B3` — because `order` is a coordinate in a container and
  // this function is one of the three writers of `projectId`.
  let next = maxRankIn({ ...store, projects }, target.id) + 1;
  return normalizeOrder(
    {
      ...store,
      projects,
      layouts: store.layouts.map((l) =>
        // updatedAt MUST bump: it is the entire IndexedDB autosave change detector,
        // so without it the re-home renders correctly and vanishes on reload.
        l.projectId === id
          ? { ...l, projectId: target.id, order: next++, updatedAt: Date.now() }
          : l,
      ),
    },
    { touch: true },
  );
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

/**
 * Move one layout into another folder, appending it there.
 *
 * `order` is RE-STAMPED, and that is not tidiness. Measured on the pre-S29
 * tree, carrying the old rank across means where a design lands is decided by
 * its position in the folder it LEFT: moving a design that was first in its old
 * folder into `{A1:0, A2:1}` put it at the FRONT, ahead of designs the user had
 * deliberately arranged.
 */
export function moveLayoutToProject(
  store: LayoutStore,
  layoutId: string,
  projectId: string,
  at: number | null = null,
): LayoutStore {
  const layout = store.layouts.find((l) => l.id === layoutId);
  if (!layout) return store;
  if (!store.projects.some((p) => p.id === projectId)) return store;
  // Same folder AND no explicit slot is the only true no-op; a same-folder move
  // WITH a slot is a reorder, which is a real change.
  if (layout.projectId === projectId && at === null) return store;
  const order = slotOrder(store, projectId, at);
  return normalizeOrder(
    {
      ...store,
      layouts: store.layouts.map((l) =>
        l.id === layoutId ? { ...l, projectId, order, updatedAt: Date.now() } : l,
      ),
    },
    { touch: true },
  );
}

/**
 * Reposition a folder TILE on the home grid. The mirror of a layout reorder, and
 * it shares the same coordinate space — that shared space is what lets a tile
 * sit between two designs.
 *
 * The home project itself has no tile (it IS the grid), so it cannot be moved.
 */
export function moveProjectToSlot(store: LayoutStore, projectId: string, at: number): LayoutStore {
  const home = store.projects[0];
  if (!home || projectId === home.id) return store;
  if (!store.projects.some((p) => p.id === projectId)) return store;
  const order = slotOrder(store, home.id, at);
  return normalizeOrder(
    {
      ...store,
      projects: store.projects.map((p) => (p.id === projectId ? { ...p, order } : p)),
    },
    { touch: true },
  );
}

/**
 * Remove a folder that a drag has just emptied — the Android behaviour where
 * dragging the last icon out makes the folder disappear.
 *
 * Refuses unless the folder is genuinely EMPTY, which is what makes it safe:
 * at zero layouts there is nothing to lose, so this can run without a confirm
 * and without contending for the single shared undo slot that `deleteProject`
 * needs. It also refuses on the home project and at one folder, mirroring
 * `removeProject`.
 *
 * Deliberately NOT called when a folder merely drops to one design: Android
 * dissolves at one, but a one-design folder here is a container the user may be
 * filling, and dissolving it would move a design they did not touch.
 */
export function dissolveEmptyProject(store: LayoutStore, projectId: string): LayoutStore {
  if (isHomeProject(store, projectId) || store.projects.length <= 1) return store;
  if (!store.projects.some((p) => p.id === projectId)) return store;
  if (store.layouts.some((l) => l.projectId === projectId)) return store;
  return normalizeOrder(
    { ...store, projects: store.projects.filter((p) => p.id !== projectId) },
    { touch: true },
  );
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

/**
 * The layouts in one folder, in DISPLAY order.
 *
 * Sorted by `order` rather than trusting `store.layouts` array position: a
 * mutation writes a new rank without moving the array element, so the two agree
 * only by accident. `normalizeOrder` has already made the ranks dense integers,
 * and the array index breaks a tie so the result is total even on a hand-built
 * fixture that never went through it.
 */
export function layoutsInProject(store: LayoutStore, projectId: string): Layout[] {
  return store.layouts
    .map((l, i) => ({ l, i }))
    .filter((e) => e.l.projectId === projectId)
    .sort((a, b) => {
      const d = rank(a.l.order) - rank(b.l.order);
      return d !== 0 ? d : a.i - b.i;
    })
    .map((e) => e.l);
}
