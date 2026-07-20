import type { ToolMode } from '../../engine/types';
import type { IconName } from '../ui/Icon';
import type { AppMode, DesignSubStep } from './mode';

export const MODE_HINT: Record<ToolMode, string> = {
  select: 'Drag to move · scroll = pan · pinch / ⌘-scroll = zoom · twist / ⌥-scroll = rotate view',
  wall: 'Click corner by corner · Backspace = undo corner · click the first corner to close · Esc to finish',
  rect: 'Drag to draw a box — couch, desk, cabinet…',
  circle: 'Drag from the centre to draw a round object',
  speaker: 'Click to place the speaker · Esc when done',
  calibrate: 'Click two points on the floorplan image whose real-world distance you know',
  room: 'Drag a box over part of the plan to label it as an area · then name it (Kitchen, Bedroom…)',
  marquee: 'Drag a box to select everything inside · ⇧ adds to the selection',
  lasso: 'Draw around objects to select them · ⇧ adds to the selection',
};

/** Header DESIGN/TUNE switch items. */
export const MODE_ITEMS: Array<{ id: AppMode; label: string; icon: IconName }> = [
  { id: 'design', label: 'Design', icon: 'wall' },
  { id: 'tune', label: 'Tune', icon: 'speaker' },
];

/** DESIGN sub-step switch items (Build vs Furnish). */
export const SUBSTEP_ITEMS: Array<{ id: DesignSubStep; label: string; icon: IconName }> = [
  { id: 'build', label: 'Build', icon: 'wall' },
  { id: 'furnish', label: 'Furnish', icon: 'box' },
];
