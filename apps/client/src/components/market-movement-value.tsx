import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import {
  formatPercent,
  formatSignedCurrency,
  type MarketMovementMode,
} from '@/lib/api';

type MarketMovementValueProps = {
  amount: number | null;
  mode: MarketMovementMode;
  percent: number | null;
  prominent?: boolean;
};

export function MarketMovementValue({
  amount,
  mode,
  percent,
  prominent = false,
}: MarketMovementValueProps) {
  const direction = amount ?? percent ?? 0;
  const accent = direction >= 0 ? colors.positive : colors.negative;
  const Arrow = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus;
  const amountLabel = formatSignedCurrency(amount);
  const percentLabel = formatPercent(percent);
  const primary = mode === 'amount' ? amountLabel : percentLabel;
  const secondary = mode === 'amount' ? percentLabel : amountLabel;

  return (
    <View
      accessibilityLabel={`Change ${amountLabel}, ${percentLabel}`}
      accessible
      style={styles.container}>
      <View style={styles.primaryRow}>
        <Arrow color={accent} size={prominent ? 19 : 16} />
        <Text
          style={[
            styles.primary,
            prominent && styles.primaryProminent,
            { color: accent },
          ]}>
          {primary}
        </Text>
      </View>
      <Text style={[styles.secondary, prominent && styles.secondaryProminent]}>
        {secondary}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  primaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  primary: {
    fontSize: 14,
    fontWeight: '800',
  },
  primaryProminent: {
    fontSize: 17,
  },
  secondary: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  secondaryProminent: {
    fontSize: 12,
  },
});
