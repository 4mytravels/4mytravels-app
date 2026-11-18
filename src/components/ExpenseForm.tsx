// Add/edit-expense bottom sheet — matches the Lovable "Add expense" design
// (dark theme, large amount input, currency pill, category grid, save button).
// Builds a full Expense with a Frankfurter rate snapshot at entry time (§2.2).
// Supports edit mode (initialExpense) and a manual rate override (acceptance §2.5).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { confirmDestructive } from '../utils/confirm';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { processPhoto } from '../utils/image';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';
import { UN_COUNTRIES, flagEmoji, countryLabel } from '../data/countries';
import { CURRENCIES as SHARED_CURRENCIES, currencyInfo } from '../data/currencies';
import { SheetPortal } from './SheetPortal';
import { PickerSheet, PickerRow } from './PickerSheet';
import { WebDateButton } from './WebDateButton';
import {
  colors,
  fontFamily,
  radius,
  fontSize,
  spacing,
  themedStyles,
} from '../theme/theme';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type Expense,
  type PaymentMethod,
} from '../types';
import { allocateSplit } from '../utils/pace';
import { localDateTimeISO, localNoon, localTimeHM } from '../utils/days';
import { Button } from './ui';
import { categoryColor, categoryIcon } from '../utils/categoryIcons';
import { categoriesByUsage, visibleCategories } from '../utils/categoryOrder';
import { formatMoney } from '../utils/currency';
import { useExpenseStore } from '../store/expenseStore';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { getRate } from '../services/frankfurter';
import { useSettingsStore, getManualRate } from '../store/settingsStore';
import { randomUUID } from 'expo-crypto';

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
  tripName,
  onSave,
  onDelete,
  onClose,
}: {
  tripId: string;
  defaultCurrency: string;
  homeCurrency: string; // ISO 4217, the trip's home currency
  initialExpense?: Expense;
  /** Shown as a chip so the user sees which trip the expense is filed under (Q15). */
  tripName?: string;
  onSave: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  onClose?: () => void;
}) {
  const isEdit = !!initialExpense;
  // Android/OEM keyboards (Samsung) and mobile-web virtual keyboards do not
  // resize the Modal window reliably, so the currency/country sheets are padded
  // by the measured keyboard height on both platforms.
  const keyboardHeight = useKeyboardHeight();
  const sheetKeyboardPad =
    Platform.OS !== 'ios' && keyboardHeight > 0 ? { paddingBottom: spacing.xl + keyboardHeight } : null;
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
    // Local noon from components — see localNoon() (offset-less ISO parsing
    // differs between the native engine and the web engine).
    const d = localNoon(current);
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
      ? // LOCAL wall-clock time. `.slice(11, 16)` read the UTC time-of-day, so an
        // expense saved at 20:15 in UTC+2 came back as "18:15" and every re-save
        // pushed it further away from when it actually happened.
        localTimeHM(initialExpense.createdAt)
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
  // Q15: a new expense starts on the LAST category used (most logs repeat the
  // previous one, e.g. coffee after coffee) instead of always 'Food'.
  // Stored app-wide in app_settings; only applied while the user has not
  // touched the grid yet.
  const categoryTouchedRef = useRef(false);
  useEffect(() => {
    if (initialExpense) return;
    let alive = true;
    (async () => {
      try {
        const db = (await import('../db/index')).getStorageAdapter();
        const rows = await db.query<{ value: string }>(
          'SELECT value FROM app_settings WHERE key = ?',
          ['last_category'],
        );
        const v = rows[0]?.value as ExpenseCategory | undefined;
        if (alive && v && (EXPENSE_CATEGORIES as readonly string[]).includes(v) && !categoryTouchedRef.current) {
          setCategory(v);
        }
      } catch {
        // no remembered category
      }
    })();
    return () => { alive = false; };
  }, [initialExpense]);
  const pickCategory = useCallback((c: ExpenseCategory) => {
    categoryTouchedRef.current = true;
    setCategory(c);
  }, []);
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
      // Resize to ≤2000px (aspect preserved) / ≤500KB + strip ALL EXIF/GPS bytes
      // via JPEG re-encode (§2.2 image cap + true EXIF strip). The picker's own
      // dimensions are passed so we skip an extra full-image decode pass (which
      // is what made "add receipt" take seconds before).
      const bytes = await processPhoto(res.assets[0].base64, {
        width: res.assets[0].width,
        height: res.assets[0].height,
      });
      const b64 = bytesToBase64(bytes);
      setReceiptBytes(bytes);
      setReceiptPreview('data:image/jpeg;base64,' + b64);
    }
  };
  const [rate, setRate] = useState<number | null>(initialExpense ? initialExpense.rateToHome : null);
  const [rateError, setRateError] = useState<string | null>(null);
  // Where the shown rate came from — rendered in the hero's rate line so the
  // user can tell an exact manual rate from a stale cached one.
  const [rateSource, setRateSource] = useState<string | null>(null);

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
      setRateSource('manual');
      return;
    }
    if (currency === homeCurrency) {
      setRate(1);
      setRateError(null);
      setRateSource(null);
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
          setRateSource(cache?.date ? `ECB, cached ${cache.date}` : 'ECB, cached');
          return;
        }
        const lastKnown = await useSettingsStore.getState().getLastKnownRate(currency, homeCurrency);
        if (!cancelled && lastKnown && lastKnown > 0) {
          setRate(lastKnown);
          setRateError(null);
          setRateSource('last used');
        } else if (!cancelled) {
          setRateSource(null);
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
  }, [currency, date, homeCurrency, manualOverride, isEdit]);

  const amountNum = parseFloat(amount) || 0;
  const homeAmount = rate != null ? amountNum * rate : null;

  const save = () => {
    // Guard: reject Infinity, NaN, negative, and zero amounts
    if (!Number.isFinite(amountNum) || amountNum <= 0) return;
    // Sub-minute part of createdAt: on EDIT carry the original instant's seconds/ms
    // so the row keeps its position among same-minute neighbours; on a NEW expense
    // take them from the clock so two entries in the same minute still order by
    // entry order (a hard-coded :00.000 made them tie and sort by random uuid).
    const keptSubMinute = (): [number, number] => {
      const prev = isEdit && initialExpense?.createdAt ? Date.parse(initialExpense.createdAt) : NaN;
      if (Number.isNaN(prev)) {
        const n = new Date();
        return [n.getSeconds(), n.getMilliseconds()];
      }
      const d = new Date(prev);
      return [d.getSeconds(), d.getMilliseconds()];
    };
    // Multi-day split only when the end date is a real later date.
    const split =
      endDate && endDate > date
        ? { splitStart: date, splitEnd: endDate }
        : undefined;
    const expense: Expense = {
      id: initialExpense?.id ?? randomUUID(),
      tripId,
      amount: amountNum,
      currency,
      // Snapshot stored at entry time so later refreshes don't rewrite history (§2.2).
      rateToHome: rate ?? 0,
      rateDate: date,
      category,
      // Timezone-aware: the chosen date + the LOCAL time-of-day ON THIS DEVICE,
      // normalised to UTC ISO (§2.1).
      //
      // Built from numeric components on purpose. `new Date(`${date}T${time}:00`)`
      // leaves the offset to the engine, and the native build (Hermes) resolved it
      // against the server's zone instead of the phone's — the saved instant was
      // then off by the device's UTC offset, so the row sorted and bucketed like
      // an entry from a different time (see localDateTimeISO in utils/days.ts).
      //
      // On EDIT the timestamp is REBUILT from the chosen date + time. Keeping
      // `initialExpense.createdAt` pinned the entry to its ORIGINAL day: moving an
      // expense to another date saved the new rateDate but left createdAt on the
      // old day, and groupByDay/groupByDaySplitAware bucket by createdAt — so the
      // Expenses tab still showed it under the old day.
      //
      // Seconds/ms: on edit they are carried over from the original instant so the
      // row does not jump relative to same-minute neighbours; on a new expense they
      // come from the clock so two entries in the SAME minute keep entry order
      // (the old hard-coded :00.000 made those rows tie and sort by random uuid).
      createdAt: localDateTimeISO(date, time, ...keptSubMinute()),
      country: country.trim() || undefined,
      paymentMethod,
      notes: note.trim() || undefined,
      receiptPhoto: receiptBytes,
      multiDaySplit: split,
    };
    // Q15: remember the category for the next new expense.
    void (async () => {
      try {
        const db = (await import('../db/index')).getStorageAdapter();
        await db.exec('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', ['last_category', category]);
      } catch {
        // non-fatal
      }
    })();
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

  const canSave = Number.isFinite(amountNum) && amountNum > 0;

  // Category grid: most used first (counted from the shared expense store),
  // 11 tiles + "More…". The selected category always occupies a visible slot.
  const allExpenses = useExpenseStore((s) => s.expenses);
  const orderedCategories = useMemo(
    () => categoriesByUsage(allExpenses, EXPENSE_CATEGORIES),
    [allExpenses],
  );
  const gridCategories = visibleCategories(orderedCategories, category, 11);
  const [moreCatsOpen, setMoreCatsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  // Hero rate line. Rate shown as "<currency> per 1 <home>" (how ECB quotes it).
  const ratePerHome = rate && rate > 0 ? 1 / rate : null;
  const rateLabel =
    currency === homeCurrency
      ? null
      : ratePerHome != null
        ? `rate ${ratePerHome.toLocaleString('en-US', { maximumFractionDigits: ratePerHome >= 100 ? 2 : 4 })}${
            isEdit ? ' (locked to entry date)' : rateSource ? ` (${rateSource})` : ''
          }`
        : null;
  const heroLine =
    amountNum > 0 && homeAmount != null && currency !== homeCurrency
      ? [`≈ ${formatMoney(homeAmount, homeCurrency)}`, rateLabel].filter(Boolean).join(' · ')
      : rateLabel
        ? `1 ${homeCurrency} = ${ratePerHome!.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${currency}${
            isEdit ? ' (locked to entry date)' : rateSource ? ` (${rateSource})` : ''
          }`
        : null;

  // Sticky footer: lifted above the keyboard on Android + web (iOS uses the
  // KeyboardAvoidingView padding). Insets come from the SafeAreaView edges.
  const footerKeyboardPad = Platform.OS !== 'ios' && keyboardHeight > 0 ? { marginBottom: keyboardHeight } : null;
  const pickersOpen = showCurrencies || countryOpen || moreCatsOpen;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          {/* side slots of equal width keep the title optically centred */}
          <View style={styles.headerSide} />
          <Text style={styles.title} numberOfLines={1}>{isEdit ? 'Edit expense' : 'Add expense'}</Text>
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            {onClose && (
              <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        </View>
        {/* Q15: which trip this expense is filed under. */}
        {tripName ? (
          <View style={styles.tripChip} accessibilityLabel={`Trip: ${tripName}`}>
            <Ionicons name="airplane-outline" size={14} color={colors.primaryText} />
            <Text style={styles.tripChipText} numberOfLines={1}>{tripName}</Text>
          </View>
        ) : null}

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount hero */}
          <View style={styles.hero}>
            <TextInput
              style={styles.amountHero}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={colors.white35}
              autoFocus={!isEdit}
              textAlign="center"
              accessibilityLabel="Amount"
            />
            <Pressable style={styles.currencyChip} onPress={() => setShowCurrencies(true)} accessibilityLabel="Currency">
              <Text style={styles.currencyText}>
                {currencyInfo(currency).flag ? currencyInfo(currency).flag + ' ' : ''}
                {currency}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
            </Pressable>
            <View style={styles.rateRow}>
              {heroLine ? (
                <Text style={styles.rateText} numberOfLines={2}>{heroLine}</Text>
              ) : rateError && !isEdit ? (
                <Text style={styles.rateText}>{rateError}</Text>
              ) : null}
            </View>
          </View>
          {/* Currency selection (search). Siblings backdrop/sheet — pattern 23. */}
          <PickerSheet
            visible={showCurrencies}
            onClose={() => setShowCurrencies(false)}
            title="Select currency"
            query={currencyQuery}
            onQueryChange={(v) => { setCurrencyQuery(v); }}
            queryPlaceholder="Search currency"
            maxListHeight={380}
          >
            {SHARED_CURRENCIES.filter(
              (c) =>
                c.code.toLowerCase().includes(currencyQuery.toLowerCase()) ||
                c.name.toLowerCase().includes(currencyQuery.toLowerCase()),
            ).map((c) => (
              <PickerRow
                key={c.code}
                label={`${c.flag} ${c.code} — ${c.name}`}
                active={currency === c.code}
                onPress={() => {
                  setCurrency(c.code);
                  setShowCurrencies(false);
                  setCurrencyQuery('');
                }}
              />
            ))}
          </PickerSheet>

          {/* Category grid — 4 columns, 11 tiles + More… */}
          <View style={styles.catGrid}>
            {chunk<ExpenseCategory | 'more'>([...gridCategories, 'more'], 4).map((row, ri) => (
              <View key={ri} style={styles.catRow}>
                {row.map((cat) => {
                  const isMore = cat === 'more';
                  const sel = !isMore && category === cat;
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.catTile, sel && styles.catTileActive]}
                      onPress={() => (isMore ? setMoreCatsOpen(true) : pickCategory(cat))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={isMore ? 'More categories' : cat}
                    >
                      <View style={[styles.catCircle, { backgroundColor: isMore ? colors.surfaceStrong : categoryColor(cat) }]}>
                        <Ionicons
                          name={isMore ? 'ellipsis-horizontal' : categoryIcon(cat)}
                          size={16}
                          color={isMore ? colors.mutedForeground : '#FFFFFF'}
                        />
                      </View>
                      <Text style={[styles.catLabel, sel && styles.catLabelActive]} numberOfLines={1}>
                        {isMore ? 'More…' : cat}
                      </Text>
                    </Pressable>
                  );
                })}
                {/* keep tile widths equal on a short last row */}
                {Array.from({ length: 4 - row.length }).map((_, i) => (
                  <View key={`pad${i}`} style={[styles.catTile, { borderColor: 'transparent' }]} />
                ))}
              </View>
            ))}
          </View>
          <PickerSheet visible={moreCatsOpen} onClose={() => setMoreCatsOpen(false)} title="All categories">
            {orderedCategories.map((c) => (
              <PickerRow
                key={c}
                label={c}
                icon={categoryIcon(c)}
                active={category === c}
                onPress={() => {
                  pickCategory(c);
                  setMoreCatsOpen(false);
                }}
              />
            ))}
          </PickerSheet>

          {/* Compact detail rows */}
          <View style={styles.list}>
            {/* Payment — tap toggles card/cash */}
            <Pressable
              style={styles.listRow}
              onPress={() => setPaymentMethod((m) => (m === 'card' ? 'cash' : 'card'))}
              accessibilityRole="button"
              accessibilityLabel={`Payment: ${paymentMethod}. Tap to switch.`}
            >
              <Text style={styles.listLabel}>Payment</Text>
              <View style={styles.listValueWrap}>
                <Ionicons name={paymentMethod === 'card' ? 'card-outline' : 'cash-outline'} size={16} color={colors.foreground} />
                <Text style={styles.listValue}>{paymentMethod === 'card' ? 'Card' : 'Cash'}</Text>
                <Ionicons name="swap-horizontal" size={16} color={colors.mutedForeground} />
              </View>
            </Pressable>

            {/* Country */}
            <Pressable style={styles.listRow} onPress={() => setCountryOpen(true)} accessibilityRole="button">
              <Text style={styles.listLabel}>Country</Text>
              <View style={styles.listValueWrap}>
                <Text style={[styles.listValue, !country && styles.listPlaceholder]} numberOfLines={1}>
                  {country ? countryLabel(country) : 'Select'}
                </Text>
                {country ? (
                  <Pressable hitSlop={8} onPress={() => setCountry('')} accessibilityLabel="Clear country">
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </View>
            </Pressable>

            {/* Date + time. Text fields stay real inputs on BOTH platforms
                (pattern 13b); the calendar trigger sits beside them. */}
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>Date</Text>
              <View style={styles.listValueWrap}>
                <TextInput
                  style={[styles.inlineInput, { width: 104 }]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  accessibilityLabel="Date"
                />
                <TextInput
                  style={[styles.inlineInput, { width: 52 }]}
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="Time"
                />
                {Platform.OS === 'web' ? (
                  <WebDateButton value={date} onChange={setDate} />
                ) : (
                  <Pressable hitSlop={8} onPress={() => openDatePicker('date')} accessibilityLabel="Pick date">
                    <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Multi-day split */}
            {splitOpen || endDate ? (
              <View style={[styles.listRow, styles.listRowColumn]}>
                <View style={styles.listRowInner}>
                  <Text style={styles.listLabel}>Spread until</Text>
                  <View style={styles.listValueWrap}>
                    <TextInput
                      style={[styles.inlineInput, { width: 104 }]}
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Spread until"
                    />
                    {Platform.OS === 'web' ? (
                      <WebDateButton value={endDate} onChange={setEndDate} />
                    ) : (
                      <Pressable hitSlop={8} onPress={() => openDatePicker('end')} accessibilityLabel="Pick end date">
                        <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                    <Pressable hitSlop={8} onPress={() => { setEndDate(''); setSplitOpen(false); }} accessibilityLabel="Remove split">
                      <Ionicons name="close-circle" size={16} color={colors.destructive} />
                    </Pressable>
                  </View>
                </View>
                {endDate && endDate > date ? (() => {
                  const perDay = allocateSplit(amountNum, date, endDate);
                  return (
                    <Text style={styles.splitHint}>
                      {perDay.days} days · ≈ {perDay.perDay.toFixed(2)} per day{perDay.finalDayExtra ? ` (+${perDay.finalDayExtra.toFixed(2)} last day)` : ''}
                    </Text>
                  );
                })() : null}
              </View>
            ) : (
              <Pressable style={styles.listRow} onPress={() => setSplitOpen(true)} accessibilityRole="button">
                <Text style={styles.listLabel}>Spread over days</Text>
                <View style={styles.listValueWrap}>
                  <Text style={[styles.listValue, styles.listPlaceholder]}>Off</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </View>
              </Pressable>
            )}

            {/* Note — collapsed shows the value, tap expands an inline field */}
            {noteOpen ? (
              <View style={[styles.listRow, styles.listRowColumn]}>
                <Text style={styles.listLabel}>Note</Text>
                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="What was it for?"
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  onBlur={() => setNoteOpen(false)}
                  accessibilityLabel="Note"
                />
              </View>
            ) : (
              <Pressable style={styles.listRow} onPress={() => setNoteOpen(true)} accessibilityRole="button">
                <Text style={styles.listLabel}>Note</Text>
                <View style={styles.listValueWrap}>
                  <Text style={[styles.listValue, !note && styles.listPlaceholder]} numberOfLines={1}>
                    {note || 'Add'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </View>
              </Pressable>
            )}

            {/* Receipt */}
            <View style={[styles.listRow, styles.listRowLast]}>
              <Text style={styles.listLabel}>Receipt</Text>
              {receiptPreview ? (
                <View style={styles.listValueWrap}>
                  <Pressable onPress={() => setReceiptViewerOpen(true)} accessibilityLabel="View receipt">
                    <Image source={{ uri: receiptPreview }} style={styles.receiptThumb} />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => { void pickReceipt(); }} accessibilityLabel="Replace receipt">
                    <Ionicons name="refresh-outline" size={18} color={colors.mutedForeground} />
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={() => { setReceiptBytes(null); setReceiptPreview(null); }}
                    accessibilityLabel="Remove receipt"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.listValueWrap} onPress={() => { void pickReceipt(); }} accessibilityRole="button">
                  <Ionicons name="camera-outline" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.listValue, styles.listPlaceholder]}>Add photo</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>
          <Text style={styles.receiptHint}>Receipts are stored encrypted on this device. GPS/EXIF is never saved.</Text>

          {/* Edit: Delete lives in the scroll area so the sticky footer stays one
              button high; hidden while a picker is open (pattern 12). */}
          {isEdit && onDelete && initialExpense && !pickersOpen && (
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label="Delete expense"
                icon="trash-outline"
                variant="ghost"
                onPress={async () => {
                  // Alert.alert is a no-op on web — confirmDestructive renders on both.
                  const ok = await confirmDestructive({
                    title: 'Delete expense',
                    message: `${initialExpense.notes || initialExpense.category} — ${initialExpense.amount} ${initialExpense.currency}?`,
                  });
                  if (ok) onDelete(initialExpense);
                }}
              />
            </View>
          )}
        </ScrollView>

        {/* Sticky save — always above the keyboard and the bottom inset. */}
        <View style={[styles.footer, footerKeyboardPad]}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              !canSave && styles.saveButtonDisabled,
              pressed && canSave && { opacity: 0.85 },
            ]}
            disabled={!canSave}
            onPress={save}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
          >
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
              {isEdit ? 'Save changes' : 'Save expense'}
            </Text>
          </Pressable>
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
      <SheetPortal visible={receiptViewerOpen} onRequestClose={() => setReceiptViewerOpen(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setReceiptViewerOpen(false)}>
          <Image source={{ uri: receiptPreview ?? undefined }} style={styles.viewerImage} resizeMode="contain" />
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={24} color={colors.white} />
          </View>
        </Pressable>
      </SheetPortal>

      {/* Country picker — PickerSheet: siblings, so the search field is tappable. */}
      <PickerSheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        title="Select a country"
        query={countryQuery}
        onQueryChange={setCountryQuery}
        queryPlaceholder="Search country"
      >
        {UN_COUNTRIES.filter(
          (c) =>
            c.name.toLowerCase().includes(countryQuery.toLowerCase()) ||
            c.code.toLowerCase().includes(countryQuery.toLowerCase()),
        ).map((c) => (
          <PickerRow
            key={c.code}
            label={`${flagEmoji(c.code)} ${c.name}`}
            active={country.toUpperCase() === c.code}
            onPress={() => {
              setCountry(c.code);
              setCountryOpen(false);
              setCountryQuery('');
            }}
          />
        ))}
      </PickerSheet>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdropSoft },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    marginTop: 0,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.white20,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  headerSide: { width: 40 },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.xl, fontWeight: '700', color: colors.foreground, fontFamily: fontFamily.heading },
  hero: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  amountHero: {
    alignSelf: 'stretch',
    minWidth: 0,
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '700',
    color: colors.foreground,
    fontFamily: fontFamily.heading,
    paddingVertical: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
  },
  catGrid: { gap: spacing.sm, marginBottom: spacing.xl },
  catRow: { flexDirection: 'row', gap: spacing.sm },
  catTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  catTileActive: { backgroundColor: colors.primary12, borderColor: colors.primaryBorder },
  catCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: fontSize.xs, color: colors.mutedForeground, fontFamily: fontFamily.sans, maxWidth: '100%' },
  catLabelActive: { color: colors.foreground, fontWeight: '600' },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listRowColumn: { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center' },
  listRowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  listRowLast: {},
  listLabel: { fontSize: fontSize.md, color: colors.mutedForeground, fontFamily: fontFamily.sans, flexShrink: 0 },
  listValueWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1, minWidth: 0, justifyContent: 'flex-end' },
  listValue: { fontSize: fontSize.md, color: colors.foreground, fontFamily: fontFamily.sans, flexShrink: 1, textAlign: 'right' },
  listPlaceholder: { color: colors.mutedForeground },
  inlineInput: {
    minWidth: 0,
    flexShrink: 0,
    paddingVertical: 4,
    fontSize: fontSize.md,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
    textAlign: 'right',
  },
  saveButton: {
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySolid,
    borderWidth: 1,
    borderColor: colors.primarySolid,
  },
  saveButtonDisabled: { backgroundColor: 'transparent', borderColor: colors.primaryBorder },
  saveText: { color: colors.primaryForeground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.sans },
  saveTextDisabled: { color: colors.mutedForeground },
  subtitle: { fontSize: fontSize.md, color: colors.mutedForeground, fontFamily: fontFamily.sans, marginTop: 2 },
  tripChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.primary12, borderWidth: 1, borderColor: colors.primaryBorder, maxWidth: '100%' },
  tripChipText: { fontSize: fontSize.sm, color: colors.primaryText, fontFamily: fontFamily.sans, fontWeight: '600', flexShrink: 1 },
  closeButton: { padding: spacing.xs },
  scroll: { paddingBottom: spacing.lg },
  section: { marginBottom: spacing.xl },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  label: { fontSize: fontSize.md, color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans, marginBottom: spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginBottom: spacing.md,
  },
  detailsToggleText: { color: colors.primaryText, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  detailsSummary: {
    flex: 1,
    textAlign: 'right',
    color: colors.mutedForeground,
    fontSize: fontSize.sm,
    fontFamily: fontFamily.sans,
  },
  amountInput: {
    flex: 1,
    // Web: react-native-web renders this as <input>, a flex item with
    // min-width:auto, so it refuses to shrink below its intrinsic width and
    // pushes the currency button off the right edge on narrow viewports.
    minWidth: 0,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 88,
    justifyContent: 'center',
  },
  currencyText: { color: colors.foreground, fontSize: fontSize.lg, fontWeight: '600', fontFamily: fontFamily.sans },
  currencyScroll: { marginTop: spacing.md },
  currencyRow: { gap: spacing.sm, paddingRight: spacing.lg },
  rateRow: { marginTop: spacing.sm, minHeight: 20 },
  rateText: { color: colors.mutedForeground, fontSize: fontSize.sm, fontFamily: fontFamily.sans, textAlign: 'center' },
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
  payChipActive: { backgroundColor: colors.primarySolid, borderColor: colors.primary },
  payText: { color: colors.mutedForeground, fontWeight: '500', fontFamily: fontFamily.sans },
  payTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  noteInput: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    paddingLeft: spacing.xl,
  },
  dateTimeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  timeInput: {
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
    minWidth: 0,
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
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySolid, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full },
  receiptBtnText: { color: colors.primaryForeground, fontWeight: '600', fontSize: fontSize.sm, fontFamily: fontFamily.sans },
  receiptAdd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  receiptAddText: { color: colors.mutedForeground, fontSize: fontSize.md, fontFamily: fontFamily.sans },
  receiptHint: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.sm },
  overrideNote: { color: colors.success, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.md },
  pickerBackdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  webPickerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.backdrop,
    justifyContent: 'flex-end',
  },
  webPickerSheet: {
    width: '100%',
    maxHeight: '85%',
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    padding: spacing.xl,
  },
  pickerKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
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
    borderColor: colors.borderStrong,
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
  viewerBackdrop: { flex: 1, backgroundColor: colors.backdropStrong, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '90%' },
  viewerClose: { position: 'absolute', top: 48, right: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white15, alignItems: 'center', justifyContent: 'center' },
  splitHint: { color: colors.mutedForeground, fontSize: fontSize.sm, marginTop: spacing.sm, fontFamily: fontFamily.sans },
}));