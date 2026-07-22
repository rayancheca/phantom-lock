/**
 * The off-screen text mirror (S7 / deliverable 2).
 *
 * TWO regions, deliberately, because the two kinds of change have opposite
 * timing requirements:
 *
 *  - `selection` is DISCRETE and user-initiated (pressing `n`). It must be
 *    near-immediate; debouncing it by 700 ms would make cycling feel broken.
 *  - `readout` is CONTINUOUS (the verdict recomputes on every drag frame). It
 *    must be settled, or it floods.
 *
 * Merging them would force one of the two into the wrong cadence — and putting
 * the selection text inside the `aria-atomic` readout would re-read the whole
 * inventory on every `n` press.
 *
 * `VerdictHero` stays NOT a live region (it is the visual readout and recomputes
 * per frame); this is the spoken one.
 */
interface LiveAnnouncerProps {
  /** Settled scene/verdict prose. Empty until the first real change. */
  readout: string;
  /** "Wall, 3.20 m, 7 of 24" — the current selection, announced immediately. */
  selection: string;
}

export default function LiveAnnouncer({ readout, selection }: LiveAnnouncerProps) {
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {selection}
      </div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {readout}
      </div>
    </>
  );
}
