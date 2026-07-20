import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, Scene } from '../../engine/types';
import { traceScene } from '../../engine/raytrace';
import { computeAudio, type AudioMetrics } from '../../engine/stereo';
import { activeListener, sceneListeners, setActiveListener } from '../../engine/scene';
import { drawMiniPlan } from '../canvas/thumb';
import MetricsPanel from '../panels/MetricsPanel';
import VerdictHero from '../panels/VerdictHero';
import { deriveVerdict, type VerdictView } from '../panels/verdict';
import Icon from '../ui/Icon';
import './compare.css';

/** One thing to compare: a layout and which seat within it you're listening from. */
export interface Scenario {
  layoutId: string;
  seatId: string;
}

interface Props {
  layouts: Layout[];
  /** Left/right scenarios chosen by the opener (defaults to the two most useful). */
  initialLeft: Scenario;
  initialRight: Scenario;
  onClose: () => void;
}

interface Computed {
  layout: Layout;
  /** The layout's scene with the chosen seat made active (mirror follows it). */
  scene: Scene;
  seatName: string;
  audio: AudioMetrics;
  trace: ReturnType<typeof traceScene>;
  /** The shared aggregate verdict — the SAME view-model the sidebar hero renders. */
  verdict: VerdictView;
}

function useComputed(layouts: Layout[], scenario: Scenario): Computed {
  return useMemo(() => {
    const layout = layouts.find((l) => l.id === scenario.layoutId) ?? layouts[0];
    const seats = sceneListeners(layout.scene);
    // Guard against a stale seatId (e.g. the layout changed underneath): fall
    // back to the first seat so the picker and the rendered verdict can never
    // silently disagree about which seat this is.
    const seatId = seats.some((s) => s.id === scenario.seatId) ? scenario.seatId : seats[0].id;
    const scene = setActiveListener(layout.scene, seatId);
    const trace = traceScene(scene, layout.settings.rayCount, layout.settings.maxBounces);
    const audio = computeAudio(scene, trace, layout.settings.tvAnchor);
    return {
      layout,
      scene,
      seatName: activeListener(scene).name,
      audio,
      trace,
      verdict: deriveVerdict(audio, trace, layout.settings.tvAnchor),
    };
  }, [layouts, scenario.layoutId, scenario.seatId]);
}

function Preview({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawMiniPlan(ref.current, scene, { allSeats: true });
  }, [scene]);
  return <canvas ref={ref} className="compare-preview" aria-hidden="true" />;
}

function ScenarioPicker({
  layouts,
  scenario,
  onChange,
  label,
}: {
  layouts: Layout[];
  scenario: Scenario;
  onChange: (next: Scenario) => void;
  label: string;
}) {
  const layout = layouts.find((l) => l.id === scenario.layoutId) ?? layouts[0];
  const seats = sceneListeners(layout.scene);
  return (
    <div className="compare-picker">
      <label className="field">
        <span>{label} — layout</span>
        <select
          value={layout.id}
          onChange={(e) => {
            const next = layouts.find((l) => l.id === e.target.value) ?? layout;
            const firstSeat = sceneListeners(next.scene)[0];
            onChange({ layoutId: next.id, seatId: firstSeat.id });
          }}
        >
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Seat</span>
        <select
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

function Column({ data }: { data: Computed }) {
  return (
    <div className="compare-col">
      <Preview scene={data.scene} />
      <VerdictHero view={data.verdict} seatName={data.seatName} variant="compare" />
      <MetricsPanel
        audio={data.audio}
        trace={data.trace}
        speakerCount={data.scene.speakers.length}
        tvAnchor={data.layout.settings.tvAnchor}
        onSuggest={() => {}}
        hideSuggest
      />
    </div>
  );
}

/** Full-screen side-by-side comparison of two listening scenarios (couch vs bed,
 *  or layout A vs B). Read-only — it never mutates the real layouts. */
export default function ScenarioCompare({ layouts, initialLeft, initialRight, onClose }: Props) {
  const [left, setLeft] = useState<Scenario>(initialLeft);
  const [right, setRight] = useState<Scenario>(initialRight);
  const closeRef = useRef<HTMLButtonElement>(null);

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

  const l = useComputed(layouts, left);
  const r = useComputed(layouts, right);

  const summary = useMemo(() => {
    const leftName = `${l.layout.name} · ${l.seatName}`;
    const rightName = `${r.layout.name} · ${r.seatName}`;
    if (l.audio.pairs.length === 0 && r.audio.pairs.length === 0) {
      return 'Neither scenario has a stereo pair to compare yet.';
    }
    if (l.verdict.locked && r.verdict.locked) return `Both lock — ${leftName} and ${rightName} are cinema-ready.`;
    if (l.verdict.locked) return `${leftName} locks; ${rightName} does not.`;
    if (r.verdict.locked) return `${rightName} locks; ${leftName} does not.`;
    const diff = Math.abs(l.verdict.quality - r.verdict.quality);
    if (diff < 0.04) return `Neither locks yet — they score about the same (${Math.round(l.verdict.quality * 100)}%).`;
    const better = l.verdict.quality > r.verdict.quality ? leftName : rightName;
    return `Closer to a lock: ${better} (${Math.round(Math.max(l.verdict.quality, r.verdict.quality) * 100)}% vs ${Math.round(Math.min(l.verdict.quality, r.verdict.quality) * 100)}%).`;
  }, [l, r]);

  return (
    <div className="compare-layer" role="dialog" aria-label="Compare listening scenarios" aria-modal="true">
      <header className="compare-head">
        <h2>Compare scenarios</h2>
        <button ref={closeRef} type="button" className="dialog-x" aria-label="Close compare" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </header>
      <p className="compare-summary" role="status">
        {summary}
      </p>
      <div className="compare-pickers">
        <ScenarioPicker layouts={layouts} scenario={left} onChange={setLeft} label="Left" />
        <ScenarioPicker layouts={layouts} scenario={right} onChange={setRight} label="Right" />
      </div>
      <div className="compare-grid">
        {/* Key each column on its scenario so changing the picker to an already-locked
            layout/seat remounts the hero (no spurious LOCK ignition — compare is a
            static snapshot, never a live drag-to-lock). */}
        <Column key={`${left.layoutId}:${left.seatId}`} data={l} />
        <Column key={`${right.layoutId}:${right.seatId}`} data={r} />
      </div>
    </div>
  );
}
