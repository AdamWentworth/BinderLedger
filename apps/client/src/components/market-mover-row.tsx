import { Image } from 'expo-image';
import { AlertTriangle, ImageOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { MarketMovementValue } from '@/components/market-movement-value';
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  type MarketMovementMode,
  type MarketMover,
  resolveImageURL,
} from '@/lib/api';

type MarketMoverRowProps = {
  mover: MarketMover;
  movementMode: MarketMovementMode;
  onPress: () => void;
  rank?: number;
  selected: boolean;
};

export function MarketMoverRow({
  mover,
  movementMode,
  onPress,
  rank,
  selected,
}: MarketMoverRowProps) {
  return (
    <Pressable
      accessibilityHint="Shows this card in the price history chart"
      accessibilityLabel={`${mover.cardName}, ${mover.setName}, ${mover.printing}. ${formatCurrency(mover.endPrice)} current price. Change ${formatSignedCurrency(mover.changeAmount)}, ${formatPercent(mover.changePercent)}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      {rank ? <Text style={styles.rank}>{rank}</Text> : null}
      <View style={styles.imageFrame}>
        {mover.imageUrl ? (
          <Image
            accessibilityElementsHidden
            contentFit="contain"
            source={resolveImageURL(mover.imageUrl)}
            style={styles.image}
          />
        ) : (
          <ImageOff color={colors.textMuted} size={22} />
        )}
      </View>
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.name}>
            {mover.cardName}
          </Text>
          {mover.signal !== 'regular' ? (
            <View style={styles.signal}>
              <AlertTriangle color={colors.warning} size={12} />
              <Text style={styles.signalText}>
                {mover.signal === 'volatile' ? 'Volatile' : 'Limited'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          {mover.setName} / {mover.printing}
        </Text>
        <Text style={styles.pricePath}>
          {formatCurrency(mover.startPrice)} to {formatCurrency(mover.endPrice)}
        </Text>
      </View>
      <MarketMovementValue
        amount={mover.changeAmount}
        mode={movementMode}
        percent={mover.changePercent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 86,
    padding: spacing.sm,
  },
  selected: {
    borderColor: colors.brand,
    borderWidth: 2,
    padding: 7,
  },
  rank: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    minWidth: 22,
    textAlign: 'center',
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  imageFrame: {
    alignItems: 'center',
    alignSelf: 'stretch',
    aspectRatio: 0.714,
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  name: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  signal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  signalText: {
    color: colors.warning,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  pricePath: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
