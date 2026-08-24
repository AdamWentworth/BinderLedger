import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { AlertTriangle, Layers3, LineChart, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarketPeriodControl } from '@/components/market-period-control';
import { PriceHistoryChart } from '@/components/price-history-chart';
import { WatchButton } from '@/components/watch-button';
import { colors, spacing } from '@/constants/theme';
import { useWatchlistSetMembership } from '@/hooks/use-watchlist-membership';
import { useCatalogPreferences } from '@/providers/catalog-preferences';
import {
  type CatalogSet,
  formatCurrency,
  formatPercent,
  getSetPricing,
  type MarketCondition,
  type MarketPeriod,
  resolveImageURL,
  type SetPriceCard,
} from '@/lib/api';

const conditions: { key: MarketCondition; label: string }[] = [
  { key: 'Near Mint', label: 'NM' },
  { key: 'Lightly Played', label: 'LP' },
  { key: 'Moderately Played', label: 'MP' },
  { key: 'Heavily Played', label: 'HP' },
  { key: 'Damaged', label: 'DMG' },
];

type SetSort = 'number' | 'high' | 'low';

type SetDetailModalProps = {
  set: CatalogSet | null;
  onClose: () => void;
};

export function SetDetailModal({ set, onClose }: SetDetailModalProps) {
  if (!set) return null;
  return <SetDetailContent key={set.id} onClose={onClose} set={set} />;
}

function SetDetailContent({ set, onClose }: { set: CatalogSet; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const { condition, setCondition } = useCatalogPreferences();
  const compact = width < 700;
  const [edition, setEdition] = useState(defaultEdition(set.editions));
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const [sort, setSort] = useState<SetSort>('number');
  const watchlist = useWatchlistSetMembership({ setId: set.id, edition });

  const pricingQuery = useQuery({
    queryKey: ['catalog', 'set-pricing', set.id, edition, condition, period],
    queryFn: ({ signal }) =>
      getSetPricing({ setId: set.id, edition, condition, period, signal }),
  });
  const pricing = pricingQuery.data;
  const cards = useMemo(() => sortCards(pricing?.cards ?? [], sort), [pricing?.cards, sort]);
  const startPrice = pricing?.points[0]?.price ?? null;
  const endPrice = pricing?.points.at(-1)?.price ?? null;
  const changePercent =
    startPrice !== null && endPrice !== null && startPrice > 0
      ? ((endPrice - startPrice) / startPrice) * 100
      : null;
  const hasTrustedHistory = (pricing?.points.length ?? 0) > 0;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <SafeAreaView style={[styles.overlay, compact && styles.overlayCompact]}>
        <View style={[styles.dialog, compact && styles.dialogCompact]}>
          <View style={styles.modalHeader}>
            <View style={styles.headerIdentity}>
              {set.symbolUrl ? (
                <Image contentFit="contain" source={set.symbolUrl} style={styles.headerSymbol} />
              ) : (
                <Layers3 color={colors.brass} size={24} />
              )}
              <View style={styles.headerCopy}>
                <Text numberOfLines={2} style={styles.setName}>
                  {set.name}
                </Text>
                <Text style={styles.setMeta}>
                  {set.cardCount} cards{set.releaseDate ? ` / Released ${formatDate(set.releaseDate)}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <WatchButton
                disabled={edition === ''}
                error={watchlist.error}
                loading={watchlist.loading}
                noun="set"
                onPress={watchlist.toggle}
                watched={watchlist.watched}
              />
              <Pressable
                accessibilityLabel="Close set details"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}>
                <X color={colors.text} size={21} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={[styles.setOverview, compact && styles.setOverviewCompact]}>
              <View style={styles.logoFrame}>
                {set.logoUrl ? (
                  <Image contentFit="contain" source={set.logoUrl} style={styles.logo} />
                ) : (
                  <Layers3 color={colors.textMuted} size={44} />
                )}
              </View>
              <View style={styles.controls}>
                <ControlGroup label="Edition">
                  <SegmentedControl
                    onChange={setEdition}
                    options={set.editions.map((value) => ({ label: value, value }))}
                    selected={edition}
                  />
                </ControlGroup>
                <ControlGroup label="Condition">
                  <SegmentedControl
                    onChange={(value) => setCondition(value as MarketCondition)}
                    options={conditions.map((option) => ({
                      accessibilityLabel: option.key,
                      label: option.label,
                      value: option.key,
                    }))}
                    selected={condition}
                  />
                </ControlGroup>
                <ControlGroup label="History">
                  <MarketPeriodControl onChange={setPeriod} period={period} />
                </ControlGroup>
              </View>
            </View>

            {pricingQuery.isPending ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brand} size="large" />
                <Text style={styles.loadingText}>Calculating the set</Text>
              </View>
            ) : pricingQuery.isError || !pricing ? (
              <View style={styles.loading}>
                <AlertTriangle color={colors.warning} size={26} />
                <Text style={styles.loadingText}>Set pricing is unavailable.</Text>
              </View>
            ) : (
              <>
                <View style={styles.summaryStrip}>
                  <SummaryValue
                    label="Collection value"
                    note={`${pricing.summary.currentCards} current / ${pricing.summary.historicalCards} historical / ${pricing.summary.estimatedCards} estimated`}
                    value={formatCurrency(pricing.summary.totalValue)}
                  />
                  <SummaryValue
                    label="Average card"
                    note={condition}
                    value={formatCurrency(pricing.summary.averagePrice)}
                  />
                  <SummaryValue
                    label="Highest card"
                    note={`Low ${formatCurrency(pricing.summary.minimumPrice)}`}
                    value={formatCurrency(pricing.summary.maximumPrice)}
                  />
                  <SummaryValue
                    accent={changePercent === null || changePercent >= 0 ? colors.positive : colors.negative}
                    label={hasTrustedHistory ? periodLabel(period) : 'Available prices'}
                    note={hasTrustedHistory ? `${pricing.points.length} daily values` : 'No complete market snapshot'}
                    value={hasTrustedHistory
                      ? formatPercent(changePercent)
                      : `${pricing.summary.pricedCards}/${pricing.summary.cardCount}`}
                  />
                </View>

                {pricing.summary.historicalCards > 0 ||
                pricing.summary.estimatedCards > 0 ||
                pricing.summary.warningCards > 0 ||
                pricing.summary.unavailableCards > 0 ? (
                  <View style={styles.coverageNotice}>
                    <AlertTriangle color={colors.warning} size={16} />
                    <Text style={styles.coverageText}>
                      {pricing.summary.historicalCards > 0
                        ? `${pricing.summary.historicalCards} cards use an older provider snapshot. `
                        : ''}
                      {pricing.summary.estimatedCards > 0
                        ? `${pricing.summary.estimatedCards} cards use an exact-printing ungraded estimate in current totals and sorting, but not in history. `
                        : ''}
                      {pricing.summary.warningCards > 0
                        ? `${pricing.summary.warningCards} cards have condition prices that conflict or are incomplete. `
                        : ''}
                      {pricing.summary.unavailableCards > 0
                        ? `${pricing.summary.unavailableCards} cards have no usable price and are excluded.`
                        : ''}
                    </Text>
                  </View>
                ) : null}

                {hasTrustedHistory ? (
                  <View style={styles.chartSection}>
                    <View style={[styles.sectionHeader, compact && styles.sectionHeaderCompact]}>
                      <View style={styles.sectionTitleRow}>
                        <LineChart color={colors.brand} size={18} />
                        <View>
                          <Text style={styles.sectionTitle}>Collection history</Text>
                          <Text style={styles.sectionMeta}>
                            {edition} / {condition}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.chartValue}>{formatCurrency(endPrice)}</Text>
                    </View>
                    <PriceHistoryChart points={pricing.points} />
                  </View>
                ) : null}

                <View style={styles.cardSection}>
                  <View style={[styles.cardHeader, compact && styles.cardHeaderCompact]}>
                    <View>
                      <Text style={styles.sectionTitle}>Cards in this collection</Text>
                      <Text style={styles.sectionMeta}>{cards.length} cards / {edition} / {condition}</Text>
                    </View>
                    <View style={styles.sortWrap}>
                      <SegmentedControl
                        onChange={(value) => setSort(value as SetSort)}
                        options={[
                          { label: 'Number', value: 'number' },
                          { label: 'High', value: 'high' },
                          { label: 'Low', value: 'low' },
                        ]}
                        selected={sort}
                      />
                    </View>
                  </View>
                  <View style={styles.cardList}>
                    {cards.map((card) => (
                      <SetCardRow card={card} key={card.id} />
                    ))}
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.controlGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      {children}
    </View>
  );
}

type SegmentedOption = { value: string; label: string; accessibilityLabel?: string };

function SegmentedControl({
  options,
  selected,
  onChange,
}: {
  options: SegmentedOption[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segments}>
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <Pressable
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentSelected]}>
            <Text style={[styles.segmentText, active && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SummaryValue({
  label,
  value,
  note,
  accent = colors.text,
}: {
  label: string;
  value: string;
  note: string;
  accent?: string;
}) {
  return (
    <View style={styles.summaryValue}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryNumber, { color: accent }]}>{value}</Text>
      <Text style={styles.summaryNote}>{note}</Text>
    </View>
  );
}

function SetCardRow({ card }: { card: SetPriceCard }) {
  const estimated = card.valuationKind === 'ungraded_reference';
  return (
    <View style={styles.cardRow}>
      <View style={styles.cardImageFrame}>
        {card.imageUrl ? (
          <Image contentFit="contain" source={resolveImageURL(card.imageUrl)} style={styles.cardImage} />
        ) : null}
      </View>
      <Text style={styles.cardNumber}>{card.number ?? '-'}</Text>
      <View style={styles.cardCopy}>
        <Text numberOfLines={1} style={styles.cardName}>
          {card.name}
        </Text>
        <Text numberOfLines={1} style={styles.cardMeta}>
          {card.priceQuality?.status === 'historical' && card.priceQuality.asOf
            ? `Verified ${formatDate(card.priceQuality.asOf)}`
            : estimated
              ? 'Ungraded estimate'
              : card.priceQuality?.status === 'unavailable'
              ? 'Price unavailable'
              : `${card.rarity ?? 'Unknown rarity'}${card.finish ? ` / ${card.finish}` : ''}`}
        </Text>
      </View>
      <Text style={[styles.cardPrice, card.currentPrice === null && styles.cardPriceMissing]}>
        {card.currentPrice === null ? 'Unavailable' : formatCurrency(card.currentPrice)}
      </Text>
    </View>
  );
}

function defaultEdition(editions: string[]): string {
  return editions.includes('Unlimited') ? 'Unlimited' : (editions[0] ?? '');
}

function sortCards(cards: SetPriceCard[], sort: SetSort): SetPriceCard[] {
  if (sort === 'number') return cards;
  return [...cards].sort((left, right) => {
    if (left.currentPrice === null) return 1;
    if (right.currentPrice === null) return -1;
    return sort === 'high'
      ? right.currentPrice - left.currentPrice
      : left.currentPrice - right.currentPrice;
  });
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overlayCompact: { padding: 0 },
  dialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: '94%',
    maxWidth: 1080,
    overflow: 'hidden',
    width: '100%',
  },
  dialogCompact: { borderRadius: 0, borderWidth: 0, height: '100%', maxHeight: '100%' },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: spacing.md,
  },
  headerIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  headerSymbol: { height: 30, width: 30 },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  setName: { color: colors.text, fontSize: 21, fontWeight: '800' },
  setMeta: { color: colors.textMuted, fontSize: 11 },
  closeButton: { alignItems: 'center', borderRadius: 4, height: 36, justifyContent: 'center', width: 36 },
  closePressed: { backgroundColor: colors.surfaceQuiet },
  modalBody: { gap: spacing.lg, padding: spacing.lg },
  setOverview: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.lg },
  setOverviewCompact: { flexDirection: 'column' },
  logoFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    height: 170,
    justifyContent: 'center',
    padding: spacing.lg,
    width: 280,
  },
  logo: { height: '100%', width: '100%' },
  controls: { flex: 1, gap: spacing.md, minWidth: 0 },
  controlGroup: { gap: spacing.xs },
  controlLabel: { color: colors.brass, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  segments: { backgroundColor: colors.surfaceQuiet, borderRadius: 6, flexDirection: 'row', padding: 3 },
  segment: {
    alignItems: 'center',
    borderRadius: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
  segmentSelected: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  segmentText: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  segmentTextSelected: { color: colors.text },
  loading: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 300 },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  summaryStrip: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryValue: { flex: 1, gap: spacing.xs, minWidth: 150, padding: spacing.md },
  summaryLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  summaryNumber: { fontSize: 21, fontWeight: '800' },
  summaryNote: { color: colors.textMuted, fontSize: 10 },
  coverageNotice: {
    alignItems: 'flex-start',
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  coverageText: { color: colors.warning, flex: 1, fontSize: 11, lineHeight: 16 },
  chartSection: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.md, paddingBottom: spacing.lg },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  sectionHeaderCompact: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sectionMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  chartValue: { color: colors.brand, fontSize: 22, fontWeight: '800' },
  cardSection: { gap: spacing.md },
  cardHeader: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  cardHeaderCompact: { alignItems: 'stretch', flexDirection: 'column' },
  sortWrap: { maxWidth: 280, width: '100%' },
  cardList: { borderTopColor: colors.border, borderTopWidth: 1 },
  cardRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 70,
    paddingVertical: spacing.xs,
  },
  cardImageFrame: { alignItems: 'center', backgroundColor: colors.surfaceQuiet, height: 58, justifyContent: 'center', width: 44 },
  cardImage: { height: '100%', width: '100%' },
  cardNumber: { color: colors.brass, fontSize: 10, textAlign: 'center', width: 54 },
  cardCopy: { flex: 1, minWidth: 0 },
  cardName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  cardPrice: { color: colors.brand, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  cardPriceMissing: { color: colors.textMuted, fontSize: 11 },
});
