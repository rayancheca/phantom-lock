import type { Scene, SceneObject, Selection, Vec2 } from '../../engine/types';
import { sceneListeners } from '../../engine/scene';
import { SPEAKER_MODELS } from '../../engine/speakers';

/**
 * Deterministic traversal over every selectable scene entity (S7 / deliverable 1).
 *
 * Before this module the ONLY keyboard-reachable entities were speakers (via the
 * SpeakersCard list) and the active seat; walls, furniture, the TV, doors,
 * windows and non-active seats could be selected by pointer hit-testing alone —
 * a WCAG 2.1.1 failure on the app's core workflow. `n` / `Shift+N` walk this
 * order, so everything the canvas draws is reachable without a mouse.
 *
 * Pure + DOM-free (mirrors keyboard.ts / mode.ts / verdict.ts). The order must be
 * STABLE — a user cycling with `n` should not have entries move under them
 * because an edit reordered `scene.objects` — so nothing here depends on array
 * insertion order.
 */

export type CycleKind = 'listener' | 'speaker' | 'object';

export interface CycleEntry {
  kind: CycleKind;
  id: string;
  /** Spoken/visible name, e.g. "Seat Bed, active" or "Wall, 3.20 m". */
  label: string;
}

/** Where an object "is", for reading-order purposes. A wall's midpoint (not an
 *  endpoint) so a long wall sorts by its centre of mass like everything else. */
function anchorOf(o: SceneObject): Vec2 {
  return o.kind === 'wall' ? { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 } : o.center;
}

/** A human label that distinguishes two adjacent items of the same kind. */
function labelOf(o: SceneObject): string {
  if (o.kind === 'wall') {
    const len = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y);
    return `${o.label}, ${len.toFixed(2)} m`;
  }
  if (o.kind === 'circle') return `${o.label}, ${(o.r * 2).toFixed(2)} m across`;
  return `${o.label}, ${o.w.toFixed(2)} by ${o.h.toFixed(2)} m`;
}

/**
 * The full traversal order: seats, then speakers, then objects in reading order.
 *
 * Positions are rounded to the centimetre before comparing so float noise cannot
 * reorder two items, and every comparison falls back to `id` so the order is
 * total (and therefore reproducible across renders and machines).
 */
export function cycleOrder(scene: Scene): CycleEntry[] {
  // Defensive: a hand-built scene may carry neither `listeners` nor `listener`.
  const seats = scene.listener || scene.listeners?.length ? sceneListeners(scene) : [];

  const seatEntries: CycleEntry[] = seats.map((s) => ({
    kind: 'listener',
    id: s.id,
    label: `Seat ${s.name}${s.id === scene.activeListenerId ? ', active' : ''}`,
  }));

  const speakerEntries: CycleEntry[] = [...scene.speakers]
    .sort((a, b) => a.label.localeCompare(b.label, 'en') || a.id.localeCompare(b.id))
    .map((s) => ({
      kind: 'speaker',
      id: s.id,
      label: `${s.label}, ${SPEAKER_MODELS[s.model]?.name ?? s.model}`,
    }));

  const objectEntries: CycleEntry[] = [...scene.objects]
    .sort((a, b) => {
      const pa = anchorOf(a);
      const pb = anchorOf(b);
      return (
        Math.round(pa.y * 100) - Math.round(pb.y * 100) ||
        Math.round(pa.x * 100) - Math.round(pb.x * 100) ||
        a.id.localeCompare(b.id)
      );
    })
    .map((o) => ({ kind: 'object', id: o.id, label: labelOf(o) }));

  return [...seatEntries, ...speakerEntries, ...objectEntries];
}

/** The id the current selection points at, in `cycleOrder` terms. A
 *  `{type:'listener'}` selection carries no id by design (the union has no seat
 *  slot), so it resolves through the scene's `activeListenerId` when a scene is
 *  supplied, and otherwise through the first seat in the order — never to
 *  "nowhere", which would silently restart the cycle at every seat. */
function currentId(
  sel: Selection,
  order: readonly CycleEntry[],
  scene?: Scene,
): string | null {
  if (!sel) return null;
  if (sel.type === 'multi') return null;
  if (sel.type === 'listener') {
    return scene?.activeListenerId ?? order.find((e) => e.kind === 'listener')?.id ?? null;
  }
  return sel.id;
}

/**
 * The entry after (`dir` 1) or before (`dir` -1) the current selection, wrapping
 * at both ends. Falls back to the first entry whenever the selection has no
 * position in the order — null, a multi-selection, or an id that has since been
 * deleted — so `n` always does something predictable.
 */
export function stepCycle(
  order: readonly CycleEntry[],
  sel: Selection,
  dir: 1 | -1,
  scene?: Scene,
): CycleEntry | null {
  if (order.length === 0) return null;
  const id = currentId(sel, order, scene);
  const i = id === null ? -1 : order.findIndex((e) => e.id === id);
  if (i === -1) return order[0];
  return order[(i + dir + order.length) % order.length];
}

/** CycleEntry -> Selection. `{type:'listener'}` has no id slot in the union. */
export function selectionForEntry(e: CycleEntry): Selection {
  if (e.kind === 'listener') return { type: 'listener' };
  if (e.kind === 'speaker') return { type: 'speaker', id: e.id };
  return { type: 'object', id: e.id };
}

/** "Wall, 3.20 m, 7 of 24" — the spoken position for the live announcer, so a
 *  screen-reader user knows both what is selected and where they are. */
export function describePosition(order: readonly CycleEntry[], e: CycleEntry): string {
  const i = order.findIndex((x) => x.id === e.id);
  return i === -1 ? e.label : `${e.label}, ${i + 1} of ${order.length}`;
}
