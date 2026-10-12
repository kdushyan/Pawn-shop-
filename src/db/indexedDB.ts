import { Customer } from '../types';

export type { Customer };

export const MIG: ((db: IDBDatabase, tx?: IDBTransaction) => void)[] = [
  (db: IDBDatabase) => {
    const mk = (n: string, k?: string, ix: string[] = []) => {
      const s = db.createObjectStore(n, { keyPath: k || 'id' });
      ix.forEach((i) => s.createIndex(i, i));
    };
    mk('customers', 'id', ['name']);
    mk('loans', 'id', ['status', 'serialNo']);
    mk('items', 'id', ['loanId']);
    mk('events', 'id', ['loanId', 'seq']);
    mk('rates', 'id', ['date']);
    mk('audits', 'id');
    mk('meta', 'k');
  },
  (db: IDBDatabase, tx?: IDBTransaction) => {
    // Migration v2: Support optional customer mobile number with index
    if (tx) {
      const store = tx.objectStore('customers');
      if (!store.indexNames.contains('phone')) {
        store.createIndex('phone', 'phone', { unique: false });
      }
    }
  },
];

let DB: IDBDatabase | null = null;

export const openDB = (): Promise<IDBDatabase> => {
  if (DB) return Promise.resolve(DB);
  return new Promise((ok, no) => {
    const r = indexedDB.open('suba_s1', MIG.length);
    r.onupgradeneeded = (e: any) => {
      const tx = e.target?.transaction || (r as any).transaction;
      for (let v = e.oldVersion; v < MIG.length; v++) {
        MIG[v](r.result, tx);
      }
    };
    r.onsuccess = () => {
      DB = r.result;
      ok(r.result);
    };
    r.onerror = () => no(r.error);
  });
};

const P = <T = any>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });

export const getAll = async <T = any>(storeName: string): Promise<T[]> => {
  const db = await openDB();
  return P<T[]>(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
};

export const getOne = async <T = any>(storeName: string, key: any): Promise<T | undefined> => {
  const db = await openDB();
  return P<T>(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
};

export type CommitOp = [storeName: string, value: any];

export const commit = async (ops: CommitOp[]): Promise<void> => {
  const db = await openDB();
  return new Promise((ok, no) => {
    const names = [...new Set(ops.map((o) => o[0]))];
    const t = db.transaction(names, 'readwrite');
    ops.forEach(([storeName, obj]) => {
      t.objectStore(storeName).put(obj);
    });
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
  });
};
