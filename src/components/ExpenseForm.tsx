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
  Platform,
  Keyboard,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { processPhoto } from '../utils/image';
import { UN_COUNTRIES, flagEmoji, countryLabel } from '../data/countries';
import { CURRENCIES as SHARED_CURRENCIES, currencyInfo } from '../data/currencies';
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
import { allocateSplit } from '../utils/pace';
import { CategoryChip, Button } from './ui';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { getRate } from '../services/frankfurter';
import { useSettingsStore, getManualRate } from '../store/settingsStore';
import { v4 as uuid } from 'uuid';

// base64 helpers (React Native exposes atob/btoa globally)
// Split an array into fixed-size rows (category grid: 3 per row).
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

const PAYMENT_METHODS: PaymentMethod[] = ['card', 'cash'];

export function ExpenseForm({
  tripId,
  defaultCurrency,
  homeCurrency,
  initialExpense,
  onSave,
  onDelete,
  onClose,
}: {
  tripId: string;
  defaultCurrency: string;
  homeCurrency: string; // ISO 4217, the trip's home currency
  initialExpense?: Expense;
  onSave: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  onClose?: () => void;
}) {
  const isEdit = !!initialExpense;
  const [amount, setAmount] = useState(initialExpense ? String(initialExpense.amount) : '');
  const [currency, setCurrency] = useState(initialExpense?.currency ?? defaultCurrency);
  const [category, setCategory] = useState<ExpenseCategory>(initialExpense?.category ?? 'Food');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialExpense?.paymentMethod ?? 'card',
  );
  const [note, setNote] = useState(initialExpense?.notes ?? '');
  const [date, setDate] = useState(initialExpense?.rateDate ?? (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })());
  // Multi-day split (optional): when an end date is set, the amount is spread
  // evenly across [date … endDate] in budget statistics (§2.2 allocateSplit).
  const [endDate, setEndDate] = useState(initialExpense?.multiDaySplit?.splitEnd ?? '');
  const [splitOpen, setSplitOpen] = useState(false);
  // Native date pickers (calendar icon buttons). 'date' = start date,
  // 'end' = multi-day split end date.
  // The picker's initial Date is pinned in STATE at open time: passing a fresh
  // Date each render makes the Android picker reset (and fire onChange) to
  // today whenever any unrelated re-render happens (e.g. the rate fetch
  // resolving ~1s later) — that was the "snaps back to today" bug.
  const [datePickerFor, setDatePickerFor] = useState<'date' | 'end' | null>(null);
  const [pickerInitial, setPickerInitial] = useState<Date>(new Date());
  const openDatePicker = (which: 'date' | 'end') => {
    const current = which === 'end' ? endDate || date : date;
    const t = Date.parse(`${current}T12:00:00`);
    const d = Number.isNaN(t) ? new Date() : new Date(t);
    d.setHours(12, 0, 0, 0);
    if (Platform.OS === 'android') {
      // Imperative API: the dialog is presented once and is immune to
      // re-renders of this component (the declarative <DateTimePicker> re-opened
      // on every render because onChange is an inline function, resetting the
      // picked date ~1s later when the rate fetch resolved).
      DateTimePickerAndroid.open({
        value: d,
        mode: 'date',
        is24Hour: true,
        onValueChange: (_e, selected) => {
          if (!selected) return;
          const iso = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(
            selected.getDate(),
          ).padStart(2, '0')}`;
          if (which === 'end') setEndDate(iso);
          else setDate(iso);
        },
      });
      return;
    }
    setPickerInitial(d);
    setDatePickerFor(which);
  };
  const [time, setTime] = useState(
    initialExpense
      ? (initialExpense.createdAt || new Date().toISOString()).slice(11, 16)
      : (() => {
          const d = new Date();
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        })(),
  );
  const [country, setCountry] = useState(initialExpense?.country ?? '');
  // Remembered default: the last country used on THIS trip (per-trip memory,
  // stored in app_settings). Falls back to '' until the user picks one.
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [rememberedCountry, setRememberedCountry] = useState('');
  useEffect(() => {
    if (initialExpense) return; // edit mode keeps its own value
    let alive = true;
    (async () => {
      try {
        const db = (await import('../db/index')).getStorageAdapter();
        const rows = await db.query<{ key: string; value: string }>(
          "SELECT value FROM app_settings WHERE key = ?",
          [`last_country:${tripId}`],
        );
        if (alive && rows[0]?.value) {
          setRememberedCountry(rows[0].value);
          setCountry((cur) => cur || rows[0].value);
        }
      } catch {
        // table missing or adapter not ready — no remembered default
      }
    })();
    return () => { alive = false; };
  }, [tripId, initialExpense]);
  const [currencyQuery, setCurrencyQuery] = useState('');
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
  // Fullscreen receipt viewer (tap the thumbnail to open).
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);

  const pickReceipt = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      // Resize to ≤2000px / ≤500KB + strip ALL EXIF/GPS bytes via JPEG
      // re-encode (§2.2 image cap + true EXIF strip, was a follow-up).
      const bytes = await processPhoto(res.assets[0].base64);
      const b64 = bytesToBase64(bytes);
      setReceiptBytes(bytes);
      setReceiptPreview('data:image/jpeg;base64,' + b64);
    }
  };
  const [rate, setRate] = useState<number | null>(initialExpense ? initialExpense.rateToHome : null);
  const [rateError, setRateError] = useState<string | null>(null);

  // Track the on-screen keyboard height so the Save footer can sit ABOVE the
  // keyboard (instead of behind it) without shifting the whole sheet — this
  // avoids the KeyboardAvoidingView lag while keeping Save always tappable.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const show = (e: { endCoordinates?: { height?: number } }) =>
      setKbHeight(e.endCoordinates?.height ?? 0);
    const hide = () => setKbHeight(0);
    const subShow = Keyboard.addListener('keyboardDidShow', show as never);
    const subHide = Keyboard.addListener('keyboardDidHide', hide as never);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  // Rate resolution order (instant-only at open, per user request):
  //   1. Manual override (Settings) — exact, no waiting.
  //   2. Cached ECB rates (app_settings) — instant local read, source of truth.
  //      The cache is EUR-based. We resolve quote→home via EUR even when the
  //      exact home currency is missing from the cache; the result is still
  //      better than nothing for yesterday/last week.
  //   3. If no cache exists at all, reuse the last known rate for this pair
  //      from `lastKnownRates` in settingsStore. This makes the form fully
  //      usable offline for ANY currency pair that was used before.
  //   4. Only then show a soft note ("No cached rate yet") without blocking.
  // The form NEVER blocks on a live fetch when opening. Background refresh is
  // handled globally by useBackgroundRateRefresh in _layout.tsx.
  useEffect(() => {
    if (isEdit) return; // keep the original rateToHome; do not touch
    if (manualOverride != null) {
      setRate(manualOverride);
      setRateError(null);
      return;
    }
    if (currency === homeCurrency) {
      setRate(1);
      setRateError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { loadRateCache } = await import('../services/rateCache');
        const { useSettingsStore } = await import('../../src/store/settingsStore');
        const cache = await loadRateCache(homeCurrency);
        const quoteRate = cache?.rates[currency];
        if (!cancelled && quoteRate && quoteRate > 0) {
          setRate(1 / quoteRate);
          setRateError(null);
          return;
        }
        const lastKnown = await useSettingsStore.getState().getLastKnownRate(currency, homeCurrency);
        if (!cancelled && lastKnown && lastKnown > 0) {
          setRate(lastKnown);
          setRateError(null);
        } else if (!cancelled) {
          setRate(null);
          setRateError('No cached rate yet');
        }
      } catch {
        if (!cancelled) {
          setRate(null);
          setRateError('No cached rate yet');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency, date, homeCurrency, manualOverride]);

  const amountNum = parseFloat(amount) || 0;
  const homeAmount = rate != null ? amountNum * rate : null;

  const save = () => {
    if (amountNum <= 0) return; // require a valid amount; rate can be absent
    // Multi-day split only when the end date is a real later date.
    const split =
      endDate && endDate > date
        ? { splitStart: date, splitEnd: endDate }
        : undefined;
    const expense: Expense = {
      id: initialExpense?.id ?? uuid(),
      tripId,
      amount: amountNum,
      currency,
      // Snapshot stored at entry time so later refreshes don't rewrite history (§2.2).
      rateToHome: rate ?? 0,
      rateDate: date,
      category,
      // Timezone-aware: combine the chosen date + local time-of-day on the device,
      // then normalize to UTC ISO (§2.1).
      createdAt: initialExpense?.createdAt ?? new Date(`${date}T${time}:00`).toISOString(),
      country: country.trim() || undefined,
      paymentMethod,
      notes: note.trim() || undefined,
      receiptPhoto: receiptBytes,
      multiDaySplit: split,
    };
    // Remember the country per trip so the next expense starts pre-filled.
    if (country.trim()) {
      void (async () => {
        try {
          const db = (await import('../db/index')).getStorageAdapter();
          await db.exec(
            'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
            [`last_country:${tripId}`, country.trim()],
          );
          setRememberedCountry(country.trim());
        } catch {
          // non-fatal
        }
      })();
    }
    // Persist this rate as a last-known offline fallback for this currency pair.
    if (rate && rate > 0 && currency !== homeCurrency) {
      void (async () => {
        try {
          const { useSettingsStore } = await import('../../src/store/settingsStore');
          const { setLastKnownRate } = useSettingsStore.getState();
          await setLastKnownRate(currency, homeCurrency, rate);
        } catch {
          // non-fatal
        }
      })();
    }
    onSave(expense);
  };

  const canSave = amountNum > 0;

  return (
    <View style={styles.container}>
      <View style={styles.backdrop} />
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
              <Text style={styles.label}>Currency</Text>
            </View>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.35)"
              />
              <Pressable style={styles.currencyButton} onPress={() => setShowCurrencies(true)}>
                <Text style={styles.currencyText}>
                  {currencyInfo(currency).flag ? currencyInfo(currency).flag + ' ' : ''}
                  {currency}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
              </Pressable>
            </View>
            {/* Currency selection modal — same shared list as New Trip */}
            <Modal visible={showCurrencies} transparent animationType="fade" onRequestClose={() => setShowCurrencies(false)}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setShowCurrencies(false)}>
                <Pressable style={styles.pickerSheet} onPress={() => {}}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                    <Text style={styles.pickerTitle}>Select currency</Text>
                    <Pressable onPress={() => setShowCurrencies(false)}>
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.md }}>Done</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={[styles.input, { marginBottom: spacing.md, paddingVertical: spacing.md }]}
                    value={currencyQuery}
                    onChangeText={setCurrencyQuery}
                    placeholder="Search currency"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                  />
                  <ScrollView style={{ maxHeight: 380 }}>
                    {SHARED_CURRENCIES.filter(
                      (c) =>
                        c.code.toLowerCase().includes(currencyQuery.toLowerCase()) ||
                        c.name.toLowerCase().includes(currencyQuery.toLowerCase()),
                    ).map((c) => {
                      const active = currency === c.code;
                      return (
                        <Pressable
                          key={c.code}
                          style={[styles.pickerRow, active && styles.pickerRowActive]}
                          onPress={() => {
                            setCurrency(c.code);
                            setShowCurrencies(false);
                            setCurrencyQuery('');
                          }}
                        >
                          <Text style={[styles.pickerRowText, active && { color: colors.primary, fontWeight: '700' }]}>
                            {c.flag} {c.code} — {c.name}
                          </Text>
                          {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>
            {/* rate line */}
            <View style={styles.rateRow}>
              {isEdit ? (
                <Text style={styles.rateLocked}>Rate locked to entry date — not changed on edit.</Text>
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

          {/* Category grid — 3 per row (last row holds the remainder) */}
          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {chunk(
                [
                  ...EXPENSE_CATEGORIES.filter((c) => c !== 'Accommodation'),
                  'Accommodation' as ExpenseCategory, // last → gets the wider final cell
                ],
                3,
              ).map((row, ri) => (
                <View key={ri} style={styles.categoryRow}>
                  {row.map((cat) => (
                    <CategoryChip
                      key={cat}
                      category={cat}
                      selected={category === cat}
                      onSelect={setCategory}
                      stretch
                    />
                  ))}
                </View>
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

          {/* Country — same full-width input style as the other fields */}
          <View style={styles.section}>
            <Text style={styles.label}>Country</Text>
            <Pressable style={styles.input} onPress={() => setCountryOpen(true)}>
              <Text style={[styles.pickerValue, !country && { color: colors.mutedForeground }]} numberOfLines={1}>
                {country ? countryLabel(country) : 'Select a country'}
              </Text>
              {country ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => setCountry('')}
                  style={{ paddingHorizontal: spacing.xs }}
                >
                  <Ionicons name="close-circle" size={20} color={colors.destructive} />
                </Pressable>
              ) : null}
              <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Receipt photo */}
          <View style={styles.section}>
            <Text style={styles.label}>Receipt photo (optional)</Text>
            {receiptPreview ? (
              <View style={styles.receiptRow}>
                {/* tap thumbnail → fullscreen viewer */}
                <Pressable onPress={() => setReceiptViewerOpen(true)}>
                  <Image source={{ uri: receiptPreview }} style={styles.receiptThumb} />
                </Pressable>
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

          {/* Date + time (+ optional multi-day split) */}
          <View style={styles.section}>
            <Text style={styles.label}>Date & time</Text>
            <View style={styles.dateTimeRow}>
              {/* Date field: type directly, or tap the calendar icon for the picker.
                  The input is NOT wrapped in the Pressable so typing isn't hijacked. */}
              <View style={styles.dateContainer}>
                <TextInput
                  style={styles.dateInput}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
                <Pressable hitSlop={8} onPress={() => openDatePicker('date')}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={colors.mutedForeground}
                    style={{ paddingHorizontal: spacing.lg }}
                  />
                </Pressable>
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

            {/* Multi-day split: spread this amount across a date range */}
            {splitOpen || endDate ? (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.label}>Spread until (end date)</Text>
                <View style={styles.dateContainer}>
                  <TextInput
                    style={styles.dateInput}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Pressable hitSlop={8} onPress={() => openDatePicker('end')}>
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color={colors.mutedForeground}
                      style={{ paddingHorizontal: spacing.lg }}
                    />
                  </Pressable>
                </View>
                {(() => {
                  if (!endDate || endDate <= date) return null;
                  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(date).getTime()) / 86_400_000) + 1);
                  const perDay = allocateSplit(amountNum, date, endDate);
                  return (
                    <Text style={styles.splitHint}>
                      {perDay.days} days · ≈ {perDay.perDay.toFixed(2)} per day{perDay.finalDayExtra ? ` (+${perDay.finalDayExtra.toFixed(2)} last day)` : ''}
                    </Text>
                  );
                })()}
                <Pressable onPress={() => { setEndDate(''); setSplitOpen(false); }} hitSlop={8}>
                  <Text style={{ color: colors.destructive, fontSize: fontSize.sm, marginTop: spacing.sm, fontFamily: fontFamily.sans }}>
                    Remove split (single day)
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setSplitOpen(true)} hitSlop={8}>
                <Text style={styles.splitHint}>+ Spread over multiple days</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, kbHeight > 0 && { paddingBottom: kbHeight + spacing.lg }]}>
          <Button label={isEdit ? 'Save changes' : 'Save expense'} disabled={!canSave} onPress={save} />
          {isEdit && onDelete && initialExpense && !showCurrencies && !countryOpen && (
            <View style={{ marginTop: spacing.md }}>
              <Button
                label="Delete expense"
                icon="trash-outline"
                variant="ghost"
                onPress={() => {
                  Alert.alert(
                    'Delete expense',
                    `${initialExpense.notes || initialExpense.category} — ${initialExpense.amount} ${initialExpense.currency}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => onDelete(initialExpense),
                      },
                    ],
                  );
                }}
              />
            </View>
          )}
        </View>
      </View>

      {/* Native date picker — opened via the calendar icon next to a date field */}
      {datePickerFor !== null && (
        <DateTimePicker
          value={pickerInitial}
          mode="date"
          display="default"
          onChange={(_e, selected) => {
            // Android fires once and unmounts; iOS needs an explicit dismiss.
            if (Platform.OS === 'android') setDatePickerFor(null);
            if (!selected) return;
            const iso = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
            if (datePickerFor === 'end') setEndDate(iso);
            else setDate(iso);
          }}
        />
      )}

      {/* Fullscreen receipt viewer */}
      <Modal visible={receiptViewerOpen} transparent animationType="fade" onRequestClose={() => setReceiptViewerOpen(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setReceiptViewerOpen(false)}>
          <Image source={{ uri: receiptPreview ?? undefined }} style={styles.viewerImage} resizeMode="contain" />
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </View>
        </Pressable>
      </Modal>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
  rateLocked: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans },
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
  categoryGrid: { gap: spacing.sm },
  categoryRow: { flexDirection: 'row', gap: spacing.sm },
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  dateContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    paddingLeft: spacing.xl,
  },
  dateTimeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  timeInput: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    width: 110,
    fontFamily: fontFamily.sans,
  },
  dateInput: {
    flex: 1,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  footer: {
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    // Stops the white flicker when the keyboard opens/closes: the footer would
    // otherwise briefly expose the (white) Android window behind the sheet.
    paddingTop: spacing.sm,
  },
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerValue: { flex: 1, fontSize: fontSize.lg, color: colors.foreground, fontFamily: fontFamily.sans },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '90%' },
  viewerClose: { position: 'absolute', top: 48, right: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  splitHint: { color: colors.mutedForeground, fontSize: fontSize.sm, marginTop: spacing.sm, fontFamily: fontFamily.sans },
});