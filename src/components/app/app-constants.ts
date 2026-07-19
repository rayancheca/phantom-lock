import type { Scene, ToolMode } from '../../engine/types';
import type { Step } from '../panels/WorkflowSteps';

export const MODE_HINT: Record<ToolMode, string> = {
  select: 'Drag to move · scroll = pan · pinch / ⌘-scroll = zoom · twist / ⌥-scroll = rotate view',
  wall: 'Click corner by corner · Backspace = undo corner · click the first corner to close · Esc to finish',
  rect: 'Drag to draw a box — couch, desk, cabinet…',
  circle: 'Drag from the centre to draw a round object',
  speaker: 'Click to place the speaker · Esc when done',
  calibrate: 'Click two points on the floorplan image whose real-world distance you know',
  room: 'Drag a box over an area to mark it as a room · then name it (Kitchen, Bedroom…)',
  marquee: 'Drag a box to select everything inside · ⇧ adds to the selection',
  lasso: 'Draw around objects to select them · ⇧ adds to the selection',
};

export const PLAN_STEPS: Step[] = ['build', 'furnish'];

export const TOOL_OWNER: Partial<Record<ToolMode, Step>> = {
  wall: 'build',
  room: 'build',
  rect: 'furnish',
  circle: 'furnish',
  speaker: 'sound',
  calibrate: 'build',
};

export function initialStep(scene: Scene): Step {
  const hasWalls = scene.objects.some((o) => o.kind === 'wall');
  if (!hasWalls) return 'build';
  if (scene.speakers.length === 0) return 'sound';
  return 'analyze';
}
