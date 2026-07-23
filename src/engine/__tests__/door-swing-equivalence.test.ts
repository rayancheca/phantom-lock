import { describe, expect, it } from 'vitest';
import { traceScene } from '../raytrace';
import { computeAudio } from '../stereo';
import { bestListeningSpot } from '../bestspot';
import type { RectObj, Scene, SpeakerObj, WallObj } from '../types';

/**
 * S17 — the swing-invariance guard. This is NOT a RED-first test for new
 * behaviour (that lives in door-swing.test.ts); its forever-job is to prove the
 * FROZEN ENGINE stays blind to `swingDeg`/`hingeEnd`/`swingSide`. Two doors that
 * differ ONLY in swing must yield byte-identical `traceScene` / `computeAudio` /
 * `bestListeningSpot` output, OPEN and CLOSED.
 *
 * The door is placed in an INTERIOR PARTITION between the speakers and the seat,
 * so it is genuinely acoustically active — an open door lets the pair through,
 * a closed one occludes it. That makes swing-invariance a real result, not a
 * vacuous one, and it gives the NEGATIVE CONTROL below (toggle `doorOpen` ⇒ the
 * output MUST move) a genuine acoustic change to detect — the S8
 * negative-control discipline that proves the equality assertions mean something.
 * A geometry-equality guard pins `w/h/rotation/center` so a future dev who folds
 * swing into `w` (its double-duty as the drawn radius) is caught.
 */

const RC = 180;
const MB = 3;

const wall = (id: string, a: WallObj['a'], b: WallObj['b']): WallObj => ({
  id,
  kind: 'wall',
  a,
  b,
  absorption: 0.12,
  label: 'Wall',
  height: 2.7,
});

const spk = (id: string, x: number, y: number): SpeakerObj => ({
  id,
  pos: { x, y },
  z: 1.0,
  label: id,
  model: 'homepod',
  trimDb: 0,
});

interface SwingFields {
  swingDeg: number;
  hingeEnd: 'start' | 'end';
  swingSide: 'in' | 'out';
}

/** A 4×5 room split by a partition at y=2.5 with a door in the gap; the stereo
 *  pair is above the partition, the seat below, so the door is on the pair's
 *  direct paths (open ⇒ passes, closed ⇒ occludes). */
function makeScene(swing: SwingFields, open: boolean): Scene {
  const door: RectObj = {
    id: 'door-1',
    kind: 'rect',
    center: { x: 2, y: 2.5 },
    w: 0.9,
    h: 0.1,
    rotation: 0,
    absorption: 0.25,
    label: 'Door',
    role: 'door',
    doorOpen: open,
    height: 2.05,
    ...swing,
  };
  return {
    objects: [
      wall('w-top', { x: 0, y: 0 }, { x: 4, y: 0 }),
      wall('w-right', { x: 4, y: 0 }, { x: 4, y: 5 }),
      wall('w-bottom', { x: 4, y: 5 }, { x: 0, y: 5 }),
      wall('w-left', { x: 0, y: 5 }, { x: 0, y: 0 }),
      wall('part-l', { x: 0, y: 2.5 }, { x: 1.5, y: 2.5 }),
      wall('part-r', { x: 2.5, y: 2.5 }, { x: 4, y: 2.5 }),
      door,
    ],
    speakers: [spk('L', 1.2, 0.6), spk('R', 2.8, 0.6)],
    pairs: [['L', 'R']],
    listener: { pos: { x: 2, y: 4.2 }, z: 1.2 },
    listeners: [{ id: 'seat-1', name: 'Seat', pos: { x: 2, y: 4.2 }, z: 1.2 }],
    activeListenerId: 'seat-1',
  };
}

describe('door swing is acoustically inert (frozen engine never reads it)', () => {
  for (const open of [true, false]) {
    it(`swing fields do not change trace / audio / best-spot (${open ? 'OPEN' : 'CLOSED'} door)`, () => {
      const A = makeScene({ swingDeg: 0, hingeEnd: 'start', swingSide: 'in' }, open);
      const B = makeScene({ swingDeg: 90, hingeEnd: 'end', swingSide: 'out' }, open);

      const tA = traceScene(A, RC, MB);
      const tB = traceScene(B, RC, MB);
      expect(tB).toEqual(tA);

      expect(computeAudio(B, tB, true)).toEqual(computeAudio(A, tA, true));
      expect(computeAudio(B, tB, false)).toEqual(computeAudio(A, tA, false));

      expect(bestListeningSpot(B, true)).toEqual(bestListeningSpot(A, true));
      expect(bestListeningSpot(B, false)).toEqual(bestListeningSpot(A, false));
    });
  }

  it('pins the geometry so a future swing→w overload is caught', () => {
    const A = makeScene({ swingDeg: 0, hingeEnd: 'start', swingSide: 'in' }, false);
    const B = makeScene({ swingDeg: 90, hingeEnd: 'end', swingSide: 'out' }, false);
    const dA = A.objects.find((o) => o.id === 'door-1') as RectObj;
    const dB = B.objects.find((o) => o.id === 'door-1') as RectObj;
    expect([dB.w, dB.h, dB.rotation, dB.center]).toEqual([dA.w, dA.h, dA.rotation, dA.center]);
  });

  it('negative control: a real door acoustic change (open↔closed) DOES move the output', () => {
    // The door is in the pair's path, so opening vs closing it is a genuine
    // acoustic change the engine reads — proving the harness is falsifiable.
    const closed = makeScene({ swingDeg: 90, hingeEnd: 'start', swingSide: 'in' }, false);
    const open = makeScene({ swingDeg: 90, hingeEnd: 'start', swingSide: 'in' }, true);
    const aClosed = computeAudio(closed, traceScene(closed, RC, MB), false);
    const aOpen = computeAudio(open, traceScene(open, RC, MB), false);
    expect(aOpen).not.toEqual(aClosed);
  });
});
