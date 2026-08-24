import { Image } from 'expo-image';
import { BadgeDollarSign, CircleAlert, History, ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shortCondition } from '@/components/market-condition-control';
import { colors, spacing } from '@/constants/theme';
import { type CatalogListing, formatCurrency, type MarketCondition } from '@/lib/api';

type CatalogCardTileProps = {
  condition: MarketCondition;
  listing: CatalogListing;
  onPress: (listing: CatalogListing) => void;
};

export function CatalogCardTile({ condition, listing, onPress }: CatalogCardTileProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const historical = listing.priceQuality.status === 'historical';
  const unavailable = listing.priceQuality.status === 'unavailable';
  const ungradedReference = unavailable
    ? listing.valuationReferences.find((reference) => reference.kind === 'ungraded')
    : undefined;

  return (
    <Pressable
      accessibilityLabel={`Open ${listing.name}, ${listing.setName}, ${listing.edition}, ${listing.finish}`}
      accessibilityRole="button"
      onPress={() => onPress(listing)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View style={styles.imageFrame}>
        {listing.imageUrl && !imageFailed ? (
          <Image
            contentFit="contain"
            onError={() => setImageFailed(true)}
            source={listing.imageUrl}
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

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.name}>
            {listing.name}
          </Text>
          <Text style={styles.number}>{listing.number}</Text>
        </View>
        <Text numberOfLines={1} style={styles.setName}>
          {listing.setName}
        </Text>

        <View style={styles.tags}>
          <View style={[styles.tag, listing.edition === 'First Edition' && styles.editionTag]}>
            <Text
              numberOfLines={1}
              style={[styles.tagText, listing.edition === 'First Edition' && styles.editionTagText]}>
              {listing.edition}
            </Text>
          </View>
          <View style={styles.tag}>
            <Text numberOfLines={1} style={styles.tagText}>{listing.finish}</Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceLabelWrap}>
            {historical ? <History color={colors.warning} size={13} /> : null}
            {unavailable && !ungradedReference ? (
              <CircleAlert color={colors.warning} size={13} />
            ) : null}
            {ungradedReference ? <BadgeDollarSign color={colors.brass} size={14} /> : null}
            <Text
              style={[
                styles.priceLabel,
                (historical || (unavailable && !ungradedReference)) && styles.priceLabelFlagged,
                ungradedReference && styles.priceLabelReference,
              ]}>
              {ungradedReference
                ? 'Ungraded ref'
                : historical && listing.priceQuality.asOf
                ? `${shortCondition(condition)} / ${formatShortDate(listing.priceQuality.asOf)}`
                : shortCondition(condition)}
            </Text>
          </View>
          <Text
            style={[
              styles.price,
              unavailable && !ungradedReference && styles.priceUnavailable,
              ungradedReference && styles.priceReference,
            ]}>
            {ungradedReference
              ? formatCurrency(ungradedReference.amount)
              : unavailable
                ? 'Price unavailable'
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
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  number: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '700',
    paddingTop: 2,
  },
  setName: {
    color: colors.textMuted,
    fontSize: 12,
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
