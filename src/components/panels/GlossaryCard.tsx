import { GLOSSARY, GLOSSARY_KEYS } from './glossary';
import './panels.css';

/**
 * The full jargon glossary, reachable from TUNE — UX-4 / Session 16 (item A).
 *
 * A native `<details>` disclosure (keyboard-operable + a visible focus ring for
 * free) listing every term the readout uses. Complements the inline `<Term>`
 * popovers on the spec sheet: the popovers answer "what is THIS number?", this
 * card answers "what do all these words mean?" from one place. Single source of
 * truth is `glossary.ts`, so the two can never drift.
 */
export default function GlossaryCard() {
  return (
    <section className="card" aria-label="Glossary">
      <details className="glossary">
        <summary>What do these mean?</summary>
        <dl className="glossary-list">
          {GLOSSARY_KEYS.map((key) => (
            <div className="glossary-item" key={key}>
              <dt>{GLOSSARY[key].term}</dt>
              <dd>{GLOSSARY[key].def}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
