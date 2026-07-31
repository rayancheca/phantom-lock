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
import { useWallDetection } from './hooks/useWallDetection';
import { useGenerateDesign } from './hooks/useGenerateDesign';
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
import { initialStoreForBoot, isPristineOrigin } from '../../engine/seed';
import { buildUnderlay } from '../panels/underlay-import';
import { deriveVerdict } from '../panels/verdict';
import { renderPlanToBlob, planImageFilename } from '../canvas/export-image';
import type { Scenario } from '../compare/ScenarioCompare';
import { useProjectActions } from './hooks/useProjectActions';
import type { ToastData } from '../ui/Toast';
import { initialMode, modeTheme, subStepForTool, type AppMode, type DesignSubStep, type ModeEntry } from './mode';
import type { Deleted, DialogState } from './app-types';
import { flipDoor, nudgeSelection, rotateSelectedRect, type KeyCommand } from './keyboard';
import { cycleOrder, describePosition, selectionForEntry, stepCycle } from '../canvas/selection-cycle';
import { keyboardPlacementPoint, openingNearPoint, openingOnWall, placeSpeakerAt } from '../canvas/placement';
import { announcementFor, speakableUnits, type AnnounceInput } from './announce';
import { useAnnouncer } from './hooks/useAnnouncer';
import LiveAnnouncer from './LiveAnnouncer';
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

function AppInner({ initialStore, persistMode, showFirstRun, droppedCount, projectNotices }: AppInnerProps) {
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [compare, setCompare] = useState<Scenario[] | null>(null);
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

  /** Floating cards (optimizer, arrange, detected walls) never outlive the
   *  context they were opened in — any step/layout/mode change closes them. */
  /** `useWallDetection` is created far below this callback (it needs `scene`
   *  and `setScene`), and this callback is deliberately mount-once. A ref is how
   *  the rest of this file bridges that same gap — see `overlayOpenRef`. */
  const discardDetectionRef = useRef<() => void>(() => {});
  const closeFloatingPanels = useCallback(() => {
    setOptimizeOpen(false);
    setProposal(null);
    setArrangeOpen(false);
    setFurnitureProposal(null);
    discardDetectionRef.current();
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

  /** Open the N-up compare, seeded with the two most useful scenarios: two seats
   *  of this layout if it has them, else this layout vs a sibling design (one from
   *  the same project first — those are the variants you actually want side by
   *  side). The user adds further columns from inside. */
  const openCompare = () => {
    const seats = sceneListeners(scene);
    const here = active.id;
    let initial: Scenario[];
    if (seats.length >= 2) {
      initial = [
        { layoutId: here, seatId: seats[0].id },
        { layoutId: here, seatId: seats[1].id },
      ];
    } else if (store.layouts.length >= 2) {
      const sibling =
        store.layouts.find((l) => l.id !== here && l.projectId === active.projectId) ??
        store.layouts.find((l) => l.id !== here) ??
        active;
      initial = [
        { layoutId: here, seatId: activeListener(scene).id },
        { layoutId: sibling.id, seatId: sceneListeners(sibling.scene)[0].id },
      ];
    } else {
      const seat = activeListener(scene).id;
      initial = [
        { layoutId: here, seatId: seat },
        { layoutId: here, seatId: seat },
      ];
    }
    // A toast's Undo button renders ABOVE the compare layer (z-80 vs z-60) and
    // mutates the store — which would recompute columns and could fire THE LOCK
    // ignition for a lock the user did not just achieve. Compare is read-only, so
    // the toast goes away when it opens.
    dismissToast();
    closeFloatingPanels();
    setGalleryOpen(false);
    setCompare(initial);
  };
  /** Compare needs two comparable things. Two projects do not add comparability on
   *  their own — a project with no layouts has nothing to show — but two layouts
   *  in different projects are already covered by the layout count. */
  const canCompare = sceneListeners(scene).length >= 2 || store.layouts.length >= 2;

  const {
    newProject,
    renameProjectTo,
    moveLayout,
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
    // A door/window preset drops onto the nearest wall (correctly aligned) rather
    // than floating unrotated in mid-room. `makeOpening` gives byte-identical
    // defaults to the preset, so there is no dimensional drift; if the scene has
    // no wall yet, fall through to the plain centre drop below.
    if (preset.role === 'door' || preset.role === 'window') {
      const res = openingNearPoint(scene, center, preset.role);
      if (res) {
        setScene(() => res.scene);
        setSelection({ type: 'object', id: res.objectId });
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

  /** First-run "Start from a floorplan photo" — the DESIGN photo-import entry,
   *  reusing the same underlay builder as UnderlayCard. */
  const importStarterPhoto = (file: File) => {
    buildUnderlay(file)
      .then(setUnderlay)
      .catch(() => showToast('Could not read that image.', { tone: 'bad' }));
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

  const detection = useWallDetection({
    scene,
    setScene,
    showToast,
    undoScene,
    setMode,
  });
  const wallProposal = detection.keptWalls;
  useEffect(() => {
    discardDetectionRef.current = detection.discard;
  }, [detection.discard]);

  const applyArrange = () => {
    if (!furnitureProposal || furnitureProposal.objects.length === 0) return;
    const n = furnitureProposal.objects.length;
    setScene((s) => ({ ...s, objects: [...s.objects, ...furnitureProposal.objects] }));
    setFurnitureProposal(null);
    setArrangeOpen(false);
    // Every scene-mutating apply is reversible with the same undo toast deletes get.
    showToast(`Added ${n} furniture piece${n === 1 ? '' : 's'}`, {
      action: { label: 'Undo', run: undoScene },
    });
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

  // --- shareable output (item H) -------------------------------------------------

  /** Render the current plan to a PNG and hand it to the browser download flow.
   *  Nothing leaves the app except via this explicit user click. */
  const exportPlanImage = () => {
    renderPlanToBlob({ scene, settings, trace, audio, bestSpot, theme })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = planImageFilename(active.name);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Saved the plan image', { tone: 'ok' });
      })
      .catch(() => showToast('Could not export the plan image.', { tone: 'bad' }));
  };

  /** Copy the verdict headline + cause + seat to the clipboard (single source:
   *  `deriveVerdict`, same as the hero). Guards for an absent clipboard API. */
  const copyVerdict = () => {
    if (audio.pairs.length === 0) {
      showToast('No verdict yet — place a stereo pair first.', { tone: 'bad' });
      return;
    }
    const view = deriveVerdict(audio, trace, settings.tvAnchor);
    const seat = activeListener(scene).name;
    const text = `Phantom Lock — ${view.headline} at ${seat}.${view.cause ? ` ${view.cause}` : ''}`;
    const clip = navigator.clipboard;
    if (!clip?.writeText) {
      showToast('Copying isn’t available in this browser.', { tone: 'bad' });
      return;
    }
    clip
      .writeText(text)
      .then(() => showToast('Verdict copied to clipboard', { tone: 'ok' }))
      .catch(() => showToast('Could not copy the verdict.', { tone: 'bad' }));
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
    // Both branches are reversible: the optimizer overwrite AND the fresh placement
    // are one history step, so each gets the same one-tap undo toast (item E).
    showToast(
      replacing
        ? `Replaced your speakers with ${n} suggested one${n === 1 ? '' : 's'}${proposal.targetName ? moved : ''}`
        : `Placed ${n} speaker${n === 1 ? '' : 's'}${moved}`,
      { action: { label: 'Undo', run: undoScene } },
    );
  };

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

  const runKeyCommand = (cmd: KeyCommand) => {
    // Any new command supersedes a previous "that didn't work" explanation.
    if (notice) setNotice(null);
    switch (cmd.type) {
      case 'escape':
        if (cmd.target === 'dialog') setDialog(null);
        else if (cmd.target === 'wallProposal') detection.discard();
        else if (cmd.target === 'optimize') {
          setOptimizeOpen(false);
          setProposal(null);
        } else if (cmd.target === 'arrange') {
          setArrangeOpen(false);
          setFurnitureProposal(null);
        } else {
          setMode('select');
          // Announce the transition, not the state — otherwise deselecting is
          // silent and indistinguishable from a key that did nothing.
          if (selection) setNotice('Selection cleared.');
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
        setScene((s) => rotateSelectedRect(s, selection.id, cmd.dir, cmd.coarse), { coalesce: cmd.coalesce });
        return;
      case 'nudge':
        if (!selection) return;
        setScene((s) => nudgeSelection(s, selection, { x: cmd.dx, y: cmd.dy }), { coalesce: cmd.coalesce });
        return;
      case 'cycle': {
        // Walk the deterministic traversal so every wall, seat, speaker and
        // piece of furniture is reachable without a pointer.
        const entry = stepCycle(cycleOrder(scene), selection, cmd.dir, scene);
        if (!entry) return;
        // A seat entry must ALSO become the active seat — `{type:'listener'}`
        // carries no id, so selecting it without switching would silently point
        // at whichever seat was already active (and desync the readout).
        if (entry.kind === 'listener') switchSeat(entry.id);
        else setSelection(selectionForEntry(entry));
        return;
      }
      case 'place-speaker': {
        const { scene: next, speakerId } = placeSpeakerAt(
          scene,
          keyboardPlacementPoint(scene),
          placeModel,
          settings.snap,
        );
        setScene(() => next);
        setSelection({ type: 'speaker', id: speakerId });
        return;
      }
      case 'opening': {
        if (selection?.type !== 'object') return;
        const res = openingOnWall(scene, selection.id, cmd.role);
        if (!res) {
          // `{type:'object'}` spans wall/rect/circle, so the dispatcher cannot
          // tell a wall from furniture. Saying so matters: for a user whose only
          // channel is the live region, a silent no-op is indistinguishable
          // from a broken app.
          setNotice(`Select a wall first — ${cmd.role}s can only be added to a wall.`);
          return;
        }
        setScene(() => res.scene);
        setSelection({ type: 'object', id: res.objectId });
        return;
      }
      case 'flip-door': {
        if (selection?.type !== 'object') return;
        const next = flipDoor(scene, selection.id, cmd.field);
        // `flipDoor` returns the SAME ref for a non-door — the dispatcher is
        // scene-independent so it can't tell a door from a wall/furniture. Say
        // so rather than push a no-op scene (which would still spawn an undo
        // entry, the S14 lesson).
        if (next === scene) {
          setNotice('Select a door to flip its hinge or swing side.');
          return;
        }
        setScene(() => next);
        return;
      }
    }
  };

  // --- the off-screen spoken mirror (S7) -----------------------------------
  // Reuses deriveVerdict, so the spoken readout and the visible VerdictHero can
  // never drift. Cheap: useSimulation already runs unconditionally in both
  // modes, so this is a reduce + one sentence, no engine work.
  const announceInput: AnnounceInput = {
    appMode,
    seatName: activeListener(scene).name,
    seatCount: sceneListeners(scene).length,
    speakerCount: scene.speakers.length,
    wallCount: scene.objects.filter((o) => o.kind === 'wall').length,
    objectCount: scene.objects.filter((o) => o.kind !== 'wall').length,
    areaCount: scene.rooms?.length ?? 0,
    showBestSpot: settings.showBestSpot,
    // `best` is nullable even when the field object exists — treating a present
    // field as "found" would announce a spot that isn't there.
    bestSpotFound: bestSpot?.best != null,
    verdict: appMode === 'tune' ? deriveVerdict(audio, trace, settings.tvAnchor) : null,
  };
  const prevAnnounceRef = useRef<AnnounceInput | null>(null);
  const announceText = announcementFor(announceInput, prevAnnounceRef.current);
  // The baseline advances in an EFFECT, never during render. Writing it inline
  // is a render-purity violation that StrictMode makes visible: React
  // double-invokes the render body, the ref persists between the two
  // invocations, so the second (committing) one sees prev === current,
  // `countsChanged` is permanently false, and the scene-inventory clause is
  // never announced again after mount — silently, and ONLY in dev, which is
  // exactly where this project does its live verification. Same reason
  // `useLockIgnition` (VerdictHero.tsx) does its ref work in an effect.
  useEffect(() => {
    prevAnnounceRef.current = announceInput;
  });
  const readout = useAnnouncer(announceText, overlayOpen);

  // Selection is discrete and user-initiated, so it is announced immediately
  // rather than through the settle window. A transient `notice` (set by a
  // command that could not do anything) pre-empts it — silence is the one thing
  // a live-region-only user cannot interpret.
  const selectionText = (() => {
    if (notice) return notice;
    // NOT "selection cleared" here: a null selection is also the boot state, and
    // announcing it on first paint is the very thing this design avoids. The
    // deselect TRANSITION is announced from the Escape command instead.
    if (!selection) return '';
    if (selection.type === 'multi') {
      const n = selection.objectIds.length + selection.speakerIds.length;
      return `${n} item${n === 1 ? '' : 's'} selected.`;
    }
    const order = cycleOrder(scene);
    const id = selection.type === 'listener' ? (scene.activeListenerId ?? '') : selection.id;
    const entry = order.find((e) => e.id === id);
    // Same unit expansion the verdict path gets — otherwise "0.74 m" is spoken
    // as "em" here while the readout says "metres" a second later.
    return entry ? speakableUnits(describePosition(order, entry)) : '';
  })();

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
        onMoveLayout={moveLayout}
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
      <LiveAnnouncer readout={readout} selection={selectionText} />
    </div>
  );
}

/**
 * Boots persistence (IndexedDB, migrating the legacy localStorage blob on first
 * run; hardened localStorage fallback if IDB is unavailable), then mounts the app
 * once the store is hydrated. A brief splash covers the async load.
 */
export default function App() {
  const [boot, setBoot] = useState<{
    store: LayoutStore;
    mode: PersistMode;
    firstRun: boolean;
  } | null>(null);
  const startedRef = useRef(false);
  /** Ids of records `loadFromIDB` could not reconstruct — reported once mounted. */
  const droppedRef = useRef<string[]>([]);
  /** Folder-level repairs — reported separately; nothing was lost. */
  const noticesRef = useRef<string[]>([]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // On a pristine origin `initialStoreForBoot` seeds the Maple Court demo with a
    // locked pair (a live verdict on first paint) — but ONLY on the confirmed
    // happy-path first run. The degraded fallback (2nd arg + the outer .catch) uses
    // the plain, NON-seeding `loadStore` so a synthetic demo is never injected over
    // records that are merely temporarily unreadable.
    const noteProject = (reason: string) => {
      noticesRef.current.push(reason);
      console.warn(`[phantom-lock] folder repair on load: ${reason}`);
    };
    bootstrapPersistence(
      // The localStorage paths get the SAME folder-notice channel as the IDB one:
      // in degraded mode `loadStore` IS the persistence layer, and a folder list
      // that sanitizes to nothing there was collapsing in total silence — then
      // being written back over the original ~400 ms later.
      () => initialStoreForBoot(localStorage, noteProject),
      () => loadStore(localStorage, noteProject),
      // A record that cannot be reconstructed is dropped so the rest survive —
      // but never silently: a layout vanishing from the gallery with no
      // explanation is indistinguishable from the app losing the user's work.
      (id) => {
        droppedRef.current.push(id);
        console.error(`[phantom-lock] dropped an unreadable layout record: ${id}`);
      },
      // Separate channel: a repaired folder loses NO layout, so it must never
      // reach the "your work may be gone" warning above.
      noteProject,
    )
      .then(setBoot)
      .catch(() =>
        setBoot({ store: loadStore(localStorage, noteProject), mode: 'localStorage', firstRun: false }),
      );
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
  // The welcome shows ONLY on a genuine first run: no prior IDB data (`firstRun`)
  // AND a pristine origin (so a localStorage→IDB migration of real data is excluded,
  // and the "you're looking at the demo" copy is always accurate).
  const showFirstRun = boot.firstRun && isPristineOrigin(localStorage);
  return (
    <AppInner
      initialStore={boot.store}
      persistMode={boot.mode}
      showFirstRun={showFirstRun}
      droppedCount={droppedRef.current.length}
      projectNotices={noticesRef.current}
    />
  );
}
