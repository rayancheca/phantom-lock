import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LayoutGallery from '../LayoutGallery';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';
import { seededDefaultStore } from '../../../engine/seed';
import { addProject, homeProject, layoutsInProject, moveLayoutToProject } from '../../../engine/projects';
import type { LayoutStore } from '../../../engine/types';

/**
 * S29 — the home screen.
 *
 * The IA changed from one labelled SECTION per folder to ONE flat grid where a
 * folder is a TILE. Four of the S20 assertions here described the old shape and
 * are replaced rather than deleted: the properties they protected (every design
 * reachable exactly once, counts derived from the store, an empty folder that
 * teaches) all still hold, they are just observed differently now.
 *
 * Page-wide axe throughout: the grouping rules are BEST PRACTICE, and a
 * subtree run with WCAG tags only would pass on exactly the thing being changed.
 */

afterEach(cleanup);

const noop = () => {};
/** Layout names contain regex metacharacters ("Four pods — couch + bed"). */
const rx = (s: string): RegExp => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const props = (store: LayoutStore) => ({
  store,
  activeId: store.activeId,
  onOpen: noop,
  onNewRoom: noop,
  onNewBlank: noop,
  onNewApartment: noop,
  onGenerate: noop,
  onImport: noop,
  onRename: noop,
  onDuplicate: noop,
  onExport: noop,
  onExportAll: noop,
  onDelete: noop,
  onNewProject: noop,
  onRenameProject: noop,
  onDeleteProject: noop,
  onMoveLayout: noop,
  onDropLayout: noop,
  onDropProject: noop,
  onMergeLayouts: noop,
  onClose: noop,
});

/**
 * The <li> holding a named item. `queryByRole` throws here: every card contains
 * TWO buttons carrying the item's name (the opener and its kebab), so the lookup
 * has to tolerate more than one match and then take the OPENER, which is always
 * first in DOM order.
 */
function itemFor(name: string): HTMLElement {
  const li = screen
    .getAllByRole('listitem')
    .find((el) => within(el).queryAllByRole('button', { name: rx(name) }).length > 0);
  if (!li) throw new Error(`no gallery item named ${name}`);
  return li;
}
const openerIn = (li: HTMLElement) => within(li).getAllByRole('button')[0];

/**
 * Escape has to be dispatched at `window` — the gallery's handler is
 * window-CAPTURE — and that is OUTSIDE React's event system, so `fireEvent` does
 * not wrap it and the state update it causes is never flushed before the next
 * assertion. Every escape here goes through `act`.
 */
const pressEscape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

/** A store whose home grid holds designs AND at least one folder tile. */
function withFolder(): LayoutStore {
  const base = seededDefaultStore();
  const home = homeProject(base);
  const inHome = layoutsInProject(base, home.id);
  const withNew = addProject(base, 'Sketches');
  const folderId = withNew.projects[withNew.projects.length - 1].id;
  return moveLayoutToProject(withNew, inHome[inHome.length - 1].id, folderId);
}

describe('LayoutGallery — the home screen', () => {
  it('has no axe violations page-wide, with designs and folder tiles side by side', async () => {
    render(<LayoutGallery {...props(withFolder())} />);
    await expectNoAxeViolationsOnPage();
  });

  it('renders ONE list, not one region per folder', () => {
    const store = withFolder();
    render(<LayoutGallery {...props(store)} />);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    // Every home item is a listitem: the home project's designs plus a tile per
    // other folder. The home project itself is the grid and never a tile.
    const home = homeProject(store);
    const expected = layoutsInProject(store, home.id).length + store.projects.length - 1;
    expect(screen.getAllByRole('listitem')).toHaveLength(expected);
  });

  it('shows a folder as a TILE that opens it, named with its derived count', () => {
    const store = withFolder();
    const folder = store.projects[store.projects.length - 1];
    const n = layoutsInProject(store, folder.id).length;
    render(<LayoutGallery {...props(store)} />);
    expect(
      screen.getByRole('button', { name: rx(`Open folder ${folder.name}, ${n} design`) }),
    ).toBeTruthy();
  });

  it('DRILLS IN to a folder and shows exactly its designs, then comes back', () => {
    // Replaces the S20 "every layout exactly once, under its own folder" test:
    // designs inside a closed folder are no longer in the DOM, so the property
    // has to be checked per container.
    const store = withFolder();
    const folder = store.projects[store.projects.length - 1];
    const inside = layoutsInProject(store, folder.id);
    render(<LayoutGallery {...props(store)} />);

    fireEvent.click(screen.getByRole('button', { name: rx(`Open folder ${folder.name}`) }));
    expect(screen.getByRole('heading', { name: folder.name })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(inside.length);
    for (const l of inside) {
      expect(screen.getAllByRole('button', { name: rx(l.name) }).length).toBeGreaterThan(0);
    }

    fireEvent.click(screen.getByRole('button', { name: /all layouts/i }));
    expect(screen.getByRole('heading', { name: 'Your layouts' })).toBeTruthy();
  });

  it('teaches rather than hides when a folder is empty', () => {
    const store = addProject(seededDefaultStore(), 'Empty folder');
    render(<LayoutGallery {...props(store)} />);
    expect(screen.getByRole('button', { name: /Open folder Empty folder, 0 designs/ })).toBeTruthy();
    expect(screen.getByText(/drop a design here/i)).toBeTruthy();
  });

  it('counts a folder from the store, never from a stored number', () => {
    const store = withFolder();
    const folder = store.projects[store.projects.length - 1];
    const n = layoutsInProject(store, folder.id).length;
    render(<LayoutGallery {...props(store)} />);
    expect(within(itemFor(`Open folder ${folder.name}`)).getByText(new RegExp(`${n} design`))).toBeTruthy();
  });

  it('publishes the move key map, so the gesture is not hover-only knowledge', () => {
    render(<LayoutGallery {...props(withFolder())} />);
    const help = document.getElementById('gallery-move-help');
    expect(help?.textContent).toMatch(/arrow keys/i);
    // ...and every item points at it, which is what makes it reachable by AT.
    const opener = screen.getAllByRole('button', { name: /Open folder|walls/ })[0];
    expect(opener.getAttribute('aria-describedby')).toBe('gallery-move-help');
  });

  it('closes on Escape from the home grid', () => {
    const onClose = vi.fn();
    render(<LayoutGallery {...props(withFolder())} onClose={onClose} />);
    pressEscape();
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape is a LADDER — it leaves a folder before it closes the gallery', () => {
    // The gallery's Escape handler is window-CAPTURE and stopPropagation()s, so
    // nothing registered later can ever see the key. Every level therefore has to
    // live inside that one handler, and this is what proves it does.
    const onClose = vi.fn();
    const store = withFolder();
    const folder = store.projects[store.projects.length - 1];
    render(<LayoutGallery {...props(store)} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: rx(`Open folder ${folder.name}`) }));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled(); // it closed the FOLDER
    expect(screen.getByRole('heading', { name: 'Your layouts' })).toBeTruthy();

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('move mode — the non-dragging path WCAG 2.5.7 requires', () => {
  const openMoveMode = (store: LayoutStore) => {
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    return { first, opener };
  };

  it('is reachable by keyboard, and says so out loud', () => {
    const store = withFolder();
    const { first } = openMoveMode(store);
    expect(screen.getByRole('status').textContent).toMatch(rx(`Moving ${first.name}`));
  });

  it('marks the surface role="application" ONLY while moving', () => {
    // Browse mode swallows arrow keys, so without this the whole mode is
    // unreachable for exactly the users it exists for. It must not be permanent:
    // role="application" suppresses normal reading everywhere it applies.
    const store = withFolder();
    expect(document.querySelector('[role="application"]')).toBeNull();
    openMoveMode(store);
    expect(document.querySelector('[role="application"]')).not.toBeNull();
  });

  it('COMMITS a reorder with Enter, through the same callback a drag uses', () => {
    const store = withFolder();
    const onDropLayout = vi.fn();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'ArrowRight' });
    fireEvent.keyDown(opener, { key: 'Enter' });
    expect(onDropLayout).toHaveBeenCalledWith(first.id, homeProject(store).id, 1);
  });

  it('makes a FOLDER from the keyboard with F, so the path is not half a feature', () => {
    const store = withFolder();
    const onMergeLayouts = vi.fn();
    const home = layoutsInProject(store, homeProject(store).id);
    render(<LayoutGallery {...props(store)} onMergeLayouts={onMergeLayouts} />);
    const opener = openerIn(itemFor(home[0].name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'f' });
    fireEvent.keyDown(opener, { key: 'Enter' });
    // Slot 0 with the dragged card excluded is the SECOND design on the grid.
    expect(onMergeLayouts).toHaveBeenCalledWith(home[0].id, home[1].id);
  });

  it('CANCELS on Escape without committing anything, and without closing the gallery', () => {
    const store = withFolder();
    const onDropLayout = vi.fn();
    const onClose = vi.fn();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} onClose={onClose} />);
    fireEvent.keyDown(openerIn(itemFor(first.name)), { key: 'm' });
    pressEscape();
    expect(onDropLayout).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('[role="application"]')).toBeNull();
  });

  it('offers the same thing to a single pointer — the actual 2.5.7 requirement', () => {
    // A keyboard equivalent alone satisfies SC 2.1.1 and NOT 2.5.7, which is
    // explicit that the alternative must work "by a single pointer without
    // dragging". The menu item is that path.
    const store = withFolder();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} />);
    fireEvent.click(screen.getByRole('button', { name: rx(`${first.name} actions`) }));
    expect(screen.getByRole('menuitem', { name: /^Move…$/ })).toBeTruthy();
  });
});
