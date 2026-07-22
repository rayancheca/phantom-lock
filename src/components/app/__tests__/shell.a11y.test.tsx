import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import App from '../App';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

/** Mount the real app and wait out the async persistence boot splash. */
async function bootApp() {
  const utils = render(<App />);
  await waitFor(() => expect(screen.getByRole('main')).toBeTruthy(), { timeout: 5000 });
  return utils;
}

const pressKey = async (key: string) => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

describe('the whole app shell (S7 deliverable 4)', () => {
  it('boots to a page with the expected landmarks', async () => {
    await bootApp();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    // Exactly one of each — duplicate landmarks make the rotor useless.
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('has no axe violations in DESIGN', async () => {
    await bootApp();
    await expectNoAxeViolationsOnPage();
  });

  it('has no axe violations in TUNE', async () => {
    await bootApp();
    await pressKey('t');
    await expectNoAxeViolationsOnPage();
  });

  it('survives a window-dispatched keydown without throwing', async () => {
    // The target of a window-dispatched event is `window`, which is truthy but
    // has no `closest`/`classList`. The per-event target derivations MUST guard
    // with `instanceof Element` — this is the repo's own live-verification
    // technique, and an unguarded `t?.closest(...)` would throw here and kill
    // every shortcut including Escape and undo.
    await bootApp();
    await pressKey('t');
    await pressKey('Escape');
    await pressKey('n');
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('mounts the off-screen live regions, empty on first paint', async () => {
    const { container } = await bootApp();
    const regions = container.querySelectorAll('[role="status"][aria-live="polite"]');
    expect(regions.length).toBeGreaterThanOrEqual(2);
    // A region that already has text at mount can be announced on insertion —
    // the seeded first-run demo is already LOCKED, so this must stay silent.
    for (const r of regions) expect(r.textContent).toBe('');
  });
});
