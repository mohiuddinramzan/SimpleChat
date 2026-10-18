import { el } from '../utils/dom.js';

const TABS = [
  { id: 'chats', href: '#/chats', icon: '💬', label: 'চ্যাট' },
  { id: 'notifications', href: '#/notifications', icon: '🔔', label: 'নোটিফিকেশন' },
  { id: 'settings', href: '#/settings', icon: '⚙️', label: 'সেটিংস' },
];

export function tabBar(active, { unread = 0 } = {}) {
  return el('nav', { class: 'tab-bar', 'aria-label': 'প্রধান মেনু' }, TABS.map((t) => {
    const showBadge = t.id === 'notifications' && unread > 0;
    return el('a', { href: t.href, 'aria-current': t.id === active ? 'page' : null }, [
      el('span', { 'aria-hidden': 'true', text: t.icon }),
      el('span', { text: t.label }),
      showBadge ? el('span', { class: 'badge', 'aria-hidden': 'true', text: unread > 99 ? '99+' : unread }) : null,
      showBadge ? el('span', { class: 'sr-only', text: `${unread}টি অপঠিত` }) : null,
    ]);
  }));
}
