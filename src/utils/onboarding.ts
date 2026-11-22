// First-start onboarding: pure decision + currency search helpers.
// No React, no storage — scripts/test-onboarding.mjs compiles this file alone.

export const ONBOARDING_KEY = 'onboarding_done';

export type OnboardingDecision = 'done' | 'silent' | 'show';

/**
 * - flag already set            -> 'done'   (never show again)
 * - no flag, but trips exist    -> 'silent' (existing user: set the flag, never show)
 * - no flag, no trips           -> 'show'
 */
export function decideOnboarding(flag: string | null | undefined, tripCount: number): OnboardingDecision {
  if (flag === '1' || flag === 'true') return 'done';
  return tripCount > 0 ? 'silent' : 'show';
}

export interface CurrencyLike {
  code: string;
  name: string;
}

/** Case-insensitive match on code or name; an empty query returns the list unchanged. */
export function filterCurrencies<T extends CurrencyLike>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
}

// Module-scope "is the onboarding dialog open" flag, so other first-run
// prompts (web biometric enrol) wait until it is closed instead of
// stacking on top of it.
let onboardingOpen = false;
const openListeners = new Set<() => void>();
export function setOnboardingOpen(v: boolean): void {
  if (onboardingOpen === v) return;
  onboardingOpen = v;
  openListeners.forEach((l) => l());
}
export function getOnboardingOpen(): boolean { return onboardingOpen; }
export function subscribeOnboardingOpen(l: () => void): () => void {
  openListeners.add(l);
  return () => { openListeners.delete(l); };
}
