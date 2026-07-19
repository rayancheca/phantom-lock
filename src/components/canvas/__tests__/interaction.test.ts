import { describe, expect, it, vi } from 'vitest';
import {
  canvasKeyAction,
  hoverCursor,
  isDraggableAt,
  itemsInBand,
  makeOpening,
  pointInMarquee,
  popChainSegment,
  resolveSelection,
  selectionFromBand,
  selectionSets,
  wallHoverAt,
  watchDevicePixelRatio,
} from '../interaction';
import { worldToScreen, type View } from '../render';
import { addListener, blankScene, makeSpeaker } from '../../../engine/scene';
import type { Scene, SceneObject, SpeakerObj, WallObj } from '../../../engine/types';

const wall = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): WallObj => ({
  id,
  kind: 'wall',
  a,
  b,
  absorption: 0.1,
  label: 'W',
  height: 2.7,
});

const rect = (id: string, center: { x: number; y: number }): SceneObject => ({
  id,
  kind: 'rect',
  center,
  w: 1,
  h: 1,
  rotation: 0,
  absorption: 0.3,
  label: 'Box',
  role: 'furniture',
  height: 0.8,
});

// --- Fix 1: makeOpening + wallHoverAt -------------------------------------

describe('makeOpening', () => {
  it('builds a door with the documented field set', () => {
    const o = makeOpening(wall('w', { x: 0, y: 0 }, { x: 2, y: 0 }), { x: 1, y: 0 }, 'door', 'rect-1');
    expect(o).toMatchObject({
      id: 'rect-1',
      kind: 'rect',
      w: 0.9,
      h: 0.1,
      absorption: 0.25,
      label: 'Door',
      role: 'door',
      height: 2.05,
      doorOpen: true,
    });
    expect(o.kind === 'rect' && o.center).toEqual({ x: 1, y: 0 });
  });

  it('builds a window with the documented field set (no doorOpen)', () => {
    const o = makeOpening(wall('w', { x: 0, y: 0 }, { x: 2, y: 0 }), { x: 1, y: 0 }, 'window', 'rect-2');
    expect(o).toMatchObject({
      w: 1.2,
      h: 0.12,
      absorption: 0.04,
      label: 'Window',
      role: 'window',
      height: 2.2,
    });
    expect(o.kind === 'rect' && o.doorOpen).toBeUndefined();
  });

  it('aligns rotation to the wall direction (horizontal, vertical, 45°)', () => {
    const at = { x: 0, y: 0 };
    const rot = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const o = makeOpening(wall('w', a, b), at, 'door', 'x');
      return o.kind === 'rect' ? o.rotation : NaN;
    };
    expect(rot({ x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0);
    expect(rot({ x: 0, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(Math.PI / 2);
    expect(rot({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(Math.PI / 4);
  });

  it('centres on the passed anchor, NOT the wall midpoint (regression guard)', () => {
    const o = makeOpening(wall('w', { x: 0, y: 0 }, { x: 4, y: 0 }), { x: 3, y: 0 }, 'door', 'x');
    expect(o.kind === 'rect' && o.center).toEqual({ x: 3, y: 0 });
  });

  it('does not NaN on a zero-length wall', () => {
    const o = makeOpening(wall('w', { x: 1, y: 1 }, { x: 1, y: 1 }), { x: 1, y: 1 }, 'door', 'x');
    const r = o as Extract<SceneObject, { kind: 'rect' }>;
    expect(r.rotation).toBe(0);
    expect(Number.isFinite(r.center.x) && Number.isFinite(r.center.y)).toBe(true);
  });
});

describe('wallHoverAt', () => {
  const walls = [wall('h', { x: 0, y: 0 }, { x: 4, y: 0 }), wall('v', { x: 0, y: 0 }, { x: 0, y: 4 })];

  it('returns the nearer wall within maxDist plus the closest point', () => {
    const hv = wallHoverAt(walls, { x: 2, y: 0.1 }, 0.22);
    expect(hv?.id).toBe('h');
    expect(hv?.at).toEqual({ x: 2, y: 0 });
  });

  it('returns null when no wall is within maxDist', () => {
    expect(wallHoverAt(walls, { x: 2, y: 2 }, 0.22)).toBeNull();
  });

  it('clamps the anchor to the endpoint when hovering just past the segment', () => {
    // (4.1, 0.05) is past the x=4 endpoint but within 0.22 m of it.
    const hv = wallHoverAt([walls[0]], { x: 4.1, y: 0.05 }, 0.22);
    expect(hv?.at).toEqual({ x: 4, y: 0 });
  });

  it('ignores non-wall objects', () => {
    expect(wallHoverAt([rect('r', { x: 0, y: 0 })], { x: 0, y: 0 }, 0.22)).toBeNull();
  });
});

// --- Fix 2: popChainSegment ------------------------------------------------

describe('popChainSegment', () => {
  it('removes ALL ids of a multi-chunk crossing group in one pop', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ];
    const groups = [['a'], ['b', 'c']];
    const res = popChainSegment(points, groups);
    expect(res.ended).toBe(false);
    expect(res.removeIds).toEqual(['b', 'c']);
    expect(res.points).toHaveLength(2);
    expect(res.groups).toEqual([['a']]);
  });

  it('drops a trailing empty group (a too-close corner) removing no walls', () => {
    const res = popChainSegment(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2.05, y: 0.05 },
      ],
      [['a'], []],
    );
    expect(res.removeIds).toEqual([]);
    expect(res.points).toHaveLength(2);
    expect(res.groups).toEqual([['a']]);
    expect(res.ended).toBe(false);
  });

  it('ends (objects untouched) when only the anchor corner remains', () => {
    const res = popChainSegment([{ x: 0, y: 0 }], []);
    expect(res).toEqual({ points: [], groups: [], removeIds: [], ended: true });
  });

  it('never mutates its input arrays', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ];
    const groups = [['a']];
    popChainSegment(points, groups);
    expect(points).toHaveLength(2);
    expect(groups).toEqual([['a']]);
  });
});

// --- Fix 3: selection algebra + band geometry ------------------------------

describe('selectionSets', () => {
  it('extracts ids for each selection shape', () => {
    expect(selectionSets(null)).toEqual({ objectIds: new Set(), speakerIds: new Set() });
    expect(selectionSets({ type: 'object', id: 'o' }).objectIds).toEqual(new Set(['o']));
    expect(selectionSets({ type: 'speaker', id: 's' }).speakerIds).toEqual(new Set(['s']));
    expect(selectionSets({ type: 'listener' })).toEqual({
      objectIds: new Set(),
      speakerIds: new Set(),
    });
    const m = selectionSets({ type: 'multi', objectIds: ['o'], speakerIds: ['s'] });
    expect(m.objectIds).toEqual(new Set(['o']));
    expect(m.speakerIds).toEqual(new Set(['s']));
  });
});

describe('resolveSelection', () => {
  it('collapses to the narrowest selection', () => {
    expect(resolveSelection([], [])).toBeNull();
    expect(resolveSelection([], ['s'])).toEqual({ type: 'speaker', id: 's' });
    expect(resolveSelection(['o'], [])).toEqual({ type: 'object', id: 'o' });
    expect(resolveSelection(['o1', 'o2'], [])).toEqual({
      type: 'multi',
      objectIds: ['o1', 'o2'],
      speakerIds: [],
    });
    expect(resolveSelection(['o'], ['s'])).toEqual({
      type: 'multi',
      objectIds: ['o'],
      speakerIds: ['s'],
    });
  });
});

describe('pointInMarquee', () => {
  it('is inclusive and corner-order independent', () => {
    const a = { x: 10, y: 10 };
    const b = { x: 0, y: 0 };
    expect(pointInMarquee({ x: 5, y: 5 }, a, b)).toBe(true);
    expect(pointInMarquee({ x: 0, y: 0 }, a, b)).toBe(true); // boundary
    expect(pointInMarquee({ x: 11, y: 5 }, a, b)).toBe(false);
  });
});

describe('itemsInBand', () => {
  const id = (w: { x: number; y: number }) => w; // identity projection

  it('selects object centres and speaker positions inside a marquee', () => {
    const objects = [rect('in', { x: 5, y: 5 }), rect('out', { x: 50, y: 50 })];
    const speakers: SpeakerObj[] = [
      { id: 'sp', pos: { x: 6, y: 6 }, z: 1, label: 'A', model: 'homepod', trimDb: 0 },
    ];
    const band = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const hits = itemsInBand(objects, speakers, band, 'marquee', id);
    expect(hits.objectIds).toEqual(['in']);
    expect(hits.speakerIds).toEqual(['sp']);
  });

  it('uses the wall MIDPOINT for wall membership', () => {
    const w = wall('w', { x: 0, y: 0 }, { x: 10, y: 0 }); // midpoint (5,0)
    const band = [
      { x: 4, y: -1 },
      { x: 6, y: 1 },
    ];
    expect(itemsInBand([w], [], band, 'marquee', id).objectIds).toEqual(['w']);
  });

  it('selects nothing for a click-length band (marquee<2, lasso<3)', () => {
    const objects = [rect('o', { x: 5, y: 5 })];
    expect(itemsInBand(objects, [], [{ x: 5, y: 5 }], 'marquee', id).objectIds).toEqual([]);
    expect(
      itemsInBand(
        objects,
        [],
        [
          { x: 0, y: 0 },
          { x: 9, y: 9 },
        ],
        'lasso',
        id,
      ).objectIds,
    ).toEqual([]);
  });

  it('selects points inside a lasso polygon', () => {
    const objects = [rect('in', { x: 5, y: 5 }), rect('out', { x: 50, y: 5 })];
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(itemsInBand(objects, [], poly, 'lasso', id).objectIds).toEqual(['in']);
  });

  it('projects world→screen so a ROTATED view still selects the right centres', () => {
    const view: View = { scale: 50, ox: 120, oy: 90, rot: Math.PI / 4 };
    const project = (w: { x: number; y: number }) => worldToScreen(w, view);
    const target = rect('in', { x: 2, y: 2 });
    const other = rect('out', { x: 8, y: 1 });
    const s = worldToScreen({ x: 2, y: 2 }, view);
    const band = [
      { x: s.x - 6, y: s.y - 6 },
      { x: s.x + 6, y: s.y + 6 },
    ];
    const hits = itemsInBand([target, other], [], band, 'marquee', project);
    expect(hits.objectIds).toEqual(['in']);
  });
});

describe('selectionFromBand', () => {
  const id = (w: { x: number; y: number }) => w;
  const objects = [rect('o1', { x: 5, y: 5 }), rect('o2', { x: 6, y: 6 })];
  const marquee = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ];

  it('collapses two hits to a multi selection', () => {
    expect(
      selectionFromBand({
        objects,
        speakers: [],
        band: marquee,
        shape: 'marquee',
        project: id,
        additive: false,
        base: null,
      }),
    ).toEqual({ type: 'multi', objectIds: ['o1', 'o2'], speakerIds: [] });
  });

  it('collapses one hit to a single object selection', () => {
    expect(
      selectionFromBand({
        objects: [rect('only', { x: 5, y: 5 })],
        speakers: [],
        band: marquee,
        shape: 'marquee',
        project: id,
        additive: false,
        base: null,
      }),
    ).toEqual({ type: 'object', id: 'only' });
  });

  it('deselects (null) on an empty non-additive click-band', () => {
    expect(
      selectionFromBand({
        objects,
        speakers: [],
        band: [{ x: 50, y: 50 }],
        shape: 'marquee',
        project: id,
        additive: false,
        base: { type: 'object', id: 'o1' },
      }),
    ).toBeNull();
  });

  it('preserves an object base on an empty ADDITIVE click-band', () => {
    expect(
      selectionFromBand({
        objects,
        speakers: [],
        band: [{ x: 50, y: 50 }],
        shape: 'marquee',
        project: id,
        additive: true,
        base: { type: 'object', id: 'o1' },
      }),
    ).toEqual({ type: 'object', id: 'o1' });
  });

  it('preserves a LISTENER base on an empty additive band (listener parity trap)', () => {
    expect(
      selectionFromBand({
        objects,
        speakers: [],
        band: [{ x: 50, y: 50 }],
        shape: 'marquee',
        project: id,
        additive: true,
        base: { type: 'listener' },
      }),
    ).toEqual({ type: 'listener' });
  });

  it('merges band hits into an additive multi base', () => {
    expect(
      selectionFromBand({
        objects: [rect('o2', { x: 5, y: 5 })],
        speakers: [],
        band: marquee,
        shape: 'marquee',
        project: id,
        additive: true,
        base: { type: 'multi', objectIds: ['o1'], speakerIds: [] },
      }),
    ).toEqual({ type: 'multi', objectIds: ['o1', 'o2'], speakerIds: [] });
  });
});

// --- Fix 4: watchDevicePixelRatio -----------------------------------------

interface FakeWin {
  devicePixelRatio: number;
  matchMedia: (q: string) => MediaQueryList;
  mediaCalls: string[];
  listeners: Array<{ cb: () => void; opts: unknown }>;
  emit: () => void;
}

function fakeWin(dpr: number): FakeWin {
  const win: FakeWin = {
    devicePixelRatio: dpr,
    mediaCalls: [],
    listeners: [],
    matchMedia: undefined as unknown as (q: string) => MediaQueryList,
    emit() {
      const last = win.listeners[win.listeners.length - 1];
      if (last) last.cb();
    },
  };
  win.matchMedia = (q: string) => {
    win.mediaCalls.push(q);
    const mql = {
      media: q,
      addEventListener: (_e: string, cb: () => void, opts: unknown) =>
        win.listeners.push({ cb, opts }),
      removeEventListener: (_e: string, cb: () => void) => {
        win.listeners = win.listeners.filter((l) => l.cb !== cb);
      },
    } as unknown as MediaQueryList;
    return mql;
  };
  return win;
}

describe('watchDevicePixelRatio', () => {
  it('subscribes to the current dpr with a one-shot listener', () => {
    const win = fakeWin(2);
    watchDevicePixelRatio(() => {}, win);
    expect(win.mediaCalls).toEqual(['(resolution: 2dppx)']);
    expect(win.listeners[0].opts).toEqual({ once: true });
  });

  it('fires onChange once and re-arms for the new dpr on change', () => {
    const win = fakeWin(2);
    const onChange = vi.fn();
    watchDevicePixelRatio(onChange, win);
    win.devicePixelRatio = 1;
    win.emit();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(win.mediaCalls).toEqual(['(resolution: 2dppx)', '(resolution: 1dppx)']);
  });

  it('dispose() stops onChange and blocks re-subscribe', () => {
    const win = fakeWin(2);
    const onChange = vi.fn();
    const dispose = watchDevicePixelRatio(onChange, win);
    dispose();
    win.devicePixelRatio = 1;
    win.emit();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('no-ops (never throws) when matchMedia is unavailable', () => {
    const win = { devicePixelRatio: 2, mediaCalls: [], listeners: [], emit() {} } as unknown as FakeWin;
    const dispose = watchDevicePixelRatio(() => {}, win);
    expect(() => dispose()).not.toThrow();
  });

  it('no-ops when the MediaQueryList lacks addEventListener (legacy WebKit)', () => {
    const win = {
      devicePixelRatio: 2,
      matchMedia: (q: string) => ({ media: q }) as unknown as MediaQueryList, // no addEventListener
    } as unknown as FakeWin;
    const onChange = vi.fn();
    const dispose = watchDevicePixelRatio(onChange, win);
    expect(() => dispose()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// --- Fix 5: isDraggableAt + hoverCursor -----------------------------------

describe('isDraggableAt', () => {
  it('is true over the listener puck, a speaker, an inactive seat, and furniture', () => {
    const base = addListener(blankScene(), 'Bed', { x: 5, y: 5 }); // Bed active, couch inactive
    const couch = base.listeners!.find((l) => l.name !== 'Bed')!;
    const scene: Scene = {
      ...base,
      speakers: [makeSpeaker({ x: 7, y: 7 }, base)],
      objects: [rect('box', { x: 1, y: 1 })],
    };
    expect(isDraggableAt(scene, scene.listener.pos, 0.1)).toBe(true); // active seat
    expect(isDraggableAt(scene, { x: 7, y: 7 }, 0.1)).toBe(true); // speaker
    expect(isDraggableAt(scene, couch.pos, 0.1)).toBe(true); // inactive seat
    expect(isDraggableAt(scene, { x: 1, y: 1 }, 0.1)).toBe(true); // furniture
  });

  it('is false over empty floor', () => {
    const scene = blankScene();
    expect(isDraggableAt(scene, { x: 0.01, y: 0.01 }, 0.05)).toBe(false);
  });
});

describe('hoverCursor', () => {
  it('is crosshair for any drawing tool regardless of hover/drag state', () => {
    for (const mode of ['wall', 'rect', 'circle', 'speaker', 'marquee', 'lasso', 'room', 'calibrate'] as const) {
      expect(hoverCursor(mode, { hoverGrab: true, dragging: true })).toBe('crosshair');
    }
  });

  it('applies select-mode precedence: dragging > hoverGrab > default', () => {
    expect(hoverCursor('select', { hoverGrab: false, dragging: false })).toBe('default');
    expect(hoverCursor('select', { hoverGrab: true, dragging: false })).toBe('grab');
    expect(hoverCursor('select', { hoverGrab: false, dragging: true })).toBe('grabbing');
    expect(hoverCursor('select', { hoverGrab: true, dragging: true })).toBe('grabbing');
  });
});

// --- Fix 6: canvasKeyAction ------------------------------------------------

const key = (over: Partial<Parameters<typeof canvasKeyAction>[0]>) => ({
  type: 'keydown',
  key: 'r',
  code: 'KeyR',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  targetTag: undefined as string | undefined,
  ...over,
});

describe('canvasKeyAction', () => {
  it('rotates on R only when no overlay is open', () => {
    expect(canvasKeyAction(key({ key: 'r' }), false, false)).toEqual({ kind: 'rotate', deltaDeg: 15 });
    expect(canvasKeyAction(key({ key: 'R', shiftKey: true }), false, false)).toEqual({
      kind: 'rotate',
      deltaDeg: -15,
    });
    expect(canvasKeyAction(key({ key: 'r' }), true, false)).toEqual({ kind: 'none' });
  });

  it('never hijacks ⌘R / Ctrl+R (browser reload)', () => {
    expect(canvasKeyAction(key({ key: 'r', metaKey: true }), false, false)).toEqual({ kind: 'none' });
    expect(canvasKeyAction(key({ key: 'r', ctrlKey: true }), false, false)).toEqual({ kind: 'none' });
  });

  it('chain-Backspace only with a chain and no overlay', () => {
    expect(canvasKeyAction(key({ key: 'Backspace', code: 'Backspace' }), false, true)).toEqual({
      kind: 'chainBackspace',
    });
    expect(canvasKeyAction(key({ key: 'Backspace', code: 'Backspace' }), true, true)).toEqual({
      kind: 'none',
    });
    expect(canvasKeyAction(key({ key: 'Backspace', code: 'Backspace' }), false, false)).toEqual({
      kind: 'none',
    });
  });

  it('arms pan on Space only without an overlay; keyup always disarms', () => {
    expect(canvasKeyAction(key({ code: 'Space' }), false, false)).toEqual({ kind: 'space', armed: true });
    expect(canvasKeyAction(key({ code: 'Space' }), true, false)).toEqual({ kind: 'space', armed: false });
    expect(canvasKeyAction(key({ type: 'keyup', code: 'Space' }), false, false)).toEqual({
      kind: 'space',
      armed: false,
    });
  });

  it('swallows every key while a form field is focused', () => {
    expect(canvasKeyAction(key({ key: 'r', targetTag: 'INPUT' }), false, false)).toEqual({ kind: 'none' });
    expect(canvasKeyAction(key({ code: 'Space', targetTag: 'TEXTAREA' }), false, false)).toEqual({
      kind: 'none',
    });
    expect(canvasKeyAction(key({ key: 'Backspace', code: 'Backspace', targetTag: 'SELECT' }), false, true)).toEqual({
      kind: 'none',
    });
  });
});
