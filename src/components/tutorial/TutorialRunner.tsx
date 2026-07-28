import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppMode, DesignSubStep } from '../app/mode';
import ChapterMenu from './ChapterMenu';
import CoachMark from './CoachMark';
import {
  currentStep,
  initialTour,
  isLastStep,
  stepCount,
  stepPosition,
  tourReduce,
  type TourEvent,
  type TourState,
} from './machine';
import { CHAPTERS } from './steps';
import {
  loadProgress,
  markChapterDone,
  markSeen,
  saveProgress,
  type TutorialProgress,
} from './progress';
import type { TutorialActionName, TutorialCtx } from './types';
import './tutorial.css';

interface TutorialRunnerProps {
  /** The chapter menu is open (App owns this — it feeds `overlayOpen`). */
  menuOpen: boolean;
  onCloseMenu: () => void;
  /** Live snapshot the `try` predicates read. */
  ctx: TutorialCtx;
  /** App performs the real command — the runner never reimplements one. */
  onAction: (action: TutorialActionName) => void;
  onEnterMode: (mode: AppMode, subStep?: DesignSubStep) => void;
  /** True while a step card is on screen, so App can hide colliding chrome. */
  onRunningChange?: (running: boolean) => void;
  /** Injected for tests. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

const safeStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  try {
    return window.localStorage;
  } catch {
    // A storage that throws on ACCESS (not just on read) — keep the tour usable.
    return { getItem: () => null, setItem: () => undefined };
  }
};

/**
 * The tour's driver.
 *
 * Three rules shape it:
 *
 * 1. **It drives the REAL app.** Every `show` action is dispatched to the App as
 *    a named command; nothing here reimplements a scene edit or a mode switch. A
 *    tutorial that simulated the app would be a second implementation, and it
 *    would drift and then lie about how the app works.
 * 2. **It never auto-advances.** Satisfying a `try` step marks it done and lights
 *    up Next, but the user presses it. Auto-advancing would rush the one moment
 *    the whole tour exists for — the pairing click that ignites the verdict.
 * 3. **The card is non-modal and outside `overlayOpen`; the MENU is modal and
 *    inside it.** See `CoachMark.tsx` for why that split is forced rather than
 *    chosen.
 */
export default function TutorialRunner({
  menuOpen,
  onCloseMenu,
  ctx,
  onAction,
  onEnterMode,
  onRunningChange,
  storage,
}: TutorialRunnerProps) {
  const store = storage ?? safeStorage();
  const [tour, setTour] = useState<TourState>(initialTour);
  const [progress, setProgress] = useState<TutorialProgress>(() => loadProgress(store));

  const step = currentStep(tour, CHAPTERS);
  const chapter = CHAPTERS.find((c) => c.id === tour.chapterId) ?? null;

  // The App's callbacks churn on every scene edit (`applyMode` depends on
  // `scene`), so they are read through a ref and never appear in a dep array —
  // the established pattern here (`useKeyboardShortcuts.ts`).
  const cbRef = useRef({ onAction, onEnterMode, onCloseMenu, onRunningChange });
  cbRef.current = { onAction, onEnterMode, onCloseMenu, onRunningChange };

  const persist = useCallback(
    (next: TutorialProgress) => {
      setProgress(next);
      saveProgress(store, next);
    },
    [store],
  );

  const dispatch = useCallback((event: TourEvent) => {
    setTour((prev) => tourReduce(prev, event, CHAPTERS));
  }, []);

  // --- step entry: mode first, then the action ------------------------------
  // Order matters: `applyMode` closes every floating panel (App.tsx:201), so a
  // step that switched mode AFTER opening one would immediately close it again.
  const actedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!step) return;
    if (actedRef.current === step.id) return; // StrictMode double-invoke safe
    actedRef.current = step.id;
    if (step.mode) cbRef.current.onEnterMode(step.mode, step.subStep);
    if (step.act) cbRef.current.onAction(step.act);
  }, [step]);

  // Leaving a step re-arms its action, so Back-then-Next replays it.
  useEffect(() => {
    if (!step) actedRef.current = null;
  }, [step]);

  useEffect(() => {
    cbRef.current.onRunningChange?.(step != null);
  }, [step]);

  // --- resume bookkeeping ----------------------------------------------------
  useEffect(() => {
    if (tour.status !== 'running' || !tour.chapterId) return;
    persist({ ...progress, resume: { chapterId: tour.chapterId, stepIndex: tour.stepIndex } });
    // `progress` is intentionally not a dependency: including it would re-run on
    // every write this effect performs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.status, tour.chapterId, tour.stepIndex, persist]);

  const finishChapter = useCallback(() => {
    const id = tour.chapterId;
    persist(markSeen(id ? markChapterDone(progress, id) : progress));
  }, [tour.chapterId, progress, persist]);

  const onNext = useCallback(() => {
    if (isLastStep(tour, CHAPTERS)) finishChapter();
    dispatch({ type: 'next' });
  }, [tour, finishChapter, dispatch]);

  const onExit = useCallback(() => {
    persist(markSeen(progress));
    dispatch({ type: 'exit' });
  }, [persist, progress, dispatch]);

  const onStart = useCallback(
    (chapterId: string) => {
      actedRef.current = null;
      // DATA SAFETY: chapters are independently launchable, so a chapter that
      // writes to a scene must land in the disposable practice layout FIRST —
      // otherwise jumping straight to it from the menu edits whatever layout is
      // active, which is the user's own work. Doing it here (rather than relying
      // on the chapter's first step) covers entry from the menu, which is the
      // only way a later chapter is ever reached.
      if (CHAPTERS.find((c) => c.id === chapterId)?.needsPractice) {
        cbRef.current.onAction('practice-room');
      }
      dispatch({ type: 'start', chapterId });
      cbRef.current.onCloseMenu();
    },
    [dispatch],
  );

  // A finished tour drops straight back to idle so the menu can be reopened
  // without a stale "finished" card hanging around.
  useEffect(() => {
    if (tour.status === 'finished') dispatch({ type: 'exit' });
  }, [tour.status, dispatch]);

  if (menuOpen) {
    return (
      <ChapterMenu
        chapters={CHAPTERS}
        done={progress.done}
        onStart={onStart}
        onClose={onCloseMenu}
      />
    );
  }

  if (!step || !chapter) return null;

  const waiting = step.kind === 'try';
  const satisfied = waiting && step.done ? step.done(ctx) : false;

  return (
    <CoachMark
      stepId={step.id}
      title={step.title}
      body={step.body}
      anchor={step.anchor}
      chapterTitle={chapter.title}
      position={stepPosition(tour, CHAPTERS)}
      total={stepCount(tour, CHAPTERS)}
      waiting={waiting}
      satisfied={satisfied}
      hint={step.hint}
      canBack={stepPosition(tour, CHAPTERS) > 1}
      isLast={isLastStep(tour, CHAPTERS)}
      onNext={onNext}
      onBack={() => dispatch({ type: 'back' })}
      onExit={onExit}
      onShowMe={step.rescue ? () => cbRef.current.onAction(step.rescue!) : undefined}
    />
  );
}
