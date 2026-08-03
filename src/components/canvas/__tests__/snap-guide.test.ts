import { describe, expect, it } from 'vitest';
import type { RenderState } from '../render';
import { renderScene, THEMES, worldToScreen } from '../render';
import type { Scene, SceneObject } from '../../../engine/types';

/**
 * The snap guide (S32, §4b) — pinned by RECORDING what gets stroked, because the
 * only alternative is a comment and the property that matters is a NEGATIVE one.
 *
 * C8, from the S23 adversarial pass: the guide must NOT stroke `wallKeptSpans`.
 * That helper deletes door openings, so on a wall with a door it would draw a GAP
 * exactly where the magnet is about to seat a sofa across the doorway — pointing
 * away from the thing being explained. The guide answers "which wall am I
 * snapping to", and the answer is the whole wall.
 *
 * jsdom is not needed and not used: `renderScene` reads only its `RenderState`
 * and the literal hex in `THEMES` (verified in S16 for the offscreen exporter),
 * so a plain recording object is a faithful context here.
 */

interface Stroke {
  from: { x: number; y: number };
  to: { x: number; y: number };
  style: string;
  width: number;
  alpha: number;
}

function recorder(): { ctx: CanvasRenderingContext2D; strokes: Stroke[] } {
  const strokes: Stroke[] = [];
  let cur: { x: number; y: number } | null = null;
  let pending: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  const state = { strokeStyle: '', lineWidth: 1, globalAlpha: 1 };
  const stack: Array<typeof state> = [];

  const target = {
    beginPath() {
      pending = [];
      cur = null;
    },
    moveTo(x: number, y: number) {
      cur = { x, y };
    },
    lineTo(x: number, y: number) {
      if (cur) pending.push({ from: cur, to: { x, y } });
      cur = { x, y };
    },
    stroke() {
      for (const seg of pending) {
        strokes.push({ ...seg, style: String(state.strokeStyle), width: state.lineWidth, alpha: state.globalAlpha });
      }
    },
    save() {
      stack.push({ ...state });
    },
    restore() {
      const p = stack.pop();
      if (p) Object.assign(state, p);
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
    setLineDash() {},
    getLineDash: () => [],
  } as Record<string, unknown>;

  // Everything else on a 2D context is a no-op sink; the properties we care about
  // are trapped so `save`/`restore` semantics are real.
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in state) return state[k as keyof typeof state];
      if (k in t) return t[k as string];
      return () => undefined;
    },
    set(t, k, val) {
      if (k in state) (state as Record<string, unknown>)[k as string] = val;
      else t[k as string] = val;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return { ctx, strokes };
}

const WALL: SceneObject = {
  id: 'w1',
  kind: 'wall',
  a: { x: 0, y: 0 },
  b: { x: 6, y: 0 },
  absorption: 0.12,
  label: 'Wall',
  height: 2.7,
};

/** A door sitting in the middle of `w1` — what `wallKeptSpans` would cut out. */
const DOOR: SceneObject = {
  id: 'd1',
  kind: 'rect',
  center: { x: 3, y: 0 },
  w: 0.9,
  h: 0.1,
  rotation: 0,
  absorption: 0.3,
  label: 'Door',
  role: 'door',
  height: 2.1,
  doorOpen: true,
};

const scene = (objects: SceneObject[]): Scene => ({
  objects,
  speakers: [],
  pairs: [],
  listener: { pos: { x: 3, y: 3 }, z: 1.2 },
  listeners: [{ id: 's1', name: 'Couch', pos: { x: 3, y: 3 }, z: 1.2 }],
  activeListenerId: 's1',
  rooms: [],
});

function state(over: Partial<RenderState>): RenderState {
  return {
    scene: scene([WALL]),
    settings: {
      rayCount: 0,
      maxBounces: 0,
      display: 'off',
      showBestSpot: false,
      snap: true,
      tvAnchor: false,
      underlayOpacity: 0.5,
    },
    selection: null,
    trace: { bySpeaker: [], direct: [] },
    audio: { pairs: [], solos: [] },
    preview: null,
    chain: null,
    proposal: null,
    furnitureProposal: null,
    bestSpot: null,
    snapGuide: null,
    theme: 'plan',
    view: { scale: 60, ox: 100, oy: 100, rot: 0 },
    width: 800,
    height: 600,
    ...over,
  } as RenderState;
}

/** Strokes matching the guide's signature: the widest, alpha-0.55 ones. */
const guideStrokes = (all: Stroke[]) => all.filter((s) => Math.abs(s.alpha - 0.55) < 1e-9);

describe('the snap guide', () => {
  it('draws NOTHING when no wall is captured', () => {
    const { ctx, strokes } = recorder();
    renderScene(ctx, state({ snapGuide: null }));
    expect(guideStrokes(strokes)).toHaveLength(0);
  });

  it('draws ONE stroke spanning the captured wall end to end', () => {
    const { ctx, strokes } = recorder();
    const st = state({ snapGuide: { wallId: 'w1', seated: false } });
    renderScene(ctx, st);
    const g = guideStrokes(strokes);
    expect(g).toHaveLength(1);
    const a = worldToScreen({ x: 0, y: 0 }, st.view);
    const b = worldToScreen({ x: 6, y: 0 }, st.view);
    expect(g[0].from.x).toBeCloseTo(a.x, 6);
    expect(g[0].to.x).toBeCloseTo(b.x, 6);
  });

  it('THE C8 TRAP: a door in the wall does NOT punch a gap in the guide', () => {
    // `wallKeptSpans` would return TWO spans here, drawing a hole exactly where a
    // sofa is about to be seated across the doorway.
    const { ctx, strokes } = recorder();
    const st = state({ scene: scene([WALL, DOOR]), snapGuide: { wallId: 'w1', seated: false } });
    renderScene(ctx, st);
    const g = guideStrokes(strokes);
    expect(g).toHaveLength(1);
    const a = worldToScreen({ x: 0, y: 0 }, st.view);
    const b = worldToScreen({ x: 6, y: 0 }, st.view);
    expect(g[0].from.x).toBeCloseTo(a.x, 6);
    expect(g[0].to.x).toBeCloseTo(b.x, 6);
  });

  it('changes colour once SEATED, so the 15 cm threshold is discoverable', () => {
    const mk = (seated: boolean) => {
      const { ctx, strokes } = recorder();
      renderScene(ctx, state({ snapGuide: { wallId: 'w1', seated } }));
      return guideStrokes(strokes)[0].style;
    };
    expect(mk(false)).toBe(THEMES.plan.select);
    expect(mk(true)).toBe(THEMES.plan.ok);
    expect(mk(true)).not.toBe(mk(false));
  });

  it('is silent when the captured wall has been deleted mid-drag', () => {
    const { ctx, strokes } = recorder();
    renderScene(ctx, state({ snapGuide: { wallId: 'gone', seated: true } }));
    expect(guideStrokes(strokes)).toHaveLength(0);
  });
});
