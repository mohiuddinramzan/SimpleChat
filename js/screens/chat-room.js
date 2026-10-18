import { el, clear } from '../utils/dom.js';
import { getState, showToast } from '../state.js';
import { navigate, back } from '../router.js';
import { truncate } from '../utils/validators.js';
import { ChatService } from '../services/chat-service.js';
import { MessageService } from '../services/message-service.js';
import { SettingsService } from '../services/settings-service.js';
import { appBar, iconButton } from '../components/app-bar.js';
import { avatar } from '../components/avatar.js';
import { messageRow } from '../components/message-bubble.js';
import { openDialog, confirmDialog } from '../components/dialog.js';
import { errorState } from '../components/states.js';

const flat = (t, n) => truncate(String(t).replace(/\s+/g, ' ').trim(), n);

export const chatRoomRoute = {
  path: '/chat/:id',
  auth: 'required',
  async render({ params }) {
    const me = getState().user;
    const chatId = params.id;

    const first = await ChatService.openChat(chatId, me.id);
    if (!first.ok) {
      return el('div', { class: 'screen' }, [
        appBar({ title: 'চ্যাট', onBack: () => back('/chats') }),
        errorState({ message: first.error }),
      ]);
    }

    const { messageLengthLimit: limit } = await SettingsService.get();

    let data = first;
    let separatorId = null;
    let replyTo = null;
    let editing = null;
    let busy = false;
    let destroyed = false;
    let seq = 0;
    let reloadTimer = null;

    /* ---------- elements ---------- */
    const list = el('div', { class: 'message-list', role: 'log', 'aria-live': 'polite', 'aria-label': 'বার্তা' });
    const typingEl = el('div', { class: 'typing-indicator', role: 'status', hidden: true });
    const bar = el('div', { class: 'reply-bar', hidden: true });
    const errorEl = el('div', { class: 'field-error', role: 'alert' });
    const counterEl = el('span', { class: 'counter', 'aria-hidden': 'true' });
    const input = el('textarea', {
      class: 'field-input', rows: 1, autocomplete: 'off', placeholder: 'বার্তা লিখুন…', 'aria-label': 'বার্তা লিখুন',
    });
    const sendBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'পাঠান' });
    const form = el('form', { class: 'composer', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } }, [input, sendBtn]);
    const footer = el('div', { class: 'screen-footer' }, [
      bar, el('div', { class: 'composer-meta' }, [errorEl, counterEl]), form,
    ]);
    const blockedNote = el('div', { class: 'screen-footer composer-note', hidden: true });

    const header = appBar({
      title: data.other.displayName,
      subtitle: data.other.deleted ? 'মুছে ফেলা প্রোফাইল' : `@${data.other.username} · Demo`,
      onBack: () => back('/chats'),
      leading: avatar(data.other),
      actions: [iconButton({ label: 'চ্যাট অপশন', icon: '⋮', onClick: () => openMenu() })],
    });

    /* ---------- composer helpers ---------- */
    function autoGrow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    }
    function updateCounter() {
      const len = Array.from(input.value).length;
      counterEl.textContent = len > limit * 0.8 ? `${len}/${limit}` : '';
      counterEl.classList.toggle('over', len > limit);
    }
    function updateBar() {
      clear(bar);
      const target = editing || replyTo;
      bar.hidden = !target;
      sendBtn.textContent = editing ? 'সংরক্ষণ' : 'পাঠান';
      if (!target) return;
      const label = editing
        ? 'বার্তা এডিট করছেন'
        : `${replyTo.senderId === me.id ? 'নিজের বার্তায়' : data.other.displayName + '-কে'} উত্তর`;
      bar.append(
        el('div', { class: 'grow' }, [el('strong', { text: label }), el('div', { class: 'muted', text: flat(target.text, 80) })]),
        iconButton({ label: 'বাতিল', icon: '✕', onClick: cancelCompose }),
      );
    }
    function cancelCompose() {
      if (editing) { input.value = ''; autoGrow(); updateCounter(); }
      editing = null; replyTo = null; errorEl.textContent = '';
      updateBar();
    }

    /* ---------- rendering ---------- */
    function quoteFor(m, byId) {
      if (!m.replyToMessageId) return null;
      const t = byId.get(m.replyToMessageId);
      if (!t) return { author: '', text: 'মুছে ফেলা বার্তা', missing: true };
      return { author: t.senderId === me.id ? 'আপনি' : data.other.displayName, text: flat(t.text, 80), missing: false };
    }

    function renderMessages(scroll) {
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100;
      clear(list);
      const byId = new Map(data.messages.map((m) => [m.id, m]));
      if (!data.messages.length) {
        list.append(el('p', { class: 'muted center', text: 'এখনো কোনো বার্তা নেই। প্রথম বার্তা লিখুন।' }));
      }
      let sep = null;
      for (const m of data.messages) {
        if (separatorId && m.id === separatorId) {
          sep = el('div', { class: 'unread-separator', role: 'separator' }, [el('span', { text: 'অপঠিত বার্তা' })]);
          list.append(sep);
        }
        list.append(messageRow({ message: m, own: m.senderId === me.id, quote: quoteFor(m, byId), onOpen: openMessageActions }));
      }
      if (scroll === 'initial' && sep) sep.scrollIntoView({ block: 'center' });
      else if (scroll === 'initial' || scroll === 'bottom' || nearBottom) list.scrollTop = list.scrollHeight;
    }

    function applyAccess() {
      footer.hidden = !data.canSend;
      blockedNote.hidden = data.canSend;
      clear(blockedNote);
      if (data.canSend) return;
      blockedNote.append(el('p', { text: data.cannotSendReason || 'এই চ্যাটে এখন বার্তা পাঠানো যাচ্ছে না।' }));
      if (data.blockedByMe && !data.other.deleted) {
        blockedNote.append(el('button', {
          type: 'button', class: 'btn', text: 'প্রোফাইলে গিয়ে আনব্লক করুন',
          onclick: () => navigate('/profile/' + encodeURIComponent(data.other.id)),
        }));
      }
    }

    async function process(res, scroll) {
      data = res;
      if (data.unreadCount > 0) {
        if (!separatorId) separatorId = data.firstUnreadMessageId; // read করার আগেই মনে রাখা
        await MessageService.markChatRead(chatId, me.id);
      }
      if (destroyed) return;
      applyAccess();
      renderMessages(scroll);
    }

    async function reload(scroll = 'auto') {
      const mine = ++seq;
      const res = await ChatService.openChat(chatId, me.id);
      if (destroyed || mine !== seq) return;
      if (!res.ok) { showToast('চ্যাট লোড করা যায়নি।', { kind: 'error' }); return; }
      await process(res, scroll);
    }
    const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => reload('auto'), 60); };

    function setTyping(on) {
      typingEl.hidden = !on;
      if (!on) return;
      clear(typingEl);
      typingEl.append(
        `${data.other.displayName} টাইপ করছে (সিমুলেশন)`,
        el('span', { class: 'dots', 'aria-hidden': 'true' }, [el('span', { text: '.' }), el('span', { text: '.' }), el('span', { text: '.' })]),
      );
    }

    /* ---------- actions ---------- */
    async function submit() {
      if (busy) return;
      busy = true; sendBtn.disabled = true; errorEl.textContent = '';
      try {
        const text = input.value;
        const res = editing
          ? await MessageService.edit(editing.id, me.id, text)
          : await MessageService.send({ chatId, senderId: me.id, text, replyToMessageId: replyTo ? replyTo.id : null });
        if (!res.ok) { errorEl.textContent = res.error; return; }
        input.value = ''; editing = null; replyTo = null;
        autoGrow(); updateCounter(); updateBar();
        await reload('bottom');
        input.focus();
      } catch (e) {
        console.error(e);
        errorEl.textContent = 'বার্তা পাঠানো যায়নি। আবার চেষ্টা করুন।';
      } finally {
        busy = false; sendBtn.disabled = false;
      }
    }

    async function openMessageActions(m) {
      const own = m.senderId === me.id;
      const actions = [];
      if (data.canSend) actions.push({ label: 'উত্তর দিন', value: 'reply' });
      actions.push({ label: 'কপি করুন', value: 'copy' });
      if (own && data.canSend) actions.push({ label: 'এডিট করুন', value: 'edit' });
      if (own) actions.push({ label: 'মুছে ফেলুন', value: 'delete', kind: 'danger' });
      actions.push({ label: 'বন্ধ করুন', value: null, kind: 'ghost' });

      const choice = await openDialog({
        title: 'বার্তা',
        body: [el('p', { class: 'quote-preview', text: flat(m.text, 120) })],
        actions,
      });
      if (choice === 'reply') {
        replyTo = m; editing = null; updateBar(); input.focus();
      } else if (choice === 'copy') {
        const ok = await MessageService.copyText(m.text);
        showToast(ok ? 'টেক্সট কপি হয়েছে।' : 'কপি করা যায়নি।', { kind: ok ? 'success' : 'error' });
      } else if (choice === 'edit') {
        editing = m; replyTo = null; input.value = m.text;
        autoGrow(); updateCounter(); updateBar(); input.focus();
      } else if (choice === 'delete') {
        const sure = await confirmDialog({
          title: 'বার্তা মুছবেন?', danger: true, confirmLabel: 'মুছে ফেলুন',
          message: 'বার্তাটি এই ডিভাইস থেকে স্থায়ীভাবে মুছে যাবে।',
        });
        if (!sure) return;
        const res = await MessageService.remove(m.id, me.id);
        if (!res.ok) { showToast(res.error || 'মোছা যায়নি।', { kind: 'error' }); return; }
        if (editing && editing.id === m.id) cancelCompose();
        if (replyTo && replyTo.id === m.id) cancelCompose();
        showToast('বার্তা মুছে ফেলা হয়েছে।', { kind: 'success' });
      }
    }

    async function openMenu() {
      const chat = data.chat;
      const actions = [
        { label: chat.pinned ? 'পিন সরান' : 'পিন করুন', value: 'pin' },
        { label: chat.muted ? 'আনমিউট করুন' : 'মিউট করুন', value: 'mute' },
      ];
      if (data.canSend) actions.push({ label: 'অপর পক্ষের টাইপিং সিমুলেট করুন (Demo)', value: 'typing' });
      if (!data.other.deleted) actions.push({ label: 'প্রোফাইল ও ব্লক', value: 'profile' });
      actions.push({ label: 'এই চ্যাটের ইতিহাস মুছুন', value: 'clear', kind: 'danger' });
      actions.push({ label: 'বন্ধ করুন', value: null, kind: 'ghost' });

      const choice = await openDialog({ title: 'চ্যাট অপশন', actions });
      if (choice === 'pin') {
        const r = await ChatService.setPinned(chatId, me.id, !chat.pinned);
        showToast(r.ok ? (chat.pinned ? 'পিন সরানো হয়েছে।' : 'চ্যাট পিন করা হয়েছে।') : r.error, { kind: r.ok ? 'success' : 'error' });
        await reload();
      } else if (choice === 'mute') {
        const r = await ChatService.setMuted(chatId, me.id, !chat.muted);
        showToast(r.ok ? (chat.muted ? 'আনমিউট করা হয়েছে।' : 'চ্যাট মিউট করা হয়েছে।') : r.error, { kind: r.ok ? 'success' : 'error' });
        await reload();
      } else if (choice === 'typing') {
        MessageService.simulateTyping(chatId, data.other.id);
      } else if (choice === 'profile') {
        navigate('/profile/' + encodeURIComponent(data.other.id));
      } else if (choice === 'clear') {
        const sure = await confirmDialog({
          title: 'চ্যাটের ইতিহাস মুছবেন?', danger: true, confirmLabel: 'ইতিহাস মুছুন',
          message: 'এই কাজ ফেরানো যাবে না। মোছার আগে সেটিংস থেকে ব্যাকআপ এক্সপোর্ট করে রাখতে পারেন।',
          items: [
            'এই চ্যাটের সব বার্তা মুছে যাবে, দুই Demo প্রোফাইলের বার্তাই',
            'চ্যাট নিজে, প্রোফাইল, ব্লক তালিকা ও সেটিংস থাকবে',
            'ডেটা শুধু এই ডিভাইসেই ছিল, অন্য কোথাও কপি নেই',
          ],
        });
        if (!sure) return;
        const r = await ChatService.clearHistory(chatId, me.id);
        if (!r.ok) { showToast(r.error, { kind: 'error' }); return; }
        cancelCompose(); separatorId = null;
        showToast(`${r.deleted}টি বার্তা মুছে ফেলা হয়েছে।`, { kind: 'success' });
        await reload('bottom');
      }
    }

    /* ---------- wiring ---------- */
    input.addEventListener('input', () => { autoGrow(); updateCounter(); errorEl.textContent = ''; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } // মোবাইলে Enter = নতুন লাইন
    });
    input.addEventListener('focus', () => { setTimeout(() => { list.scrollTop = list.scrollHeight; }, 300); }); // কীবোর্ড খোলার পর

    const off = MessageService.onChange((evt) => {
      if (evt.type === 'typing') {
        if (evt.chatId === chatId && evt.userId === data.other.id) setTyping(evt.typing);
        return;
      }
      if (evt.chatId && evt.chatId !== chatId) return;
      scheduleReload();
    });

    const node = el('div', { class: 'screen' }, [header, list, typingEl, footer, blockedNote]);
    await process(first, 'initial');

    return {
      node,
      destroy() {
        destroyed = true;
        clearTimeout(reloadTimer);
        off();
        MessageService.stopTyping(chatId, data.other.id);
        ChatService.closeChat();
      },
    };
  },
};
