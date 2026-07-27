import type { Scene, SceneObject, SpeakerObj, Vec2 } from '../../types';
import { DEFAULT_LISTENER_NAME } from '../../scene';
import { sceneBounds } from '../../scene';

/**
 * Scenes built to drive EVERY branch of `bestReflectionDb` (`pairspot.ts`), so an
 * optimization of the reflection search can be proven bit-identical against a
 * golden rather than merely "close on the layouts we happened to try".
 *
 * `legit-scenes.ts` protects the layouts a user can really build; this file is the
 * complement — deliberately degenerate and adversarial inputs that the load path
 * accepts (`sanitizeScene` clamps no coordinate, so huge offsets are reachable)
 * and that each hit a different `continue` inside the wall loop:
 *
 *   - zero-length wall (`wlen < EPS`)
 *   - image→p parallel to the wall (`|denom| < 1e-9`)
 *   - crossing outside the `t <= 0.02 || t >= 0.98` window and outside `0 <= u <= 1`
 *   - `bounceZ > w.height` (bounce flies over a short wall)
 *   - the bounce landing inside an OPEN door (`throughOpening`)
 *   - a CLOSED door / window, which must stay solid
 *   - each leg blocked by a rect, a circle, and another wall
 *   - absorption 0 and 1 (the `Math.max(0.02, 1 - absorption)` floor)
 *   - a far-from-origin scene, where float ulp is large
 */

function scene(objects: SceneObject[], speakers: SpeakerObj[], at: Vec2 = { x: 0, y: 0 }): Scene {
  const listener = { pos: at, z: 1.2 };
  return {
    objects,
    speakers,
    pairs: speakers.length >= 2 ? [[speakers[0].id, speakers[1].id]] : [],
    listener: { ...listener },
    listeners: [{ id: 'L1', name: DEFAULT_LISTENER_NAME, ...listener }],
    activeListenerId: 'L1',
    rooms: [],
  };
}

function wall(
  id: string,
  a: Vec2,
  b: Vec2,
  opts: { height?: number; absorption?: number } = {},
): SceneObject {
  return {
    id,
    kind: 'wall',
    a,
    b,
    absorption: opts.absorption ?? 0.15,
    label: id,
    height: opts.height ?? 2.6,
  };
}

function rect(
  id: string,
  center: Vec2,
  w: number,
  h: number,
  opts: { height?: number; absorption?: number; role?: 'furniture' | 'door' | 'window' | 'tv'; doorOpen?: boolean; rotation?: number } = {},
): SceneObject {
  return {
    id,
    kind: 'rect',
    center,
    w,
    h,
    rotation: opts.rotation ?? 0,
    absorption: opts.absorption ?? 0.2,
    label: id,
    role: opts.role ?? 'furniture',
    height: opts.height ?? 1.0,
    ...(opts.doorOpen === undefined ? {} : { doorOpen: opts.doorOpen }),
  };
}

function circle(id: string, center: Vec2, r: number, height = 1.4): SceneObject {
  return { id, kind: 'circle', center, r, absorption: 0.25, label: id, height };
}

function speaker(id: string, pos: Vec2, z = 1, model: SpeakerObj['model'] = 'homepod'): SpeakerObj {
  return { id, pos, z, label: id, model, trimDb: 0 };
}

/** A closed box of four walls, optionally offset far from the origin. */
function box(prefix: string, x0: number, y0: number, w: number, d: number, height = 2.6): SceneObject[] {
  return [
    wall(`${prefix}n`, { x: x0, y: y0 }, { x: x0 + w, y: y0 }, { height }),
    wall(`${prefix}e`, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + d }, { height }),
    wall(`${prefix}s`, { x: x0 + w, y: y0 + d }, { x: x0, y: y0 + d }, { height }),
    wall(`${prefix}w`, { x: x0, y: y0 + d }, { x: x0, y: y0 }, { height }),
  ];
}

export function reflectionProbeScenes(): Array<{ name: string; scene: Scene }> {
  return [
    {
      // Baseline: a plain room, two speakers, no openings. Every wall is a live
      // reflector, so this is the case the fast path must reproduce exactly.
      name: 'plain 8x6 room',
      scene: scene(box('r', 0, 0, 8, 6), [speaker('a', { x: 1.5, y: 1.5 }), speaker('b', { x: 6.5, y: 1.5 })]),
    },
    {
      // A partition splitting the room blocks direct paths, forcing the
      // reflection fallback on nearly every cell — the shape that is slow.
      name: 'room split by a full-height partition',
      scene: scene(
        [...box('r', 0, 0, 8, 6), wall('mid', { x: 4, y: 0 }, { x: 4, y: 6 })],
        [speaker('a', { x: 1.5, y: 3 }), speaker('b', { x: 6.5, y: 3 })],
      ),
    },
    {
      name: 'partition with an OPEN door (bounce must not credit the hole)',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          wall('mid', { x: 4, y: 0 }, { x: 4, y: 6 }),
          rect('door', { x: 4, y: 3 }, 0.9, 0.12, { role: 'door', doorOpen: true, height: 2.1 }),
        ],
        [speaker('a', { x: 1.5, y: 3 }), speaker('b', { x: 6.5, y: 3 })],
      ),
    },
    {
      name: 'partition with a CLOSED door + a window (both stay solid)',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          wall('mid', { x: 4, y: 0 }, { x: 4, y: 6 }),
          rect('door', { x: 4, y: 2 }, 0.9, 0.12, { role: 'door', doorOpen: false, height: 2.1 }),
          rect('win', { x: 4, y: 4.5 }, 1.2, 0.1, { role: 'window', height: 1.6 }),
        ],
        [speaker('a', { x: 1.5, y: 3 }), speaker('b', { x: 6.5, y: 3 })],
      ),
    },
    {
      // A door whose width exceeds the wall it sits on, and a zero-width door:
      // the `half = o.w / 2 / wlen` span maths must survive both.
      name: 'degenerate doors (oversize span, zero width)',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          wall('mid', { x: 4, y: 2 }, { x: 4, y: 4 }),
          rect('wide', { x: 4, y: 3 }, 9, 0.12, { role: 'door', doorOpen: true, height: 2.1 }),
          rect('zero', { x: 2, y: 0 }, 0, 0.12, { role: 'door', doorOpen: true, height: 2.1 }),
        ],
        [speaker('a', { x: 1.5, y: 3 }), speaker('b', { x: 6.5, y: 3 })],
      ),
    },
    {
      name: 'zero-length wall + wall parallel to the mirror ray',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          wall('zero', { x: 3, y: 3 }, { x: 3, y: 3 }),
          // Collinear with the speakers' y, so image→p can run parallel to it.
          wall('para', { x: 1, y: 3 }, { x: 7, y: 3 }, { height: 0.4 }),
        ],
        [speaker('a', { x: 1.5, y: 1.2 }), speaker('b', { x: 6.5, y: 1.2 })],
      ),
    },
    {
      // Short walls: the bounce point's interpolated height clears the top, so
      // `bounceZ > w.height` fires for some cells and not others.
      name: 'mixed wall heights (bounceZ vs w.height)',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          wall('low', { x: 2, y: 1 }, { x: 6, y: 1 }, { height: 0.9 }),
          wall('mid', { x: 2, y: 4 }, { x: 6, y: 4 }, { height: 1.15 }),
        ],
        [speaker('a', { x: 1.5, y: 2.5 }, 0.4), speaker('b', { x: 6.5, y: 2.5 }, 2.2)],
      ),
    },
    {
      name: 'absorption extremes (0 and 1)',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          wall('dead', { x: 1, y: 5 }, { x: 7, y: 5 }, { absorption: 1 }),
          wall('live', { x: 1, y: 1 }, { x: 7, y: 1 }, { absorption: 0 }),
        ],
        [speaker('a', { x: 1.5, y: 3 }), speaker('b', { x: 6.5, y: 3 })],
      ),
    },
    {
      // Rects and circles occlude the legs of the bounce, and the speaker sits
      // inside its own furniture — the self-occlusion filter must still hold.
      name: 'legs blocked by rects and circles',
      scene: scene(
        [
          ...box('r', 0, 0, 8, 6),
          rect('tall', { x: 4, y: 2 }, 1.2, 0.8, { height: 2.2, rotation: 0.6 }),
          circle('pillar', { x: 4, y: 4.5 }, 0.5, 2.4),
          rect('low', { x: 2.5, y: 4.5 }, 1.4, 0.9, { height: 0.5 }),
        ],
        [speaker('a', { x: 1.2, y: 3 }), speaker('b', { x: 6.8, y: 3 }, 1.8, 'homepod-mini')],
      ),
    },
    {
      // `sanitizeScene` clamps no coordinate, so a layout can legitimately sit
      // far from the origin, where one ulp is large. Any refactor that changes
      // the ORDER of a float operation shows up here first.
      name: 'room parked 50 km from the origin',
      scene: scene(
        [...box('r', 50000, 50000, 8, 6), wall('mid', { x: 50004, y: 50000 }, { x: 50004, y: 50006 })],
        [speaker('a', { x: 50001.5, y: 50003 }), speaker('b', { x: 50006.5, y: 50003 })],
        { x: 50004, y: 50003 },
      ),
    },
    {
      // Many parallel walls with speakers straddling them: the wall-heavy shape
      // that costs 132 s end to end, shrunk to a size a test can afford.
      name: 'wall-heavy corridor (12 walls, 8 speakers)',
      scene: (() => {
        const objects: SceneObject[] = [];
        for (let i = 0; i < 12; i++) {
          const y = (20 * (i + 0.5)) / 12;
          objects.push(wall(`w${i}`, { x: 0, y }, { x: 20, y }, { height: 3 }));
        }
        const speakers: SpeakerObj[] = [];
        for (let i = 0; i < 8; i++) {
          speakers.push(speaker(`s${i}`, { x: (20 * (i + 0.5)) / 8, y: i % 2 === 0 ? 2 : 18 }));
        }
        const s = scene(objects, speakers, { x: 10, y: 10 });
        const pairs: Array<[string, string]> = [];
        for (let i = 0; i + 1 < speakers.length; i += 2) pairs.push([speakers[i].id, speakers[i + 1].id]);
        return { ...s, pairs };
      })(),
    },
  ];
}

/**
 * A deterministic lattice of probe points over the scene bounds, plus the
 * speakers' own positions and a point just off each wall end — so the golden
 * samples the interior, the boundary, and the exact coordinates most likely to
 * sit on a guard's knife edge.
 */
export function probePoints(s: Scene, n = 7): Vec2[] {
  const b = sceneBounds(s);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      out.push({
        x: b.min.x + ((i + 0.5) * (b.max.x - b.min.x)) / n,
        y: b.min.y + ((j + 0.5) * (b.max.y - b.min.y)) / n,
      });
    }
  }
  for (const sp of s.speakers) out.push({ ...sp.pos });
  for (const o of s.objects) {
    if (o.kind === 'wall') {
      out.push({ ...o.a });
      out.push({ x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 });
    }
  }
  return out;
}

/** Ear heights the golden sweeps, spanning below/at/above typical wall tops. */
export const PROBE_EAR_Z: readonly number[] = [0.4, 1.2, 2.9];
