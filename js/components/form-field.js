import { el } from '../utils/dom.js';

let seq = 0;

/** label + input/textarea + hint + error। ত্রুটি aria-live দিয়ে ঘোষিত হয়। */
export function field({
  label, name, type = 'text', value = '', hint = null, placeholder = null,
  autocomplete = 'off', inputmode = null, autocapitalize = null, maxlength = null,
  multiline = false, optional = false, rows = 3,
}) {
  const id = `f-${name}-${++seq}`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;

  const input = el(multiline ? 'textarea' : 'input', {
    id, name, class: 'field-input',
    type: multiline ? null : type,
    rows: multiline ? rows : null,
    placeholder, autocomplete, inputmode, autocapitalize, maxlength,
    'aria-describedby': hint ? `${hintId} ${errId}` : errId,
  });
  input.value = value;

  const error = el('div', { class: 'field-error', id: errId, 'aria-live': 'polite' });
  const node = el('div', { class: 'field' }, [
    el('label', { class: 'field-label', for: id, text: optional ? `${label} (ঐচ্ছিক)` : label }),
    input,
    hint ? el('div', { class: 'field-hint', id: hintId, text: hint }) : null,
    error,
  ]);

  return {
    node, input,
    getValue: () => input.value,
    focus: () => input.focus(),
    setError(message) {
      error.textContent = message;
      input.setAttribute('aria-invalid', 'true');
    },
    clearError() {
      error.textContent = '';
      input.removeAttribute('aria-invalid');
    },
  };
}
