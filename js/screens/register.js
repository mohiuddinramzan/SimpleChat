import { el } from '../utils/dom.js';
import { back } from '../router.js';
import { showToast } from '../state.js';
import { AuthService } from '../services/auth-service.js';
import { appBar } from '../components/app-bar.js';
import { field } from '../components/form-field.js';
import { demoBadge, demoNote } from '../components/demo-note.js';

export const registerRoute = {
  path: '/register',
  auth: 'guest',
  render() {
    const fields = {
      displayName: field({ label: 'নাম', name: 'displayName', autocomplete: 'name' }),
      username: field({
        label: 'ইউজারনেম', name: 'username', autocomplete: 'username', autocapitalize: 'off', maxlength: 20,
        hint: '৩–২০ অক্ষর: a–z, 0–9, _',
      }),
      email: field({
        label: 'ইমেইল', name: 'email', type: 'email', inputmode: 'email', autocomplete: 'email',
        autocapitalize: 'off', maxlength: 254, optional: true,
      }),
      phone: field({
        label: 'ফোন নম্বর', name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel',
        maxlength: 30, optional: true,
      }),
    };
    const formError = el('div', { class: 'field-error', role: 'alert' });
    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'Demo প্রোফাইল তৈরি করুন' });

    async function onSubmit(e) {
      e.preventDefault();
      Object.values(fields).forEach((f) => f.clearError());
      formError.textContent = '';
      submitBtn.disabled = true;
      try {
        const res = await AuthService.registerDemo({
          displayName: fields.displayName.getValue(),
          username: fields.username.getValue(),
          email: fields.email.getValue(),
          phone: fields.phone.getValue(),
        });
        if (!res.ok) {
          let firstBad = null;
          for (const key of Object.keys(fields)) {
            if (res.errors[key]) {
              fields[key].setError(res.errors[key]);
              firstBad = firstBad || fields[key];
            }
          }
          if (res.errors.contact) formError.textContent = res.errors.contact;
          (firstBad || fields.email).focus();
        } else {
          showToast('Demo প্রোফাইল তৈরি হয়েছে (কোনো যাচাই হয়নি)।', { kind: 'success' });
        }
      } catch (err) {
        console.error(err);
        formError.textContent = 'অপ্রত্যাশিত সমস্যা হয়েছে। আবার চেষ্টা করুন।';
      } finally {
        submitBtn.disabled = false;
      }
    }

    return el('div', { class: 'screen' }, [
      appBar({ title: 'Demo রেজিস্ট্রেশন', onBack: () => back('/welcome') }),
      el('div', { class: 'screen-body padded' }, [
        el('form', { class: 'container-narrow stack', novalidate: true, onsubmit: onSubmit }, [
          el('div', {}, [demoBadge('Demo')]),
          demoNote('এটি শুধু এই ডিভাইসের জন্য একটি Demo প্রোফাইল। ইমেইল বা ফোন নম্বর যাচাই করা হয় না, কোনো পাসওয়ার্ড বা OTP সংরক্ষিত হয় না। ইমেইল বা ফোনের অন্তত একটি দিন, শুধু পরে Demo লগইনে মেলানোর জন্য।'),
          fields.displayName.node,
          fields.username.node,
          fields.email.node,
          fields.phone.node,
          formError,
          submitBtn,
        ]),
      ]),
    ]);
  },
};
