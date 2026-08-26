import { Activity, ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { type MarketMovementDirection } from '@/lib/api';

type MarketDirectionControlProps = {
  direction: MarketMovementDirection;
  onChange: (direction: MarketMovementDirection) => void;
};

const directions = [
  { key: 'all' as const, label: 'All', Icon: Activity },
  { key: 'gainers' as const, label: 'Gainers', Icon: ArrowUpRight },
  { key: 'decliners' as const, label: 'Decliners', Icon: ArrowDownRight },
];

export function MarketDirectionControl({ direction, onChange }: MarketDirectionControlProps) {
  return (
    <View accessibilityLabel="Movement direction" accessibilityRole="tablist" style={styles.options}>
      {directions.map(({ key, label, Icon }) => {
        const selected = direction === key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}>
            <Icon
              color={
                selected
                  ? key === 'decliners'
                    ? colors.negative
                    : colors.brand
                  : colors.textMuted
              }
              size={15}
            />
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    padding: 3,
  },
  option: {
    alignItems: 'center',
    borderRadius: 4,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 11,
  },
  optionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  optionPressed: {
    opacity: 0.78,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  optionTextSelected: {
    color: colors.text,
  },
});
