import { el } from '../utils/dom.js';
import { showToast } from '../state.js';
import { navigate, back } from '../router.js';
import { AuthService } from '../services/auth-service.js';
import { DataService } from '../services/data-service.js';
import { appBar } from '../components/app-bar.js';
import { demoNote } from '../components/demo-note.js';
import { confirmDialog } from '../components/dialog.js';

export const clearDataRoute = {
  path: '/clear-data',
  auth: 'required',
  async render() {
    const c = await DataService.getCounts();

    async function clearAll() {
      const sure = await confirmDialog({
        title: 'সত্যিই সব ডেটা মুছবেন?', danger: true, confirmLabel: 'হ্যাঁ, সব মুছুন',
        message: 'এই কাজ ফেরানো যাবে না।',
        items: [
          `${c.profiles}টি Demo প্রোফাইল`,
          `${c.chats}টি চ্যাট ও ${c.messages}টি বার্তা`,
          `${c.blocks}টি ব্লক, ${c.reports}টি রিপোর্ট রেকর্ড, ${c.notifications}টি নোটিফিকেশন`,
          'সেটিংস, থিম ও বর্তমান লগইন সেশন',
        ],
      });
      if (!sure) return;
      try {
        await DataService.clearAll();
        showToast('সব লোকাল ডেটা মুছে ফেলা হয়েছে।', { kind: 'success' });
        await AuthService.logout();
      } catch (e) {
        console.error(e);
        showToast('ডেটা মোছা যায়নি। আবার চেষ্টা করুন।', { kind: 'error' });
      }
    }

    return el('div', { class: 'screen' }, [
      appBar({ title: 'সব ডেটা মুছুন', onBack: () => back('/settings') }),
      el('div', { class: 'screen-body padded' }, [
        el('div', { class: 'container-narrow stack' }, [
          demoNote('এই অ্যাপের সব ডেটা শুধু এই ডিভাইসে আছে। মুছে ফেললে অন্য কোথাও কপি থাকবে না, শুধু আপনার নিজের এক্সপোর্ট করা ব্যাকআপ ছাড়া।'),
          el('h2', { class: 'section-title flush', text: 'যা মুছে যাবে' }),
          el('ul', { class: 'privacy-list' }, [
            el('li', { text: `Demo প্রোফাইল: ${c.profiles}` }),
            el('li', { text: `চ্যাট: ${c.chats}, বার্তা: ${c.messages}` }),
            el('li', { text: `ব্লক: ${c.blocks}, রিপোর্ট রেকর্ড: ${c.reports}` }),
            el('li', { text: `নোটিফিকেশন: ${c.notifications}` }),
            el('li', { text: 'সেটিংস, থিম ও লগইন সেশন' }),
          ]),
          el('button', { type: 'button', class: 'btn btn-block', text: 'আগে ব্যাকআপ এক্সপোর্ট করুন', onclick: () => navigate('/backup') }),
          el('button', { type: 'button', class: 'btn btn-danger btn-block', text: 'সব ডেটা মুছুন…', onclick: clearAll }),
        ]),
      ]),
    ]);
  },
};
