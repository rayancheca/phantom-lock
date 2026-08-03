/**
 * The archetype table — what kinds of home the generator knows how to build.
 *
 * Pure DATA, in the tradition of `tutorial/steps.ts`: an archetype names what
 * rooms exist and roughly how big the envelope is, and the solver derives every
 * coordinate. Nothing here is a function, so an archetype can be read, diffed
 * and argued with.
 *
 * ROOM NAMES ARE LOAD-BEARING. `arrange.ts`'s `ZONE_AFFINITY` matches
 * `RoomLabel.name` against `/bed|sleep|master|guest/i`, `/kitchen/i`,
 * `/living|lounge|tv|family/i`, `/office|study|work|desk/i` and friends, worth
 * +1.6 in the right zone and −0.9 or −2.5 in the wrong one. Rename "Living
 * room" to "Lounge" and it still matches; rename it to "Salon" and five
 * scoring rules go quiet and the furniture starts looking arbitrary.
 */

export type ArchetypeId =
  | 'studio'
  | 'one-bed'
  | 'two-bed'
  | 'loft'
  | 'railroad'
  | 'great-room'
  | 'cinema'
  | 'office';

export interface RoomSpec {
  /** Zone name written into the RoomLabel. MUST match a ZONE_AFFINITY regex. */
  name: string;
  /** Relative area weight — bigger rooms claim the bigger cells. */
  weight: number;
  /** Exactly one room per archetype carries the primary listening seat. */
  seat: 'primary' | 'secondary' | 'none';
}

/** Extra shape variation, so a one-room archetype is not just N rectangles. */
export type ShapeVariant = 'rect' | 'l-notch' | 'alcove';

export interface Archetype {
  id: ArchetypeId;
  label: string;
  blurb: string;
  rooms: RoomSpec[];
  /** Envelope range in metres, inclusive, drawn on a 0.5 m lattice. */
  width: [number, number];
  depth: [number, number];
  /** Fraction of eligible exterior edges that get a window. */
  windowRate: number;
  shape: readonly ShapeVariant[];
}

/**
 * The largest envelope any archetype may request.
 *
 * NOT a style choice. `arrange.ts`'s `openSlots` walks `sceneBounds` at a fixed
 * 0.45 m step, so its cost is O(span²) — measured at 51.5 ms for 25x25 and
 * 6.85 s at the JSON importer's 400 m ceiling. Keeping every archetype inside
 * the UI's own 2..25 m room band is what makes calling the arranger safe, and
 * `generate.test.ts` asserts it against every entry rather than a sample.
 */
export const MAX_ENVELOPE_M = 25;

/** The shortest side any generated room may have — narrower is a corridor. */
export const MIN_ROOM_SIDE = 2.4;

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  studio: {
    id: 'studio',
    label: 'Studio',
    blurb: 'One room that does everything',
    rooms: [{ name: 'Living room', weight: 1, seat: 'primary' }],
    width: [4.5, 7.5],
    depth: [4, 6.5],
    windowRate: 0.6,
    shape: ['rect', 'alcove', 'l-notch'],
  },
  'one-bed': {
    id: 'one-bed',
    label: 'One bedroom',
    blurb: 'Living room and a bedroom',
    rooms: [
      { name: 'Living room', weight: 1.4, seat: 'primary' },
      { name: 'Bedroom', weight: 1, seat: 'secondary' },
    ],
    width: [7, 11],
    depth: [5, 8],
    windowRate: 0.5,
    shape: ['rect'],
  },
  'two-bed': {
    id: 'two-bed',
    label: 'Two bedroom',
    blurb: 'Living room, bedroom, guest room',
    rooms: [
      { name: 'Living room', weight: 1.5, seat: 'primary' },
      { name: 'Bedroom', weight: 1.1, seat: 'secondary' },
      { name: 'Guest bedroom', weight: 1, seat: 'none' },
    ],
    width: [9, 14],
    depth: [6, 10],
    windowRate: 0.45,
    shape: ['rect'],
  },
  loft: {
    id: 'loft',
    label: 'Loft',
    blurb: 'Open living, a work corner, a sleeping end',
    rooms: [
      { name: 'Living room', weight: 1.8, seat: 'primary' },
      { name: 'Study', weight: 1, seat: 'none' },
      { name: 'Bedroom', weight: 1.2, seat: 'secondary' },
    ],
    // Trimmed in S33. At [10,15] x [7,11] the three cells averaged 38.5 m²
    // each and a "living room" routinely came out at 55 m² — bigger than the
    // whole 51.4 m² Maple Court apartment — which is why coverage read 8.1 %
    // and the plans looked empty. Measured: density 0.300 -> 0.451 with the
    // lock rate essentially unmoved (1.000 -> 0.983).
    width: [9, 12.5],
    depth: [6.5, 9],
    windowRate: 0.55,
    shape: ['rect', 'l-notch'],
  },
  railroad: {
    id: 'railroad',
    label: 'Railroad',
    blurb: 'Long and narrow, rooms in a line',
    rooms: [
      { name: 'Living room', weight: 1.2, seat: 'primary' },
      { name: 'Kitchen', weight: 1, seat: 'none' },
      { name: 'Bedroom', weight: 1.1, seat: 'secondary' },
    ],
    width: [12, 18],
    depth: [3.5, 5],
    windowRate: 0.4,
    shape: ['rect'],
  },
  'great-room': {
    id: 'great-room',
    label: 'Great room',
    blurb: 'One big open living and kitchen',
    rooms: [
      { name: 'Living room', weight: 2, seat: 'primary' },
      { name: 'Kitchen', weight: 1, seat: 'none' },
    ],
    // Trimmed in S33 for the same reason as `loft`, and it was the worst case
    // in the corpus: two cells over up to 140 m² put the median living room at
    // 49.5 m² and coverage at 7.3 %. Measured: density 0.212 -> 0.404, lock
    // unchanged at 1.000.
    width: [8, 11],
    depth: [6, 8.5],
    windowRate: 0.6,
    shape: ['rect', 'l-notch'],
  },
  cinema: {
    id: 'cinema',
    label: 'Home cinema',
    blurb: 'A deep room built around the screen',
    rooms: [{ name: 'TV room', weight: 1, seat: 'primary' }],
    width: [5, 8],
    depth: [6, 9],
    windowRate: 0.15,
    shape: ['rect', 'alcove'],
  },
  office: {
    id: 'office',
    label: 'Office',
    blurb: 'A small room to work and listen in',
    // The floor is raised from 3.5x3.0: below this a +/-30 degree stereo pair
    // cannot clear the walls at any radius, and the design ships with no
    // speakers rather than an unlocked pair.
    rooms: [{ name: 'Office', weight: 1, seat: 'primary' }],
    width: [4, 5.5],
    depth: [3.5, 4.5],
    windowRate: 0.5,
    shape: ['rect', 'alcove', 'l-notch'],
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as ArchetypeId[];
