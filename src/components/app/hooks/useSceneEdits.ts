import type {
  Layout,
  Scene,
  SceneObject,
  Selection,
  SimSettings,
  SpeakerObj,
  Vec2,
} from '../../../engine/types';
import type { Deleted } from '../app-types';
import type { ToastData } from '../../ui/Toast';
import { matchTrims } from '../../../engine/speakers';
import {
  addListener,
  createId,
  FURNITURE_PRESETS,
  removeListener,
  renameListener,
  sceneBounds,
  setActiveListener,
  splitWallAt,
  updateActiveListener,
} from '../../../engine/scene';
import { openingNearPoint, seatObjectAgainstWall } from '../../canvas/placement';

interface Args {
  scene: Scene;
  settings: SimSettings;
  active: Layout;
  setScene: (next: (s: Scene) => Scene) => void;
  setSelection: (sel: Selection) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
  undoScene: () => void;
  /** The app's SINGLE undo slot, minted in AppInner and shared with
   *  useProposals / useLayoutActions / useProjectActions. Passed in, never
   *  created here — a second ref would silently split the slot in two, and a
   *  delete would then be undoable from one place and not another. */
  lastDeletedRef: React.RefObject<Deleted | null>;
  /** Set when a command could not act, so the user hears why. */
  setNotice: (msg: string | null) => void;
}

export interface SceneEdits {
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  deleteObject: (id: string) => void;
  updateSpeaker: (id: string, patch: Partial<SpeakerObj>) => void;
  deleteSpeaker: (id: string) => void;
  setPairForSpeaker: (id: string, partnerId: string | null) => void;
  updateListener: (patch: Partial<Scene['listener']>) => void;
  deleteMulti: (objectIds: string[], speakerIds: string[]) => void;
  switchSeat: (id: string) => void;
  addSeat: () => void;
  renameSeat: (id: string, name: string) => void;
  removeSeat: (id: string) => void;
  seatSelection: (id: string) => void;
  splitWall: (id: string, at?: Vec2) => void;
  addPreset: (presetId: string) => void;
  matchVolumes: () => void;
}

/**
 * Every edit that writes the SCENE rather than the store, extracted from
 * AppInner in S37: objects, speakers, pairs, the listener, multi-selection
 * deletes, the seat roster, and the three creation helpers.
 *
 * None of these is memoized — the same as before the move, and deliberate.
 * Nothing here is used as an effect dependency: they feed JSX props, the
 * command dispatcher's per-call context, and `useTutorial` (which mirrors its
 * arguments into a ref). Wrapping them in `useCallback` would buy nothing and
 * would need dependency arrays over `scene`, which changes on every edit.
 *
 * The pattern that IS load-bearing: the delete paths snapshot into
 * `lastDeletedRef` from the PRE-delete scene, before calling setScene, and
 * they read `a.scene` at call time so the snapshot is the state the user was
 * actually looking at.
 */
export function useSceneEdits(a: Args): SceneEdits {
  const updateObject = (id: string, patch: Partial<SceneObject>) => {
    a.setScene((s) => ({
      ...s,
      objects: s.objects.map((o) => {
        if (o.id === id) return { ...o, ...patch } as SceneObject;
        if ((patch as { role?: string }).role === 'tv' && o.kind === 'rect' && o.role === 'tv') {
          return { ...o, role: 'furniture' };
        }
        return o;
      }),
    }));
  };

  const deleteObject = (id: string) => {
    const obj = a.scene.objects.find((o) => o.id === id);
    if (obj) {
      a.lastDeletedRef.current = { type: 'object', layoutId: a.active.id, obj };
      a.showToast(`Deleted ${obj.kind === 'wall' ? 'wall' : obj.label || 'object'}`, {
        action: { label: 'Undo', run: a.undoScene },
      });
    }
    a.setScene((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== id) }));
    a.setSelection(null);
  };

  const updateSpeaker = (id: string, patch: Partial<SpeakerObj>) => {
    a.setScene((s) => ({
      ...s,
      speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
    }));
  };

  const deleteSpeaker = (id: string) => {
    const speaker = a.scene.speakers.find((s) => s.id === id);
    if (speaker) {
      a.lastDeletedRef.current = {
        type: 'speaker',
        layoutId: a.active.id,
        speaker,
        pairs: a.scene.pairs.filter(([x, y]) => x === id || y === id),
      };
      a.showToast(`Deleted speaker ${speaker.label}`, { action: { label: 'Undo', run: a.undoScene } });
    }
    a.setScene((s) => ({
      ...s,
      speakers: s.speakers.filter((sp) => sp.id !== id),
      pairs: s.pairs.filter(([x, y]) => x !== id && y !== id),
    }));
    a.setSelection(null);
  };

  const setPairForSpeaker = (id: string, partnerId: string | null) => {
    a.setScene((s) => {
      const pairs = s.pairs.filter(
        ([x, y]) => x !== id && y !== id && x !== partnerId && y !== partnerId,
      );
      if (partnerId) pairs.push([id, partnerId]);
      return { ...s, pairs };
    });
  };

  const updateListener = (patch: Partial<Scene['listener']>) => {
    a.setScene((s) => updateActiveListener(s, patch));
  };

  /** Delete every member of a multi-selection in one undoable step. */
  const deleteMulti = (objectIds: string[], speakerIds: string[]) => {
    a.setScene((s) => ({
      ...s,
      objects: s.objects.filter((o) => !objectIds.includes(o.id)),
      speakers: s.speakers.filter((sp) => !speakerIds.includes(sp.id)),
      pairs: s.pairs.filter(([x, y]) => !speakerIds.includes(x) && !speakerIds.includes(y)),
    }));
    a.setSelection(null);
    const n = objectIds.length + speakerIds.length;
    a.showToast(`Deleted ${n} item${n === 1 ? '' : 's'}`, { action: { label: 'Undo', run: a.undoScene } });
  };

  // --- listening positions (seats) -----------------------------------------
  const switchSeat = (id: string) => {
    a.setScene((s) => setActiveListener(s, id));
    a.setSelection({ type: 'listener' });
  };
  const addSeat = () => {
    a.setScene((s) => addListener(s));
    a.setSelection({ type: 'listener' });
  };
  const renameSeat = (id: string, name: string) => {
    a.setScene((s) => renameListener(s, id, name));
  };
  const removeSeat = (id: string) => {
    a.setScene((s) => removeListener(s, id));
  };

  /** Break a wall in two at a point (or its midpoint) and select the first half.
   *  The id is computed synchronously so selection happens in this same handler. */
  /**
   * The ONE write seam for the seat command. The `f` key, the Inspector button and
   * the touch HUD all land here, so none of them can bypass the same-ref no-op
   * contract and push a phantom undo entry.
   */
  const seatSelection = (id: string) => {
    const seated = seatObjectAgainstWall(a.scene, id, { snapOn: a.settings.snap });
    if (seated === a.scene) {
      a.setNotice('No wall within 1.2 m — drag it closer, then seat it.');
      return;
    }
    a.setScene(() => seated);
  };

  const splitWall = (id: string, at?: Vec2) => {
    const wall = a.scene.objects.find((o) => o.id === id);
    if (!wall || wall.kind !== 'wall') return;
    const [first, second] = splitWallAt(wall, at);
    a.setScene((s) => ({
      ...s,
      objects: s.objects.flatMap((o) => (o.id === id ? [first, second] : [o])),
    }));
    a.setSelection({ type: 'object', id: first.id });
  };

  const addPreset = (presetId: string) => {
    const preset = FURNITURE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const b = sceneBounds(a.scene);
    const center: Vec2 = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
    // A door/window preset drops onto the nearest wall (correctly aligned) rather
    // than floating unrotated in mid-room. `makeOpening` gives byte-identical
    // defaults to the preset, so there is no dimensional drift; if the scene has
    // no wall yet, fall through to the plain centre drop below.
    if (preset.role === 'door' || preset.role === 'window') {
      const res = openingNearPoint(a.scene, center, preset.role);
      if (res) {
        a.setScene(() => res.scene);
        a.setSelection({ type: 'object', id: res.objectId });
        return;
      }
    }
    const obj: SceneObject =
      preset.kind === 'circle'
        ? {
            id: createId('circle'),
            kind: 'circle',
            center,
            r: preset.w / 2,
            absorption: preset.absorption,
            label: preset.label,
            height: preset.height,
          }
        : {
            id: createId('rect'),
            kind: 'rect',
            center,
            w: preset.w,
            h: preset.h,
            rotation: 0,
            absorption: preset.absorption,
            label: preset.label,
            role: preset.role ?? 'furniture',
            height: preset.height,
          };
    a.setScene((s) => {
      const objects =
        preset.role === 'tv'
          ? s.objects.map((o) => (o.kind === 'rect' && o.role === 'tv' ? { ...o, role: 'furniture' as const } : o))
          : s.objects;
      return { ...s, objects: [...objects, obj] };
    });
    a.setSelection({ type: 'object', id: obj.id });
  };

  /** Level-match every speaker at the active seat, so a pair is judged on
   *  geometry rather than on whichever pod happens to be louder. */
  const matchVolumes = () => {
    const trims = matchTrims(a.scene.speakers, a.scene.listener);
    a.setScene((s) => ({
      ...s,
      speakers: s.speakers.map((sp) => ({ ...sp, trimDb: trims.get(sp.id) ?? sp.trimDb })),
    }));
  };

  return {
    updateObject,
    deleteObject,
    updateSpeaker,
    deleteSpeaker,
    setPairForSpeaker,
    updateListener,
    deleteMulti,
    switchSeat,
    addSeat,
    renameSeat,
    removeSeat,
    seatSelection,
    splitWall,
    addPreset,
    matchVolumes,
  };
}
