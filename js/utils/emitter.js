export function createEmitter() {
  const listeners = new Set();
  return {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(event) {
      for (const fn of [...listeners]) {
        try { fn(event); } catch { /* listener-এর ত্রুটি অন্যদের থামাবে না */ }
      }
    },
  };
}
