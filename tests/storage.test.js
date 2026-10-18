import { describe, it, assert } from './runner.js';
import {
  DB_NAME, DB_VERSION, STORES, DatabaseError,
  openDatabase, initDatabase, closeDatabase, deleteDatabase, db,
} from '../js/storage/database.js';
import * as repo from '../js/storage/repository.js';
import { getTheme, setTheme } from '../js/storage/local-adapter.js';
import { createId, isValidId, pairKey } from '../js/utils/ids.js';
import { AuthService } from '../js/services/auth-service.js';
import { ChatService } from '../js/services/chat-service.js';
import { MessageService } from '../js/services/message-service.js';
import { PrivacyService } from '../js/services/privacy-service.js';
import { T, makeChat, makeUser, sendOk, localKey } from './helpers.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function openRaw(version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked by another connection'));
  });
}

describe('Database initialization', () => {
  it('creates a fresh database with every store and default settings', async () => {
    await closeDatabase();
    await deleteDatabase();
    const init = await initDatabase();
    assert.ok(init.ok, 'init');
    const database = await openDatabase();
    assert.equal(database.version, DB_VERSION);
    for (const name of Object.values(STORES)) assert.ok(database.objectStoreNames.contains(name), `store ${name}`);
    const s = await repo.getSettings();
    assert.equal(s.theme, 'system');
    assert.equal(s.notificationsEnabled, true);
    assert.equal(s.lastSeenPrivacy, 'nobody');
    assert.equal(s.messageLengthLimit, 1000);
  });

  it('migrates a version 1 database to the current version and keeps its data', async () => {
    await closeDatabase();
    await deleteDatabase();
    const raw = await openRaw(1, (d) => {
      d.createObjectStore('profiles', { keyPath: 'id' }).createIndex('username', 'username', { unique: true });
      const c = d.createObjectStore('chats', { keyPath: 'id' });
      c.createIndex('pairKey', 'pairKey', { unique: true });
      c.createIndex('lastMessageAt', 'lastMessageAt');
      const m = d.createObjectStore('messages', { keyPath: 'id' });
      m.createIndex('chatId', 'chatId');
      m.createIndex('chatId_createdAt', ['chatId', 'createdAt']);
      d.createObjectStore('blocks', { keyPath: 'id' }).createIndex('owner_blocked', ['ownerId', 'blockedUserId'], { unique: true });
      d.createObjectStore('notifications', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      d.createObjectStore('settings', { keyPath: 'id' });
    });
    await new Promise((resolve, reject) => {
      const tx = raw.transaction('profiles', 'readwrite');
      tx.objectStore('profiles').put({ id: 'usr_legacy00001', displayName: 'Legacy', username: 'legacy', email: null, phone: null, avatarInitials: 'L', createdAt: T });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    raw.close();

    const init = await initDatabase();
    assert.ok(init.ok, 'upgrade init');
    const upgraded = await openDatabase();
    assert.equal(upgraded.version, DB_VERSION);
    assert.ok(upgraded.objectStoreNames.contains('reports'), 'v2 store added');
    const legacy = await repo.getProfile('usr_legacy00001');
    assert.equal(legacy.username, 'legacy');
  });

  it('reports a failure instead of crashing when the database cannot be opened', async () => {
    await closeDatabase();
    indexedDB.open = () => { throw new Error('simulated failure'); };
    let init;
    try { init = await initDatabase(); } finally { delete indexedDB.open; }
    assert.equal(init.ok, false);
    assert.ok(init.error instanceof DatabaseError);
    const again = await initDatabase();
    assert.ok(again.ok, 'recovers once the database is available');
  });

  it('repairs corrupted settings with defaults', async () => {
    await db.put(STORES.SETTINGS, { id: 'app', theme: 'neon', messageLengthLimit: 'lots' });
    const s = await repo.getSettings();
    assert.equal(s.theme, 'system');
    assert.equal(s.messageLengthLimit, 1000);
    assert.equal((await db.get(STORES.SETTINGS, 'app')).theme, 'system', 'repaired in storage');
  });

  it('enforces unique usernames', async () => {
    await makeUser('A', 'same_name');
    await assert.rejects(() => makeUser('B', 'same_name'), (e) => e.code === 'DUPLICATE_USERNAME');
    assert.equal((await repo.listProfiles()).length, 1);
  });

  it('generates unique, valid IDs and order-independent pair keys', () => {
    const ids = new Set();
    for (let i = 0; i < 2000; i++) ids.add(createId('msg'));
    assert.equal(ids.size, 2000);
    assert.ok(isValidId(createId('usr')));
    for (const bad of ['x', 'usr_short', '<script>alert(1)</script>', 42, null]) assert.equal(isValidId(bad), false);
    assert.equal(pairKey('b', 'a'), pairKey('a', 'b'));
  });

  it('stores ISO timestamps', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, 'time');
    for (const value of [a.createdAt, chat.createdAt, m.createdAt, m.updatedAt]) assert.ok(ISO.test(value), `ISO ${value}`);
  });

  it('message records contain only the specified fields (no attachment fields)', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, 'fields');
    assert.deepEqual(Object.keys(m).sort(),
      ['chatId', 'createdAt', 'edited', 'id', 'replyToMessageId', 'senderId', 'status', 'text', 'updatedAt']);
  });
});

describe('Theme persistence', () => {
  it('saves the theme in LocalStorage and the database, and applies it', async () => {
    assert.equal(getTheme(), 'system');
    await repo.updateSettings({ theme: 'dark' });
    assert.equal(getTheme(), 'dark');
    assert.equal(localStorage.getItem(localKey('theme')), 'dark');
    assert.equal((await repo.getSettings()).theme, 'dark');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
    await repo.updateSettings({ theme: 'light' });
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  });

  it('rejects invalid themes', async () => {
    assert.equal((() => { try { setTheme('neon'); return 'no throw'; } catch { return 'threw'; } })(), 'threw');
    await assert.rejects(() => repo.updateSettings({ theme: 'neon' }), (e) => e.code === 'INVALID_SETTINGS');
    assert.equal(getTheme(), 'system');
  });

  it('survives an app restart', async () => {
    await repo.updateSettings({ theme: 'dark' });
    await closeDatabase();
    await initDatabase();
    assert.equal((await repo.getSettings()).theme, 'dark');
    assert.equal(getTheme(), 'dark');
  });
});

describe('App restart and local persistence', () => {
  it('keeps profiles, chats, messages and the session after a restart', async () => {
    const { a, chat } = await makeChat();
    await sendOk(chat, a, 'before restart');
    await sendOk(chat, a, 'এখনও আছে 😀');
    await AuthService.switchDemoProfile(a.id);

    await closeDatabase();
    await initDatabase();

    assert.equal((await AuthService.getCurrentUser()).id, a.id);
    const list = await ChatService.listChats(a.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].preview, 'এখনও আছে 😀');
    assert.deepEqual((await repo.listMessages(chat.id)).map((m) => m.text), ['before restart', 'এখনও আছে 😀']);
  });

  it('settlePending turns messages stuck at "sent" into simulated "delivered" after a restart', async () => {
    const { a, chat } = await makeChat();
    MessageService.configure({ deliveryDelayMs: 60000 });
    const m = await sendOk(chat, a, 'stuck');
    assert.equal((await repo.getMessage(m.id)).status, 'sent');
    MessageService.dispose(); // pending timers are lost when the app closes
    MessageService.configure({ deliveryDelayMs: 5 });
    assert.equal(await MessageService.settlePending(), 1);
    assert.equal((await repo.getMessage(m.id)).status, 'delivered');
  });
});

describe('Export and import', () => {
  async function seed() {
    const { a, b, chat } = await makeChat();
    const m1 = await sendOk(chat, a, 'হ্যালো 😀');
    const m2 = await sendOk(chat, b, 'Reply <b>x</b>', { replyToMessageId: m1.id });
    await MessageService.edit(m2.id, b.id, 'Reply edited');
    await PrivacyService.block(a.id, b.id);
    await PrivacyService.report(a.id, b.id, 'test reason');
    await repo.updateSettings({ messageLengthLimit: 200, theme: 'dark' });
    return { a, b, chat, m1, m2 };
  }
  const dataCounts = async () => {
    const c = await repo.getCounts();
    return { profiles: c.profiles, chats: c.chats, messages: c.messages, blocks: c.blocks, notifications: c.notifications, reports: c.reports };
  };

  it('exports a versioned backup and previews it without writing anything', async () => {
    await seed();
    const before = await dataCounts();
    const text = await repo.exportBackupJson();
    const parsed = JSON.parse(text);
    assert.equal(parsed.format, 'simplechat-backup');
    assert.equal(parsed.version, 1);
    assert.equal(parsed.data.messages.length, 2);
    const preview = await repo.previewImport(text);
    assert.ok(preview.ok);
    assert.equal(preview.incoming.messages, 2);
    assert.equal(preview.current.messages, 2, 'preview reports current data for the warning screen');
    assert.deepEqual(await dataCounts(), before, 'preview wrote nothing');
  });

  it('round-trips everything and requires explicit confirmation', async () => {
    const { chat, m1, m2 } = await seed();
    const before = await dataCounts();
    const text = await repo.exportBackupJson();
    await repo.clearAllData();
    assert.equal((await repo.getCounts()).messages, 0);

    await assert.rejects(() => repo.importBackup(text), (e) => e.code === 'CONFIRM_REQUIRED');
    assert.equal((await repo.getCounts()).messages, 0, 'nothing written without confirmation');

    const counts = await repo.importBackup(text, { confirmReplace: true });
    assert.equal(counts.messages, 2);
    assert.deepEqual(await dataCounts(), before);

    const msgs = await repo.listMessages(chat.id);
    assert.deepEqual(msgs.map((m) => m.text), ['হ্যালো 😀', 'Reply edited']);
    assert.equal(msgs[1].replyToMessageId, m1.id);
    assert.equal(msgs[1].edited, true);
    assert.equal((await repo.getChat(chat.id)).lastMessageId, m2.id, 'last message recomputed');
    const s = await repo.getSettings();
    assert.equal(s.messageLengthLimit, 200);
    assert.equal(getTheme(), 'dark');
  });

  it('import replaces existing data', async () => {
    await seed();
    const text = await repo.exportBackupJson();
    await makeUser('Extra', 'extra_user');
    assert.equal((await repo.listProfiles()).length, 3);
    await repo.importBackup(text, { confirmReplace: true });
    assert.equal((await repo.listProfiles()).length, 2);
  });

  it('a rejected import leaves existing data untouched', async () => {
    await seed();
    const before = await dataCounts();
    await assert.rejects(
      () => repo.importBackup('{"format":"something-else"}', { confirmReplace: true }),
      (e) => e.code === 'INVALID_BACKUP');
    await assert.rejects(
      () => repo.importBackup('not json at all', { confirmReplace: true }),
      (e) => e.code === 'INVALID_BACKUP');
    assert.deepEqual(await dataCounts(), before);
  });

  it('clearAllData removes data, session and theme, and restores defaults', async () => {
    const { a } = await seed();
    await AuthService.switchDemoProfile(a.id);
    await repo.clearAllData();
    const c = await repo.getCounts();
    for (const k of ['profiles', 'chats', 'messages', 'blocks', 'notifications', 'reports']) assert.equal(c[k], 0, k);
    assert.equal(localStorage.getItem(localKey('currentUserId')), null);
    assert.equal(getTheme(), 'system');
    const s = await repo.getSettings();
    assert.equal(s.messageLengthLimit, 1000);
    assert.equal(s.theme, 'system');
  });
});
