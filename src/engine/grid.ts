import type { Vec2 } from './types';

/**
 * The engine's grid searches (`bestspot.ts`, `pairspot.ts`) sweep `sceneBounds`
 * at a fixed step, so their cost grows as `span²` and is unbounded from the
 * input boundary's side. This module bounds the WORK those sweeps may do.
 *
 * The S8 discipline applies exactly: bound the DERIVED value, never the stored
 * data. Nothing here touches the scene or `sceneBounds` — a search that would
 * cost too much walks a coarser grid over the same region, so a hostile layout
 * gets a rougher answer instead of freezing the tab, and the scene the user
 * owns is never mangled.
 *
 * Bit-identity is STRUCTURAL, not a tested coincidence: the step is
 * `Math.max(baseStep, minStep)`, which returns the *identical float* `baseStep`
 * whenever the grid already fits. A scene under budget therefore runs the byte-
 * identical loop it ran before this module existed.
 */

export interface Bounds {
  min: Vec2;
  max: Vec2;
}

/**
 * Two ceilings, because they catch different shapes and neither alone is enough.
 * Both are calibrated against the enumerated protected set in
 * `__tests__/fixtures/legit-scenes.ts` — RE-DERIVE THEM AGAINST THAT LIST if you
 * change either, and read the numbers off `docs/security.md` §"worst-case CPU".
 * Calibrating against a subset is exactly how the first cut of this cap ended up
 * firing on a span-400 chain the app itself builds.
 *
 * ── Cell ceiling ─────────────────────────────────────────────────────────────
 * Guards the huge-span / cheap-cell shape, where the work product stays modest
 * because there is little to occlude. A 400 m square with 20 walls reaches
 * 1,243,528 pairspot cells at a work product of only 4.97 × 10⁷ — BELOW several
 * legitimate scenes, so the work ceiling cannot see it at all.
 *
 * It is also the only guard on the LOAD path, which `importRejection` never
 * inspects (its sole call site is the JSON-import handler): a record written
 * straight into IndexedDB is bounded only by `MAX_SCENE_SPAN` (20 km) — 3.27
 * BILLION pairspot cells, an out-of-memory crash rather than a slow pass.
 *
 * Measured maximum over import-accepted protected scenes: 83,512 (16 maximum-size
 * 25×25 rooms, spanning exactly 400 m — the last chain the importer accepts, and
 * the true ceiling, since "Add a room…" only ever extends the LONG axis while the
 * short one stays at the 25 m `clampDim` maximum). 160,000 sits 1.9× above it,
 * which in room terms means chains up to ~30 maximum-size rooms are untouched.
 */
export const MAX_GRID_CELLS = 160_000;

/**
 * ── Work ceiling ─────────────────────────────────────────────────────────────
 * Guards the expensive-cell shape, which the cell ceiling cannot bound because
 * per-cell cost is itself unbounded from the boundary's side: 64 speakers ×
 * 20,000 surfaces at the import ceiling measures **47.8 ms PER CELL**, so even a
 * hundred cells would take five seconds.
 *
 * Measured maximum over import-accepted protected scenes: 4.95 × 10⁷ (a 50-room
 * chain carrying all 64 speakers the importer allows). The adversarial worst case
 * is 4.10 × 10¹¹ — four orders of magnitude higher. 1.5 × 10⁸ sits 3.0× above the
 * former and ~2,700× below the latter.
 */
export const MAX_GRID_WORK = 150_000_000;

/**
 * Upper bound on the cells `for (t = min + step/2; t <= max; t += step)` visits.
 *
 * It must never UNDER-estimate, or the cap it triggers would be unsound. The
 * exact count is `floor(span/step − 0.5) + 1`, but `t += step` accumulates float
 * drift (measured: ±1 iteration per axis over a 160,000-sample sweep), and
 * `max − min` is itself inexact — so this deliberately rounds up and adds the
 * measured slack. Being loose only makes the cap engage marginally sooner; being
 * tight would let a hostile scene walk more cells than the budget allows.
 */
export function axisCells(span: number, step: number): number {
  // `!(x > 0)` also catches NaN — the same guard style as `scene.ts` `clampSpan`.
  if (!(span > 0) || !(step > 0) || !Number.isFinite(span) || !Number.isFinite(step)) return 1;
  return Math.floor(span / step) + 2;
}

/**
 * Upper bound on the cells a 2D sweep of `bounds` visits at `step`.
 *
 * The step is reduced by the box's rounding granularity first. `t += step` is
 * rounded to the nearest double, so at large coordinates the accumulator moves
 * by LESS than `step` and more cells fit than `span / step` suggests — measured
 * 502 real cells against a 500-cell projection at |coord| ≈ 1.3e15. Charging the
 * projection the worst-case shortfall restores the upper bound. For ordinary
 * coordinates the reduction is ~1e-11 m and changes no integer.
 */
export function gridCells(bounds: Bounds, step: number): number {
  const eff = effectiveStep(bounds, step);
  return axisCells(bounds.max.x - bounds.min.x, eff) * axisCells(bounds.max.y - bounds.min.y, eff);
}

/** The least distance `t += step` is guaranteed to actually cover inside `bounds`. */
function effectiveStep(bounds: Bounds, step: number): number {
  const slip = minAdvancingStep(bounds) / 2; // = mag · EPSILON ≥ ulp, the worst rounding loss
  return Number.isFinite(slip) && slip < step / 2 ? step - slip : step / 2;
}

/**
 * The smallest step that is guaranteed to MOVE the `t += step` accumulator
 * everywhere inside `bounds`.
 *
 * `axisCells` reads only the span, but the loop's ability to advance depends on
 * the box's absolute COORDINATES: `t += step` is a no-op once `step` falls below
 * `ulp(t)`. S8 bounded the span and believed that closed the termination class;
 * it did not. A scene whose coordinates sit near 4.6e15 — with an entirely
 * ordinary 400 m span — cannot advance a 0.35 m step at all, and today that is a
 * genuine infinite loop. Above ~1e21 `clampSpan` collapses the span to exactly
 * zero (both ends round to the midpoint), which the `span > 0` guards then wave
 * through. `sanitizeScene` clamps no coordinate, and `importRejection` — which
 * does, via `MAX_IMPORT_COORD` — sees only the JSON-import path, so a record
 * written straight into IndexedDB reaches the loops with any magnitude at all.
 *
 * `ulp(x) ≤ |x| · 2⁻⁵²` for every double, so `|x| · EPSILON` is a safe upper
 * bound on the gap; doubling it guarantees strict progress. For any coordinate a
 * real floorplan carries (metres, so well under 1e6) this is below 1e-9 and
 * `Math.max` hands back the caller's own step — the identical float. It only
 * starts to bind past |coord| ≈ 2⁴⁹ ≈ 5.6e14, which is 10 orders of magnitude
 * beyond `MAX_IMPORT_COORD`.
 */
export function minAdvancingStep(bounds: Bounds): number {
  const mag = Math.max(
    Math.abs(bounds.min.x),
    Math.abs(bounds.max.x),
    Math.abs(bounds.min.y),
    Math.abs(bounds.max.y),
  );
  // A non-finite box cannot happen — `sceneBounds` has returned a finite default
  // since S8 — and no step rescues one anyway (`t += Infinity` never advances).
  // Return 0 so behaviour for that impossible input is exactly what it was.
  if (!Number.isFinite(mag)) return 0;
  return 2 * mag * Number.EPSILON;
}

/**
 * How many cells this sweep may visit, given what one cell costs.
 *
 * `perCellCost` is a cheap deterministic integer proxy for the per-cell work —
 * for `bestspot` `speakers × surfaces`, for `pairspot` `2 × surfaces` — so the
 * budget shrinks exactly as the real cost per cell grows.
 */
export function cellBudget(perCellCost: number): number {
  const cost = Number.isFinite(perCellCost) && perCellCost > 1 ? perCellCost : 1;
  return Math.max(1, Math.min(MAX_GRID_CELLS, Math.floor(MAX_GRID_WORK / cost)));
}

/**
 * The step a sweep should actually use: `baseStep` untouched when the grid
 * already fits its budget, coarsened only when it does not. Never finer than
 * `baseStep` — this bounds work, it never adds any.
 */
export function cappedStep(bounds: Bounds, baseStep: number, perCellCost: number): number {
  const spanX = bounds.max.x - bounds.min.x;
  const spanY = bounds.max.y - bounds.min.y;
  // Termination first: a step that cannot move the accumulator loops forever no
  // matter what the cell budget says, and that case reaches HERE with a span of
  // 0 (or NaN), i.e. through the early return below.
  const floor = Math.max(baseStep, minAdvancingStep(bounds));
  if (!Number.isFinite(spanX) || !Number.isFinite(spanY) || !(spanX > 0) || !(spanY > 0)) {
    return floor;
  }
  // `axisCells` reports at least 2 per axis, so 4 is the smallest grid any
  // budget can actually describe; asking for less would be unsatisfiable.
  const budget = Math.max(4, cellBudget(perCellCost));
  if (gridCells(bounds, floor) <= budget) return floor; // the identical float when nothing binds
  // Solve the projection EXACTLY rather than approximating it. The naive
  // `step = √(area/budget)` drops `axisCells`' +2 slack and lands just over
  // budget (measured: 2,116 cells against a 1,953 budget). Writing u = 1/step,
  //   (spanX·u + 2)·(spanY·u + 2) ≤ budget
  //   ⇒ area·u² + 2(spanX+spanY)·u + (4 − budget) ≤ 0
  // whose positive root gives the smallest sufficient step. An iterative
  // `while (cells > budget) step *= k` loop would add float noise and need its
  // own termination proof; solving directly needs neither.
  const sum = spanX + spanY;
  const area = spanX * spanY;
  const solved = area / (Math.sqrt(sum * sum + area * (budget - 4)) - sum);
  const minStep = Math.max(solved, minAdvancingStep(bounds));
  // A sweep must still visit at least one cell on EACH axis, or the caller loses
  // its result entirely (`bestListeningSpot` would return `best: null` and the
  // green ★ would silently vanish). The loop starts half a step in, so a step
  // wider than twice the short axis yields zero rows.
  //
  // For a box thin enough for this clamp to bind, it wins over the budget — but
  // the result stays bounded, because `sceneBounds` guarantees ≥ 2 m on each axis
  // and ≤ `MAX_SCENE_SPAN` overall: the worst case is ~10,004 projected cells,
  // still under `MAX_GRID_CELLS`. Termination and memory are never at risk.
  //
  // The clamp must never sink below the advancing floor, or termination would be
  // traded away for a cosmetic extra row.
  const shortAxis = Math.min(spanX, spanY);
  const thin = Math.max(floor, 2 * shortAxis);
  if (!Number.isFinite(minStep) || minStep <= 0) return thin;
  return Math.max(floor, Math.min(minStep, thin));
}
