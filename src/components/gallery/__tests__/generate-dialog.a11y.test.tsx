import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GenerateDialog from '../GenerateDialog';
import { generateDesign, formatSeed, ARCHETYPES } from '../../../engine/generate';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';
import type { GeneratorState } from '../../app/hooks/useGenerateDesign';

afterEach(cleanup);

function state(archetype: Parameters<typeof generateDesign>[0]['archetype'] = 'one-bed', seed = 1234): GeneratorState {
  return { archetype, seed, projectId: 'p1', result: generateDesign({ archetype, seed }) };
}

/** Spies stay typed as mocks — `Partial<ComponentProps>` would widen them to
 *  plain functions and `mockClear` would stop type-checking (vitest strips
 *  types, so only `npm run build` ever sees that). */
function renderDialog(over: { state?: GeneratorState } = {}) {
  const props = {
    state: over.state ?? state(),
    onArchetype: vi.fn(),
    onSeed: vi.fn(),
    onReroll: vi.fn(),
    onKeep: vi.fn(),
    onClose: vi.fn(),
  };
  return { ...render(<GenerateDialog {...props} />), props };
}

describe('GenerateDialog', () => {
  it('has no axe violations page-wide', async () => {
    renderDialog();
    // PAGE-WIDE rather than the subtree runner: `landmark-unique` is a
    // best-practice rule the WCAG-tags-only run does not see, and this dialog
    // adds a fieldset and a canvas over the still-mounted app (the S20 lesson).
    await expectNoAxeViolationsOnPage();
  });

  it('offers every archetype as a labelled, pressable control', () => {
    renderDialog();
    for (const a of Object.values(ARCHETYPES)) {
      expect(screen.getByRole('button', { name: a.label })).toBeTruthy();
    }
  });

  it('marks the current shape pressed, and only that one', () => {
    renderDialog({ state: state('cinema') });
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain(ARCHETYPES.cinema.label);
  });

  it('shows the seed as editable text, so a design can be returned to', () => {
    renderDialog({ state: state('one-bed', 0xdeadbeef) });
    const input = screen.getByLabelText('Seed') as HTMLInputElement;
    expect(input.value).toBe(formatSeed(0xdeadbeef));
  });

  it('reports a valid seed edit and ignores an invalid one', () => {
    const { props } = renderDialog();
    const input = screen.getByLabelText('Seed');
    fireEvent.change(input, { target: { value: 'ff' } });
    expect(props.onSeed).toHaveBeenCalledWith(255);
    props.onSeed.mockClear();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(props.onSeed).not.toHaveBeenCalled();
  });

  it('describes the design in TEXT, not only in the preview pixels', () => {
    const s = state('two-bed', 21);
    const { container } = renderDialog({ state: s });
    // Read the summary node directly: the design NAME is split across a
    // <strong> and its parent, so a text query matches both.
    const summary = container.querySelector('.generate-summary')?.textContent ?? '';
    expect(summary).toContain(s.result.name);
    for (const room of s.result.scene.rooms ?? []) {
      // A two-bed can hold two rooms whose names both match /Bedroom/, so this
      // asserts against the summary's own text rather than querying the page.
      expect(summary).toContain(room.name);
    }
  });

  it('says honestly whether the design opens with a locked pair', () => {
    const withPair = state('great-room', 4);
    renderDialog({ state: withPair });
    const wanted = withPair.result.scene.speakers.length === 2 ? /pair that locks/ : /No stereo pair fits/;
    expect(screen.getByText(wanted)).toBeTruthy();
  });

  it('wires reroll, create and cancel', () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Reroll/ }));
    expect(props.onReroll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Create design/ }));
    expect(props.onKeep).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('reports a shape change', () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: ARCHETYPES.loft.label }));
    expect(props.onArchetype).toHaveBeenCalledWith('loft');
  });

  it('hides the decorative canvas from assistive tech', () => {
    const { container } = renderDialog();
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
  });
});
