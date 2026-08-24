import { Eye, EyeOff } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type WatchButtonProps = {
  disabled?: boolean;
  error?: boolean;
  loading?: boolean;
  noun: 'card' | 'set';
  onPress: () => void;
  watched: boolean;
};

export function WatchButton({
  disabled = false,
  error = false,
  loading = false,
  noun,
  onPress,
  watched,
}: WatchButtonProps) {
  const blocked = disabled || loading;
  const label = error ? 'Try again' : watched ? 'Watching' : 'Watch';
  const icon = watched ? (
    <EyeOff color={colors.text} size={16} />
  ) : (
    <Eye color={colors.text} size={16} />
  );

  return (
    <Pressable
      accessibilityLabel={`${watched ? 'Remove' : 'Add'} ${noun} ${watched ? 'from' : 'to'} watchlist`}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, selected: watched }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        watched && styles.buttonWatched,
        blocked && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}>
      {loading ? <ActivityIndicator color={colors.text} size="small" /> : icon}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 96,
    paddingHorizontal: spacing.sm,
  },
  buttonWatched: {
    backgroundColor: colors.onlineSurface,
    borderColor: colors.onlineBorder,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { backgroundColor: colors.surfaceQuiet },
  label: { color: colors.text, fontSize: 11, fontWeight: '800' },
});
