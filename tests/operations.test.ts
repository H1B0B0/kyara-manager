import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChrome, mockLocks } from './chrome';

describe('whole-operation exclusion', () => {
  beforeEach(() => { vi.resetModules(); mockChrome(); mockLocks(); });
  it('rejects a second action until the first one finishes and releases after a failure', async () => {
    const { runExclusive } = await import('../src/content/operations');
    let finish: () => void;
    const first = runExclusive(() => new Promise<void>((resolve) => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const duplicate = vi.fn();
    await expect(runExclusive(duplicate)).rejects.toThrow('déjà en cours');
    expect(duplicate).not.toHaveBeenCalled();
    finish!(); await first;
    await expect(runExclusive(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    expect(await runExclusive(async () => 42)).toBe(42);
  });
  it('prevents new actions during an update', async () => {
    const { state } = await import('../src/content/state');
    state.updatePending = true;
    const { runExclusive } = await import('../src/content/operations');
    const action = vi.fn();
    await expect(runExclusive(action)).rejects.toThrow('Mise à jour');
    expect(action).not.toHaveBeenCalled();
  });
});
