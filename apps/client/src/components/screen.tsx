import { PropsWithChildren, ReactNode } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConnectionStatus } from '@/components/connection-status';
import { colors, contentMaxWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';

type ScreenProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  toolbar?: ReactNode;
}>;

export function Screen({ title, subtitle, toolbar, children }: ScreenProps) {
  const width = useHydratedWidth();
  const compact = width < 720;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          compact ? styles.scrollContentCompact : styles.scrollContentWide,
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <Image
                resizeMode="contain"
                source={require('@/assets/images/binderledger-mark.png')}
                style={styles.brandMark}
              />
              <Text style={styles.brandName}>BinderLedger</Text>
            </View>
            <ConnectionStatus />
          </View>

          <View style={[styles.headingRow, compact && styles.headingRowCompact]}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            {toolbar}
          </View>

          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentCompact: {
    paddingBottom: 104,
    paddingHorizontal: spacing.md,
  },
  scrollContentWide: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  content: {
    alignSelf: 'center',
    maxWidth: contentMaxWidth,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: Platform.OS === 'web' ? 72 : 62,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  brandMark: {
    height: 42,
    width: 42,
  },
  brandName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  headingRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl,
  },
  headingRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  headingCopy: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
