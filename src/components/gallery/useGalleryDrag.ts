import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  caretRect,
  dragArmed,
  fallbackIndex,
  focusPlanFor,
  maxStepIndex,
  resolveDrop,
  toDisplayIndex,
  toStepIndex,
  type DropIntent,
  type ExitTarget,
  type FocusPlan,
  type FocusTarget,
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
  /**
   * A pointer is down on an item but has not yet armed into a drag.
   *
   * Exposed because Escape must cancel it: the hook's own `cancel()` already
   * guards on `subject || press.current`, and without this the gallery's Escape
   * ladder saw only `subject` — so Escape during an un-armed press inside a
   * folder took the leave-folder rung and left a live press pointing at a card
   * in a container that is no longer on screen.
   */
  pressed: boolean;
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
  /** Commit move mode against an intent chosen by a click rather than by keys. */
  commitOn: (intent: DropIntent) => void;
  cancel: () => void;
  /** Ask for focus to be re-homed after a commit the hook did not make. */
  requestFocus: (plan: FocusPlan) => void;
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
  /**
   * The breadcrumb, when the gallery is drilled into a folder — the drop target
   * that takes a design OUT. Null on the home grid, which is what makes the
   * `exit` intent unconstructible there rather than merely refused.
   */
  exitRef: React.RefObject<HTMLElement | null>;
  /** Where a design leaving the current folder lands: the home project's id. */
  exitProjectId: string;
  /**
   * Last-resort focus holder: a control always mounted in the CURRENT view and
   * never disabled.
   */
  fallbackRef: React.RefObject<HTMLElement | null>;
  /**
   * Perform the commit, and return the id of a project it CREATED (a merge),
   * else null.
   *
   * The hook turns that into the focus plan, so neither input path can forget
   * it — the S29 mirror lesson made structural instead of remembered.
   */
  onCommit: (c: DropCommit) => string | null;
  /** False inside a drilled-in folder: the model is FLAT, so a merge there would
   *  yank both designs OUT onto the home grid. Measured before it shipped. */
  canMerge: boolean;
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
  /** Mirrors `press.current !== null` into render, for the Escape ladder. */
  const [pressed, setPressed] = useState(false);
  /**
   * The last STEP index move mode pointed at.
   *
   * Kept so that an arrow key after an `f`/`o` returns to where the user was
   * aiming. Without it the fallback was 0, which teleported the caret to the
   * front of the grid on a perfectly ordinary two-key sequence.
   */
  const lastStep = useRef(0);
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

  /** The breadcrumb, measured, or undefined when there is no folder open. */
  const exitTarget = useCallback((): ExitTarget | undefined => {
    const el = live.current.exitRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return {
      projectId: live.current.exitProjectId,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    };
  }, []);

  const clear = useCallback(() => {
    press.current = null;
    setPressed(false);
    setSubject(null);
    setDragging(false);
    setMoving(false);
    setGhost(null);
    setCaret(null);
    setIntent({ kind: 'none' });
  }, []);

  // --- focus after a commit -------------------------------------------------
  //
  // Every commit destroys the element that holds focus, so without this a drop
  // ends with `document.activeElement === document.body` and a keyboard user is
  // returned to the top of the document. The PLAN is pure (`drag.ts`); this is
  // only the part that needs the DOM.

  // A fresh WRAPPER object per request is what makes the effect fire. Putting
  // the plan straight into state would make two identical plans `===`, React
  // would bail out of the update, and focus would silently not move.
  const [focusReq, setFocusReq] = useState<{ plan: FocusPlan } | null>(null);
  const requestFocus = useCallback((plan: FocusPlan) => setFocusReq({ plan }), []);

  const focusItem = useCallback((t: FocusTarget): boolean => {
    const el = els.current.get(keyOf(t.kind, t.id));
    const btn = el?.querySelector<HTMLElement>('.gallery-open');
    if (!btn || !btn.isConnected) return false;
    // Already there: do nothing. A redundant `focus()` is not free — it scrolls
    // the `overflow-y: auto` grid to the element, so on the plain-reorder path
    // (where React has already restored focus itself) it would yank the view.
    if (document.activeElement === btn) return true;
    btn.focus();
    // `focus()` on a hidden or disabled node is a silent no-op, so the caller
    // must be told whether it actually landed rather than assuming.
    return document.activeElement === btn;
  }, []);

  /**
   * `useLayoutEffect`, not `useEffect`.
   *
   * MEASURED: React saves the active element before the mutation phase and
   * restores it in `resetAfterCommit`, which runs before BOTH effect kinds — so
   * a layout effect is both after React's own restoration (and therefore wins)
   * and before paint (so no frame is painted with focus at `<body>`).
   *
   * ⚠️ jsdom CANNOT tell the two apart: it never paints, and RTL flushes passive
   * effects inside `act` before returning. So the tests below would pass with
   * `useEffect` too, and a later "simplification" to it would land green. The
   * reason it must not is recorded here rather than in an assertion, because
   * there is no assertion that can carry it.
   */
  useLayoutEffect(() => {
    if (!focusReq) return; // mount, and every render that is not a request
    const layer = live.current.layerRef.current;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    const inside = active instanceof HTMLElement && !!layer?.contains(active);
    // Never yank focus back from somewhere outside the gallery: by the time a
    // commit lands the user may already be somewhere else entirely.
    if (!lost && !inside) return;
    for (const t of focusReq.plan.targets) if (focusItem(t)) return;
    const items = live.current.items;
    const at = fallbackIndex(focusReq.plan.vacated, items.length);
    const item = at === null ? undefined : items[at];
    if (item && focusItem(item)) return;
    live.current.fallbackRef.current?.focus();
  }, [focusReq, focusItem]);

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
      setPressed(true);
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
      applyIntent(
        resolveDrop(point, rects, p.subject, live.current.canMerge, exitTarget()),
        p.subject,
        rects,
      );
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
      setPressed(false);
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
      const finalIntent = resolveDrop(
        { x: e.clientX, y: e.clientY },
        rects,
        subj,
        live.current.canMerge,
        exitTarget(),
      );
      // Read the vacated slot BEFORE the commit — it is where the eye is, and
      // after the commit the subject may no longer be in the list at all.
      const index = live.current.items.findIndex(
        (i) => i.kind === subj.kind && i.id === subj.id,
      );
      clear();
      const made = live.current.onCommit({ subject: subj, intent: finalIntent });
      requestFocus(focusPlanFor(subj, finalIntent, made, index));
    };

    const cancelled = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const armed = p.armed;
      press.current = null;
      setPressed(false);
      if (armed) {
        clear();
        // A touch drag that the browser reclaims for scrolling arrives here, and
        // it is the ONLY way a gesture ends without the user letting go — so
        // saying nothing would leave a screen-reader user believing the move is
        // still in progress.
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
  }, [applyIntent, clear, exitTarget, layerOrigin, measure, requestFocus]);

  // --- move mode (the SC 2.5.7 path) --------------------------------------

  const beginMove = useCallback(
    (subj: DragSubject) => {
      setSubject(subj);
      setMoving(true);
      setDragging(false);
      // FOCUS THE ITEM. Move mode is entered from a kebab MENU item, and when
      // that menu closes it returns focus to the kebab button — where the arrow
      // keys are not handled. Without this the canonical (and WCAG 2.5.7) path
      // enters a mode the user then cannot drive at all.
      focusItem({ kind: subj.kind, id: subj.id });
      const start = live.current.items.findIndex((i) => i.kind === subj.kind && i.id === subj.id);
      // Seed at the subject's OWN position, expressed in display space so the
      // caret and the commit agree with the pointer path. `toDisplayIndex` of
      // its own step index is the identity here, and is written out rather than
      // simplified so the two spaces stay visibly distinct.
      const self = Math.max(0, start);
      const next: DropIntent = { kind: 'slot', index: toDisplayIndex(toStepIndex(self, self), self) };
      setIntent(next);
      lastStep.current = toStepIndex(self, self);
      live.current.announce(
        `Moving ${subj.name}. Arrow keys choose a place, Enter drops it, Escape cancels.`,
      );
    },
    [focusItem],
  );

  const stepMove = useCallback(
    (key: string): boolean => {
      if (!moving || !subject) return false;
      const items = live.current.items;
      const others = items.filter((i) => !(i.kind === subject.kind && i.id === subject.id));
      const self = items.findIndex((i) => i.kind === subject.kind && i.id === subject.id);
      // Step through DISTINCT OUTCOMES, not display slots. Display index `self`
      // and `self + 1` are the same outcome, so stepping in display space wasted
      // the first keypress and left the last position unreachable — measured
      // against the real engine, see `drag.ts`.
      const max = maxStepIndex(items.length);
      const cur =
        intent.kind === 'slot' ? toStepIndex(intent.index, self) : lastStep.current;
      const at = (step: number): DropIntent => {
        const clamped = Math.min(max, Math.max(0, step));
        lastStep.current = clamped;
        return { kind: 'slot', index: toDisplayIndex(clamped, self) };
      };
      let next: DropIntent | null = null;
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        next = at(cur + 1);
      } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        next = at(cur - 1);
      } else if (key === 'Home') {
        next = at(0);
      } else if (key === 'End') {
        next = at(max);
      } else if (key === 'Enter' || key === ' ') {
        return false; // the caller commits
      } else if (key.toLowerCase() === 'o') {
        // The keyboard twin of dropping on the breadcrumb. It asks the SAME
        // question the pointer path asks — is there a breadcrumb to measure —
        // rather than carrying a second flag that could drift from it. On the
        // home grid there is none, so the key is NOT handled: swallowing it and
        // doing nothing would be "propose an action you cannot perform" in a
        // quieter costume, and the help text only promises it inside a folder.
        const target = exitTarget();
        if (!target || subject.kind !== 'layout') return false;
        next = { kind: 'exit', projectId: target.projectId };
      } else if (key.toLowerCase() === 'f') {
        // Put it INTO whatever currently occupies the slot — the keyboard
        // equivalent of dropping onto an icon. Without this, move mode can
        // reorder but can never make a folder, and the pointer path would be the
        // only way to reach half the feature.
        // `cur` is a step index, which is exactly a position in `others` — so
        // this is "the item at the place I am pointing at", with the append
        // position clamped back onto the last item.
        const onto = others[Math.min(cur, others.length - 1)];
        if (!onto) return true;
        // Mirrors `resolveDrop` EXACTLY, including the flat-model guard. It did
        // not, and that was the keyboard twin of the pointer bug fixed in
        // e5c0d3b: a folder subject announced "Drop to move Alpha into Beta" and
        // then committed nothing, because no branch absorbs a project. The two
        // input methods must propose the same set of actions or the canonical
        // (keyboard/menu) path is the broken one.
        next =
          subject.kind !== 'layout' || (onto.kind === 'layout' && !live.current.canMerge)
            ? at(cur)
            : onto.kind === 'project'
              ? { kind: 'absorb', projectId: onto.id }
              : { kind: 'merge', targetId: onto.id };
      }
      if (!next) return false;
      setIntent(next);
      live.current.announce(live.current.describe(next, subject));
      return true;
    },
    [exitTarget, intent, moving, subject],
  );

  /**
   * Commit move mode against an intent chosen NOW, rather than the one in state.
   *
   * A click on a destination has to set and commit in the same tick, and reading
   * `intent` there would read the stale one — so the intent travels as an
   * argument instead of through state.
   */
  const commitOn = useCallback(
    (next: DropIntent) => {
      if (!moving || !subject) return;
      const subj = subject;
      const index = live.current.items.findIndex(
        (i) => i.kind === subj.kind && i.id === subj.id,
      );
      clear();
      const made = live.current.onCommit({ subject: subj, intent: next });
      requestFocus(focusPlanFor(subj, next, made, index));
    },
    [clear, moving, requestFocus, subject],
  );

  const commitMove = useCallback(() => commitOn(intent), [commitOn, intent]);

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
    pressed,
    intent,
    ghost,
    caret,
    register,
    onItemPointerDown,
    beginMove,
    stepMove,
    commitMove,
    commitOn,
    cancel,
    requestFocus,
  };
}
