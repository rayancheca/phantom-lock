import { useMemo } from 'react';
import type { Scene, SimSettings } from '../../../engine/types';
import { traceScene } from '../../../engine/raytrace';
import { computeAudio, type AudioMetrics } from '../../../engine/stereo';
import { bestListeningSpot, type ListeningField } from '../../../engine/bestspot';
import type { TraceResult } from '../../../engine/types';

/** While dragging, trace with the spec minimum so interaction stays fluid. */
export const DRAG_RAYS = 360;

export interface Simulation {
  trace: TraceResult;
  audio: AudioMetrics;
  bestSpot: ListeningField | null;
}

/**
 * The render-path derivation chain: ray trace → stereo metrics → best-spot field.
 * Pure reads with no side effects — the three memos keep the exact dependency
 * arrays the inline App code used, so recompute granularity is unchanged.
 * (Session 6 will move `traceScene`/`bestListeningSpot` off the main thread.)
 */
export function useSimulation(scene: Scene, settings: SimSettings, dragging: boolean): Simulation {
  const effRays = dragging ? Math.min(settings.rayCount, DRAG_RAYS) : settings.rayCount;

  const trace = useMemo(
    () => traceScene(scene, effRays, settings.maxBounces),
    [scene, effRays, settings.maxBounces],
  );
  const audio = useMemo(
    () => computeAudio(scene, trace, settings.tvAnchor),
    [scene, trace, settings.tvAnchor],
  );
  const bestSpot = useMemo(
    () =>
      settings.showBestSpot && scene.speakers.length > 0
        ? bestListeningSpot(scene, settings.tvAnchor, dragging)
        : null,
    [scene, settings.showBestSpot, settings.tvAnchor, dragging],
  );

  return { trace, audio, bestSpot };
}
