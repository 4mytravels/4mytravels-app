import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// Lazy + guarded: this package calls TurboModuleRegistry.getEnforcing() at
// import time, which THROWS on dev-client builds that predate the dependency.
// Resolving it lazily lets us fall back to manual date entry instead of
// crashing the whole New-trip screen.
const DateTimePicker: React.ComponentType<Record<string, unknown>> | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-community/datetimepicker').default ?? null;
  } catch {
    return null;
  }
})();
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuid } from 'uuid';
import { useTripStore } from '../../src/store/tripStore';
import { saveTrip, updateTrip } from '../../src/db/tripRepo';
import { UN_COUNTRIES, flagEmoji, countryLabel } from '../../src/data/countries';
import { colors, fontFamily, radius, fontSize, spacing } from '../../src/theme/theme';
import { Button } from '../../src/components/ui';
import type { Trip } from '../../src/types';

// base64 helper (receipt/cover bytes are stored as BLOBs in the encrypted DB)
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'THB', 'TRY', 'IDR', 'AUD', 'CAD',
  'NZD', 'CNY', 'HKD', 'SGD', 'KRW', 'INR', 'BRL', 'MXN', 'ZAR', 'SEK',
  'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'ISK', 'ILS',
];

function CurrencyPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={styles.pickerValue}>{value}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Select currency</Text>
            <FlatList
              data={CURRENCIES}
              keyExtractor={(c) => c}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.pickerRow, item === value && styles.pickerRowActive]}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.pickerRowText, item === value && { color: colors.primary, fontWeight: '700' }]}>
                    {item}
                  </Text>
                  {item === value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function DateField({
  value,
  onChange,
  minimumDate,
  maximumDate,
}: {
  value: string; // YYYY-MM-DD or ''
  onChange: (iso: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [nativeAvailable, setNativeAvailable] = useState(true);
  const openPicker = () => {
    setDraft(value);
    setShow(true);
  };
  const onPick = (_: unknown, picked?: Date) => {
    // On Android the picker is a dialog: it fires with undefined when dismissed.
    setShow(false);
    if (picked) onChange(picked.toISOString().slice(0, 10));
  };
  const initial = value ? new Date(`${value}T12:00:00`) : new Date();
  return (
    <View>
      <Pressable style={styles.input} onPress={openPicker}>
        <Text style={[styles.pickerValue, !value && { color: colors.mutedForeground }]}>
          {value || 'YYYY-MM-DD'}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} />
      </Pressable>
      {/* Fallback text input (also used to correct a failed native picker) */}
      {editing && (
        <TextInput
          style={[styles.input, { marginTop: spacing.sm }]}
          value={draft}
          onChangeText={setDraft}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          onSubmitEditing={() => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(draft)) {
              onChange(draft);
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(draft)) onChange(draft);
            setEditing(false);
          }}
        />
      )}
      {show && (
        <Pressable
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
          // no-op guard view
        >
          {(() => {
            if (!nativeAvailable || !DateTimePicker) {
              setShow(false);
              setEditing(true);
              return null;
            }
            try {
              const Picker = DateTimePicker as React.ComponentType<Record<string, unknown>>;
              return (
                <Picker
                  value={isNaN(initial.getTime()) ? new Date() : initial}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onPick}
                  minimumDate={minimumDate}
                  maximumDate={maximumDate}
                  onError={() => {
                    setNativeAvailable(false);
                    setShow(false);
                    setEditing(true);
                  }}
                />
              );
            } catch {
              setNativeAvailable(false);
              setShow(false);
              setEditing(true);
              return null;
            }
          })()}
        </Pressable>
      )}
    </View>
  );
}

function CountryMultiPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const toggle = (code: string) => {
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    );
  };
  const filtered = UN_COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()),
  );
  const label =
    selected.length === 0
      ? 'Select countries'
      : selected.map((c) => flagEmoji(c)).join('') +
        ' ' +
        (selected.length <= 3
          ? selected.map((c) => countryLabel(c).replace(/^\S+\s/, '')).join(', ')
          : `${selected.length} countries selected`);
  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={[styles.pickerValue, selected.length === 0 && { color: colors.mutedForeground }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={styles.pickerTitle}>Countries visited</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.md }}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md, paddingVertical: spacing.md }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search country"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => {
                const active = selected.includes(item.code);
                return (
                  <Pressable
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => toggle(item.code)}
                  >
                    <Text style={[styles.pickerRowText, active && { color: colors.primary, fontWeight: '700' }]}>
                      {flagEmoji(item.code)} {item.name}
                    </Text>
                    <Ionicons
                      name={active ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function NewTripScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const existing = useTripStore((s) => (editId ? s.trips.find((t) => t.id === editId) : undefined));
  const addTrip = useTripStore((s) => s.addTrip);
  const updateTripStore = useTripStore((s) => s.updateTrip);
  const [name, setName] = useState(existing?.name ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [homeCurrency, setHomeCurrency] = useState(existing?.homeCurrency ?? 'EUR');
  const [defaultCurrency, setDefaultCurrency] = useState(existing?.defaultCurrency ?? 'EUR');
  const [dailyBudget, setDailyBudget] = useState(existing ? String(existing.dailyBudget) : '');
  const [countries, setCountries] = useState<string[]>(existing?.countries ?? []);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBytes, setCoverBytes] = useState<Uint8Array | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);

  const isEdit = !!existing;
  const canSave = name.trim().length > 0 && dailyBudget.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setErrorMsg(null);
    setPhase('building trip object');
    const trip: Trip = {
      id: existing?.id ?? uuid(),
      name: name.trim(),
      startDate,
      endDate: endDate.trim() || undefined,
      homeCurrency,
      defaultCurrency,
      dailyBudget: parseFloat(dailyBudget) || 0,
      countries,
    };
    try {
      // Each phase is surfaced in the UI so a hang is visible instead of silent.
      const step = async (label: string, fn: () => Promise<unknown>) => {
        setPhase(label);
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT in ${label}`)), 4000)),
        ]);
        return result;
      };

      if (isEdit) {
        setPhase('updateTripStore');
        updateTripStore(trip.id, {
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          homeCurrency: trip.homeCurrency,
          defaultCurrency: trip.defaultCurrency,
          dailyBudget: trip.dailyBudget,
          countries: trip.countries,
          coverBytes,
        });
        await step('updateTrip (DB write)', () => updateTrip(trip, coverBytes));
      } else {
        setPhase('addTrip (store)');
        // Include the cover bytes in the stored object so the photo shows
        // immediately (the DB row also carries them via saveTrip below).
        addTrip({ ...trip, coverBytes } as Trip & { coverBytes?: Uint8Array | null });
        await step('saveTrip (DB write)', () => saveTrip(trip, coverBytes));
      }
      setPhase('navigating back');
      router.back();
    } catch (e) {
      console.error('saveTrip failed', e);
      const msg = (e instanceof Error ? e.message : String(e)) + `\n[phase: ${phase}]`;
      setErrorMsg(msg);
      setPhase(null);
      Alert.alert('Could not save trip', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{isEdit ? 'Edit trip' : 'New trip'}</Text>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Field label="Name">
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Japan in autumn" placeholderTextColor={colors.mutedForeground} />
          </Field>
          <View style={styles.row}>
            <Field label="Start date" style={{ flex: 1, marginRight: spacing.md }}>
              <DateField
                value={startDate}
                onChange={setStartDate}
                maximumDate={endDate ? new Date(`${endDate}T12:00:00`) : undefined}
              />
            </Field>
            <Field label="End date (optional)" style={{ flex: 1 }}>
              <DateField
                value={endDate}
                onChange={setEndDate}
                minimumDate={startDate ? new Date(`${startDate}T12:00:00`) : undefined}
              />
            </Field>
          </View>
          <View style={styles.row}>
            <Field label="Home currency" style={{ flex: 1, marginRight: spacing.md }}>
              <CurrencyPicker value={homeCurrency} onSelect={setHomeCurrency} />
            </Field>
            <Field label="Default currency" style={{ flex: 1 }}>
              <CurrencyPicker value={defaultCurrency} onSelect={setDefaultCurrency} />
            </Field>
          </View>
          <Field label="Countries visited (optional)">
            <CountryMultiPicker selected={countries} onChange={setCountries} />
          </Field>
          <Field label="Daily budget (home currency)">
            <TextInput style={styles.input} value={dailyBudget} onChangeText={setDailyBudget} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground} />
          </Field>

          {/* Trip photo (optional) — replaces the airplane icon on the trip card */}
          <Field label="Trip photo (optional)">
            {coverPreview ? (
              <View style={styles.coverRow}>
                <Image source={{ uri: coverPreview }} style={styles.coverThumb} />
                <Pressable
                  style={[styles.coverBtn, { backgroundColor: colors.destructive }]}
                  onPress={() => { setCoverBytes(null); setCoverPreview(null); }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.primaryForeground} />
                  <Text style={styles.coverBtnText}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.coverAdd}
                onPress={async () => {
                  const res = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    base64: true,
                    quality: 0.7,
                    allowsEditing: true,
                    aspect: [4, 3],
                  });
                  if (!res.canceled && res.assets[0]?.base64) {
                    setCoverBytes(base64ToBytes(res.assets[0].base64));
                    setCoverPreview('data:image/jpeg;base64,' + res.assets[0].base64);
                  }
                }}
              >
                <Ionicons name="image-outline" size={20} color={colors.mutedForeground} />
                <Text style={styles.coverAddText}>Choose a photo for this trip</Text>
              </Pressable>
            )}
            <Text style={styles.coverHint}>Stored encrypted locally. GPS/EXIF location is never saved.</Text>
          </Field>
        </ScrollView>

        <View style={styles.footer}>
          <Button label={saving ? 'Saving…' : 'Create trip'} icon="checkmark-outline" disabled={!canSave || saving} onPress={save} />
          {errorMsg ? (
            <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radius.lg }}>
              <Text style={{ color: colors.destructive, fontSize: fontSize.sm, fontFamily: fontFamily.sans }}>{errorMsg}</Text>
            </View>
          ) : null}
          {phase ? (
            <Text style={{ marginTop: spacing.sm, color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans }}>Status: {phase}…</Text>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    marginTop: 40,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: fontSize['3xl'], fontWeight: '700', color: colors.foreground, fontFamily: fontFamily.heading },
  closeButton: { padding: spacing.xs },
  scroll: { paddingBottom: spacing.lg },
  row: { flexDirection: 'row' },
  label: { fontSize: fontSize.md, color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  footer: { marginTop: spacing.sm },
  pickerValue: { flex: 1, fontSize: fontSize.lg, color: colors.foreground, fontFamily: fontFamily.sans },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    padding: spacing.xl,
  },
  pickerTitle: { color: colors.foreground, fontSize: fontSize.xl, fontWeight: '700', fontFamily: fontFamily.heading, marginBottom: spacing.md },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowActive: {},
  pickerRowText: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  coverThumb: { width: 96, height: 72, borderRadius: radius.lg, backgroundColor: colors.secondary },
  coverBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
  coverBtnText: { color: colors.primaryForeground, fontWeight: '600', fontSize: fontSize.sm },
  coverAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  coverAddText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  coverHint: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.sm },
});
