import type { Scene, Selection, ToolMode, Vec2 } from '../../engine/types';
import { updateActiveListener } from '../../engine/scene';
import { digitTool, type AppMode } from './mode';

/** The subset of a KeyboardEvent the dispatcher reads — keeps it pure/testable. */
export interface KeyEvt {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

/** Everything the dispatcher branches on, snapshotted from App state each event. */
export interface KeyEnv {
  /** Focus is inside an INPUT/TEXTAREA/SELECT. */
  editableTarget: boolean;
  /** Any blocking overlay is open (dialog/optimize/arrange/compare/gallery/wallProposal). */
  overlayOpen: boolean;
  dialogOpen: boolean;
  wallProposalOpen: boolean;
  optimizeOpen: boolean;
  arrangeOpen: boolean;
  selection: Selection;
  mode: ToolMode;
  /** The active app-mode — scopes which digit shortcuts are live. */
  appMode: AppMode;
}

export type KeyCommand =
  | { type: 'escape'; target: 'dialog' | 'wallProposal' | 'optimize' | 'arrange' | 'deselect' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'delete' }
  | { type: 'tool'; tool: ToolMode }
  | { type: 'mode-toggle' }
  | { type: 'rotate'; dir: -1 | 1; coalesce: boolean }
  | { type: 'nudge'; dx: number; dy: number; coalesce: boolean };

export interface KeyResult {
  command: KeyCommand;
  preventDefault?: boolean;
}

/** Coarse (with ⇧) and fine arrow-nudge step, in metres. */
const NUDGE_FINE_M = 0.05;
const NUDGE_COARSE_M = 0.25;
/** Degrees per q/e rotate tap. */
const ROTATE_STEP_DEG = 5;

/**
 * Pure global-shortcut dispatcher. Given a keyboard event + the current App
 * state snapshot, returns the command to run (and whether to preventDefault),
 * or null to let the key through. Behaviour mirrors the pre-refactor inline
 * handler exactly, branch for branch.
 */
export function handleKeydown(e: KeyEvt, env: KeyEnv): KeyResult | null {
  // While typing in a field, only Escape-closing-an-overlay is honoured.
  if (env.editableTarget && !(e.key === 'Escape' && env.overlayOpen)) return null;

  if (e.key === 'Escape') {
    if (env.dialogOpen) return { command: { type: 'escape', target: 'dialog' } };
    if (env.wallProposalOpen) return { command: { type: 'escape', target: 'wallProposal' } };
    if (env.optimizeOpen) return { command: { type: 'escape', target: 'optimize' } };
    if (env.arrangeOpen) return { command: { type: 'escape', target: 'arrange' } };
    return { command: { type: 'escape', target: 'deselect' } };
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    if (env.overlayOpen) return null; // let the browser's native undo run
    return { command: e.shiftKey ? { type: 'redo' } : { type: 'undo' }, preventDefault: true };
  }

  if (e.metaKey || e.ctrlKey || e.altKey) return null;

  // Everything below mutates the scene or switches tools — never behind an overlay.
  if (env.overlayOpen) return null;

  if ((e.key === 'Delete' || e.key === 'Backspace') && env.selection && env.mode !== 'wall') {
    // Consumes the key for every selection kind (a listener has no delete, but
    // must not fall through to the tool-key ladder).
    return { command: { type: 'delete' } };
  }

  // Digit shortcuts bind only to tools present in the CURRENT app-mode, so a
  // DESIGN digit can never reach the speaker tool and a TUNE digit can never
  // reach a DESIGN tool. The mode owns the theme, so 't' switches MODE (which
  // flips the theme as a consequence) — it never toggles the theme directly.
  const tool = digitTool(e.key, env.appMode);
  if (tool) return { command: { type: 'tool', tool } };
  if (e.key === 't') return { command: { type: 'mode-toggle' } };

  if ((e.key === 'q' || e.key === 'e') && env.selection?.type === 'object') {
    // Held-key repeat folds into one undo entry, like nudge.
    return { command: { type: 'rotate', dir: e.key === 'q' ? -1 : 1, coalesce: e.repeat } };
  }

  if (e.key.startsWith('Arrow') && env.selection) {
    const stepM = e.shiftKey ? NUDGE_COARSE_M : NUDGE_FINE_M;
    const dx = e.key === 'ArrowLeft' ? -stepM : e.key === 'ArrowRight' ? stepM : 0;
    const dy = e.key === 'ArrowUp' ? -stepM : e.key === 'ArrowDown' ? stepM : 0;
    return { command: { type: 'nudge', dx, dy, coalesce: e.repeat }, preventDefault: true };
  }

  return null;
}

/** Rotate the selected rect by ±ROTATE_STEP_DEG, wrapping into (-π, π]. Only
 *  rects rotate; for any other selection (wall/circle) this returns the SAME
 *  scene reference so a stray q/e or touch-HUD tap can't push a no-op undo
 *  entry. (Callers should also disable the affordance — see SelectionActions.) */
export function rotateSelectedRect(scene: Scene, id: string, dir: -1 | 1): Scene {
  const target = scene.objects.find((o) => o.id === id);
  if (!target || target.kind !== 'rect') return scene;
  return {
    ...scene,
    objects: scene.objects.map((o) => {
      if (o.id !== id || o.kind !== 'rect') return o;
      let rot = o.rotation + (dir * ROTATE_STEP_DEG * Math.PI) / 180;
      if (rot > Math.PI) rot -= Math.PI * 2;
      if (rot < -Math.PI) rot += Math.PI * 2;
      return { ...o, rotation: rot };
    }),
  };
}

/** Translate whatever is selected by `d`. Listener moves go through the seat
 *  helper so the `scene.listener` mirror stays synced with the active seat. */
export function nudgeSelection(scene: Scene, selection: Selection, d: Vec2): Scene {
  if (!selection) return scene;

  if (selection.type === 'multi') {
    const { objectIds, speakerIds } = selection;
    return {
      ...scene,
      objects: scene.objects.map((o) => {
        if (!objectIds.includes(o.id)) return o;
        if (o.kind === 'wall') {
          return { ...o, a: { x: o.a.x + d.x, y: o.a.y + d.y }, b: { x: o.b.x + d.x, y: o.b.y + d.y } };
        }
        return { ...o, center: { x: o.center.x + d.x, y: o.center.y + d.y } };
      }),
      speakers: scene.speakers.map((sp) =>
        speakerIds.includes(sp.id) ? { ...sp, pos: { x: sp.pos.x + d.x, y: sp.pos.y + d.y } } : sp,
      ),
    };
  }

  if (selection.type === 'listener') {
    return updateActiveListener(scene, {
      pos: { x: scene.listener.pos.x + d.x, y: scene.listener.pos.y + d.y },
    });
  }

  if (selection.type === 'speaker') {
    return {
      ...scene,
      speakers: scene.speakers.map((sp) =>
        sp.id === selection.id ? { ...sp, pos: { x: sp.pos.x + d.x, y: sp.pos.y + d.y } } : sp,
      ),
    };
  }

  return {
    ...scene,
    objects: scene.objects.map((o) => {
      if (o.id !== selection.id) return o;
      if (o.kind === 'wall') {
        return { ...o, a: { x: o.a.x + d.x, y: o.a.y + d.y }, b: { x: o.b.x + d.x, y: o.b.y + d.y } };
      }
      return { ...o, center: { x: o.center.x + d.x, y: o.center.y + d.y } };
    }),
  };
}
