import { describe, expect, it } from 'vitest';
import {
  MAX_GRID_CELLS,
  MAX_GRID_WORK,
  axisCells,
  cappedStep,
  cellBudget,
  gridCells,
} from '../grid';

const box = (w: number, h: number) => ({ min: { x: 0, y: 0 }, max: { x: w, y: h } });

/** Walks the loop the engine actually runs, so the projection can be checked
 *  against reality rather than against another formula. */
function realAxisCount(min: number, max: number, step: number): number {
  let n = 0;
  for (let t = min + step / 2; t <= max; t += step) {
    n++;
    if (n > 5_000_000) break; // the very thing the cap exists to prevent
  }
  return n;
}

describe('axisCells / gridCells — the projection must bound the real loop', () => {
  it('is an upper bound on the real walk for a wide sweep of spans and steps', () => {
    for (const span of [0.5, 1, 2, 3.7, 8, 10, 16.8, 25, 60, 300, 399, 1000]) {
      for (const step of [0.25, 0.35, 0.4, 0.7, 1, 2.5, 7]) {
        const real = realAxisCount(0, span, step);
        const projected = axisCells(span, step);
        expect(projected).toBeGreaterThanOrEqual(real);
        // A bound that is wildly loose would make the cap meaningless.
        expect(projected).toBeLessThanOrEqual(real + 2);
      }
    }
  });

  it('holds when the walk does not start at the origin (float drift accumulates)', () => {
    for (const min of [-137.25, -1.5, 0, 3.3, 512.75]) {
      for (const span of [2, 9.4, 47.5, 300]) {
        for (const step of [0.25, 0.35, 0.7]) {
          const real = realAxisCount(min, min + span, step);
          expect(axisCells(span, step)).toBeGreaterThanOrEqual(real);
        }
      }
    }
  });

  it('never reports zero cells for a degenerate or hostile span', () => {
    for (const span of [0, -5, NaN, Infinity, -Infinity]) {
      expect(axisCells(span, 0.7)).toBeGreaterThanOrEqual(1);
    }
    for (const step of [0, -1, NaN, Infinity]) {
      expect(axisCells(10, step)).toBeGreaterThanOrEqual(1);
    }
  });

  it('multiplies the two axes', () => {
    expect(gridCells(box(10, 20), 1)).toBe(axisCells(10, 1) * axisCells(20, 1));
  });
});

describe('cellBudget', () => {
  it('is the cell ceiling when the per-cell cost is trivial', () => {
    expect(cellBudget(1)).toBe(MAX_GRID_CELLS);
    expect(cellBudget(0)).toBe(MAX_GRID_CELLS);
  });

  it('falls as the per-cell cost rises, tracking the work ceiling', () => {
    expect(cellBudget(25_600)).toBe(Math.floor(MAX_GRID_WORK / 25_600));
    expect(cellBudget(1_280_000)).toBe(Math.floor(MAX_GRID_WORK / 1_280_000));
  });

  it('collapses to one cell for an absurd cost, and FAILS SAFE on a broken one', () => {
    // `>= 1` would be a tautology — the outer `Math.max(1, …)` guarantees it
    // whichever way the non-finite branch goes. Pin the DIRECTION: a NaN or
    // Infinity cost must yield the most protective budget, not the least.
    expect(cellBudget(Number.MAX_SAFE_INTEGER)).toBe(1);
    expect(cellBudget(Infinity)).toBe(1);
    expect(cellBudget(NaN)).toBe(1);
    expect(cellBudget(-Infinity)).toBe(1);
  });

  it('is monotonically non-increasing in the per-cell cost', () => {
    let prev = Infinity;
    for (const cost of [1, 10, 192, 800, 6_400, 25_600, 320_000, 1_280_000, 1e9]) {
      const b = cellBudget(cost);
      expect(b).toBeLessThanOrEqual(prev);
      prev = b;
    }
  });
});

describe('cappedStep — only ever coarsens, and only over budget', () => {
  it('returns the base step untouched when the grid already fits', () => {
    // The real legitimate ceiling: a 50-room "Add a room…" chain is 300 x 5 m
    // with 200 wall surfaces and 4 speakers.
    expect(cappedStep(box(300, 5), 0.7, 4 * 200)).toBe(0.7);
    // …and the same chain walked by pairspot's finer fixed step.
    expect(cappedStep(box(300, 5), 0.35, 2 * 200)).toBe(0.35);
    // The bundled demo and a maximum-size UI room.
    expect(cappedStep(box(7.3, 10.7), 0.447, 4 * 48)).toBe(0.447);
    expect(cappedStep(box(25, 25), 0.7, 4 * 4)).toBe(0.7);
  });

  it('never returns a finer step than asked for', () => {
    for (const [w, h] of [[2, 2], [8, 8], [300, 5], [399, 399]]) {
      for (const base of [0.25, 0.35, 0.7]) {
        for (const cost of [1, 800, 25_600, 1_280_000]) {
          expect(cappedStep(box(w, h), base, cost)).toBeGreaterThanOrEqual(base);
        }
      }
    }
  });

  it('coarsens an adversarial span until the projected grid fits its budget', () => {
    const b = box(399, 399);
    const cost = 64 * 400; // 64 speakers x 400 surfaces
    const step = cappedStep(b, 0.7, cost);
    expect(step).toBeGreaterThan(0.7);
    expect(gridCells(b, step)).toBeLessThanOrEqual(Math.max(4, cellBudget(cost)));
  });

  it('meets the budget exactly for square-ish boxes, where nothing else binds', () => {
    for (const [w, h] of [[399, 399], [399, 200], [20_000, 20_000], [1_000, 600]]) {
      for (const cost of [1, 800, 25_600, 1_280_000]) {
        const step = cappedStep(box(w, h), 0.7, cost);
        expect(gridCells(box(w, h), step)).toBeLessThanOrEqual(Math.max(4, cellBudget(cost)));
      }
    }
  });

  it('bounds the projected grid for every hostile combination', () => {
    for (const [w, h] of [
      [399, 399], [399, 2], [2, 399], [20_000, 20_000], [20_000, 2], [1_000, 3],
    ]) {
      for (const base of [0.25, 0.35, 0.7]) {
        for (const cost of [1, 800, 25_600, 1_280_000, 1e9]) {
          const step = cappedStep(box(w, h), base, cost);
          expect(Number.isFinite(step)).toBe(true);
          expect(step).toBeGreaterThan(0);
          expect(gridCells(box(w, h), step)).toBeLessThanOrEqual(MAX_GRID_CELLS);
        }
      }
    }
  });

  it('honours the WORK ceiling too, including for thin corridor boxes', () => {
    // The cell ceiling alone was asserted here before, and it hid a real hole:
    // the "never lose the last row" clamp is derived from box SHAPE, so on a
    // 400 x 2 m corridor (both axes individually import-legal) it silently
    // overrode the work budget by 1.75x — and on the load path, where per-cell
    // cost has no limit at all, without bound. The suite stayed green because
    // nothing asserted `cells x cost`.
    for (const [w, h] of [
      [399, 399], [399, 2], [2, 399], [20_000, 2], [2, 20_000], [1_000, 3], [20_000, 20_000],
    ]) {
      for (const base of [0.25, 0.35, 0.7]) {
        for (const cost of [1, 800, 25_600, 1_285_000, 1e9, 1e15]) {
          const b = box(w, h);
          const cells = gridCells(b, cappedStep(b, base, cost));
          // `MAX_GRID_WORK` is the ceiling; `cellBudget`'s floor of one cell and
          // the projection's 2-per-axis minimum mean the smallest describable
          // grid is 4 cells, so allow that irreducible slack and nothing more.
          expect(cells * cost).toBeLessThanOrEqual(Math.max(4 * cost, MAX_GRID_WORK));
        }
      }
    }
  });

  it('keeps the last row on a thin box whenever the budget can afford it', () => {
    // A thin box with a punishing per-cell cost is where a naive
    // `step = sqrt(area / budget)` overshoots the short axis and yields zero rows,
    // so the star silently vanishes. At any cost a real scene reaches, the row
    // must survive.
    // Spans here stay inside `MAX_IMPORT_SPAN`; the 20 km case cannot afford a
    // row at these costs and is asserted in the next test instead.
    for (const [w, h] of [[399, 2], [2, 399], [1_000, 2.5]]) {
      for (const cost of [1, 800, 25_600]) {
        const step = cappedStep(box(w, h), 0.7, cost);
        expect(realAxisCount(0, w, step)).toBeGreaterThanOrEqual(1);
        expect(realAxisCount(0, h, step)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('lets the budget outrank the last row when even one row cannot be afforded', () => {
    // The deliberate trade, and the fix for a real hole: the last-row clamp is
    // computed from box SHAPE alone, so leaving it unconditional let it override
    // `MAX_GRID_WORK` without bound on a long thin box. Past the point where a
    // single row busts the budget, the budget wins — the sweep may return
    // nothing, which for a 20 km x 2 m scene carrying an object bomb is the
    // honest answer, and a frozen tab is the worse one.
    const b = box(20_000, 2);
    const cost = 1e9;
    const step = cappedStep(b, 0.7, cost);
    expect(realAxisCount(0, 2, step)).toBe(0);
    // The projection reports 2 cells per axis minimum, so 4 x cost is the
    // smallest work any grid can describe — that floor, and nothing above it.
    expect(gridCells(b, step) * cost).toBeLessThanOrEqual(Math.max(4 * cost, MAX_GRID_WORK));
    // …and it still terminates, which is the property that must never be traded.
    expect(realAxisCount(0, 20_000, step)).toBeLessThan(200_000);
  });

  it('survives degenerate bounds without returning NaN or zero', () => {
    for (const b of [
      box(0, 0),
      box(-1, -1),
      { min: { x: NaN, y: 0 }, max: { x: NaN, y: 5 } },
      { min: { x: 0, y: 0 }, max: { x: Infinity, y: 5 } },
    ]) {
      const step = cappedStep(b, 0.7, 800);
      expect(Number.isFinite(step)).toBe(true);
      expect(step).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('is deterministic — the same inputs give the same step', () => {
    const b = box(399, 399);
    const a1 = cappedStep(b, 0.7, 25_600);
    const a2 = cappedStep(b, 0.7, 25_600);
    expect(a1).toBe(a2);
  });
});

/**
 * TERMINATION AT LARGE COORDINATES.
 *
 * S8 bounded the SPAN and took termination to be settled. It is not: `t += step`
 * stops advancing once `step` drops below `ulp(t)`, which depends on the box's
 * absolute position, not its size. `sanitizeScene` clamps no coordinate, so a
 * record written straight into IndexedDB reaches the loops at any magnitude —
 * a 400 m room at x ≈ 4.6e15 hangs the tab today, before this cap existed.
 */
describe('termination at large coordinates (the origin, not the span)', () => {
  const at = (origin: number, span: number) => ({
    min: { x: origin, y: origin },
    max: { x: origin + span, y: origin + span },
  });

  /** Runs the engine's real loop and reports whether it terminates. */
  function walks(min: number, max: number, step: number): { terminates: boolean; cells: number } {
    let n = 0;
    for (let t = min + step / 2; t <= max; t += step) {
      if (++n > 200_000) return { terminates: false, cells: n };
    }
    return { terminates: true, cells: n };
  }

  it('always returns a step the accumulator can actually move', () => {
    for (const origin of [0, 1e6, 1e14, 1.2589254117941673e15, 4.5709e15, 1e18, 1e21, 1e30]) {
      for (const span of [0, 2, 400, 20_000]) {
        for (const base of [0.25, 0.35, 0.7]) {
          const b = at(origin, span);
          const step = cappedStep(b, base, 800);
          const w = walks(b.min.x, b.max.x, step);
          expect(w.terminates).toBe(true);
        }
      }
    }
  });

  it('terminates on the exact shapes that hang the uncapped engine', () => {
    // A 400 m span — utterly ordinary — parked where a 0.35 m step is a no-op.
    const b = at(4.5709e15, 400);
    expect(walks(b.min.x, b.max.x, 0.35).terminates).toBe(false); // today's behaviour
    expect(walks(b.min.x, b.max.x, cappedStep(b, 0.35, 8)).terminates).toBe(true);
  });

  it('terminates when clampSpan collapses the span to exactly zero', () => {
    // Past ~1e21 both ends of the clamped box round to the midpoint, so span is
    // 0 and every `span > 0` guard waves the scene through into an endless loop.
    const b = at(1e30, 0);
    expect(b.max.x - b.min.x).toBe(0);
    expect(walks(b.min.x, b.max.x, 0.7).terminates).toBe(false); // today's behaviour
    expect(walks(b.min.x, b.max.x, cappedStep(b, 0.7, 800)).terminates).toBe(true);
  });

  it('keeps the projection an upper bound even at large coordinates', () => {
    // The bare `axisCells(span, step)` formula never reads the origin, so at
    // large magnitudes the real walk OUTRUNS it (measured 502 against 500) —
    // `gridCells` is the origin-aware projection, and it is the one the budget
    // is computed from, so it is the one that has to hold.
    for (const origin of [0, 1e6, 1e14, 1.2589254117941673e15, 4.5709e15]) {
      for (const span of [2, 400, 2_000]) {
        for (const base of [0.25, 0.35, 0.7]) {
          const b = at(origin, span);
          const step = cappedStep(b, base, 8);
          const wx = walks(b.min.x, b.max.x, step);
          const wy = walks(b.min.y, b.max.y, step);
          expect(wx.terminates && wy.terminates).toBe(true);
          expect(gridCells(b, step)).toBeGreaterThanOrEqual(wx.cells * wy.cells);
        }
      }
    }
  });

  it('meets the budget when a large origin and real coarsening COMPOSE', () => {
    // The gap that let a real defect through: budget-compliance was only ever
    // asserted at origin (0,0), and the large-coordinate tests only asserted
    // termination. Composed, they failed — `cappedStep` solved for the raw span
    // while `gridCells` policed the budget against the origin-shrunk effective
    // step, so the sweep visited up to 3.9x its budget at |coord| ≈ 1e15.
    for (const origin of [0, 1e10, 1e13, 1.2589254117941673e15, 1e17]) {
      for (const span of [2, 100, 2_000, 20_000]) {
        for (const base of [0.25, 0.35, 0.7]) {
          for (const cost of [8, 800, 3_200, 25_600, 1e6]) {
            const b = at(origin, span);
            const budget = Math.max(4, cellBudget(cost));
            const step = cappedStep(b, base, cost);
            // Either it fits the budget, or it is the untouched base step
            // (nothing bound), or the thin-box row is affordable — never over.
            if (step !== Math.max(base, 0) || gridCells(b, base) > budget) {
              expect(gridCells(b, step)).toBeLessThanOrEqual(budget);
            }
          }
        }
      }
    }
  });

  it('leaves every realistic coordinate byte-identical', () => {
    // The advancing floor must be invisible to real data: `MAX_IMPORT_COORD` is
    // 100 km, ten orders of magnitude below where this starts to bind.
    for (const origin of [0, -100_000, 100_000, 1e9]) {
      for (const base of [0.25, 0.35, 0.7]) {
        expect(cappedStep(at(origin, 20), base, 8)).toBe(base);
      }
    }
  });
});
