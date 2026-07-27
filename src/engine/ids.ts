/**
 * Id minting — the one leaf every entity module can depend on.
 *
 * Moved verbatim out of `scene.ts` in S20 so `projects.ts` (which mints project
 * ids) can stay a pure leaf while `scene.ts` imports IT for store assembly. Left
 * in place, that would be a `scene → projects → scene` cycle. `scene.ts` re-exports
 * `createId`, so every existing importer is unchanged.
 *
 * The counter is module-scoped and monotonic within a session; combined with the
 * timestamp and the random suffix, two ids never collide in practice. Note the
 * counter is NOT zero-padded, so ids do not sort lexicographically in numeric
 * order — nothing may depend on id order (see the S20 handoff's known gaps).
 */
let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}
