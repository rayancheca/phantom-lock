import { describe, expect, it } from 'vitest';
import type { Scene, SceneObject, Selection, SpeakerObj } from '../../../engine/types';
import { cycleOrder, describePosition, selectionForEntry, stepCycle } from '../selection-cycle';

// --- fixtures ---------------------------------------------------------------

const wall = (id: string, ax: number, ay: number, bx: number, by: number): SceneObject => ({
  id,
  kind: 'wall',
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  absorption: 0.12,
  label: 'Wall',
  height: 2.7,
});

const rect = (
  id: string,
  cx: number,
  cy: number,
  role: 'furniture' | 'tv' | 'window' | 'door' = 'furniture',
  label = 'Thing',
): SceneObject => ({
  id,
  kind: 'rect',
  center: { x: cx, y: cy },
  w: 1.8,
  h: 0.9,
  rotation: 0,
  absorption: 0.2,
  label,
  role,
  height: 0.75,
});

const circle = (id: string, cx: number, cy: number): SceneObject => ({
  id,
  kind: 'circle',
  center: { x: cx, y: cy },
  r: 0.55,
  absorption: 0.3,
  label: 'Table',
  height: 0.75,
});

const spk = (id: string, label: string, x = 0, y = 0): SpeakerObj => ({
  id,
  pos: { x, y },
  z: 1,
  label,
  model: 'homepod',
  trimDb: 0,
});

const scene = (over: Partial<Scene> = {}): Scene => ({
  objects: [],
  speakers: [],
  pairs: [],
  listener: { pos: { x: 2, y: 2 }, z: 1.2 },
  listeners: [{ id: 'seat-1', name: 'Couch', pos: { x: 2, y: 2 }, z: 1.2 }],
  activeListenerId: 'seat-1',
  ...over,
});

// --- cycleOrder -------------------------------------------------------------

describe('cycleOrder', () => {
  it('returns an empty order for a scene with nothing selectable', () => {
    // A scene always has at least one seat, so the truly-empty case is the
    // defensive one: no seats, no speakers, no objects.
    const s = { ...scene(), listeners: [], activeListenerId: undefined } as unknown as Scene;
    expect(cycleOrder({ ...s, listener: undefined as never })).toEqual([]);
  });

  it('groups strictly seats, then speakers, then objects', () => {
    const s = scene({
      objects: [rect('r1', 1, 1)],
      speakers: [spk('s1', 'A')],
    });
    expect(cycleOrder(s).map((e) => e.kind)).toEqual(['listener', 'speaker', 'object']);
  });

  it('lists seats in scene order and marks the active one', () => {
    const s = scene({
      listeners: [
        { id: 'seat-1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 },
        { id: 'seat-2', name: 'Bed', pos: { x: 4, y: 4 }, z: 1.2 },
      ],
      activeListenerId: 'seat-2',
    });
    const order = cycleOrder(s);
    expect(order.map((e) => e.id)).toEqual(['seat-1', 'seat-2']);
    expect(order[0].label).toBe('Seat Couch');
    expect(order[1].label).toBe('Seat Bed, active');
  });

  it('sorts speakers by label, then by id', () => {
    const s = scene({ speakers: [spk('s3', 'C'), spk('s1', 'A'), spk('s2', 'B')] });
    expect(cycleOrder(s).filter((e) => e.kind === 'speaker').map((e) => e.id)).toEqual([
      's1', 's2', 's3',
    ]);
  });

  it('breaks a speaker label tie deterministically by id', () => {
    const s = scene({ speakers: [spk('sZ', 'A'), spk('sA', 'A')] });
    expect(cycleOrder(s).filter((e) => e.kind === 'speaker').map((e) => e.id)).toEqual(['sA', 'sZ']);
  });

  it('sorts objects in reading order — y first, then x', () => {
    const s = scene({ objects: [rect('r-far', 0, 9), rect('r-near-right', 5, 1), rect('r-near-left', 1, 1)] });
    expect(cycleOrder(s).filter((e) => e.kind === 'object').map((e) => e.id)).toEqual([
      'r-near-left', 'r-near-right', 'r-far',
    ]);
  });

  it('breaks an identical-position object tie by id', () => {
    const s = scene({ objects: [rect('rB', 2, 2), rect('rA', 2, 2)] });
    expect(cycleOrder(s).filter((e) => e.kind === 'object').map((e) => e.id)).toEqual(['rA', 'rB']);
  });

  it('anchors a wall at its midpoint, not an endpoint', () => {
    // The wall's midpoint (y=5) must place it AFTER a rect at y=1 even though
    // the wall's `a` endpoint is at y=0.
    const s = scene({ objects: [wall('w1', 0, 0, 0, 10), rect('r1', 1, 1)] });
    expect(cycleOrder(s).filter((e) => e.kind === 'object').map((e) => e.id)).toEqual(['r1', 'w1']);
  });

  it('is independent of the input array order (determinism guarantee)', () => {
    const objs = [rect('r1', 1, 1), wall('w1', 0, 3, 2, 3), circle('c1', 4, 7), rect('t1', 2, 5, 'tv', 'TV')];
    const a = cycleOrder(scene({ objects: objs }));
    const b = cycleOrder(scene({ objects: [...objs].reverse() }));
    expect(b).toEqual(a);
  });

  it('labels every object kind distinguishably, with its size', () => {
    const s = scene({
      objects: [
        wall('w1', 0, 0, 3.2, 0),
        rect('t1', 0, 1, 'tv', 'TV'),
        rect('d1', 0, 2, 'door', 'Door'),
        rect('n1', 0, 3, 'window', 'Window'),
        rect('f1', 0, 4, 'furniture', 'Desk'),
        circle('c1', 0, 5),
      ],
    });
    const labels = cycleOrder(s).filter((e) => e.kind === 'object').map((e) => e.label);
    expect(labels[0]).toBe('Wall, 3.20 m');
    expect(labels[1]).toBe('TV, 1.80 by 0.90 m');
    expect(labels[2]).toBe('Door, 1.80 by 0.90 m');
    expect(labels[3]).toBe('Window, 1.80 by 0.90 m');
    expect(labels[4]).toBe('Desk, 1.80 by 0.90 m');
    expect(labels[5]).toBe('Table, 1.10 m across');
  });

  it('includes the speaker model in its label', () => {
    const s = scene({ speakers: [spk('s1', 'A')] });
    expect(cycleOrder(s)[1].label).toContain('A');
    expect(cycleOrder(s)[1].label.toLowerCase()).toContain('homepod');
  });
});

// --- stepCycle --------------------------------------------------------------

describe('stepCycle', () => {
  const s = scene({ objects: [rect('r1', 1, 1), rect('r2', 2, 2)], speakers: [spk('s1', 'A')] });
  const order = cycleOrder(s); // [seat-1, s1, r1, r2]

  it('returns null on an empty order', () => expect(stepCycle([], null, 1)).toBeNull());

  it('starts at the first entry from a null selection', () =>
    expect(stepCycle(order, null, 1)!.id).toBe('seat-1'));

  it('starts at the first entry from a multi selection', () => {
    const sel: Selection = { type: 'multi', objectIds: ['r1'], speakerIds: [] };
    expect(stepCycle(order, sel, 1)!.id).toBe('seat-1');
  });

  it('starts at the first entry when the selection points at a deleted id', () =>
    expect(stepCycle(order, { type: 'object', id: 'gone' }, 1)!.id).toBe('seat-1'));

  it('advances forward through the order', () => {
    expect(stepCycle(order, { type: 'listener' }, 1)!.id).toBe('s1');
    expect(stepCycle(order, { type: 'speaker', id: 's1' }, 1)!.id).toBe('r1');
  });

  it('wraps forward at the end', () =>
    expect(stepCycle(order, { type: 'object', id: 'r2' }, 1)!.id).toBe('seat-1'));

  it('wraps backward at the start', () =>
    expect(stepCycle(order, { type: 'listener' }, -1)!.id).toBe('r2'));

  it('steps backward through the order', () =>
    expect(stepCycle(order, { type: 'object', id: 'r1' }, -1)!.id).toBe('s1'));

  it('returns the single entry in both directions on a 1-entry order', () => {
    const one = cycleOrder(scene());
    expect(one).toHaveLength(1);
    expect(stepCycle(one, { type: 'listener' }, 1)!.id).toBe('seat-1');
    expect(stepCycle(one, { type: 'listener' }, -1)!.id).toBe('seat-1');
  });

  it('resolves a listener selection to the ACTIVE seat, not merely the first', () => {
    const two = scene({
      listeners: [
        { id: 'seat-1', name: 'Couch', pos: { x: 1, y: 1 }, z: 1.2 },
        { id: 'seat-2', name: 'Bed', pos: { x: 4, y: 4 }, z: 1.2 },
      ],
      activeListenerId: 'seat-2',
    });
    const o = cycleOrder(two);
    // {type:'listener'} carries no id, so it must resolve through activeListenerId.
    expect(stepCycle(o, { type: 'listener' }, 1, two)!.id).toBe('seat-1'); // wraps past seat-2
  });
});

// --- selectionForEntry / describePosition -----------------------------------

describe('selectionForEntry', () => {
  it('maps a seat to an id-less listener selection', () =>
    expect(selectionForEntry({ kind: 'listener', id: 'seat-1', label: 'Seat Couch' })).toEqual({
      type: 'listener',
    }));
  it('maps a speaker', () =>
    expect(selectionForEntry({ kind: 'speaker', id: 's1', label: 'A' })).toEqual({
      type: 'speaker',
      id: 's1',
    }));
  it('maps an object', () =>
    expect(selectionForEntry({ kind: 'object', id: 'r1', label: 'Desk' })).toEqual({
      type: 'object',
      id: 'r1',
    }));
});

describe('describePosition', () => {
  it('reads as "<label>, N of M"', () => {
    const s = scene({ objects: [rect('r1', 1, 1)], speakers: [spk('s1', 'A')] });
    const order = cycleOrder(s);
    expect(describePosition(order, order[0])).toBe('Seat Couch, active, 1 of 3');
    expect(describePosition(order, order[2])).toBe('Thing, 1.80 by 0.90 m, 3 of 3');
  });
  it('returns the bare label when the entry is not in the order', () =>
    expect(describePosition([], { kind: 'object', id: 'x', label: 'Ghost' })).toBe('Ghost'));
});
