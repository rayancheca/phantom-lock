import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, LayoutStore, Project, Scene } from '../../engine/types';
import {
  MAX_PROJECTS,
  homeItems,
  homeProject,
  layoutsInProject,
  projectOf,
} from '../../engine/projects';
import { drawMiniPlan } from '../canvas/thumb';
import Icon from '../ui/Icon';
import Menu, { MenuItem, MenuSeparator } from '../ui/Menu';
import { useGalleryDrag, type DragSubject, type ItemKind } from './useGalleryDrag';
import { containerIntentFor, describeIntent, focusPlanOn, type DropIntent } from './drag';
import { escapeAction } from './escape';
import './gallery.css';

/**
 * The home screen (S29).
 *
 * ONE flat grid where a design and a FOLDER are peers, exactly as an Android
 * launcher treats an app icon and a folder. Drop a design on a design and a
 * folder appears in the target's slot; drop it on a folder and it joins;
 * drop it in a gap and it moves there. Click a folder to drill in.
 *
 * Two structural decisions worth not undoing:
 *
 *   - `<ul role="list">` + `<li role="listitem">`, NOT `role="grid"`. MEASURED:
 *     `role="grid"` without real `row` elements raises `aria-required-children`
 *     and `aria-required-parent` (both critical), and the grid wraps by
 *     `auto-fill` so React does not know the row count. It would also promise a
 *     full arrow-key contract at all times — the S7 radiogroup lesson.
 *   - the drag surface is the EXISTING `.gallery-open` button. `.gallery-card`
 *     is a div containing two focusable buttons, so giving it `role="button"` or
 *     a tabIndex is an immediate `nested-interactive` violation under the
 *     page-wide axe run.
 */

function Thumb({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPlan(ref.current, scene, { allSeats: true });
  }, [scene]);
  return <canvas ref={ref} className="gallery-thumb" aria-hidden="true" />;
}

/**
 * Up to four miniatures, the way a launcher previews a folder.
 *
 * `drawMiniPlan` sizes from `canvas.clientWidth` and returns SILENTLY at 0, and
 * `Thumb`'s effect depends only on `[scene]` — so a canvas that misses its one
 * draw is blank for ever. The tile must therefore never be mounted inside a
 * `display:none` subtree. A transformed ancestor is fine (measured: clientWidth
 * is layout-derived, so it draws at its untransformed size).
 */
function FolderMosaic({ layouts }: { layouts: Layout[] }) {
  const slots = layouts.slice(0, 4);
  const rest = layouts.length - slots.length;
  return (
    <span className="folder-mosaic" aria-hidden="true">
      {[0, 1, 2, 3].map((i) =>
        slots[i] ? (
          <MiniSlot key={slots[i].id} scene={slots[i].scene} />
        ) : (
          <span key={`empty-${i}`} className="folder-slot folder-slot-empty" />
        ),
      )}
      {rest > 0 && <span className="folder-more">+{rest}</span>}
    </span>
  );
}

function MiniSlot({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPlan(ref.current, scene, { allSeats: true });
  }, [scene]);
  return <canvas ref={ref} className="folder-slot" aria-hidden="true" />;
}

interface GalleryProps {
  store: LayoutStore;
  activeId: string;
  onOpen: (id: string) => void;
  onNewRoom: (projectId: string) => void;
  onGenerate: (projectId: string) => void;
  onNewBlank: (projectId: string) => void;
  onNewApartment: (projectId: string) => void;
  onImport: () => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onExportAll: () => void;
  onCompare?: () => void;
  onDelete: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onMoveLayout: (layoutId: string, projectId: string) => void;
  /** Reorder / move into a folder, at a slot. */
  onDropLayout: (layoutId: string, projectId: string, index: number | null) => void;
  /** Reposition a folder tile on the home grid. */
  onDropProject: (projectId: string, index: number) => void;
  /**
   * Drop one design on another: both into a new folder at the target's slot.
   * Returns the id of the folder it minted, or null when it minted none — the
   * gallery needs it to put focus on the new tile.
   */
  onMergeLayouts: (dragId: string, targetId: string) => string | null;
  onClose: () => void;
}

type GridItem =
  | { kind: 'layout'; id: string; layout: Layout }
  | { kind: 'project'; id: string; project: Project; layouts: Layout[] };

export default function LayoutGallery(p: GalleryProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  /** The breadcrumb — a drop target only while drilled into a folder. */
  const exitRef = useRef<HTMLButtonElement | null>(null);
  /**
   * Where focus goes when nothing else survives a commit. One control per view,
   * and it must never be disabled: `.focus()` on a disabled element is a no-op
   * that drops focus to `<body>`, which is the failure being fixed. "New folder"
   * is disabled at MAX_PROJECTS, so the Close button is the home grid's.
   */
  const fallbackRef = useRef<HTMLButtonElement | null>(null);
  /** Which folder is drilled into, or null for the home grid. */
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const home = homeProject(p.store);
  const folder = openFolder ? p.store.projects.find((x) => x.id === openFolder) : undefined;
  // A folder can vanish under a drill-in — it auto-dissolves when a drag empties
  // it, and the kebab can delete it. Falling back to the home grid keeps the view
  // defined rather than rendering an empty shell for something that is gone.
  const container = folder ?? home;

  const items: GridItem[] = useMemo(() => {
    if (folder) {
      return layoutsInProject(p.store, folder.id).map((l) => ({
        kind: 'layout' as const,
        id: l.id,
        layout: l,
      }));
    }
    return homeItems(p.store).map((it) =>
      it.kind === 'layout'
        ? { kind: 'layout' as const, id: it.layout.id, layout: it.layout }
        : {
            kind: 'project' as const,
            id: it.project.id,
            project: it.project,
            layouts: layoutsInProject(p.store, it.project.id),
          },
    );
  }, [folder, p.store]);

  const nameOf = useCallback(
    (kind: ItemKind, id: string) =>
      kind === 'project'
        ? (p.store.projects.find((x) => x.id === id)?.name ?? 'folder')
        : (p.store.layouts.find((x) => x.id === id)?.name ?? 'design'),
    [p.store],
  );

  // `selfIndex` is threaded, not defaulted: a `slot` index is in DISPLAY space,
  // and announcing it raw was off by one for every position at or after the
  // subject. TypeScript cannot catch dropping it — a two-parameter function is
  // assignable where three are expected — so it has to be written out.
  const describe = useCallback(
    (intent: DropIntent, subject: DragSubject, selfIndex: number) =>
      describeIntent(intent, nameOf, subject.name, selfIndex),
    [nameOf],
  );

  const onCommit = useCallback(
    ({ subject, intent }: { subject: DragSubject; intent: DropIntent }): string | null => {
      // Every path returns explicitly: `noImplicitReturns` is not set, so a
      // fall-through would silently become `undefined` and lose the focus plan.
      if (intent.kind === 'merge' && subject.kind === 'layout') {
        return p.onMergeLayouts(subject.id, intent.targetId);
      }
      if (intent.kind === 'absorb' && subject.kind === 'layout') {
        p.onDropLayout(subject.id, intent.projectId, null);
        return null;
      }
      if (intent.kind === 'exit' && subject.kind === 'layout') {
        // `intent.projectId`, not a fresh `homeProject(p.store).id`: the proposal
        // and the write then name the same destination by construction. A stale
        // id is a safe no-op — `dropLayout` returns early when the target
        // project is not found.
        const emptied = layoutsInProject(p.store, container.id).length === 1;
        p.onDropLayout(subject.id, intent.projectId, null);
        // Announced ONLY when the folder disappeared. `dropLayout` already
        // toasts "Moved X to Home" through its own live region, so narrating the
        // move again would double-speak; that the container the user is looking
        // at has just ceased to exist is the one fact the toast does not carry.
        if (emptied) {
          setAnnouncement(`Moved ${subject.name} out. ${container.name} was empty and is gone.`);
        }
        return null;
      }
      if (intent.kind === 'slot') {
        if (subject.kind === 'project') p.onDropProject(subject.id, intent.index);
        else p.onDropLayout(subject.id, container.id, intent.index);
      }
      return null;
    },
    [container, p],
  );

  const drag = useGalleryDrag({
    items: items.map((i) => ({ kind: i.kind, id: i.id })),
    layerRef,
    exitRef,
    exitProjectId: home.id,
    fallbackRef,
    onCommit,
    announce: setAnnouncement,
    describe,
    // Inside a folder there is nothing a merge could correctly produce.
    canMerge: !folder,
  });

  // Escape is a LADDER, and it has to live inside this one handler.
  //
  // MEASURED: this listener is window-CAPTURE and calls `stopPropagation()`, and
  // nothing else fires — so a React `onKeyDown` for move-cancel is structurally
  // dead, not merely racing. The effect is `[]`-deps (it must not be rebuilt on
  // every store change), so every value it reads comes from a ref.
  /**
   * Is something stacked ABOVE this gallery holding its own Escape?
   *
   * The two selectors are precisely the overlays that (a) can be on screen over
   * this gallery and (b) claim Escape with their own window-capture listener:
   * `ui/Menu`'s popup (rendered only while open) and `ui/Dialog` (the rename,
   * folder-name, room-size and generate dialogs all open FROM here and leave the
   * gallery mounted).
   *
   * Deliberately NOT `[role="dialog"][aria-modal]`, which looks more semantic
   * and is wrong: it also matches the tutorial's `CoachMark`, whose Escape is a
   * React `onKeyDown` that THIS handler's `stopPropagation` kills — so yielding
   * to it would make Escape do nothing at all. Yield only to a handler that will
   * actually run.
   *
   * The menu half is scoped to this layer; the dialog half is deliberately
   * document-wide, justified by every `.dialog-layer` owning a window-capture
   * Escape handler, so yielding to one is safe whatever the stacking order.
   *
   * Read from the live DOM on every keystroke, never latched: a Menu can be
   * unmounted while open (the kebab's own Delete removes the card), and a cached
   * flag would then disable Escape for the rest of the session.
   */
  const overlayAbove = () =>
    layerRef.current?.querySelector('[role="menu"]') != null ||
    document.querySelector('.dialog-layer') != null;

  /**
   * Leave the drilled-in folder, putting focus on the tile the user came out of.
   *
   * Both routes out — Escape and the breadcrumb — unmount the control that holds
   * focus (a card in the folder, or the crumb itself), so without this the view
   * changes and focus falls to `<body>`. The tile is where the eye already is.
   */
  const leaveFolder = (id: string) => {
    setOpenFolder(null);
    setAnnouncement('Closed folder.');
    drag.requestFocus(focusPlanOn({ kind: 'project', id }));
  };

  const escRef = useRef<() => void>(() => {});
  escRef.current = () => {
    // Captured BEFORE the switch: `escapeAction`'s return value cannot narrow
    // `folder`, and the `leave-folder` rung is exactly the state in which it is
    // defined. Reading `folder.id` inside the branch is a compile error under
    // `strict`, and reading `openFolder` there would use the STALE id.
    const openId = folder?.id;
    switch (
      escapeAction({
        overlayAbove: overlayAbove(),
        // `folder`, NOT `openFolder`: a folder can be deleted or auto-dissolve
        // while drilled into, after which the raw state still holds its id but
        // the view has already fallen back to home. Feeding the raw state made
        // Escape swallow itself and announce "Closed folder." about a folder
        // that was already gone.
        inFolder: folder !== undefined,
        moving: drag.subject !== null || drag.pressed,
      })
    ) {
      case 'yield':
        return;
      case 'cancel-move':
        drag.cancel();
        return;
      case 'leave-folder':
        if (openId) leaveFolder(openId);
        return;
      case 'close':
        p.onClose();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onItemKeyDown = (e: React.KeyboardEvent, subject: DragSubject) => {
    // A modified key is a browser or OS chord, never a move command. Without
    // this, move mode swallowed Cmd+O (Open File) and Cmd+F (Find) and silently
    // retargeted the drop — the bare-letter branches match on `key` alone.
    const chord = e.metaKey || e.ctrlKey || e.altKey;
    if (drag.moving && !chord) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        drag.commitMove();
        return;
      }
      if (drag.stepMove(e.key)) e.preventDefault();
      return;
    }
    if (chord) return;
    // `m` picks up, mirroring the "Move…" menu item. A bare letter is safe here:
    // this handler is on the item's own button, so it cannot reach the canvas.
    if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      drag.beginMove(subject);
    }
  };

  const isSubject = (kind: ItemKind, id: string) =>
    drag.subject?.kind === kind && drag.subject.id === id;

  /**
   * While a move is armed, clicking an item is a DESTINATION, not navigation.
   *
   * Without this, an item's idle action still ran mid-move, and the consequences
   * were all silent: clicking a folder tile drilled INTO it with the move still
   * armed, after which the breadcrumb committed an `exit` for a design that was
   * never in that folder — a no-op write announced as "Moved X out. Y was empty
   * and is gone." Enter after the same drill-in applied a HOME-grid index to the
   * folder. And clicking a design opened it, closing the gallery and abandoning
   * the move without a word.
   *
   * It is also what the mode has always claimed to be: `useGalleryDrag`'s own
   * comment says move mode is "driven by arrow keys or by clicking a
   * destination", and until now only the breadcrumb implemented that — so
   * `merge`, `absorb` and `slot` had no single-pointer-without-dragging
   * destination at all, which is what SC 2.5.7 actually asks for.
   *
   * Returns true when it consumed the click.
   */
  const clickAsDestination = (kind: ItemKind, id: string, index: number): boolean => {
    if (!drag.moving || !drag.subject) return false;
    if (isSubject(kind, id)) {
      // Dropping an item on itself means "put it back": commit the no-op rather
      // than leaving the user in a mode with no obvious way out.
      drag.commitOn({ kind: 'slot', index });
      return true;
    }
    drag.commitOn(
      containerIntentFor(drag.subject, { kind, id }, !folder, { kind: 'slot', index }),
    );
    return true;
  };
  const dropClass = (kind: ItemKind, id: string) => {
    if (drag.intent.kind === 'merge' && kind === 'layout' && drag.intent.targetId === id) {
      return ' is-merge';
    }
    if (drag.intent.kind === 'absorb' && kind === 'project' && drag.intent.projectId === id) {
      return ' is-absorb';
    }
    return '';
  };

  const renderCard = (layout: Layout, index: number) => {
    const walls = layout.scene.objects.filter((o) => o.kind === 'wall').length;
    const others = p.store.projects.filter((x) => x.id !== layout.projectId);
    const subject: DragSubject = { kind: 'layout', id: layout.id, name: layout.name };
    return (
      <li
        role="listitem"
        key={layout.id}
        ref={(el) => drag.register(`layout:${layout.id}`, el)}
        className={`gallery-card${layout.id === p.activeId ? ' gallery-card-active' : ''}${
          isSubject('layout', layout.id) ? ' is-source' : ''
        }${dropClass('layout', layout.id)}`}
        onKeyDown={(e) => onItemKeyDown(e, subject)}
      >
        <button
          type="button"
          className="gallery-open"
          aria-describedby="gallery-move-help"
          onPointerDown={(e) => drag.onItemPointerDown(subject, e)}
          // The click a drag synthesises is swallowed at the window by the hook,
          // so this only ever runs for a genuine click.
          onClick={() => {
            if (clickAsDestination('layout', layout.id, index)) return;
            p.onOpen(layout.id);
          }}
        >
          <Thumb scene={layout.scene} />
          <span className="gallery-name">{layout.name}</span>
          <span className="gallery-meta">
            {walls} wall{walls === 1 ? '' : 's'} · {layout.scene.speakers.length} speaker
            {layout.scene.speakers.length === 1 ? '' : 's'}
            {(layout.scene.rooms?.length ?? 0) > 0 &&
              ` · ${layout.scene.rooms!.length} area${layout.scene.rooms!.length === 1 ? '' : 's'}`}
          </span>
        </button>
        <div className="gallery-kebab">
          <Menu
            label={`${layout.name} actions`}
            align="right"
            trigger={(open) => (
              <button
                type="button"
                className={`gallery-kebab-btn ${open ? 'room-trigger-open' : ''}`}
                aria-label={`${layout.name} actions`}
                aria-haspopup="menu"
                aria-expanded={open}
              >
                ⋯
              </button>
            )}
          >
            {/* The SC 2.5.7 path: every drag operation must also be reachable
                by a single pointer without dragging. This item is that path. */}
            <MenuItem icon="move" onSelect={() => drag.beginMove(subject)}>
              Move…
            </MenuItem>
            <MenuItem icon="pencil" onSelect={() => p.onRename(layout.id)}>
              Rename…
            </MenuItem>
            <MenuItem icon="duplicate" onSelect={() => p.onDuplicate(layout.id)}>
              Duplicate
            </MenuItem>
            <MenuItem icon="export" onSelect={() => p.onExport(layout.id)}>
              Export layout (JSON)
            </MenuItem>
            {others.length > 0 && <MenuSeparator />}
            {others.map((proj) => (
              <MenuItem
                key={proj.id}
                icon="layers"
                onSelect={() => p.onMoveLayout(layout.id, proj.id)}
              >
                Move to “{proj.name}”
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon="trash" danger onSelect={() => p.onDelete(layout.id)}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      </li>
    );
  };

  const renderTile = (project: Project, layouts: Layout[], index: number) => {
    const n = layouts.length;
    const subject: DragSubject = { kind: 'project', id: project.id, name: project.name };
    return (
      <li
        role="listitem"
        key={project.id}
        ref={(el) => drag.register(`project:${project.id}`, el)}
        className={`gallery-card folder-tile${isSubject('project', project.id) ? ' is-source' : ''}${dropClass(
          'project',
          project.id,
        )}`}
        onKeyDown={(e) => onItemKeyDown(e, subject)}
      >
        <button
          type="button"
          className="gallery-open"
          aria-describedby="gallery-move-help"
          aria-label={`Open folder ${project.name}, ${n} design${n === 1 ? '' : 's'}`}
          onPointerDown={(e) => drag.onItemPointerDown(subject, e)}
          onClick={() => {
            if (clickAsDestination('project', project.id, index)) return;
            setOpenFolder(project.id);
            setAnnouncement(`Opened folder ${project.name}, ${n} design${n === 1 ? '' : 's'}.`);
          }}
        >
          <FolderMosaic layouts={layouts} />
          <span className="gallery-name">
            <Icon name="layers" size={13} className="folder-glyph" />
            {project.name}
          </span>
          {/* `.gallery-meta` reused verbatim: it is one of the ten sites the
              contrast ratchet allows `--text-3` below 12px, and authoring a
              second such block fails `styles/__tests__/contrast.test.ts`. */}
          <span className="gallery-meta">
            {n === 0 ? 'Empty — drop a design here' : `${n} design${n === 1 ? '' : 's'}`}
          </span>
        </button>
        <div className="gallery-kebab">
          <Menu
            label={`${project.name} folder actions`}
            align="right"
            trigger={(open) => (
              <button
                type="button"
                className={`gallery-kebab-btn ${open ? 'room-trigger-open' : ''}`}
                aria-label={`${project.name} folder actions`}
                aria-haspopup="menu"
                aria-expanded={open}
              >
                ⋯
              </button>
            )}
          >
            <MenuItem icon="move" onSelect={() => drag.beginMove(subject)}>
              Move…
            </MenuItem>
            <MenuItem icon="pencil" onSelect={() => p.onRenameProject(project.id)}>
              Rename folder…
            </MenuItem>
            <MenuItem icon="plus" onSelect={() => p.onNewBlank(project.id)}>
              New design in here
            </MenuItem>
            <MenuItem icon="sparkles" onSelect={() => p.onGenerate(project.id)}>
              Generate a design…
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="trash" danger onSelect={() => p.onDeleteProject(project.id)}>
              Delete folder
            </MenuItem>
          </Menu>
        </div>
      </li>
    );
  };

  const gridId = 'gallery-grid';
  const headingId = 'gallery-heading';

  const grid = (
    <ul className="gallery-grid" id={gridId} role="list" aria-labelledby={headingId}>
      {items.map((it, i) =>
        it.kind === 'layout'
          ? renderCard(it.layout, i)
          : renderTile(it.project, it.layouts, i),
      )}
      {items.length === 0 && (
        <li role="listitem" className="gallery-empty-note">
          Nothing here yet — “New design” starts one.
        </li>
      )}
    </ul>
  );

  return (
    <div className="gallery-layer" role="dialog" aria-label="Your layouts" ref={layerRef}>
      <div className="gallery-head">
        {folder ? (
          <div className="gallery-crumb">
            <button
              type="button"
              ref={(el) => {
                exitRef.current = el;
                fallbackRef.current = el;
              }}
              className={`btn gallery-exit${drag.subject?.kind === 'layout' ? ' can-exit' : ''}${
                drag.intent.kind === 'exit' ? ' is-exit' : ''
              }`}
              // While a design is being moved this button MEANS something else:
              // activating it moves the design out. Saying so is WCAG 4.1.2 —
              // otherwise a screen-reader user hears "All layouts, button",
              // presses Enter, and moves their design instead of going back.
              // The pointer path already gets words ("Move out", on the ghost);
              // move mode renders no ghost, so it got none.
              aria-label={
                drag.moving && drag.subject?.kind === 'layout'
                  ? `Move ${drag.subject.name} out to ${home.name}`
                  : undefined
              }
              onClick={() => {
                // While moving, the breadcrumb is the DESTINATION, not the way
                // back. Without this the exit action's only non-dragging path
                // would be a keyboard key — SC 2.1.1, and explicitly NOT SC
                // 2.5.7, which requires the alternative to work "by a single
                // pointer without dragging".
                if (drag.moving && drag.subject?.kind === 'layout') {
                  drag.commitOn({ kind: 'exit', projectId: home.id });
                  return;
                }
                leaveFolder(folder.id);
              }}
            >
              <Icon name="chevron-left" size={14} />
              All layouts
            </button>
            <h2 id={headingId}>{folder.name}</h2>
          </div>
        ) : (
          <h2 id={headingId}>Your layouts</h2>
        )}
        <div className="gallery-head-actions">
          <button
            type="button"
            className="btn"
            onClick={p.onNewProject}
            disabled={p.store.projects.length >= MAX_PROJECTS}
            title={
              p.store.projects.length >= MAX_PROJECTS
                ? `That is the most folders one workspace can hold (${MAX_PROJECTS})`
                : 'Group designs of one space into a folder'
            }
          >
            <Icon name="layers" size={13} />
            New folder
          </button>
          {p.onCompare && (
            <button
              type="button"
              className="btn"
              title="Compare seats, designs or folders side by side"
              onClick={p.onCompare}
            >
              <Icon name="grid" size={13} />
              Compare
            </button>
          )}
          <button
            type="button"
            className="btn"
            title="Download every layout as one backup file"
            onClick={p.onExportAll}
          >
            <Icon name="export" size={13} />
            Export all
          </button>
          <button
            type="button"
            // The home grid's last-resort focus holder. The Close button is the
            // only head control that is never disabled — "New folder" goes
            // disabled at MAX_PROJECTS. Inside a folder the crumb takes over, so
            // this ref is only claimed on the home grid.
            ref={folder ? undefined : fallbackRef}
            className="dialog-x"
            aria-label="Close"
            onClick={p.onClose}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {/*
        `role="application"` ONLY while moving, and only as a DIV wrapping an
        untouched list. MEASURED: every other placement raises an axe violation
        (`listitem` serious, or `aria-allowed-role` + `aria-required-parent`
        critical). It is needed for the reason `SimCanvas` needs it — a screen
        reader's browse mode swallows arrow keys, which would make move mode
        unusable for exactly the people it exists for.
      */}
      <div
        className="gallery-surface"
        role={drag.moving ? 'application' : undefined}
        aria-label={drag.moving ? 'Moving an item' : undefined}
      >
        {grid}
      </div>

      {/* Container-aware: a help text that names a key doing nothing in the
          current view is the documentation form of the same defect the exit
          intent exists to avoid. `O` only works inside a folder. */}
      <p id="gallery-move-help" className="sr-only">
        Press M, or choose “Move…” from this item’s actions menu, to move it. Then use the arrow
        keys to choose a place,{' '}
        {folder
          ? 'O to move it out of this folder, '
          : 'F to put it inside the item at that place, '}
        Enter to drop it, and Escape to cancel.
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {drag.caret && (
        <span
          className="drop-caret"
          aria-hidden="true"
          style={{ left: drag.caret.x, top: drag.caret.top, height: drag.caret.height }}
        />
      )}
      {drag.dragging && drag.ghost && drag.subject && (
        <span
          className="drag-ghost"
          aria-hidden="true"
          style={{
            left: drag.ghost.x,
            top: drag.ghost.y,
            width: drag.ghost.width,
            height: drag.ghost.height,
          }}
        >
          <span className="drag-ghost-name">{drag.subject.name}</span>
          <span className="drag-hint">
            {drag.intent.kind === 'merge'
              ? 'New folder'
              : drag.intent.kind === 'absorb'
                ? `Add to “${nameOf('project', drag.intent.projectId)}”`
                : drag.intent.kind === 'exit'
                  ? 'Move out'
                  : 'Move here'}
          </span>
        </span>
      )}

      {!folder && (
        <div className="gallery-new">
          {/*
            S34 — the generator leads the home tray, spanning both columns.

            It used to be reachable ONLY from inside a folder (the `{folder &&}`
            row below, and a folder tile's kebab), which made the app's flagship
            feature invisible on the screen every session opens on — and
            completely unreachable in a workspace with no folders at all. The
            owner reported it as "wheres the generate layout button. impossible
            to find". Measured live before the fix: `generateOnHome === false`.

            `home.id` is the right argument, not a folder's: `useGenerateDesign`
            files the kept design into the id it was opened with, so anything
            else would bury a generated design in a folder the user never opened.
          */}
          <button
            type="button"
            className="gallery-new-btn gallery-new-lead"
            onClick={() => p.onGenerate(home.id)}
          >
            <Icon name="sparkles" size={18} />
            Generate a design…
          </button>
          <button type="button" className="gallery-new-btn" onClick={() => p.onNewRoom(home.id)}>
            <Icon name="rectangle" size={18} />
            New room…
          </button>
          <button type="button" className="gallery-new-btn" onClick={() => p.onNewBlank(home.id)}>
            <Icon name="pencil" size={18} />
            Empty layout
          </button>
          <button
            type="button"
            className="gallery-new-btn"
            onClick={() => p.onNewApartment(home.id)}
          >
            <Icon name="home" size={18} />
            Maple Court apartment
          </button>
          <button
            type="button"
            className="gallery-new-btn"
            title="Open a Phantom Lock layout file you exported before (not a floorplan photo)"
            onClick={p.onImport}
          >
            <Icon name="import" size={18} />
            Import layout (JSON)…
          </button>
        </div>
      )}
      {folder && (
        <div className="gallery-new">
          <button
            type="button"
            className="gallery-new-btn"
            onClick={() => p.onNewBlank(folder.id)}
          >
            <Icon name="pencil" size={18} />
            New design in “{folder.name}”
          </button>
          <button
            type="button"
            className="gallery-new-btn"
            onClick={() => p.onGenerate(folder.id)}
          >
            <Icon name="sparkles" size={18} />
            Generate a design…
          </button>
        </div>
      )}
    </div>
  );
}

/** Re-exported so `App.tsx` can name a layout's folder without a second lookup. */
export { projectOf };
