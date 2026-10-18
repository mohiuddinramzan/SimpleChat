import { el, clear } from '../utils/dom.js';
import { getState, showToast, bumpData } from '../state.js';
import { navigate, back } from '../router.js';
import { PrivacyService } from '../services/privacy-service.js';
import { appBar } from '../components/app-bar.js';
import { avatar } from '../components/avatar.js';
import { emptyState, errorState } from '../components/states.js';

export const blockedRoute = {
  path: '/blocked',
  auth: 'required',
  async render() {
    const me = getState().user;
    const host = el('div', { class: 'screen-body' });

    async function load() {
      clear(host);
      let items;
      try { items = await PrivacyService.listBlocked(me.id); }
      catch (e) {
        console.error(e);
        host.append(errorState({ message: 'ব্লক তালিকা লোড করা যায়নি।', onRetry: load }));
        return;
      }
      if (!items.length) {
        host.append(emptyState({ icon: '🚫', title: 'কোনো প্রোফাইল ব্লক করা নেই', text: 'ব্লক শুধু এই ডিভাইসের Demo অ্যাপে কাজ করে।' }));
        return;
      }
      host.append(el('ul', { class: 'list' }, items.map(({ profile }) => el('li', { class: 'list-item' }, [
        avatar(profile),
        el('div', { class: 'grow' }, [
          el('div', { class: 'title', text: profile.displayName }),
          profile.username ? el('div', { class: 'preview', text: `@${profile.username}` }) : null,
        ]),
        profile.deleted ? null : el('button', {
          type: 'button', class: 'btn', text: 'প্রোফাইল',
          onclick: () => navigate('/profile/' + encodeURIComponent(profile.id)),
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'আনব্লক',
          'aria-label': `${profile.displayName}-কে আনব্লক করুন`,
          onclick: async () => {
            const res = await PrivacyService.unblock(me.id, profile.id);
            showToast(res.ok ? 'আনব্লক করা হয়েছে।' : res.error, { kind: res.ok ? 'success' : 'error' });
            bumpData();
            await load();
          },
        }),
      ]))));
    }

    await load();
    return el('div', { class: 'screen' }, [
      appBar({ title: 'ব্লক করা প্রোফাইল', onBack: () => back('/settings') }),
      host,
    ]);
  },
};
