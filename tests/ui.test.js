import { describe, it, assert } from './runner.js';
import { el } from '../js/utils/dom.js';
import { setState } from '../js/state.js';
import { messageRow } from '../js/components/message-bubble.js';
import { makeInitials } from '../js/utils/validators.js';
import { chatRoomRoute } from '../js/screens/chat-room.js';
import { chatsRoute } from '../js/screens/chats.js';
import { routes } from '../js/screens/index.js';
import { openDialog, closeTopDialog } from '../js/components/dialog.js';
import { ChatService } from '../js/services/chat-service.js';
import { MessageService } from '../js/services/message-service.js';
import * as repo from '../js/storage/repository.js';
import { T, makeChat, sendOk } from './helpers.js';

const MEDIA_WORDS = /(ছবি|ফাইল|অডিও|ভিডিও|ক্যামেরা|ভয়েস|সংযুক্ত|গ্যালারি|attach|photo|image|camera|voice|video|audio|file|upload|gallery|sticker|gif)/i;

function msg(extra = {}) {
  return { id: 'msg_testmsg00001', chatId: 'chat_testchat0001', senderId: 'usr_testuser0001', text: 'hi', createdAt: T, updatedAt: T, status: 'sent', replyToMessageId: null, edited: false, ...extra };
}

describe('Bengali and emoji rendering', () => {
  it('renders Bengali, emoji and conjuncts exactly as typed', () => {
    const text = 'আমি বাংলায় লিখছি 😀 ক্ষ ক্‍ষ';
    const row = messageRow({ message: msg({ text }), own: true, onOpen() {} });
    assert.equal(row.querySelector('.bubble-text').textContent, text);
  });

  it('never turns message text into HTML', () => {
    const evil = '<img src=x onerror="alert(1)"> <script>alert(2)</script> <svg onload=alert(3)> আমি 😀';
    const row = messageRow({
      message: msg({ text: evil }), own: false, onOpen() {},
      quote: { author: '<b>x</b>', text: '<i>y</i>', missing: false },
    });
    assert.equal(row.querySelector('.bubble-text').textContent, evil);
    assert.equal(row.querySelector('img, script, svg, iframe, b, i'), null, 'no injected elements');
  });

  it('dom helper uses text nodes, not HTML parsing', () => {
    const a = el('div', { text: '<b>x</b>' });
    assert.equal(a.children.length, 0);
    assert.equal(a.textContent, '<b>x</b>');
    const b = el('p', {}, ['<i>y</i>']);
    assert.equal(b.children.length, 0);
  });

  it('labels delivery and read states as demo (simulated)', () => {
    const delivered = messageRow({ message: msg({ status: 'delivered' }), own: true, onOpen() {} });
    const read = messageRow({ message: msg({ status: 'read' }), own: true, onOpen() {} });
    assert.includes(delivered.textContent, 'ডেমো');
    assert.includes(read.textContent, 'ডেমো');
  });

  it('builds initials for Latin and Bengali names', () => {
    assert.equal(makeInitials('Sumi Rahman'), 'SR');
    const bn = makeInitials('রাহিম');
    assert.ok(bn.length > 0 && !bn.includes('\uFFFD'));
    if (typeof Intl !== 'undefined' && Intl.Segmenter) assert.equal(bn, 'রা', 'first grapheme, not first code point');
  });

  it('Bengali and emoji survive storage unchanged', async () => {
    const { a, chat } = await makeChat();
    const text = 'বাংলা টেক্সট 🇧🇩 👨‍👩‍👧 ক্‍ষ';
    const m = await sendOk(chat, a, text);
    assert.equal((await repo.getMessage(m.id)).text, text);
  });
});

describe('Version 1 has no media features', () => {
  async function renderChatRoom() {
    const { a, chat } = await makeChat();
    await sendOk(chat, a, 'hello');
    setState({ user: a });
    return chatRoomRoute.render({ params: { id: chat.id } });
  }

  function labels(node) {
    return [...node.querySelectorAll('a, button')]
      .map((n) => [n.getAttribute('aria-label'), n.getAttribute('title'), n.textContent].join(' ')).join(' | ');
  }

  it('chat room has a text composer and no attachment, file, camera or voice controls', async () => {
    const res = await renderChatRoom();
    const node = res.node;
    assert.equal(node.querySelectorAll('input[type="file"]').length, 0, 'no file input');
    assert.equal(node.querySelectorAll('[accept]').length, 0, 'no accept attribute');
    assert.equal(node.querySelectorAll('img, video, audio, canvas, picture').length, 0, 'no media elements');
    assert.equal(node.querySelectorAll('textarea').length, 1, 'exactly one text composer');
    assert.equal(node.querySelectorAll('form button[type="submit"]').length, 1, 'one send button');
    const l = labels(node);
    assert.ok(!MEDIA_WORDS.test(l), `no media-related controls: ${l}`);
    res.destroy();
  });

  it('chat list has no media controls either', async () => {
    const { a } = await makeChat();
    setState({ user: a });
    const res = await chatsRoute.render();
    assert.equal(res.node.querySelectorAll('input[type="file"], [accept]').length, 0);
    assert.ok(!MEDIA_WORDS.test(labels(res.node)));
    res.destroy();
  });

  it('services expose no media or attachment API', () => {
    for (const svc of [MessageService, ChatService]) {
      for (const key of Object.keys(svc)) assert.ok(!/media|image|photo|audio|video|file|attach|upload|voice/i.test(key), `service key ${key}`);
    }
  });

  it('index.html contains no file input', async () => {
    const html = await (await fetch('../index.html')).text();
    assert.ok(!/type=["']file["']/i.test(html));
    assert.includes(html, "script-src 'self'");
  });
});

describe('Screens and source hygiene', () => {
  it('registers every required screen route', () => {
    const paths = routes.map((r) => r.path);
    for (const p of ['/welcome', '/login/email', '/login/phone', '/register', '/chats', '/new-chat', '/chat/:id',
      '/profile/:id', '/settings', '/blocked', '/search', '/notifications', '/clear-data', '/backup']) {
      assert.ok(paths.includes(p), `route ${p}`);
    }
    assert.equal(new Set(paths).size, paths.length, 'no duplicate routes');
    for (const r of routes) assert.equal(typeof r.render, 'function', `render() for ${r.path}`);
  });

  const SOURCES = [
    'app.js', 'router.js', 'state.js',
    'components/avatar.js', 'components/demo-note.js', 'components/app-bar.js', 'components/form-field.js',
    'components/dialog.js', 'components/states.js', 'components/tab-bar.js', 'components/message-bubble.js',
    'services/auth-service.js', 'services/chat-service.js', 'services/message-service.js', 'services/search-service.js',
    'services/notification-service.js', 'services/privacy-service.js', 'services/data-service.js', 'services/settings-service.js',
    'storage/database.js', 'storage/local-adapter.js', 'storage/repository.js',
    'utils/ids.js', 'utils/time.js', 'utils/dom.js', 'utils/theme-boot.js', 'utils/validators.js', 'utils/emitter.js', 'utils/files.js',
    'screens/index.js', 'screens/welcome.js', 'screens/login.js', 'screens/register.js', 'screens/chats.js',
    'screens/new-chat.js', 'screens/chat-room.js', 'screens/profile.js', 'screens/blocked.js', 'screens/search.js',
    'screens/notifications.js', 'screens/settings.js', 'screens/backup.js', 'screens/clear-data.js',
  ];

  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  async function readAll() {
    const out = [];
    for (const f of SOURCES) {
      const res = await fetch(`../js/${f}`);
      assert.ok(res.ok, `source file missing: js/${f}`);
      out.push([f, stripComments(await res.text())]);
    }
    return out;
  }

  it('all source files exist and none uses unsafe HTML or eval APIs', async () => {
    for (const [f, src] of await readAll()) {
      assert.ok(!/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write\(|\beval\(|new Function\(/.test(src), `unsafe API in js/${f}`);
    }
  });

  it('no inline style attributes (blocked by the CSP) and no TODO placeholders', async () => {
    for (const [f, src] of await readAll()) {
      assert.ok(!/\bstyle\s*:\s*['"`]/.test(src), `inline style prop in js/${f}`);
      assert.ok(!/setAttribute\(\s*['"]style['"]/.test(src), `setAttribute style in js/${f}`);
      assert.ok(!/\bTODO\b|\bFIXME\b/.test(src), `TODO/FIXME in js/${f}`);
    }
  });

  it('no analytics, tracking or remote network calls in app code', async () => {
    for (const [f, src] of await readAll()) {
      assert.ok(!/https?:\/\//i.test(src), `external URL in js/${f}`);
      assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src), `network API in js/${f}`);
    }
  });
});

describe('Android Back hook', () => {
  it('closeTopDialog closes the open dialog and reports whether one existed', async () => {
    assert.equal(closeTopDialog(), false, 'nothing open');
    const pending = openDialog({ title: 'Test', actions: [{ label: 'OK', value: true }] });
    assert.equal(closeTopDialog(), true, 'dialog was open');
    assert.equal(await pending, null, 'dismissed like Escape');
    assert.equal(closeTopDialog(), false, 'closed now');
  });

  it('a non-dismissible dialog swallows Back but stays open', async () => {
    const pending = openDialog({ title: 'Test', dismissible: false, actions: [{ label: 'OK', value: 'ok' }] });
    assert.equal(closeTopDialog(), true);
    document.querySelector('.dialog-actions button').click();
    assert.equal(await pending, 'ok');
  });
});
