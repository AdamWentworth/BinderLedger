import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { getHealth } from '@/lib/api';

export function ConnectionStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    retry: 1,
    refetchInterval: 30_000,
  });

  const isOnline = health.data?.status === 'ok';
  const label = health.isPending ? 'Connecting' : isOnline ? 'API online' : 'API offline';

  return (
    <View
      accessibilityLabel={label}
      style={[styles.status, !isOnline && !health.isPending && styles.statusOffline]}>
      <View
        style={[
          styles.dot,
          health.isPending && styles.dotPending,
          !isOnline && !health.isPending && styles.dotOffline,
        ]}
      />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: 'center',
    backgroundColor: '#E4F1EB',
    borderColor: '#BDD8CB',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  statusOffline: {
    backgroundColor: '#F7E9EB',
    borderColor: '#E5C2C8',
  },
  dot: {
    backgroundColor: colors.positive,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotPending: {
    backgroundColor: colors.brass,
  },
  dotOffline: {
    backgroundColor: colors.negative,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
