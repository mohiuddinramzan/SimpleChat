import { el, clear } from '../utils/dom.js';
import { getState, subscribe, showToast } from '../state.js';
import { navigate } from '../router.js';
import { formatTime } from '../utils/time.js';
import { NotificationService } from '../services/notification-service.js';
import { ChatService } from '../services/chat-service.js';
import { appBar, iconButton } from '../components/app-bar.js';
import { tabBar } from '../components/tab-bar.js';
import { emptyState, errorState, loadingState } from '../components/states.js';
import { confirmDialog } from '../components/dialog.js';

export const notificationsRoute = {
  path: '/notifications',
  auth: 'required',
  async render() {
    const me = getState().user;
    const listBox = el('div', { class: 'screen-body' });
    const tabHost = el('div', { class: 'tab-host' });
    let destroyed = false;
    let seq = 0;

    const renderTabs = () => tabHost.replaceChildren(tabBar('notifications', { unread: getState().unreadNotifications }));

    async function open(n) {
      await NotificationService.markRead(me.id, n.id);
      if (n.chatId) {
        const res = await ChatService.openChat(n.chatId, me.id);
        if (res.ok) { navigate('/chat/' + encodeURIComponent(n.chatId)); return; }
        showToast('সংশ্লিষ্ট চ্যাট আর নেই।', { kind: 'error' });
      }
      await load();
    }

    async function load() {
      const mine = ++seq;
      let items;
      try { items = await NotificationService.list(me.id); }
      catch (e) {
        console.error(e);
        if (mine === seq && !destroyed) clear(listBox).append(errorState({ message: 'নোটিফিকেশন লোড করা যায়নি।', onRetry: load }));
        return;
      }
      if (mine !== seq || destroyed) return;
      clear(listBox);
      const caps = NotificationService.getCapabilities();
      listBox.append(el('p', {
        class: 'demo-note notif-note',
        text: caps.native
          ? 'এগুলো ইন-অ্যাপ (লোকাল) নোটিফিকেশন।'
          : 'এগুলো শুধু ইন-অ্যাপ লোকাল নোটিফিকেশন। এই সংস্করণে রিমোট পুশ নোটিফিকেশন নেই।',
      }));
      if (!items.length) {
        listBox.append(emptyState({ icon: '🔔', title: 'কোনো নোটিফিকেশন নেই', text: 'নতুন বার্তা বা গোপনীয়তা-সংক্রান্ত ঘটনা এখানে দেখাবে।' }));
        return;
      }
      listBox.append(el('ul', { class: 'list' }, items.map((n) => el('li', {}, [
        el('button', { type: 'button', class: 'list-item' + (n.read ? '' : ' unread'), onclick: () => open(n) }, [
          el('span', { 'aria-hidden': 'true', class: 'big-icon-sm', text: n.type === 'message' ? '💬' : n.type === 'privacy' ? '🔒' : 'ℹ️' }),
          el('div', { class: 'grow' }, [
            el('div', { class: 'title', text: n.title }),
            el('div', { class: 'preview', text: n.body }),
          ]),
          el('div', { class: 'meta' }, [
            el('span', { text: formatTime(n.createdAt, 'bn') }),
            n.read ? null : el('span', { class: 'badge', 'aria-hidden': 'true', text: '●' }),
            n.read ? null : el('span', { class: 'sr-only', text: 'অপঠিত' }),
          ]),
        ]),
      ]))));
    }

    const header = appBar({
      title: 'নোটিফিকেশন',
      actions: [
        iconButton({
          label: 'সব পড়া হিসেবে চিহ্নিত করুন', icon: '✓✓',
          onClick: async () => { await NotificationService.markAllRead(me.id); await load(); },
        }),
        iconButton({
          label: 'সব নোটিফিকেশন মুছুন', icon: '🗑',
          onClick: async () => {
            const sure = await confirmDialog({
              title: 'সব নোটিফিকেশন মুছবেন?', danger: true, confirmLabel: 'মুছুন',
              items: ['শুধু আপনার প্রোফাইলের নোটিফিকেশন তালিকা মুছবে', 'বার্তা ও চ্যাট মুছবে না'],
            });
            if (!sure) return;
            await NotificationService.clear(me.id);
            showToast('নোটিফিকেশন মুছে ফেলা হয়েছে।', { kind: 'success' });
            await load();
          },
        }),
      ],
    });

    listBox.append(loadingState());
    renderTabs();
    const unsubState = subscribe((s, prev) => { if (s.unreadNotifications !== prev.unreadNotifications) renderTabs(); });
    const unsubSvc = NotificationService.onChange(() => load());
    await load();

    return {
      node: el('div', { class: 'screen' }, [header, listBox, tabHost]),
      destroy() { destroyed = true; unsubState(); unsubSvc(); },
    };
  },
};
