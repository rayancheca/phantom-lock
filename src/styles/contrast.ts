/**
 * WCAG 2.x contrast maths (S7 / deliverable 3).
 *
 * Pure + DOM-free (mirrors keyboard.ts / mode.ts / verdict.ts / font-ready.ts):
 * zero React, zero engine reads. Node-testable, so the token pairs the design
 * system actually ships can be asserted in the normal `npm test` run.
 *
 * Why this exists rather than leaning on axe: every colour in this app is a
 * `var(--token)`, and jsdom does not resolve custom properties — `getComputedStyle`
 * hands back the literal string `"var(--text-3)"`, so axe's `color-contrast` rule
 * cannot run there at all (it lands in `incomplete`). Real numbers have to come
 * from the tokens themselves.
 */

export interface RGBA {
  /** 0-255, not necessarily integral after compositing. */
  r: number;
  g: number;
  b: number;
  /** 0-1. */
  a: number;
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

/** Parse `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()`. Throws on anything
 *  else — a silent fallback would let a typo'd token quietly "pass" the audit. */
export function parseColor(css: string): RGBA {
  const s = css.trim();

  const h3 = HEX3.exec(s);
  if (h3) {
    return { r: parseInt(h3[1] + h3[1], 16), g: parseInt(h3[2] + h3[2], 16), b: parseInt(h3[3] + h3[3], 16), a: 1 };
  }
  const h8 = HEX8.exec(s);
  if (h8) {
    return {
      r: parseInt(h8[1], 16),
      g: parseInt(h8[2], 16),
      b: parseInt(h8[3], 16),
      a: parseInt(h8[4], 16) / 255,
    };
  }
  const h6 = HEX6.exec(s);
  if (h6) return { r: parseInt(h6[1], 16), g: parseInt(h6[2], 16), b: parseInt(h6[3], 16), a: 1 };

  const fn = RGB_FN.exec(s);
  if (fn) {
    const rawA = fn[4];
    const a = rawA === undefined ? 1 : rawA.endsWith('%') ? Number(rawA.slice(0, -1)) / 100 : Number(rawA);
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a };
  }

  throw new Error(`contrast: unsupported colour "${css}"`);
}

/** Source-over compositing in sRGB 8-bit space — what a browser does for a
 *  translucent `background-color`/`border-color`. The result is always opaque. */
export function composite(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a;
  return {
    r: a * fg.r + (1 - a) * bg.r,
    g: a * fg.g + (1 - a) * bg.g,
    b: a * fg.b + (1 - a) * bg.b,
    a: 1,
  };
}

/** Flatten a bottom-first stack of layers into one opaque colour.
 *  `flatten(['#080b12', 'rgba(11,16,27,0.88)'])` = the canvas glass recipe. */
export function flatten(layers: readonly string[]): RGBA {
  if (layers.length === 0) throw new Error('contrast: flatten needs at least one layer');
  return layers.map(parseColor).reduce((acc, layer) => composite(layer, acc));
}

const linearise = (channel8: number): number => {
  const s = channel8 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG 2.x relative luminance. Alpha is ignored — composite first. */
export function relativeLuminance(c: RGBA): number {
  return 0.2126 * linearise(c.r) + 0.7152 * linearise(c.g) + 0.0722 * linearise(c.b);
}

/** The WCAG contrast ratio between a foreground and a (possibly layered)
 *  background. A translucent foreground is composited over the flattened stack. */
export function contrastRatio(fg: string, bg: string | readonly string[]): number {
  const base = flatten(typeof bg === 'string' ? [bg] : bg);
  const front = composite(parseColor(fg), base);
  const lf = relativeLuminance(front);
  const lb = relativeLuminance(base);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Model CSS element `opacity` on a disabled control.
 *
 * `opacity` fades the WHOLE rendered element — its text AND its own background —
 * over the parent surface. Fading only the glyph (the intuitive but wrong model)
 * overstates disabled-state contrast, which is exactly how `.btn-primary:disabled`
 * was mis-scored during the S7 design pass.
 */
export function fadeElement(
  fg: string,
  ownBg: string,
  alpha: number,
  parent: string,
): { fg: RGBA; bg: RGBA } {
  const p = parseColor(parent);
  const faded = (c: string) => composite({ ...parseColor(c), a: alpha }, p);
  return { fg: faded(fg), bg: faded(ownBg) };
}

/** Strip `/* ... *&#47;` blocks. Required before scanning declarations: this
 *  file's own tokens are documented with comments that quote token names,
 *  ratios ("1.65:1") and prose semicolons, which a naive scan happily
 *  mis-reads as declarations — and a greedy match then swallows the real ones. */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extract every `--name: value;` declaration from a stylesheet's text. */
export function parseTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Resolve a token name to a literal colour, following `var(--alias)` chains
 *  (`--accent-l` -> `--accent` -> `#4fd8ff`). Guards against a cyclic alias. */
export function resolveToken(name: string, tokens: Record<string, string>, depth = 0): string {
  if (depth > 16) throw new Error(`contrast: cyclic var() chain at ${name}`);
  const value = tokens[name];
  if (value === undefined) throw new Error(`contrast: unknown token ${name}`);
  const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  return alias ? resolveToken(alias[1], tokens, depth + 1) : value;
}

export interface TextSize {
  px: number;
  bold: boolean;
}

/**
 * The AA threshold. "Large" text (>=24px, or >=18.66px bold) drops to 3:1;
 * UI components and graphical objects (1.4.11) are always 3:1.
 */
export function requiredRatio(kind: 'ui'): 3;
export function requiredRatio(kind: 'text', size: TextSize): 4.5 | 3;
export function requiredRatio(kind: 'text' | 'ui', size?: TextSize): 4.5 | 3 {
  if (kind === 'ui' || !size) return 3;
  const large = size.px >= 24 || (size.bold && size.px >= 18.66);
  return large ? 3 : 4.5;
}
