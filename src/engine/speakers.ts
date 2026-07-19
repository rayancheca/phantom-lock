import type { SpeakerModel, SpeakerObj, Vec2 } from './types';
import * as v from './vec';

export interface SpeakerModelSpec {
  id: SpeakerModel;
  name: string;
  short: string;
  /** Output capability relative to a full-size HomePod, dB. */
  refDb: number;
  /** Comfortable listening-distance band, metres. */
  idealMin: number;
  idealMax: number;
  /** Approximate low-frequency extension, Hz. */
  bassHz: number;
}

/**
 * Public ballpark specs. The mini's single full-range driver gives up roughly
 * 6 dB of output and most of the bass octave versus the HomePod's woofer +
 * beamforming tweeter array — which is why it wants to sit closer to you.
 */
export const SPEAKER_MODELS: Record<SpeakerModel, SpeakerModelSpec> = {
  homepod: { id: 'homepod', name: 'HomePod', short: 'HP', refDb: 0, idealMin: 1.0, idealMax: 3.5, bassHz: 40 },
  'homepod-mini': { id: 'homepod-mini', name: 'HomePod mini', short: 'mini', refDb: -6, idealMin: 0.7, idealMax: 2.2, bassHz: 90 },
};

export const MODEL_IDS = Object.keys(SPEAKER_MODELS) as SpeakerModel[];

/** Linear amplitude factor for ray energy / arrival strength. HomePod at 0 trim = 1. */
export function gainOf(sp: Pick<SpeakerObj, 'model' | 'trimDb'>): number {
  return Math.pow(10, (SPEAKER_MODELS[sp.model].refDb + sp.trimDb) / 20);
}

/** Level this speaker produces at a 3D distance d, dB (relative scale). */
export function levelAtDb(sp: Pick<SpeakerObj, 'model' | 'trimDb'>, d: number): number {
  return SPEAKER_MODELS[sp.model].refDb + sp.trimDb - 20 * Math.log10(Math.max(0.1, d));
}

export function dist3dTo(sp: SpeakerObj, listener: { pos: Vec2; z: number }): number {
  return Math.hypot(v.dist(sp.pos, listener.pos), sp.z - listener.z);
}

/** Apple only links stereo pairs between two speakers of the same model. */
export function canPair(a: SpeakerObj, b: SpeakerObj): boolean {
  return a.model === b.model;
}

/**
 * Trims (all ≤ 0, i.e. turning speakers DOWN) so every speaker lands at the
 * same level at the listener — anchored on the weakest speaker at 0 trim.
 */
export function matchTrims(
  speakers: SpeakerObj[],
  listener: { pos: Vec2; z: number },
): Map<string, number> {
  const out = new Map<string, number>();
  if (speakers.length === 0) return out;
  const raw = speakers.map((sp) => ({
    id: sp.id,
    level: SPEAKER_MODELS[sp.model].refDb - 20 * Math.log10(Math.max(0.1, dist3dTo(sp, listener))),
  }));
  const target = Math.min(...raw.map((r) => r.level));
  for (const r of raw) out.set(r.id, Math.round((target - r.level) * 10) / 10);
  return out;
}
