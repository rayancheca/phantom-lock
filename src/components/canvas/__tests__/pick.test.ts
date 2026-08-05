import { describe, expect, it, vi } from 'vitest';
import type { RectObj, Scene, Selection, SpeakerObj, Vec2 } from '../../../engine/types';
import { addListener, sanitizeScene, setActiveListener } from '../../../engine/scene';
import { NODE_RADIUS } from '../../../engine/hit';
import type { View } from '../render';
import { screenToWorld, worldToScreen } from '../render';
import { HANDLE_HIT_PX, handleTargetFor, handlesFor } from '../handles';
import { applyDragToScene, type Drag } from '../drag-apply';
import { SNAP_STEP } from '../placement';
import {
  applyPickAction,
  resolvePointerDown,
  type PickAction,
  type PickEffects,
  type PickInput,
} from '../pick';

/**
 * §18a — what a pointerdown MEANS (S38).
 *
 * These are node tests because they have to be: jsdom dispatches a plain `Event`
 * for pointer events, so `button`/`pointerId`/`clientX` all arrive `undefined`
 * and `SimCanvas.onPointerDown` bails at its first guard (TRAP 21). Before this
 * split, the app's MOST-USED interaction path had no committed test at all — it
 * was reachable only by driving real Chrome over CDP.
 *
 * Three disciplines, each of which a previous session learned the hard way:
 *
 * 1. TWO VIEWS. At `rot: 0` the screen delta is the world delta times a positive
 *    scalar, so `Math.atan2` over world and over screen coordinates is
 *    BIT-IDENTICAL — measured, 0.239747 both ways — and a fixture at rot 0 is
 *    arithmetically incapable of expressing a world-vs-screen `grabAngle` bug.
 *    `VIEW_ROT` has `rot: 0.7`, where the two differ by exactly 0.7.
 * 2. OFF-GRID, OFF-AXIS fixtures. Maple Court is a -12.83 deg plan and the snap
 *    grid is 0.05 m; a fixture on the grid cannot see a double-snap and a fixture
 *    at rotation 0 cannot see a frame bug (S32, S36, S37 — three sessions).
 * 3. Drag records are asserted THROUGH the real consumer, never by field
 *    equality. `expect(action.drag).toEqual({...})` freezes whatever the code
 *    emits, which is the S30 `toHaveBeenCalledWith` bug that PINNED a defect for
 *    a whole session.
 */

const MAPLE = -0.2239; // radians — the owner's plan angle
const VIEW: View = { scale: 60, ox: 100, oy: 80, rot: 0 };
/** A ROTATED view — the plan itself spun on screen. Angles must survive it. */
const VIEW_ROT: View = { scale: 47, ox: 220, oy: 140, rot: 0.7 };

function rect(over: Partial<RectObj> = {}): RectObj {
  return {
    id: 'r1',
    kind: 'rect',
    center: { x: 3.17, y: 2.23 },
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

function spk(id: string, pos: Vec2): SpeakerObj {
  return { id, pos, z: 1.1, label: id, model: 'homepod', trimDb: 0 };
}

function scene(objects: Scene['objects'], speakers: SpeakerObj[] = [], at?: Vec2): Scene {
  const s = sanitizeScene({
    objects,
    speakers,
    listener: { pos: at ?? { x: 20, y: 20 }, z: 1.2 },
  });
  if (!s) throw new Error('fixture did not sanitize');
  return s;
}

/** A pointerdown at a WORLD point, projected through `view`. */
function at(world: Vec2, view: View, over: Partial<PickInput> = {}): PickInput {
  return {
    scene: scene([]),
    selection: null,
    mode: 'select',
    view,
    screenPt: worldToScreen(world, view),
    worldPt: world,
    button: 0,
    pointerId: 7,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    spaceHeld: false,
    dragActive: false,
    calibFirst: null,
    handleTarget: null,
    snapOn: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The bails and the tool branches — every branch of the ladder, once.
// ---------------------------------------------------------------------------

describe('resolvePointerDown — bails and tools', () => {
  it('middle button pans, whatever the tool', () => {
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { button: 1, mode: 'wall' }));
    expect(a).toEqual({
      kind: 'drag',
      drag: { kind: 'pan', pointerId: 7, sx: expect.any(Number), sy: expect.any(Number), ox: 100, oy: 80 },
    });
  });

  it('right button pans', () => {
    expect(resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { button: 2 })).kind).toBe('drag');
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { button: 2 }));
    expect(a.kind === 'drag' && a.drag.kind).toBe('pan');
  });

  it('a held Space pans on the LEFT button — and that beats every tool below it', () => {
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { spaceHeld: true, mode: 'speaker' }));
    expect(a.kind === 'drag' && a.drag.kind).toBe('pan');
  });

  it('the pan branch sits ABOVE the button/drag bail — a middle click during a live drag still pans', () => {
    // The order matters: `button !== 0 || dragActive` returns NONE, so a pan
    // written below it would be dead for buttons 1 and 2 (which are never 0).
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { button: 1, dragActive: true }));
    expect(a.kind === 'drag' && a.drag.kind).toBe('pan');
  });

  it('any other button does nothing', () => {
    expect(resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { button: 3 }))).toEqual({ kind: 'none' });
  });

  it('a live drag refuses everything below the pan branch', () => {
    const s = scene([rect()]);
    const a = resolvePointerDown(
      at({ x: 3.17, y: 2.23 }, VIEW, { scene: s, dragActive: true }),
    );
    expect(a).toEqual({ kind: 'none' });
  });

  it('calibrate: the FIRST click stores a point, the SECOND measures', () => {
    const p1 = { x: 1.37, y: 2.41 };
    const first = resolvePointerDown(at(p1, VIEW, { mode: 'calibrate' }));
    expect(first).toEqual({ kind: 'calibrate-start', at: p1 });

    const p2 = { x: 4.63, y: 2.41 };
    const second = resolvePointerDown(at(p2, VIEW, { mode: 'calibrate', calibFirst: p1 }));
    expect(second).toEqual({ kind: 'calibrate-finish', a: p1, b: p2 });
  });

  it('calibrate takes the RAW world point, never the snapped one', () => {
    // A calibration measures a real distance off a photo; snapping it to 5 cm
    // would quantise the scale the whole plan is derived from.
    const p = { x: 1.337, y: 2.417 };
    const a = resolvePointerDown(at(p, VIEW, { mode: 'calibrate', snapOn: true }));
    expect(a).toEqual({ kind: 'calibrate-start', at: p });
  });

  it('wall mode appends a chain vertex at the RAW point (chain.ts owns the snapping)', () => {
    const p = { x: 1.337, y: 2.417 };
    expect(resolvePointerDown(at(p, VIEW, { mode: 'wall', snapOn: true }))).toEqual({
      kind: 'chain-point',
      at: p,
    });
  });

  it('speaker mode places at the RAW point (placeSpeakerAt owns the snapping)', () => {
    const p = { x: 1.337, y: 2.417 };
    expect(resolvePointerDown(at(p, VIEW, { mode: 'speaker', snapOn: true }))).toEqual({
      kind: 'place-speaker',
      at: p,
    });
  });

  it('marquee seeds the band from the SCREEN point, not the world point', () => {
    // The band is a screen-space rubber band; seeding it from world metres would
    // put it at (1.3, 2.4) px — the top-left corner — at every zoom. Invisible
    // under an identity view, which is why VIEW_ROT is used here.
    const world = { x: 1.337, y: 2.417 };
    const a = resolvePointerDown(at(world, VIEW_ROT, { mode: 'marquee' }));
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.bandOrigin).toEqual(worldToScreen(world, VIEW_ROT));
    expect(a.bandOrigin).not.toEqual(world);
    expect(a.drag).toEqual({ kind: 'band', pointerId: 7, shape: 'marquee', additive: false });
  });

  it('lasso gets the lasso shape', () => {
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { mode: 'lasso' }));
    expect(a.kind === 'drag' && a.drag.kind === 'band' && a.drag.shape).toBe('lasso');
  });

  it('SHIFT is additive for a band and is NOT a ⌘-click — two different sets', () => {
    // A shared `additive` local would silently make ⇧-click toggle multi
    // membership, which is a different gesture with a different meaning.
    for (const mod of ['metaKey', 'ctrlKey', 'shiftKey'] as const) {
      const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { mode: 'marquee', [mod]: true }));
      expect(a.kind === 'drag' && a.drag.kind === 'band' && a.drag.additive).toBe(true);
    }
    // …while in SELECT mode, shift alone is not a multi-toggle: it falls all the
    // way through to the plain hit ladder.
    const s = scene([rect()]);
    const sel = resolvePointerDown(
      at({ x: 3.17, y: 2.23 }, VIEW, { scene: s, shiftKey: true }),
    );
    expect(sel.kind).toBe('drag'); // a plain move, not a selection toggle
  });

  it('the draw tools snap their anchor — and the fixture is OFF-GRID so it shows', () => {
    const world = { x: 1.337, y: 2.417 };
    for (const mode of ['rect', 'circle', 'room'] as const) {
      const a = resolvePointerDown(at(world, VIEW, { mode, snapOn: true }));
      expect(a.kind).toBe('drag');
      if (a.kind !== 'drag' || a.drag.kind !== 'draw') throw new Error('unreachable');
      expect(a.drag.tool).toBe(mode);
      // 1.337 -> 1.35, 2.417 -> 2.40. Both differ from the raw point, which is
      // what an on-grid fixture could never show.
      expect(a.drag.anchor.x).toBeCloseTo(1.35, 10);
      expect(a.drag.anchor.y).toBeCloseTo(2.4, 10);
      expect(a.drag.anchor).not.toEqual(world);
      expect(a.drag.anchor.x % SNAP_STEP).toBeCloseTo(0, 10);
    }
  });

  it('snap OFF leaves the draw anchor raw', () => {
    const world = { x: 1.337, y: 2.417 };
    const a = resolvePointerDown(at(world, VIEW, { mode: 'rect', snapOn: false }));
    expect(a.kind === 'drag' && a.drag.kind === 'draw' && a.drag.anchor).toEqual(world);
  });
});

// ---------------------------------------------------------------------------
// The opening tool
// ---------------------------------------------------------------------------

describe('resolvePointerDown — the opening tool', () => {
  const wallScene = () =>
    scene([
      {
        id: 'w1',
        kind: 'wall',
        a: { x: 0, y: 0 },
        b: { x: 6, y: 0 },
        absorption: 0.12,
        label: 'Wall',
        height: 2.5,
      },
    ]);

  it('cuts a DOOR at the closest point ON the wall, not at the pointer', () => {
    const s = wallScene();
    // 12 px above the wall at scale 60 = 0.2 m, inside the 18 px appear radius.
    const a = resolvePointerDown(at({ x: 2.37, y: -0.2 }, VIEW, { scene: s, mode: 'opening' }));
    expect(a.kind).toBe('insert-opening');
    if (a.kind !== 'insert-opening') throw new Error('unreachable');
    expect(a.role).toBe('door');
    expect(a.wall.id).toBe('w1');
    // Projected onto the wall: y snaps to 0, x is unchanged.
    expect(a.at).toEqual({ x: 2.37, y: 0 });
  });

  it('⇧ cuts a WINDOW', () => {
    const a = resolvePointerDown(
      at({ x: 2.37, y: -0.2 }, VIEW, { scene: wallScene(), mode: 'opening', shiftKey: true }),
    );
    expect(a.kind === 'insert-opening' && a.role).toBe('window');
  });

  it('the appear radius is in SCREEN px, so zooming OUT shrinks the reach in metres', () => {
    // 18 px at scale 60 is 0.30 m; at scale 12 it is 1.50 m. The same world
    // point is therefore a MISS zoomed in and a HIT zoomed out — a fixture at
    // one scale cannot express this.
    const s = wallScene();
    const p = { x: 2.37, y: -0.6 };
    const near = resolvePointerDown(at(p, VIEW, { scene: s, mode: 'opening' }));
    expect(near.kind).toBe('notice');
    const far = resolvePointerDown(
      at(p, { ...VIEW, scale: 12 }, { scene: s, mode: 'opening' }),
    );
    expect(far.kind).toBe('insert-opening');
  });

  it('clicking off every wall NOTICES rather than doing nothing silently', () => {
    const a = resolvePointerDown(at({ x: 2.37, y: -4 }, VIEW, { scene: wallScene(), mode: 'opening' }));
    expect(a).toEqual({ kind: 'notice', message: 'Click a wall to cut a door.' });
  });

  it('the notice names the role the SHIFT key asked for', () => {
    const a = resolvePointerDown(
      at({ x: 2.37, y: -4 }, VIEW, { scene: wallScene(), mode: 'opening', shiftKey: true }),
    );
    expect(a).toEqual({ kind: 'notice', message: 'Click a wall to cut a window.' });
  });

  it('a scene with NO walls notices — it does not throw', () => {
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW, { scene: scene([]), mode: 'opening' }));
    expect(a.kind).toBe('notice');
  });
});

// ---------------------------------------------------------------------------
// ⌘-click
// ---------------------------------------------------------------------------

describe('resolvePointerDown — ⌘/Ctrl-click', () => {
  const s = () => scene([rect()], [spk('s1', { x: 8, y: 8 })]);

  it('adds a speaker to an empty selection', () => {
    const a = resolvePointerDown(at({ x: 8, y: 8 }, VIEW, { scene: s(), metaKey: true }));
    expect(a).toEqual({ kind: 'select', selection: { type: 'speaker', id: 's1' } });
  });

  it('REMOVES a speaker already in the selection', () => {
    const a = resolvePointerDown(
      at({ x: 8, y: 8 }, VIEW, {
        scene: s(),
        metaKey: true,
        selection: { type: 'multi', objectIds: ['r1'], speakerIds: ['s1'] },
      }),
    );
    expect(a).toEqual({ kind: 'select', selection: { type: 'object', id: 'r1' } });
  });

  it('Ctrl behaves exactly like ⌘', () => {
    const meta = resolvePointerDown(at({ x: 8, y: 8 }, VIEW, { scene: s(), metaKey: true }));
    const ctrl = resolvePointerDown(at({ x: 8, y: 8 }, VIEW, { scene: s(), ctrlKey: true }));
    expect(ctrl).toEqual(meta);
  });

  it('on EMPTY space it does nothing — it must NOT deselect', () => {
    // This is the asymmetry with a plain click, which DOES deselect. Getting it
    // wrong destroys a multi-selection the user is halfway through building.
    const sel: Selection = { type: 'multi', objectIds: ['r1'], speakerIds: ['s1'] };
    const a = resolvePointerDown(at({ x: 40, y: 40 }, VIEW, { scene: s(), metaKey: true, selection: sel }));
    expect(a).toEqual({ kind: 'none' });

    const plain = resolvePointerDown(at({ x: 40, y: 40 }, VIEW, { scene: s(), selection: sel }));
    expect(plain).toEqual({ kind: 'select', selection: null });
  });

  it('a NODE hit short-circuits the object hit — a pod over a sofa toggles the POD', () => {
    // `oh = nh ? null : hitTestObjects(...)` is load-bearing: the pod sits inside
    // the sofa's footprint, so both hit, and without the short-circuit the sofa
    // would win the `else if`.
    const overlapping = scene([rect()], [spk('s1', { x: 3.17, y: 2.23 })]);
    const a = resolvePointerDown(at({ x: 3.17, y: 2.23 }, VIEW, { scene: overlapping, metaKey: true }));
    expect(a).toEqual({ kind: 'select', selection: { type: 'speaker', id: 's1' } });
  });

  it('THE FORCING CASE for the short-circuit: the LISTENER over an object does NOTHING', () => {
    // A multi-selection has no listener slot, so ⌘-clicking the YOU puck is a
    // deliberate no-op. Without `oh = nh ? null : …`, `nh` is a listener (so the
    // speaker branch is skipped) while `oh` is the object underneath — and the
    // `else if` then toggles a piece of furniture the user never aimed at.
    //
    // The previous test cannot express this: a SPEAKER hit takes the first
    // branch whatever `oh` holds, so the short-circuit is unobservable there and
    // a negative control walked through it.
    const overlapping = scene([rect()], [], { x: 3.17, y: 2.23 });
    const a = resolvePointerDown(
      at({ x: 3.17, y: 2.23 }, VIEW, { scene: overlapping, metaKey: true }),
    );
    expect(a).toEqual({ kind: 'none' });

    // …and the fixture is only meaningful because an object really is under it.
    const plain = resolvePointerDown(
      at({ x: 3.17, y: 2.23 }, VIEW, { scene: scene([rect()]), metaKey: true }),
    );
    expect(plain).toEqual({ kind: 'select', selection: { type: 'object', id: 'r1' } });
  });

  it('never starts a drag', () => {
    const a = resolvePointerDown(at({ x: 8, y: 8 }, VIEW, { scene: s(), metaKey: true }));
    expect(a.kind).not.toBe('drag');
  });
});

// ---------------------------------------------------------------------------
// THE ORDERING — the part that was a comment with no test until S38.
// ---------------------------------------------------------------------------

describe('resolvePointerDown — hit-test ORDER', () => {
  /**
   * A grip and a speaker puck at the SAME screen point.
   *
   * This is the S36 finding made concrete: a pod parked at the head of the Bed
   * sits within HANDLE_HIT_PX of a resize grip, and if grips were tested first,
   * dragging that pod would resize the bed instead. A fixture where the two do
   * NOT overlap passes under either order and proves nothing.
   */
  function gripAndPodShareAPoint(view: View) {
    const r = rect({ w: 4, h: 2.4 }); // big enough that grips are not size-gated
    const s0 = scene([r]);
    const target = handleTargetFor(s0, { type: 'object', id: 'r1' }, {
      mode: 'select',
      overlayOpen: false,
    });
    if (!target) throw new Error('fixture has no grips — the size gate refused it');
    const grips = handlesFor(target, view);
    const nw = grips.find((g) => g.id === 'nw');
    if (!nw) throw new Error('fixture has no nw grip');
    // Put the pod exactly on the grip, in WORLD coordinates.
    const podWorld = screenToWorld(nw.at, view);
    return { scene: scene([r], [spk('s1', podWorld)]), target, gripScreen: nw.at, podWorld };
  }

  it('THE ONE THAT MATTERS: a speaker puck BEATS a grip at the same point', () => {
    for (const view of [VIEW, VIEW_ROT]) {
      const f = gripAndPodShareAPoint(view);
      // Sanity: the fixture really is degenerate — the grip is within its own hit
      // radius of the pod's screen position. Without this the test is vacuous.
      const podScreen = worldToScreen(f.podWorld, view);
      expect(Math.hypot(podScreen.x - f.gripScreen.x, podScreen.y - f.gripScreen.y)).toBeLessThan(
        HANDLE_HIT_PX,
      );

      const a = resolvePointerDown(
        at(f.podWorld, view, {
          scene: f.scene,
          selection: { type: 'object', id: 'r1' },
          handleTarget: f.target,
        }),
      );
      expect(a.kind).toBe('drag');
      if (a.kind !== 'drag') throw new Error('unreachable');
      expect(a.drag.kind).toBe('node');
      expect(a.selection).toEqual({ type: 'speaker', id: 's1' });
    }
  });

  it('…and with the pod REMOVED the very same point grabs the grip', () => {
    // The other half: without this, "a pod wins" would also pass if grips were
    // simply never reachable at all.
    for (const view of [VIEW, VIEW_ROT]) {
      const f = gripAndPodShareAPoint(view);
      const noPod = scene(f.scene.objects, []);
      const a = resolvePointerDown(
        at(f.podWorld, view, {
          scene: noPod,
          selection: { type: 'object', id: 'r1' },
          handleTarget: f.target,
        }),
      );
      expect(a.kind === 'drag' && a.drag.kind).toBe('handle');
    }
  });

  it('an INACTIVE seat also beats a grip at the same point', () => {
    const f = gripAndPodShareAPoint(VIEW);
    let s = scene(f.scene.objects, []);
    s = addListener(s, 'Bed', f.podWorld);
    // Make the OTHER seat active, so the one on the grip is inactive.
    s = setActiveListener(s, s.listeners![0].id);
    const seatOnGrip = s.listeners!.find((l) => l.name === 'Bed')!;

    const a = resolvePointerDown(
      at(f.podWorld, VIEW, {
        scene: s,
        selection: { type: 'object', id: 'r1' },
        handleTarget: f.target,
      }),
    );
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.activateSeat).toBe(seatOnGrip.id);
    expect(a.selection).toEqual({ type: 'listener' });
    expect(a.drag.kind).toBe('node');
  });

  it('a grip BEATS the object body it belongs to', () => {
    // The other side of the same ordering: the grip sits ON the sofa's corner, so
    // `hitTestObjects` would also claim it. Grips are tested first.
    const f = gripAndPodShareAPoint(VIEW);
    const bare = scene(f.scene.objects, []);
    const a = resolvePointerDown(
      at(f.podWorld, VIEW, {
        scene: bare,
        selection: { type: 'object', id: 'r1' },
        handleTarget: f.target,
      }),
    );
    expect(a.kind === 'drag' && a.drag.kind).toBe('handle');
    // …and with grips OFF (a coarse pointer), the same point moves the body.
    const off = resolvePointerDown(
      at(f.podWorld, VIEW, {
        scene: bare,
        selection: { type: 'object', id: 'r1' },
        handleTarget: null,
      }),
    );
    expect(off.kind === 'drag' && off.drag.kind).toBe('move-rc');
  });

  it('a MULTI member drag beats the individual hit — the group moves, not the one piece', () => {
    const s = scene([rect(), rect({ id: 'r2', center: { x: 9.13, y: 6.41 } })], [
      spk('s1', { x: 12.3, y: 3.7 }),
    ]);
    const sel: Selection = { type: 'multi', objectIds: ['r1', 'r2'], speakerIds: ['s1'] };
    const a = resolvePointerDown(at({ x: 3.17, y: 2.23 }, VIEW, { scene: s, selection: sel }));
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.drag.kind).toBe('move-multi');
    // …and the selection is NOT collapsed to the piece that was grabbed.
    expect(a.selection).toBeUndefined();
  });

  it('THE FORCING CASE: grabbing a member that IS a node still moves the group', () => {
    // The previous test's grab point has no puck on it, so the multi block can be
    // moved below the node hits and it still passes — a negative control walked
    // through it. The hazard is specifically a SPEAKER member: with node hits
    // first, clicking it collapses the whole selection to that one pod and drags
    // it alone, silently abandoning the group the user just built.
    const pod = { x: 6.37, y: 4.13 };
    const s = scene([rect()], [spk('s1', pod), spk('s2', { x: 12.3, y: 3.7 })]);
    const sel: Selection = { type: 'multi', objectIds: ['r1'], speakerIds: ['s1', 's2'] };
    const a = resolvePointerDown(at(pod, VIEW, { scene: s, selection: sel }));
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.drag.kind).toBe('move-multi');
    expect(a.selection).toBeUndefined();

    // The fixture is only meaningful because that point really IS a node hit —
    // otherwise it proves nothing about the order.
    const alone = resolvePointerDown(at(pod, VIEW, { scene: s, selection: null }));
    expect(alone.kind === 'drag' && alone.drag.kind).toBe('node');
  });

  it('clicking a NON-member of a multi-selection falls through to the plain ladder', () => {
    const s = scene([rect(), rect({ id: 'r2', center: { x: 9.13, y: 6.41 } })]);
    const sel: Selection = { type: 'multi', objectIds: ['r1'], speakerIds: [] };
    const a = resolvePointerDown(at({ x: 9.13, y: 6.41 }, VIEW, { scene: s, selection: sel }));
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.drag.kind).toBe('move-rc');
    expect(a.selection).toEqual({ type: 'object', id: 'r2' });
  });

  it('a selected wall ENDPOINT beats the wall body, and only within its own tolerance', () => {
    const w = {
      id: 'w1',
      kind: 'wall' as const,
      a: { x: 1.13, y: 1.07 },
      b: { x: 7.13, y: 1.07 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.5,
    };
    const s = scene([w]);
    const sel: Selection = { type: 'object', id: 'w1' };
    // tol = 10/60 = 0.1667 m; the endpoint band is tol * 1.4 = 0.2333 m.
    const near = resolvePointerDown(at({ x: 1.13 + 0.2, y: 1.07 }, VIEW, { scene: s, selection: sel }));
    expect(near.kind === 'drag' && near.drag.kind).toBe('wall-end');
    if (near.kind === 'drag' && near.drag.kind === 'wall-end') expect(near.drag.end).toBe('a');

    // Just OUTSIDE the endpoint band but still on the wall: the BODY moves. A
    // fixture that only probes the far middle passes under either order.
    const past = resolvePointerDown(at({ x: 1.13 + 0.3, y: 1.07 }, VIEW, { scene: s, selection: sel }));
    expect(past.kind === 'drag' && past.drag.kind).toBe('move-wall');

    // The far endpoint is 'b'.
    const far = resolvePointerDown(at({ x: 7.13 - 0.2, y: 1.07 }, VIEW, { scene: s, selection: sel }));
    expect(far.kind === 'drag' && far.drag.kind === 'wall-end' && far.drag.end).toBe('b');
  });

  it('the wall-end grab needs the wall SELECTED — an unselected wall moves as a body', () => {
    const w = {
      id: 'w1',
      kind: 'wall' as const,
      a: { x: 1.13, y: 1.07 },
      b: { x: 7.13, y: 1.07 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.5,
    };
    const a = resolvePointerDown(
      at({ x: 1.13 + 0.05, y: 1.07 }, VIEW, { scene: scene([w]), selection: null }),
    );
    expect(a.kind === 'drag' && a.drag.kind).toBe('move-wall');
  });

  it('the active listener puck beats an object under it', () => {
    const s = scene([rect()], [], { x: 3.17, y: 2.23 });
    const a = resolvePointerDown(at({ x: 3.17, y: 2.23 }, VIEW, { scene: s }));
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.selection).toEqual({ type: 'listener' });
    expect(a.drag.kind === 'node' && a.drag.node).toBe('listener');
  });

  it('the pick tolerance is SCREEN px, so zooming OUT widens the grab in metres', () => {
    // `tol = 10 / view.scale` is the grab radius for the whole select ladder.
    // A fixed metric tolerance — the plausible "simplify away the view
    // dependency" edit — passed the whole suite, because only SMALLER
    // tolerances were caught anywhere. A two-scale straddle fixes that, the
    // same trick the opening tool's radius already uses.
    //
    // The wall ENDPOINT band is tol * 1.4: 0.233 m at scale 60, 1.167 m at 12.
    const w = {
      id: 'w1',
      kind: 'wall' as const,
      a: { x: 1.13, y: 1.07 },
      b: { x: 7.13, y: 1.07 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.5,
    };
    const s = scene([w]);
    const sel: Selection = { type: 'object', id: 'w1' };
    const p = { x: 1.13 + 0.6, y: 1.07 }; // outside the band at 60, inside at 12
    expect(resolvePointerDown(at(p, VIEW, { scene: s, selection: sel })).kind === 'drag').toBe(true);
    const near = resolvePointerDown(at(p, VIEW, { scene: s, selection: sel }));
    expect(near.kind === 'drag' && near.drag.kind).toBe('move-wall');
    const far = resolvePointerDown(at(p, { ...VIEW, scale: 12 }, { scene: s, selection: sel }));
    expect(far.kind === 'drag' && far.drag.kind).toBe('wall-end');
  });

  it('an inactive SEAT is tested BELOW the active puck — the pod wins', () => {
    // Unpinned: moving the whole seat block above `hitTestNodes` passed. That
    // silently switches the app from "drag the pod" to "activate and drag the
    // seat" wherever the two overlap — the same class as the grip-vs-pod
    // ordering this file goes to real trouble over.
    const shared = { x: 6.37, y: 4.13 };
    let s = scene([], [spk('s1', shared)]);
    s = addListener(s, 'Bed', shared);
    s = setActiveListener(s, s.listeners![0].id); // the seat ON the pod is inactive
    const seatOnPod = s.listeners!.find((l) => l.name === 'Bed')!;

    const a = resolvePointerDown(at(shared, VIEW, { scene: s }));
    expect(a.kind).toBe('drag');
    if (a.kind !== 'drag') throw new Error('unreachable');
    expect(a.selection).toEqual({ type: 'speaker', id: 's1' });
    expect(a.activateSeat).toBeUndefined();

    // Non-vacuous: with the pod gone, the SAME point activates that seat.
    const noPod = scene([], []);
    let s2 = addListener(noPod, 'Bed', shared);
    s2 = setActiveListener(s2, s2.listeners![0].id);
    const b = resolvePointerDown(at(shared, VIEW, { scene: s2 }));
    expect(b.kind === 'drag' && b.activateSeat).toBe(
      s2.listeners!.find((l) => l.name === 'Bed')!.id,
    );
    expect(seatOnPod.id).toBeTruthy();
  });

  it('empty space deselects', () => {
    const a = resolvePointerDown(at({ x: 40, y: 40 }, VIEW, { scene: scene([rect()]) }));
    expect(a).toEqual({ kind: 'select', selection: null });
  });

  it('the node grab radius is NODE_RADIUS, not the view tolerance, when zoomed in', () => {
    // `hitTestNodes` uses max(NODE_RADIUS, tol). At scale 60 tol is 0.167 m, so
    // NODE_RADIUS 0.24 wins and a click 0.2 m off the pod still grabs it.
    const s = scene([], [spk('s1', { x: 5, y: 5 })]);
    expect(10 / VIEW.scale).toBeLessThan(NODE_RADIUS);
    const a = resolvePointerDown(at({ x: 5.2, y: 5 }, VIEW, { scene: s }));
    expect(a.kind === 'drag' && a.selection).toEqual({ type: 'speaker', id: 's1' });
  });
});

// ---------------------------------------------------------------------------
// The drag records, asserted through the REAL consumer.
// ---------------------------------------------------------------------------

describe('the emitted Drag records actually work', () => {
  const OPTS = { snapOn: false, shiftKey: false, altKey: false, lastRot: null };

  it('move-multi moves EVERY member by the same delta — walls included', () => {
    // The snapshot gives a wall {id,a,b} and everything else {id,center}. If a
    // wall were snapshotted as {id, center: undefined}, `applyDragToScene` would
    // leave it stationary while the rest of the group moved — and a test that
    // hand-builds the record (as drag-apply.test.ts must) cannot see it.
    const w = {
      id: 'w1',
      kind: 'wall' as const,
      a: { x: 1.13, y: 1.07 },
      b: { x: 7.13, y: 1.07 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.5,
    };
    const s = scene([w, rect()], [spk('s1', { x: 12.37, y: 3.71 })]);
    const sel: Selection = { type: 'multi', objectIds: ['w1', 'r1'], speakerIds: ['s1'] };
    const grab = { x: 3.17, y: 2.23 };
    const a = resolvePointerDown(at(grab, VIEW, { scene: s, selection: sel }));
    if (a.kind !== 'drag') throw new Error('unreachable');

    const to = { x: grab.x + 1.37, y: grab.y - 0.83 };
    const res = applyDragToScene(s, a.drag, to, OPTS);
    expect(res).not.toBeNull();
    const next = res!.scene;

    // ⚠️ `move-multi` snaps the DELTA unconditionally — it never reads `snapOn`
    // (drag-apply.ts:137-143), so a group move quantises to 5 cm even with the
    // app's Snap setting OFF. That is pre-existing and out of scope here, but it
    // is why the expected delta is 1.35 / -0.85 and not 1.37 / -0.83. Filed.
    const d = { x: 1.35, y: -0.85 };

    // The property that matters is that EVERY member moved by the SAME delta.
    // A wall snapshotted as {id, center: undefined} would sit still while the
    // rest of the group moved, and `drag-apply.test.ts` cannot see that because
    // it hand-builds the record with `a`/`b` already present.
    const nw = next.objects.find((o) => o.id === 'w1')!;
    if (nw.kind !== 'wall') throw new Error('unreachable');
    expect(nw.a.x).toBeCloseTo(1.13 + d.x, 9);
    expect(nw.a.y).toBeCloseTo(1.07 + d.y, 9);
    expect(nw.b.x).toBeCloseTo(7.13 + d.x, 9);
    expect(nw.b.y).toBeCloseTo(1.07 + d.y, 9);
    const nr = next.objects.find((o) => o.id === 'r1')!;
    if (nr.kind !== 'rect') throw new Error('unreachable');
    expect(nr.center.x).toBeCloseTo(3.17 + d.x, 9);
    expect(nr.center.y).toBeCloseTo(2.23 + d.y, 9);
    expect(next.speakers[0].pos.x).toBeCloseTo(12.37 + d.x, 9);
    expect(next.speakers[0].pos.y).toBeCloseTo(3.71 + d.y, 9);

    // …and the fixture is OFF-GRID on purpose. Every origin here is off the
    // 0.05 grid, so snapping the delta and snapping each piece give DIFFERENT
    // answers — an on-grid fixture makes the two arithmetically identical and
    // cannot express the bug at all (the S37 lesson, verbatim).
    expect((1.13 / SNAP_STEP) % 1).not.toBeCloseTo(0, 6);
    expect((3.17 / SNAP_STEP) % 1).not.toBeCloseTo(0, 6);
  });

  it('move-rc keeps c0 and start DISTINCT — an off-centre grab does not teleport', () => {
    // ⚠️ The grab point must NOT be the object's centre. It was, and `c0` and
    // `start` then hold the same value, so `c0: p` and `start: o.center` both
    // passed. `drag-apply` computes `v.add(drag.c0, p - drag.start)`, so `c0: p`
    // teleports the centre under the pointer on the very first pointermove —
    // in the app's most-used gesture.
    const s = scene([rect()]);
    const grab = { x: 4.11, y: 2.93 }; // inside the sofa, 1.10 m off its centre
    const a = resolvePointerDown(at(grab, VIEW, { scene: s }));
    if (a.kind !== 'drag' || a.drag.kind !== 'move-rc') throw new Error('unreachable');
    expect(a.drag.rot0).toBe(MAPLE);
    expect(a.drag.c0).toEqual({ x: 3.17, y: 2.23 });
    expect(a.drag.start).toEqual(grab);
    expect(a.drag.c0).not.toEqual(a.drag.start);

    // The object moves by the pointer DELTA, keeping the grab offset — it does
    // not jump to the pointer.
    const to = { x: grab.x + 1.35, y: grab.y - 0.85 };
    const moved = applyDragToScene(s, a.drag, to, OPTS)!.scene.objects.find((o) => o.id === 'r1')!;
    if (moved.kind !== 'rect') throw new Error('unreachable');
    expect(moved.center.x).toBeCloseTo(3.17 + 1.35, 9);
    expect(moved.center.y).toBeCloseTo(2.23 - 0.85, 9);
    expect(moved.rotation).toBe(MAPLE);
  });

  it('move-wall carries a0/b0 the right way round — asserted through the engine', () => {
    // The one drag kind this file's own discipline was never applied to: three
    // tests reached the branch and all asserted only `drag.kind`. Swapping
    // `a0`/`b0` flips the wall end-for-end on the first pointermove and passed.
    const w = {
      id: 'w1',
      kind: 'wall' as const,
      a: { x: 1.13, y: 1.07 },
      b: { x: 7.13, y: 3.41 },
      absorption: 0.12,
      label: 'Wall',
      height: 2.5,
    };
    const s = scene([w]);
    const grab = { x: 4.13, y: 2.24 }; // on the wall, off both endpoints
    const a = resolvePointerDown(at(grab, VIEW, { scene: s }));
    if (a.kind !== 'drag' || a.drag.kind !== 'move-wall') throw new Error('unreachable');

    const to = { x: grab.x + 1.35, y: grab.y - 0.85 };
    const moved = applyDragToScene(s, a.drag, to, OPTS)!.scene.objects.find((o) => o.id === 'w1')!;
    if (moved.kind !== 'wall') throw new Error('unreachable');
    expect(moved.a.x).toBeCloseTo(1.13 + 1.35, 9);
    expect(moved.a.y).toBeCloseTo(1.07 - 0.85, 9);
    expect(moved.b.x).toBeCloseTo(7.13 + 1.35, 9);
    expect(moved.b.y).toBeCloseTo(3.41 - 0.85, 9);
    // Non-vacuous: the wall is ASYMMETRIC, so a swap is visible. An axis-aligned
    // wall centred on its grab point could not express it.
    expect(w.a).not.toEqual(w.b);
  });

  it('a CIRCLE gets rot0 = 0 — it has no rotation field to read', () => {
    const s = scene([
      { id: 'c1', kind: 'circle', center: { x: 3.17, y: 2.23 }, r: 0.8, absorption: 0.3, label: 'Table', height: 0.75 },
    ]);
    const a = resolvePointerDown(at({ x: 3.17, y: 2.23 }, VIEW, { scene: s }));
    expect(a.kind === 'drag' && a.drag.kind === 'move-rc' && a.drag.rot0).toBe(0);
  });

  it('the pan record moves the view by the SCREEN delta', () => {
    const a = resolvePointerDown(at({ x: 1, y: 1 }, VIEW_ROT, { button: 1 }));
    if (a.kind !== 'drag' || a.drag.kind !== 'pan') throw new Error('unreachable');
    // The recorded origin must be the screen point, and the view origin the
    // CURRENT one — a pan seeded from world metres jumps the plan on mousedown.
    expect(a.drag.sx).toBeCloseTo(worldToScreen({ x: 1, y: 1 }, VIEW_ROT).x, 9);
    expect(a.drag.ox).toBe(VIEW_ROT.ox);
    expect(a.drag.oy).toBe(VIEW_ROT.oy);
  });

  it('grabAngle is measured in WORLD space — and only a ROTATED view can tell', () => {
    // At rot 0, atan2 over world and over screen deltas is BIT-identical, so an
    // implementation that used screen coordinates passes every rot-0 fixture.
    // At rot 0.7 the two differ by exactly 0.7 rad.
    const f = (() => {
      const r = rect({ w: 4, h: 2.4 });
      const s0 = scene([r]);
      const t = handleTargetFor(s0, { type: 'object', id: 'r1' }, { mode: 'select', overlayOpen: false })!;
      const g = handlesFor(t, VIEW_ROT).find((x) => x.id === 'rot')!;
      return { scene: s0, target: t, world: screenToWorld(g.at, VIEW_ROT) };
    })();
    const a = resolvePointerDown(
      at(f.world, VIEW_ROT, {
        scene: f.scene,
        selection: { type: 'object', id: 'r1' },
        handleTarget: f.target,
      }),
    );
    if (a.kind !== 'drag' || a.drag.kind !== 'handle') throw new Error('unreachable');
    const c = f.target.center;
    const world = Math.atan2(f.world.y - c.y, f.world.x - c.x);
    const cScreen = worldToScreen(c, VIEW_ROT);
    const gScreen = worldToScreen(f.world, VIEW_ROT);
    const screen = Math.atan2(gScreen.y - cScreen.y, gScreen.x - cScreen.x);
    expect(a.drag.grabAngle).toBeCloseTo(world, 12);
    // The fixture is only meaningful because the two answers genuinely differ.
    expect(Math.abs(screen - world)).toBeGreaterThan(0.5);
  });

  it('the handle record carries the object as obj0, not its id', () => {
    const r = rect({ w: 4, h: 2.4 });
    const s = scene([r]);
    const t = handleTargetFor(s, { type: 'object', id: 'r1' }, { mode: 'select', overlayOpen: false })!;
    const g = handlesFor(t, VIEW).find((x) => x.id === 'ne')!;
    const a = resolvePointerDown(
      at(screenToWorld(g.at, VIEW), VIEW, {
        scene: s,
        selection: { type: 'object', id: 'r1' },
        handleTarget: t,
      }),
    );
    if (a.kind !== 'drag' || a.drag.kind !== 'handle') throw new Error('unreachable');
    expect(a.drag.obj0).toBe(t);
    expect(a.drag.handle).toBe('ne');
  });
});

// ---------------------------------------------------------------------------
// applyPickAction — the effect ORDER
// ---------------------------------------------------------------------------

describe('applyPickAction', () => {
  function spies() {
    const calls: string[] = [];
    const rec =
      <T extends unknown[]>(name: string) =>
      (...a: T) => {
        calls.push(name);
        void a;
      };
    const fx: PickEffects = {
      setBand: vi.fn(rec('setBand')),
      activateSeat: vi.fn(rec('activateSeat')),
      select: vi.fn(rec('select')),
      startDrag: vi.fn(rec('startDrag')),
      placeSpeaker: vi.fn(rec('placeSpeaker')),
      chainPoint: vi.fn(rec('chainPoint')),
      setCalibFirst: vi.fn(rec('setCalibFirst')),
      calibrate: vi.fn(rec('calibrate')),
      insertOpening: vi.fn(rec('insertOpening')),
      notice: vi.fn(rec('notice')),
    };
    return { fx, calls };
  }

  const someDrag: Drag = { kind: 'node', pointerId: 1, node: 'listener' };

  it('THE ORDER THAT MATTERS: activateSeat runs BEFORE startDrag', () => {
    // Not cosmetic and INVISIBLE in the final scene: `onActivateSeat` writes the
    // scene while the drag's coalescing group is still closed, so the seat switch
    // is its own undo entry. Start the drag first and one ⌘Z undoes both.
    const { fx, calls } = spies();
    applyPickAction(
      { kind: 'drag', drag: someDrag, activateSeat: 'seat2', selection: { type: 'listener' } },
      fx,
    );
    expect(calls).toEqual(['activateSeat', 'select', 'startDrag']);
  });

  it('the band origin is seeded BEFORE the drag begins', () => {
    const { fx, calls } = spies();
    applyPickAction(
      {
        kind: 'drag',
        drag: { kind: 'band', pointerId: 1, shape: 'marquee', additive: false },
        bandOrigin: { x: 4, y: 5 },
      },
      fx,
    );
    expect(calls).toEqual(['setBand', 'startDrag']);
    expect(fx.setBand).toHaveBeenCalledWith([{ x: 4, y: 5 }]);
  });

  it('a drag with no selection does NOT call select — undefined means leave it alone', () => {
    const { fx, calls } = spies();
    applyPickAction({ kind: 'drag', drag: someDrag }, fx);
    expect(calls).toEqual(['startDrag']);
  });

  it('…but an explicit null selection DOES deselect', () => {
    const { fx } = spies();
    applyPickAction({ kind: 'select', selection: null }, fx);
    expect(fx.select).toHaveBeenCalledWith(null);
  });

  it('calibrate-finish CLEARS the stored first click before measuring', () => {
    // Otherwise a third click resumes a measurement that has already been taken.
    const { fx, calls } = spies();
    applyPickAction({ kind: 'calibrate-finish', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }, fx);
    expect(calls).toEqual(['setCalibFirst', 'calibrate']);
    expect(fx.setCalibFirst).toHaveBeenCalledWith(null);
  });

  it('`none` causes nothing at all', () => {
    const { fx, calls } = spies();
    applyPickAction({ kind: 'none' }, fx);
    expect(calls).toEqual([]);
  });

  it('every action kind is handled — no silent fallthrough', () => {
    const all: PickAction[] = [
      { kind: 'none' },
      { kind: 'drag', drag: someDrag },
      { kind: 'select', selection: null },
      { kind: 'place-speaker', at: { x: 1, y: 1 } },
      { kind: 'chain-point', at: { x: 1, y: 1 } },
      { kind: 'calibrate-start', at: { x: 1, y: 1 } },
      { kind: 'calibrate-finish', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      {
        kind: 'insert-opening',
        wall: { id: 'w', kind: 'wall', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, absorption: 0.1, label: 'W', height: 2.5 },
        at: { x: 1, y: 0 },
        role: 'door',
      },
      { kind: 'notice', message: 'x' },
    ];
    for (const act of all) {
      const { fx, calls } = spies();
      applyPickAction(act, fx);
      // Only 'none' is allowed to do nothing.
      expect(calls.length === 0).toBe(act.kind === 'none');
    }
  });
});
