import Dialog from '../ui/Dialog';
import Icon from '../ui/Icon';
import type { TutorialChapter } from './types';

interface ChapterMenuProps {
  chapters: readonly TutorialChapter[];
  /** Chapter ids already completed at least once. */
  done: readonly string[];
  /** Where the user left off, when that still resolves to a real step. */
  resume: { chapter: TutorialChapter; stepIndex: number } | null;
  onStart: (chapterId: string) => void;
  onResume: () => void;
  onClose: () => void;
}

/**
 * The tour's front door.
 *
 * This is what makes "available at any time" mean something: a tour you can only
 * take once, front to back, is an onboarding flow. Listing the chapters and
 * letting any one be entered directly turns the same content into documentation
 * you can re-open at the exact topic you forgot.
 *
 * Reuses the MODAL `Dialog` — focus trap, Escape, focus restore and the token
 * styling all come for free, and unlike the step card this one genuinely should
 * block: you are choosing what to do, not doing it. Its `open` state is wired
 * into the App's `overlayOpen` for exactly that reason.
 */
export default function ChapterMenu({
  chapters,
  done,
  resume,
  onStart,
  onResume,
  onClose,
}: ChapterMenuProps) {
  const doneSet = new Set(done);
  const finishedAll = chapters.every((c) => doneSet.has(c.id));

  return (
    <Dialog title="Take the tour" onClose={onClose}>
      <p className="dialog-sub">
        {finishedAll
          ? 'You have been through all of these — pick any one to run through it again.'
          : 'Start at the top for the short version, or jump straight to what you need. The hands-on chapters build in a practice design, so your own work is never touched.'}
      </p>
      {resume && (
        /* "Resumable" is an explicit requirement, and a bookmark you cannot
           return to is not one. Only offered when the saved chapter still
           exists — a later session editing steps.ts can delete it. */
        <button type="button" className="btn btn-primary btn-block tour-resume" onClick={onResume}>
          Continue “{resume.chapter.title}” — step {resume.stepIndex + 1} of{' '}
          {resume.chapter.steps.length}
        </button>
      )}
      <ul className="tour-menu">
        {chapters.map((c, i) => {
          const isDone = doneSet.has(c.id);
          return (
            <li key={c.id}>
              <button type="button" className="tour-menu-item" onClick={() => onStart(c.id)}>
                <span className="tour-menu-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="tour-menu-text">
                  <strong>{c.title}</strong>
                  <span className="tour-menu-sub">{c.summary}</span>
                </span>
                {isDone && (
                  <span className="tour-menu-done">
                    <Icon name="check" size={13} />
                    {/* The tick is decorative; the state must also be readable. */}
                    <span className="sr-only">Completed</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
