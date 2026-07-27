/**
 * The compare column's trace — S20.
 *
 * A column costs one full simulation, so N-up compare multiplies whatever a column
 * costs. It turns out almost all of that cost was never read.
 *
 * WHAT A COLUMN ACTUALLY READS FROM THE TRACE — enumerated, not assumed:
 *   stereo.ts:212             `computeAudio`'s `blockedById` map. This is the
 *                             function's ONLY use of `trace` (grep "trace" in
 *                             stereo.ts returns the import, the signature, :212).
 *   verdict.ts:41             `blockedFor`, consumed by `deriveVerdict`.
 *   MetricsPanel.tsx:133-134  the per-pair blocked lookup.
 * All three read `.direct.blocked` and nothing else.
 *
 * The two readers of the RAY FAN — `render.ts` `drawRays`/`drawWaves`, and
 * `Echogram`'s `binArrivals` — are not mounted in a column. A column renders
 * `Preview` (which calls `drawMiniPlan`, taking no trace at all), `VerdictHero`
 * and `MetricsPanel`.
 *
 * WHY DROPPING THE FAN IS EXACT RATHER THAN AN APPROXIMATION: `traceScene`
 * (raytrace.ts:312-321) is literally
 *     { trace: traceSpeaker(surfaces, …, rayCount, maxBounces, …),
 *       direct: directPath(surfaces, sp.pos, sp.z, listener.pos, listener.z) }
 * per speaker — and `directPath` takes NEITHER `rayCount` NOR `maxBounces`. So the
 * direct paths below are bit-identical to a full trace's BY CONSTRUCTION, not by
 * measurement. This composes the same two exported engine functions `stereo.ts`
 * already imports together; NO file under `src/engine/` changes.
 *
 * MEASURED (S20, `docs/sessions/S20/bench/direct-only.mts`, median of 11,
 * DEFAULT_SETTINGS rayCount 360 / maxBounces 5):
 *     seeded Maple Court demo   24.78 ms → 0.016 ms  (1565×)
 *     bare room + one pair       1.29 ms → 0.003 ms   (435×)
 *     20-room chain, two pairs  27.14 ms → 0.049 ms   (558×)
 *     50-room chain, one pair   30.40 ms → 0.119 ms   (256×)
 * with `direct[]`, `computeAudio(...)` and `deriveVerdict(...)` JSON-identical in
 * every case. That is what makes an arbitrary N affordable.
 *
 * ⚠ IF A COLUMN EVER GROWS A FEATURE THAT DRAWS RAYS OR AN ECHOGRAM, it must go
 * back to a full `traceScene` — this helper hands it an EMPTY fan, silently. The
 * guard is `__tests__/compute-scenario.test.ts`, whose corpus asserts the
 * enumeration above and carries a negative control.
 *
 * What this does NOT make cheap: `computeAudio` itself, whose `bestPairSpot` grid
 * sweep runs once per apex-BLOCKED pair. On real layouts that is fractions of a
 * millisecond; on an adversarial import-legal payload (64 speakers / 32 blocked
 * pairs) it is ~10.9 s per column — a PRE-EXISTING residual that the 2-up compare
 * already paid twice and `useSimulation` pays on every edit. N-up multiplies it
 * rather than introducing it; see `docs/sessions/S20/bench/RESULTS.md` and
 * `docs/ideas.md` §2d.
 */
import { collectSurfaces, directPath } from '../../engine/raytrace';
import type { Scene, TraceResult } from '../../engine/types';

/**
 * The per-speaker direct paths for `scene`'s ACTIVE seat, with an empty ray fan.
 *
 * Reads `scene.listener` — the mirror that `setActiveListener` keeps equal to the
 * active seat — so a per-column seat pick is honoured exactly as `traceScene` does.
 */
export function directOnlyTrace(scene: Scene): TraceResult {
  const surfaces = collectSurfaces(scene.objects);
  return {
    bySpeaker: scene.speakers.map((sp) => ({
      id: sp.id,
      trace: { paths: [], arrivals: [] },
      direct: directPath(surfaces, sp.pos, sp.z, scene.listener.pos, scene.listener.z),
    })),
  };
}
