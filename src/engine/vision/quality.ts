/**
 * Is this detection worth showing at all?
 *
 * The old pipeline had exactly one honesty check — `walls.length < 2` in the
 * App — so an image with no floorplan in it produced 61 confident walls and the
 * user's only move was Discard. A detector that cannot tell a plan from a photo
 * of a table is not a detector, it is a random-line generator with a progress
 * spinner.
 *
 * Everything here is computable from the image and the candidate output ALONE —
 * no ground truth — which is what lets the same numbers drive both the refusal
 * and the confidence the user is shown.
 *
 * Three signals, chosen because they fail independently:
 *
 *   support     is there ink under each segment? Catches geometry invented by
 *               gap-bridging and corner-joining
 *   structure   do the segments MEET each other? A floorplan is a connected
 *               graph of walls; the edges of furniture, text and photographic
 *               noise are a scatter of unrelated sticks. This is the signal
 *               that separates "a plan" from "an image with lines in it"
 *   explained   how much of the wall-like ink ended up described? Catches the
 *               opposite failure, where a few confident walls hide the fact
 *               that most of the plan was missed
 *
 * ## A FOURTH SIGNAL WAS MEASURED AND REFUTED — do not re-derive it (S31)
 *
 * `docs/ideas.md` Section 13e stood as a P1 for three sessions: a page of four
 * thin furniture OUTLINES is offered 27/27 readings at structure up to 1.000
 * and confidence 1.00, and the obvious diagnosis is that these gates are too
 * loose. S31 measured that diagnosis instead of acting on it, and it is wrong.
 * The gates are not too loose; the information is not in the image.
 *
 * The proposed fourth signal was COHESION — "the walls of a building all belong
 * to one structure, four furniture boxes do not" — in every formulation anyone
 * could construct: length in the largest connected component, its bounding-box
 * span, its footprint containment, enclosure by flood fill, cycle counts,
 * reach-within-D, and eleven more. Every one of them overlaps the protected
 * population. Three independent measurements say so:
 *
 *   - THE THEOREM. Each is a ratio (property of the largest component) /
 *     (the same property of all segments), so on a ONE-COMPONENT reading it is
 *     identically 1.000 whatever the image depicts. Pushing the furniture boxes
 *     together until their edges touch reaches that for free — a perfect score
 *     for the null. It is the same blind spot as `structure`, one level up.
 *   - THE INVERSION. A legitimate terrace of three detached dwellings scores
 *     0.333 where a tight furniture cluster scores 0.522. Ordinary drawings,
 *     the wrong way round.
 *   - THE OWNER'S OWN PLAN. With NO tone perturbation — merely photographed
 *     smaller — it reaches span 0.347, BELOW the attack family's minimum of
 *     0.374. At a 5 % resample it already sits inside the attack band. The
 *     statistic is also bistable rather than drifting: a 12.5 % scale change
 *     moves `apartment-rotated` from 0.566 to 0.873, a swing 3.6x the entire
 *     margin, as the shell flips between arriving in one piece and two.
 *
 * And the naive fix was BUILT, in a throwaway tree, and swept: a cohesion floor
 * breaks 4 tests in `detect.test.ts` at 0.35, 8 at 0.45 and 11 at 0.55 —
 * refusing `apartment-rotated` and `oblique-survey` outright. Even 0.35, far
 * under the 0.522 needed to reach the tight cluster, already refuses a plan
 * photographed at phone resolution. There is no safe value.
 *
 * `__tests__/indistinguishable.test.ts` pins all of this as executable
 * statements. The redirect — the seam where the missing information DOES exist,
 * which is metric scale rather than pixels — is in `docs/ideas.md` Section 13e.
 */

import type { Mask, PxSegment } from './types';
import { segLength } from './types';
import { inkSupport } from './regularize';

/**
 * WHICH gate refused, as data rather than a sentence to string-match.
 *
 * The UI needs this to say something true about what to do next. A refusal for
 * `unstructured` has ALREADY consulted the default reading (that is what
 * `referenceStructure` is), so suggesting the default level back to a 'Careful'
 * user is provably futile — measured over the corpus plus four darkened captures
 * of a real plan, 5 of 5 such suggestions would have failed. `unreadable` is not
 * a claim about the image at all and must carry no suggestion.
 */
export type RefusalCause = 'too-few-lines' | 'broken-lines' | 'unstructured' | 'unreadable';

export interface DetectionQuality {
  /** Overall confidence in [0,1] — what the UI shows. */
  confidence: number;
  /** Set when the result should NOT be offered; a sentence for the user. */
  refusal: string | null;
  /** Which gate produced `refusal`, or null when there is none. */
  cause: RefusalCause | null;
  wallCount: number;
  /** Mean fraction of each segment's length that sits on ink. */
  support: number;
  /** Fraction of segment endpoints that meet another segment. */
  structure: number;
  /** Fraction of wall-ink pixels that lie under some segment. */
  explained: number;
  /** Total detected wall length, px. */
  totalLength: number;
}

export interface QualityOptions {
  /** How near an endpoint must be to another segment to count as joined, px. */
  junctionRadius: number;
  /** Radius used for the ink-support probe, px. */
  supportRadius: number;
  /** How near a segment an ink pixel must be to count as explained, px. */
  explainRadius: number;
  /**
   * `structure` measured on a SECOND reading of the same image, at the default
   * sensitivity — see `detect.ts` for who supplies it and why.
   *
   * The structure gate below is satisfied if EITHER reading clears it, because
   * the refusal is a claim about the image ("this does not look like a
   * floorplan") while `structure` is measured on whichever segments survived
   * the user's own length cut. An image that reads as a plan under any setting
   * IS a plan. Reported `structure` stays the caller's own reading, so the
   * number always describes what is on screen.
   *
   * Omitted means "no second reading" — the gate then sees only the one value,
   * which is the pre-S26 behaviour exactly.
   */
  referenceStructure?: number;
}

/** Minimum walls before a result is worth offering at all. */
export const MIN_WALLS = 3;
/** Below this mean support the geometry is not backed by the image. */
export const MIN_SUPPORT = 0.55;
/**
 * Below this the segments do not form a connected structure.
 *
 * Calibrated against MEASURED legitimate lows, not against taste. It started at
 * 0.40 and that fired on real plans twice:
 *
 *   0.364  the standard apartment photographed 22 degrees off-square
 *   0.313  heavy poche exterior with thin interior partitions — a standard
 *          architectural convention, where one global stroke width fits neither
 *          population
 *
 * Both were 83-96 % correct reads thrown away, which is the failure mode
 * CLAUDE.md names as worse than the problem it prevents. 0.25 keeps a margin
 * under the lower of the two while still refusing the null cases, which produce
 * either no segments at all or a scatter measuring 0.00 — see the `no-plan`
 * and `no-plan-lines` fixtures.
 */
export const MIN_STRUCTURE = 0.25;

/**
 * The `explained` fraction at which a read counts as complete.
 *
 * Deliberately NOT a refusal threshold. Under-reading a plan is a partial
 * answer the user can finish by hand, whereas refusing it hands back nothing —
 * and a refusal that fires on real data is the failure mode this file already
 * had to walk back once. So a low `explained` costs CONFIDENCE, loudly, and
 * still offers the walls it did find.
 */
export const EXPLAINED_FULL = 0.7;

function distToSegment(p: { x: number; y: number }, s: PxSegment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2));
  return Math.hypot(p.x - (s.a.x + dx * t), p.y - (s.a.y + dy * t));
}

/**
 * Fraction of endpoints that touch another segment.
 *
 * A rectangular room scores 1.0 — all eight endpoints are corners. A scatter of
 * unrelated sticks scores near 0. It is deliberately measured on ENDPOINTS
 * rather than crossings: walls in a real plan terminate on each other, whereas
 * lines extracted from a photograph of furniture cross at random interior
 * points as often as not.
 */
export function structureScore(segs: PxSegment[], radius: number): number {
  if (segs.length === 0) return 0;
  let joined = 0;
  let total = 0;
  for (let i = 0; i < segs.length; i++) {
    for (const end of [segs[i].a, segs[i].b]) {
      total++;
      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        if (distToSegment(end, segs[j]) <= radius) {
          joined++;
          break;
        }
      }
    }
  }
  return total === 0 ? 0 : joined / total;
}

/** Fraction of the wall-mask's ink that lies under some detected segment. */
export function explainedFraction(segs: PxSegment[], mask: Mask, radius: number): number {
  const { width: w, height: h, data } = mask;
  let ink = 0;
  let covered = 0;
  // Rasterise the segments into a coverage mask once, rather than testing every
  // ink pixel against every segment.
  const paint = new Uint8Array(w * h);
  const r = Math.max(1, Math.round(radius));
  for (const s of segs) {
    const n = Math.max(1, Math.ceil(segLength(s)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const cx = Math.round(s.a.x + (s.b.x - s.a.x) * t);
      const cy = Math.round(s.a.y + (s.b.y - s.a.y) * t);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          paint[ny * w + nx] = 1;
        }
      }
    }
  }
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    ink++;
    if (paint[i]) covered++;
  }
  return ink === 0 ? 0 : covered / ink;
}

/**
 * Score a candidate detection and decide whether to offer it.
 *
 * `refusal` is a sentence, not a boolean, because the honest answer to "why did
 * nothing happen?" is different in each case and the user's next move depends
 * on which one it was — redraw the photo, or trace by hand.
 */
export function assessDetection(
  segs: PxSegment[],
  wallMask: Mask,
  opts: QualityOptions,
): DetectionQuality {
  const totalLength = segs.reduce((a, s) => a + segLength(s), 0);
  const support =
    segs.length === 0
      ? 0
      : segs.reduce((a, s) => a + inkSupport(s, wallMask, opts.supportRadius) * segLength(s), 0) /
        Math.max(1e-9, totalLength);
  const structure = structureScore(segs, opts.junctionRadius);
  const explained = explainedFraction(segs, wallMask, opts.explainRadius);

  // What makes pooling safe is NOT that a null scores near zero. That looked
  // like a law — `no-plan` and `no-plan-lines` both measure exactly 0.000 at
  // every sensitivity — and it is false. `no-plan-shelf` exists to prove it: a
  // shelf edge meeting an upright is a clean two-segment corner scoring a
  // PERFECT structure, and the first cut of this rule pooled that number into a
  // 'Thorough' reading of loose sticks and offered 11 walls for an image with no
  // floorplan in it.
  //
  // Safety comes from the CALLER instead: `detect.ts` supplies
  // `referenceStructure` only when the reading it came from is itself a
  // detection (>= MIN_WALLS segments). See the derivation there.
  const effectiveStructure = Math.max(structure, opts.referenceStructure ?? structure);

  let refusal: string | null = null;
  let cause: RefusalCause | null = null;
  if (segs.length < MIN_WALLS) {
    refusal = "This image doesn't have enough clear straight lines to read as a floorplan.";
    cause = 'too-few-lines';
  } else if (support < MIN_SUPPORT) {
    refusal = "The lines in this image are too broken up to trace as walls.";
    cause = 'broken-lines';
  } else if (effectiveStructure < MIN_STRUCTURE) {
    refusal = "The lines in this image don't join up into rooms, so it doesn't look like a floorplan.";
    cause = 'unstructured';
  }

  // A blend for the two signals that saturate — a plan with one open wall must
  // not read as half-confident — but `explained` is applied as a FACTOR, not a
  // term.
  //
  // As a term it was almost inert: with support and structure both perfect, a
  // detection that described only 23 % of the plan's wall ink still reported
  // 77 % confidence, because the term contributes at most 0.2. That is the
  // opposite of honest — "most of your floorplan was never read" is exactly
  // what a confidence number is for. As a factor it cannot be outvoted.
  const found = Math.min(1, explained / EXPLAINED_FULL);
  const confidence = Math.max(
    0,
    Math.min(1, (0.6 * support + 0.4 * Math.min(1, structure / 0.8)) * (0.35 + 0.65 * found)),
  );

  return {
    confidence,
    refusal,
    cause,
    wallCount: segs.length,
    support,
    structure,
    explained,
    totalLength,
  };
}
