import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LayoutGallery from '../LayoutGallery';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';
import { seededDefaultStore } from '../../../engine/seed';
import { defaultStore } from '../../../engine/scene';
import {
  addProject,
  dissolveEmptyProject,
  homeItems,
  homeProject,
  layoutsInProject,
  mergeIntoNewProject,
  moveLayoutToProject,
} from '../../../engine/projects';
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
  // Returns the id of the folder it minted. `null` is the honest default for a
  // stub: it is what a refused merge returns, so a test that wants focus to land
  // on the new tile has to say so explicitly rather than inherit it.
  onMergeLayouts: () => null,
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

  it('COMMITS a reorder with Enter, and ONE ArrowRight really moves it', () => {
    // Asserts the OUTCOME, not the argument. The argument alone is what let the
    // pre-S30 bug hide: a subject at display 0 emitted `at = 1`, this test froze
    // that number, and `moveLayoutToProject` mapped it straight back to display
    // 0 — so the live region said "Position 2" and nothing moved. Feeding the
    // recorded index through the REAL engine is the only anchor outside the code
    // under test (the S24 lesson).
    const store = withFolder();
    const onDropLayout = vi.fn();
    const home = homeProject(store).id;
    const before = layoutsInProject(store, home);
    const first = before[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'ArrowRight' });
    fireEvent.keyDown(opener, { key: 'Enter' });

    expect(onDropLayout).toHaveBeenCalledTimes(1);
    const [id, projectId, at] = onDropLayout.mock.calls[0];
    expect(id).toBe(first.id);
    expect(projectId).toBe(home);
    const after = layoutsInProject(moveLayoutToProject(store, id, projectId, at), home);
    expect(after.map((l) => l.id).indexOf(first.id)).toBe(1);
    // And it is genuinely a move, not a coincidence about a one-item container.
    expect(before.map((l) => l.id).indexOf(first.id)).toBe(0);
  });

  it('reaches the LAST position of the MIXED container — the old cap left it unreachable', () => {
    // `max` used to be `others.length`, one short of the number of distinct
    // outcomes, so the final slot could not be selected at all.
    //
    // MEASURED against the wrong version of this test: asserting over
    // `layoutsInProject(store, home)` — the DESIGNS — is decorative, because
    // `stepMove` caps on the MIXED home sequence (designs PLUS folder tiles).
    // The fixture's two tiles supply two slots of slack, so a cap short by one,
    // two or even three still passed. The container the code counts is the
    // container the test must count.
    const store = withFolder();
    const onDropLayout = vi.fn();
    const home = homeProject(store).id;
    const mixed = homeItems(store);
    expect(mixed.length).toBeGreaterThan(layoutsInProject(store, home).length); // not vacuous
    const first = layoutsInProject(store, home)[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'End' });
    fireEvent.keyDown(opener, { key: 'Enter' });

    const [id, projectId, at] = onDropLayout.mock.calls[0];
    const after = homeItems(moveLayoutToProject(store, id, projectId, at));
    const last = after[after.length - 1];
    expect(last.kind).toBe('layout');
    expect(last.kind === 'layout' ? last.layout.id : null).toBe(first.id);
  });

  it('leaves a NON-FIRST subject exactly where it was when committed immediately', () => {
    // Every other move-mode test moves `items[0]`, where `self === 0` makes the
    // step index and the committed index coincide — so a seed that ignored the
    // subject's position and started at 0 was invisible to all of them. Measured:
    // with a seed-at-zero bug a design at index 2 TELEPORTS to index 0 on a bare
    // m-then-Enter.
    const store = withFolder();
    const onDropLayout = vi.fn();
    const home = homeProject(store).id;
    const designs = layoutsInProject(store, home);
    const subject = designs[designs.length - 1];
    const wasAt = homeItems(store).findIndex(
      (i) => i.kind === 'layout' && i.layout.id === subject.id,
    );
    expect(wasAt).toBeGreaterThan(0); // not vacuous
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    const opener = openerIn(itemFor(subject.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'Enter' });

    const [id, projectId, at] = onDropLayout.mock.calls[0];
    const after = homeItems(moveLayoutToProject(store, id, projectId, at));
    expect(after.findIndex((i) => i.kind === 'layout' && i.layout.id === subject.id)).toBe(wasAt);
  });

  it('an arrow AFTER an F continues from the caret, instead of teleporting to the front', () => {
    // `lastStep` exists for exactly this and nothing else: it is read only when
    // the intent is NOT a slot, which happens only after F or O. No other test
    // presses F and then keeps arrowing, so dropping the memory passed the whole
    // suite while being a real, visible regression.
    const store = withFolder();
    const onDropLayout = vi.fn();
    const home = homeProject(store).id;
    const first = layoutsInProject(store, home)[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'ArrowRight' });
    fireEvent.keyDown(opener, { key: 'ArrowRight' });
    fireEvent.keyDown(opener, { key: 'f' }); // intent becomes merge/absorb
    fireEvent.keyDown(opener, { key: 'ArrowRight' }); // ...and back to a slot
    fireEvent.keyDown(opener, { key: 'Enter' });

    const [id, projectId, at] = onDropLayout.mock.calls[0];
    const after = homeItems(moveLayoutToProject(store, id, projectId, at));
    const landed = after.findIndex((i) => i.kind === 'layout' && i.layout.id === first.id);
    // Three rights from position 0 is position 3. Losing the memory restarts the
    // count and lands on 1.
    expect(landed).toBe(3);
  });

  it('every arrow step lands somewhere NEW — no keypress is a no-op', () => {
    // The general property behind both tests above. Walking Home then stepping
    // right once per remaining position must visit every position exactly once;
    // the pre-S30 index space repeated one and omitted another.
    const store = withFolder();
    const home = homeProject(store).id;
    const items = layoutsInProject(store, home);
    const first = items[0];
    const seen: number[] = [];
    for (let steps = 0; steps < items.length; steps += 1) {
      const onDropLayout = vi.fn();
      const view = render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
      const opener = openerIn(itemFor(first.name));
      fireEvent.keyDown(opener, { key: 'm' });
      fireEvent.keyDown(opener, { key: 'Home' });
      for (let i = 0; i < steps; i += 1) fireEvent.keyDown(opener, { key: 'ArrowRight' });
      fireEvent.keyDown(opener, { key: 'Enter' });
      const [id, projectId, at] = onDropLayout.mock.calls[0];
      const after = layoutsInProject(moveLayoutToProject(store, id, projectId, at), home);
      seen.push(after.map((l) => l.id).indexOf(first.id));
      view.unmount();
    }
    expect(seen).toEqual(items.map((_, i) => i));
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

// ---------------------------------------------------------------------------
// S30 — the four S29 residuals.

/**
 * A gallery wired to a REAL store, so a commit actually changes the grid.
 *
 * The `props()` stub above is right for testing what the gallery calls; it
 * cannot test what happens AFTER, because nothing re-renders. Focus and the
 * dissolve both live entirely in that second render.
 */
function Host({
  initial,
  onClose = noop,
}: {
  initial: LayoutStore;
  onClose?: () => void;
}) {
  const [store, setStore] = useState(initial);
  return (
    <LayoutGallery
      {...props(store)}
      store={store}
      onClose={onClose}
      onDropLayout={(layoutId, projectId, index) =>
        setStore((s) => {
          const from = s.layouts.find((l) => l.id === layoutId)?.projectId;
          const emptied =
            from && from !== projectId && layoutsInProject(s, from).length === 1 ? from : null;
          const moved = moveLayoutToProject(s, layoutId, projectId, index);
          return emptied ? dissolveEmptyProject(moved, emptied) : moved;
        })
      }
      onMergeLayouts={(dragId, targetId) => {
        const target = store.layouts.find((l) => l.id === targetId);
        const made = mergeIntoNewProject(store, dragId, targetId, target?.name ?? 'Folder');
        if (!made) return null;
        setStore(made.store);
        return made.projectId;
      }}
    />
  );
}

/** Drill into the folder tile named `name`. */
const openFolder = (name: string) => fireEvent.click(openerIn(itemFor(name)));

describe('S30 §14c — Escape is a LADDER, and a menu is the innermost rung', () => {
  it('closes only the MENU, leaving the gallery open and focus inside it', () => {
    // The shipped bug: both handlers are window-CAPTURE on the same node, so the
    // gallery's `stopPropagation()` cannot stop Menu's co-registered listener —
    // and the gallery, having mounted first, ran first and closed everything.
    const store = withFolder();
    const onClose = vi.fn();
    render(<LayoutGallery {...props(store)} onClose={onClose} />);
    const first = layoutsInProject(store, homeProject(store).id)[0];
    fireEvent.click(within(itemFor(first.name)).getByRole('button', { name: /actions/i }));
    expect(screen.getByRole('menu')).toBeTruthy();

    pressEscape();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('YIELDS to a Dialog stacked over the gallery', () => {
    // The OTHER half of `overlayAbove`, and it was entirely untested: deleting
    // the `.dialog-layer` rung left the whole suite green while reintroducing
    // exactly the §14c bug. Not hypothetical — the rename, folder-name,
    // room-size and generate dialogs all open FROM the gallery and leave it
    // mounted, so Escape over any of them would have closed the lot.
    const onClose = vi.fn();
    render(
      <>
        <LayoutGallery {...props(withFolder())} onClose={onClose} />
        <div className="dialog-layer" />
      </>,
    );
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes when a role=menu exists OUTSIDE the gallery layer', () => {
    // Pins the SCOPING of the detector. The unscoped
    // `document.querySelector('[role="menu"]')` passes every other test here and
    // fails this one — it would let any menu anywhere in the app disable Escape.
    const store = withFolder();
    const onClose = vi.fn();
    render(
      <>
        <div role="menu" aria-label="somewhere else" />
        <LayoutGallery {...props(store)} onClose={onClose} />
      </>,
    );
    pressEscape();
    expect(onClose).toHaveBeenCalled();
  });

  it('CLOSES rather than swallowing itself when the open folder has vanished', () => {
    // `openFolder` goes stale when the folder is deleted or auto-dissolves under
    // the drill-in: the view has already fallen back to home, but the raw state
    // still holds the id. Feeding that to the ladder made Escape do nothing and
    // announce "Closed folder." about a folder that was already gone.
    const store = withFolder();
    const folderId = store.projects[store.projects.length - 1].id;
    const folderName = store.projects[store.projects.length - 1].name;
    const onClose = vi.fn();
    const view = render(<LayoutGallery {...props(store)} onClose={onClose} />);
    openFolder(folderName);
    expect(screen.getByRole('heading').textContent).toBe(folderName);

    // The folder disappears underneath the drilled-in view.
    const without = {
      ...store,
      projects: store.projects.filter((p) => p.id !== folderId),
      layouts: store.layouts.map((l) =>
        l.projectId === folderId ? { ...l, projectId: homeProject(store).id } : l,
      ),
    };
    view.rerender(<LayoutGallery {...props(without)} store={without} onClose={onClose} />);
    expect(screen.getByRole('heading').textContent).toBe('Your layouts');

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).not.toMatch(/closed folder/i);
  });
});

describe('S30 §14b — focus survives a commit', () => {
  it('lands on the NEW FOLDER after a merge', () => {
    // NON-DEGENERATE pairing on purpose. Merging home[0] onto home[1] vacates
    // slot 0 and puts the new tile at slot 0 too, so an implementation that
    // ignores the merge branch entirely and falls through to the vacated-slot
    // fallback passes. Dragging home[1] onto home[0] separates them.
    const store = withFolder();
    const home = layoutsInProject(store, homeProject(store).id);
    render(<Host initial={store} />);
    const opener = openerIn(itemFor(home[1].name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'ArrowLeft' });
    fireEvent.keyDown(opener, { key: 'f' });
    fireEvent.keyDown(opener, { key: 'Enter' });

    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    // The new tile is named after the design that was standing there.
    expect(active.textContent).toContain(home[0].name);
    expect(active.closest('.folder-tile')).not.toBeNull();
  });

  it('does not fall to <body> when a design is moved OUT of a folder', () => {
    // The folder KEEPS a design, so it does not dissolve and the view stays
    // drilled in — the moved card simply unmounts. This is the case the
    // dissolve-only reasoning misses.
    const base = withFolder();
    const folderId = base.projects[base.projects.length - 1].id;
    const folderName = base.projects[base.projects.length - 1].name;
    const home = layoutsInProject(base, homeProject(base).id);
    // Give the folder a second design so it survives the exit.
    const store = moveLayoutToProject(base, home[0].id, folderId);

    render(<Host initial={store} />);
    openFolder(folderName);
    const inside = layoutsInProject(store, folderId);
    expect(inside.length).toBeGreaterThan(1);

    const opener = openerIn(itemFor(inside[0].name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'o' });
    fireEvent.keyDown(opener, { key: 'Enter' });

    expect(document.activeElement).not.toBe(document.body);
  });
});

describe('S30 §14e — taking a design OUT of a folder', () => {
  it('commits an exit with O, and the emptied folder disappears', () => {
    const store = withFolder();
    const folderId = store.projects[store.projects.length - 1].id;
    const folderName = store.projects[store.projects.length - 1].name;
    render(<Host initial={store} />);
    openFolder(folderName);
    const only = layoutsInProject(store, folderId);
    expect(only).toHaveLength(1);

    const opener = openerIn(itemFor(only[0].name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'o' });
    fireEvent.keyDown(opener, { key: 'Enter' });

    // Back on the home grid, with the design on it and the folder gone.
    expect(screen.getByRole('heading').textContent).toBe('Your layouts');
    expect(itemFor(only[0].name)).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: rx(`Open folder ${folderName}`) })).toHaveLength(
      0,
    );
  });

  it('does NOT offer O on the home grid, where there is nothing to leave', () => {
    // The key is not handled at all rather than swallowed-and-ignored: proposing
    // an action that cannot be performed is the bug this whole feature is
    // careful about, and the help text does not promise O here.
    const store = withFolder();
    const onDropLayout = vi.fn();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'o' });
    fireEvent.keyDown(opener, { key: 'Enter' });
    // It committed the plain reorder it was already pointing at, unchanged.
    const [, , at] = onDropLayout.mock.calls[0];
    expect(at).toBe(1);
  });

  it('publishes O in the key map only while inside a folder', () => {
    const store = withFolder();
    const folderName = store.projects[store.projects.length - 1].name;
    render(<Host initial={store} />);
    const help = () => document.getElementById('gallery-move-help')!.textContent ?? '';
    expect(help()).not.toMatch(/move it out of this folder/i);
    openFolder(folderName);
    expect(help()).toMatch(/move it out of this folder/i);
  });

  it('ignores a MODIFIED O, so Cmd+O stays the browser’s', () => {
    const store = withFolder();
    const folderId = store.projects[store.projects.length - 1].id;
    const folderName = store.projects[store.projects.length - 1].name;
    const onDropLayout = vi.fn();
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    openFolder(folderName);
    const only = layoutsInProject(store, folderId)[0];
    const opener = openerIn(itemFor(only.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'o', metaKey: true });
    fireEvent.keyDown(opener, { key: 'Enter' });
    // Still the reorder it was pointing at — the chord did not retarget it.
    expect(onDropLayout).toHaveBeenCalledWith(only.id, folderId, expect.any(Number));
  });

  it('commits from a single POINTER on the breadcrumb, and leaves move mode', () => {
    // SC 2.5.7 needs the alternative to work "by a single pointer without
    // dragging". Asserting move mode ended too: an onClick that called
    // onDropLayout directly would satisfy the call assertion while leaving
    // role="application" stuck on and a second Enter able to commit again.
    const store = withFolder();
    const folderId = store.projects[store.projects.length - 1].id;
    const folderName = store.projects[store.projects.length - 1].name;
    const onDropLayout = vi.fn();
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    openFolder(folderName);
    const only = layoutsInProject(store, folderId)[0];
    fireEvent.keyDown(openerIn(itemFor(only.name)), { key: 'm' });
    expect(document.querySelector('[role="application"]')).not.toBeNull();

    // While moving, the crumb's ACCESSIBLE NAME is the action, not "All
    // layouts" — that is the WCAG 4.1.2 fix, and finding it by the new name is
    // what proves the name actually changed.
    const crumb = screen.getByRole('button', { name: rx(`Move ${only.name} out`) });
    fireEvent.click(crumb);

    expect(onDropLayout).toHaveBeenCalledWith(only.id, homeProject(store).id, null);
    expect(document.querySelector('[role="application"]')).toBeNull();
  });

  it('still just LEAVES the folder when nothing is being moved', () => {
    const store = withFolder();
    const folderName = store.projects[store.projects.length - 1].name;
    const onDropLayout = vi.fn();
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);
    openFolder(folderName);
    fireEvent.click(screen.getByRole('button', { name: /all layouts/i }));
    expect(onDropLayout).not.toHaveBeenCalled();
    expect(screen.getByRole('heading').textContent).toBe('Your layouts');
  });
});

describe('S30 §14a — a touch drag may refuse the scroller, but only once ARMED', () => {
  /**
   * The dangerous half of the touch fix, as far as jsdom can reach.
   *
   * `touch-action: pan-y` is latched at touchstart, so keeping an armed drag
   * needs `preventDefault` on a non-passive `touchmove`. If that fired
   * unguarded the gallery would become UNSCROLLABLE on touch — worse than the
   * bug it fixes.
   *
   * ⚠️ ONLY THE UN-ARMED DIRECTION IS TESTABLE HERE, and the reason is measured
   * rather than assumed: jsdom dispatches a plain `Event` for pointer events,
   * not a `PointerEvent`, so `button`, `pointerId`, `pointerType` and `clientX`
   * all arrive `undefined`. `onItemPointerDown` bails at `e.button !== 0`, so a
   * press is never even registered (verified: after a `fireEvent.pointerDown`,
   * Escape still CLOSES the gallery, which it would not if `pressed` were true).
   * Every later guard — `pointerId` matching, `dragArmed` — is unreachable for
   * the same reason. That is also why `useGalleryDrag.ts` sits at 58.9 % line
   * coverage while the decisions it makes, in `drag.ts`, sit at 98.4 %.
   *
   * The ARMED direction, and the "an ordinary swipe still scrolls" regression,
   * are both verified in real Chrome where a scroller actually exists —
   * `docs/sessions/S30/live-s30.mjs`, measured 650 px of overflow and
   * scrollTop 0 -> 386 on an un-armed flick, and 12 uncancelled pointermoves on
   * an armed vertical drag.
   */
  it('does NOT swallow a touchmove when no drag is in progress', () => {
    render(<LayoutGallery {...props(withFolder())} />);
    const e = new Event('touchmove', { cancelable: true, bubbles: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('S30 — while moving, an item click is a DESTINATION, not navigation', () => {
  /**
   * Until this, an item's idle action still ran mid-move and every consequence
   * was silent: clicking a folder tile drilled INTO it with the move still
   * armed, after which the breadcrumb committed an `exit` for a design that had
   * never been in that folder — a no-op write announced as "Moved X out. Y was
   * empty and is gone." Clicking a design opened it and closed the gallery,
   * abandoning the move without a word.
   *
   * It is also what makes SC 2.5.7 real: move mode has always claimed to be
   * "driven by arrow keys or by clicking a destination", and until now only the
   * breadcrumb implemented that half.
   */
  it('clicking a FOLDER TILE absorbs into it instead of drilling in', () => {
    const store = withFolder();
    const onDropLayout = vi.fn();
    const folder = store.projects[store.projects.length - 1];
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} onDropLayout={onDropLayout} />);

    fireEvent.keyDown(openerIn(itemFor(first.name)), { key: 'm' });
    fireEvent.click(screen.getByRole('button', { name: rx(`Open folder ${folder.name}`) }));

    expect(onDropLayout).toHaveBeenCalledWith(first.id, folder.id, null);
    // ...and it did NOT drill in, which is what used to strand the move.
    expect(screen.getByRole('heading').textContent).toBe('Your layouts');
    expect(document.querySelector('[role="application"]')).toBeNull();
  });

  it('clicking another DESIGN merges with it instead of opening it', () => {
    const store = withFolder();
    const onMergeLayouts = vi.fn(() => null);
    const onOpen = vi.fn();
    const home = layoutsInProject(store, homeProject(store).id);
    render(
      <LayoutGallery {...props(store)} onMergeLayouts={onMergeLayouts} onOpen={onOpen} />,
    );

    fireEvent.keyDown(openerIn(itemFor(home[0].name)), { key: 'm' });
    fireEvent.click(openerIn(itemFor(home[1].name)));

    expect(onMergeLayouts).toHaveBeenCalledWith(home[0].id, home[1].id);
    // Opening would switch layout AND close the gallery, silently losing the move.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens normally when NOTHING is being moved', () => {
    const store = withFolder();
    const onOpen = vi.fn();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} onOpen={onOpen} />);
    fireEvent.click(openerIn(itemFor(first.name)));
    expect(onOpen).toHaveBeenCalledWith(first.id);
  });
});

describe('S30 — a committed move SAYS so', () => {
  it('announces the position it landed at, not the internal display index', () => {
    // Cancelling said "Move cancelled."; succeeding said nothing at all, and a
    // same-container reorder has no toast either — so a screen-reader user could
    // not tell "it worked" from "the key did nothing".
    const store = withFolder();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} />);
    const opener = openerIn(itemFor(first.name));
    fireEvent.keyDown(opener, { key: 'm' });
    fireEvent.keyDown(opener, { key: 'ArrowRight' });
    // The step is 1, so the item lands SECOND — "Position 2", not the display
    // index's "Position 3".
    expect(screen.getByRole('status').textContent).toBe('Position 2');
    fireEvent.keyDown(opener, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe(`Moved ${first.name} to position 2.`);
  });
});

/**
 * S34 — the owner's report: *"why is there no delete layout button and wheres
 * the generate layout button. impossible to find"*.
 *
 * Both existed. Measured live in headless Chrome against the shipped build
 * (`docs/sessions/S34/look.mjs`), the home grid offered exactly four creation
 * buttons — New room… / Empty layout / Maple Court apartment / Import layout
 * (JSON)… — and `generateOnHome` was **false**. The generator, an entire engine
 * session's work, was reachable ONLY after drilling into a folder, and a
 * workspace with no folders could not reach it at all.
 *
 * These tests pin REACHABILITY FROM THE HOME GRID, which is the property that
 * was broken. They deliberately do not assert the tray's length or button order
 * — that would freeze a layout decision rather than the affordance.
 */
describe('S34 — the two affordances the owner could not find', () => {
  it('offers "Generate a design" on the HOME grid, not only inside a folder', () => {
    const store = withFolder();
    const onGenerate = vi.fn();
    render(<LayoutGallery {...props(store)} onGenerate={onGenerate} />);

    fireEvent.click(screen.getByRole('button', { name: /generate a design/i }));
    // Filed into HOME — `useGenerateDesign.keep` writes the new layout into the
    // id it was opened with, so the wrong argument would silently bury a
    // generated design inside some folder the user never opened.
    expect(onGenerate).toHaveBeenCalledWith(homeProject(store).id);
  });

  it('reaches the generator with NO folders in the workspace at all', () => {
    // The regression's WORST shape, and the one no seeded fixture can express:
    // `seededDefaultStore()` ships two folders, so every existing test had a
    // tile to drill into. A workspace with one home project and zero tiles —
    // which is what `defaultStore()` is, and what a user reaches by deleting
    // their folders — had no path to the generator whatsoever.
    const store = defaultStore();
    expect(store.projects).toHaveLength(1);
    const onGenerate = vi.fn();
    render(<LayoutGallery {...props(store)} onGenerate={onGenerate} />);

    fireEvent.click(screen.getByRole('button', { name: /generate a design/i }));
    expect(onGenerate).toHaveBeenCalledWith(homeProject(store).id);
  });

  it('still files a generated design into the folder it was launched from', () => {
    // The negative control for the change above: making the home path work must
    // not re-point the in-folder path at home. The folder is named uniquely —
    // `withFolder()` adds a second "Sketches" beside the seeded one, and
    // `itemFor` would then match whichever tile came first.
    const base = seededDefaultStore();
    const home = homeProject(base);
    const inHome = layoutsInProject(base, home.id);
    const withNew = addProject(base, 'Bench');
    const folder = withNew.projects[withNew.projects.length - 1];
    const store = moveLayoutToProject(withNew, inHome[inHome.length - 1].id, folder.id);
    const onGenerate = vi.fn();
    render(<LayoutGallery {...props(store)} onGenerate={onGenerate} />);

    fireEvent.click(openerIn(itemFor(folder.name)));
    fireEvent.click(screen.getByRole('button', { name: /generate a design/i }));
    expect(onGenerate).toHaveBeenCalledWith(folder.id);
  });

  it('can delete a design from the home grid, through the card actions menu', () => {
    // Delete was never missing — it is a MenuItem behind the card's "⋯". This
    // pins the path end to end, which nothing did before: the closest existing
    // test opens the same menu and asserts something else entirely.
    const store = withFolder();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    const onDelete = vi.fn();
    render(<LayoutGallery {...props(store)} onDelete={onDelete} />);

    fireEvent.click(within(itemFor(first.name)).getByRole('button', { name: /actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith(first.id);
  });

  it('names the card menu so its trigger is not just "⋯" to a screen reader', () => {
    // The glyph carries no meaning on its own. It measures 9.14:1 against the
    // card, so this is NOT a contrast defect — the accessible NAME is what
    // makes it findable non-visually, and the visible boundary (1.04:1 before
    // S34) is what makes it findable visually. The latter is a CSS fact jsdom
    // cannot resolve; it is guarded in `styles/__tests__/contrast.test.ts`.
    const store = withFolder();
    const first = layoutsInProject(store, homeProject(store).id)[0];
    render(<LayoutGallery {...props(store)} />);

    const trigger = within(itemFor(first.name)).getByRole('button', { name: /actions/i });
    // No jest-dom in this repo — `toHaveAttribute` is not a chai property here.
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-label')).toBe(`${first.name} actions`);
  });

  it('has no axe violations page-wide with the generator entry on the home tray', async () => {
    render(<LayoutGallery {...props(withFolder())} />);
    await expectNoAxeViolationsOnPage();
  });
});
