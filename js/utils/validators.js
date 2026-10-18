import { isValidId, pairKey } from './ids.js';
import { isIso } from './time.js';
import { THEMES } from '../storage/local-adapter.js';
import { DEFAULT_SETTINGS } from '../storage/database.js';

export const BACKUP_FORMAT = 'simplechat-backup';
export const BACKUP_VERSION = 1;

export const LIMITS = Object.freeze({
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 5000,
  MESSAGE_DEFAULT: 1000,
  DISPLAY_NAME: 40,
  NOTIF_TITLE: 100,
  NOTIF_BODY: 500,
  REPORT_REASON: 500,
  BACKUP_BYTES: 10 * 1024 * 1024,
  MAX_ITEMS: Object.freeze({
    profiles: 500, chats: 5000, messages: 100000,
    blocks: 5000, notifications: 5000, reports: 5000,
  }),
});

export const MESSAGE_STATUSES = Object.freeze(['sent', 'delivered', 'read']);
export const NOTIFICATION_TYPES = Object.freeze(['message', 'system', 'privacy']);
export const PRIVACY_OPTIONS = Object.freeze(['everyone', 'contacts', 'nobody']);

const ok = (value) => ({ ok: true, value });
const fail = (error) => ({ ok: false, error });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cpLen = (s) => Array.from(s).length;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVISIBLE_OR_SPACE = /[\s\u200B-\u200D\u2060\uFEFF]/g;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function truncate(text, max) {
  const chars = Array.from(String(text ?? ''));
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
}

function toAsciiDigits(s) {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

function normIso(v) {
  return isIso(v) ? new Date(v).toISOString() : null;
}

const idOf = (v, prefix) =>
  typeof v === 'string' && v.startsWith(prefix + '_') && isValidId(v);

/* ---------- Input validators (UI-facing) ---------- */

export function validateEmail(input) {
  if (typeof input !== 'string' || !input.trim()) return fail('ইমেইল দিন।');
  const s = input.trim().toLowerCase();
  if (s.length > 254 || s.includes('..') || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) {
    return fail('সঠিক ইমেইল ঠিকানা দিন (যেমন name@example.com)।');
  }
  return ok(s);
}

export function validatePhone(input) {
  if (typeof input !== 'string' || !input.trim()) return fail('ফোন নম্বর দিন।');
  const s = toAsciiDigits(input).trim();
  if (!/^\+?[\d\s\-().]+$/.test(s)) {
    return fail('ফোন নম্বরে শুধু সংখ্যা, স্পেস, -, ( ) ব্যবহার করুন।');
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return fail('ফোন নম্বর ৭ থেকে ১৫ সংখ্যার হতে হবে।');
  }
  return ok((s.startsWith('+') ? '+' : '') + digits);
}

export function validateDisplayName(input) {
  if (typeof input !== 'string') return fail('নাম দিন।');
  const s = input.replace(CONTROL, '').trim().replace(/\s+/g, ' ');
  if (!s) return fail('নাম দিন।');
  if (cpLen(s) > LIMITS.DISPLAY_NAME) return fail(`নাম সর্বোচ্চ ${LIMITS.DISPLAY_NAME} অক্ষরের হতে পারবে।`);
  return ok(s);
}

export function validateUsername(input) {
  if (typeof input !== 'string' || !input.trim()) return fail('ইউজারনেম দিন।');
  const s = input.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(s)) {
    return fail('ইউজারনেম ৩–২০ অক্ষরের হতে হবে (a–z, 0–9, _)।');
  }
  return ok(s);
}

export function validateMessageText(input, limit = LIMITS.MESSAGE_DEFAULT) {
  if (typeof input !== 'string') return fail('বার্তা টেক্সট হতে হবে।');
  const text = input.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
  if (!text || !text.replace(INVISIBLE_OR_SPACE, '')) return fail('খালি বার্তা পাঠানো যাবে না।');
  if (cpLen(text) > limit) return fail(`বার্তা সর্বোচ্চ ${limit} অক্ষরের হতে পারবে।`);
  return ok(text);
}

export function validateReportReason(input) {
  if (typeof input !== 'string') return fail('রিপোর্টের কারণ লিখুন।');
  const s = input.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
  if (!s) return fail('রিপোর্টের কারণ লিখুন।');
  if (cpLen(s) > LIMITS.REPORT_REASON) return fail(`কারণ সর্বোচ্চ ${LIMITS.REPORT_REASON} অক্ষরের হতে পারবে।`);
  return ok(s);
}

export function validateSettings(input) {
  if (!isObj(input)) return fail('সেটিংস অবৈধ।');
  const d = DEFAULT_SETTINGS;
  const theme = input.theme ?? d.theme;
  const notificationsEnabled = input.notificationsEnabled ?? d.notificationsEnabled;
  const lastSeenPrivacy = input.lastSeenPrivacy ?? d.lastSeenPrivacy;
  const messageLengthLimit = input.messageLengthLimit ?? d.messageLengthLimit;
  if (!THEMES.includes(theme)) return fail('থিম অবৈধ।');
  if (typeof notificationsEnabled !== 'boolean') return fail('notificationsEnabled true/false হতে হবে।');
  if (!PRIVACY_OPTIONS.includes(lastSeenPrivacy)) return fail('গোপনীয়তা অপশন অবৈধ।');
  if (!Number.isInteger(messageLengthLimit)
      || messageLengthLimit < LIMITS.MESSAGE_MIN
      || messageLengthLimit > LIMITS.MESSAGE_MAX) {
    return fail(`বার্তার সীমা ${LIMITS.MESSAGE_MIN}–${LIMITS.MESSAGE_MAX}-এর মধ্যে হতে হবে।`);
  }
  return ok({ id: d.id, theme, notificationsEnabled, lastSeenPrivacy, messageLengthLimit });
}

/** নাম থেকে avatar initials (বাংলা grapheme সহ) */
export function makeInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const first = (w) => {
    if (!w) return '';
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const it = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(w)[Symbol.iterator]().next();
      return it.done ? '' : it.value.segment;
    }
    return Array.from(w)[0] || '';
  };
  const letters = words.length >= 2 ? first(words[0]) + first(words[words.length - 1]) : first(words[0]);
  return (letters || '?').toUpperCase();
}

/* ---------- Import record cleaners ---------- */

function cleanProfile(p) {
  if (!isObj(p)) return fail('অবৈধ প্রোফাইল।');
  if (!idOf(p.id, 'usr')) return fail('অবৈধ profile id।');
  const name = validateDisplayName(p.displayName);
  if (!name.ok) return fail(name.error);
  const uname = validateUsername(p.username);
  if (!uname.ok) return fail(uname.error);
  let email = null;
  if (p.email != null && p.email !== '') {
    const r = validateEmail(p.email);
    if (!r.ok) return fail(r.error);
    email = r.value;
  }
  let phone = null;
  if (p.phone != null && p.phone !== '') {
    const r = validatePhone(p.phone);
    if (!r.ok) return fail(r.error);
    phone = r.value;
  }
  const createdAt = normIso(p.createdAt);
  if (!createdAt) return fail('createdAt অবৈধ।');
  return ok({
    id: p.id, displayName: name.value, username: uname.value, email, phone,
    avatarInitials: makeInitials(name.value), createdAt,
  });
}

function cleanChat(c) {
  if (!isObj(c)) return fail('অবৈধ চ্যাট।');
  if (!idOf(c.id, 'chat')) return fail('অবৈধ chat id।');
  const ids = c.participantIds;
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] || !ids.every((x) => idOf(x, 'usr'))) {
    return fail('participantIds অবৈধ।');
  }
  const createdAt = normIso(c.createdAt);
  if (!createdAt) return fail('createdAt অবৈধ।');
  return ok({
    id: c.id, participantIds: [...ids].sort(), pairKey: pairKey(ids[0], ids[1]),
    lastMessageId: null, lastMessageAt: null,
    pinned: c.pinned === true, muted: c.muted === true, createdAt,
  });
}

function cleanMessage(m, chatMap) {
  if (!isObj(m)) return fail('অবৈধ বার্তা।');
  if (!idOf(m.id, 'msg')) return fail('অবৈধ message id।');
  const chat = chatMap.get(m.chatId);
  if (!chat) return fail('বার্তার চ্যাট পাওয়া যায়নি।');
  if (!chat.participantIds.includes(m.senderId)) return fail('senderId চ্যাটের অংশগ্রহণকারী নয়।');
  const t = validateMessageText(m.text, LIMITS.MESSAGE_MAX);
  if (!t.ok) return fail(t.error);
  const createdAt = normIso(m.createdAt);
  const updatedAt = m.updatedAt === undefined ? createdAt : normIso(m.updatedAt);
  if (!createdAt || !updatedAt) return fail('সময় অবৈধ।');
  if (!MESSAGE_STATUSES.includes(m.status)) return fail('status অবৈধ।');
  let replyToMessageId = null;
  if (m.replyToMessageId != null) {
    if (!idOf(m.replyToMessageId, 'msg')) return fail('replyToMessageId অবৈধ।');
    replyToMessageId = m.replyToMessageId;
  }
  return ok({
    id: m.id, chatId: m.chatId, senderId: m.senderId, text: t.value,
    createdAt, updatedAt, status: m.status, replyToMessageId, edited: m.edited === true,
  });
}

function cleanBlock(b) {
  if (!isObj(b)) return fail('অবৈধ ব্লক।');
  if (!idOf(b.id, 'blk') || !idOf(b.ownerId, 'usr') || !idOf(b.blockedUserId, 'usr')) return fail('id অবৈধ।');
  if (b.ownerId === b.blockedUserId) return fail('নিজেকে ব্লক করা যায় না।');
  const createdAt = normIso(b.createdAt);
  if (!createdAt) return fail('createdAt অবৈধ।');
  return ok({ id: b.id, ownerId: b.ownerId, blockedUserId: b.blockedUserId, createdAt });
}

function cleanNotification(n) {
  if (!isObj(n)) return fail('অবৈধ notification।');
  if (!idOf(n.id, 'ntf') || !idOf(n.userId, 'usr')) return fail('id অবৈধ।');
  if (!NOTIFICATION_TYPES.includes(n.type)) return fail('type অবৈধ।');
  if (typeof n.title !== 'string' || typeof n.body !== 'string') return fail('title/body অবৈধ।');
  if (typeof n.read !== 'boolean') return fail('read true/false হতে হবে।');
  const createdAt = normIso(n.createdAt);
  if (!createdAt) return fail('createdAt অবৈধ।');
  let chatId = null;
  if (n.chatId != null) {
    if (!idOf(n.chatId, 'chat')) return fail('chatId অবৈধ।');
    chatId = n.chatId;
  }
  return ok({
    id: n.id, userId: n.userId, type: n.type,
    title: truncate(n.title.replace(CONTROL, ''), LIMITS.NOTIF_TITLE),
    body: truncate(n.body.replace(CONTROL, ''), LIMITS.NOTIF_BODY),
    read: n.read, createdAt, chatId,
  });
}

function cleanReport(r) {
  if (!isObj(r)) return fail('অবৈধ রিপোর্ট।');
  if (!idOf(r.id, 'rpt') || !idOf(r.reporterId, 'usr') || !idOf(r.reportedUserId, 'usr')) return fail('id অবৈধ।');
  if (r.reporterId === r.reportedUserId) return fail('নিজেকে রিপোর্ট করা যায় না।');
  const reason = validateReportReason(r.reason);
  if (!reason.ok) return fail(reason.error);
  const createdAt = normIso(r.createdAt);
  if (!createdAt) return fail('createdAt অবৈধ।');
  return ok({ id: r.id, reporterId: r.reporterId, reportedUserId: r.reportedUserId, reason: reason.value, createdAt });
}

/* ---------- Backup validation ---------- */

export function validateBackup(raw) {
  const errors = [];
  const err = (msg) => { if (errors.length < 10) errors.push(msg); };

  if (!isObj(raw)) return { ok: false, errors: ['ফাইলের গঠন সঠিক নয়।'] };
  if (raw.format !== BACKUP_FORMAT) return { ok: false, errors: ['এটি SimpleChat ব্যাকআপ ফাইল নয়।'] };
  if (!Number.isInteger(raw.version) || raw.version < 1) return { ok: false, errors: ['ব্যাকআপের version অবৈধ।'] };
  if (raw.version > BACKUP_VERSION) {
    return { ok: false, errors: ['এই ব্যাকআপ অ্যাপের নতুন সংস্করণে তৈরি; এখানে ইমপোর্ট করা যাবে না।'] };
  }
  if (!isObj(raw.data)) return { ok: false, errors: ['ব্যাকআপে data অংশ নেই।'] };

  const d = raw.data;
  for (const [key, max] of Object.entries(LIMITS.MAX_ITEMS)) {
    if (!Array.isArray(d[key])) err(`"${key}" তালিকা পাওয়া যায়নি।`);
    else if (d[key].length > max) err(`"${key}"-এ সর্বোচ্চ ${max}টি রেকর্ড অনুমোদিত।`);
  }
  if (errors.length) return { ok: false, errors };

  const out = { profiles: [], chats: [], messages: [], blocks: [], notifications: [], reports: [], settings: null };

  const profileIds = new Set(), usernames = new Set(), emails = new Set(), phones = new Set();
  d.profiles.forEach((item, i) => {
    const r = cleanProfile(item);
    if (!r.ok) return err(`profiles[${i}]: ${r.error}`);
    const p = r.value;
    if (profileIds.has(p.id) || usernames.has(p.username)
        || (p.email && emails.has(p.email)) || (p.phone && phones.has(p.phone))) {
      return err(`profiles[${i}]: ডুপ্লিকেট রেকর্ড।`);
    }
    profileIds.add(p.id); usernames.add(p.username);
    if (p.email) emails.add(p.email);
    if (p.phone) phones.add(p.phone);
    out.profiles.push(p);
  });

  const chatMap = new Map(), pairs = new Set();
  d.chats.forEach((item, i) => {
    const r = cleanChat(item);
    if (!r.ok) return err(`chats[${i}]: ${r.error}`);
    const c = r.value;
    if (chatMap.has(c.id) || pairs.has(c.pairKey)) return err(`chats[${i}]: ডুপ্লিকেট চ্যাট।`);
    chatMap.set(c.id, c); pairs.add(c.pairKey); out.chats.push(c);
  });

  const msgIds = new Set(), lastByChat = new Map();
  d.messages.forEach((item, i) => {
    const r = cleanMessage(item, chatMap);
    if (!r.ok) return err(`messages[${i}]: ${r.error}`);
    const m = r.value;
    if (msgIds.has(m.id)) return err(`messages[${i}]: ডুপ্লিকেট id।`);
    msgIds.add(m.id); out.messages.push(m);
    const cur = lastByChat.get(m.chatId);
    if (!cur || m.createdAt >= cur.createdAt) lastByChat.set(m.chatId, m);
  });
  for (const c of out.chats) { // lastMessage বিশ্বাস না করে নতুন করে হিসাব
    const last = lastByChat.get(c.id);
    c.lastMessageId = last ? last.id : null;
    c.lastMessageAt = last ? last.createdAt : null;
  }

  const blockIds = new Set(), blockPairs = new Set();
  d.blocks.forEach((item, i) => {
    const r = cleanBlock(item);
    if (!r.ok) return err(`blocks[${i}]: ${r.error}`);
    const b = r.value, key = `${b.ownerId}|${b.blockedUserId}`;
    if (blockIds.has(b.id) || blockPairs.has(key)) return err(`blocks[${i}]: ডুপ্লিকেট।`);
    blockIds.add(b.id); blockPairs.add(key); out.blocks.push(b);
  });

  const ntfIds = new Set();
  d.notifications.forEach((item, i) => {
    const r = cleanNotification(item);
    if (!r.ok) return err(`notifications[${i}]: ${r.error}`);
    if (ntfIds.has(r.value.id)) return err(`notifications[${i}]: ডুপ্লিকেট id।`);
    ntfIds.add(r.value.id); out.notifications.push(r.value);
  });

  const rptIds = new Set();
  d.reports.forEach((item, i) => {
    const r = cleanReport(item);
    if (!r.ok) return err(`reports[${i}]: ${r.error}`);
    if (rptIds.has(r.value.id)) return err(`reports[${i}]: ডুপ্লিকেট id।`);
    rptIds.add(r.value.id); out.reports.push(r.value);
  });

  if (d.settings === undefined) out.settings = { ...DEFAULT_SETTINGS };
  else {
    const r = validateSettings(d.settings);
    if (!r.ok) err(`settings: ${r.error}`); else out.settings = r.value;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: out };
}

export function parseBackupText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: ['ফাইল খালি।'] };
  if (text.length > LIMITS.BACKUP_BYTES) return { ok: false, errors: ['ফাইল অনেক বড় (সর্বোচ্চ ১০ MB)।'] };
  let raw;
  try { raw = JSON.parse(text); }
  catch { return { ok: false, errors: ['ফাইলটি সঠিক JSON নয়।'] }; }
  return validateBackup(raw);
}
