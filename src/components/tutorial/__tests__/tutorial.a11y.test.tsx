import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import TutorialRunner from '../TutorialRunner';
import { CHAPTERS } from '../steps';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';
import { blankScene } from '../../../engine/scene';
import type { TutorialActionName, TutorialCtx } from '../types';

/**
 * The guided tour's accessibility + behaviour contract, checked AT CREATION.
 *
 * PAGE-WIDE axe, not the subtree run. The overlay adds a `role="dialog"`, a
 * heading, and a fixed-position layer — and the rules that catch the defects
 * those introduce (`aria-dialog-name`, `heading-order`, `region`,
 * `landmark-unique`, `tabindex`) are all BEST-PRACTICE rules that the
 * WCAG-tags-only subtree run does not evaluate at all. A subtree run here would
 * pass on exactly the things most likely to be wrong (the S20 lesson).
 */

afterEach(cleanup);

const click = async (el: Element): Promise<void> => {
  await act(async () => {
    fireEvent.click(el);
  });
};

const ctx = (over: Partial<TutorialCtx> = {}): TutorialCtx => ({
  scene: blankScene(),
  appMode: 'tune',
  designSubStep: 'build',
  tool: 'select',
  locked: false,
  seatCount: 1,
  galleryOpen: false,
  compareOpen: false,
  ...over,
});

/** An in-memory storage stand-in so tests never touch the real localStorage. */
const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

interface HarnessOpts {
  menuOpen?: boolean;
  ctxValue?: TutorialCtx;
  onAction?: (a: TutorialActionName) => void;
}

const renderRunner = (opts: HarnessOpts = {}) => {
  const onAction = opts.onAction ?? vi.fn();
  const onEnterMode = vi.fn();
  const onCloseMenu = vi.fn();
  const utils = render(
    <TutorialRunner
      menuOpen={opts.menuOpen ?? false}
      onCloseMenu={onCloseMenu}
      ctx={opts.ctxValue ?? ctx()}
      onAction={onAction}
      onEnterMode={onEnterMode}
      storage={memStorage()}
    />,
  );
  return { ...utils, onAction, onEnterMode, onCloseMenu };
};

/** Open the menu and start a chapter, returning the harness. */
const startChapter = async (chapterId: string, opts: HarnessOpts = {}) => {
  const h = renderRunner({ ...opts, menuOpen: true });
  const chapter = CHAPTERS.find((c) => c.id === chapterId)!;
  await click(screen.getByRole('button', { name: new RegExp(chapter.title, 'i') }));
  // The menu is App-owned state; the runner asked for it to close, so re-render
  // with it closed exactly as the App would.
  h.rerender(
    <TutorialRunner
      menuOpen={false}
      onCloseMenu={h.onCloseMenu}
      ctx={opts.ctxValue ?? ctx()}
      onAction={h.onAction}
      onEnterMode={h.onEnterMode}
      storage={memStorage()}
    />,
  );
  return h;
};

describe('the chapter menu', () => {
  it('is page-wide axe clean', async () => {
    renderRunner({ menuOpen: true });
    await expectNoAxeViolationsOnPage();
  });

  it('lists every chapter as a real button', () => {
    renderRunner({ menuOpen: true });
    for (const c of CHAPTERS) {
      expect(screen.getByRole('button', { name: new RegExp(c.title, 'i') })).toBeTruthy();
    }
  });
});

describe('the step card', () => {
  it('is page-wide axe clean on a narration step', async () => {
    await startChapter('orientation');
    await expectNoAxeViolationsOnPage();
  });

  it('is page-wide axe clean on a `try` step, both waiting and satisfied', async () => {
    // `layouts` opens on a `try` step, so one chapter covers both renderings.
    await startChapter('layouts');
    await expectNoAxeViolationsOnPage();
    cleanup();
    await startChapter('layouts', { ctxValue: ctx({ galleryOpen: true }) });
    await expectNoAxeViolationsOnPage();
  });

  it('is a dialog with an accessible NAME — the rule only the page-wide run checks', async () => {
    await startChapter('orientation');
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('false');
    // aria-labelledby must resolve to real, non-empty text.
    const labelId = dlg.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent?.trim().length).toBeGreaterThan(3);
  });

  it('takes focus when it appears, so a keyboard user is not left behind', async () => {
    await startChapter('orientation');
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('walks forward and back with real buttons', async () => {
    await startChapter('orientation');
    const first = CHAPTERS[0].steps[0];
    expect(screen.getByText(first.title)).toBeTruthy();
    await click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(CHAPTERS[0].steps[1].title)).toBeTruthy();
    await click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText(first.title)).toBeTruthy();
  });

  it('disables Back on the first step rather than silently doing nothing', async () => {
    await startChapter('orientation');
    expect(screen.getByRole('button', { name: /^back$/i }).hasAttribute('disabled')).toBe(true);
  });

  it('Escape closes the tour', async () => {
    await startChapter('orientation');
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the close button is labelled for screen readers', async () => {
    await startChapter('orientation');
    expect(screen.getByRole('button', { name: /close the tour/i })).toBeTruthy();
  });
});

describe('`try` steps', () => {
  it('shows the hint while unsatisfied and the done state once satisfied', async () => {
    const step = CHAPTERS.find((c) => c.id === 'layouts')!.steps[0];
    await startChapter('layouts');
    expect(screen.getByText(step.hint!)).toBeTruthy();
    expect(screen.queryByText(/done —/i)).toBeNull();
    cleanup();
    await startChapter('layouts', { ctxValue: ctx({ galleryOpen: true }) });
    expect(screen.getByText(/done —/i)).toBeTruthy();
  });

  it('offers "Show me" while unsatisfied, and it dispatches the rescue action', async () => {
    const h = await startChapter('layouts');
    await click(screen.getByRole('button', { name: /show me/i }));
    expect(h.onAction).toHaveBeenCalledWith('open-gallery');
  });

  it('never auto-advances — satisfying a step leaves the user on it', async () => {
    // The pairing step IS the payoff; advancing automatically would replace the
    // celebration card in the same frame the verdict ignites.
    const step = CHAPTERS.find((c) => c.id === 'layouts')!.steps[0];
    await startChapter('layouts', { ctxValue: ctx({ galleryOpen: true }) });
    expect(screen.getByText(step.title)).toBeTruthy();
  });
});

describe('resume', () => {
  it('offers nothing to continue on a clean slate', () => {
    renderRunner({ menuOpen: true });
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  });

  it('offers the saved point, and continuing lands on that step', async () => {
    const saved = {
      getItem: () => JSON.stringify({ seen: false, done: [], resume: { chapterId: 'build', stepIndex: 2 } }),
      setItem: () => undefined,
    };
    const onAction = vi.fn();
    const onEnterMode = vi.fn();
    const onCloseMenu = vi.fn();
    const h = render(
      <TutorialRunner
        menuOpen
        onCloseMenu={onCloseMenu}
        ctx={ctx()}
        onAction={onAction}
        onEnterMode={onEnterMode}
        storage={saved}
      />,
    );
    const btn = screen.getByRole('button', { name: /continue/i });
    expect(btn.textContent).toMatch(/step 3 of 4/i);
    await click(btn);
    h.rerender(
      <TutorialRunner
        menuOpen={false}
        onCloseMenu={onCloseMenu}
        ctx={ctx()}
        onAction={onAction}
        onEnterMode={onEnterMode}
        storage={saved}
      />,
    );
    const chapter = CHAPTERS.find((c) => c.id === 'build')!;
    expect(screen.getByText(chapter.steps[2].title)).toBeTruthy();
  });

  it('does NOT offer a saved point whose chapter no longer exists', () => {
    const stale = {
      getItem: () => JSON.stringify({ seen: false, done: [], resume: { chapterId: 'deleted', stepIndex: 1 } }),
      setItem: () => undefined,
    };
    render(
      <TutorialRunner
        menuOpen
        onCloseMenu={vi.fn()}
        ctx={ctx()}
        onAction={vi.fn()}
        onEnterMode={vi.fn()}
        storage={stale}
      />,
    );
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  });

  it('the menu with a resume offer is still page-wide axe clean', async () => {
    const saved = {
      getItem: () => JSON.stringify({ seen: false, done: ['orientation'], resume: { chapterId: 'lock', stepIndex: 1 } }),
      setItem: () => undefined,
    };
    render(
      <TutorialRunner
        menuOpen
        onCloseMenu={vi.fn()}
        ctx={ctx()}
        onAction={vi.fn()}
        onEnterMode={vi.fn()}
        storage={saved}
      />,
    );
    await expectNoAxeViolationsOnPage();
  });
});

describe('data safety', () => {
  it('entering a scene-writing chapter enters the practice room FIRST', async () => {
    // Chapters are launchable straight from the menu, so this is the only thing
    // standing between "jump to Compare" and a write into the user's own layout.
    const onAction = vi.fn();
    await startChapter('compare', { onAction });
    expect(onAction.mock.calls[0][0]).toBe('practice-room');
  });

  it('a read-only chapter does not create anything', async () => {
    const onAction = vi.fn();
    await startChapter('orientation', { onAction });
    expect(onAction).not.toHaveBeenCalledWith('practice-room');
  });

  it('every chapter marked needsPractice really does enter the practice room', async () => {
    for (const c of CHAPTERS.filter((ch) => ch.needsPractice)) {
      cleanup();
      const onAction = vi.fn();
      await startChapter(c.id, { onAction });
      expect(onAction.mock.calls[0]?.[0], `chapter ${c.id}`).toBe('practice-room');
    }
  });
});
