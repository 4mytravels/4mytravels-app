// Category order for the expense-form grid: most used first.
// Pure (no RN imports) so scripts/test-category-order.mjs can compile it alone.

/**
 * Order `all` by how often each category occurs in `expenses` (desc).
 * Ties — and categories never used — keep their position in `all`
 * (the default order), so an empty history returns `all` unchanged.
 * Categories in the history that are not in `all` are ignored.
 */
export function categoriesByUsage<T extends string>(
  expenses: readonly { category: string }[],
  all: readonly T[],
): T[] {
  const counts = new Map<string, number>();
  for (const e of expenses) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return all
    .map((c, i) => ({ c, i, n: counts.get(c) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.c);
}

/**
 * The `slots` tiles shown in the grid. The selected category is ALWAYS among
 * them: when it falls outside the top `slots`, it replaces the last slot.
 */
export function visibleCategories<T extends string>(ordered: readonly T[], selected: T | null, slots: number): T[] {
  const top = ordered.slice(0, slots);
  if (selected && ordered.includes(selected) && !top.includes(selected) && top.length > 0) {
    top[top.length - 1] = selected;
  }
  return top;
}
