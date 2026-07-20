import type { Scene, ToolMode } from '../../engine/types';
import type { CanvasTheme } from '../canvas/render';

/**
 * The information-architecture truth for the "DESIGN / TUNE" shell (UX-2 / S13→S14).
 *
 * Two app-modes, each OWNING one canvas theme — so the theme has exactly ONE
 * controller (the mode), killing the old three-way fight between `applyStep`,
 * the `applyTool` teleport, and the `t` key. DESIGN keeps Build + Furnish as
 * sub-steps (walls vs furniture are different jobs); TUNE merges the old Sound +
 * Analyze into one place-and-read loop. Pure + DOM-free (mirrors keyboard.ts /
 * font-ready.ts) so every mapping is node-testable.
 *
 * Naming note: the pre-existing `mode`/`ToolMode`/`setMode` (the active *tool*)
 * is untouched. This axis is `AppMode`; nothing named `mode` is overloaded.
 */

export type AppMode = 'design' | 'tune';
export type DesignSubStep = 'build' | 'furnish';
export interface ModeEntry {
  mode: AppMode;
  designSubStep: DesignSubStep;
}

/** THE single theme controller: the app-mode owns the canvas theme. */
export const MODE_THEME: Record<AppMode, CanvasTheme> = { design: 'plan', tune: 'sound' };
export function modeTheme(mode: AppMode): CanvasTheme {
  return MODE_THEME[mode];
}

/** Which app-mode OWNS a tool. Only the speaker tool lives in TUNE; everything
 *  else is a DESIGN tool (the universal select/marquee/lasso are DESIGN-owned
 *  but reachable in both — see `isToolInMode`). */
export function toolMode(tool: ToolMode): AppMode {
  return tool === 'speaker' ? 'tune' : 'design';
}

/** Which DESIGN sub-step a tool belongs to (null = universal or TUNE-owned).
 *  `applyTool` reads this to flip the sub-step within DESIGN — never the mode. */
export function subStepForTool(tool: ToolMode): DesignSubStep | null {
  if (tool === 'wall' || tool === 'room' || tool === 'calibrate') return 'build';
  if (tool === 'rect' || tool === 'circle') return 'furnish';
  return null; // select, marquee, lasso, speaker
}

/** Tools available in every mode (pan/select affordances). */
export const UNIVERSAL_TOOLS: readonly ToolMode[] = ['select', 'marquee', 'lasso'];

/** Is a tool reachable in the given mode? Universal tools always are; otherwise
 *  the mode must own it. This gates the per-mode digit shortcuts. */
export function isToolInMode(tool: ToolMode, mode: AppMode): boolean {
  return UNIVERSAL_TOOLS.includes(tool) || toolMode(tool) === mode;
}

/** Digit → tool, scoped to the MODE. A TUNE digit can never reach a DESIGN
 *  tool and vice-versa (tested invariant against `isToolInMode`). Within DESIGN
 *  the digit picks a tool across both sub-steps (2=wall, 3=rect, 4=circle);
 *  `applyTool` then flips the sub-step to match — preserving the old muscle
 *  memory while keeping the theme controller single. */
export const DIGIT_TOOL: Record<AppMode, Record<string, ToolMode>> = {
  design: { '1': 'select', '2': 'wall', '3': 'rect', '4': 'circle' },
  tune: { '1': 'select', '5': 'speaker' },
};
export function digitTool(digit: string, mode: AppMode): ToolMode | null {
  return DIGIT_TOOL[mode][digit] ?? null;
}

/** Scene → the entry mode (2-mode collapse of the old `initialStep`): a scene
 *  with no walls opens in DESIGN so you draw the room first; once it has walls
 *  it opens in TUNE. The sub-step always resets to Build so a switched/imported
 *  layout never lands on an empty Furnish panel. */
export function initialMode(scene: Scene): ModeEntry {
  const hasWalls = scene.objects.some((o) => o.kind === 'wall');
  return { mode: hasWalls ? 'tune' : 'design', designSubStep: 'build' };
}
