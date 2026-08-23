import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  LineChart,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MarketMoverRow } from '@/components/market-mover-row';
import { Metric } from '@/components/metric';
import { PriceHistoryChart } from '@/components/price-history-chart';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import {
  formatCurrency,
  formatPercent,
  getMarketOverview,
  getVariantHistory,
  type MarketCondition,
  type MarketMover,
  type MarketPeriod,
} from '@/lib/api';

const periods: { key: MarketPeriod; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
];

const conditions: { key: MarketCondition; short: string }[] = [
  { key: 'Near Mint', short: 'NM' },
  { key: 'Lightly Played', short: 'LP' },
  { key: 'Moderately Played', short: 'MP' },
  { key: 'Heavily Played', short: 'HP' },
  { key: 'Damaged', short: 'DMG' },
];

export default function MarketScreen() {
  const width = useHydratedWidth();
  const desktop = width >= 980;
  const abbreviateConditions = width < 620;
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const [condition, setCondition] = useState<MarketCondition>('Near Mint');
  const [selectedVariantID, setSelectedVariantID] = useState('');

  const overviewQuery = useQuery({
    queryKey: ['market', 'overview', period, condition],
    queryFn: ({ signal }) => getMarketOverview({ period, condition, signal }),
    placeholderData: keepPreviousData,
  });
  const overview = overviewQuery.data;
  const movers = overview ? [...overview.gainers, ...overview.losers] : [];
  const activeVariantID = movers.some((mover) => mover.variantId === selectedVariantID)
    ? selectedVariantID
    : (movers[0]?.variantId ?? '');

  const historyQuery = useQuery({
    queryKey: ['market', 'history', activeVariantID, period],
    queryFn: ({ signal }) => getVariantHistory(activeVariantID, period, signal),
    enabled: activeVariantID !== '',
    placeholderData: keepPreviousData,
  });
  const history = historyQuery.data;

  const changeCondition = (next: MarketCondition) => {
    setCondition(next);
    setSelectedVariantID('');
  };

  return (
    <Screen
      title="Market"
      subtitle="Condition-specific movement across collected legacy sets and printings."
      toolbar={<PeriodControl period={period} onChange={setPeriod} />}>
      <View accessibilityRole="tablist" style={styles.conditions}>
        {conditions.map((option) => {
          const selected = option.key === condition;
          return (
            <Pressable
              accessibilityLabel={option.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={option.key}
              onPress={() => changeCondition(option.key)}
              style={[styles.condition, selected && styles.conditionSelected]}>
              <Text style={[styles.conditionText, selected && styles.conditionTextSelected]}>
                {abbreviateConditions ? option.short : option.key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {overviewQuery.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>Calculating market movement</Text>
        </View>
      ) : overviewQuery.isError || !overview ? (
        <EmptyState
          message="The price service could not calculate this market range."
          title="Market data unavailable"
        />
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric
              icon={<CalendarDays color={colors.brass} size={18} />}
              label="Market date"
              note={`${overview.summary.evaluatedVariants} fresh variants`}
              value={formatMarketDate(overview.summary.asOf)}
            />
            <Metric
              icon={<ArrowUpRight color={colors.positive} size={18} />}
              label="Rising"
              note={`${overview.summary.unchangedVariants} unchanged`}
              value={String(overview.summary.risingVariants)}
            />
            <Metric
              icon={<ArrowDownRight color={colors.negative} size={18} />}
              label="Falling"
              note={periodLabel(period)}
              value={String(overview.summary.fallingVariants)}
            />
            <Metric
              icon={<Activity color={colors.burgundy} size={18} />}
              label="Median move"
              note={condition}
              value={formatPercent(overview.summary.medianChangePercent)}
            />
          </View>

          <View style={styles.chartPanel}>
            <View
              style={[
                styles.chartHeader,
                abbreviateConditions && styles.chartHeaderCompact,
              ]}>
              <View style={styles.chartHeading}>
                <View style={styles.sectionTitleRow}>
                  <LineChart color={colors.brand} size={18} />
                  <Text style={styles.sectionTitle}>Price history</Text>
                  {history && history.signal !== 'regular' ? (
                    <View style={styles.historySignal}>
                      <AlertTriangle color={colors.warning} size={13} />
                      <Text style={styles.historySignalText}>
                        {history.signal === 'volatile' ? 'High volatility' : 'Limited history'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {history ? (
                  <>
                    <Text style={styles.chartTitle}>{history.cardName}</Text>
                    <Text style={styles.chartMeta}>
                      {history.setName} / {history.printing} / {history.condition}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.chartMeta}>Select a market row</Text>
                )}
              </View>
              {history ? (
                <View
                  style={[
                    styles.chartValue,
                    abbreviateConditions && styles.chartValueCompact,
                  ]}>
                  <Text style={styles.currentPrice}>{formatCurrency(history.endPrice)}</Text>
                  <Text
                    style={[
                      styles.historyChange,
                      {
                        color:
                          (history.changePercent ?? 0) >= 0
                            ? colors.positive
                            : colors.negative,
                      },
                    ]}>
                    {formatPercent(history.changePercent)}
                  </Text>
                  <Text style={styles.observationCount}>{history.points.length} observations</Text>
                </View>
              ) : null}
            </View>
            {historyQuery.isFetching || !history ? (
              <View style={styles.chartLoading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : (
              <PriceHistoryChart points={history.points} />
            )}
          </View>

          <View style={styles.setSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Activity color={colors.brass} size={18} />
                <Text style={styles.sectionTitle}>Set performance</Text>
              </View>
              <Text style={styles.sectionNote}>
                {condition} basket / {periodLabel(period)}
              </Text>
            </View>
            <View style={styles.setList}>
              {overview.sets.map((set) => {
                const rising = set.changePercent >= 0;
                return (
                  <View key={set.setId} style={styles.setRow}>
                    <View style={styles.setCopy}>
                      <Text style={styles.setName}>{set.setName}</Text>
                      <Text style={styles.setMeta}>{set.variantCount} fresh printings</Text>
                    </View>
                    <View style={styles.setValue}>
                      <Text style={styles.setTotal}>{formatCurrency(set.endValue)}</Text>
                      <Text style={styles.setPrevious}>from {formatCurrency(set.startValue)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.setChange,
                        { color: rising ? colors.positive : colors.negative },
                      ]}>
                      {formatPercent(set.changePercent)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={[styles.moverColumns, !desktop && styles.moverColumnsCompact]}>
            <MoverSection
              accent={colors.positive}
              icon={<ArrowUpRight color={colors.positive} size={19} />}
              movers={overview.gainers}
              onSelect={setSelectedVariantID}
              selectedVariantID={activeVariantID}
              title="Rising"
            />
            <MoverSection
              accent={colors.negative}
              icon={<ArrowDownRight color={colors.negative} size={19} />}
              movers={overview.losers}
              onSelect={setSelectedVariantID}
              selectedVariantID={activeVariantID}
              title="Falling"
            />
          </View>
        </>
      )}
    </Screen>
  );
}

type PeriodControlProps = {
  period: MarketPeriod;
  onChange: (period: MarketPeriod) => void;
};

function PeriodControl({ period, onChange }: PeriodControlProps) {
  return (
    <View accessibilityRole="tablist" style={styles.periods}>
      {periods.map((option) => {
        const selected = option.key === period;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.period, selected && styles.periodSelected]}>
            <Text style={[styles.periodText, selected && styles.periodTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type MoverSectionProps = {
  accent: string;
  icon: ReactNode;
  movers: MarketMover[];
  onSelect: (variantID: string) => void;
  selectedVariantID: string;
  title: string;
};

function MoverSection({
  accent,
  icon,
  movers,
  onSelect,
  selectedVariantID,
  title,
}: MoverSectionProps) {
  return (
    <View style={styles.moverSection}>
      <View style={styles.moverHeader}>
        <View style={styles.sectionTitleRow}>
          {icon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Text style={[styles.moverCount, { color: accent }]}>{movers.length} shown</Text>
      </View>
      <View style={styles.moverList}>
        {movers.map((mover) => (
          <MarketMoverRow
            key={mover.variantId}
            mover={mover}
            onPress={() => onSelect(mover.variantId)}
            selected={selectedVariantID === mover.variantId}
          />
        ))}
      </View>
    </View>
  );
}

function periodLabel(period: MarketPeriod): string {
  return {
    '1d': 'Past day',
    '1w': 'Past week',
    '1m': 'Past month',
    '1y': 'Past year',
    all: 'All history',
  }[period];
}

function formatMarketDate(value: string): string {
  if (!value) return 'No data';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}

const styles = StyleSheet.create({
  periods: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    padding: 3,
  },
  period: {
    alignItems: 'center',
    borderRadius: 4,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 42,
    paddingHorizontal: 9,
  },
  periodSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  periodText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  periodTextSelected: {
    color: colors.text,
  },
  conditions: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    marginBottom: spacing.md,
    padding: 3,
    width: '100%',
  },
  condition: {
    alignItems: 'center',
    borderRadius: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  conditionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  conditionText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  conditionTextSelected: {
    color: colors.brand,
  },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 320,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chartPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: spacing.md,
    overflow: 'hidden',
    padding: spacing.md,
  },
  chartHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  chartHeaderCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  chartHeading: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  historySignal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  historySignalText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chartTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  chartMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chartValue: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  chartValueCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  currentPrice: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  historyChange: {
    fontSize: 14,
    fontWeight: '800',
  },
  observationCount: {
    color: colors.textMuted,
    fontSize: 10,
  },
  chartLoading: {
    alignItems: 'center',
    height: 250,
    justifyContent: 'center',
  },
  setSection: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionNote: {
    color: colors.textMuted,
    fontSize: 11,
  },
  setList: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  setRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  setCopy: {
    flex: 1,
    minWidth: 0,
  },
  setName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  setMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  setValue: {
    alignItems: 'flex-end',
  },
  setTotal: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  setPrevious: {
    color: colors.textMuted,
    fontSize: 10,
  },
  setChange: {
    fontSize: 14,
    fontWeight: '800',
    minWidth: 72,
    textAlign: 'right',
  },
  moverColumns: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  moverColumnsCompact: {
    flexDirection: 'column',
  },
  moverSection: {
    flex: 1,
    minWidth: 0,
  },
  moverHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  moverCount: {
    fontSize: 11,
    fontWeight: '800',
  },
  moverList: {
    gap: spacing.sm,
  },
});
