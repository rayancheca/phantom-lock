import { describe, expect, it } from 'vitest';
import { updateLayout } from '../store';
import type { Layout, LayoutStore } from '../../../engine/types';

const layout = (id: string, name: string, updatedAt = 1): Layout =>
  ({ id, name, updatedAt, scene: { tag: id }, settings: {} } as unknown as Layout);

const store = (): LayoutStore => ({
  layouts: [layout('a', 'A'), layout('b', 'B'), layout('c', 'C')],
  activeId: 'b',
});

describe('updateLayout', () => {
  it('replaces only the matching layout via the updater fn', () => {
    const s = store();
    const next = updateLayout(s, 'b', (l) => ({ ...l, name: 'B2', updatedAt: 99 }));
    expect(next.layouts.map((l) => l.name)).toEqual(['A', 'B2', 'C']);
    expect(next.layouts[1].updatedAt).toBe(99);
  });

  it('preserves activeId and every non-matching layout by reference', () => {
    const s = store();
    const next = updateLayout(s, 'b', (l) => ({ ...l, name: 'B2' }));
    expect(next.activeId).toBe('b');
    expect(next.layouts[0]).toBe(s.layouts[0]); // A untouched (same ref)
    expect(next.layouts[2]).toBe(s.layouts[2]); // C untouched (same ref)
  });

  it('does not mutate the input store', () => {
    const s = store();
    const before = JSON.stringify(s);
    updateLayout(s, 'b', (l) => ({ ...l, name: 'B2' }));
    expect(JSON.stringify(s)).toBe(before);
    expect(s.layouts[1].name).toBe('B'); // original unchanged
  });

  it('returns a new store + new layouts array (fresh references)', () => {
    const s = store();
    const next = updateLayout(s, 'b', (l) => l);
    expect(next).not.toBe(s);
    expect(next.layouts).not.toBe(s.layouts);
  });

  it('no-ops the content when the id is absent (fn never called)', () => {
    const s = store();
    let called = false;
    const next = updateLayout(s, 'zzz', (l) => {
      called = true;
      return l;
    });
    expect(called).toBe(false);
    expect(next.layouts.map((l) => l.name)).toEqual(['A', 'B', 'C']);
  });
});
