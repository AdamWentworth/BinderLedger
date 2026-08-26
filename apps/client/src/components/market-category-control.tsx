import { Layers3, LineChart } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

export type MarketCategory = 'cards' | 'sets';

type MarketCategoryControlProps = {
  category: MarketCategory;
  onChange: (category: MarketCategory) => void;
};

const categories = [
  {
    description: 'Individual price movers',
    Icon: LineChart,
    key: 'cards' as const,
    label: 'Card movement',
  },
  {
    description: 'Edition-specific set baskets',
    Icon: Layers3,
    key: 'sets' as const,
    label: 'Set performance',
  },
];

export function MarketCategoryControl({
  category,
  onChange,
}: MarketCategoryControlProps) {
  return (
    <View accessibilityLabel="Market category" accessibilityRole="tablist" style={styles.tabs}>
      {categories.map(({ description, Icon, key, label }) => {
        const selected = category === key;
        return (
          <Pressable
            accessibilityLabel={`${label}. ${description}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.tabPressed,
            ]}>
            <Icon color={selected ? colors.brand : colors.textMuted} size={19} />
            <View style={styles.copy}>
              <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
              <Text numberOfLines={1} style={styles.description}>
                {description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 3,
    marginBottom: spacing.md,
    padding: 3,
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tabPressed: {
    opacity: 0.78,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  labelSelected: {
    color: colors.text,
  },
  description: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
});
