import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors } from '@/constants/theme';

type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function SearchField({ value, onChangeText, placeholder = 'Search cards' }: SearchFieldProps) {
  return (
    <View style={styles.container}>
      <Search color={colors.textMuted} size={18} strokeWidth={2} />
      <TextInput
        accessibilityLabel={placeholder}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.brand}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 13,
    width: '100%',
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    minWidth: 0,
    paddingVertical: 10,
  },
});
