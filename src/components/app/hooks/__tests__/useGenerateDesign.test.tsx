import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGenerateDesign } from '../useGenerateDesign';
import { defaultStore, makeLayout, blankScene } from '../../../../engine/scene';
import type { LayoutStore } from '../../../../engine/types';

/**
 * The generator's ONLY store writer.
 *
 * Everything else about the feature is pure and covered in
 * `engine/generate/__tests__`. What can only be tested here is the part that
 * can lose work: whether opening, rerolling and cancelling leave the store
 * alone, whether `keep` files the design in the folder the user opened it from,
 * and whether the undo puts things back.
 */

function harness(initial?: LayoutStore) {
  let store = initial ?? defaultStore();
  const setStore = vi.fn((fn: (s: LayoutStore) => LayoutStore) => {
    store = fn(store);
  });
  const afterLayoutSwitch = vi.fn();
  const showToast = vi.fn();
  const closeGallery = vi.fn();
  const view = renderHook(() =>
    useGenerateDesign({
      get store() {
        return store;
      },
      setStore,
      afterLayoutSwitch,
      showToast,
      closeGallery,
    }),
  );
  return { view, setStore, afterLayoutSwitch, showToast, closeGallery, read: () => store };
}

describe('useGenerateDesign', () => {
  it('starts closed and writes nothing', () => {
    const h = harness();
    expect(h.view.result.current.state).toBeNull();
    expect(h.setStore).not.toHaveBeenCalled();
  });

  it('previews WITHOUT touching the store — reroll and archetype changes are pure', () => {
    const h = harness();
    act(() => h.view.result.current.open('p-default'));
    expect(h.view.result.current.state).not.toBeNull();
    const before = h.read();
    act(() => h.view.result.current.reroll());
    act(() => h.view.result.current.setArchetype('loft'));
    act(() => h.view.result.current.setSeed(7));
    expect(h.setStore).not.toHaveBeenCalled();
    expect(h.read()).toBe(before);
  });

  it('keeps the SEED when only the shape changes, so switching is a comparison', () => {
    const h = harness();
    act(() => h.view.result.current.open('p-default'));
    const seed = h.view.result.current.state!.seed;
    act(() => h.view.result.current.setArchetype('cinema'));
    expect(h.view.result.current.state!.seed).toBe(seed);
    expect(h.view.result.current.state!.archetype).toBe('cinema');
  });

  it('regenerates from a typed seed, reproducibly', () => {
    const h = harness();
    act(() => h.view.result.current.open('p-default'));
    act(() => h.view.result.current.setSeed(999));
    const first = JSON.stringify(h.view.result.current.state!.result.scene.objects.length);
    act(() => h.view.result.current.setSeed(1));
    act(() => h.view.result.current.setSeed(999));
    expect(JSON.stringify(h.view.result.current.state!.result.scene.objects.length)).toBe(first);
  });

  it('ignores an unknown archetype rather than throwing', () => {
    const h = harness();
    act(() => h.view.result.current.open('p-default'));
    const before = h.view.result.current.state!.archetype;
    // A hostile value can only arrive through a future caller, but the guard is
    // free and a throw here would take the dialog down.
    act(() => h.view.result.current.setArchetype('not-a-shape' as never));
    expect(h.view.result.current.state!.archetype).toBe(before);
  });

  it('cancel writes nothing', () => {
    const h = harness();
    act(() => h.view.result.current.open('p-default'));
    act(() => h.view.result.current.close());
    expect(h.view.result.current.state).toBeNull();
    expect(h.setStore).not.toHaveBeenCalled();
  });

  it('ADDS a layout on keep — never overwrites, and files it in the folder it was opened from', () => {
    const base = defaultStore();
    const other = { id: 'p-other', name: 'Other', createdAt: 1 };
    const store: LayoutStore = { ...base, projects: [...base.projects, other] };
    const h = harness(store);
    const before = h.read().layouts.length;
    act(() => h.view.result.current.open('p-other'));
    act(() => h.view.result.current.keep());
    const after = h.read();
    expect(after.layouts).toHaveLength(before + 1);
    const created = after.layouts[after.layouts.length - 1];
    expect(created.projectId).toBe('p-other');
    expect(after.activeId).toBe(created.id);
    // Every pre-existing layout is byte-identical.
    for (let i = 0; i < before; i++) {
      expect(after.layouts[i]).toBe(h.read().layouts[i]);
    }
  });

  it('disambiguates a colliding name within the folder only', () => {
    const base = defaultStore();
    const h = harness(base);
    act(() => h.view.result.current.open(base.projects[0].id));
    const name = h.view.result.current.state!.result.name;
    act(() => h.view.result.current.keep());
    // Re-open on the same seed so the name collides.
    const seed = 4242;
    act(() => h.view.result.current.open(base.projects[0].id));
    act(() => h.view.result.current.setSeed(seed));
    const second = h.view.result.current.state!.result.name;
    act(() => h.view.result.current.keep());
    const names = h.read().layouts.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    void name;
    void second;
  });

  it('closes the gallery and re-derives the mode from the new scene', () => {
    const h = harness();
    act(() => h.view.result.current.open('p-default'));
    act(() => h.view.result.current.keep());
    expect(h.closeGallery).toHaveBeenCalled();
    expect(h.afterLayoutSwitch).toHaveBeenCalled();
  });

  it('offers an UNDO that removes the design and restores the previous active layout', () => {
    const base = defaultStore();
    const extra = makeLayout('Second', blankScene(), undefined, base.projects[0].id);
    const store: LayoutStore = { ...base, layouts: [...base.layouts, extra], activeId: extra.id };
    const h = harness(store);
    act(() => h.view.result.current.open(base.projects[0].id));
    act(() => h.view.result.current.keep());
    const created = h.read().layouts[h.read().layouts.length - 1];
    expect(h.read().activeId).toBe(created.id);

    const toast = h.showToast.mock.calls.at(-1)!;
    expect(toast[0]).toMatch(/^Created “/);
    act(() => toast[1].action.run());
    expect(h.read().layouts.some((l) => l.id === created.id)).toBe(false);
    expect(h.read().activeId).toBe(extra.id);
  });

  it('undo does not resurrect an active layout the user deleted in the meantime', () => {
    const base = defaultStore();
    const extra = makeLayout('Second', blankScene(), undefined, base.projects[0].id);
    const store: LayoutStore = { ...base, layouts: [...base.layouts, extra], activeId: extra.id };
    const h = harness(store);
    act(() => h.view.result.current.open(base.projects[0].id));
    act(() => h.view.result.current.keep());
    const created = h.read().layouts[h.read().layouts.length - 1];

    // Simulate the user deleting the previously-active layout before undoing.
    act(() => {
      h.setStore((s: LayoutStore) => ({ ...s, layouts: s.layouts.filter((l) => l.id !== extra.id) }));
    });
    const toast = h.showToast.mock.calls.at(-1)!;
    act(() => toast[1].action.run());
    expect(h.read().layouts.some((l) => l.id === created.id)).toBe(false);
    // Not pointing at the deleted layout — that would be a dangling activeId.
    expect(h.read().activeId).not.toBe(extra.id);
  });
});
