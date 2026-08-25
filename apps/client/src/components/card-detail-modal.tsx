import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  AlertTriangle,
  BadgeDollarSign,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  History,
  LineChart,
  X,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  type LayoutChangeEvent,
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
import { useWatchlistCardMembership } from '@/hooks/use-watchlist-membership';
import {
  type CatalogListing,
  type CatalogValuationReference,
  formatCurrency,
  formatPercent,
  getVariantHistory,
  type MarketPeriod,
  resolveImageURL,
} from '@/lib/api';

type CardDetailModalProps = {
  listing: CatalogListing | null;
  onClose: () => void;
};

export function CardDetailModal({ listing, onClose }: CardDetailModalProps) {
  if (!listing) return null;
  return <CardDetailContent key={listing.id} listing={listing} onClose={onClose} />;
}

type CardDetailContentProps = {
  listing: CatalogListing;
  onClose: () => void;
};

type PriceView = 'conditions' | 'graded';

function CardDetailContent({ listing, onClose }: CardDetailContentProps) {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const initialVariant =
    listing.variants.find(
      (variant) => variant.id === listing.selectedVariantId && variant.currentPrice !== null,
    ) ?? listing.variants.find((variant) => variant.currentPrice !== null);
  const [selectedVariantID, setSelectedVariantID] = useState(initialVariant?.id ?? '');
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const [priceView, setPriceView] = useState<PriceView>('conditions');
  const scrollViewRef = useRef<ScrollView>(null);
  const historyOffset = useRef<number | null>(null);
  const pendingHistoryScroll = useRef(false);
  const selectedVariant = listing.variants.find((variant) => variant.id === selectedVariantID);
  const ungradedReference = listing.valuationReferences.find(
    (reference) => reference.kind === 'ungraded' && reference.isPrimary,
  );
  const valuationGroups = groupValuationReferences(listing.valuationReferences);
  const estimatedPricing = listing.valuationKind === 'ungraded_reference';
  const hasGradedPricing = valuationGroups.some((group) => group.graded.length > 0);
  const conditionSource = listing.variants[0]?.sourceProvider ?? 'Unknown provider';
  const hasQualityWarning =
    listing.priceQuality.status !== 'current' || listing.priceQuality.reason !== null;
  const watchlist = useWatchlistCardMembership({
    cardId: listing.cardId,
    edition: listing.edition,
    finish: listing.finish,
    language: listing.language,
  });

  const historyQuery = useQuery({
    queryKey: ['market', 'history', selectedVariantID, period],
    queryFn: ({ signal }) => getVariantHistory(selectedVariantID, period, signal),
    enabled: priceView === 'conditions' && selectedVariantID !== '',
    placeholderData: keepPreviousData,
  });
  const history = historyQuery.data;

  const scrollToHistory = () => {
    if (historyOffset.current === null) return;
    scrollViewRef.current?.scrollTo({
      animated: true,
      y: Math.max(0, historyOffset.current - spacing.md),
    });
  };

  const selectVariant = (variantID: string) => {
    pendingHistoryScroll.current = true;
    setSelectedVariantID(variantID);
    if (historyOffset.current !== null) {
      requestAnimationFrame(scrollToHistory);
      pendingHistoryScroll.current = false;
    }
  };

  const placeHistory = (event: LayoutChangeEvent) => {
    historyOffset.current = event.nativeEvent.layout.y;
    if (pendingHistoryScroll.current) {
      pendingHistoryScroll.current = false;
      requestAnimationFrame(scrollToHistory);
    }
  };

  return (
    <Modal animationType={compact ? 'none' : 'fade'} onRequestClose={onClose} transparent visible>
      <SafeAreaView style={[styles.overlay, compact && styles.overlayCompact]}>
        <View style={[styles.dialog, compact && styles.dialogCompact]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>
              <Text style={styles.cardName}>{listing.name}</Text>
              <Text style={styles.cardMeta}>
                {listing.setName} / {listing.number} / {listing.rarity ?? 'Unknown rarity'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <WatchButton
                error={watchlist.error}
                loading={watchlist.loading}
                noun="card"
                onPress={watchlist.toggle}
                watched={watchlist.watched}
              />
              <Pressable
                accessibilityLabel="Close card details"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}>
                <X color={colors.text} size={21} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} ref={scrollViewRef}>
            {hasQualityWarning ? (
              <View style={styles.qualityNotice}>
                {estimatedPricing ? (
                  <BadgeDollarSign color={colors.brass} size={18} />
                ) : listing.priceQuality.status === 'historical' ? (
                  <History color={colors.warning} size={18} />
                ) : (
                  <CircleAlert color={colors.warning} size={18} />
                )}
                <Text style={styles.qualityNoticeText}>
                  {priceQualityMessage(listing)}
                </Text>
              </View>
            ) : null}

            <View style={[styles.cardOverview, compact && styles.cardOverviewCompact]}>
              <View style={[styles.detailImageFrame, compact && styles.detailImageFrameCompact]}>
                {listing.imageUrl ? (
                  <Image
                    contentFit="contain"
                    source={resolveImageURL(listing.imageUrl)}
                    style={styles.detailImage}
                  />
                ) : null}
              </View>

              <View style={styles.variantGroups}>
                <View style={styles.variantGroup}>
                  <Text style={styles.printing}>
                    {listing.edition} / {listing.finish} / {listing.language}
                  </Text>
                  {hasGradedPricing ? (
                    <View accessibilityRole="tablist" style={styles.priceTabs}>
                      {(['conditions', 'graded'] as const).map((view) => {
                        const selected = priceView === view;
                        return (
                          <Pressable
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            key={view}
                            onPress={() => setPriceView(view)}
                            style={({ pressed }) => [
                              styles.priceTab,
                              selected && styles.priceTabSelected,
                              pressed && styles.priceTabPressed,
                            ]}>
                            <Text
                              style={[
                                styles.priceTabText,
                                selected && styles.priceTabTextSelected,
                              ]}>
                              {view === 'conditions' ? 'Conditions' : 'Graded'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {priceView === 'graded' && hasGradedPricing ? (
                    <>
                      {valuationGroups.map((group, groupIndex) => (
                        <View
                          key={group.key}
                          style={[
                            styles.valuationGroup,
                            groupIndex > 0 && styles.valuationGroupDivider,
                          ]}>
                          {group.variant ? (
                            <Text style={styles.valuationVariant}>{group.variant}</Text>
                          ) : null}
                          {group.ungraded ? (
                            <View style={[styles.variantRow, styles.estimateRow]}>
                              <View>
                                <Text style={styles.estimateLabel}>Ungraded benchmark</Text>
                                <Text style={styles.estimateMeta}>Exact printing</Text>
                              </View>
                              <Text style={styles.estimateAmount}>
                                {formatCurrency(group.ungraded.amount)}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={styles.gradeHeading}>Grade benchmarks</Text>
                          {group.graded.map((reference) => (
                            <View key={reference.id} style={styles.variantRow}>
                              <Text style={styles.condition}>{reference.label}</Text>
                              <Text
                                style={[
                                  styles.variantPrice,
                                  reference.amount === null && styles.variantPriceUnavailable,
                                ]}>
                                {reference.amount === null
                                  ? 'Unavailable'
                                  : formatCurrency(reference.amount)}
                              </Text>
                            </View>
                          ))}
                          <View style={styles.sourceAttribution}>
                            <Pressable
                              accessibilityLabel={`Open this ${group.sourceName} valuation source`}
                              accessibilityRole="link"
                              onPress={() => void Linking.openURL(group.sourceUrl)}
                              style={({ pressed }) => [
                                styles.sourceLink,
                                pressed && styles.sourceLinkPressed,
                              ]}>
                              <Text style={styles.sourceLinkText}>{group.sourceName}</Text>
                              <ExternalLink color={colors.brand} size={13} strokeWidth={2} />
                            </Pressable>
                            <Text style={styles.estimateFootnote}>
                              Snapshot from {formatQualityDate(group.checkedOn)}. Values are
                              independent of the raw-card condition prices.
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  ) : (
                    <>
                      {listing.variants.map((variant) => {
                        const selected = variant.id === selectedVariantID;
                        const historyAvailable = variant.currentPrice !== null;
                        return (
                          <Pressable
                            accessibilityLabel={`View ${listing.edition} ${listing.finish} ${variant.condition} price history`}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !historyAvailable, selected }}
                            disabled={!historyAvailable}
                            key={variant.id}
                            onPress={() => selectVariant(variant.id)}
                            style={({ pressed }) => [
                              styles.variantRow,
                              selected && styles.variantRowSelected,
                              pressed && styles.variantRowPressed,
                            ]}>
                            <Text style={[styles.condition, selected && styles.conditionSelected]}>
                              {variant.condition}
                            </Text>
                            <View style={styles.variantValue}>
                              <Text
                                style={[
                                  styles.variantPrice,
                                  selected && styles.variantPriceSelected,
                                  !historyAvailable && styles.variantPriceUnavailable,
                                ]}>
                                {historyAvailable
                                  ? formatCurrency(variant.currentPrice)
                                  : 'Unavailable'}
                              </Text>
                              {historyAvailable ? (
                                <ChevronRight
                                  color={selected ? colors.brand : colors.textMuted}
                                  size={17}
                                />
                              ) : null}
                            </View>
                          </Pressable>
                        );
                      })}
                      {conditionSource !== 'JustTCG' ? (
                        <Text style={styles.estimateFootnote}>
                          Condition prices supplied by {conditionSource} for this exact printing.
                        </Text>
                      ) : null}
                      {estimatedPricing && ungradedReference ? (
                        <Text style={styles.estimateFootnote}>
                          Catalog sorting uses the {formatCurrency(ungradedReference.amount)} ungraded
                          benchmark because these condition values carry a provider warning.
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            </View>

            {priceView === 'conditions' && selectedVariant ? (
              <View onLayout={placeHistory} style={styles.historySection}>
                <View style={[styles.historyHeader, compact && styles.historyHeaderCompact]}>
                  <View style={styles.historyHeading}>
                    <View style={styles.historyTitleRow}>
                      <LineChart color={colors.brand} size={18} />
                      <Text style={styles.historyTitle}>Market history</Text>
                      {history && history.signal !== 'regular' ? (
                        <View style={styles.historySignal}>
                          <AlertTriangle color={colors.warning} size={13} />
                          <Text style={styles.historySignalText}>
                            {history.signal === 'volatile' ? 'High volatility' : 'Limited history'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.historyVariant}>
                      {listing.edition} / {listing.finish} / {selectedVariant.condition}
                    </Text>
                  </View>
                  {history ? (
                    <View style={[styles.historyStats, compact && styles.historyStatsCompact]}>
                      <Text style={styles.historyPrice}>{formatCurrency(history.endPrice)}</Text>
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
                      <Text style={styles.observationCount}>
                        {history.points.length} observations
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.periodControl}>
                  <MarketPeriodControl onChange={setPeriod} period={period} />
                </View>

                {historyQuery.isError ? (
                  <View style={styles.historyStatus}>
                    <Text style={styles.historyStatusText}>Price history is unavailable.</Text>
                  </View>
                ) : historyQuery.isFetching || !history ? (
                  <View style={styles.historyStatus}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : (
                  <PriceHistoryChart points={history.points} />
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

type ValuationGroup = {
  key: string;
  variant: string;
  sourceName: string;
  sourceUrl: string;
  checkedOn: string;
  ungraded?: CatalogValuationReference;
  graded: CatalogValuationReference[];
};

function groupValuationReferences(references: CatalogValuationReference[]): ValuationGroup[] {
  const groups = new Map<string, ValuationGroup>();

  for (const reference of references) {
    const key = `${reference.printingVariant}:${reference.sourceUrl}`;
    const group = groups.get(key) ?? {
      key,
      variant: reference.printingVariant,
      sourceName: reference.sourceName,
      sourceUrl: reference.sourceUrl,
      checkedOn: reference.checkedOn,
      graded: [],
    };

    if (reference.kind === 'ungraded') {
      group.ungraded = reference;
    } else {
      group.graded.push(reference);
    }
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.graded.length > 0);
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  overlayCompact: {
    padding: 0,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: '92%',
    maxWidth: 980,
    overflow: 'hidden',
    width: '100%',
  },
  dialogCompact: {
    borderRadius: 0,
    borderWidth: 0,
    height: '100%',
    maxHeight: '100%',
  },
  modalHeader: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md,
    position: 'relative',
    zIndex: 1,
  },
  modalHeading: {
    flex: 1,
    gap: spacing.xs,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 4,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closePressed: {
    backgroundColor: colors.surfaceQuiet,
  },
  modalBody: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  qualityNotice: {
    alignItems: 'flex-start',
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  qualityNoticeText: {
    color: colors.warning,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  cardOverview: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  cardOverviewCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  detailImageFrame: {
    alignSelf: 'flex-start',
    aspectRatio: 0.714,
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    overflow: 'hidden',
    width: 280,
  },
  detailImageFrameCompact: {
    alignSelf: 'center',
    maxWidth: 280,
    width: '76%',
  },
  detailImage: {
    height: '100%',
    width: '100%',
  },
  variantGroups: {
    flex: 1,
    gap: spacing.lg,
    minWidth: 0,
  },
  variantGroup: {
    gap: spacing.xs,
  },
  priceTabs: {
    backgroundColor: colors.surfaceQuiet,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    minHeight: 42,
    overflow: 'hidden',
  },
  priceTab: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  priceTabSelected: {
    backgroundColor: colors.surfaceRaised,
    borderBottomColor: colors.brand,
  },
  priceTabPressed: {
    backgroundColor: colors.surface,
  },
  priceTabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  priceTabTextSelected: {
    color: colors.text,
    fontWeight: '800',
  },
  printing: {
    color: colors.brass,
    fontSize: 13,
    fontWeight: '800',
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  variantRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderLeftColor: 'transparent',
    borderLeftWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: spacing.sm,
  },
  variantRowSelected: {
    backgroundColor: colors.surfaceRaised,
    borderLeftColor: colors.brand,
  },
  variantRowPressed: {
    backgroundColor: colors.surfaceQuiet,
  },
  condition: {
    color: colors.textMuted,
    fontSize: 13,
  },
  conditionSelected: {
    color: colors.text,
    fontWeight: '700',
  },
  variantValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  variantPrice: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  variantPriceSelected: {
    color: colors.brand,
  },
  variantPriceUnavailable: {
    color: colors.textMuted,
    fontSize: 12,
  },
  estimateRow: {
    backgroundColor: colors.onlineSurface,
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
    minHeight: 58,
  },
  estimateLabel: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  estimateMeta: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  estimateAmount: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: '800',
  },
  gradeHeading: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    textTransform: 'uppercase',
  },
  valuationGroup: {
    gap: spacing.xs,
  },
  valuationGroupDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  valuationVariant: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  estimateFootnote: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  sourceAttribution: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  sourceLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 24,
  },
  sourceLinkPressed: {
    opacity: 0.7,
  },
  sourceLinkText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: '800',
  },
  historySection: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.lg,
  },
  historyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  historyHeaderCompact: {
    flexDirection: 'column',
  },
  historyHeading: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  historyTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  historyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  historyVariant: {
    color: colors.textMuted,
    fontSize: 12,
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
  historyStats: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  historyStatsCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  historyPrice: {
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
  periodControl: {
    alignSelf: 'flex-end',
    marginTop: spacing.md,
    maxWidth: 300,
    width: '100%',
  },
  historyStatus: {
    alignItems: 'center',
    height: 250,
    justifyContent: 'center',
  },
  historyStatusText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});

function priceQualityMessage(listing: CatalogListing): string {
  if (listing.valuationKind === 'ungraded_reference') {
    return 'The separate ungraded benchmark is the displayed catalog value. Provider condition prices remain visible as reported.';
  }
  if (listing.priceQuality.status === 'historical' && listing.priceQuality.asOf) {
    return `Current provider prices fail condition-order validation. Showing the latest valid five-condition snapshot from ${formatQualityDate(listing.priceQuality.asOf)}.`;
  }
  if (listing.priceQuality.reason === 'missing_conditions') {
    return 'The provider is missing one or more condition prices. Available current values remain visible as reported.';
  }
  return 'Provider prices conflict with the expected DMG < HP < MP < LP < NM order. Current values remain visible as reported.';
}

function formatQualityDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}
