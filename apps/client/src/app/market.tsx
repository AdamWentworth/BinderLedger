import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/theme';

const periods = ['1D', '1W', '1M', '1Y', 'All'] as const;

export default function MarketScreen() {
  const [period, setPeriod] = useState<(typeof periods)[number]>('1M');

  return (
    <Screen
      title="Market"
      subtitle="Price movement for the legacy sets and printings in your scope."
      toolbar={
        <View accessibilityRole="tablist" style={styles.periods}>
          {periods.map((option) => {
            const selected = option === period;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={option}
                onPress={() => setPeriod(option)}
                style={[styles.period, selected && styles.periodSelected]}>
                <Text style={[styles.periodText, selected && styles.periodTextSelected]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }>
      <View style={styles.movers}>
        <View style={styles.moverHeading}>
          <ArrowUpRight color={colors.positive} size={19} />
          <Text style={styles.moverTitle}>Rising</Text>
          <Text style={styles.moverCount}>0 cards</Text>
        </View>
        <View style={styles.moverHeading}>
          <ArrowDownRight color={colors.negative} size={19} />
          <Text style={styles.moverTitle}>Falling</Text>
          <Text style={styles.moverCount}>0 cards</Text>
        </View>
      </View>

      <EmptyState
        message={`No ${period} movement is available until price observations are imported.`}
        title="No market history yet"
      />
    </Screen>
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
  movers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  moverHeading: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    minWidth: 240,
    paddingHorizontal: spacing.md,
  },
  moverTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  moverCount: {
    color: colors.textMuted,
    fontSize: 12,
    marginLeft: 'auto',
  },
});
