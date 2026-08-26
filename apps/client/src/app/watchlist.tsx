import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  ImageOff,
  Layers3,
  LineChart,
  Trash2,
  WalletCards,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MarketConditionControl } from '@/components/market-condition-control';
import { MarketPeriodControl } from '@/components/market-period-control';
import { Metric } from '@/components/metric';
import { PriceHistoryChart } from '@/components/price-history-chart';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { colors, getUsablePageWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import { invalidateWatchlist } from '@/hooks/use-watchlist-membership';
import {
  defaultWatchlistID,
  formatCurrency,
  formatPercent,
  getVariantHistory,
  getWatchlistOverview,
  removeWatchlistCard,
  removeWatchlistSet,
  resolveImageURL,
  type MarketCondition,
  type MarketPeriod,
  type WatchedCard,
  type WatchedSet,
} from '@/lib/api';
import { useCatalogPreferences } from '@/providers/catalog-preferences';

type Removal = { kind: 'card' | 'set'; itemId: number };

export default function WatchlistScreen() {
  const queryClient = useQueryClient();
  const width = useHydratedWidth();
  const pageWidth = getUsablePageWidth(width);
  const compact = pageWidth < 720;
  const { condition, setCondition } = useCatalogPreferences();
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const [query, setQuery] = useState('');
  const [selectedVariantID, setSelectedVariantID] = useState('');

  const overviewQuery = useQuery({
    queryKey: ['watchlist', defaultWatchlistID, 'overview', period, condition],
    queryFn: ({ signal }) => getWatchlistOverview({ condition, period, signal }),
    placeholderData: keepPreviousData,
  });
  const overview = overviewQuery.data;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const cards = (overview?.cards ?? []).filter((card) =>
    [card.cardName, card.cardNumber ?? '', card.setName, card.edition]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
  const sets = (overview?.sets ?? []).filter((set) =>
    `${set.setName} ${set.edition}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  const activeVariantID = cards.some((card) => card.variantId === selectedVariantID)
    ? selectedVariantID
    : (cards.find((card) => card.variantId)?.variantId ?? '');

  const historyQuery = useQuery({
    queryKey: ['market', 'history', activeVariantID, period],
    queryFn: ({ signal }) => getVariantHistory(activeVariantID, period, signal),
    enabled: activeVariantID !== '',
    placeholderData: keepPreviousData,
  });
  const history = historyQuery.data;

  const removal = useMutation({
    mutationFn: ({ kind, itemId }: Removal) =>
      kind === 'card' ? removeWatchlistCard(itemId) : removeWatchlistSet(itemId),
    onSuccess: () => invalidateWatchlist(queryClient),
  });

  const changeCondition = (next: MarketCondition) => {
    setCondition(next);
    setSelectedVariantID('');
  };
  const hasItems = (overview?.summary.cardCount ?? 0) + (overview?.summary.setCount ?? 0) > 0;
  const hasFilteredItems = cards.length + sets.length > 0;

  return (
    <Screen
      title="Watchlist"
      subtitle="Saved printings and set editions, valued against the same condition-specific market."
      toolbar={<MarketPeriodControl period={period} onChange={setPeriod} />}>
      <View style={[styles.filterBar, compact && styles.filterBarCompact]}>
        <View style={styles.searchWrap}>
          <SearchField
            onChangeText={setQuery}
            placeholder="Search watched cards and sets"
            value={query}
          />
        </View>
        <View style={styles.conditionWrap}>
          <MarketConditionControl
            abbreviate={pageWidth < 560}
            condition={condition}
            onChange={changeCondition}
          />
        </View>
      </View>

      {overviewQuery.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>Loading tracked market data</Text>
        </View>
      ) : overviewQuery.isError || !overview ? (
        <EmptyState
          message="The saved market view could not be reached."
          title="Watchlist unavailable"
        />
      ) : !hasItems ? (
        <EmptyState
          message="No cards or sets are currently tracked."
          title="Watchlist is empty"
        />
      ) : !hasFilteredItems ? (
        <EmptyState message="Try another card, set, or edition." title="No matching items" />
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric
              icon={<WalletCards color={colors.brass} size={18} />}
              label="Card value"
              note={`${overview.summary.pricedCardCount}/${overview.summary.cardCount} priced`}
              value={formatCurrency(overview.summary.currentCardValue)}
            />
            <Metric
              icon={<Eye color={colors.brand} size={18} />}
              label="Tracked cards"
              note={`${overview.summary.setCount} set editions`}
              value={String(overview.summary.cardCount)}
            />
            <Metric
              icon={<ArrowUpRight color={colors.positive} size={18} />}
              label="Rising"
              note={periodLabel(period)}
              value={String(overview.summary.risingItems)}
            />
            <Metric
              icon={<ArrowDownRight color={colors.negative} size={18} />}
              label="Falling"
              note={condition}
              value={String(overview.summary.fallingItems)}
            />
          </View>

          {cards.length > 0 ? (
            <View style={styles.chartPanel}>
              <View style={[styles.chartHeader, compact && styles.chartHeaderCompact]}>
                <View style={styles.chartHeading}>
                  <View style={styles.sectionTitleRow}>
                    <LineChart color={colors.brand} size={18} />
                    <Text style={styles.sectionTitle}>Tracked history</Text>
                    {history && history.signal !== 'regular' ? (
                      <View style={styles.signal}>
                        <AlertTriangle color={colors.warning} size={13} />
                        <Text style={styles.signalText}>
                          {history.signal === 'volatile' ? 'High volatility' : 'Limited history'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.chartTitle}>{history?.cardName ?? 'Price history'}</Text>
                  <Text style={styles.chartMeta}>
                    {history
                      ? `${history.setName} / ${history.printing} / ${history.condition}`
                      : 'No condition history is available for this printing.'}
                  </Text>
                </View>
                {history ? (
                  <View style={[styles.chartValue, compact && styles.chartValueCompact]}>
                    <Text style={styles.currentPrice}>{formatCurrency(history.endPrice)}</Text>
                    <Text
                      style={[
                        styles.change,
                        {
                          color:
                            history.changePercent === null || history.changePercent >= 0
                              ? colors.positive
                              : colors.negative,
                        },
                      ]}>
                      {formatPercent(history.changePercent)}
                    </Text>
                  </View>
                ) : null}
              </View>
              {historyQuery.isFetching ? (
                <View style={styles.chartLoading}>
                  <ActivityIndicator color={colors.brand} />
                </View>
              ) : history && history.points.length > 0 ? (
                <PriceHistoryChart points={history.points} />
              ) : (
                <View style={styles.chartLoading}>
                  <Text style={styles.loadingText}>No chartable observations</Text>
                </View>
              )}
            </View>
          ) : null}

          {sets.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Layers3 color={colors.brass} size={18} />
                  <Text style={styles.sectionTitle}>Watched sets</Text>
                </View>
                <Text style={styles.sectionNote}>{sets.length} set editions</Text>
              </View>
              <View style={styles.rowList}>
                {sets.map((set) => (
                  <WatchedSetRow
                    busy={removal.isPending && removal.variables?.kind === 'set' && removal.variables.itemId === set.itemId}
                    key={set.itemId}
                    onRemove={() => removal.mutate({ kind: 'set', itemId: set.itemId })}
                    set={set}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {cards.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Eye color={colors.brass} size={18} />
                  <Text style={styles.sectionTitle}>Watched cards</Text>
                </View>
                <Text style={styles.sectionNote}>{cards.length} exact printings</Text>
              </View>
              <View style={styles.rowList}>
                {cards.map((card) => (
                  <WatchedCardRow
                    busy={removal.isPending && removal.variables?.kind === 'card' && removal.variables.itemId === card.itemId}
                    card={card}
                    key={card.itemId}
                    onRemove={() => removal.mutate({ kind: 'card', itemId: card.itemId })}
                    onSelect={() => card.variantId && setSelectedVariantID(card.variantId)}
                    selected={card.variantId !== null && card.variantId === activeVariantID}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function WatchedCardRow({
  card,
  selected,
  busy,
  onSelect,
  onRemove,
}: {
  card: WatchedCard;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const rising = card.changePercent === null || card.changePercent >= 0;
  return (
    <View style={[styles.itemRow, selected && styles.itemRowSelected]}>
      <Pressable
        accessibilityLabel={`Show ${card.cardName} price history`}
        accessibilityRole="button"
        disabled={card.variantId === null}
        onPress={onSelect}
        style={({ pressed }) => [styles.itemMain, pressed && styles.itemPressed]}>
        <View style={styles.cardImageFrame}>
          {card.imageUrl ? (
            <Image
              contentFit="contain"
              source={resolveImageURL(card.imageUrl)}
              style={styles.cardImage}
            />
          ) : (
            <ImageOff color={colors.textMuted} size={20} />
          )}
        </View>
        <View style={styles.itemCopy}>
          <Text numberOfLines={1} style={styles.itemName}>{card.cardName}</Text>
          <Text numberOfLines={1} style={styles.itemMeta}>
            {card.setName} / {card.edition} / {card.finish}
          </Text>
        </View>
        <View style={styles.itemValue}>
          <Text style={styles.itemPrice}>{formatCurrency(card.currentPrice)}</Text>
          <Text style={[styles.itemChange, { color: rising ? colors.positive : colors.negative }]}>
            {formatPercent(card.changePercent)}
          </Text>
        </View>
      </Pressable>
      <RemoveButton busy={busy} label={`Remove ${card.cardName} from watchlist`} onPress={onRemove} />
    </View>
  );
}

function WatchedSetRow({
  set,
  busy,
  onRemove,
}: {
  set: WatchedSet;
  busy: boolean;
  onRemove: () => void;
}) {
  const rising = set.changePercent === null || set.changePercent >= 0;
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemMain}>
        <View style={styles.setSymbolFrame}>
          {set.symbolUrl ? (
            <Image contentFit="contain" source={set.symbolUrl} style={styles.setSymbol} />
          ) : (
            <Layers3 color={colors.textMuted} size={20} />
          )}
        </View>
        <View style={styles.itemCopy}>
          <Text numberOfLines={1} style={styles.itemName}>{set.setName}</Text>
          <Text numberOfLines={1} style={styles.itemMeta}>
            {set.edition} / {set.pricedCards}/{set.cardCount} priced
          </Text>
        </View>
        <View style={styles.itemValue}>
          <Text style={styles.itemPrice}>{formatCurrency(set.currentValue)}</Text>
          <Text style={[styles.itemChange, { color: rising ? colors.positive : colors.negative }]}>
            {formatPercent(set.changePercent)}
          </Text>
        </View>
      </View>
      <RemoveButton busy={busy} label={`Remove ${set.setName} from watchlist`} onPress={onRemove} />
    </View>
  );
}

function RemoveButton({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={busy}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}>
      {busy ? (
        <ActivityIndicator color={colors.textMuted} size="small" />
      ) : (
        <Trash2 color={colors.textMuted} size={16} />
      )}
    </Pressable>
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

const styles = StyleSheet.create({
  filterBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  filterBarCompact: { alignItems: 'stretch', flexDirection: 'column' },
  searchWrap: { flex: 1, maxWidth: 420, minWidth: 260 },
  conditionWrap: { flex: 1, minWidth: 0 },
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
  loadingText: { color: colors.textMuted, fontSize: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
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
  chartHeaderCompact: { alignItems: 'stretch', flexDirection: 'column' },
  chartHeading: { flex: 1, gap: 3, minWidth: 0 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  signal: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  signalText: { color: colors.warning, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  chartTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: spacing.xs },
  chartMeta: { color: colors.textMuted, fontSize: 11 },
  chartValue: { alignItems: 'flex-end', flexShrink: 0 },
  chartValueCompact: { alignItems: 'flex-start' },
  currentPrice: { color: colors.brand, fontSize: 22, fontWeight: '800' },
  change: { fontSize: 13, fontWeight: '800' },
  chartLoading: { alignItems: 'center', height: 220, justifyContent: 'center' },
  section: { marginTop: spacing.lg },
  sectionHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  sectionNote: { color: colors.textMuted, fontSize: 11 },
  rowList: { backgroundColor: colors.surface },
  itemRow: {
    alignItems: 'stretch',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
  },
  itemRowSelected: { backgroundColor: colors.onlineSurface },
  itemMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  itemPressed: { backgroundColor: colors.surfaceRaised },
  cardImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.cardBackdrop,
    height: 64,
    justifyContent: 'center',
    width: 48,
  },
  cardImage: { height: '100%', width: '100%' },
  setSymbolFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceQuiet,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  setSymbol: { height: 34, width: 34 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  itemMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  itemValue: { alignItems: 'flex-end', flexShrink: 0, minWidth: 90 },
  itemPrice: { color: colors.text, fontSize: 14, fontWeight: '800' },
  itemChange: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  removeButton: { alignItems: 'center', justifyContent: 'center', width: 48 },
  removeButtonPressed: { backgroundColor: colors.offlineSurface },
});
