import { el, clear } from './utils/dom.js';

/*
 * Hash router: #/chat/chat_xxx?x=1
 * Route: { path: '/chat/:id', auth: 'required' | 'guest' | 'any', render(ctx) }
 * render(ctx) একটি Node অথবা { node, destroy } ফেরত দেয় (async হতে পারে)।
 * Android Back বোতাম WebView history দিয়ে কাজ করবে (Phase 2)।
 */

let compiled = [];
let container = null;
let guard = null;
let fallbackPath = '/chats';
let activeDestroy = null;
let token = 0;

function compile(def) {
  return { ...def, segments: def.path.split('/').filter(Boolean) };
}

export function defineRoutes(defs, { fallback = '/chats' } = {}) {
  compiled = defs.map(compile);
  fallbackPath = fallback;
}

/** guard(route) → redirect path অথবা null */
export function setGuard(fn) { guard = fn; }

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return null; }
}

export function parseHash(hash = location.hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : '/' + pathPart;
  const query = {};
  try {
    for (const [k, v] of new URLSearchParams(queryPart)) query[k] = v;
  } catch { /* খালি query */ }
  return { path, query };
}

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const route of compiled) {
    if (route.segments.length !== parts.length) continue;
    const params = {};
    let okMatch = true;
    for (let i = 0; i < parts.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) {
        const val = safeDecode(parts[i]);
        if (val === null) { okMatch = false; break; }
        params[seg.slice(1)] = val;
      } else if (seg !== parts[i]) { okMatch = false; break; }
    }
    if (okMatch) return { route, params };
  }
  return null;
}

function teardown() {
  if (typeof activeDestroy === 'function') {
    try { activeDestroy(); } catch { /* ignore */ }
  }
  activeDestroy = null;
}

function loadingView() {
  return el('div', { class: 'state-box', role: 'status' }, [
    el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    el('p', { text: 'লোড হচ্ছে…' }),
  ]);
}

function errorView(retry) {
  return el('div', { class: 'state-box', role: 'alert' }, [
    el('p', { class: 'state-title', text: 'কিছু একটা সমস্যা হয়েছে' }),
    el('p', { class: 'muted', text: 'পেজটি লোড করা যায়নি। আবার চেষ্টা করুন।' }),
    el('button', { class: 'btn btn-primary', type: 'button', text: 'আবার চেষ্টা করুন', onclick: retry }),
    el('button', { class: 'btn btn-ghost', type: 'button', text: 'হোমে যান', onclick: () => navigate(fallbackPath, { replace: true }) }),
  ]);
}

export async function resolve() {
  if (!container) return;
  const myToken = ++token;
  const { path, query } = parseHash();
  const found = match(path);
  if (!found) {
    if (path !== fallbackPath && match(fallbackPath)) { navigate(fallbackPath, { replace: true }); return; }
    clear(container).append(errorView(() => resolve())); // fallback নিজেও নেই: loop না করে ত্রুটি দেখাবে
    return;
  }

  const redirect = guard ? await guard(found.route) : null;
  if (myToken !== token) return;
  if (redirect && redirect !== path) { navigate(redirect, { replace: true }); return; }

  teardown();
  clear(container).append(loadingView());

  try {
    const result = await found.route.render({ params: found.params, query, path });
    const node = result instanceof Node ? result : result?.node;
    const destroy = result instanceof Node ? null : result?.destroy;
    if (myToken !== token) { // এর মধ্যে অন্য পেজে চলে গেছে
      if (typeof destroy === 'function') { try { destroy(); } catch { /* ignore */ } }
      return;
    }
    if (!(node instanceof Node)) throw new Error('Route render() কোনো Node ফেরত দেয়নি');
    activeDestroy = destroy || null;
    clear(container).append(node);
    container.scrollTop = 0;
    const heading = node.querySelector?.('h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  } catch (e) {
    if (myToken !== token) return;
    console.error('Route error:', e); // শুধু developer console-এ
    clear(container).append(errorView(() => resolve()));
  }
}

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (location.hash === target) { resolve(); return; }
  if (replace) {
    history.replaceState(null, '', target);
    resolve();
  } else {
    location.hash = path; // hashchange → resolve
  }
}

/** history থাকলে এক ধাপ পেছনে, নইলে fallback পেজে */
export function back(fallback = fallbackPath) {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function currentPath() { return parseHash().path; }

export function startRouter(hostElement) {
  container = hostElement;
  window.addEventListener('hashchange', resolve);
  return resolve();
}

export function stopRouter() {
  window.removeEventListener('hashchange', resolve);
  teardown();
  token++;
  container = null;
}
