import type { RectObj, Vec2 } from '../../engine/types';
import { rectCorners } from '../../engine/geometry';
import * as v from '../../engine/vec';

/**
 * The door plan-symbol geometry (S17), extracted DOM-free out of `render.ts` so
 * the hinge/side/angle math is node-testable and render.ts stays logic-thin.
 *
 * PLAN SYMBOL ONLY — nothing here touches acoustics; the engine never reads a
 * swing field (see `docs/sessions/S17/design-pass.md`, acoustics verdict).
 *
 * The defaults reproduce the pre-S17 look EXACTLY except the leaf magnitude: the
 * old render used `along − Math.PI/2.6` (69.23°) off the a-ward jamb; `hingeEnd:
 * 'start'` + `swingSide: 'in'` map to that same jamb + the same (subtract)
 * direction, so a migrated door only opens the standardised 90° instead of the
 * arbitrary 69.23°.
 */
export interface DoorSwing {
  /** World-space hinge jamb midpoint (the pivot of the leaf + arc). */
  hingeWorld: Vec2;
  /** World-space latch jamb midpoint (the opening's other end). */
  latchWorld: Vec2;
  /** World radians, hinge → latch jamb (the door lying flush in the wall). */
  alongAngle: number;
  /** World radians of the swung leaf. */
  leafAngle: number;
  /**
   * The clearance arc's [start, end] in world radians, ORDERED so a canvas
   * `ctx.arc(cx, cy, r, arcStart, arcEnd, false)` sweeps the MINOR (swingDeg)
   * wedge in both swing directions. Because `|leafAngle − alongAngle| = swingRad
   * ≤ π`, taking min/max keeps the sweep at exactly the swing angle — the naive
   * `arc(leafAngle, alongAngle, false)` draws a `360 − swingDeg` reflex arc when
   * the leaf swings the 'out' way (leafAngle > alongAngle).
   */
  arcStart: number;
  arcEnd: number;
  /** Leaf length in metres — equals the clear opening width `o.w`. */
  radiusM: number;
  /** The resolved, clamped swing angle in degrees, [0,180]. */
  swingDeg: number;
}

export function doorSwing(o: RectObj): DoorSwing {
  // rectCorners local order: c0=(-hw,-hh) c1=(hw,-hh) c2=(hw,hh) c3=(-hw,hh),
  // so c0/c3 share the a-ward (−w/2) end of the width axis, c1/c2 the b-ward end.
  const c = rectCorners(o);
  const hingeEnd = o.hingeEnd ?? 'start';
  const swingSide = o.swingSide ?? 'in';
  const swingDeg = Math.max(0, Math.min(180, o.swingDeg ?? 90));
  const hMid = hingeEnd === 'end' ? v.lerp(c[1], c[2], 0.5) : v.lerp(c[0], c[3], 0.5);
  const lMid = hingeEnd === 'end' ? v.lerp(c[0], c[3], 0.5) : v.lerp(c[1], c[2], 0.5);
  const alongAngle = Math.atan2(lMid.y - hMid.y, lMid.x - hMid.x);
  // 'in' = the pre-S17 subtract direction; 'out' = the opposite.
  const swingRad = ((swingDeg * Math.PI) / 180) * (swingSide === 'out' ? 1 : -1);
  const leafAngle = alongAngle + swingRad;
  return {
    hingeWorld: hMid,
    latchWorld: lMid,
    alongAngle,
    leafAngle,
    // Order the arc so a canvas `ctx.arc(…, false)` sweeps the MINOR wedge in
    // BOTH swing directions. |leafAngle − alongAngle| = |swingRad| ≤ π, so
    // min→max is always the swingDeg wedge — vs. the reflex (360 − swingDeg) arc
    // the naive leaf→along order draws when the leaf swings the 'out' way.
    arcStart: Math.min(leafAngle, alongAngle),
    arcEnd: Math.max(leafAngle, alongAngle),
    radiusM: o.w,
    swingDeg,
  };
}
