// Copia locale del database (IndexedDB): lettura veloce e funzionamento offline
let dbp = null;
function open(name) {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows', { keyPath: '_id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
let NAME = 'natom-visite-local';
export function setDbName(n) { NAME = n; dbp = null; }
function tx(store, mode, fn) {
  return open(NAME).then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => (out = v));
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  }));
}
export const getAllRows = () => tx('rows', 'readonly', s => new Promise(r => { const q = s.getAll(); q.onsuccess = () => r(q.result); }));
export const putRows = rows => tx('rows', 'readwrite', s => { for (const x of rows) s.put(x); });
export const clearRows = () => tx('rows', 'readwrite', s => { s.clear(); });
export const getMeta = k => tx('meta', 'readonly', s => new Promise(r => { const q = s.get(k); q.onsuccess = () => r(q.result); }));
export const setMeta = (k, v) => tx('meta', 'readwrite', s => { s.put(v, k); });
export const clearAll = () => clearRows().then(() => tx('meta', 'readwrite', s => { s.clear(); }));
