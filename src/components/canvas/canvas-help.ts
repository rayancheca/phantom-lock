/**
 * The canvas's spoken instructions (S7).
 *
 * A plain exported const rather than inline JSX so it is diffable, greppable and
 * assertable in a test — and so the key map has exactly one written description
 * that cannot drift from `keyboard.ts`.
 *
 * Referenced by `aria-describedby` on the `role="application"` canvas. Screen
 * readers turn OFF browse mode inside an application region, which is what makes
 * the single-letter keys reachable at all — so the region must announce how to
 * drive it, or the user is left in an opaque box.
 */
export const CANVAS_HELP =
  'Interactive floorplan. ' +
  'Press N for the next item, Shift N for the previous. ' +
  'Arrow keys move the selected item, hold Shift for a coarser step. ' +
  'Q and E rotate it. Delete removes it. ' +
  'In Tune mode, P places a speaker beside your listening spot. ' +
  'In Design mode, with a wall selected, D adds a door and W adds a window. ' +
  'With a door selected, F flips its hinge and Shift F flips its swing side. ' +
  'R rotates the view. Hold Space and drag to pan. Escape deselects. ' +
  'A spoken summary of the plan and the current verdict updates below.';
