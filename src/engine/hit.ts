import type { Scene, SceneObject, Selection, Vec2 } from './types';
import { distPointSegment, pointInRect } from './geometry';
import { activeListener, sceneListeners } from './scene';
import * as v from './vec';

/** Grab radius for the speaker / listener pucks, metres. */
export const NODE_RADIUS = 0.24;

export function hitTestNodes(scene: Scene, p: Vec2, tol: number): Selection {
  const r = Math.max(NODE_RADIUS, tol);
  if (v.dist(p, scene.listener.pos) <= r) return { type: 'listener' };
  // Later-added speakers draw on top — hit-test in reverse.
  for (let i = scene.speakers.length - 1; i >= 0; i--) {
    if (v.dist(p, scene.speakers[i].pos) <= r) return { type: 'speaker', id: scene.speakers[i].id };
  }
  return null;
}

/** Id of an INACTIVE named seat under the point (for click-to-activate), or null.
 *  The active seat is handled by `hitTestNodes` as the draggable "YOU" puck. */
export function hitInactiveSeat(scene: Scene, p: Vec2, tol: number): string | null {
  const r = Math.max(NODE_RADIUS, tol);
  const activeId = activeListener(scene).id;
  const seats = sceneListeners(scene);
  // Reverse so the topmost-drawn seat wins when two overlap.
  for (let i = seats.length - 1; i >= 0; i--) {
    if (seats[i].id !== activeId && v.dist(p, seats[i].pos) <= r) return seats[i].id;
  }
  return null;
}

function hitsObject(o: SceneObject, p: Vec2, tol: number): boolean {
  if (o.kind === 'wall') return distPointSegment(p, o.a, o.b) <= Math.max(tol, 0.08);
  if (o.kind === 'rect') {
    // Doors/windows are centimetres thin and sit ON a wall line — give them a
    // fat grab zone or the wall underneath steals every click.
    if (o.role === 'door' || o.role === 'window') {
      return pointInRect(p, { ...o, w: o.w + 0.2, h: Math.max(o.h, 0.5) });
    }
    return pointInRect(p, o);
  }
  return v.dist(p, o.center) <= o.r + tol * 0.5;
}

/** Topmost object wins — but wall openings outrank everything so they stay
 *  selectable (and deletable) on top of their wall. */
export function hitTestObjects(scene: Scene, p: Vec2, tol: number): Selection {
  for (let i = scene.objects.length - 1; i >= 0; i--) {
    const o = scene.objects[i];
    if (o.kind === 'rect' && (o.role === 'door' || o.role === 'window') && hitsObject(o, p, tol)) {
      return { type: 'object', id: o.id };
    }
  }
  for (let i = scene.objects.length - 1; i >= 0; i--) {
    const o = scene.objects[i];
    if (hitsObject(o, p, tol)) return { type: 'object', id: o.id };
  }
  return null;
}
