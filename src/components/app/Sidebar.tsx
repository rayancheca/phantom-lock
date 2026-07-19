import type { Scene, SceneObject, Selection, SimSettings, SpeakerModel, SpeakerObj, TraceResult } from '../../engine/types';
import type { AudioMetrics } from '../../engine/stereo';
import type { Step } from '../panels/WorkflowSteps';
import GuidePanel from '../panels/GuidePanel';
import UnderlayCard from '../panels/UnderlayCard';
import FurniturePalette from '../panels/FurniturePalette';
import SpeakersCard from '../panels/SpeakersCard';
import ListenerCard from '../panels/ListenerCard';
import MetricsPanel from '../panels/MetricsPanel';
import InspectorPanel from '../panels/InspectorPanel';
import ControlsCard from '../panels/ControlsCard';
import Echogram from '../panels/Echogram';

interface SidebarProps {
  step: Step;
  scene: Scene;
  settings: SimSettings;
  selection: Selection;
  trace: TraceResult;
  audio: AudioMetrics;
  hasWalls: boolean;
  calibrating: boolean;
  detecting: boolean;
  onCreateRoom: () => void;
  onDeleteRoom: (id: string) => void;
  onInsertRectRoom: () => void;
  onDrawWalls: () => void;
  onUnderlay: (underlay: Scene['underlay']) => void;
  onCalibrate: () => void;
  onDetect: () => void;
  onError: (message: string) => void;
  onAddPreset: (presetId: string) => void;
  onCustomBox: () => void;
  onCustomCircle: () => void;
  onArrange: () => void;
  onSelectSpeaker: (id: string) => void;
  onAddModel: (model: SpeakerModel) => void;
  onMatchVolumes: () => void;
  onSwitchSeat: (id: string) => void;
  onAddSeat: () => void;
  onRenameSeat: (id: string, name: string) => void;
  onRemoveSeat: (id: string) => void;
  onCompare: () => void;
  onSuggest: () => void;
  onUpdateObject: (id: string, patch: Partial<SceneObject>) => void;
  onDeleteObject: (id: string) => void;
  onUpdateSpeaker: (id: string, patch: Partial<SpeakerObj>) => void;
  onDeleteSpeaker: (id: string) => void;
  onSetPair: (id: string, partnerId: string | null) => void;
  onUpdateListener: (patch: Partial<Scene['listener']>) => void;
  onSplitWall: (id: string) => void;
  onDeleteMulti: (objectIds: string[], speakerIds: string[]) => void;
  onSettingsChange: (settings: SimSettings) => void;
}

/** The right-hand panel column — content is step-driven. */
export default function Sidebar(p: SidebarProps) {
  const isSoundOrAnalyze = p.step === 'sound' || p.step === 'analyze';
  return (
    <aside className="sidebar" aria-label="Panels">
      {p.step !== 'analyze' && (
        <GuidePanel
          step={p.step}
          hasWalls={p.hasWalls}
          rooms={p.scene.rooms ?? []}
          onCreateRoom={p.onCreateRoom}
          onDeleteRoom={p.onDeleteRoom}
          onInsertRectRoom={p.onInsertRectRoom}
          onDrawWalls={p.onDrawWalls}
        />
      )}
      {p.step === 'build' && (
        <UnderlayCard
          scene={p.scene}
          onUnderlay={p.onUnderlay}
          onCalibrate={p.onCalibrate}
          calibrating={p.calibrating}
          onDetect={p.onDetect}
          detecting={p.detecting}
          onError={p.onError}
        />
      )}
      {p.step === 'furnish' && (
        <FurniturePalette
          onAddPreset={p.onAddPreset}
          onCustomBox={p.onCustomBox}
          onCustomCircle={p.onCustomCircle}
          onArrange={p.onArrange}
        />
      )}
      {isSoundOrAnalyze && (
        <SpeakersCard
          scene={p.scene}
          trace={p.trace}
          selection={p.selection}
          onSelect={p.onSelectSpeaker}
          onAddModel={p.onAddModel}
          onMatchVolumes={p.onMatchVolumes}
        />
      )}
      {isSoundOrAnalyze && (
        <ListenerCard
          scene={p.scene}
          selection={p.selection}
          onSwitch={p.onSwitchSeat}
          onAdd={p.onAddSeat}
          onRename={p.onRenameSeat}
          onRemove={p.onRemoveSeat}
          onCompare={p.onCompare}
        />
      )}
      {isSoundOrAnalyze && (
        <MetricsPanel
          audio={p.audio}
          trace={p.trace}
          speakerCount={p.scene.speakers.length}
          tvAnchor={p.settings.tvAnchor}
          onSuggest={p.onSuggest}
        />
      )}
      <InspectorPanel
        scene={p.scene}
        selection={p.selection}
        onUpdateObject={p.onUpdateObject}
        onDeleteObject={p.onDeleteObject}
        onUpdateSpeaker={p.onUpdateSpeaker}
        onDeleteSpeaker={p.onDeleteSpeaker}
        onSetPair={p.onSetPair}
        onUpdateListener={p.onUpdateListener}
        onSplitWall={p.onSplitWall}
        onDeleteMulti={p.onDeleteMulti}
      />
      {p.step === 'analyze' && (
        <>
          <ControlsCard settings={p.settings} onChange={p.onSettingsChange} />
          <Echogram trace={p.trace} scene={p.scene} />
        </>
      )}
    </aside>
  );
}
