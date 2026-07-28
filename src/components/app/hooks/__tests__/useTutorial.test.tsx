import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTutorial } from '../useTutorial';
import { PRACTICE_LAYOUT_NAME } from '../../../tutorial/actions';
import { seededDefaultStore } from '../../../../engine/seed';
import { traceScene } from '../../../../engine/raytrace';
import { computeAudio } from '../../../../engine/stereo';
import { DEFAULT_SETTINGS, makeLayout, blankScene } from '../../../../engine/scene';
import { activeProject } from '../../../../engine/projects';
import type { LayoutStore, Scene } from '../../../../engine/types';

/**
 * The tutorial's seam into the App — the ONLY place the tour writes anything.
 *
 * This is where "the tutorial mutates no layout the user created" is either true
 * or false, so it is tested against the REAL seeded workspace rather than a
 * hand-built fixture: the failure mode that matters is a write landing on one of
 * the user's six designs, and only a realistic store can show that.
 */

const lockedIn = (scene: Scene): boolean => {
  const trace = traceScene(scene, DEFAULT_SETTINGS.rayCount, DEFAULT_SETTINGS.maxBounces);
  return computeAudio(scene, trace, DEFAULT_SETTINGS.tvAnchor).pairs.some((p) => p.locked);
};

/** A harness that models the App's store + active-scene wiring closely enough
 *  to observe exactly which layout each action touches. */
function harness(initial: LayoutStore = seededDefaultStore()) {
  const state = { store: initial };
  const spies = {
    addSeat: vi.fn(),
    openCompare: vi.fn(),
    closeCompare: vi.fn(),
    setGalleryOpen: vi.fn(),
    applyMode: vi.fn(),
    afterLayoutSwitch: vi.fn(),
  };
  const setStore = (u: LayoutStore | ((s: LayoutStore) => LayoutStore)) => {
    state.store = typeof u === 'function' ? u(state.store) : u;
  };
  // `setScene` writes to the ACTIVE layout, exactly as useSceneHistory does.
  const setScene = (fn: (s: Scene) => Scene) => {
    setStore((st) => ({
      ...st,
      layouts: st.layouts.map((l) => (l.id === st.activeId ? { ...l, scene: fn(l.scene) } : l)),
    }));
  };
  const switchLayout = (id: string) => setStore((st) => ({ ...st, activeId: id }));

  const view = renderHook(() =>
    useTutorial({
      store: state.store,
      setStore,
      setScene,
      afterLayoutSwitch: spies.afterLayoutSwitch,
      switchLayout,
      applyMode: spies.applyMode,
      addSeat: spies.addSeat,
      openCompare: spies.openCompare,
      closeCompare: spies.closeCompare,
      setGalleryOpen: spies.setGalleryOpen,
    }),
  );
  const run = (action: Parameters<typeof view.result.current.runAction>[0]) => {
    act(() => view.result.current.runAction(action));
    view.rerender();
  };
  /** Switch the active layout the way the App would, and re-render so the hook
   *  observes it — `renderHook` captures props at render time, so mutating the
   *  backing store alone leaves the callbacks closed over the previous value. */
  const setActive = (id: string) => {
    setStore((st) => ({ ...st, activeId: id }));
    view.rerender();
  };
  return { state, spies, view, run, setActive };
}

const activeScene = (store: LayoutStore): Scene =>
  store.layouts.find((l) => l.id === store.activeId)!.scene;
const practiceOf = (store: LayoutStore) => store.layouts.filter((l) => l.name === PRACTICE_LAYOUT_NAME);

describe('useTutorial — menu state', () => {
  it('opens and closes the chapter menu', () => {
    const { view } = harness();
    expect(view.result.current.menuOpen).toBe(false);
    act(() => view.result.current.openMenu());
    expect(view.result.current.menuOpen).toBe(true);
    act(() => view.result.current.closeMenu());
    expect(view.result.current.menuOpen).toBe(false);
  });

  it('enterMode forwards to applyMode with a concrete sub-step', () => {
    const { view, spies } = harness();
    act(() => view.result.current.enterMode('design', 'furnish'));
    expect(spies.applyMode).toHaveBeenCalledWith({ mode: 'design', designSubStep: 'furnish' });
    act(() => view.result.current.enterMode('tune'));
    expect(spies.applyMode).toHaveBeenLastCalledWith({ mode: 'tune', designSubStep: 'build' });
  });
});

describe('useTutorial — the practice room', () => {
  it('creates exactly one, files it in a REAL project, and makes it active', () => {
    const { state, run } = harness();
    const before = state.store.layouts.length;
    run('practice-room');

    const made = practiceOf(state.store);
    expect(made).toHaveLength(1);
    expect(state.store.layouts.length).toBe(before + 1);
    expect(state.store.activeId).toBe(made[0].id);
    // A projectId that does not resolve makes the layout invisible in the
    // folder-grouped gallery until a reload silently re-homes it.
    expect(state.store.projects.some((p) => p.id === made[0].projectId)).toBe(true);
  });

  it('preserves the store shape — projects must survive the setStore write', () => {
    // A non-spreading setStore literal drops `projects` entirely (the S20
    // lesson). Required-in-memory typing catches it under `npm run build`, but
    // not under `npm test`, so assert it directly.
    const { state, run } = harness();
    const projectsBefore = state.store.projects;
    run('practice-room');
    expect(state.store.projects).toEqual(projectsBefore);
    expect(state.store.layouts.every((l) => typeof l.projectId === 'string')).toBe(true);
  });

  it('reuses the same practice room on a second run instead of littering the gallery', () => {
    const { state, run, setActive } = harness();
    run('practice-room');
    const firstId = practiceOf(state.store)[0].id;
    // Wander off to one of the user's own designs, then re-enter the tour.
    setActive(state.store.layouts[0].id);
    expect(state.store.activeId).not.toBe(firstId);
    run('practice-room');
    expect(practiceOf(state.store), 'a re-run must not add a second practice room').toHaveLength(1);
    expect(state.store.activeId).toBe(firstId);
  });

  it('is a no-op when the practice room is already active', () => {
    const { state, run } = harness();
    run('practice-room');
    const snapshot = state.store.layouts.length;
    run('practice-room');
    expect(state.store.layouts.length).toBe(snapshot);
  });
});

describe('useTutorial — data safety', () => {
  it('the full spine writes to the practice room and NOTHING else', () => {
    const store = seededDefaultStore();
    const before = new Map(store.layouts.map((l) => [l.id, JSON.stringify(l.scene)]));
    const { state, run } = harness(store);

    run('practice-room');
    run('place-two-pods');
    run('pair-them');
    run('break-lock');

    for (const l of state.store.layouts) {
      if (l.name === PRACTICE_LAYOUT_NAME) continue;
      expect(JSON.stringify(l.scene), `layout "${l.name}" was modified`).toBe(before.get(l.id));
    }
  });

  it('reaches a real lock inside the practice room', () => {
    const { state, run } = harness();
    run('practice-room');
    run('place-two-pods');
    expect(lockedIn(activeScene(state.store))).toBe(false);
    run('pair-them');
    expect(lockedIn(activeScene(state.store))).toBe(true);
  });

  it('a SECOND spine run still produces the unlocked -> locked edge', () => {
    const { state, run } = harness();
    run('practice-room');
    run('place-two-pods');
    run('pair-them');
    expect(lockedIn(activeScene(state.store))).toBe(true);

    // Re-run: the room is reused and still holds the locked pair.
    run('practice-room');
    run('place-two-pods');
    expect(lockedIn(activeScene(state.store)), 're-entry must re-arm').toBe(false);
    run('pair-them');
    expect(lockedIn(activeScene(state.store))).toBe(true);
  });

  it('break-lock drops the lock without deleting anything', () => {
    const { state, run } = harness();
    run('practice-room');
    run('place-two-pods');
    run('pair-them');
    run('break-lock');
    const s = activeScene(state.store);
    expect(lockedIn(s)).toBe(false);
    expect(s.speakers).toHaveLength(2);
    expect(s.pairs).toHaveLength(1);
  });

});

describe('useTutorial — the remaining actions delegate rather than reimplement', () => {
  it('routes seat, gallery and compare actions to the App', () => {
    const { spies, run } = harness();
    run('add-seat');
    expect(spies.addSeat).toHaveBeenCalledTimes(1);
    run('open-gallery');
    expect(spies.setGalleryOpen).toHaveBeenLastCalledWith(true);
    run('close-gallery');
    expect(spies.setGalleryOpen).toHaveBeenLastCalledWith(false);
    run('open-compare');
    expect(spies.openCompare).toHaveBeenCalledTimes(1);
    run('close-compare');
    expect(spies.closeCompare).toHaveBeenCalledTimes(1);
  });
});

describe('useTutorial — hostile stores', () => {
  it('files the practice room correctly in a single-project store', () => {
    const base = seededDefaultStore();
    const one: LayoutStore = {
      ...base,
      projects: [base.projects[0]],
      layouts: base.layouts.filter((l) => l.projectId === base.projects[0].id),
    };
    const { state, run } = harness(one);
    run('practice-room');
    expect(practiceOf(state.store)[0].projectId).toBe(activeProject(one).id);
  });

  it('does not throw on a store holding a single empty layout', () => {
    const base = seededDefaultStore();
    const lone = makeLayout('Only one', blankScene(), undefined, base.projects[0].id);
    const store: LayoutStore = { ...base, layouts: [lone], activeId: lone.id };
    const { state, run } = harness(store);
    expect(() => {
      run('practice-room');
      run('place-two-pods');
      run('pair-them');
    }).not.toThrow();
    expect(practiceOf(state.store)).toHaveLength(1);
    expect(state.store.layouts.find((l) => l.id === lone.id)!.scene.speakers).toHaveLength(0);
  });
});
