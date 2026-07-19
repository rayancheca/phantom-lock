import { describe, expect, it } from 'vitest';
import { emptyBucket, historyPush, historyRedo, historyUndo, HISTORY_CAP } from '../history';
import type { Scene } from '../../../engine/types';

// Minimal fake scenes — history treats them as opaque references.
const scn = (tag: string): Scene => ({ tag } as unknown as Scene);

describe('historyPush', () => {
  it('pushes the pre-edit scene onto past and clears future', () => {
    const a = scn('a');
    const b = scn('b');
    const start = { past: [scn('x')], future: [b] };
    const next = historyPush(start, a, { coalesce: false });
    expect(next.past).toEqual([scn('x'), a]);
    expect(next.future).toEqual([]); // future ALWAYS cleared on a scene-changing edit
  });

  it('does NOT push when coalescing, but STILL clears future', () => {
    const a = scn('a');
    const start = { past: [scn('x')], future: [scn('f')] };
    const next = historyPush(start, a, { coalesce: true });
    expect(next.past).toEqual([scn('x')]); // no new entry
    expect(next.future).toEqual([]); // still cleared (skeptic: unconditional)
  });

  it('dedups an identical pre-edit scene at the top of past', () => {
    const a = scn('a');
    const start = { past: [a], future: [] };
    const next = historyPush(start, a, { coalesce: false });
    expect(next.past).toEqual([a]); // guard prevents adjacent duplicate
  });

  it('caps past at HISTORY_CAP, dropping the oldest', () => {
    const past = Array.from({ length: HISTORY_CAP }, (_, i) => scn(`p${i}`));
    const start = { past, future: [] };
    const pre = scn('new');
    const next = historyPush(start, pre, { coalesce: false });
    expect(next.past.length).toBe(HISTORY_CAP);
    expect(next.past[next.past.length - 1]).toBe(pre);
    expect(next.past[0]).toBe(past[1]); // oldest (p0) dropped
  });

  it('does not mutate the input bucket', () => {
    const start = { past: [scn('x')], future: [scn('f')] };
    const snapshot = { past: [...start.past], future: [...start.future] };
    historyPush(start, scn('a'), { coalesce: false });
    expect(start).toEqual(snapshot);
  });
});

describe('historyUndo', () => {
  it('returns null when past is empty', () => {
    expect(historyUndo({ past: [], future: [] }, scn('cur'))).toBeNull();
  });

  it('pops past top as the target scene and pushes current onto future', () => {
    const prev = scn('prev');
    const cur = scn('cur');
    const res = historyUndo({ past: [scn('old'), prev], future: [] }, cur);
    expect(res).not.toBeNull();
    expect(res!.scene).toBe(prev);
    expect(res!.bucket.past).toEqual([scn('old')]);
    expect(res!.bucket.future).toEqual([cur]);
  });
});

describe('historyRedo', () => {
  it('returns null when future is empty', () => {
    expect(historyRedo({ past: [], future: [] }, scn('cur'))).toBeNull();
  });

  it('pops future top as the target scene and pushes current onto past', () => {
    const nextScene = scn('next');
    const cur = scn('cur');
    const res = historyRedo({ past: [scn('p')], future: [scn('f0'), nextScene] }, cur);
    expect(res).not.toBeNull();
    expect(res!.scene).toBe(nextScene);
    expect(res!.bucket.past).toEqual([scn('p'), cur]);
    expect(res!.bucket.future).toEqual([scn('f0')]);
  });
});

describe('undo/redo round-trip', () => {
  it('undo then redo restores the original current scene', () => {
    const pre = scn('pre');
    const cur = scn('cur');
    const afterUndo = historyUndo({ past: [pre], future: [] }, cur)!;
    expect(afterUndo.scene).toBe(pre);
    const afterRedo = historyRedo(afterUndo.bucket, afterUndo.scene)!;
    expect(afterRedo.scene).toBe(cur);
    expect(afterRedo.bucket.past).toEqual([pre]);
    expect(afterRedo.bucket.future).toEqual([]);
  });
});

describe('emptyBucket', () => {
  it('is a fresh empty history bucket', () => {
    expect(emptyBucket()).toEqual({ past: [], future: [] });
    // fresh instance each call (no shared mutable arrays)
    expect(emptyBucket().past).not.toBe(emptyBucket().past);
  });
});
