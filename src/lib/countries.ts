export type DateFormat = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';

export interface Country {
  code: string;
  name: string;
  currency: string;
  timeZone: string;
  dial: string;
  taxLabel: string;
  dateFormat: DateFormat;
}

// Defaults only — every value can be changed by the business owner in Settings.
export const COUNTRIES: Country[] = [
  { code: 'NG', name: 'Nigeria', currency: 'NGN', timeZone: 'Africa/Lagos', dial: '234', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', timeZone: 'Africa/Accra', dial: '233', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'KE', name: 'Kenya', currency: 'KES', timeZone: 'Africa/Nairobi', dial: '254', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', timeZone: 'Africa/Johannesburg', dial: '27', taxLabel: 'VAT', dateFormat: 'yyyy-MM-dd' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', timeZone: 'Africa/Cairo', dial: '20', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'MA', name: 'Morocco', currency: 'MAD', timeZone: 'Africa/Casablanca', dial: '212', taxLabel: 'TVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', timeZone: 'Africa/Dar_es_Salaam', dial: '255', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', timeZone: 'Africa/Kampala', dial: '256', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', timeZone: 'Africa/Kigali', dial: '250', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', timeZone: 'Africa/Douala', dial: '237', taxLabel: 'TVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', timeZone: 'Africa/Abidjan', dial: '225', taxLabel: 'TVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', timeZone: 'Africa/Dakar', dial: '221', taxLabel: 'TVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'US', name: 'United States', currency: 'USD', timeZone: 'America/New_York', dial: '1', taxLabel: 'Sales Tax', dateFormat: 'MM/dd/yyyy' },
  { code: 'CA', name: 'Canada', currency: 'CAD', timeZone: 'America/Toronto', dial: '1', taxLabel: 'GST/HST', dateFormat: 'yyyy-MM-dd' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', timeZone: 'America/Mexico_City', dial: '52', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', timeZone: 'America/Sao_Paulo', dial: '55', taxLabel: 'ISS', dateFormat: 'dd/MM/yyyy' },
  { code: 'AR', name: 'Argentina', currency: 'ARS', timeZone: 'America/Argentina/Buenos_Aires', dial: '54', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'CO', name: 'Colombia', currency: 'COP', timeZone: 'America/Bogota', dial: '57', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'CL', name: 'Chile', currency: 'CLP', timeZone: 'America/Santiago', dial: '56', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'PE', name: 'Peru', currency: 'PEN', timeZone: 'America/Lima', dial: '51', taxLabel: 'IGV', dateFormat: 'dd/MM/yyyy' },
  { code: 'JM', name: 'Jamaica', currency: 'JMD', timeZone: 'America/Jamaica', dial: '1', taxLabel: 'GCT', dateFormat: 'dd/MM/yyyy' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timeZone: 'Europe/London', dial: '44', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', timeZone: 'Europe/Dublin', dial: '353', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'DE', name: 'Germany', currency: 'EUR', timeZone: 'Europe/Berlin', dial: '49', taxLabel: 'MwSt', dateFormat: 'dd/MM/yyyy' },
  { code: 'FR', name: 'France', currency: 'EUR', timeZone: 'Europe/Paris', dial: '33', taxLabel: 'TVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'ES', name: 'Spain', currency: 'EUR', timeZone: 'Europe/Madrid', dial: '34', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'IT', name: 'Italy', currency: 'EUR', timeZone: 'Europe/Rome', dial: '39', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', timeZone: 'Europe/Amsterdam', dial: '31', taxLabel: 'BTW', dateFormat: 'dd/MM/yyyy' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', timeZone: 'Europe/Lisbon', dial: '351', taxLabel: 'IVA', dateFormat: 'dd/MM/yyyy' },
  { code: 'PL', name: 'Poland', currency: 'PLN', timeZone: 'Europe/Warsaw', dial: '48', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'SE', name: 'Sweden', currency: 'SEK', timeZone: 'Europe/Stockholm', dial: '46', taxLabel: 'Moms', dateFormat: 'yyyy-MM-dd' },
  { code: 'TR', name: 'Türkiye', currency: 'TRY', timeZone: 'Europe/Istanbul', dial: '90', taxLabel: 'KDV', dateFormat: 'dd/MM/yyyy' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timeZone: 'Asia/Dubai', dial: '971', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', timeZone: 'Asia/Riyadh', dial: '966', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'QA', name: 'Qatar', currency: 'QAR', timeZone: 'Asia/Qatar', dial: '974', taxLabel: 'Tax', dateFormat: 'dd/MM/yyyy' },
  { code: 'IN', name: 'India', currency: 'INR', timeZone: 'Asia/Kolkata', dial: '91', taxLabel: 'GST', dateFormat: 'dd/MM/yyyy' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', timeZone: 'Asia/Karachi', dial: '92', taxLabel: 'GST', dateFormat: 'dd/MM/yyyy' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', timeZone: 'Asia/Dhaka', dial: '880', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR', timeZone: 'Asia/Colombo', dial: '94', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', timeZone: 'Asia/Jakarta', dial: '62', taxLabel: 'PPN', dateFormat: 'dd/MM/yyyy' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', timeZone: 'Asia/Kuala_Lumpur', dial: '60', taxLabel: 'SST', dateFormat: 'dd/MM/yyyy' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', timeZone: 'Asia/Manila', dial: '63', taxLabel: 'VAT', dateFormat: 'MM/dd/yyyy' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', timeZone: 'Asia/Singapore', dial: '65', taxLabel: 'GST', dateFormat: 'dd/MM/yyyy' },
  { code: 'TH', name: 'Thailand', currency: 'THB', timeZone: 'Asia/Bangkok', dial: '66', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'VN', name: 'Vietnam', currency: 'VND', timeZone: 'Asia/Ho_Chi_Minh', dial: '84', taxLabel: 'VAT', dateFormat: 'dd/MM/yyyy' },
  { code: 'JP', name: 'Japan', currency: 'JPY', timeZone: 'Asia/Tokyo', dial: '81', taxLabel: 'Consumption Tax', dateFormat: 'yyyy-MM-dd' },
  { code: 'AU', name: 'Australia', currency: 'AUD', timeZone: 'Australia/Sydney', dial: '61', taxLabel: 'GST', dateFormat: 'dd/MM/yyyy' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', timeZone: 'Pacific/Auckland', dial: '64', taxLabel: 'GST', dateFormat: 'dd/MM/yyyy' },
];

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code);

export function allTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  return intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : Array.from(new Set(COUNTRIES.map((c) => c.timeZone)));
}

// Countries that span several time zones. Everyone else uses their single default zone.
const MULTI_ZONE: Record<string, string[]> = {
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'],
  CA: ['America/St_Johns', 'America/Halifax', 'America/Toronto', 'America/Winnipeg', 'America/Regina', 'America/Edmonton', 'America/Vancouver'],
  MX: ['America/Mexico_City', 'America/Cancun', 'America/Chihuahua', 'America/Tijuana'],
  BR: ['America/Sao_Paulo', 'America/Fortaleza', 'America/Recife', 'America/Belem', 'America/Manaus', 'America/Rio_Branco'],
  AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Australia/Hobart'],
  ID: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  CL: ['America/Santiago', 'America/Punta_Arenas'],
  CD: ['Africa/Kinshasa', 'Africa/Lubumbashi'],
  NZ: ['Pacific/Auckland', 'Pacific/Chatham'],
  ES: ['Europe/Madrid', 'Atlantic/Canary'],
  PT: ['Europe/Lisbon', 'Atlantic/Azores'],
};

export function zonesForCountry(code: string): string[] {
  return MULTI_ZONE[code] ?? [countryByCode(code)?.timeZone ?? 'UTC'];
}

/** "Lagos (UTC+1)" */
export function zoneLabel(zone: string): string {
  const city = zone.split('/').pop()!.replace(/_/g, ' ');
  try {
    const off = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${city} (${off.replace('GMT', 'UTC') || 'UTC'})`;
  } catch { return city; }
}

export const CURRENCIES = Array.from(new Set(COUNTRIES.map((c) => c.currency))).sort();

/** Normalise user input to E.164 using the selected dial code. Returns null if invalid. */
export function toE164(input: string, dial: string): string | null {
  const raw = input.trim();
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  if (!digits.startsWith('+')) digits = '+' + dial + digits.replace(/^0+/, '');
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}
