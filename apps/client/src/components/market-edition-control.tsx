import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { type MarketEdition } from '@/lib/api';

type MarketEditionControlProps = {
  edition: MarketEdition;
  onChange: (edition: MarketEdition) => void;
};

const editions: { accessibilityLabel: string; label: string; value: MarketEdition }[] = [
  { accessibilityLabel: 'All editions', label: 'All', value: '' },
  { accessibilityLabel: 'First Edition only', label: '1st Edition', value: 'First Edition' },
  { accessibilityLabel: 'Unlimited only', label: 'Unlimited', value: 'Unlimited' },
];

export function MarketEditionControl({ edition, onChange }: MarketEditionControlProps) {
  return (
    <View accessibilityLabel="Market edition scope" accessibilityRole="tablist" style={styles.options}>
      {editions.map((option) => {
        const selected = edition === option.value;
        return (
          <Pressable
            accessibilityLabel={option.accessibilityLabel}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value || 'all'}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}>
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function marketEditionLabel(edition: MarketEdition): string {
  return edition || 'All editions';
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
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 74,
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
