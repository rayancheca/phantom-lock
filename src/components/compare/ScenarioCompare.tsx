import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, LayoutStore, Scene } from '../../engine/types';
import { computeAudio, type AudioMetrics } from '../../engine/stereo';
import { activeListener, createId, sceneListeners, setActiveListener } from '../../engine/scene';
import { layoutsInProject } from '../../engine/projects';
import { drawMiniPlan } from '../canvas/thumb';
import MetricsPanel from '../panels/MetricsPanel';
import VerdictHero from '../panels/VerdictHero';
import { deriveVerdict, type VerdictView } from '../panels/verdict';
import Icon from '../ui/Icon';
import { directOnlyTrace } from './compute-scenario';
import { MAX_COMPARE, MIN_COMPARE, compareSummary, type SummaryEntry } from './compare-summary';
import './compare.css';

/** One thing to compare: a layout and which seat within it you're listening from. */
export interface Scenario {
  layoutId: string;
  seatId: string;
}

/** A scenario plus a STABLE per-column identity. The column's React key is `uid`,
 *  so inserting or removing a column does not remount its neighbours; the hero
 *  inside is keyed on the ENTITY instead (see `Column`). */
interface Col extends Scenario {
  uid: string;
}

interface Props {
  store: LayoutStore;
  /** The scenarios the opener chose (at least two). */
  initial: Scenario[];
  onClose: () => void;
}

interface Computed {
  layout: Layout;
  /** The layout's scene with the chosen seat made active (mirror follows it). */
  scene: Scene;
  seatName: string;
  audio: AudioMetrics;
  trace: ReturnType<typeof directOnlyTrace>;
  /** The shared aggregate verdict — the SAME view-model the sidebar hero renders. */
  verdict: VerdictView;
  /** Wall-clock cost of this column, used only to decide whether to keep
   *  auto-computing the others. Never asserted in a test. */
  ms: number;
}

/**
 * Above this, a column is slow enough that computing the remaining ones
 * automatically would freeze the tab. The repo's own budget is INP < 200 ms.
 *
 * This is the real CPU control (`MAX_COMPARE` is a legibility bound, not a CPU
 * one). Measured per column in `docs/sessions/S20/bench/`: 0.02 ms on the seeded
 * demo, 62 ms on a 30-room house with four apex-blocked pairs, ~10.9 s on an
 * adversarial import-legal payload. No fixed N is safe by arithmetic, so instead
 * of guessing we MEASURE the columns we do compute and stop auto-computing when
 * the evidence says it is expensive — the user can still reveal any column
 * explicitly, one at a time, having been told what it will cost.
 */
const SLOW_COLUMN_MS = 120;

function computeScenario(layout: Layout, seatId: string): Computed {
  const t0 = performance.now();
  const seats = sceneListeners(layout.scene);
  // Guard a stale seatId (the layout may have changed underneath): fall back to
  // the first seat so the picker and the rendered verdict can never disagree.
  const chosen = seats.some((s) => s.id === seatId) ? seatId : seats[0].id;
  const scene = setActiveListener(layout.scene, chosen);
  // NOT `traceScene`: a column reads the trace only through `.direct.blocked`, and
  // the ray fan it would build has no reader here. See `compute-scenario.ts`.
  const trace = directOnlyTrace(scene);
  const audio = computeAudio(scene, trace, layout.settings.tvAnchor);
  return {
    layout,
    scene,
    seatName: activeListener(scene).name,
    audio,
    trace,
    verdict: deriveVerdict(audio, trace, layout.settings.tvAnchor),
    ms: performance.now() - t0,
  };
}

function Preview({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPlan(ref.current, scene, { allSeats: true });
  }, [scene]);
  return <canvas ref={ref} className="compare-preview" aria-hidden="true" />;
}

/**
 * Which seat a design shows when you first point a column at it: its OWN active
 * seat, the one whoever built it left selected — not `seats[0]`. Picking the
 * first seat silently showed the "Bed — TV rolled over" variant from the couch,
 * where of course it does not lock, making the design look broken.
 */
function defaultSeat(layout: Layout): string {
  return activeListener(layout.scene).id;
}

/** The (project → layout → seat) picker for one column. */
function ScenarioPicker({
  store,
  scenario,
  onChange,
  columnName,
}: {
  store: LayoutStore;
  scenario: Scenario;
  onChange: (next: Scenario) => void;
  columnName: string;
}) {
  const layout = store.layouts.find((l) => l.id === scenario.layoutId) ?? store.layouts[0];
  const project = store.projects.find((p) => p.id === layout.projectId) ?? store.projects[0];
  const inProject = layoutsInProject(store, project.id);
  const seats = sceneListeners(layout.scene);
  return (
    <div className="compare-picker">
      <label className="field">
        <span>Project</span>
        <select
          aria-label={`${columnName} — project`}
          value={project.id}
          onChange={(e) => {
            const next = store.projects.find((p) => p.id === e.target.value) ?? project;
            const first = layoutsInProject(store, next.id)[0];
            if (!first) return; // an empty folder has nothing to show
            onChange({ layoutId: first.id, seatId: defaultSeat(first) });
          }}
        >
          {store.projects.map((p) => (
            <option key={p.id} value={p.id} disabled={layoutsInProject(store, p.id).length === 0}>
              {p.name}
              {layoutsInProject(store, p.id).length === 0 ? ' (empty)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Design</span>
        <select
          aria-label={`${columnName} — design`}
          value={layout.id}
          onChange={(e) => {
            const next = store.layouts.find((l) => l.id === e.target.value) ?? layout;
            onChange({ layoutId: next.id, seatId: defaultSeat(next) });
          }}
        >
          {inProject.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Seat</span>
        <select
          aria-label={`${columnName} — seat`}
          value={seats.some((s) => s.id === scenario.seatId) ? scenario.seatId : seats[0].id}
          onChange={(e) => onChange({ ...scenario, seatId: e.target.value })}
          disabled={seats.length < 2}
        >
          {seats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Column({
  store,
  col,
  index,
  canRemove,
  compute,
  lastCost,
  onChange,
  onRemove,
  onResult,
  onReveal,
}: {
  store: LayoutStore;
  col: Col;
  index: number;
  canRemove: boolean;
  /** False when the slow-column gate is holding this one back. */
  compute: boolean;
  /** The slowest column measured so far, for the reveal button's copy. */
  lastCost: number;
  onChange: (next: Scenario) => void;
  onRemove: () => void;
  /** Reports this column's finished result (or null while deferred) UP, so the
   *  summary is built from what was actually computed. Computing it in the parent
   *  instead would run every column's `computeAudio` on every render and defeat
   *  the whole slow-column gate. */
  onResult: (r: { label: string; verdict: VerdictView; ms: number } | null) => void;
  onReveal: () => void;
}) {
  const columnName = `Column ${index + 1}`;
  const layout = store.layouts.find((l) => l.id === col.layoutId) ?? store.layouts[0];
  // Depends on the LAYOUT OBJECT, not on `store.layouts`, so an unrelated store
  // write does not invalidate every column at once.
  const data = useMemo(
    () => (compute ? computeScenario(layout, col.seatId) : null),
    [compute, layout, col.seatId],
  );

  const label = data ? `${data.layout.name} · ${data.seatName}` : layout.name;

  // A ref so the effect depends only on the DATA, not on a callback identity that
  // changes every parent render (which would loop: report -> setState -> report).
  const report = useRef(onResult);
  report.current = onResult;
  useEffect(() => {
    report.current(data ? { label, verdict: data.verdict, ms: data.ms } : null);
  }, [data, label]);

  return (
    <article className="compare-col" aria-label={`${columnName}: ${label}`}>
      <div className="compare-col-head">
        <h3 className="compare-col-title">{columnName}</h3>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? 'Remove this column' : `Compare needs at least ${MIN_COMPARE} columns`}
        >
          <Icon name="x" size={12} />
          Remove
        </button>
      </div>
      <ScenarioPicker store={store} scenario={col} onChange={onChange} columnName={columnName} />
      {data ? (
        <>
          <Preview scene={data.scene} />
          {/* Keyed on the ENTITY, not on the column, so switching this picker to an
              already-locked design remounts the hero (reseeding the ignition, no
              spurious LOCK celebration) while the column itself stays put. */}
          <VerdictHero
            key={`${col.layoutId}:${col.seatId}`}
            view={data.verdict}
            seatName={data.seatName}
            variant="compare"
          />
          <MetricsPanel
            audio={data.audio}
            trace={data.trace}
            speakerCount={data.scene.speakers.length}
            tvAnchor={data.layout.settings.tvAnchor}
            onSuggest={() => {}}
            hideSuggest
            landmarkLabel={null}
          />
        </>
      ) : (
        <div className="compare-deferred">
          <p className="compare-deferred-note">
            Measuring a design here takes about {Math.round(lastCost)} ms, so the remaining columns
            are not computed automatically.
          </p>
          <button type="button" className="btn btn-primary" onClick={onReveal}>
            Measure this column
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Full-screen comparison of N listening scenarios — S20 (was hard-wired to two).
 *
 * Each column is an independent (project, layout, seat) pick, so this compares
 * seats within a design, designs within a project, AND designs across projects.
 * Read-only throughout: `setActiveListener` returns a new scene and nothing is
 * ever written back.
 */
export default function ScenarioCompare({ store, initial, onClose }: Props) {
  const [cols, setCols] = useState<Col[]>(() =>
    initial.slice(0, MAX_COMPARE).map((s) => ({ ...s, uid: createId('col') })),
  );
  /** What each computed column produced, keyed by column uid. The summary reads
   *  ONLY this, so a deferred column costs nothing anywhere. */
  const [results, setResults] = useState<Record<string, { label: string; verdict: VerdictView; ms: number }>>({});
  /** Columns the user explicitly asked for despite the gate. */
  const [revealed, setRevealed] = useState<string[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noteResult = useCallback(
    (uid: string, r: { label: string; verdict: VerdictView; ms: number } | null) => {
      setResults((prev) => {
        if (!r) {
          if (!(uid in prev)) return prev;
          const { [uid]: _gone, ...rest } = prev;
          return rest;
        }
        const was = prev[uid];
        if (was && was.label === r.label && was.verdict === r.verdict) return prev;
        return { ...prev, [uid]: r };
      });
    },
    [],
  );

  const worstMs = Object.values(results).reduce((m, r) => (r.ms > m ? r.ms : m), 0);
  const slow = worstMs > SLOW_COLUMN_MS;

  const addColumn = () => {
    if (cols.length >= MAX_COMPARE) return;
    const last = cols[cols.length - 1];
    setCols((c) => [...c, { ...last, uid: createId('col') }]);
  };

  const removeColumn = (uid: string) => {
    if (cols.length <= MIN_COMPARE) return;
    setCols((c) => c.filter((x) => x.uid !== uid));
    setRevealed((r) => r.filter((x) => x !== uid));
    // Focus must land on something real. The Remove buttons may all have just been
    // disabled by this very removal (at MIN_COMPARE), and `.focus()` on a disabled
    // button is a no-op that drops focus to <body> — so aim at Add, which removing
    // always re-enables, and fall back to Close.
    requestAnimationFrame(() => (addRef.current ?? closeRef.current)?.focus());
  };

  // Built from the columns that were actually measured — never by recomputing.
  const entries: SummaryEntry[] = cols
    .map((c) => results[c.uid])
    .filter((r): r is { label: string; verdict: VerdictView; ms: number } => Boolean(r))
    .map(({ label, verdict }) => ({ label, verdict }));
  const summary = compareSummary(entries);

  return (
    <div
      className="compare-layer"
      role="dialog"
      aria-label="Compare listening scenarios"
      aria-modal="true"
    >
      <div className="compare-head">
        <h2>Compare</h2>
        <div className="compare-head-actions">
          <button
            ref={addRef}
            type="button"
            className="btn"
            onClick={addColumn}
            disabled={cols.length >= MAX_COMPARE}
            title={
              cols.length >= MAX_COMPARE
                ? `Compare shows up to ${MAX_COMPARE} at once`
                : 'Add another column'
            }
          >
            <Icon name="plus" size={13} />
            Add column
          </button>
          <button
            ref={closeRef}
            type="button"
            className="dialog-x"
            aria-label="Close compare"
            onClick={onClose}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>
      <p className="compare-summary" role="status">
        {summary}
      </p>
      <div className="compare-track">
        {cols.map((c, i) => (
          <Column
            key={c.uid}
            store={store}
            col={c}
            index={i}
            canRemove={cols.length > MIN_COMPARE}
            compute={i === 0 || !slow || revealed.includes(c.uid)}
            lastCost={worstMs}
            onChange={(next) =>
              setCols((all) => all.map((x) => (x.uid === c.uid ? { ...x, ...next } : x)))
            }
            onRemove={() => removeColumn(c.uid)}
            onResult={(r) => noteResult(c.uid, r)}
            onReveal={() => setRevealed((r) => (r.includes(c.uid) ? r : [...r, c.uid]))}
          />
        ))}
      </div>
    </div>
  );
}
