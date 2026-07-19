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
import type { CanvasTheme } from '../canvas/render';
import Toolbar from '../panels/Toolbar';
import type { Step } from '../panels/WorkflowSteps';
import OptimizeDialog from '../panels/OptimizeDialog';
import ArrangeDialog from '../panels/ArrangeDialog';
import Icon from '../ui/Icon';
import { MODE_HINT } from './app-constants';

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

  step: Step;
  onTool: (t: ToolMode) => void;
  onPlaceSpeaker: (model: SpeakerModel) => void;
  onTheme: (t: CanvasTheme) => void;
  onResetView: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  showStarter: boolean;
  onStarterRectRoom: () => void;
  onStarterDrawWalls: () => void;
  onStarterApartment: () => void;

  optimizeOpen: boolean;
  optimizeDefaultMode: 'cinema' | 'music';
  optimizeRooms: { id: string; name: string; at: Vec2 }[];
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
      />
      <Toolbar
        step={p.step}
        mode={p.mode}
        placeModel={p.placeModel}
        theme={p.theme}
        onTool={p.onTool}
        onPlaceSpeaker={p.onPlaceSpeaker}
        onTheme={p.onTheme}
        onResetView={p.onResetView}
        canUndo={p.canUndo}
        canRedo={p.canRedo}
        onUndo={p.onUndo}
        onRedo={p.onRedo}
      />
      <p className="mode-hint">{MODE_HINT[p.mode]}</p>
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
        </div>
      )}
      {p.optimizeOpen && (
        <OptimizeDialog
          proposal={p.proposal}
          defaultMode={p.optimizeDefaultMode}
          rooms={p.optimizeRooms}
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
