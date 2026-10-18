import { describe, it, assert } from './runner.js';
import * as repo from '../js/storage/repository.js';
import { ChatService } from '../js/services/chat-service.js';
import { MessageService } from '../js/services/message-service.js';
import { PrivacyService } from '../js/services/privacy-service.js';
import { NotificationService } from '../js/services/notification-service.js';
import { makeChat, sendOk, makeUser } from './helpers.js';

describe('Blocking and unblocking', () => {
  it('blocks and unblocks, preventing new interaction while blocked', async () => {
    const { a, b, chat } = await makeChat();
    const existing = await sendOk(chat, a, 'before block');

    assert.ok((await PrivacyService.block(a.id, b.id)).ok);
    assert.equal((await MessageService.send({ chatId: chat.id, senderId: a.id, text: 'x' })).ok, false, 'blocker cannot send');
    assert.equal((await MessageService.send({ chatId: chat.id, senderId: b.id, text: 'x' })).ok, false, 'blocked cannot send');
    assert.equal((await ChatService.startChat(a.id, b.id)).ok, false);
    assert.ok(await repo.getMessage(existing.id), 'old messages are kept');

    const opened = await ChatService.openChat(chat.id, a.id);
    assert.equal(opened.canSend, false);
    assert.equal(opened.blockedByMe, true);
    const other = await ChatService.openChat(chat.id, b.id);
    assert.equal(other.canSend, false);
    assert.equal(other.blockedByMe, false);

    assert.ok((await PrivacyService.unblock(a.id, b.id)).ok);
    assert.ok((await MessageService.send({ chatId: chat.id, senderId: a.id, text: 'after unblock' })).ok);
    assert.ok((await MessageService.send({ chatId: chat.id, senderId: b.id, text: 'reply' })).ok);
  });

  it('lists blocked profiles and avoids duplicate block records', async () => {
    const { a, b } = await makeChat();
    await PrivacyService.block(a.id, b.id);
    await PrivacyService.block(a.id, b.id);
    assert.equal((await repo.listBlocks(a.id)).length, 1);
    const list = await PrivacyService.listBlocked(a.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].profile.id, b.id);
    assert.equal((await PrivacyService.listBlocked(b.id)).length, 0, 'block belongs to the blocker only');
  });

  it('refuses self-block, unknown profiles and unblocking a profile that is not blocked', async () => {
    const { a, b } = await makeChat();
    assert.equal((await PrivacyService.block(a.id, a.id)).ok, false);
    assert.equal((await PrivacyService.block(a.id, 'usr_nonexistent01')).ok, false);
    assert.equal((await PrivacyService.unblock(a.id, b.id)).ok, false);
  });

  it('shows a blocked profile as blocked in the chat list', async () => {
    const { a, b } = await makeChat();
    await PrivacyService.block(a.id, b.id);
    assert.equal((await ChatService.listChats(a.id))[0].blockedByMe, true);
    assert.equal((await ChatService.listChats(b.id))[0].blockedByMe, false);
  });

  it('relationship info reflects blocked, deleted and self', async () => {
    const { a, b } = await makeChat();
    assert.equal((await PrivacyService.getRelationship(a.id, b.id)).canChat, true);
    await PrivacyService.block(a.id, b.id);
    const rel = await PrivacyService.getRelationship(a.id, b.id);
    assert.equal(rel.blockedByMe, true);
    assert.equal(rel.canChat, false);
    assert.equal((await PrivacyService.getRelationship(a.id, a.id)).self, true);
    await repo.deleteProfile(b.id);
    assert.equal((await PrivacyService.getRelationship(a.id, b.id)).deleted, true);
  });
});

describe('Local demo reports', () => {
  it('stores a local report record and validates the reason', async () => {
    const { a, b } = await makeChat();
    const ok = await PrivacyService.report(a.id, b.id, '  spam messages  ');
    assert.ok(ok.ok);
    assert.equal(ok.report.reason, 'spam messages');
    assert.equal((await repo.listReports(a.id)).length, 1);
    assert.equal((await PrivacyService.report(a.id, b.id, '   ')).ok, false);
    assert.equal((await PrivacyService.report(a.id, b.id, 'x'.repeat(501))).ok, false);
    assert.equal((await PrivacyService.report(a.id, a.id, 'self')).ok, false);
    assert.equal((await repo.listReports(a.id)).length, 1);
  });
});

describe('In-app notifications', () => {
  it('creates a notification for the recipient only', async () => {
    const { a, b, chat } = await makeChat();
    await sendOk(chat, a, 'hello there');
    const forB = await NotificationService.list(b.id);
    assert.equal(forB.length, 1);
    assert.equal(forB[0].type, 'message');
    assert.equal(forB[0].title, 'Rahim');
    assert.equal(forB[0].body, 'hello there');
    assert.equal(forB[0].chatId, chat.id);
    assert.equal(forB[0].read, false);
    assert.equal((await NotificationService.list(a.id)).length, 0);
    assert.equal(await NotificationService.unreadCount(b.id), 1);
  });

  it('mark read, mark all read and clear work per profile', async () => {
    const { a, b, chat } = await makeChat();
    await sendOk(chat, a, 'one');
    await sendOk(chat, a, 'two');
    const list = await NotificationService.list(b.id);
    assert.equal(list.length, 2);
    assert.equal((await NotificationService.markRead(a.id, list[0].id)).ok, false, "cannot mark someone else's notification");
    assert.ok((await NotificationService.markRead(b.id, list[0].id)).ok);
    assert.equal(await NotificationService.unreadCount(b.id), 1);
    await NotificationService.markAllRead(b.id);
    assert.equal(await NotificationService.unreadCount(b.id), 0);
    await NotificationService.clear(b.id);
    assert.equal((await NotificationService.list(b.id)).length, 0);
  });

  it('opening the chat marks that chat\'s notifications read', async () => {
    const { a, b, chat } = await makeChat();
    await sendOk(chat, a, 'ping');
    assert.equal(await NotificationService.unreadCount(b.id), 1);
    await MessageService.markChatRead(chat.id, b.id);
    assert.equal(await NotificationService.unreadCount(b.id), 0);
  });

  it('respects muted chats and the notifications preference', async () => {
    const { a, b, chat } = await makeChat();
    await ChatService.setMuted(chat.id, a.id, true);
    await sendOk(chat, a, 'muted');
    assert.equal((await NotificationService.list(b.id)).length, 0);
    await ChatService.setMuted(chat.id, a.id, false);
    assert.ok((await NotificationService.setEnabled(false)).ok);
    assert.equal((await NotificationService.getPreferences()).notificationsEnabled, false);
    await sendOk(chat, a, 'disabled');
    assert.equal((await NotificationService.list(b.id)).length, 0);
    await NotificationService.setEnabled(true);
    await sendOk(chat, a, 'enabled');
    assert.equal((await NotificationService.list(b.id)).length, 1);
  });

  it('is honest about capabilities: no remote push in this version', () => {
    const caps = NotificationService.getCapabilities();
    assert.equal(caps.remotePush, false);
    assert.equal(caps.inApp, true);
    assert.equal(caps.native, false);
  });

  it('blocking creates a privacy notification for the blocker', async () => {
    const { a, b } = await makeChat();
    await PrivacyService.block(a.id, b.id);
    const list = await NotificationService.list(a.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].type, 'privacy');
  });

  it('a native notifier adapter receives notifications and failures are contained', async () => {
    const { a, b, chat } = await makeChat();
    const shown = [];
    NotificationService.setNativeNotifier({ show: (n) => { shown.push(n); } });
    await sendOk(chat, a, 'native?');
    assert.equal(shown.length, 1);
    NotificationService.setNativeNotifier({ show: () => { throw new Error('boom'); } });
    await sendOk(chat, a, 'adapter fails');
    assert.equal((await NotificationService.list(b.id)).length, 2, 'in-app list unaffected');
  });
});
