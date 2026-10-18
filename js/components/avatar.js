import { el } from '../utils/dom.js';

export function avatar(profile, { large = false } = {}) {
  return el('span', {
    class: 'avatar' + (large ? ' avatar-lg' : ''),
    'aria-hidden': 'true',
    text: profile?.avatarInitials || '?',
  });
}
