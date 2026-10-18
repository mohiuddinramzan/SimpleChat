const PREFIX = globalThis.__SIMPLECHAT_STORAGE_PREFIX__ || 'simplechat.';
const memory = new Map();

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }

export const LocalAdapter = {
  get(key) {
    return safe(() => localStorage.getItem(PREFIX + key), memory.get(key) ?? null);
  },
  set(key, value) {
    memory.set(key, value);
    return safe(() => { localStorage.setItem(PREFIX + key, value); return true; }, false);
  },
  remove(key) {
    memory.delete(key);
    safe(() => localStorage.removeItem(PREFIX + key));
  },
  clearAll() {
    memory.clear();
    safe(() => {
      Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    });
  },
};

export const THEMES = ['light', 'dark', 'system'];

export function getTheme() {
  const t = LocalAdapter.get('theme');
  return THEMES.includes(t) ? t : 'system';
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) throw new Error('Invalid theme');
  LocalAdapter.set('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}
