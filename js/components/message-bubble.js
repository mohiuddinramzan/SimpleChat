import { el } from '../utils/dom.js';
import { formatTime } from '../utils/time.js';

// এগুলো সবই simulated; আসল নেটওয়ার্ক অবস্থা নয়
const STATUS = {
  sent: { icon: '✓', text: 'পাঠানো হয়েছে' },
  delivered: { icon: '✓✓', text: 'ডেলিভার্ড (ডেমো)' },
  read: { icon: '✓✓', text: 'পঠিত (ডেমো)' },
};

function fullTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === new Date().toDateString()) return formatTime(iso, 'bn');
  return new Intl.DateTimeFormat('bn', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** quote: { author, text, missing } অথবা null */
export function messageRow({ message, own, quote = null, onOpen }) {
  const st = STATUS[message.status] || STATUS.sent;

  const content = [];
  if (quote) {
    content.push(el('span', { class: 'reply-quote' }, [
      quote.author ? el('span', { class: 'quote-author', text: quote.author }) : null,
      el('span', { text: quote.text }),
    ]));
  }
  content.push(el('span', { class: 'bubble-text', text: message.text })); // textContent, কখনো innerHTML নয়

  const bubble = el('button', {
    class: 'bubble', type: 'button', 'aria-haspopup': 'dialog',
    title: 'বার্তার অপশন', onclick: () => onOpen(message),
  }, content);

  return el('div', { class: `msg-row ${own ? 'own' : 'other'}`, dataset: { messageId: message.id } }, [
    bubble,
    el('div', { class: 'msg-meta' }, [
      el('time', { datetime: message.createdAt, text: fullTime(message.createdAt) }),
      message.edited ? el('span', { text: 'এডিটেড' }) : null,
      own ? el('span', { class: 'msg-status-sim', text: `${st.icon} ${st.text}` }) : null,
    ]),
  ]);
}
