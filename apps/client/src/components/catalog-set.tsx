import { Image } from 'expo-image';
import { ChevronRight, Layers3 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { type CatalogSet, formatCurrency } from '@/lib/api';

type CatalogSetTileProps = {
  set: CatalogSet;
  onPress: (set: CatalogSet) => void;
};

export function CatalogSetTile({ set, onPress }: CatalogSetTileProps) {
  return (
    <Pressable
      accessibilityLabel={`Open ${set.name} set pricing`}
      accessibilityRole="button"
      onPress={() => onPress(set)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View style={styles.artwork}>
        {set.symbolUrl ? (
          <Image contentFit="contain" source={set.symbolUrl} style={styles.primarySymbol} transition={180} />
        ) : (
          <Layers3 color={colors.textMuted} size={38} />
        )}
        <Text style={styles.artworkName}>{set.name}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text numberOfLines={2} style={styles.name}>
              {set.name}
            </Text>
            <Text style={styles.meta}>
              {set.cardCount + set.sharedCardCount} cards
              {set.releaseDate ? ` / ${formatYear(set.releaseDate)}` : ''}
            </Text>
          </View>
          <ChevronRight color={colors.brand} size={20} />
        </View>

        <View style={styles.editions}>
          {set.editions.map((edition) => (
            <View key={edition} style={styles.edition}>
              <Text style={styles.editionText}>{edition}</Text>
            </View>
          ))}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Card price range</Text>
          <Text style={styles.price}>
            {set.minimumPrice === null
              ? 'No prices'
              : `${formatCurrency(set.minimumPrice)} - ${formatCurrency(set.maximumPrice)}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function formatYear(value: string): string {
  return new Date(`${value}T00:00:00`).getFullYear().toString();
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
  artwork: {
    alignItems: 'center',
    backgroundColor: colors.surfaceQuiet,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    height: 128,
    justifyContent: 'center',
    padding: spacing.lg,
    position: 'relative',
  },
  primarySymbol: { height: 48, width: 72 },
  artworkName: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  body: {
    gap: spacing.md,
    padding: spacing.md,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  titleCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  editions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    minHeight: 24,
  },
  edition: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  editionText: {
    color: colors.burgundy,
    fontSize: 10,
    fontWeight: '800',
  },
  priceRow: {
    alignItems: 'flex-end',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  priceLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  price: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
});
