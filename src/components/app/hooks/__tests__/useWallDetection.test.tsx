import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Scene, WallObj } from '../../../../engine/types';
import type { DetectionQuality } from '../../../../engine/detect';

/**
 * The detection hook — the seam where a proposal becomes scene data.
 *
 * `detectWallsFromUnderlay` is the only DOM-bound part of detection (it decodes
 * an image through a real `<canvas>`), so it is mocked here and the PURE
 * pipeline behind it is covered exhaustively in `engine/__tests__` and
 * `engine/vision/__tests__`. What can only be tested here is what happens to
 * the user's scene: that a refusal explains itself and commits nothing, that
 * struck-off walls are excluded, and that accepting is additive and undoable.
 */

const detectMock = vi.fn();
vi.mock('../../../../engine/detect', () => ({
  detectWallsFromUnderlay: (...args: unknown[]) => detectMock(...args),
}));

const { useWallDetection, SENSITIVITY, nextLevelHint } = await import('../useWallDetection');

function wall(id: string, x: number): WallObj {
  return { id, kind: 'wall', a: { x, y: 0 }, b: { x, y: 3 }, absorption: 0.1, height: 2.7, label: 'Wall' };
}

const QUALITY: DetectionQuality = {
  confidence: 0.9,
  refusal: null,
  cause: null,
  wallCount: 3,
  support: 1,
  structure: 0.9,
  explained: 0.95,
  totalLength: 9,
};

function harness(initial?: Partial<Scene>) {
  let scene: Scene = {
    objects: [],
    speakers: [],
    pairs: [],
    listener: { pos: { x: 1, y: 1 }, z: 1.2 },
    underlay: {
      src: 'data:image/png;base64,x',
      wPx: 100,
      hPx: 100,
      center: { x: 0, y: 0 },
      scale: 0.05,
      rotation: 0,
      opacity: 1,
    },
    ...initial,
  } as Scene;
  const setScene = vi.fn((fn: (s: Scene) => Scene) => {
    scene = fn(scene);
  });
  const showToast = vi.fn();
  const undoScene = vi.fn();
  const setMode = vi.fn();
  const view = renderHook(() =>
    useWallDetection({
      get scene() {
        return scene;
      },
      setScene,
      showToast,
      undoScene,
      setMode,
    }),
  );
  return { view, setScene, showToast, undoScene, setMode, read: () => scene };
}

beforeEach(() => detectMock.mockReset());

describe('nextLevelHint', () => {
  // Driven directly as well as through the toast, because the toast tests can
  // only reach the level they dispatch and the middle case is the interesting
  // one: 'balanced' + a structure refusal must still advance to 'thorough'.
  it('advances one level for a non-structural cause', () => {
    expect(nextLevelHint('careful', 'too-few-lines')).toContain('Balanced');
    expect(nextLevelHint('balanced', 'broken-lines')).toContain('Thorough');
  });

  it('skips the level the engine already consulted, for a structural one', () => {
    expect(nextLevelHint('careful', 'unstructured')).toContain('Thorough');
    expect(nextLevelHint('balanced', 'unstructured')).toContain('Thorough');
  });

  it('offers nothing at the top, and nothing when there is no refusal to explain', () => {
    expect(nextLevelHint('thorough', 'unstructured')).toBe('');
    expect(nextLevelHint('thorough', 'too-few-lines')).toBe('');
    expect(nextLevelHint('careful', null)).toBe('');
  });

  it('never blames the knob for a browser failure', () => {
    for (const level of ['careful', 'balanced', 'thorough'] as const) {
      expect(nextLevelHint(level, 'unreadable')).toBe('');
    }
  });
});

describe('useWallDetection', () => {
  it('does nothing without an underlay — no call, no toast', async () => {
    const h = harness({ underlay: undefined });
    act(() => h.view.result.current.run());
    expect(detectMock).not.toHaveBeenCalled();
    expect(h.view.result.current.proposal).toBeNull();
  });

  it('offers a reviewable proposal and writes NOTHING until accepted', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0), wall('b', 1), wall('c', 2)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());
    expect(h.view.result.current.proposal!.walls).toHaveLength(3);
    expect(h.setScene).not.toHaveBeenCalled();
    expect(h.setMode).toHaveBeenCalledWith('select');
  });

  it('SURFACES A REFUSAL as a sentence and commits nothing', async () => {
    // The old code emitted one message for four distinct causes, including a
    // browser failure to get a 2D context — telling the user their floorplan
    // was the problem when it was not.
    detectMock.mockResolvedValue({
      walls: [],
      quality: { ...QUALITY, refusal: "This image doesn't look like a floorplan." },
    });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.showToast).toHaveBeenCalled());
    expect(h.showToast.mock.calls[0][0]).toMatch(/floorplan/);
    expect(h.showToast.mock.calls[0][1]).toMatchObject({ tone: 'bad' });
    expect(h.view.result.current.proposal).toBeNull();
    expect(h.setScene).not.toHaveBeenCalled();
  });

  it('...and POINTS AT THE KNOB, skipping the level the engine already tried', async () => {
    // S26: a gamma-1.08 capture of a real floorplan is REFUSED at 'Careful'
    // (structure 0.000) and reads 42 walls at 'Thorough' (0.607) — so the
    // refusal has to name a control, or the user is told their floorplan is not
    // a floorplan while the fix sits one click away.
    //
    // But it must name the RIGHT one. A `unstructured` refusal has already
    // consulted the Balanced reading inside the same call (that is what
    // `referenceStructure` is) and found it short too, so suggesting Balanced
    // is provably futile — measured, 5 of 5 such suggestions would have failed.
    detectMock.mockResolvedValue({
      walls: [],
      quality: { ...QUALITY, refusal: 'No rooms.', cause: 'unstructured' as const },
    });
    const h = harness();
    act(() => h.view.result.current.run('careful'));
    await waitFor(() => expect(h.showToast).toHaveBeenCalled());
    expect(h.showToast.mock.calls[0][0]).toBe('No rooms. Try “Thorough” to look harder.');
  });

  it('...suggests the very next level when the cause is NOT structural', async () => {
    // `too-few-lines` never consults a second reading, so Balanced is a genuine
    // untried option from Careful.
    detectMock.mockResolvedValue({
      walls: [],
      quality: { ...QUALITY, refusal: 'Not enough lines.', cause: 'too-few-lines' as const },
    });
    const h = harness();
    act(() => h.view.result.current.run('careful'));
    await waitFor(() => expect(h.showToast).toHaveBeenCalled());
    expect(h.showToast.mock.calls[0][0]).toBe('Not enough lines. Try “Balanced” to look harder.');
  });

  it('...offers no false hope at the most thorough level', async () => {
    detectMock.mockResolvedValue({
      walls: [],
      quality: { ...QUALITY, refusal: 'No rooms.', cause: 'unstructured' as const },
    });
    const h = harness();
    act(() => h.view.result.current.run('thorough'));
    await waitFor(() => expect(h.showToast).toHaveBeenCalled());
    expect(h.showToast.mock.calls[0][0]).toBe('No rooms.');
  });

  it('...and NEVER blames a knob for a browser failure', async () => {
    // "This browser could not read the image. Try Thorough to look harder." is
    // the exact misdirection the refusal sentences were split up to remove — a
    // sensitivity knob cannot supply a 2D context.
    detectMock.mockResolvedValue({
      walls: [],
      quality: {
        ...QUALITY,
        refusal: 'This browser could not read the image.',
        cause: 'unreadable' as const,
      },
    });
    const h = harness();
    act(() => h.view.result.current.run('careful'));
    await waitFor(() => expect(h.showToast).toHaveBeenCalled());
    expect(h.showToast.mock.calls[0][0]).toBe('This browser could not read the image.');
  });

  it('REPORTS a rejected promise rather than failing silently, and recovers', async () => {
    // One test rather than two: the recovery assertion needs the same failing
    // run, and splitting them made the runner attribute the (handled)
    // rejection to whichever test asserted on it.
    const rejected = Promise.reject(new Error('bad image'));
    rejected.catch(() => {});
    detectMock.mockImplementation(() => rejected);
    const h = harness();
    await act(async () => {
      h.view.result.current.run();
    });
    await waitFor(() => expect(h.showToast).toHaveBeenCalled());
    expect(h.showToast.mock.calls[0][0]).toMatch(/Could not read/);
    expect(h.showToast.mock.calls[0][1]).toMatchObject({ tone: 'bad' });
    expect(h.view.result.current.proposal).toBeNull();
    expect(h.setScene).not.toHaveBeenCalled();

    // The busy flag must clear on the failing path too — a stuck ref would
    // wedge the button forever with no way back.
    await waitFor(() => expect(h.view.result.current.detecting).toBe(false));
    detectMock.mockImplementation(() => Promise.resolve({ walls: [wall('a', 0)], quality: QUALITY }));
    act(() => h.view.result.current.run());
    await waitFor(() => expect(detectMock).toHaveBeenCalledTimes(2));
  });

  it('passes the chosen sensitivity through', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run('thorough'));
    await waitFor(() => expect(detectMock).toHaveBeenCalled());
    expect(detectMock.mock.calls[0][1]).toEqual({ sensitivity: SENSITIVITY.thorough.value });
  });

  it('drops struck-off walls from the ghost AND from what is committed', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0), wall('b', 1), wall('c', 2)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());

    act(() => h.view.result.current.toggleWall('b'));
    expect(h.view.result.current.keptWalls?.map((w) => w.id)).toEqual(['a', 'c']);

    act(() => h.view.result.current.accept());
    expect(h.read().objects.map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('toggling twice puts a wall back', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0), wall('b', 1)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());
    act(() => h.view.result.current.toggleWall('a'));
    act(() => h.view.result.current.toggleWall('a'));
    expect(h.view.result.current.keptWalls).toHaveLength(2);
  });

  it('accepting is ADDITIVE — existing objects survive — and is undoable', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0)], quality: QUALITY });
    const existing = wall('mine', 9);
    const h = harness({ objects: [existing] });
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());
    act(() => h.view.result.current.accept());

    expect(h.read().objects[0]).toBe(existing);
    expect(h.read().objects.map((o) => o.id)).toEqual(['mine', 'a']);
    const toast = h.showToast.mock.calls.at(-1)!;
    expect(toast[0]).toMatch(/Added 1 wall/);
    toast[1].action.run();
    expect(h.undoScene).toHaveBeenCalled();
  });

  it('drops the underlay opacity so the accepted walls read over it', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());
    act(() => h.view.result.current.accept());
    expect(h.read().underlay!.opacity).toBeLessThanOrEqual(0.25);
  });

  it('refuses to commit an EMPTY selection, and says so instead of doing nothing', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());
    act(() => h.view.result.current.toggleWall('a'));
    act(() => h.view.result.current.accept());
    expect(h.setScene).not.toHaveBeenCalled();
    expect(h.showToast.mock.calls.at(-1)![0]).toMatch(/Nothing left to add/);
    // The proposal stays up, so the user can put a wall back rather than losing it.
    expect(h.view.result.current.proposal).not.toBeNull();
  });

  it('discard writes nothing', async () => {
    detectMock.mockResolvedValue({ walls: [wall('a', 0)], quality: QUALITY });
    const h = harness();
    act(() => h.view.result.current.run());
    await waitFor(() => expect(h.view.result.current.proposal).not.toBeNull());
    act(() => h.view.result.current.discard());
    expect(h.view.result.current.proposal).toBeNull();
    expect(h.setScene).not.toHaveBeenCalled();
  });

  it('exposes three named sensitivity levels in increasing order', () => {
    expect(SENSITIVITY.careful.value).toBeLessThan(SENSITIVITY.balanced.value);
    expect(SENSITIVITY.balanced.value).toBeLessThan(SENSITIVITY.thorough.value);
    for (const level of Object.values(SENSITIVITY)) {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.hint.length).toBeGreaterThan(0);
    }
  });
});
