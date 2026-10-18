import { el, clear } from '../utils/dom.js';
import { getState, showToast, bumpData } from '../state.js';
import { navigate, back } from '../router.js';
import { validateReportReason } from '../utils/validators.js';
import { AuthService } from '../services/auth-service.js';
import { ChatService } from '../services/chat-service.js';
import { PrivacyService } from '../services/privacy-service.js';
import { appBar } from '../components/app-bar.js';
import { avatar } from '../components/avatar.js';
import { field } from '../components/form-field.js';
import { demoBadge, demoNote } from '../components/demo-note.js';
import { openDialog, confirmDialog } from '../components/dialog.js';

export const profileRoute = {
  path: '/profile/:id',
  auth: 'required',
  async render({ params }) {
    const me = getState().user;
    const otherId = params.id;
    const body = el('div', { class: 'container-narrow stack' });
    const header = el('div', { class: 'screen' });
    let title = 'প্রোফাইল';

    async function blockFlow(profile) {
      const sure = await confirmDialog({
        title: `${profile.displayName}-কে ব্লক করবেন?`, danger: true, confirmLabel: 'ব্লক করুন',
        message: 'এটি শুধু এই ডিভাইসের Demo অ্যাপে কাজ করে। কোনো সার্ভারে ব্লক কার্যকর হয় না।',
        items: [
          'এই প্রোফাইলের সঙ্গে নতুন বার্তা পাঠানো ও নতুন চ্যাট শুরু বন্ধ হবে',
          'আগের বার্তা ও চ্যাট মুছবে না',
          'যেকোনো সময় আনব্লক করা যাবে',
        ],
      });
      if (!sure) return;
      const res = await PrivacyService.block(me.id, profile.id);
      showToast(res.ok ? 'ব্লক করা হয়েছে।' : res.error, { kind: res.ok ? 'success' : 'error' });
      bumpData();
      await refresh();
    }

    async function unblockFlow(profile) {
      const res = await PrivacyService.unblock(me.id, profile.id);
      showToast(res.ok ? 'আনব্লক করা হয়েছে।' : res.error, { kind: res.ok ? 'success' : 'error' });
      bumpData();
      await refresh();
    }

    async function reportFlow(profile) {
      const reason = field({ label: 'রিপোর্টের কারণ', name: 'reason', multiline: true, rows: 4, maxlength: 500 });
      const ok = await openDialog({
        title: `${profile.displayName}-কে রিপোর্ট করুন`,
        body: [
          el('p', { class: 'demo-note', text: 'এটি শুধু এই ডিভাইসে সংরক্ষিত একটি লোকাল ডেমো রেকর্ড। কোথাও পাঠানো হয় না এবং কেউ এটি পর্যালোচনা করবে না।' }),
          reason.node,
        ],
        initialFocus: reason.input,
        actions: [
          { label: 'বাতিল', value: false },
          {
            label: 'রিপোর্ট সংরক্ষণ', value: true, kind: 'danger',
            validate: () => {
              const v = validateReportReason(reason.getValue());
              if (!v.ok) { reason.setError(v.error); reason.focus(); return false; }
              reason.clearError();
              return true;
            },
          },
        ],
      });
      if (ok !== true) return;
      const res = await PrivacyService.report(me.id, profile.id, reason.getValue());
      showToast(res.ok ? 'লোকাল রিপোর্ট রেকর্ড সংরক্ষিত হয়েছে।' : res.error, { kind: res.ok ? 'success' : 'error' });
    }

    function row(label, value) {
      return el('div', { class: 'row-between' }, [
        el('span', { class: 'muted', text: label }),
        el('span', { text: value || '—' }),
      ]);
    }

    async function refresh() {
      const rel = await PrivacyService.getRelationship(me.id, otherId);
      const p = rel.profile;
      title = p.displayName;
      header.replaceChildren(
        appBar({ title, subtitle: rel.deleted ? 'মুছে ফেলা প্রোফাইল' : 'Demo প্রোফাইল', onBack: () => back('/chats') }),
        el('div', { class: 'screen-body padded' }, [body]),
      );
      clear(body);
      body.append(el('div', { class: 'center stack-sm' }, [
        el('div', {}, [avatar(p, { large: true })]),
        el('strong', { text: p.displayName }),
        p.username ? el('div', { class: 'muted', text: `@${p.username}` }) : null,
        el('div', {}, [demoBadge('Demo')]),
      ]));

      if (rel.deleted) {
        body.append(demoNote('এই প্রোফাইল এই ডিভাইস থেকে মুছে গেছে। আগের চ্যাট ও বার্তা দেখা যাবে, কিন্তু নতুন বার্তা পাঠানো যাবে না।'));
        return;
      }

      if (rel.self) {
        body.append(
          el('div', { class: 'stack-sm' }, [row('ইমেইল', p.email), row('ফোন', p.phone)]),
          demoNote('এই তথ্য শুধু এই ডিভাইসে আছে এবং কখনো যাচাই করা হয়নি।'),
          el('button', { type: 'button', class: 'btn btn-block', text: 'সেটিংস ও গোপনীয়তা', onclick: () => navigate('/settings') }),
          el('button', { type: 'button', class: 'btn btn-block', text: 'লগআউট', onclick: () => AuthService.logout() }),
        );
        return;
      }

      const startBtn = el('button', {
        type: 'button', class: 'btn btn-primary btn-block', text: 'চ্যাট করুন', disabled: !rel.canChat,
        onclick: async () => {
          const res = await ChatService.startChat(me.id, p.id);
          if (!res.ok) { showToast(res.error, { kind: 'error' }); return; }
          navigate('/chat/' + encodeURIComponent(res.chat.id));
        },
      });
      body.append(
        startBtn,
        rel.reason ? el('p', { class: 'muted small center', role: 'status', text: rel.reason }) : null,
        rel.blockedByMe
          ? el('button', { type: 'button', class: 'btn btn-block', text: 'আনব্লক করুন', onclick: () => unblockFlow(p) })
          : el('button', { type: 'button', class: 'btn btn-block', text: 'ব্লক করুন', onclick: () => blockFlow(p) }),
        el('button', { type: 'button', class: 'btn btn-block btn-danger', text: 'রিপোর্ট করুন (লোকাল রেকর্ড)', onclick: () => reportFlow(p) }),
        demoNote('ব্লক ও রিপোর্ট শুধু এই ডিভাইসের ডেমো রেকর্ড। এগুলো কোনো সার্ভারে কার্যকর হয় না।'),
      );
    }

    await refresh();
    return header;
  },
};
