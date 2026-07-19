import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layout, Scene } from '../../engine/types';
import { traceScene } from '../../engine/raytrace';
import { computeAudio, type AudioMetrics } from '../../engine/stereo';
import { activeListener, sceneListeners, setActiveListener } from '../../engine/scene';
import { drawMiniPlan } from '../canvas/thumb';
import MetricsPanel from '../panels/MetricsPanel';
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
  verdict: { label: string; quality: number; locked: boolean; state: 'locked' | 'close' | 'searching' };
}

function verdictOf(audio: AudioMetrics): Computed['verdict'] {
  if (audio.pairs.length === 0) {
    return {
      label: audio.solos.length > 0 ? 'No stereo pair' : 'No speakers',
      quality: 0,
      locked: false,
      state: 'searching',
    };
  }
  const quality = Math.max(...audio.pairs.map((p) => p.quality));
  const locked = audio.allLocked;
  const state: Computed['verdict']['state'] = locked ? 'locked' : quality > 0.55 ? 'close' : 'searching';
  return {
    label: locked ? 'Phantom center locked' : quality > 0.55 ? 'Almost there' : 'No lock yet',
    quality,
    locked,
    state,
  };
}

function useComputed(layouts: Layout[], scenario: Scenario): Computed {
  return useMemo(() => {
    const layout = layouts.find((l) => l.id === scenario.layoutId) ?? layouts[0];
    const scene = setActiveListener(layout.scene, scenario.seatId);
    const trace = traceScene(scene, layout.settings.rayCount, layout.settings.maxBounces);
    const audio = computeAudio(scene, trace, layout.settings.tvAnchor);
    return {
      layout,
      scene,
      seatName: activeListener(scene).name,
      audio,
      trace,
      verdict: verdictOf(audio),
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
          value={scenario.seatId}
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
      <div className={`compare-verdict verdict-${data.verdict.state}`}>
        <span className="verdict-state">{data.verdict.label}</span>
        <div className="quality-meter" aria-hidden="true">
          <div className="quality-fill" style={{ width: `${Math.round(data.verdict.quality * 100)}%` }} />
        </div>
      </div>
      <MetricsPanel
        audio={data.audio}
        trace={data.trace}
        speakerCount={data.scene.speakers.length}
        tvAnchor={data.layout.settings.tvAnchor}
        onSuggest={() => {}}
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
        <Column data={l} />
        <Column data={r} />
      </div>
    </div>
  );
}
