import { describe, expect, it } from 'vitest';
import type { RectObj, Scene, SceneObject } from '../../../engine/types';
import type { RenderState } from '../render';
import { renderScene } from '../render';
import { handlesFor } from '../handles';

/**
 * §16 grips, the RENDER half (S36).
 *
 * Recorded rather than eyeballed, and the properties pinned here are all NEGATIVE
 * or ORDERING ones that a screenshot cannot settle:
 *
 *  - grips must be painted LAST, because `drawNode` fills an OPAQUE disc and a
 *    grip drawn earlier is simply covered by a speaker puck parked beside the
 *    sofa — visible in a mockup, unreachable in the app;
 *  - grips must NOT come from `drawObject`'s `selected` branch, which `renderScene`
 *    reuses as its GHOST renderer for the opening-tool preview and for every
 *    furniture-proposal rect. Grips added there would sprout on a door ghost
 *    chasing the cursor and on N ungrabbable proposal boxes at once.
 *
 * jsdom is not needed: `renderScene` reads only its `RenderState` and the literal
 * hex in `THEMES`, so a recording object is a faithful context. The fixture scene
 * deliberately carries NO underlay — render.ts reaches for the browser global
 * `Image` on that path and would throw in node.
 */

interface Arc {
  x: number;
  y: number;
  r: number;
  /** Draw order, so "grips are last" is checkable. */
  seq: number;
}

function recorder(): { ctx: CanvasRenderingContext2D; arcs: Arc[] } {
  const arcs: Arc[] = [];
  let seq = 0;
  const target = {
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r, seq: seq++ });
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
    setLineDash() {},
    getLineDash: () => [],
  } as Record<string, unknown>;

  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k as string];
      return () => undefined;
    },
    set(t, k, val) {
      t[k as string] = val;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return { ctx, arcs };
}

const SOFA: RectObj = {
  id: 'r1',
  kind: 'rect',
  center: { x: 3, y: 3 },
  w: 2,
  h: 1,
  rotation: -0.2239,
  absorption: 0.3,
  label: 'Sofa',
  role: 'furniture',
  height: 0.9,
};

const scene = (objects: SceneObject[]): Scene => ({
  objects,
  speakers: [],
  pairs: [],
  listener: { pos: { x: 9, y: 9 }, z: 1.2 },
  listeners: [{ id: 's1', name: 'Couch', pos: { x: 9, y: 9 }, z: 1.2 }],
  activeListenerId: 's1',
  rooms: [],
});

function state(over: Partial<RenderState>): RenderState {
  return {
    scene: scene([SOFA]),
    settings: {
      rayCount: 360,
      maxBounces: 0,
      decay: 0.1,
      display: 'off',
      showTriangle: false,
      showBestSpot: false,
      snap: true,
      tvAnchor: false,
    },
    selection: { type: 'object', id: 'r1' },
    trace: { speakers: [], listener: { pos: { x: 9, y: 9 }, z: 1.2 } } as unknown as RenderState['trace'],
    audio: { pairs: [], solos: [] } as unknown as RenderState['audio'],
    preview: null,
    chain: null,
    proposal: null,
    furnitureProposal: null,
    bestSpot: null,
    snapGuide: null,
    handleTarget: null,
    theme: 'plan',
    view: { scale: 60, ox: 100, oy: 80, rot: 0 },
    width: 800,
    height: 600,
    ...over,
  };
}

/** Arcs at exactly the radius `drawHandles` uses, which nothing else draws at. */
function gripArcs(arcs: Arc[]): Arc[] {
  return arcs.filter((a) => Math.abs(a.r - 4.5) < 1e-9);
}

describe('drawHandles', () => {
  it('draws one grip per handle when a target is set', () => {
    const { ctx, arcs } = recorder();
    const st = state({ handleTarget: SOFA });
    renderScene(ctx, st);
    expect(gripArcs(arcs)).toHaveLength(handlesFor(SOFA, st.view).length);
  });

  it('draws NOTHING when handleTarget is null, even with the object selected', () => {
    // The negative control for the whole feature gate: `selection` alone must not
    // be enough, or the grips would ignore overlayOpen, tool mode and pointer type.
    const { ctx, arcs } = recorder();
    renderScene(ctx, state({ handleTarget: null }));
    expect(gripArcs(arcs)).toHaveLength(0);
  });

  it('puts every grip exactly where handlesFor says — the hit test reads the same list', () => {
    const { ctx, arcs } = recorder();
    const st = state({ handleTarget: SOFA });
    renderScene(ctx, st);
    const drawn = gripArcs(arcs).map((a) => `${a.x.toFixed(4)},${a.y.toFixed(4)}`).sort();
    const want = handlesFor(SOFA, st.view)
      .map((h) => `${h.at.x.toFixed(4)},${h.at.y.toFixed(4)}`)
      .sort();
    expect(drawn).toEqual(want);
  });

  it('THE ORDERING: grips are painted after every node, so a puck cannot cover one', () => {
    // `drawNode` fills an opaque disc of max(9, r*scale) px. A speaker parked on
    // the sofa's corner would hide a grip drawn earlier — visible in a screenshot
    // review, unreachable in the app.
    const withSpeaker = scene([SOFA]);
    withSpeaker.speakers = [
      { id: 'sp1', model: 'homepod', pos: { x: 4, y: 3.5 }, z: 0.9, label: 'L', trimDb: 0 },
    ];
    const { ctx, arcs } = recorder();
    renderScene(ctx, state({ scene: withSpeaker, handleTarget: SOFA }));
    const grips = gripArcs(arcs);
    const others = arcs.filter((a) => Math.abs(a.r - 4.5) >= 1e-9);
    expect(grips.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    expect(Math.min(...grips.map((g) => g.seq))).toBeGreaterThan(Math.max(...others.map((o) => o.seq)));
  });

  it('THE GHOST TRAP: a furniture proposal draws no grips', () => {
    // `renderScene` reuses `drawObject(..., selected=true)` for proposal ghosts.
    // Grips hung off that branch would appear on every proposed rect at once,
    // none of them grabbable.
    const ghost: RectObj = { ...SOFA, id: 'ghost1', center: { x: 6, y: 6 } };
    const { ctx, arcs } = recorder();
    renderScene(ctx, state({ furnitureProposal: [ghost], handleTarget: null }));
    expect(gripArcs(arcs)).toHaveLength(0);
  });

  it('THE GHOST TRAP: the opening-tool preview draws no grips', () => {
    const door: RectObj = {
      ...SOFA,
      id: 'preview',
      role: 'door',
      w: 0.9,
      h: 0.1,
      swingDeg: 90,
      hingeEnd: 'start',
      swingSide: 'in',
    };
    const { ctx, arcs } = recorder();
    renderScene(ctx, state({ preview: door, handleTarget: null }));
    expect(gripArcs(arcs)).toHaveLength(0);
  });
});
