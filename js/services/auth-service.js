import * as repo from '../storage/repository.js';
import { LocalAdapter } from '../storage/local-adapter.js';
import {
  validateEmail, validatePhone, validateDisplayName, validateUsername,
} from '../utils/validators.js';

const SESSION_KEY = 'currentUserId';
const listeners = new Set();

function emit(user) {
  listeners.forEach((fn) => { try { fn(user); } catch { /* listener ত্রুটি অবহেলা */ } });
}

const SAMPLE_PROFILES = [
  { displayName: 'রাহিম (Demo)', username: 'demo_rahim' },
  { displayName: 'সুমি (Demo)', username: 'demo_sumi' },
];

const DEMO_NOTE = Object.freeze({ demo: true, verified: false });

/**
 * Demo provider: কোনো পাসওয়ার্ড/OTP নেই, কিছুই remote যাচাই হয় না।
 * ভবিষ্যতে Firebase provider-ও একই methods দিলে useAuthProvider() দিয়ে বসানো যাবে।
 */
export const DemoAuthProvider = {
  name: 'demo',

  async getCurrentUser() {
    const id = LocalAdapter.get(SESSION_KEY);
    if (!id) return null;
    const profile = await repo.getProfile(id);
    if (profile) return profile;
    LocalAdapter.remove(SESSION_KEY); // প্রোফাইল মুছে গেছে বা import-এ বদলেছে
    return null;
  },

  async loginDemo({ method, identifier } = {}) {
    let v;
    if (method === 'email') v = validateEmail(identifier);
    else if (method === 'phone') v = validatePhone(identifier);
    else return { ok: false, errors: { method: 'অজানা লগইন পদ্ধতি।' } };
    if (!v.ok) return { ok: false, errors: { identifier: v.error } };

    const profile = method === 'email'
      ? await repo.findProfileByEmail(v.value)
      : await repo.findProfileByPhone(v.value);
    if (!profile) {
      return {
        ok: false,
        errors: { identifier: 'এই ডিভাইসে এই ইমেইল/ফোনের কোনো Demo প্রোফাইল নেই। আগে Demo Registration করুন।' },
      };
    }
    LocalAdapter.set(SESSION_KEY, profile.id);
    emit(profile);
    return { ok: true, user: profile, ...DEMO_NOTE };
  },

  async registerDemo(input = {}) {
    const errors = {};
    const name = validateDisplayName(input.displayName);
    if (!name.ok) errors.displayName = name.error;
    const uname = validateUsername(input.username);
    if (!uname.ok) errors.username = uname.error;

    const hasEmail = typeof input.email === 'string' && input.email.trim() !== '';
    const hasPhone = typeof input.phone === 'string' && input.phone.trim() !== '';
    let email = null;
    let phone = null;
    if (hasEmail) {
      const r = validateEmail(input.email);
      if (r.ok) email = r.value; else errors.email = r.error;
    }
    if (hasPhone) {
      const r = validatePhone(input.phone);
      if (r.ok) phone = r.value; else errors.phone = r.error;
    }
    if (!hasEmail && !hasPhone) {
      errors.contact = 'ইমেইল বা ফোন নম্বরের অন্তত একটি দিন (শুধু Demo লগইনের জন্য; যাচাই করা হবে না)।';
    }
    if (Object.keys(errors).length) return { ok: false, errors };

    try {
      const user = await repo.createProfile({
        displayName: name.value, username: uname.value, email, phone,
      });
      LocalAdapter.set(SESSION_KEY, user.id);
      emit(user);
      return { ok: true, user, ...DEMO_NOTE };
    } catch (e) {
      if (e instanceof repo.RepoError) {
        if (e.code === 'DUPLICATE_USERNAME') return { ok: false, errors: { username: e.message } };
        if (e.code === 'DUPLICATE_EMAIL') return { ok: false, errors: { email: e.message } };
        if (e.code === 'DUPLICATE_PHONE') return { ok: false, errors: { phone: e.message } };
      }
      throw e;
    }
  },

  async logout() {
    LocalAdapter.remove(SESSION_KEY);
    emit(null);
    return { ok: true };
  },

  async switchDemoProfile(profileId) {
    const profile = await repo.getProfile(profileId);
    if (!profile) return { ok: false, error: 'এই Demo প্রোফাইল পাওয়া যায়নি।' };
    LocalAdapter.set(SESSION_KEY, profile.id);
    emit(profile);
    return { ok: true, user: profile, ...DEMO_NOTE };
  },

  listDemoProfiles() {
    return repo.listProfiles();
  },

  /** একই ডিভাইসে দুই-জনের কথোপকথন পরীক্ষার জন্য নমুনা প্রোফাইল (আগে থাকলে আবার বানায় না) */
  async ensureSampleProfiles() {
    for (const sample of SAMPLE_PROFILES) {
      try {
        await repo.createProfile({ ...sample, email: null, phone: null });
      } catch (e) {
        if (!(e instanceof repo.RepoError && e.code === 'DUPLICATE_USERNAME')) throw e;
      }
    }
    return repo.listProfiles();
  },

  onAuthChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/* ---------- Facade: বাকি অ্যাপ শুধু AuthService চেনে ---------- */

const REQUIRED = ['getCurrentUser', 'loginDemo', 'registerDemo', 'logout', 'switchDemoProfile', 'listDemoProfiles', 'onAuthChange'];
let provider = DemoAuthProvider;

export function useAuthProvider(next) {
  const missing = REQUIRED.filter((k) => typeof next?.[k] !== 'function');
  if (missing.length) throw new Error(`Auth provider-এ এই function নেই: ${missing.join(', ')}`);
  provider = next;
}

export const AuthService = {
  getCurrentUser: () => provider.getCurrentUser(),
  loginDemo: (input) => provider.loginDemo(input),
  registerDemo: (input) => provider.registerDemo(input),
  logout: () => provider.logout(),
  switchDemoProfile: (id) => provider.switchDemoProfile(id),
  listDemoProfiles: () => provider.listDemoProfiles(),
  ensureSampleProfiles: () => provider.ensureSampleProfiles?.() ?? provider.listDemoProfiles(),
  onAuthChange: (fn) => provider.onAuthChange(fn),
  isDemo: () => provider.name === 'demo',
};
