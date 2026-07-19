import type { TraceResult } from '../../engine/types';
import type { AudioMetrics, PairMetrics } from '../../engine/stereo';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  audio: AudioMetrics;
  trace: TraceResult;
  speakerCount: number;
  tvAnchor: boolean;
  onSuggest: () => void;
}

type Tone = 'ok' | 'warn' | 'bad' | 'plain';

function Row({ label, value, tone = 'plain', hint }: { label: string; value: string; tone?: Tone; hint?: string }) {
  return (
    <div className="metric-row" title={hint}>
      <span className="metric-label">{label}</span>
      <span className={`metric-value tone-${tone}`}>{value}</span>
    </div>
  );
}

/** A metric with a meter bar: fill shows where the value sits against its
 *  audible threshold, colored by the same tone as the number. */
function MeterRow({
  label,
  value,
  tone,
  fraction,
  hint,
}: {
  label: string;
  value: string;
  tone: Tone;
  fraction: number;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="metric-row">
        <span className="metric-label">{label}</span>
        <span className={`metric-value tone-${tone}`}>{value}</span>
      </div>
      <div className="meter" aria-hidden="true">
        <div
          className={`meter-fill tone-${tone === 'plain' ? 'ok' : tone}`}
          style={{ width: `${Math.round(Math.min(1, Math.max(0.04, fraction)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** One plain-English sentence naming the dominant problem (or the win). */
function causeSentence(pair: PairMetrics, blockedA: boolean | undefined, blockedB: boolean | undefined, tvAnchor: boolean): string {
  if (pair.modelMismatch) {
    return 'These two are different models — Apple won’t stereo-pair a HomePod with a mini. Unpair or swap one.';
  }
  if (blockedA && blockedB) return 'Neither speaker can see your ears — only reflections arrive. Clear the paths first.';
  if (blockedA) return `${pair.aLabel} has no line of sight to your ears — move it, or lower whatever blocks it.`;
  if (blockedB) return `${pair.bLabel} has no line of sight to your ears — move it, or lower whatever blocks it.`;

  if (pair.locked) {
    return tvAnchor && pair.tv
      ? 'Equal paths, a 60° triangle, and the image lands dead-center on the TV.'
      : 'Equal paths and a 60° triangle — the phantom center sits right where it should.';
  }

  const nearer = pair.dA < pair.dB ? pair.aLabel : pair.bLabel;
  const farther = pair.dA < pair.dB ? pair.bLabel : pair.aLabel;
  if (pair.itdMs > 0.3) {
    return `The image pulls hard toward ${nearer} — its sound arrives ${pair.itdMs.toFixed(2)} ms earlier. Pull ${nearer} back or bring ${farther} closer.`;
  }
  if (tvAnchor && pair.tv && !pair.tv.aligned) {
    return `The phantom center misses the TV by ${(pair.tv.offAxis * 100).toFixed(0)} cm — slide the pair (or the TV) until they share an axis.`;
  }
  if (Math.abs(pair.angleDeg - 60) > 15) {
    return pair.angleDeg < 60
      ? `The pair only subtends ${pair.angleDeg.toFixed(0)}° at your head — widen it toward 60° for a real stereo stage.`
      : `The pair subtends ${pair.angleDeg.toFixed(0)}° — that’s wider than the 60° reference; pull the speakers together or sit farther back.`;
  }
  if (pair.itdMs > 0.1) {
    return `${nearer} arrives ${pair.itdMs.toFixed(2)} ms early — a few centimetres of nudging will centre the image.`;
  }
  if (Math.abs(pair.ildDb) > 1.5) {
    const louder = pair.ildDb > 0 ? pair.aLabel : pair.bLabel;
    return `${louder} is ${Math.abs(pair.ildDb).toFixed(1)} dB louder at your seat — Match volumes fixes the level (timing is separate).`;
  }
  return 'Close — nudge a speaker or your seat a few centimetres and watch the meters.';
}

function PairSection({ pair, trace, tvAnchor }: { pair: PairMetrics; trace: TraceResult; tvAnchor: boolean }) {
  const state = pair.locked ? 'locked' : pair.quality > 0.55 ? 'close' : 'searching';
  const stateText = state === 'locked' ? 'Phantom center locked' : state === 'close' ? 'Almost there' : 'No lock yet';

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

  return (
    <div className="pair-section">
      <h3 className="pair-title">
        Pair {pair.aLabel} + {pair.bLabel}
      </h3>
      {/* Deliberately not a live region: it recomputes on every drag frame,
          which would flood screen readers with queued announcements. */}
      <div className={`verdict verdict-${state}`}>
        <span className="verdict-state">{stateText}</span>
        <p className="verdict-cause">{causeSentence(pair, blockedA, blockedB, tvAnchor)}</p>
        <div className="quality-meter" aria-hidden="true">
          <div className="quality-fill" style={{ width: `${Math.round(pair.quality * 100)}%` }} />
        </div>
      </div>

      <MeterRow
        label="Timing (ITD)"
        value={`${pair.itdMs.toFixed(2)} ms`}
        tone={itdTone}
        fraction={pair.itdMs / 0.6}
        hint="Inter-channel delay at your head. Above ~0.1 ms the image starts pulling toward the nearer HomePod; 1 ms sounds fully one-sided."
      />
      <MeterRow
        label="Level balance"
        value={balance}
        tone={ildTone}
        fraction={Math.abs(pair.ildDb) / 4}
        hint="Loudness difference at your seat. Volume trim can fix this — it can never fix timing."
      />
      <MeterRow
        label="Listening angle"
        value={`${pair.angleDeg.toFixed(0)}° / 60°`}
        tone={angleTone}
        fraction={angleOff / 30}
        hint="Angle the pair subtends at your head. 60° = equilateral reference."
      />
      {pair.tv && (
        <MeterRow
          label="TV on axis"
          value={`${(pair.tv.offAxis * 100).toFixed(0)} cm off`}
          tone={pair.tv.aligned ? 'ok' : 'bad'}
          fraction={Math.min(1, pair.tv.offAxis / 0.6)}
          hint="Distance from the TV to the pair's centre axis. Cinema mode wants the image on the screen."
        />
      )}

      <details className="metric-details">
        <summary>Distances & detail</summary>
        <Row label={`${pair.aLabel} → ear`} value={`${pair.dA.toFixed(2)} m`} hint="True 3D distance including speaker and ear height." />
        <Row label={`${pair.bLabel} → ear`} value={`${pair.dB.toFixed(2)} m`} />
        <Row label="Speaker base" value={`${pair.base.toFixed(2)} m`} />
        <Row
          label="Path mismatch"
          value={`${(pair.pathDiff * 100).toFixed(1)} cm`}
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

export default function MetricsPanel({ audio, trace, speakerCount, tvAnchor, onSuggest }: Props) {
  if (speakerCount === 0) {
    return (
      <section className="card" aria-label="Audio metrics">
        <h2>Audio</h2>
        <p className="card-sub">
          No speakers yet. Place them one by one with the speaker tool (<kbd>5</kbd>), or let the
          optimizer find spots for you.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={onSuggest}>
          <Icon name="sparkles" size={14} />
          Suggest placement
        </button>
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
        <PairSection key={`${pair.aId}-${pair.bId}`} pair={pair} trace={trace} tvAnchor={tvAnchor} />
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
