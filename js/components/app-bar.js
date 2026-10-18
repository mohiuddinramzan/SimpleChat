import { el } from '../utils/dom.js';

export function iconButton({ label, icon, onClick }) {
  return el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': label, title: label,
    onclick: onClick, text: icon,
  });
}

export function appBar({ title, subtitle = null, onBack = null, leading = null, actions = [] }) {
  return el('header', { class: 'screen-header' }, [
    onBack ? iconButton({ label: 'পেছনে যান', icon: '←', onClick: onBack }) : null,
    leading,
    el('div', { class: 'header-title' }, [
      el('h1', { text: title, title }),
      subtitle ? el('div', { class: 'header-sub', text: subtitle }) : null,
    ]),
    ...actions,
  ]);
}
