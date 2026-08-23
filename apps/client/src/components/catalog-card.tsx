import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { CatalogCard, formatCurrency } from '@/lib/api';

type CatalogCardTileProps = {
  card: CatalogCard;
  onPress: (card: CatalogCard) => void;
};

export function CatalogCardTile({ card, onPress }: CatalogCardTileProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const printings = useMemo(
    () => [...new Set(card.variants.map((variant) => variant.printing))],
    [card.variants],
  );
  const nearMintPrices = card.variants
    .filter((variant) => variant.condition === 'Near Mint' && variant.currentPrice !== null)
    .map((variant) => variant.currentPrice as number);
  const nearMintFrom = nearMintPrices.length ? Math.min(...nearMintPrices) : null;

  return (
    <Pressable
      accessibilityLabel={`Open ${card.name}, ${card.setName}`}
      accessibilityRole="button"
      onPress={() => onPress(card)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View style={styles.imageFrame}>
        {card.imageUrl && !imageFailed ? (
          <Image
            contentFit="contain"
            onError={() => setImageFailed(true)}
            source={card.imageUrl}
            style={styles.image}
            transition={180}
          />
        ) : (
          <View style={styles.imageFallback}>
            <ImageOff color={colors.textMuted} size={30} />
            <Text style={styles.fallbackNumber}>{card.number ?? 'No image'}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.name}>
            {card.name}
          </Text>
          <Text style={styles.number}>{card.number}</Text>
        </View>
        <Text numberOfLines={1} style={styles.setName}>
          {card.setName}
        </Text>

        <View style={styles.tags}>
          {printings.slice(0, 2).map((printing) => (
            <View key={printing} style={styles.tag}>
              <Text numberOfLines={1} style={styles.tagText}>
                {printing}
              </Text>
            </View>
          ))}
          {printings.length > 2 && <Text style={styles.moreTag}>+{printings.length - 2}</Text>}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>NM from</Text>
          <Text style={styles.price}>{formatCurrency(nearMintFrom)}</Text>
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
    padding: spacing.md,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
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
    maxWidth: 130,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  tagText: {
    color: colors.burgundy,
    fontSize: 10,
    fontWeight: '700',
  },
  moreTag: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
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
  },
  price: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '800',
  },
});
