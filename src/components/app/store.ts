import type { Layout, LayoutStore } from '../../engine/types';

/**
 * Replace a single layout in the store by id, applying `fn` to it. Returns a new
 * store (never mutates); non-matching layouts keep their identity so React can
 * bail out of re-rendering them. Replaces the ~6 hand-rolled
 * `layouts.map(l => l.id === X ? … : l)` reducer blocks.
 */
export function updateLayout(
  store: LayoutStore,
  id: string,
  fn: (layout: Layout) => Layout,
): LayoutStore {
  return {
    ...store,
    layouts: store.layouts.map((l) => (l.id === id ? fn(l) : l)),
  };
}
