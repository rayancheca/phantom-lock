import { describe, expect, it } from 'vitest';
import type { CircleObj, RectObj, Scene, Selection } from '../../../engine/types';
import { pointInRect, rectCorners } from '../../../engine/geometry';
import { sanitizeScene } from '../../../engine/scene';
import type { View } from '../render';
import { worldToScreen } from '../render';
import {
  applyHandleDrag,
  DOOR_MAX_W_M,
  DOOR_MIN_W_M,
  HANDLE_HIT_PX,
  MIN_RADIUS_M,
  MIN_SPAN_M,
  ROT_SNAP_RAD,
  handleAt,
  handleTargetFor,
  handlesFor,
  resizeObject,
  rotateObject,
} from '../handles';

/**
 * §16 — the Word-style resize/rotate grips (S36).
 *
 * These are node tests, deliberately: jsdom dispatches a plain `Event` for pointer
 * events, so `button`/`pointerId`/`clientX` all arrive `undefined` and the whole
 * SimCanvas pointer path bails before a gesture is ever registered (the S30 lesson,
 * TRAP 21). Anything that can only be proved by driving a real pointer lives in the
 * CDP harness instead. What CAN be proved here is the part that decides whether the
 * feature is correct at all: the geometry, in the object's own ROTATED frame.
 *
 * Maple Court is a -12.83 deg plan, so every fixture below is deliberately OFF-AXIS.
 * An axis-aligned corpus cannot see a frame bug — it is the S32 "on-grid corpus
 * cannot see an off-grid bug" lesson, one dimension over: with rotation 0 the local
 * basis degenerates to the world basis and a transform that ignores rotation
 * entirely passes every assertion.
 */

const MAPLE = -0.2239; // radians, the owner's plan angle

function rect(over: Partial<RectObj> = {}): RectObj {
  return {
    id: 'r1',
    kind: 'rect',
    center: { x: 3, y: 2 },
    w: 4,
    h: 2,
    rotation: MAPLE,
    absorption: 0.3,
    label: 'Sofa',
    role: 'furniture',
    height: 0.9,
    ...over,
  };
}

function circle(over: Partial<CircleObj> = {}): CircleObj {
  return {
    id: 'c1',
    kind: 'circle',
    center: { x: 3, y: 2 },
    r: 1,
    absorption: 0.3,
    label: 'Table',
    height: 0.75,
    ...over,
  };
}

const VIEW: View = { scale: 60, ox: 100, oy: 80, rot: 0 };
/** A ROTATED view — the plan itself spun on screen. Angles must survive it. */
const VIEW_ROT: View = { scale: 47, ox: 220, oy: 140, rot: 0.7 };

function scene(objects: Scene['objects']): Scene {
  const s = sanitizeScene({ objects, speakers: [], listener: { pos: { x: 0, y: 0 }, z: 1.2 } });
  if (!s) throw new Error('fixture did not sanitize');
  return s;
}

/** The world position of a rect's local (sx*hw, sy*hh) corner. */
function localToWorld(o: RectObj, sx: number, sy: number) {
  const c = Math.cos(o.rotation);
  const s = Math.sin(o.rotation);
  const lx = (sx * o.w) / 2;
  const ly = (sy * o.h) / 2;
  return { x: o.center.x + lx * c - ly * s, y: o.center.y + lx * s + ly * c };
}

function corners(o: RectObj) {
  return rectCorners(o).map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`);
}

const NO_OPTS = { aspect: false, fromCentre: false, snapOn: false };

/** Local-frame sign of each resize grip, mirrored from the module under test. */
const SIGNS: Record<string, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

describe('handlesFor — where the grips live', () => {
  it('puts the eight resize grips on the rect CORNERS and EDGE MIDPOINTS, in the rotated frame', () => {
    const o = rect();
    const hs = handlesFor(o, VIEW);
    const byId = new Map(hs.map((h) => [h.id, h.at]));

    // se is local (+hw, +hh). Anything that ignored `rotation` would land elsewhere.
    const seWorld = worldToScreen(localToWorld(o, 1, 1), VIEW);
    expect(byId.get('se')!.x).toBeCloseTo(seWorld.x, 6);
    expect(byId.get('se')!.y).toBeCloseTo(seWorld.y, 6);

    const nWorld = worldToScreen(localToWorld(o, 0, -1), VIEW);
    expect(byId.get('n')!.x).toBeCloseTo(nWorld.x, 6);
    expect(byId.get('n')!.y).toBeCloseTo(nWorld.y, 6);
  });

  it('THE NEGATIVE CONTROL: the grips are NOT at the world-axis bounding box', () => {
    // A world-axis implementation would put 'e' at centre + (w/2, 0) in WORLD space.
    // On a -12.83 deg plan that is visibly wrong, and this is the only assertion in
    // the file that fails for a transform which merely forgets to rotate.
    const o = rect();
    const e = handlesFor(o, VIEW).find((h) => h.id === 'e')!;
    const worldAxis = worldToScreen({ x: o.center.x + o.w / 2, y: o.center.y }, VIEW);
    expect(Math.hypot(e.at.x - worldAxis.x, e.at.y - worldAxis.y)).toBeGreaterThan(10);
  });

  it('floats the rotate grip clear of the top edge, beyond the "n" grip', () => {
    const o = rect();
    const hs = handlesFor(o, VIEW);
    const n = hs.find((h) => h.id === 'n')!.at;
    const rot = hs.find((h) => h.id === 'rot')!.at;
    const c = worldToScreen(o.center, VIEW);
    // Further from the centre than 'n', and on the same side of it.
    expect(Math.hypot(rot.x - c.x, rot.y - c.y)).toBeGreaterThan(Math.hypot(n.x - c.x, n.y - c.y));
    const toN = { x: n.x - c.x, y: n.y - c.y };
    const toR = { x: rot.x - c.x, y: rot.y - c.y };
    const cosang =
      (toN.x * toR.x + toN.y * toR.y) / (Math.hypot(toN.x, toN.y) * Math.hypot(toR.x, toR.y));
    expect(cosang).toBeGreaterThan(0.999);
  });

  it('a DOOR offers only the two along-wall grips, and no rotate grip', () => {
    // S17: a door is wall-locked. `canRotateSel` (CanvasStage.tsx:103) already
    // refuses it, and its Inspector branch drops Depth and Rotation entirely — so
    // offering 'n'/'s' would let a drag change a door's DEPTH (the wall thickness)
    // and 'rot' would silently detach it from its wall.
    const ids = handlesFor(rect({ role: 'door', w: 0.9, h: 0.1 }), VIEW).map((h) => h.id).sort();
    expect(ids).toEqual(['e', 'w']);
  });

  it('a WINDOW keeps the full set — only DOORS are refused rotation', () => {
    // Deliberately mirrors `canRotateSel`: `kind === 'rect' && role !== 'door'`.
    // Inventing a second predicate here is how the two drift apart.
    const ids = handlesFor(rect({ role: 'window' }), VIEW).map((h) => h.id);
    expect(ids).toContain('rot');
    expect(ids).toHaveLength(9);
  });

  it('a CIRCLE offers four cardinal grips and no rotate grip', () => {
    const ids = handlesFor(circle(), VIEW).map((h) => h.id).sort();
    expect(ids).toEqual(['e', 'n', 's', 'w']);
  });
});

describe('handleAt — the hit test', () => {
  it('finds a grip the pointer is on, and nothing where there is no grip', () => {
    const o = rect();
    const se = handlesFor(o, VIEW).find((h) => h.id === 'se')!.at;
    expect(handleAt(o, VIEW, se)).toBe('se');
    expect(handleAt(o, VIEW, { x: se.x + 400, y: se.y + 400 })).toBeNull();
  });

  it('answers within the tolerance and refuses just outside it', () => {
    const o = rect();
    const nw = handlesFor(o, VIEW).find((h) => h.id === 'nw')!.at;
    expect(handleAt(o, VIEW, { x: nw.x + HANDLE_HIT_PX - 0.5, y: nw.y })).toBe('nw');
    expect(handleAt(o, VIEW, { x: nw.x + HANDLE_HIT_PX + 1.5, y: nw.y })).toBeNull();
  });

  it('THE TIE-BREAK: prefers the NEAREST grip, so adjacent grips never fight', () => {
    // At a small on-screen size the corner and edge grips overlap, and returning
    // the FIRST match in declaration order makes the edge grips unreachable —
    // 'nw' is declared first and its disc reaches past the midpoint.
    //
    // The fixture size is load-bearing and was got wrong first time: at w = 0.4
    // and scale 60 the half-extent is 12 px, just OUTSIDE the 11 px hit disc, so
    // the grips never overlap and a first-match implementation passes. Measured —
    // that control went green. 0.2 m gives a 6 px half-extent, so every grip is
    // genuinely inside its neighbour's disc and the tie-break has to do real work.
    const half = (0.2 * VIEW.scale) / 2;
    expect(half).toBeLessThan(HANDLE_HIT_PX);
    const o = rect({ w: 0.2, h: 0.2 });
    const hs = handlesFor(o, VIEW);
    for (const h of hs) {
      if (h.id === 'rot') continue;
      expect(handleAt(o, VIEW, h.at)).toBe(h.id);
    }
  });

  it('survives a ROTATED VIEW — the grips follow the plan as it spins', () => {
    const o = rect();
    for (const h of handlesFor(o, VIEW_ROT)) {
      expect(handleAt(o, VIEW_ROT, h.at)).toBe(h.id);
    }
  });
});

describe('resizeObject — the anchor is what stays put', () => {
  it('drags a CORNER and leaves the OPPOSITE corner exactly where it was', () => {
    const o = rect();
    const anchorBefore = localToWorld(o, -1, -1); // nw is opposite se
    const target = { x: 7.5, y: 4.25 };
    const next = resizeObject(o, 'se', target, NO_OPTS) as RectObj;
    const anchorAfter = localToWorld(next, -1, -1);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 9);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 9);
  });

  it('drags a corner ONTO the pointer — the grabbed corner tracks it', () => {
    const o = rect();
    const target = { x: 7.5, y: 4.25 };
    const next = resizeObject(o, 'se', target, NO_OPTS) as RectObj;
    const se = localToWorld(next, 1, 1);
    expect(se.x).toBeCloseTo(target.x, 9);
    expect(se.y).toBeCloseTo(target.y, 9);
  });

  it('an EDGE grip changes ONE span and leaves the other bit-identical', () => {
    const o = rect();
    const next = resizeObject(o, 'e', { x: 9, y: 5 }, NO_OPTS) as RectObj;
    expect(next.h).toBe(o.h); // bit-identical, not merely close
    expect(next.w).not.toBe(o.w);
    expect(next.rotation).toBe(o.rotation);
  });

  it('never rotates — resize and rotate are different gestures', () => {
    const o = rect();
    for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      const next = resizeObject(o, id, { x: 6.1, y: 3.3 }, NO_OPTS) as RectObj;
      expect(next.rotation).toBe(o.rotation);
    }
  });

  it('CLAMPS at MIN_SPAN_M rather than mirroring, and keeps the anchor fixed', () => {
    // Word mirrors. This app must NOT: `rectCorners` with a negative w yields the
    // SAME four corners in swapped order (measured), so a mirrored rect looks
    // perfect all session — and then `sanitizeObject`'s `Math.max(0.05, o.w)`
    // (scene.ts:495) collapses it to a 5 cm sliver on the next save->load. That is
    // silent data loss, so the contract here is a clamp.
    const o = rect();
    const anchorBefore = localToWorld(o, -1, -1);
    const far = localToWorld(o, -6, -6); // way past the anchor, on the far side
    const next = resizeObject(o, 'se', far, NO_OPTS) as RectObj;
    expect(next.w).toBe(MIN_SPAN_M);
    expect(next.h).toBe(MIN_SPAN_M);
    const anchorAfter = localToWorld(next, -1, -1);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 9);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 9);
  });

  it('THE REASON FOR THE CLAMP: no drag anywhere can produce a non-positive span', () => {
    // A negative w is invisible to `rectCorners` (identical corners, swapped
    // winding — it draws and blocks rays normally) and FATAL to `pointInRect`,
    // which compares Math.abs(local.x) against the SIGNED half-extent: measured,
    // 1587 of 1681 footprint samples hit at w = +4 and 0 of 1681 at w = -4. The
    // object becomes unselectable and undeletable while still absorbing sound.
    // So this sweeps every grip, both modifiers and both snap settings.
    const o = rect();
    for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      for (const fromCentre of [false, true]) {
        for (const snapOn of [false, true]) {
          for (const k of [-9, -3, -1, -0.02, 0, 0.02]) {
            const at = localToWorld(o, k, k);
            const n = resizeObject(o, id, at, { aspect: false, fromCentre, snapOn }) as RectObj;
            expect(n.w).toBeGreaterThanOrEqual(MIN_SPAN_M);
            expect(n.h).toBeGreaterThanOrEqual(MIN_SPAN_M);
            expect(pointInRect(n.center, n)).toBe(true);
          }
        }
      }
    }
  });

  it('THE ROUND-TRIP TRAP: a clamped result is a FIXED POINT of sanitizeScene', () => {
    // MIN_SPAN_M is 0.1 and the sanitizer floor is 0.05, so a clamped object must
    // survive a save->load unchanged. A min BELOW the sanitizer floor would look
    // right until the next reload — the exact shape of the negative-w trap above.
    const o = rect();
    const shrunk = resizeObject(o, 'se', localToWorld(o, -9, -9), NO_OPTS) as RectObj;
    const back = scene([shrunk]).objects[0] as RectObj;
    expect(back.w).toBe(shrunk.w);
    expect(back.h).toBe(shrunk.h);
  });

  it('ALT resizes about the CENTRE — the centre is bit-identical and both sides move', () => {
    const o = rect();
    const next = resizeObject(o, 'e', { x: 6, y: 3 }, { ...NO_OPTS, fromCentre: true }) as RectObj;
    expect(next.center.x).toBe(o.center.x);
    expect(next.center.y).toBe(o.center.y);
    expect(next.w).not.toBe(o.w);
  });

  it('SHIFT locks the aspect ratio on a corner', () => {
    const o = rect(); // 4 x 2, ratio 2
    const next = resizeObject(o, 'se', { x: 8, y: 6 }, { ...NO_OPTS, aspect: true }) as RectObj;
    expect(next.w / next.h).toBeCloseTo(o.w / o.h, 9);
  });

  it('SHIFT follows the DOMINANT axis — a mostly-vertical drag still grows it', () => {
    // The ratio test above cannot see this: scaling from the x ratio alone also
    // preserves the ratio, so that control went green. What separates the two is
    // a drag that is almost entirely along local +y — with `max` of the two
    // ratios the object grows, with x-only it barely moves.
    const o = rect();
    const c = Math.cos(o.rotation);
    const s = Math.sin(o.rotation);
    const anchor = localToWorld(o, -1, -1);
    // Local (+hw, +5*hh): a small x reach and a large y reach.
    const at = {
      x: anchor.x + o.w * c - 5 * o.h * s,
      y: anchor.x * 0 + anchor.y + o.w * s + 5 * o.h * c,
    };
    const next = resizeObject(o, 'se', at, { ...NO_OPTS, aspect: true }) as RectObj;
    expect(next.h).toBeGreaterThan(o.h * 2);
    expect(next.w / next.h).toBeCloseTo(o.w / o.h, 9);
  });

  it('every clamp bound is a multiple of the snap grid — which is why order is free', () => {
    // `snapSpan` then `clampSpan` and the reverse give identical results ONLY
    // because each bound already lies on the 0.05 m grid: a negative control that
    // swapped the two was a literal no-op on all 93 tests. That is the code being
    // redundant, not the tests being weak — but it stops holding the moment
    // someone picks an off-grid bound, so the property itself is pinned here.
    for (const bound of [MIN_SPAN_M, MIN_RADIUS_M, DOOR_MIN_W_M, DOOR_MAX_W_M]) {
      expect(Math.abs(Math.round(bound / 0.05) * 0.05 - bound)).toBeLessThan(1e-12);
    }
    // …and above the sanitizer's own floors (0.05 for both w/h and r), so a
    // clamped value survives a save->load unchanged.
    expect(MIN_SPAN_M).toBeGreaterThanOrEqual(0.05);
    expect(MIN_RADIUS_M).toBeGreaterThanOrEqual(0.05);
  });

  it('SHIFT still keeps the opposite corner pinned', () => {
    const o = rect();
    const before = localToWorld(o, -1, -1);
    const next = resizeObject(o, 'se', { x: 8, y: 6 }, { ...NO_OPTS, aspect: true }) as RectObj;
    const after = localToWorld(next, -1, -1);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('with SNAP on, the resulting SPAN lands on the 0.05 m grid', () => {
    const o = rect();
    const next = resizeObject(o, 'se', { x: 7.31234, y: 4.4177 }, { ...NO_OPTS, snapOn: true }) as RectObj;
    expect(Math.abs(Math.round(next.w / 0.05) * 0.05 - next.w)).toBeLessThan(1e-9);
    expect(Math.abs(Math.round(next.h / 0.05) * 0.05 - next.h)).toBeLessThan(1e-9);
  });

  it('THE FIXED POINT: re-dragging a snapped grip to where it landed changes nothing', () => {
    // The S32 quantise-then-clamp lesson. If the snap and the clamp are applied in
    // the wrong order the result slides a little every time the gesture repeats.
    const o = rect({ w: 1.37, h: 0.83 }); // deliberately OFF the 0.05 grid
    const opts = { ...NO_OPTS, snapOn: true };
    const once = resizeObject(o, 'se', { x: 6.4321, y: 3.1234 }, opts) as RectObj;
    const twice = resizeObject(once, 'se', localToWorld(once, 1, 1), opts) as RectObj;
    expect(twice.w).toBeCloseTo(once.w, 12);
    expect(twice.h).toBeCloseTo(once.h, 12);
    expect(corners(twice)).toEqual(corners(once));
  });

  it('a DOOR resizes only its clear opening, within the Inspector bounds', () => {
    const d = rect({ role: 'door', w: 0.9, h: 0.1, swingDeg: 90, hingeEnd: 'start', swingSide: 'in' });
    const wide = resizeObject(d, 'e', localToWorld(d, 40, 0), NO_OPTS) as RectObj;
    expect(wide.w).toBe(DOOR_MAX_W_M);
    const narrow = resizeObject(d, 'e', localToWorld(d, -40, 0), NO_OPTS) as RectObj;
    expect(narrow.w).toBe(DOOR_MIN_W_M);
    expect(narrow.h).toBe(d.h); // the wall thickness is not the user's to drag
    expect(narrow.rotation).toBe(d.rotation);
  });

  it('a door stays ON its wall line — resizing slides it along, never off', () => {
    // The anchor rule does the work: local +x IS the wall direction, so moving the
    // centre along it cannot leave the line. Measured through `rectCorners` rather
    // than asserted on the raw field.
    const d = rect({ role: 'door', w: 0.9, h: 0.1 });
    const next = resizeObject(d, 'e', localToWorld(d, 3, 0), NO_OPTS) as RectObj;
    const dir = { x: Math.cos(d.rotation), y: Math.sin(d.rotation) };
    const off = { x: next.center.x - d.center.x, y: next.center.y - d.center.y };
    const perp = off.x * -dir.y + off.y * dir.x;
    expect(Math.abs(perp)).toBeLessThan(1e-12);
  });

  it('a CIRCLE resizes its radius with the opposite point pinned', () => {
    const c = circle();
    const anchor = { x: c.center.x - c.r, y: c.center.y };
    const next = resizeObject(c, 'e', { x: 6, y: 2 }, NO_OPTS) as CircleObj;
    expect(next.r).toBeCloseTo((6 - anchor.x) / 2, 9);
    expect(next.center.x).toBeCloseTo(anchor.x + next.r, 9);
    expect(next.center.y).toBe(c.center.y);
  });

  it('a circle clamps its radius at the INSPECTOR minimum, not the sanitizer floor', () => {
    // Inspector Radius is `min={0.1}` (InspectorPanel.tsx:471) while
    // `sanitizeObject` floors r at 0.05 (scene.ts:523). Clamping to the LOWER
    // number would let a drag reach a radius the Inspector refuses to show.
    const c = circle();
    const next = resizeObject(c, 'e', { x: 1.0, y: 2 }, NO_OPTS) as CircleObj;
    expect(next.r).toBe(MIN_RADIUS_M);
    expect(scene([next]).objects[0]).toMatchObject({ r: MIN_RADIUS_M });
  });

  it('returns the SAME REFERENCE when the gesture changes nothing', () => {
    // The S14 lesson: a referentially-new-but-equal object still pushes an undo
    // entry, so a click-without-drag on a grip would be silently undoable.
    const o = rect();
    const same = resizeObject(o, 'se', localToWorld(o, 1, 1), NO_OPTS);
    expect(same).toBe(o);
  });

  it('THE NON-BIT-EXACT TRAP: the no-op check holds on a ROTATED object', () => {
    // An `nw === o.w` identity check passes on an axis-aligned rect and silently
    // never fires once the object is rotated, because world->local->world is a
    // cos/sin round trip: dropping 'se' on its own exact position returns
    // h = 1.9999999999999998 for h = 2. So a stationary pointer would allocate a
    // new object every frame on exactly the plans this feature is for. Swept over
    // many angles, because a single fixture angle can pass by luck (S23).
    for (let deg = -180; deg <= 180; deg += 7) {
      const o = rect({ rotation: (deg * Math.PI) / 180 });
      for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
        const at = localToWorld(o, SIGNS[id][0], SIGNS[id][1]);
        expect(resizeObject(o, id, at, NO_OPTS)).toBe(o);
      }
    }
  });

  it('but a REAL sub-grid resize is still applied — the epsilon is not a dead zone', () => {
    // The negative control for the tolerance above: 1e-9 m must not swallow an
    // edit a user could actually make. 1 mm is far below the 0.05 m grid and must
    // still land when snap is off.
    const o = rect();
    const at = localToWorld(o, 1, 1);
    const c = Math.cos(o.rotation);
    const s = Math.sin(o.rotation);
    const moved = { x: at.x + 0.001 * c, y: at.y + 0.001 * s };
    const next = resizeObject(o, 'se', moved, NO_OPTS) as RectObj;
    expect(next).not.toBe(o);
    expect(next.w).toBeCloseTo(o.w + 0.001, 9);
  });
});

describe('rotateObject', () => {
  it('turns by the ANGLE SWEPT since the grab, not by the absolute pointer angle', () => {
    const o = rect();
    // Grab due east of the centre, drag to due south: a quarter turn clockwise.
    const grab = Math.atan2(0, 1);
    const next = rotateObject(o, { x: o.center.x, y: o.center.y + 5 }, grab, { snap: false }) as RectObj;
    expect(next.rotation).toBeCloseTo(o.rotation + Math.PI / 2, 9);
  });

  it('keeps the CENTRE and both spans bit-identical', () => {
    const o = rect();
    const next = rotateObject(o, { x: 9, y: 9 }, 0.3, { snap: false }) as RectObj;
    expect(next.center).toBe(o.center);
    expect(next.w).toBe(o.w);
    expect(next.h).toBe(o.h);
  });

  it('SHIFT snaps to 15 degree increments', () => {
    const o = rect({ rotation: 0 });
    const next = rotateObject(o, { x: o.center.x + 5, y: o.center.y + 1.4 }, 0, { snap: true }) as RectObj;
    const k = next.rotation / ROT_SNAP_RAD;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
  });

  it('normalises into (-PI, PI] like rotateSelectedRect does', () => {
    const o = rect({ rotation: 3.0 });
    const next = rotateObject(o, { x: o.center.x - 1, y: o.center.y - 5 }, 0, { snap: false }) as RectObj;
    expect(next.rotation).toBeGreaterThan(-Math.PI);
    expect(next.rotation).toBeLessThanOrEqual(Math.PI);
  });

  it('is a pure function of (obj0, pointer) — it never accumulates', () => {
    // The S23 discipline: every frame recomputes from the gesture's start, so a
    // pointer that returns to where it began restores the IDENTICAL float. An
    // implementation that added a per-frame delta would drift.
    const o = rect();
    const at = { x: 7, y: 6 };
    const a = rotateObject(o, at, 0.4, { snap: false }) as RectObj;
    const b = rotateObject(o, at, 0.4, { snap: false }) as RectObj;
    expect(b.rotation).toBe(a.rotation);
    const backToStart = rotateObject(o, at, 0.4, { snap: false }) as RectObj;
    expect(backToStart.rotation).toBe(a.rotation);
  });

  it('refuses a DOOR, returning the same reference', () => {
    const d = rect({ role: 'door' });
    expect(rotateObject(d, { x: 9, y: 9 }, 0, { snap: false })).toBe(d);
  });
});

describe('handleTargetFor — ONE definition of "the grips are live"', () => {
  // Shared by the renderer and the pointer hit test, so "drawn" and "grabbable"
  // cannot drift apart (the S30 `containerIntentFor` lesson).
  const sel = (id: string): Selection => ({ type: 'object', id });
  const LIVE = { mode: 'select' as const, overlayOpen: false };

  it('is the selected rect in select mode', () => {
    const s = scene([rect()]);
    expect(handleTargetFor(s, sel('r1'), LIVE)?.id).toBe('r1');
  });

  it('is null while an overlay is open', () => {
    // The S4 lesson: SimCanvas stays mounted under the gallery/compare overlays.
    // Grips drawn there would be a mutate-through-a-dialog path.
    const s = scene([rect()]);
    expect(handleTargetFor(s, sel('r1'), { ...LIVE, overlayOpen: true })).toBeNull();
  });

  it('is null in every non-select tool mode', () => {
    const s = scene([rect()]);
    for (const mode of ['wall', 'rect', 'circle', 'room', 'speaker', 'opening', 'marquee', 'lasso'] as const) {
      expect(handleTargetFor(s, sel('r1'), { mode, overlayOpen: false })).toBeNull();
    }
  });

  it('is null for a WALL, a multi-selection, a listener and no selection', () => {
    const w = { id: 'w1', kind: 'wall' as const, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, absorption: 0.1, label: 'Wall', height: 2.6 };
    const s = scene([rect(), w]);
    expect(handleTargetFor(s, sel('w1'), LIVE)).toBeNull();
    expect(handleTargetFor(s, { type: 'multi', objectIds: ['r1'], speakerIds: [] }, LIVE)).toBeNull();
    expect(handleTargetFor(s, { type: 'listener' }, LIVE)).toBeNull();
    expect(handleTargetFor(s, null, LIVE)).toBeNull();
  });

  it('is null for a selection id that no longer exists', () => {
    expect(handleTargetFor(scene([rect()]), sel('ghost'), LIVE)).toBeNull();
  });
});

describe('applyHandleDrag — the gesture baseline', () => {
  const sofa = () => rect();
  const world = (o: RectObj, sx: number, sy: number) => localToWorld(o, sx, sy);

  it('THE FEEDBACK-LOOP TRAP: every frame transforms from obj0, never from the live object', () => {
    // The bug this exists to stop was written and caught on re-read: taking the
    // baseline from `scene` makes each frame compound on the previous frame's
    // output, so a SLOW drag (many frames to the same place) grows an object more
    // than a QUICK one and no pointer position has one well-defined result.
    // Replaying identical frames must therefore be idempotent.
    const o = sofa();
    let s = scene([o]);
    const at = world(o, 3, 1); // hold the pointer still, well out from the corner
    const opts = { aspect: false, fromCentre: false, snapOn: false, grabAngle: 0 };
    for (let frame = 0; frame < 30; frame++) s = applyHandleDrag(s, o, 'se', at, opts);
    const once = applyHandleDrag(scene([o]), o, 'se', at, opts).objects[0] as RectObj;
    const after = s.objects[0] as RectObj;
    expect(after.w).toBe(once.w);
    expect(after.h).toBe(once.h);
    expect(after.center).toEqual(once.center);
  });

  it('THE RESTORE: a drag that wanders and comes home puts the ORIGINAL object back', () => {
    // Caught by this test, on the first run: comparing the computed object against
    // `obj0` instead of against the LIVE one returned the scene untouched exactly
    // when the pointer came home — leaving the object stranded at its mid-drag
    // size (measured: 14.00 x 0.10 m instead of 4 x 2) while the pointer said
    // otherwise. "Nothing changed since the baseline" and "nothing to write" are
    // different questions, and only the second one is about the scene.
    const o = sofa();
    const opts = { aspect: false, fromCentre: false, snapOn: false, grabAngle: 0 };
    const home = world(o, 1, 1);
    let s = scene([o]);
    for (const p of [world(o, 4, 2), world(o, -2, 3), world(o, 6, -1), home]) {
      s = applyHandleDrag(s, o, 'se', p, opts);
    }
    expect(s.objects[0]).toBe(o);
    // …and a further identical frame is then a true no-op.
    expect(applyHandleDrag(s, o, 'se', home, opts)).toBe(s);
  });

  it('returns the SAME SCENE reference when the target was deleted mid-gesture', () => {
    // Undo from the keyboard, or a layout switch, can remove the object while the
    // pointer is still down. Resurrecting it would be worse than doing nothing.
    const o = sofa();
    const empty = scene([]);
    const opts = { aspect: false, fromCentre: false, snapOn: false, grabAngle: 0 };
    expect(applyHandleDrag(empty, o, 'se', world(o, 3, 3), opts)).toBe(empty);
  });

  it('touches only the target object', () => {
    const o = sofa();
    const other = rect({ id: 'r2', center: { x: 20, y: 20 } });
    const s = scene([o, other]);
    const next = applyHandleDrag(s, o, 'se', world(o, 3, 2), {
      aspect: false,
      fromCentre: false,
      snapOn: false,
      grabAngle: 0,
    });
    expect(next.objects.find((x) => x.id === 'r2')).toBe(s.objects.find((x) => x.id === 'r2'));
  });

  it('routes the rot grip to rotateObject and leaves the spans alone', () => {
    const o = sofa();
    const next = applyHandleDrag(scene([o]), o, 'rot', { x: o.center.x, y: o.center.y + 4 }, {
      aspect: false,
      fromCentre: false,
      snapOn: false,
      grabAngle: 0,
    }).objects[0] as RectObj;
    expect(next.w).toBe(o.w);
    expect(next.h).toBe(o.h);
    expect(next.rotation).toBeCloseTo(o.rotation + Math.PI / 2, 9);
  });
});
