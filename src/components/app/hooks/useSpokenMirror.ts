import { useEffect, useRef } from 'react';
import type { Scene, Selection, SimSettings, TraceResult } from '../../../engine/types';
import type { AudioMetrics } from '../../../engine/stereo';
import type { ListeningField } from '../../../engine/bestspot';
import type { AppMode } from '../mode';
import { activeListener, sceneListeners } from '../../../engine/scene';
import { deriveVerdict } from '../../panels/verdict';
import { cycleOrder, describePosition } from '../../canvas/selection-cycle';
import { announcementFor, speakableUnits, type AnnounceInput } from '../announce';
import { useAnnouncer } from './useAnnouncer';

interface Args {
  scene: Scene;
  settings: SimSettings;
  selection: Selection;
  appMode: AppMode;
  trace: TraceResult;
  audio: AudioMetrics;
  bestSpot: ListeningField | null;
  overlayOpen: boolean;
  /** A one-shot explanation from a command that could not act; pre-empts the
   *  selection sentence, because silence is the one thing a live-region-only
   *  user cannot interpret. */
  notice: string | null;
}

export interface SpokenMirror {
  /** The settled readout — scene inventory + verdict. */
  readout: string;
  /** The immediate selection sentence. */
  selectionText: string;
}

/**
 * The off-screen spoken mirror (S7), extracted from AppInner in S37.
 *
 * Reuses `deriveVerdict`, so the spoken readout and the visible `VerdictHero`
 * can never drift. Cheap: `useSimulation` already runs unconditionally in both
 * modes, so this is a reduce plus one sentence, no engine work.
 *
 * The two channels have deliberately opposite cadences and that is why they are
 * returned separately: selection is discrete (immediate) and the readout is
 * continuous (settled through `useAnnouncer`).
 */
export function useSpokenMirror(a: Args): SpokenMirror {
  const announceInput: AnnounceInput = {
    appMode: a.appMode,
    seatName: activeListener(a.scene).name,
    seatCount: sceneListeners(a.scene).length,
    speakerCount: a.scene.speakers.length,
    wallCount: a.scene.objects.filter((o) => o.kind === 'wall').length,
    objectCount: a.scene.objects.filter((o) => o.kind !== 'wall').length,
    areaCount: a.scene.rooms?.length ?? 0,
    showBestSpot: a.settings.showBestSpot,
    // `best` is nullable even when the field object exists — treating a present
    // field as "found" would announce a spot that isn't there.
    bestSpotFound: a.bestSpot?.best != null,
    verdict: a.appMode === 'tune' ? deriveVerdict(a.audio, a.trace, a.settings.tvAnchor) : null,
  };
  const prevAnnounceRef = useRef<AnnounceInput | null>(null);
  const announceText = announcementFor(announceInput, prevAnnounceRef.current);
  // The baseline advances in an EFFECT, never during render. Writing it inline
  // is a render-purity violation that StrictMode makes visible: React
  // double-invokes the render body, the ref persists between the two
  // invocations, so the second (committing) one sees prev === current,
  // `countsChanged` is permanently false, and the scene-inventory clause is
  // never announced again after mount — silently, and ONLY in dev, which is
  // exactly where this project does its live verification. Same reason
  // `useLockIgnition` (VerdictHero.tsx) does its ref work in an effect.
  //
  // The missing dependency array is deliberate and load-bearing: this must run
  // after EVERY commit, not when some list of values changes.
  useEffect(() => {
    prevAnnounceRef.current = announceInput;
  });
  const readout = useAnnouncer(announceText, a.overlayOpen);

  // Selection is discrete and user-initiated, so it is announced immediately
  // rather than through the settle window. A transient `notice` (set by a
  // command that could not do anything) pre-empts it — silence is the one thing
  // a live-region-only user cannot interpret.
  const selectionText = (() => {
    if (a.notice) return a.notice;
    // NOT "selection cleared" here: a null selection is also the boot state, and
    // announcing it on first paint is the very thing this design avoids. The
    // deselect TRANSITION is announced from the Escape command instead.
    if (!a.selection) return '';
    if (a.selection.type === 'multi') {
      const n = a.selection.objectIds.length + a.selection.speakerIds.length;
      return `${n} item${n === 1 ? '' : 's'} selected.`;
    }
    const order = cycleOrder(a.scene);
    const id = a.selection.type === 'listener' ? (a.scene.activeListenerId ?? '') : a.selection.id;
    const entry = order.find((e) => e.id === id);
    // Same unit expansion the verdict path gets — otherwise "0.74 m" is spoken
    // as "em" here while the readout says "metres" a second later.
    return entry ? speakableUnits(describePosition(order, entry)) : '';
  })();

  return { readout, selectionText };
}
