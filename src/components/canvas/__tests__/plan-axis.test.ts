/**
 * `planAxis` — the rotation a NEWLY CREATED object should arrive at.
 *
 * Both creation paths hardcoded `rotation: 0`, so on a plan that is not square
 * to the world every new rect arrived crooked and had to be fixed by hand before
 * the S23 drag magnet could even be reached. The magnet only fires within
 * `WALL_ALIGN_GAP_M` of a wall, so a piece dropped in the middle of a room was
 * never corrected at all.
 *
 * The answer has to be the PLAN's axis, not the nearest wall's, for exactly that
 * reason — the middle of a room has no nearest wall.
 */
import { describe, expect, it } from 'vitest';
import { planAxis } from '../placement';
import type { SceneObject } from '../../../engine/types';

const DEG = Math.PI / 180;

let seq = 0;
function wall(ax: number, ay: number, bx: number, by: number): SceneObject {
  seq += 1;
  return {
    id: `w${seq}`,
    kind: 'wall',
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    absorption: 0.12,
    label: 'Wall',
    height: 2.4,
  };
}

/** A rectangular shell rotated by `deg` about the origin. */
function shell(deg: number, w = 8, h = 6): SceneObject[] {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const rot = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const corners: Array<[number, number]> = [
    rot(0, 0),
    rot(w, 0),
    rot(w, h),
    rot(0, h),
  ];
  return corners.map((p, i) => {
    const q = corners[(i + 1) % corners.length];
    return wall(p[0], p[1], q[0], q[1]);
  });
}

/** Fold into (-45, 45] degrees — how far the object is actually turned. */
const deg = (rad: number) => (rad / DEG);

describe('planAxis', () => {
  it('returns null when the scene has no walls at all, so the caller keeps 0', () => {
    expect(planAxis([])).toBeNull();
  });

  it('returns null when the only "walls" are degenerate or non-finite', () => {
    expect(planAxis([wall(1, 1, 1, 1)])).toBeNull();
    expect(planAxis([wall(0, 0, Number.NaN, 4)])).toBeNull();
    expect(planAxis([wall(0, 0, Infinity, 0)])).toBeNull();
  });

  it('is 0 on a plan already square to the world', () => {
    expect(deg(planAxis(shell(0)) as number)).toBeCloseTo(0, 4);
  });

  /**
   * THE CASE THAT MOTIVATED THIS. The owner's plan is not square to the world,
   * and a sofa dropped on it used to land at world 0.
   */
  it('follows a plan rotated off-square', () => {
    for (const d of [7, 13, 22, 31, 44]) {
      expect(deg(planAxis(shell(d)) as number), `${d} deg plan`).toBeCloseTo(d, 3);
    }
  });

  /**
   * A quarter turn maps a rectangular grid onto itself, so the honest answer for
   * an 80-degree plan is MINUS TEN — the smallest turn that aligns the piece.
   * Returning +80 would align it just as well and arrive visibly sideways, with
   * the palette's `w` and `h` swapped on screen.
   */
  it('picks the SMALLEST turn that aligns, so an 80 degree plan gives -10, not +80', () => {
    expect(deg(planAxis(shell(80)) as number)).toBeCloseTo(-10, 3);
    expect(deg(planAxis(shell(89)) as number)).toBeCloseTo(-1, 3);
    expect(deg(planAxis(shell(46)) as number)).toBeCloseTo(-44, 3);
  });

  it('never returns a turn larger than a quarter turn either way', () => {
    for (let d = 0; d < 180; d += 3) {
      const a = deg(planAxis(shell(d)) as number);
      expect(Math.abs(a), `${d} deg plan gave ${a}`).toBeLessThanOrEqual(45.001);
    }
  });

  it('ignores everything that is not a wall', () => {
    const furniture: SceneObject = {
      id: 'r1',
      kind: 'rect',
      center: { x: 3, y: 3 },
      w: 2,
      h: 1,
      rotation: 40 * DEG,
      absorption: 0.3,
      label: 'Sofa',
      role: 'furniture',
      height: 0.8,
    };
    expect(planAxis([furniture])).toBeNull();
    // ...and a rotated piece of furniture must not drag the plan's own axis.
    expect(deg(planAxis([...shell(13), furniture]) as number)).toBeCloseTo(13, 3);
  });

  /**
   * LENGTH-WEIGHTED, not one-wall-one-vote. A real plan has a dominant envelope
   * plus a few odd stubs; the envelope has to win.
   */
  it('lets a long dominant envelope outvote several short odd walls', () => {
    const odd = [
      wall(0.2, 0.2, 0.5, 0.6),
      wall(1.0, 0.2, 1.3, 0.6),
      wall(2.0, 0.2, 2.3, 0.6),
    ];
    expect(deg(planAxis([...shell(18), ...odd]) as number)).toBeCloseTo(18, 1);
  });

  it('is unchanged by reversing a wall\'s endpoints — a wall has no direction', () => {
    const forward = shell(23);
    const reversed = forward.map((o) =>
      o.kind === 'wall' ? { ...o, a: o.b, b: o.a } : o,
    );
    expect(planAxis(reversed) as number).toBeCloseTo(planAxis(forward) as number, 9);
  });
});
