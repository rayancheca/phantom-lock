import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Layout,
  LayoutStore,
  Scene,
  SceneObject,
  Selection,
  SimSettings,
  SpeakerModel,
  SpeakerObj,
  ToolMode,
  Vec2,
} from '../../engine/types';
import { traceScene } from '../../engine/raytrace';
import { computeAudio } from '../../engine/stereo';
import { matchTrims } from '../../engine/speakers';
import { suggestPlacement, type PlacementOptions, type Proposal } from '../../engine/optimize';
import { bestListeningSpot } from '../../engine/bestspot';
import { arrangeFurniture, suggestInventory, type ArrangeItem, type ArrangeResult } from '../../engine/arrange';
import { detectWallsFromUnderlay } from '../../engine/detect';
import {
  activeListener,
  addListener,
  apartmentScene,
  blankScene,
  createId,
  FURNITURE_PRESETS,
  loadStore,
  makeLayout,
  rectRoomScene,
  removeListener,
  renameListener,
  sanitizeLayout,
  sanitizeScene,
  sceneBounds,
  sceneListeners,
  setActiveListener,
  splitWallAt,
  addRoomShell,
  STORAGE_KEY,
  updateActiveListener,
} from '../../engine/scene';
import {
  bootstrapPersistence,
  buildExportBundle,
  removeLayout,
  saveLayout,
  saveMeta,
  type PersistMode,
} from '../../engine/db';
import SimCanvas from '../canvas/SimCanvas';
import type { CanvasTheme } from '../canvas/render';
import Toolbar from '../panels/Toolbar';
import WorkflowSteps, { type Step } from '../panels/WorkflowSteps';
import GuidePanel from '../panels/GuidePanel';
import FurniturePalette from '../panels/FurniturePalette';
import ControlsCard from '../panels/ControlsCard';
import MetricsPanel from '../panels/MetricsPanel';
import InspectorPanel from '../panels/InspectorPanel';
import SpeakersCard from '../panels/SpeakersCard';
import ListenerCard from '../panels/ListenerCard';
import Echogram from '../panels/Echogram';
import ScenarioCompare, { type Scenario } from '../compare/ScenarioCompare';
import OptimizeDialog from '../panels/OptimizeDialog';
import ArrangeDialog from '../panels/ArrangeDialog';
import UnderlayCard from '../panels/UnderlayCard';
import LayoutGallery from '../gallery/LayoutGallery';
import { CalibrateDialog, RenameDialog, RoomSizeDialog } from '../panels/LayoutDialogs';
import Icon from '../ui/Icon';
import Toast, { type ToastData } from '../ui/Toast';
import './app.css';

/** While dragging, trace with the spec minimum so interaction stays fluid. */
const DRAG_RAYS = 360;

const MODE_HINT: Record<ToolMode, string> = {
  select: 'Drag to move · scroll = pan · pinch / ⌘-scroll = zoom · twist / ⌥-scroll = rotate view',
  wall: 'Click corner by corner · Backspace = undo corner · click the first corner to close · Esc to finish',
  rect: 'Drag to draw a box — couch, desk, cabinet…',
  circle: 'Drag from the centre to draw a round object',
  speaker: 'Click to place the speaker · Esc when done',
  calibrate: 'Click two points on the floorplan image whose real-world distance you know',
  room: 'Drag a box over an area to mark it as a room · then name it (Kitchen, Bedroom…)',
  marquee: 'Drag a box to select everything inside · ⇧ adds to the selection',
  lasso: 'Draw around objects to select them · ⇧ adds to the selection',
};

const PLAN_STEPS: Step[] = ['build', 'furnish'];
const TOOL_OWNER: Partial<Record<ToolMode, Step>> = {
  wall: 'build',
  room: 'build',
  rect: 'furnish',
  circle: 'furnish',
  speaker: 'sound',
  calibrate: 'build',
};

function initialStep(scene: Scene): Step {
  const hasWalls = scene.objects.some((o) => o.kind === 'wall');
  if (!hasWalls) return 'build';
  if (scene.speakers.length === 0) return 'sound';
  return 'analyze';
}

/** Undo snapshots carry the layout they came from, so an undo after switching
 *  rooms restores into the right scene instead of the currently active one. */
type Deleted =
  | { type: 'object'; layoutId: string; obj: SceneObject }
  | { type: 'speaker'; layoutId: string; speaker: SpeakerObj; pairs: Array<[string, string]> }
  | { type: 'layout'; layout: Layout; index: number; replacementId?: string }
  | { type: 'speakers'; layoutId: string; speakers: SpeakerObj[]; pairs: Array<[string, string]> };

type DialogState =
  | { kind: 'room-size'; purpose: 'layout' | 'add-room' }
  | { kind: 'room-name'; zone: { center: Vec2; w: number; h: number } }
  | { kind: 'rename'; layoutId: string }
  | { kind: 'calibrate'; measured: number }
  | null;

interface AppInnerProps {
  initialStore: LayoutStore;
  persistMode: PersistMode;
}

function AppInner({ initialStore, persistMode }: AppInnerProps) {
  const [store, setStore] = useState<LayoutStore>(initialStore);
  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<ToolMode>('select');
  const [step, setStep] = useState<Step>(() => {
    const active =
      initialStore.layouts.find((l) => l.id === initialStore.activeId) ?? initialStore.layouts[0];
    return active ? initialStep(active.scene) : 'build';
  });
  const [theme, setTheme] = useState<CanvasTheme>(() => (PLAN_STEPS.includes(step) ? 'plan' : 'sound'));
  const [placeModel, setPlaceModel] = useState<SpeakerModel>('homepod');
  const [dragging, setDragging] = useState(false);
  const [resetViewToken, setResetViewToken] = useState(0);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [furnitureProposal, setFurnitureProposal] = useState<ArrangeResult | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [wallProposal, setWallProposal] = useState<SceneObject[] | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [compare, setCompare] = useState<{ left: Scenario; right: Scenario } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastDeletedRef = useRef<Deleted | null>(null);
  const toastIdRef = useRef(0);
  /** Per-layout scene history. Edits within 400 ms coalesce into one entry so
   *  a drag records a single step, not a step per pointer frame. */
  const historyRef = useRef(new Map<string, { past: Scene[]; future: Scene[]; lastPush: number }>());
  const [, setHistVersion] = useState(0);

  const histFor = (id: string) => {
    let h = historyRef.current.get(id);
    if (!h) {
      h = { past: [], future: [], lastPush: 0 };
      historyRef.current.set(id, h);
    }
    return h;
  };

  const showToast = useCallback(
    (message: string, opts?: Partial<Omit<ToastData, 'id' | 'message'>>) => {
      setToast({ id: ++toastIdRef.current, message, ...opts });
    },
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const active = store.layouts.find((l) => l.id === store.activeId) ?? store.layouts[0];
  const scene = active.scene;
  const settings = active.settings;
  const hasWalls = scene.objects.some((o) => o.kind === 'wall');

  const setScene = useCallback((next: Scene | ((s: Scene) => Scene)) => {
    setStore((st) => ({
      ...st,
      layouts: st.layouts.map((l) => {
        if (l.id !== st.activeId) return l;
        const h = histFor(l.id);
        const now = Date.now();
        // Skip duplicate pushes (StrictMode double-run) and coalesce bursts.
        if (h.past[h.past.length - 1] !== l.scene && now - h.lastPush > 400) {
          h.past.push(l.scene);
          h.lastPush = now;
          if (h.past.length > 500) h.past.shift();
        }
        h.future.length = 0;
        return { ...l, scene: typeof next === 'function' ? next(l.scene) : next, updatedAt: now };
      }),
    }));
  }, []);

  const undoScene = useCallback(() => {
    setStore((st) => {
      const h = histFor(st.activeId);
      const prev = h.past.pop();
      if (!prev) return st;
      return {
        ...st,
        layouts: st.layouts.map((l) => {
          if (l.id !== st.activeId) return l;
          h.future.push(l.scene);
          return { ...l, scene: prev, updatedAt: Date.now() };
        }),
      };
    });
    setSelection(null);
    setHistVersion((n) => n + 1);
  }, []);

  const redoScene = useCallback(() => {
    setStore((st) => {
      const h = histFor(st.activeId);
      const next = h.future.pop();
      if (!next) return st;
      return {
        ...st,
        layouts: st.layouts.map((l) => {
          if (l.id !== st.activeId) return l;
          h.past.push(l.scene);
          h.lastPush = 0;
          return { ...l, scene: next, updatedAt: Date.now() };
        }),
      };
    });
    setSelection(null);
    setHistVersion((n) => n + 1);
  }, []);

  const setSettings = useCallback((next: SimSettings) => {
    setStore((st) => ({
      ...st,
      // Bump updatedAt so the IndexedDB autosave diff (keyed on updatedAt) actually persists it.
      layouts: st.layouts.map((l) =>
        l.id === st.activeId ? { ...l, settings: next, updatedAt: Date.now() } : l,
      ),
    }));
  }, []);

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

  const applyStep = useCallback(
    (s: Step, sceneNow: Scene = scene) => {
      setStep(s);
      setTheme(PLAN_STEPS.includes(s) ? 'plan' : 'sound');
      const wallsExist = sceneNow.objects.some((o) => o.kind === 'wall');
      setMode(s === 'build' && !wallsExist ? 'wall' : 'select');
      closeFloatingPanels();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, closeFloatingPanels],
  );

  const applyTool = useCallback(
    (t: ToolMode) => {
      setMode(t);
      const owner = TOOL_OWNER[t];
      if (owner && owner !== step) {
        setStep(owner);
        setTheme(PLAN_STEPS.includes(owner) ? 'plan' : 'sound');
      }
    },
    [step],
  );

  const startPlacing = (model: SpeakerModel) => {
    setPlaceModel(model);
    applyTool('speaker');
  };

  const effRays = dragging ? Math.min(settings.rayCount, DRAG_RAYS) : settings.rayCount;
  const trace = useMemo(
    () => traceScene(scene, effRays, settings.maxBounces),
    [scene, effRays, settings.maxBounces],
  );
  const audio = useMemo(
    () => computeAudio(scene, trace, settings.tvAnchor),
    [scene, trace, settings.tvAnchor],
  );
  const bestSpot = useMemo(
    () =>
      settings.showBestSpot && scene.speakers.length > 0
        ? bestListeningSpot(scene, settings.tvAnchor, dragging)
        : null,
    [scene, settings.showBestSpot, settings.tvAnchor, dragging],
  );

  const stepDone: Record<Step, boolean> = {
    build: scene.objects.filter((o) => o.kind === 'wall').length >= 3,
    furnish: scene.objects.some((o) => o.kind !== 'wall'),
    sound: scene.speakers.length > 0,
    analyze: audio.pairs.some((p) => p.locked),
  };

  // --- persistence -----------------------------------------------------------
  /** What we last wrote per layout, so autosave rewrites only what changed and
   *  only re-encodes the (large) photo blob when the image itself changed. */
  const persistedRef = useRef(
    new Map<string, { updatedAt: number; underlaySrc: string | null }>(
      initialStore.layouts.map((l) => [
        l.id,
        { updatedAt: l.updatedAt, underlaySrc: l.scene.underlay?.src ?? null },
      ]),
    ),
  );
  const saveFailedRef = useRef(false);
  /** Always the latest store, so persist callbacks read fresh state without
   *  re-binding (keeps the pagehide/flush listeners stable). */
  const storeRef = useRef(store);
  storeRef.current = store;
  /** Serialize persist cycles — a slow blob write must not race a newer one over
   *  the shared persistedRef Map. */
  const persistingRef = useRef(false);
  const rerunRef = useRef(false);

  /** The storage-agnostic safety net: every layout in one self-contained file. */
  const exportAll = useCallback(() => {
    const bundle = buildExportBundle(storeRef.current);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phantom-lock-layouts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const warnSaveFailed = useCallback(
    (message: string) => {
      if (saveFailedRef.current) return;
      saveFailedRef.current = true;
      showToast(message, { tone: 'bad', action: { label: 'Export all', run: exportAll } });
    },
    [exportAll, showToast],
  );

  /** Persist the current store. IndexedDB by default (per-layout, isolated so one
   *  bad record can't block the rest); hardened localStorage fallback otherwise.
   *  Any failure is LOUD, never silent. */
  const persistNow = useCallback(async () => {
    if (persistMode !== 'idb') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storeRef.current));
        saveFailedRef.current = false;
      } catch {
        warnSaveFailed(
          'Storage is full — your changes are no longer being saved. Export your layouts to keep them.',
        );
      }
      return;
    }
    if (persistingRef.current) {
      rerunRef.current = true; // a save is running; run once more with the latest state
      return;
    }
    persistingRef.current = true;
    try {
      const st = storeRef.current;
      const seen = persistedRef.current;
      let anyFailed = false;
      for (const l of st.layouts) {
        const prev = seen.get(l.id);
        const src = l.scene.underlay?.src ?? null;
        if (!prev || prev.updatedAt !== l.updatedAt) {
          try {
            await saveLayout(l, !prev || prev.underlaySrc !== src);
            seen.set(l.id, { updatedAt: l.updatedAt, underlaySrc: src });
          } catch {
            anyFailed = true; // isolate: keep persisting the other layouts
          }
        }
      }
      const live = new Set(st.layouts.map((l) => l.id));
      for (const id of [...seen.keys()]) {
        if (!live.has(id)) {
          try {
            await removeLayout(id);
            seen.delete(id);
          } catch {
            anyFailed = true;
          }
        }
      }
      try {
        await saveMeta(st.activeId);
      } catch {
        anyFailed = true;
      }
      if (anyFailed) {
        warnSaveFailed('Could not save everything to the database — export your layouts to keep them safe.');
      } else {
        saveFailedRef.current = false; // clean cycle — allow a fresh warning if it fails later
      }
    } finally {
      persistingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void persistNow();
      }
    }
  }, [persistMode, warnSaveFailed]);

  // Autosave, debounced.
  useEffect(() => {
    const t = setTimeout(() => void persistNow(), 400);
    return () => clearTimeout(t);
  }, [store, persistNow]);

  // Best-effort flush when the tab is hidden/closed so an edit made inside the
  // 400 ms debounce window isn't lost (localStorage writes synchronously here).
  useEffect(() => {
    const flush = () => void persistNow();
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [persistNow]);

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

  /** Break a wall in two at a point (or its midpoint) and select the first half. */
  const splitWall = (id: string, at?: Vec2) => {
    setScene((s) => {
      const wall = s.objects.find((o) => o.id === id);
      if (!wall || wall.kind !== 'wall') return s;
      const [first, second] = splitWallAt(wall, at);
      setTimeout(() => setSelection({ type: 'object', id: first.id }), 0);
      return {
        ...s,
        objects: s.objects.flatMap((o) => (o.id === id ? [first, second] : [o])),
      };
    });
  };

  const addPreset = (presetId: string) => {
    const preset = FURNITURE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setScene((s) => {
      const b = sceneBounds(s);
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
      const objects =
        preset.role === 'tv'
          ? s.objects.map((o) => (o.kind === 'rect' && o.role === 'tv' ? { ...o, role: 'furniture' as const } : o))
          : s.objects;
      setTimeout(() => setSelection({ type: 'object', id: obj.id }), 0);
      return { ...s, objects: [...objects, obj] };
    });
  };

  const undoDelete = useCallback(() => {
    const deleted = lastDeletedRef.current;
    if (!deleted) return;
    lastDeletedRef.current = null;

    if (deleted.type === 'layout') {
      setStore((st) => {
        if (st.layouts.some((l) => l.id === deleted.layout.id)) return st;
        // Drop the auto-created placeholder if the user hasn't touched it.
        const layouts = st.layouts.filter(
          (l) =>
            l.id !== deleted.replacementId ||
            l.scene.objects.length > 0 ||
            l.scene.speakers.length > 0,
        );
        layouts.splice(Math.min(deleted.index, layouts.length), 0, deleted.layout);
        return { layouts, activeId: deleted.layout.id };
      });
      setResetViewToken((n) => n + 1);
      applyStep(initialStep(deleted.layout.scene), deleted.layout.scene);
      return;
    }

    // Scene-scoped snapshots go back to the layout they were deleted from,
    // which may no longer be the active one — or may no longer exist.
    setStore((st) => {
      if (!st.layouts.some((l) => l.id === deleted.layoutId)) return st;
      return {
        ...st,
        layouts: st.layouts.map((l) => {
          if (l.id !== deleted.layoutId) return l;
          const scene =
            deleted.type === 'object'
              ? { ...l.scene, objects: [...l.scene.objects, deleted.obj] }
              : deleted.type === 'speaker'
                ? {
                    ...l.scene,
                    speakers: [...l.scene.speakers, deleted.speaker],
                    pairs: [...l.scene.pairs, ...deleted.pairs],
                  }
                : { ...l.scene, speakers: deleted.speakers, pairs: deleted.pairs };
          return { ...l, scene, updatedAt: Date.now() };
        }),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyStep]);

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

  // --- layout management ------------------------------------------------------

  const afterLayoutSwitch = (nextScene: Scene) => {
    setSelection(null);
    closeFloatingPanels();
    setResetViewToken((n) => n + 1);
    applyStep(initialStep(nextScene), nextScene);
  };

  const switchLayout = (id: string) => {
    const next = store.layouts.find((l) => l.id === id);
    setStore((st) => ({ ...st, activeId: id }));
    if (next) afterLayoutSwitch(next.scene);
  };

  const addLayout = (kind: 'blank' | 'apartment') => {
    const layout =
      kind === 'blank'
        ? makeLayout('New layout', blankScene())
        : makeLayout('Maple Court', apartmentScene());
    setStore((st) => ({ layouts: [...st.layouts, layout], activeId: layout.id }));
    afterLayoutSwitch(layout.scene);
  };

  const addRoomLayout = (w: number, d: number) => {
    const layout = makeLayout(`Room ${w}×${d}`, rectRoomScene(w, d));
    setStore((st) => ({ layouts: [...st.layouts, layout], activeId: layout.id }));
    setDialog(null);
    setGalleryOpen(false);
    afterLayoutSwitch(layout.scene);
  };

  const duplicateLayout = (id: string) => {
    const source = store.layouts.find((l) => l.id === id) ?? active;
    const copy = structuredClone(source);
    copy.id = createId('layout');
    copy.name = `${source.name} copy`;
    copy.updatedAt = Date.now();
    setStore((st) => ({ layouts: [...st.layouts, copy], activeId: copy.id }));
  };

  const renameLayout = (id: string, name: string) => {
    setStore((st) => ({
      ...st,
      layouts: st.layouts.map((l) => (l.id === id ? { ...l, name, updatedAt: Date.now() } : l)),
    }));
    setDialog(null);
  };

  /** Deletes immediately; the toast's Undo restores it. No confirm dialog. */
  const deleteLayout = (id: string) => {
    const index = store.layouts.findIndex((l) => l.id === id);
    const layout = store.layouts[index];
    if (!layout) return;
    if (id !== store.activeId) {
      lastDeletedRef.current = { type: 'layout', layout, index };
      setStore((st) => ({ ...st, layouts: st.layouts.filter((l) => l.id !== id) }));
      showToast(`Deleted “${layout.name}”`, { action: { label: 'Undo', run: undoDelete } });
      return;
    }
    const remaining = store.layouts.filter((l) => l.id !== id);
    let nextLayout: Layout;
    let replacementId: string | undefined;
    if (remaining.length === 0) {
      nextLayout = makeLayout('New layout', blankScene());
      replacementId = nextLayout.id;
      setStore({ layouts: [nextLayout], activeId: nextLayout.id });
    } else {
      nextLayout = remaining[Math.max(0, index - 1)];
      setStore({ layouts: remaining, activeId: nextLayout.id });
    }
    lastDeletedRef.current = { type: 'layout', layout, index, replacementId };
    afterLayoutSwitch(nextLayout.scene);
    showToast(`Deleted “${layout.name}”`, { action: { label: 'Undo', run: undoDelete } });
  };

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

  // One definition of "a blocking overlay is open", shared by this handler and
  // SimCanvas's key gate. Includes the full-screen gallery + compare AND the
  // "Detected layout" confirmation (wallProposal) — all sit OVER the still-mounted
  // canvas, so their open state can't leak scene/tool/rotate keys through.
  const overlayOpen =
    dialog !== null || optimizeOpen || arrangeOpen || compare !== null || galleryOpen || wallProposal !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        // Let Escape close an overlay even while typing in one of its fields.
        if (!(e.key === 'Escape' && overlayOpen)) return;
      }

      if (e.key === 'Escape') {
        if (dialog) {
          setDialog(null);
        } else if (wallProposal) {
          setWallProposal(null);
        } else if (optimizeOpen) {
          setOptimizeOpen(false);
          setProposal(null);
        } else if (arrangeOpen) {
          setArrangeOpen(false);
          setFurnitureProposal(null);
        } else {
          setMode('select');
          setSelection(null);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (overlayOpen) return;
        e.preventDefault();
        if (e.shiftKey) redoScene();
        else undoScene();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Everything below mutates the scene or switches tools — never while an
      // overlay is up, no matter what element happens to hold focus.
      if (overlayOpen) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection && mode !== 'wall') {
        if (selection.type === 'object') deleteObject(selection.id);
        else if (selection.type === 'speaker') deleteSpeaker(selection.id);
        else if (selection.type === 'multi') {
          const { objectIds, speakerIds } = selection;
          setScene((s) => ({
            ...s,
            objects: s.objects.filter((o) => !objectIds.includes(o.id)),
            speakers: s.speakers.filter((sp) => !speakerIds.includes(sp.id)),
            pairs: s.pairs.filter(([a, b]) => !speakerIds.includes(a) && !speakerIds.includes(b)),
          }));
          setSelection(null);
          const n = objectIds.length + speakerIds.length;
          showToast(`Deleted ${n} item${n === 1 ? '' : 's'}`, {
            action: { label: 'Undo', run: undoScene },
          });
        }
        return;
      }
      if (e.key === '1') applyTool('select');
      else if (e.key === '2') applyTool('wall');
      else if (e.key === '3') applyTool('rect');
      else if (e.key === '4') applyTool('circle');
      else if (e.key === '5') applyTool('speaker');
      else if (e.key === 't') setTheme((th) => (th === 'plan' ? 'sound' : 'plan'));
      else if ((e.key === 'q' || e.key === 'e') && selection?.type === 'object') {
        const dir = e.key === 'q' ? -1 : 1;
        setScene((s) => ({
          ...s,
          objects: s.objects.map((o) => {
            if (o.id !== selection.id || o.kind !== 'rect') return o;
            let rot = o.rotation + (dir * 5 * Math.PI) / 180;
            if (rot > Math.PI) rot -= Math.PI * 2;
            if (rot < -Math.PI) rot += Math.PI * 2;
            return { ...o, rotation: rot };
          }),
        }));
      } else if (e.key.startsWith('Arrow') && selection) {
        e.preventDefault();
        const stepM = e.shiftKey ? 0.25 : 0.05;
        const d: Vec2 = {
          x: e.key === 'ArrowLeft' ? -stepM : e.key === 'ArrowRight' ? stepM : 0,
          y: e.key === 'ArrowUp' ? -stepM : e.key === 'ArrowDown' ? stepM : 0,
        };
        setScene((s) => {
          if (selection.type === 'multi') {
            const { objectIds, speakerIds } = selection;
            return {
              ...s,
              objects: s.objects.map((o) => {
                if (!objectIds.includes(o.id)) return o;
                if (o.kind === 'wall') {
                  return {
                    ...o,
                    a: { x: o.a.x + d.x, y: o.a.y + d.y },
                    b: { x: o.b.x + d.x, y: o.b.y + d.y },
                  };
                }
                return { ...o, center: { x: o.center.x + d.x, y: o.center.y + d.y } };
              }),
              speakers: s.speakers.map((sp) =>
                speakerIds.includes(sp.id)
                  ? { ...sp, pos: { x: sp.pos.x + d.x, y: sp.pos.y + d.y } }
                  : sp,
              ),
            };
          }
          if (selection.type === 'listener') {
            return updateActiveListener(s, {
              pos: { x: s.listener.pos.x + d.x, y: s.listener.pos.y + d.y },
            });
          }
          if (selection.type === 'speaker') {
            return {
              ...s,
              speakers: s.speakers.map((sp) =>
                sp.id === selection.id ? { ...sp, pos: { x: sp.pos.x + d.x, y: sp.pos.y + d.y } } : sp,
              ),
            };
          }
          return {
            ...s,
            objects: s.objects.map((o) => {
              if (o.id !== selection.id) return o;
              if (o.kind === 'wall') {
                return {
                  ...o,
                  a: { x: o.a.x + d.x, y: o.a.y + d.y },
                  b: { x: o.b.x + d.x, y: o.b.y + d.y },
                };
              }
              return { ...o, center: { x: o.center.x + d.x, y: o.center.y + d.y } };
            }),
          };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, optimizeOpen, arrangeOpen, dialog, wallProposal, compare, galleryOpen, mode, applyTool, scene.objects, scene.speakers, scene.pairs]);

  // --- import / export -----------------------------------------------------------------

  const exportLayout = (id: string) => {
    const l = store.layouts.find((x) => x.id === id) ?? active;
    const blob = new Blob(
      [JSON.stringify({ name: l.name, scene: l.scene, settings: l.settings }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importLayout = (file: File) => {
    file
      .text()
      .then((text) => {
        const parsed: unknown = JSON.parse(text);
        const layout =
          sanitizeLayout(parsed) ??
          (() => {
            const data = parsed as { scene?: unknown };
            const sc = sanitizeScene(data.scene ?? parsed);
            return sc ? makeLayout(file.name.replace(/\.json$/i, '') || 'Imported', sc) : null;
          })();
        if (!layout) {
          showToast('That file does not look like a Phantom Lock layout.', { tone: 'bad' });
          return;
        }
        layout.id = createId('layout');
        setStore((st) => ({ layouts: [...st.layouts, layout], activeId: layout.id }));
        afterLayoutSwitch(layout.scene);
        showToast(`Imported “${layout.name}”`, { tone: 'ok' });
      })
      .catch(() => showToast('Could not read that file as JSON.', { tone: 'bad' }));
  };

  // The starter hands off once a floorplan is imported or a detection is up.
  const showStarter =
    step === 'build' && !hasWalls && mode !== 'wall' && !scene.underlay && !wallProposal && !detecting;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand" title="Phantom Lock — acoustic room planner">
            <h1>
              PHANTOM<span>LOCK</span>
            </h1>
          </div>
          <button
            type="button"
            className="room-trigger"
            title="All layouts — switch, create, manage"
            onClick={() => setGalleryOpen(true)}
          >
            <span className="room-trigger-name">{active.name}</span>
            <Icon name="layers" size={14} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importLayout(f);
              e.target.value = '';
            }}
          />
        </div>

        <WorkflowSteps step={step} onStep={(s) => applyStep(s)} done={stepDone} />

        <div className="topbar-actions">
          <div className="mode-toggle" role="group" aria-label="Listening mode">
            <button
              type="button"
              className={settings.tvAnchor ? 'mode-on' : ''}
              aria-pressed={settings.tvAnchor}
              title="Cinema: the phantom center must land on the TV — lock and sweet spot track the TV axis"
              onClick={() => {
                setSettings({ ...settings, tvAnchor: true });
                closeFloatingPanels();
              }}
            >
              <Icon name="film" size={14} />
              TV
            </button>
            <button
              type="button"
              className={!settings.tvAnchor ? 'mode-on' : ''}
              aria-pressed={!settings.tvAnchor}
              title="Music: the image anchors on you — the TV is ignored by locks and sweet spots"
              onClick={() => {
                setSettings({ ...settings, tvAnchor: false });
                closeFloatingPanels();
              }}
            >
              <Icon name="music" size={14} />
              Music
            </button>
          </div>
          {canCompare && (
            <button
              type="button"
              className="btn btn-compare"
              title="Compare two seats or two layouts side by side"
              onClick={openCompare}
            >
              <Icon name="grid" size={15} />
              <span>Compare</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-suggest"
            onClick={() => {
              setOptimizeOpen(true);
              setProposal(null);
            }}
          >
            <Icon name="sparkles" size={15} />
            <span>Suggest placement</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className={`stage ${theme === 'plan' ? 'stage-plan' : ''}`} aria-label="Room canvas">
          <SimCanvas
            scene={scene}
            settings={settings}
            selection={selection}
            mode={mode}
            theme={theme}
            placeModel={placeModel}
            trace={trace}
            audio={audio}
            proposal={proposal}
            furnitureProposal={wallProposal ?? furnitureProposal?.objects ?? null}
            bestSpot={bestSpot}
            resetViewToken={resetViewToken}
            overlayOpen={overlayOpen}
            onScene={setScene}
            onSelection={setSelection}
            onDragging={setDragging}
            onCalibrate={handleCalibrate}
            onRoomDrawn={(zone) => setDialog({ kind: 'room-name', zone })}
            onSplitWall={splitWall}
            onActivateSeat={switchSeat}
          />
          <Toolbar
            step={step}
            mode={mode}
            placeModel={placeModel}
            theme={theme}
            onTool={applyTool}
            onPlaceSpeaker={startPlacing}
            onTheme={setTheme}
            onResetView={() => setResetViewToken((n) => n + 1)}
            canUndo={histFor(store.activeId).past.length > 0}
            canRedo={histFor(store.activeId).future.length > 0}
            onUndo={undoScene}
            onRedo={redoScene}
          />
          <p className="mode-hint">{MODE_HINT[mode]}</p>
          {showStarter && (
            <div className="stage-starter" role="region" aria-label="Start your room">
              <h2>Start your room</h2>
              <p>Every layout begins with walls. Pick a way in:</p>
              <button
                type="button"
                className="btn btn-primary btn-block starter-btn"
                onClick={() => setDialog({ kind: 'room-size', purpose: 'add-room' })}
              >
                <Icon name="rectangle" size={16} />
                <span>
                  <strong>Rectangular room</strong>
                  <small>Just give width × depth</small>
                </span>
              </button>
              <button type="button" className="btn btn-block starter-btn" onClick={() => applyTool('wall')}>
                <Icon name="wall" size={16} />
                <span>
                  <strong>Draw the walls</strong>
                  <small>Corner by corner, snaps to the grid</small>
                </span>
              </button>
              <button type="button" className="btn btn-block starter-btn" onClick={() => addLayout('apartment')}>
                <Icon name="home" size={16} />
                <span>
                  <strong>Maple Court apartment</strong>
                  <small>The digitized sample floorplan</small>
                </span>
              </button>
            </div>
          )}
          {optimizeOpen && (
            <OptimizeDialog
              proposal={proposal}
              defaultMode={settings.tvAnchor ? 'cinema' : 'music'}
              rooms={(scene.rooms ?? []).map((r) => ({ id: r.id, name: r.name, at: r.at }))}
              onRun={runOptimizer}
              onApply={applyProposal}
              onClose={() => {
                setOptimizeOpen(false);
                setProposal(null);
              }}
            />
          )}
          {arrangeOpen && (
            <ArrangeDialog
              proposal={furnitureProposal}
              onSuggestInventory={() => suggestInventory(scene)}
              onRun={runArrange}
              onApply={applyArrange}
              onClose={() => {
                setArrangeOpen(false);
                setFurnitureProposal(null);
              }}
            />
          )}
          {wallProposal && (
            <div className="optimize-dialog" role="dialog" aria-label="Detected layout">
              <h2>Detected layout</h2>
              <p className="card-sub">
                Found <strong>{wallProposal.length} walls</strong>
                {' — '}
                {wallProposal
                  .reduce(
                    (sum, w) => (w.kind === 'wall' ? sum + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) : sum),
                    0,
                  )
                  .toFixed(1)}{' '}
                m of them, shown as ghost lines over your floorplan. Does this look right?
              </p>
              <p className="card-sub">
                Lengths come from the current image scale — if they look off, discard, calibrate the
                scale, and detect again.
              </p>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ok" onClick={acceptDetection}>
                  <Icon name="check" size={13} />
                  Use this layout
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setWallProposal(null);
                    applyTool('wall');
                  }}
                >
                  <Icon name="wall" size={13} />
                  Trace instead
                </button>
                <button type="button" className="btn" onClick={() => setWallProposal(null)}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="sidebar" aria-label="Panels">
          {step !== 'analyze' && (
            <GuidePanel
              step={step}
              hasWalls={hasWalls}
              rooms={scene.rooms ?? []}
              onCreateRoom={() => applyTool('room')}
              onDeleteRoom={deleteRoom}
              onInsertRectRoom={() => setDialog({ kind: 'room-size', purpose: 'add-room' })}
              onDrawWalls={() => applyTool('wall')}
            />
          )}
          {step === 'build' && (
            <UnderlayCard
              scene={scene}
              onUnderlay={setUnderlay}
              onCalibrate={() => applyTool(mode === 'calibrate' ? 'select' : 'calibrate')}
              calibrating={mode === 'calibrate'}
              onDetect={runDetection}
              detecting={detecting}
              onError={(m) => showToast(m, { tone: 'bad' })}
            />
          )}
          {step === 'furnish' && (
            <FurniturePalette
              onAddPreset={addPreset}
              onCustomBox={() => applyTool('rect')}
              onCustomCircle={() => applyTool('circle')}
              onArrange={() => {
                setArrangeOpen(true);
                setFurnitureProposal(null);
              }}
            />
          )}
          {(step === 'sound' || step === 'analyze') && (
            <SpeakersCard
              scene={scene}
              trace={trace}
              selection={selection}
              onSelect={(id) => setSelection({ type: 'speaker', id })}
              onAddModel={startPlacing}
              onMatchVolumes={matchVolumes}
            />
          )}
          {(step === 'sound' || step === 'analyze') && (
            <ListenerCard
              scene={scene}
              selection={selection}
              onSwitch={switchSeat}
              onAdd={addSeat}
              onRename={renameSeat}
              onRemove={removeSeat}
              onCompare={openCompare}
            />
          )}
          {(step === 'sound' || step === 'analyze') && (
            <MetricsPanel
              audio={audio}
              trace={trace}
              speakerCount={scene.speakers.length}
              tvAnchor={settings.tvAnchor}
              onSuggest={() => {
                setOptimizeOpen(true);
                setProposal(null);
              }}
            />
          )}
          <InspectorPanel
            scene={scene}
            selection={selection}
            onUpdateObject={updateObject}
            onDeleteObject={deleteObject}
            onUpdateSpeaker={updateSpeaker}
            onDeleteSpeaker={deleteSpeaker}
            onSetPair={setPairForSpeaker}
            onUpdateListener={updateListener}
            onSplitWall={splitWall}
            onDeleteMulti={(objectIds, speakerIds) => {
              setScene((s) => ({
                ...s,
                objects: s.objects.filter((o) => !objectIds.includes(o.id)),
                speakers: s.speakers.filter((sp) => !speakerIds.includes(sp.id)),
                pairs: s.pairs.filter(([a, b]) => !speakerIds.includes(a) && !speakerIds.includes(b)),
              }));
              setSelection(null);
              const n = objectIds.length + speakerIds.length;
              showToast(`Deleted ${n} item${n === 1 ? '' : 's'}`, {
                action: { label: 'Undo', run: undoScene },
              });
            }}
          />
          {step === 'analyze' && (
            <>
              <ControlsCard settings={settings} onChange={setSettings} />
              <Echogram trace={trace} scene={scene} />
            </>
          )}
        </aside>
      </main>

      {dialog?.kind === 'room-size' && (
        <RoomSizeDialog
          title={dialog.purpose === 'layout' ? 'New rectangular room' : 'Add a room'}
          submitLabel={dialog.purpose === 'layout' ? 'Create room' : 'Add room'}
          askName={dialog.purpose === 'add-room' ? { label: 'Room name', placeholder: 'Kitchen, Bedroom…' } : undefined}
          onSubmit={(w, d, name) => (dialog.purpose === 'layout' ? addRoomLayout(w, d) : addRoom(w, d, name ?? ''))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'room-name' && (
        <RenameDialog
          name=""
          title="Name this room"
          fieldLabel="Room name"
          submitLabel="Create room"
          placeholder="Kitchen, Bedroom…"
          onSubmit={commitRoomZone}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          name={store.layouts.find((l) => l.id === dialog.layoutId)?.name ?? ''}
          onSubmit={(name) => renameLayout(dialog.layoutId, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {galleryOpen && (
        <LayoutGallery
          layouts={store.layouts}
          activeId={store.activeId}
          onOpen={(id) => {
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
          onRename={(id) => setDialog({ kind: 'rename', layoutId: id })}
          onDuplicate={duplicateLayout}
          onExport={exportLayout}
          onExportAll={exportAll}
          onCompare={canCompare ? openCompare : undefined}
          onDelete={deleteLayout}
          onClose={() => setGalleryOpen(false)}
        />
      )}
      {compare && (
        <ScenarioCompare
          layouts={store.layouts}
          initialLeft={compare.left}
          initialRight={compare.right}
          onClose={() => setCompare(null)}
        />
      )}
      {dialog?.kind === 'calibrate' && (
        <CalibrateDialog
          measured={dialog.measured}
          onSubmit={(real) => applyCalibration(dialog.measured, real)}
          onClose={() => setDialog(null)}
        />
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
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
