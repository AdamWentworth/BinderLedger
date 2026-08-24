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
import { MarketConditionControl } from '@/components/market-condition-control';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { SelectionMenu } from '@/components/selection-menu';
import { SetDetailModal } from '@/components/set-detail-modal';
import { colors, getUsablePageWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import {
  type CatalogListing,
  type CatalogListingSort,
  type CatalogSet,
  getCatalogListings,
  getCatalogSets,
} from '@/lib/api';
import { useCatalogPreferences } from '@/providers/catalog-preferences';

const pageSize = 24;
type CatalogMode = 'cards' | 'sets';
type CatalogEdition = '' | 'Unlimited' | 'First Edition';
type CatalogFinish = '' | 'Normal' | 'Holofoil' | 'Reverse Holofoil';

const editionOptions: { label: string; value: CatalogEdition }[] = [
  { label: 'All editions', value: '' },
  { label: 'Unlimited', value: 'Unlimited' },
  { label: 'First Edition', value: 'First Edition' },
];
const finishOptions: { label: string; value: CatalogFinish }[] = [
  { label: 'All finishes', value: '' },
  { label: 'Normal', value: 'Normal' },
  { label: 'Holofoil', value: 'Holofoil' },
  { label: 'Reverse Holofoil', value: 'Reverse Holofoil' },
];
const sortOptions: { label: string; value: CatalogListingSort }[] = [
  { label: 'Set number', value: 'set_number' },
  { label: 'Price: high to low', value: 'price_desc' },
  { label: 'Price: low to high', value: 'price_asc' },
  { label: 'Name: A to Z', value: 'name_asc' },
  { label: 'Name: Z to A', value: 'name_desc' },
];

export default function CatalogScreen() {
  const { condition, setCondition } = useCatalogPreferences();
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
  const [edition, setEdition] = useState<CatalogEdition>('');
  const [finish, setFinish] = useState<CatalogFinish>('');
  const [sort, setSort] = useState<CatalogListingSort>('set_number');
  const [offset, setOffset] = useState(0);
  const [selectedListing, setSelectedListing] = useState<CatalogListing | null>(null);
  const [selectedPricingSet, setSelectedPricingSet] = useState<CatalogSet | null>(null);

  const setsQuery = useQuery({
    queryKey: ['catalog', 'sets'],
    queryFn: ({ signal }) => getCatalogSets(signal),
  });
  const listingsQuery = useQuery({
    queryKey: [
      'catalog',
      'listings',
      selectedSet,
      cardSearch,
      edition,
      finish,
      condition,
      sort,
      offset,
    ],
    queryFn: ({ signal }) =>
      getCatalogListings({
        setId: selectedSet,
        query: cardSearch,
        edition,
        finish,
        condition,
        sort,
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
  const listings = listingsQuery.data?.listings ?? [];
  const total = listingsQuery.data?.total ?? 0;
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
  const changeCondition = (value: Parameters<typeof setCondition>[0]) => {
    setCondition(value);
    setOffset(0);
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

          <View style={[styles.filterBar, compact && styles.filterBarCompact]}>
            <View style={[styles.conditionFilter, compact && styles.conditionFilterCompact]}>
              <Text style={styles.filterLabel}>Price condition</Text>
              <MarketConditionControl condition={condition} onChange={changeCondition} />
            </View>
            <View style={[styles.filterMenus, compact && styles.filterMenusCompact]}>
              <View style={[styles.filterMenu, compact && styles.filterMenuCompact]}>
                <SelectionMenu
                  accessibilityLabel="Filter by edition"
                  label="Edition"
                  onChange={(value) => {
                    setEdition(value);
                    setOffset(0);
                  }}
                  options={editionOptions}
                  value={edition}
                />
              </View>
              <View style={[styles.filterMenu, compact && styles.filterMenuCompact]}>
                <SelectionMenu
                  accessibilityLabel="Filter by finish"
                  label="Finish"
                  onChange={(value) => {
                    setFinish(value);
                    setOffset(0);
                  }}
                  options={finishOptions}
                  value={finish}
                />
              </View>
              <View style={[styles.filterMenu, compact && styles.filterMenuCompact]}>
                <SelectionMenu
                  accessibilityLabel="Sort catalog"
                  label="Sort"
                  onChange={(value) => {
                    setSort(value);
                    setOffset(0);
                  }}
                  options={sortOptions}
                  value={sort}
                />
              </View>
            </View>
          </View>

          <View style={styles.catalogLayout}>
            {!compact ? (
              <SetRail selectedSet={selectedSet} sets={sets} onSelect={selectSet} />
            ) : null}

            <View style={styles.results}>
              <View style={styles.resultsHeader}>
                <View style={styles.resultCountWrap}>
                  <Layers3 color={colors.brass} size={17} />
                  <Text style={styles.resultCount}>
                    {listingsQuery.isPending ? 'Loading catalog' : `${total} printings`}
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

              {listingsQuery.isPending ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={colors.brand} size="large" />
                </View>
              ) : listingsQuery.isError ? (
                <EmptyState
                  message="The catalog API could not be reached. Check the API status and try again."
                  title="Catalog unavailable"
                />
              ) : listings.length === 0 ? (
                <EmptyState
                  message="Try another card name, number, or collected set."
                  title="No matching cards"
                />
              ) : (
                <View style={[styles.grid, desktop && styles.gridDesktop]}>
                  {listings.map((listing) => (
                    <View
                      key={listing.id}
                      style={[
                        styles.gridItem,
                        columns === 1 && styles.gridItemOne,
                        columns === 2 && styles.gridItemTwo,
                        columns === 3 && styles.gridItemThree,
                      ]}>
                      <CatalogCardTile
                        condition={condition}
                        listing={listing}
                        onPress={setSelectedListing}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </>
      )}

      <CardDetailModal listing={selectedListing} onClose={() => setSelectedListing(null)} />
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
  filterBar: {
    alignItems: 'flex-end',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterBarCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  conditionFilter: {
    flexShrink: 0,
    gap: spacing.xs,
    width: 280,
  },
  conditionFilterCompact: {
    width: '100%',
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  filterMenus: {
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  filterMenusCompact: {
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  filterMenu: {
    flexShrink: 1,
    minWidth: 0,
  },
  filterMenuCompact: {
    flexBasis: '48%',
    flexGrow: 1,
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
