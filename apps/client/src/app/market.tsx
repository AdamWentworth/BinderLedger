import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
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
import {
  MarketEditionControl,
  marketEditionLabel,
} from '@/components/market-edition-control';
import { MarketMovementControl } from '@/components/market-movement-control';
import { MarketMovementValue } from '@/components/market-movement-value';
import { MarketPeriodControl } from '@/components/market-period-control';
import { MarketMoverRow } from '@/components/market-mover-row';
import { Metric } from '@/components/metric';
import { PriceHistoryChart } from '@/components/price-history-chart';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { SelectionMenu } from '@/components/selection-menu';
import { colors, getUsablePageWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import { useCatalogPreferences } from '@/providers/catalog-preferences';
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  getCatalogSets,
  getCatalogListingForVariant,
  getMarketMovements,
  getMarketOverview,
  getVariantHistory,
  type MarketCondition,
  type MarketEdition,
  type MarketMovementDirection,
  type MarketMovementMode,
  type MarketMover,
  type MarketPeriod,
  type MarketSetMovement,
  type VariantHistory,
  resolveImageURL,
} from '@/lib/api';
import { buildMarketSetOptions, getMarketSetDisplayName } from '@/lib/market-set-options';

export default function MarketScreen() {
  const width = useHydratedWidth();
  const pageWidth = getUsablePageWidth(width);
  const desktop = pageWidth >= 980;
  const abbreviateConditions = pageWidth < 620;
  const compactSets = pageWidth < 520;
  const [category, setCategory] = useState<MarketCategory>('highlights');
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const [movementMode, setMovementMode] = useState<MarketMovementMode>('amount');
  const [edition, setEdition] = useState<MarketEdition>('');
  const { condition, setCondition } = useCatalogPreferences();
  const [selectedVariantID, setSelectedVariantID] = useState('');
  const [detailVariantID, setDetailVariantID] = useState('');
  const [direction, setDirection] = useState<MarketMovementDirection>('all');
  const [setRankingDirection, setSetRankingDirection] =
    useState<MarketMovementDirection>('all');
  const [selectedSetMovement, setSelectedSetMovement] = useState<MarketSetMovement | null>(null);
  const [setCardDirection, setSetCardDirection] = useState<MarketMovementDirection>('all');
  const [setID, setSetID] = useState('');
  const [search, setSearch] = useState('');
  const [setCardSearch, setSetCardSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const deferredSetCardSearch = useDeferredValue(setCardSearch.trim());

  const setsQuery = useQuery({
    queryKey: ['catalog', 'sets'],
    queryFn: ({ signal }) => getCatalogSets(signal),
    staleTime: 15 * 60_000,
  });
  const setOptions = buildMarketSetOptions(setsQuery.data ?? []);
  const selectedSetLabel =
    setOptions.find((option) => option.value === setID)?.label ?? 'All sets';
  const selectedSetDisplayName = selectedSetMovement
    ? getMarketSetDisplayName(
        selectedSetMovement.setId,
        selectedSetMovement.setName,
        setOptions,
      )
    : '';

  const overviewQuery = useQuery({
    queryKey: ['market', 'overview', period, condition, edition, movementMode],
    queryFn: ({ signal }) =>
      getMarketOverview({ period, condition, edition, rank: movementMode, signal }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const overview = overviewQuery.data;
  const displayedMovementMode = overview?.rank ?? movementMode;
  const movers = overview ? [...overview.gainers, ...overview.losers] : [];
  const rankedSets =
    overview?.sets.filter((set) => {
      if (edition && set.edition !== edition) return false;
      if (setRankingDirection === 'gainers') return set.changeAmount > 0;
      if (setRankingDirection === 'decliners') return set.changeAmount < 0;
      return true;
    }) ?? [];

  const browseQuery = useInfiniteQuery({
    queryKey: [
      'market',
      'movements',
      period,
      condition,
      movementMode,
      direction,
      edition,
      setID,
      deferredSearch,
    ],
    queryFn: ({ pageParam, signal }) =>
      getMarketMovements({
        period,
        condition,
        rank: movementMode,
        direction,
        edition,
        setId: setID,
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

  const setCardsQuery = useInfiniteQuery({
    queryKey: [
      'market',
      'set-cards',
      period,
      condition,
      movementMode,
      setCardDirection,
      selectedSetMovement?.setId,
      selectedSetMovement?.edition,
      deferredSetCardSearch,
    ],
    queryFn: ({ pageParam, signal }) =>
      getMarketMovements({
        period,
        condition,
        rank: movementMode,
        direction: setCardDirection,
        edition: selectedSetMovement?.edition,
        setId: selectedSetMovement?.setId,
        query: deferredSetCardSearch,
        limit: 24,
        offset: pageParam,
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.movements.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: category === 'sets' && selectedSetMovement !== null,
    staleTime: 5 * 60_000,
  });
  const setCardMovers = setCardsQuery.data?.pages.flatMap((page) => page.movements) ?? [];
  const setCardTotal = setCardsQuery.data?.pages[0]?.total ?? 0;
  const activeMovers =
    category === 'browse'
      ? browseMovers
      : category === 'sets' && selectedSetMovement
        ? setCardMovers
        : movers;
  const activeVariantID =
    category === 'highlights'
      ? activeMovers.some((mover) => mover.variantId === selectedVariantID)
        ? selectedVariantID
        : (activeMovers[0]?.variantId ?? '')
      : activeMovers.some((mover) => mover.variantId === selectedVariantID)
        ? selectedVariantID
        : '';

  const historyQuery = useQuery({
    queryKey: ['market', 'history', activeVariantID, period],
    queryFn: ({ signal }) => getVariantHistory(activeVariantID, period, signal),
    enabled: activeVariantID !== '',
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

  const changeEdition = (next: MarketEdition) => {
    setEdition(next);
    setSelectedSetMovement(null);
    setSetID('');
    setSelectedVariantID('');
    setDetailVariantID('');
  };

  const changeDirection = (next: MarketMovementDirection) => {
    setDirection(next);
    setSelectedVariantID('');
  };

  const changeSet = (next: string) => {
    setSetID(next);
    setSelectedVariantID('');
  };

  const changeCategory = (next: MarketCategory) => {
    setCategory(next);
    setSelectedVariantID('');
  };

  const selectSetMovement = (set: MarketSetMovement) => {
    setSelectedSetMovement(set);
    setSetCardDirection('all');
    setSetCardSearch('');
    setSelectedVariantID('');
  };

  const returnToSetRankings = () => {
    setSelectedSetMovement(null);
    setSelectedVariantID('');
  };

  const changeSetCardDirection = (next: MarketMovementDirection) => {
    setSetCardDirection(next);
    setSelectedVariantID('');
  };

  return (
    <Screen
      scrollResetKey={`${category}:${selectedSetMovement?.setId ?? ''}:${selectedSetMovement?.edition ?? ''}`}
      title="Market"
      subtitle="Track the market, compare set editions, and inspect the cards driving each move."
      toolbar={<MarketPeriodControl period={period} onChange={setPeriod} />}>
      <MarketCategoryControl
        category={category}
        compact={abbreviateConditions}
        onChange={changeCategory}
      />
      <View
        style={[
          styles.editionScope,
          abbreviateConditions && styles.editionScopeCompact,
        ]}>
        <View style={styles.editionScopeCopy}>
          <Text style={styles.editionScopeLabel}>Edition scope</Text>
          <Text style={styles.editionScopeNote}>
            Applies to overview totals, set baskets, and card movement.
          </Text>
        </View>
        <View style={styles.editionScopeControl}>
          <MarketEditionControl edition={edition} onChange={changeEdition} />
          {overviewQuery.isFetching && overview !== undefined ? (
            <ActivityIndicator
              accessibilityLabel="Updating edition scope"
              color={colors.brand}
              size="small"
            />
          ) : null}
        </View>
      </View>
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
                  note={`${formatVariantCount(overview.summary.evaluatedVariants)} / ${marketEditionLabel(edition)}`}
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
              {selectedSetMovement ? (
                <>
                  <Pressable
                    accessibilityLabel="Return to all set rankings"
                    accessibilityRole="button"
                    onPress={returnToSetRankings}
                    style={({ pressed }) => [
                      styles.backButton,
                      pressed && styles.backButtonPressed,
                    ]}>
                    <ArrowLeft color={colors.brand} size={17} />
                    <Text style={styles.backButtonText}>All set rankings</Text>
                  </Pressable>

                  <View style={[styles.setDrillSummary, compactSets && styles.setDrillSummaryCompact]}>
                    <View style={styles.setDrillIdentity}>
                      <View style={styles.setDrillArtwork}>
                        {selectedSetMovement.symbolUrl ?? selectedSetMovement.logoUrl ? (
                          <Image
                            accessibilityElementsHidden
                            contentFit="contain"
                            source={resolveImageURL(
                              selectedSetMovement.symbolUrl ?? selectedSetMovement.logoUrl,
                            )}
                            style={styles.setDrillImage}
                          />
                        ) : (
                          <Layers3 color={colors.textMuted} size={30} />
                        )}
                      </View>
                      <View style={styles.setDrillCopy}>
                        <Text style={styles.setDrillEyebrow}>Set performance</Text>
                        <Text style={styles.setDrillTitle}>{selectedSetDisplayName}</Text>
                        <Text style={styles.setDrillMeta}>
                          {selectedSetMovement.edition || 'All printings'} /{' '}
                          {selectedSetMovement.variantCount} priced printings / {condition}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.setDrillValue, compactSets && styles.setDrillValueCompact]}>
                      <View>
                        <Text style={styles.setDrillValueLabel}>Current basket</Text>
                        <Text style={styles.setDrillValueAmount}>
                          {formatCurrency(selectedSetMovement.endValue)}
                        </Text>
                        <Text style={styles.setPrevious}>
                          from {formatCurrency(selectedSetMovement.startValue)}
                        </Text>
                      </View>
                      <MarketMovementValue
                        amount={selectedSetMovement.changeAmount}
                        mode={displayedMovementMode}
                        percent={selectedSetMovement.changePercent}
                        prominent
                      />
                    </View>
                  </View>

                  <View
                    style={[
                      styles.browseToolbar,
                      abbreviateConditions && styles.browseToolbarCompact,
                    ]}>
                    <View style={styles.browseSearch}>
                      <SearchField
                        onChangeText={(value) => {
                          setSetCardSearch(value);
                          setSelectedVariantID('');
                        }}
                        placeholder={`Search ${selectedSetDisplayName} cards`}
                        value={setCardSearch}
                      />
                    </View>
                    <MarketDirectionControl
                      direction={setCardDirection}
                      onChange={changeSetCardDirection}
                    />
                  </View>

                  <View style={styles.browseHeader}>
                    <View style={styles.sectionTitleRow}>
                      <ListFilter color={colors.brass} size={18} />
                      <Text style={styles.sectionTitle}>
                        Cards in {selectedSetDisplayName}
                      </Text>
                    </View>
                    <Text style={styles.sectionNote}>
                      {setCardsQuery.isPending
                        ? 'Loading ranked cards'
                        : setCardTotal === 0
                          ? '0 matching printings'
                          : `${setCardMovers.length} of ${setCardTotal} ${selectedSetMovement.edition || 'set'} printings`}
                    </Text>
                  </View>

                  <MovementResults
                    emptyMessage="Try a different search, direction, condition, or time range."
                    emptyTitle="No matching cards in this set"
                    errorMessage="The cards behind this set movement could not be reached."
                    errorTitle="Set cards unavailable"
                    fetchingNextPage={setCardsQuery.isFetchingNextPage}
                    hasNextPage={setCardsQuery.hasNextPage}
                    historyPanel={
                      <MarketHistoryPanel
                        activeVariantID={activeVariantID}
                        compact={abbreviateConditions}
                        fetching={historyQuery.isFetching}
                        history={history}
                        movementMode={displayedMovementMode}
                        onOpenDetails={openCardDetails}
                        openingDetails={
                          detailVariantID === history?.variantId &&
                          detailListingQuery.isFetching
                        }
                      />
                    }
                    isError={setCardsQuery.isError}
                    isPending={setCardsQuery.isPending}
                    movers={setCardMovers}
                    movementMode={displayedMovementMode}
                    onLoadMore={() => setCardsQuery.fetchNextPage()}
                    onSelect={setSelectedVariantID}
                    selectedVariantID={selectedVariantID}
                    total={setCardTotal}
                  />
                </>
              ) : (
                <>
                  <View style={styles.sectionHeader}>
                    <View>
                      <View style={styles.sectionTitleRow}>
                        <Layers3 color={colors.brass} size={18} />
                        <Text style={styles.sectionTitle}>Set rankings</Text>
                      </View>
                      <Text style={styles.sectionIntro}>
                        Compare complete set-edition baskets, then select one to inspect its cards.
                      </Text>
                    </View>
                    <View style={styles.setRankingControls}>
                      <Text style={styles.controlLabel}>Show</Text>
                      <MarketDirectionControl
                        direction={setRankingDirection}
                        onChange={setSetRankingDirection}
                      />
                    </View>
                  </View>
                  <Text style={styles.setContext}>
                    {marketEditionLabel(edition)} / {condition} / {periodLabel(period)} / ranked by{' '}
                    {displayedMovementMode === 'amount' ? 'dollar movement' : 'percentage movement'}
                  </Text>
                  {overview.sets.length === 0 ? (
                    <View style={styles.emptySets}>
                      <Layers3 color={colors.textMuted} size={26} />
                      <Text style={styles.loadingText}>No set movement in this range</Text>
                    </View>
                  ) : rankedSets.length === 0 ? (
                    <EmptyState
                      message="Choose another direction or time range."
                      title="No matching set movement"
                    />
                  ) : (
                    <View style={styles.setList}>
                      {rankedSets.map((set) => {
                        const artworkURL = resolveImageURL(set.symbolUrl ?? set.logoUrl);
                        const edition = set.edition || 'All printings';
                        const displayName = getMarketSetDisplayName(
                          set.setId,
                          set.setName,
                          setOptions,
                        );
                        return (
                          <Pressable
                            accessibilityHint="Shows the cards driving this set movement"
                            accessibilityLabel={`${displayName}, ${edition}. ${formatCurrency(set.endValue)} current basket value, from ${formatCurrency(set.startValue)}. Change ${formatSignedCurrency(set.changeAmount)}, ${formatPercent(set.changePercent)}`}
                            accessibilityRole="button"
                            key={`${set.setId}:${edition}`}
                            onPress={() => selectSetMovement(set)}
                            style={({ pressed }) => [
                              styles.setRow,
                              pressed && styles.setRowPressed,
                            ]}>
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
                              <Text style={styles.setName}>{displayName}</Text>
                              <Text style={styles.setMeta}>
                                {compactSets
                                  ? `${edition} / ${formatCurrency(set.endValue)} now / ${set.variantCount} printings`
                                  : `${edition} / ${set.variantCount} fresh printings`}
                              </Text>
                            </View>
                            {!compactSets ? (
                              <View style={styles.setValue}>
                                <Text style={styles.setTotal}>{formatCurrency(set.endValue)}</Text>
                                <Text style={styles.setPrevious}>
                                  from {formatCurrency(set.startValue)}
                                </Text>
                              </View>
                            ) : null}
                            <MarketMovementValue
                              amount={set.changeAmount}
                              mode={displayedMovementMode}
                              percent={set.changePercent}
                            />
                            <ChevronRight color={colors.brand} size={19} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
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
                <View
                  style={[
                    styles.browseFilters,
                    abbreviateConditions && styles.browseFiltersCompact,
                  ]}>
                  <View style={styles.browseSetFilter}>
                    <SelectionMenu
                      accessibilityLabel="Filter market movement by set"
                      label="Set"
                      onChange={changeSet}
                      options={setOptions}
                      value={setID}
                    />
                  </View>
                  <MarketDirectionControl direction={direction} onChange={changeDirection} />
                </View>
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
                      : `${browseMovers.length} of ${browseTotal} printings / ${marketEditionLabel(edition)} / ${selectedSetLabel}`}
                </Text>
              </View>

              <MovementResults
                emptyMessage="Try a different search, set, direction, condition, or time range."
                emptyTitle="No matching card movement"
                errorMessage="The complete movement list could not be reached."
                errorTitle="Card movement unavailable"
                fetchingNextPage={browseQuery.isFetchingNextPage}
                hasNextPage={browseQuery.hasNextPage}
                historyPanel={
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
                }
                isError={browseQuery.isError}
                isPending={browseQuery.isPending}
                movers={browseMovers}
                movementMode={displayedMovementMode}
                onLoadMore={() => browseQuery.fetchNextPage()}
                onSelect={setSelectedVariantID}
                selectedVariantID={selectedVariantID}
                total={browseTotal}
              />
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

type MovementResultsProps = {
  emptyMessage: string;
  emptyTitle: string;
  errorMessage: string;
  errorTitle: string;
  fetchingNextPage: boolean;
  hasNextPage: boolean;
  historyPanel: ReactNode;
  isError: boolean;
  isPending: boolean;
  movers: MarketMover[];
  movementMode: MarketMovementMode;
  onLoadMore: () => void;
  onSelect: (variantID: string) => void;
  selectedVariantID: string;
  total: number;
};

function MovementResults({
  emptyMessage,
  emptyTitle,
  errorMessage,
  errorTitle,
  fetchingNextPage,
  hasNextPage,
  historyPanel,
  isError,
  isPending,
  movers,
  movementMode,
  onLoadMore,
  onSelect,
  selectedVariantID,
  total,
}: MovementResultsProps) {
  if (isPending) {
    return (
      <View style={styles.browseLoading}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>Loading card movement</Text>
      </View>
    );
  }
  if (isError) return <EmptyState message={errorMessage} title={errorTitle} />;
  if (movers.length === 0) return <EmptyState message={emptyMessage} title={emptyTitle} />;

  return (
    <>
      <View style={styles.browseList}>
        {movers.map((mover, index) => (
          <Fragment key={mover.variantId}>
            <MarketMoverRow
              mover={mover}
              movementMode={movementMode}
              onPress={() => onSelect(selectedVariantID === mover.variantId ? '' : mover.variantId)}
              rank={index + 1}
              selected={selectedVariantID === mover.variantId}
            />
            {selectedVariantID === mover.variantId ? historyPanel : null}
          </Fragment>
        ))}
      </View>
      {hasNextPage ? (
        <Pressable
          accessibilityLabel="Load more card movement"
          accessibilityRole="button"
          disabled={fetchingNextPage}
          onPress={onLoadMore}
          style={({ pressed }) => [
            styles.loadMore,
            pressed && styles.loadMorePressed,
            fetchingNextPage && styles.loadMoreDisabled,
          ]}>
          {fetchingNextPage ? <ActivityIndicator color={colors.brand} size="small" /> : null}
          <Text style={styles.loadMoreText}>
            {fetchingNextPage ? 'Loading more' : 'Load 24 more'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.endOfResults}>All {total} matching printings shown</Text>
      )}
    </>
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

function formatVariantCount(count: number): string {
  return `${count} fresh ${count === 1 ? 'variant' : 'variants'}`;
}

const styles = StyleSheet.create({
  editionScope: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  editionScopeCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  editionScopeCopy: {
    flex: 1,
    minWidth: 0,
  },
  editionScopeLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  editionScopeNote: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  editionScopeControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
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
    backgroundColor: colors.cardBackdrop,
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
  sectionIntro: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  controlLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
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
  setRowPressed: {
    backgroundColor: colors.surfaceRaised,
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
  setRankingControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setContext: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: spacing.md,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    minHeight: 36,
    paddingHorizontal: spacing.xs,
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  backButtonText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  setDrillSummary: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  setDrillSummaryCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.md,
  },
  setDrillIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  setDrillArtwork: {
    alignItems: 'center',
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 8,
    height: 72,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 84,
  },
  setDrillImage: {
    height: 54,
    width: 66,
  },
  setDrillCopy: {
    flex: 1,
    minWidth: 0,
  },
  setDrillEyebrow: {
    color: colors.brass,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  setDrillTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  setDrillMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  setDrillValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  setDrillValueCompact: {
    justifyContent: 'space-between',
  },
  setDrillValueLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  setDrillValueAmount: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
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
  browseFilters: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  browseFiltersCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  browseSetFilter: {
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
