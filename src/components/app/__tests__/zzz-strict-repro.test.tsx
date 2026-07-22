import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { StrictMode, useRef, useState } from 'react';

afterEach(cleanup);

describe('strictmode ref-mutation-during-render repro', () => {
  it('shows whether a ref set during render is visible to the very next render call', () => {
    const renderInputs: number[] = [];
    const prevRef = { current: null as number | null };
    // module-scope object standing in for a useRef, captured by closure below

    function Comp({ n }: { n: number }) {
      const ref = useRef<number | null>(null);
      renderInputs.push(ref.current ?? -1); // what prev looked like on entry to THIS call
      ref.current = n;
      return <div data-testid="out">{n}</div>;
    }

    function Wrapper() {
      const [n, setN] = useState(1);
      (globalThis as any).__bump = () => setN((x) => x + 1);
      return <Comp n={n} />;
    }

    render(
      <StrictMode>
        <Wrapper />
      </StrictMode>,
    );
    console.log('after mount, renderInputs=', renderInputs);

    act(() => {
      (globalThis as any).__bump();
    });
    console.log('after update, renderInputs=', renderInputs);
    expect(true).toBe(true);
  });
});
