/**
 * The step corpus: coverage + the invariants that keep a user from being
 * stranded.
 *
 * The COVERAGE half is the executable version of the owner's actual request —
 * "shows all possible functionality". It enumerates the app's real tool and mode
 * tables (`DIGIT_TOOL`, `MODE_THEME`) and asserts each one is taught somewhere.
 * Adding a tool without a tutorial step then fails the suite, which is the same
 * "fail when the scan finds nothing" discipline as the contrast and CSP tests.
 *
 * The INVARIANT half encodes the ways a guided tour goes wrong in practice: a
 * `try` step with no predicate can never be satisfied; one with no rescue strands
 * anyone who cannot perform it; a duplicate id makes `done` bookkeeping ambiguous.
 */
import { describe, expect, it } from 'vitest';
import { CHAPTERS, FIRST_CHAPTER_ID, allSteps } from '../steps';
import { DIGIT_TOOL, MODE_THEME, type AppMode } from '../../app/mode';
import type { TutorialCtx } from '../types';
import { blankScene } from '../../../engine/scene';

const ctx = (over: Partial<TutorialCtx> = {}): TutorialCtx => ({
  scene: blankScene(),
  appMode: 'tune',
  designSubStep: 'build',
  tool: 'select',
  locked: false,
  seatCount: 1,
  galleryOpen: false,
  compareOpen: false,
  practiceActive: true,
  ...over,
});

describe('tutorial coverage — every tool and mode is taught', () => {
  const covered = new Set(allSteps().flatMap((s) => s.covers?.tools ?? []));
  const coveredModes = new Set(allSteps().flatMap((s) => s.covers?.modes ?? []));

  // Guard against a vacuous pass: if the corpus were empty every "is covered"
  // assertion below would trivially hold on an empty universe.
  it('the corpus is non-trivial', () => {
    expect(CHAPTERS.length).toBeGreaterThanOrEqual(5);
    expect(allSteps().length).toBeGreaterThanOrEqual(15);
    expect(covered.size).toBeGreaterThan(0);
  });

  it('every tool reachable by a digit shortcut appears in some step', () => {
    const appTools = new Set(
      (Object.keys(MODE_THEME) as AppMode[]).flatMap((m) => Object.values(DIGIT_TOOL[m])),
    );
    // Sanity: the table we are checking against is real and populated.
    expect(appTools.size).toBeGreaterThanOrEqual(6);
    const missing = [...appTools].filter((t) => !covered.has(t));
    expect(missing, `tools with no tutorial step: ${missing.join(', ')}`).toEqual([]);
  });

  it('the marquee and lasso selection tools are taught', () => {
    // Not in DIGIT_TOOL (they are dock-only), so they need their own assertion
    // or they would silently fall out of coverage.
    expect(covered.has('marquee')).toBe(true);
    expect(covered.has('lasso')).toBe(true);
  });

  it('both app modes are taught', () => {
    for (const m of Object.keys(MODE_THEME) as AppMode[]) {
      expect(coveredModes.has(m), `mode ${m} has no tutorial step`).toBe(true);
    }
  });

  it('every tool named in a step is a real tool', () => {
    // Digit-bound tools plus the four the dock/gallery reach without a digit.
    // Keeping this list explicit (rather than casting) is what caught `room`
    // missing from the first draft of the corpus.
    const DOCK_ONLY = ['room', 'marquee', 'lasso', 'calibrate'] as const;
    const real = new Set<string>([
      ...(Object.keys(MODE_THEME) as AppMode[]).flatMap((m) => Object.values(DIGIT_TOOL[m])),
      ...DOCK_ONLY,
    ]);
    for (const t of covered) expect(real.has(t), `unknown tool in covers: ${t}`).toBe(true);
  });
});

describe('tutorial corpus invariants', () => {
  it('chapter ids are unique and the first chapter id resolves', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(FIRST_CHAPTER_ID);
  });

  it('step ids are unique across the whole corpus', () => {
    const ids = allSteps().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no chapter is empty', () => {
    for (const c of CHAPTERS) expect(c.steps.length, `chapter ${c.id} is empty`).toBeGreaterThan(0);
  });

  it('every step has real, non-placeholder copy', () => {
    for (const s of allSteps()) {
      expect(s.title.length, `step ${s.id} title`).toBeGreaterThan(3);
      expect(s.body.length, `step ${s.id} body`).toBeGreaterThan(30);
      expect(s.title).not.toMatch(/TODO|TBD|lorem|placeholder/i);
      expect(s.body).not.toMatch(/TODO|TBD|lorem|placeholder/i);
      // Sentence case, per the design system: no SHOUTING titles.
      expect(s.title).not.toBe(s.title.toUpperCase());
    }
  });

  it('every chapter has a summary for the menu', () => {
    for (const c of CHAPTERS) {
      expect(c.summary.length, `chapter ${c.id} summary`).toBeGreaterThan(10);
      expect(c.title.length).toBeGreaterThan(3);
    }
  });

  // --- the stranding invariants ---------------------------------------------

  it('every `try` step can actually be satisfied and escaped', () => {
    for (const s of allSteps()) {
      if (s.kind !== 'try') continue;
      expect(s.done, `try step ${s.id} has no predicate — it can never complete`).toBeTypeOf('function');
      expect(s.hint, `try step ${s.id} has no hint for a stuck user`).toBeTruthy();
      expect(s.rescue, `try step ${s.id} has no "show me" rescue — a stuck user is stranded`).toBeTruthy();
    }
  });

  it('no `show` step carries a predicate (it would never be consulted)', () => {
    for (const s of allSteps()) {
      if (s.kind === 'show') expect(s.done, `show step ${s.id} has a dead predicate`).toBeUndefined();
    }
  });

  it('every predicate is total — no throw on a blank, empty scene', () => {
    // A predicate runs on every render, against whatever the user has done to
    // the app. One that assumes a speaker exists would crash the shell.
    for (const s of allSteps()) {
      if (!s.done) continue;
      expect(() => s.done!(ctx()), `predicate ${s.id} threw on a blank scene`).not.toThrow();
      expect(() => s.done!(ctx({ locked: true, galleryOpen: true, compareOpen: true, seatCount: 0 }))).not.toThrow();
    }
  });

  it('every predicate is starts-false somewhere — a step already done teaches nothing', () => {
    // Each `try` step must have at least one reachable context in which it is
    // NOT yet satisfied, or the runner would skip straight past it.
    const probes = [ctx(), ctx({ locked: true }), ctx({ galleryOpen: true }), ctx({ compareOpen: true })];
    for (const s of allSteps()) {
      if (!s.done) continue;
      expect(probes.some((p) => !s.done!(p)), `predicate ${s.id} is always true`).toBe(true);
      expect(probes.some((p) => s.done!(p)), `predicate ${s.id} is never true`).toBe(true);
    }
  });

  it('every dom anchor has a human label to fall back on when the node is missing', () => {
    for (const s of allSteps()) {
      if (s.anchor.kind === 'dom') {
        expect(s.anchor.selector.length, `step ${s.id} selector`).toBeGreaterThan(0);
        expect(s.anchor.label, `step ${s.id} has no fallback label`).toBeTruthy();
      }
    }
  });

  it('every chapter that writes to a scene is marked needsPractice', () => {
    // THE DATA-SAFETY INVARIANT. Chapters are independently launchable from the
    // menu, so a user can jump straight into one — and any scene-writing action
    // it performs would land on whatever layout is active, which is THEIR work.
    // Marking the chapter makes the runner enter the disposable practice room
    // first. Without this, "the tutorial mutates no layout the user created" is
    // false for every chapter but the first.
    const WRITES = new Set(['place-two-pods', 'pair-them', 'break-lock', 'clear-speakers', 'add-seat']);
    for (const c of CHAPTERS) {
      const writes = c.steps.some((s) => (s.act && WRITES.has(s.act)) || (s.rescue && WRITES.has(s.rescue)));
      if (writes) {
        expect(c.needsPractice, `chapter ${c.id} writes to a scene but is not marked needsPractice`).toBe(true);
      }
    }
  });

  it('at least one chapter actually writes — the invariant above is not vacuous', () => {
    expect(CHAPTERS.some((c) => c.needsPractice)).toBe(true);
  });

  it('a chapter that needs the practice room does not also open the gallery first', () => {
    // Entering the practice room switches the active layout; doing that while
    // the full-screen gallery is open would move the ground under the user.
    for (const c of CHAPTERS) {
      if (!c.needsPractice) continue;
      expect(c.steps[0].act === 'open-gallery').toBe(false);
    }
  });

  it('a show step that declares an action names one the runner can perform', () => {
    const known = new Set([
      'practice-room',
      'place-two-pods',
      'pair-them',
      'break-lock',
      'clear-speakers',
      'add-seat',
      'open-gallery',
      'close-gallery',
      'open-compare',
      'close-compare',
    ]);
    for (const s of allSteps()) {
      if (s.act) expect(known.has(s.act), `step ${s.id} unknown act ${s.act}`).toBe(true);
      if (s.rescue) expect(known.has(s.rescue), `step ${s.id} unknown rescue ${s.rescue}`).toBe(true);
    }
  });
});

describe('the spine reaches the lock', () => {
  const spine = CHAPTERS.find((c) => c.id === 'lock');

  it('there is a lock chapter, and it comes before the optional material', () => {
    expect(spine).toBeDefined();
    expect(CHAPTERS.indexOf(spine!)).toBeLessThanOrEqual(1);
  });

  it('it builds the pair itself, then hands the locking click to the user', () => {
    const ids = spine!.steps.map((s) => s.id);
    expect(ids).toContain('lock-place');
    expect(ids).toContain('lock-pair');
    // The placement is the runner's job (precision), the pairing is the user's
    // (that click is the false -> true edge the ignition fires on).
    expect(spine!.steps.find((s) => s.id === 'lock-place')!.kind).toBe('show');
    const pair = spine!.steps.find((s) => s.id === 'lock-pair')!;
    expect(pair.kind).toBe('try');
    expect(pair.done!(ctx({ locked: false }))).toBe(false);
    expect(pair.done!(ctx({ locked: true }))).toBe(true);
  });

  it('the tour builds its own room before placing anything', () => {
    const ids = spine!.steps.map((s) => s.id);
    expect(ids.indexOf('lock-practice')).toBeLessThan(ids.indexOf('lock-place'));
    expect(spine!.steps[0].act).toBe('practice-room');
  });
});
