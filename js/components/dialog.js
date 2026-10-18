import { el } from '../utils/dom.js';

let openCount = 0;
let seq = 0;
const openDialogs = [];

const KIND = { primary: 'btn-primary', danger: 'btn-danger', ghost: 'btn-ghost' };

function setAppInert(on) {
  const app = document.getElementById('app');
  if (app) app.inert = on; // ডায়ালগের পেছনের কনটেন্টে ফোকাস/ট্যাপ বন্ধ
}

/**
 * actions: [{ label, value, kind?, validate?() }]
 * ফেরত দেয়: ট্যাপ করা action-এর value, অথবা dismiss করলে null।
 * validate() false দিলে ডায়ালগ বন্ধ হয় না (ফর্ম ডায়ালগের জন্য)।
 */
export function openDialog({ title, body = [], actions = [], dismissible = true, role = 'dialog', initialFocus = null }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const titleId = `dlg-title-${++seq}`;
    let settled = false;

    function close(value) {
      if (settled) return;
      settled = true;
      const at = openDialogs.indexOf(entry);
      if (at >= 0) openDialogs.splice(at, 1);
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      openCount -= 1;
      if (openCount <= 0) { openCount = 0; setAppInert(false); }
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
      resolve(value);
    }

    function onKey(e) {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(null); }
    }

    const buttons = actions.map((a) => el('button', {
      type: 'button', class: `btn ${KIND[a.kind] || ''}`.trim(), text: a.label,
      onclick: () => {
        if (typeof a.validate === 'function' && !a.validate()) return;
        close(a.value === undefined ? true : a.value);
      },
    }));

    const dialog = el('div', { class: 'dialog', role, 'aria-modal': 'true', 'aria-labelledby': titleId }, [
      el('h2', { id: titleId, text: title }),
      ...[].concat(body),
      el('div', { class: 'dialog-actions' }, buttons),
    ]);
    const backdrop = el('div', {
      class: 'dialog-backdrop',
      onclick: (e) => { if (e.target === backdrop && dismissible) close(null); },
    }, [dialog]);

    const entry = { close, dismissible };
    openDialogs.push(entry);
    openCount += 1;
    setAppInert(true);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    (initialFocus || buttons[0])?.focus();
  });
}

/**
 * Android Back বোতামের জন্য: খোলা ডায়ালগ থাকলে true ফেরত দেয় (dismissible হলে বন্ধও করে),
 * না থাকলে false। native অংশ evaluateJavascript দিয়ে এটি ডাকে।
 */
export function closeTopDialog() {
  const top = openDialogs[openDialogs.length - 1];
  if (!top) return false;
  if (top.dismissible) top.close(null);
  return true;
}

/** destructive কাজের আগে: কী মুছবে তা items-এ লিখুন। ফেরত: true/false */
export async function confirmDialog({
  title, message = null, items = [], confirmLabel = 'নিশ্চিত করুন', cancelLabel = 'বাতিল', danger = false,
}) {
  const body = [];
  if (message) body.push(el('p', { text: message }));
  if (items.length) body.push(el('ul', {}, items.map((t) => el('li', { text: t }))));
  const result = await openDialog({
    title, body, role: danger ? 'alertdialog' : 'dialog',
    actions: [
      { label: cancelLabel, value: false },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
  return result === true;
}
