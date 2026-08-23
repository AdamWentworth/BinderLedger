import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { type MarketPeriod } from '@/lib/api';

const periods: { key: MarketPeriod; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
];

type MarketPeriodControlProps = {
  period: MarketPeriod;
  onChange: (period: MarketPeriod) => void;
};

export function MarketPeriodControl({ period, onChange }: MarketPeriodControlProps) {
  return (
    <View accessibilityRole="tablist" style={styles.periods}>
      {periods.map((option) => {
        const selected = option.key === period;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.period, selected && styles.periodSelected]}>
            <Text style={[styles.periodText, selected && styles.periodTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  periods: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    padding: 3,
  },
  period: {
    alignItems: 'center',
    borderRadius: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 42,
    paddingHorizontal: 9,
  },
  periodSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  periodText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  periodTextSelected: {
    color: colors.text,
  },
});
