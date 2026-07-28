import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import ScenarioCompare from '../ScenarioCompare';
import { MAX_COMPARE, MIN_COMPARE } from '../compare-summary';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';
import { seededDefaultStore } from '../../../engine/seed';
import { sceneListeners } from '../../../engine/scene';
import type { LayoutStore } from '../../../engine/types';

/**
 * S20 — the N-up compare's accessibility contract, checked AT CREATION.
 *
 * Uses the PAGE-WIDE axe run, not the subtree one. `landmark-unique`,
 * `heading-order` and `region` are best-practice rules that the WCAG-tags-only
 * subtree run does not evaluate at all — and the specific defect N columns can
 * introduce (N identically-named `region` landmarks, one per column's verdict
 * hero and metrics card) is exactly a `landmark-unique` failure. A subtree run
 * here would be a vacuous pass.
 */

afterEach(cleanup);

/** The repo has no user-event; `fireEvent` inside `act` is the established idiom. */
const click = async (el: Element): Promise<void> => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const selectOption = async (el: Element, value: string): Promise<void> => {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
  });
};

const store: LayoutStore = seededDefaultStore();
const twoScenarios = () => {
  const l = store.layouts[0];
  const seats = sceneListeners(l.scene);
  return [
    { layoutId: l.id, seatId: seats[0].id },
    { layoutId: store.layouts[1].id, seatId: sceneListeners(store.layouts[1].scene)[0].id },
  ];
};

describe('ScenarioCompare a11y', () => {
  it('has no axe violations page-wide at the default two columns', async () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    await expectNoAxeViolationsOnPage();
  });

  it('has no axe violations at THREE columns — the duplicate-landmark case', async () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    await click(screen.getByRole('button', { name: /add column/i }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    await expectNoAxeViolationsOnPage();
  });

  it('names every column distinctly, so AT can tell them apart', async () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    await click(screen.getByRole('button', { name: /add column/i }));
    const names = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^Column \d+: /);
  });

  it('gives each column’s three pickers distinct accessible names', () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    const cols = screen.getAllByRole('article');
    for (const [i, col] of cols.entries()) {
      for (const what of ['project', 'design', 'seat']) {
        expect(
          within(col).getByRole('combobox', { name: new RegExp(`Column ${i + 1} — ${what}`) }),
        ).toBeTruthy();
      }
    }
  });

  it('is a modal dialog with an accessible name and focuses Close on open', () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    const dlg = screen.getByRole('dialog', { name: /compare listening scenarios/i });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /close compare/i }));
  });

  it('announces the summary through a status region', () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    const status = screen.getByRole('status');
    expect(status.textContent?.trim().length).toBeGreaterThan(0);
  });
});

describe('ScenarioCompare — the N bounds are enforced in the UI, not just in a constant', () => {
  it('disables Remove at the minimum and re-enables it above', async () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    expect(screen.getAllByRole('article')).toHaveLength(MIN_COMPARE);
    for (const b of screen.getAllByRole('button', { name: /remove/i })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    await click(screen.getByRole('button', { name: /add column/i }));
    for (const b of screen.getAllByRole('button', { name: /remove/i })) {
      expect((b as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('disables Add at MAX_COMPARE and never renders more than that', async () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    const add = screen.getByRole('button', { name: /add column/i });
    while (screen.getAllByRole('article').length < MAX_COMPARE) await click(add);
    expect(screen.getAllByRole('article')).toHaveLength(MAX_COMPARE);
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps focus on something real after a removal disables every Remove', async () => {
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    await click(screen.getByRole('button', { name: /add column/i }));
    const removes = screen.getAllByRole('button', { name: /remove/i });
    await click(removes[removes.length - 1]);
    // Going 3 -> 2 disables every Remove in the same commit; focusing one would
    // be a no-op that drops focus to <body>.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect((document.activeElement as HTMLElement).hasAttribute('disabled')).toBe(false);
  });
});

describe('ScenarioCompare is READ-ONLY', () => {
  it('never mutates the store it was handed', async () => {
    const snapshot = JSON.stringify(store);
    render(<ScenarioCompare store={store} initial={twoScenarios()} onClose={() => {}} />);
    await click(screen.getByRole('button', { name: /add column/i }));
    const selects = screen.getAllByRole('combobox');
    await selectOption(selects[1], store.layouts[2].id);
    expect(JSON.stringify(store)).toBe(snapshot);
  });
});
