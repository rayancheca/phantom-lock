import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutStore, Scene, Selection, SpeakerModel, ToolMode } from '../../engine/types';
import { suggestInventory } from '../../engine/arrange';
import { useWallDetection } from './hooks/useWallDetection';
import { useGenerateDesign } from './hooks/useGenerateDesign';
import { sceneListeners } from '../../engine/scene';
import type { PersistMode } from '../../engine/db';
import { useProjectActions } from './hooks/useProjectActions';
import type { ToastData } from '../ui/Toast';
import { initialMode, modeTheme, subStepForTool, type AppMode, type DesignSubStep, type ModeEntry } from './mode';
import type { Deleted, DialogState } from './app-types';
import type { KeyCommand } from './keyboard';
import { runCommand } from './run-command';
import { spokenSelection } from './announce';
import LiveAnnouncer from './LiveAnnouncer';
import { useLayoutStore } from './hooks/useLayoutStore';
import { useLayoutActions } from './hooks/useLayoutActions';
import { useSceneHistory } from './hooks/useSceneHistory';
import { usePersistence } from './hooks/usePersistence';
import { useSimulation } from './hooks/useSimulation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useShareActions } from './hooks/useShareActions';
import { useProposals } from './hooks/useProposals';
import { useSceneEdits } from './hooks/useSceneEdits';
import { useBuildActions } from './hooks/useBuildActions';
import { useCompare } from './hooks/useCompare';
import { useSpokenMirror } from './hooks/useSpokenMirror';
import AppHeader from './AppHeader';
import CanvasStage from './CanvasStage';
import Sidebar from './Sidebar';
import AppDialogs from './AppDialogs';
import FirstRunExplainer from './FirstRunExplainer';
import TutorialRunner from '../tutorial/TutorialRunner';
import { useTutorial } from './hooks/useTutorial';
import { PRACTICE_LAYOUT_NAME } from '../tutorial/actions';
import { shouldOfferTour } from '../tutorial/progress';
import './app.css';

/** Standalone localStorage flag for the one-time welcome (never the persistence
 *  schema — see the UX-4 data-safety rule). */
const INTRO_FLAG = 'phantom-lock:intro-dismissed';

function introUnseen(): boolean {
  try {
    return localStorage.getItem(INTRO_FLAG) == null;
  } catch {
    return false; // storage unavailable → don't nag on every boot
  }
}

interface AppInnerProps {
  initialStore: LayoutStore;
  persistMode: PersistMode;
  /** True only on a genuine first run (no prior data + pristine origin + unseen). */
  showFirstRun: boolean;
  /** Records `loadFromIDB` could not reconstruct — reported to the user on mount. */
  droppedCount: number;
  /** FOLDER-level repair notices — never routed through `droppedCount`, which
   *  means "a saved layout could not be read". */
  projectNotices: string[];
}

export default function AppInner({ initialStore, persistMode, showFirstRun, droppedCount, projectNotices }: AppInnerProps) {
  const [store, setStore] = useState<LayoutStore>(initialStore);
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<ToolMode>('select');
  // The IA axis: the app-mode OWNS the canvas theme (exactly one controller), with
  // a DESIGN-only Build/Furnish sub-step. `theme` is derived — never state.
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const active =
      initialStore.layouts.find((l) => l.id === initialStore.activeId) ?? initialStore.layouts[0];
    return active ? initialMode(active.scene).mode : 'design';
  });
  const [designSubStep, setDesignSubStep] = useState<DesignSubStep>('build');
  const theme = modeTheme(appMode);
  const [placeModel, setPlaceModel] = useState<SpeakerModel>('homepod');
  const [dragging, setDragging] = useState(false);
  const [resetViewToken, setResetViewToken] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  /** The folder a pending "New room…" dialog should file its result into. */
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  /** A one-shot spoken explanation for a keyboard command that could not act
   *  (e.g. `d` with furniture selected). Cleared by the next command. */
  const [notice, setNotice] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(() => showFirstRun && introUnseen());
  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_FLAG, '1');
    } catch {
      // Non-fatal: a storage that rejects writes just re-shows the welcome next boot.
    }
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastDeletedRef = useRef<Deleted | null>(null);
  const toastIdRef = useRef(0);

  const showToast = useCallback(
    (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => {
      setToast({ id: ++toastIdRef.current, message, ...opts });
    },
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  // Tell the user when a saved layout could not be read. Dropping the record is
  // correct (losing one beats losing all), but in silence it is indistinguishable
  // from the app having eaten their work — and "Export all" is the move they
  // should make next, while the rest is still intact.
  // ONE effect, because `Toast` is single-slot: two of them would race and the
  // second would silently swallow the first — and the first is the important one.
  // A folder repair is also a DIFFERENT event from a lost layout (it destroys
  // nothing), so it must never be phrased as one.
  useEffect(() => {
    const lost =
      droppedCount > 0
        ? `${droppedCount} saved layout${droppedCount === 1 ? '' : 's'} could not be read and ${
            droppedCount === 1 ? 'was' : 'were'
          } skipped. Your other layouts are intact — consider Export all.`
        : '';
    const repaired =
      projectNotices.length > 0 ? `Folders were repaired on load: ${projectNotices.join('; ')}.` : '';
    if (!lost && !repaired) return;
    showToast([lost, repaired].filter(Boolean).join(' '), { tone: lost ? 'bad' : 'default' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedCount, projectNotices.length, showToast]);

  // --- hooks: store, history, persistence, simulation ------------------------
  const { active, applyToLayout, setSettings, duplicateLayout, exportLayout } = useLayoutStore(store, setStore);
  const scene = active.scene;
  const settings = active.settings;
  const hasWalls = scene.objects.some((o) => o.kind === 'wall');

  const { setScene, undo: undoScene, redo: redoScene, beginGroup, endGroup, reap, canUndo, canRedo } =
    useSceneHistory({ store, setStore, setSelection });

  const { exportAll } = usePersistence({ store, persistMode, showToast });
  const { trace, audio, bestSpot } = useSimulation(scene, settings, dragging);

  /** Drag start/end bracket a coalescing group so a whole drag is one undo step. */
  const onDragging = useCallback(
    (d: boolean) => {
      setDragging(d);
      if (d) beginGroup();
      else endGroup();
    },
    [beginGroup, endGroup],
  );

  // --- workflow: steps own the tools and the canvas view --------------------

  const {
    optimizeOpen, setOptimizeOpen, proposal, setProposal,
    arrangeOpen, setArrangeOpen, furnitureProposal, setFurnitureProposal,
    discardDetectionRef, closeFloatingPanels,
    runOptimizer, applyProposal, runArrange, applyArrange,
  } = useProposals({ scene, settings, active, setScene, setSettings, showToast, undoScene, lastDeletedRef });

  const {
    setUnderlay, importStarterPhoto, handleCalibrate, applyCalibration,
    commitRoomZone, deleteRoom, addRoom,
  } = useBuildActions({
    scene, dialog, hasWalls, setScene, setDialog, setMode, setResetViewToken, showToast, undoScene,
  });

  /** Enter a mode + sub-step (the single theme controller: theme derives from
   *  the mode). Re-arms the wall tool on a fresh DESIGN/Build canvas, mirroring
   *  the old build-with-no-walls behaviour. */
  const applyMode = useCallback(
    (entry: ModeEntry, sceneNow: Scene = scene) => {
      setAppMode(entry.mode);
      setDesignSubStep(entry.designSubStep);
      const wallsExist = sceneNow.objects.some((o) => o.kind === 'wall');
      setMode(entry.mode === 'design' && entry.designSubStep === 'build' && !wallsExist ? 'wall' : 'select');
      closeFloatingPanels();
    },
    [scene, closeFloatingPanels],
  );
  // Header switch PRESERVES the last DESIGN sub-step; the sub-step switch always
  // means DESIGN. Both read fresh `designSubStep` from the render closure.
  const setModeTo = (m: AppMode) => applyMode({ mode: m, designSubStep });
  const setSubStep = (s: DesignSubStep) => applyMode({ mode: 'design', designSubStep: s });

  /** A tool NEVER changes the app-mode/theme. Within DESIGN it MAY flip the
   *  Build/Furnish sub-step so the digit shortcuts feel like the old 4-step muscle
   *  memory — but it can't cross into TUNE (subStepForTool('speaker') === null). */
  const applyTool = useCallback(
    (t: ToolMode) => {
      setMode(t);
      const sub = subStepForTool(t);
      if (sub && appMode === 'design') setDesignSubStep(sub);
    },
    [appMode],
  );

  const startPlacing = (model: SpeakerModel) => {
    setPlaceModel(model);
    applyTool('speaker');
  };

  /** The single TV/Music writer (moved out of the header into TUNE). */
  const setTvAnchor = (on: boolean) => {
    setSettings({ ...settings, tvAnchor: on });
    closeFloatingPanels();
  };

  // "Armed" = the mode/sub-step's heuristic has data (drives the amber LED). The
  // DESIGN mode LED and its Build sub-step LED share one threshold (any wall), so
  // they never contradict each other with 1–2 walls drawn.
  const modeArmed: Record<AppMode, boolean> = {
    design: hasWalls,
    tune: scene.speakers.length > 0,
  };
  const subArmed: Record<DesignSubStep, boolean> = {
    build: hasWalls,
    furnish: scene.objects.some((o) => o.kind !== 'wall'),
  };

  // --- scene edits ----------------------------------------------------------
  const {
    updateObject, deleteObject, updateSpeaker, deleteSpeaker, setPairForSpeaker,
    updateListener, deleteMulti, switchSeat, addSeat, renameSeat, removeSeat,
    seatSelection, splitWall, addPreset, matchVolumes,
  } = useSceneEdits({
    scene, settings, active, setScene, setSelection,
    showToast, undoScene, lastDeletedRef, setNotice,
  });

  const { compare, setCompare, openCompare, canCompare } = useCompare({
    scene,
    store,
    active,
    dismissToast,
    closeFloatingPanels,
    setGalleryOpen,
  });

  const {
    newProject,
    renameProjectTo,
    // `moveLayout` is deliberately NOT destructured: every move now goes through
    // `dropLayout` so the emptied-folder dissolve is reachable. The primitive
    // stays on the hook (and tested) because it is the plain move with no
    // lifecycle side effects.
    deleteProject,
    dropLayout,
    dropProject,
    mergeLayouts,
  } = useProjectActions({
    store,
    setStore,
    setDialog,
    showToast,
    lastDeletedRef,
  });

  /** First-run "Start from a floorplan photo" — the DESIGN photo-import entry,
   *  reusing the same underlay builder as UnderlayCard. */

  /** Two calibration clicks arrived — scale the underlay so they match reality. */

  /** A dragged room box arrived from the canvas — ask for its name. */

  // --- floorplan wall detection ---------------------------------------------

  const detection = useWallDetection({
    scene,
    setScene,
    showToast,
    undoScene,
    setMode,
  });
  const wallProposal = detection.keptWalls;
  // Close the forward reference: `closeFloatingPanels` is mount-once and created
  // long before `useWallDetection` exists, so the ref is the bridge. It stays a
  // REGISTRATION here rather than moving inside useProposals, because the hook
  // has no way to reach `detection`. `discardDetectionRef` is now a hook return
  // rather than a local, so eslint can no longer prove it stable and asks for it
  // by name — it is a useRef object, identity-fixed for the component's life, so
  // listing it is a literal no-op and cheaper than a suppression.
  useEffect(() => {
    discardDetectionRef.current = detection.discard;
  }, [detection.discard, discardDetectionRef]);

  /** Add a named rectangular room to the CURRENT layout — flush against the
   *  existing bounds, so a house composes room by room. */

  // --- layout management (create / switch / rename / delete / import) ---------
  const {
    afterLayoutSwitch,
    switchLayout,
    addLayout,
    addRoomLayout,
    renameLayout,
    deleteLayout,
    importLayout,
  } = useLayoutActions({
    store,
    setStore,
    applyToLayout,
    reap,
    setSelection,
    closeFloatingPanels,
    setResetViewToken,
    applyMode,
    setDialog,
    setGalleryOpen,
    showToast,
    lastDeletedRef,
  });

  /** The procedural design generator. It takes no store and returns a Scene, so
   *  only its `keep` can write — preview and reroll are pure. */
  const generator = useGenerateDesign({
    store,
    setStore,
    afterLayoutSwitch,
    showToast,
    closeGallery: () => setGalleryOpen(false),
  });

  // The guided tour. Its ACTIONS run through the same setters every other
  // feature uses — the runner never edits a scene itself — so the tutorial
  // cannot drift into being a second, untrue implementation of the app.
  const tutorial = useTutorial({
    store,
    setStore,
    setScene,
    afterLayoutSwitch,
    switchLayout,
    applyMode,
    addSeat,
    openCompare,
    closeCompare: () => setCompare(null),
    setGalleryOpen,
  });

  // --- optimizer -----------------------------------------------------------------

  // --- shareable output (item H) -------------------------------------------------
  const { exportPlanImage, copyVerdict } = useShareActions({
    scene, settings, active, trace, audio, bestSpot, theme, showToast,
  });

  // --- keyboard --------------------------------------------------------------------

  // One definition of "a blocking overlay is open", shared by the keyboard hook
  // and SimCanvas's key gate. Includes the full-screen gallery + compare AND the
  // "Detected layout" confirmation (wallProposal) — all sit OVER the still-mounted
  // canvas, so their open state can't leak scene/tool/rotate keys through.
  // The tutorial's CHAPTER MENU is here because it is a real modal Dialog that
  // blocks. The tutorial's step CARD deliberately is NOT: it is a non-modal
  // coach-mark, and adding it would kill every scene and tool key, drop the
  // canvas out of the tab order, and silence the announcer — i.e. switch off the
  // very features the step is teaching, and make each `try` step impossible on a
  // keyboard. See the header comment in `tutorial/CoachMark.tsx`.
  const overlayOpen =
    dialog !== null ||
    optimizeOpen ||
    arrangeOpen ||
    compare !== null ||
    galleryOpen ||
    wallProposal !== null ||
    showIntro ||
    tutorial.menuOpen;

  /**
   * The dispatcher lives in the pure `run-command.ts`; this is only the wiring.
   *
   * The context literal is built INSIDE the call, every call. That is not style:
   * `useKeyboardShortcuts` is mount-once and reads a render-assigned ref, and
   * `SelectionActions` dispatches from an onClick — so a context hoisted into a
   * `useMemo`, or the function wrapped in `useCallback`, would hand a deferred
   * invocation a stale `scene`/`selection`/`settings`. Left unmemoized for the
   * same reason `runKeyCommand` always was.
   */
  const runKeyCommand = (cmd: KeyCommand) =>
    runCommand(cmd, {
      scene,
      settings,
      selection,
      appMode,
      placeModel,
      notice,
      setNotice,
      setScene,
      setSelection,
      setMode,
      setModeTo,
      applyTool,
      setDialog,
      setOptimizeOpen,
      setProposal,
      setArrangeOpen,
      setFurnitureProposal,
      detection,
      undoScene,
      redoScene,
      deleteObject,
      deleteSpeaker,
      deleteMulti,
      switchSeat,
    });

  // --- the off-screen spoken mirror (S7) -----------------------------------
  const { readout, selectionText } = useSpokenMirror({
    scene,
    settings,
    selection,
    appMode,
    trace,
    audio,
    bestSpot,
    overlayOpen,
    notice,
  });

  useKeyboardShortcuts({
    state: {
      overlayOpen,
      dialogOpen: dialog !== null,
      wallProposalOpen: wallProposal !== null,
      optimizeOpen,
      arrangeOpen,
      selection,
      mode,
      appMode,
    },
    run: runKeyCommand,
  });

  // The starter hands off once a floorplan is imported or a detection is up.
  const showStarter =
    appMode === 'design' &&
    designSubStep === 'build' &&
    !hasWalls &&
    mode !== 'wall' &&
    !scene.underlay &&
    !wallProposal &&
    !detection.detecting;

  return (
    <div className="app">
      <AppHeader
        activeName={active.name}
        onOpenGallery={() => setGalleryOpen(true)}
        fileRef={fileRef}
        onImportFile={importLayout}
        appMode={appMode}
        onSetMode={setModeTo}
        modeArmed={modeArmed}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undoScene}
        onRedo={redoScene}
        onOpenTour={tutorial.openMenu}
      />

      <main className="workspace">
        <CanvasStage
          scene={scene}
          settings={settings}
          selection={selection}
          mode={mode}
          theme={theme}
          placeModel={placeModel}
          trace={trace}
          audio={audio}
          proposal={proposal}
          canvasProposalObjects={wallProposal ?? furnitureProposal?.objects ?? null}
          bestSpot={bestSpot}
          resetViewToken={resetViewToken}
          overlayOpen={overlayOpen}
          onScene={setScene}
          onSelection={setSelection}
          onDragging={onDragging}
          onCalibrate={handleCalibrate}
          onRoomDrawn={(zone) => setDialog({ kind: 'room-name', zone })}
          onSplitWall={splitWall}
          onSeatAgainstWall={seatSelection}
          onActivateSeat={switchSeat}
          onNotice={setNotice}
          appMode={appMode}
          designSubStep={designSubStep}
          onTool={applyTool}
          onPlaceSpeaker={startPlacing}
          onResetView={() => setResetViewToken((n) => n + 1)}
          // `held` is true for every repeat once a press-and-hold begins, so a
          // whole hold collapses into ONE undo entry (same contract as a held key).
          onRotateSel={(dir, held) => runKeyCommand({ type: 'rotate', dir, coarse: false, coalesce: held })}
          onNudgeSel={(dx, dy, held) => runKeyCommand({ type: 'nudge', dx, dy, coalesce: held })}
          onDeleteSel={() => runKeyCommand({ type: 'delete' })}
          showStarter={showStarter}
          onStarterRectRoom={() => setDialog({ kind: 'room-size', purpose: 'add-room' })}
          onStarterDrawWalls={() => applyTool('wall')}
          onStarterApartment={() => addLayout('apartment')}
          onStarterImportPhoto={importStarterPhoto}
          optimizeOpen={optimizeOpen}
          optimizeDefaultMode={settings.tvAnchor ? 'cinema' : 'music'}
          optimizeRooms={(scene.rooms ?? []).map((r) => ({ id: r.id, name: r.name, at: r.at }))}
          optimizeWillReplace={scene.speakers.length > 0}
          onRunOptimizer={runOptimizer}
          onApplyProposal={applyProposal}
          onCloseOptimize={() => {
            setOptimizeOpen(false);
            setProposal(null);
          }}
          arrangeOpen={arrangeOpen}
          arrangeResult={furnitureProposal}
          onSuggestInventory={() => suggestInventory(scene)}
          onRunArrange={runArrange}
          onApplyArrange={applyArrange}
          onCloseArrange={() => {
            setArrangeOpen(false);
            setFurnitureProposal(null);
          }}
          detection={detection}
          onTraceInstead={() => {
            detection.discard();
            applyTool('wall');
          }}
        />

        <Sidebar
          appMode={appMode}
          designSubStep={designSubStep}
          onSetSubStep={setSubStep}
          subArmed={subArmed}
          tvAnchor={settings.tvAnchor}
          onSetTvAnchor={setTvAnchor}
          scene={scene}
          settings={settings}
          selection={selection}
          trace={trace}
          audio={audio}
          hasWalls={hasWalls}
          calibrating={mode === 'calibrate'}
          detecting={detection.detecting}
          onCreateRoom={() => applyTool('room')}
          onDeleteRoom={deleteRoom}
          onInsertRectRoom={() => setDialog({ kind: 'room-size', purpose: 'add-room' })}
          onDrawWalls={() => applyTool('wall')}
          onUnderlay={setUnderlay}
          onCalibrate={() => applyTool(mode === 'calibrate' ? 'select' : 'calibrate')}
          onDetect={() => detection.run()}
          onError={(m) => showToast(m, { tone: 'bad' })}
          onAddPreset={addPreset}
          onCustomBox={() => applyTool('rect')}
          onCustomCircle={() => applyTool('circle')}
          onArrange={() => {
            setArrangeOpen(true);
            setFurnitureProposal(null);
          }}
          onSelectSpeaker={(id) => setSelection({ type: 'speaker', id })}
          onAddModel={startPlacing}
          onMatchVolumes={matchVolumes}
          onSwitchSeat={switchSeat}
          onAddSeat={addSeat}
          onRenameSeat={renameSeat}
          onRemoveSeat={removeSeat}
          onCompare={openCompare}
          canCompare={canCompare}
          onExportImage={exportPlanImage}
          onCopyVerdict={copyVerdict}
          onSuggest={() => {
            setOptimizeOpen(true);
            setProposal(null);
          }}
          onUpdateObject={updateObject}
          onDeleteObject={deleteObject}
          onUpdateSpeaker={updateSpeaker}
          onDeleteSpeaker={deleteSpeaker}
          onSetPair={setPairForSpeaker}
          onUpdateListener={updateListener}
          onSplitWall={splitWall}
          onSeatAgainstWall={seatSelection}
          onDeleteMulti={deleteMulti}
          onSettingsChange={setSettings}
        />
      </main>

      <AppDialogs
        dialog={dialog}
        store={store}
        galleryOpen={galleryOpen}
        compare={compare}
        toast={toast}
        canCompare={canCompare}
        onCloseDialog={() => setDialog(null)}
        onAddRoomLayout={(w, d) => {
          // Validate at CONSUME time: the folder could have been deleted between
          // opening the dialog and submitting it, and filing a new design under a
          // dangling `projectId` makes it invisible in the gallery until the next
          // reload re-homes it. Safe today only by coincidence otherwise.
          const target =
            pendingProjectId && store.projects.some((p) => p.id === pendingProjectId)
              ? pendingProjectId
              : undefined;
          addRoomLayout(w, d, target);
          setPendingProjectId(null);
        }}
        onAddRoom={(w, d, name) => addRoom(w, d, name)}
        onCommitRoomZone={commitRoomZone}
        onRenameLayout={renameLayout}
        onApplyCalibration={applyCalibration}
        onOpenLayout={(id) => {
          switchLayout(id);
          setGalleryOpen(false);
        }}
        onNewRoom={(projectId) => {
          setPendingProjectId(projectId);
          setDialog({ kind: 'room-size', purpose: 'layout' });
        }}
        onNewBlank={(projectId) => {
          addLayout('blank', projectId);
          setGalleryOpen(false);
        }}
        onNewApartment={(projectId) => {
          addLayout('apartment', projectId);
          setGalleryOpen(false);
        }}
        generator={generator}
        onImport={() => fileRef.current?.click()}
        onRequestRename={(id) => setDialog({ kind: 'rename', layoutId: id })}
        onDuplicate={duplicateLayout}
        onExport={exportLayout}
        onExportAll={exportAll}
        onCompare={openCompare}
        onDelete={deleteLayout}
        onNewProject={() => setDialog({ kind: 'project-name' })}
        onSubmitNewProject={newProject}
        onSubmitRenameProject={renameProjectTo}
        onRenameProject={(id) => setDialog({ kind: 'project-name', projectId: id })}
        onDeleteProject={deleteProject}
        // Routed through `dropLayout`, not `moveLayout`: this is the ONLY gesture
        // that takes a design OUT of a folder, so it is also the only one that can
        // leave a folder empty. Without it `dissolveEmptyProject` is unreachable
        // and the "drag the last design out and the folder disappears" behaviour
        // is a claim with no code path.
        onMoveLayout={(layoutId, projectId) => dropLayout(layoutId, projectId, null)}
        onDropLayout={dropLayout}
        onDropProject={dropProject}
        onMergeLayouts={mergeLayouts}
        onCloseGallery={() => setGalleryOpen(false)}
        onCloseCompare={() => setCompare(null)}
        onDismissToast={dismissToast}
      />

      {showIntro && (
        <FirstRunExplainer
          /* Push the tour as the primary action only when it is genuinely
             unseen. `showFirstRun` already encodes firstRun AND a pristine
             origin (App.tsx's boot wrapper), so this adds the third condition:
             our own standalone flag. */
          offerTour={shouldOfferTour(
            { firstRun: showFirstRun, pristineOrigin: true },
            typeof localStorage === 'undefined' ? { getItem: () => null } : localStorage,
          )}
          onDismiss={dismissIntro}
          onTakeTour={() => {
            dismissIntro();
            tutorial.openMenu();
          }}
        />
      )}

      <TutorialRunner
        menuOpen={tutorial.menuOpen}
        onCloseMenu={tutorial.closeMenu}
        ctx={{
          scene,
          appMode,
          designSubStep,
          tool: mode,
          // Read from the SAME audio the VerdictHero renders, so a `try` step
          // gated on "it locked" can never disagree with what is on screen.
          locked: audio.pairs.some((p) => p.locked),
          seatCount: sceneListeners(scene).length,
          galleryOpen,
          compareOpen: compare !== null,
          // Re-checked every render, not assumed from chapter entry: the
          // coach-mark is non-modal, so the layout switcher stays live mid-tour.
          practiceActive: active.name === PRACTICE_LAYOUT_NAME,
        }}
        onAction={tutorial.runAction}
        onEnterMode={tutorial.enterMode}
      />

      {/* Last child of the app root: always mounted (so it is never a freshly
          inserted region), outside every scroll container, and outside the
          conditionally-rendered mode columns. */}
      <LiveAnnouncer readout={readout} selection={spokenSelection(selectionText, dragging)} />
    </div>
  );
}