import { Image } from 'expo-image';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { formatCurrency, formatPercent, MarketMover } from '@/lib/api';

type MarketMoverRowProps = {
  mover: MarketMover;
  onPress: () => void;
  selected: boolean;
};

export function MarketMoverRow({ mover, onPress, selected }: MarketMoverRowProps) {
  const rising = mover.changePercent >= 0;
  const accent = rising ? colors.positive : colors.negative;
  const Arrow = rising ? ArrowUpRight : ArrowDownRight;

  return (
    <Pressable
      accessibilityLabel={`View ${mover.cardName} ${mover.printing} price history`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.imageFrame}>
        {mover.imageUrl ? (
          <Image contentFit="contain" source={mover.imageUrl} style={styles.image} />
        ) : null}
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
      <View style={styles.change}>
        <Arrow color={accent} size={18} />
        <Text style={[styles.changePercent, { color: accent }]}>
          {formatPercent(mover.changePercent)}
        </Text>
        <Text style={styles.changeAmount}>{formatCurrency(Math.abs(mover.changeAmount))}</Text>
      </View>
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
  change: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  changePercent: {
    fontSize: 14,
    fontWeight: '800',
  },
  changeAmount: {
    color: colors.textMuted,
    fontSize: 10,
  },
});
