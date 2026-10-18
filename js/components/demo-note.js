import { el } from '../utils/dom.js';

export const demoBadge = (text = 'Demo') => el('span', { class: 'demo-badge', text });
export const demoNote = (text) => el('p', { class: 'demo-note', role: 'note', text });
