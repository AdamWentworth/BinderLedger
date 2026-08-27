import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

export function BrandLockup() {
  return (
    <View
      accessibilityLabel="BinderLedger"
      accessibilityRole="header"
      style={styles.container}>
      <Image
        contentFit="cover"
        source={require('../../assets/images/binderledger-mark-header.png')}
        style={styles.mark}
      />
      <View accessible={false} style={styles.wordmark}>
        <Text style={styles.binder}>BINDER</Text>
        <View style={styles.ledgerRow}>
          <Text style={styles.ledger}>LEDGER</Text>
          <View style={styles.rule} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  mark: {
    borderRadius: 7,
    height: 42,
    width: 28,
  },
  wordmark: {
    justifyContent: 'center',
  },
  binder: {
    color: colors.brand,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.8,
    lineHeight: 11,
  },
  ledgerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  ledger: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.15,
    lineHeight: 20,
  },
  rule: {
    backgroundColor: colors.brass,
    borderRadius: 2,
    height: 2,
    width: 14,
  },
});
