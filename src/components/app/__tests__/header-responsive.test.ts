import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * S35 — the header's narrow-width contract, pinned against the SHIPPED CSS.
 *
 * `ideas.md` §17b: `.room-trigger` is the only control that opens the gallery,
 * and it was almost entirely covered by the DESIGN/TUNE switch below ~817px.
 * Measured with `document.elementFromPoint` at 1px resolution, the widest
 * unoccluded strip was 0px at 320 (SC 2.4.11 Focus Not Obscured — it is the
 * first Tab stop) and 22px at 390 (SC 2.5.8 Target Size, which needs 24).
 *
 * WHY THESE TESTS READ CSS FROM DISK, AND WHY THAT IS THE ONLY OPTION HERE.
 * jsdom ignores `@media` entirely and reports every rect as 0x0, so no jsdom
 * test can evaluate a responsive layout or a hit test — the real proof is the
 * CDP harness in `docs/sessions/S35/`, which is gitignored. What a committed
 * test CAN do is pin the load-bearing DECLARATIONS, so that a later edit which
 * silently reverts one of them goes red. That is the S34 lesson applied: a test
 * that only measures a constant is documentation; a test that reads the
 * stylesheet and pins the rule is a guard.
 *
 * Every assertion below is here because the OPPOSITE choice was measured and is
 * wrong, not because it looked tidy. Each one names the failure it prevents.
 */

const app = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const panels = readFileSync(new URL('../../panels/panels.css', import.meta.url), 'utf8');
const global = readFileSync(new URL('../../../styles/global.css', import.meta.url), 'utf8');

/** Guard the scan itself: an empty read would make every assertion below vacuous. */
const nonEmpty = (name: string, src: string) => {
  if (src.trim().length < 200) throw new Error(`${name} read as empty/short — the scan is broken`);
  return src;
};
nonEmpty('app.css', app);
nonEmpty('panels.css', panels);
nonEmpty('global.css', global);

/** Strip comments so a rule quoted in prose cannot satisfy an assertion. */
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first `@media (max-width: <px>)` block, comments removed. */
function mediaBlock(css: string, maxWidthPx: number): string | null {
  const src = strip(css);
  const needle = new RegExp(`@media\\s*\\(\\s*max-width:\\s*${maxWidthPx}px\\s*\\)\\s*\\{`, 'g');
  const m = needle.exec(src);
  if (!m) return null;
  // Walk braces from the block's opening `{` so nested rules are included whole.
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index + m[0].length, i);
    }
  }
  return null;
}

/** The declarations of a top-level rule, comments removed. */
function rule(css: string, selector: string): string | null {
  const src = strip(css);
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(src);
  return m ? m[2] : null;
}

describe('S35 · the header must not cover its own gallery trigger (ideas.md §17b)', () => {
  it('THE ROOT CAUSE: .room-trigger declares min-width: 0', () => {
    /*
       `.room-trigger` is a flex item, so its default `min-width: auto` resolves
       to its MIN-CONTENT size. `.room-trigger-name` is `white-space: nowrap`,
       so that min-content is the whole layout name — measured 174.8px, and the
       button was exactly 174.8px wide at 560, 640, 760, 860 AND 1440, i.e. it
       never shrank at any viewport. The ellipsis already on the inner span could
       therefore never engage, because the constraint is one level up: setting
       `min-width: 0` on the NAME was measured to be a complete no-op.
    */
    const r = rule(app, '.room-trigger');
    expect(r, '.room-trigger rule not found in app.css').toBeTruthy();
    expect(r).toMatch(/min-width:\s*0\s*[;}]/);
  });

  it('the switch sheds its labels and its fixed width TOGETHER — neither works alone', () => {
    /*
       Two measured facts make this a pair, not a choice:
         - hiding `.segment-label` alone frees exactly 0px, because
           `.segment-switch--mode` carries `width: min(300px, 40vw)` and is NOT
           content-sized (measured: reach unchanged at every viewport);
         - `width: auto` alone is a REGRESSION at 390px, because the switch's
           max-content (160.4px) exceeds the 156px box it would replace.
       So a future edit that keeps one and drops the other silently re-opens the
       bug while looking like a simplification.
    */
    const block = mediaBlock(app, 480);
    expect(block, 'no @media (max-width: 480px) block in app.css').toBeTruthy();
    expect(block).toMatch(/\.segment-switch--mode\s*\{[^}]*width:\s*auto/);
    expect(block).toMatch(/\.segment-switch--mode\s+\.segment-label\s*\{[^}]*display:\s*none/);
  });

  it('THE ONE THAT MATTERS: the label rule is scoped to --mode, so the SIDEBAR keeps its words', () => {
    /*
       `.segment-label` is shared: `SegmentSwitch` renders it for BOTH
       `variant="mode"` (this header) and `variant="substep"` (the sidebar's
       Build/Furnish switch, which has a full column of room and must keep its
       labels). An unscoped `.segment-label { display: none }` blanks the sidebar
       switch too — and jsdom cannot see it, because it ignores @media.
    */
    const block = mediaBlock(app, 480)!;
    const labelRules = [...block.matchAll(/([^{}]*\.segment-label[^{}]*)\{/g)].map((m) => m[1].trim());
    expect(labelRules.length, 'expected a .segment-label rule in the 480 block').toBeGreaterThan(0);
    for (const sel of labelRules) {
      expect(sel, `unscoped .segment-label rule would blank the sidebar switch: "${sel}"`).toMatch(
        /\.segment-switch--mode\b/,
      );
    }
    // And the sidebar variant really is a separate consumer of that class.
    expect(panels).toMatch(/\.segment-switch--substep/);
  });

  it('the brand is CLIPPED, never display:none — the <h1> must stay in the a11y tree', () => {
    /*
       `.brand` holds the page's only <h1>. `display: none` removes it from the
       accessibility tree, so the narrow layout would have no level-1 heading —
       and NOTHING in this suite could catch it: `shell.a11y.test.tsx` counts DOM
       elements (satisfied by display:none), and the page-wide axe run never
       applies the media query because jsdom ignores @media. Only a real-browser
       axe run would see it. Clipping keeps the heading readable to AT.
    */
    const block = mediaBlock(app, 480)!;
    const brand = /\.brand\s*\{([^}]*)\}/.exec(block);
    expect(brand, 'no .brand rule in the 480 block').toBeTruthy();
    expect(brand![1]).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(brand![1], '.brand must not be display:none — it carries the only <h1>').not.toMatch(
      /display:\s*none/,
    );
  });

  it('the layout NAME is clipped too, never display:none — Icon is aria-hidden', () => {
    /*
       Below ~344px the name box is narrower than one glyph and renders a clipped
       stroke that reads as a rendering glitch, so it is hidden at <=360. It must
       be CLIPPED rather than removed: `Icon` renders `aria-hidden="true"`
       (Icon.tsx), so `display: none` on the name would leave the button with NO
       accessible name at all — an SC 4.1.2 failure introduced BY the fix.
       Clipped, the name still answers "which layout am I in?" for AT users, and
       SC 2.5.3 Label in Name is satisfied vacuously (no visible text remains).
    */
    const block = mediaBlock(app, 360);
    expect(block, 'no @media (max-width: 360px) block in app.css').toBeTruthy();
    const name = /\.room-trigger-name\s*\{([^}]*)\}/.exec(block!);
    expect(name, 'no .room-trigger-name rule in the 360 block').toBeTruthy();
    expect(name![1]).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(name![1], 'display:none would strip the button of its accessible name').not.toMatch(
      /display:\s*none/,
    );
    // Icon really is decorative — this is what makes the above load-bearing.
    const icon = readFileSync(new URL('../../ui/Icon.tsx', import.meta.url), 'utf8');
    expect(icon).toMatch(/aria-hidden="true"/);
  });

  it('the icon-only trigger keeps a real target at the 320px reflow floor', () => {
    /*
       Once the name is clipped the button is padding + a 14px icon = 34px. 40px
       is the house standard, applied by `.topbar-actions .btn` and `.segment`
       right beside it; 24px is the SC 2.5.8 AA floor. Measured, 41px of track is
       available at 320px, so 40 fits with 1px to spare.
    */
    const block = mediaBlock(app, 360)!;
    const trig = /\.room-trigger\s*\{([^}]*)\}/.exec(block);
    expect(trig, 'no .room-trigger rule in the 360 block').toBeTruthy();
    expect(trig![1]).toMatch(/min-width:\s*40px/);
  });

  it('the monogram covers 720px, which is what closes the 561px cliff', () => {
    /*
       Reachability is NOT monotonic in viewport width. The wordmark returned at
       561px and costs 96.6px, so 561 measured 27px of exposed trigger — WORSE
       than 430px (46px). app.css's own comment says the monogram exists "so the
       layout switcher beside it is never squeezed out", which is exactly this
       failure, so the rule's range was extended rather than a new one invented.
       If this drops back to 560, the cliff returns.
    */
    expect(mediaBlock(app, 720), 'no @media (max-width: 720px) block in app.css').toBeTruthy();
    const block = mediaBlock(app, 720)!;
    expect(block).toMatch(/\.wm-full\s*\{[^}]*display:\s*none/);
    expect(block).toMatch(/\.wm-mono\s*\{[^}]*display:\s*inline/);
    // The old 560 breakpoint must be gone, or both fire and the wider one loses.
    const old = mediaBlock(app, 560);
    if (old) expect(old, 'the 560 monogram block still exists — it fights the 720 one').not.toMatch(/\.wm-(full|mono)/);
  });

  it('the mode-switch override outranks panels.css without relying on file order', () => {
    /*
       `.segment-switch--mode { width: min(300px, 40vw) }` lives in panels.css and
       the override lives in app.css. A media query adds NO specificity, so two
       bare `.segment-switch--mode` rules would be decided by import order — which
       depends on the module graph and is not something a stylesheet should bet
       on. Scoping the override under `.topbar` makes it win by specificity.
    */
    expect(panels).toMatch(/\.segment-switch--mode\s*\{[^}]*width:\s*min\(/);
    const block = mediaBlock(app, 480)!;
    const widthRules = [...block.matchAll(/([^{}]*\.segment-switch--mode[^{}]*)\{([^}]*)\}/g)].filter(
      (m) => /width:/.test(m[2]),
    );
    expect(widthRules.length, 'expected a width override for the mode switch').toBeGreaterThan(0);
    for (const m of widthRules) {
      expect(m[1], `override "${m[1].trim()}" must outrank panels.css by specificity`).toMatch(/\.topbar\b/);
    }
  });

  it('the clip technique matches the .sr-only utility it is standing in for', () => {
    /*
       Two rules clip in place of a class because a class cannot be applied by
       media query. Keeping them in step with global.css's `.sr-only` — which
       deliberately retains BOTH legacy `clip` and `clip-path` for older WebKit —
       is what stops them drifting into a subtly different, less compatible hide.
    */
    const sr = rule(global, '.sr-only');
    expect(sr, '.sr-only not found in global.css').toBeTruthy();
    expect(sr!).toMatch(/clip:\s*rect\(/);
    expect(sr!).toMatch(/clip-path:\s*inset\(50%\)/);
    for (const [bp, sel] of [
      [480, '.brand'],
      [360, '.room-trigger-name'],
    ] as const) {
      const decls = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(mediaBlock(app, bp)!)![1];
      expect(decls, `${sel} @${bp} should keep the legacy clip like .sr-only does`).toMatch(/clip:\s*rect\(/);
      expect(decls).toMatch(/position:\s*absolute/);
    }
  });
});
