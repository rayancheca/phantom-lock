import { useCallback, useRef, useState } from 'react';
import type { Layout, LayoutStore, Scene } from '../../../engine/types';
import { makeLayout } from '../../../engine/scene';
import {
  ARCHETYPE_IDS,
  generateDesign,
  randomSeed,
  uniqueName,
  type ArchetypeId,
  type GenerateResult,
} from '../../../engine/generate';

/**
 * "Generate a design" — the App seam for the procedural generator.
 *
 * A hook rather than more of `App.tsx`, for the reason S21 put the tutorial's
 * logic in `useTutorial.ts`: that file is past its 800-line cap.
 *
 * The safety property is structural rather than guarded. `generateDesign` takes
 * no store and returns a `Scene`, so there is no code path through which the
 * preview or a reroll COULD write anything. Exactly one function here mutates
 * the store — `keep` — and its body is the same three lines `addLayout`
 * already uses.
 */

export interface GeneratorState {
  archetype: ArchetypeId;
  seed: number;
  /** The design currently previewed. Never committed until `keep`. */
  result: GenerateResult;
  /** The folder the user opened the generator from. */
  projectId: string;
}

interface Args {
  store: LayoutStore;
  setStore: (fn: (s: LayoutStore) => LayoutStore) => void;
  afterLayoutSwitch: (scene: Scene) => void;
  showToast: (message: string, opts?: { tone?: 'ok' | 'bad'; action?: { label: string; run: () => void } }) => void;
  closeGallery: () => void;
}

export interface GenerateDesignApi {
  state: GeneratorState | null;
  open: (projectId: string) => void;
  close: () => void;
  setArchetype: (id: ArchetypeId) => void;
  setSeed: (seed: number) => void;
  reroll: () => void;
  keep: () => void;
}

/** Where a freshly-opened generator starts. */
const DEFAULT_ARCHETYPE: ArchetypeId = 'one-bed';

export function useGenerateDesign(a: Args): GenerateDesignApi {
  const [state, setState] = useState<GeneratorState | null>(null);
  const argsRef = useRef(a);
  argsRef.current = a;
  const stateRef = useRef(state);
  stateRef.current = state;

  const build = useCallback((archetype: ArchetypeId, seed: number, projectId: string): GeneratorState => {
    return { archetype, seed, projectId, result: generateDesign({ archetype, seed }) };
  }, []);

  const open = useCallback(
    (projectId: string) => setState(build(DEFAULT_ARCHETYPE, randomSeed(), projectId)),
    [build],
  );

  const close = useCallback(() => setState(null), []);

  const setArchetype = useCallback(
    (archetype: ArchetypeId) => {
      const s = stateRef.current;
      if (!s || !ARCHETYPE_IDS.includes(archetype)) return;
      // Keep the SEED when the shape changes, so switching between archetypes
      // is a comparison rather than a reroll.
      setState(build(archetype, s.seed, s.projectId));
    },
    [build],
  );

  const setSeed = useCallback(
    (seed: number) => {
      const s = stateRef.current;
      if (!s) return;
      setState(build(s.archetype, seed >>> 0, s.projectId));
    },
    [build],
  );

  const reroll = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    setState(build(s.archetype, randomSeed(), s.projectId));
  }, [build]);

  /**
   * The ONLY store write. Additive — it appends a layout and never overwrites
   * one — so by the design system's own rule it would not need an undo. It does
   * switch the active layout though, and every apply since UX-4 carries the
   * same undo toast a delete gets, so it carries one too.
   */
  const keep = useCallback(() => {
    const s = stateRef.current;
    const args = argsRef.current;
    if (!s) return;
    const taken = args.store.layouts.filter((l) => l.projectId === s.projectId).map((l) => l.name);
    const name = uniqueName(s.result.name, taken);
    const layout: Layout = makeLayout(name, s.result.scene, undefined, s.projectId);
    const previousActive = args.store.activeId;
    args.setStore((st) => ({ ...st, layouts: [...st.layouts, layout], activeId: layout.id }));
    setState(null);
    args.closeGallery();
    args.afterLayoutSwitch(layout.scene);
    args.showToast(`Created “${name}”`, {
      tone: 'ok',
      action: {
        label: 'Undo',
        run: () => {
          argsRef.current.setStore((st) => ({
            ...st,
            layouts: st.layouts.filter((l) => l.id !== layout.id),
            // Only restore the previous active layout if it is still there —
            // the user may have deleted it between creating and undoing.
            activeId: st.layouts.some((l) => l.id === previousActive) ? previousActive : st.activeId,
          }));
        },
      },
    });
  }, []);

  return { state, open, close, setArchetype, setSeed, reroll, keep };
}
