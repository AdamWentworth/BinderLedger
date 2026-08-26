import { DollarSign, Percent } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { type MarketMovementMode } from '@/lib/api';

type MarketMovementControlProps = {
  mode: MarketMovementMode;
  onChange: (mode: MarketMovementMode) => void;
};

const modes = [
  { key: 'amount' as const, label: 'Dollars', Icon: DollarSign },
  { key: 'percent' as const, label: 'Percent', Icon: Percent },
];

export function MarketMovementControl({ mode, onChange }: MarketMovementControlProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Rank by</Text>
      <View accessibilityRole="tablist" style={styles.options}>
        {modes.map(({ key, label, Icon }) => {
          const selected = mode === key;
          return (
            <Pressable
              accessibilityLabel={`Rank market movement by ${label.toLowerCase()}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={key}
              onPress={() => onChange(key)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}>
              <Icon color={selected ? colors.text : colors.textMuted} size={14} />
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
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
    gap: 4,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
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
