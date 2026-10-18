import * as repo from '../storage/repository.js';

const fail = (error) => ({ ok: false, error });
const PREVIEW_CHARS = 80;

let activeChatId = null;

const deletedProfile = (id) => ({
  id, displayName: 'মুছে ফেলা প্রোফাইল', username: '', avatarInitials: '?', deleted: true,
});
const otherIdOf = (chat, meId) => chat.participantIds.find((id) => id !== meId) ?? null;
const involves = (chat, meId) => chat.participantIds.includes(meId);

function makePreview(text) {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length > PREVIEW_CHARS ? chars.slice(0, PREVIEW_CHARS).join('') + '…' : chars.join('');
}

export const ChatService = {
  /** নতুন মিথস্ক্রিয়া অনুমোদিত কি না (ব্লক, মুছে ফেলা প্রোফাইল)। MessageService-ও এটি ব্যবহার করে। */
  async checkInteraction(meId, otherId) {
    if (!meId || !otherId) return { ok: false, reason: 'প্রোফাইল পাওয়া যায়নি।' };
    if (meId === otherId) return { ok: false, reason: 'নিজের সঙ্গে চ্যাট করা যাবে না।' };
    const other = await repo.getProfile(otherId);
    if (!other) return { ok: false, reason: 'এই প্রোফাইল আর নেই।' };
    if (await repo.isBlocked(meId, otherId)) {
      return { ok: false, reason: 'আপনি এই প্রোফাইল ব্লক করেছেন। বার্তা পাঠাতে আগে আনব্লক করুন।' };
    }
    if (await repo.isBlocked(otherId, meId)) {
      return { ok: false, reason: 'এই প্রোফাইলের সঙ্গে এখন চ্যাট করা যাচ্ছে না।' };
    }
    return { ok: true };
  },

  async startChat(meId, otherId) {
    const me = meId ? await repo.getProfile(meId) : null;
    if (!me) return fail('বর্তমান প্রোফাইল পাওয়া যায়নি।');
    const check = await ChatService.checkInteraction(meId, otherId);
    if (!check.ok) return fail(check.reason);
    const { chat, created } = await repo.createChatIfAbsent(meId, otherId);
    return { ok: true, chat, created };
  },

  /** চ্যাট তালিকা: pinned আগে, তারপর সর্বশেষ কার্যকলাপ অনুযায়ী */
  async listChats(meId) {
    const [chats, profiles, blocks] = await Promise.all([
      repo.listChatsFor(meId), repo.listProfiles(), repo.listBlocks(meId),
    ]);
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const blockedSet = new Set(blocks.map((b) => b.blockedUserId));

    const items = [];
    for (const chat of chats) {
      const otherId = otherIdOf(chat, meId);
      const lastMessage = chat.lastMessageId ? await repo.getMessage(chat.lastMessageId) : null;
      items.push({
        chat,
        other: profileMap.get(otherId) || deletedProfile(otherId),
        lastMessage,
        lastFromMe: !!lastMessage && lastMessage.senderId === meId,
        preview: lastMessage ? makePreview(lastMessage.text) : '',
        unreadCount: await repo.countUnread(chat.id, meId),
        blockedByMe: blockedSet.has(otherId),
        sortKey: chat.lastMessageAt || chat.createdAt,
      });
    }
    items.sort((a, b) => {
      if (a.chat.pinned !== b.chat.pinned) return a.chat.pinned ? -1 : 1;
      return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0;
    });
    return items;
  },

  /** চ্যাট খোলে। বার্তা "read" করে না, UI আগে unread separator দেখিয়ে পরে MessageService.markChatRead ডাকবে। */
  async openChat(chatId, meId) {
    const chat = await repo.getChat(chatId);
    if (!chat || !involves(chat, meId)) return fail('চ্যাট পাওয়া যায়নি।');
    const otherId = otherIdOf(chat, meId);
    const [other, messages, interaction, blockedByMe] = await Promise.all([
      repo.getProfile(otherId), repo.listMessages(chatId),
      ChatService.checkInteraction(meId, otherId), repo.isBlocked(meId, otherId),
    ]);
    const unread = messages.filter((m) => m.senderId !== meId && m.status !== 'read');
    activeChatId = chatId;
    return {
      ok: true, chat,
      other: other || deletedProfile(otherId),
      messages,
      unreadCount: unread.length,
      firstUnreadMessageId: unread.length ? unread[0].id : null,
      blockedByMe,
      canSend: interaction.ok,
      cannotSendReason: interaction.ok ? null : interaction.reason,
    };
  },

  closeChat() { activeChatId = null; },
  getActiveChatId() { return activeChatId; },

  async setPinned(chatId, meId, pinned) {
    const chat = await repo.getChat(chatId);
    if (!chat || !involves(chat, meId)) return fail('চ্যাট পাওয়া যায়নি।');
    return { ok: true, chat: await repo.updateChat(chatId, { pinned: !!pinned }) };
  },

  async setMuted(chatId, meId, muted) {
    const chat = await repo.getChat(chatId);
    if (!chat || !involves(chat, meId)) return fail('চ্যাট পাওয়া যায়নি।');
    return { ok: true, chat: await repo.updateChat(chatId, { muted: !!muted }) };
  },

  /**
   * এই ডিভাইসে চ্যাটের সব বার্তা মোছে (দুই Demo প্রোফাইলেরই)।
   * UI-তে নিশ্চিতকরণের আগে এটি পরিষ্কার লিখতে হবে।
   */
  async clearHistory(chatId, meId) {
    const chat = await repo.getChat(chatId);
    if (!chat || !involves(chat, meId)) return fail('চ্যাট পাওয়া যায়নি।');
    const deleted = await repo.clearChatMessages(chatId);
    return { ok: true, deleted };
  },
};
