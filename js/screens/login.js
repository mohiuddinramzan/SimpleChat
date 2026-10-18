import { el } from '../utils/dom.js';
import { navigate, back } from '../router.js';
import { showToast } from '../state.js';
import { AuthService } from '../services/auth-service.js';
import { appBar } from '../components/app-bar.js';
import { field } from '../components/form-field.js';
import { demoBadge, demoNote } from '../components/demo-note.js';

function buildLogin(method) {
  const isEmail = method === 'email';
  const idField = field({
    label: isEmail ? 'ইমেইল' : 'ফোন নম্বর',
    name: 'identifier',
    type: isEmail ? 'email' : 'tel',
    inputmode: isEmail ? 'email' : 'tel',
    autocomplete: isEmail ? 'email' : 'tel',
    autocapitalize: isEmail ? 'off' : null,
    placeholder: isEmail ? 'name@example.com' : '+8801XXXXXXXXX',
    maxlength: isEmail ? 254 : 30,
  });
  const formError = el('div', { class: 'field-error', role: 'alert' });
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'Demo লগইন' });

  async function onSubmit(e) {
    e.preventDefault();
    idField.clearError();
    formError.textContent = '';
    submitBtn.disabled = true;
    try {
      const res = await AuthService.loginDemo({ method, identifier: idField.getValue() });
      if (!res.ok) {
        idField.setError(res.errors?.identifier || res.errors?.method || 'লগইন করা যায়নি।');
        idField.focus();
      } else {
        showToast('Demo প্রোফাইলে প্রবেশ করেছেন (কোনো যাচাই হয়নি)।', { kind: 'success' });
      }
    } catch (err) {
      console.error(err);
      formError.textContent = 'অপ্রত্যাশিত সমস্যা হয়েছে। আবার চেষ্টা করুন।';
    } finally {
      submitBtn.disabled = false;
    }
  }

  return el('div', { class: 'screen' }, [
    appBar({ title: isEmail ? 'ইমেইল লগইন (Demo)' : 'ফোন লগইন (Demo)', onBack: () => back('/welcome') }),
    el('div', { class: 'screen-body padded' }, [
      el('form', { class: 'container-narrow stack', novalidate: true, onsubmit: onSubmit }, [
        el('div', {}, [demoBadge('Demo')]),
        demoNote('এটি শুধু ডেমো। কোনো পাসওয়ার্ড বা OTP লাগে না, আর আপনার ' + (isEmail ? 'ইমেইল' : 'ফোন নম্বর') + ' কোথাও যাচাই করা হয় না। এই ডিভাইসে আগে তৈরি করা Demo প্রোফাইলের সঙ্গে মেলানো হয়।'),
        idField.node,
        formError,
        submitBtn,
        el('button', {
          type: 'button', class: 'btn btn-ghost btn-block',
          text: isEmail ? 'ফোন নম্বর দিয়ে চেষ্টা করুন' : 'ইমেইল দিয়ে চেষ্টা করুন',
          onclick: () => navigate(isEmail ? '/login/phone' : '/login/email', { replace: true }),
        }),
        el('button', { type: 'button', class: 'btn btn-ghost btn-block', text: 'নতুন Demo প্রোফাইল তৈরি করুন', onclick: () => navigate('/register') }),
      ]),
    ]),
  ]);
}

export const loginEmailRoute = { path: '/login/email', auth: 'guest', render: () => buildLogin('email') };
export const loginPhoneRoute = { path: '/login/phone', auth: 'guest', render: () => buildLogin('phone') };
