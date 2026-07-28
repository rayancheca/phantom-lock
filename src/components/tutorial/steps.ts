/**
 * The guided tour's content (S21) — pure data, so the whole corpus is
 * node-testable and the coverage test can prove the tour still reaches every
 * tool the app ships.
 *
 * THE SPINE IS CHAPTER `lock`, and its shape is not a stylistic choice — it is
 * the only arrangement that actually shows the payoff. Three measured facts
 * drove it (numbers in docs/sessions/S21/, re-asserted in `steps.test.ts`):
 *
 * 1. The lock is a PRECISION condition. With one speaker pinned, only 3-5 cells
 *    of the 0.05 m snap grid lock at all — a target roughly 0.05-0.10 m across,
 *    a handful of pixels at default zoom. So "drag it until it locks" is not a
 *    step, it is a trap: almost nobody would land it, and the tour would stall
 *    on its own climax.
 * 2. `keyboardPlacementPoint` puts the first two pods at exactly +/-30 degrees.
 *    On a CLEAN rectangular room that pair locks at quality 0.997 every time. On
 *    the furnished Maple Court demo it does NOT (`apexBlocked` — the furniture is
 *    in the way, quality 0.5), which is why the tour builds its own practice room
 *    instead of borrowing the demo apartment.
 * 3. `VerdictHero`'s ignition is a false->true EDGE and mount is never an edge
 *    (S15). A step that merely lands the user on an already-locked scene shows a
 *    static headline and no celebration. Pairing is the edge: before the click
 *    there is no pair at all, so `locked` is false; the click makes it true, in
 *    the same layout and the same seat, so the hero is not remounted and the
 *    sweep actually fires.
 *
 * Hence: the RUNNER does the precision placement (a `show` step), and the USER
 * makes the pairing click (a `try` step). The precise work is done correctly, and
 * the click that causes the lock is still genuinely theirs.
 */
import type { TutorialChapter } from './types';

/** Anchors. Prefer selectors the app already guarantees — an aria-label a
 *  screen reader depends on will not be renamed casually, whereas a class might.
 *  `data-tour` is used only where nothing stable exists. */
const SEL = {
  layoutSwitcher: '.room-trigger',
  modeSwitch: '[aria-label="Workspace mode"]',
  verdict: '.verdict-hero',
  canvas: '.sim-canvas-wrap',
  toolbar: '[role="toolbar"][aria-label="Canvas tools"]',
  speakers: 'section[aria-label="Speakers"]',
  pairButton: '[data-tour="pair"]',
  seats: 'section[aria-label="Listening spots"]',
  tuneTools: 'section[aria-label="Tune tools"]',
  compareButton: '[data-tour="compare"]',
} as const;

export const CHAPTERS: TutorialChapter[] = [
  // ---------------------------------------------------------------- chapter 1
  {
    id: 'orientation',
    title: 'What you are looking at',
    summary: 'The readout, the two modes, and where your designs live.',
    steps: [
      {
        id: 'orientation-verdict',
        kind: 'show',
        title: 'This is the whole point',
        body:
          'Phantom Lock hunts for the spot where a stereo pair “locks” — where the sound seems to float dead-centre between the two speakers, with nothing actually in the middle. That readout is live: it re-reads every time anything moves.',
        anchor: { kind: 'dom', selector: SEL.verdict, label: 'the verdict readout' },
        // The hero only exists in TUNE, and the tour can be started from either
        // mode — without this the very first step points at nothing.
        mode: 'tune',
        covers: { modes: ['tune'] },
      },
      {
        id: 'orientation-modes',
        kind: 'show',
        title: 'Two modes, two jobs',
        body:
          'DESIGN is where you draw the room and put furniture in it. TUNE is where you place HomePods and read the verdict. The canvas changes colour so you always know which one you are in.',
        anchor: { kind: 'dom', selector: SEL.modeSwitch, label: 'the mode switch' },
        covers: { modes: ['design', 'tune'] },
      },
      {
        id: 'orientation-layouts',
        kind: 'show',
        title: 'Your designs live here',
        body:
          'Every design you make is saved automatically and filed in a folder. This button opens them all — you are looking at one of several that ship with the app.',
        anchor: { kind: 'dom', selector: SEL.layoutSwitcher, label: 'the layout switcher' },
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 2
  {
    id: 'lock',
    title: 'Reach the lock',
    summary: 'The main event: build a pair from scratch and watch it lock.',
    needsPractice: true,
    steps: [
      {
        id: 'lock-practice',
        kind: 'show',
        title: 'A practice room, so nothing of yours is touched',
        body:
          'I have made a separate design called “Tutorial practice room” and switched to it. Everything from here happens in that room, so none of your own designs are changed. Delete it whenever you like from the layouts screen.',
        anchor: { kind: 'dom', selector: SEL.layoutSwitcher, label: 'the layout switcher' },
        mode: 'tune',
        act: 'practice-room',
      },
      {
        id: 'lock-place',
        kind: 'show',
        title: 'Two HomePods, at the classic angle',
        body:
          'I have dropped two HomePods 30° either side of the seat — the arrangement a stereo pair is designed around. They are not linked yet, so there is still nothing to lock.',
        anchor: { kind: 'dom', selector: SEL.speakers, label: 'the speakers panel' },
        mode: 'tune',
        act: 'place-two-pods',
        covers: { tools: ['speaker'] },
      },
      {
        id: 'lock-pair',
        kind: 'try',
        title: 'Now link them — this is the moment',
        body:
          'Click “Pair A + B as stereo”. Two separate speakers become one stereo image, and the readout above should flip to locked.',
        anchor: { kind: 'dom', selector: SEL.pairButton, label: 'the pair button' },
        mode: 'tune',
        // The predicate is the REAL condition, not "did you click the button":
        // any route to a locked pair (the Inspector dropdown, Suggest placement)
        // counts, because the user has then genuinely done the thing.
        done: (ctx) => ctx.locked,
        hint: 'The button is in the Speakers panel on the right, just under the list of speakers.',
        rescue: 'pair-them',
      },
      {
        id: 'lock-read',
        kind: 'show',
        title: 'What a lock is made of',
        // Deliberately NOT "that is a lock": the previous step is skippable, so
        // this copy must stay true for someone who skipped it and is looking at
        // an unlocked readout. It describes the condition rather than asserting
        // the current state.
        body:
          'A lock needs three things: equal distances to both speakers, roughly a 60° triangle, and a clear line of sight. Below the headline the spec sheet shows each of those numbers — tap any dotted term for a plain-English definition.',
        anchor: { kind: 'dom', selector: SEL.verdict, label: 'the verdict readout' },
        mode: 'tune',
      },
      {
        id: 'lock-move',
        kind: 'try',
        title: 'Break it on purpose',
        body:
          'Drag either HomePod — or the green YOU marker — a little way across the canvas. The verdict re-reads as you move, and the lock will drop. Put it back and it returns.',
        anchor: { kind: 'dom', selector: SEL.canvas, label: 'the canvas' },
        mode: 'tune',
        // Deliberately satisfied by MOVEMENT, not by re-locking: the lock basin is
        // a few centimetres wide (see the header), so requiring a re-lock by drag
        // would strand almost everyone on the last step of the main chapter.
        done: (ctx) => !ctx.locked,
        hint: 'Click a speaker first so it is selected, then drag it — or nudge it with the arrow keys.',
        rescue: 'break-lock',
        covers: { tools: ['select'] },
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 3
  {
    id: 'build',
    title: 'Draw your own room',
    summary: 'Walls, doors and windows — where your real floorplan comes from.',
    steps: [
      {
        id: 'build-switch',
        kind: 'show',
        title: 'Switch to DESIGN to build',
        body:
          'The canvas turns blueprint-blue. Walls, doors and windows are drawn here; the tools along the dock change to match the mode you are in.',
        anchor: { kind: 'dom', selector: SEL.toolbar, label: 'the tool dock' },
        mode: 'design',
        subStep: 'build',
        covers: { modes: ['design'] },
      },
      {
        id: 'build-walls',
        kind: 'show',
        title: 'Walls are a chain of clicks',
        body:
          'Pick the wall tool and click corner by corner; click your first corner again to close the room. Backspace undoes the last corner. “Add a room…” in the layouts screen gives you a finished rectangle instead.',
        anchor: { kind: 'dom', selector: SEL.toolbar, label: 'the wall tool' },
        mode: 'design',
        subStep: 'build',
        covers: { tools: ['wall', 'room'] },
      },
      {
        id: 'build-openings',
        kind: 'show',
        title: 'Doors and windows cut a gap',
        body:
          'The door/window tool cuts an opening into a wall you click — hold Shift for a window. Sound leaks through an open door, so where they go changes the answer. A door also shows which way it swings.',
        anchor: { kind: 'dom', selector: SEL.toolbar, label: 'the door and window tool' },
        mode: 'design',
        subStep: 'build',
        covers: { tools: ['opening'] },
      },
      {
        id: 'build-photo',
        kind: 'show',
        title: 'Or start from a photo of your floorplan',
        body:
          'You can import a floorplan image, set its scale from one known measurement, and trace over it. That is the fastest way to get your actual home in here.',
        anchor: { kind: 'dom', selector: SEL.canvas, label: 'the canvas' },
        mode: 'design',
        subStep: 'build',
        covers: { tools: ['calibrate'] },
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 4
  {
    id: 'furnish',
    title: 'Put furniture in it',
    summary: 'Sofas, tables and the TV — they block and absorb sound.',
    steps: [
      {
        id: 'furnish-switch',
        kind: 'show',
        title: 'Furnish is the other half of DESIGN',
        body:
          'Furniture is not decoration here. A tall bookcase between a speaker and your ear genuinely blocks the path, and soft things absorb reflections — both change the verdict.',
        anchor: { kind: 'dom', selector: SEL.toolbar, label: 'the furniture tools' },
        mode: 'design',
        subStep: 'furnish',
        covers: { tools: ['rect', 'circle'] },
      },
      {
        id: 'furnish-marquee',
        kind: 'show',
        title: 'Selecting several things at once',
        body:
          'Box select drags a rectangle; Lasso draws a free shape. Hold ⌘ and click to add or remove one item. With things selected you can drag, rotate with Q and E, or delete them.',
        anchor: { kind: 'dom', selector: SEL.toolbar, label: 'the selection tools' },
        mode: 'design',
        subStep: 'furnish',
        covers: { tools: ['marquee', 'lasso'] },
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 5
  {
    id: 'tune',
    title: 'Tune it',
    summary: 'TV vs music, and letting the app find the spot for you.',
    steps: [
      {
        id: 'tune-anchor',
        kind: 'show',
        title: 'TV or music changes the target',
        body:
          'For TV the phantom centre should land on the screen, so dialogue comes from the picture. For music it should land on you. Same room, different best answer.',
        anchor: { kind: 'dom', selector: SEL.tuneTools, label: 'the TV and music switch' },
        mode: 'tune',
      },
      {
        id: 'tune-suggest',
        kind: 'show',
        title: 'Let it do the searching',
        body:
          '“Suggest placement” sweeps the room and proposes positions — for this seat, this room, or the whole house. You see the proposal before anything is applied, and applying it can be undone.',
        anchor: { kind: 'dom', selector: SEL.tuneTools, label: 'the suggest button' },
        mode: 'tune',
      },
      {
        id: 'tune-star',
        kind: 'show',
        title: 'The green star is the best seat',
        body:
          'On the canvas, the ★ marks the best place to sit for the speakers as they are now. The Legend in the top-left corner explains every colour and marker on screen.',
        anchor: { kind: 'dom', selector: SEL.canvas, label: 'the canvas' },
        mode: 'tune',
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 6
  {
    id: 'compare',
    title: 'Compare two setups',
    summary: 'A second seat, and reading two verdicts side by side.',
    // Adds a listening spot, which is a scene write — so this chapter must land
    // in the practice room first even when entered straight from the menu.
    needsPractice: true,
    steps: [
      {
        id: 'compare-seat',
        kind: 'show',
        title: 'You can sit in more than one place',
        body:
          'A couch spot and a bed spot are different rooms as far as the sound is concerned. Add a seat for each and switch between them — the verdict follows whichever one is active.',
        anchor: { kind: 'dom', selector: SEL.seats, label: 'the listening spots panel' },
        mode: 'tune',
        act: 'add-seat',
      },
      {
        id: 'compare-open',
        kind: 'try',
        title: 'Put two readouts side by side',
        body:
          'Click Compare. Each column is an independent choice of folder, design and seat — so you can weigh two seats in one design, or two designs against each other.',
        anchor: { kind: 'dom', selector: SEL.compareButton, label: 'the compare button' },
        mode: 'tune',
        done: (ctx) => ctx.compareOpen,
        hint: 'Compare is at the bottom of the Listening spots panel.',
        rescue: 'open-compare',
      },
      {
        id: 'compare-close',
        kind: 'show',
        title: 'Two verdicts, one screen',
        // This step exists so the chapter does not END underneath compare.
        // `ScenarioCompare` is `aria-modal="true"`, and the coach-mark is its
        // SIBLING — so while it is open the card (and the Finish button) are
        // outside the accessibility tree entirely. Closing here also matches
        // what chapter 7 already does with the gallery.
        body:
          'Each column reads independently, so you can weigh a couch seat against a bed seat, or two whole designs against each other. Closing it again returns you to the plan.',
        anchor: { kind: 'dom', selector: SEL.seats, label: 'the listening spots panel' },
        mode: 'tune',
        act: 'close-compare',
      },
    ],
  },

  // ---------------------------------------------------------------- chapter 7
  {
    id: 'layouts',
    title: 'Designs and folders',
    summary: 'Where everything is saved, and how to get it out.',
    steps: [
      {
        id: 'layouts-open',
        kind: 'try',
        title: 'Everything you have made',
        body:
          'Open the layouts screen. Designs are grouped into folders, each card is a live thumbnail, and everything saves itself as you work — there is no save button.',
        anchor: { kind: 'dom', selector: SEL.layoutSwitcher, label: 'the layout switcher' },
        done: (ctx) => ctx.galleryOpen,
        hint: 'It is the button next to the Phantom Lock wordmark, top-left.',
        rescue: 'open-gallery',
      },
      {
        id: 'layouts-export',
        kind: 'show',
        title: 'Getting things in and out',
        body:
          'Duplicate a design to try a variation safely. Export one as a file to keep or share, import one back, or export the plan as an image. That is the tour — the button that opened it stays in the header whenever you want it again.',
        anchor: { kind: 'dom', selector: SEL.layoutSwitcher, label: 'the layouts screen' },
        act: 'close-gallery',
      },
    ],
  },
];

/** The chapter the "Take the tour" offer starts with. */
export const FIRST_CHAPTER_ID = CHAPTERS[0].id;

/** Flat list of every step, for the coverage test and the corpus invariants. */
export function allSteps() {
  return CHAPTERS.flatMap((c) => c.steps);
}
