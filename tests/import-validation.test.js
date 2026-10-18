import { describe, it, assert } from './runner.js';
import { validateBackup, parseBackupText, validateMessageText, LIMITS } from '../js/utils/validators.js';
import * as repo from '../js/storage/repository.js';
import { baseBackup, clone, makeChat, sendOk } from './helpers.js';

function expectInvalid(mutate, label) {
  const b = baseBackup();
  mutate(b);
  const r = validateBackup(b);
  assert.equal(r.ok, false, label);
  assert.ok(Array.isArray(r.errors) && r.errors.length > 0 && typeof r.errors[0] === 'string', `${label}: readable error`);
}

describe('Import validation: valid data', () => {
  it('accepts a well-formed backup and recomputes the last message', () => {
    const r = validateBackup(baseBackup());
    assert.ok(r.ok);
    assert.equal(r.value.chats[0].lastMessageId, 'msg_testmsg00001');
    assert.equal(r.value.messages[0].text, 'হ্যালো 😀');
  });

  it('strips unknown fields such as passwords', () => {
    const b = baseBackup();
    b.data.profiles[0].password = 'secret';
    b.data.profiles[0].otp = '1234';
    const r = validateBackup(b);
    assert.ok(r.ok);
    assert.equal(r.value.profiles[0].password, undefined);
    assert.equal(r.value.profiles[0].otp, undefined);
  });

  it('keeps HTML-looking text as plain text', () => {
    const b = baseBackup();
    b.data.messages[0].text = '<img src=x onerror=alert(1)>';
    const r = validateBackup(b);
    assert.ok(r.ok);
    assert.equal(r.value.messages[0].text, '<img src=x onerror=alert(1)>');
  });

  it('does not let a __proto__ key pollute objects', () => {
    const json = JSON.stringify(baseBackup());
    const text = '{"__proto__":{"polluted":true},' + json.slice(1);
    const r = parseBackupText(text);
    assert.ok(r.ok);
    assert.equal(({}).polluted, undefined);
  });

  it('settings are optional and default when missing', () => {
    const b = baseBackup();
    delete b.data.settings;
    const r = validateBackup(b);
    assert.ok(r.ok);
    assert.equal(r.value.settings.messageLengthLimit, 1000);
  });
});

describe('Malformed imported data', () => {
  it('rejects non-JSON, empty and non-object files', () => {
    for (const text of ['', '   ', 'not json', '[]', 'null', '42', '"text"', '{']) {
      const r = parseBackupText(text);
      assert.equal(r.ok, false, `text ${JSON.stringify(text)}`);
      assert.ok(r.errors.length > 0);
    }
  });

  it('rejects wrong format, bad versions and missing sections', () => {
    expectInvalid((b) => { b.format = 'other-app'; }, 'format');
    expectInvalid((b) => { b.version = 999; }, 'future version');
    expectInvalid((b) => { b.version = 0; }, 'version 0');
    expectInvalid((b) => { b.version = '1'; }, 'version as string');
    expectInvalid((b) => { delete b.data; }, 'no data');
    expectInvalid((b) => { b.data = []; }, 'data is array');
    expectInvalid((b) => { delete b.data.messages; }, 'no messages list');
    expectInvalid((b) => { b.data.messages = {}; }, 'messages not array');
  });

  it('rejects too many records', () => {
    expectInvalid((b) => { b.data.profiles = new Array(LIMITS.MAX_ITEMS.profiles + 1).fill(null); }, 'profile limit');
  });

  it('rejects invalid profiles', () => {
    expectInvalid((b) => { b.data.profiles[0].id = 'x'; }, 'bad id');
    expectInvalid((b) => { b.data.profiles[0].id = 'chat_testuser0001'; }, 'wrong id prefix');
    expectInvalid((b) => { b.data.profiles[0].email = 'not-an-email'; }, 'bad email');
    expectInvalid((b) => { b.data.profiles[0].phone = '12'; }, 'bad phone');
    expectInvalid((b) => { b.data.profiles[0].username = 'Bad Name!'; }, 'bad username');
    expectInvalid((b) => { b.data.profiles[0].displayName = ''; }, 'empty name');
    expectInvalid((b) => { b.data.profiles[0].createdAt = 'yesterday'; }, 'bad date');
    expectInvalid((b) => { b.data.profiles[1].username = 'rahim'; }, 'duplicate username');
    expectInvalid((b) => { b.data.profiles.push(clone(b.data.profiles[0])); }, 'duplicate record');
  });

  it('rejects invalid chats', () => {
    expectInvalid((b) => { b.data.chats[0].participantIds = ['usr_testuser0001']; }, 'one participant');
    expectInvalid((b) => { b.data.chats[0].participantIds = ['usr_testuser0001', 'usr_testuser0001']; }, 'same participant twice');
    expectInvalid((b) => { b.data.chats[0].participantIds = ['usr_testuser0001', 'nope']; }, 'bad participant id');
    expectInvalid((b) => {
      const c = clone(b.data.chats[0]);
      c.id = 'chat_testchat0002';
      c.participantIds = ['usr_testuser0002', 'usr_testuser0001'];
      b.data.chats.push(c);
    }, 'duplicate pair');
  });

  it('rejects invalid messages', () => {
    expectInvalid((b) => { b.data.messages[0].chatId = 'chat_unknown00001'; }, 'unknown chat');
    expectInvalid((b) => { b.data.messages[0].senderId = 'usr_testuser0003'; }, 'sender not in chat');
    expectInvalid((b) => { b.data.messages[0].status = 'seen'; }, 'bad status');
    expectInvalid((b) => { b.data.messages[0].text = ''; }, 'empty text');
    expectInvalid((b) => { b.data.messages[0].text = '   \n '; }, 'whitespace text');
    expectInvalid((b) => { b.data.messages[0].text = 'a'.repeat(LIMITS.MESSAGE_MAX + 1); }, 'oversized text');
    expectInvalid((b) => { b.data.messages[0].text = 123; }, 'non-string text');
    expectInvalid((b) => { b.data.messages[0].id = 'chat_testmsg00001'; }, 'wrong id prefix');
    expectInvalid((b) => { b.data.messages[0].createdAt = 'soon'; }, 'bad date');
    expectInvalid((b) => { b.data.messages[0].replyToMessageId = 'nope'; }, 'bad reply id');
    expectInvalid((b) => { b.data.messages.push(clone(b.data.messages[0])); }, 'duplicate message id');
  });

  it('rejects invalid blocks, notifications, reports and settings', () => {
    const T = '2026-01-01T10:00:00.000Z';
    expectInvalid((b) => { b.data.blocks = [{ id: 'blk_testblock001', ownerId: 'usr_testuser0001', blockedUserId: 'usr_testuser0001', createdAt: T }]; }, 'self block');
    expectInvalid((b) => { b.data.notifications = [{ id: 'ntf_testnotif001', userId: 'usr_testuser0001', type: 'ad', title: 't', body: 'b', read: false, createdAt: T }]; }, 'bad notification type');
    expectInvalid((b) => { b.data.notifications = [{ id: 'ntf_testnotif001', userId: 'usr_testuser0001', type: 'system', title: 't', body: 'b', read: 'no', createdAt: T }]; }, 'read not boolean');
    expectInvalid((b) => { b.data.reports = [{ id: 'rpt_testreport01', reporterId: 'usr_testuser0001', reportedUserId: 'usr_testuser0001', reason: 'x', createdAt: T }]; }, 'self report');
    expectInvalid((b) => { b.data.reports = [{ id: 'rpt_testreport01', reporterId: 'usr_testuser0001', reportedUserId: 'usr_testuser0002', reason: '', createdAt: T }]; }, 'empty report reason');
    expectInvalid((b) => { b.data.settings.theme = 'neon'; }, 'bad theme');
    expectInvalid((b) => { b.data.settings.messageLengthLimit = 5; }, 'limit too small');
    expectInvalid((b) => { b.data.settings.messageLengthLimit = 'many'; }, 'limit not a number');
    expectInvalid((b) => { b.data.settings.notificationsEnabled = 'yes'; }, 'notifications not boolean');
    expectInvalid((b) => { b.data.settings.lastSeenPrivacy = 'friends'; }, 'bad privacy option');
  });

  it('a rejected backup never reaches the database', async () => {
    const { chat, a } = await makeChat();
    await sendOk(chat, a, 'survivor');
    const bad = baseBackup();
    bad.data.messages[0].status = 'seen';
    await assert.rejects(
      () => repo.importBackup(JSON.stringify(bad), { confirmReplace: true }),
      (e) => e.code === 'INVALID_BACKUP' && Array.isArray(e.details) && e.details.length > 0);
    assert.equal((await repo.listMessages(chat.id)).length, 1);
  });
});

describe('Message validation helper', () => {
  it('normalizes whitespace and rejects control-only text', () => {
    assert.equal(validateMessageText('a\u0000b').value, 'ab');
    assert.equal(validateMessageText('\u0000\u0001').ok, false);
    assert.equal(validateMessageText('ক্‍ষ').value, 'ক্‍ষ', 'ZWJ preserved for Bengali conjuncts');
  });
});
