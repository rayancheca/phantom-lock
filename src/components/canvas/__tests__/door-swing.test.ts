import { describe, expect, it } from 'vitest';
import type { RectObj } from '../../../engine/types';
import { doorSwing } from '../door-swing';

/**
 * S17 — the pure hinge/side → swing-angle math extracted out of render.ts.
 *
 * Asserts the ACTUAL resolved angle (the TRAP-5 discipline: a drawn arc that
 * LOOKS like it swings but is really the old hardcoded 69.23° = Math.PI/2.6 is a
 * lie). The default door (hinge 'start', side 'in', 90°) must resolve to
 * `along − π/2`, NOT `along − π/2.6`.
 */

const HALF_PI = Math.PI / 2;
const OLD_CONSTANT = Math.PI / 2.6; // 69.23° — the pre-S17 magic literal

/** A door lying flat along +x: rotation 0, width 0.9, centred at (3,0). */
function door(fields: Partial<RectObj>): RectObj {
  return {
    id: 'd',
    kind: 'rect',
    center: { x: 3, y: 0 },
    w: 0.9,
    h: 0.1,
    rotation: 0,
    absorption: 0.25,
    label: 'Door',
    role: 'door',
    doorOpen: true,
    height: 2.05,
    ...fields,
  };
}

describe('doorSwing', () => {
  it('default (start/in/90) resolves to along − π/2 — the standardised 90°, not 69.23°', () => {
    const s = doorSwing(door({ swingDeg: 90, hingeEnd: 'start', swingSide: 'in' }));
    expect(s.alongAngle).toBeCloseTo(0); // hinge→latch runs along +x
    expect(s.leafAngle).toBeCloseTo(-HALF_PI);
    expect(s.leafAngle).not.toBeCloseTo(-OLD_CONSTANT); // the old look is gone
    expect(s.hingeWorld).toEqual({ x: 2.55, y: 0 }); // the a-ward jamb midpoint
    expect(s.radiusM).toBe(0.9); // leaf length = the clear opening width
    expect(s.swingDeg).toBe(90);
  });

  it('swingSide "out" flips the leaf to the other side', () => {
    const s = doorSwing(door({ swingDeg: 90, hingeEnd: 'start', swingSide: 'out' }));
    expect(s.leafAngle).toBeCloseTo(HALF_PI);
  });

  it('hingeEnd "end" moves the hinge to the opposite jamb and reverses along', () => {
    const s = doorSwing(door({ swingDeg: 90, hingeEnd: 'end', swingSide: 'in' }));
    expect(s.hingeWorld).toEqual({ x: 3.45, y: 0 }); // the b-ward jamb midpoint
    expect(s.alongAngle).toBeCloseTo(Math.PI); // hinge→latch now points −x
    expect(s.leafAngle).toBeCloseTo(Math.PI - HALF_PI); // = π/2
  });

  it('defaults are applied when the fields are absent (migration safety)', () => {
    const s = doorSwing(door({ swingDeg: undefined, hingeEnd: undefined, swingSide: undefined }));
    expect(s.swingDeg).toBe(90);
    expect(s.leafAngle).toBeCloseTo(-HALF_PI);
    expect(s.hingeWorld).toEqual({ x: 2.55, y: 0 });
  });

  it('clamps swingDeg to [0,180]', () => {
    expect(doorSwing(door({ swingDeg: 270 })).swingDeg).toBe(180);
    expect(doorSwing(door({ swingDeg: -5 })).swingDeg).toBe(0);
    expect(doorSwing(door({ swingDeg: 0 })).leafAngle).toBeCloseTo(0); // 0° → leaf lies along the wall
  });

  it('tracks the door rotation (a wall at 90°) so the leaf stays on the wall', () => {
    const s = doorSwing(door({ rotation: HALF_PI, swingDeg: 90, hingeEnd: 'start', swingSide: 'in' }));
    // width axis now runs along +y, so hinge→latch points +y (along ≈ π/2).
    expect(s.alongAngle).toBeCloseTo(HALF_PI);
    expect(s.leafAngle).toBeCloseTo(0); // π/2 − π/2
  });

  it('exposes the latch jamb midpoint (the opening’s other end)', () => {
    expect(doorSwing(door({ hingeEnd: 'start' })).latchWorld).toEqual({ x: 3.45, y: 0 });
    expect(doorSwing(door({ hingeEnd: 'end' })).latchWorld).toEqual({ x: 2.55, y: 0 });
  });

  it('orders the clearance arc as the MINOR wedge in BOTH swing directions', () => {
    // The reflex-arc bug: arc(leafAngle, alongAngle, false) draws 360−swingDeg
    // when the leaf swings 'out'. arcStart..arcEnd must always span exactly the
    // swing angle, never its reflex.
    for (const side of ['in', 'out'] as const) {
      for (const deg of [45, 90, 135, 180]) {
        const s = doorSwing(door({ swingDeg: deg, swingSide: side }));
        expect(s.arcEnd - s.arcStart).toBeCloseTo((deg * Math.PI) / 180, 6);
        expect(s.arcStart).toBeLessThanOrEqual(s.arcEnd);
      }
    }
  });
});
