/**
 * What Escape means in the gallery, as a total function (S30).
 *
 * The gallery's Escape handler is window-CAPTURE, and so is `ui/Menu`'s, and so
 * is `ui/Dialog`'s. MEASURED: among listeners on the SAME node in the SAME
 * phase, invocation order is REGISTRATION order, and `stopPropagation()` stops
 * the rest of the path but never a co-registered listener — only
 * `stopImmediatePropagation` does that. The gallery installs its listener at
 * MOUNT and every overlay that can sit above it installs later, so the gallery
 * always runs FIRST and the later listener cannot defend itself. It therefore
 * has to stand down by hand, and the ORDER in which it decides to is the entire
 * content of the bug this fixes: before S30, Escape with a kebab menu open
 * closed the WHOLE gallery.
 *
 * That order lives here rather than inside a closure for the reason `drag.ts`
 * exists: node can enumerate all eight states cheaply and jsdom cannot. It is
 * NOT here for reuse — there is exactly one consumer.
 */

export type EscapeAction = 'yield' | 'cancel-move' | 'leave-folder' | 'close';

export interface EscapeState {
  /**
   * An overlay stacked ABOVE the gallery has claimed Escape for itself, and
   * will act on this same keystroke.
   */
  overlayAbove: boolean;
  /**
   * A gesture is in progress — a pointer drag, a keyboard/click move, or a
   * press that has not yet armed into either.
   */
  moving: boolean;
  /**
   * The gallery is showing a folder's contents.
   *
   * Must be derived from the RESOLVED container, never from the raw
   * `openFolder` state. Measured: a folder can be deleted or auto-dissolve
   * while drilled into, after which `openFolder` still holds its id but the
   * view has already fallen back to the home grid. Feeding the raw state makes
   * Escape swallow itself and announce "Closed folder." about a folder that is
   * already gone.
   */
  inFolder: boolean;
}

/**
 * Innermost thing first.
 *
 * `overlayAbove` outranks `moving` deliberately: a user who opens a menu in the
 * middle of a move and presses Escape means the menu, and must not lose the
 * move to the keystroke that dismisses it.
 */
export function escapeAction(s: EscapeState): EscapeAction {
  if (s.overlayAbove) return 'yield';
  if (s.moving) return 'cancel-move';
  if (s.inFolder) return 'leave-folder';
  return 'close';
}
