/**
 * The tutorial state machine — pure, so every transition is provable with no DOM.
 *
 * The cases that matter here are not "next advances the index". They are the
 * ones that stranded users in earlier sessions' UI work: hostile/stale input
 * (a saved chapter that no longer exists), and the boundaries (first step, last
 * step) where an off-by-one either crashes or silently swallows the payoff.
 */
import { describe, expect, it } from 'vitest';
import {
  currentStep,
  initialTour,
  isLastStep,
  stepCount,
  tourReduce,
  type TourState,
} from '../machine';
import type { TutorialChapter } from '../types';

const CH: TutorialChapter[] = [
  {
    id: 'a',
    title: 'Chapter A',
    summary: 'first',
    steps: [
      { id: 'a1', kind: 'show', title: 'A1', body: '', anchor: { kind: 'none' } },
      { id: 'a2', kind: 'try', title: 'A2', body: '', anchor: { kind: 'none' }, done: () => true },
      { id: 'a3', kind: 'show', title: 'A3', body: '', anchor: { kind: 'none' } },
    ],
  },
  {
    id: 'b',
    title: 'Chapter B',
    summary: 'second',
    steps: [{ id: 'b1', kind: 'show', title: 'B1', body: '', anchor: { kind: 'none' } }],
  },
];

const run = (s: TourState, ...evts: Parameters<typeof tourReduce>[1][]) =>
  evts.reduce((acc, e) => tourReduce(acc, e, CH), s);

describe('tutorial machine', () => {
  it('starts idle, showing no step', () => {
    const s = initialTour();
    expect(s.status).toBe('idle');
    expect(currentStep(s, CH)).toBeNull();
  });

  it('start opens a chapter at its first step', () => {
    const s = run(initialTour(), { type: 'start', chapterId: 'a' });
    expect(s.status).toBe('running');
    expect(s.chapterId).toBe('a');
    expect(s.stepIndex).toBe(0);
    expect(currentStep(s, CH)?.id).toBe('a1');
  });

  it('next walks forward through the chapter', () => {
    const s = run(initialTour(), { type: 'start', chapterId: 'a' }, { type: 'next' }, { type: 'next' });
    expect(currentStep(s, CH)?.id).toBe('a3');
    expect(isLastStep(s, CH)).toBe(true);
  });

  it('next on the last step finishes rather than running off the end', () => {
    const s = run(
      initialTour(),
      { type: 'start', chapterId: 'a' },
      { type: 'next' },
      { type: 'next' },
      { type: 'next' },
    );
    expect(s.status).toBe('finished');
    // A finished tour must not keep claiming a step — the runner renders the
    // completion card off this, and a stale step would double-render.
    expect(currentStep(s, CH)).toBeNull();
  });

  it('back steps backwards but never below the first step', () => {
    const s = run(initialTour(), { type: 'start', chapterId: 'a' }, { type: 'next' });
    expect(currentStep(s, CH)?.id).toBe('a2');
    const b1 = tourReduce(s, { type: 'back' }, CH);
    expect(currentStep(b1, CH)?.id).toBe('a1');
    const b2 = tourReduce(b1, { type: 'back' }, CH);
    expect(b2.stepIndex).toBe(0);
    expect(b2.status).toBe('running');
  });

  it('exit returns to idle from anywhere', () => {
    const s = run(initialTour(), { type: 'start', chapterId: 'a' }, { type: 'next' }, { type: 'exit' });
    expect(s.status).toBe('idle');
    expect(currentStep(s, CH)).toBeNull();
  });

  it('a second start switches chapters and resets the step index', () => {
    const s = run(
      initialTour(),
      { type: 'start', chapterId: 'a' },
      { type: 'next' },
      { type: 'start', chapterId: 'b' },
    );
    expect(s.chapterId).toBe('b');
    expect(s.stepIndex).toBe(0);
    expect(currentStep(s, CH)?.id).toBe('b1');
  });

  // --- degradation: the app moved on while the tour was paused ---------------

  it('start on an unknown chapter is a no-op, not a crash or a blank tour', () => {
    const s = tourReduce(initialTour(), { type: 'start', chapterId: 'nope' }, CH);
    expect(s.status).toBe('idle');
    expect(currentStep(s, CH)).toBeNull();
  });

  it('currentStep is null (never a throw) when the saved chapter no longer exists', () => {
    const stale: TourState = { status: 'running', chapterId: 'deleted-chapter', stepIndex: 2 };
    expect(() => currentStep(stale, CH)).not.toThrow();
    expect(currentStep(stale, CH)).toBeNull();
    expect(stepCount(stale, CH)).toBe(0);
  });

  it('a saved step index past the end of a shrunken chapter clamps to the last step', () => {
    const stale: TourState = { status: 'running', chapterId: 'b', stepIndex: 9 };
    // Chapter B has ONE step. A resume must land on something real.
    expect(currentStep(stale, CH)?.id).toBe('b1');
    expect(isLastStep(stale, CH)).toBe(true);
  });

  it('a negative saved step index clamps to the first step', () => {
    const stale: TourState = { status: 'running', chapterId: 'a', stepIndex: -4 };
    expect(currentStep(stale, CH)?.id).toBe('a1');
  });

  it('next from a stale over-the-end index finishes instead of looping', () => {
    const stale: TourState = { status: 'running', chapterId: 'b', stepIndex: 9 };
    expect(tourReduce(stale, { type: 'next' }, CH).status).toBe('finished');
  });

  // --- resume ---------------------------------------------------------------

  it('resume re-enters a chapter at the saved step', () => {
    const s = tourReduce(initialTour(), { type: 'resume', chapterId: 'a', stepIndex: 2 }, CH);
    expect(s.status).toBe('running');
    expect(currentStep(s, CH)?.id).toBe('a3');
  });

  it('resume clamps a saved index that is now past the end', () => {
    const s = tourReduce(initialTour(), { type: 'resume', chapterId: 'b', stepIndex: 7 }, CH);
    expect(currentStep(s, CH)?.id).toBe('b1');
  });

  it('resume into a chapter that no longer exists is a no-op, not a blank tour', () => {
    const s = tourReduce(initialTour(), { type: 'resume', chapterId: 'gone', stepIndex: 1 }, CH);
    expect(s.status).toBe('idle');
  });

  it('resume with a negative or non-integer index still lands on a real step', () => {
    for (const stepIndex of [-3, 1.7, Number.NaN]) {
      const s = tourReduce(initialTour(), { type: 'resume', chapterId: 'a', stepIndex }, CH);
      expect(currentStep(s, CH)).not.toBeNull();
    }
  });

  it('events on an idle tour do not fabricate a running state', () => {
    for (const e of [{ type: 'next' }, { type: 'back' }, { type: 'exit' }] as const) {
      expect(tourReduce(initialTour(), e, CH).status).toBe('idle');
    }
  });

  it('reduce never mutates the state it was given', () => {
    const s = run(initialTour(), { type: 'start', chapterId: 'a' });
    const frozen = Object.freeze({ ...s });
    expect(() => tourReduce(frozen, { type: 'next' }, CH)).not.toThrow();
    expect(frozen.stepIndex).toBe(0);
  });

  it('an empty chapter list cannot start anything', () => {
    expect(tourReduce(initialTour(), { type: 'start', chapterId: 'a' }, []).status).toBe('idle');
  });
});
