import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Layers3 } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CardDetailModal } from '@/components/card-detail-modal';
import { CatalogCardTile } from '@/components/catalog-card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { colors, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import {
  CatalogCard,
  CatalogSet,
  getCatalogCards,
  getCatalogSets,
} from '@/lib/api';

const pageSize = 24;

export default function CatalogScreen() {
  const width = useHydratedWidth();
  const compact = width < 760;
  const desktop = width >= 1040;
  const columns = width >= 1280 ? 3 : width >= 760 ? 2 : 1;
  const [selectedSet, setSelectedSet] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);

  const setsQuery = useQuery({
    queryKey: ['catalog', 'sets'],
    queryFn: ({ signal }) => getCatalogSets(signal),
  });
  const cardsQuery = useQuery({
    queryKey: ['catalog', 'cards', selectedSet, search, offset],
    queryFn: ({ signal }) =>
      getCatalogCards({
        setId: selectedSet,
        query: search,
        limit: pageSize,
        offset,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const sets = setsQuery.data ?? [];
  const cards = cardsQuery.data?.cards ?? [];
  const total = cardsQuery.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + pageSize, total);
  const hasPrevious = offset > 0;
  const hasNext = offset + pageSize < total;
  const summary = setsQuery.isSuccess
    ? `${sets.reduce((sum, set) => sum + set.cardCount, 0)} cards across ${sets.length} collected sets.`
    : 'Browse collected legacy Pokemon printings and condition prices.';

  const selectSet = (setID: string) => {
    setSelectedSet(setID);
    setOffset(0);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  return (
    <Screen
      title="Card catalog"
      subtitle={summary}
      toolbar={
        <View style={styles.searchWrap}>
          <SearchField onChangeText={changeSearch} placeholder="Search name or number" value={search} />
        </View>
      }>
      {compact ? (
        <SetStrip selectedSet={selectedSet} sets={sets} onSelect={selectSet} />
      ) : null}

      <View style={styles.catalogLayout}>
        {!compact ? (
          <SetRail selectedSet={selectedSet} sets={sets} onSelect={selectSet} />
        ) : null}

        <View style={styles.results}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultCountWrap}>
              <Layers3 color={colors.brass} size={17} />
              <Text style={styles.resultCount}>
                {cardsQuery.isPending ? 'Loading catalog' : `${total} cards`}
              </Text>
              {total > 0 && (
                <Text style={styles.pageRange}>
                  {pageStart}-{pageEnd}
                </Text>
              )}
            </View>

            <View style={styles.pager}>
              <Pressable
                accessibilityLabel="Previous catalog page"
                accessibilityRole="button"
                disabled={!hasPrevious}
                onPress={() => setOffset(Math.max(0, offset - pageSize))}
                style={[styles.pageButton, !hasPrevious && styles.pageButtonDisabled]}>
                <ChevronLeft color={colors.text} size={19} />
              </Pressable>
              <Pressable
                accessibilityLabel="Next catalog page"
                accessibilityRole="button"
                disabled={!hasNext}
                onPress={() => setOffset(offset + pageSize)}
                style={[styles.pageButton, !hasNext && styles.pageButtonDisabled]}>
                <ChevronRight color={colors.text} size={19} />
              </Pressable>
            </View>
          </View>

          {cardsQuery.isPending ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          ) : cardsQuery.isError ? (
            <EmptyState
              message="The catalog API could not be reached. Check the API status and try again."
              title="Catalog unavailable"
            />
          ) : cards.length === 0 ? (
            <EmptyState
              message="Try another card name, number, or collected set."
              title="No matching cards"
            />
          ) : (
            <View style={[styles.grid, desktop && styles.gridDesktop]}>
              {cards.map((card) => (
                <View
                  key={card.id}
                  style={[
                    styles.gridItem,
                    columns === 1 && styles.gridItemOne,
                    columns === 2 && styles.gridItemTwo,
                    columns === 3 && styles.gridItemThree,
                  ]}>
                  <CatalogCardTile card={card} onPress={setSelectedCard} />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </Screen>
  );
}

type SetSelectorProps = {
  sets: CatalogSet[];
  selectedSet: string;
  onSelect: (setID: string) => void;
};

function SetRail({ sets, selectedSet, onSelect }: SetSelectorProps) {
  return (
    <View style={styles.setRail}>
      <Text style={styles.setRailTitle}>Collected sets</Text>
      <SetButton
        cardCount={sets.reduce((sum, set) => sum + set.cardCount, 0)}
        label="All cards"
        onPress={() => onSelect('')}
        selected={!selectedSet}
      />
      {sets.map((set) => (
        <SetButton
          cardCount={set.cardCount}
          key={set.id}
          label={set.name}
          onPress={() => onSelect(set.id)}
          selected={selectedSet === set.id}
        />
      ))}
    </View>
  );
}

function SetStrip({ sets, selectedSet, onSelect }: SetSelectorProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.setStrip}
      horizontal
      showsHorizontalScrollIndicator={false}>
      <SetChip label="All cards" onPress={() => onSelect('')} selected={!selectedSet} />
      {sets.map((set) => (
        <SetChip
          key={set.id}
          label={set.name}
          onPress={() => onSelect(set.id)}
          selected={selectedSet === set.id}
        />
      ))}
    </ScrollView>
  );
}

type SetButtonProps = {
  label: string;
  cardCount: number;
  selected: boolean;
  onPress: () => void;
};

function SetButton({ label, cardCount, selected, onPress }: SetButtonProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.setButton,
        selected && styles.setButtonSelected,
        pressed && styles.setButtonPressed,
      ]}>
      <Text style={[styles.setButtonText, selected && styles.setButtonTextSelected]}>{label}</Text>
      <Text style={styles.setButtonCount}>{cardCount}</Text>
    </Pressable>
  );
}

type SetChipProps = Omit<SetButtonProps, 'cardCount'>;

function SetChip({ label, selected, onPress }: SetChipProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.setChip, selected && styles.setChipSelected]}>
      <Text style={[styles.setChipText, selected && styles.setChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    maxWidth: 360,
    minWidth: 260,
    width: '100%',
  },
  catalogLayout: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  setRail: {
    borderRightColor: colors.border,
    borderRightWidth: 1,
    gap: spacing.xs,
    paddingRight: spacing.md,
    width: 220,
  },
  setRailTitle: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '800',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    textTransform: 'uppercase',
  },
  setButton: {
    alignItems: 'center',
    borderLeftColor: 'transparent',
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  setButtonSelected: {
    backgroundColor: colors.surfaceRaised,
    borderLeftColor: colors.brand,
  },
  setButtonPressed: {
    backgroundColor: colors.surfaceQuiet,
  },
  setButtonText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  setButtonTextSelected: {
    color: colors.text,
  },
  setButtonCount: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '700',
  },
  setStrip: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  setChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 13,
  },
  setChipSelected: {
    backgroundColor: colors.onlineSurface,
    borderColor: colors.brand,
  },
  setChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  setChipTextSelected: {
    color: colors.brand,
  },
  results: {
    flex: 1,
    minWidth: 0,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    minHeight: 38,
  },
  resultCountWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resultCount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  pageRange: {
    color: colors.textMuted,
    fontSize: 12,
  },
  pager: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pageButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pageButtonDisabled: {
    opacity: 0.34,
  },
  loading: {
    alignItems: 'center',
    minHeight: 360,
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridDesktop: {
    gap: spacing.lg,
  },
  gridItem: {
    minWidth: 0,
  },
  gridItemOne: {
    width: '100%',
  },
  gridItemTwo: {
    width: '48.5%',
  },
  gridItemThree: {
    width: '30.5%',
  },
});
