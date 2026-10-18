import { el, clear } from '../utils/dom.js';
import { getState, showToast, bumpData } from '../state.js';
import { back } from '../router.js';
import { LIMITS } from '../utils/validators.js';
import { downloadText, readFileText } from '../utils/files.js';
import { AuthService } from '../services/auth-service.js';
import { DataService } from '../services/data-service.js';
import { MessageService } from '../services/message-service.js';
import { appBar } from '../components/app-bar.js';
import { field } from '../components/form-field.js';
import { demoNote } from '../components/demo-note.js';
import { confirmDialog } from '../components/dialog.js';

const LABELS = {
  profiles: 'প্রোফাইল', chats: 'চ্যাট', messages: 'বার্তা',
  blocks: 'ব্লক', notifications: 'নোটিফিকেশন', reports: 'রিপোর্ট',
};

function countsList(counts) {
  return el('ul', {}, Object.keys(LABELS).map((k) => el('li', { text: `${LABELS[k]}: ${counts[k] ?? 0}` })));
}

export const backupRoute = {
  path: '/backup',
  auth: 'required',
  async render() {
    /* ---------- Export ---------- */
    const exportStatus = el('div', { class: 'field-error', role: 'alert' });
    const exportBtn = el('button', {
      type: 'button', class: 'btn btn-primary btn-block', text: 'ব্যাকআপ ফাইল ডাউনলোড',
      onclick: async () => {
        exportStatus.textContent = '';
        try {
          const res = await DataService.exportBackup();
          downloadText(res.filename, res.text);
          showToast('ব্যাকআপ তৈরি হয়েছে। ডাউনলোড না হলে "টেক্সট কপি করুন" ব্যবহার করুন।', { kind: 'success' });
        } catch (e) { console.error(e); exportStatus.textContent = 'ব্যাকআপ তৈরি করা যায়নি।'; }
      },
    });
    const copyBtn = el('button', {
      type: 'button', class: 'btn btn-block', text: 'ব্যাকআপ টেক্সট কপি করুন',
      onclick: async () => {
        exportStatus.textContent = '';
        try {
          const res = await DataService.exportBackup();
          const ok = await MessageService.copyText(res.text);
          if (ok) showToast('ব্যাকআপ টেক্সট কপি হয়েছে।', { kind: 'success' });
          else exportStatus.textContent = 'কপি করা যায়নি।';
        } catch (e) { console.error(e); exportStatus.textContent = 'ব্যাকআপ তৈরি করা যায়নি।'; }
      },
    });

    /* ---------- Import ---------- */
    const fileInput = el('input', { type: 'file', id: 'backup-file', class: 'field-input', accept: 'application/json,.json' });
    const paste = field({ label: 'অথবা ব্যাকআপ টেক্সট পেস্ট করুন', name: 'paste', multiline: true, rows: 5 });
    const resultBox = el('div', { class: 'stack-sm', 'aria-live': 'polite' });
    let pendingText = null;

    async function check() {
      clear(resultBox);
      pendingText = null;
      let text;
      try {
        const file = fileInput.files && fileInput.files[0];
        text = file ? await readFileText(file, LIMITS.BACKUP_BYTES) : paste.getValue();
      } catch (e) {
        resultBox.append(el('p', { class: 'field-error', role: 'alert', text: e.message || 'ফাইল পড়া যায়নি।' }));
        return;
      }
      const res = await DataService.previewImport(text);
      if (!res.ok) {
        resultBox.append(
          el('p', { class: 'field-error', role: 'alert', text: 'ব্যাকআপ গ্রহণযোগ্য নয়। কিছুই বদলানো হয়নি।' }),
          el('ul', {}, res.errors.map((m) => el('li', { class: 'field-error', text: m }))),
        );
        return;
      }
      pendingText = text;
      resultBox.append(
        el('p', { text: 'ব্যাকআপ বৈধ। ইমপোর্ট করলে বর্তমান সব ডেটা প্রতিস্থাপিত হবে।' }),
        el('div', { class: 'demo-note' }, [el('strong', { text: 'বর্তমান ডেটা (মুছে যাবে)' }), countsList(res.current)]),
        el('div', { class: 'demo-note' }, [el('strong', { text: 'ব্যাকআপের ডেটা (বসবে)' }), countsList(res.incoming)]),
        el('button', { type: 'button', class: 'btn btn-danger btn-block', text: 'বর্তমান ডেটা প্রতিস্থাপন করুন', onclick: doImport }),
      );
    }

    async function doImport() {
      if (!pendingText) return;
      const sure = await confirmDialog({
        title: 'বর্তমান ডেটা প্রতিস্থাপন করবেন?', danger: true, confirmLabel: 'প্রতিস্থাপন করুন',
        message: 'এই কাজ ফেরানো যাবে না।',
        items: [
          'এই ডিভাইসের সব প্রোফাইল, চ্যাট, বার্তা, ব্লক, রিপোর্ট ও নোটিফিকেশন মুছে ব্যাকআপের ডেটা বসবে',
          'সেটিংস ও থিমও ব্যাকআপ অনুযায়ী বদলাবে',
          'প্রয়োজন হলে আগে বর্তমান ডেটার ব্যাকআপ এক্সপোর্ট করে রাখুন',
        ],
      });
      if (!sure) return;
      const res = await DataService.importBackup(pendingText);
      if (!res.ok) {
        clear(resultBox).append(
          el('p', { class: 'field-error', role: 'alert', text: res.error || 'ইমপোর্ট ব্যর্থ হয়েছে।' }),
          el('p', { class: 'muted', text: 'আগের ডেটা অক্ষত আছে।' }),
        );
        return;
      }
      pendingText = null;
      showToast('ব্যাকআপ ইমপোর্ট হয়েছে।', { kind: 'success' });
      bumpData();
      // বর্তমান প্রোফাইল ব্যাকআপে থাকলে নতুন তথ্য নিয়ে চালু, নইলে লগআউট
      const cur = await AuthService.getCurrentUser();
      if (cur) await AuthService.switchDemoProfile(cur.id);
      else await AuthService.logout();
    }

    return el('div', { class: 'screen' }, [
      appBar({ title: 'ব্যাকআপ', onBack: () => back('/settings') }),
      el('div', { class: 'screen-body padded' }, [
        el('div', { class: 'container-narrow stack' }, [
          el('section', { class: 'stack-sm', 'aria-labelledby': 'bk-export' }, [
            el('h2', { id: 'bk-export', class: 'section-title flush', text: 'এক্সপোর্ট' }),
            demoNote('ব্যাকআপ ফাইলে সব বার্তা সাধারণ টেক্সটে থাকে, এনক্রিপ্ট করা নয়। ফাইলটি নিরাপদ জায়গায় রাখুন।'),
            exportBtn, copyBtn, exportStatus,
          ]),
          el('section', { class: 'stack-sm', 'aria-labelledby': 'bk-import' }, [
            el('h2', { id: 'bk-import', class: 'section-title flush', text: 'ইমপোর্ট' }),
            demoNote('ইমপোর্টের আগে ফাইল যাচাই হয় এবং কী প্রতিস্থাপিত হবে দেখানো হয়। নিশ্চিত না করা পর্যন্ত কিছু বদলায় না।'),
            el('div', { class: 'field' }, [
              el('label', { class: 'field-label', for: 'backup-file', text: 'ব্যাকআপ ফাইল (.json)' }),
              fileInput,
            ]),
            paste.node,
            el('button', { type: 'button', class: 'btn btn-block', text: 'ফাইল যাচাই করুন', onclick: check }),
            resultBox,
          ]),
        ]),
      ]),
    ]);
  },
};
