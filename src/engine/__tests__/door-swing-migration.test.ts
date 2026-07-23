import { describe, expect, it } from 'vitest';
import { sanitizeScene } from '../scene';
import { traceScene } from '../raytrace';
import { computeAudio } from '../stereo';
import type { RectObj } from '../types';

/**
 * S17 — door swing migration. An OLD-shape saved door (no swing fields) must read
 * back with additive defaults that reproduce its prior behaviour (hinge 'start',
 * side 'in', 90°), every existing field untouched, and acoustics identical to a
 * fresh swingDeg=90 door (swing is render-only — the engine never reads it).
 *
 * Uses the established `sanitizeScene({objects,speakers,listener})` seeding idiom
 * (hardening.test.ts) so this exercises the REAL load path, not a fresh fixture.
 */

const oldDoor = {
  id: 'door-1',
  kind: 'rect',
  role: 'door',
  center: { x: 3, y: 0 },
  w: 0.9,
  h: 0.1,
  rotation: 0,
  absorption: 0.25,
  label: 'Door',
  doorOpen: true,
  height: 2.05,
};

const seedOne = (obj: object): RectObj =>
  sanitizeScene({
    objects: [obj],
    speakers: [],
    listener: { pos: { x: 0, y: 0 }, z: 1.2 },
  })!.objects[0] as RectObj;

describe('door swing migration (old-shape door → additive defaults)', () => {
  it('injects swing defaults and preserves every existing field', () => {
    const d = seedOne(oldDoor);
    // NEW additive fields.
    expect(d.swingDeg).toBe(90);
    expect(d.hingeEnd).toBe('start');
    expect(d.swingSide).toBe('in');
    // NOTHING else changed.
    expect(d.role).toBe('door');
    expect(d.doorOpen).toBe(true); // normalisation untouched
    expect(d.w).toBe(0.9);
    expect(d.h).toBeCloseTo(0.1);
    expect(d.rotation).toBe(0);
    expect(d.absorption).toBeCloseTo(0.25);
    expect(d.label).toBe('Door');
    expect(d.height).toBeCloseTo(2.05);
    expect(d.center).toEqual({ x: 3, y: 0 });
    expect(d.id).toBe('door-1');
  });

  it('clamps a hostile swingDeg finite and rejects junk enums to defaults', () => {
    const bad = seedOne({ ...oldDoor, swingDeg: 1e308, hingeEnd: 'x', swingSide: 9 });
    expect(bad.swingDeg).toBe(180); // clamped to the upper bound, finite
    expect(Number.isFinite(bad.swingDeg!)).toBe(true);
    expect(bad.hingeEnd).toBe('start');
    expect(bad.swingSide).toBe('in');
  });

  it('clamps a negative swingDeg to 0 and honours valid enum values', () => {
    const d = seedOne({ ...oldDoor, swingDeg: -5, hingeEnd: 'end', swingSide: 'out' });
    expect(d.swingDeg).toBe(0);
    expect(d.hingeEnd).toBe('end');
    expect(d.swingSide).toBe('out');
  });

  it('leaves swing fields undefined on non-door rects (windows/furniture)', () => {
    const win = seedOne({ ...oldDoor, id: 'w1', role: 'window', doorOpen: undefined });
    expect(win.role).toBe('window');
    expect(win.swingDeg).toBeUndefined();
    expect(win.hingeEnd).toBeUndefined();
    expect(win.swingSide).toBeUndefined();

    const furn = seedOne({ ...oldDoor, id: 'f1', role: undefined, doorOpen: undefined });
    expect(furn.role).toBe('furniture');
    expect(furn.swingDeg).toBeUndefined();
    expect(furn.hingeEnd).toBeUndefined();
    expect(furn.swingSide).toBeUndefined();
  });

  it('acoustics are identical to a fresh swingDeg=90 door (swing is render-only)', () => {
    const migrated = sanitizeScene({
      objects: [oldDoor], // NO swing fields on input
      speakers: [],
      listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    })!;
    const fresh = sanitizeScene({
      objects: [{ ...oldDoor, swingDeg: 90, hingeEnd: 'start', swingSide: 'in' }],
      speakers: [],
      listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    })!;
    const rc = 360;
    const mb = 3;
    const aM = computeAudio(migrated, traceScene(migrated, rc, mb), false);
    const aF = computeAudio(fresh, traceScene(fresh, rc, mb), false);
    expect(aM).toEqual(aF); // byte-equal metrics: the engine never reads swing
  });
});
