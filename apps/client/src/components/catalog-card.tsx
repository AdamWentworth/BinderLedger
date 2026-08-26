import { Image } from 'expo-image';
import { BadgeCheck, BadgeDollarSign, CircleAlert, History, ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shortCondition } from '@/components/market-condition-control';
import { colors, spacing } from '@/constants/theme';
import {
  type CatalogListing,
  formatCurrency,
  type MarketCondition,
  resolveImageURL,
} from '@/lib/api';
import { type CatalogDensity } from '@/providers/catalog-preferences';

type CatalogCardTileProps = {
  condition: MarketCondition;
  density: CatalogDensity;
  listing: CatalogListing;
  onPress: (listing: CatalogListing) => void;
};

export function CatalogCardTile({ condition, density, listing, onPress }: CatalogCardTileProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const historical = listing.priceQuality.status === 'historical';
  const unavailable = listing.priceQuality.status === 'unavailable';
  const estimated = listing.valuationKind === 'ungraded_reference';
  const warning = listing.priceQuality.reason !== null;
  const hasGradedPricing = listing.valuationReferences.some(
    (reference) => reference.kind === 'graded' && reference.amount !== null,
  );
  const compact = density === 'compact';
  const displayedPrice = estimated
    ? formatCurrency(listing.currentPrice)
    : unavailable
      ? compact
        ? 'N/A'
        : 'Price unavailable'
      : formatCurrency(listing.currentPrice);

  return (
    <Pressable
      accessibilityLabel={`Open ${listing.name}, ${listing.setName}, ${listing.edition}, ${listing.finish}${
        hasGradedPricing ? ', graded pricing available' : ''
      }`}
      accessibilityRole="button"
      onPress={() => onPress(listing)}
      style={({ pressed }) => [
        styles.container,
        compact && styles.containerCompact,
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.imageFrame,
          density === 'large' && styles.imageFrameLarge,
          compact && styles.imageFrameCompact,
        ]}>
        {listing.imageUrl && !imageFailed ? (
          <Image
            contentFit="contain"
            onError={() => setImageFailed(true)}
            source={resolveImageURL(listing.imageUrl)}
            style={styles.image}
            transition={180}
          />
        ) : (
          <View style={styles.imageFallback}>
            <ImageOff color={colors.textMuted} size={30} />
            <Text style={styles.fallbackNumber}>{listing.number ?? 'No image'}</Text>
          </View>
        )}
      </View>

      {compact ? (
        <View style={styles.bodyCompact}>
          <View style={styles.titleRowCompact}>
            <Text numberOfLines={2} style={styles.nameCompact}>
              {listing.name}
            </Text>
            <Text style={styles.numberCompact}>{listing.number}</Text>
          </View>

          <View style={styles.compactSetRow}>
            <Text numberOfLines={1} style={styles.setNameCompact}>
              {listing.setName}
            </Text>
            {hasGradedPricing ? (
              <View accessibilityLabel="Graded pricing available" accessible>
                <BadgeCheck color={colors.brand} size={12} />
              </View>
            ) : null}
          </View>

          <Text numberOfLines={1} style={styles.compactPrinting}>
            <Text
              style={listing.edition === 'First Edition' ? styles.compactFirstEdition : undefined}>
              {shortEdition(listing.edition)}
            </Text>
            {' · '}
            {shortFinish(listing.finish)}
          </Text>

          <View
            accessibilityLabel={`${shortCondition(condition)} price ${displayedPrice}`}
            accessible
            style={styles.compactPriceRow}>
            <View style={styles.compactPriceSignal}>
              {estimated ? <BadgeDollarSign color={colors.brass} size={13} /> : null}
              {!estimated && historical ? <History color={colors.warning} size={12} /> : null}
              {!estimated && !historical && (unavailable || warning) ? (
                <CircleAlert color={colors.warning} size={12} />
              ) : null}
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.priceCompact,
                unavailable && !estimated && styles.priceUnavailable,
                estimated && styles.priceReference,
              ]}>
              {displayedPrice}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.body, density === 'large' && styles.bodyLarge]}>
          <View style={styles.titleRow}>
            <Text
              numberOfLines={2}
              style={[styles.name, density === 'large' && styles.nameLarge]}>
              {listing.name}
            </Text>
            <Text style={styles.number}>{listing.number}</Text>
          </View>
          <View style={styles.setMetaRow}>
            <Text numberOfLines={1} style={styles.setName}>
              {listing.setName}
            </Text>
            {hasGradedPricing ? (
              <View style={styles.gradedMarker}>
                <BadgeCheck color={colors.brand} size={13} />
                <Text style={styles.gradedMarkerText}>Graded</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.tags}>
            <View
              style={[
                styles.tag,
                listing.edition === 'First Edition' && styles.editionTag,
              ]}>
              <Text
                numberOfLines={1}
                style={[
                  styles.tagText,
                  listing.edition === 'First Edition' && styles.editionTagText,
                ]}>
                {listing.edition}
              </Text>
            </View>
            <View style={styles.tag}>
              <Text numberOfLines={1} style={styles.tagText}>
                {listing.finish}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <View style={styles.priceLabelWrap}>
              {historical ? <History color={colors.warning} size={13} /> : null}
              {(unavailable || warning) && !estimated ? (
                <CircleAlert color={colors.warning} size={13} />
              ) : null}
              {estimated ? <BadgeDollarSign color={colors.brass} size={14} /> : null}
              <Text
                style={[
                  styles.priceLabel,
                  (historical || warning || (unavailable && !estimated)) &&
                    styles.priceLabelFlagged,
                  estimated && styles.priceLabelReference,
                ]}>
                {estimated
                  ? 'Ungraded value'
                  : historical && listing.priceQuality.asOf
                    ? `${shortCondition(condition)} / ${formatShortDate(listing.priceQuality.asOf)}`
                    : warning
                      ? `${shortCondition(condition)} / review`
                      : shortCondition(condition)}
              </Text>
            </View>
            <Text
              style={[
                styles.price,
                density === 'large' && styles.priceLarge,
                unavailable && !estimated && styles.priceUnavailable,
                estimated && styles.priceReference,
              ]}>
              {displayedPrice}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  containerCompact: {
    borderRadius: 6,
  },
  pressed: {
    borderColor: colors.brand,
    opacity: 0.88,
  },
  imageFrame: {
    aspectRatio: 0.82,
    backgroundColor: colors.surfaceQuiet,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    padding: spacing.md,
  },
  imageFrameLarge: {
    aspectRatio: 0.76,
    padding: spacing.lg,
  },
  imageFrameCompact: {
    aspectRatio: 0.74,
    padding: 6,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  fallbackNumber: {
    color: colors.textMuted,
    fontSize: 12,
  },
  body: {
    gap: spacing.sm,
    minHeight: 154,
    padding: spacing.md,
  },
  bodyLarge: {
    minHeight: 164,
  },
  bodyCompact: {
    gap: spacing.xs,
    minHeight: 104,
    padding: spacing.sm,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
  },
  titleRowCompact: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 32,
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  nameLarge: {
    fontSize: 17,
    lineHeight: 22,
  },
  nameCompact: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
  number: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '700',
    paddingTop: 2,
  },
  numberCompact: {
    color: colors.brass,
    flexShrink: 0,
    fontSize: 8,
    fontWeight: '800',
    paddingTop: 1,
  },
  setMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  setName: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
  },
  setNameCompact: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 9,
    lineHeight: 12,
  },
  compactSetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  compactPrinting: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  compactFirstEdition: {
    color: colors.brass,
  },
  gradedMarker: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
  },
  gradedMarkerText: {
    color: colors.brand,
    fontSize: 9,
    fontWeight: '800',
  },
  tags: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 24,
  },
  tag: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 4,
    maxWidth: '52%',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  editionTag: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderWidth: 1,
  },
  tagText: {
    color: colors.burgundy,
    fontSize: 10,
    fontWeight: '700',
  },
  editionTagText: {
    color: colors.brass,
  },
  priceRow: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  priceLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  priceLabelWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  priceLabelFlagged: {
    color: colors.warning,
  },
  priceLabelReference: {
    color: colors.brass,
  },
  price: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '800',
  },
  priceLarge: {
    fontSize: 17,
  },
  priceCompact: {
    color: colors.brand,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  compactPriceRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    minHeight: 24,
    paddingTop: 5,
  },
  compactPriceSignal: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 13,
  },
  priceUnavailable: {
    color: colors.warning,
    fontSize: 12,
  },
  priceReference: {
    color: colors.brass,
  },
});

function shortEdition(value: string): string {
  return value === 'First Edition' ? '1st Ed.' : value;
}

function shortFinish(value: string): string {
  return value === 'Holofoil' ? 'Holo' : value;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).format(
    new Date(`${value}T00:00:00`),
  );
}
