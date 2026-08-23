import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Image
        resizeMode="contain"
        source={require('@/assets/images/binderledger-mark.png')}
        style={styles.image}
      />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 260,
    padding: spacing.xl,
  },
  image: {
    height: 104,
    width: 104,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 360,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
