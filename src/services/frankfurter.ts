// Frankfurter API client (MVP scope §2.2, verified 2026-08-21).
//
// Verified facts (v1.6):
//   - Fully keyless AND CORS-open (access-control-allow-origin: *).
//   - No server-side proxy/key required; the app/PWA call it directly.
//   - v2 endpoints (v1 /v2/latest and /v2/<date> 404):
//       GET /v2/rates?base=EUR                      (all rates)
//       GET /v2/rates?base=EUR&quotes=USD,GBP       (filtered)
//       GET /v2/rates?date=YYYY-MM-DD&base=EUR      (historical)
//       GET /v2/rate/{base}/{quote}                 (single pair)
//   - v2 response is a JSON ARRAY of { date, base, quote, rate } objects,
//     NOT the v1 { base, date, rates: {...} } object.
//   - Default ?base=EUR returns 165 currencies; ?providers=ECB returns 30.
//
// RE-VERIFY endpoints/shape at each major app release.

const FRANKFURTER_BASE = 'https://api.frankfurter.dev';

export interface FrankfurterRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

function arrayToRates(rows: FrankfurterRate[], base: string, date: string): Record<string, number> {
  const rates: Record<string, number> = { [base]: 1 };
  for (const r of rows) {
    if (r.base === base) rates[r.quote] = r.rate;
  }
  return rates;
}

/** Fetch all rates for `base` on an optional `date` (historical when given). */
export async function getRates(base: string, date?: string): Promise<FrankfurterRate[]> {
  const url = `${FRANKFURTER_BASE}/v2/rates?base=${encodeURIComponent(base)}${
    date ? `&date=${encodeURIComponent(date)}` : ''
  }`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  return (await res.json()) as FrankfurterRate[];
}

/** Convenience: rates map (quote -> rate) for `base` on optional `date`. */
export async function getRatesMap(base: string, date?: string): Promise<Record<string, number>> {
  const rows = await getRates(base, date);
  const date_ = rows[0]?.date ?? date ?? new Date().toISOString().slice(0, 10);
  return arrayToRates(rows, base, date_);
}

/** Single-pair rate. Falls back to the latest published rate when the exact
 *  date has none (weekends/holidays — ECB publishes business days only). */
export async function getRate(base: string, quote: string, date?: string): Promise<number> {
  const url = `${FRANKFURTER_BASE}/v2/rate/${encodeURIComponent(base)}/${encodeURIComponent(
    quote
  )}${date ? `?date=${encodeURIComponent(date)}` : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const rows = (await res.json()) as FrankfurterRate[];
  let rate = rows[0]?.rate;
  if ((rate == null || Number.isNaN(rate)) && date) {
    // Retry without date → most recent published rate.
    return getRate(base, quote);
  }
  return rate ?? NaN;
}
