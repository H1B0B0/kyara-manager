import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/main/accounts';

const tmpDirs: string[] = [];

function makeTempStore(): AccountStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-desktop-acc-'));
  tmpDirs.push(dir);
  return new AccountStore(dir);
}

afterEach(() => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('AccountStore', () => {
  it('initializes one default silent account and isolates per-account local storage across reloads', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'km-desktop-persist-'));
    tmpDirs.push(dir);

    const store1 = new AccountStore(dir);
    const acc1 = store1.getAccounts()[0];
    expect(acc1.mode).toBe('silent');

    const acc2 = store1.createAccount('Compte Alt');
    store1.storageSet(acc1.id, 'local', { settings: { masterEnabled: true, autoBoosterEnabled: true }, secret: 'A' });
    store1.storageSet(acc2.id, 'local', { settings: { masterEnabled: false, autoBoosterEnabled: false }, secret: 'B' });

    const reloaded = new AccountStore(dir);
    expect(reloaded.getAccounts()).toHaveLength(2);
    expect(reloaded.storageGet(acc1.id, 'local', ['secret', 'settings'])).toEqual({
      secret: 'A',
      settings: { masterEnabled: true, autoBoosterEnabled: true }
    });
    expect(reloaded.storageGet(acc2.id, 'local', ['secret', 'settings'])).toEqual({
      secret: 'B',
      settings: { masterEnabled: false, autoBoosterEnabled: false }
    });
  });

  it('scopes onStorageChanged notifications and session storage strictly per account', () => {
    const store = makeTempStore();
    const acc1 = store.getAccounts()[0];
    const acc2 = store.createAccount('Compte 2');
    const events: Array<{ acc: string; area: string; keys: string[] }> = [];
    store.onStorageChanged((acc, area, changes) => {
      events.push({ acc, area, keys: Object.keys(changes) });
    });

    store.storageSet(acc1.id, 'session', { token: 't1' });
    store.storageSet(acc2.id, 'local', { kmDashboard: { me: { chakra: 500 } } });
    store.storageRemove(acc2.id, 'local', 'kmDashboard');

    expect(store.storageGet(acc1.id, 'session', 'token')).toEqual({ token: 't1' });
    expect(store.storageGet(acc2.id, 'session', 'token')).toEqual({});
    expect(events).toEqual([
      { acc: acc1.id, area: 'session', keys: ['token'] },
      { acc: acc2.id, area: 'local', keys: ['kmDashboard'] },
      { acc: acc2.id, area: 'local', keys: ['kmDashboard'] }
    ]);
  });

  it('prevents deleting the last account and updates selectedAccountId safely when deleting another', () => {
    const store = makeTempStore();
    const acc1 = store.getAccounts()[0];
    expect(store.deleteAccount(acc1.id)).toBe(false);

    const acc2 = store.createAccount('Compte 2');
    expect(store.getConfig().selectedAccountId).toBe(acc2.id);
    expect(store.deleteAccount(acc2.id)).toBe(true);
    expect(store.getAccounts()).toHaveLength(1);
    expect(store.getConfig().selectedAccountId).toBe(acc1.id);
    const spy = vi.fn();
    store.onStorageChanged(spy);
    store.storageSet(acc1.id, 'local', { a: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
