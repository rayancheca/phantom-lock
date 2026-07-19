import type { Arrival, Scene, TraceResult } from '../../engine/types';
import { speakerColors } from '../canvas/render';
import './panels.css';

const BIN_MS = 1;
const MAX_MS = 90;
const BINS = MAX_MS / BIN_MS;
const W = 320;
const H = 190;
const PAD_L = 10;
const PAD_R = 10;
const BASE = 150;
const BAR_MAX = 128;

function binArrivals(arrivals: Arrival[]): number[] {
  const bins = new Array<number>(BINS).fill(0);
  for (const a of arrivals) {
    if (a.order === 0) continue; // direct handled explicitly below
    const i = Math.floor(a.timeMs / BIN_MS);
    if (i >= 0 && i < BINS) bins[i] = Math.max(bins[i], a.amp);
  }
  return bins;
}

const xOf = (ms: number): number => PAD_L + (ms / MAX_MS) * (W - PAD_L - PAD_R);

export default function Echogram({ trace, scene }: { trace: TraceResult; scene: Scene }) {
  if (trace.bySpeaker.length === 0) {
    return (
      <section className="card" aria-label="Echo at listener">
        <h2>Echo at listener</h2>
        <p className="card-sub">Add a speaker to see when its direct sound and reflections arrive at your head.</p>
      </section>
    );
  }

  const colors = speakerColors(scene);
  const series = trace.bySpeaker.map((s) => ({
    id: s.id,
    label: scene.speakers.find((sp) => sp.id === s.id)?.label ?? '?',
    color: colors.get(s.id) ?? '148,163,184',
    bins: binArrivals(s.trace.arrivals),
    directAmp: s.direct.blocked ? 0 : s.direct.attenuation / (1 + 0.25 * s.direct.distance3d),
    directMs: (s.direct.distance3d / 343) * 1000,
    blocked: s.direct.blocked,
  }));

  const maxAmp = Math.max(1e-6, ...series.flatMap((s) => [s.directAmp, ...s.bins]));
  const h = (amp: number): number => BAR_MAX * Math.sqrt(amp / maxAmp);
  const n = series.length;
  const barW = Math.max(1.2, 2.8 / Math.sqrt(n));

  return (
    <section className="card" aria-label="Echo at listener">
      <h2>Echo at listener</h2>
      <p className="card-sub">
        When each speaker's sound reaches your ears — ▲ direct, bars are reflections.
      </p>
      <div className="echo-legend-row">
        {series.map((s) => (
          <span key={s.id} className="echo-legend" style={{ color: `rgb(${s.color})` }}>
            <span className="echo-legend-dot" style={{ background: `rgb(${s.color})` }} />
            {s.label}
            {s.blocked && ' (blocked)'}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="echogram" role="img" aria-label="Echogram of reflection arrival times">
        <rect x={xOf(0)} y={BASE - BAR_MAX - 6} width={xOf(20) - xOf(0)} height={BAR_MAX + 10} className="echo-early" />
        <line x1={xOf(20)} y1={BASE - BAR_MAX - 6} x2={xOf(20)} y2={BASE + 4} className="echo-early-line" />
        <text x={xOf(1.5)} y={BASE - BAR_MAX + 4} className="echo-zone-label">
          early — smears imaging
        </text>
        <line x1={PAD_L} y1={BASE} x2={W - PAD_R} y2={BASE} className="echo-axis" />
        {series.map((s, si) =>
          s.bins.map((amp, i) =>
            amp > 0 ? (
              <rect
                key={`${s.id}-${i}`}
                x={xOf(i * BIN_MS) + si * barW}
                y={BASE - h(amp)}
                width={barW}
                height={h(amp)}
                fill={`rgb(${s.color})`}
                opacity={0.85}
              />
            ) : null,
          ),
        )}
        {series.map((s) =>
          !s.blocked && s.directMs < MAX_MS ? (
            <path
              key={`d-${s.id}`}
              d={`M ${xOf(s.directMs)} ${BASE - h(s.directAmp) - 5} l 4.5 -8 l -9 0 Z`}
              fill={`rgb(${s.color})`}
            />
          ) : null,
        )}
        {[0, 20, 40, 60, 80].map((ms) => (
          <g key={ms}>
            <line x1={xOf(ms)} y1={BASE + 6} x2={xOf(ms)} y2={BASE + 11} className="echo-axis" />
            <text x={xOf(ms)} y={BASE + 24} className="echo-tick">
              {ms}
            </text>
          </g>
        ))}
        <text x={W - PAD_R} y={BASE + 24} className="echo-tick" textAnchor="end">
          ms
        </text>
      </svg>
      <p className="card-sub">
        Strong bars inside the shaded first 20 ms arrive too soon after the direct sound and smear
        the image — add absorption there, or pull speakers off nearby walls.
      </p>
    </section>
  );
}
