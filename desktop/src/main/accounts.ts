import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AccountMode, DesktopConfig, KyaraAccount } from '../shared/types';

export type StorageArea = 'local' | 'session';
export type StorageChanges = Record<string, { oldValue?: any; newValue?: any }>;
export type StorageChangeListener = (accountId: string, area: StorageArea, changes: StorageChanges) => void;

const DEFAULT_CONFIG: DesktopConfig = {
  preventSleep: true,
  minimizeToTray: true,
  autoInstallUpdates: true,
  selectedAccountId: null
};

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function atomicWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/** Persistent multi-account registry and isolated per-account Chrome storage areas. */
export class AccountStore {
  private readonly accountsFile: string;
  private readonly configFile: string;
  private readonly accountsDir: string;
  private accounts: KyaraAccount[] = [];
  private config: DesktopConfig = { ...DEFAULT_CONFIG };
  private localCache = new Map<string, Record<string, any>>();
  private sessionCache = new Map<string, Record<string, any>>();
  private listeners = new Set<StorageChangeListener>();

  constructor(baseDir: string) {
    this.accountsFile = path.join(baseDir, 'accounts.json');
    this.configFile = path.join(baseDir, 'desktop-config.json');
    this.accountsDir = path.join(baseDir, 'accounts');
    this.load();
  }

  private load(): void {
    const rawAccounts = safeReadJson<KyaraAccount[]>(this.accountsFile, []);
    this.accounts = Array.isArray(rawAccounts) && rawAccounts.length > 0
      ? rawAccounts.filter((a) => a && typeof a.id === 'string')
      : [this.makeDefaultAccount('Compte 1')];
    const rawCfg = safeReadJson<Partial<DesktopConfig>>(this.configFile, {});
    this.config = { ...DEFAULT_CONFIG, ...rawCfg };
    if (!this.config.selectedAccountId || !this.accounts.some((a) => a.id === this.config.selectedAccountId)) {
      this.config.selectedAccountId = this.accounts[0].id;
    }
    if (!fs.existsSync(this.accountsFile)) {
      atomicWriteJson(this.accountsFile, this.accounts);
    }
  }

  private makeDefaultAccount(name: string): KyaraAccount {
    return {
      id: `acc-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim() || 'Compte Kyara',
      mode: 'silent',
      createdAt: Date.now()
    };
  }

  onStorageChanged(listener: StorageChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChanges(accountId: string, area: StorageArea, changes: StorageChanges): void {
    if (Object.keys(changes).length === 0) return;
    for (const listener of this.listeners) {
      try { listener(accountId, area, changes); } catch {}
    }
  }

  getAccounts(): KyaraAccount[] {
    return this.accounts.map((a) => ({ ...a }));
  }

  getAccount(id: string): KyaraAccount | undefined {
    const found = this.accounts.find((a) => a.id === id);
    return found ? { ...found } : undefined;
  }

  createAccount(name: string): KyaraAccount {
    const label = name.trim() || `Compte ${this.accounts.length + 1}`;
    const acc = this.makeDefaultAccount(label);
    this.accounts.push(acc);
    this.config.selectedAccountId = acc.id;
    atomicWriteJson(this.accountsFile, this.accounts);
    atomicWriteJson(this.configFile, this.config);
    return { ...acc };
  }

  updateAccount(id: string, patch: { name?: string; mode?: AccountMode }): KyaraAccount | null {
    const idx = this.accounts.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const next = { ...this.accounts[idx] };
    if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
    if (patch.mode && ['silent', 'hybrid', 'manual'].includes(patch.mode)) next.mode = patch.mode;
    this.accounts[idx] = next;
    atomicWriteJson(this.accountsFile, this.accounts);
    return { ...next };
  }

  deleteAccount(id: string): boolean {
    if (this.accounts.length <= 1) return false;
    const idx = this.accounts.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    this.accounts.splice(idx, 1);
    this.localCache.delete(id);
    this.sessionCache.delete(id);
    const dir = path.join(this.accountsDir, id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    if (this.config.selectedAccountId === id) {
      this.config.selectedAccountId = this.accounts[0]?.id ?? null;
      atomicWriteJson(this.configFile, this.config);
    }
    atomicWriteJson(this.accountsFile, this.accounts);
    return true;
  }

  getConfig(): DesktopConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<DesktopConfig>): DesktopConfig {
    this.config = { ...this.config, ...patch };
    if (this.config.selectedAccountId && !this.accounts.some((a) => a.id === this.config.selectedAccountId)) {
      this.config.selectedAccountId = this.accounts[0]?.id ?? null;
    }
    atomicWriteJson(this.configFile, this.config);
    return { ...this.config };
  }

  private getAreaMap(accountId: string, area: StorageArea): Record<string, any> {
    if (area === 'session') {
      let mem = this.sessionCache.get(accountId);
      if (!mem) {
        mem = {};
        this.sessionCache.set(accountId, mem);
      }
      return mem;
    }
    let data = this.localCache.get(accountId);
    if (!data) {
      const storageFile = path.join(this.accountsDir, accountId, 'storage.json');
      data = safeReadJson<Record<string, any>>(storageFile, {});
      this.localCache.set(accountId, data);
    }
    return data;
  }

  private persistLocal(accountId: string): void {
    const data = this.localCache.get(accountId) || {};
    atomicWriteJson(path.join(this.accountsDir, accountId, 'storage.json'), data);
  }

  storageGet(accountId: string, area: StorageArea, keys?: string | string[] | Record<string, any> | null): Record<string, any> {
    const store = this.getAreaMap(accountId, area);
    if (keys === undefined || keys === null) return structuredClone(store);
    if (typeof keys === 'string') {
      return keys in store ? { [keys]: structuredClone(store[keys]) } : {};
    }
    if (Array.isArray(keys)) {
      const out: Record<string, any> = {};
      for (const k of keys) {
        if (k in store) out[k] = structuredClone(store[k]);
      }
      return out;
    }
    const out: Record<string, any> = {};
    for (const [k, def] of Object.entries(keys)) {
      out[k] = k in store ? structuredClone(store[k]) : structuredClone(def);
    }
    return out;
  }

  storageSet(accountId: string, area: StorageArea, items: Record<string, any>): void {
    const store = this.getAreaMap(accountId, area);
    const changes: StorageChanges = {};
    for (const [k, v] of Object.entries(items || {})) {
      const oldValue = k in store ? structuredClone(store[k]) : undefined;
      if (v === undefined) {
        if (k in store) {
          delete store[k];
          changes[k] = { oldValue, newValue: undefined };
        }
      } else {
        const cloned = structuredClone(v);
        store[k] = cloned;
        changes[k] = { oldValue, newValue: structuredClone(cloned) };
      }
    }
    if (area === 'local' && Object.keys(changes).length > 0) this.persistLocal(accountId);
    this.emitChanges(accountId, area, changes);
  }

  storageRemove(accountId: string, area: StorageArea, keys: string | string[]): void {
    const store = this.getAreaMap(accountId, area);
    const list = Array.isArray(keys) ? keys : [keys];
    const changes: StorageChanges = {};
    for (const k of list) {
      if (k in store) {
        changes[k] = { oldValue: structuredClone(store[k]), newValue: undefined };
        delete store[k];
      }
    }
    if (area === 'local' && Object.keys(changes).length > 0) this.persistLocal(accountId);
    this.emitChanges(accountId, area, changes);
  }
}
