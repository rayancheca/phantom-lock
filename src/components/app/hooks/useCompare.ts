import { useState } from 'react';
import type { Layout, LayoutStore, Scene } from '../../../engine/types';
import type { Scenario } from '../../compare/ScenarioCompare';
import { activeListener, sceneListeners } from '../../../engine/scene';

interface Args {
  scene: Scene;
  store: LayoutStore;
  active: Layout;
  dismissToast: () => void;
  closeFloatingPanels: () => void;
  setGalleryOpen: (v: boolean) => void;
}

export interface CompareState {
  /** The open N-up comparison, or null. */
  compare: Scenario[] | null;
  setCompare: (s: Scenario[] | null) => void;
  openCompare: () => void;
  /** Whether there are two comparable things to compare. */
  canCompare: boolean;
}

/**
 * The N-up scenario comparison's entry point, extracted from AppInner in S37.
 *
 * The `compare` state comes with it rather than staying behind, because
 * `openCompare` is its only non-trivial writer and the two belong together —
 * but note the setter is still returned, since AppInner hands `() =>
 * setCompare(null)` to three different closers (the overlay, the tutorial, and
 * AppDialogs).
 */
export function useCompare(a: Args): CompareState {
  const [compare, setCompare] = useState<Scenario[] | null>(null);

  /** Open the N-up compare, seeded with the two most useful scenarios: two seats
   *  of this layout if it has them, else this layout vs a sibling design (one from
   *  the same project first — those are the variants you actually want side by
   *  side). The user adds further columns from inside. */
  const openCompare = () => {
    const seats = sceneListeners(a.scene);
    const here = a.active.id;
    let initial: Scenario[];
    if (seats.length >= 2) {
      initial = [
        { layoutId: here, seatId: seats[0].id },
        { layoutId: here, seatId: seats[1].id },
      ];
    } else if (a.store.layouts.length >= 2) {
      const sibling =
        a.store.layouts.find((l) => l.id !== here && l.projectId === a.active.projectId) ??
        a.store.layouts.find((l) => l.id !== here) ??
        a.active;
      initial = [
        { layoutId: here, seatId: activeListener(a.scene).id },
        { layoutId: sibling.id, seatId: sceneListeners(sibling.scene)[0].id },
      ];
    } else {
      const seat = activeListener(a.scene).id;
      initial = [
        { layoutId: here, seatId: seat },
        { layoutId: here, seatId: seat },
      ];
    }
    // A toast's Undo button renders ABOVE the compare layer (z-80 vs z-60) and
    // mutates the store — which would recompute columns and could fire THE LOCK
    // ignition for a lock the user did not just achieve. Compare is read-only, so
    // the toast goes away when it opens.
    a.dismissToast();
    a.closeFloatingPanels();
    a.setGalleryOpen(false);
    setCompare(initial);
  };

  /** Compare needs two comparable things. Two projects do not add comparability on
   *  their own — a project with no layouts has nothing to show — but two layouts
   *  in different projects are already covered by the layout count. */
  const canCompare = sceneListeners(a.scene).length >= 2 || a.store.layouts.length >= 2;

  return { compare, setCompare, openCompare, canCompare };
}
