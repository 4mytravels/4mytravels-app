// Compile-time contract for the M2 component API. This file is never imported
// by the app (Metro only bundles what is imported); `npx tsc --noEmit` checks it.
// Every @ts-expect-error below MUST stay an error — if a prop becomes optional
// by accident, tsc reports "Unused '@ts-expect-error' directive" and fails.
import { IconButton, Button, FilterChip, AppText } from './ui';

export function UiTypecheck() {
  return (
    <>
      {/* @ts-expect-error — an IconButton without an accessible label is refused */}
      <IconButton icon="add" onPress={() => {}} />
      <IconButton icon="add" label="Add expense" onPress={() => {}} />
      {/* @ts-expect-error — unknown Button variant */}
      <Button label="x" variant="fancy" />
      <Button label="Delete" variant="destructive" size="sm" />
      {/* @ts-expect-error — a FilterChip needs its label */}
      <FilterChip selected />
      <AppText variant="amount">€12.00</AppText>
    </>
  );
}
