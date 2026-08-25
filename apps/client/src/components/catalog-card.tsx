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

      <View
        style={[
          styles.body,
          density === 'large' && styles.bodyLarge,
          compact && styles.bodyCompact,
        ]}>
        <View style={[styles.titleRow, compact && styles.titleRowCompact]}>
          <Text
            numberOfLines={2}
            style={[
              styles.name,
              density === 'large' && styles.nameLarge,
              compact && styles.nameCompact,
            ]}>
            {listing.name}
          </Text>
          <Text style={[styles.number, compact && styles.numberCompact]}>{listing.number}</Text>
        </View>
        <View style={styles.setMetaRow}>
          <Text numberOfLines={1} style={[styles.setName, compact && styles.setNameCompact]}>
            {listing.setName}
          </Text>
          {hasGradedPricing ? (
            <View style={styles.gradedMarker}>
              <BadgeCheck color={colors.brand} size={compact ? 12 : 13} />
              <Text style={styles.gradedMarkerText}>Graded</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.tags, compact && styles.tagsCompact]}>
          <View
            style={[
              styles.tag,
              compact && styles.tagCompact,
              listing.edition === 'First Edition' && styles.editionTag,
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.tagText,
                compact && styles.tagTextCompact,
                listing.edition === 'First Edition' && styles.editionTagText,
              ]}>
              {listing.edition}
            </Text>
          </View>
          <View style={[styles.tag, compact && styles.tagCompact]}>
            <Text numberOfLines={1} style={[styles.tagText, compact && styles.tagTextCompact]}>
              {listing.finish}
            </Text>
          </View>
        </View>

        <View style={[styles.priceRow, compact && styles.priceRowCompact]}>
          <View style={styles.priceLabelWrap}>
            {historical ? <History color={colors.warning} size={13} /> : null}
            {(unavailable || warning) && !estimated ? (
              <CircleAlert color={colors.warning} size={13} />
            ) : null}
            {estimated ? <BadgeDollarSign color={colors.brass} size={14} /> : null}
            <Text
              style={[
                styles.priceLabel,
                (historical || warning || (unavailable && !estimated)) && styles.priceLabelFlagged,
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
              compact && styles.priceCompact,
              unavailable && !estimated && styles.priceUnavailable,
              estimated && styles.priceReference,
            ]}>
            {estimated
              ? formatCurrency(listing.currentPrice)
              : unavailable
                ? compact
                  ? 'Unavailable'
                  : 'Price unavailable'
                : formatCurrency(listing.currentPrice)}
          </Text>
        </View>
      </View>
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
    aspectRatio: 0.78,
    padding: spacing.sm,
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
    gap: 6,
    minHeight: 138,
    padding: 10,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
  },
  titleRowCompact: {
    gap: spacing.xs,
    minHeight: 36,
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
    fontSize: 14,
    lineHeight: 18,
  },
  number: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '700',
    paddingTop: 2,
  },
  numberCompact: {
    fontSize: 9,
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
    fontSize: 10,
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
  tagsCompact: {
    minHeight: 20,
  },
  tag: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 4,
    maxWidth: '52%',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tagCompact: {
    paddingHorizontal: 5,
    paddingVertical: 3,
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
  tagTextCompact: {
    fontSize: 9,
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
  priceRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.xs,
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
    alignSelf: 'flex-end',
    fontSize: 13,
  },
  priceUnavailable: {
    color: colors.warning,
    fontSize: 12,
  },
  priceReference: {
    color: colors.brass,
  },
});

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: '2-digit' }).format(
    new Date(`${value}T00:00:00`),
  );
}
