// Shared currency catalogue (code + representative flag + display name).
// Used by both the new-trip currency picker and the expense form so they
// always offer the same set. Flags are representative, not exhaustive —
// e.g. EUR is shared by many countries.
export interface CurrencyEntry {
  code: string;
  flag: string;
  name: string;
}

export const CURRENCIES: CurrencyEntry[] = [
  { code: 'EUR', flag: '🇪🇺', name: 'Euro' },
  { code: 'USD', flag: '🇺🇸', name: 'US Dollar' },
  { code: 'GBP', flag: '🇬🇧', name: 'British Pound' },
  { code: 'JPY', flag: '🇯🇵', name: 'Japanese Yen' },
  { code: 'CHF', flag: '🇨🇭', name: 'Swiss Franc' },
  { code: 'THB', flag: '🇹🇭', name: 'Thai Baht' },
  { code: 'TRY', flag: '🇹🇷', name: 'Turkish Lira' },
  { code: 'IDR', flag: '🇮🇩', name: 'Indonesian Rupiah' },
  { code: 'PHP', flag: '🇵🇭', name: 'Philippine Peso' },
  { code: 'AUD', flag: '🇦🇺', name: 'Australian Dollar' },
  { code: 'CAD', flag: '🇨🇦', name: 'Canadian Dollar' },
  { code: 'NZD', flag: '🇳🇿', name: 'New Zealand Dollar' },
  { code: 'CNY', flag: '🇨🇳', name: 'Chinese Yuan' },
  { code: 'HKD', flag: '🇭🇰', name: 'Hong Kong Dollar' },
  { code: 'SGD', flag: '🇸🇬', name: 'Singapore Dollar' },
  { code: 'KRW', flag: '🇰🇷', name: 'South Korean Won' },
  { code: 'INR', flag: '🇮🇳', name: 'Indian Rupee' },
  { code: 'BRL', flag: '🇧🇷', name: 'Brazilian Real' },
  { code: 'MXN', flag: '🇲🇽', name: 'Mexican Peso' },
  { code: 'ZAR', flag: '🇿🇦', name: 'South African Rand' },
  { code: 'SEK', flag: '🇸🇪', name: 'Swedish Krona' },
  { code: 'NOK', flag: '🇳🇴', name: 'Norwegian Krone' },
  { code: 'DKK', flag: '🇩🇰', name: 'Danish Krone' },
  { code: 'PLN', flag: '🇵🇱', name: 'Polish Zloty' },
  { code: 'CZK', flag: '🇨🇿', name: 'Czech Koruna' },
  { code: 'HUF', flag: '🇭🇺', name: 'Hungarian Forint' },
  { code: 'RON', flag: '🇷🇴', name: 'Romanian Leu' },
  { code: 'BGN', flag: '🇧🇬', name: 'Bulgarian Lev' },
  { code: 'HRK', flag: '🇭🇷', name: 'Croatian Kuna' },
  { code: 'ISK', flag: '🇮🇸', name: 'Icelandic Krona' },
  { code: 'ILS', flag: '🇮🇱', name: 'Israeli Shekel' },
  { code: 'VND', flag: '🇻🇳', name: 'Vietnamese Dong' },
  { code: 'MYR', flag: '🇲🇾', name: 'Malaysian Ringgit' },
  { code: 'EGP', flag: '🇪🇬', name: 'Egyptian Pound' },
  { code: 'MAD', flag: '🇲🇦', name: 'Moroccan Dirham' },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Look up a currency entry; falls back to a bare-code entry for unknown codes. */
export function currencyInfo(code: string): CurrencyEntry {
  return BY_CODE.get(code) ?? { code, flag: '', name: code };
}
