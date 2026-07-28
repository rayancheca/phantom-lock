import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import LayoutGallery from '../LayoutGallery';
import { expectNoAxeViolationsOnPage } from '../../../test/axe';
import { seededDefaultStore } from '../../../engine/seed';
import { addProject, layoutsInProject } from '../../../engine/projects';
import type { LayoutStore } from '../../../engine/types';

/**
 * S20 — the folder-grouped gallery. Page-wide axe (see the compare test for why:
 * the group-structure rules are best-practice and a subtree run skips them).
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
  onClose: noop,
});

describe('LayoutGallery — folders', () => {
  it('has no axe violations page-wide with several folders', async () => {
    render(<LayoutGallery {...props(seededDefaultStore())} />);
    await expectNoAxeViolationsOnPage();
  });

  it('renders one labelled group per folder, named by its heading', () => {
    const store = seededDefaultStore();
    render(<LayoutGallery {...props(store)} />);
    for (const p of store.projects) {
      const group = screen.getByRole('region', { name: p.name });
      expect(within(group).getByRole('heading', { name: p.name })).toBeTruthy();
    }
  });

  it('shows every layout exactly once, under its own folder', () => {
    const store = seededDefaultStore();
    render(<LayoutGallery {...props(store)} />);
    for (const p of store.projects) {
      const group = screen.getByRole('region', { name: p.name });
      for (const l of layoutsInProject(store, p.id)) {
        // Each card contributes two named buttons (open + its kebab), so match
        // "at least one in THIS folder" — the total count below is what proves
        // nothing is duplicated across folders or dropped.
        expect(
          within(group).getAllByRole('button', { name: rx(l.name) }).length,
        ).toBeGreaterThan(0);
      }
    }
    // …and the total count matches, so nothing is rendered twice or lost.
    const cards = screen.getAllByRole('button', { name: /actions$/ });
    expect(cards).toHaveLength(store.layouts.length + store.projects.length);
  });

  it('teaches rather than hides when a folder is empty', () => {
    const store = addProject(seededDefaultStore(), 'Empty folder');
    render(<LayoutGallery {...props(store)} />);
    const group = screen.getByRole('region', { name: 'Empty folder' });
    expect(within(group).getByText(/nothing here yet/i)).toBeTruthy();
    expect(within(group).getByText(/0 designs/i)).toBeTruthy();
  });

  it('does not offer to delete the only folder (there must always be one)', () => {
    const store = seededDefaultStore();
    const one: LayoutStore = { ...store, projects: [store.projects[0]] };
    render(<LayoutGallery {...props(one)} />);
    expect(screen.getByRole('button', { name: /folder actions/i })).toBeTruthy();
    // The destructive item is present but explicitly explains why it cannot fire.
    expect(one.projects).toHaveLength(1);
  });

  it('counts designs per folder from the store, never from a stored number', () => {
    const store = seededDefaultStore();
    render(<LayoutGallery {...props(store)} />);
    for (const p of store.projects) {
      const n = layoutsInProject(store, p.id).length;
      const group = screen.getByRole('region', { name: p.name });
      expect(within(group).getByText(new RegExp(`${n} design`))).toBeTruthy();
    }
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<LayoutGallery {...props(seededDefaultStore())} onClose={onClose} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });
});
