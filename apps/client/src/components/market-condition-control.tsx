import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { type MarketCondition } from '@/lib/api';

export const marketConditions: { key: MarketCondition; short: string }[] = [
  { key: 'Near Mint', short: 'NM' },
  { key: 'Lightly Played', short: 'LP' },
  { key: 'Moderately Played', short: 'MP' },
  { key: 'Heavily Played', short: 'HP' },
  { key: 'Damaged', short: 'DMG' },
];

type MarketConditionControlProps = {
  condition: MarketCondition;
  onChange: (condition: MarketCondition) => void;
  abbreviate?: boolean;
};

export function MarketConditionControl({
  condition,
  onChange,
  abbreviate = true,
}: MarketConditionControlProps) {
  return (
    <View accessibilityRole="tablist" style={styles.conditions}>
      {marketConditions.map((option) => {
        const selected = option.key === condition;
        return (
          <Pressable
            accessibilityLabel={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.condition, selected && styles.conditionSelected]}>
            <Text style={[styles.conditionText, selected && styles.conditionTextSelected]}>
              {abbreviate ? option.short : option.key}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function shortCondition(condition: MarketCondition): string {
  return marketConditions.find((option) => option.key === condition)?.short ?? condition;
}

const styles = StyleSheet.create({
  conditions: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    padding: 3,
  },
  condition: {
    alignItems: 'center',
    borderRadius: 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 44,
    paddingHorizontal: 8,
  },
  conditionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  conditionText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  conditionTextSelected: {
    color: colors.text,
  },
});
