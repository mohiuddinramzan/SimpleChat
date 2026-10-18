export function createId(prefix = 'id') {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`;
  const bytes = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function isValidId(value) {
  return typeof value === 'string' && /^[a-z]+_[A-Za-z0-9-]{8,64}$/.test(value);
}

// Unique key for a participant pair (order-independent)
export function pairKey(idA, idB) {
  return [idA, idB].sort().join('|');
}
