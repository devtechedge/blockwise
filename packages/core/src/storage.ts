import type { Workspace } from "./workspace.js";

/** Persistence is pluggable. The web app uses IndexedDB, tests use memory. */
export interface Storage {
  load(): Promise<Workspace | null>;
  save(ws: Workspace): Promise<void>;
}

export function memoryStorage(initial: Workspace | null = null): Storage & { snapshot(): string | null } {
  let data: string | null = initial ? JSON.stringify(initial) : null;
  return {
    async load() { return data ? (JSON.parse(data) as Workspace) : null; },
    async save(ws) { data = JSON.stringify(ws); },
    snapshot: () => data,
  };
}

/** Minimal promise wrapper over IndexedDB, one object store, one key. */
export function indexedDbStorage(dbName = "blockwise", key = "workspace", idb: IDBFactory = globalThis.indexedDB): Storage {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = idb.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  };
  return {
    async load() { return ((await run("readonly", (s) => s.get(key))) as Workspace | undefined) ?? null; },
    async save(ws) { await run("readwrite", (s) => s.put(ws, key)); },
  };
}

/** Debounced autosave; returns a function to schedule a save and one to flush now. */
export function autosave(storage: Storage, delayMs = 400): { schedule(ws: Workspace): void; flush(): Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Workspace | null = null;
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) { const p = pending; pending = null; await storage.save(p); }
  };
  return {
    schedule(ws) { pending = ws; if (timer) clearTimeout(timer); timer = setTimeout(() => void flush(), delayMs); },
    flush,
  };
}
