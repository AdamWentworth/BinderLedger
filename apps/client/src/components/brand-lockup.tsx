import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

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
      <Image
        contentFit="contain"
        source={require('../../assets/images/binderledger-wordmark-header.png')}
        style={styles.wordmark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  mark: {
    borderRadius: 7,
    height: 42,
    width: 28,
  },
  wordmark: {
    height: 26,
    width: 151,
  },
});
