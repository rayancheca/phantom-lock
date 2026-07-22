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
  /**
   * Focus is on a control with its own native or roving-widget key semantics
   * (a button, a radio, a menu item, a `<summary>`, a link).
   *
   * Gates ONLY the keys that genuinely collide: Arrow (ListenerCard and
   * SegmentSwitch both drive roving focus with Arrow and neither stops
   * propagation, so a nudge fired on top of every focus move) and Delete.
   * Deliberately does NOT gate `t`/digits/`q`/`e` — those have no button
   * semantics, and blocking them would silently kill documented shortcuts the
   * moment the user clicks any sidebar or toolbar button. Escape and undo/redo
   * stay global by design.
   */
  interactiveTarget: boolean;
  /** Focus is on the canvas itself — scopes the canvas-only keys (n/p/d/w) so
   *  they cannot fire while the user is working in the sidebar. */
  canvasFocused: boolean;
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
  | { type: 'rotate'; dir: -1 | 1; coarse: boolean; coalesce: boolean }
  | { type: 'nudge'; dx: number; dy: number; coalesce: boolean }
  /** Walk the deterministic scene traversal (selection-cycle.ts). */
  | { type: 'cycle'; dir: -1 | 1 }
  /** Place a speaker beside the active seat — the keyboard equivalent of the
   *  pointer-only placement path. */
  | { type: 'place-speaker' }
  /** Cut a door/window into the SELECTED wall — the keyboard equivalent of the
   *  hover chips, which no keyboard user can reach. */
  | { type: 'opening'; role: 'door' | 'window' };

export interface KeyResult {
  command: KeyCommand;
  preventDefault?: boolean;
}

/** Coarse (with ⇧) and fine arrow-nudge step, in metres. */
const NUDGE_FINE_M = 0.05;
const NUDGE_COARSE_M = 0.25;
/**
 * Degrees per q/e rotate tap — fine by default, coarse with ⇧, mirroring the
 * arrow-nudge pair above.
 *
 * The fine step was 5°, which is too coarse to sit furniture flush against a
 * wall: real walls sit at arbitrary angles (Maple Court's front wall is
 * -11.73°), so a 5° step oscillates between -10° and -15° and can never land on
 * it. 1° leaves at most 0.5° of error — under 2 cm across a 2 m bed.
 *
 * Holding the key still reaches large angles quickly: OS key-repeat delivers
 * ~30-60 events/s, so a held q/e sweeps 30-60°/s, and ⇧ is there for a
 * deliberate quarter-turn.
 */
export const ROTATE_FINE_DEG = 1;
export const ROTATE_COARSE_DEG = 15;

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

  if (
    (e.key === 'Delete' || e.key === 'Backspace') &&
    env.selection &&
    env.mode !== 'wall' &&
    !env.interactiveTarget
  ) {
    // Consumes the key for every selection kind (a listener has no delete, but
    // must not fall through to the tool-key ladder).
    return { command: { type: 'delete' } };
  }

  // --- the canvas-scoped keys (S7) -----------------------------------------
  // All four require canvas focus so they cannot fire while the user is working
  // in the sidebar, and all four are MODE-SCOPED for the same reason the digit
  // shortcuts are: a DESIGN key must never reach a TUNE tool, and a letter key
  // must not become the loophole that reintroduces the cross-mode leak S14
  // structurally removed.
  if (env.canvasFocused && !env.interactiveTarget) {
    if (e.key === 'n' || e.key === 'N') {
      return { command: { type: 'cycle', dir: e.shiftKey ? -1 : 1 } };
    }
    if (e.key === 'p' && env.appMode === 'tune') {
      return { command: { type: 'place-speaker' } };
    }
    if ((e.key === 'd' || e.key === 'w') && env.appMode === 'design') {
      // Only a wall can take an opening; the App resolves the id from the
      // selection, so the command itself stays scene-independent.
      if (env.selection?.type === 'object') {
        return { command: { type: 'opening', role: e.key === 'd' ? 'door' : 'window' } };
      }
    }
  }

  // Digit shortcuts bind only to tools present in the CURRENT app-mode, so a
  // DESIGN digit can never reach the speaker tool and a TUNE digit can never
  // reach a DESIGN tool. The mode owns the theme, so 't' switches MODE (which
  // flips the theme as a consequence) — it never toggles the theme directly.
  const tool = digitTool(e.key, env.appMode);
  if (tool) return { command: { type: 'tool', tool } };
  if (e.key === 't') return { command: { type: 'mode-toggle' } };

  // Match on the physical key, not the produced character: ⇧+q yields 'Q'.
  const rotKey = e.key.toLowerCase();
  if ((rotKey === 'q' || rotKey === 'e') && env.selection?.type === 'object') {
    // Held-key repeat folds into one undo entry, like nudge.
    return {
      command: {
        type: 'rotate',
        dir: rotKey === 'q' ? -1 : 1,
        coarse: Boolean(e.shiftKey),
        coalesce: e.repeat,
      },
    };
  }

  if (e.key.startsWith('Arrow') && env.selection && !env.interactiveTarget) {
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
export function rotateSelectedRect(scene: Scene, id: string, dir: -1 | 1, coarse = false): Scene {
  const target = scene.objects.find((o) => o.id === id);
  if (!target || target.kind !== 'rect') return scene;
  const stepDeg = coarse ? ROTATE_COARSE_DEG : ROTATE_FINE_DEG;
  return {
    ...scene,
    objects: scene.objects.map((o) => {
      if (o.id !== id || o.kind !== 'rect') return o;
      let rot = o.rotation + (dir * stepDeg * Math.PI) / 180;
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
