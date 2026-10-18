import { el, clear } from './utils/dom.js';
import { getState, setState, subscribe, bumpData, showToast } from './state.js';
import { defineRoutes, setGuard, startRouter, navigate } from './router.js';
import { initDatabase } from './storage/database.js';
import { getSettings } from './storage/repository.js';
import { getTheme, setTheme } from './storage/local-adapter.js';
import { AuthService } from './services/auth-service.js';
import { ChatService } from './services/chat-service.js';
import { MessageService } from './services/message-service.js';
import { NotificationService } from './services/notification-service.js';
import { routes } from './screens/index.js';
import { closeTopDialog } from './components/dialog.js';

function fatalView(error) {
  const detail = error && (error.cause?.name || error.name) ? `(${error.cause?.name || error.name})` : '';
  return el('div', { class: 'state-box', role: 'alert' }, [
    el('p', { class: 'state-title', text: 'অ্যাপ চালু করা যায়নি' }),
    el('p', { class: 'muted', text: `লোকাল ডেটাবেস খোলা যায়নি ${detail}। প্রাইভেট/গেস্ট মোড বা স্টোরেজ বন্ধ থাকলে এমন হতে পারে।` }),
    el('button', { class: 'btn btn-primary', type: 'button', text: 'আবার চেষ্টা করুন', onclick: () => location.reload() }),
  ]);
}

function buildShell(root) {
  clear(root);
  const banner = el('div', {
    class: 'offline-banner', role: 'status', hidden: true,
    text: 'ইন্টারনেট সংযোগ নেই। এটি লোকাল ডেমো, তাই অ্যাপ চলবে।',
  });
  const main = el('main', { id: 'screen', class: 'screen-host' });
  const toastRegion = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
  root.append(banner, main, toastRegion);
  return { banner, main, toastRegion };
}

function renderToast(region, toast) {
  clear(region);
  if (!toast) return;
  region.append(el('div', { class: `toast toast-${toast.kind}`, text: toast.message }));
}

async function refreshUnread() {
  const { user } = getState();
  try {
    const count = user ? await NotificationService.unreadCount(user.id) : 0;
    if (count !== getState().unreadNotifications) setState({ unreadNotifications: count });
  } catch { /* badge ব্যর্থ হলে অ্যাপ চলবে */ }
}

/** কীবোর্ড খুললে visible এলাকার উচ্চতা অনুযায়ী layout, যাতে composer ঢাকা না পড়ে */
function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => document.documentElement.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
  vv.addEventListener('resize', apply);
  apply();
}

function installGlobalHandlers() {
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
  window.addEventListener('error', (e) => { console.error(e.error || e.message); showToast('অপ্রত্যাশিত সমস্যা হয়েছে।', { kind: 'error' }); });
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); showToast('অপ্রত্যাশিত সমস্যা হয়েছে।', { kind: 'error' }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshUnread(); });
}

export async function bootstrap() {
  const root = document.getElementById('app');
  if (!root) return;

  const init = await initDatabase();
  if (!init.ok) { clear(root).append(fatalView(init.error)); return; }

  try {
    const settings = await getSettings();
    if (settings.theme !== getTheme()) setTheme(settings.theme);
  } catch { /* system theme-এ থাকবে */ }

  try { await MessageService.settlePending(); } catch { /* simulated delivery, অবহেলা */ }

  let user = null;
  try { user = await AuthService.getCurrentUser(); } catch { /* logged-out ধরা হবে */ }

  const shell = buildShell(root);
  setState({ user, ready: true });
  await refreshUnread();

  subscribe((s, prev) => {
    if (s.online !== prev.online) shell.banner.hidden = s.online;
    if (s.toast !== prev.toast) renderToast(shell.toastRegion, s.toast);
  });
  shell.banner.hidden = getState().online;

  // Auth পরিবর্তন (login/logout/profile switch): নিরাপদে হোমে ফেরা
  AuthService.onAuthChange(async (nextUser) => {
    ChatService.closeChat();
    setState({ user: nextUser });
    await refreshUnread();
    navigate(nextUser ? '/chats' : '/welcome', { replace: true });
  });

  NotificationService.onChange(() => { refreshUnread(); });
  MessageService.onChange(() => { bumpData(); refreshUnread(); });

  defineRoutes(routes, { fallback: user ? '/chats' : '/welcome' });
  setGuard((route) => {
    const { user: current } = getState();
    const mode = route.auth || 'required';
    if (mode === 'required' && !current) return '/welcome';
    if (mode === 'guest' && current) return '/chats';
    return null;
  });

  // Android wrapper (native -> JS): Back বোতাম চাপলে খোলা ডায়ালগ আগে বন্ধ হয়
  globalThis.__simplechatHandleBack = () => closeTopDialog();

  trackViewport();
  installGlobalHandlers();
  await startRouter(shell.main);
}

// test-এ `globalThis.__SIMPLECHAT_NO_BOOT__ = true` দিলে স্বয়ংক্রিয় চালু হবে না
if (!globalThis.__SIMPLECHAT_NO_BOOT__) bootstrap();
