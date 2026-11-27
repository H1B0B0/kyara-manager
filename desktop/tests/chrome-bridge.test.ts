import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/main/accounts';
import { ChromeBridge, computeStaggerOffsetMs, isArcadeDoneOrBlocked } from '../src/main/chrome-bridge';

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

function createFakeWc(onDeliver?: (payload: any, wc: any) => void) {
  const sent: Array<{ ch: string; payload: any }> = [];
  const wc: any = {
    isDestroyed: () => false,
    send: (ch: string, payload: any) => {
      sent.push({ ch, payload });
      if (ch === 'km:chrome:deliver-message' && onDeliver) onDeliver(payload, wc);
    }
  };
  return { wc, sent };
}

describe('ChromeBridge multi-account isolation & helpers', () => {
  it('routes runtime messages strictly to the sender account WebContents without cross-account leakage', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-bridge-'));
    tmpDirs.push(dir);
    const store = new AccountStore(dir);
    const acc1 = store.getAccounts()[0];
    const acc2 = store.createAccount('Compte 2');
    const bridge = new ChromeBridge(store);

    const wc1 = createFakeWc((payload) => {
      bridge.resolveReply(payload.reqId, { ok: true, owner: acc1.id });
    });
    const wc2 = createFakeWc((payload) => {
      bridge.resolveReply(payload.reqId, { ok: true, owner: acc2.id });
    });

    bridge.attachHooks({
      getTargetWebContents: (id) => (id === acc1.id ? wc1.wc : wc2.wc),
      ensureGamesWebContents: async (id) => (id === acc1.id ? wc1.wc : wc2.wc),
      closeGamesView: vi.fn(),
      getAllAccountWebContents: (id) => [id === acc1.id ? wc1.wc : wc2.wc],
      openKyaraUrlForAccount: vi.fn(),
      openExternalUrl: vi.fn(),
      notify: vi.fn(),
      onStateDirty: vi.fn()
    });

    const res1 = await bridge.handleRuntimeMessage(acc1.id, 'cockpit', { type: 'km:cmd:get-state' });
    const res2 = await bridge.handleRuntimeMessage(acc2.id, 'cockpit', { type: 'km:cmd:get-state' });

    expect(res1.owner).toBe(acc1.id);
    expect(res2.owner).toBe(acc2.id);
    expect(wc1.sent).toHaveLength(1);
    expect(wc2.sent).toHaveLength(1);
    expect(wc1.sent[0].payload.accountId).toBe(acc1.id);
    expect(wc2.sent[0].payload.accountId).toBe(acc2.id);
    bridge.dispose();
  });

  it('serializes dedicated games farm per account and preserves open games view until last queued run finishes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-bridge-games-'));
    tmpDirs.push(dir);
    const store = new AccountStore(dir);
    const acc1 = store.getAccounts()[0];
    const bridge = new ChromeBridge(store);
    const closeGamesView = vi.fn();

    let calls = 0;
    const gWc = createFakeWc((payload) => {
      calls += 1;
      const delay = calls === 1 ? 30 : 10;
      setTimeout(() => {
        bridge.resolveReply(payload.reqId, { ok: true, arcade: { today: 60, dayCap: 60 }, call: calls });
      }, delay);
    });

    bridge.attachHooks({
      getTargetWebContents: () => gWc.wc,
      ensureGamesWebContents: async () => gWc.wc,
      closeGamesView,
      getAllAccountWebContents: () => [gWc.wc],
      openKyaraUrlForAccount: vi.fn(),
      openExternalUrl: vi.fn(),
      notify: vi.fn(),
      onStateDirty: vi.fn()
    });

    const p1 = bridge.runDedicatedGamesFarm(acc1.id, { type: 'km:cmd:run-games-farm', manual: false });
    const p2 = bridge.runDedicatedGamesFarm(acc1.id, { type: 'km:cmd:run-games-farm', manual: true });
    expect(bridge.isGamesRunActive(acc1.id)).toBe(true);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.call).toBe(1);
    expect(r2.call).toBe(2);
    // First run sees remaining active count > 1 so does not close mid-manual run; second run closes cleanly once done.
    expect(closeGamesView).toHaveBeenCalledTimes(1);
    expect(bridge.isGamesRunActive(acc1.id)).toBe(false);
    bridge.dispose();
  });

  it('computes stagger offsets and arcade limits accurately', () => {
    expect(computeStaggerOffsetMs(0, 3, 15_000)).toBe(0);
    expect(computeStaggerOffsetMs(1, 3, 15_000)).toBe(5_000);
    expect(computeStaggerOffsetMs(2, 3, 15_000)).toBe(10_000);
    expect(isArcadeDoneOrBlocked({ today: 60, dayCap: 60 })).toBe(true);
    expect(isArcadeDoneOrBlocked({ week: 300, weekCap: 300 })).toBe(true);
    expect(isArcadeDoneOrBlocked({ today: 20, dayCap: 60, week: 100, weekCap: 300 })).toBe(false);
  });
});
