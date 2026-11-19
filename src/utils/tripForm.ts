// Pure helpers for the trip editor (app/trips/new.tsx): country → currency
// autofill and the budget Per day / Total conversion. No React, no native
// module, so scripts/test-trip-form.mjs can compile and assert them directly.

// ISO 4217 currency → ISO 3166-1 alpha-2 countries that use it as their main
// currency (UN members + common territories). Grouped by currency to keep the
// table short; inverted once into COUNTRY_CURRENCY below.
const CURRENCY_COUNTRIES: Record<string, string> = {
  EUR: 'AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA XK',
  USD: 'US EC SV PA TL FM MH PW ZW PR GU VI AS',
  XOF: 'BJ BF CI GW ML NE SN TG',
  XAF: 'CM CF TD CG GQ GA',
  XCD: 'AG DM GD KN LC VC AI MS',
  AUD: 'AU KI NR TV',
  NZD: 'NZ CK NU',
  CHF: 'CH LI',
  GBP: 'GB',
  AED: 'AE', AFN: 'AF', ALL: 'AL', AMD: 'AM', AOA: 'AO', ARS: 'AR', AWG: 'AW', AZN: 'AZ',
  BAM: 'BA', BBD: 'BB', BDT: 'BD', BGN: 'BG', BHD: 'BH', BIF: 'BI', BND: 'BN', BOB: 'BO',
  BRL: 'BR', BSD: 'BS', BTN: 'BT', BWP: 'BW', BYN: 'BY', BZD: 'BZ', CAD: 'CA', CDF: 'CD',
  CLP: 'CL', CNY: 'CN', COP: 'CO', CRC: 'CR', CUP: 'CU', CVE: 'CV', CZK: 'CZ', DJF: 'DJ',
  DKK: 'DK GL FO', DOP: 'DO', DZD: 'DZ', EGP: 'EG', ERN: 'ER', ETB: 'ET', FJD: 'FJ', GEL: 'GE',
  GHS: 'GH', GMD: 'GM', GNF: 'GN', GTQ: 'GT', GYD: 'GY', HKD: 'HK', HNL: 'HN', HTG: 'HT',
  HUF: 'HU', IDR: 'ID', ILS: 'IL PS', INR: 'IN', IQD: 'IQ', IRR: 'IR', ISK: 'IS', JMD: 'JM',
  JOD: 'JO', JPY: 'JP', KES: 'KE', KGS: 'KG', KHR: 'KH', KMF: 'KM', KPW: 'KP', KRW: 'KR',
  KWD: 'KW', KZT: 'KZ', LAK: 'LA', LBP: 'LB', LKR: 'LK', LRD: 'LR', LSL: 'LS', LYD: 'LY',
  MAD: 'MA', MDL: 'MD', MGA: 'MG', MKD: 'MK', MMK: 'MM', MNT: 'MN', MOP: 'MO', MRU: 'MR',
  MUR: 'MU', MVR: 'MV', MWK: 'MW', MXN: 'MX', MYR: 'MY', MZN: 'MZ', NAD: 'NA', NGN: 'NG',
  NIO: 'NI', NOK: 'NO', NPR: 'NP', OMR: 'OM', PEN: 'PE', PGK: 'PG', PHP: 'PH', PKR: 'PK',
  PLN: 'PL', PYG: 'PY', QAR: 'QA', RON: 'RO', RSD: 'RS', RUB: 'RU', RWF: 'RW', SAR: 'SA',
  SBD: 'SB', SCR: 'SC', SDG: 'SD', SEK: 'SE', SGD: 'SG', SLE: 'SL', SOS: 'SO', SRD: 'SR',
  SSP: 'SS', STN: 'ST', SYP: 'SY', SZL: 'SZ', THB: 'TH', TJS: 'TJ', TMT: 'TM', TND: 'TN',
  TOP: 'TO', TRY: 'TR', TTD: 'TT', TWD: 'TW', TZS: 'TZ', UAH: 'UA', UGX: 'UG', UYU: 'UY',
  UZS: 'UZ', VES: 'VE', VND: 'VN', VUV: 'VU', WST: 'WS', YER: 'YE', ZAR: 'ZA', ZMW: 'ZM',
};

const COUNTRY_CURRENCY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [cur, list] of Object.entries(CURRENCY_COUNTRIES)) {
    for (const cc of list.split(' ')) out[cc] = cur;
  }
  return out;
})();

/** Main currency of a country (ISO alpha-2), or undefined when unknown. */
export function currencyForCountry(code?: string): string | undefined {
  if (!code) return undefined;
  return COUNTRY_CURRENCY[code.toUpperCase()];
}

/**
 * Currency to auto-fill from the FIRST selected country. Returns undefined when
 * there is no country, the country is unknown, or the currency is not in the
 * offered catalogue (`allowed`), so the caller leaves the current value alone.
 */
export function autoCurrency(countries: string[], allowed?: readonly string[]): string | undefined {
  const cur = currencyForCountry(countries[0]);
  if (!cur) return undefined;
  if (allowed && !allowed.includes(cur)) return undefined;
  return cur;
}

export type BudgetMode = 'day' | 'total';

/** Parse a budget input ("50", "50,5", "") → number ≥ 0; empty/invalid = 0 (no budget). */
export function parseBudget(raw: string): number {
  const n = parseFloat(String(raw).trim().replace(',', '.'));
  return isFinite(n) && n > 0 ? n : 0;
}

/**
 * What gets STORED: the trip's dailyBudget is always a per-day number (0 = no
 * budget). Total mode divides by the inclusive day count; without a day count
 * (open-ended trip) a total cannot be converted and yields 0.
 */
export function toDailyBudget(amount: number, mode: BudgetMode, days: number | null): number {
  if (!(amount > 0)) return 0;
  if (mode === 'day') return amount;
  if (!days || days < 1) return 0;
  return amount / days;
}

/** The input value to show when switching mode / opening edit mode. */
export function budgetInputFor(daily: number, mode: BudgetMode, days: number | null): string {
  if (!(daily > 0)) return '';
  const v = mode === 'total' && days && days > 0 ? daily * days : daily;
  return String(Math.round(v * 100) / 100);
}

/**
 * The muted line under the budget input: per-day → the total for the trip,
 * total → the per-day share. null when there is nothing to say.
 */
export function budgetHint(
  amount: number,
  mode: BudgetMode,
  days: number | null,
  fmt: (n: number) => string,
): string | null {
  if (!(amount > 0) || !days || days < 1) return null;
  const unit = days === 1 ? 'day' : 'days';
  if (mode === 'day') return `≈ ${fmt(amount * days)} for ${days} ${unit}`;
  return `≈ ${fmt(amount / days)} / day for ${days} ${unit}`;
}
