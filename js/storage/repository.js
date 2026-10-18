import { db, withTx, STORES, SETTINGS_KEY, DEFAULT_SETTINGS, DatabaseError } from './database.js';
import { LocalAdapter, setTheme } from './local-adapter.js';
import { createId, pairKey } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import {
  makeInitials, validateSettings, validateReportReason, parseBackupText,
  truncate, LIMITS, NOTIFICATION_TYPES, BACKUP_FORMAT, BACKUP_VERSION,
} from '../utils/validators.js';

const S = STORES;
const ALL_STORES = Object.values(STORES);
const STATUS_RANK = Object.freeze({ sent: 0, delivered: 1, read: 2 });
const byCreated = (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

export class RepoError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'RepoError';
    this.code = code;
    this.details = details;
  }
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new DatabaseError('Request failed', request.error));
  });
}

/* ================= Profiles ================= */

export async function createProfile({ displayName, username, email = null, phone = null }) {
  const profile = {
    id: createId('usr'), displayName, username,
    email: email || null, phone: phone || null,
    avatarInitials: makeInitials(displayName), createdAt: nowIso(),
  };
  return withTx(S.PROFILES, 'readwrite', async (s) => {
    const all = await req(s[S.PROFILES].getAll());
    if (all.some((p) => p.username === profile.username)) throw new RepoError('DUPLICATE_USERNAME', 'এই ইউজারনেম আগে থেকেই আছে।');
    if (profile.email && all.some((p) => p.email === profile.email)) throw new RepoError('DUPLICATE_EMAIL', 'এই ইমেইল দিয়ে আগেই প্রোফাইল আছে।');
    if (profile.phone && all.some((p) => p.phone === profile.phone)) throw new RepoError('DUPLICATE_PHONE', 'এই ফোন নম্বর দিয়ে আগেই প্রোফাইল আছে।');
    await req(s[S.PROFILES].add(profile));
    return profile;
  });
}

export const getProfile = (id) => db.get(S.PROFILES, id);
export const listProfiles = () => db.getAll(S.PROFILES);

export async function findProfileByEmail(email) {
  return (await listProfiles()).find((p) => p.email === email) || null;
}
export async function findProfileByPhone(phone) {
  return (await listProfiles()).find((p) => p.phone === phone) || null;
}

/** প্রোফাইল ও তার block রেকর্ড মোছে; চ্যাট/বার্তা থেকে যায় (UI "মুছে ফেলা প্রোফাইল" দেখায়) */
export async function deleteProfile(id) {
  return withTx([S.PROFILES, S.BLOCKS], 'readwrite', async (s) => {
    await req(s[S.PROFILES].delete(id));
    const blocks = await req(s[S.BLOCKS].getAll());
    await Promise.all(blocks
      .filter((b) => b.ownerId === id || b.blockedUserId === id)
      .map((b) => req(s[S.BLOCKS].delete(b.id))));
    return true;
  });
}

/* ================= Chats ================= */

export async function createChatIfAbsent(idA, idB) {
  if (idA === idB) throw new RepoError('SELF_CHAT', 'নিজের সঙ্গে চ্যাট করা যাবে না।');
  const key = pairKey(idA, idB);
  return withTx(S.CHATS, 'readwrite', async (s) => {
    const existing = await req(s[S.CHATS].index('pairKey').get(key));
    if (existing) return { chat: existing, created: false };
    const chat = {
      id: createId('chat'), participantIds: [idA, idB].sort(), pairKey: key,
      lastMessageId: null, lastMessageAt: null, pinned: false, muted: false, createdAt: nowIso(),
    };
    await req(s[S.CHATS].add(chat));
    return { chat, created: true };
  });
}

export const getChat = (id) => db.get(S.CHATS, id);

export async function listChatsFor(userId) {
  return (await db.getAll(S.CHATS)).filter((c) => c.participantIds.includes(userId));
}

export async function updateChat(id, patch) {
  return withTx(S.CHATS, 'readwrite', async (s) => {
    const chat = await req(s[S.CHATS].get(id));
    if (!chat) throw new RepoError('CHAT_NOT_FOUND', 'চ্যাট পাওয়া যায়নি।');
    for (const key of ['pinned', 'muted']) {
      if (key in patch) {
        if (typeof patch[key] !== 'boolean') throw new RepoError('INVALID', `${key} true/false হতে হবে।`);
        chat[key] = patch[key];
      }
    }
    await req(s[S.CHATS].put(chat));
    return chat;
  });
}

/* ================= Messages ================= */

export async function addMessage({ chatId, senderId, text, replyToMessageId = null }) {
  return withTx([S.CHATS, S.MESSAGES], 'readwrite', async (s) => {
    const chat = await req(s[S.CHATS].get(chatId));
    if (!chat) throw new RepoError('CHAT_NOT_FOUND', 'চ্যাট পাওয়া যায়নি।');
    if (!chat.participantIds.includes(senderId)) throw new RepoError('FORBIDDEN', 'এই চ্যাটে বার্তা পাঠানোর অনুমতি নেই।');
    if (replyToMessageId) {
      const target = await req(s[S.MESSAGES].get(replyToMessageId));
      if (!target || target.chatId !== chatId) throw new RepoError('INVALID_REPLY', 'যে বার্তার উত্তর দিচ্ছেন সেটি পাওয়া যায়নি।');
    }
    let createdAt = nowIso();
    if (chat.lastMessageAt && createdAt <= chat.lastMessageAt) { // ক্রম ঠিক রাখতে
      createdAt = new Date(Date.parse(chat.lastMessageAt) + 1).toISOString();
    }
    const message = {
      id: createId('msg'), chatId, senderId, text,
      createdAt, updatedAt: createdAt, status: 'sent',
      replyToMessageId: replyToMessageId || null, edited: false,
    };
    await req(s[S.MESSAGES].add(message));
    chat.lastMessageId = message.id;
    chat.lastMessageAt = createdAt;
    await req(s[S.CHATS].put(chat));
    return message;
  });
}

export const getMessage = (id) => db.get(S.MESSAGES, id);
export const listAllMessages = () => db.getAll(S.MESSAGES);

export async function listMessages(chatId) {
  const msgs = await db.getAllByIndex(S.MESSAGES, 'chatId', chatId);
  return msgs.sort(byCreated);
}

/** শুধু নিজের বার্তা এডিট করা যায় */
export async function editMessageText(messageId, actorId, text) {
  return withTx(S.MESSAGES, 'readwrite', async (s) => {
    const m = await req(s[S.MESSAGES].get(messageId));
    if (!m) throw new RepoError('MESSAGE_NOT_FOUND', 'বার্তা পাওয়া যায়নি।');
    if (m.senderId !== actorId) throw new RepoError('FORBIDDEN', 'অন্যের বার্তা এডিট করা যায় না।');
    const updated = { ...m, text, edited: true, updatedAt: nowIso() };
    await req(s[S.MESSAGES].put(updated));
    return updated;
  });
}

/** শুধু নিজের বার্তা মোছা যায়; চ্যাটের শেষ বার্তা নতুন করে হিসাব হয় */
export async function deleteMessage(messageId, actorId) {
  return withTx([S.CHATS, S.MESSAGES], 'readwrite', async (s) => {
    const m = await req(s[S.MESSAGES].get(messageId));
    if (!m) throw new RepoError('MESSAGE_NOT_FOUND', 'বার্তা পাওয়া যায়নি।');
    if (m.senderId !== actorId) throw new RepoError('FORBIDDEN', 'অন্যের বার্তা মোছা যায় না।');
    await req(s[S.MESSAGES].delete(messageId));
    const chat = await req(s[S.CHATS].get(m.chatId));
    if (chat && chat.lastMessageId === messageId) {
      const rest = (await req(s[S.MESSAGES].index('chatId').getAll(m.chatId))).sort(byCreated);
      const last = rest[rest.length - 1];
      chat.lastMessageId = last ? last.id : null;
      chat.lastMessageAt = last ? last.createdAt : null;
      await req(s[S.CHATS].put(chat));
    }
    return true;
  });
}

export async function clearChatMessages(chatId) {
  return withTx([S.CHATS, S.MESSAGES], 'readwrite', async (s) => {
    const chat = await req(s[S.CHATS].get(chatId));
    if (!chat) throw new RepoError('CHAT_NOT_FOUND', 'চ্যাট পাওয়া যায়নি।');
    const keys = await req(s[S.MESSAGES].index('chatId').getAllKeys(chatId));
    await Promise.all(keys.map((k) => req(s[S.MESSAGES].delete(k))));
    chat.lastMessageId = null;
    chat.lastMessageAt = null;
    await req(s[S.CHATS].put(chat));
    return keys.length;
  });
}

/** status শুধু এগোয় (sent → delivered → read), পিছোয় না */
export async function advanceIncomingStatus(chatId, readerId, status) {
  if (!(status in STATUS_RANK)) throw new RepoError('INVALID', 'status অবৈধ।');
  return withTx(S.MESSAGES, 'readwrite', async (s) => {
    const msgs = await req(s[S.MESSAGES].index('chatId').getAll(chatId));
    const changed = msgs.filter((m) => m.senderId !== readerId && STATUS_RANK[m.status] < STATUS_RANK[status]);
    await Promise.all(changed.map((m) => req(s[S.MESSAGES].put({ ...m, status }))));
    return changed.length;
  });
}

export async function advanceMessageStatus(messageId, status) {
  if (!(status in STATUS_RANK)) throw new RepoError('INVALID', 'status অবৈধ।');
  return withTx(S.MESSAGES, 'readwrite', async (s) => {
    const m = await req(s[S.MESSAGES].get(messageId));
    if (!m || STATUS_RANK[m.status] >= STATUS_RANK[status]) return false;
    await req(s[S.MESSAGES].put({ ...m, status }));
    return true;
  });
}

export async function countUnread(chatId, userId) {
  const msgs = await db.getAllByIndex(S.MESSAGES, 'chatId', chatId);
  return msgs.filter((m) => m.senderId !== userId && m.status !== 'read').length;
}

/* ================= Blocks ================= */

export async function addBlock(ownerId, blockedUserId) {
  if (ownerId === blockedUserId) throw new RepoError('SELF_BLOCK', 'নিজেকে ব্লক করা যাবে না।');
  return withTx(S.BLOCKS, 'readwrite', async (s) => {
    const existing = await req(s[S.BLOCKS].index('owner_blocked').get([ownerId, blockedUserId]));
    if (existing) return existing;
    const block = { id: createId('blk'), ownerId, blockedUserId, createdAt: nowIso() };
    await req(s[S.BLOCKS].add(block));
    return block;
  });
}

export async function removeBlock(ownerId, blockedUserId) {
  return withTx(S.BLOCKS, 'readwrite', async (s) => {
    const existing = await req(s[S.BLOCKS].index('owner_blocked').get([ownerId, blockedUserId]));
    if (!existing) return false;
    await req(s[S.BLOCKS].delete(existing.id));
    return true;
  });
}

export async function listBlocks(ownerId) {
  return (await db.getAll(S.BLOCKS)).filter((b) => b.ownerId === ownerId).sort(byCreated);
}

export async function isBlocked(ownerId, otherId) {
  return !!(await db.getOneByIndex(S.BLOCKS, 'owner_blocked', [ownerId, otherId]));
}

export async function isBlockedEitherWay(idA, idB) {
  const [a, b] = await Promise.all([isBlocked(idA, idB), isBlocked(idB, idA)]);
  return a || b;
}

/* ================= Reports (local demo record only) ================= */

export async function addReport({ reporterId, reportedUserId, reason }) {
  if (reporterId === reportedUserId) throw new RepoError('SELF_REPORT', 'নিজেকে রিপোর্ট করা যাবে না।');
  const r = validateReportReason(reason);
  if (!r.ok) throw new RepoError('INVALID', r.error);
  const report = { id: createId('rpt'), reporterId, reportedUserId, reason: r.value, createdAt: nowIso() };
  return db.put(S.REPORTS, report);
}

export async function listReports(reporterId) {
  const all = await db.getAll(S.REPORTS);
  return (reporterId ? all.filter((r) => r.reporterId === reporterId) : all).sort(byCreated);
}

/* ================= Notifications ================= */

export async function addNotification({ userId, type, title, body, chatId = null }) {
  if (!NOTIFICATION_TYPES.includes(type)) throw new RepoError('INVALID', 'notification type অবৈধ।');
  const n = {
    id: createId('ntf'), userId, type,
    title: truncate(title, LIMITS.NOTIF_TITLE),
    body: truncate(body, LIMITS.NOTIF_BODY),
    read: false, createdAt: nowIso(), chatId: chatId || null,
  };
  return db.put(S.NOTIFICATIONS, n);
}

export async function listNotifications(userId) {
  return (await db.getAll(S.NOTIFICATIONS))
    .filter((n) => n.userId === userId).sort(byCreated).reverse();
}

export async function countUnreadNotifications(userId) {
  return (await listNotifications(userId)).filter((n) => !n.read).length;
}

export async function markNotificationRead(id) {
  return withTx(S.NOTIFICATIONS, 'readwrite', async (s) => {
    const n = await req(s[S.NOTIFICATIONS].get(id));
    if (!n) return false;
    if (!n.read) await req(s[S.NOTIFICATIONS].put({ ...n, read: true }));
    return true;
  });
}

export async function markAllNotificationsRead(userId) {
  return withTx(S.NOTIFICATIONS, 'readwrite', async (s) => {
    const all = await req(s[S.NOTIFICATIONS].getAll());
    const targets = all.filter((n) => n.userId === userId && !n.read);
    await Promise.all(targets.map((n) => req(s[S.NOTIFICATIONS].put({ ...n, read: true }))));
    return targets.length;
  });
}

export async function clearNotifications(userId) {
  return withTx(S.NOTIFICATIONS, 'readwrite', async (s) => {
    const all = await req(s[S.NOTIFICATIONS].getAll());
    const targets = all.filter((n) => n.userId === userId);
    await Promise.all(targets.map((n) => req(s[S.NOTIFICATIONS].delete(n.id))));
    return targets.length;
  });
}

/* ================= Settings ================= */

const SETTING_KEYS = ['theme', 'notificationsEnabled', 'lastSeenPrivacy', 'messageLengthLimit'];

/** নষ্ট বা অনুপস্থিত সেটিংস হলে default ফেরত দেয় ও ঠিক করে লিখে রাখে */
export async function getSettings() {
  try {
    const raw = await db.get(S.SETTINGS, SETTINGS_KEY);
    const v = validateSettings(raw);
    if (raw && v.ok) return v.value;
  } catch { /* defaults-এ নামবে */ }
  const defaults = { ...DEFAULT_SETTINGS };
  try { await db.put(S.SETTINGS, defaults); } catch { /* ignore */ }
  return defaults;
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const next = { ...current };
  const src = patch && typeof patch === 'object' ? patch : {};
  for (const k of SETTING_KEYS) if (k in src) next[k] = src[k];
  const v = validateSettings(next);
  if (!v.ok) throw new RepoError('INVALID_SETTINGS', v.error);
  await db.put(S.SETTINGS, v.value);
  if ('theme' in src) setTheme(v.value.theme); // LocalStorage-এও রাখে (boot flash এড়াতে)
  return v.value;
}

/* ================= Export / Import / Clear ================= */

export async function getCounts() {
  const entries = await Promise.all(ALL_STORES.map(async (n) => [n, await db.count(n)]));
  return Object.fromEntries(entries);
}

export async function exportBackup() {
  const names = [S.PROFILES, S.CHATS, S.MESSAGES, S.BLOCKS, S.NOTIFICATIONS, S.REPORTS];
  const rows = await withTx(names, 'readonly', (s) =>
    Promise.all(names.map((n) => req(s[n].getAll()))));
  const [profiles, chats, messages, blocks, notifications, reports] = rows;
  const settings = await getSettings();
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: nowIso(),
    data: { profiles, chats, messages, blocks, notifications, reports, settings },
  };
}

export async function exportBackupJson() {
  return JSON.stringify(await exportBackup(), null, 2);
}

/** ইমপোর্টের আগে যাচাই + বর্তমান বনাম নতুন ডেটার সংখ্যা (confirmation screen-এর জন্য); কিছু লেখে না */
export async function previewImport(text) {
  const parsed = parseBackupText(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const v = parsed.value;
  return {
    ok: true,
    incoming: {
      profiles: v.profiles.length, chats: v.chats.length, messages: v.messages.length,
      blocks: v.blocks.length, notifications: v.notifications.length, reports: v.reports.length,
    },
    current: await getCounts(),
  };
}

/** বর্তমান সব ডেটা প্রতিস্থাপন করে। confirmReplace === true ছাড়া চলবে না। একটি transaction: ব্যর্থ হলে পুরোনো ডেটা অক্ষত। */
export async function importBackup(text, { confirmReplace = false } = {}) {
  if (confirmReplace !== true) throw new RepoError('CONFIRM_REQUIRED', 'ইমপোর্টের আগে নিশ্চিত করতে হবে।');
  const parsed = parseBackupText(text);
  if (!parsed.ok) throw new RepoError('INVALID_BACKUP', 'ব্যাকআপ ফাইল অবৈধ।', parsed.errors);
  const v = parsed.value;
  const plan = [
    [S.PROFILES, v.profiles], [S.CHATS, v.chats], [S.MESSAGES, v.messages],
    [S.BLOCKS, v.blocks], [S.NOTIFICATIONS, v.notifications], [S.REPORTS, v.reports],
    [S.SETTINGS, [v.settings]],
  ];
  await withTx(ALL_STORES, 'readwrite', async (s) => {
    await Promise.all(ALL_STORES.map((n) => req(s[n].clear())));
    for (const [name, rows] of plan) {
      await Promise.all(rows.map((row) => req(s[name].add(row))));
    }
  });
  setTheme(v.settings.theme);
  return {
    profiles: v.profiles.length, chats: v.chats.length, messages: v.messages.length,
    blocks: v.blocks.length, notifications: v.notifications.length, reports: v.reports.length,
  };
}

/** সব IndexedDB ডেটা + LocalStorage (theme, session) মোছে; default settings ফিরিয়ে দেয় */
export async function clearAllData() {
  await withTx(ALL_STORES, 'readwrite', async (s) => {
    await Promise.all(ALL_STORES.map((n) => req(s[n].clear())));
    await req(s[S.SETTINGS].put({ ...DEFAULT_SETTINGS }));
  });
  LocalAdapter.clearAll();
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', 'system');
  return true;
}

export { pairKey };
