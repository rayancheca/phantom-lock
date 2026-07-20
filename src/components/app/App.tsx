import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LayoutStore,
  Scene,
  SceneObject,
  Selection,
  SpeakerModel,
  SpeakerObj,
  ToolMode,
  Vec2,
} from '../../engine/types';
import { matchTrims } from '../../engine/speakers';
import { suggestPlacement, type PlacementOptions } from '../../engine/optimize';
import { arrangeFurniture, suggestInventory, type ArrangeItem } from '../../engine/arrange';
import { detectWallsFromUnderlay } from '../../engine/detect';
import {
  activeListener,
  addListener,
  createId,
  FURNITURE_PRESETS,
  loadStore,
  removeListener,
  renameListener,
  sceneBounds,
  sceneListeners,
  setActiveListener,
  splitWallAt,
  addRoomShell,
  updateActiveListener,
} from '../../engine/scene';
import { bootstrapPersistence, type PersistMode } from '../../engine/db';
import type { Scenario } from '../compare/ScenarioCompare';
import type { ToastData } from '../ui/Toast';
import { initialMode, modeTheme, subStepForTool, type AppMode, type DesignSubStep, type ModeEntry } from './mode';
import type { Deleted, DialogState } from './app-types';
import { nudgeSelection, rotateSelectedRect, type KeyCommand } from './keyboard';
import { useLayoutStore } from './hooks/useLayoutStore';
import { useLayoutActions } from './hooks/useLayoutActions';
import { useSceneHistory } from './hooks/useSceneHistory';
import { usePersistence } from './hooks/usePersistence';
import { useSimulation } from './hooks/useSimulation';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import AppHeader from './AppHeader';
import CanvasStage from './CanvasStage';
import Sidebar from './Sidebar';
import AppDialogs from './AppDialogs';
import './app.css';

interface AppInnerProps {
  initialStore: LayoutStore;
  persistMode: PersistMode;
}

function AppInner({ initialStore, persistMode }: AppInnerProps) {
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
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [proposal, setProposal] = useState<ReturnType<typeof suggestPlacement> | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [furnitureProposal, setFurnitureProposal] = useState<ReturnType<typeof arrangeFurniture> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [wallProposal, setWallProposal] = useState<SceneObject[] | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [compare, setCompare] = useState<{ left: Scenario; right: Scenario } | null>(null);
  const [detecting, setDetecting] = useState(false);
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

  /** Floating cards (optimizer, arrange, detected walls) never outlive the
   *  context they were opened in — any step/layout/mode change closes them. */
  const closeFloatingPanels = useCallback(() => {
    setOptimizeOpen(false);
    setProposal(null);
    setArrangeOpen(false);
    setFurnitureProposal(null);
    setWallProposal(null);
  }, []);

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

  const updateObject = (id: string, patch: Partial<SceneObject>) => {
    setScene((s) => ({
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
    const obj = scene.objects.find((o) => o.id === id);
    if (obj) {
      lastDeletedRef.current = { type: 'object', layoutId: active.id, obj };
      showToast(`Deleted ${obj.kind === 'wall' ? 'wall' : obj.label || 'object'}`, {
        action: { label: 'Undo', run: undoScene },
      });
    }
    setScene((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== id) }));
    setSelection(null);
  };

  const updateSpeaker = (id: string, patch: Partial<SpeakerObj>) => {
    setScene((s) => ({
      ...s,
      speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
    }));
  };

  const deleteSpeaker = (id: string) => {
    const speaker = scene.speakers.find((s) => s.id === id);
    if (speaker) {
      lastDeletedRef.current = {
        type: 'speaker',
        layoutId: active.id,
        speaker,
        pairs: scene.pairs.filter(([a, b]) => a === id || b === id),
      };
      showToast(`Deleted speaker ${speaker.label}`, { action: { label: 'Undo', run: undoScene } });
    }
    setScene((s) => ({
      ...s,
      speakers: s.speakers.filter((sp) => sp.id !== id),
      pairs: s.pairs.filter(([a, b]) => a !== id && b !== id),
    }));
    setSelection(null);
  };

  const setPairForSpeaker = (id: string, partnerId: string | null) => {
    setScene((s) => {
      const pairs = s.pairs.filter(
        ([a, b]) => a !== id && b !== id && a !== partnerId && b !== partnerId,
      );
      if (partnerId) pairs.push([id, partnerId]);
      return { ...s, pairs };
    });
  };

  const updateListener = (patch: Partial<Scene['listener']>) => {
    setScene((s) => updateActiveListener(s, patch));
  };

  /** Delete every member of a multi-selection in one undoable step. */
  const deleteMulti = (objectIds: string[], speakerIds: string[]) => {
    setScene((s) => ({
      ...s,
      objects: s.objects.filter((o) => !objectIds.includes(o.id)),
      speakers: s.speakers.filter((sp) => !speakerIds.includes(sp.id)),
      pairs: s.pairs.filter(([a, b]) => !speakerIds.includes(a) && !speakerIds.includes(b)),
    }));
    setSelection(null);
    const n = objectIds.length + speakerIds.length;
    showToast(`Deleted ${n} item${n === 1 ? '' : 's'}`, { action: { label: 'Undo', run: undoScene } });
  };

  // --- listening positions (seats) -----------------------------------------
  const switchSeat = (id: string) => {
    setScene((s) => setActiveListener(s, id));
    setSelection({ type: 'listener' });
  };
  const addSeat = () => {
    setScene((s) => addListener(s));
    setSelection({ type: 'listener' });
  };
  const renameSeat = (id: string, name: string) => {
    setScene((s) => renameListener(s, id, name));
  };
  const removeSeat = (id: string) => {
    setScene((s) => removeListener(s, id));
  };

  /** Open the 2-up compare, seeded with the two most useful scenarios: two seats
   *  of this layout if it has them, else this layout vs another. */
  const openCompare = () => {
    const seats = sceneListeners(scene);
    const here = active.id;
    let left: Scenario;
    let right: Scenario;
    if (seats.length >= 2) {
      left = { layoutId: here, seatId: seats[0].id };
      right = { layoutId: here, seatId: seats[1].id };
    } else if (store.layouts.length >= 2) {
      const other = store.layouts.find((l) => l.id !== here) ?? active;
      left = { layoutId: here, seatId: activeListener(scene).id };
      right = { layoutId: other.id, seatId: sceneListeners(other.scene)[0].id };
    } else {
      const seat = activeListener(scene).id;
      left = { layoutId: here, seatId: seat };
      right = { layoutId: here, seatId: seat };
    }
    closeFloatingPanels();
    setGalleryOpen(false);
    setCompare({ left, right });
  };
  const canCompare = sceneListeners(scene).length >= 2 || store.layouts.length >= 2;

  /** Break a wall in two at a point (or its midpoint) and select the first half.
   *  The id is computed synchronously so selection happens in this same handler. */
  const splitWall = (id: string, at?: Vec2) => {
    const wall = scene.objects.find((o) => o.id === id);
    if (!wall || wall.kind !== 'wall') return;
    const [first, second] = splitWallAt(wall, at);
    setScene((s) => ({
      ...s,
      objects: s.objects.flatMap((o) => (o.id === id ? [first, second] : [o])),
    }));
    setSelection({ type: 'object', id: first.id });
  };

  const addPreset = (presetId: string) => {
    const preset = FURNITURE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const b = sceneBounds(scene);
    const center: Vec2 = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 };
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
    setScene((s) => {
      const objects =
        preset.role === 'tv'
          ? s.objects.map((o) => (o.kind === 'rect' && o.role === 'tv' ? { ...o, role: 'furniture' as const } : o))
          : s.objects;
      return { ...s, objects: [...objects, obj] };
    });
    setSelection({ type: 'object', id: obj.id });
  };

  const setUnderlay = (underlay: Scene['underlay']) => {
    setScene((s) => ({ ...s, underlay }));
    if (underlay) setResetViewToken((n) => n + 1);
  };

  /** Two calibration clicks arrived — scale the underlay so they match reality. */
  const handleCalibrate = (a: Vec2, b: Vec2) => {
    const measured = Math.hypot(a.x - b.x, a.y - b.y);
    setMode('select');
    if (measured < 0.05) {
      showToast('Those points are too close together — click two points further apart.', { tone: 'bad' });
      return;
    }
    setDialog({ kind: 'calibrate', measured });
  };

  const applyCalibration = (measured: number, real: number) => {
    const factor = real / measured;
    setScene((s) =>
      s.underlay ? { ...s, underlay: { ...s.underlay, scale: s.underlay.scale * factor } } : s,
    );
    setDialog(null);
    setResetViewToken((n) => n + 1);
    showToast('Floorplan rescaled to match the real distance.', { tone: 'ok' });
  };

  const runArrange = (items: ArrangeItem[]) => {
    setFurnitureProposal(arrangeFurniture(scene, items));
  };

  /** A dragged room box arrived from the canvas — ask for its name. */
  const commitRoomZone = (name: string) => {
    if (dialog?.kind !== 'room-name') return;
    const { zone } = dialog;
    setScene((s) => ({
      ...s,
      rooms: [
        ...(s.rooms ?? []),
        { id: createId('room'), name, at: zone.center, w: zone.w, h: zone.h },
      ],
    }));
    setDialog(null);
    setMode('select');
    showToast(`Marked “${name}” — the optimizer can now target it`, { tone: 'ok' });
  };

  const deleteRoom = (id: string) => {
    const room = scene.rooms?.find((r) => r.id === id);
    setScene((s) => ({ ...s, rooms: (s.rooms ?? []).filter((r) => r.id !== id) }));
    if (room) showToast(`Removed “${room.name}”`, { action: { label: 'Undo', run: undoScene } });
  };

  // --- floorplan wall detection ---------------------------------------------

  const runDetection = async () => {
    if (!scene.underlay || detecting) return;
    setDetecting(true);
    try {
      const walls = await detectWallsFromUnderlay(scene.underlay);
      if (walls.length < 2) {
        showToast('No clear walls found in that image — trace them instead.', { tone: 'bad' });
        return;
      }
      setWallProposal(walls);
      setMode('select');
    } catch {
      showToast('Could not analyse that image.', { tone: 'bad' });
    } finally {
      setDetecting(false);
    }
  };

  const acceptDetection = () => {
    if (!wallProposal) return;
    setScene((s) => ({
      ...s,
      objects: [...s.objects, ...wallProposal],
      // Drop the underlay back so the accepted walls read clearly over it.
      underlay: s.underlay ? { ...s.underlay, opacity: Math.min(s.underlay.opacity, 0.25) } : s.underlay,
    }));
    const n = wallProposal.length;
    setWallProposal(null);
    showToast(`Added ${n} detected wall${n === 1 ? '' : 's'} — drag any corner to correct it`, {
      tone: 'ok',
    });
  };

  const applyArrange = () => {
    if (!furnitureProposal || furnitureProposal.objects.length === 0) return;
    setScene((s) => ({ ...s, objects: [...s.objects, ...furnitureProposal.objects] }));
    setFurnitureProposal(null);
    setArrangeOpen(false);
  };

  /** Add a named rectangular room to the CURRENT layout — flush against the
   *  existing bounds, so a house composes room by room. */
  const addRoom = (w: number, d: number, name: string) => {
    const hadWalls = hasWalls;
    setScene((s) => addRoomShell(s, name, w, d));
    setDialog(null);
    setMode('select');
    setResetViewToken((n) => n + 1);
    if (hadWalls) {
      showToast(
        `Added ${name.trim() ? `“${name.trim()}”` : 'a room'} next door — punch a door through the shared wall so sound can get through`,
        { tone: 'ok' },
      );
    }
  };

  // --- layout management (create / switch / rename / delete / import) ---------
  const { switchLayout, addLayout, addRoomLayout, renameLayout, deleteLayout, importLayout } =
    useLayoutActions({
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

  // --- optimizer -----------------------------------------------------------------

  const runOptimizer = (opts: PlacementOptions) => {
    setProposal(suggestPlacement(scene, opts));
  };

  const matchVolumes = () => {
    const trims = matchTrims(scene.speakers, scene.listener);
    setScene((s) => ({
      ...s,
      speakers: s.speakers.map((sp) => ({ ...sp, trimDb: trims.get(sp.id) ?? sp.trimDb })),
    }));
  };

  const applyProposal = () => {
    if (!proposal || proposal.speakers.length === 0) return;
    const replacing = scene.speakers.length > 0;
    if (replacing) {
      lastDeletedRef.current = {
        type: 'speakers',
        layoutId: active.id,
        speakers: scene.speakers,
        pairs: scene.pairs,
      };
    }
    const created = proposal.speakers.map((ps) => ({
      id: createId('spk'),
      pos: ps.pos,
      z: ps.z,
      label: ps.label,
      model: ps.model,
      trimDb: ps.trimDb,
    }));
    const pairs = proposal.pairs
      .filter(([i, j]) => created[i] && created[j])
      .map(([i, j]) => [created[i].id, created[j].id] as [string, string]);
    const focus = proposal.focus;
    setScene((s) => {
      const withSpeakers = { ...s, speakers: created, pairs };
      // Room-target proposals move YOU there — move the ACTIVE seat + mirror together.
      return focus ? updateActiveListener(withSpeakers, { pos: focus }) : withSpeakers;
    });
    setSettings({ ...settings, tvAnchor: proposal.mode === 'cinema' });
    setProposal(null);
    setOptimizeOpen(false);
    const n = created.length;
    const moved = proposal.targetName ? ` — moved YOU to ${proposal.targetName}` : ' — drag to fine-tune';
    showToast(
      replacing
        ? `Replaced your speakers with ${n} suggested one${n === 1 ? '' : 's'}${proposal.targetName ? moved : ''}`
        : `Placed ${n} speaker${n === 1 ? '' : 's'}${moved}`,
      replacing ? { action: { label: 'Undo', run: undoScene } } : { tone: 'ok' },
    );
  };

  // --- keyboard --------------------------------------------------------------------

  // One definition of "a blocking overlay is open", shared by the keyboard hook
  // and SimCanvas's key gate. Includes the full-screen gallery + compare AND the
  // "Detected layout" confirmation (wallProposal) — all sit OVER the still-mounted
  // canvas, so their open state can't leak scene/tool/rotate keys through.
  const overlayOpen =
    dialog !== null || optimizeOpen || arrangeOpen || compare !== null || galleryOpen || wallProposal !== null;

  const runKeyCommand = (cmd: KeyCommand) => {
    switch (cmd.type) {
      case 'escape':
        if (cmd.target === 'dialog') setDialog(null);
        else if (cmd.target === 'wallProposal') setWallProposal(null);
        else if (cmd.target === 'optimize') {
          setOptimizeOpen(false);
          setProposal(null);
        } else if (cmd.target === 'arrange') {
          setArrangeOpen(false);
          setFurnitureProposal(null);
        } else {
          setMode('select');
          setSelection(null);
        }
        return;
      case 'undo':
        undoScene();
        return;
      case 'redo':
        redoScene();
        return;
      case 'delete':
        if (!selection) return;
        if (selection.type === 'object') deleteObject(selection.id);
        else if (selection.type === 'speaker') deleteSpeaker(selection.id);
        else if (selection.type === 'multi') deleteMulti(selection.objectIds, selection.speakerIds);
        return;
      case 'tool':
        applyTool(cmd.tool);
        return;
      case 'mode-toggle':
        setModeTo(appMode === 'design' ? 'tune' : 'design');
        return;
      case 'rotate':
        if (selection?.type !== 'object') return;
        setScene((s) => rotateSelectedRect(s, selection.id, cmd.dir), { coalesce: cmd.coalesce });
        return;
      case 'nudge':
        if (!selection) return;
        setScene((s) => nudgeSelection(s, selection, { x: cmd.dx, y: cmd.dy }), { coalesce: cmd.coalesce });
        return;
    }
  };

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
    !detecting;

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
          onActivateSeat={switchSeat}
          appMode={appMode}
          designSubStep={designSubStep}
          onTool={applyTool}
          onPlaceSpeaker={startPlacing}
          onResetView={() => setResetViewToken((n) => n + 1)}
          onRotateSel={(dir) => runKeyCommand({ type: 'rotate', dir, coalesce: false })}
          onNudgeSel={(dx, dy) => runKeyCommand({ type: 'nudge', dx, dy, coalesce: false })}
          onDeleteSel={() => runKeyCommand({ type: 'delete' })}
          showStarter={showStarter}
          onStarterRectRoom={() => setDialog({ kind: 'room-size', purpose: 'add-room' })}
          onStarterDrawWalls={() => applyTool('wall')}
          onStarterApartment={() => addLayout('apartment')}
          optimizeOpen={optimizeOpen}
          optimizeDefaultMode={settings.tvAnchor ? 'cinema' : 'music'}
          optimizeRooms={(scene.rooms ?? []).map((r) => ({ id: r.id, name: r.name, at: r.at }))}
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
          wallProposal={wallProposal}
          onAcceptDetection={acceptDetection}
          onTraceInstead={() => {
            setWallProposal(null);
            applyTool('wall');
          }}
          onDiscardWalls={() => setWallProposal(null)}
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
          detecting={detecting}
          onCreateRoom={() => applyTool('room')}
          onDeleteRoom={deleteRoom}
          onInsertRectRoom={() => setDialog({ kind: 'room-size', purpose: 'add-room' })}
          onDrawWalls={() => applyTool('wall')}
          onUnderlay={setUnderlay}
          onCalibrate={() => applyTool(mode === 'calibrate' ? 'select' : 'calibrate')}
          onDetect={runDetection}
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
        onAddRoomLayout={addRoomLayout}
        onAddRoom={(w, d, name) => addRoom(w, d, name)}
        onCommitRoomZone={commitRoomZone}
        onRenameLayout={renameLayout}
        onApplyCalibration={applyCalibration}
        onOpenLayout={(id) => {
          switchLayout(id);
          setGalleryOpen(false);
        }}
        onNewRoom={() => setDialog({ kind: 'room-size', purpose: 'layout' })}
        onNewBlank={() => {
          addLayout('blank');
          setGalleryOpen(false);
        }}
        onNewApartment={() => {
          addLayout('apartment');
          setGalleryOpen(false);
        }}
        onImport={() => fileRef.current?.click()}
        onRequestRename={(id) => setDialog({ kind: 'rename', layoutId: id })}
        onDuplicate={duplicateLayout}
        onExport={exportLayout}
        onExportAll={exportAll}
        onCompare={openCompare}
        onDelete={deleteLayout}
        onCloseGallery={() => setGalleryOpen(false)}
        onCloseCompare={() => setCompare(null)}
        onDismissToast={dismissToast}
      />
    </div>
  );
}

/**
 * Boots persistence (IndexedDB, migrating the legacy localStorage blob on first
 * run; hardened localStorage fallback if IDB is unavailable), then mounts the app
 * once the store is hydrated. A brief splash covers the async load.
 */
export default function App() {
  const [boot, setBoot] = useState<{ store: LayoutStore; mode: PersistMode } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    bootstrapPersistence(() => loadStore(localStorage))
      .then(setBoot)
      .catch(() => setBoot({ store: loadStore(localStorage), mode: 'localStorage' }));
  }, []);

  if (!boot) {
    return (
      <div className="app app-booting" aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="brand">
          <h1>
            PHANTOM<span>LOCK</span>
          </h1>
        </div>
      </div>
    );
  }
  return <AppInner initialStore={boot.store} persistMode={boot.mode} />;
}
