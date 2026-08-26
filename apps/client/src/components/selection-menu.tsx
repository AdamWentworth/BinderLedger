import { Check, ChevronDown, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

export type SelectionOption<T extends string> = {
  label: string;
  value: T;
};

type SelectionMenuProps<T extends string> = {
  accessibilityLabel: string;
  label: string;
  onChange: (value: T) => void;
  options: SelectionOption<T>[];
  value: T;
};

export function SelectionMenu<T extends string>({
  accessibilityLabel,
  label,
  onChange,
  options,
  value,
}: SelectionMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  const select = (next: T) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <View style={styles.triggerCopy}>
          <Text style={styles.triggerLabel}>{label}</Text>
          <Text numberOfLines={1} style={styles.triggerValue}>
            {selectedLabel}
          </Text>
        </View>
        <ChevronDown color={colors.textMuted} size={16} />
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <SafeAreaView style={styles.overlay}>
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.menu}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>{accessibilityLabel}</Text>
              <Pressable
                accessibilityLabel="Close menu"
                hitSlop={8}
                onPress={() => setOpen(false)}
                style={styles.closeButton}>
                <X color={colors.text} size={19} />
              </Pressable>
            </View>
            <ScrollView bounces={false} style={styles.optionList}>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    key={option.value}
                    onPress={() => select(option.value)}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.optionPressed,
                    ]}>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected ? <Check color={colors.brand} size={18} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    minWidth: 148,
    paddingHorizontal: 12,
    width: '100%',
  },
  triggerPressed: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.brand,
  },
  triggerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  triggerLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  triggerValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: '86%',
    maxWidth: 420,
    overflow: 'hidden',
    width: '100%',
  },
  optionList: {
    flexShrink: 1,
  },
  menuHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  menuTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  option: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.onlineSurface,
  },
  optionPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: colors.text,
    fontWeight: '800',
  },
});
