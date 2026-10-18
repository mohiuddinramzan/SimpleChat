import { describe, it, assert, sleep } from './runner.js';
import * as repo from '../js/storage/repository.js';
import { db, STORES } from '../js/storage/database.js';
import { ChatService } from '../js/services/chat-service.js';
import { makeUser, makeChat, sendOk } from './helpers.js';

describe('Conversations', () => {
  it('prevents duplicate conversations for the same participant pair', async () => {
    const { a, b, chat } = await makeChat();
    const again = await ChatService.startChat(a.id, b.id);
    const reversed = await ChatService.startChat(b.id, a.id);
    assert.ok(again.ok && reversed.ok);
    assert.equal(again.created, false);
    assert.equal(reversed.created, false);
    assert.equal(again.chat.id, chat.id);
    assert.equal(reversed.chat.id, chat.id);
    assert.equal((await repo.listChatsFor(a.id)).length, 1);
    const raw = await repo.createChatIfAbsent(a.id, b.id);
    assert.equal(raw.created, false);
  });

  it('the database itself rejects a second chat for the same pair', async () => {
    const { chat } = await makeChat();
    await assert.rejects(() => db.put(STORES.CHATS, { ...chat, id: 'chat_duplicate0001' }), null, 'unique pairKey index');
    assert.equal((await db.count(STORES.CHATS)), 1);
  });

  it('refuses chats with yourself or with a missing profile', async () => {
    const a = await makeUser('Rahim', 'rahim');
    assert.equal((await ChatService.startChat(a.id, a.id)).ok, false);
    assert.equal((await ChatService.startChat(a.id, 'usr_nonexistent01')).ok, false);
    assert.equal((await ChatService.startChat(null, a.id)).ok, false);
  });

  it('sorts by latest activity, pinned chats first', async () => {
    const a = await makeUser('Rahim', 'rahim');
    const b = await makeUser('Sumi', 'sumi');
    const c = await makeUser('Karim', 'karim');
    const ab = (await ChatService.startChat(a.id, b.id)).chat;
    const ac = (await ChatService.startChat(a.id, c.id)).chat;
    const ids = async () => (await ChatService.listChats(a.id)).map((i) => i.chat.id);

    await sendOk(ab, a, 'one');
    await sleep(5);
    await sendOk(ac, a, 'two');
    assert.deepEqual(await ids(), [ac.id, ab.id]);

    await sleep(5);
    await sendOk(ab, a, 'three');
    assert.deepEqual(await ids(), [ab.id, ac.id]);

    assert.ok((await ChatService.setPinned(ac.id, a.id, true)).ok);
    assert.deepEqual(await ids(), [ac.id, ab.id], 'pinned first');
  });

  it('pin and mute persist, and only participants may change them', async () => {
    const { a, b, chat } = await makeChat();
    const c = await makeUser('Karim', 'karim');
    assert.ok((await ChatService.setMuted(chat.id, a.id, true)).ok);
    assert.equal((await repo.getChat(chat.id)).muted, true);
    assert.ok((await ChatService.setPinned(chat.id, b.id, true)).ok);
    assert.equal((await repo.getChat(chat.id)).pinned, true);
    assert.equal((await ChatService.setPinned(chat.id, c.id, true)).ok, false);
    assert.equal((await ChatService.setMuted(chat.id, c.id, true)).ok, false);
  });

  it('shows last message preview, sender side and unread count', async () => {
    const { a, b, chat } = await makeChat();
    await sendOk(chat, a, 'প্রথম বার্তা\nদ্বিতীয় লাইন');
    const forB = (await ChatService.listChats(b.id))[0];
    assert.equal(forB.unreadCount, 1);
    assert.equal(forB.lastFromMe, false);
    assert.equal(forB.preview, 'প্রথম বার্তা দ্বিতীয় লাইন', 'newlines flattened in preview');
    const forA = (await ChatService.listChats(a.id))[0];
    assert.equal(forA.unreadCount, 0);
    assert.equal(forA.lastFromMe, true);
  });

  it('opens and closes conversations; strangers cannot open them', async () => {
    const { a, chat } = await makeChat();
    const stranger = await makeUser('Karim', 'karim');
    const res = await ChatService.openChat(chat.id, a.id);
    assert.ok(res.ok);
    assert.equal(ChatService.getActiveChatId(), chat.id);
    ChatService.closeChat();
    assert.equal(ChatService.getActiveChatId(), null);
    assert.equal((await ChatService.openChat(chat.id, stranger.id)).ok, false);
    assert.equal((await ChatService.openChat('chat_missing000001', a.id)).ok, false);
  });

  it('handles deleted profiles gracefully', async () => {
    const { a, b, chat } = await makeChat();
    await sendOk(chat, b, 'hello');
    await repo.deleteProfile(b.id);
    const item = (await ChatService.listChats(a.id))[0];
    assert.equal(item.other.deleted, true);
    assert.equal(item.other.displayName, 'মুছে ফেলা প্রোফাইল');
    assert.equal(item.preview, 'hello', 'history still visible');
    const opened = await ChatService.openChat(chat.id, a.id);
    assert.ok(opened.ok);
    assert.equal(opened.canSend, false);
    assert.ok(opened.cannotSendReason);
  });

  it('clearing history removes messages but keeps the chat', async () => {
    const { a, chat } = await makeChat();
    await sendOk(chat, a, 'one');
    await sendOk(chat, a, 'two');
    const res = await ChatService.clearHistory(chat.id, a.id);
    assert.ok(res.ok);
    assert.equal(res.deleted, 2);
    assert.equal((await repo.listMessages(chat.id)).length, 0);
    const after = await repo.getChat(chat.id);
    assert.equal(after.lastMessageId, null);
    assert.equal(after.lastMessageAt, null);
  });
});
