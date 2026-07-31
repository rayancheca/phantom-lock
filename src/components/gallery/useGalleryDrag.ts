import { useCallback, useEffect, useRef, useState } from 'react';
import {
  caretRect,
  dragArmed,
  resolveDrop,
  type DropIntent,
  type ItemRect,
  type Point,
} from './drag';

/**
 * The gallery's pick-up-and-move state machine (S29).
 *
 * ONE machine, TWO input methods, and that is a WCAG requirement rather than a
 * nicety. SC 2.5.7 "Dragging Movements" (AA) is explicit that the alternative to
 * a drag must work "by a single pointer without dragging" — so a keyboard path
 * alone satisfies SC 2.1.1 and NOT 2.5.7. MOVE MODE is therefore the canonical
 * mechanism: it is entered from a menu item (a click or a tap), driven by arrow
 * keys or by clicking a destination, and dragging is a third accelerator layered
 * on top that produces exactly the same commits.
 *
 * All geometry lives in the pure `drag.ts`. This file owns only the parts that
 * genuinely need the DOM: measuring rects, capturing the pointer, and moving the
 * ghost.
 */

export type ItemKind = 'layout' | 'project';
export interface DragSubject {
  kind: ItemKind;
  id: string;
  name: string;
}

export interface GhostState {
  /** Offset within `.gallery-layer`, NOT the viewport — see the note below. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GalleryDrag {
  /** The item being moved, by either input method, or null. */
  subject: DragSubject | null;
  /** True only for a POINTER drag (a ghost is following the finger). */
  dragging: boolean;
  /** True only for keyboard/click move mode. */
  moving: boolean;
  intent: DropIntent;
  ghost: GhostState | null;
  caret: { x: number; top: number; height: number } | null;
  /** Register a grid item's element so its rect can be measured on demand. */
  register: (key: string, el: HTMLElement | null) => void;
  /** `onPointerDown` for an item's draggable surface. */
  onItemPointerDown: (subject: DragSubject, e: React.PointerEvent) => void;
  beginMove: (subject: DragSubject) => void;
  /** Arrow-key stepping in move mode. Returns false when it did not handle the key. */
  stepMove: (key: string) => boolean;
  commitMove: () => void;
  cancel: () => void;
}

export interface DropCommit {
  subject: DragSubject;
  intent: DropIntent;
}

interface Args {
  /** Display order of the container currently on screen. */
  items: Array<{ kind: ItemKind; id: string }>;
  /** The element the ghost is positioned inside (`.gallery-layer`). */
  layerRef: React.RefObject<HTMLElement | null>;
  onCommit: (c: DropCommit) => void;
  /** Narrated to the live region on every meaningful change. */
  announce: (message: string) => void;
  describe: (intent: DropIntent, subject: DragSubject) => string;
}

const keyOf = (kind: ItemKind, id: string) => `${kind}:${id}`;
const GRID_GAP_PX = 16;

export function useGalleryDrag(a: Args): GalleryDrag {
  const [subject, setSubject] = useState<DragSubject | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moving, setMoving] = useState(false);
  const [intent, setIntent] = useState<DropIntent>({ kind: 'none' });
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [caret, setCaret] = useState<{ x: number; top: number; height: number } | null>(null);

  const els = useRef(new Map<string, HTMLElement>());
  const press = useRef<{
    subject: DragSubject;
    at: Point;
    startedAt: number;
    coarse: boolean;
    armed: boolean;
    pointerId: number;
    target: HTMLElement;
    grab: Point;
    size: { width: number; height: number };
  } | null>(null);
  // The commit callback is read through a ref: the window listeners below are
  // installed once per gesture and must not be torn down and rebuilt whenever a
  // parent re-renders mid-drag.
  const live = useRef(a);
  live.current = a;

  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  }, []);

  /** Measure the container's items, in display order. */
  const measure = useCallback((): ItemRect[] => {
    const out: ItemRect[] = [];
    live.current.items.forEach((it, index) => {
      const el = els.current.get(keyOf(it.kind, it.id));
      if (!el) return;
      const r = el.getBoundingClientRect();
      out.push({
        kind: it.kind,
        id: it.id,
        index,
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      });
    });
    return out;
  }, []);

  const clear = useCallback(() => {
    press.current = null;
    setSubject(null);
    setDragging(false);
    setMoving(false);
    setGhost(null);
    setCaret(null);
    setIntent({ kind: 'none' });
  }, []);

  /**
   * `.gallery-layer` carries `backdrop-filter`, which establishes a CONTAINING
   * BLOCK for `position: fixed` descendants — measured. So both the ghost and the
   * caret are positioned relative to the LAYER, and raw viewport coordinates from
   * `getBoundingClientRect` must have the layer's own origin subtracted or
   * everything is offset by however far down the page the layer starts.
   */
  const layerOrigin = useCallback((): Point => {
    const el = live.current.layerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }, []);

  const applyIntent = useCallback((next: DropIntent, subj: DragSubject, rects: ItemRect[]) => {
    setIntent((prev) => {
      const same =
        prev.kind === next.kind &&
        (prev as { targetId?: string }).targetId === (next as { targetId?: string }).targetId &&
        (prev as { projectId?: string }).projectId === (next as { projectId?: string }).projectId &&
        (prev as { index?: number }).index === (next as { index?: number }).index;
      if (!same) live.current.announce(live.current.describe(next, subj));
      return same ? prev : next;
    });
    if (next.kind !== 'slot') {
      setCaret(null);
      return;
    }
    const raw = caretRect(
      next.index,
      rects.filter((r) => !(r.kind === subj.kind && r.id === subj.id)),
      GRID_GAP_PX,
    );
    const o = layerOrigin();
    setCaret(raw ? { x: raw.x - o.x, top: raw.top - o.y, height: raw.height } : null);
  }, [layerOrigin]);

  // --- pointer -------------------------------------------------------------

  const onItemPointerDown = useCallback(
    (subj: DragSubject, e: React.PointerEvent) => {
      // Secondary buttons open context menus; never start a gesture on one.
      if (e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      press.current = {
        subject: subj,
        at: { x: e.clientX, y: e.clientY },
        startedAt: performance.now(),
        coarse: e.pointerType !== 'mouse',
        armed: false,
        pointerId: e.pointerId,
        target,
        // Where in the card the user grabbed, so the ghost does not jump to have
        // its corner under the finger.
        grab: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        size: { width: rect.width, height: rect.height },
      };
    },
    [],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const point = { x: e.clientX, y: e.clientY };
      if (!p.armed) {
        if (!dragArmed(p.at, point, performance.now() - p.startedAt, p.coarse)) return;
        p.armed = true;
        // Capture so the gesture survives the pointer leaving the card. NOTE:
        // capture RETARGETS every later event to this element, so hit-testing
        // below must use the pure geometry, never `e.target`.
        try {
          p.target.setPointerCapture(p.pointerId);
        } catch {
          // Capture is an optimisation, not a requirement — the window listeners
          // still see the gesture. A failure here must not abort the drag.
        }
        setSubject(p.subject);
        setDragging(true);
        live.current.announce(`Moving ${p.subject.name}. Drop on a design to make a folder.`);
      }
      e.preventDefault();
      const origin = layerOrigin();
      setGhost({
        x: point.x - p.grab.x - origin.x,
        y: point.y - p.grab.y - origin.y,
        width: p.size.width,
        height: p.size.height,
      });
      const rects = measure();
      applyIntent(resolveDrop(point, rects, p.subject), p.subject, rects);
    };

    const up = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const armed = p.armed;
      const subj = p.subject;
      try {
        p.target.releasePointerCapture(p.pointerId);
      } catch {
        // Already released (or never captured) — nothing to undo.
      }
      press.current = null;
      if (!armed) return; // a plain click; the card's own onClick runs
      // Swallow the click the browser is about to synthesise for THIS gesture,
      // and only that one.
      //
      // A flag consulted by each card cannot do this: a merge REMOVES the
      // dragged card from the DOM, so the click never arrives, the flag stays
      // set, and the next click on any item — the new folder tile, typically —
      // is silently eaten. Found by driving the real browser; jsdom cannot
      // produce the click-after-pointerup sequence at all.
      //
      // `click` is dispatched synchronously with the same input batch, so a
      // macrotask is guaranteed to run after it and never before.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      const rects = measure();
      const finalIntent = resolveDrop({ x: e.clientX, y: e.clientY }, rects, subj);
      clear();
      live.current.onCommit({ subject: subj, intent: finalIntent });
    };

    const cancelled = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const armed = p.armed;
      press.current = null;
      if (armed) {
        clear();
        live.current.announce('Move cancelled.');
      }
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelled);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelled);
    };
  }, [applyIntent, clear, layerOrigin, measure]);

  // --- move mode (the SC 2.5.7 path) --------------------------------------

  const beginMove = useCallback(
    (subj: DragSubject) => {
      setSubject(subj);
      setMoving(true);
      setDragging(false);
      const start = live.current.items.findIndex((i) => i.kind === subj.kind && i.id === subj.id);
      const next: DropIntent = { kind: 'slot', index: Math.max(0, start) };
      setIntent(next);
      live.current.announce(
        `Moving ${subj.name}. Arrow keys choose a place, Enter drops it, Escape cancels.`,
      );
    },
    [],
  );

  const stepMove = useCallback(
    (key: string): boolean => {
      if (!moving || !subject) return false;
      const others = live.current.items.filter(
        (i) => !(i.kind === subject.kind && i.id === subject.id),
      );
      const max = others.length;
      const cur = intent.kind === 'slot' ? intent.index : 0;
      let next: DropIntent | null = null;
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        next = { kind: 'slot', index: Math.min(max, cur + 1) };
      } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        next = { kind: 'slot', index: Math.max(0, cur - 1) };
      } else if (key === 'Home') {
        next = { kind: 'slot', index: 0 };
      } else if (key === 'End') {
        next = { kind: 'slot', index: max };
      } else if (key === 'Enter' || key === ' ') {
        return false; // the caller commits
      } else if (key.toLowerCase() === 'f') {
        // Put it INTO whatever currently occupies the slot — the keyboard
        // equivalent of dropping onto an icon. Without this, move mode can
        // reorder but can never make a folder, and the pointer path would be the
        // only way to reach half the feature.
        const at = others[Math.min(cur, others.length - 1)];
        if (!at) return true;
        next =
          at.kind === 'project'
            ? { kind: 'absorb', projectId: at.id }
            : subject.kind === 'layout'
              ? { kind: 'merge', targetId: at.id }
              : { kind: 'slot', index: cur };
      }
      if (!next) return false;
      setIntent(next);
      live.current.announce(live.current.describe(next, subject));
      return true;
    },
    [intent, moving, subject],
  );

  const commitMove = useCallback(() => {
    if (!moving || !subject) return;
    const subj = subject;
    const it = intent;
    clear();
    live.current.onCommit({ subject: subj, intent: it });
  }, [clear, intent, moving, subject]);

  const cancel = useCallback(() => {
    if (!subject && !press.current) return;
    press.current = null;
    clear();
    live.current.announce('Move cancelled.');
  }, [clear, subject]);

  return {
    subject,
    dragging,
    moving,
    intent,
    ghost,
    caret,
    register,
    onItemPointerDown,
    beginMove,
    stepMove,
    commitMove,
    cancel,
  };
}
