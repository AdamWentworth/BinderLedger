import { PropsWithChildren, ReactNode, useEffect, useRef } from 'react';
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
  condensed?: boolean;
  scrollResetKey?: string | number;
}>;

export function Screen({
  title,
  subtitle,
  toolbar,
  condensed = false,
  scrollResetKey,
  children,
}: ScreenProps) {
  const width = useHydratedWidth();
  const compact = width < 720;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollResetKey === undefined) return;
    scrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [scrollResetKey]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          compact ? styles.scrollContentCompact : styles.scrollContentWide,
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <View style={styles.brandMarkFrame}>
                <Image
                  resizeMode="contain"
                  source={require('@/assets/images/binderledger-mark.png')}
                  style={styles.brandMark}
                />
              </View>
              <Text style={styles.brandName}>
                Binder<Text style={styles.brandNameAccent}>Ledger</Text>
              </Text>
            </View>
            <ConnectionStatus />
          </View>

          <View
            style={[
              styles.headingRow,
              compact && styles.headingRowCompact,
              condensed && styles.headingRowCondensed,
            ]}>
            <View style={[styles.headingCopy, compact && styles.headingCopyCompact]}>
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
    width: 28,
  },
  brandMarkFrame: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 40,
  },
  brandName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandNameAccent: {
    color: colors.brass,
  },
  headingRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl,
  },
  headingRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  headingRowCondensed: {
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
  },
  headingCopy: {
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.xs,
    minWidth: 240,
  },
  headingCopyCompact: {
    minWidth: 0,
    width: '100%',
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
