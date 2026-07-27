import type { SceneObject, SpeakerObj, Surface, Vec2, WallObj } from './types';
import { distPointSegment, EPS, surfaceT } from './geometry';
import { levelAtDb } from './speakers';
import * as v from './vec';

/**
 * The first-order wall-bounce search, prepared once per sweep instead of
 * re-derived per grid cell.
 *
 * `bestReflectionDb` is the blocked-line-of-sight fallback, and it is the whole
 * cost of a heavily-walled scene: measured before this module, it was 94–100 %
 * of a simulation pass on both a legitimate 50-room chain (13.5 s) and the
 * wall-heavy import-legal payload (129.7 s). S18 capped the grid loops, which
 * bounded cost in SPAN but left this untouched — a 50-room chain's grids are not
 * capped at all, so its cost is pure per-call work. The two shapes load the same
 * term through opposite factors, which is why only one of them could ever be
 * fixed by a cap:
 *
 *   50-room chain    45 901 calls  x  315 µs/call   (few calls, 200 walls x 200 surfaces)
 *   wall-heavy 399  16.0 M calls   x  7.7 µs/call   (tiny call, 20 x 20)
 *
 * So this module attacks the per-call work directly. Everything here is an
 * EXACT restructuring: the arithmetic is transcribed literally from the original
 * loop, and the two places where work is genuinely skipped are skipped only
 * where the skip is provably unobservable (see `isBlocked`). Output is
 * bit-identical, pinned by `__tests__/fixtures/reflection-golden.json`, which
 * was captured from the pre-optimization engine.
 *
 * WHY THE ARITHMETIC IS COPIED RATHER THAN TIDIED. Bit-identity forbids
 * reassociation, and the tempting simplifications are exactly the ones that
 * break it — measured on this machine over 200 000 random samples each:
 * `Math.hypot(a,b,c)` differs from the nested `Math.hypot(Math.hypot(a,b),c)`
 * 54 % of the time, `Math.sqrt(x*x+y*y)` from `Math.hypot(x,y)` 37 %, and a
 * per-component `x/l` from `x*(1/l)` 45 %. Every expression below is therefore a
 * literal transcription of `pairspot.ts`'s original, and each hoisted value is
 * the same double the original computed inline.
 */

/** Per-wall constants — independent of both the speaker and the listening point. */
interface PreparedWall {
  wall: WallObj;
  /** `w.b - w.a`, the raw (unnormalised) edge vector. */
  q: Vec2;
  /** `v.norm(v.sub(w.b, w.a))` — the DIVISION form, not `scale(…, 1/len)`. */
  dir: Vec2;
  wlen: number;
  /** `20 * Math.log10(Math.max(0.02, 1 - absorption))`, added to the level as-is. */
  keepDb: number;
  /**
   * Spans along the wall carved out by OPEN doors, as raw `[lo, hi]` pairs in
   * `objects` order. Deliberately NOT clamped to [0, 1]: the original compares
   * the raw `u` against raw `tc ± half`, unlike `wallKeptSpans`, which does
   * clamp. Different semantics — do not share the helper.
   */
  openings: number[];
  /** Search-order hints for this wall's two occlusion legs (see `isBlocked`). */
  hintA: LegHint;
  hintB: LegHint;
}

/**
 * Which surface settled this leg last time, or -1. Purely a search-order hint:
 * every candidate is re-confirmed with the exact predicate, so a stale or wrong
 * hint can only cost a comparison, never change an answer.
 */
interface LegHint {
  last: number;
}

/** Per-(speaker, wall) constants — independent of the listening point. */
interface MirroredWall {
  /** The speaker mirrored across the wall's infinite line. */
  imageX: number;
  imageY: number;
  /** `w.a.x - image.x` and `w.a.y - image.y`, reused by both `t` and `u`. */
  ax: number;
  ay: number;
}

/**
 * A surface's axis-aligned bounding box, used ONLY to order the occlusion scan
 * (see `isBlocked`) — never to decide that nothing blocks.
 */
interface SurfaceBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ReflectionContext {
  surfaces: Surface[];
  boxes: SurfaceBox[];
  walls: PreparedWall[];
  /** Lazily filled per speaker; a sweep reuses it across every cell. */
  mirrors: Map<SpeakerObj, MirroredWall[]>;
}

function boxOf(s: Surface): SurfaceBox {
  if (s.type === 'seg') {
    return {
      minX: Math.min(s.a.x, s.b.x),
      minY: Math.min(s.a.y, s.b.y),
      maxX: Math.max(s.a.x, s.b.x),
      maxY: Math.max(s.a.y, s.b.y),
    };
  }
  return { minX: s.c.x - s.r, minY: s.c.y - s.r, maxX: s.c.x + s.r, maxY: s.c.y + s.r };
}

/**
 * Hoist everything that does not depend on the listening point out of the sweep.
 *
 * Build this once alongside `surfaces` and reuse it for every cell. It caches
 * nothing derived from `p`, so it stays valid for the whole sweep; it must be
 * rebuilt whenever `surfaces`, `walls` or `objects` change identity.
 */
export function prepareReflections(
  surfaces: Surface[],
  walls: WallObj[],
  objects: SceneObject[],
): ReflectionContext {
  const prepared: PreparedWall[] = [];
  for (const w of walls) {
    const wlen = v.dist(w.a, w.b);
    // A zero-length wall reflects nothing — the original skips it before
    // computing anything else, so it never reaches the prepared list.
    if (wlen < EPS) continue;
    const q = v.sub(w.b, w.a);
    const dir = v.norm(q);
    const keepDb = 20 * Math.log10(Math.max(0.02, 1 - w.absorption));
    // The open-door scan, hoisted: only the final `u` comparison depends on the
    // cell. Order within `objects` is preserved, though the test is existential
    // so only membership matters.
    const openings: number[] = [];
    for (const o of objects) {
      if (o.kind !== 'rect' || o.role !== 'door' || o.doorOpen === false) continue;
      if (distPointSegment(o.center, w.a, w.b) > 0.12) continue; // door not on this wall
      const tc = v.dot(v.sub(o.center, w.a), dir) / wlen;
      const half = o.w / 2 / wlen; // (o.w / 2) / wlen — NOT o.w / (2 * wlen)
      openings.push(tc - half, tc + half);
    }
    prepared.push({ wall: w, q, dir, wlen, keepDb, openings, hintA: { last: -1 }, hintB: { last: -1 } });
  }
  return {
    surfaces,
    boxes: surfaces.map(boxOf),
    walls: prepared,
    mirrors: new Map(),
  };
}

function mirrorsFor(ctx: ReflectionContext, sp: SpeakerObj): MirroredWall[] {
  const cached = ctx.mirrors.get(sp);
  if (cached) return cached;
  const out: MirroredWall[] = [];
  for (const pw of ctx.walls) {
    const w = pw.wall;
    const rel = v.sub(sp.pos, w.a);
    const along = v.dot(rel, pw.dir);
    const proj = v.add(w.a, v.scale(pw.dir, along));
    // `proj + (proj - sp.pos)`, NOT `2 * proj - sp.pos` (3.7 % bit divergence).
    const image = v.add(proj, v.sub(proj, sp.pos));
    out.push({ imageX: image.x, imageY: image.y, ax: w.a.x - image.x, ay: w.a.y - image.y });
  }
  ctx.mirrors.set(sp, out);
  return out;
}

/** The exact per-surface blocking predicate from `raytrace.ts` `directOcclusion`. */
function blocks(
  s: Surface,
  from: Vec2,
  dir: Vec2,
  d: number,
  zFrom: number,
  zTo: number,
): boolean {
  const t = surfaceT(s, from, dir);
  if (t < 0 || t >= d - 0.02) return false;
  const zAt = zFrom + (zTo - zFrom) * (t / d);
  return s.height >= zAt;
}

/**
 * Is the straight 3D line from→to blocked by any surface other than
 * `excludeId`'s? Byte-equivalent to `directPath(...).blocked` on the same
 * inputs — and only to that.
 *
 * WHY THIS MAY DIVERGE FROM `directOcclusion`'S LOOP SHAPE AND STILL BE EXACT.
 * `blocked` is the characteristic function of "SOME surface satisfies the
 * per-surface predicate": the predicate reads only the surface and the query,
 * never loop-carried state, and the blocked branch returns the *literal*
 * `attenuation: 0` rather than the accumulated product. So the answer is a pure
 * existential — independent of the order surfaces are visited, and unchanged by
 * returning on a different witness. `bestReflectionDb` reads `.blocked` and
 * nothing else from its two calls, so this helper is a legal substitute THERE.
 *
 * It is deliberately NOT shared with `directOcclusion`, which stays byte-
 * unchanged. That function's `attenuation` is a left-fold over surfaces in array
 * order, and float multiplication does not reassociate (measured: 35 % of
 * three-factor products differ when reordered) — so the four callers that read
 * `attenuation` (`reachDb`, `bestListeningSpot`'s LOS test, `optimize.ts`'s
 * placement score, and the on-screen Echogram via `traceScene`) are out of this
 * change's blast radius BY CONSTRUCTION rather than by argument.
 *
 * THE BOUNDING BOXES ARE A SEARCH ORDER, NOT A FILTER. A box test looks like it
 * could reject surfaces outright, but it cannot be proven to: in the
 * near-parallel band just above `raySegment`'s `1e-12` guard, `t` is a ratio of
 * two catastrophically-cancelling cross products and can be reported inside
 * `[EPS, d)` for a segment whose true crossing is far outside the query box —
 * and flush, exactly-collinear walls are precisely what `addRoomShell` builds.
 * So a positive from the fast pass is trusted (it ran the exact predicate), and
 * a negative is NOT: the fallback re-scans every surface with no box test at
 * all, which is literally the original loop. Both answers are therefore exact,
 * and no conservatism argument is needed anywhere.
 */
function isBlocked(
  ctx: ReflectionContext,
  hint: LegHint,
  from: Vec2,
  zFrom: number,
  to: Vec2,
  zTo: number,
  excludeId: string,
): boolean {
  const d = v.dist(from, to);
  if (d < EPS) return false; // matches directOcclusion's own early return
  // `v.scale(v.sub(to, from), 1 / d)` — the reciprocal-multiply form the
  // original uses. A per-component divide would give different bits.
  const inv = 1 / d;
  const dir = { x: (to.x - from.x) * inv, y: (to.y - from.y) * inv };

  const { surfaces, boxes } = ctx;
  // A surface below BOTH endpoints cannot block, because `zAt` is a convex blend
  // of `zFrom` and `zTo`. Used only to order the fast pass — the rescan below
  // applies no filter at all — so this needs no ulp-level proof to be safe.
  const zLow = zFrom < zTo ? zFrom : zTo;
  const qMinX = from.x < to.x ? from.x : to.x;
  const qMaxX = from.x < to.x ? to.x : from.x;
  const qMinY = from.y < to.y ? from.y : to.y;
  const qMaxY = from.y < to.y ? to.y : from.y;

  // Coherence: the surface that shadowed this same leg of this same wall for the
  // previous cell almost always shadows it again. The hint is per (wall, leg)
  // rather than global, because within one call the wall loop walks past every
  // wall in turn and a single slot would just thrash.
  const last = hint.last;
  if (last >= 0 && last < surfaces.length) {
    const s = surfaces[last];
    if (s.objectId !== excludeId && blocks(s, from, dir, d, zFrom, zTo)) return true;
  }

  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s.objectId === excludeId) continue;
    if (s.height < zLow) continue;
    const b = boxes[i];
    if (b.maxX < qMinX || b.minX > qMaxX || b.maxY < qMinY || b.minY > qMaxY) continue;
    if (blocks(s, from, dir, d, zFrom, zTo)) {
      hint.last = i;
      return true;
    }
  }

  // Nothing blocked among the surfaces the fast pass looked at. NEITHER skip
  // reason is a proof — the box test can miss a hit that `raySegment` reports
  // out of the ill-conditioned near-parallel band, and the height test rests on
  // `zAt >= min(zFrom, zTo)`, exact in real arithmetic but only within an ulp in
  // floating point. So the negative answer is settled by rescanning every
  // surface with no filter at all, which is literally the original loop. That is
  // the ONLY reason a negative is exact, and it is why neither skip above needs
  // an ulp-level argument.
  //
  // (Rescanning only the surfaces the fast pass skipped is the obvious
  // refinement and is equally exact — it was implemented, measured at 39 → 21
  // surface tests per call, and found to make no difference to wall-clock at
  // all, because the surface tests are not the bottleneck. Dropped as
  // complexity that buys nothing.)
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s.objectId === excludeId) continue;
    if (blocks(s, from, dir, d, zFrom, zTo)) {
      hint.last = i;
      return true;
    }
  }
  return false;
}

/**
 * Strongest first-order wall bounce from speaker to p, in dB — the prepared
 * form of `pairspot.ts` `bestReflectionDb`, returning the identical double.
 *
 * The wall loop keeps the original's guard order and its `db > best` reduction,
 * so the accepted wall set and the maximum are unchanged. What is gone is the
 * per-cell recomputation of per-wall and per-(speaker, wall) constants, the
 * `surfaces.filter` array and closure built per wall per cell per speaker, and
 * the two `directPath` result objects per surviving wall.
 */
export function reflectionDb(
  ctx: ReflectionContext,
  sp: SpeakerObj,
  p: Vec2,
  earZ: number,
): number {
  let best = -Infinity;
  const mirrors = mirrorsFor(ctx, sp);
  const dzUp = sp.z - earZ; // the operand order `Math.hypot(flat, sp.z - earZ)` uses
  const dzDown = earZ - sp.z; // …and the OPPOSITE sign `bounceZ` uses
  const px = p.x;
  const py = p.y;

  for (let i = 0; i < ctx.walls.length; i++) {
    const pw = ctx.walls[i];
    const m = mirrors[i];
    const w = pw.wall;
    const q = pw.q;

    // Where does image→p cross the wall segment?
    const rx = px - m.imageX;
    const ry = py - m.imageY;
    const denom = rx * q.y - ry * q.x;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (m.ax * q.y - m.ay * q.x) / denom;
    const u = (m.ax * ry - m.ay * rx) / denom;
    if (t <= 0.02 || t >= 0.98 || u < 0 || u > 1) continue;
    // Height at the bounce must stay under the wall top or the "reflection"
    // would fly over it.
    const bounceZ = sp.z + dzDown * t;
    if (bounceZ > w.height) continue;
    // Refuse a bounce that lands in a genuine acoustic HOLE — an OPEN door,
    // which carves the wall away and reflects nothing. Closed doors and windows
    // are SOLID and stay in play, handled by leg occlusion plus the wall's
    // material approximation.
    const spans = pw.openings;
    let throughOpening = false;
    for (let k = 0; k < spans.length; k += 2) {
      if (u >= spans[k] && u <= spans[k + 1]) {
        throughOpening = true;
        break;
      }
    }
    if (throughOpening) continue;
    // Both legs of the bounce must themselves be clear — otherwise a wall
    // between speaker and mirror wall would "reflect" straight through it.
    const bounce = { x: w.a.x + q.x * u, y: w.a.y + q.y * u }; // v.add(w.a, v.scale(q, u))
    if (isBlocked(ctx, pw.hintA, sp.pos, sp.z, bounce, bounceZ, w.id)) continue;
    if (isBlocked(ctx, pw.hintB, bounce, bounceZ, p, earZ, w.id)) continue;
    // The folded 3D path length, computed LAST. The original derives it before
    // the height and leg guards, but nothing between reads it and both guards
    // are pure — so deferring it is exact, and it means the two `Math.hypot`
    // calls (the most expensive arithmetic in the loop, and unreplaceable: the
    // 3-argument form and `Math.sqrt(x*x+y*y)` both differ in the last bits) are
    // paid only by walls that actually produce a bounce. On a wall-heavy scene
    // where every candidate is occluded, that is none of them.
    const flat = Math.hypot(rx, ry); // v.len(r) — image→p is the folded plan length
    const total = Math.hypot(flat, dzUp); // NESTED hypot — never the 3-arg form
    const db = levelAtDb(sp, Math.max(0.3, total)) + pw.keepDb;
    if (db > best) best = db;
  }
  return best;
}
