import * as repo from '../storage/repository.js';
import { ChatService } from './chat-service.js';

const MAX_RESULTS = 100;
const MAX_QUERY_CHARS = 100;
const BEFORE_CHARS = 30;
const AFTER_CHARS = 50;

const normalize = (s) => String(s ?? '').normalize('NFC').toLowerCase();

export function cleanQuery(query) {
  return Array.from(String(query ?? '').trim()).slice(0, MAX_QUERY_CHARS).join('');
}

/**
 * টেক্সটকে {before, match, after}-এ ভাঙে, যাতে UI textContent দিয়ে নিরাপদে হাইলাইট করতে পারে
 * (কোনো HTML তৈরি হয় না)। Case-folding-এ দৈর্ঘ্য বদলালে হাইলাইট ছাড়া শুরুর অংশ দেখায়।
 */
export function makeSnippet(text, query) {
  const flat = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const q = normalize(query).trim();
  const lower = flat.toLowerCase();
  const idx = q && lower.length === flat.length ? lower.indexOf(q) : -1;
  if (idx < 0) {
    const chars = Array.from(flat);
    return { before: '', match: '', after: chars.slice(0, AFTER_CHARS + BEFORE_CHARS).join('') + (chars.length > AFTER_CHARS + BEFORE_CHARS ? '…' : '') };
  }
  const beforeChars = Array.from(flat.slice(0, idx));
  const afterChars = Array.from(flat.slice(idx + q.length));
  return {
    before: (beforeChars.length > BEFORE_CHARS ? '…' : '') + beforeChars.slice(-BEFORE_CHARS).join(''),
    match: flat.slice(idx, idx + q.length),
    after: afterChars.slice(0, AFTER_CHARS).join('') + (afterChars.length > AFTER_CHARS ? '…' : ''),
  };
}

const deletedProfile = (id) => ({
  id, displayName: 'মুছে ফেলা প্রোফাইল', username: '', avatarInitials: '?', deleted: true,
});

export const SearchService = {
  /** নাম বা ইউজারনেম দিয়ে চ্যাট খোঁজে; ফল ChatService.listChats-এর item-এর মতো (+ nameSnippet) */
  async searchConversations(meId, query) {
    const q = normalize(cleanQuery(query)).trim();
    if (!q) return { ok: true, query: '', results: [] };
    const items = await ChatService.listChats(meId);
    const results = items
      .filter((it) => normalize(it.other.displayName).includes(q) || normalize(it.other.username).includes(q))
      .slice(0, MAX_RESULTS)
      .map((it) => ({ ...it, nameSnippet: makeSnippet(it.other.displayName, q) }));
    return { ok: true, query: q, results };
  },

  /** বার্তার টেক্সটে খোঁজে; শুধু meId-এর নিজের চ্যাটগুলোতে। chatId দিলে শুধু সেই চ্যাটে। */
  async searchMessages(meId, query, { chatId = null } = {}) {
    const q = normalize(cleanQuery(query)).trim();
    if (!q) return { ok: true, query: '', results: [] };

    let chats = await repo.listChatsFor(meId);
    if (chatId) chats = chats.filter((c) => c.id === chatId);
    const chatMap = new Map(chats.map((c) => [c.id, c]));
    if (!chatMap.size) return { ok: true, query: q, results: [] };

    const [all, profiles] = await Promise.all([repo.listAllMessages(), repo.listProfiles()]);
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const results = all
      .filter((m) => chatMap.has(m.chatId) && normalize(m.text).includes(q))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, MAX_RESULTS)
      .map((m) => {
        const chat = chatMap.get(m.chatId);
        const otherId = chat.participantIds.find((id) => id !== meId);
        return {
          message: m, chat,
          other: profileMap.get(otherId) || deletedProfile(otherId),
          fromMe: m.senderId === meId,
          snippet: makeSnippet(m.text, q),
        };
      });
    return { ok: true, query: q, results };
  },

  async searchAll(meId, query) {
    const [conversations, messages] = await Promise.all([
      SearchService.searchConversations(meId, query),
      SearchService.searchMessages(meId, query),
    ]);
    return { ok: true, query: conversations.query, conversations: conversations.results, messages: messages.results };
  },
};
