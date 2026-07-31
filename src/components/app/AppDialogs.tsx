import type { LayoutStore } from '../../engine/types';
import type { DialogState } from './app-types';
import { CalibrateDialog, RenameDialog, RoomSizeDialog } from '../panels/LayoutDialogs';
import LayoutGallery from '../gallery/LayoutGallery';
import GenerateDialog from '../gallery/GenerateDialog';
import type { GenerateDesignApi } from './hooks/useGenerateDesign';
import ScenarioCompare, { type Scenario } from '../compare/ScenarioCompare';
import Toast, { type ToastData } from '../ui/Toast';

interface AppDialogsProps {
  dialog: DialogState;
  store: LayoutStore;
  galleryOpen: boolean;
  /** The scenarios to open compare with (>= 2), or null when it is closed. */
  compare: Scenario[] | null;
  toast: ToastData | null;
  canCompare: boolean;
  onCloseDialog: () => void;
  onAddRoomLayout: (w: number, d: number) => void;
  onAddRoom: (w: number, d: number, name: string) => void;
  onCommitRoomZone: (name: string) => void;
  onRenameLayout: (id: string, name: string) => void;
  onApplyCalibration: (measured: number, real: number) => void;
  onOpenLayout: (id: string) => void;
  /** Each takes the folder the new design should land in. */
  onNewRoom: (projectId: string) => void;
  onNewBlank: (projectId: string) => void;
  onNewApartment: (projectId: string) => void;
  generator: GenerateDesignApi;
  onImport: () => void;
  onRequestRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onExportAll: () => void;
  onCompare: () => void;
  onDelete: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: (id: string) => void;
  /** The dialog's submit handlers (the two above only OPEN the dialog). */
  onSubmitNewProject: (name: string) => void;
  onSubmitRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onMoveLayout: (layoutId: string, projectId: string) => void;
  onDropLayout: (layoutId: string, projectId: string, index: number | null) => void;
  onDropProject: (projectId: string, index: number) => void;
  /** Returns the id of the folder the merge minted, or null when it minted none. */
  onMergeLayouts: (dragId: string, targetId: string) => string | null;
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
      {dialog?.kind === 'project-name' && (
        <RenameDialog
          title={dialog.projectId ? 'Rename folder' : 'New folder'}
          fieldLabel="Folder name"
          submitLabel={dialog.projectId ? 'Rename' : 'Create folder'}
          placeholder="Living room"
          name={
            dialog.projectId
              ? (p.store.projects.find((x) => x.id === dialog.projectId)?.name ?? '')
              : ''
          }
          onSubmit={(name) =>
            dialog.projectId ? p.onSubmitRenameProject(dialog.projectId, name) : p.onSubmitNewProject(name)
          }
          onClose={p.onCloseDialog}
        />
      )}
      {/* Mounted OUTSIDE the gallery block so it survives the gallery closing
          on create — the toast's Undo would otherwise have nothing to return
          focus to. */}
      {p.generator.state && (
        <GenerateDialog
          state={p.generator.state}
          onArchetype={p.generator.setArchetype}
          onSeed={p.generator.setSeed}
          onReroll={p.generator.reroll}
          onKeep={p.generator.keep}
          onClose={p.generator.close}
        />
      )}
      {p.galleryOpen && (
        <LayoutGallery
          store={p.store}
          activeId={p.store.activeId}
          onOpen={p.onOpenLayout}
          onNewRoom={p.onNewRoom}
          onNewBlank={p.onNewBlank}
          onNewApartment={p.onNewApartment}
          onGenerate={p.generator.open}
          onImport={p.onImport}
          onRename={p.onRequestRename}
          onDuplicate={p.onDuplicate}
          onExport={p.onExport}
          onExportAll={p.onExportAll}
          onCompare={p.canCompare ? p.onCompare : undefined}
          onDelete={p.onDelete}
          onNewProject={p.onNewProject}
          onRenameProject={p.onRenameProject}
          onDeleteProject={p.onDeleteProject}
          onMoveLayout={p.onMoveLayout}
          onDropLayout={p.onDropLayout}
          onDropProject={p.onDropProject}
          onMergeLayouts={p.onMergeLayouts}
          onClose={p.onCloseGallery}
        />
      )}
      {p.compare && (
        <ScenarioCompare store={p.store} initial={p.compare} onClose={p.onCloseCompare} />
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
