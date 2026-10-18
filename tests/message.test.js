import { describe, it, assert, waitFor } from './runner.js';
import * as repo from '../js/storage/repository.js';
import { ChatService } from '../js/services/chat-service.js';
import { MessageService } from '../js/services/message-service.js';
import { makeChat, sendOk, makeUser } from './helpers.js';

describe('Sending messages', () => {
  it('sends a message and updates the chat', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, '  hello \r\n world ');
    assert.equal(m.text, 'hello \n world', 'trimmed, CRLF normalized');
    assert.equal(m.status, 'sent');
    assert.equal(m.edited, false);
    assert.equal(m.replyToMessageId, null);
    const stored = await repo.getChat(chat.id);
    assert.equal(stored.lastMessageId, m.id);
    assert.equal(stored.lastMessageAt, m.createdAt);
    assert.equal((await repo.listMessages(chat.id)).length, 1);
  });

  it('keeps the send order even when messages are sent back to back', async () => {
    const { a, b, chat } = await makeChat();
    const texts = ['m0', 'm1', 'm2', 'm3', 'm4'];
    for (const [i, t] of texts.entries()) await sendOk(chat, i % 2 ? b : a, t);
    const msgs = await repo.listMessages(chat.id);
    assert.deepEqual(msgs.map((m) => m.text), texts);
    for (let i = 1; i < msgs.length; i++) assert.ok(msgs[i].createdAt > msgs[i - 1].createdAt, 'strictly increasing timestamps');
  });

  it('rejects senders who are not in the chat', async () => {
    const { chat } = await makeChat();
    const stranger = await makeUser('Karim', 'karim');
    const res = await MessageService.send({ chatId: chat.id, senderId: stranger.id, text: 'hi' });
    assert.equal(res.ok, false);
    assert.equal((await repo.listMessages(chat.id)).length, 0);
  });

  it('keeps multiline text intact', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, 'লাইন ১\n\nলাইন ৩');
    assert.equal((await repo.getMessage(m.id)).text, 'লাইন ১\n\nলাইন ৩');
  });
});

describe('Empty and oversized messages', () => {
  it('rejects empty, whitespace-only and invisible-only messages', async () => {
    const { a, chat } = await makeChat();
    for (const bad of ['', '   ', '\n\t \n', '\u200B\u200D\uFEFF', null, undefined, 42]) {
      const res = await MessageService.send({ chatId: chat.id, senderId: a.id, text: bad });
      assert.equal(res.ok, false, `text ${JSON.stringify(bad)}`);
      assert.ok(res.error.length > 0);
    }
    assert.equal((await repo.listMessages(chat.id)).length, 0);
  });

  it('enforces the default limit exactly (1000 characters)', async () => {
    const { a, chat } = await makeChat();
    assert.ok((await MessageService.send({ chatId: chat.id, senderId: a.id, text: 'a'.repeat(1000) })).ok);
    const over = await MessageService.send({ chatId: chat.id, senderId: a.id, text: 'a'.repeat(1001) });
    assert.equal(over.ok, false);
    assert.includes(over.error, '1000');
  });

  it('counts emoji and Bengali as characters, not UTF-16 units', async () => {
    const { a, chat } = await makeChat();
    assert.ok((await MessageService.send({ chatId: chat.id, senderId: a.id, text: '😀'.repeat(1000) })).ok);
    assert.equal((await MessageService.send({ chatId: chat.id, senderId: a.id, text: '😀'.repeat(1001) })).ok, false);
  });

  it('honors a configured limit and refuses invalid limits', async () => {
    const { a, chat } = await makeChat();
    await assert.rejects(() => repo.updateSettings({ messageLengthLimit: 5 }), (e) => e.code === 'INVALID_SETTINGS');
    await assert.rejects(() => repo.updateSettings({ messageLengthLimit: 5001 }), (e) => e.code === 'INVALID_SETTINGS');
    await assert.rejects(() => repo.updateSettings({ messageLengthLimit: 'many' }), (e) => e.code === 'INVALID_SETTINGS');
    await repo.updateSettings({ messageLengthLimit: 10 });
    assert.ok((await MessageService.send({ chatId: chat.id, senderId: a.id, text: '1234567890' })).ok);
    assert.equal((await MessageService.send({ chatId: chat.id, senderId: a.id, text: '12345678901' })).ok, false);
  });
});

describe('Edit, delete and reply', () => {
  it('lets the author edit their own message', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, 'before');
    const res = await MessageService.edit(m.id, a.id, 'after');
    assert.ok(res.ok);
    assert.equal(res.message.text, 'after');
    assert.equal(res.message.edited, true);
    assert.ok(res.message.updatedAt >= res.message.createdAt);
    assert.equal((await repo.getMessage(m.id)).text, 'after');
  });

  it('never edits another profile\'s message, at service or repository level', async () => {
    const { a, b, chat } = await makeChat();
    const m = await sendOk(chat, a, 'mine');
    const res = await MessageService.edit(m.id, b.id, 'hijacked');
    assert.equal(res.ok, false);
    await assert.rejects(() => repo.editMessageText(m.id, b.id, 'hijacked'), (e) => e.code === 'FORBIDDEN');
    const stored = await repo.getMessage(m.id);
    assert.equal(stored.text, 'mine');
    assert.equal(stored.edited, false);
  });

  it('rejects editing to empty text', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, 'keep me');
    assert.equal((await MessageService.edit(m.id, a.id, '   ')).ok, false);
    assert.equal((await repo.getMessage(m.id)).text, 'keep me');
  });

  it('never deletes another profile\'s message', async () => {
    const { a, b, chat } = await makeChat();
    const m = await sendOk(chat, a, 'mine');
    assert.equal((await MessageService.remove(m.id, b.id)).ok, false);
    await assert.rejects(() => repo.deleteMessage(m.id, b.id), (e) => e.code === 'FORBIDDEN');
    assert.ok(await repo.getMessage(m.id), 'still there');
  });

  it('deleting the last message recalculates the chat preview', async () => {
    const { a, chat } = await makeChat();
    const m1 = await sendOk(chat, a, 'first');
    const m2 = await sendOk(chat, a, 'second');
    assert.ok((await MessageService.remove(m2.id, a.id)).ok);
    assert.equal((await repo.getChat(chat.id)).lastMessageId, m1.id);
    assert.ok((await MessageService.remove(m1.id, a.id)).ok);
    const chatNow = await repo.getChat(chat.id);
    assert.equal(chatNow.lastMessageId, null);
    assert.equal(chatNow.lastMessageAt, null);
  });

  it('supports replies, rejects invalid targets, and shows deleted targets as missing', async () => {
    const { a, b, chat } = await makeChat();
    const m1 = await sendOk(chat, a, 'question?');
    const reply = await MessageService.send({ chatId: chat.id, senderId: b.id, text: 'answer', replyToMessageId: m1.id });
    assert.ok(reply.ok);
    assert.equal(reply.message.replyToMessageId, m1.id);

    const bad = await MessageService.send({ chatId: chat.id, senderId: b.id, text: 'x', replyToMessageId: 'msg_nonexistent01' });
    assert.equal(bad.ok, false);

    const preview = await MessageService.getReplyPreview(m1.id, chat.id);
    assert.equal(preview.missing, false);
    assert.equal(preview.text, 'question?');

    await MessageService.remove(m1.id, a.id);
    const gone = await MessageService.getReplyPreview(m1.id, chat.id);
    assert.equal(gone.missing, true);
  });

  it('a reply cannot point to a message from another chat', async () => {
    const one = await makeChat();
    const c = await makeUser('Karim', 'karim');
    const other = (await ChatService.startChat(one.a.id, c.id)).chat;
    const foreign = await sendOk(other, one.a, 'elsewhere');
    const res = await MessageService.send({ chatId: one.chat.id, senderId: one.a.id, text: 'x', replyToMessageId: foreign.id });
    assert.equal(res.ok, false);
  });
});

describe('Read status simulation', () => {
  it('sent → delivered → read, driven only by local simulation', async () => {
    const { a, b, chat } = await makeChat();
    const m = await sendOk(chat, a, 'hi');
    assert.equal(m.status, 'sent');

    await waitFor(async () => (await repo.getMessage(m.id)).status === 'delivered', { message: 'delivered' });
    assert.equal(await repo.countUnread(chat.id, b.id), 1);
    assert.equal(await repo.countUnread(chat.id, a.id), 0);

    const opened = await ChatService.openChat(chat.id, b.id);
    assert.equal(opened.unreadCount, 1);
    assert.equal(opened.firstUnreadMessageId, m.id, 'unread separator anchor');
    assert.equal((await repo.getMessage(m.id)).status, 'delivered', 'opening alone does not mark read');

    const res = await MessageService.markChatRead(chat.id, b.id);
    assert.ok(res.ok);
    assert.equal(res.updated, 1);
    assert.equal((await repo.getMessage(m.id)).status, 'read');
    assert.equal(await repo.countUnread(chat.id, b.id), 0);
  });

  it('reading your own chat never marks your own messages read', async () => {
    const { a, chat } = await makeChat();
    const m = await sendOk(chat, a, 'mine');
    const res = await MessageService.markChatRead(chat.id, a.id);
    assert.equal(res.updated, 0);
    assert.ok((await repo.getMessage(m.id)).status !== 'read', 'still not read');
  });

  it('status never moves backwards and rejects unknown values', async () => {
    const { a, b, chat } = await makeChat();
    const m = await sendOk(chat, a, 'hi');
    await MessageService.markChatRead(chat.id, b.id);
    assert.equal(await repo.advanceMessageStatus(m.id, 'sent'), false);
    assert.equal(await repo.advanceMessageStatus(m.id, 'delivered'), false);
    assert.equal((await repo.getMessage(m.id)).status, 'read');
    await assert.rejects(() => repo.advanceMessageStatus(m.id, 'seen'), (e) => e.code === 'INVALID');
  });

  it('a recipient who blocked the sender never gets simulated delivery', async () => {
    const { a, b, chat } = await makeChat();
    MessageService.configure({ deliveryDelayMs: 60 });
    const m = await sendOk(chat, a, 'hi');
    await repo.addBlock(b.id, a.id);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await repo.getMessage(m.id)).status, 'sent');
  });

  it('only chat participants can mark a chat read', async () => {
    const { chat } = await makeChat();
    const stranger = await makeUser('Karim', 'karim');
    assert.equal((await MessageService.markChatRead(chat.id, stranger.id)).ok, false);
  });

  it('typing indicator is a labelled simulation that stops by itself', async () => {
    const { a, b, chat } = await makeChat();
    const events = [];
    const off = MessageService.onChange((e) => { if (e.type === 'typing') events.push(e); });
    MessageService.simulateTyping(chat.id, b.id);
    await waitFor(() => events.length >= 2, { message: 'typing start + stop' });
    off();
    assert.equal(events[0].typing, true);
    assert.equal(events[0].simulated, true);
    assert.equal(events[1].typing, false);
    assert.equal(events[0].userId, b.id);
    assert.ok(a.id !== b.id);
  });
});
