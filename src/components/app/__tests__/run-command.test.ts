import { describe, expect, it, vi } from 'vitest';
import { runCommand, type CommandContext } from '../run-command';
import type { KeyCommand } from '../keyboard';
import type { Scene, SceneObject, Selection } from '../../../engine/types';
import { ROOM_HEIGHT } from '../../../engine/scene';

/**
 * The command dispatcher, extracted from AppInner in S37.
 *
 * Nothing pinned any of this before. `keyboard.ts` is covered (it decides WHICH
 * command a keystroke means) but what a command DOES lived inside a 1292-line
 * component, and jsdom cannot drive the real keyboard path end to end — the
 * canvas never receives a usable PointerEvent there (TRAP 21) and the window
 * keydown route runs through a mount-once ref. So these are the first
 * assertions in the project's history over the escape ladder, the coalesce
 * plumbing and the flip-door router.
 *
 * The style throughout is a RECORDING context: every member is a spy, so a test
 * can assert not just the outcome but the ORDER and the exact arguments — which
 * is what several of these actually turn on.
 */

// --- fixtures -------------------------------------------------------------

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
  height: 0.9,
});

const wall = (id: string, ax = 0, ay = 0, bx = 4, by = 0): SceneObject => ({
  id,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  absorption: 0.12,
  label: 'Wall',
  height: ROOM_HEIGHT,
});

function sceneWith(objects: SceneObject[]): Scene {
  const seat = { id: 'seat1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 };
  return {
    objects,
    speakers: [],
    pairs: [],
    listener: { pos: seat.pos, z: seat.z },
    listeners: [seat, { id: 'seat2', name: 'Bed', pos: { x: 3, y: 3 }, z: 1.2 }],
    activeListenerId: 'seat1',
    rooms: [],
  } as unknown as Scene;
}

/** A fully-recording context. `calls` preserves cross-member ORDER. */
function makeCtx(over: Partial<CommandContext> = {}) {
  const calls: string[] = [];
  const rec =
    <T extends unknown[]>(name: string, fn?: (...a: T) => void) =>
    (...a: T) => {
      calls.push(name);
      fn?.(...a);
    };
  const scene = over.scene ?? sceneWith([rect('r1'), wall('w1')]);
  const ctx: CommandContext = {
    scene,
    settings: { snap: true } as CommandContext['settings'],
    selection: null,
    appMode: 'design',
    placeModel: 'homepod',
    notice: null,
    setNotice: vi.fn(rec('setNotice')),
    setScene: vi.fn(rec('setScene')),
    setSelection: vi.fn(rec('setSelection')),
    setMode: vi.fn(rec('setMode')),
    setModeTo: vi.fn(rec('setModeTo')),
    applyTool: vi.fn(rec('applyTool')),
    setDialog: vi.fn(rec('setDialog')),
    setOptimizeOpen: vi.fn(rec('setOptimizeOpen')),
    setProposal: vi.fn(rec('setProposal')),
    setArrangeOpen: vi.fn(rec('setArrangeOpen')),
    setFurnitureProposal: vi.fn(rec('setFurnitureProposal')),
    detection: { discard: vi.fn(rec('discard')) },
    undoScene: vi.fn(rec('undoScene')),
    redoScene: vi.fn(rec('redoScene')),
    deleteObject: vi.fn(rec('deleteObject')),
    deleteSpeaker: vi.fn(rec('deleteSpeaker')),
    deleteMulti: vi.fn(rec('deleteMulti')),
    switchSeat: vi.fn(rec('switchSeat')),
    ...over,
  };
  return { ctx, calls };
}

/** Run the updater the dispatcher handed to setScene, against the ctx scene. */
function appliedScene(ctx: CommandContext): Scene {
  const fn = (ctx.setScene as unknown as { mock: { calls: [(s: Scene) => Scene][] } }).mock.calls[0][0];
  return fn(ctx.scene);
}

// --- the notice pre-empt --------------------------------------------------

describe('runCommand — the transient notice', () => {
  // Every command supersedes the previous "that didn't work" explanation, and
  // it must happen BEFORE the switch or a command that sets its own notice
  // would immediately have it cleared.
  const everyKind: KeyCommand[] = [
    { type: 'escape', target: 'deselect' },
    { type: 'undo' },
    { type: 'redo' },
    { type: 'delete' },
    { type: 'tool', tool: 'wall' },
    { type: 'mode-toggle' },
    { type: 'rotate', dir: 1, coarse: false, coalesce: false },
    { type: 'nudge', dx: 1, dy: 0, coalesce: false },
    { type: 'cycle', dir: 1 },
    { type: 'place-speaker' },
    { type: 'opening', role: 'door' },
    { type: 'flip-door', field: 'hinge' },
  ];

  for (const cmd of everyKind) {
    it(`clears a pending notice for "${cmd.type}"`, () => {
      const { ctx } = makeCtx({ notice: 'stale' });
      runCommand(cmd, ctx);
      expect(ctx.setNotice).toHaveBeenCalledWith(null);
    });
  }

  it('does NOT clear when there is no notice — an unconditional clear would be a wasted render', () => {
    const { ctx } = makeCtx({ notice: null });
    runCommand({ type: 'undo' }, ctx);
    expect(ctx.setNotice).not.toHaveBeenCalled();
  });

  it('clears the OLD notice before setting a new one, in that order', () => {
    // `opening` with furniture selected sets its own notice. If the pre-empt
    // ran after the switch it would wipe the explanation the user needs.
    const { ctx, calls } = makeCtx({ notice: 'stale', selection: { type: 'object', id: 'r1' } });
    runCommand({ type: 'opening', role: 'door' }, ctx);
    expect(calls).toEqual(['setNotice', 'setNotice']);
    expect((ctx.setNotice as unknown as { mock: { calls: [string | null][] } }).mock.calls[0][0]).toBeNull();
    expect((ctx.setNotice as unknown as { mock: { calls: [string | null][] } }).mock.calls[1][0]).toMatch(/wall/i);
  });
});

// --- the escape ladder ----------------------------------------------------

describe('runCommand — escape is a LADDER, one rung per target', () => {
  it('dialog closes only the dialog', () => {
    const { ctx, calls } = makeCtx();
    runCommand({ type: 'escape', target: 'dialog' }, ctx);
    expect(calls).toEqual(['setDialog']);
    expect(ctx.setDialog).toHaveBeenCalledWith(null);
  });

  it('wallProposal discards the detection — never setScene', () => {
    const { ctx, calls } = makeCtx();
    runCommand({ type: 'escape', target: 'wallProposal' }, ctx);
    expect(calls).toEqual(['discard']);
    expect(ctx.setScene).not.toHaveBeenCalled();
  });

  it('optimize clears BOTH the open flag and the proposal', () => {
    const { ctx, calls } = makeCtx();
    runCommand({ type: 'escape', target: 'optimize' }, ctx);
    expect(calls).toEqual(['setOptimizeOpen', 'setProposal']);
  });

  it('arrange clears BOTH the open flag and the furniture proposal', () => {
    const { ctx, calls } = makeCtx();
    runCommand({ type: 'escape', target: 'arrange' }, ctx);
    expect(calls).toEqual(['setArrangeOpen', 'setFurnitureProposal']);
  });

  it('the fallback rung re-arms select, announces, then deselects — in that order', () => {
    const { ctx, calls } = makeCtx({ selection: { type: 'object', id: 'r1' } });
    runCommand({ type: 'escape', target: 'deselect' }, ctx);
    expect(calls).toEqual(['setMode', 'setNotice', 'setSelection']);
    expect(ctx.setMode).toHaveBeenCalledWith('select');
    expect(ctx.setSelection).toHaveBeenCalledWith(null);
  });

  it('announces the TRANSITION, not the state — nothing selected stays silent', () => {
    // Deselecting nothing must not say "Selection cleared", or every Escape
    // narrates a no-op to the only channel a live-region user has.
    const { ctx } = makeCtx({ selection: null });
    runCommand({ type: 'escape', target: 'deselect' }, ctx);
    expect(ctx.setNotice).not.toHaveBeenCalledWith('Selection cleared.');
    expect(ctx.setSelection).toHaveBeenCalledWith(null);
  });
});

// --- delete routes by selection kind --------------------------------------

describe('runCommand — delete', () => {
  it('does nothing with no selection', () => {
    const { ctx, calls } = makeCtx({ selection: null });
    runCommand({ type: 'delete' }, ctx);
    expect(calls).toEqual([]);
  });

  it.each([
    ['object', { type: 'object', id: 'r1' } as Selection, 'deleteObject'],
    ['speaker', { type: 'speaker', id: 's1' } as Selection, 'deleteSpeaker'],
  ])('routes a %s selection to %s', (_kind, selection, expected) => {
    const { ctx, calls } = makeCtx({ selection });
    runCommand({ type: 'delete' }, ctx);
    expect(calls).toEqual([expected]);
  });

  it('routes a multi selection to deleteMulti with BOTH id lists', () => {
    const { ctx } = makeCtx({
      selection: { type: 'multi', objectIds: ['r1', 'r2'], speakerIds: ['s1'] },
    });
    runCommand({ type: 'delete' }, ctx);
    expect(ctx.deleteMulti).toHaveBeenCalledWith(['r1', 'r2'], ['s1']);
  });

  it('a listener selection deletes NOTHING — a seat is not deletable from here', () => {
    const { ctx, calls } = makeCtx({ selection: { type: 'listener' } });
    runCommand({ type: 'delete' }, ctx);
    expect(calls).toEqual([]);
  });
});

// --- coalescing: the held-key contract ------------------------------------

describe('runCommand — coalesce reaches setScene', () => {
  // A held arrow/q/e must fold into ONE undo entry. The flag travels
  // cmd -> setScene opts, and nothing else carries it, so dropping it here is
  // invisible until a user holds a key and then presses undo 40 times.
  it.each([true, false])('rotate passes coalesce=%s through', (coalesce) => {
    const { ctx } = makeCtx({ selection: { type: 'object', id: 'r1' } });
    runCommand({ type: 'rotate', dir: 1, coarse: false, coalesce }, ctx);
    expect(ctx.setScene).toHaveBeenCalledWith(expect.any(Function), { coalesce });
  });

  it.each([true, false])('nudge passes coalesce=%s through', (coalesce) => {
    const { ctx } = makeCtx({ selection: { type: 'object', id: 'r1' } });
    runCommand({ type: 'nudge', dx: 1, dy: 0, coalesce }, ctx);
    expect(ctx.setScene).toHaveBeenCalledWith(expect.any(Function), { coalesce });
  });

  it('rotate on a non-object selection is a no-op', () => {
    const { ctx, calls } = makeCtx({ selection: { type: 'listener' } });
    runCommand({ type: 'rotate', dir: 1, coarse: false, coalesce: false }, ctx);
    expect(calls).toEqual([]);
  });

  it('nudge moves the SELECTED rect, and only it', () => {
    const { ctx } = makeCtx({
      scene: sceneWith([rect('r1', 0, 0), rect('r2', 5, 5)]),
      selection: { type: 'object', id: 'r1' },
    });
    runCommand({ type: 'nudge', dx: 0.5, dy: 0, coalesce: false }, ctx);
    const next = appliedScene(ctx);
    const moved = next.objects.find((o) => o.id === 'r1');
    const still = next.objects.find((o) => o.id === 'r2');
    expect(moved && 'center' in moved ? moved.center.x : null).toBeCloseTo(0.5, 9);
    expect(still && 'center' in still ? still.center.x : null).toBe(5);
  });
});

// --- cycle ----------------------------------------------------------------

describe('runCommand — cycle', () => {
  it('a SEAT entry switches the active seat instead of merely selecting it', () => {
    // `{type:'listener'}` carries no id, so selecting without switching would
    // point at whichever seat was already active and desync the readout.
    const { ctx, calls } = makeCtx({ selection: null });
    runCommand({ type: 'cycle', dir: 1 }, ctx);
    expect(calls).toEqual(['switchSeat']);
    expect(ctx.setSelection).not.toHaveBeenCalled();
  });

  it('a non-seat entry sets the selection and does NOT switch seats', () => {
    // Start on the last seat so one forward step lands on an object.
    const { ctx, calls } = makeCtx({
      scene: sceneWith([rect('r1')]),
      selection: { type: 'object', id: 'r1' },
    });
    runCommand({ type: 'cycle', dir: 1 }, ctx);
    expect(calls).toEqual(['switchSeat']);
    const back = makeCtx({ scene: sceneWith([rect('r1')]), selection: { type: 'listener' } });
    runCommand({ type: 'cycle', dir: -1 }, back.ctx);
    expect(back.calls.length).toBe(1);
  });
});

// --- openings -------------------------------------------------------------

describe('runCommand — opening', () => {
  it('cuts a door into a SELECTED wall and selects the result', () => {
    const { ctx } = makeCtx({
      scene: sceneWith([wall('w1')]),
      selection: { type: 'object', id: 'w1' },
    });
    runCommand({ type: 'opening', role: 'door' }, ctx);
    expect(ctx.setScene).toHaveBeenCalled();
    expect(ctx.setSelection).toHaveBeenCalledWith(expect.objectContaining({ type: 'object' }));
    expect(ctx.setNotice).not.toHaveBeenCalledWith(expect.stringMatching(/Select a wall/));
  });

  it('EXPLAINS itself on furniture rather than silently doing nothing', () => {
    // `{type:'object'}` spans wall/rect/circle, so the dispatcher cannot tell a
    // wall from a sofa. For a user whose only channel is the live region a
    // silent no-op is indistinguishable from a broken app.
    const { ctx } = makeCtx({
      scene: sceneWith([rect('r1')]),
      selection: { type: 'object', id: 'r1' },
    });
    runCommand({ type: 'opening', role: 'window' }, ctx);
    expect(ctx.setScene).not.toHaveBeenCalled();
    expect(ctx.setNotice).toHaveBeenCalledWith(expect.stringMatching(/Select a wall first — windows/));
  });

  it('is a no-op with no object selected', () => {
    const { ctx, calls } = makeCtx({ selection: null });
    runCommand({ type: 'opening', role: 'door' }, ctx);
    expect(calls).toEqual([]);
  });
});

// --- the flip-door router -------------------------------------------------

describe('runCommand — flip-door is a same-ref ROUTER, not just a door command', () => {
  it('flips a real door and stops there', () => {
    const door: SceneObject = {
      id: 'd1',
      kind: 'rect',
      center: { x: 2, y: 0 },
      w: 0.9,
      h: 0.1,
      rotation: 0,
      absorption: 0.2,
      label: 'Door',
      role: 'door',
      height: ROOM_HEIGHT,
      hingeEnd: 'start',
      swingSide: 'in',
      swingDeg: 90,
    } as unknown as SceneObject;
    const { ctx, calls } = makeCtx({
      scene: sceneWith([door]),
      selection: { type: 'object', id: 'd1' },
    });
    runCommand({ type: 'flip-door', field: 'hinge' }, ctx);
    expect(calls).toEqual(['setScene']);
    expect(ctx.setNotice).not.toHaveBeenCalled();
  });

  it('PLAIN F on furniture near a wall falls through to the furniture seat', () => {
    // `flipDoor` returns the SAME scene ref for a non-door, and that identity IS
    // the router. A rect 0.3 m off a wall is inside COMMAND_SEAT's 1.2 m reach.
    const { ctx, calls } = makeCtx({
      scene: sceneWith([wall('w1', 0, 0, 6, 0), rect('r1', 3, 0.6)]),
      selection: { type: 'object', id: 'r1' },
    });
    runCommand({ type: 'flip-door', field: 'hinge' }, ctx);
    expect(calls).toEqual(['setScene']);
    expect(ctx.setNotice).not.toHaveBeenCalled();
  });

  it('SHIFT+F on the same furniture does NOT seat it — the fall-through is hinge-only', () => {
    // Deliberate (docs/ideas.md §4d): the quarter-turned class is not
    // representable in the drag magnet's output space, so ⇧F stays a door
    // command. This is the assertion that stops a later "simplification"
    // from making both fields fall through.
    const { ctx, calls } = makeCtx({
      scene: sceneWith([wall('w1', 0, 0, 6, 0), rect('r1', 3, 0.6)]),
      selection: { type: 'object', id: 'r1' },
    });
    runCommand({ type: 'flip-door', field: 'swing' }, ctx);
    expect(calls).toEqual(['setNotice']);
    expect(ctx.setNotice).toHaveBeenCalledWith(expect.stringMatching(/Shift F flips/));
  });

  it('furniture far from every wall explains itself instead of doing nothing', () => {
    const { ctx, calls } = makeCtx({
      scene: sceneWith([wall('w1', 0, 0, 6, 0), rect('r1', 3, 40)]),
      selection: { type: 'object', id: 'r1' },
    });
    runCommand({ type: 'flip-door', field: 'hinge' }, ctx);
    expect(calls).toEqual(['setNotice']);
    expect(ctx.setNotice).toHaveBeenCalledWith(expect.stringMatching(/1\.2 m of a wall/));
  });
});

// --- the remaining plain commands ----------------------------------------

describe('runCommand — plain commands', () => {
  it('undo and redo go straight through', () => {
    const { ctx } = makeCtx();
    runCommand({ type: 'undo' }, ctx);
    runCommand({ type: 'redo' }, ctx);
    expect(ctx.undoScene).toHaveBeenCalledTimes(1);
    expect(ctx.redoScene).toHaveBeenCalledTimes(1);
  });

  it('tool goes through applyTool — never setMode, which would skip the sub-step flip', () => {
    const { ctx, calls } = makeCtx();
    runCommand({ type: 'tool', tool: 'wall' }, ctx);
    expect(calls).toEqual(['applyTool']);
    expect(ctx.applyTool).toHaveBeenCalledWith('wall');
  });

  it.each([
    ['design', 'tune'],
    ['tune', 'design'],
  ] as const)('mode-toggle takes %s to %s', (from, to) => {
    const { ctx } = makeCtx({ appMode: from });
    runCommand({ type: 'mode-toggle' }, ctx);
    expect(ctx.setModeTo).toHaveBeenCalledWith(to);
  });

  it('place-speaker adds one speaker and selects it', () => {
    const { ctx } = makeCtx();
    runCommand({ type: 'place-speaker' }, ctx);
    const next = appliedScene(ctx);
    expect(next.speakers).toHaveLength(1);
    expect(ctx.setSelection).toHaveBeenCalledWith({ type: 'speaker', id: next.speakers[0].id });
  });

  it('place-speaker uses the ctx model, not a hardcoded one', () => {
    const { ctx } = makeCtx({ placeModel: 'homepod-mini' });
    runCommand({ type: 'place-speaker' }, ctx);
    expect(appliedScene(ctx).speakers[0].model).toBe('homepod-mini');
  });

  it('the four constant-updater sites ignore their argument', () => {
    // `setScene(() => next)` rather than `setScene((s) => ...)`: the value was
    // already computed from the ctx scene, so re-reading the updater's argument
    // would be a second, possibly newer, read of the same thing.
    const { ctx } = makeCtx();
    runCommand({ type: 'place-speaker' }, ctx);
    const fn = (ctx.setScene as unknown as { mock: { calls: [(s: Scene) => Scene][] } }).mock.calls[0][0];
    const other = sceneWith([rect('zzz')]);
    expect(fn(other)).toBe(fn(ctx.scene));
  });
});
