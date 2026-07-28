/**
 * Design names. Stable per seed, and drawn BEFORE any geometry so that adding a
 * geometry draw later does not shift every existing name.
 */

import type { Archetype } from './archetypes';
import { pick, type Rng } from './rng';

const ADJECTIVES = [
  'Quiet',
  'Bright',
  'Corner',
  'Long',
  'Warm',
  'Soft',
  'Open',
  'Snug',
  'Tall',
  'Low',
  'North',
  'South',
  'Garden',
  'Attic',
  'Riverside',
  'Harbour',
  'Meadow',
  'Copper',
  'Linen',
  'Slate',
  'Amber',
  'Cedar',
  'Hollow',
  'Still',
] as const;

/** Adjective + the archetype's own noun: "Quiet two bedroom", "Long railroad". */
export function designName(rnd: Rng, arch: Archetype): string {
  return `${pick(rnd, ADJECTIVES)} ${arch.label.toLowerCase()}`;
}

/**
 * Make a name unique within its folder by appending a counter.
 *
 * Uniqueness is per FOLDER rather than global because that is the only place a
 * collision is visible — two identically-named designs in different folders
 * read as a coincidence, two in the same folder read as a bug.
 */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return base;
}

export const NAME_COUNT = ADJECTIVES.length;
