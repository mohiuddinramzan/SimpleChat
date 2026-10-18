import { el } from '../utils/dom.js';

export function loadingState(label = 'লোড হচ্ছে…') {
  return el('div', { class: 'state-box', role: 'status' }, [
    el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    el('p', { text: label }),
  ]);
}

export function emptyState({ icon = '💬', title, text = null, actionLabel = null, onAction = null }) {
  return el('div', { class: 'state-box' }, [
    el('div', { class: 'big-icon', 'aria-hidden': 'true', text: icon }),
    el('p', { class: 'state-title', text: title }),
    text ? el('p', { class: 'muted', text }) : null,
    actionLabel && onAction
      ? el('button', { class: 'btn btn-primary', type: 'button', text: actionLabel, onclick: onAction })
      : null,
  ]);
}

export function errorState({ message = 'কিছু একটা সমস্যা হয়েছে।', onRetry = null }) {
  return el('div', { class: 'state-box', role: 'alert' }, [
    el('p', { class: 'state-title', text: 'ত্রুটি' }),
    el('p', { class: 'muted', text: message }),
    onRetry ? el('button', { class: 'btn btn-primary', type: 'button', text: 'আবার চেষ্টা করুন', onclick: onRetry }) : null,
  ]);
}
