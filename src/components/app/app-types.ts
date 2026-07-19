import type { Layout, SceneObject, SpeakerObj, Vec2 } from '../../engine/types';

/** Undo snapshots carry the layout they came from, so an undo after switching
 *  rooms restores into the right scene instead of the currently active one. */
export type Deleted =
  | { type: 'object'; layoutId: string; obj: SceneObject }
  | { type: 'speaker'; layoutId: string; speaker: SpeakerObj; pairs: Array<[string, string]> }
  | { type: 'layout'; layout: Layout; index: number; replacementId?: string }
  | { type: 'speakers'; layoutId: string; speakers: SpeakerObj[]; pairs: Array<[string, string]> };

export type DialogState =
  | { kind: 'room-size'; purpose: 'layout' | 'add-room' }
  | { kind: 'room-name'; zone: { center: Vec2; w: number; h: number } }
  | { kind: 'rename'; layoutId: string }
  | { kind: 'calibrate'; measured: number }
  | null;
