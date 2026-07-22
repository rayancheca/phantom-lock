import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * A local axe assertion (S7 / deliverable 4).
 *
 * Hand-rolled rather than pulling in `jest-axe` (which drags in
 * jest-matcher-utils/chalk/lodash.merge and pins an older axe-core) or
 * `vitest-axe` (0.x, unmaintained). The matcher is ~15 lines.
 */

/**
 * `color-contrast` is DISABLED, and this is a limitation to be honest about
 * rather than a shortcut.
 *
 * Every colour in this design system is a `var(--token)`, and jsdom does not
 * resolve custom properties — `getComputedStyle(el).color` returns the literal
 * string `"var(--text-3)"`. axe's contrast rule cannot compute anything from
 * that; it lands in `incomplete` with an internal error. That is exactly why
 * deliverable (3) is a separate node-environment token test that reads the real
 * stylesheets: `src/styles/__tests__/contrast.test.ts`.
 */
const DISABLED = {
  'color-contrast': { enabled: false },
} satisfies axe.RuleObject;

/**
 * Rules that only make sense for a WHOLE page. A component rendered standalone
 * into a bare container legitimately has no <main>, no <h1> and no landmark
 * wrapper, so running these against a subtree reports harness artefacts as
 * defects — and the honest response to that is to scope them, not to silently
 * disable them everywhere.
 */
const PAGE_LEVEL_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function report(results: axe.AxeResults): void {
  if (results.violations.length === 0) return;
  const detail = results.violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `      ${n.html}\n      ${n.failureSummary ?? ''}`).join('\n');
      return `  [${v.impact ?? 'n/a'}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join('\n\n');
  expect.fail(`axe found ${results.violations.length} violation(s):\n\n${detail}`);
}

/** Audit a component SUBTREE against the WCAG rule set only. */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  report(
    await axe.run(container, {
      runOnly: { type: 'tag', values: PAGE_LEVEL_TAGS },
      rules: DISABLED,
    }),
  );
}

/**
 * Audit the WHOLE document, including the page-structure rules a subtree run
 * cannot meaningfully evaluate (heading order, landmark uniqueness, duplicate
 * banners, region coverage).
 */
export async function expectNoAxeViolationsOnPage(): Promise<void> {
  report(
    await axe.run(document, {
      rules: {
        ...DISABLED,
        // Deprecated and off by default in axe-core 4.12, but the S7 canvas work
        // introduces static IDs used as aria-describedby targets, so duplicates
        // must be caught.
        'duplicate-id-active': { enabled: true },
      },
    }),
  );
}
