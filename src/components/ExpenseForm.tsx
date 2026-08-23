// Add/edit-expense bottom sheet — matches the Lovable "Add expense" design
// (dark theme, large amount input, currency pill, category grid, save button).
// Builds a full Expense with a Frankfurter rate snapshot at entry time (§2.2).
// Supports edit mode (initialExpense) and a manual rate override (acceptance §2.5).
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { UN_COUNTRIES, flagEmoji, countryLabel } from '../data/countries';
import {
  colors,
  fontFamily,
  radius,
  fontSize,
  spacing,
} from '../theme/theme';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type Expense,
  type PaymentMethod,
} from '../types';
import { CategoryChip, Button } from './ui';
import { getRate } from '../services/frankfurter';
import { useSettingsStore, getManualRate } from '../store/settingsStore';
import { v4 as uuid } from 'uuid';

// base64 helpers (React Native exposes atob/btoa globally)
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const POPULAR_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'THB', 'TRY', 'IDR'];
const PAYMENT_METHODS: PaymentMethod[] = ['card', 'cash'];

export function ExpenseForm({
  tripId,
  defaultCurrency,
  homeCurrency,
  initialExpense,
  onSave,
  onClose,
}: {
  tripId: string;
  defaultCurrency: string;
  homeCurrency: string; // ISO 4217, the trip's home currency
  initialExpense?: Expense;
  onSave: (expense: Expense) => void;
  onClose?: () => void;
}) {
  const isEdit = !!initialExpense;
  const [amount, setAmount] = useState(initialExpense ? String(initialExpense.amount) : '0.00');
  const [currency, setCurrency] = useState(initialExpense?.currency ?? defaultCurrency);
  const [category, setCategory] = useState<ExpenseCategory>(initialExpense?.category ?? 'Food');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialExpense?.paymentMethod ?? 'card',
  );
  const [note, setNote] = useState(initialExpense?.notes ?? '');
  const [date, setDate] = useState(initialExpense?.rateDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(
    initialExpense ? (initialExpense.createdAt || new Date().toISOString()).slice(11, 16) : new Date().toISOString().slice(11, 16),
  );
  const [country, setCountry] = useState(initialExpense?.country ?? '');
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [showCurrencies, setShowCurrencies] = useState(false);
  // Global manual FX overrides (Settings) — when one exists for this pair the
  // fetched Frankfurter rate is ignored (§2.5, now app-wide per user request).
  const manualRates = useSettingsStore((s) => s.manualRates);
  const manualOverride = getManualRate(manualRates, currency, homeCurrency);
  // Receipt photo: stored as BLOB in the encrypted DB. EXIF GPS is never read or
  // persisted (privacy — §2.2); only the image bytes are kept.
  const [receiptPreview, setReceiptPreview] = useState<string | null>(
    initialExpense?.receiptPhoto ? 'data:image/jpeg;base64,' + bytesToBase64(initialExpense.receiptPhoto) : null,
  );
  const [receiptBytes, setReceiptBytes] = useState<Uint8Array | null>(initialExpense?.receiptPhoto ?? null);

  const pickReceipt = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      const b64 = res.assets[0].base64;
      const bytes = base64ToBytes(b64);
      setReceiptBytes(bytes);
      setReceiptPreview('data:image/jpeg;base64,' + b64);
    }
  };
  const [rate, setRate] = useState<number | null>(initialExpense ? initialExpense.rateToHome : null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // Fetch the currency→home rate whenever currency or date changes (§2.2).
  // Priority: global manual override (Settings) > Frankfurter fetch.
  useEffect(() => {
    if (manualOverride != null) {
      setRate(manualOverride);
      setRateError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (currency === homeCurrency) {
        setRate(1);
        setRateError(null);
        return;
      }
      setRateLoading(true);
      setRateError(null);
      try {
        const r = await getRate(homeCurrency, currency, date);
        if (!cancelled) {
          if (Number.isNaN(r)) {
            setRateError('Rate unavailable (offline?)');
            setRate(null);
          } else {
            // getRate(home, currency) returns home->currency; invert for currency->home.
            setRate(1 / r);
          }
        }
      } catch {
        if (!cancelled) {
          setRateError('Rate unavailable (offline?)');
          setRate(null);
        }
      } finally {
        if (!cancelled) setRateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency, date, homeCurrency, manualOverride]);

  const amountNum = parseFloat(amount) || 0;
  const homeAmount = rate != null ? amountNum * rate : null;

  const save = () => {
    if (amountNum <= 0 || !rate) return; // require a valid amount + rate
    const expense: Expense = {
      id: initialExpense?.id ?? uuid(),
      tripId,
      amount: amountNum,
      currency,
      // Snapshot stored at entry time so later refreshes don't rewrite history (§2.2).
      rateToHome: rate,
      rateDate: date,
      category,
      // Timezone-aware: combine the chosen date + local time-of-day on the device,
      // then normalize to UTC ISO (§2.1).
      createdAt: initialExpense?.createdAt ?? new Date(`${date}T${time}:00`).toISOString(),
      country: country.trim() || undefined,
      paymentMethod,
      notes: note.trim() || undefined,
      receiptPhoto: receiptBytes,
    };
    onSave(expense);
  };

  const canSave = amountNum > 0 && rate != null && !rateLoading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{isEdit ? 'Edit expense' : 'Add expense'}</Text>
            <Text style={styles.subtitle}>Quickly log a travel spend.</Text>
          </View>
          {onClose && (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Amount + currency */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Amount</Text>
              <Pressable onPress={() => setShowCurrencies((v) => !v)}>
                <Text style={styles.label}>Currency</Text>
              </Pressable>
            </View>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
              />
              <Pressable style={styles.currencyButton} onPress={() => setShowCurrencies((v) => !v)}>
                <Text style={styles.currencyText}>{currency}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
            {showCurrencies && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.currencyScroll}
                contentContainerStyle={styles.currencyRow}
              >
                {POPULAR_CURRENCIES.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.currencyChip, c === currency && styles.currencyChipActive]}
                    onPress={() => {
                      setCurrency(c);
                      setShowCurrencies(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.currencyChipText,
                        c === currency && { color: colors.primaryForeground, fontWeight: '600' },
                      ]}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {/* rate line */}
            <View style={styles.rateRow}>
              {rateLoading ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : rateError ? (
                <Text style={styles.rateError}>{rateError}</Text>
              ) : rate != null ? (
                <Text style={styles.rateText}>
                  ≈ {homeAmount?.toLocaleString('en-US', { maximumFractionDigits: 2 })} {homeCurrency}
                </Text>
              ) : null}
            </View>
            {/* global rate override indicator (set in Settings) */}
            {manualOverride != null && (
              <Text style={styles.overrideNote}>
                Using your manual {currency}→{homeCurrency} rate from Settings
              </Text>
            )}
          </View>

          {/* Category grid */}
          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {EXPENSE_CATEGORIES.map((cat) => (
                <CategoryChip
                  key={cat}
                  category={cat}
                  selected={category === cat}
                  onSelect={setCategory}
                />
              ))}
            </View>
          </View>

          {/* Payment method */}
          <View style={styles.section}>
            <Text style={styles.label}>Payment</Text>
            <View style={styles.payRow}>
              {PAYMENT_METHODS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.payChip, paymentMethod === m && styles.payChipActive]}
                  onPress={() => setPaymentMethod(m)}
                >
                  <Ionicons
                    name={m === 'card' ? 'card-outline' : 'cash-outline'}
                    size={18}
                    color={paymentMethod === m ? colors.primaryForeground : colors.mutedForeground}
                  />
                  <Text style={[styles.payText, paymentMethod === m && styles.payTextActive]}>
                    {m === 'card' ? 'Card' : 'Cash'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Note */}
          <View style={styles.section}>
            <Text style={styles.label}>Note</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="What was it for?"
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          {/* Country */}
          <View style={styles.section}>
            <Text style={styles.label}>Country (optional)</Text>
            <Pressable style={styles.input} onPress={() => setCountryOpen(true)}>
              <Text style={[styles.pickerValue, !country && { color: colors.mutedForeground }]} numberOfLines={1}>
                {country ? countryLabel(country) : 'Select a country'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
            </Pressable>
            {country ? (
              <Pressable onPress={() => setCountry('')} hitSlop={8}>
                <Text style={{ color: colors.destructive, fontSize: fontSize.sm, marginTop: spacing.sm, fontFamily: fontFamily.sans }}>
                  Clear country
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Receipt photo */}
          <View style={styles.section}>
            <Text style={styles.label}>Receipt photo (optional)</Text>
            {receiptPreview ? (
              <View style={styles.receiptRow}>
                <Image source={{ uri: receiptPreview }} style={styles.receiptThumb} />
                <View style={styles.receiptActions}>
                  <Pressable style={styles.receiptBtn} onPress={pickReceipt}>
                    <Ionicons name="refresh-outline" size={16} color={colors.primaryForeground} />
                    <Text style={styles.receiptBtnText}>Replace</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.receiptBtn, { backgroundColor: colors.destructive }]}
                    onPress={() => { setReceiptBytes(null); setReceiptPreview(null); }}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.primaryForeground} />
                    <Text style={styles.receiptBtnText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.receiptAdd} onPress={pickReceipt}>
                <Ionicons name="camera-outline" size={20} color={colors.mutedForeground} />
                <Text style={styles.receiptAddText}>Add receipt photo</Text>
              </Pressable>
            )}
            <Text style={styles.receiptHint}>Stored encrypted locally. GPS/EXIF location is never saved.</Text>
          </View>

          {/* Date + time */}
          <View style={styles.section}>
            <Text style={styles.label}>Date & time</Text>
            <View style={styles.dateTimeRow}>
              <View style={styles.dateContainer}>
                <TextInput
                  style={styles.dateInput}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
                <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} style={styles.dateIcon} />
              </View>
              <TextInput
                style={styles.timeInput}
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button label={isEdit ? 'Save changes' : 'Save expense'} disabled={!canSave} onPress={save} />
        </View>
      </View>

      {/* Country picker modal — same offline UN list as trip creation */}
      <Modal visible={countryOpen} transparent animationType="fade" onRequestClose={() => setCountryOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setCountryOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={styles.pickerTitle}>Select a country</Text>
              <Pressable onPress={() => setCountryOpen(false)}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.md }}>Done</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md, paddingVertical: spacing.md }]}
              value={countryQuery}
              onChangeText={setCountryQuery}
              placeholder="Search country"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 380 }}>
              {UN_COUNTRIES.filter(
                (c) =>
                  c.name.toLowerCase().includes(countryQuery.toLowerCase()) ||
                  c.code.toLowerCase().includes(countryQuery.toLowerCase()),
              ).map((c) => {
                const active = country.toUpperCase() === c.code;
                return (
                  <Pressable
                    key={c.code}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                    onPress={() => {
                      setCountry(c.code);
                      setCountryOpen(false);
                      setCountryQuery('');
                    }}
                  >
                    <Text style={[styles.pickerRowText, active && { color: colors.primary, fontWeight: '700' }]}>
                      {flagEmoji(c.code)} {c.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
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
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: fontSize['3xl'], fontWeight: '700', color: colors.foreground, fontFamily: fontFamily.heading },
  subtitle: { fontSize: fontSize.md, color: colors.mutedForeground, fontFamily: fontFamily.sans, marginTop: 2 },
  closeButton: { padding: spacing.xs },
  scroll: { paddingBottom: spacing.lg },
  section: { marginBottom: spacing.xl },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  label: { fontSize: fontSize.md, color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans, marginBottom: spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amountInput: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize['4xl'],
    color: colors.foreground,
    fontWeight: '600',
    fontFamily: fontFamily.sans,
  },
  currencyButton: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 88,
    justifyContent: 'center',
  },
  currencyText: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  currencyScroll: { marginTop: spacing.md },
  currencyRow: { gap: spacing.sm, paddingRight: spacing.lg },
  currencyChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  currencyChipText: { color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans },
  rateRow: { marginTop: spacing.sm, minHeight: 20 },
  rateText: { color: colors.success, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  rateError: { color: colors.destructive, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  overrideRow: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  overrideLabel: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, flex: 1 },
  overrideInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.foreground,
    width: 110,
    textAlign: 'right',
    fontFamily: fontFamily.sans,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  payRow: { flexDirection: 'row', gap: spacing.sm },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payText: { color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans },
  payTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  noteInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  dateContainer: { position: 'relative', justifyContent: 'center', flex: 1 },
  dateTimeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  timeInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    width: 110,
    fontFamily: fontFamily.sans,
  },
  dateInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    paddingRight: 50,
    fontFamily: fontFamily.sans,
  },
  dateIcon: { position: 'absolute', right: spacing.lg },
  footer: { marginTop: spacing.sm },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  receiptThumb: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.secondary },
  receiptActions: { flexDirection: 'column', gap: spacing.sm },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full },
  receiptBtnText: { color: colors.primaryForeground, fontWeight: '600', fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  receiptAdd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  receiptAddText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  receiptHint: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  overrideNote: { color: colors.success, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.md },
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
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowActive: {},
  pickerRowText: { flex: 1, color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  pickerValue: { flex: 1, fontSize: fontSize.lg, color: colors.foreground, fontFamily: fontFamily.sans },
});
