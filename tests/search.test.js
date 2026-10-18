import { describe, it, assert } from './runner.js';
import { SearchService, makeSnippet } from '../js/services/search-service.js';
import { ChatService } from '../js/services/chat-service.js';
import { makeUser, makeChat, sendOk } from './helpers.js';

async function seed() {
  const { a, b, chat } = await makeChat();
  const c = await makeUser('Karim', 'karim');
  const bc = (await ChatService.startChat(b.id, c.id)).chat;
  await sendOk(chat, a, 'Hello World');
  await sendOk(chat, b, 'আমি বাংলায় কথা বলছি');
  await sendOk(chat, a, 'Another 😀 message');
  await sendOk(bc, c, 'Secret World');
  return { a, b, c, chat, bc };
}

describe('Search', () => {
  it('finds messages case-insensitively, only in the searcher\'s own chats', async () => {
    const { a, c } = await seed();
    const r = await SearchService.searchMessages(a.id, 'WORLD');
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].message.text, 'Hello World');
    assert.equal(r.results[0].fromMe, true);
    assert.equal((await SearchService.searchMessages(c.id, 'hello')).results.length, 0, "cannot see others' chats");
  });

  it('finds Bengali text and emoji', async () => {
    const { a } = await seed();
    assert.equal((await SearchService.searchMessages(a.id, 'বাংলায়')).results.length, 1);
    assert.equal((await SearchService.searchMessages(a.id, '😀')).results.length, 1);
  });

  it('can be limited to one conversation', async () => {
    const { b, chat } = await seed();
    assert.equal((await SearchService.searchMessages(b.id, 'world')).results.length, 2);
    assert.equal((await SearchService.searchMessages(b.id, 'world', { chatId: chat.id })).results.length, 1);
  });

  it('finds conversations by name or username', async () => {
    const { a, chat } = await seed();
    const byName = await SearchService.searchConversations(a.id, 'sum');
    assert.equal(byName.results.length, 1);
    assert.equal(byName.results[0].chat.id, chat.id);
    assert.equal((await SearchService.searchConversations(a.id, 'SUMI')).results.length, 1);
    assert.equal((await SearchService.searchConversations(a.id, 'nobody')).results.length, 0);
  });

  it('returns nothing for empty queries and treats regex characters literally', async () => {
    const { a } = await seed();
    for (const q of ['', '   ', null, undefined]) {
      assert.equal((await SearchService.searchMessages(a.id, q)).results.length, 0);
    }
    assert.equal((await SearchService.searchMessages(a.id, '.*')).results.length, 0);
    assert.equal((await SearchService.searchMessages(a.id, '(')).results.length, 0);
  });

  it('snippets split into plain strings, never HTML', async () => {
    const { a, chat } = await seed();
    await sendOk(chat, a, 'tag <b>bold</b> here');
    const r = await SearchService.searchMessages(a.id, '<b>');
    assert.equal(r.results.length, 1);
    const s = r.results[0].snippet;
    assert.equal(s.match, '<b>');
    assert.equal(typeof s.before, 'string');
    assert.equal(typeof s.after, 'string');
  });

  it('makeSnippet highlights the matched part with original casing', () => {
    assert.deepEqual(makeSnippet('abc DEF ghi', 'def'), { before: 'abc ', match: 'DEF', after: ' ghi' });
    const none = makeSnippet('abc', 'zzz');
    assert.equal(none.match, '');
  });

  it('searchAll returns conversations and messages together', async () => {
    const { a } = await seed();
    const r = await SearchService.searchAll(a.id, 'sumi');
    assert.equal(r.conversations.length, 1);
    assert.equal(r.messages.length, 0);
  });
});
