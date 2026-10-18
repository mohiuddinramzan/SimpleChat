import { el, clear } from '../utils/dom.js';
import { getState, showToast } from '../state.js';
import { navigate, back } from '../router.js';
import { AuthService } from '../services/auth-service.js';
import { ChatService } from '../services/chat-service.js';
import { appBar } from '../components/app-bar.js';
import { avatar } from '../components/avatar.js';
import { field } from '../components/form-field.js';
import { emptyState, errorState, loadingState } from '../components/states.js';

const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase();

export const newChatRoute = {
  path: '/new-chat',
  auth: 'required',
  async render() {
    const user = getState().user;
    const listBox = el('div', { class: 'stack-sm' });
    const search = field({ label: 'নাম বা ইউজারনেম খুঁজুন', name: 'q', type: 'search', maxlength: 40 });
    let entries = [];

    async function start(profile) {
      const res = await ChatService.startChat(user.id, profile.id);
      if (!res.ok) { showToast(res.error, { kind: 'error' }); return; }
      navigate('/chat/' + encodeURIComponent(res.chat.id));
    }

    function renderList() {
      clear(listBox);
      if (!entries.length) {
        listBox.append(emptyState({
          icon: '👥', title: 'অন্য কোনো Demo প্রোফাইল নেই',
          text: 'চ্যাট পরীক্ষা করতে আরেকটি প্রোফাইল লাগবে। নমুনা প্রোফাইল যোগ করুন, অথবা লগআউট করে নতুন Demo রেজিস্ট্রেশন করুন।',
          actionLabel: 'নমুনা প্রোফাইল যোগ করুন',
          onAction: async () => {
            try { await AuthService.ensureSampleProfiles(); await loadAll(); }
            catch { showToast('নমুনা প্রোফাইল তৈরি করা যায়নি।', { kind: 'error' }); }
          },
        }));
        return;
      }
      const q = norm(search.getValue()).trim();
      const shown = entries.filter(({ p }) => !q || norm(p.displayName).includes(q) || norm(p.username).includes(q));
      if (!shown.length) {
        listBox.append(el('p', { class: 'muted center', role: 'status', text: 'কোনো মিল পাওয়া যায়নি।' }));
        return;
      }
      listBox.append(el('ul', { class: 'list' }, shown.map(({ p, check }) => el('li', {}, [
        el('button', { type: 'button', class: 'list-item', onclick: () => start(p) }, [
          avatar(p),
          el('div', { class: 'grow' }, [
            el('div', { class: 'title', text: p.displayName }),
            el('div', { class: 'preview', text: check.ok ? `@${p.username}` : check.reason }),
          ]),
        ]),
      ]))));
    }

    async function loadAll() {
      clear(listBox).append(loadingState());
      try {
        const profiles = (await AuthService.listDemoProfiles()).filter((p) => p.id !== user.id)
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        entries = await Promise.all(profiles.map(async (p) => ({
          p, check: await ChatService.checkInteraction(user.id, p.id),
        })));
        renderList();
      } catch (e) {
        console.error(e);
        clear(listBox).append(errorState({ message: 'প্রোফাইল তালিকা লোড করা যায়নি।', onRetry: loadAll }));
      }
    }

    search.input.addEventListener('input', renderList);
    await loadAll();

    return el('div', { class: 'screen' }, [
      appBar({ title: 'নতুন চ্যাট', onBack: () => back('/chats') }),
      el('div', { class: 'screen-body padded' }, [
        el('div', { class: 'container-narrow stack' }, [search.node, listBox]),
      ]),
    ]);
  },
};
