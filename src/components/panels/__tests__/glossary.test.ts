import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSSARY_KEYS, glossaryEntry, type TermKey } from '../glossary';

describe('glossary', () => {
  it('defines every term with a non-empty human name and definition', () => {
    for (const key of GLOSSARY_KEYS) {
      const entry = GLOSSARY[key];
      expect(entry.term.trim().length).toBeGreaterThan(0);
      expect(entry.def.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps definitions short enough for a phone popover (<= 180 chars)', () => {
    for (const key of GLOSSARY_KEYS) {
      expect(GLOSSARY[key].def.length).toBeLessThanOrEqual(180);
    }
  });

  it('exposes exactly the declared TermKey union in display order', () => {
    // The readout wires these keys; a typo would silently render nothing.
    const expected: TermKey[] = [
      'phantom-center',
      'lock',
      'itd',
      'ild',
      'sweet-spot',
      'comb-notch',
      'angle-60',
      'best-spot',
      'line-of-sight',
      'path-mismatch',
      'stereo-pair',
    ];
    expect(GLOSSARY_KEYS).toEqual(expected);
  });

  it('glossaryEntry returns the entry for a known key and undefined otherwise', () => {
    expect(glossaryEntry('lock')?.term).toBe('Lock');
    // @ts-expect-error — exercising the defensive path with an invalid key.
    expect(glossaryEntry('nope')).toBeUndefined();
  });
});
