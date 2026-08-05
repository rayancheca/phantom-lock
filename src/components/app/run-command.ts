import type { Scene, Selection, SimSettings, SpeakerModel, ToolMode } from '../../engine/types';
import type { AppMode } from './mode';
import { flipDoor, nudgeSelection, rotateSelectedRect, type KeyCommand } from './keyboard';
import { cycleOrder, selectionForEntry, stepCycle } from '../canvas/selection-cycle';
import {
  keyboardPlacementPoint,
  openingOnWall,
  placeSpeakerAt,
  seatObjectAgainstWall,
} from '../canvas/placement';

/**
 * Everything the dispatcher is allowed to touch.
 *
 * The whole point of naming this surface is that it is SMALL and explicit: a
 * command that wants a new capability has to add a member here, in front of a
 * reviewer, rather than reaching into whatever happens to be in scope.
 *
 * ⚠️ Every member is read at CALL time. The call site builds this literal inside
 * the invocation, never in a `useMemo` or a captured closure, because
 * `useKeyboardShortcuts` is mount-once and delivers commands through a
 * render-assigned ref — a context captured once would serve the first render's
 * `scene`, `selection` and `settings` forever.
 */
export interface CommandContext {
  scene: Scene;
  settings: SimSettings;
  selection: Selection;
  appMode: AppMode;
  placeModel: SpeakerModel;
  /** The one-shot spoken explanation for a command that could not act. */
  notice: string | null;
  setNotice: (msg: string | null) => void;
  setScene: (next: (s: Scene) => Scene, opts?: { coalesce?: boolean }) => void;
  setSelection: (sel: Selection) => void;
  setMode: (m: ToolMode) => void;
  setModeTo: (m: AppMode) => void;
  applyTool: (t: ToolMode) => void;
  setDialog: (d: null) => void;
  setOptimizeOpen: (v: false) => void;
  setProposal: (v: null) => void;
  setArrangeOpen: (v: false) => void;
  setFurnitureProposal: (v: null) => void;
  detection: { discard: () => void };
  undoScene: () => void;
  redoScene: () => void;
  deleteObject: (id: string) => void;
  deleteSpeaker: (id: string) => void;
  deleteMulti: (objectIds: string[], speakerIds: string[]) => void;
  switchSeat: (id: string) => void;
}

/**
 * The keyboard/HUD command dispatcher — moved verbatim out of AppInner (S37).
 *
 * `keyboard.ts` decides WHICH command a keystroke means; this decides what a
 * command DOES. Keeping the two apart is what lets the touch HUD
 * (`SelectionActions`) dispatch the identical commands with zero logic
 * duplication, and it is why the S14 mutate-through-a-dialog gate only has to
 * exist in one place.
 *
 * It is deliberately a plain function over an explicit context rather than a
 * hook: that is what makes the escape ladder, the coalesce plumbing and the
 * flip-door same-ref router testable at all. jsdom cannot drive the real
 * keyboard path end to end, so before S37 none of it was covered.
 */
export function runCommand(cmd: KeyCommand, ctx: CommandContext): void {
  // Any new command supersedes a previous "that didn't work" explanation.
  if (ctx.notice) ctx.setNotice(null);
  switch (cmd.type) {
    case 'escape':
      if (cmd.target === 'dialog') ctx.setDialog(null);
      else if (cmd.target === 'wallProposal') ctx.detection.discard();
      else if (cmd.target === 'optimize') {
        ctx.setOptimizeOpen(false);
        ctx.setProposal(null);
      } else if (cmd.target === 'arrange') {
        ctx.setArrangeOpen(false);
        ctx.setFurnitureProposal(null);
      } else {
        ctx.setMode('select');
        // Announce the transition, not the state — otherwise deselecting is
        // silent and indistinguishable from a key that did nothing.
        if (ctx.selection) ctx.setNotice('Selection cleared.');
        ctx.setSelection(null);
      }
      return;
    case 'undo':
      ctx.undoScene();
      return;
    case 'redo':
      ctx.redoScene();
      return;
    case 'delete':
      if (!ctx.selection) return;
      if (ctx.selection.type === 'object') ctx.deleteObject(ctx.selection.id);
      else if (ctx.selection.type === 'speaker') ctx.deleteSpeaker(ctx.selection.id);
      else if (ctx.selection.type === 'multi') ctx.deleteMulti(ctx.selection.objectIds, ctx.selection.speakerIds);
      return;
    case 'tool':
      ctx.applyTool(cmd.tool);
      return;
    case 'mode-toggle':
      ctx.setModeTo(ctx.appMode === 'design' ? 'tune' : 'design');
      return;
    // Both of these bind the NARROWED selection to a local before handing it to
    // the updater. In the component the callbacks closed over a narrowed
    // `selection` directly; through a context parameter TypeScript drops the
    // narrowing at the callback boundary, so the local restores it. The read
    // happens at the identical point, so this is a typing accommodation and not
    // a change in what is observed.
    case 'rotate': {
      if (ctx.selection?.type !== 'object') return;
      const rotId = ctx.selection.id;
      ctx.setScene((s) => rotateSelectedRect(s, rotId, cmd.dir, cmd.coarse), { coalesce: cmd.coalesce });
      return;
    }
    case 'nudge': {
      if (!ctx.selection) return;
      const nudgeSel = ctx.selection;
      ctx.setScene((s) => nudgeSelection(s, nudgeSel, { x: cmd.dx, y: cmd.dy }), { coalesce: cmd.coalesce });
      return;
    }
    case 'cycle': {
      // Walk the deterministic traversal so every wall, seat, speaker and
      // piece of furniture is reachable without a pointer.
      const entry = stepCycle(cycleOrder(ctx.scene), ctx.selection, cmd.dir, ctx.scene);
      if (!entry) return;
      // A seat entry must ALSO become the active seat — `{type:'listener'}`
      // carries no id, so selecting it without switching would silently point
      // at whichever seat was already active (and desync the readout).
      if (entry.kind === 'listener') ctx.switchSeat(entry.id);
      else ctx.setSelection(selectionForEntry(entry));
      return;
    }
    case 'place-speaker': {
      const { scene: next, speakerId } = placeSpeakerAt(
        ctx.scene,
        keyboardPlacementPoint(ctx.scene),
        ctx.placeModel,
        ctx.settings.snap,
      );
      ctx.setScene(() => next);
      ctx.setSelection({ type: 'speaker', id: speakerId });
      return;
    }
    case 'opening': {
      if (ctx.selection?.type !== 'object') return;
      const res = openingOnWall(ctx.scene, ctx.selection.id, cmd.role);
      if (!res) {
        // `{type:'object'}` spans wall/rect/circle, so the dispatcher cannot
        // tell a wall from furniture. Saying so matters: for a user whose only
        // channel is the live region, a silent no-op is indistinguishable
        // from a broken app.
        ctx.setNotice(`Select a wall first — ${cmd.role}s can only be added to a wall.`);
        return;
      }
      ctx.setScene(() => res.scene);
      ctx.setSelection({ type: 'object', id: res.objectId });
      return;
    }
    case 'flip-door': {
      if (ctx.selection?.type !== 'object') return;
      const next = flipDoor(ctx.scene, ctx.selection.id, cmd.field);
      // `flipDoor` returns the SAME ref for a non-door — the dispatcher is
      // ctx.scene-independent so it can't tell a door from a wall/furniture. That
      // same-ref result IS the router: fall through to the furniture seat.
      if (next !== ctx.scene) {
        ctx.setScene(() => next);
        return;
      }
      // Plain F only. Shift+F stays a door-swing command: the quarter-turned
      // class is not representable in the ambient drag magnet's output space, so
      // the very next drag un-turns it — measured, 4 of 5 realistic pieces, one
      // of them WITHOUT the piece even moving. See docs/ideas.md §4d.
      if (cmd.field === 'hinge') {
        const seated = seatObjectAgainstWall(ctx.scene, ctx.selection.id, { snapOn: ctx.settings.snap });
        if (seated !== ctx.scene) {
          ctx.setScene(() => seated);
          return;
        }
      }
      ctx.setNotice(
        cmd.field === 'swing'
          ? 'Shift F flips a door’s swing side. Select furniture and press F to seat it flush.'
          : 'Select a door to flip its hinge, or furniture within 1.2 m of a wall to seat it flush.',
      );
      return;
    }
  }
}
