import { el, clear } from '../utils/dom.js';
import { getState } from '../state.js';
import { navigate, back } from '../router.js';
import { formatTime } from '../utils/time.js';
import { SearchService } from '../services/search-service.js';
import { appBar } from '../components/app-bar.js';
import { avatar } from '../components/avatar.js';
import { field } from '../components/form-field.js';
import { emptyState, errorState } from '../components/states.js';

/** HTML তৈরি না করে নিরাপদে হাইলাইট: match অংশ <mark>-এ */
function highlighted(s) {
  return el('span', {}, [s.before, s.match ? el('mark', { text: s.match }) : null, s.after]);
}

export const searchRoute = {
  path: '/search',
  auth: 'required',
  render({ query }) {
    const me = getState().user;
    const search = field({ label: 'চ্যাট ও বার্তা খুঁজুন', name: 'q', type: 'search', value: query.q || '', maxlength: 100 });
    const out = el('div', { class: 'stack-sm', 'aria-live': 'polite' });
    let seq = 0;
    let timer = null;
    let destroyed = false;

    function prompt() {
      clear(out).append(emptyState({ icon: '🔍', title: 'খুঁজুন', text: 'নাম, ইউজারনেম বা বার্তার লেখা টাইপ করুন।' }));
    }

    async function run() {
      const q = search.getValue().trim();
      const mine = ++seq;
      if (!q) { prompt(); return; }
      let res;
      try { res = await SearchService.searchAll(me.id, q); }
      catch (e) {
        console.error(e);
        if (mine === seq && !destroyed) clear(out).append(errorState({ message: 'খোঁজা যায়নি।', onRetry: run }));
        return;
      }
      if (mine !== seq || destroyed) return;
      clear(out);
      if (!res.conversations.length && !res.messages.length) {
        out.append(emptyState({ icon: '🤷', title: 'কিছু পাওয়া যায়নি', text: 'অন্য শব্দ দিয়ে চেষ্টা করুন।' }));
        return;
      }
      if (res.conversations.length) {
        out.append(
          el('h2', { class: 'section-title flush', text: `চ্যাট (${res.conversations.length})` }),
          el('ul', { class: 'list' }, res.conversations.map((it) => el('li', {}, [
            el('button', { type: 'button', class: 'list-item', onclick: () => navigate('/chat/' + encodeURIComponent(it.chat.id)) }, [
              avatar(it.other),
              el('div', { class: 'grow' }, [
                el('div', { class: 'title' }, [highlighted(it.nameSnippet)]),
                it.other.username ? el('div', { class: 'preview', text: `@${it.other.username}` }) : null,
              ]),
            ]),
          ]))),
        );
      }
      if (res.messages.length) {
        out.append(
          el('h2', { class: 'section-title flush', text: `বার্তা (${res.messages.length})` }),
          el('ul', { class: 'list' }, res.messages.map((r) => el('li', {}, [
            el('button', { type: 'button', class: 'list-item', onclick: () => navigate('/chat/' + encodeURIComponent(r.chat.id)) }, [
              avatar(r.other),
              el('div', { class: 'grow' }, [
                el('div', { class: 'title', text: (r.fromMe ? 'আপনি → ' : '') + r.other.displayName }),
                el('div', { class: 'preview' }, [highlighted(r.snippet)]),
              ]),
              el('div', { class: 'meta' }, [el('span', { text: formatTime(r.message.createdAt, 'bn') })]),
            ]),
          ]))),
        );
      }
    }

    search.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
    run();

    return {
      node: el('div', { class: 'screen' }, [
        appBar({ title: 'খুঁজুন', onBack: () => back('/chats') }),
        el('div', { class: 'screen-body padded' }, [el('div', { class: 'container-narrow stack' }, [search.node, out])]),
      ]),
      destroy() { destroyed = true; clearTimeout(timer); },
    };
  },
};
