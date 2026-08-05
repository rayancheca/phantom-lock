import type { Scene, ToolMode, Vec2 } from '../../../engine/types';
import type { DialogState } from '../app-types';
import type { ToastData } from '../../ui/Toast';
import { addRoomShell, createId } from '../../../engine/scene';
import { buildUnderlay } from '../../panels/underlay-import';

interface Args {
  /** Read by `deleteRoom` for the area's name, from the PRE-delete scene. */
  scene: Scene;
  /** Read for `commitRoomZone`'s narrowing — it only acts on a room-name dialog. */
  dialog: DialogState;
  /** Snapshotted BEFORE the write in `addRoom`; see the comment there. */
  hasWalls: boolean;
  setScene: (next: (s: Scene) => Scene) => void;
  setDialog: (d: DialogState) => void;
  setMode: (m: ToolMode) => void;
  setResetViewToken: (f: (n: number) => number) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => void;
  undoScene: () => void;
}

export interface BuildActions {
  setUnderlay: (underlay: Scene['underlay']) => void;
  importStarterPhoto: (file: File) => void;
  handleCalibrate: (a: Vec2, b: Vec2) => void;
  applyCalibration: (measured: number, real: number) => void;
  commitRoomZone: (name: string) => void;
  deleteRoom: (id: string) => void;
  addRoom: (w: number, d: number, name: string) => void;
}

/**
 * The DESIGN/Build actions — underlay import, two-click scale calibration,
 * areas, and room shells — extracted from AppInner in S37.
 *
 * They share no mutable state with each other; what makes them one unit is that
 * every one of them is a "change the plan itself" action reached from the Build
 * sub-step, and each ends by returning the canvas to the select tool. Two of
 * them have ordering that is easy to lose in a move and is pinned by tests:
 * `handleCalibrate` exits the calibrate tool ABOVE its too-close early return
 * (otherwise a rejected pair strands the user in a tool they cannot see they
 * are in), and `addRoom` snapshots `hasWalls` BEFORE the write.
 */
export function useBuildActions(a: Args): BuildActions {
  const setUnderlay = (underlay: Scene['underlay']) => {
    a.setScene((s) => ({ ...s, underlay }));
    if (underlay) a.setResetViewToken((n) => n + 1);
  };

  /** First-run "Start from a floorplan photo" — the DESIGN photo-import entry,
   *  reusing the same underlay builder as UnderlayCard. */
  const importStarterPhoto = (file: File) => {
    buildUnderlay(file)
      .then(setUnderlay)
      .catch(() => a.showToast('Could not read that image.', { tone: 'bad' }));
  };

  /** Two calibration clicks arrived — scale the underlay so they match reality. */
  const handleCalibrate = (p: Vec2, q: Vec2) => {
    const measured = Math.hypot(p.x - q.x, p.y - q.y);
    a.setMode('select');
    if (measured < 0.05) {
      a.showToast('Those points are too close together — click two points further apart.', {
        tone: 'bad',
      });
      return;
    }
    a.setDialog({ kind: 'calibrate', measured });
  };

  const applyCalibration = (measured: number, real: number) => {
    const factor = real / measured;
    a.setScene((s) =>
      s.underlay ? { ...s, underlay: { ...s.underlay, scale: s.underlay.scale * factor } } : s,
    );
    a.setDialog(null);
    a.setResetViewToken((n) => n + 1);
    a.showToast('Floorplan rescaled to match the real distance.', { tone: 'ok' });
  };

  /** A dragged room box arrived from the canvas — ask for its name. */
  const commitRoomZone = (name: string) => {
    if (a.dialog?.kind !== 'room-name') return;
    const { zone } = a.dialog;
    a.setScene((s) => ({
      ...s,
      rooms: [
        ...(s.rooms ?? []),
        { id: createId('room'), name, at: zone.center, w: zone.w, h: zone.h },
      ],
    }));
    a.setDialog(null);
    a.setMode('select');
    a.showToast(`Marked “${name}” — the optimizer can now target it`, { tone: 'ok' });
  };

  const deleteRoom = (id: string) => {
    // The lookup happens against the PRE-delete scene and is what gives the
    // toast the area's name; a missing id toasts nothing at all.
    const room = a.scene.rooms?.find((r) => r.id === id);
    a.setScene((s) => ({ ...s, rooms: (s.rooms ?? []).filter((r) => r.id !== id) }));
    if (room) a.showToast(`Removed “${room.name}”`, { action: { label: 'Undo', run: a.undoScene } });
  };

  /** Add a named rectangular room to the CURRENT layout — flush against the
   *  existing bounds, so a house composes room by room. */
  const addRoom = (w: number, d: number, name: string) => {
    // Snapshot BEFORE the write: the toast fires only when this room joined an
    // existing plan, and reading it after would race the state update.
    const hadWalls = a.hasWalls;
    a.setScene((s) => addRoomShell(s, name, w, d));
    a.setDialog(null);
    a.setMode('select');
    a.setResetViewToken((n) => n + 1);
    if (hadWalls) {
      a.showToast(
        `Added ${name.trim() ? `“${name.trim()}”` : 'a room'} next door — punch a door through the shared wall so sound can get through`,
        { tone: 'ok' },
      );
    }
  };

  return {
    setUnderlay,
    importStarterPhoto,
    handleCalibrate,
    applyCalibration,
    commitRoomZone,
    deleteRoom,
    addRoom,
  };
}
