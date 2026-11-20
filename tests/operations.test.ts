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

  it('runs different domain tasks in parallel and queues tasks in the same domain without BUSY rejection', async () => {
    const { runDomainTask } = await import('../src/content/operations');
    const order: string[] = [];
    let releaseBuy1!: () => void;
    let releaseInv!: () => void;

    const buy1 = runDomainTask('market-buy', async () => {
      order.push('buy1:start');
      await new Promise<void>((r) => { releaseBuy1 = r; });
      order.push('buy1:end');
      return 'buy1';
    });
    await vi.waitFor(() => expect(releaseBuy1).toBeTypeOf('function'));

    // Different domain runs immediately while market-buy is still active
    const inv = runDomainTask('inventory', async () => {
      order.push('inv:start');
      await new Promise<void>((r) => { releaseInv = r; });
      order.push('inv:end');
      return 'inv';
    });
    await vi.waitFor(() => expect(releaseInv).toBeTypeOf('function'));
    expect(order).toEqual(['buy1:start', 'inv:start']);

    // Same domain queues instead of throwing BUSY
    const buy2 = runDomainTask('market-buy', async () => {
      order.push('buy2:run');
      return 'buy2';
    });

    releaseInv();
    expect(await inv).toBe('inv');
    releaseBuy1();
    expect(await buy1).toBe('buy1');
    expect(await buy2).toBe('buy2');
    expect(order).toEqual(['buy1:start', 'inv:start', 'inv:end', 'buy1:end', 'buy2:run']);
  });
});
