import { describe, expect, it } from 'vitest';
import { handleKeydown, nudgeSelection, rotateSelectedRect, type KeyEnv, type KeyEvt } from '../keyboard';
import type { Scene, SceneObject, Selection, SpeakerObj } from '../../../engine/types';

// --- fixtures -------------------------------------------------------------

const key = (k: string, mods: Partial<KeyEvt> = {}): KeyEvt => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...mods,
});

const env = (over: Partial<KeyEnv> = {}): KeyEnv => ({
  editableTarget: false,
  overlayOpen: false,
  dialogOpen: false,
  wallProposalOpen: false,
  optimizeOpen: false,
  arrangeOpen: false,
  selection: null,
  mode: 'select',
  appMode: 'design',
  ...over,
});

const rect = (id: string, cx = 0, cy = 0): SceneObject => ({
  id,
  kind: 'rect',
  center: { x: cx, y: cy },
  w: 1,
  h: 1,
  rotation: 0,
  absorption: 0.3,
  label: 'Box',
  role: 'furniture',
  height: 0.8,
});

const speaker = (id: string, x = 0, y = 0): SpeakerObj => ({
  id,
  pos: { x, y },
  z: 1,
  label: 'S',
  model: 'homepod',
  trimDb: 0,
});

const baseScene = (objects: SceneObject[], speakers: SpeakerObj[]): Scene =>
  ({
    objects,
    speakers,
    pairs: [],
    rooms: [],
    listener: { pos: { x: 2, y: 2 }, z: 1.2 },
    listeners: [{ id: 'seat-1', name: 'Couch', pos: { x: 2, y: 2 }, z: 1.2 }],
    activeListenerId: 'seat-1',
  } as unknown as Scene);

// --- input-field guard ----------------------------------------------------

describe('handleKeydown input-field guard', () => {
  it('ignores normal keys while typing in a field', () => {
    expect(handleKeydown(key('1'), env({ editableTarget: true }))).toBeNull();
    expect(handleKeydown(key('t'), env({ editableTarget: true }))).toBeNull();
  });

  it('still lets Escape close an overlay while typing in its field', () => {
    const r = handleKeydown(key('Escape'), env({ editableTarget: true, overlayOpen: true, dialogOpen: true }));
    expect(r?.command).toEqual({ type: 'escape', target: 'dialog' });
  });

  it('ignores Escape while typing when no overlay is open', () => {
    expect(handleKeydown(key('Escape'), env({ editableTarget: true }))).toBeNull();
  });
});

// --- Escape precedence chain ---------------------------------------------

describe('handleKeydown Escape precedence', () => {
  it('closes dialog first', () => {
    expect(
      handleKeydown(key('Escape'), env({ dialogOpen: true, wallProposalOpen: true, optimizeOpen: true }))?.command,
    ).toEqual({ type: 'escape', target: 'dialog' });
  });
  it('then wallProposal', () => {
    expect(
      handleKeydown(key('Escape'), env({ wallProposalOpen: true, optimizeOpen: true }))?.command,
    ).toEqual({ type: 'escape', target: 'wallProposal' });
  });
  it('then optimize', () => {
    expect(handleKeydown(key('Escape'), env({ optimizeOpen: true, arrangeOpen: true }))?.command).toEqual({
      type: 'escape',
      target: 'optimize',
    });
  });
  it('then arrange', () => {
    expect(handleKeydown(key('Escape'), env({ arrangeOpen: true }))?.command).toEqual({
      type: 'escape',
      target: 'arrange',
    });
  });
  it('otherwise deselect', () => {
    expect(handleKeydown(key('Escape'), env())?.command).toEqual({ type: 'escape', target: 'deselect' });
  });
});

// --- undo / redo ----------------------------------------------------------

describe('handleKeydown undo/redo', () => {
  it('meta+z is undo and preventDefaults', () => {
    const r = handleKeydown(key('z', { metaKey: true }), env());
    expect(r).toEqual({ command: { type: 'undo' }, preventDefault: true });
  });
  it('ctrl+shift+z is redo', () => {
    const r = handleKeydown(key('z', { ctrlKey: true, shiftKey: true }), env());
    expect(r?.command).toEqual({ type: 'redo' });
  });
  it('handles capital Z (shift changes key case)', () => {
    const r = handleKeydown(key('Z', { metaKey: true, shiftKey: true }), env());
    expect(r?.command).toEqual({ type: 'redo' });
  });
  it('meta+z behind an overlay is ignored WITHOUT preventDefault (native undo)', () => {
    expect(handleKeydown(key('z', { metaKey: true }), env({ overlayOpen: true }))).toBeNull();
  });
});

describe('handleKeydown modifier bail', () => {
  it('ignores other meta/ctrl/alt combos', () => {
    expect(handleKeydown(key('a', { metaKey: true }), env())).toBeNull();
    expect(handleKeydown(key('c', { ctrlKey: true }), env())).toBeNull();
    expect(handleKeydown(key('ArrowUp', { altKey: true }), env({ selection: { type: 'listener' } }))).toBeNull();
  });
});

// --- overlay gating -------------------------------------------------------

describe('handleKeydown overlay gating', () => {
  it('blocks tool/delete/nudge keys while an overlay is open', () => {
    expect(handleKeydown(key('2'), env({ overlayOpen: true }))).toBeNull();
    expect(handleKeydown(key('Delete'), env({ overlayOpen: true, selection: { type: 'object', id: 'r1' } }))).toBeNull();
    expect(handleKeydown(key('ArrowLeft'), env({ overlayOpen: true, selection: { type: 'listener' } }))).toBeNull();
  });
});

// --- delete / backspace ---------------------------------------------------

describe('handleKeydown delete/backspace', () => {
  it('deletes when there is a selection and not in wall mode', () => {
    expect(handleKeydown(key('Delete'), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'delete',
    });
    expect(handleKeydown(key('Backspace'), env({ selection: { type: 'speaker', id: 's1' } }))?.command).toEqual({
      type: 'delete',
    });
  });
  it('CONSUMES delete for a listener selection (no fall-through to tool keys)', () => {
    // listener has no delete sub-branch, but must still consume the key
    expect(handleKeydown(key('Backspace'), env({ selection: { type: 'listener' } }))?.command).toEqual({
      type: 'delete',
    });
  });
  it('does not consume Backspace in wall mode (SimCanvas chain-undo owns it)', () => {
    expect(handleKeydown(key('Backspace'), env({ selection: { type: 'object', id: 'r1' }, mode: 'wall' }))).toBeNull();
  });
  it('does nothing with no selection', () => {
    expect(handleKeydown(key('Delete'), env({ selection: null }))).toBeNull();
  });
});

// --- tool / mode keys (digit shortcuts are mode-scoped) -------------------

describe('handleKeydown tool keys — DESIGN mode', () => {
  it.each([
    ['1', 'select'],
    ['2', 'wall'],
    ['3', 'rect'],
    ['4', 'circle'],
  ])('key %s selects the %s tool', (k, tool) => {
    expect(handleKeydown(key(k), env({ appMode: 'design' }))?.command).toEqual({ type: 'tool', tool });
  });
  it('key 5 (speaker) is unbound in DESIGN', () => {
    expect(handleKeydown(key('5'), env({ appMode: 'design' }))).toBeNull();
  });
});

describe('handleKeydown tool keys — TUNE mode', () => {
  it.each([
    ['1', 'select'],
    ['5', 'speaker'],
  ])('key %s selects the %s tool', (k, tool) => {
    expect(handleKeydown(key(k), env({ appMode: 'tune' }))?.command).toEqual({ type: 'tool', tool });
  });
  it.each(['2', '3', '4'])('DESIGN digit %s is unbound in TUNE (no cross-mode leak)', (k) => {
    expect(handleKeydown(key(k), env({ appMode: 'tune' }))).toBeNull();
  });
});

describe('handleKeydown mode key', () => {
  it('t switches app-mode (which owns the theme) — never toggles the theme directly', () => {
    expect(handleKeydown(key('t'), env())?.command).toEqual({ type: 'mode-toggle' });
  });
});

// --- rotate ---------------------------------------------------------------

describe('handleKeydown rotate', () => {
  it('q/e rotate a selected object', () => {
    expect(handleKeydown(key('q'), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'rotate',
      dir: -1,
      coalesce: false,
    });
    expect(handleKeydown(key('e'), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'rotate',
      dir: 1,
      coalesce: false,
    });
  });
  it('held rotate repeat coalesces into one undo entry (like nudge)', () => {
    expect(handleKeydown(key('e', { repeat: true }), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'rotate',
      dir: 1,
      coalesce: true,
    });
  });
  it('q/e do nothing without an object selection', () => {
    expect(handleKeydown(key('q'), env({ selection: { type: 'speaker', id: 's1' } }))).toBeNull();
    expect(handleKeydown(key('e'), env({ selection: null }))).toBeNull();
  });
});

// --- arrow nudge ----------------------------------------------------------

describe('handleKeydown arrow nudge', () => {
  it('nudges the selection and preventDefaults', () => {
    expect(handleKeydown(key('ArrowLeft'), env({ selection: { type: 'listener' } }))).toEqual({
      command: { type: 'nudge', dx: -0.05, dy: 0, coalesce: false },
      preventDefault: true,
    });
    expect(handleKeydown(key('ArrowDown'), env({ selection: { type: 'listener' } }))?.command).toEqual({
      type: 'nudge',
      dx: 0,
      dy: 0.05,
      coalesce: false,
    });
  });
  it('shift makes a coarse 0.25 m step', () => {
    expect(handleKeydown(key('ArrowRight', { shiftKey: true }), env({ selection: { type: 'listener' } }))?.command).toEqual({
      type: 'nudge',
      dx: 0.25,
      dy: 0,
      coalesce: false,
    });
  });
  it('held-key repeat coalesces into the current undo entry', () => {
    expect(handleKeydown(key('ArrowUp', { repeat: true }), env({ selection: { type: 'listener' } }))?.command).toEqual({
      type: 'nudge',
      dx: 0,
      dy: -0.05,
      coalesce: true,
    });
  });
  it('does nothing (and does not preventDefault) without a selection', () => {
    expect(handleKeydown(key('ArrowUp'), env({ selection: null }))).toBeNull();
  });
});

// --- pure scene transforms ------------------------------------------------

describe('rotateSelectedRect', () => {
  it('rotates a rect by +5 degrees', () => {
    const scene = baseScene([rect('r1')], []);
    const out = rotateSelectedRect(scene, 'r1', 1);
    const o = out.objects[0];
    expect(o.kind === 'rect' && o.rotation).toBeCloseTo((5 * Math.PI) / 180, 6);
  });
  it('wraps past +180 degrees back into range', () => {
    const scene = baseScene([{ ...rect('r1'), rotation: Math.PI - 0.01 } as SceneObject], []);
    const out = rotateSelectedRect(scene, 'r1', 1);
    const o = out.objects[0];
    expect(o.kind === 'rect' && o.rotation).toBeLessThan(0); // wrapped
  });
  it('ignores non-rect / non-matching ids', () => {
    const scene = baseScene([rect('r1')], []);
    expect(rotateSelectedRect(scene, 'nope', 1).objects[0]).toBe(scene.objects[0]);
  });
  it('returns the SAME scene reference for a non-rect target (no undo-stack churn)', () => {
    const wall: SceneObject = {
      id: 'w1',
      kind: 'wall',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      height: 2.4,
      absorption: 0.1,
    } as SceneObject;
    const scene = baseScene([wall], []);
    // Same object identity => historyPush dedups it => a stray q/e or touch-HUD
    // tap on a wall can't push a no-op undo entry.
    expect(rotateSelectedRect(scene, 'w1', 1)).toBe(scene);
  });
});

describe('nudgeSelection', () => {
  const d = { x: 0.05, y: -0.05 };
  it('moves a selected object', () => {
    const scene = baseScene([rect('r1', 1, 1)], []);
    const out = nudgeSelection(scene, { type: 'object', id: 'r1' }, d);
    const o = out.objects[0];
    expect(o.kind === 'rect' && o.center).toEqual({ x: 1.05, y: 0.95 });
  });
  it('moves a selected speaker', () => {
    const scene = baseScene([], [speaker('s1', 3, 3)]);
    const out = nudgeSelection(scene, { type: 'speaker', id: 's1' }, d);
    expect(out.speakers[0].pos).toEqual({ x: 3.05, y: 2.95 });
  });
  it('moves the active listener (through the seat helper — mirror stays synced)', () => {
    const scene = baseScene([], []);
    const out = nudgeSelection(scene, { type: 'listener' }, d);
    expect(out.listener.pos).toEqual({ x: 2.05, y: 1.95 });
    expect(out.listeners?.[0].pos).toEqual(out.listener.pos); // mirror invariant
  });
  it('moves every member of a multi-selection', () => {
    const scene = baseScene([rect('r1', 1, 1)], [speaker('s1', 3, 3)]);
    const sel: Selection = { type: 'multi', objectIds: ['r1'], speakerIds: ['s1'] };
    const out = nudgeSelection(scene, sel, d);
    const o = out.objects[0];
    expect(o.kind === 'rect' && o.center).toEqual({ x: 1.05, y: 0.95 });
    expect(out.speakers[0].pos).toEqual({ x: 3.05, y: 2.95 });
  });
});
