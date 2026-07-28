/**
 * Seeded randomness. Pure leaf — imports nothing.
 *
 * Nothing like this existed: `grep Math.random src/` finds exactly one runtime
 * use, inside `ids.ts`. That absence is deliberate and this module keeps it
 * that way — every draw below is a total function of the seed, so "the same
 * seed gives the same design" is a property of the code rather than a hope.
 *
 * Determinism stops at IDS, and that boundary is worth stating here because it
 * is where a test will otherwise get confused: `createId` mixes `Date.now()`, a
 * module counter and `Math.random()`, so a generated scene is reproducible in
 * its GEOMETRY and never in its ids.
 */

export type Rng = () => number;

/**
 * mulberry32. Chosen over xorshift128 because it carries one 32-bit word of
 * state, so `mulberry32(seed)` is a total function of the seed with no
 * initialisation ritual to get wrong.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [lo, hi). */
export function range(rnd: Rng, lo: number, hi: number): number {
  return lo + rnd() * (hi - lo);
}

/**
 * Uniform on a lattice covering [lo, hi] inclusive at `step`.
 *
 * The lattice is what makes the design space FINITE and countable — without it
 * every seed produces a floorplan differing from every other by a millimetre,
 * and "how many distinct designs are there?" has no honest answer.
 */
export function lattice(rnd: Rng, lo: number, hi: number, step: number): number {
  const steps = Math.max(0, Math.round((hi - lo) / step));
  const k = Math.min(steps, Math.floor(rnd() * (steps + 1)));
  // Re-derive from the integer rather than accumulating, so the result is an
  // exact multiple of `step` above `lo` and two runs cannot drift apart.
  return Math.round((lo + k * step) * 1e6) / 1e6;
}

/** One of `xs`. Throws on an empty array rather than returning undefined. */
export function pick<T>(rnd: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('pick from an empty list');
  return xs[Math.min(xs.length - 1, Math.floor(rnd() * xs.length))];
}

export function chance(rnd: Rng, p: number): boolean {
  return rnd() < p;
}

/**
 * A fresh 32-bit seed. THE single impure function in the generator, kept at the
 * boundary so everything below it is a total function of its arguments.
 */
export function randomSeed(): number {
  return (Math.random() * 0x1_0000_0000) >>> 0;
}

/** 8-character lowercase hex — fixed width, so the UI never reflows. */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

/** Parse a user-entered seed; returns null when it is not 32-bit hex. */
export function parseSeed(text: string): number | null {
  const t = text.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,8}$/i.test(t)) return null;
  return parseInt(t, 16) >>> 0;
}
