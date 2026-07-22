import type { Scene, Selection, SpeakerModel, TraceResult } from '../../engine/types';
import { canPair, dist3dTo, SPEAKER_MODELS } from '../../engine/speakers';
import { speakerColors } from '../canvas/render';
import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  scene: Scene;
  trace: TraceResult;
  selection: Selection;
  onSelect: (id: string) => void;
  onAddModel: (m: SpeakerModel) => void;
  onMatchVolumes: () => void;
  onSetPair: (id: string, partnerId: string | null) => void;
}

export default function SpeakersCard({
  scene,
  trace,
  selection,
  onSelect,
  onAddModel,
  onMatchVolumes,
  onSetPair,
}: Props) {
  const partnerOf = new Map<string, string>();
  for (const [a, b] of scene.pairs) {
    const la = scene.speakers.find((s) => s.id === a)?.label;
    const lb = scene.speakers.find((s) => s.id === b)?.label;
    if (la && lb) {
      partnerOf.set(a, lb);
      partnerOf.set(b, la);
    }
  }
  const blockedById = new Map(trace.bySpeaker.map((s) => [s.id, s.direct.blocked]));
  const colors = speakerColors(scene);

  // "Pair these two": the fast path to a phantom center. Only offered when there
  // are EXACTLY two unpaired speakers and they are the same model (Apple can't
  // stereo-pair a HomePod with a mini). This unblocks the verdict without hunting
  // the Inspector dropdown.
  const unpaired = scene.speakers.filter((s) => !partnerOf.has(s.id));
  const pairable = unpaired.length === 2 && canPair(unpaired[0], unpaired[1]);

  return (
    <section className="card" aria-label="Speakers">
      <h2>Speakers</h2>
      {scene.speakers.length === 0 && (
        <p className="card-sub">None yet — add one below, then click the canvas to place it.</p>
      )}
      <ul className="speaker-list">
        {scene.speakers.map((sp) => {
          const spec = SPEAKER_MODELS[sp.model];
          const d = dist3dTo(sp, scene.listener);
          const selected = selection?.type === 'speaker' && selection.id === sp.id;
          const outOfRange = d < spec.idealMin || d > spec.idealMax;
          return (
            <li key={sp.id}>
              <button
                type="button"
                className={`speaker-row ${selected ? 'speaker-row-active' : ''}`}
                onClick={() => onSelect(sp.id)}
              >
                <span
                  className="speaker-dot"
                  style={{ background: `rgb(${colors.get(sp.id) ?? '148,163,184'})` }}
                  aria-hidden="true"
                />
                <strong>{sp.label}</strong>
                <span className="speaker-model">{spec.short}</span>
                <span className={`speaker-dist ${outOfRange ? 'tone-warn' : ''}`}>
                  {d.toFixed(2)} m
                  {/* The amber tint is the ONLY signal that this distance is
                      outside the model's ideal range — colour alone (WCAG 1.4.1). */}
                  {outOfRange && <span className="sr-only">, outside the ideal range</span>}
                </span>
                {sp.trimDb !== 0 && (
                  <span className="speaker-trim">
                    {sp.trimDb > 0 ? '+' : ''}
                    {sp.trimDb.toFixed(1)} dB
                  </span>
                )}
                {partnerOf.has(sp.id) && (
                  <span className="speaker-pair" title={`Stereo pair with ${partnerOf.get(sp.id)}`}>
                    <Icon name="link" size={11} /> {partnerOf.get(sp.id)}
                  </span>
                )}
                {blockedById.get(sp.id) && (
                  /* Was an aria-hidden icon + red + a hover title: ZERO
                     accessible content, and invisible on touch. This is the
                     single most important thing the row can tell you. */
                  <span className="tone-bad" title="No line of sight to the listener">
                    <Icon name="warning" size={13} />
                    <span className="sr-only">, no line of sight to the listener</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {pairable && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          title={`Link ${unpaired[0].label} and ${unpaired[1].label} as a left + right stereo pair`}
          onClick={() => onSetPair(unpaired[0].id, unpaired[1].id)}
        >
          <Icon name="link" size={14} />
          Pair {unpaired[0].label} + {unpaired[1].label} as stereo
        </button>
      )}
      <div className="preset-row">
        <button type="button" className="btn" onClick={() => onAddModel('homepod')}>
          + HomePod
        </button>
        <button type="button" className="btn" onClick={() => onAddModel('homepod-mini')}>
          + mini
        </button>
        {scene.speakers.length >= 2 && (
          <button
            type="button"
            className="btn"
            title="Turn louder/nearer speakers down so everything lands at your seat at the same level"
            onClick={onMatchVolumes}
          >
            Match volumes
          </button>
        )}
      </div>
    </section>
  );
}
