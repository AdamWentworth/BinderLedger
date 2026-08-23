import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type MetricProps = {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
};

export function Metric({ icon, label, value, note }: MetricProps) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        {icon}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    minWidth: 160,
    padding: spacing.md,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
