import { describe, expect, it } from 'vitest';
import {
  DIGIT_TOOL,
  digitTool,
  initialMode,
  isToolInMode,
  modeTheme,
  subStepForTool,
  toolMode,
  UNIVERSAL_TOOLS,
  type AppMode,
} from '../mode';
import type { Scene, SceneObject, ToolMode } from '../../../engine/types';

// --- fixtures -------------------------------------------------------------

const wall = (id: string): SceneObject =>
  ({ id, kind: 'wall', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, height: 2.4, absorption: 0.1 } as SceneObject);

const box = (id: string): SceneObject =>
  ({
    id,
    kind: 'rect',
    center: { x: 1, y: 1 },
    w: 1,
    h: 1,
    rotation: 0,
    absorption: 0.3,
    label: 'Box',
    role: 'furniture',
    height: 0.8,
  } as SceneObject);

const scene = (objects: SceneObject[], speakerCount = 0): Scene =>
  ({
    objects,
    speakers: Array.from({ length: speakerCount }, (_, i) => ({
      id: `s${i}`,
      pos: { x: i, y: 0 },
      z: 1,
      label: 'S',
      model: 'homepod',
      trimDb: 0,
    })),
    pairs: [],
    rooms: [],
    listener: { pos: { x: 2, y: 2 }, z: 1.2 },
    listeners: [{ id: 'seat-1', name: 'Couch', pos: { x: 2, y: 2 }, z: 1.2 }],
    activeListenerId: 'seat-1',
  } as unknown as Scene);

const ALL_TOOLS: ToolMode[] = ['select', 'wall', 'rect', 'circle', 'speaker', 'calibrate', 'room', 'marquee', 'lasso', 'opening'];

// --- modeTheme (the single theme controller) ------------------------------

describe('modeTheme', () => {
  it.each([
    ['design', 'plan'],
    ['tune', 'sound'],
  ] as const)('%s mode owns the %s canvas theme', (mode, theme) => {
    expect(modeTheme(mode)).toBe(theme);
  });
});

// --- toolMode -------------------------------------------------------------

describe('toolMode', () => {
  it('speaker is the only TUNE-owned tool', () => {
    expect(toolMode('speaker')).toBe('tune');
  });
  it.each(['wall', 'room', 'calibrate', 'rect', 'circle', 'select', 'marquee', 'lasso'] as ToolMode[])(
    '%s is DESIGN-owned',
    (tool) => {
      expect(toolMode(tool)).toBe('design');
    },
  );
});

// --- subStepForTool -------------------------------------------------------

describe('subStepForTool', () => {
  it.each(['wall', 'room', 'calibrate', 'opening'] as ToolMode[])('%s belongs to build', (tool) => {
    expect(subStepForTool(tool)).toBe('build');
  });
  it.each(['rect', 'circle'] as ToolMode[])('%s belongs to furnish', (tool) => {
    expect(subStepForTool(tool)).toBe('furnish');
  });
  it.each(['select', 'marquee', 'lasso', 'speaker'] as ToolMode[])('%s is sub-step-agnostic (null)', (tool) => {
    expect(subStepForTool(tool)).toBeNull();
  });
});

// --- isToolInMode ---------------------------------------------------------

describe('isToolInMode', () => {
  it('universal tools are reachable in both modes', () => {
    for (const tool of UNIVERSAL_TOOLS) {
      expect(isToolInMode(tool, 'design')).toBe(true);
      expect(isToolInMode(tool, 'tune')).toBe(true);
    }
  });
  it('DESIGN hides the speaker tool', () => {
    expect(isToolInMode('speaker', 'design')).toBe(false);
  });
  it.each(['wall', 'rect', 'circle', 'room', 'calibrate', 'opening'] as ToolMode[])(
    'TUNE hides the DESIGN tool %s',
    (tool) => {
      expect(isToolInMode(tool, 'tune')).toBe(false);
    },
  );
  it('TUNE shows the speaker tool', () => {
    expect(isToolInMode('speaker', 'tune')).toBe(true);
  });
  it('every tool is reachable in the mode that owns it', () => {
    for (const tool of ALL_TOOLS) {
      expect(isToolInMode(tool, toolMode(tool))).toBe(true);
    }
  });
});

// --- digitTool (mode-scoped shortcuts) ------------------------------------

describe('digitTool', () => {
  it.each([
    ['1', 'select'],
    ['2', 'wall'],
    ['3', 'rect'],
    ['4', 'circle'],
    ['5', 'opening'],
  ] as const)('DESIGN digit %s selects %s', (digit, tool) => {
    expect(digitTool(digit, 'design')).toBe(tool);
  });
  it('DESIGN digit 5 is the opening tool, TUNE digit 5 is the speaker (no cross-mode leak)', () => {
    expect(digitTool('5', 'design')).toBe('opening');
    expect(digitTool('5', 'tune')).toBe('speaker');
  });
  it.each([
    ['1', 'select'],
    ['5', 'speaker'],
  ] as const)('TUNE digit %s selects %s', (digit, tool) => {
    expect(digitTool(digit, 'tune')).toBe(tool);
  });
  it.each(['2', '3', '4'] as string[])('TUNE digit %s is unbound (DESIGN tool cannot leak in)', (digit) => {
    expect(digitTool(digit, 'tune')).toBeNull();
  });
  it('non-digit keys are unbound', () => {
    expect(digitTool('q', 'design')).toBeNull();
    expect(digitTool('t', 'tune')).toBeNull();
  });
  it('INVARIANT: a bound digit only ever yields a tool reachable in that mode', () => {
    for (const mode of ['design', 'tune'] as AppMode[]) {
      for (const digit of Object.keys(DIGIT_TOOL[mode])) {
        const tool = digitTool(digit, mode);
        expect(tool).not.toBeNull();
        expect(isToolInMode(tool!, mode)).toBe(true);
      }
    }
  });
});

// --- initialMode (2-mode collapse of the old initialStep) -----------------

describe('initialMode', () => {
  it('a wall-less scene opens in DESIGN / Build', () => {
    expect(initialMode(scene([]))).toEqual({ mode: 'design', designSubStep: 'build' });
  });
  it('walls but no speakers opens in TUNE (sub-step defaults to build)', () => {
    expect(initialMode(scene([wall('w1'), wall('w2')]))).toEqual({ mode: 'tune', designSubStep: 'build' });
  });
  it('walls + speakers opens in TUNE', () => {
    expect(initialMode(scene([wall('w1')], 2))).toEqual({ mode: 'tune', designSubStep: 'build' });
  });
  it('a furnished-but-wall-less scene still opens in DESIGN (walls are what graduates to TUNE)', () => {
    expect(initialMode(scene([box('b1')]))).toEqual({ mode: 'design', designSubStep: 'build' });
  });
});
