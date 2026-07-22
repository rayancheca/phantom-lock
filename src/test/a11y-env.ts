/**
 * jsdom setup for the `dom` test project (S7 / deliverable 4).
 *
 * Only the stubs the app genuinely needs are here — each one is justified,
 * because a stub that is not required hides real behaviour.
 */

// Tell React this is an act() environment, so state updates from dispatched
// events are flushed synchronously instead of warning and leaking into the next
// assertion.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// `ResizeObserver` is THE mandatory stub: SimCanvas constructs one at mount and
// jsdom does not implement it, so without this the tree does not render at all.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no matchMedia. `??=` rather than an `in` check: the key exists on
// the jsdom global with an `undefined` value, so `'matchMedia' in globalThis`
// is true while calling it throws.
globalThis.matchMedia ??= ((query: string) => ({
  media: query,
  matches: false,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof globalThis.matchMedia;

// jsdom's canvas has no 2D context. Every call site in the repo already
// null-checks, so returning null exercises the real guards instead of pulling in
// a native canvas dependency. NOTE: this silences jsdom's "Not implemented"
// stderr — it does NOT make axe's color-contrast rule work (that rule is
// disabled explicitly; see axe.ts for why).
HTMLCanvasElement.prototype.getContext =
  (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Used by the plan-image export path.
URL.createObjectURL ??= (() => 'blob:test') as unknown as typeof URL.createObjectURL;

// Node 25 ships an experimental built-in `localStorage` that shadows jsdom's and
// is NOT a full Storage (no `.clear`). The app reads localStorage on boot
// (`isPristineOrigin`, the legacy-store migration), so give the tests a real
// in-memory one rather than letting the runtime's half-implementation through.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

// Mirror index.html. vitest's jsdom shell is built from a bare `<!DOCTYPE html>`
// with no lang and no title, so a document-scoped axe run would otherwise report
// `html-has-lang` and `document-title` violations that are artefacts of the test
// harness rather than defects in the app.
//
// Because these are STUBBED, axe can never catch a regression in the real file —
// so `src/__tests__/index-html.test.ts` reads index.html off disk and asserts
// these exact values. Keep the two in sync; the test enforces it.
document.documentElement.lang = 'en';
document.title = 'Phantom Lock — 2D Acoustic Ray Lab';
