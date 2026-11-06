import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sidepanel command delivery', () => {
  beforeEach(() => vi.resetModules());
  it('ignores a second click while a transaction is pending and releases after confirmation', async () => {
    let reply: (value: any) => void;
    const sendMessage = vi.fn((_command: any, callback: (value: any) => void) => { reply = callback; });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { sendCommand } = await import('../src/sidepanel/hooks/useDashboard');
    const first = sendCommand({ type: 'km:cmd:single-recycle', characterId: 1, qty: 1 });
    expect((await sendCommand({ type: 'km:cmd:single-recycle', characterId: 1, qty: 1 })).ok).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    reply!({ ok: true }); await first;
    const next = sendCommand({ type: 'km:cmd:single-recycle', characterId: 1, qty: 1 });
    reply!({ ok: true }); await next;
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
  it('allows reads during a transaction and surfaces a disconnected runtime without throwing', async () => {
    let reply: (value: any) => void;
    const runtime = { sendMessage: vi.fn((command: any, callback: (value: any) => void) => {
      if (command.type === 'km:cmd:refresh') callback({ ok: true });
      else reply = callback;
    }), lastError: null as any };
    vi.stubGlobal('chrome', { runtime });
    const { sendCommand } = await import('../src/sidepanel/hooks/useDashboard');
    const first = sendCommand({ type: 'km:cmd:run-cycle' });
    expect((await sendCommand({ type: 'km:cmd:refresh' })).ok).toBe(true);
    runtime.lastError = { message: 'port closed' };
    reply!(undefined);
    expect(await first).toEqual({ ok: false, error: 'port closed' });
  });
  it('returns a failure and releases the pending action after a synchronous send failure', async () => {
    const sendMessage = vi.fn(() => { throw new Error('Extension context invalidated'); });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const { sendCommand } = await import('../src/sidepanel/hooks/useDashboard');
    expect((await sendCommand({ type: 'km:cmd:run-cycle' })).error).toContain('invalidated');
    await sendCommand({ type: 'km:cmd:run-cycle' });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
