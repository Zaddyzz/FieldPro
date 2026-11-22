import type { DateFormat } from './countries';

/** Parts of an instant as seen on a wall clock in `timeZone`. */
function zonedParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-22T14:30" typed in the business time zone → UTC ISO string. */
export function zonedLocalToUtc(local: string, timeZone: string): string {
  const [datePart, timePart = '00:00'] = local.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, min);
  // Two passes handle DST edges.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess = guess + (asUtc - seen);
  }
  return new Date(guess).toISOString();
}

/** UTC ISO → "yyyy-MM-ddTHH:mm" on the business wall clock (for datetime-local inputs). */
export function utcToZonedLocal(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** "yyyy-MM-dd" day key in the business time zone. */
export function dayKey(iso: string | Date, timeZone: string): string {
  const p = zonedParts(typeof iso === 'string' ? new Date(iso) : iso, timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function formatDate(iso: string | null | undefined, timeZone: string, fmt: DateFormat): string {
  if (!iso) return '—';
  const p = zonedParts(new Date(iso), timeZone);
  if (fmt === 'MM/dd/yyyy') return `${pad(p.m)}/${pad(p.d)}/${p.y}`;
  if (fmt === 'yyyy-MM-dd') return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

export function formatTime(iso: string | null | undefined, timeZone: string, fmt: DateFormat): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(fmt === 'MM/dd/yyyy' ? 'en-US' : 'en-GB', {
    timeZone, hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, timeZone: string, fmt: DateFormat): string {
  if (!iso) return '—';
  return `${formatDate(iso, timeZone, fmt)}, ${formatTime(iso, timeZone, fmt)}`;
}

export function formatWeekday(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** Amounts are stored as integer minor units (cents, kobo). */
export function formatMoney(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 10 ** digits);
}

export function relativeFromNow(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
