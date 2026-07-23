import { useRef } from 'react';
import type {
  Scene,
  SceneObject,
  Selection,
  SimSettings,
  SpeakerModel,
  ToolMode,
  TraceResult,
  Vec2,
} from '../../engine/types';
import type { AudioMetrics } from '../../engine/stereo';
import type { PlacementOptions, Proposal } from '../../engine/optimize';
import type { ArrangeItem, ArrangeResult } from '../../engine/arrange';
import type { ListeningField } from '../../engine/bestspot';
import SimCanvas from '../canvas/SimCanvas';
import SelectionActions from '../canvas/SelectionActions';
import Legend from '../canvas/Legend';
import type { CanvasTheme } from '../canvas/render';
import Toolbar from '../panels/Toolbar';
import OptimizeDialog from '../panels/OptimizeDialog';
import ArrangeDialog from '../panels/ArrangeDialog';
import Icon from '../ui/Icon';
import { MODE_HINT } from './app-constants';
import type { AppMode, DesignSubStep } from './mode';

interface CanvasStageProps {
  scene: Scene;
  settings: SimSettings;
  selection: Selection;
  mode: ToolMode;
  theme: CanvasTheme;
  placeModel: SpeakerModel;
  trace: TraceResult;
  audio: AudioMetrics;
  proposal: Proposal | null;
  canvasProposalObjects: SceneObject[] | null;
  bestSpot: ListeningField | null;
  resetViewToken: number;
  overlayOpen: boolean;
  onScene: (s: Scene) => void;
  onSelection: (sel: Selection) => void;
  onDragging: (dragging: boolean) => void;
  onCalibrate: (a: Vec2, b: Vec2) => void;
  onRoomDrawn: (zone: { center: Vec2; w: number; h: number }) => void;
  onSplitWall: (id: string, at: Vec2) => void;
  onActivateSeat: (id: string) => void;
  /** Transient hint (e.g. the opening tool clicked off every wall). */
  onNotice: (msg: string) => void;

  appMode: AppMode;
  designSubStep: DesignSubStep;
  onTool: (t: ToolMode) => void;
  onPlaceSpeaker: (model: SpeakerModel) => void;
  onResetView: () => void;
  /** `held` is true for repeats within one press-and-hold on the touch HUD, so
   *  the whole gesture collapses into a single undo entry. */
  onRotateSel: (dir: -1 | 1, held: boolean) => void;
  onNudgeSel: (dx: number, dy: number, held: boolean) => void;
  onDeleteSel: () => void;

  showStarter: boolean;
  onStarterRectRoom: () => void;
  onStarterDrawWalls: () => void;
  onStarterApartment: () => void;
  onStarterImportPhoto: (file: File) => void;

  optimizeOpen: boolean;
  optimizeDefaultMode: 'cinema' | 'music';
  optimizeRooms: { id: string; name: string; at: Vec2 }[];
  optimizeWillReplace: boolean;
  onRunOptimizer: (opts: PlacementOptions) => void;
  onApplyProposal: () => void;
  onCloseOptimize: () => void;

  arrangeOpen: boolean;
  arrangeResult: ArrangeResult | null;
  onSuggestInventory: () => { items: ArrangeItem[]; reasons: string[] };
  onRunArrange: (items: ArrangeItem[]) => void;
  onApplyArrange: () => void;
  onCloseArrange: () => void;

  wallProposal: SceneObject[] | null;
  onAcceptDetection: () => void;
  onTraceInstead: () => void;
  onDiscardWalls: () => void;
}

/** The centre stage: the interactive canvas, its toolbar, the mode hint, the
 *  empty-state starter, and the three canvas-anchored floating dialogs. */
export default function CanvasStage(p: CanvasStageProps) {
  // Rotate only applies to rects; disable it for wall/circle/speaker/listener so
  // the touch handle never silently no-ops. Hide the whole HUD behind any blocking
  // overlay OR while drawing walls — mirroring the keyboard dispatcher's gates
  // (handleKeydown blocks these commands on overlayOpen / wall mode).
  const sel = p.selection;
  const selObj = sel?.type === 'object' ? p.scene.objects.find((o) => o.id === sel.id) : undefined;
  // Doors are excluded: their rotation is wall-locked (no inspector rotation,
  // and `rotateSelectedRect` no-ops on them), so the touch HUD must not offer a
  // rotate button that would silently do nothing.
  const canRotateSel = selObj?.kind === 'rect' && selObj.role !== 'door';
  const hudHidden = p.overlayOpen || p.mode === 'wall';
  const photoRef = useRef<HTMLInputElement>(null);
  return (
    <section className={`stage ${p.theme === 'plan' ? 'stage-plan' : ''}`} aria-label="Room canvas">
      <SimCanvas
        scene={p.scene}
        settings={p.settings}
        selection={p.selection}
        mode={p.mode}
        theme={p.theme}
        placeModel={p.placeModel}
        trace={p.trace}
        audio={p.audio}
        proposal={p.proposal}
        furnitureProposal={p.canvasProposalObjects}
        bestSpot={p.bestSpot}
        resetViewToken={p.resetViewToken}
        overlayOpen={p.overlayOpen}
        onScene={p.onScene}
        onSelection={p.onSelection}
        onDragging={p.onDragging}
        onCalibrate={p.onCalibrate}
        onRoomDrawn={p.onRoomDrawn}
        onSplitWall={p.onSplitWall}
        onActivateSeat={p.onActivateSeat}
        onNotice={p.onNotice}
      />
      <Toolbar
        appMode={p.appMode}
        designSubStep={p.designSubStep}
        mode={p.mode}
        placeModel={p.placeModel}
        onTool={p.onTool}
        onPlaceSpeaker={p.onPlaceSpeaker}
        onResetView={p.onResetView}
      />
      <p className="mode-hint">{MODE_HINT[p.mode]}</p>
      <Legend appMode={p.appMode} settings={p.settings} />
      <SelectionActions
        selection={p.selection}
        hidden={hudHidden}
        canRotate={!!canRotateSel}
        onRotate={p.onRotateSel}
        onNudge={p.onNudgeSel}
        onDelete={p.onDeleteSel}
      />
      {p.showStarter && (
        <div className="stage-starter" role="region" aria-label="Start your room">
          <h2>Start your room</h2>
          <p>Every layout begins with walls. Pick a way in:</p>
          <button
            type="button"
            className="btn btn-primary btn-block starter-btn"
            onClick={p.onStarterRectRoom}
          >
            <Icon name="rectangle" size={16} />
            <span>
              <strong>Rectangular room</strong>
              <small>Just give width × depth</small>
            </span>
          </button>
          <button type="button" className="btn btn-block starter-btn" onClick={p.onStarterDrawWalls}>
            <Icon name="wall" size={16} />
            <span>
              <strong>Draw the walls</strong>
              <small>Corner by corner, snaps to the grid</small>
            </span>
          </button>
          <button type="button" className="btn btn-block starter-btn" onClick={p.onStarterApartment}>
            <Icon name="home" size={16} />
            <span>
              <strong>Maple Court apartment</strong>
              <small>The digitized sample floorplan</small>
            </span>
          </button>
          <button
            type="button"
            className="btn btn-block starter-btn"
            onClick={() => photoRef.current?.click()}
          >
            <Icon name="image" size={16} />
            <span>
              <strong>Start from a floorplan photo</strong>
              <small>Drop in a picture and trace over it</small>
            </span>
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onStarterImportPhoto(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {p.optimizeOpen && (
        <OptimizeDialog
          proposal={p.proposal}
          defaultMode={p.optimizeDefaultMode}
          rooms={p.optimizeRooms}
          willReplace={p.optimizeWillReplace}
          onRun={p.onRunOptimizer}
          onApply={p.onApplyProposal}
          onClose={p.onCloseOptimize}
        />
      )}
      {p.arrangeOpen && (
        <ArrangeDialog
          proposal={p.arrangeResult}
          onSuggestInventory={p.onSuggestInventory}
          onRun={p.onRunArrange}
          onApply={p.onApplyArrange}
          onClose={p.onCloseArrange}
        />
      )}
      {p.wallProposal && (
        <div className="optimize-dialog" role="dialog" aria-label="Detected layout">
          <h2>Detected layout</h2>
          <p className="card-sub">
            Found <strong>{p.wallProposal.length} walls</strong>
            {' — '}
            {p.wallProposal
              .reduce(
                (sum, w) => (w.kind === 'wall' ? sum + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : sum),
                0,
              )
              .toFixed(1)}{' '}
            m of them, shown as ghost lines over your floorplan. Does this look right?
          </p>
          <p className="card-sub">
            Lengths come from the current image scale — if they look off, discard, calibrate the scale,
            and detect again.
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ok" onClick={p.onAcceptDetection}>
              <Icon name="check" size={13} />
              Use this layout
            </button>
            <button type="button" className="btn" onClick={p.onTraceInstead}>
              <Icon name="wall" size={13} />
              Trace instead
            </button>
            <button type="button" className="btn" onClick={p.onDiscardWalls}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
