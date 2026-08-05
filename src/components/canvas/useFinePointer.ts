import { useEffect, useState } from 'react';

/**
 * Is this a precise pointer? (S38: lifted out of `SimCanvas.tsx`.)
 *
 * The §16 grips are an 11 px target and are hidden on a coarse pointer, where
 * they would be worse than useless: a finger aimed at a sofa's corner to DRAG it
 * would resize it instead. This is the exact inverse of `SelectionActions`'s own
 * query, so no pointer type is left without an affordance — but note the HUD
 * covers rotate/nudge/delete and NOT resize, so on touch the Inspector is what
 * resizes. Both queries key on the PRIMARY pointer, so a hybrid touch laptop is
 * treated as fine-pointer: the grips are live for its trackpad, and a finger
 * gets them too.
 *
 * Defaults to true where `matchMedia` is absent (node, older jsdom) — the same
 * direction `handleTargetFor`'s other gates take, so a missing media API never
 * silently removes a feature.
 */
export function useFinePointer(): boolean {
  const [finePointer, setFinePointer] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const sync = () => setFinePointer(!mq.matches);
    sync();
    // Safari <= 13 exposes `matchMedia` but its MediaQueryList has only the
    // deprecated addListener/removeListener, so an unguarded `addEventListener`
    // THROWS inside the effect — and with no ErrorBoundary in the tree that takes
    // the whole app down. `interaction.ts` `watchDevicePixelRatio` already guards
    // exactly this; matching it here rather than inventing a second answer.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);
  return finePointer;
}
