import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  ImageOff,
  Layers3,
  LineChart,
  ListFilter,
} from 'lucide-react-native';
import { Fragment, type ReactNode, useDeferredValue, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { CardDetailModal } from '@/components/card-detail-modal';
import {
  MarketCategoryControl,
  type MarketCategory,
} from '@/components/market-category-control';
import { MarketConditionControl } from '@/components/market-condition-control';
import { MarketDirectionControl } from '@/components/market-direction-control';
import { MarketMovementControl } from '@/components/market-movement-control';
import { MarketMovementValue } from '@/components/market-movement-value';
import { MarketPeriodControl } from '@/components/market-period-control';
import { MarketMoverRow } from '@/components/market-mover-row';
import { Metric } from '@/components/metric';
import { PriceHistoryChart } from '@/components/price-history-chart';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { colors, getUsablePageWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import { useCatalogPreferences } from '@/providers/catalog-preferences';
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  getCatalogListingForVariant,
  getMarketMovements,
  getMarketOverview,
  getVariantHistory,
  type MarketCondition,
  type MarketMovementDirection,
  type MarketMovementMode,
  type MarketMover,
  type MarketPeriod,
  type VariantHistory,
  resolveImageURL,
} from '@/lib/api';

export default function MarketScreen() {
  const width = useHydratedWidth();
  const pageWidth = getUsablePageWidth(width);
  const desktop = pageWidth >= 980;
  const abbreviateConditions = pageWidth < 620;
  const compactSets = pageWidth < 520;
  const [category, setCategory] = useState<MarketCategory>('highlights');
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const [movementMode, setMovementMode] = useState<MarketMovementMode>('amount');
  const { condition, setCondition } = useCatalogPreferences();
  const [selectedVariantID, setSelectedVariantID] = useState('');
  const [detailVariantID, setDetailVariantID] = useState('');
  const [direction, setDirection] = useState<MarketMovementDirection>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  const overviewQuery = useQuery({
    queryKey: ['market', 'overview', period, condition, movementMode],
    queryFn: ({ signal }) =>
      getMarketOverview({ period, condition, rank: movementMode, signal }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const overview = overviewQuery.data;
  const displayedMovementMode = overview?.rank ?? movementMode;
  const movers = overview ? [...overview.gainers, ...overview.losers] : [];

  const browseQuery = useInfiniteQuery({
    queryKey: [
      'market',
      'movements',
      period,
      condition,
      movementMode,
      direction,
      deferredSearch,
    ],
    queryFn: ({ pageParam, signal }) =>
      getMarketMovements({
        period,
        condition,
        rank: movementMode,
        direction,
        query: deferredSearch,
        limit: 24,
        offset: pageParam,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.movements.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: category === 'browse',
    staleTime: 5 * 60_000,
  });
  const browseMovers = browseQuery.data?.pages.flatMap((page) => page.movements) ?? [];
  const browseTotal = browseQuery.data?.pages[0]?.total ?? 0;
  const activeVariantID =
    category === 'browse'
      ? browseMovers.some((mover) => mover.variantId === selectedVariantID)
        ? selectedVariantID
        : ''
      : movers.some((mover) => mover.variantId === selectedVariantID)
        ? selectedVariantID
        : (movers[0]?.variantId ?? '');

  const historyQuery = useQuery({
    queryKey: ['market', 'history', activeVariantID, period],
    queryFn: ({ signal }) => getVariantHistory(activeVariantID, period, signal),
    enabled: category !== 'sets' && activeVariantID !== '',
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const history = historyQuery.data;

  const detailListingQuery = useQuery({
    queryKey: ['catalog', 'listing', 'variant', detailVariantID, condition],
    queryFn: ({ signal }) =>
      getCatalogListingForVariant(detailVariantID, condition, signal),
    enabled: detailVariantID !== '',
    staleTime: 5 * 60_000,
  });

  const openCardDetails = (variantID: string) => {
    if (variantID === detailVariantID) {
      void detailListingQuery.refetch();
      return;
    }
    setDetailVariantID(variantID);
  };

  const changeCondition = (next: MarketCondition) => {
    setCondition(next);
    setSelectedVariantID('');
  };

  const changeMovementMode = (next: MarketMovementMode) => {
    setMovementMode(next);
    setSelectedVariantID('');
  };

  const changeDirection = (next: MarketMovementDirection) => {
    setDirection(next);
    setSelectedVariantID('');
  };

  return (
    <Screen
      title="Market"
      subtitle="Condition-specific movement across collected legacy sets and printings."
      toolbar={<MarketPeriodControl period={period} onChange={setPeriod} />}>
      <MarketCategoryControl
        category={category}
        compact={abbreviateConditions}
        onChange={setCategory}
      />
      <View style={[styles.marketControls, abbreviateConditions && styles.marketControlsCompact]}>
        <MarketConditionControl
          abbreviate={abbreviateConditions}
          condition={condition}
          onChange={changeCondition}
        />
        <MarketMovementControl
          loading={overviewQuery.isFetching && overview !== undefined}
          mode={movementMode}
          onChange={changeMovementMode}
        />
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
          {category === 'highlights' ? (
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
                  note={`${formatPercent(overview.summary.medianChangePercent)} / ${condition}`}
                  value={formatSignedCurrency(overview.summary.medianChangeAmount)}
                />
              </View>

              <MarketHistoryPanel
                activeVariantID={activeVariantID}
                compact={abbreviateConditions}
                fetching={historyQuery.isFetching}
                history={history}
                movementMode={displayedMovementMode}
                onOpenDetails={openCardDetails}
                openingDetails={
                  detailVariantID === history?.variantId && detailListingQuery.isFetching
                }
              />
            </>
          ) : category === 'sets' ? (
            <View style={styles.setSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Activity color={colors.brass} size={18} />
                  <Text style={styles.sectionTitle}>Set performance</Text>
                </View>
                <Text style={styles.sectionNote}>
                  {condition} basket / {periodLabel(period)} / ranked by{' '}
                  {displayedMovementMode === 'amount' ? 'dollars' : 'percent'}
                </Text>
              </View>
              {overview.sets.length === 0 ? (
                <View style={styles.emptySets}>
                  <Layers3 color={colors.textMuted} size={26} />
                  <Text style={styles.loadingText}>No set movement in this range</Text>
                </View>
              ) : (
                <View style={styles.setList}>
                  {overview.sets.map((set) => {
                    const artworkURL = resolveImageURL(set.symbolUrl ?? set.logoUrl);
                    const edition = set.edition || 'All printings';
                    return (
                      <View
                        accessibilityLabel={`${set.setName}, ${edition}. ${formatCurrency(set.endValue)} current basket value, from ${formatCurrency(set.startValue)}. Change ${formatSignedCurrency(set.changeAmount)}, ${formatPercent(set.changePercent)}`}
                        accessible
                        key={`${set.setId}:${edition}`}
                        style={styles.setRow}>
                        <View style={styles.setArtwork}>
                          {artworkURL ? (
                            <Image
                              accessibilityElementsHidden
                              contentFit="contain"
                              source={artworkURL}
                              style={styles.setImage}
                            />
                          ) : (
                            <Layers3 color={colors.textMuted} size={22} />
                          )}
                        </View>
                        <View style={styles.setCopy}>
                          <Text style={styles.setName}>{set.setName}</Text>
                          <Text style={styles.setMeta}>
                            {compactSets
                              ? `${edition} / ${formatCurrency(set.endValue)} now / ${set.variantCount} printings`
                              : `${edition} / ${set.variantCount} fresh printings`}
                          </Text>
                        </View>
                        {!compactSets ? (
                          <View style={styles.setValue}>
                            <Text style={styles.setTotal}>{formatCurrency(set.endValue)}</Text>
                            <Text style={styles.setPrevious}>from {formatCurrency(set.startValue)}</Text>
                          </View>
                        ) : null}
                        <MarketMovementValue
                          amount={set.changeAmount}
                          mode={displayedMovementMode}
                          percent={set.changePercent}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {category === 'highlights' ? (
            <View style={[styles.moverColumns, !desktop && styles.moverColumnsCompact]}>
              <MoverSection
                accent={colors.positive}
                icon={<ArrowUpRight color={colors.positive} size={19} />}
                movers={overview.gainers}
                movementMode={displayedMovementMode}
                onSelect={setSelectedVariantID}
                selectedVariantID={activeVariantID}
                title="Top gainers"
              />
              <MoverSection
                accent={colors.negative}
                icon={<ArrowDownRight color={colors.negative} size={19} />}
                movers={overview.losers}
                movementMode={displayedMovementMode}
                onSelect={setSelectedVariantID}
                selectedVariantID={activeVariantID}
                title="Top decliners"
              />
            </View>
          ) : category === 'browse' ? (
            <View style={styles.browseSection}>
              <View style={[styles.browseToolbar, abbreviateConditions && styles.browseToolbarCompact]}>
                <View style={styles.browseSearch}>
                  <SearchField
                    onChangeText={(value) => {
                      setSearch(value);
                      setSelectedVariantID('');
                    }}
                    placeholder="Search card, number, or set"
                    value={search}
                  />
                </View>
                <MarketDirectionControl direction={direction} onChange={changeDirection} />
              </View>

              <View style={styles.browseHeader}>
                <View style={styles.sectionTitleRow}>
                  <ListFilter color={colors.brass} size={18} />
                  <Text style={styles.sectionTitle}>Card movement</Text>
                </View>
                <Text style={styles.sectionNote}>
                  {browseQuery.isPending
                    ? 'Loading ranked cards'
                    : browseTotal === 0
                      ? '0 matching printings'
                      : `${browseMovers.length} of ${browseTotal} printings`}
                </Text>
              </View>

              {browseQuery.isPending ? (
                <View style={styles.browseLoading}>
                  <ActivityIndicator color={colors.brand} size="large" />
                  <Text style={styles.loadingText}>Loading card movement</Text>
                </View>
              ) : browseQuery.isError ? (
                <EmptyState
                  message="The complete movement list could not be reached."
                  title="Card movement unavailable"
                />
              ) : browseMovers.length === 0 ? (
                <EmptyState
                  message="Try a different search, direction, condition, or time range."
                  title="No matching movement"
                />
              ) : (
                <>
                  <View style={styles.browseList}>
                    {browseMovers.map((mover, index) => (
                      <Fragment key={mover.variantId}>
                        <MarketMoverRow
                          mover={mover}
                          movementMode={displayedMovementMode}
                          onPress={() =>
                            setSelectedVariantID((current) =>
                              current === mover.variantId ? '' : mover.variantId,
                            )
                          }
                          rank={index + 1}
                          selected={selectedVariantID === mover.variantId}
                        />
                        {selectedVariantID === mover.variantId ? (
                          <MarketHistoryPanel
                            activeVariantID={activeVariantID}
                            compact={abbreviateConditions}
                            fetching={historyQuery.isFetching}
                            history={history}
                            movementMode={displayedMovementMode}
                            onOpenDetails={openCardDetails}
                            openingDetails={
                              detailVariantID === history?.variantId && detailListingQuery.isFetching
                            }
                          />
                        ) : null}
                      </Fragment>
                    ))}
                  </View>
                  {browseQuery.hasNextPage ? (
                    <Pressable
                      accessibilityLabel="Load more card movement"
                      accessibilityRole="button"
                      disabled={browseQuery.isFetchingNextPage}
                      onPress={() => browseQuery.fetchNextPage()}
                      style={({ pressed }) => [
                        styles.loadMore,
                        pressed && styles.loadMorePressed,
                        browseQuery.isFetchingNextPage && styles.loadMoreDisabled,
                      ]}>
                      {browseQuery.isFetchingNextPage ? (
                        <ActivityIndicator color={colors.brand} size="small" />
                      ) : null}
                      <Text style={styles.loadMoreText}>
                        {browseQuery.isFetchingNextPage ? 'Loading more' : 'Load 24 more'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.endOfResults}>All {browseTotal} matching printings shown</Text>
                  )}
                </>
              )}
            </View>
          ) : null}
        </>
      )}
      <CardDetailModal
        listing={detailListingQuery.data ?? null}
        onClose={() => setDetailVariantID('')}
      />
    </Screen>
  );
}

type MoverSectionProps = {
  accent: string;
  icon: ReactNode;
  movers: MarketMover[];
  movementMode: MarketMovementMode;
  onSelect: (variantID: string) => void;
  selectedVariantID: string;
  title: string;
};

function MoverSection({
  accent,
  icon,
  movers,
  movementMode,
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
            movementMode={movementMode}
            onPress={() => onSelect(mover.variantId)}
            selected={selectedVariantID === mover.variantId}
          />
        ))}
      </View>
    </View>
  );
}

type MarketHistoryPanelProps = {
  activeVariantID: string;
  compact: boolean;
  fetching: boolean;
  history: VariantHistory | undefined;
  movementMode: MarketMovementMode;
  onOpenDetails: (variantID: string) => void;
  openingDetails: boolean;
};

function MarketHistoryPanel({
  activeVariantID,
  compact,
  fetching,
  history,
  movementMode,
  onOpenDetails,
  openingDetails,
}: MarketHistoryPanelProps) {
  return (
    <View style={styles.chartPanel}>
      <View style={[styles.chartHeader, compact && styles.chartHeaderCompact]}>
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
            <Pressable
              accessibilityHint="Opens the full catalog card details"
              accessibilityLabel={`Open ${history.cardName} card details`}
              accessibilityRole="button"
              onPress={() => onOpenDetails(history.variantId)}
              style={({ pressed }) => [
                styles.chartIdentity,
                pressed && styles.chartIdentityPressed,
              ]}>
              <View
                accessibilityElementsHidden
                style={styles.historyImageFrame}>
                {history.imageUrl ? (
                  <Image
                    accessibilityElementsHidden
                    contentFit="contain"
                    source={resolveImageURL(history.imageUrl)}
                    style={styles.historyImage}
                  />
                ) : (
                  <ImageOff color={colors.textMuted} size={22} />
                )}
              </View>
              <View style={styles.chartIdentityCopy}>
                <Text style={styles.chartTitle}>{history.cardName}</Text>
                <Text style={styles.chartMeta}>
                  {history.setName} / {history.printing} / {history.condition}
                </Text>
              </View>
              {openingDetails ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <ChevronRight color={colors.brand} size={20} />
              )}
            </Pressable>
          ) : (
            <Text style={styles.chartMeta}>Select a market row</Text>
          )}
        </View>
        {history ? (
          <View style={[styles.chartValue, compact && styles.chartValueCompact]}>
            <Text style={styles.currentPrice}>{formatCurrency(history.endPrice)}</Text>
            <MarketMovementValue
              amount={history.changeAmount}
              mode={movementMode}
              percent={history.changePercent}
              prominent
            />
            <Text style={styles.observationCount}>{history.points.length} observations</Text>
          </View>
        ) : null}
      </View>
      {activeVariantID === '' ? (
        <View style={styles.chartLoading}>
          <Text style={styles.loadingText}>No priced movement in this range</Text>
        </View>
      ) : fetching || !history ? (
        <View style={styles.chartLoading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <PriceHistoryChart points={history.points} />
      )}
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
  marketControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    width: '100%',
  },
  marketControlsCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
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
  chartIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingRight: spacing.xs,
  },
  chartIdentityPressed: {
    opacity: 0.76,
  },
  chartIdentityCopy: {
    flex: 1,
    minWidth: 0,
  },
  historyImageFrame: {
    alignItems: 'center',
    aspectRatio: 0.714,
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  historyImage: {
    height: '100%',
    width: '100%',
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
    marginTop: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  emptySets: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
  },
  setArtwork: {
    alignItems: 'center',
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  setImage: {
    height: 32,
    width: 42,
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
  browseSection: {
    marginTop: spacing.sm,
  },
  browseToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  browseToolbarCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  browseSearch: {
    flex: 1,
    maxWidth: 520,
    minWidth: 220,
  },
  browseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  browseLoading: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 220,
  },
  browseList: {
    gap: spacing.sm,
  },
  loadMore: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    minWidth: 180,
    paddingHorizontal: spacing.lg,
  },
  loadMorePressed: {
    backgroundColor: colors.surfaceQuiet,
  },
  loadMoreDisabled: {
    opacity: 0.72,
  },
  loadMoreText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  endOfResults: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
