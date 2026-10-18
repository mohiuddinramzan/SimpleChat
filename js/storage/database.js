import { createId } from '../utils/ids.js';

export const DB_NAME = globalThis.__SIMPLECHAT_DB_NAME__ || 'simplechat-db';
export const DB_VERSION = 2;

export const STORES = Object.freeze({
  PROFILES: 'profiles', CHATS: 'chats', MESSAGES: 'messages',
  BLOCKS: 'blocks', NOTIFICATIONS: 'notifications', SETTINGS: 'settings',
  REPORTS: 'reports',
});

export const SETTINGS_KEY = 'app';
export const DEFAULT_SETTINGS = Object.freeze({
  id: SETTINGS_KEY, theme: 'system', notificationsEnabled: true,
  lastSeenPrivacy: 'nobody', messageLengthLimit: 1000,
});

export class DatabaseError extends Error {
  constructor(message, cause) { super(message); this.name = 'DatabaseError'; this.cause = cause; }
}

// version -> upgrade function. নতুন version যোগ করলে এখানে নতুন key দিন।
const migrations = {
  1(db) {
    db.createObjectStore(STORES.PROFILES, { keyPath: 'id' })
      .createIndex('username', 'username', { unique: true });

    const chats = db.createObjectStore(STORES.CHATS, { keyPath: 'id' });
    chats.createIndex('pairKey', 'pairKey', { unique: true }); // duplicate chat প্রতিরোধ
    chats.createIndex('lastMessageAt', 'lastMessageAt');

    const msgs = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
    msgs.createIndex('chatId', 'chatId');
    msgs.createIndex('chatId_createdAt', ['chatId', 'createdAt']);

    db.createObjectStore(STORES.BLOCKS, { keyPath: 'id' })
      .createIndex('owner_blocked', ['ownerId', 'blockedUserId'], { unique: true });

    db.createObjectStore(STORES.NOTIFICATIONS, { keyPath: 'id' })
      .createIndex('createdAt', 'createdAt');

    db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
  },
  2(db) {
    db.createObjectStore(STORES.REPORTS, { keyPath: 'id' })
      .createIndex('createdAt', 'createdAt');
  },
};

let dbPromise = null;

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new DatabaseError('Request failed', request.error));
  });
}

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new DatabaseError('IndexedDB is not available'));
      return;
    }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(new DatabaseError('Cannot open database', e)); return; }

    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (let v = event.oldVersion + 1; v <= (event.newVersion || DB_VERSION); v++) {
        if (typeof migrations[v] !== 'function') {
          req.transaction.abort();
          return;
        }
        migrations[v](db, req.transaction);
      }
    };
    req.onblocked = () => reject(new DatabaseError('Database blocked by another tab'));
    req.onerror = () => reject(new DatabaseError('Database open failed', req.error));
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
  }).catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

/** একাধিক store-এ atomic transaction চালায়। fn(storesMap) → Promise */
export async function withTx(storeNames, mode, fn) {
  const db = await openDatabase();
  const names = [].concat(storeNames);
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(names, mode); }
    catch (e) { reject(new DatabaseError('Transaction failed', e)); return; }
    const stores = Object.fromEntries(names.map(n => [n, tx.objectStore(n)]));
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(new DatabaseError('Transaction error', tx.error));
    tx.onabort = () => reject(new DatabaseError('Transaction aborted', tx.error));
    Promise.resolve(fn(stores)).then(r => { result = r; }).catch((e) => {
      try { tx.abort(); } catch { /* already finished */ }
      reject(e);
    });
  });
}

export const db = {
  get: (store, key) => withTx(store, 'readonly', s => wrap(s[store].get(key))),
  getAll: (store) => withTx(store, 'readonly', s => wrap(s[store].getAll())),
  getAllByIndex: (store, index, query) =>
    withTx(store, 'readonly', s => wrap(s[store].index(index).getAll(query))),
  getOneByIndex: (store, index, query) =>
    withTx(store, 'readonly', s => wrap(s[store].index(index).get(query))),
  put: (store, value) => withTx(store, 'readwrite', s => wrap(s[store].put(value)).then(() => value)),
  delete: (store, key) => withTx(store, 'readwrite', s => wrap(s[store].delete(key))),
  clear: (store) => withTx(store, 'readwrite', s => wrap(s[store].clear())),
  count: (store) => withTx(store, 'readonly', s => wrap(s[store].count())),
};

export async function initDatabase() {
  try {
    await openDatabase();
    const existing = await db.get(STORES.SETTINGS, SETTINGS_KEY);
    if (!existing) await db.put(STORES.SETTINGS, { ...DEFAULT_SETTINGS });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function closeDatabase() {
  if (!dbPromise) return;
  try { (await dbPromise).close(); } catch { /* ignore */ }
  dbPromise = null;
}

export async function deleteDatabase() {
  await closeDatabase();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(new DatabaseError('Delete failed', req.error));
    req.onblocked = () => reject(new DatabaseError('Delete blocked'));
  });
}

export { createId };
