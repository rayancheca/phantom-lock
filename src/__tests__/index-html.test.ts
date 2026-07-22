import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `index.html` is the one file no component test can see: React never renders
 * `<html>` or `<title>`, and the jsdom test environment STUBS both (see
 * `src/test/a11y-env.ts`) so that a document-scoped axe run does not report the
 * bare vitest shell as an app defect.
 *
 * That stub is a hole: it means axe can never fail on a regression in the real
 * file. These assertions close it by reading the shipped file off disk.
 */
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('was actually read (guards against a vacuous pass)', () => {
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('<html');
  });

  it('declares a page language (WCAG 3.1.1) matching the jsdom stub', () => {
    expect(html).toMatch(/<html[^>]*\blang="en"/);
  });

  it('has the title the jsdom stub mirrors (WCAG 2.4.2)', () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
    expect(title).toBe('Phantom Lock — 2D Acoustic Ray Lab');
  });

  it('does not disable pinch-zoom (WCAG 1.4.4)', () => {
    const viewport = /<meta[^>]*name="viewport"[^>]*>/.exec(html)?.[0] ?? '';
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1/);
  });
});
