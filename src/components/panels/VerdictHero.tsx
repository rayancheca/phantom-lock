import { useEffect, useRef, useState } from 'react';
import { initIgnition, stepIgnition, type IgnitionState, type VerdictView } from './verdict';
import './panels.css';

export interface VerdictHeroProps {
  /** The single aggregate view-model — the ONLY verdict source (see verdict.ts). */
  view: VerdictView;
  /** Named active seat, e.g. "Couch". Passed in; the hero never resolves it itself. */
  seatName: string;
  /** 'sidebar' = pinned/sticky over the scrolling column; 'compare' = static block. */
  variant: 'sidebar' | 'compare';
}

/**
 * Monotonic token that bumps ONLY on a false→true lock edge, used as the headline
 * `key` so the text remounts and replays the one-shot LOCK sweep. StrictMode-safe:
 * the reducer seeds `prevLocked` to the CURRENT value, so mount is never an edge —
 * an already-locked scene shows the resting green headline with NO sweep. Drag
 * frames leave `locked` unchanged, so the effect (dep `[locked]`) does not re-run.
 */
function useLockIgnition(locked: boolean): number {
  const ref = useRef<IgnitionState | null>(null);
  const [token, setToken] = useState(0);
  useEffect(() => {
    const prev = ref.current ?? initIgnition(locked);
    const next = stepIgnition(prev, locked);
    ref.current = next;
    setToken(next.token); // React bails out when the value is unchanged
  }, [locked]);
  return token;
}

/**
 * The verdict readout, extracted onto the `--surface-4` hero rung at `--text-hero`
 * (UX-3). Pure presentational — no scene/seat/engine calls. Mounted FIRST + pinned
 * in the TUNE sidebar column, and verbatim in each ScenarioCompare column, so both
 * show the identical hero. THE LOCK: on the locked transition the headline ignites
 * with the `--signal` gradient swept through the letterforms + a green bloom.
 *
 * Deliberately NOT an aria-live region: the verdict recomputes on every drag frame,
 * which would flood screen readers with queued announcements.
 */
export default function VerdictHero({ view, seatName, variant }: VerdictHeroProps) {
  const token = useLockIgnition(view.locked);
  // The sweep plays ONLY on a real ignition (token bumped AND currently locked) —
  // never on the resting locked style, so loading an already-locked layout is calm.
  const igniting = token > 0 && view.locked;
  const teach =
    view.kind === 'no-speakers'
      ? 'Place a stereo pair to get a phantom-center verdict.'
      : 'Link two HomePods as a stereo pair to read the phantom center.';

  return (
    <section className={`verdict-hero verdict-hero--${variant} verdict-hero--${view.state}`} aria-label="Stereo verdict">
      <p className="verdict-hero__seat">At: {seatName}</p>
      <h2 className="verdict-hero__headline">
        <span key={token} className={`verdict-hero__headline-text${igniting ? ' is-igniting' : ''}`}>
          {view.headline}
        </span>
      </h2>
      <p className="verdict-hero__cause">{view.cause ?? teach}</p>
      <div className="quality-meter" aria-hidden="true">
        <div className="quality-fill" style={{ width: `${Math.round(view.quality * 100)}%` }} />
      </div>
    </section>
  );
}
