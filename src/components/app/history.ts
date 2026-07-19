import type { Scene } from '../../engine/types';

/** Per-layout undo/redo stacks. Scenes are stored by reference (whole-scene
 *  snapshots), so undo restores the exact object the editor last committed. */
export interface HistoryBucket {
  past: Scene[];
  future: Scene[];
}

/** Cap on retained undo snapshots per layout (matches the pre-refactor limit). */
export const HISTORY_CAP = 500;

export function emptyBucket(): HistoryBucket {
  return { past: [], future: [] };
}

/**
 * Drop undo buckets for layouts that are gone (the historyRef leak fix). Mutates
 * `map` in place. `keepId` protects a just-deleted layout whose Undo can still
 * restore it — so undo-after-undelete keeps its full scene stack.
 */
export function reapHistory(
  map: Map<string, HistoryBucket>,
  liveIds: Set<string>,
  keepId?: string,
): void {
  for (const id of [...map.keys()]) {
    if (!liveIds.has(id) && id !== keepId) map.delete(id);
  }
}

/**
 * Record a scene edit. Returns a NEW bucket (never mutates the input).
 *
 * - `coalesce: false` (a discrete edit or the first frame of a gesture) pushes
 *   the pre-edit scene onto `past`, unless it is already the top entry (dedup).
 * - `coalesce: true` (a continued drag frame / held-key repeat) folds into the
 *   current entry — no push.
 * - `future` is ALWAYS cleared on any scene-changing edit, push or not, so a new
 *   edit after an undo correctly discards the redo stack.
 */
export function historyPush(
  bucket: HistoryBucket,
  preScene: Scene,
  opts: { coalesce: boolean; cap?: number },
): HistoryBucket {
  const cap = opts.cap ?? HISTORY_CAP;
  const shouldPush = !opts.coalesce && bucket.past[bucket.past.length - 1] !== preScene;
  if (!shouldPush) return { past: bucket.past, future: [] };
  let past = [...bucket.past, preScene];
  if (past.length > cap) past = past.slice(past.length - cap);
  return { past, future: [] };
}

/**
 * Undo: target scene is the top of `past`; the current scene moves onto `future`.
 * Returns `null` when there is nothing to undo (so callers can no-op the store).
 */
export function historyUndo(
  bucket: HistoryBucket,
  currentScene: Scene,
): { bucket: HistoryBucket; scene: Scene } | null {
  if (bucket.past.length === 0) return null;
  const scene = bucket.past[bucket.past.length - 1];
  return {
    scene,
    bucket: { past: bucket.past.slice(0, -1), future: [...bucket.future, currentScene] },
  };
}

/**
 * Redo: target scene is the top of `future`; the current scene moves onto `past`.
 * Returns `null` when there is nothing to redo.
 */
export function historyRedo(
  bucket: HistoryBucket,
  currentScene: Scene,
  cap = HISTORY_CAP,
): { bucket: HistoryBucket; scene: Scene } | null {
  if (bucket.future.length === 0) return null;
  const scene = bucket.future[bucket.future.length - 1];
  let past = [...bucket.past, currentScene];
  if (past.length > cap) past = past.slice(past.length - cap);
  return { scene, bucket: { past, future: bucket.future.slice(0, -1) } };
}
