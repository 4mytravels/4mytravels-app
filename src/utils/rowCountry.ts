// "Is this expense's country worth showing?" — the row only prints a country
// when it DIFFERS from the trip's primary country (the most frequent country
// among that trip's expenses; Trip has no country field). Pure, unit-tested in
// scripts/test-row-country.mjs.

export interface CountryLike {
  tripId: string;
  country?: string;
}

/** Most frequent country among `expenses`; ties → alphabetically first code. */
export function dominantCountry(expenses: ReadonlyArray<{ country?: string }>): string | undefined {
  const counts = new Map<string, number>();
  for (const e of expenses) {
    if (!e.country) continue;
    counts.set(e.country, (counts.get(e.country) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN || (n === bestN && best !== undefined && c < best)) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/** tripId → dominant country of that trip's expenses. */
export function dominantCountryByTrip(expenses: ReadonlyArray<CountryLike>): Record<string, string> {
  const byTrip = new Map<string, CountryLike[]>();
  for (const e of expenses) {
    const list = byTrip.get(e.tripId);
    if (list) list.push(e);
    else byTrip.set(e.tripId, [e]);
  }
  const out: Record<string, string> = {};
  for (const [tripId, list] of byTrip) {
    const d = dominantCountry(list);
    if (d) out[tripId] = d;
  }
  return out;
}

/** Show the country only when it is set AND differs from the primary one. */
export function countryDiffers(country: string | undefined, primary: string | undefined): boolean {
  if (!country) return false;
  return country !== primary;
}
