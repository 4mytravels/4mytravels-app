import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { showStatus } from '../../src/utils/statusDialog';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useLocalSearchParams, router, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { WebDateButton } from '../../src/components/WebDateButton';
import { useTripStore } from '../../src/store/tripStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { saveTrip, updateTrip, loadTripCover } from '../../src/db/tripRepo';
import { tripCoverStageSize, makeCoverThumb } from '../../src/utils/image';
import { pickTripCoverBytes } from '../../src/utils/tripActions';
import { PickerSheet, PickerRow } from '../../src/components/PickerSheet';
import { UN_COUNTRIES, flagEmoji, countryName } from '../../src/data/countries';
import { CURRENCIES as SHARED_CURRENCIES } from '../../src/data/currencies';
import { colors, fontFamily, radius, fontSize, spacing, themedStyles, IMAGE_SCRIM, onImageTextShadow, tabularNums } from '../../src/theme/theme';
import { IconButton } from '../../src/components/ui';
import { inclusiveDays } from '../../src/utils/pace';
import { localNoon } from '../../src/utils/days';
import { formatMoney, formatMoneyWhole } from '../../src/utils/currency';
import {
  autoCurrency,
  budgetHint,
  budgetInputFor,
  parseBudget,
  toDailyBudget,
  type BudgetMode,
} from '../../src/utils/tripForm';
import type { Trip } from '../../src/types';
import { TRIP_ICONS, tripIcon, tripIconLabel, type TripIconName } from '../../src/utils/tripIcons';
import { AppIcon } from '../../src/components/AppIcon';

// bytesToBase64 lives in src/utils/image.ts (shared with the expense form).
import { bytesToBase64 } from '../../src/utils/image';
// Currency catalogue lives in src/data/currencies.ts (shared with the expense form).
const CURRENCIES = SHARED_CURRENCIES;
const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09-22" → "22 Sep 2026" (string based: a trip date is a calendar day). */
function dayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}
/** Local calendar day of a picked Date — never toISOString() (UTC shift, pattern 39). */
function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Currency symbol (€, ₱, $…) for the budget prefix; falls back to the code. */
function currencySymbol(code: string): string {
  const sym = formatMoney(0, code).replace(/[\d.,\s\u00a0\u202f]/g, '');
  return sym || code;
}

function CurrencyPicker({
  value,
  onSelect,
  icon = 'cash-outline',
}: {
  value: string;
  onSelect: (c: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(query.toLowerCase()) ||
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = CURRENCIES.find((c) => c.code === value);
  return (
    <>
      <Pressable style={styles.selectRow} onPress={() => setOpen(true)} accessibilityRole="button">
        <Ionicons name={icon} size={20} color={colors.primaryText} />
        <Text style={styles.selectValue} numberOfLines={1}>
          {selected ? `${value} · ${selected.name}` : value}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>
      {/* PickerSheet: backdrop and sheet are siblings (pattern 23), and a bare
          <Modal> cannot nest inside the modal route on web (pattern 21). */}
      <PickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Select currency"
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder="Search currency"
        maxListHeight={420}
      >
        {filtered.map((c) => (
          <PickerRow
            key={c.code}
            label={`${c.flag} ${c.code} — ${c.name}`}
            active={c.code === value}
            onPress={() => {
              onSelect(c.code);
              setOpen(false);
              setQuery('');
            }}
          />
        ))}
      </PickerSheet>
    </>
  );
}

/**
 * One tappable date inside the date-range row. Native: tap → the community
 * DateTimePicker dialog (fallback: a manual YYYY-MM-DD input). Web: a real
 * text field (pattern 13b) — the row's calendar icon opens the browser picker.
 */
function DatePart({
  value,
  placeholder,
  onChange,
  minimumDate,
  maximumDate,
  accessibilityLabel,
}: {
  value: string; // YYYY-MM-DD or ''
  placeholder: string;
  onChange: (ymd: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  accessibilityLabel: string;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [nativeAvailable, setNativeAvailable] = useState(!!DateTimePicker);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(draft)) onChange(draft);
    else setDraft(value);
    setEditing(false);
  };

  if (Platform.OS === 'web' || editing) {
    return (
      <TextInput
        style={[styles.dateText, styles.dateInput]}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.mutedForeground}
        autoFocus={editing}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
  const initial = value ? localNoon(value) : new Date();
  return (
    <>
      <Pressable
        hitSlop={8}
        onPress={() => (nativeAvailable ? setShow(true) : setEditing(true))}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={{ flexShrink: 1, minWidth: 0 }}
      >
        <Text style={[styles.dateText, !value && styles.dateTextPlaceholder]} numberOfLines={1}>
          {value ? dayLabel(value) : placeholder}
        </Text>
      </Pressable>
      {show && DateTimePicker && (
        <View style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}>
          <DateTimePicker
            value={isNaN(initial.getTime()) ? new Date() : initial}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_: unknown, picked?: Date) => {
              // Android: a dialog that fires with undefined when dismissed.
              setShow(false);
              if (picked) onChange(ymdOf(picked));
            }}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onError={() => {
              setNativeAvailable(false);
              setShow(false);
              setEditing(true);
            }}
          />
        </View>
      )}
    </>
  );
}

/** Trip icon: a wrapping grid of the curated set (src/utils/tripIcons.ts).
 *  Plain inline Pressables — no overlay, so no portal/z-index concerns on web. */
function TripIconGrid({ value, onChange }: { value: TripIconName; onChange: (i: TripIconName) => void }) {
  return (
    <View style={styles.iconGrid} accessibilityRole="radiogroup">
      {TRIP_ICONS.map((name) => {
        const active = name === value;
        return (
          <Pressable
            key={name}
            onPress={() => onChange(name)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Trip icon ${tripIconLabel(name)}`}
            style={[styles.iconTile, active && styles.iconTileActive]}
          >
            <AppIcon name={name} size={22} color={active ? colors.primaryText : colors.mutedForeground} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Countries as removable chips + a dashed "+ Add" chip opening the searchable picker. */
function CountryChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };
  const filtered = UN_COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <View style={styles.chipWrap}>
        {selected.map((code) => (
          <Pressable
            key={code}
            style={styles.countryChip}
            onPress={() => toggle(code)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${countryName(code)}`}
          >
            <Text style={styles.chipFlag}>{flagEmoji(code)}</Text>
            <Text style={styles.chipText} numberOfLines={1}>{countryName(code)}</Text>
            <Ionicons name="close" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
        <Pressable
          style={styles.addChip}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add country"
        >
          <Ionicons name="add" size={18} color={colors.primaryText} />
          <Text style={styles.addChipText}>Add</Text>
        </Pressable>
      </View>
      <PickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Countries visited"
        query={query}
        onQueryChange={setQuery}
        queryPlaceholder="Search country"
      >
        {filtered.map((c) => (
          <PickerRow
            key={c.code}
            label={`${flagEmoji(c.code)} ${c.name}`}
            active={selected.includes(c.code)}
            onPress={() => toggle(c.code)}
          />
        ))}
      </PickerSheet>
    </>
  );
}

/** Live preview of the trip card stage: photo (or brand gradient) + name over an SVG scrim. */
function CoverPreview({
  uri,
  name,
  onPhotoAction,
}: {
  uri: string | null;
  name: string;
  onPhotoAction: () => void;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={styles.coverStage}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
            <Defs>
              <LinearGradient id={`newTripNoPhoto${uid}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={colors.noPhoto1} />
                <Stop offset="0.55" stopColor={colors.noPhoto2} />
                <Stop offset="1" stopColor={colors.noPhoto3} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill={`url(#newTripNoPhoto${uid})`} />
          </Svg>
          <View style={styles.coverMark} pointerEvents="none">
            <Ionicons name="airplane-outline" size={40} color={colors.foreground28} />
          </View>
        </>
      )}
      {/* Bottom scrim so the name stays readable on any photo (SVG, no banding). */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id={`newTripScrim${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={IMAGE_SCRIM} stopOpacity="0" />
            <Stop offset="0.5" stopColor={IMAGE_SCRIM} stopOpacity="0.55" />
            <Stop offset="1" stopColor={IMAGE_SCRIM} stopOpacity="0.9" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="45" width="100" height="55" fill={`url(#newTripScrim${uid})`} />
      </Svg>
      <Text
        style={[styles.coverName, !name.trim() && styles.coverNamePlaceholder]}
        numberOfLines={2}
      >
        {name.trim() || 'Your trip'}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.photoPill, pressed && { backgroundColor: 'rgba(10,10,26,0.85)' }]}
        onPress={onPhotoAction}
        accessibilityRole="button"
        accessibilityLabel={uri ? 'Change or remove photo' : 'Add photo'}
      >
        <Ionicons name="camera-outline" size={16} color={colors.onImage} />
        <Text style={styles.photoPillText}>{uri ? 'Change photo' : 'Add photo'}</Text>
      </Pressable>
    </View>
  );
}

// G1: /trips/new creates a trip; editing lives at /trip/[id]/edit. The old
// deeplink /trips/new?editId=X redirects there, so bookmarks and older code
// paths keep working.
export default function NewTripScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  if (editId) return <Redirect href={`/trip/${editId}/edit`} />;
  return <TripEditor />;
}

/** Create (no editId) or edit a trip. Rendered by /trips/new and /trip/[id]/edit. */
export function TripEditor({ editId }: { editId?: string }) {
  const existing = useTripStore((s) => (editId ? s.trips.find((t) => t.id === editId) : undefined));
  const addTrip = useTripStore((s) => s.addTrip);
  const updateTripStore = useTripStore((s) => s.updateTrip);
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? ymdOf(new Date()));
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [homeCurrency, setHomeCurrency] = useState(existing?.homeCurrency ?? (useSettingsStore.getState().defaultHomeCurrency || 'EUR'));
  const [defaultCurrency, setDefaultCurrency] = useState(existing?.defaultCurrency ?? 'EUR');
  // Currency auto-fills from the FIRST country until the user picks one by
  // hand. In edit mode the stored currency is a deliberate choice: touched.
  const [currencyTouched, setCurrencyTouched] = useState(isEdit);
  const [countries, setCountries] = useState<string[]>(existing?.countries ?? []);
  const [icon, setIcon] = useState<TripIconName>(tripIcon(existing));
  // Budget: the input is per day or total; STORAGE stays a per-day number.
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('day');
  const [budgetInput, setBudgetInput] = useState(existing && existing.dailyBudget > 0 ? String(existing.dailyBudget) : '');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  // M4: the store only holds the card thumbnail, so the FULL cover is loaded
  // once for the editor preview. Saving without a new pick passes `undefined`
  // to updateTrip, which keeps the stored cover + thumbnail untouched.
  const existingId = existing?.id;
  useEffect(() => {
    if (!existingId) return;
    let alive = true;
    void loadTripCover(existingId).then((b) => {
      if (!alive || !b || b.length === 0) return;
      // Only seed the preview when the user has not picked/removed meanwhile.
      setCoverPreview((prev) => prev ?? 'data:image/jpeg;base64,' + bytesToBase64(b));
    });
    return () => {
      alive = false;
    };
  }, [existingId]);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverBytes, setCoverBytes] = useState<Uint8Array | null>(null);
  const [coverThumb, setCoverThumb] = useState<Uint8Array | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);

  // Seed the home currency from the global default (Settings) for new trips.
  // The user can still override it per trip (homeTouched).
  const defaultHomeCurrency = useSettingsStore((s) => s.defaultHomeCurrency);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const [homeTouched, setHomeTouched] = useState(false);
  useEffect(() => { void hydrateSettings(); }, [hydrateSettings]);
  useEffect(() => {
    if (!isEdit && !homeTouched && defaultHomeCurrency) setHomeCurrency(defaultHomeCurrency);
  }, [defaultHomeCurrency, isEdit, homeTouched]);

  // Country → currency autofill (first selected country).
  const autoCur = autoCurrency(countries, CURRENCY_CODES);
  useEffect(() => {
    if (!currencyTouched && autoCur) setDefaultCurrency(autoCur);
  }, [autoCur, currencyTouched]);
  const currencyAutoFilled = !currencyTouched && !!autoCur && autoCur === defaultCurrency;

  // Inclusive day count (start = day 1); null for an open-ended trip.
  const days = endDate && startDate && endDate >= startDate ? inclusiveDays(startDate, endDate) : null;
  // Total mode needs a day count; when the end date disappears, fall back to
  // per day WITHOUT changing the stored meaning (convert with the last count).
  const lastDays = useRef<number | null>(days);
  useEffect(() => {
    if (days == null && budgetMode === 'total') {
      const daily = toDailyBudget(parseBudget(budgetInput), 'total', lastDays.current);
      setBudgetMode('day');
      setBudgetInput(budgetInputFor(daily, 'day', null));
    }
    lastDays.current = days;
  }, [days, budgetMode, budgetInput]);
  const switchBudgetMode = (mode: BudgetMode) => {
    if (mode === budgetMode) return;
    if (mode === 'total' && days == null) return;
    const daily = toDailyBudget(parseBudget(budgetInput), budgetMode, days);
    setBudgetMode(mode);
    setBudgetInput(budgetInputFor(daily, mode, days));
  };
  const budgetAmount = parseBudget(budgetInput);
  const hint = budgetHint(budgetAmount, budgetMode, days, (n) =>
    budgetMode === 'day' ? formatMoneyWhole(n, homeCurrency) : formatMoney(n, homeCurrency),
  );
  const homeSymbol = useMemo(() => currencySymbol(homeCurrency), [homeCurrency]);

  // Only the name is required. A budget is optional: 0 = no budget.
  const canSave = name.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setErrorMsg(null);
    setPhase('building trip object');
    const trip: Trip = {
      id: existing?.id ?? randomUUID(),
      name: name.trim(),
      startDate,
      endDate: endDate.trim() || undefined,
      homeCurrency,
      defaultCurrency,
      dailyBudget: toDailyBudget(budgetAmount, budgetMode, days),
      countries,
      icon,
    };
    try {
      // Each phase is surfaced in the UI so a hang is visible instead of silent.
      // NOTE: no artificial timeout (pattern 16) — a SQLCipher BLOB write can
      // legitimately take >4s; racing it ABORTED the photo write before.
      const step = async (label: string, fn: () => Promise<unknown>) => {
        setPhase(label);
        return fn();
      };

      if (isEdit) {
        setPhase('updateTripStore');
        // M4: undefined = cover untouched (keeps cover + thumb in the DB and
        // the store); null = removed; bytes = replaced (with its thumbnail).
        const coverArg = coverRemoved ? null : coverBytes ?? undefined;
        updateTripStore(trip.id, {
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          homeCurrency: trip.homeCurrency,
          defaultCurrency: trip.defaultCurrency,
          dailyBudget: trip.dailyBudget,
          countries: trip.countries,
          icon: trip.icon,
          ...(coverArg === undefined
            ? {}
            : { coverThumb: coverArg ? (coverThumb ?? coverArg) : null, coverBytes: undefined }),
        });
        await step('updateTrip (DB write)', () =>
          updateTrip(trip, coverArg, undefined, coverThumb),
        );
      } else {
        setPhase('addTrip (store)');
        // Only the thumbnail goes into the store (M4); the DB row gets both.
        addTrip({ ...trip, coverThumb: coverBytes ? (coverThumb ?? coverBytes) : null } as Trip);
        await step('saveTrip (DB write)', () => saveTrip(trip, coverBytes, undefined, coverThumb));
      }
      setPhase('navigating back');
      // Web (static export): back() on a modal route can trigger a remount
      // cascade (React #310). replace() + dismiss() on the next tick.
      if (Platform.OS === 'web') {
        router.replace('/trips');
        setTimeout(() => { try { router.dismiss(); } catch { /* flat stack */ } }, 0);
      } else {
        router.back();
      }
    } catch (e) {
      console.error('saveTrip failed', e);
      const msg = (e instanceof Error ? e.message : String(e)) + `\n[phase: ${phase}]`;
      setErrorMsg(msg);
      setPhase(null);
      showStatus('Could not save trip', msg);
    } finally {
      setSaving(false);
    }
  };

  const pickCover = async () => {
    // Shared picker + processing (src/utils/tripActions.ts): the SAME 16:9
    // crop and EXIF strip as "Change photo" in the trip ⋯ menu (Q17).
    const bytes = await pickTripCoverBytes();
    if (!bytes) return;
    setCoverBytes(bytes);
    // M4: the card thumbnail is made once here, not on every card render.
    setCoverThumb(await makeCoverThumb(bytes));
    setCoverPreview('data:image/jpeg;base64,' + bytesToBase64(bytes));
    // Choosing a photo ALWAYS cancels a previous "Remove" (pattern 19).
    setCoverRemoved(false);
  };
  const removeCover = () => {
    setCoverBytes(null);
    setCoverThumb(null);
    setCoverPreview(null);
    setCoverRemoved(true);
  };

  const close = () => (Platform.OS === 'web' ? router.replace('/trips') : router.back());

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {/* Header: close × left, title centred (mockup). */}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <IconButton
              icon="close"
              label="Close"
              variant="plain"
              size={26}
              color={colors.foreground}
              onPress={close}
            />
          </View>
          <Text style={styles.title} numberOfLines={1}>{isEdit ? 'Edit trip' : 'New trip'}</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <CoverPreview
            uri={coverPreview}
            name={name}
            onPhotoAction={() => (coverPreview ? setPhotoSheet(true) : void pickCover())}
          />
          <Text style={styles.coverHint}>Stored encrypted locally. GPS/EXIF location is never saved.</Text>

          <Field label="Trip name">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Japan in autumn"
              placeholderTextColor={colors.mutedForeground}
            />
          </Field>

          {/* Dates in one row: icon · start → end · inclusive day-count pill. */}
          <View style={[styles.dateRow, { marginBottom: spacing.xl }]}>
            {Platform.OS === 'web' ? (
              <WebDateButton value={startDate} onChange={setStartDate} />
            ) : (
              <Ionicons name="calendar-outline" size={22} color={colors.primaryText} />
            )}
            <View style={styles.dateParts}>
              <DatePart
                value={startDate}
                placeholder="Start date"
                onChange={setStartDate}
                maximumDate={endDate ? localNoon(endDate) : undefined}
                accessibilityLabel="Start date"
              />
              <Ionicons name="arrow-forward" size={16} color={colors.primaryText} style={{ flexShrink: 0 }} />
              <DatePart
                value={endDate}
                placeholder="Add end date"
                onChange={setEndDate}
                minimumDate={startDate ? localNoon(startDate) : undefined}
                accessibilityLabel="End date"
              />
            </View>
            {days != null && (
              <View style={styles.daysPill}>
                <Text style={styles.daysPillText}>{days} {days === 1 ? 'day' : 'days'}</Text>
              </View>
            )}
            {Platform.OS !== 'web' && endDate ? (
              <IconButton
                icon="close-circle"
                label="Clear end date"
                variant="plain"
                size={18}
                color={colors.mutedForeground}
                onPress={() => setEndDate('')}
              />
            ) : null}
          </View>

          <Field label="Countries">
            <CountryChips selected={countries} onChange={setCountries} />
          </Field>

          <Field label="Currency">
            <CurrencyPicker
              value={defaultCurrency}
              onSelect={(c) => { setCurrencyTouched(true); setDefaultCurrency(c); }}
            />
            <Text style={styles.coverHint}>
              {currencyAutoFilled ? 'Auto-filled from country' : 'Pre-filled when you add an expense.'}
            </Text>
          </Field>

          <Field label="Budget">
            <View style={styles.segment}>
              {(['day', 'total'] as const).map((m) => {
                const active = budgetMode === m;
                const disabled = m === 'total' && days == null;
                return (
                  <Pressable
                    key={m}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                    onPress={() => switchBudgetMode(m)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled }}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive,
                        disabled && styles.segmentTextDisabled,
                      ]}
                    >
                      {m === 'day' ? 'Per day' : 'Total'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.input, styles.budgetInputRow]}>
              <Text style={styles.budgetSymbol}>{homeSymbol}</Text>
              <TextInput
                style={styles.budgetInput}
                value={budgetInput}
                onChangeText={setBudgetInput}
                keyboardType="decimal-pad"
                placeholder="No budget"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel={budgetMode === 'day' ? 'Budget per day' : 'Total budget'}
              />
            </View>
            <Text style={styles.coverHint}>
              {days == null
                ? 'Add an end date to enter a total budget.'
                : hint ?? 'Leave empty for no budget.'}
            </Text>
          </Field>

          <Field label="Icon">
            <TripIconGrid value={icon} onChange={setIcon} />
            <Text style={styles.coverHint}>Shown next to the trip in filters.</Text>
          </Field>

          {/* Per-trip home currency override (default from Settings). */}
          <Field label="Home currency">
            <CurrencyPicker
              value={homeCurrency}
              icon="home-outline"
              onSelect={(c) => { setHomeTouched(true); setHomeCurrency(c); }}
            />
            <Text style={styles.coverHint}>
              Totals for this trip are converted to this currency. Default from Settings ({defaultHomeCurrency || 'EUR'}).
            </Text>
          </Field>
        </ScrollView>

        {/* Sticky footer — outside the ScrollView, so it rides above the
            keyboard (KeyboardAvoidingView) and the bottom inset (SafeAreaView). */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              (!canSave || saving) && styles.ctaDisabled,
              pressed && canSave && !saving && { opacity: 0.88 },
            ]}
            onPress={save}
            disabled={!canSave || saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave || saving, busy: saving }}
          >
            <Ionicons
              name="checkmark"
              size={22}
              color={!canSave || saving ? colors.mutedForeground : colors.ctaForeground}
            />
            <Text style={[styles.ctaText, (!canSave || saving) && styles.ctaTextDisabled]}>
              {saving ? 'Saving…' : isEdit ? 'Update trip' : 'Create trip'}
            </Text>
          </Pressable>
          {errorMsg ? (
            <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.red12, borderRadius: radius.lg }}>
              <Text style={{ color: colors.destructive, fontSize: fontSize.sm, fontFamily: fontFamily.sans }}>{errorMsg}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    {/* Photo actions: replacing never requires removing first (pattern 19). */}
    <PickerSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title="Trip photo">
      <PickerRow
        label="Choose another photo"
        icon="images-outline"
        active={false}
        onPress={() => { setPhotoSheet(false); void pickCover(); }}
      />
      <PickerRow
        label="Remove photo"
        icon="trash-outline"
        active={false}
        onPress={() => { setPhotoSheet(false); removeCover(); }}
      />
    </PickerSheet>
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

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.white20, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  headerSide: { width: 44, alignItems: 'flex-start' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: colors.foreground,
    fontFamily: fontFamily.heading,
  },
  scroll: { paddingBottom: spacing.lg },
  label: { fontSize: fontSize.md, color: colors.foreground, fontWeight: '600', fontFamily: fontFamily.sans, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    fontSize: fontSize.lg,
    color: colors.foreground,
    fontFamily: fontFamily.sans,
  },
  // Cover preview — the trip card stage (shared 16:9 tripCoverStageSize).
  coverStage: {
    ...tripCoverStageSize,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'flex-end',
  },
  coverMark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coverName: {
    color: colors.onImage,
    fontFamily: fontFamily.heading,
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    ...onImageTextShadow,
  },
  coverNamePlaceholder: { color: colors.onImageMuted },
  photoPill: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(10,10,26,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  photoPillText: { color: colors.onImage, fontSize: fontSize.sm, fontWeight: '600', fontFamily: fontFamily.sans },
  coverHint: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, marginTop: spacing.sm, marginBottom: spacing.sm },
  // Date range row.
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  dateParts: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateText: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans, fontWeight: '600', ...tabularNums },
  dateTextPlaceholder: { color: colors.primaryText, fontWeight: '500' },
  // Web / fallback: a real text field (pattern 13a/b — minWidth 0 to shrink).
  dateInput: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  daysPill: {
    flexShrink: 0,
    backgroundColor: colors.primary12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  daysPillText: { color: colors.primaryText, fontSize: fontSize.sm, fontWeight: '700', fontFamily: fontFamily.sans, ...tabularNums },
  // Trip icon grid.
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconTileActive: { backgroundColor: colors.primary12, borderColor: colors.primaryBorder },
  // Country chips.
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    minHeight: 40,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  chipFlag: { fontSize: fontSize.lg },
  chipText: { color: colors.foreground, fontSize: fontSize.md, fontFamily: fontFamily.sans, flexShrink: 1 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
  },
  addChipText: { color: colors.primaryText, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  // Select row (currency).
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.secondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  selectValue: { flex: 1, minWidth: 0, color: colors.foreground, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  // Budget segmented control.
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
    marginBottom: spacing.md,
  },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: radius.full },
  segmentItemActive: { backgroundColor: colors.primarySolid },
  segmentText: { color: colors.mutedForeground, fontSize: fontSize.md, fontWeight: '600', fontFamily: fontFamily.sans },
  segmentTextActive: { color: colors.primaryForeground },
  segmentTextDisabled: { opacity: 0.55 },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 0, minHeight: 56 },
  budgetSymbol: { color: colors.mutedForeground, fontSize: fontSize.lg, fontFamily: fontFamily.sans, fontWeight: '600' },
  budgetInput: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: fontSize.lg,
    fontFamily: fontFamily.sans,
    paddingVertical: spacing.lg,
    ...tabularNums,
  },
  // Orange sticky CTA.
  footer: { paddingTop: spacing.md },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.full,
    backgroundColor: colors.cta,
    borderWidth: 1,
    borderColor: colors.cta,
  },
  // Disabled: readable outline + muted text, no opacity fade.
  ctaDisabled: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  ctaText: { color: colors.ctaForeground, fontSize: fontSize.lg, fontWeight: '700', fontFamily: fontFamily.heading },
  ctaTextDisabled: { color: colors.mutedForeground },
}));
