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
  // Both default to the pre-S7 behaviour (no interactive target, canvas not
  // focused), so every pre-existing assertion below is unchanged.
  interactiveTarget: false,
  canvasFocused: false,
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
  it('q/e rotate a selected object by a FINE step', () => {
    expect(handleKeydown(key('q'), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'rotate',
      dir: -1,
      coarse: false,
      coalesce: false,
    });
    expect(handleKeydown(key('e'), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'rotate',
      dir: 1,
      coarse: false,
      coalesce: false,
    });
  });
  it('shift makes a coarse rotate step (mirrors arrow-nudge shift)', () => {
    expect(
      handleKeydown(key('e', { shiftKey: true }), env({ selection: { type: 'object', id: 'r1' } }))?.command,
    ).toEqual({ type: 'rotate', dir: 1, coarse: true, coalesce: false });
  });
  it('held rotate repeat coalesces into one undo entry (like nudge)', () => {
    expect(handleKeydown(key('e', { repeat: true }), env({ selection: { type: 'object', id: 'r1' } }))?.command).toEqual({
      type: 'rotate',
      dir: 1,
      coarse: false,
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
  it('rotates a rect by a FINE 1 degree by default', () => {
    // 5° was too coarse to sit a bed flush against an angled wall — the whole
    // point of the fine step. 1° leaves ≤0.5° of error, ~1.7 cm over a 2 m bed.
    const scene = baseScene([rect('r1')], []);
    const out = rotateSelectedRect(scene, 'r1', 1);
    const o = out.objects[0];
    expect(o.kind === 'rect' && o.rotation).toBeCloseTo((1 * Math.PI) / 180, 6);
  });
  it('rotates by a coarse 15 degrees when asked', () => {
    const scene = baseScene([rect('r1')], []);
    const out = rotateSelectedRect(scene, 'r1', 1, true);
    const o = out.objects[0];
    expect(o.kind === 'rect' && o.rotation).toBeCloseTo((15 * Math.PI) / 180, 6);
  });
  it('reaches an arbitrary wall angle within half a degree', () => {
    // The Maple Court front wall runs (0.57,1.49)->(4.28,0.72): ≈ -11.73°.
    // Chosen deliberately: it sits 1.73° from the nearest multiple of 5, so the
    // OLD 5° step oscillates between -10° and -15° and can never land inside the
    // tolerance. (The entry wall at -49.61° would NOT discriminate — it happens
    // to be 0.39° from -50°, so a 5° step reaches it and the test would pass
    // against the very bug it exists to catch.)
    const target = Math.atan2(0.72 - 1.49, 4.28 - 0.57);
    let scene = baseScene([rect('r1')], []);
    for (let i = 0; i < 400; i++) {
      const o = scene.objects[0];
      const rot = o.kind === 'rect' ? o.rotation : 0;
      if (Math.abs(rot - target) <= (0.5 * Math.PI) / 180) break;
      scene = rotateSelectedRect(scene, 'r1', rot > target ? -1 : 1);
    }
    const o = scene.objects[0];
    expect(o.kind === 'rect' && Math.abs(o.rotation - target)).toBeLessThanOrEqual((0.5 * Math.PI) / 180);
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

// ---------------------------------------------------------------------------
// S7 — the canvas keyboard model
// ---------------------------------------------------------------------------

const sel = (id: string): Selection => ({ type: 'object', id });
const wallSel = (id = 'w1'): Selection => ({ type: 'object', id });

const sceneWithWall = (): Scene => ({
  objects: [
    { id: 'w1', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, absorption: 0.12, label: 'Wall', height: 2.7 },
    rect('r1'),
  ],
  speakers: [],
  pairs: [],
  listener: { pos: { x: 1, y: 1 }, z: 1.2 },
  listeners: [{ id: 'seat-1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 }],
  activeListenerId: 'seat-1',
});

describe('S7: selection cycling (n / Shift+N)', () => {
  it('cycles forward on n when the canvas is focused', () =>
    expect(handleKeydown(key('n'), env({ canvasFocused: true }))?.command).toEqual({
      type: 'cycle', dir: 1,
    }));

  it('cycles backward on Shift+N', () =>
    expect(handleKeydown(key('N', { shiftKey: true }), env({ canvasFocused: true }))?.command).toEqual({
      type: 'cycle', dir: -1,
    }));

  it('does NOTHING when the canvas is not focused', () =>
    expect(handleKeydown(key('n'), env({ canvasFocused: false }))).toBeNull());

  it('is blocked behind an overlay', () =>
    expect(handleKeydown(key('n'), env({ canvasFocused: true, overlayOpen: true }))).toBeNull());

  it('is blocked while typing in a field', () =>
    expect(handleKeydown(key('n'), env({ canvasFocused: true, editableTarget: true }))).toBeNull());
});

describe('S7: keyboard speaker placement (p)', () => {
  it('places when the canvas is focused in TUNE', () =>
    expect(handleKeydown(key('p'), env({ canvasFocused: true, appMode: 'tune' }))?.command).toEqual({
      type: 'place-speaker',
    }));

  it('is MODE-SCOPED — silent in DESIGN, like every digit shortcut', () => {
    // S14 made tools mode-scoped so a DESIGN key can never reach a TUNE tool.
    // A letter key must not be the loophole that reintroduces the leak.
    expect(handleKeydown(key('p'), env({ canvasFocused: true, appMode: 'design' }))).toBeNull();
  });

  it('does nothing when the canvas is not focused', () =>
    expect(handleKeydown(key('p'), env({ canvasFocused: false, appMode: 'tune' }))).toBeNull());

  it('is blocked behind an overlay', () =>
    expect(handleKeydown(key('p'), env({ canvasFocused: true, appMode: 'tune', overlayOpen: true }))).toBeNull());
});

describe('S7: door / window on a selected wall (d / w)', () => {
  const base = { canvasFocused: true, appMode: 'design' as const, selection: wallSel() };

  it('inserts a door on d', () =>
    expect(handleKeydown(key('d'), env(base))?.command).toEqual({ type: 'opening', role: 'door' }));

  it('inserts a window on w', () =>
    expect(handleKeydown(key('w'), env(base))?.command).toEqual({ type: 'opening', role: 'window' }));

  it('is MODE-SCOPED — silent in TUNE', () =>
    expect(handleKeydown(key('d'), env({ ...base, appMode: 'tune' }))).toBeNull());

  it('does nothing without a selection', () =>
    expect(handleKeydown(key('d'), env({ ...base, selection: null }))).toBeNull());

  it('does nothing when a speaker is selected', () =>
    expect(handleKeydown(key('d'), env({ ...base, selection: { type: 'speaker', id: 's1' } }))).toBeNull());

  it('does nothing when the canvas is not focused', () =>
    expect(handleKeydown(key('d'), env({ ...base, canvasFocused: false }))).toBeNull());
});

describe('S7: interactiveTarget gates the keys with native/roving semantics', () => {
  // A focused <button> (the most common state after any click) must not have
  // Arrow or Delete stolen from it — ListenerCard and SegmentSwitch both drive
  // roving focus with Arrow and neither stops propagation.
  it('blocks arrow-nudge while a roving widget has focus', () =>
    expect(handleKeydown(key('ArrowLeft'), env({ selection: sel('r1'), interactiveTarget: true }))).toBeNull());

  it('blocks Delete while an interactive control has focus', () =>
    expect(handleKeydown(key('Delete'), env({ selection: sel('r1'), interactiveTarget: true }))).toBeNull());

  it('blocks the new canvas keys too', () => {
    expect(handleKeydown(key('n'), env({ canvasFocused: true, interactiveTarget: true }))).toBeNull();
    expect(handleKeydown(key('p'), env({ canvasFocused: true, appMode: 'tune', interactiveTarget: true }))).toBeNull();
  });

  it('does NOT block t / digits / q / e — they have no native button semantics', () => {
    // Over-blocking these would silently break documented shortcuts the moment
    // the user clicks any sidebar or toolbar button.
    expect(handleKeydown(key('t'), env({ interactiveTarget: true }))?.command).toEqual({ type: 'mode-toggle' });
    expect(handleKeydown(key('1'), env({ interactiveTarget: true }))?.command.type).toBe('tool');
    expect(handleKeydown(key('q'), env({ selection: sel('r1'), interactiveTarget: true }))?.command.type)
      .toBe('rotate');
  });

  it('does NOT block Escape or undo/redo — they must stay global', () => {
    expect(handleKeydown(key('Escape'), env({ interactiveTarget: true }))?.command).toEqual({
      type: 'escape', target: 'deselect',
    });
    expect(handleKeydown(key('z', { metaKey: true }), env({ interactiveTarget: true }))?.command).toEqual({
      type: 'undo',
    });
  });
});

describe('S7: the pre-existing ladder is unchanged when both new flags are false', () => {
  it('arrow-nudge still fires', () =>
    expect(handleKeydown(key('ArrowLeft'), env({ selection: sel('r1') }))?.command.type).toBe('nudge'));
  it('delete still fires', () =>
    expect(handleKeydown(key('Delete'), env({ selection: sel('r1') }))?.command.type).toBe('delete'));
  it('n is inert without canvas focus (no behaviour change for existing users)', () =>
    expect(handleKeydown(key('n'), env())).toBeNull());
});

describe('S7: openingOnWall command carries the scene-independent role only', () => {
  it('leaves the id resolution to the App (the selection already names it)', () => {
    const s = sceneWithWall();
    expect(s.objects[0].kind).toBe('wall');
    expect(handleKeydown(key('w'), env({ canvasFocused: true, appMode: 'design', selection: wallSel() }))?.command)
      .toEqual({ type: 'opening', role: 'window' });
  });
});
