import { useCallback, useState } from 'react';
import type { LayoutStore, Scene } from '../../../engine/types';
import { makeLayout } from '../../../engine/scene';
import { activeProject } from '../../../engine/projects';
import type { AppMode, DesignSubStep, ModeEntry } from '../mode';
import {
  PRACTICE_LAYOUT_NAME,
  armPairDemo,
  breakLock,
  clearSpeakers,
  pairFirstTwo,
  practiceScene,
} from '../../tutorial/actions';
import type { TutorialActionName } from '../../tutorial/types';

interface Args {
  store: LayoutStore;
  setStore: (updater: LayoutStore | ((s: LayoutStore) => LayoutStore)) => void;
  setScene: (updater: (s: Scene) => Scene) => void;
  afterLayoutSwitch: (nextScene: Scene) => void;
  switchLayout: (id: string) => void;
  applyMode: (entry: ModeEntry, sceneNow?: Scene) => void;
  addSeat: () => void;
  openCompare: () => void;
  closeCompare: () => void;
  setGalleryOpen: (b: boolean) => void;
}

export interface TutorialControls {
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  /** True while a step card is on screen. */
  running: boolean;
  setRunning: (b: boolean) => void;
  runAction: (action: TutorialActionName) => void;
  enterMode: (mode: AppMode, subStep?: DesignSubStep) => void;
}

/**
 * The tutorial's seam into the App (S21) — extracted rather than inlined because
 * `App.tsx` is already well past this project's 800-line file cap, and because
 * it keeps the mapping from "declarative action name" to "real app command" in
 * one readable place.
 *
 * The runner never edits a scene itself; it names an action and this hook
 * performs it through the SAME setters every other feature uses. That is what
 * stops the tutorial becoming a second implementation of the app that drifts
 * away from it and then teaches something untrue.
 *
 * DATA SAFETY: `practice-room` is the only action that creates anything, and it
 * creates a clearly-named DISPOSABLE layout and switches to it. Every scene-
 * editing action below therefore lands on that practice layout in the normal
 * flow of the tour. Nothing here deletes, overwrites, or reshapes a layout the
 * user made — and because the practice room is found by name and reused, running
 * the tour repeatedly cannot litter the gallery with copies.
 */
export function useTutorial(a: Args): TutorialControls {
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const enterMode = useCallback(
    (mode: AppMode, subStep?: DesignSubStep) => {
      a.applyMode({ mode, designSubStep: subStep ?? 'build' });
    },
    // `applyMode` changes identity on every scene edit; calling it through the
    // latest render's closure is correct, so it is deliberately in the deps.
    [a],
  );

  /**
   * Enter the disposable practice room, creating it only if it is not already
   * there. Reuse-by-name matters: a tour re-run must not add a second, third and
   * fourth "Tutorial practice room" to the user's gallery.
   */
  const enterPracticeRoom = useCallback(() => {
    const existing = a.store.layouts.find((l) => l.name === PRACTICE_LAYOUT_NAME);
    if (existing) {
      if (existing.id !== a.store.activeId) a.switchLayout(existing.id);
      return;
    }
    const scene = practiceScene();
    const layout = makeLayout(PRACTICE_LAYOUT_NAME, scene, undefined, activeProject(a.store).id);
    a.setStore((st) => ({ ...st, layouts: [...st.layouts, layout], activeId: layout.id }));
    a.afterLayoutSwitch(scene);
  }, [a]);

  const runAction = useCallback(
    (action: TutorialActionName) => {
      switch (action) {
        case 'practice-room':
          enterPracticeRoom();
          return;
        case 'place-two-pods':
          // `armPairDemo`, not `placeTwoPods`: the practice room is reused by
          // name, so on a repeat run it still holds last run's locked pair.
          // Re-arming makes the pairing step's false->true edge unconditional —
          // without it the tour's climax is silently dead on every run but the
          // first. See the header of `actions.ts`.
          a.setScene((s) => armPairDemo(s));
          return;
        case 'pair-them':
          a.setScene((s) => pairFirstTwo(s));
          return;
        case 'break-lock':
          a.setScene((s) => breakLock(s));
          return;
        case 'clear-speakers':
          a.setScene((s) => clearSpeakers(s));
          return;
        case 'add-seat':
          a.addSeat();
          return;
        case 'open-gallery':
          a.setGalleryOpen(true);
          return;
        case 'close-gallery':
          a.setGalleryOpen(false);
          return;
        case 'open-compare':
          a.openCompare();
          return;
        case 'close-compare':
          a.closeCompare();
          return;
        default: {
          // Exhaustiveness: a new action name is a compile error here, not a
          // silently ignored step at runtime.
          const never: never = action;
          void never;
        }
      }
    },
    [a, enterPracticeRoom],
  );

  return { menuOpen, openMenu, closeMenu, running, setRunning, runAction, enterMode };
}
