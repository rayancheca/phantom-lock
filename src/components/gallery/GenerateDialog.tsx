import { useEffect, useRef, useState } from 'react';
import Dialog from '../ui/Dialog';
import Icon from '../ui/Icon';
import { drawMiniPlan } from '../canvas/thumb';
import {
  ARCHETYPES,
  ARCHETYPE_IDS,
  formatSeed,
  parseSeed,
  type ArchetypeId,
} from '../../engine/generate';
import type { GeneratorState } from '../app/hooks/useGenerateDesign';
import './generate-dialog.css';

/**
 * "Generate a design" — pick a shape, see it, reroll until you like it.
 *
 * Not one click and not a knob-heavy form. One click gives the user no way to
 * ask for something different; a form asks them to specify a home they have not
 * seen. The measured cost makes the middle option available — 3.9 ms mean,
 * 18.5 ms worst per design — so a reroll is instant and a live preview is free.
 *
 * NOTHING here touches the store. The preview renders a `Scene` the generator
 * returned; only "Create design" commits.
 */

interface Props {
  state: GeneratorState;
  onArchetype: (id: ArchetypeId) => void;
  onSeed: (seed: number) => void;
  onReroll: () => void;
  onKeep: () => void;
  onClose: () => void;
}

export default function GenerateDialog({ state, onArchetype, onSeed, onReroll, onKeep, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seedText, setSeedText] = useState(() => formatSeed(state.seed));
  const arch = ARCHETYPES[state.archetype];
  const { scene } = state.result;

  // `drawMiniPlan` sizes from `canvas.clientWidth` and early-returns at 0, so
  // it must paint into a MOUNTED canvas — the S16 lesson that `renderScene` is
  // offscreen-safe and this one is not.
  useEffect(() => {
    if (canvasRef.current) drawMiniPlan(canvasRef.current, scene, { allSeats: true });
  }, [scene]);

  /**
   * Mirror the seed into the field ONLY when the field does not already mean
   * that seed.
   *
   * The naive `setSeedText(formatSeed(state.seed))` is a keystroke-eating bug,
   * not a style point: typing commits the seed, the commit re-runs this effect,
   * and the effect overwrites the half-typed value with its zero-padded 8-digit
   * form. Typing "1", "2", "3", "4" produced "00000001" -> "000000012" ->
   * "0000000123" -> "00000001234", after which `parseSeed` rejects 9+ chars and
   * the field can never recover. Only an atomic paste worked — which broke the
   * one thing the seed exists for.
   */
  useEffect(() => {
    setSeedText((cur) => (parseSeed(cur) === state.seed ? cur : formatSeed(state.seed)));
  }, [state.seed]);

  const rooms = scene.rooms ?? [];
  const speakers = scene.speakers.length;

  return (
    <Dialog title="Generate a design" onClose={onClose}>
      <div className="generate-body">
        <fieldset className="generate-shapes">
          <legend>Shape</legend>
          <div className="preset-row generate-chips">
            {ARCHETYPE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`btn ${state.archetype === id ? 'btn-active' : ''}`}
                aria-pressed={state.archetype === id}
                onClick={() => onArchetype(id)}
              >
                {ARCHETYPES[id].label}
              </button>
            ))}
          </div>
          <p className="card-sub">{arch.blurb}</p>
        </fieldset>

        <div className="generate-preview">
          <canvas ref={canvasRef} className="generate-thumb" aria-hidden="true" />
          {/* The canvas is decorative; this is the accessible description of
              the same thing, so the preview is not meaning that exists only in
              pixels. */}
          <p className="generate-summary">
            <strong>{state.result.name}</strong> — {rooms.map((r) => r.name).join(' · ') || 'one room'}
            {'. '}
            {speakers === 2
              ? 'Opens with a stereo pair that locks.'
              : 'No stereo pair fits this one — Suggest placement will help.'}
            {state.result.skipped.length > 0 && (
              <>
                {' '}
                {state.result.skipped.length} piece
                {state.result.skipped.length === 1 ? '' : 's'} of furniture had nowhere to go — reroll or
                pick a larger shape.
              </>
            )}
          </p>
        </div>

        <label className="field generate-seed">
          <span>Seed</span>
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            value={seedText}
            onChange={(e) => {
              setSeedText(e.target.value);
              const parsed = parseSeed(e.target.value);
              if (parsed !== null) onSeed(parsed);
            }}
          />
        </label>
        <p className="card-sub">
          Every design has a seed. Keep one and you can type it back in to get exactly this design
          again.
        </p>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ok" onClick={onKeep}>
            <Icon name="check" size={13} />
            Create design
          </button>
          <button type="button" className="btn" onClick={onReroll}>
            <Icon name="redo" size={13} />
            Reroll
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
