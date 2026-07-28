/**
 * The guided tutorial's state machine (S21) — pure, so every transition is
 * node-testable with no DOM and no React.
 *
 * The whole reason this is a separate module rather than three `useState`s in the
 * runner is RESUMPTION. Progress is persisted (see `progress.ts`) and restored on
 * a later boot, by which time the chapter it names may have been renamed, shrunk
 * or deleted outright by a future session editing `steps.ts`. So the state this
 * machine accepts is UNTRUSTED INPUT in exactly the way a stored layout record
 * is, and it is treated the same way: every read CLAMPS rather than indexes
 * blindly, an unknown chapter resolves to `null` instead of throwing, and no
 * transition can fabricate a `running` state out of an idle one.
 *
 * A crash here is not a cosmetic bug — it renders inside the app shell, so an
 * exception takes the whole editor down with it and the user loses their canvas.
 */
import type { TutorialChapter, TutorialStep } from './types';

export type TourStatus = 'idle' | 'running' | 'finished';

export interface TourState {
  status: TourStatus;
  /** null whenever `status` is not 'running'. */
  chapterId: string | null;
  stepIndex: number;
}

export type TourEvent =
  | { type: 'start'; chapterId: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'exit' };

export function initialTour(): TourState {
  return { status: 'idle', chapterId: null, stepIndex: 0 };
}

function chapterOf(state: TourState, chapters: readonly TutorialChapter[]): TutorialChapter | null {
  if (state.chapterId == null) return null;
  return chapters.find((c) => c.id === state.chapterId) ?? null;
}

/** How many steps the state's chapter has; 0 when it no longer exists. */
export function stepCount(state: TourState, chapters: readonly TutorialChapter[]): number {
  return chapterOf(state, chapters)?.steps.length ?? 0;
}

/**
 * The index actually safe to read, given a possibly-stale stored index.
 * Callers must use this instead of `state.stepIndex` — that is the whole
 * degradation contract.
 */
function safeIndex(state: TourState, chapters: readonly TutorialChapter[]): number {
  const n = stepCount(state, chapters);
  if (n === 0) return -1;
  return Math.min(Math.max(Math.trunc(state.stepIndex) || 0, 0), n - 1);
}

/** The step to render, or null when there is nothing to show. */
export function currentStep(
  state: TourState,
  chapters: readonly TutorialChapter[],
): TutorialStep | null {
  // A finished/idle tour deliberately reports NO step: the runner renders its
  // completion card off this, and a lingering step would double-render.
  if (state.status !== 'running') return null;
  const chapter = chapterOf(state, chapters);
  const i = safeIndex(state, chapters);
  if (!chapter || i < 0) return null;
  return chapter.steps[i] ?? null;
}

export function isLastStep(state: TourState, chapters: readonly TutorialChapter[]): boolean {
  const n = stepCount(state, chapters);
  return n > 0 && safeIndex(state, chapters) === n - 1;
}

/** 1-based position for the "Step 2 of 5" label; 0 when there is no step. */
export function stepPosition(state: TourState, chapters: readonly TutorialChapter[]): number {
  const i = safeIndex(state, chapters);
  return i < 0 ? 0 : i + 1;
}

export function tourReduce(
  state: TourState,
  event: TourEvent,
  chapters: readonly TutorialChapter[],
): TourState {
  switch (event.type) {
    case 'start': {
      // An unknown chapter is a NO-OP, never a running tour with nothing to
      // render: the entry points include a persisted id that a later session may
      // have deleted.
      const exists = chapters.some((c) => c.id === event.chapterId);
      if (!exists) return state;
      return { status: 'running', chapterId: event.chapterId, stepIndex: 0 };
    }
    case 'next': {
      if (state.status !== 'running') return state;
      const n = stepCount(state, chapters);
      const i = safeIndex(state, chapters);
      if (n === 0 || i < 0 || i >= n - 1) {
        return { status: 'finished', chapterId: null, stepIndex: 0 };
      }
      return { ...state, stepIndex: i + 1 };
    }
    case 'back': {
      if (state.status !== 'running') return state;
      const i = safeIndex(state, chapters);
      if (i <= 0) {
        // Already at (or before) the start: stay put and re-normalise the index
        // so a stale negative value cannot persist through the session.
        return i === 0 && state.stepIndex === 0 ? state : { ...state, stepIndex: 0 };
      }
      return { ...state, stepIndex: i - 1 };
    }
    case 'exit':
      return state.status === 'idle' ? state : initialTour();
    default:
      return state;
  }
}
