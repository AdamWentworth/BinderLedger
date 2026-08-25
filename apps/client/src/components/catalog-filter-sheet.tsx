import {
  BadgeCheck,
  Check,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarketConditionControl } from '@/components/market-condition-control';
import { colors, spacing } from '@/constants/theme';
import { type CatalogEdition } from '@/lib/catalog-set-groups';
import { type CatalogListingSort, type MarketCondition } from '@/lib/api';

export type CatalogFinish = '' | 'Normal' | 'Holofoil' | 'Reverse Holofoil';

export const catalogEditionOptions: { label: string; value: CatalogEdition }[] = [
  { label: 'All editions', value: '' },
  { label: 'First Edition', value: 'First Edition' },
  { label: 'Shadowless', value: 'Shadowless' },
  { label: 'Unlimited', value: 'Unlimited' },
];

export const catalogFinishOptions: { label: string; value: CatalogFinish }[] = [
  { label: 'All finishes', value: '' },
  { label: 'Normal', value: 'Normal' },
  { label: 'Holofoil', value: 'Holofoil' },
  { label: 'Reverse Holofoil', value: 'Reverse Holofoil' },
];

export const catalogSortOptions: { label: string; value: CatalogListingSort }[] = [
  { label: 'Set number', value: 'set_number' },
  { label: 'Price: high to low', value: 'price_desc' },
  { label: 'Price: low to high', value: 'price_asc' },
  { label: 'Name: A to Z', value: 'name_asc' },
  { label: 'Name: Z to A', value: 'name_desc' },
];

export type CatalogFilterValues = {
  condition: MarketCondition;
  edition: CatalogEdition;
  finish: CatalogFinish;
  gradedOnly: boolean;
  sort: CatalogListingSort;
};

type CatalogFilterSheetProps = {
  onApply: (values: CatalogFilterValues) => void;
  onClose: () => void;
  showEdition: boolean;
  values: CatalogFilterValues;
};

export function CatalogFilterSheet({
  onApply,
  onClose,
  showEdition,
  values,
}: CatalogFilterSheetProps) {
  const [condition, setCondition] = useState(values.condition);
  const [edition, setEdition] = useState(values.edition);
  const [finish, setFinish] = useState(values.finish);
  const [gradedOnly, setGradedOnly] = useState(values.gradedOnly);
  const [sort, setSort] = useState(values.sort);

  const reset = () => {
    setCondition('Near Mint');
    if (showEdition) setEdition('');
    setFinish('');
    setGradedOnly(false);
    setSort('set_number');
  };

  const apply = () => {
    onApply({
      condition,
      edition: showEdition ? edition : values.edition,
      finish,
      gradedOnly,
      sort,
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <SafeAreaView edges={['bottom']} style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close catalog filters"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <SlidersHorizontal color={colors.brass} size={19} />
              <Text style={styles.title}>Catalog filters</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Reset catalog filters"
                accessibilityRole="button"
                onPress={reset}
                style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
                <RotateCcw color={colors.textMuted} size={15} />
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Close catalog filters"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <X color={colors.text} size={20} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <FilterSection label="Price condition">
              <MarketConditionControl condition={condition} onChange={setCondition} />
            </FilterSection>

            {showEdition ? (
              <FilterSection label="Edition">
                <ChoiceGrid onChange={setEdition} options={catalogEditionOptions} value={edition} />
              </FilterSection>
            ) : null}

            <FilterSection label="Finish">
              <ChoiceGrid onChange={setFinish} options={catalogFinishOptions} value={finish} />
            </FilterSection>

            <FilterSection label="Pricing">
              <View style={[styles.switchRow, gradedOnly && styles.switchRowSelected]}>
                <View style={styles.switchCopy}>
                  <BadgeCheck color={gradedOnly ? colors.brand : colors.textMuted} size={18} />
                  <View style={styles.switchTextWrap}>
                    <Text style={styles.switchTitle}>Graded pricing only</Text>
                    <Text style={styles.switchNote}>Only cards with graded reference values</Text>
                  </View>
                </View>
                <Switch
                  accessibilityLabel="Show only printings with graded prices"
                  onValueChange={setGradedOnly}
                  thumbColor={gradedOnly ? colors.text : colors.textMuted}
                  trackColor={{ false: colors.surfaceQuiet, true: colors.brandPressed }}
                  value={gradedOnly}
                />
              </View>
            </FilterSection>

            <FilterSection label="Sort">
              <View style={styles.sortList}>
                {catalogSortOptions.map((option) => {
                  const selected = option.value === sort;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={option.value}
                      onPress={() => setSort(option.value)}
                      style={({ pressed }) => [
                        styles.sortOption,
                        selected && styles.sortOptionSelected,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.sortText, selected && styles.choiceTextSelected]}>
                        {option.label}
                      </Text>
                      {selected ? <Check color={colors.brand} size={17} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </FilterSection>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={apply}
              style={({ pressed }) => [styles.applyButton, pressed && styles.applyButtonPressed]}>
              <Check color={colors.navigation} size={18} />
              <Text style={styles.applyText}>Apply filters</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChoiceGrid<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <View style={styles.choiceGrid}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={option.value || 'all'}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.choiceSelected,
              pressed && styles.pressed,
            ]}>
            <Text numberOfLines={2} style={[styles.choiceText, selected && styles.choiceTextSelected]}>
              {option.label}
            </Text>
            {selected ? <Check color={colors.brand} size={16} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    maxHeight: '90%',
    maxWidth: 560,
    overflow: 'hidden',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.md,
  },
  headerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  resetButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  resetText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  closeButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  body: {
    gap: spacing.lg,
    padding: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.brass,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  choiceSelected: {
    backgroundColor: colors.onlineSurface,
    borderColor: colors.onlineBorder,
  },
  choiceText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: colors.text,
    fontWeight: '800',
  },
  switchRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 12,
  },
  switchRowSelected: {
    backgroundColor: colors.onlineSurface,
    borderColor: colors.onlineBorder,
  },
  switchCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  switchTextWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  switchTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  switchNote: {
    color: colors.textMuted,
    fontSize: 11,
  },
  sortList: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sortOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  sortOptionSelected: {
    backgroundColor: colors.onlineSurface,
  },
  sortText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.md,
  },
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 6,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  applyButtonPressed: {
    backgroundColor: colors.brandPressed,
  },
  applyText: {
    color: colors.navigation,
    fontSize: 14,
    fontWeight: '800',
  },
});
