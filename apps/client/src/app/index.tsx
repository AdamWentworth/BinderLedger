import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, CreditCard, Layers3, Library } from 'lucide-react-native';
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
import { CatalogSetTile } from '@/components/catalog-set';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { SetDetailModal } from '@/components/set-detail-modal';
import { colors, getUsablePageWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import {
  CatalogCard,
  CatalogSet,
  getCatalogCards,
  getCatalogSets,
} from '@/lib/api';

const pageSize = 24;
type CatalogMode = 'cards' | 'sets';

export default function CatalogScreen() {
  const width = useHydratedWidth();
  const pageWidth = getUsablePageWidth(width);
  const compact = pageWidth < 760;
  const desktop = pageWidth >= 1040;
  const columns = pageWidth >= 1040 ? 3 : pageWidth >= 760 ? 2 : 1;
  const setColumns = pageWidth >= 1040 ? 3 : pageWidth >= 620 ? 2 : 1;
  const [mode, setMode] = useState<CatalogMode>('cards');
  const [selectedSet, setSelectedSet] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [setSearch, setSetSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [selectedPricingSet, setSelectedPricingSet] = useState<CatalogSet | null>(null);

  const setsQuery = useQuery({
    queryKey: ['catalog', 'sets'],
    queryFn: ({ signal }) => getCatalogSets(signal),
  });
  const cardsQuery = useQuery({
    queryKey: ['catalog', 'cards', selectedSet, cardSearch, offset],
    queryFn: ({ signal }) =>
      getCatalogCards({
        setId: selectedSet,
        query: cardSearch,
        limit: pageSize,
        offset,
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: mode === 'cards',
  });

  const sets = setsQuery.data ?? [];
  const filteredSets = sets.filter((set) =>
    set.name.toLocaleLowerCase().includes(setSearch.trim().toLocaleLowerCase()),
  );
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
    if (mode === 'cards') {
      setCardSearch(value);
      setOffset(0);
    } else {
      setSetSearch(value);
    }
  };

  return (
    <Screen
      title="Card catalog"
      subtitle={summary}
      toolbar={
        <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
          <View style={[styles.searchWrap, compact && styles.searchWrapCompact]}>
            <SearchField
              onChangeText={changeSearch}
              placeholder={mode === 'cards' ? 'Search name or number' : 'Search sets'}
              value={mode === 'cards' ? cardSearch : setSearch}
            />
          </View>
          <CatalogModeControl mode={mode} onChange={setMode} />
        </View>
      }>
      {mode === 'sets' ? (
        <View style={styles.results}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultCountWrap}>
              <Library color={colors.brass} size={17} />
              <Text style={styles.resultCount}>
                {setsQuery.isPending ? 'Loading sets' : `${filteredSets.length} sets`}
              </Text>
            </View>
          </View>
          {setsQuery.isPending ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          ) : setsQuery.isError ? (
            <EmptyState message="The set catalog could not be reached." title="Sets unavailable" />
          ) : filteredSets.length === 0 ? (
            <EmptyState message="Try another set name." title="No matching sets" />
          ) : (
            <View style={[styles.grid, desktop && styles.gridDesktop]}>
              {filteredSets.map((set) => (
                <View
                  key={set.id}
                  style={[
                    styles.gridItem,
                    setColumns === 1 && styles.gridItemOne,
                    setColumns === 2 && styles.gridItemTwo,
                    setColumns === 3 && styles.gridItemThree,
                  ]}>
                  <CatalogSetTile onPress={setSelectedPricingSet} set={set} />
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <>
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
                  {total > 0 && <Text style={styles.pageRange}>{pageStart}-{pageEnd}</Text>}
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
        </>
      )}

      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      <SetDetailModal set={selectedPricingSet} onClose={() => setSelectedPricingSet(null)} />
    </Screen>
  );
}

function CatalogModeControl({
  mode,
  onChange,
}: {
  mode: CatalogMode;
  onChange: (mode: CatalogMode) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.modeControl}>
      <ModeButton
        icon={<CreditCard color={mode === 'cards' ? colors.text : colors.textMuted} size={16} />}
        label="Cards"
        onPress={() => onChange('cards')}
        selected={mode === 'cards'}
      />
      <ModeButton
        icon={<Library color={mode === 'sets' ? colors.text : colors.textMuted} size={16} />}
        label="Sets"
        onPress={() => onChange('sets')}
        selected={mode === 'sets'}
      />
    </View>
  );
}

function ModeButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.modeButton, selected && styles.modeButtonSelected]}>
      {icon}
      <Text style={[styles.modeButtonText, selected && styles.modeButtonTextSelected]}>{label}</Text>
    </Pressable>
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
          symbolURL={set.symbolUrl}
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
          symbolURL={set.symbolUrl}
        />
      ))}
    </ScrollView>
  );
}

type SetButtonProps = {
  label: string;
  cardCount: number;
  selected: boolean;
  symbolURL?: string | null;
  onPress: () => void;
};

function SetButton({ label, cardCount, selected, symbolURL, onPress }: SetButtonProps) {
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
      <SetSymbol label={label} symbolURL={symbolURL} />
      <Text style={[styles.setButtonText, selected && styles.setButtonTextSelected]}>{label}</Text>
      <Text style={styles.setButtonCount}>{cardCount}</Text>
    </Pressable>
  );
}

type SetChipProps = Omit<SetButtonProps, 'cardCount'>;

function SetChip({ label, selected, symbolURL, onPress }: SetChipProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.setChip, selected && styles.setChipSelected]}>
      <SetSymbol label={label} symbolURL={symbolURL} />
      <Text style={[styles.setChipText, selected && styles.setChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function SetSymbol({ label, symbolURL }: { label: string; symbolURL?: string | null }) {
  return (
    <View accessibilityLabel={`${label} symbol`} style={styles.setSymbolFrame}>
      {symbolURL ? (
        <Image contentFit="contain" source={symbolURL} style={styles.setSymbol} />
      ) : (
        <Layers3 color={colors.brass} size={15} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    maxWidth: 560,
    minWidth: 440,
  },
  toolbarCompact: {
    alignItems: 'stretch',
    flexBasis: 'auto',
    flexDirection: 'column',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
    minWidth: 0,
    width: '100%',
  },
  searchWrap: {
    flex: 1,
    maxWidth: 360,
    minWidth: 260,
    width: '100%',
  },
  searchWrapCompact: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
    minWidth: 0,
  },
  modeControl: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    padding: 3,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 84,
    paddingHorizontal: spacing.sm,
  },
  modeButtonSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  modeButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  modeButtonTextSelected: {
    color: colors.text,
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
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
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
  setSymbolFrame: {
    alignItems: 'center',
    flexShrink: 0,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  setSymbol: {
    height: 20,
    width: 20,
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
    width: '48%',
  },
  gridItemThree: {
    width: '30.5%',
  },
});
