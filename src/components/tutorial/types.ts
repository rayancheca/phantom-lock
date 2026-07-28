/**
 * Guided tutorial — the shared vocabulary (S21).
 *
 * Split out of `steps.ts` so the pure state machine can import the types without
 * pulling in the whole step corpus (and the `Scene` fixtures its predicates
 * reference). Everything here is data + pure function signatures: no React, no
 * DOM, no engine imports beyond `types`, which keeps `steps.ts`/`machine.ts`
 * node-testable in the `|node|` vitest project.
 */
import type { Scene, ToolMode } from '../../engine/types';
import type { AppMode, DesignSubStep } from '../app/mode';

/**
 * The snapshot a `try` step's predicate is allowed to see.
 *
 * Deliberately a FLAT, serialisable view of app state rather than the live App
 * closure: it is what makes every `done` predicate a pure function of data, so
 * the entire step corpus is unit-testable with no DOM and no React. Anything a
 * predicate needs must be added here explicitly — which is the point, because it
 * forces each new gate to be something the runner can actually observe.
 */
export interface TutorialCtx {
  scene: Scene;
  appMode: AppMode;
  designSubStep: DesignSubStep;
  /** The active TOOL (the `ToolMode` axis), not the app-mode. */
  tool: ToolMode;
  /** True when any stereo pair currently reports a locked phantom centre. */
  locked: boolean;
  /** Named listening spots on the active layout. */
  seatCount: number;
  /** The full-screen layout gallery is open. */
  galleryOpen: boolean;
  /** The N-up scenario compare is open. */
  compareOpen: boolean;
  /**
   * The disposable practice layout is the ACTIVE one.
   *
   * Containment cannot be established once at chapter entry and assumed
   * thereafter: the coach-mark is non-modal by design, so the layout switcher
   * stays operable mid-tour — and chapter 1 literally points at it. Without
   * re-checking, Back-then-Next after a switch replays a scene-writing action
   * against the user's own design.
   */
  practiceActive: boolean;
}

/**
 * Where a step points.
 *
 * `dom` resolves a CSS selector through `getBoundingClientRect()`. `none` is a
 * narration step that points at nothing and centres itself.
 *
 * There is deliberately NO `world` anchor in this first pass. It is buildable —
 * `SimCanvas`'s `view` is React state (`SimCanvas.tsx:155`), not a rAF ref, and
 * `worldToScreen` is already exported from `render.ts` — but lifting `view` to
 * App would re-render the whole sidebar (Echogram included) on every pan frame,
 * and jsdom reports every rect as 0x0 so the projection could not be verified in
 * the a11y suite anyway. The honest scope call is: point at real DOM controls,
 * and let the COPY do the pointing for canvas objects. Revisit with a subscriber
 * (`useSyncExternalStore`) rather than a lifted `useState` — see docs/ideas.md.
 */
export type TutorialAnchor =
  | { kind: 'none' }
  | { kind: 'dom'; selector: string; /** Fallback if the selector misses. */ label?: string };

/**
 * What a `show` step asks the runner to DO. These are declarative names, not
 * closures, so the step corpus stays serialisable data and the runner keeps the
 * single mapping from name -> real app command. A step can never invent an
 * action the runner has not wired.
 */
export type TutorialActionName =
  /** Create (or re-enter) the disposable practice layout. Never touches a user layout. */
  | 'practice-room'
  /** Place two UNPAIRED pods at the +/-30 degree reference positions. */
  | 'place-two-pods'
  /** Link those two as a stereo pair — the rescue for the pairing step. */
  | 'pair-them'
  /** Shove a speaker out of the (few-centimetre) lock basin so the readout drops. */
  | 'break-lock'
  | 'add-seat'
  | 'open-gallery'
  | 'close-gallery'
  | 'open-compare'
  | 'close-compare';

export type TutorialStepKind = 'show' | 'try';

export interface TutorialStep {
  id: string;
  kind: TutorialStepKind;
  /** Step headline — sentence case, per the design system. */
  title: string;
  /** One or two plain sentences. No jargon that is not defined in `glossary.ts`. */
  body: string;
  anchor: TutorialAnchor;
  /** The app-mode this step needs. The runner switches AND says so. */
  mode?: AppMode;
  subStep?: DesignSubStep;
  /** `show` only: what the runner performs on entry. */
  act?: TutorialActionName;
  /**
   * `try` only: has the user done it yet? Pure function of the snapshot.
   * A `try` step without a predicate would strand the user, so the corpus test
   * asserts every `try` step has one.
   */
  done?: (ctx: TutorialCtx) => boolean;
  /** Shown after inaction, and behind the "Show me" escape hatch. */
  hint?: string;
  /**
   * `try` only: the runner may perform the step FOR the user ("Show me").
   * Without this a stuck user is stranded, which the design calls out.
   */
  rescue?: TutorialActionName;
  /**
   * What this step actually teaches, declared so the COVERAGE test can assert
   * the tour still reaches every tool and mode the app ships. Adding a tool to
   * `DIGIT_TOOL` without giving it a step then fails the suite — the same
   * "fail when the scan finds nothing" discipline as the contrast and CSP tests.
   */
  covers?: { tools?: ToolMode[]; modes?: AppMode[] };
}

export interface TutorialChapter {
  id: string;
  title: string;
  /** One line in the chapter menu — what you will learn. */
  summary: string;
  /**
   * This chapter writes to a scene, so the runner MUST enter the disposable
   * practice layout before its first step.
   *
   * Load-bearing for data safety, not a convenience: chapters are independently
   * launchable from the menu, so a user can jump straight into one — and a
   * scene-writing action would otherwise land on whatever layout happens to be
   * active, which is their own work. `steps.test.ts` asserts that every chapter
   * containing a writing action carries this flag.
   */
  needsPractice?: boolean;
  steps: TutorialStep[];
}
