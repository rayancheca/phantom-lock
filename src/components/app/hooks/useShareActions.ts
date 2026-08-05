import type { Layout, Scene, SimSettings, TraceResult } from '../../../engine/types';
import type { AudioMetrics } from '../../../engine/stereo';
import type { ListeningField } from '../../../engine/bestspot';
import type { CanvasTheme } from '../../canvas/render';
import type { ToastData } from '../../ui/Toast';
import { activeListener } from '../../../engine/scene';
import { deriveVerdict } from '../../panels/verdict';
import { planImageFilename, renderPlanToBlob } from '../../canvas/export-image';

interface Args {
  scene: Scene;
  settings: SimSettings;
  active: Layout;
  trace: TraceResult;
  audio: AudioMetrics;
  bestSpot: ListeningField | null;
  theme: CanvasTheme;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
}

export interface ShareActions {
  exportPlanImage: () => void;
  copyVerdict: () => void;
}

/**
 * The two "take this out of the app" actions (UX-4 item H), extracted from
 * AppInner in S37.
 *
 * Both are self-contained: they read the simulation the sidebar is already
 * showing and write nothing back to the scene, which is why they can sit
 * anywhere in the component body and why they were the safest cut to make
 * first. Neither is memoized — same as before the move, and correct, because
 * both are handed straight to an onClick and both must read the CURRENT
 * simulation rather than whichever one was live when a dependency array last
 * changed.
 *
 * `copyVerdict` deliberately routes through `deriveVerdict`, the same single
 * source `VerdictHero` renders, so the copied sentence can never disagree with
 * what is on screen.
 */
export function useShareActions(a: Args): ShareActions {
  /** Render the current plan to a PNG and hand it to the browser download flow.
   *  Nothing leaves the app except via this explicit user click. */
  const exportPlanImage = () => {
    renderPlanToBlob({
      scene: a.scene,
      settings: a.settings,
      trace: a.trace,
      audio: a.audio,
      bestSpot: a.bestSpot,
      theme: a.theme,
    })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const el = document.createElement('a');
        el.href = url;
        el.download = planImageFilename(a.active.name);
        document.body.appendChild(el);
        el.click();
        el.remove();
        URL.revokeObjectURL(url);
        a.showToast('Saved the plan image', { tone: 'ok' });
      })
      .catch(() => a.showToast('Could not export the plan image.', { tone: 'bad' }));
  };

  /** Copy the verdict headline + cause + seat to the clipboard (single source:
   *  `deriveVerdict`, same as the hero). Guards for an absent clipboard API. */
  const copyVerdict = () => {
    if (a.audio.pairs.length === 0) {
      a.showToast('No verdict yet — place a stereo pair first.', { tone: 'bad' });
      return;
    }
    const view = deriveVerdict(a.audio, a.trace, a.settings.tvAnchor);
    const seat = activeListener(a.scene).name;
    const text = `Phantom Lock — ${view.headline} at ${seat}.${view.cause ? ` ${view.cause}` : ''}`;
    const clip = navigator.clipboard;
    if (!clip?.writeText) {
      a.showToast('Copying isn’t available in this browser.', { tone: 'bad' });
      return;
    }
    clip
      .writeText(text)
      .then(() => a.showToast('Verdict copied to clipboard', { tone: 'ok' }))
      .catch(() => a.showToast('Could not copy the verdict.', { tone: 'bad' }));
  };

  return { exportPlanImage, copyVerdict };
}
