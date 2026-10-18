import { el } from '../utils/dom.js';
import { getState, subscribe, showToast } from '../state.js';
import { navigate } from '../router.js';
import { SettingsService } from '../services/settings-service.js';
import { NotificationService } from '../services/notification-service.js';
import { appBar } from '../components/app-bar.js';
import { tabBar } from '../components/tab-bar.js';
import { demoBadge } from '../components/demo-note.js';

const THEME_LABELS = { light: 'লাইট', dark: 'ডার্ক', system: 'সিস্টেম' };
const PRIVACY_LABELS = { everyone: 'সবাই', contacts: 'শুধু যাদের সঙ্গে চ্যাট আছে', nobody: 'কেউ নয়' };

const PRIVACY_FACTS = [
  'সব ডেটা (প্রোফাইল, বার্তা, ব্লক, রিপোর্ট) শুধু এই ডিভাইসের অ্যাপ স্টোরেজে থাকে। কোনো সার্ভারে পাঠানো হয় না।',
  'এটি এন্ড-টু-এন্ড এনক্রিপ্টেড মেসেজিং নয়। লোকাল ডেটা এনক্রিপ্ট করা থাকে না; ডিভাইস বা অ্যাপ-ডেটায় যার প্রবেশাধিকার আছে সে পড়তে পারে।',
  'ইমেইল/ফোন লগইন শুধু ডেমো। কিছুই যাচাই হয় না, আর পাসওয়ার্ড বা OTP সংরক্ষণ করা হয় না।',
  'ব্লক ও রিপোর্ট শুধু এই ডিভাইসের লোকাল রেকর্ড; কোনো সার্ভারে কার্যকর হয় না।',
  'ডেলিভারি, পঠিত অবস্থা ও টাইপিং সিমুলেটেড। এগুলো আসল নেটওয়ার্ক ঘটনা নয়, আর কোনো অনলাইন উপস্থিতিও দেখানো হয় না।',
  'ব্যাকআপ ফাইলে বার্তা সাধারণ টেক্সটে (এনক্রিপ্ট ছাড়া) থাকে। ফাইলটি নিরাপদে রাখুন।',
  'অ্যাপে কোনো অ্যানালিটিক্স, ট্র্যাকিং বা বিজ্ঞাপন নেই।',
];

export const settingsRoute = {
  path: '/settings',
  auth: 'required',
  async render() {
    const me = getState().user;
    const s = await SettingsService.get();
    const caps = NotificationService.getCapabilities();
    const tabHost = el('div', { class: 'tab-host' });
    const renderTabs = () => tabHost.replaceChildren(tabBar('settings', { unread: getState().unreadNotifications }));
    renderTabs();

    /* Theme */
    const themeButtons = SettingsService.options.themes.map((t) => el('button', {
      type: 'button', 'aria-pressed': String(s.theme === t), text: THEME_LABELS[t],
      onclick: async () => {
        const res = await SettingsService.update({ theme: t });
        if (!res.ok) { showToast(res.error, { kind: 'error' }); return; }
        themeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(SettingsService.options.themes[i] === t)));
      },
    }));

    /* Notifications switch */
    const notifSwitch = el('input', { type: 'checkbox', role: 'switch', id: 'notif-switch' });
    notifSwitch.checked = s.notificationsEnabled;
    notifSwitch.addEventListener('change', async () => {
      const want = notifSwitch.checked;
      const res = await NotificationService.setEnabled(want);
      if (!res.ok) { notifSwitch.checked = !want; showToast(res.error, { kind: 'error' }); }
    });

    /* Last-seen privacy (শুধু সংরক্ষিত পছন্দ) */
    const privacySelect = el('select', { class: 'field-input', id: 'privacy-select' },
      SettingsService.options.privacy.map((p) => el('option', { value: p, selected: s.lastSeenPrivacy === p, text: PRIVACY_LABELS[p] })));
    privacySelect.addEventListener('change', async () => {
      const res = await SettingsService.update({ lastSeenPrivacy: privacySelect.value });
      if (!res.ok) showToast(res.error, { kind: 'error' });
    });

    /* Message limit */
    const { min, max } = SettingsService.options.messageLimit;
    const limitInput = el('input', { class: 'field-input', id: 'limit-input', type: 'number', inputmode: 'numeric', min, max, step: 1 });
    limitInput.value = String(s.messageLengthLimit);
    const limitError = el('div', { class: 'field-error', role: 'alert' });
    const limitSave = el('button', {
      type: 'button', class: 'btn', text: 'সংরক্ষণ',
      onclick: async () => {
        limitError.textContent = '';
        const n = Number(limitInput.value);
        const res = await SettingsService.update({ messageLengthLimit: Number.isFinite(n) && limitInput.value.trim() !== '' ? n : NaN });
        if (!res.ok) { limitError.textContent = res.error; limitInput.setAttribute('aria-invalid', 'true'); return; }
        limitInput.removeAttribute('aria-invalid');
        showToast('বার্তার সীমা সংরক্ষিত হয়েছে।', { kind: 'success' });
      },
    });

    const link = (text, path, { danger = false } = {}) => el('li', {}, [
      el('button', { type: 'button', class: 'list-item' + (danger ? ' danger-text' : ''), onclick: () => navigate(path) }, [
        el('span', { class: 'grow title', text }), el('span', { 'aria-hidden': 'true', text: '›' }),
      ]),
    ]);

    const body = el('div', { class: 'screen-body padded' }, [
      el('div', { class: 'container-narrow stack' }, [
        el('div', { class: 'row' }, [el('span', { class: 'muted', text: `${me.displayName} · ` }), demoBadge('Demo')]),

        el('section', { class: 'stack-sm', 'aria-labelledby': 'st-theme' }, [
          el('h2', { id: 'st-theme', class: 'section-title flush', text: 'থিম' }),
          el('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'st-theme' }, themeButtons),
        ]),

        el('section', { class: 'stack-sm', 'aria-labelledby': 'st-notif' }, [
          el('h2', { id: 'st-notif', class: 'section-title flush', text: 'নোটিফিকেশন' }),
          el('div', { class: 'switch-row' }, [el('label', { for: 'notif-switch', text: 'ইন-অ্যাপ নোটিফিকেশন চালু' }), notifSwitch]),
          el('p', { class: 'field-hint', text: caps.native ? 'লোকাল নোটিফিকেশন চালু।' : 'রিমোট পুশ নোটিফিকেশন এই সংস্করণে নেই।' }),
        ]),

        el('section', { class: 'stack-sm', 'aria-labelledby': 'st-privacy' }, [
          el('h2', { id: 'st-privacy', class: 'section-title flush', text: 'শেষ দেখার গোপনীয়তা' }),
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', for: 'privacy-select', text: 'কে দেখতে পাবে' }),
            privacySelect,
            el('div', { class: 'field-hint', text: 'এই ডেমোতে কোনো "শেষ দেখা" বা অনলাইন অবস্থা দেখানো হয় না। এটি ভবিষ্যতের জন্য সংরক্ষিত পছন্দ মাত্র।' }),
          ]),
        ]),

        el('section', { class: 'stack-sm', 'aria-labelledby': 'st-limit' }, [
          el('h2', { id: 'st-limit', class: 'section-title flush', text: 'বার্তার সর্বোচ্চ দৈর্ঘ্য' }),
          el('div', { class: 'field' }, [
            el('label', { class: 'field-label', for: 'limit-input', text: `অক্ষর সংখ্যা (${min}–${max})` }),
            el('div', { class: 'row' }, [el('div', { class: 'grow' }, [limitInput]), limitSave]),
            limitError,
          ]),
        ]),

        el('section', { 'aria-labelledby': 'st-more' }, [
          el('h2', { id: 'st-more', class: 'section-title flush', text: 'আরও' }),
          el('ul', { class: 'list' }, [
            link('আমার প্রোফাইল', '/profile/' + encodeURIComponent(me.id)),
            link('ব্লক করা প্রোফাইল', '/blocked'),
            link('ব্যাকআপ এক্সপোর্ট / ইমপোর্ট', '/backup'),
            link('সব ডেটা মুছুন', '/clear-data', { danger: true }),
          ]),
        ]),

        el('section', { class: 'stack-sm', 'aria-labelledby': 'st-facts' }, [
          el('h2', { id: 'st-facts', class: 'section-title flush', text: 'গোপনীয়তা ও সীমাবদ্ধতা' }),
          el('ul', { class: 'privacy-list' }, PRIVACY_FACTS.map((t) => el('li', { text: t }))),
        ]),
      ]),
    ]);

    const unsub = subscribe((st, prev) => { if (st.unreadNotifications !== prev.unreadNotifications) renderTabs(); });
    return {
      node: el('div', { class: 'screen' }, [appBar({ title: 'সেটিংস ও গোপনীয়তা' }), body, tabHost]),
      destroy() { unsub(); },
    };
  },
};
