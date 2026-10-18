import * as repo from '../js/storage/repository.js';
import { ChatService } from '../js/services/chat-service.js';
import { MessageService } from '../js/services/message-service.js';
import { BACKUP_FORMAT } from '../js/utils/validators.js';

export const T = '2026-01-01T10:00:00.000Z';
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const localKey = (k) => (globalThis.__SIMPLECHAT_STORAGE_PREFIX__ || 'simplechat.') + k;

export const makeUser = (displayName, username, extra = {}) =>
  repo.createProfile({ displayName, username, ...extra });

export async function makeChat(nameA = ['Rahim', 'rahim'], nameB = ['Sumi', 'sumi']) {
  const a = await makeUser(...nameA);
  const b = await makeUser(...nameB);
  const res = await ChatService.startChat(a.id, b.id);
  if (!res.ok) throw new Error('startChat failed: ' + res.error);
  return { a, b, chat: res.chat };
}

export async function sendOk(chat, sender, text, extra = {}) {
  const res = await MessageService.send({ chatId: chat.id, senderId: sender.id, text, ...extra });
  if (!res.ok) throw new Error('send failed: ' + res.error);
  return res.message;
}

/** ডেটাবেস ছাড়া, সরাসরি validator-এর জন্য একটি বৈধ ব্যাকআপ */
export function baseBackup() {
  return {
    format: BACKUP_FORMAT, version: 1, exportedAt: T,
    data: {
      profiles: [
        { id: 'usr_testuser0001', displayName: 'Rahim', username: 'rahim', email: 'rahim@example.com', phone: null, avatarInitials: 'R', createdAt: T },
        { id: 'usr_testuser0002', displayName: 'সুমি', username: 'sumi', email: null, phone: '+8801700000000', avatarInitials: 'স', createdAt: T },
      ],
      chats: [
        { id: 'chat_testchat0001', participantIds: ['usr_testuser0001', 'usr_testuser0002'], lastMessageId: null, lastMessageAt: null, pinned: false, muted: false, createdAt: T },
      ],
      messages: [
        { id: 'msg_testmsg00001', chatId: 'chat_testchat0001', senderId: 'usr_testuser0001', text: 'হ্যালো 😀', createdAt: T, updatedAt: T, status: 'sent', replyToMessageId: null, edited: false },
      ],
      blocks: [], notifications: [], reports: [],
      settings: { theme: 'system', notificationsEnabled: true, lastSeenPrivacy: 'nobody', messageLengthLimit: 1000 },
    },
  };
}
