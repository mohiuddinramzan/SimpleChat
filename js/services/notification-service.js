import * as repo from '../storage/repository.js';
import { createEmitter } from '../utils/emitter.js';
import { truncate } from '../utils/validators.js';

const emitter = createEmitter();
const fail = (error) => ({ ok: false, error });
const BODY_PREVIEW = 120;

// ভবিষ্যতের native Android notification / FCM adapter-এর জায়গা।
// Adapter শুধু show(notification) দিলেই চলবে। এখন কোনোটিই যুক্ত নেই।
let nativeNotifier = null;

export const NotificationService = {
  onChange: (fn) => emitter.on(fn),

  setNativeNotifier(adapter) {
    if (adapter !== null && typeof adapter?.show !== 'function') {
      throw new Error('Native notifier-এ show(notification) function লাগবে।');
    }
    nativeNotifier = adapter;
  },

  /** UI-তে সত্যি অবস্থা দেখানোর জন্য: এই সংস্করণে remote push নেই */
  getCapabilities() {
    return { inApp: true, native: !!nativeNotifier, remotePush: false };
  },

  list: (userId) => repo.listNotifications(userId),
  unreadCount: (userId) => repo.countUnreadNotifications(userId),

  async getPreferences() {
    const s = await repo.getSettings();
    return { notificationsEnabled: s.notificationsEnabled };
  },

  async setEnabled(enabled) {
    if (typeof enabled !== 'boolean') return fail('অবৈধ মান।');
    await repo.updateSettings({ notificationsEnabled: enabled });
    emitter.emit({ type: 'preferences' });
    return { ok: true };
  },

  /** চালু না থাকলে বা চ্যাট mute থাকলে null ফেরত দেয় (কিছু তৈরি হয় না) */
  async notifyNewMessage({ recipientId, senderName, text, chatId, muted = false }) {
    if (muted) return null;
    const { notificationsEnabled } = await repo.getSettings();
    if (!notificationsEnabled) return null;
    const body = truncate(String(text).replace(/\s+/g, ' ').trim(), BODY_PREVIEW);
    const n = await repo.addNotification({
      userId: recipientId, type: 'message', title: senderName, body, chatId,
    });
    await deliverNative(n);
    emitter.emit({ type: 'added', userId: recipientId, notification: n });
    return n;
  },

  async notifySystem({ userId, title, body, type = 'system' }) {
    const { notificationsEnabled } = await repo.getSettings();
    if (!notificationsEnabled) return null;
    const n = await repo.addNotification({ userId, type, title, body });
    await deliverNative(n);
    emitter.emit({ type: 'added', userId, notification: n });
    return n;
  },

  async markRead(userId, id) {
    const mine = await repo.listNotifications(userId);
    if (!mine.some((n) => n.id === id)) return fail('Notification পাওয়া যায়নি।');
    await repo.markNotificationRead(id);
    emitter.emit({ type: 'read', userId });
    return { ok: true };
  },

  async markAllRead(userId) {
    const count = await repo.markAllNotificationsRead(userId);
    if (count) emitter.emit({ type: 'read', userId });
    return { ok: true, count };
  },

  /** চ্যাট খুললে সেই চ্যাটের notification পড়া হিসেবে চিহ্নিত হয় */
  async markChatRead(userId, chatId) {
    const mine = await repo.listNotifications(userId);
    const targets = mine.filter((n) => !n.read && n.chatId === chatId);
    await Promise.all(targets.map((n) => repo.markNotificationRead(n.id)));
    if (targets.length) emitter.emit({ type: 'read', userId });
    return { ok: true, count: targets.length };
  },

  async clear(userId) {
    const count = await repo.clearNotifications(userId);
    emitter.emit({ type: 'cleared', userId });
    return { ok: true, count };
  },
};

async function deliverNative(notification) {
  if (!nativeNotifier) return;
  try { await nativeNotifier.show(notification); } catch { /* in-app তালিকা তবুও থাকবে */ }
}
