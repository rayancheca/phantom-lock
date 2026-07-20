import Icon from '../ui/Icon';
import './panels.css';

interface Props {
  tvAnchor: boolean;
  onSetTvAnchor: (on: boolean) => void;
  onSuggest: () => void;
}

/**
 * TUNE-context actions, re-homed out of the global header (they were inert in
 * DESIGN): the single TV/Music writer (MetricsPanel + OptimizeDialog only mirror
 * it now) and Suggest placement. Compare is NOT here — it already lives in
 * ListenerCard + the gallery; the header Compare was the duplicate and is gone.
 */
export default function TuneToolsCard({ tvAnchor, onSetTvAnchor, onSuggest }: Props) {
  return (
    <section className="card tune-tools" aria-label="Tune tools">
      <div className="tune-tools-row">
        <div className="mode-toggle" role="group" aria-label="Listening mode">
          <button
            type="button"
            className={tvAnchor ? 'mode-on' : ''}
            aria-pressed={tvAnchor}
            title="Cinema: the phantom center must land on the TV — lock and sweet spot track the TV axis"
            onClick={() => onSetTvAnchor(true)}
          >
            <Icon name="film" size={14} />
            TV
          </button>
          <button
            type="button"
            className={!tvAnchor ? 'mode-on' : ''}
            aria-pressed={!tvAnchor}
            title="Music: the image anchors on you — the TV is ignored by locks and sweet spots"
            onClick={() => onSetTvAnchor(false)}
          >
            <Icon name="music" size={14} />
            Music
          </button>
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={onSuggest}>
        <Icon name="sparkles" size={15} />
        Suggest placement
      </button>
    </section>
  );
}
