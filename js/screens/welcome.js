import { el, clear } from '../utils/dom.js';
import { navigate } from '../router.js';
import { showToast } from '../state.js';
import { AuthService } from '../services/auth-service.js';
import { avatar } from '../components/avatar.js';
import { demoBadge, demoNote } from '../components/demo-note.js';

async function loadProfiles(listBox) {
  let profiles = [];
  try { profiles = await AuthService.listDemoProfiles(); }
  catch { showToast('প্রোফাইল তালিকা লোড করা যায়নি।', { kind: 'error' }); }
  profiles.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  clear(listBox);
  if (!profiles.length) {
    listBox.append(el('p', { class: 'muted small', text: 'এখনো কোনো Demo প্রোফাইল নেই। নিচে রেজিস্ট্রেশন করুন বা নমুনা প্রোফাইল যোগ করুন।' }));
    return;
  }
  listBox.append(el('ul', { class: 'list' }, profiles.map((p) => el('li', {}, [
    el('button', {
      type: 'button', class: 'list-item',
      'aria-label': `${p.displayName} প্রোফাইল দিয়ে Demo-তে প্রবেশ করুন`,
      onclick: async () => {
        const res = await AuthService.switchDemoProfile(p.id);
        if (!res.ok) showToast(res.error, { kind: 'error' });
      },
    }, [
      avatar(p),
      el('div', { class: 'grow' }, [
        el('div', { class: 'title', text: p.displayName }),
        el('div', { class: 'preview', text: `@${p.username}` }),
      ]),
    ]),
  ]))));
}

export const welcomeRoute = {
  path: '/welcome',
  auth: 'guest',
  async render() {
    const listBox = el('div', { class: 'stack-sm' });
    await loadProfiles(listBox);

    const addSamples = el('button', {
      type: 'button', class: 'btn btn-block', text: 'নমুনা প্রোফাইল যোগ করুন (রাহিম, সুমি)',
      onclick: async () => {
        addSamples.disabled = true;
        try {
          await AuthService.ensureSampleProfiles();
          await loadProfiles(listBox);
        } catch { showToast('নমুনা প্রোফাইল তৈরি করা যায়নি।', { kind: 'error' }); }
        finally { addSamples.disabled = false; }
      },
    });

    const node = el('div', { class: 'screen' }, [
      el('div', { class: 'screen-body padded' }, [
        el('div', { class: 'container-narrow stack' }, [
          el('div', { class: 'center stack-sm' }, [
            el('div', { class: 'big-icon big-icon-lg', 'aria-hidden': 'true', text: '💬' }),
            el('h1', { text: 'SimpleChat' }),
            el('div', {}, [demoBadge('Local Demo')]),
            el('p', { class: 'muted', text: 'সহজ টেক্সট চ্যাট ডেমো' }),
          ]),
          demoNote('এটি একটি লোকাল ডেমো। সব ডেটা শুধু এই ডিভাইসে থাকে; কোনো সার্ভার, অনলাইন মেসেজিং বা ইমেইল/ফোন যাচাই নেই। একই ডিভাইসে দুটি Demo প্রোফাইল বদলে বদলে কথোপকথন পরীক্ষা করা যায়।'),
          el('div', { class: 'stack-sm' }, [
            el('button', { type: 'button', class: 'btn btn-primary btn-block', text: 'ইমেইল দিয়ে Demo লগইন', onclick: () => navigate('/login/email') }),
            el('button', { type: 'button', class: 'btn btn-block', text: 'ফোন নম্বর দিয়ে Demo লগইন', onclick: () => navigate('/login/phone') }),
            el('button', { type: 'button', class: 'btn btn-block', text: 'নতুন Demo প্রোফাইল তৈরি করুন', onclick: () => navigate('/register') }),
          ]),
          el('section', { class: 'stack-sm', 'aria-labelledby': 'profiles-title' }, [
            el('h2', { id: 'profiles-title', class: 'section-title flush', text: 'এই ডিভাইসের Demo প্রোফাইল' }),
            listBox,
            addSamples,
          ]),
        ]),
      ]),
    ]);
    return node;
  },
};
