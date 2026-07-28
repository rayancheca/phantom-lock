/**
 * Tutorial progress + the auto-offer gate.
 *
 * Two things are being defended here, and both have bitten this project before:
 *
 * 1. The gate. S16's lesson is that `isPristineOrigin` ALONE does not exclude a
 *    returning user — the owner is an IDB-first-run migrated user with no
 *    localStorage keys at all, so a pristine-origin check would wrongly show them
 *    a "welcome to the demo" tour over their real work. The only sound signal is
 *    the boot's `firstRun` (no prior IDB meta row) AND a pristine origin AND our
 *    own standalone flag.
 * 2. Storage that throws. Safari in private mode throws on `getItem` and on
 *    `setItem`. Every access must be wrapped, and a storage we cannot READ must be
 *    treated as "already seen" so we never nag on every boot.
 */
import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_KEY,
  loadProgress,
  markChapterDone,
  markSeen,
  saveProgress,
  shouldOfferTour,
} from '../progress';

/** A minimal in-memory Storage stand-in with optional hostility. */
function fakeStorage(
  initial: Record<string, string> = {},
  opts: { throwOnGet?: boolean; throwOnSet?: boolean } = {},
) {
  const map = new Map(Object.entries(initial));
  return {
    store: map,
    getItem(k: string) {
      if (opts.throwOnGet) throw new Error('denied');
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (opts.throwOnSet) throw new Error('quota');
      map.set(k, v);
    },
    removeItem(k: string) {
      map.delete(k);
    },
  };
}

describe('tutorial progress', () => {
  it('defaults to unseen with nothing done on a blank origin', () => {
    const p = loadProgress(fakeStorage());
    expect(p.seen).toBe(false);
    expect(p.done).toEqual([]);
    expect(p.resume).toBeNull();
  });

  it('round-trips through the standalone key, never the persistence schema', () => {
    const s = fakeStorage();
    saveProgress(s, { seen: true, done: ['intro'], resume: { chapterId: 'tune', stepIndex: 2 } });
    // The ONLY key written is ours.
    expect([...s.store.keys()]).toEqual([TUTORIAL_KEY]);
    expect(TUTORIAL_KEY).toBe('phantom-lock:tutorial');
    // And it is not one of the persistence keys.
    expect(TUTORIAL_KEY).not.toBe('phantom-lock:v2');
    expect(TUTORIAL_KEY).not.toBe('phantom-lock:v1');
    const back = loadProgress(s);
    expect(back).toEqual({ seen: true, done: ['intro'], resume: { chapterId: 'tune', stepIndex: 2 } });
  });

  it('markChapterDone accumulates without duplicating and is immutable', () => {
    const p0 = { seen: false, done: ['a'], resume: null };
    const p1 = markChapterDone(p0, 'b');
    expect(p1.done).toEqual(['a', 'b']);
    const p2 = markChapterDone(p1, 'b');
    expect(p2.done).toEqual(['a', 'b']);
    // The input is never mutated.
    expect(p0.done).toEqual(['a']);
  });

  it('markSeen sets the flag and clears any stale resume point', () => {
    const p = markSeen({ seen: false, done: [], resume: { chapterId: 'a', stepIndex: 3 } });
    expect(p.seen).toBe(true);
    expect(p.resume).toBeNull();
  });


  // --- hostile / corrupt stored values --------------------------------------

  it('survives every shape of corrupt stored value', () => {
    for (const raw of [
      'not json',
      'null',
      '[]',
      '42',
      '"a string"',
      '{}',
      '{"done":"not-an-array"}',
      '{"done":[1,2,3]}',
      '{"resume":{"chapterId":5,"stepIndex":"x"}}',
      '{"resume":"nope"}',
      '{"seen":"yes"}',
    ]) {
      const p = loadProgress(fakeStorage({ [TUTORIAL_KEY]: raw }));
      expect(Array.isArray(p.done)).toBe(true);
      expect(p.done.every((d) => typeof d === 'string')).toBe(true);
      expect(typeof p.seen).toBe('boolean');
      expect(p.resume === null || typeof p.resume.chapterId === 'string').toBe(true);
      if (p.resume) expect(Number.isInteger(p.resume.stepIndex)).toBe(true);
    }
  });

  it('a storage that throws on read reports "seen" so we never nag every boot', () => {
    const p = loadProgress(fakeStorage({}, { throwOnGet: true }));
    expect(p.seen).toBe(true);
  });

  it('a storage that throws on write does not propagate', () => {
    expect(() =>
      saveProgress(fakeStorage({}, { throwOnSet: true }), { seen: true, done: [], resume: null }),
    ).not.toThrow();
  });

  // --- the auto-offer gate ---------------------------------------------------

  it('offers the tour on a genuine first run', () => {
    expect(shouldOfferTour({ firstRun: true, pristineOrigin: true }, fakeStorage())).toBe(true);
  });

  it('does NOT offer to a returning IDB user who has no localStorage keys (the S16 trap)', () => {
    // firstRun=false is the ONLY thing distinguishing this user: their origin IS
    // pristine (migrated to IDB, legacy keys long gone) and they have never seen
    // the tour. A pristine-origin-only gate would show it over their real work.
    expect(shouldOfferTour({ firstRun: false, pristineOrigin: true }, fakeStorage())).toBe(false);
  });

  it('does NOT offer when the origin has prior Phantom Lock data', () => {
    expect(shouldOfferTour({ firstRun: true, pristineOrigin: false }, fakeStorage())).toBe(false);
  });

  it('does NOT offer once it has been seen', () => {
    const s = fakeStorage({ [TUTORIAL_KEY]: '{"seen":true,"done":[],"resume":null}' });
    expect(shouldOfferTour({ firstRun: true, pristineOrigin: true }, s)).toBe(false);
  });

  it('does NOT offer when storage is unreadable (fails closed)', () => {
    const s = fakeStorage({}, { throwOnGet: true });
    expect(shouldOfferTour({ firstRun: true, pristineOrigin: true }, s)).toBe(false);
  });
});
