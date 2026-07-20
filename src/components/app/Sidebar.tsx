import type { Scene, SceneObject, Selection, SimSettings, SpeakerModel, SpeakerObj, TraceResult } from '../../engine/types';
import type { AudioMetrics } from '../../engine/stereo';
import { activeListener } from '../../engine/scene';
import type { AppMode, DesignSubStep } from './mode';
import { SUBSTEP_ITEMS } from './app-constants';
import SegmentSwitch from '../panels/SegmentSwitch';
import VerdictHero from '../panels/VerdictHero';
import { deriveVerdict } from '../panels/verdict';
import TuneToolsCard from '../panels/TuneToolsCard';
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
  appMode: AppMode;
  designSubStep: DesignSubStep;
  onSetSubStep: (s: DesignSubStep) => void;
  subArmed: Record<DesignSubStep, boolean>;
  tvAnchor: boolean;
  onSetTvAnchor: (on: boolean) => void;
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
  canCompare: boolean;
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

/** The right-hand panel column — content is mode-driven. DESIGN leads with the
 *  Build/Furnish sub-step switch; TUNE leads with its re-homed TV/Music + Suggest
 *  actions, then the place-and-read cards (Speakers, Seats, Audio, Echogram). */
export default function Sidebar(p: SidebarProps) {
  const isDesign = p.appMode === 'design';
  const isTune = p.appMode === 'tune';
  const isBuild = isDesign && p.designSubStep === 'build';
  const isFurnish = isDesign && p.designSubStep === 'furnish';
  return (
    <aside className="sidebar" aria-label="Panels">
      {isDesign && (
        <SegmentSwitch
          items={SUBSTEP_ITEMS}
          value={p.designSubStep}
          onSelect={p.onSetSubStep}
          armed={p.subArmed}
          ariaLabel="Design step"
          variant="substep"
        />
      )}
      {isTune && (
        // Key on the active seat id so switching to a *different* already-locked seat
        // remounts the hero (reseeding the ignition to that seat's current lock → no
        // spurious celebration); a genuine in-place drag-to-lock keeps the same key,
        // so the false→true edge still ignites. Seat ids are layout-unique, so this
        // also covers switching to a locked layout.
        <VerdictHero
          key={activeListener(p.scene).id}
          view={deriveVerdict(p.audio, p.trace, p.settings.tvAnchor)}
          seatName={activeListener(p.scene).name}
          variant="sidebar"
        />
      )}
      {isTune && (
        <TuneToolsCard tvAnchor={p.tvAnchor} onSetTvAnchor={p.onSetTvAnchor} onSuggest={p.onSuggest} />
      )}
      <GuidePanel
        appMode={p.appMode}
        designSubStep={p.designSubStep}
        hasWalls={p.hasWalls}
        rooms={p.scene.rooms ?? []}
        onCreateRoom={p.onCreateRoom}
        onDeleteRoom={p.onDeleteRoom}
        onInsertRectRoom={p.onInsertRectRoom}
        onDrawWalls={p.onDrawWalls}
      />
      {isBuild && (
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
      {isFurnish && (
        <FurniturePalette
          onAddPreset={p.onAddPreset}
          onCustomBox={p.onCustomBox}
          onCustomCircle={p.onCustomCircle}
          onArrange={p.onArrange}
        />
      )}
      {isTune && (
        <SpeakersCard
          scene={p.scene}
          trace={p.trace}
          selection={p.selection}
          onSelect={p.onSelectSpeaker}
          onAddModel={p.onAddModel}
          onMatchVolumes={p.onMatchVolumes}
        />
      )}
      {isTune && (
        <ListenerCard
          scene={p.scene}
          selection={p.selection}
          onSwitch={p.onSwitchSeat}
          onAdd={p.onAddSeat}
          onRename={p.onRenameSeat}
          onRemove={p.onRemoveSeat}
          onCompare={p.onCompare}
          canCompare={p.canCompare}
        />
      )}
      {isTune && (
        <MetricsPanel
          audio={p.audio}
          trace={p.trace}
          speakerCount={p.scene.speakers.length}
          tvAnchor={p.settings.tvAnchor}
          onSuggest={p.onSuggest}
          /* TuneToolsCard is the single TUNE "Suggest placement" entry — don't
             render a second identical CTA in the empty-state metrics card. */
          hideSuggest
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
      {isTune && (
        <>
          <ControlsCard settings={p.settings} onChange={p.onSettingsChange} />
          <Echogram trace={p.trace} scene={p.scene} />
        </>
      )}
    </aside>
  );
}
