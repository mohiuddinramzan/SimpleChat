import * as repo from '../storage/repository.js';
import { ChatService } from './chat-service.js';
import { NotificationService } from './notification-service.js';
import { validateMessageText, truncate } from '../utils/validators.js';
import { createEmitter } from '../utils/emitter.js';

const emitter = createEmitter();
const fail = (error) => ({ ok: false, error });
const REPLY_PREVIEW_CHARS = 80;

// সব সময় simulated: delivery ও typing কোনো নেটওয়ার্ক ঘটনা নয়
const config = { deliveryDelayMs: 800, typingMs: 2000 };
const deliveryTimers = new Set();
const typingTimers = new Map();

const otherIdOf = (chat, meId) => chat.participantIds.find((id) => id !== meId) ?? null;

async function guard(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof repo.RepoError) return fail(e.message);
    throw e;
  }
}

function scheduleDelivery(message) {
  const timer = setTimeout(async () => {
    deliveryTimers.delete(timer);
    try {
      const chat = await repo.getChat(message.chatId);
      if (!chat) return;
      const recipientId = otherIdOf(chat, message.senderId);
      if (!recipientId) return;
      if (await repo.isBlocked(recipientId, message.senderId)) return; // ব্লক থাকলে sent-ই থাকে
      if (await repo.advanceMessageStatus(message.id, 'delivered')) {
        emitter.emit({ type: 'status', chatId: message.chatId, messageId: message.id, status: 'delivered' });
      }
    } catch { /* simulated, তাই নীরবে বাদ */ }
  }, config.deliveryDelayMs);
  deliveryTimers.add(timer);
}

export const MessageService = {
  onChange: (fn) => emitter.on(fn),

  /** test-এর জন্য delay বদলানো যায় */
  configure(next = {}) {
    if (Number.isFinite(next.deliveryDelayMs)) config.deliveryDelayMs = Math.max(0, next.deliveryDelayMs);
    if (Number.isFinite(next.typingMs)) config.typingMs = Math.max(0, next.typingMs);
  },

  /** pending timer ও typing বন্ধ করে (logout/test cleanup) */
  dispose() {
    deliveryTimers.forEach(clearTimeout);
    deliveryTimers.clear();
    typingTimers.forEach((t) => clearTimeout(t.timer));
    typingTimers.clear();
  },

  async send({ chatId, senderId, text, replyToMessageId = null }) {
    const settings = await repo.getSettings();
    const v = validateMessageText(text, settings.messageLengthLimit);
    if (!v.ok) return fail(v.error);

    const chat = await repo.getChat(chatId);
    if (!chat || !chat.participantIds.includes(senderId)) return fail('চ্যাট পাওয়া যায়নি।');
    const otherId = otherIdOf(chat, senderId);
    const check = await ChatService.checkInteraction(senderId, otherId);
    if (!check.ok) return fail(check.reason);

    const res = await guard(async () => ({
      ok: true,
      message: await repo.addMessage({ chatId, senderId, text: v.value, replyToMessageId }),
    }));
    if (!res.ok) return res;

    scheduleDelivery(res.message);
    try {
      const sender = await repo.getProfile(senderId);
      await NotificationService.notifyNewMessage({
        recipientId: otherId, senderName: sender ? sender.displayName : 'Demo',
        text: res.message.text, chatId, muted: chat.muted,
      });
    } catch { /* notification ব্যর্থ হলেও বার্তা পাঠানো সফল */ }

    emitter.emit({ type: 'message', chatId, messageId: res.message.id });
    return res;
  },

  /** শুধু নিজের বার্তা; মালিকানা repository স্তরেও যাচাই হয় */
  async edit(messageId, actorId, text) {
    const settings = await repo.getSettings();
    const v = validateMessageText(text, settings.messageLengthLimit);
    if (!v.ok) return fail(v.error);
    const res = await guard(async () => ({ ok: true, message: await repo.editMessageText(messageId, actorId, v.value) }));
    if (res.ok) emitter.emit({ type: 'edited', chatId: res.message.chatId, messageId });
    return res;
  },

  async remove(messageId, actorId) {
    const existing = await repo.getMessage(messageId);
    const res = await guard(async () => ({ ok: await repo.deleteMessage(messageId, actorId) }));
    if (res.ok && existing) emitter.emit({ type: 'deleted', chatId: existing.chatId, messageId });
    return res;
  },

  /** Reply-এর উদ্ধৃত অংশ; লক্ষ্য বার্তা মুছে গেলে missing: true */
  async getReplyPreview(messageId, chatId) {
    const m = messageId ? await repo.getMessage(messageId) : null;
    if (!m || m.chatId !== chatId) return { missing: true, text: 'মুছে ফেলা বার্তা', senderId: null };
    return {
      missing: false, senderId: m.senderId,
      text: truncate(m.text.replace(/\s+/g, ' '), REPLY_PREVIEW_CHARS),
    };
  },

  /** Clipboard-এ কপি; সফল হলে true */
  async copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fallback-এ যাবে */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const done = document.execCommand('copy');
      ta.remove();
      return done;
    } catch { return false; }
  },

  /** readerId চ্যাট দেখলে অপর পক্ষের বার্তা simulated "read" হয় */
  async markChatRead(chatId, readerId) {
    const chat = await repo.getChat(chatId);
    if (!chat || !chat.participantIds.includes(readerId)) return fail('চ্যাট পাওয়া যায়নি।');
    const updated = await repo.advanceIncomingStatus(chatId, readerId, 'read');
    await NotificationService.markChatRead(readerId, chatId);
    if (updated) emitter.emit({ type: 'status', chatId, status: 'read' });
    return { ok: true, updated };
  },

  /** অ্যাপ চালু হলে: আগের session-এ আটকে থাকা 'sent' বার্তা simulated 'delivered' করে */
  async settlePending() {
    const all = await repo.listAllMessages();
    const chats = new Map();
    let count = 0;
    for (const m of all) {
      if (m.status !== 'sent') continue;
      if (!chats.has(m.chatId)) chats.set(m.chatId, await repo.getChat(m.chatId));
      const chat = chats.get(m.chatId);
      const recipientId = chat ? otherIdOf(chat, m.senderId) : null;
      if (!recipientId || await repo.isBlocked(recipientId, m.senderId)) continue;
      if (await repo.advanceMessageStatus(m.id, 'delivered')) count++;
    }
    if (count) emitter.emit({ type: 'status', status: 'delivered' });
    return count;
  },

  /**
   * Typing indicator DEMO: UI একটি "Demo: টাইপিং সিমুলেট" বোতাম থেকে ডাকবে।
   * এটি অন্য ডিভাইসের সঙ্গে যোগাযোগ নয়; UI-তে "সিমুলেশন" লেবেল দেখাতে হবে।
   */
  simulateTyping(chatId, typistId) {
    const key = `${chatId}|${typistId}`;
    const prev = typingTimers.get(key);
    if (prev) clearTimeout(prev.timer);
    emitter.emit({ type: 'typing', chatId, userId: typistId, typing: true, simulated: true });
    const timer = setTimeout(() => {
      typingTimers.delete(key);
      emitter.emit({ type: 'typing', chatId, userId: typistId, typing: false, simulated: true });
    }, config.typingMs);
    typingTimers.set(key, { timer });
  },

  stopTyping(chatId, typistId) {
    const key = `${chatId}|${typistId}`;
    const prev = typingTimers.get(key);
    if (!prev) return;
    clearTimeout(prev.timer);
    typingTimers.delete(key);
    emitter.emit({ type: 'typing', chatId, userId: typistId, typing: false, simulated: true });
  },
};
