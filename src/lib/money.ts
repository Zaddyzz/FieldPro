/** Money helpers. Amounts are integer minor units (kobo, cents) everywhere. */
const ZERO = ['JPY', 'KRW', 'VND', 'XAF', 'XOF', 'UGX', 'RWF', 'CLP', 'ISK', 'PYG'];
const THREE = ['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'];

export const digits = (currency: string) => (ZERO.includes(currency) ? 0 : THREE.includes(currency) ? 3 : 2);

/** "12,500.50" typed by a user → 1250050 minor units. Returns null if not a valid amount. */
export function toMinor(input: string, currency: string): number | null {
  const clean = input.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Math.round(Number(clean) * 10 ** digits(currency));
}

/** Minor units → plain number string for an input field. */
export const minorToInput = (minor: number, currency: string) => (minor / 10 ** digits(currency)).toFixed(digits(currency));

export function money(minor: number | null | undefined, currency: string): string {
  const d = digits(currency);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d })
    .format((minor ?? 0) / 10 ** d);
}

export interface Totals { subtotal: number; discount: number; tax: number; total: number }

/** Same formula as the database (public.compute_totals), for live preview while editing. */
export function computeTotals(lines: { quantity: number; unit: number }[], dType: string, dValue: number, rate: number, inclusive: boolean, currency: string): Totals {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.quantity * l.unit), 0);
  const discount = dType === 'percent' ? Math.round(subtotal * Math.min(dValue, 100) / 100)
    : dType === 'amount' ? Math.min(subtotal, Math.round(dValue * 10 ** digits(currency))) : 0;
  const net = subtotal - discount;
  if (inclusive) { const tax = Math.round(net - net / (1 + rate / 100)); return { subtotal, discount, tax, total: net }; }
  const tax = Math.round(net * rate / 100);
  return { subtotal, discount, tax, total: net + tax };
}
