import type { LayoutStore } from '../../engine/types';
import type { DialogState } from './app-types';
import { CalibrateDialog, RenameDialog, RoomSizeDialog } from '../panels/LayoutDialogs';
import LayoutGallery from '../gallery/LayoutGallery';
import ScenarioCompare, { type Scenario } from '../compare/ScenarioCompare';
import Toast, { type ToastData } from '../ui/Toast';

interface AppDialogsProps {
  dialog: DialogState;
  store: LayoutStore;
  galleryOpen: boolean;
  compare: { left: Scenario; right: Scenario } | null;
  toast: ToastData | null;
  canCompare: boolean;
  onCloseDialog: () => void;
  onAddRoomLayout: (w: number, d: number) => void;
  onAddRoom: (w: number, d: number, name: string) => void;
  onCommitRoomZone: (name: string) => void;
  onRenameLayout: (id: string, name: string) => void;
  onApplyCalibration: (measured: number, real: number) => void;
  onOpenLayout: (id: string) => void;
  onNewRoom: () => void;
  onNewBlank: () => void;
  onNewApartment: () => void;
  onImport: () => void;
  onRequestRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onExportAll: () => void;
  onCompare: () => void;
  onDelete: (id: string) => void;
  onCloseGallery: () => void;
  onCloseCompare: () => void;
  onDismissToast: () => void;
}

/** All modal overlays that live at the App root: layout dialogs, the gallery,
 *  the scenario compare, and the single-slot toast. */
export default function AppDialogs(p: AppDialogsProps) {
  const { dialog } = p;
  return (
    <>
      {dialog?.kind === 'room-size' && (
        <RoomSizeDialog
          title={dialog.purpose === 'layout' ? 'New rectangular room' : 'Add a room'}
          submitLabel={dialog.purpose === 'layout' ? 'Create room' : 'Add room'}
          askName={
            dialog.purpose === 'add-room'
              ? { label: 'Room name', placeholder: 'Kitchen, Bedroom…' }
              : undefined
          }
          onSubmit={(w, d, name) =>
            dialog.purpose === 'layout' ? p.onAddRoomLayout(w, d) : p.onAddRoom(w, d, name ?? '')
          }
          onClose={p.onCloseDialog}
        />
      )}
      {dialog?.kind === 'room-name' && (
        <RenameDialog
          name=""
          title="Name this area"
          fieldLabel="Area name"
          submitLabel="Mark area"
          placeholder="Kitchen, Bedroom…"
          onSubmit={p.onCommitRoomZone}
          onClose={p.onCloseDialog}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          name={p.store.layouts.find((l) => l.id === dialog.layoutId)?.name ?? ''}
          onSubmit={(name) => p.onRenameLayout(dialog.layoutId, name)}
          onClose={p.onCloseDialog}
        />
      )}
      {p.galleryOpen && (
        <LayoutGallery
          layouts={p.store.layouts}
          activeId={p.store.activeId}
          onOpen={p.onOpenLayout}
          onNewRoom={p.onNewRoom}
          onNewBlank={p.onNewBlank}
          onNewApartment={p.onNewApartment}
          onImport={p.onImport}
          onRename={p.onRequestRename}
          onDuplicate={p.onDuplicate}
          onExport={p.onExport}
          onExportAll={p.onExportAll}
          onCompare={p.canCompare ? p.onCompare : undefined}
          onDelete={p.onDelete}
          onClose={p.onCloseGallery}
        />
      )}
      {p.compare && (
        <ScenarioCompare
          layouts={p.store.layouts}
          initialLeft={p.compare.left}
          initialRight={p.compare.right}
          onClose={p.onCloseCompare}
        />
      )}
      {dialog?.kind === 'calibrate' && (
        <CalibrateDialog
          measured={dialog.measured}
          onSubmit={(real) => p.onApplyCalibration(dialog.measured, real)}
          onClose={p.onCloseDialog}
        />
      )}
      <Toast toast={p.toast} onDismiss={p.onDismissToast} />
    </>
  );
}
