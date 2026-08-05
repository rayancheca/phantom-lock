import { useCallback, useRef, useState } from 'react';
import type { Layout, Scene, SimSettings } from '../../../engine/types';
import type { Deleted } from '../app-types';
import type { ToastData } from '../../ui/Toast';
import { arrangeFurniture, type ArrangeItem } from '../../../engine/arrange';
import { suggestPlacement, type PlacementOptions } from '../../../engine/optimize';
import { createId, updateActiveListener } from '../../../engine/scene';

type Proposal = ReturnType<typeof suggestPlacement> | null;
type FurnitureProposal = ReturnType<typeof arrangeFurniture> | null;

interface Args {
  scene: Scene;
  settings: SimSettings;
  active: Layout;
  setScene: (next: (s: Scene) => Scene) => void;
  setSettings: (s: SimSettings) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
  undoScene: () => void;
  /** The app's SINGLE undo slot, minted in AppInner and shared with
   *  useLayoutActions and useProjectActions. Passed in, never created here —
   *  a second ref would silently split the slot in two. */
  lastDeletedRef: React.RefObject<Deleted | null>;
}

export interface Proposals {
  optimizeOpen: boolean;
  setOptimizeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  proposal: Proposal;
  setProposal: React.Dispatch<React.SetStateAction<Proposal>>;
  arrangeOpen: boolean;
  setArrangeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  furnitureProposal: FurnitureProposal;
  setFurnitureProposal: React.Dispatch<React.SetStateAction<FurnitureProposal>>;
  /** Registered by AppInner once `useWallDetection` exists — see below. */
  discardDetectionRef: React.RefObject<() => void>;
  closeFloatingPanels: () => void;
  runOptimizer: (opts: PlacementOptions) => void;
  applyProposal: () => void;
  runArrange: (items: ArrangeItem[]) => void;
  applyArrange: () => void;
}

/**
 * The two canvas-anchored proposal cards — the optimizer and the furniture
 * arranger — plus the one function that closes every floating card. Extracted
 * from AppInner in S37.
 *
 * ⚠️ `discardDetectionRef` and `closeFloatingPanels` move as ONE unit, and that
 * is the whole reason this hook is drawn where it is. `closeFloatingPanels` is
 * created early (mode switches and layout switches call it) while
 * `useWallDetection` is created far below it, because detection needs `scene`
 * and `setScene`. The ref is how AppInner bridges that forward reference, and
 * splitting the two across a hook boundary would turn the bridge into an
 * argument threaded backwards through the file.
 *
 * `closeFloatingPanels` keeps `useCallback([])`. It calls only the four (stable)
 * setters plus `discardDetectionRef.current()` LAST, so its identity never
 * changes — which matters because `applyMode` and `useLayoutActions` both take
 * it as a dependency, and a churning identity there would re-arm the wall tool
 * on unrelated renders. Adding `detection.discard` to that array is the obvious
 * "fix" and is exactly wrong.
 */
export function useProposals(a: Args): Proposals {
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [proposal, setProposal] = useState<Proposal>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [furnitureProposal, setFurnitureProposal] = useState<FurnitureProposal>(null);

  /** `useWallDetection` is created far below this callback (it needs `scene`
   *  and `setScene`), and this callback is deliberately mount-once. A ref is how
   *  the rest of the app bridges that same gap — see `overlayOpenRef`. */
  const discardDetectionRef = useRef<() => void>(() => {});

  /** Floating cards (optimizer, arrange, detected walls) never outlive the
   *  context they were opened in — any step/layout/mode change closes them. */
  const closeFloatingPanels = useCallback(() => {
    setOptimizeOpen(false);
    setProposal(null);
    setArrangeOpen(false);
    setFurnitureProposal(null);
    discardDetectionRef.current();
  }, []);

  const runOptimizer = (opts: PlacementOptions) => {
    setProposal(suggestPlacement(a.scene, opts));
  };

  const runArrange = (items: ArrangeItem[]) => {
    setFurnitureProposal(arrangeFurniture(a.scene, items));
  };

  const applyArrange = () => {
    if (!furnitureProposal || furnitureProposal.objects.length === 0) return;
    const n = furnitureProposal.objects.length;
    a.setScene((s) => ({ ...s, objects: [...s.objects, ...furnitureProposal.objects] }));
    setFurnitureProposal(null);
    setArrangeOpen(false);
    // Every scene-mutating apply is reversible with the same undo toast deletes get.
    a.showToast(`Added ${n} furniture piece${n === 1 ? '' : 's'}`, {
      action: { label: 'Undo', run: a.undoScene },
    });
  };

  const applyProposal = () => {
    if (!proposal || proposal.speakers.length === 0) return;
    const replacing = a.scene.speakers.length > 0;
    if (replacing) {
      a.lastDeletedRef.current = {
        type: 'speakers',
        layoutId: a.active.id,
        speakers: a.scene.speakers,
        pairs: a.scene.pairs,
      };
    }
    const created = proposal.speakers.map((ps) => ({
      id: createId('spk'),
      pos: ps.pos,
      z: ps.z,
      label: ps.label,
      model: ps.model,
      trimDb: ps.trimDb,
    }));
    const pairs = proposal.pairs
      .filter(([i, j]) => created[i] && created[j])
      .map(([i, j]) => [created[i].id, created[j].id] as [string, string]);
    const focus = proposal.focus;
    a.setScene((s) => {
      const withSpeakers = { ...s, speakers: created, pairs };
      // Room-target proposals move YOU there — move the ACTIVE seat + mirror together.
      return focus ? updateActiveListener(withSpeakers, { pos: focus }) : withSpeakers;
    });
    a.setSettings({ ...a.settings, tvAnchor: proposal.mode === 'cinema' });
    setProposal(null);
    setOptimizeOpen(false);
    const n = created.length;
    const moved = proposal.targetName
      ? ` — moved YOU to ${proposal.targetName}`
      : ' — drag to fine-tune';
    // Both branches are reversible: the optimizer overwrite AND the fresh placement
    // are one history step, so each gets the same one-tap undo toast (item E).
    a.showToast(
      replacing
        ? `Replaced your speakers with ${n} suggested one${n === 1 ? '' : 's'}${proposal.targetName ? moved : ''}`
        : `Placed ${n} speaker${n === 1 ? '' : 's'}${moved}`,
      { action: { label: 'Undo', run: a.undoScene } },
    );
  };

  return {
    optimizeOpen,
    setOptimizeOpen,
    proposal,
    setProposal,
    arrangeOpen,
    setArrangeOpen,
    furnitureProposal,
    setFurnitureProposal,
    discardDetectionRef,
    closeFloatingPanels,
    runOptimizer,
    applyProposal,
    runArrange,
    applyArrange,
  };
}
