import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { THEMES } from '../../components/canvas/render';
import {
  composite,
  contrastRatio,
  fadeElement,
  flatten,
  parseColor,
  parseTokens,
  relativeLuminance,
  requiredRatio,
  resolveToken,
} from '../contrast';

/**
 * Automated WCAG contrast over the REAL shipped token pairs (S7 / deliverable 3).
 *
 * Every expectation below is a `toBeGreaterThanOrEqual` against the WCAG
 * threshold, with the measured value in the test NAME. That way a token edit
 * that degrades a pair fails the build, while harmless float slop in the last
 * decimal never reds it (the S7 skeptic caught the design pass asserting four
 * hand-derived `--text` ratios that were simply wrong).
 */

/**
 * Read the stylesheets from disk rather than importing them. Vitest stubs CSS
 * imports to an empty string by default (`test.css` is false), so `?raw` and
 * `?inline` both yield "" in this environment — a trap that would have made
 * every assertion below vacuously pass against an empty token map.
 */
const readCss = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const T = parseTokens(readCss('../tokens.css'));
/** Resolve a token name (following `var()` aliases) to a literal colour. */
const c = (name: string) => resolveToken(name, T);

// --- 1. the primitives ------------------------------------------------------

describe('parseColor', () => {
  it('parses #rgb', () => expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 }));
  it('parses #rrggbb', () => expect(parseColor('#070910')).toEqual({ r: 7, g: 9, b: 16, a: 1 }));
  it('parses #rrggbbaa', () =>
    expect(parseColor('#0d111980')).toEqual({ r: 13, g: 17, b: 25, a: 128 / 255 }));
  it('parses rgb()', () => expect(parseColor('rgb(148, 163, 184)')).toEqual({ r: 148, g: 163, b: 184, a: 1 }));
  it('parses rgba() with a fractional alpha', () =>
    expect(parseColor('rgba(148, 163, 184, 0.62)')).toEqual({ r: 148, g: 163, b: 184, a: 0.62 }));
  it('tolerates surrounding whitespace and uppercase hex', () =>
    expect(parseColor('  #FFA95A  ')).toEqual({ r: 255, g: 169, b: 90, a: 1 }));
  it('throws on an unparseable value', () => expect(() => parseColor('chartreuse')).toThrow());
});

describe('relativeLuminance', () => {
  it('is 0 for black', () => expect(relativeLuminance(parseColor('#000'))).toBeCloseTo(0, 6));
  it('is 1 for white', () => expect(relativeLuminance(parseColor('#fff'))).toBeCloseTo(1, 6));
  it('is ~0.1845 for mid grey #777', () =>
    expect(relativeLuminance(parseColor('#777777'))).toBeCloseTo(0.1845, 4));
});

describe('contrastRatio', () => {
  it('is exactly 21 for white on black', () => expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 6));
  it('is 1 against itself', () => expect(contrastRatio('#1e2636', '#1e2636')).toBeCloseTo(1, 6));
  it('is symmetric', () =>
    expect(contrastRatio('#f2f5fc', '#070910')).toBeCloseTo(contrastRatio('#070910', '#f2f5fc'), 6));
  // The canonical WCAG worked example: #777 on white is the 4.48 borderline.
  it('reproduces the #777-on-white reference (4.48)', () =>
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2));
});

describe('composite / flatten', () => {
  it('src-over of an opaque colour returns that colour', () =>
    expect(composite(parseColor('#4fd8ff'), parseColor('#000'))).toEqual(parseColor('#4fd8ff')));
  it('a 50% white over black is the arithmetic midpoint', () =>
    expect(composite(parseColor('rgba(255,255,255,0.5)'), parseColor('#000'))).toEqual({
      r: 127.5, g: 127.5, b: 127.5, a: 1,
    }));
  it('flatten stacks bottom-first and yields an opaque result', () => {
    const out = flatten(['#000000', 'rgba(255,255,255,0.5)']);
    expect(out.a).toBe(1);
    expect(out.r).toBeCloseTo(127.5, 6);
  });
  it('flatten of a single opaque layer is identity', () =>
    expect(flatten(['#141a26'])).toEqual(parseColor('#141a26')));
});

describe('parseTokens / resolveToken', () => {
  it('extracts every custom property from the real tokens.css', () => {
    expect(T['--surface-0']).toBe('#070910');
    expect(T['--text-3']).toBe('#8592ad');
    expect(T['--accent']).toBe('#4fd8ff');
  });
  it('follows a var() alias chain (--accent-l -> --accent)', () =>
    expect(resolveToken('--accent-l', T)).toBe('#4fd8ff'));
  it('resolves a non-alias token to itself', () => expect(resolveToken('--ok', T)).toBe('#3ee08a'));
});

describe('requiredRatio', () => {
  it('demands 4.5 for normal-size text', () =>
    expect(requiredRatio('text', { px: 13, bold: false })).toBe(4.5));
  // "Large" is 18pt (24px), or 14pt BOLD (18.66px) — the bold allowance is a
  // lower px threshold, not a licence for any bold text.
  it('allows 3.0 at 24px', () => expect(requiredRatio('text', { px: 24, bold: false })).toBe(3));
  it('allows 3.0 at 18.66px when bold', () =>
    expect(requiredRatio('text', { px: 18.66, bold: true })).toBe(3));
  it('still demands 4.5 at 18.66px when NOT bold', () =>
    expect(requiredRatio('text', { px: 18.66, bold: false })).toBe(4.5));
  it('still demands 4.5 at 14px bold (14px != 14pt)', () =>
    expect(requiredRatio('text', { px: 14, bold: true })).toBe(4.5));
  it('still demands 4.5 at 13px bold', () =>
    expect(requiredRatio('text', { px: 13, bold: true })).toBe(4.5));
  it('demands 3.0 for UI components', () => expect(requiredRatio('ui')).toBe(3));
});

// --- 2. the shipped text tiers on every surface rung ------------------------

const SURFACES = ['--surface-0', '--surface-1', '--surface-2', '--surface-3', '--surface-4'] as const;

describe('text tiers on the elevation ladder', () => {
  // Measured: 18.23 / 17.31 / 15.96 / 13.89 / 11.69
  for (const s of SURFACES) {
    it(`--text on ${s} clears 4.5`, () =>
      expect(contrastRatio(c('--text'), c(s))).toBeGreaterThanOrEqual(4.5));
  }
  // Measured: 9.23 / 8.77 / 8.08 / 7.03 / 5.92
  for (const s of SURFACES) {
    it(`--text-2 on ${s} clears 4.5`, () =>
      expect(contrastRatio(c('--text-2'), c(s))).toBeGreaterThanOrEqual(4.5));
  }
  // Measured: 6.36 / 6.04 / 5.57 / 4.84 — surfaces 0..3 ONLY (see the guard below).
  for (const s of ['--surface-0', '--surface-1', '--surface-2', '--surface-3'] as const) {
    it(`--text-3 on ${s} clears 4.5`, () =>
      expect(contrastRatio(c('--text-3'), c(s))).toBeGreaterThanOrEqual(4.5));
  }
});

describe('the --text-3 x --surface-4 constraint', () => {
  // This pair FAILS AA (4.08). tokens.css documents the constraint in a comment;
  // this turns the comment into an executable guard. The token comment used to
  // claim "~4.4:1" and ">=5.3:1 on surfaces 0-3" — both were wrong (real: 4.08,
  // and 4.84 on surface-3). S7 corrected the comment to these measured numbers.
  it('is genuinely below 4.5, which is why the pair is forbidden', () => {
    expect(contrastRatio(c('--text-3'), c('--surface-4'))).toBeLessThan(4.5);
    expect(contrastRatio(c('--text-3'), c('--surface-4'))).toBeCloseTo(4.08, 2);
  });
  it('--text-2 is the sanctioned --surface-4 label tier and clears 4.5', () =>
    expect(contrastRatio(c('--text-2'), c('--surface-4'))).toBeGreaterThanOrEqual(4.5));
});

describe('status + channel colours as text on the surfaces they actually sit on', () => {
  for (const tok of ['--accent', '--accent-r', '--ok', '--warn', '--bad'] as const) {
    for (const s of SURFACES) {
      it(`${tok} on ${s} clears 4.5`, () =>
        expect(contrastRatio(c(tok), c(s))).toBeGreaterThanOrEqual(4.5));
    }
  }
});

// --- 3. the canvas: overlay glass + both dark themes ------------------------

/** The dark-glass recipe from panels.css `.stage` — one definition, two themes. */
const OVERLAY_BG = 'rgba(11, 16, 27, 0.88)';

describe('canvas overlay glass (the ONE dark-glass recipe)', () => {
  for (const theme of ['sound', 'plan'] as const) {
    const base = THEMES[theme].bg;
    it(`--overlay-text over the glass on the ${theme} canvas clears 4.5`, () =>
      expect(contrastRatio(c('--text-2'), [base, OVERLAY_BG])).toBeGreaterThanOrEqual(4.5));
    it(`--text (overlay-text-strong) over the glass on the ${theme} canvas clears 4.5`, () =>
      expect(contrastRatio(c('--text'), [base, OVERLAY_BG])).toBeGreaterThanOrEqual(4.5));
  }

  // The glass is translucent, so the worst case is the BRIGHTEST thing the canvas
  // can draw under it, not the background. Verified against the real THEMES ink.
  const BRIGHTEST = ['#8fc7e0', '#9be8ff', '#4fd8ff', '#3ee08a', '#ffffff'];
  for (const content of BRIGHTEST) {
    it(`--overlay-text over the glass over canvas content ${content} clears 4.5`, () =>
      expect(contrastRatio(c('--text-2'), [content, OVERLAY_BG])).toBeGreaterThanOrEqual(4.5));
  }
});

describe('canvas ink over its own theme background', () => {
  for (const theme of ['sound', 'plan'] as const) {
    const t = THEMES[theme];
    it(`${theme}.ink clears 4.5`, () =>
      expect(contrastRatio(t.ink, t.bg)).toBeGreaterThanOrEqual(4.5));
    it(`${theme}.muted clears 4.5`, () =>
      expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5));
    it(`${theme}.wall clears 3.0 as a graphical object`, () =>
      expect(contrastRatio(t.wall, t.bg)).toBeGreaterThanOrEqual(3));
    // gridLabel is real 11px ruler TEXT, so it owes 4.5 — the sound theme failed
    // this at 3.75 before S7 raised its alpha (C-2).
    it(`${theme}.gridLabel clears 4.5 as ruler text`, () =>
      expect(contrastRatio(t.gridLabel, t.bg)).toBeGreaterThanOrEqual(4.5));
  }
});

describe('the new canvas focus ring (WCAG 1.4.11, 3:1)', () => {
  // A negative outline-offset draws the ring INSIDE the canvas, i.e. over live
  // rendered content — so it must clear 3:1 against what the canvas can draw
  // beneath it, not merely against the empty background. The shipped ring is
  // two-tone (accent + a near-black casing) so at least one edge always contrasts.
  const RING = c('--accent');
  const CASING = 'rgba(4, 6, 12, 0.92)';
  for (const theme of ['sound', 'plan'] as const) {
    const t = THEMES[theme];
    for (const under of [t.bg, t.wall, t.ink, '#3ee08a', '#ffffff']) {
      it(`ring casing over ${theme} content ${under} clears 3.0`, () => {
        const cased = flatten([under, CASING]);
        const best = Math.max(
          contrastRatio(RING, [under, CASING]),
          contrastRatio(`rgb(${cased.r},${cased.g},${cased.b})`, under),
        );
        expect(best).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

// --- 4. the S7 contrast fixes (regression guards) ---------------------------

describe('S7 fix C-1: --border-input makes form fields perceivable (1.4.11)', () => {
  // A translucent border paints over the element's OWN background (background-clip
  // defaults to border-box), so BOTH edges matter: border-vs-own-fill AND the
  // composited border-vs-the-parent-panel. The first proposed alpha (0.62) cleared
  // only the card case and failed inside dialogs at 2.83 — the skeptic's catch.
  const border = c('--border-input');
  const CONTEXTS = [
    { name: 'field in a .card', fill: c('--surface-2'), parent: c('--surface-1') },
    { name: 'field in an .optimize-dialog', fill: c('--surface-2'), parent: c('--surface-3') },
    { name: 'dialog-field in a .dialog-panel', fill: c('--surface-1'), parent: c('--surface-3') },
  ];
  for (const ctx of CONTEXTS) {
    it(`${ctx.name}: border over its own fill clears 3.0`, () =>
      expect(contrastRatio(border, ctx.fill)).toBeGreaterThanOrEqual(3));
    it(`${ctx.name}: the composited border clears 3.0 against the panel`, () => {
      const edge = flatten([ctx.fill, border]);
      expect(contrastRatio(`rgb(${edge.r},${edge.g},${edge.b})`, ctx.parent)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('S7 fix C-3: the <Term> / spec-label dotted underline is perceivable', () => {
  // Was --border-strong (1.65) — the "there is an explanation here" affordance of
  // UX-4 was effectively invisible. Now --text-3 (an underline is a graphical
  // object, so 3:1 governs; it clears 4.5 anyway on both surfaces it appears on).
  for (const s of ['--surface-1', '--surface-2'] as const) {
    it(`underline on ${s} clears 3.0`, () =>
      expect(contrastRatio(c('--text-3'), c(s))).toBeGreaterThanOrEqual(3));
  }
});

describe('S7 fixes C-4/C-5/C-6: disabled controls stay readable', () => {
  // Element `opacity` fades the whole composited element — glyph AND fill — over
  // the parent. Modelling only the glyph (as the design pass did) overstates every
  // one of these by ~0.5-1.5. `fadeElement` implements the real model.
  it('C-4 .strip-btn:disabled over the dark glass clears 4.5', () => {
    // The toolstrip button has a transparent fill, so only the glyph fades; after
    // the fix it is a flat --text-3 with no opacity at all.
    const glass = flatten([THEMES.sound.bg, OVERLAY_BG]);
    expect(contrastRatio(c('--text-3'), `rgb(${glass.r},${glass.g},${glass.b})`)).toBeGreaterThanOrEqual(4.5);
  });
  for (const parent of ['--surface-1', '--surface-3'] as const) {
    it(`C-5 .btn:disabled on ${parent} clears 4.5`, () =>
      expect(contrastRatio(c('--text-2'), c(parent))).toBeGreaterThanOrEqual(4.5));
    it(`C-5 .btn-primary:disabled on ${parent} clears 4.5`, () =>
      expect(contrastRatio(c('--text-2'), c(parent))).toBeGreaterThanOrEqual(4.5));
  }
  it('C-6 .seat-remove:disabled clears 3.0 as an icon', () =>
    expect(contrastRatio(c('--text-3'), c('--surface-2'))).toBeGreaterThanOrEqual(3));

  it('fadeElement models opacity over the parent, not over the own fill', () => {
    // 45% of white text on a #141a26 button over a #0d1119 card.
    const out = fadeElement('#f2f5fc', '#141a26', 0.45, '#0d1119');
    expect(out.fg.r).toBeCloseTo(0.45 * 242 + 0.55 * 13, 3);
    expect(out.bg.r).toBeCloseTo(0.45 * 20 + 0.55 * 13, 3);
  });
});

describe('S7 guard: --text-3 is never paired with sub-12px type', () => {
  // tokens.css reserves --text-3 for text >= 12px. That half of the rule was
  // never executable; the ~11 pre-existing sites are allow-listed by name so the
  // count can only go DOWN, and a NEW violation fails the build.
  it('never grows beyond the frozen count of pre-existing sites', () => {
    const dir = new URL('../../components/', import.meta.url);
    const files: Record<string, string> = {};
    for (const sub of readdirSync(dir)) {
      let entries: string[];
      try {
        entries = readdirSync(new URL(`${sub}/`, dir));
      } catch {
        continue; // not a directory
      }
      for (const f of entries) {
        if (f.endsWith('.css')) files[`${sub}/${f}`] = readFileSync(new URL(`${sub}/${f}`, dir), 'utf8');
      }
    }
    expect(Object.keys(files).length).toBeGreaterThan(5); // the scan actually found stylesheets

    const offenders: string[] = [];
    for (const [path, css] of Object.entries(files)) {
      for (const block of String(css).split('}')) {
        if (!/color:\s*var\(--text-3\)/.test(block)) continue;
        const fs = block.match(/font-size:\s*([^;]+)/);
        if (!fs) continue;
        const raw = fs[1].trim();
        const px = raw.includes('--text-xs') ? 11 : Number((raw.match(/([\d.]+)px/) ?? [])[1] ?? NaN);
        if (Number.isFinite(px) && px < 12) {
          offenders.push(`${path.split('/').pop()}:${(block.match(/\.[\w-]+/) ?? ['?'])[0]}`);
        }
      }
    }
    // Frozen at the 10 pre-existing sites found by the S7 audit:
    //   gallery.css .gallery-meta · panels.css .card-tag/.pair-title/
    //   .metric-details/.speaker-model/.speaker-trim/.seat-z/.palette-dims ·
    //   ui.css .menu-item-detail/.menu-heading  (all 11px, all >=4.84:1 so they
    //   pass CONTRAST — this is the design system's own >=12px rule, not WCAG).
    // A ratchet: it may go down, never up.
    expect(offenders.length).toBeLessThanOrEqual(10);
  });
});
