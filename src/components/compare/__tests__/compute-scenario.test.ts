import { describe, expect, it } from 'vitest';
import { collectSurfaces, directPath, traceScene } from '../../../engine/raytrace';
import { computeAudio } from '../../../engine/stereo';
import { deriveVerdict } from '../../panels/verdict';
import { directOnlyTrace } from '../compute-scenario';
import {
  DEFAULT_SETTINGS,
  addRoomShell,
  apartmentScene,
  blankScene,
  makeSpeaker,
  rectRoomScene,
  setActiveListener,
  addListener,
  sceneListeners,
} from '../../../engine/scene';
import { seededApartmentScene } from '../../../engine/seed';
import type { Scene, TraceResult } from '../../../engine/types';

/**
 * S20 — `directOnlyTrace` must be EXACT, not an approximation.
 *
 * A compare column reads the trace only through `.direct.blocked`
 * (stereo.ts computeAudio, verdict.ts blockedFor, MetricsPanel's PairSection);
 * the ray fan has no reader there. `traceScene` computes `direct` with an
 * independent `directPath(...)` that takes neither rayCount nor maxBounces
 * (raytrace.ts:312-321), so dropping the fan cannot move it.
 *
 * This corpus asserts that equivalence over every shape the app can build, and
 * carries a NEGATIVE CONTROL so a harness that cannot fail is detectable.
 */

function pairScene(base: Scene, a: { x: number; y: number }, b: { x: number; y: number }): Scene {
  const s1 = makeSpeaker(a, base, 'homepod');
  const s2 = makeSpeaker(b, { ...base, speakers: [s1] }, 'homepod');
  return { ...base, speakers: [s1, s2], pairs: [[s1.id, s2.id]] };
}

function chain(rooms: number): Scene {
  let s = blankScene();
  for (let i = 0; i < rooms; i++) s = addRoomShell(s, `Room ${i + 1}`, 6, 6);
  return s;
}

/** Every shape a compare column can plausibly be pointed at. */
const CORPUS: Array<[string, Scene]> = [
  ['seeded demo (locked pair)', seededApartmentScene()],
  ['demo, no speakers at all', apartmentScene()],
  ['bare room + a pair', pairScene(rectRoomScene(5, 4), { x: 1.5, y: 1.2 }, { x: 3.5, y: 1.2 })],
  ['blank scene, one solo speaker', (() => {
    const b = blankScene();
    return { ...b, speakers: [makeSpeaker({ x: 1, y: 1 }, b)] };
  })()],
  ['pair blocked by a wall', pairScene(addRoomShell(blankScene(), 'R', 6, 6), { x: 0.4, y: 0.4 }, { x: 5.6, y: 5.6 })],
  ['20-room chain, two pairs', (() => {
    const b = chain(20);
    const s = [
      makeSpeaker({ x: 2, y: 2 }, b), makeSpeaker({ x: 4, y: 2 }, b),
      makeSpeaker({ x: 2, y: 4 }, b), makeSpeaker({ x: 4, y: 4 }, b),
    ];
    return { ...b, speakers: s, pairs: [[s[0].id, s[1].id], [s[2].id, s[3].id]] as Array<[string, string]> };
  })()],
  ['speaker at a different height', (() => {
    const b = pairScene(rectRoomScene(6, 5), { x: 1.5, y: 1.5 }, { x: 4.5, y: 1.5 });
    return { ...b, speakers: b.speakers.map((s, i) => (i === 0 ? { ...s, z: 2.2 } : s)) };
  })()],
];

const S = DEFAULT_SETTINGS;

describe('directOnlyTrace is exact for everything a compare column reads', () => {
  it.each(CORPUS)('%s — direct paths are byte-identical to traceScene', (_label, scene) => {
    const full = traceScene(scene, S.rayCount, S.maxBounces);
    const lean = directOnlyTrace(scene);
    expect(lean.bySpeaker.map((s) => s.id)).toEqual(full.bySpeaker.map((s) => s.id));
    expect(lean.bySpeaker.map((s) => s.direct)).toEqual(full.bySpeaker.map((s) => s.direct));
  });

  it.each(CORPUS)('%s — computeAudio and deriveVerdict are identical', (_label, scene) => {
    const full = traceScene(scene, S.rayCount, S.maxBounces);
    const lean = directOnlyTrace(scene);
    for (const tvAnchor of [true, false]) {
      const af = computeAudio(scene, full, tvAnchor);
      const al = computeAudio(scene, lean, tvAnchor);
      expect(al).toEqual(af);
      expect(deriveVerdict(al, lean, tvAnchor)).toEqual(deriveVerdict(af, full, tvAnchor));
    }
  });

  it('follows the ACTIVE seat, so a per-column seat pick is honoured', () => {
    // The column sets the seat via setActiveListener before computing; the mirror
    // (`scene.listener`) is what directPath reads, so a seat change MUST move the
    // direct paths or every column would silently show seat 1's answer.
    let sc = pairScene(rectRoomScene(8, 6), { x: 2, y: 1.2 }, { x: 6, y: 1.2 });
    sc = addListener(sc, 'Far corner', { x: 7.5, y: 5.5 });
    const seats = sceneListeners(sc);
    expect(seats.length).toBe(2);
    const a = directOnlyTrace(setActiveListener(sc, seats[0].id));
    const b = directOnlyTrace(setActiveListener(sc, seats[1].id));
    expect(a.bySpeaker[0].direct.distance).not.toBeCloseTo(b.bySpeaker[0].direct.distance, 3);
    // …and each still matches the full trace for its own seat.
    for (const seat of seats) {
      const s2 = setActiveListener(sc, seat.id);
      expect(directOnlyTrace(s2).bySpeaker.map((x) => x.direct)).toEqual(
        traceScene(s2, S.rayCount, S.maxBounces).bySpeaker.map((x) => x.direct),
      );
    }
  });

  it('returns an EMPTY ray fan — the property that makes it cheap', () => {
    const lean = directOnlyTrace(seededApartmentScene());
    expect(lean.bySpeaker.length).toBe(2);
    for (const s of lean.bySpeaker) {
      expect(s.trace.paths).toEqual([]);
      expect(s.trace.arrivals).toEqual([]);
    }
  });

  it('NEGATIVE CONTROL: a wrong listener position does break the corpus', () => {
    // Proves the equivalence assertions above can fail. A `directOnlyTrace` that
    // read the wrong seat, or the wrong surfaces, would be caught.
    const scene = CORPUS[0][1];
    const surfaces = collectSurfaces(scene.objects);
    const wrong: TraceResult = {
      bySpeaker: scene.speakers.map((sp) => ({
        id: sp.id,
        trace: { paths: [], arrivals: [] },
        // deliberately the wrong ear height
        direct: directPath(surfaces, sp.pos, sp.z, scene.listener.pos, scene.listener.z + 3),
      })),
    };
    const full = traceScene(scene, S.rayCount, S.maxBounces);
    expect(wrong.bySpeaker.map((s) => s.direct)).not.toEqual(full.bySpeaker.map((s) => s.direct));
  });
});
