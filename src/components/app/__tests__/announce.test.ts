import { describe, expect, it } from 'vitest';
import type { VerdictView } from '../../panels/verdict';
import {
  type AnnounceInput,
  type SettleState,
  announcementFor,
  countsChanged,
  initSettle,
  sceneSentence,
  speakableUnits,
  stepSettle,
  verdictSentence,
} from '../announce';

const verdict = (over: Partial<VerdictView> = {}): VerdictView => ({
  kind: 'pair',
  headline: 'Phantom center locked',
  state: 'locked',
  quality: 0.92,
  locked: true,
  cause: 'Equal paths and a 60° triangle — the phantom center sits right where it should.',
  ...over,
});

const input = (over: Partial<AnnounceInput> = {}): AnnounceInput => ({
  appMode: 'tune',
  seatName: 'Couch',
  seatCount: 1,
  speakerCount: 2,
  wallCount: 14,
  objectCount: 9,
  areaCount: 3,
  showBestSpot: true,
  bestSpotFound: true,
  verdict: verdict(),
  ...over,
});

// --- speakableUnits ---------------------------------------------------------

describe('speakableUnits', () => {
  it('expands ms to milliseconds', () =>
    expect(speakableUnits('arrives 0.24 ms earlier')).toBe('arrives 0.24 milliseconds earlier'));
  it('expands dB to decibels', () =>
    expect(speakableUnits('is 1.8 dB louder')).toBe('is 1.8 decibels louder'));
  it('expands the degree sign', () =>
    expect(speakableUnits('subtends 58° at your head')).toBe('subtends 58 degrees at your head'));
  it('expands cm and m', () => {
    expect(speakableUnits('misses by 12 cm')).toBe('misses by 12 centimetres');
    expect(speakableUnits('a 3.20 m wall')).toBe('a 3.20 metres wall');
  });
  it('leaves unrelated prose untouched', () =>
    expect(speakableUnits('Pull Left back or bring Right closer.')).toBe(
      'Pull Left back or bring Right closer.'));
  it('is idempotent', () => {
    const once = speakableUnits('0.24 ms and 1.8 dB');
    expect(speakableUnits(once)).toBe(once);
  });
  it('does not corrupt a word merely containing the unit letters', () =>
    expect(speakableUnits('the images matter')).toBe('the images matter'));
});

// --- sentences --------------------------------------------------------------

describe('sceneSentence', () => {
  it('states every count, with singular/plural agreement', () =>
    expect(sceneSentence(input({ wallCount: 1, objectCount: 1, areaCount: 1, speakerCount: 1, seatCount: 1 })))
      .toContain('1 wall, 1 object, 1 area, 1 speaker, 1 listening spot'));
  it('pluralises correctly', () =>
    expect(sceneSentence(input())).toContain('14 walls, 9 objects, 3 areas, 2 speakers, 1 listening spot'));
  it('states zero counts rather than omitting them', () =>
    expect(sceneSentence(input({ speakerCount: 0 }))).toContain('0 speakers'));
  it('reports the best spot when the overlay is ON and one was found', () =>
    expect(sceneSentence(input({ showBestSpot: true, bestSpotFound: true })))
      .toContain('Best listening spot found'));
  it('reports "no best listening spot" when the overlay is ON and none was found', () =>
    expect(sceneSentence(input({ showBestSpot: true, bestSpotFound: false })))
      .toContain('No best listening spot'));
  it('OMITS the best-spot clause entirely when the overlay is off', () => {
    // bestSpot is null for two different reasons; saying "not found" when the
    // overlay is simply disabled would be a lie.
    const s = sceneSentence(input({ showBestSpot: false, bestSpotFound: false }));
    expect(s.toLowerCase()).not.toContain('best listening spot');
  });
});

describe('verdictSentence', () => {
  it('is empty in DESIGN — no acoustics narration while building', () =>
    expect(verdictSentence(input({ appMode: 'design', verdict: null }))).toBe(''));
  it('leads with the seat name so a seat switch can never be misheard as a new lock', () =>
    expect(verdictSentence(input())).toMatch(/^Couch: /));
  it('carries the headline and the cause', () => {
    const s = verdictSentence(input());
    expect(s).toContain('Phantom center locked');
    expect(s).toContain('60 degrees triangle');
  });
  it('rounds quality to the nearest 5 percent to damp per-frame jitter', () => {
    expect(verdictSentence(input({ verdict: verdict({ quality: 0.923 }) }))).toContain('90 percent');
    expect(verdictSentence(input({ verdict: verdict({ quality: 0.938 }) }))).toContain('95 percent');
  });
  it('gives teaching copy when there are no speakers', () =>
    expect(verdictSentence(input({ verdict: verdict({ kind: 'no-speakers', headline: 'No speakers', cause: null }) })))
      .toContain('Place a stereo pair'));
  it('gives teaching copy when nothing is paired', () =>
    expect(verdictSentence(input({ verdict: verdict({ kind: 'no-pair', headline: 'No stereo pair', cause: null }) })))
      .toContain('Pair two matching speakers'));
});

describe('countsChanged / announcementFor', () => {
  it('detects a change in any count', () => {
    expect(countsChanged(input(), input())).toBe(false);
    expect(countsChanged(input(), input({ speakerCount: 3 }))).toBe(true);
    expect(countsChanged(input(), input({ areaCount: 4 }))).toBe(true);
  });
  it('ignores verdict-only differences', () =>
    expect(countsChanged(input(), input({ verdict: verdict({ locked: false }) }))).toBe(false));

  it('includes the scene inventory on the FIRST announcement', () =>
    expect(announcementFor(input(), null)).toContain('14 walls'));

  it('OMITS the scene inventory when the counts did not change', () => {
    // The flood case: a deliberate arrow-nudge is slower than the settle window,
    // so without this every keypress re-reads the whole 45-word inventory.
    const out = announcementFor(input({ verdict: verdict({ locked: false, headline: 'Almost there' }) }), input());
    expect(out).toContain('Almost there');
    expect(out).not.toContain('14 walls');
  });

  it('re-includes the inventory when a count DOES change', () =>
    expect(announcementFor(input({ speakerCount: 3 }), input())).toContain('3 speakers'));

  it('composes with exactly one space and no trailing whitespace', () => {
    const out = announcementFor(input(), null);
    expect(out).toBe(out.trim());
    expect(out).not.toMatch(/ {2}/);
  });

  it('is scene-only in DESIGN', () => {
    const out = announcementFor(input({ appMode: 'design', verdict: null }), null);
    expect(out).toContain('14 walls');
    expect(out).not.toContain('Couch:');
  });
});

// --- the settle reducer (genuinely the shipped implementation) --------------

describe('stepSettle', () => {
  const QUIET = 700;
  const run = (seed: string, steps: Array<[string, number]>, quiet = QUIET) => {
    let st: SettleState = initSettle(seed);
    const out: string[] = [];
    for (const [next, now] of steps) {
      const r = stepSettle(st, next, now, quiet);
      st = r.state;
      if (r.announce !== null) out.push(r.announce);
    }
    return { state: st, announced: out };
  };

  it('never announces the value it was seeded with (mount is not an event)', () =>
    expect(run('A', [['A', 0], ['A', 1000], ['A', 5000]]).announced).toEqual([]));

  it('announces once after the quiet window elapses', () =>
    expect(run('A', [['B', 0], ['B', 800]]).announced).toEqual(['B']));

  it('collapses a burst inside one window to the FINAL value only', () =>
    expect(run('A', [['B', 0], ['C', 100], ['D', 200], ['D', 1000]]).announced).toEqual(['D']));

  it('emits twice for two genuinely separated changes', () =>
    expect(run('A', [['B', 0], ['B', 800], ['C', 900], ['C', 1700]]).announced).toEqual(['B', 'C']));

  it('says NOTHING for a net-zero round trip A->B->A', () => {
    // The S15 "nudge off-apex and back re-locks exactly" case. A naive
    // last-pending debounce announces the unchanged value.
    expect(run('A', [['B', 0], ['A', 100], ['A', 1000]]).announced).toEqual([]);
  });

  it('does not re-announce a value that is already the announced one', () =>
    expect(run('A', [['A', 0], ['A', 800]]).announced).toEqual([]));

  it('is idempotent for a repeated (value, now) — React batching / StrictMode', () => {
    const a = run('A', [['B', 0], ['B', 0], ['B', 800]]);
    expect(a.announced).toEqual(['B']);
  });

  it('resets the quiet window when a DIFFERENT value arrives mid-window', () => {
    // B at t=0, C at t=600: C must wait until 1300, not fire at 700.
    expect(run('A', [['B', 0], ['C', 600], ['C', 700]]).announced).toEqual([]);
    expect(run('A', [['B', 0], ['C', 600], ['C', 1400]]).announced).toEqual(['C']);
  });

  it('emits on the next step when the window is zero, and never twice', () =>
    expect(run('A', [['B', 0], ['B', 0], ['B', 1]], 0).announced).toEqual(['B']));

  it('survives 400 drag frames of churn with a single settled emission', () => {
    // The real drag shape: the cause sentence carries several volatile floats, so
    // the string genuinely changes on most frames. The quiet window (not a string
    // identity check) is what prevents the flood.
    const steps: Array<[string, number]> = [];
    for (let i = 0; i < 400; i++) steps.push([`Couch: almost there, ${i} percent`, i * 16]);
    steps.push(['Couch: phantom center locked', 400 * 16]);
    steps.push(['Couch: phantom center locked', 400 * 16 + 800]);
    expect(run('Couch: searching', steps).announced).toEqual(['Couch: phantom center locked']);
  });

  it('tracks the announced value so a later revert to it stays silent', () => {
    const { state } = run('A', [['B', 0], ['B', 800]]);
    expect(state.announced).toBe('B');
  });
});
