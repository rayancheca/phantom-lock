/**
 * The jargon glossary — UX-4 / Session 16 (item A).
 *
 * Plain-English one-liners for every acoustic term the readout uses. Before this,
 * these definitions lived ONLY in hover `title=` tooltips — invisible on touch and
 * to the keyboard. This is the single source the `<Term>` popover and the TUNE
 * glossary both read, so a term is defined once and reachable everywhere.
 *
 * Pure + DOM-free (mirrors verdict.ts / mode.ts): node-testable, zero React.
 */

export type TermKey =
  | 'phantom-center'
  | 'lock'
  | 'itd'
  | 'ild'
  | 'sweet-spot'
  | 'comb-notch'
  | 'angle-60'
  | 'best-spot'
  | 'line-of-sight'
  | 'path-mismatch'
  | 'stereo-pair';

export interface GlossaryEntry {
  /** The human-readable term as shown in the popover heading. */
  term: string;
  /** One plain-English sentence. Kept short so it fits a popover on a phone. */
  def: string;
}

/** Insertion order is the order the TUNE glossary lists them (most load-bearing
 *  first). Definitions are deliberately jargon-free — they explain the concept,
 *  not restate the label. */
export const GLOSSARY: Record<TermKey, GlossaryEntry> = {
  'phantom-center': {
    term: 'Phantom center',
    def: 'The illusion of a singer floating between the two speakers, with no speaker actually there. A matched stereo pair conjures it.',
  },
  lock: {
    term: 'Lock',
    def: 'When the pair is symmetric enough that the phantom center snaps dead-centre and holds as you shift a little in your seat.',
  },
  itd: {
    term: 'Timing (ITD)',
    def: 'Inter-channel time difference — the tiny gap between when each speaker reaches your ears. Even 0.1 ms pulls the image toward the nearer one.',
  },
  ild: {
    term: 'Level balance (ILD)',
    def: 'How much louder one speaker is at your seat. A volume trim can fix level — it can never fix timing.',
  },
  'sweet-spot': {
    term: 'Sweet spot',
    def: 'The seat where the two speakers are balanced and the stereo image is sharpest — the apex of the listening triangle.',
  },
  'comb-notch': {
    term: 'Comb notch',
    def: 'A frequency that partly cancels when both speakers carry the same sound over unequal paths, thinning the tone.',
  },
  'angle-60': {
    term: '60° reference',
    def: 'Your head and the two speakers should form an equilateral triangle — about 60° between them — for a natural stereo stage.',
  },
  'best-spot': {
    term: 'Best spot',
    def: 'The seat this layout scores highest: clear line of sight to both speakers, even level, and the tightest lock.',
  },
  'line-of-sight': {
    term: 'Line of sight',
    def: 'A clear straight path from a speaker to your ears. If furniture or a wall blocks it, only reflections arrive.',
  },
  'path-mismatch': {
    term: 'Path mismatch',
    def: 'The difference in distance each speaker’s sound travels to your ears. Mismatch smears and shifts the phantom center.',
  },
  'stereo-pair': {
    term: 'Stereo pair',
    def: 'Two identical HomePods linked as left + right. Only a matched pair makes a phantom center — Apple won’t pair a HomePod with a mini.',
  },
};

/** All keys in display order (for the glossary list). */
export const GLOSSARY_KEYS = Object.keys(GLOSSARY) as TermKey[];

/** Safe lookup (returns undefined for an unknown key rather than throwing). */
export function glossaryEntry(key: TermKey): GlossaryEntry | undefined {
  return GLOSSARY[key];
}
