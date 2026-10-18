export const nowIso = () => new Date().toISOString();

export function isIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.includes('T');
}

export function formatTime(iso, locale) {
  if (!isIso(iso)) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale || undefined,
    sameDay ? { hour: '2-digit', minute: '2-digit' }
            : { day: 'numeric', month: 'short' }).format(d);
}
