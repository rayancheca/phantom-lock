import { describe, expect, it } from 'vitest';
import { planImageFilename } from '../export-image';

describe('planImageFilename', () => {
  it('slugifies a layout name into a .png filename', () => {
    expect(planImageFilename('Maple Court')).toBe('phantom-lock-maple-court.png');
  });

  it('collapses punctuation/whitespace and trims edge dashes', () => {
    expect(planImageFilename('  My Place!! (2) ')).toBe('phantom-lock-my-place-2.png');
  });

  it('falls back to "plan" when the name has no usable characters', () => {
    expect(planImageFilename('   ')).toBe('phantom-lock-plan.png');
    expect(planImageFilename('!!!')).toBe('phantom-lock-plan.png');
  });

  it('caps the slug length', () => {
    const long = 'a'.repeat(100);
    const out = planImageFilename(long);
    expect(out.startsWith('phantom-lock-')).toBe(true);
    expect(out.endsWith('.png')).toBe(true);
    // slug portion capped at 40 chars
    expect(out.length).toBeLessThanOrEqual('phantom-lock-'.length + 40 + '.png'.length);
  });
});
