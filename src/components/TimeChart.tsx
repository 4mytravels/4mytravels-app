// TimeChart — de tijdreeks-grafiek van "Over time" als ÉÉN component.
//
// Bestaat omdat dezelfde grafiek op twee plekken staat: de volledige pagina
// (`app/stats/over-time.tsx`) en het Over time-blok op de Statistics-tab. Twee
// kopieën liepen in het verleden uiteen (zelfde klasse als `ExpenseRow` en
// `TripCard`) — de preview had een eigen mini-balkjesstrook met andere eenheden
// en zonder jaargrenzen.
//
// Eigenschappen van de grafiek:
// - De pitch volgt de BREEDTE (`plotW / rows.length`), niet een vaste balkmaat:
//   ~4 jaar maanden past zo in één scherm zonder horizontaal scrollen.
// - GEEN bedrag boven elke balk; één waarde-as (`niceAxis`, ronde stappen
//   1/2/2.5/5 × 10^n) draagt de bedragen.
// - Jaargrens-lijnen staan ONDER de grafiek in de labelrij (`labelsArea`), op de
//   kolomgrens van januari — dus bij de J en het jaartal. Niet in de plot.
// - Periodes met 0 krijgen een DOORZICHTIGE stub (rand, geen vulling) zodat
//   "niets uitgegeven" niet als "klein bedrag" leest.
// - Eén tooltip voor de hele grafiek, geclamped binnen de plot: bij een pitch van
//   ~6px kapt `overflow: hidden` een tooltip per balk af, juist bij de nieuwste
//   kolommen.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '../utils/currency';
import type { TimePeriod, TimeRow } from '../utils/timeStats';
import { colors, fontFamily, fontSize, radius, spacing } from '../theme/theme';

const AXIS_W = 38;
const TOOLTIP_W = 96;
/** Space between two bars, per granularity. */
const BAR_GAP: Record<TimePeriod, number> = { month: 3, quarter: 6, year: 12 };

function shortMonth(key: string): string {
  const [, m] = key.split('-');
  const idx = Number(m) - 1;
  const label = idx >= 0 && idx < 12 ? 'JanFebMarAprMayJunJulAugSepOctNovDec'.slice(idx * 3, idx * 3 + 3) : key;
  return label;
}

/** First letter of the month — all that fits under a ~10px column. */
function monthInitial(key: string): string {
  return shortMonth(key).charAt(0);
}

/** Axis tick text: €0 / €1k / €2.8k — short enough for the 38px gutter. */
function compactMoney(v: number): string {
  if (v <= 0) return '€0';
  if (v >= 1000) {
    const k = v / 1000;
    return `€${k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `€${Math.round(v)}`;
}

/**
 * Value axis on round steps: the smallest step of 1 / 2 / 2.5 / 5 × 10^n whose
 * top is at most 4 steps above the max. Keeps the labels readably round (€0 /
 * €1k / €2k / €3k for a €2,773 max) instead of thirds of an arbitrary top.
 */
function niceAxis(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 1 };
  for (let n = -2; n <= 8; n++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * 10 ** n;
      const steps = Math.ceil(max / step);
      if (steps <= 4) return { top: steps * step, step };
    }
  }
  return { top: max, step: max / 4 };
}

export function TimeChart({
  rows,
  period,
  /** Plot height — 170 on the full page, lower as a preview block. */
  plotH = 170,
  /** Display currency for the axis and the tooltip (values are home-currency). */
  currency = 'EUR',
}: {
  rows: TimeRow[];
  period: TimePeriod;
  plotH?: number;
  currency?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [chartW, setChartW] = useState(0);

  const max = useMemo(() => (rows.length ? Math.max(...rows.map((r) => r.value)) : 0), [rows]);
  const axisTop = useMemo(() => niceAxis(max), [max]);
  const ticks = useMemo(
    () => Array.from({ length: Math.round(axisTop.top / axisTop.step) + 1 }, (_, i) => i * axisTop.step),
    [axisTop],
  );
  const plotW = Math.max(0, chartW - AXIS_W);
  const gap = BAR_GAP[period];
  const pitch = rows.length > 0 && plotW > 0 ? plotW / rows.length : 0;
  const barW = Math.max(1, Math.min(22, pitch - gap));
  // Maandlabel volgt de KOLOMBREEDTE: bij ~6px per kolom past alleen de initiaal
  // ("J"), vanaf ~18px past de afkorting ("Jan"). De preview op de Statistics-tab
  // (12 maanden, pitch ~24px) toont dus "Jan", de volledige pagina "J".
  const wideLabels = pitch >= 18;

  const yearGroups = useMemo(() => {
    const groups: { year: string; count: number }[] = [];
    for (const r of rows) {
      const y = r.key.slice(0, 4);
      const last = groups[groups.length - 1];
      if (last && last.year === y) last.count += 1;
      else groups.push({ year: y, count: 1 });
    }
    return groups;
  }, [rows]);

  // Every column that STARTS a new year (month: "2025-01", quarter: "2025-Q1")
  // gets a marker under the chart. Year granularity needs none — one bar IS a year.
  const yearMarks = useMemo(() => {
    if (period === 'year') return [] as { year: string; i: number }[];
    const indexed = rows.map((r, i) => ({ year: r.key.slice(0, 4), i }));
    return indexed.filter((m, idx) => idx > 0 && m.year !== indexed[idx - 1].year);
  }, [rows, period]);

  // Selected column → tooltip position, clamped inside the plot.
  const selIndex = useMemo(
    () => (selected == null ? -1 : rows.findIndex((r) => r.key === selected)),
    [selected, rows],
  );
  const tipLeft =
    selIndex < 0 ? 0 : Math.max(0, Math.min(Math.max(plotW - TOOLTIP_W, 0), selIndex * pitch + pitch / 2 - TOOLTIP_W / 2));

  if (rows.length === 0) return null;

  return (
    <View style={styles.chartArea} onLayout={(e) => setChartW(e.nativeEvent.layout.width)}>
      {chartW > 0 && (
        <View style={styles.chartRow}>
          {/* Value axis — the bars are too small to carry a value label each. */}
          <View style={[styles.axis, { height: plotH }]} pointerEvents="none">
            {ticks.slice().reverse().map((t) => (
              <Text key={t} style={styles.axisLabel} numberOfLines={1}>{compactMoney(t)}</Text>
            ))}
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={[styles.plot, { height: plotH }]}>
              {ticks.map((t, i) => (
                <View
                  key={`grid-${t}`}
                  pointerEvents="none"
                  style={[
                    styles.gridLine,
                    { bottom: ((plotH - 10) / Math.max(ticks.length - 1, 1)) * i + 5 },
                    i === 0 && { opacity: 0.9 },
                  ]}
                />
              ))}
              <View style={styles.barsRow}>
                {rows.map((r) => {
                  const pct = axisTop.top > 0 ? r.value / axisTop.top : 0;
                  const isOn = selected === r.key;
                  // Een periode zonder uitgaven krijgt een DOORZICHTIGE stub
                  // met alleen een rand: een gevulde balk van 2% leest als
                  // "klein bedrag" in plaats van "niets uitgegeven".
                  const isZero = !(r.value > 0);
                  return (
                    <Pressable
                      key={r.key}
                      style={[styles.barItem, { width: pitch }]}
                      onPress={() => setSelected((p) => (p === r.key ? null : r.key))}
                      accessibilityLabel={`${r.label}: ${formatMoney(r.value, currency)}`}
                    >
                      <View
                        style={
                          isZero
                            ? [styles.barFillZero, { width: barW }]
                            : [styles.barFill, { width: barW, height: `${Math.max(pct * 100, 2)}%`, backgroundColor: isOn ? colors.accent : colors.primary }]
                        }
                      />
                    </Pressable>
                  );
                })}
              </View>
              {/* Eén tooltip voor de hele grafiek, GECLAMPT binnen de plot: een
                  tooltip per balk werd bij de eerste/laatste kolommen (6,6px
                  breed) door `overflow: hidden` afgekapt — juist bij de
                  nieuwste maanden, die het vaakst worden aangetikt. */}
              {selIndex >= 0 && (
                <View style={[styles.tooltip, { left: tipLeft, top: 0 }]} pointerEvents="none">
                  <Text style={styles.tooltipLabel}>{rows[selIndex].label}</Text>
                  <Text style={styles.tooltipValue}>{formatMoney(rows[selIndex].value, currency)}</Text>
                </View>
              )}
            </View>

            {/* De jaargrens hoort ONDER de grafiek: een 1px lijn in de labelrij,
                op de kolomgrens van januari, zodat hij bij de J en het jaartal
                staat en niet in de plot zelf. */}
            <View style={styles.labelsArea}>
              {yearMarks.map((m) => (
                <View
                  key={`ym-${m.year}`}
                  pointerEvents="none"
                  style={[styles.yearMark, { left: Math.round(m.i * pitch) }]}
                />
              ))}
              <View style={styles.labelsRow}>
                {rows.map((r) => (
                  <Text
                    key={`m-${r.key}`}
                    style={[styles.monthLabel, { width: pitch }, selected === r.key && { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {/* Jaar-balken krijgen het VOLLEDIGE jaar ("2024"), geen
                        tweecijferige afkorting ("24") — bij ~4 kolommen is er
                        ruimte zat en onder de grafiek is er geen as-context die
                        de afkorting verklaart (zelfde regel als periodLabelLong). */}
                    {period === 'month' ? (wideLabels ? shortMonth(r.key) : monthInitial(r.key)) : period === 'quarter' ? r.key.slice(-2) : r.key}
                  </Text>
                ))}
              </View>

              {period !== 'year' && (
                <View style={styles.labelsRow}>
                  {yearGroups.map((g) => (
                    <Text
                      key={`y-${g.year}`}
                      style={[styles.yearLabel, { width: pitch * g.count }]}
                      numberOfLines={1}
                    >
                      {g.year}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartArea: { marginBottom: spacing.md },
  chartRow: { flexDirection: 'row', alignItems: 'flex-start' },
  axis: { width: AXIS_W, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6 },
  axisLabel: { color: colors.mutedForeground, fontSize: 9, fontFamily: fontFamily.sans },
  plot: { overflow: 'hidden', justifyContent: 'flex-end' },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  yearMark: {
    position: 'absolute',
    top: 2,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  // Doorzichtige stub voor een periode zonder uitgaven (alleen een rand).
  barFillZero: {
    height: 4,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 1,
  },
  labelsArea: { position: 'relative' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: '100%' },
  barItem: { alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  labelsRow: { flexDirection: 'row', marginTop: 6 },
  monthLabel: {
    color: colors.mutedForeground,
    fontSize: 9,
    fontFamily: fontFamily.sans,
    textAlign: 'center',
  },
  yearLabel: {
    color: colors.mutedForeground,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: fontFamily.sans,
    textAlign: 'center',
    marginTop: 2,
  },
  tooltip: {
    position: 'absolute',
    top: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 96,
  },
  tooltipLabel: { color: colors.mutedForeground, fontSize: fontSize.xs, fontFamily: fontFamily.sans, textAlign: 'center' },
  tooltipValue: { color: colors.foreground, fontSize: fontSize.sm, fontWeight: '700', fontFamily: fontFamily.sans },
});
