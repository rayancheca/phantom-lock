import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { RectObj, Scene, Selection } from '../../../engine/types';
import InspectorPanel from '../InspectorPanel';

afterEach(cleanup);

const door: RectObj = {
  id: 'door-1',
  kind: 'rect',
  center: { x: 1, y: 0 },
  w: 0.9,
  h: 0.1,
  rotation: 0,
  absorption: 0.25,
  label: 'Door',
  role: 'door',
  doorOpen: true,
  height: 2.05,
  swingDeg: 90,
  hingeEnd: 'start',
  swingSide: 'in',
};

const box: RectObj = {
  id: 'box-1',
  kind: 'rect',
  center: { x: 2, y: 2 },
  w: 1,
  h: 1,
  rotation: 0,
  absorption: 0.3,
  label: 'Sofa',
  role: 'furniture',
  height: 0.8,
};

const scene = (obj: RectObj): Scene =>
  ({
    objects: [obj],
    speakers: [],
    pairs: [],
    listener: { pos: { x: 0, y: 0 }, z: 1.2 },
    listeners: [{ id: 's1', name: 'Seat', pos: { x: 0, y: 0 }, z: 1.2 }],
    activeListenerId: 's1',
  }) as Scene;

const noop = () => {};

function renderInspector(obj: RectObj, onUpdateObject = vi.fn()) {
  const selection: Selection = { type: 'object', id: obj.id };
  const result = render(
    <InspectorPanel
      scene={scene(obj)}
      selection={selection}
      onUpdateObject={onUpdateObject}
      onDeleteObject={noop}
      onUpdateSpeaker={noop}
      onDeleteSpeaker={noop}
      onSetPair={noop}
      onUpdateListener={noop}
      onSplitWall={noop}
      onDeleteMulti={noop}
    />,
  );
  return { ...result, onUpdateObject };
}

describe('InspectorPanel — door branch (S17)', () => {
  it('renders a swing slider (0–180) with an aria-live=off output', () => {
    const { getByRole, container } = renderInspector(door);
    const slider = getByRole('slider', { name: /swing/i });
    expect(slider.getAttribute('min')).toBe('0');
    expect(slider.getAttribute('max')).toBe('180');
    expect(container.querySelector('output[aria-live="off"]')).not.toBeNull();
  });

  it('has a door width field bounded to real door sizes (0.6–2.4)', () => {
    const { getByRole } = renderInspector(door);
    const width = getByRole('spinbutton', { name: /width/i });
    expect(width.getAttribute('min')).toBe('0.6');
    expect(width.getAttribute('max')).toBe('2.4');
  });

  it('exposes hinge + swing as aria-pressed buttons in role=group (NOT radiogroup)', () => {
    const { getAllByRole, queryByRole } = renderInspector(door);
    expect(queryByRole('radiogroup')).toBeNull(); // the S7 lesson: no roving-tabindex contract
    const groups = getAllByRole('group');
    const hinge = groups.find((g) => /hinge/i.test(g.getAttribute('aria-label') ?? ''));
    const swing = groups.find((g) => /swing direction/i.test(g.getAttribute('aria-label') ?? ''));
    expect(hinge).toBeTruthy();
    expect(swing).toBeTruthy();
    for (const btn of within(hinge!).getAllByRole('button')) {
      expect(btn.hasAttribute('aria-pressed')).toBe(true);
    }
    for (const btn of within(swing!).getAllByRole('button')) {
      expect(btn.hasAttribute('aria-pressed')).toBe(true);
    }
  });

  it('flips hinge / changes swing angle / toggles open via the door controls', () => {
    const onUpdateObject = vi.fn();
    const { getAllByRole, getByRole } = renderInspector(door, onUpdateObject);
    const groups = getAllByRole('group');
    const hinge = groups.find((g) => /hinge/i.test(g.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(within(hinge).getAllByRole('button')[1]); // the 'end' option
    expect(onUpdateObject).toHaveBeenCalledWith('door-1', { hingeEnd: 'end' });

    fireEvent.change(getByRole('slider', { name: /swing/i }), { target: { value: '45' } });
    expect(onUpdateObject).toHaveBeenCalledWith('door-1', { swingDeg: 45 });

    fireEvent.click(getByRole('checkbox', { name: /open/i }));
    expect(onUpdateObject).toHaveBeenCalledWith('door-1', { doorOpen: false });
  });

  it('keeps the shared Height + Absorption fields (closed-door acoustics stay editable)', () => {
    const { getByRole } = renderInspector(door);
    expect(getByRole('spinbutton', { name: /height/i })).toBeTruthy();
    expect(getByRole('slider', { name: /absorption/i })).toBeTruthy();
    expect(getByRole('combobox', { name: /material/i })).toBeTruthy();
  });

  it('does NOT show a free Rotation slider for a door', () => {
    const { queryByRole } = renderInspector(door);
    expect(queryByRole('slider', { name: /rotation/i })).toBeNull();
  });

  it('a non-door rect shows none of the door controls and keeps Rotation', () => {
    const { queryByRole, getByRole } = renderInspector(box);
    expect(getByRole('slider', { name: /rotation/i })).toBeTruthy();
    expect(queryByRole('slider', { name: /swing/i })).toBeNull();
    expect(queryByRole('group', { name: /hinge/i })).toBeNull();
  });
});
