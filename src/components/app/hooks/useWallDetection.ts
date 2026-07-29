import { useCallback, useRef, useState } from 'react';
import type { SceneObject, Scene, Underlay, WallObj } from '../../../engine/types';
import { detectWallsFromUnderlay, type DetectionQuality, type RefusalCause } from '../../../engine/detect';

/**
 * The "Auto-detect walls" seam.
 *
 * Lives in a hook rather than `App.tsx` for the reason S21 put the tutorial's
 * logic in `useTutorial.ts`: `App.tsx` is already past its 800-line cap, and
 * this feature needs four pieces of state, not one.
 *
 * The shape it enforces is the honest one:
 *
 *   - detection RETURNS a quality assessment, and a refusal is surfaced as a
 *     sentence about the image rather than as silence or as a tangle;
 *   - the proposal is REVIEWABLE — every wall can be rejected individually
 *     before anything is committed;
 *   - nothing reaches the scene until the user says so, so this hook holds no
 *     store writer at all beyond the single accept handler its caller passes in.
 */

export type Sensitivity = 'careful' | 'balanced' | 'thorough';

/**
 * The three named levels the UI exposes, and what they mean.
 *
 * Named chips rather than a slider, deliberately: a range input fires on every
 * step and each detection run costs 80-125 ms on a large plan, so dragging one
 * would queue a dozen full passes. Three levels are also more honest than a
 * unitless 0-100 — the number would be a fiction, the words are not.
 */
export const SENSITIVITY: Record<Sensitivity, { value: number; label: string; hint: string }> = {
  careful: { value: 0.7, label: 'Careful', hint: 'Only long, clearly-drawn walls' },
  balanced: { value: 1, label: 'Balanced', hint: 'The usual choice' },
  thorough: { value: 1.5, label: 'Thorough', hint: 'Short walls too — expect a few extras' },
};

/** The levels in order, so "is there a harder one?" is a lookup, not a guess. */
const LEVEL_ORDER: Sensitivity[] = ['careful', 'balanced', 'thorough'];

/**
 * " Try Thorough." — or nothing, when nothing above would help.
 *
 * A hint has to be TRUE, and two of the four refusal causes make the obvious
 * hint false:
 *
 *   `unstructured`  the engine has already consulted the DEFAULT reading (that
 *                   is exactly what `referenceStructure` is) and found it short
 *                   too. So telling a 'Careful' user to try 'Balanced' suggests
 *                   a run whose outcome is already known — measured over the
 *                   corpus plus four darkened captures of a real plan, 5 of 5
 *                   such suggestions would have failed and 0 would have helped.
 *                   The useful suggestion is the level ABOVE the default.
 *   `unreadable`    the browser could not get a 2D context. A sensitivity knob
 *                   cannot supply one, and blaming the user's image for it is
 *                   the exact misdirection the refusal sentences were split up
 *                   to remove.
 *
 * Exported so a test can pin every branch.
 */
export function nextLevelHint(level: Sensitivity, cause: RefusalCause | null): string {
  if (cause === null || cause === 'unreadable') return '';
  const from =
    cause === 'unstructured'
      ? Math.max(LEVEL_ORDER.indexOf(level), LEVEL_ORDER.indexOf('balanced'))
      : LEVEL_ORDER.indexOf(level);
  const next = LEVEL_ORDER[from + 1];
  return next ? ` Try “${SENSITIVITY[next].label}” to look harder.` : '';
}

export interface DetectionProposal {
  /** Every wall found, in the order the detector returned them. */
  walls: WallObj[];
  /** Ids the user has struck off; they stay in `walls` so they can come back. */
  rejected: ReadonlySet<string>;
  quality: DetectionQuality;
  sensitivity: Sensitivity;
}

interface Args {
  scene: Scene;
  setScene: (fn: (s: Scene) => Scene) => void;
  showToast: (message: string, opts?: { tone?: 'ok' | 'bad'; action?: { label: string; run: () => void } }) => void;
  undoScene: () => void;
  setMode: (m: 'select') => void;
}

export interface WallDetection {
  proposal: DetectionProposal | null;
  detecting: boolean;
  /** Walls the canvas should ghost — rejected ones are dropped live. */
  keptWalls: SceneObject[] | null;
  run: (sensitivity?: Sensitivity) => void;
  toggleWall: (id: string) => void;
  accept: () => void;
  discard: () => void;
}

export function useWallDetection(a: Args): WallDetection {
  const [proposal, setProposal] = useState<DetectionProposal | null>(null);
  const [detecting, setDetecting] = useState(false);
  /**
   * Guards against a second run landing while the first is still decoding the
   * image. `detecting` alone cannot: it is state, so two clicks in the same
   * tick both read `false`.
   */
  const busy = useRef(false);

  /**
   * The caller rebuilds `a` every render, so reading it through a ref is what
   * keeps every callback below `[]`-stable — the same shape `usePersistence`
   * uses for `storeRef`. Without it `run` changes identity on every keystroke
   * and any effect depending on it re-fires.
   */
  const argsRef = useRef(a);
  argsRef.current = a;
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;

  const run = useCallback((sensitivity?: Sensitivity) => {
    const args = argsRef.current;
    const level = sensitivity ?? proposalRef.current?.sensitivity ?? 'balanced';
    const underlay: Underlay | null | undefined = args.scene.underlay;
    if (!underlay || busy.current) return;
    busy.current = true;
    setDetecting(true);
    detectWallsFromUnderlay(underlay, { sensitivity: SENSITIVITY[level].value })
      .then(({ walls, quality }) => {
        if (quality.refusal) {
          // Say what was wrong with the IMAGE. The old single message — "No
          // clear walls found in that image — trace them instead." — was
          // emitted for four distinct causes including a browser failure to
          // get a 2D context, which told the user their floorplan was the
          // problem when it was not.
          //
          // ...and when a harder level would genuinely help, SAY SO. The
          // engine's monotonic-knob guarantee covers the levels BELOW the
          // default; nothing can rescue an image whose DEFAULT reading fails
          // except looking harder. S26 measured exactly that case on a real
          // plan: a gamma-1.08 capture of the owner's own floorplan (5.4 %
          // darker at the midtone) is REFUSED at both 'Careful' and 'Balanced'
          // — structure 0.000 and 0.077 — and reads 42 walls at 'Thorough',
          // structure 0.607. Telling someone their floorplan is not a floorplan
          // while a control one click away would have read it is the same
          // failure as the refusal itself, just quieter.
          //
          // `nextLevelHint` takes the CAUSE, not just the level, because the
          // obvious hint is false for two of the four causes — see its comment.
          setProposal(null);
          argsRef.current.showToast(`${quality.refusal}${nextLevelHint(level, quality.cause)}`, {
            tone: 'bad',
          });
          return;
        }
        setProposal({ walls, rejected: new Set(), quality, sensitivity: level });
        argsRef.current.setMode('select');
      })
      .catch((err) => {
        // Say something true to the user AND leave a trace for whoever debugs
        // it. The pipeline behind this promise is nine stages of numeric work;
        // converting a genuine bug in it into an undiagnosable "bad image" is
        // the exact anti-pattern the S13 `font-ready.ts` lesson closed.
        console.error('[phantom-lock] wall detection failed', err);
        setProposal(null);
        argsRef.current.showToast('Could not read that image.', { tone: 'bad' });
      })
      .finally(() => {
        busy.current = false;
        setDetecting(false);
      });
  }, []);

  const toggleWall = useCallback((id: string) => {
    setProposal((p) => {
      if (!p) return p;
      const rejected = new Set(p.rejected);
      if (rejected.has(id)) rejected.delete(id);
      else rejected.add(id);
      return { ...p, rejected };
    });
  }, []);

  /**
   * Deliberately NOT written inside a `setProposal` updater.
   *
   * Doing the scene write and the toast from inside the updater is the exact
   * shape S5 had to unwind from `setScene`: React may invoke an updater twice
   * in development StrictMode, so every side effect in it fires twice. All the
   * bookkeeping happens here in the callback body, reading current state from a
   * ref, and React is handed a value rather than a function.
   */
  const accept = useCallback(() => {
    const args = argsRef.current;
    const p = proposalRef.current;
    if (!p) return;
    const keep = p.walls.filter((w) => !p.rejected.has(w.id));
    if (keep.length === 0) {
      args.showToast('Nothing left to add — every wall was struck off.', { tone: 'bad' });
      return;
    }
    args.setScene((s) => ({
      ...s,
      objects: [...s.objects, ...keep],
      // Drop the underlay back so the accepted walls read clearly over it.
      underlay: s.underlay ? { ...s.underlay, opacity: Math.min(s.underlay.opacity, 0.25) } : s.underlay,
    }));
    setProposal(null);
    args.showToast(`Added ${keep.length} wall${keep.length === 1 ? '' : 's'} — drag any corner to correct it`, {
      tone: 'ok',
      action: { label: 'Undo', run: args.undoScene },
    });
  }, []);

  const discard = useCallback(() => setProposal(null), []);

  const keptWalls = proposal ? proposal.walls.filter((w) => !proposal.rejected.has(w.id)) : null;

  return { proposal, detecting, keptWalls, run, toggleWall, accept, discard };
}
