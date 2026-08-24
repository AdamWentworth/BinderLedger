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
  ShieldCheck,
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
import { colors, spacing } from '@/constants/theme';
import {
  type CatalogListing,
  formatCurrency,
  formatPercent,
  getVariantHistory,
  type MarketPeriod,
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

function CardDetailContent({ listing, onClose }: CardDetailContentProps) {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const currentPricing = listing.priceQuality.status === 'current';
  const [selectedVariantID, setSelectedVariantID] = useState(
    currentPricing ? (listing.selectedVariantId ?? listing.variants[0]?.id ?? '') : '',
  );
  const [period, setPeriod] = useState<MarketPeriod>('1m');
  const scrollViewRef = useRef<ScrollView>(null);
  const historyOffset = useRef<number | null>(null);
  const pendingHistoryScroll = useRef(false);
  const selectedVariant = listing.variants.find((variant) => variant.id === selectedVariantID);
  const ungradedReference = listing.valuationReferences.find(
    (reference) => reference.kind === 'ungraded',
  );
  const gradedReferences = listing.valuationReferences.filter(
    (reference) => reference.kind === 'graded',
  );

  const historyQuery = useQuery({
    queryKey: ['market', 'history', selectedVariantID, period],
    queryFn: ({ signal }) => getVariantHistory(selectedVariantID, period, signal),
    enabled: selectedVariantID !== '',
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
            <Pressable
              accessibilityLabel="Close card details"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}>
              <X color={colors.text} size={21} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} ref={scrollViewRef}>
            {listing.priceQuality.status !== 'current' ? (
              <View style={styles.qualityNotice}>
                {listing.priceQuality.status === 'historical' ? (
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
                  <Image contentFit="contain" source={listing.imageUrl} style={styles.detailImage} />
                ) : null}
              </View>

              <View style={styles.variantGroups}>
                <View style={styles.variantGroup}>
                  <Text style={styles.printing}>
                    {listing.edition} / {listing.finish} / {listing.language}
                  </Text>
                  {listing.variants.map((variant) => {
                    const selected = variant.id === selectedVariantID;
                    return (
                      <Pressable
                        accessibilityLabel={`View ${listing.edition} ${listing.finish} ${variant.condition} price history`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={!currentPricing}
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
                            ]}>
                            {listing.priceQuality.status === 'unavailable'
                              ? 'Unavailable'
                              : formatCurrency(variant.currentPrice)}
                          </Text>
                          {currentPricing ? (
                            <ChevronRight
                              color={selected ? colors.brand : colors.textMuted}
                              size={17}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {ungradedReference || gradedReferences.length > 0 ? (
              <View style={styles.valuationSection}>
                <View style={[styles.valuationHeader, compact && styles.valuationHeaderCompact]}>
                  <View style={styles.valuationHeading}>
                    <View style={styles.valuationTitleRow}>
                      <BadgeDollarSign color={colors.brass} size={19} />
                      <Text style={styles.valuationTitle}>Alternative market view</Text>
                    </View>
                    <Text style={styles.valuationSubtitle}>
                      Exact-printing references shown separately from condition pricing.
                    </Text>
                  </View>
                  {ungradedReference ? (
                    <Pressable
                      accessibilityLabel={`Open ${ungradedReference.sourceName} source`}
                      accessibilityRole="link"
                      onPress={() => void Linking.openURL(ungradedReference.sourceUrl)}
                      style={({ pressed }) => [
                        styles.sourceLink,
                        pressed && styles.sourceLinkPressed,
                      ]}>
                      <Text style={styles.sourceLinkText}>{ungradedReference.sourceName}</Text>
                      <ExternalLink color={colors.brand} size={14} />
                    </Pressable>
                  ) : null}
                </View>

                {ungradedReference ? (
                  <View style={styles.referenceSummary}>
                    <View style={styles.referenceValueGroup}>
                      <Text style={styles.referenceLabel}>{ungradedReference.label} reference</Text>
                      <Text style={styles.referenceAmount}>
                        {formatCurrency(ungradedReference.amount)}
                      </Text>
                    </View>
                    <View style={styles.referenceContext}>
                      <View style={styles.referenceContextRow}>
                        <ShieldCheck color={colors.brand} size={15} />
                        <Text style={styles.referenceContextText}>
                          Completed-sales estimate / checked {formatQualityDate(ungradedReference.checkedOn)}
                        </Text>
                      </View>
                      {ungradedReference.note ? (
                        <Text style={styles.referenceNote}>{ungradedReference.note}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {gradedReferences.length > 0 ? (
                  <View style={styles.benchmarkSection}>
                    <Text style={styles.benchmarkTitle}>Graded benchmarks</Text>
                    <View style={styles.benchmarkGrid}>
                      {gradedReferences.map((reference) => (
                        <View key={reference.id} style={styles.benchmarkItem}>
                          <Text style={styles.benchmarkLabel}>{reference.label}</Text>
                          <Text style={styles.benchmarkAmount}>
                            {formatCurrency(reference.amount)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.benchmarkFootnote}>
                      External market benchmarks are informational and are excluded from catalog totals.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {selectedVariant ? (
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
  valuationSection: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  valuationHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  valuationHeaderCompact: {
    flexDirection: 'column',
  },
  valuationHeading: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  valuationTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  valuationTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  valuationSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sourceLink: {
    alignItems: 'center',
    borderColor: colors.onlineBorder,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  sourceLinkPressed: {
    backgroundColor: colors.onlineSurface,
  },
  sourceLinkText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  referenceSummary: {
    alignItems: 'flex-start',
    backgroundColor: colors.onlineSurface,
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    padding: spacing.md,
  },
  referenceValueGroup: {
    gap: spacing.xs,
    minWidth: 180,
  },
  referenceLabel: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  referenceAmount: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  referenceContext: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 220,
  },
  referenceContextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  referenceContextText: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  referenceNote: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  benchmarkSection: {
    gap: spacing.sm,
  },
  benchmarkTitle: {
    color: colors.brass,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  benchmarkGrid: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  benchmarkItem: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexBasis: 142,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 128,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  benchmarkLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  benchmarkAmount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  benchmarkFootnote: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
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
  if (listing.priceQuality.status === 'historical' && listing.priceQuality.asOf) {
    return `Current provider prices fail condition-order validation. Showing the latest valid five-condition snapshot from ${formatQualityDate(listing.priceQuality.asOf)}.`;
  }
  const referenceNote =
    listing.valuationReferences.length > 0
      ? ' Exact-printing market references are available below.'
      : '';
  if (listing.priceQuality.reason === 'missing_conditions') {
    return `Condition pricing unavailable. The provider is missing one or more condition prices, and no complete historical snapshot passes validation.${referenceNote}`;
  }
  return `Condition pricing unavailable. The provider prices conflict with the expected condition order, and no historical snapshot passes validation.${referenceNote}`;
}

function formatQualityDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`),
  );
}
