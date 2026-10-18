import { el, clear } from '../utils/dom.js';
import { getState, subscribe, showToast } from '../state.js';
import { navigate } from '../router.js';
import { formatTime } from '../utils/time.js';
import { AuthService } from '../services/auth-service.js';
import { ChatService } from '../services/chat-service.js';
import { appBar, iconButton } from '../components/app-bar.js';
import { avatar } from '../components/avatar.js';
import { tabBar } from '../components/tab-bar.js';
import { emptyState, errorState, loadingState } from '../components/states.js';
import { openDialog } from '../components/dialog.js';

function previewText(it) {
  const base = it.lastMessage ? (it.lastFromMe ? 'আপনি: ' : '') + it.preview : 'এখনো কোনো বার্তা নেই';
  return (it.blockedByMe ? '🚫 ব্লক করা · ' : '') + base;
}

function chatItem(it) {
  const unread = it.unreadCount;
  return el('li', {}, [
    el('button', {
      type: 'button', class: 'list-item' + (unread ? ' unread' : ''),
      onclick: () => navigate('/chat/' + encodeURIComponent(it.chat.id)),
    }, [
      avatar(it.other),
      el('div', { class: 'grow' }, [
        el('div', { class: 'row chat-title-row' }, [
          el('span', { class: 'title grow', text: it.other.displayName }),
          it.chat.pinned ? el('span', { 'aria-hidden': 'true', text: '📌' }) : null,
          it.chat.pinned ? el('span', { class: 'sr-only', text: 'পিন করা' }) : null,
          it.chat.muted ? el('span', { 'aria-hidden': 'true', text: '🔇' }) : null,
          it.chat.muted ? el('span', { class: 'sr-only', text: 'মিউট করা' }) : null,
        ]),
        el('div', { class: 'preview', text: previewText(it) }),
      ]),
      el('div', { class: 'meta' }, [
        el('span', { text: it.lastMessage ? formatTime(it.lastMessage.createdAt, 'bn') : '' }),
        unread ? el('span', { class: it.chat.muted ? 'badge badge-muted' : 'badge', 'aria-hidden': 'true', text: unread > 99 ? '99+' : unread }) : null,
        unread ? el('span', { class: 'sr-only', text: `${unread}টি অপঠিত বার্তা` }) : null,
      ]),
    ]),
  ]);
}

export const chatsRoute = {
  path: '/chats',
  auth: 'required',
  async render() {
    const user = getState().user;
    const listBox = el('div', { class: 'screen-body' });
    const tabHost = el('div', { class: 'tab-host' });
    let destroyed = false;
    let seq = 0;
    let timer = null;

    const renderTabs = () => tabHost.replaceChildren(tabBar('chats', { unread: getState().unreadNotifications }));

    async function load() {
      const mine = ++seq;
      let items;
      try {
        items = await ChatService.listChats(user.id);
      } catch (e) {
        console.error(e);
        if (mine !== seq || destroyed) return;
        clear(listBox).append(errorState({ message: 'চ্যাট তালিকা লোড করা যায়নি।', onRetry: load }));
        return;
      }
      if (mine !== seq || destroyed) return;
      clear(listBox);
      if (!items.length) {
        listBox.append(emptyState({
          icon: '💬', title: 'এখনো কোনো চ্যাট নেই',
          text: 'নতুন চ্যাট শুরু করতে নিচের বোতাম বা ＋ চাপুন।',
          actionLabel: 'নতুন চ্যাট', onAction: () => navigate('/new-chat'),
        }));
        return;
      }
      listBox.append(el('ul', { class: 'list', 'aria-label': 'চ্যাট তালিকা' }, items.map(chatItem)));
    }

    async function openProfileMenu() {
      let profiles = [];
      try { profiles = await AuthService.listDemoProfiles(); }
      catch { showToast('প্রোফাইল তালিকা লোড করা যায়নি।', { kind: 'error' }); return; }
      const others = profiles.filter((p) => p.id !== user.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      const actions = others.map((p) => ({ label: `${p.displayName} (@${p.username})`, value: p.id }));
      actions.push({ label: 'লগআউট', value: '__logout', kind: 'danger' });
      actions.push({ label: 'বন্ধ করুন', value: null, kind: 'ghost' });

      const choice = await openDialog({
        title: 'Demo প্রোফাইল',
        body: [
          el('p', { text: `বর্তমান প্রোফাইল: ${user.displayName}` }),
          el('p', { class: 'demo-note', text: 'অন্য Demo প্রোফাইল বেছে নিলে সেই প্রোফাইলের চ্যাট দেখা যাবে। এটি একই ডিভাইসে পরীক্ষার জন্য; কোনো যাচাই বা অনলাইন লগইন নেই।' }),
        ],
        actions,
      });
      if (choice === '__logout') await AuthService.logout();
      else if (typeof choice === 'string') {
        const res = await AuthService.switchDemoProfile(choice);
        if (!res.ok) showToast(res.error, { kind: 'error' });
      }
    }

    const header = appBar({
      title: 'চ্যাট',
      subtitle: `${user.displayName} · Demo`,
      leading: el('button', {
        class: 'icon-btn header-avatar', type: 'button',
        'aria-label': 'Demo প্রোফাইল বদলান বা লগআউট', onclick: openProfileMenu,
      }, [avatar(user)]),
      actions: [
        iconButton({ label: 'খুঁজুন', icon: '🔍', onClick: () => navigate('/search') }),
        iconButton({ label: 'নতুন চ্যাট', icon: '＋', onClick: () => navigate('/new-chat') }),
      ],
    });

    listBox.append(loadingState());
    renderTabs();
    const node = el('div', { class: 'screen' }, [header, listBox, tabHost]);

    const unsub = subscribe((s, prev) => {
      if (s.dataVersion !== prev.dataVersion) {
        clearTimeout(timer);
        timer = setTimeout(load, 60);
      }
      if (s.unreadNotifications !== prev.unreadNotifications) renderTabs();
    });
    await load();

    return {
      node,
      destroy() { destroyed = true; clearTimeout(timer); unsub(); },
    };
  },
};
