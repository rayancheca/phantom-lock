import type { TraceResult } from '../../engine/types';
import { CLOSE_QUALITY, type AudioMetrics, type PairMetrics } from '../../engine/stereo';
import { causeSentence } from './verdict';
import Term from '../ui/Term';
import type { TermKey } from './glossary';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  audio: AudioMetrics;
  trace: TraceResult;
  speakerCount: number;
  tvAnchor: boolean;
  onSuggest: () => void;
  /** Read-only contexts (e.g. scenario compare) hide the actionable Suggest button. */
  hideSuggest?: boolean;
}

type Tone = 'ok' | 'warn' | 'bad' | 'plain';

/**
 * The ok/warn/bad judgement is carried ONLY by the `.tone-*` colour, and the
 * corroborating meter is `aria-hidden`. Without this word, a screen-reader user
 * gets the raw number with no indication of whether it is good — the entire
 * point of the spec sheet (WCAG 1.4.1, use of colour).
 */
function toneWord(tone: Tone): string {
  return tone === 'ok' ? 'good' : tone === 'warn' ? 'borderline' : tone === 'bad' ? 'poor' : '';
}

function ToneNote({ tone }: { tone: Tone }) {
  const word = toneWord(tone);
  return word ? <span className="sr-only">, {word}</span> : null;
}

function Row({
  label,
  value,
  tone = 'plain',
  hint,
  term,
}: {
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
  term?: TermKey;
}) {
  return (
    <div className="metric-row" title={hint}>
      {term ? (
        <Term termKey={term} className="metric-label">
          {label}
        </Term>
      ) : (
        <span className="metric-label">{label}</span>
      )}
      <span className={`metric-value tone-${tone}`}>
        {value}
        <ToneNote tone={tone} />
      </span>
    </div>
  );
}

/** One spec-sheet row: a mono label with a visible dotted-underline "this has an
 *  explanation" affordance, a right-aligned tabular value, and a full-width meter
 *  beneath it. The `signal` variant uses the --signal lock-approach fill (the Lock
 *  row); the three status rows keep their ok/warn/bad tone fill (color-role
 *  discipline: green/amber/red = acoustic status, --signal = approaching lock). */
function SpecRow({
  label,
  value,
  tone,
  fraction,
  hint,
  term,
  signal = false,
}: {
  label: string;
  value: string;
  tone: Tone;
  fraction: number;
  hint?: string;
  term?: TermKey;
  signal?: boolean;
}) {
  const pct = Math.round(Math.min(1, Math.max(0.04, fraction)) * 100);
  return (
    <div className="spec-row" title={hint}>
      {term ? (
        <Term termKey={term} className="spec-label">
          {label}
        </Term>
      ) : (
        <span className="spec-label">{label}</span>
      )}
      <span className={`spec-value tone-${tone}`}>
        {value}
        <ToneNote tone={tone} />
      </span>
      <div className={signal ? 'quality-meter' : 'meter'} aria-hidden="true">
        <div
          className={signal ? 'quality-fill' : `meter-fill tone-${tone === 'plain' ? 'ok' : tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PairSection({
  pair,
  trace,
  tvAnchor,
  pairCount,
}: {
  pair: PairMetrics;
  trace: TraceResult;
  tvAnchor: boolean;
  pairCount: number;
}) {
  const itdTone: Tone = pair.itdMs <= 0.1 ? 'ok' : pair.itdMs <= 0.3 ? 'warn' : 'bad';
  const angleOff = Math.abs(pair.angleDeg - 60);
  const angleTone: Tone = angleOff <= 5 ? 'ok' : angleOff <= 15 ? 'warn' : 'bad';
  const ildTone: Tone = Math.abs(pair.ildDb) < 0.5 ? 'ok' : Math.abs(pair.ildDb) < 1.5 ? 'warn' : 'bad';
  const balance =
    pair.ildDb === 0
      ? 'even'
      : pair.ildDb > 0
        ? `${pair.aLabel} +${pair.ildDb.toFixed(1)} dB`
        : `${pair.bLabel} +${(-pair.ildDb).toFixed(1)} dB`;
  const blockedA = trace.bySpeaker.find((s) => s.id === pair.aId)?.direct.blocked;
  const blockedB = trace.bySpeaker.find((s) => s.id === pair.bId)?.direct.blocked;

  // The aggregate verdict now leads the column as the VerdictHero, so a single-pair
  // scene shows it once. Multiple pairs still get a per-pair verdict here as detail
  // (its own headline + cause), keeping the .verdict styles live and per-pair.
  const showPairVerdict = pairCount > 1;
  const state = pair.locked ? 'locked' : pair.quality > CLOSE_QUALITY ? 'close' : 'searching';
  const stateText = state === 'locked' ? 'Phantom center locked' : state === 'close' ? 'Almost there' : 'No lock yet';

  return (
    <div className="pair-section">
      <h3 className="pair-title">
        Pair {pair.aLabel} + {pair.bLabel}
      </h3>
      {showPairVerdict && (
        // Not a live region: it recomputes on every drag frame, which would flood
        // screen readers with queued announcements.
        <div className={`verdict verdict-${state}`}>
          <span className="verdict-state">{stateText}</span>
          <p className="verdict-cause">{causeSentence(pair, blockedA, blockedB, tvAnchor)}</p>
          <div className="quality-meter" aria-hidden="true">
            <div className="quality-fill" style={{ width: `${Math.round(pair.quality * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="spec-sheet">
        <SpecRow
          label="Timing (ITD)"
          value={`${pair.itdMs.toFixed(2)} ms`}
          tone={itdTone}
          fraction={pair.itdMs / 0.6}
          term="itd"
          hint="Inter-channel delay at your head. Above ~0.1 ms the image starts pulling toward the nearer HomePod; 1 ms sounds fully one-sided."
        />
        <SpecRow
          label="Level balance"
          value={balance}
          tone={ildTone}
          fraction={Math.abs(pair.ildDb) / 4}
          term="ild"
          hint="Loudness difference at your seat. Volume trim can fix this — it can never fix timing."
        />
        <SpecRow
          label="Listening angle"
          value={`${pair.angleDeg.toFixed(0)}° / 60°`}
          tone={angleTone}
          fraction={angleOff / 30}
          term="angle-60"
          hint="Angle the pair subtends at your head. 60° = equilateral reference."
        />
        <SpecRow
          label="Lock"
          value={pair.locked ? 'LOCKED' : 'open'}
          tone={pair.locked ? 'ok' : 'plain'}
          fraction={pair.quality}
          signal
          term="lock"
          hint="Equilateral + on axis + clear line of sight → the phantom centre locks. The fill shows how close this pair is."
        />
        {pair.tv && (
          <SpecRow
            label="TV on axis"
            value={`${(pair.tv.offAxis * 100).toFixed(0)} cm off`}
            tone={pair.tv.aligned ? 'ok' : 'bad'}
            fraction={Math.min(1, pair.tv.offAxis / 0.6)}
            hint="Distance from the TV to the pair's centre axis. Cinema mode wants the image on the screen."
          />
        )}
      </div>

      <details className="metric-details">
        <summary>Distances & detail</summary>
        <Row label={`${pair.aLabel} → ear`} value={`${pair.dA.toFixed(2)} m`} hint="True 3D distance including speaker and ear height." />
        <Row label={`${pair.bLabel} → ear`} value={`${pair.dB.toFixed(2)} m`} />
        <Row label="Speaker base" value={`${pair.base.toFixed(2)} m`} />
        <Row
          label="Path mismatch"
          value={`${(pair.pathDiff * 100).toFixed(1)} cm`}
          term="path-mismatch"
          hint="Difference between the two direct paths — mismatch shifts and smears the phantom image."
        />
        <Row
          label="Comb notch"
          value={
            pair.combNotchHz
              ? pair.combNotchHz < 1000
                ? `${pair.combNotchHz.toFixed(0)} Hz`
                : `${(pair.combNotchHz / 1000).toFixed(1)} kHz`
              : 'aligned ✓'
          }
          tone={pair.combNotchHz && pair.combNotchHz < 2000 ? 'warn' : 'ok'}
          term="comb-notch"
          hint="First cancellation frequency caused by the pair's path mismatch when both channels carry the same signal."
        />
      </details>

      {pair.modelMismatch && (
        <p className="warn-line">
          <Icon name="warning" size={13} />
          Different models — Apple can't stereo-pair a HomePod with a mini. Unpair or swap one.
        </p>
      )}
      {blockedA && (
        <p className="warn-line">
          <Icon name="warning" size={13} />
          {pair.aLabel} has no line of sight to the listener.
        </p>
      )}
      {blockedB && (
        <p className="warn-line">
          <Icon name="warning" size={13} />
          {pair.bLabel} has no line of sight to the listener.
        </p>
      )}
    </div>
  );
}

export default function MetricsPanel({ audio, trace, speakerCount, tvAnchor, onSuggest, hideSuggest }: Props) {
  if (speakerCount === 0) {
    return (
      <section className="card" aria-label="Audio metrics">
        <h2>Audio</h2>
        <p className="card-sub">
          {hideSuggest
            ? 'The spec sheet fills in once a matched stereo pair is playing — timing, level, angle, and the lock, live as you move.'
            : 'Nothing to analyze yet. Drop in two matched HomePods with the speaker tool, or let the optimizer find the spots — then watch the phantom center lock.'}
        </p>
        {!hideSuggest && (
          <button type="button" className="btn btn-primary btn-block" onClick={onSuggest}>
            <Icon name="sparkles" size={14} />
            Suggest placement
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="card" aria-label="Audio metrics">
      <h2>
        Audio
        <span className="card-tag">{tvAnchor ? 'TV mode' : 'Music mode'}</span>
      </h2>
      {audio.pairs.map((pair) => (
        <PairSection key={`${pair.aId}-${pair.bId}`} pair={pair} trace={trace} tvAnchor={tvAnchor} pairCount={audio.pairs.length} />
      ))}

      {audio.solos.length > 0 && (
        <div className="pair-section">
          <h3 className="pair-title">Unpaired</h3>
          {audio.solos.map((s) => (
            <Row
              key={s.id}
              label={`${s.label} → ear`}
              value={`${s.dist3d.toFixed(2)} m · ${s.delayMs.toFixed(1)} ms`}
              tone={s.losBlocked ? 'bad' : 'plain'}
              hint={s.losBlocked ? 'No line of sight to the listener.' : 'Select the speaker and use “Stereo pair” to link it with another.'}
            />
          ))}
          {audio.pairs.length === 0 && speakerCount >= 2 && (
            <p className="card-sub">
              Tip: select a speaker and link it to another as a <strong>stereo pair</strong> to get
              phantom-center analysis.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
