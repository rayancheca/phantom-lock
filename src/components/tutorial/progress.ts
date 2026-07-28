/**
 * Tutorial progress + the auto-offer gate (S21).
 *
 * Lives in a STANDALONE localStorage key, never the persistence schema. That is
 * the S16 rule and it is load-bearing: anything put into the store migrates into
 * IndexedDB forever, ships inside every export bundle, and entangles a UI
 * preference with the user's actual work. A tutorial bookmark has no business
 * being restorable from a layout backup.
 *
 * This module is a LEAF on `Storage` alone — it deliberately does not import
 * `seed.ts` for `isPristineOrigin`. Taking the two boot facts as parameters keeps
 * the gate a pure function of data, which is what makes the "returning user must
 * not see this" case provable in a node test instead of a live check.
 *
 * Fail-closed everywhere: a storage we cannot READ is treated as already-seen, so
 * a browser that denies access (Safari private mode throws on both `getItem` and
 * `setItem`) produces silence rather than a tour offered on every single boot.
 */

export const TUTORIAL_KEY = 'phantom-lock:tutorial';

export interface ResumePoint {
  chapterId: string;
  stepIndex: number;
}

export interface TutorialProgress {
  /** The user finished or dismissed the tour; do not offer it unprompted again. */
  seen: boolean;
  /** Chapter ids completed at least once — drives the menu's "done" ticks. */
  done: string[];
  /** Where to pick up, when they left mid-chapter. */
  resume: ResumePoint | null;
}

/** Read-only slice of Storage, so tests can inject a hostile stand-in. */
type Readable = Pick<Storage, 'getItem'>;
type Writable = Pick<Storage, 'setItem'>;
type Removable = Pick<Storage, 'removeItem'>;

const BLANK: TutorialProgress = { seen: false, done: [], resume: null };
/** What we report when storage cannot be read at all — see the header. */
const UNREADABLE: TutorialProgress = { seen: true, done: [], resume: null };

function parseResume(raw: unknown): ResumePoint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.chapterId !== 'string') return null;
  // A non-integer index would flow straight into the machine's clamp, but
  // normalising here keeps the stored shape honest for the next reader.
  const n = typeof r.stepIndex === 'number' && Number.isFinite(r.stepIndex) ? Math.trunc(r.stepIndex) : 0;
  return { chapterId: r.chapterId, stepIndex: Math.max(0, n) };
}

/**
 * Read progress, tolerating every shape a hostile or stale value can take.
 * Never throws: the caller is a render path.
 */
export function loadProgress(storage: Readable): TutorialProgress {
  let raw: string | null;
  try {
    raw = storage.getItem(TUTORIAL_KEY);
  } catch {
    return { ...UNREADABLE };
  }
  if (raw == null) return { ...BLANK };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...BLANK };
    const o = parsed as Record<string, unknown>;
    return {
      seen: o.seen === true,
      done: Array.isArray(o.done) ? o.done.filter((d): d is string => typeof d === 'string') : [],
      resume: parseResume(o.resume),
    };
  } catch {
    return { ...BLANK };
  }
}

/** Persist progress. A storage that rejects writes is not an error worth raising. */
export function saveProgress(storage: Writable, progress: TutorialProgress): void {
  try {
    storage.setItem(TUTORIAL_KEY, JSON.stringify(progress));
  } catch {
    // Non-fatal: the tour simply will not resume next boot.
  }
}

export function clearProgress(storage: Removable): void {
  try {
    storage.removeItem(TUTORIAL_KEY);
  } catch {
    // Non-fatal.
  }
}

export function markChapterDone(progress: TutorialProgress, chapterId: string): TutorialProgress {
  if (progress.done.includes(chapterId)) return { ...progress };
  return { ...progress, done: [...progress.done, chapterId] };
}

/** Finished or dismissed: set the flag and drop the now-meaningless bookmark. */
export function markSeen(progress: TutorialProgress): TutorialProgress {
  return { ...progress, seen: true, resume: null };
}

/**
 * Should the app OFFER the tour unprompted?
 *
 * All three must hold. `firstRun` is the boot's "no prior IDB meta row" and is
 * the only signal that actually excludes a returning user — see the S16 lesson
 * quoted in the test. The button in the header is always available regardless;
 * this gates only the unprompted offer.
 */
export function shouldOfferTour(
  boot: { firstRun: boolean; pristineOrigin: boolean },
  storage: Readable,
): boolean {
  if (!boot.firstRun || !boot.pristineOrigin) return false;
  return !loadProgress(storage).seen;
}
