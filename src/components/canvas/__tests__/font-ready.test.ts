import { describe, expect, it, vi } from 'vitest';
import { repaintOnFontLoad } from '../font-ready';

/** setTimeout(0) macrotask → all queued microtasks (the load().then chain) have run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('repaintOnFontLoad', () => {
  it('loads every spec and calls onReady exactly once', async () => {
    const load = vi.fn((_s: string) => Promise.resolve([] as FontFace[]));
    const onReady = vi.fn();

    repaintOnFontLoad(onReady, ['11px "Geist Mono"', '500 12px "Geist Mono"'], { load });
    await flush();

    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(1, '11px "Geist Mono"');
    expect(load).toHaveBeenNthCalledWith(2, '500 12px "Geist Mono"');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the fontset is undefined (node env / no FontFaceSet)', async () => {
    const onReady = vi.fn();
    const stop = repaintOnFontLoad(onReady, ['11px "Geist Mono"'], undefined);
    await flush();

    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('is a no-op when load is not a function', async () => {
    const onReady = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repaintOnFontLoad(onReady, ['11px "Geist Mono"'], {} as any);
    await flush();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('does not call onReady after cleanup (cancelled before load resolves)', async () => {
    let resolveLoad!: (v: FontFace[]) => void;
    const load = vi.fn(() => new Promise<FontFace[]>((res) => (resolveLoad = res)));
    const onReady = vi.fn();

    const stop = repaintOnFontLoad(onReady, ['11px "Geist Mono"'], { load });
    stop(); // unmount BEFORE the face resolves
    resolveLoad([]); // face finishes loading afterwards
    await flush();

    expect(onReady).not.toHaveBeenCalled();
  });

  it('swallows a rejected load and still repaints once — but warns (not silent)', async () => {
    const load = vi.fn(() => Promise.reject(new Error('font 404')));
    const onReady = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    repaintOnFontLoad(onReady, ['11px "Geist Mono"', '500 12px "Geist Mono"'], { load });
    await flush();

    expect(onReady).toHaveBeenCalledTimes(1); // no unhandled rejection, still fires
    expect(warn).toHaveBeenCalledTimes(2); // one warning per failed spec — never silent
    warn.mockRestore();
  });

  it('logs (does not silently swallow) when onReady itself throws', async () => {
    const load = vi.fn((_s: string) => Promise.resolve([] as FontFace[]));
    const onReady = vi.fn(() => {
      throw new Error('setRedrawTick blew up');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Must not throw synchronously out of the helper.
    expect(() => repaintOnFontLoad(onReady, ['11px "Geist Mono"'], { load })).not.toThrow();
    await flush();

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1); // the outer catch is reachable and loud
    error.mockRestore();
  });
});
