// M10 — the ONE trip filter (Expenses, Statistics, Countries, Over time).
// A FilterChip with a text label ("All trips" / "Japan" / "Japan +1") and a
// filter icon (was a bare ✈ button with a number badge on two screens and a
// hand-rolled chip on two others), plus the multi-select sheet: tap toggles a
// trip, "All trips" clears (empty selection = all trips, src/utils/tripFilter).
//
// The component is stateless: Statistics / Countries / Over time pass the
// shared `useTripFilterStore` so a selection survives navigating between them;
// Expenses keeps its own seeded selection (current trip on open, pattern 45).

import { useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { FilterChip, Button } from './ui';
import { PickerSheet, PickerRow } from './PickerSheet';
import { pruneTripIds, tripFilterShortLabel } from '../utils/tripFilter';
import { spacing } from '../theme/theme';

type TripLike = { id: string; name: string };

export function TripFilter({
  trips,
  selected,
  onToggle,
  onClear,
  style,
}: {
  trips: TripLike[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const active = pruneTripIds(selected, trips);
  const label = tripFilterShortLabel(active, trips);
  return (
    <>
      <FilterChip
        label={label}
        icon="filter-outline"
        trailingIcon="chevron-down"
        selected={active.length > 0}
        onPress={() => setOpen(true)}
        accessibilityLabel={`Filter by trip: ${label}`}
        style={style}
      />
      <PickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Filter by trip"
        maxListHeight={320}
        footer={
          <View style={styles.done}>
            <Button label="Done" onPress={() => setOpen(false)} />
          </View>
        }
      >
        <PickerRow icon="apps-outline" label="All trips" active={active.length === 0} onPress={onClear} />
        {trips.map((t) => (
          <PickerRow
            key={t.id}
            icon="airplane-outline"
            label={t.name}
            active={active.includes(t.id)}
            onPress={() => onToggle(t.id)}
          />
        ))}
      </PickerSheet>
    </>
  );
}

const styles = StyleSheet.create({
  done: { paddingTop: spacing.md },
});
