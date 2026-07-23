export interface Vec2 {
  x: number;
  y: number;
}

/** A free-standing wall segment. Both faces reflect. */
export interface WallObj {
  id: string;
  kind: 'wall';
  a: Vec2;
  b: Vec2;
  /** Fraction of energy absorbed per bounce, 0..1 */
  absorption: number;
  label: string;
  /** Top of the wall above the floor, metres. Full-height walls block everything. */
  height: number;
}

/** Rotatable rectangular object (furniture, counters, the TV…). */
export interface RectObj {
  id: string;
  kind: 'rect';
  center: Vec2;
  w: number;
  h: number;
  /** Radians, canvas convention (positive = clockwise with y-down). */
  rotation: number;
  absorption: number;
  label: string;
  /** 'tv' anchors the phantom-center axis; 'window'/'door' snap onto walls
      and cut a real opening into them. */
  role: 'furniture' | 'tv' | 'window' | 'door';
  /** Doors only: open lets sound through the doorway; closed blocks like wood. */
  doorOpen?: boolean;
  /** Doors only: leaf swing in degrees, 0..180 (default 90). PLAN SYMBOL ONLY —
      the drawn clearance the leaf needs; NO acoustic effect (the engine never
      reads it; `doorOpen` is the sole acoustic switch). */
  swingDeg?: number;
  /** Doors only: which jamb the door is hinged on — 'start' = the a-ward (−w/2)
      end (default), 'end' = the b-ward end. Plan-only. */
  hingeEnd?: 'start' | 'end';
  /** Doors only: which side the leaf swings toward — 'in' = the current
      subtract direction (default), 'out' = the opposite. Plan-only. */
  swingSide?: 'in' | 'out';
  /** Top of the object above the floor, metres. Sound passes over low furniture. */
  height: number;
}

/** Round object (dining table, column…). */
export interface CircleObj {
  id: string;
  kind: 'circle';
  center: Vec2;
  r: number;
  absorption: number;
  label: string;
  height: number;
}

export type SceneObject = WallObj | RectObj | CircleObj;

export type SpeakerModel = 'homepod' | 'homepod-mini';

export interface SpeakerObj {
  id: string;
  pos: Vec2;
  /** Acoustic centre above the floor, metres (shelf/stand height). */
  z: number;
  label: string;
  model: SpeakerModel;
  /** Manual volume trim, dB (0 = model default output). */
  trimDb: number;
}

export interface ListenerState {
  pos: Vec2;
  /** Ear height above the floor, metres (sitting ≈ 1.2, standing ≈ 1.7, lying ≈ 0.8). */
  z: number;
}

/**
 * A named listening position (seat) — e.g. "Couch", "Bed". A scene keeps one or
 * more of these; the active one is mirrored into `Scene.listener` so every
 * existing read-site keeps working unchanged.
 */
export interface NamedListener extends ListenerState {
  id: string;
  name: string;
}

/** An imported floorplan image used as a tracing underlay. */
export interface Underlay {
  /** Downscaled data-URL of the image. */
  src: string;
  wPx: number;
  hPx: number;
  center: Vec2;
  /** Metres per image pixel. */
  scale: number;
  /** Radians. */
  rotation: number;
  opacity: number;
}

/** A named room zone — an area of the plan marked as “Kitchen”, “Bedroom”…
 *  (Roomba-map style). Older data may carry only the anchor point. */
export interface RoomLabel {
  id: string;
  name: string;
  at: Vec2;
  w?: number;
  h?: number;
}

export interface Scene {
  objects: SceneObject[];
  speakers: SpeakerObj[];
  /** Stereo pairs as [speakerIdA, speakerIdB]; a speaker belongs to at most one pair. */
  pairs: Array<[string, string]>;
  /**
   * The active seat, mirrored. ALWAYS equals the active `listeners` entry's
   * {pos,z}. Maintained by `sanitizeScene` + the scene write helpers; every
   * engine read-site consumes this, so tracer and verdict can never disagree.
   * Treat as read-only — write through the scene helpers, never assign directly.
   */
  listener: ListenerState;
  /**
   * Named listening positions (seats). Optional so hand-built test scenes that
   * only set `listener` still type-check; `sanitizeScene` and every constructor
   * always populate it with ≥1 seat for real data.
   */
  listeners?: NamedListener[];
  /** Id of the active entry in `listeners`. */
  activeListenerId?: string;
  underlay?: Underlay | null;
  rooms?: RoomLabel[];
}

export interface SimSettings {
  /** Rays emitted per speaker (360 minimum). */
  rayCount: number;
  /** Reflections per ray. */
  maxBounces: number;
  /** Visual distance-decay factor (per metre). */
  decay: number;
  /** How the sound field is drawn: reflected rays, 1 ms wavefronts, or hidden. */
  display: 'rays' | 'waves' | 'off';
  showTriangle: boolean;
  /** Live best-listening-spot search overlay. */
  showBestSpot: boolean;
  snap: boolean;
  /** Cinema semantics: the phantom center must sit on the TV (lock gate).
      Off for music — the image anchors on you, not the screen. */
  tvAnchor: boolean;
}

export interface Layout {
  id: string;
  name: string;
  scene: Scene;
  settings: SimSettings;
  updatedAt: number;
}

export interface LayoutStore {
  layouts: Layout[];
  activeId: string;
}

/** Flattened collision primitive used by the tracer. */
export type Surface =
  | { type: 'seg'; a: Vec2; b: Vec2; absorption: number; height: number; objectId: string }
  | { type: 'circle'; c: Vec2; r: number; absorption: number; height: number; objectId: string };

export interface RayPath {
  /** n+1 points → n segments. */
  points: Vec2[];
  /** Energy while travelling segment i. */
  energy: number[];
  /** Cumulative distance travelled at the start of segment i. */
  cumDist: number[];
}

export interface Arrival {
  timeMs: number;
  amp: number;
  /** Number of bounces before reaching the listener (0 = direct). */
  order: number;
}

export interface SpeakerTrace {
  paths: RayPath[];
  arrivals: Arrival[];
}

export interface DirectPath {
  /** Horizontal (floor-plan) distance, metres. */
  distance: number;
  /** True 3D distance including the speaker/ear height difference. */
  distance3d: number;
  blocked: boolean;
  /** Energy fraction surviving grazes over low furniture along the path, 0..1. */
  attenuation: number;
}

export interface SpeakerResult {
  id: string;
  trace: SpeakerTrace;
  direct: DirectPath;
}

export interface TraceResult {
  bySpeaker: SpeakerResult[];
}

export type ToolMode =
  | 'select'
  | 'wall'
  | 'rect'
  | 'circle'
  | 'speaker'
  | 'calibrate'
  | 'room'
  | 'marquee'
  | 'lasso'
  /** DESIGN/Build: click a wall to cut a door (⇧-click = window). */
  | 'opening';

export type Selection =
  | { type: 'object'; id: string }
  | { type: 'speaker'; id: string }
  | { type: 'listener' }
  | { type: 'multi'; objectIds: string[]; speakerIds: string[] }
  | null;
