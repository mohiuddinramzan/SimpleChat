const listeners = new Set();

const initialState = () => Object.freeze({
  ready: false,
  user: null,                 // বর্তমান Demo প্রোফাইল
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  unreadNotifications: 0,
  dataVersion: 0,             // যেকোনো বার্তা/চ্যাট পরিবর্তনে বাড়ে; screen এটি দেখে refresh করতে পারে
  toast: null,
});

let state = initialState();

export const getState = () => state;

export function setState(patch) {
  const prev = state;
  state = Object.freeze({ ...state, ...patch });
  listeners.forEach((fn) => { try { fn(state, prev); } catch { /* listener ত্রুটি অবহেলা */ } });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const bumpData = () => setState({ dataVersion: state.dataVersion + 1 });

let toastSeq = 0;
let toastTimer = null;

/** kind: 'info' | 'success' | 'error' */
export function showToast(message, { kind = 'info', duration = 3500 } = {}) {
  clearTimeout(toastTimer);
  const id = ++toastSeq;
  setState({ toast: { id, message: String(message), kind } });
  toastTimer = setTimeout(() => {
    if (state.toast && state.toast.id === id) setState({ toast: null });
  }, duration);
}

/** শুধু test-এর জন্য */
export function resetState() {
  clearTimeout(toastTimer);
  state = initialState();
}
