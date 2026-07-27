import type { Scene, SpeakerObj } from '../../types';
import { DEFAULT_LISTENER_NAME, addRoomShell, apartmentScene, sceneBounds } from '../../scene';

/**
 * The scenes the grid cap must leave BIT-IDENTICAL. Shared by the golden
 * equivalence test and the cap's own unit tests so both police the same set.
 *
 * A cap that fires on any of these is a data-loss-class bug, not a fix: the
 * best-spot star, the sweet spot and the verdict would all silently move for a
 * layout the user legitimately built (the S8 lesson, applied to CPU).
 */

/** Deterministic speakers spread across the scene, with stereo pairs. */
export function withSpeakers(scene: Scene, n: number): Scene {
  const b = sceneBounds(scene);
  const speakers: SpeakerObj[] = [];
  for (let i = 0; i < n; i++) {
    speakers.push({
      id: `s${i}`,
      pos: {
        x: b.min.x + ((i + 1) * (b.max.x - b.min.x)) / (n + 1),
        y: b.min.y + (b.max.y - b.min.y) / 2,
      },
      z: 1,
      label: `S${i}`,
      model: 'homepod',
      trimDb: 0,
    });
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < n; i += 2) pairs.push([speakers[i].id, speakers[i + 1].id]);
  return { ...scene, speakers, pairs };
}

/** An N-room layout built exactly the way the "Add a room…" dialog builds one. */
export function roomChain(n: number, w = 6, d = 5): Scene {
  let s: Scene = {
    objects: [],
    speakers: [],
    pairs: [],
    listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    listeners: [{ id: 'L1', name: DEFAULT_LISTENER_NAME, pos: { x: 0, y: 0 }, z: 1.2 }],
    activeListenerId: 'L1',
    rooms: [],
  };
  for (let i = 0; i < n; i++) s = addRoomShell(s, `Room ${i + 1}`, w, d);
  return s;
}

/**
 * Every legitimate scene the cap is forbidden to touch, BY NAME.
 *
 * The enumeration is the specification — "no legitimate scene" is not a
 * decidable predicate, because `addRoomShell` appends each room flush to the
 * right (`scene.ts`) with no gap and no room-count limit, so cell count grows
 * without bound in room count and NO finite budget survives every UI-buildable
 * layout. Whoever recalibrates `MAX_GRID_WORK` must re-derive it against this
 * list; calibrating against a subset is exactly how the first cut of this cap
 * ended up firing on the span-400 chain below.
 */
export function legitScenes(): Array<{ name: string; scene: Scene }> {
  return [
    { name: 'bundled Maple Court demo', scene: withSpeakers(apartmentScene(), 4) },
    // 25 x 25 m is the largest single room the "Add a room…" dialog accepts
    // (`LayoutDialogs.tsx` clampDim).
    { name: 'maximum-size UI room', scene: withSpeakers(roomChain(1, 25, 25), 4) },
    { name: '10-room chain', scene: withSpeakers(roomChain(10), 4) },
    { name: '50-room chain', scene: withSpeakers(roomChain(50), 4) },
    // The practical ceiling with an implausibly speaker-dense build on top.
    { name: '50-room chain, 16 speakers', scene: withSpeakers(roomChain(50), 16) },
    // …and at the full import speaker ceiling, which is where the first cut of
    // the cap left only a 1.2 % margin.
    { name: '50-room chain, 64 speakers', scene: withSpeakers(roomChain(50), 64) },
    // 16 maximum-size rooms span EXACTLY 400 m — the last chain `importRejection`
    // still accepts, and the case that broke the first calibration.
    { name: '16 max-size rooms (span 400, import-accepted)', scene: withSpeakers(roomChain(16, 25, 25), 2) },
    { name: '16 max-size rooms, 16 speakers', scene: withSpeakers(roomChain(16, 25, 25), 16) },
    // Well past anything importable, but still buildable one click at a time.
    { name: '50 max-size rooms (span 1250)', scene: withSpeakers(roomChain(50, 25, 25), 4) },
    { name: '50 max-size rooms, 16 speakers', scene: withSpeakers(roomChain(50, 25, 25), 16) },
  ];
}
