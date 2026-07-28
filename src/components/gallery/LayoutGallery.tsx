import { useEffect, useRef } from 'react';
import type { Layout, LayoutStore, Project, Scene } from '../../engine/types';
import { MAX_PROJECTS, layoutsInProject } from '../../engine/projects';
import { drawMiniPlan } from '../canvas/thumb';
import Icon from '../ui/Icon';
import Menu, { MenuItem, MenuSeparator } from '../ui/Menu';
import './gallery.css';

function Thumb({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPlan(ref.current, scene, { allSeats: true });
  }, [scene]);
  return <canvas ref={ref} className="gallery-thumb" aria-hidden="true" />;
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
  onClose: () => void;
}

function Card({ layout, p }: { layout: Layout; p: GalleryProps }) {
  const walls = layout.scene.objects.filter((o) => o.kind === 'wall').length;
  const others = p.store.projects.filter((x) => x.id !== layout.projectId);
  return (
    <div className={`gallery-card ${layout.id === p.activeId ? 'gallery-card-active' : ''}`}>
      <button type="button" className="gallery-open" onClick={() => p.onOpen(layout.id)}>
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
    </div>
  );
}

function ProjectSection({ project, p }: { project: Project; p: GalleryProps }) {
  const layouts = layoutsInProject(p.store, project.id);
  const headingId = `project-head-${project.id}`;
  const locked = p.store.projects.length <= 1;
  return (
    <section className="gallery-project" aria-labelledby={headingId}>
      <div className="gallery-project-head">
        <h3 className="gallery-project-name" id={headingId}>
          {project.name}
        </h3>
        <span className="gallery-project-count">
          {layouts.length} design{layouts.length === 1 ? '' : 's'}
        </span>
        <div className="gallery-project-actions">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => p.onGenerate(project.id)}
            title={`Generate a design in “${project.name}”`}
          >
            <Icon name="sparkles" size={12} />
            Generate a design
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => p.onNewBlank(project.id)}
            title={`Add a new design to “${project.name}”`}
          >
            <Icon name="plus" size={12} />
            New design
          </button>
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
            <MenuItem icon="pencil" onSelect={() => p.onRenameProject(project.id)}>
              Rename folder…
            </MenuItem>
            <MenuItem icon="home" onSelect={() => p.onNewApartment(project.id)}>
              Add Maple Court apartment
            </MenuItem>
            <MenuItem icon="rectangle" onSelect={() => p.onNewRoom(project.id)}>
              Add a room…
            </MenuItem>
            <MenuItem icon="sparkles" onSelect={() => p.onGenerate(project.id)}>
              Generate a design…
            </MenuItem>
            {/* Not rendered at one folder rather than rendered-and-inert: a menu
                item that closes the menu and does nothing is the affordance S14
                specifically ruled out, and `MenuItem` has no disabled state. */}
            {!locked && (
              <>
                <MenuSeparator />
                <MenuItem icon="trash" danger onSelect={() => p.onDeleteProject(project.id)}>
                  Delete folder
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
      {layouts.length === 0 ? (
        <p className="gallery-project-empty">
          Nothing here yet — “New design” starts one in this folder.
        </p>
      ) : (
        <div className="gallery-grid">
          {layouts.map((l) => (
            <Card key={l.id} layout={l} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Full-screen home for every design — folders of cards with live miniatures. */
export default function LayoutGallery(p: GalleryProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        p.onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = p.store.projects[0];
  return (
    <div className="gallery-layer" role="dialog" aria-label="Your layouts">
      <div className="gallery-head">
        <h2>Your layouts</h2>
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
          <button type="button" className="dialog-x" aria-label="Close" onClick={p.onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
      {p.store.projects.map((project) => (
        <ProjectSection key={project.id} project={project} p={p} />
      ))}
      <div className="gallery-new">
        <button type="button" className="gallery-new-btn" onClick={() => p.onNewRoom(first.id)}>
          <Icon name="rectangle" size={18} />
          New room…
        </button>
        <button type="button" className="gallery-new-btn" onClick={() => p.onNewBlank(first.id)}>
          <Icon name="pencil" size={18} />
          Empty layout
        </button>
        <button type="button" className="gallery-new-btn" onClick={() => p.onNewApartment(first.id)}>
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
    </div>
  );
}
