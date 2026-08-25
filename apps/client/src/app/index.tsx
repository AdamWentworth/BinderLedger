import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Grid2X2,
  Grid3X3,
  Layers3,
  Library,
  RotateCcw,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { CardDetailModal } from '@/components/card-detail-modal';
import { CatalogCardTile } from '@/components/catalog-card';
import {
  catalogEditionOptions,
  type CatalogFilterValues,
  CatalogFilterSheet,
  catalogFinishOptions,
  catalogSortOptions,
  type CatalogFinish,
} from '@/components/catalog-filter-sheet';
import { CatalogSetTile } from '@/components/catalog-set';
import { EmptyState } from '@/components/empty-state';
import {
  MarketConditionControl,
  shortCondition,
} from '@/components/market-condition-control';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { SelectionMenu } from '@/components/selection-menu';
import { SetDetailModal } from '@/components/set-detail-modal';
import { colors, contentMaxWidth, getUsablePageWidth, spacing } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import {
  buildCatalogSetGroups,
  type CatalogEdition,
  type CatalogSetGroup,
  type CatalogSetView,
  selectedCatalogSetGroup,
  selectedCatalogSetView,
} from '@/lib/catalog-set-groups';
import { formatCatalogDate, getCatalogColumnCount } from '@/lib/catalog-layout';
import {
  type CatalogListing,
  type CatalogListingSort,
  type CatalogSet,
  getCatalogListings,
  getCatalogSets,
} from '@/lib/api';
import {
  type CatalogDensity,
  useCatalogPreferences,
} from '@/providers/catalog-preferences';

const pageSize = 24;
type CatalogMode = 'cards' | 'sets';

type ActiveCatalogFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

export default function CatalogScreen() {
  const { condition, density, setCondition, setDensity } = useCatalogPreferences();
  const width = useHydratedWidth();
  const pageWidth = getUsablePageWidth(width);
  const compact = pageWidth < 760;
  const desktop = pageWidth >= 1040;
  const horizontalPadding = width < 720 ? spacing.md * 2 : spacing.xl * 2;
  const contentWidth = Math.max(0, Math.min(pageWidth, contentMaxWidth) - horizontalPadding);
  const resultsWidth = Math.max(
    0,
    contentWidth - (compact ? 0 : 232 + spacing.lg),
  );
  const gridGap = desktop ? spacing.lg : spacing.md;
  const columns = getCatalogColumnCount(resultsWidth, density, gridGap);
  const setColumns = pageWidth >= 1040 ? 3 : pageWidth >= 620 ? 2 : 1;
  const [mode, setMode] = useState<CatalogMode>('cards');
  const [selectedSet, setSelectedSet] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [setSearch, setSetSearch] = useState('');
  const [edition, setEdition] = useState<CatalogEdition>('');
  const [finish, setFinish] = useState<CatalogFinish>('');
  const [gradedOnly, setGradedOnly] = useState(false);
  const [sort, setSort] = useState<CatalogListingSort>('set_number');
  const [offset, setOffset] = useState(0);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
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
      gradedOnly,
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
        gradedOnly,
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
  const setGroups = buildCatalogSetGroups(sets);
  const selectedGroup = selectedCatalogSetGroup(setGroups, selectedSet, edition);
  const selectedView = selectedCatalogSetView(selectedGroup, selectedSet, edition);
  const totalPrintingCount = sets.reduce((sum, set) => sum + set.printingCount, 0);
  const filteredSets = sets.filter((set) =>
    set.name.toLocaleLowerCase().includes(setSearch.trim().toLocaleLowerCase()),
  );
  const listings = listingsQuery.data?.listings ?? [];
  const total = listingsQuery.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + pageSize, total);
  const hasPrevious = offset > 0;
  const hasNext = offset + pageSize < total;
  const pricingContext = listingsQuery.data?.pricing;
  const pricingContextLabel = pricingContext
    ? `${pricingContext.currency} prices${
        pricingContext.asOf ? ` / Latest data ${formatCatalogDate(pricingContext.asOf)}` : ''
      }`
    : null;
  const summary = setsQuery.isSuccess
    ? `${totalPrintingCount} printings across ${setGroups.length} collected set families.`
    : 'Browse collected legacy Pokemon printings and condition prices.';

  const selectAllPrintings = () => {
    setSelectedSet('');
    setEdition('');
    setOffset(0);
  };
  const selectSetView = (view: CatalogSetView) => {
    setSelectedSet(view.setId);
    setEdition(view.edition);
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
  const resetFilters = () => {
    setCondition('Near Mint');
    if (!selectedSet) setEdition('');
    setFinish('');
    setGradedOnly(false);
    setSort('set_number');
    setOffset(0);
  };
  const applyFilters = (values: CatalogFilterValues) => {
    setCondition(values.condition);
    setEdition(values.edition);
    setFinish(values.finish);
    setGradedOnly(values.gradedOnly);
    setSort(values.sort);
    setOffset(0);
    setFilterSheetOpen(false);
  };

  const activeFilters: ActiveCatalogFilter[] = [];
  if (condition !== 'Near Mint') {
    activeFilters.push({
      key: 'condition',
      label: shortCondition(condition),
      onRemove: () => changeCondition('Near Mint'),
    });
  }
  if (!selectedSet && edition) {
    activeFilters.push({
      key: 'edition',
      label: edition,
      onRemove: () => {
        setEdition('');
        setOffset(0);
      },
    });
  }
  if (finish) {
    activeFilters.push({
      key: 'finish',
      label: finish,
      onRemove: () => {
        setFinish('');
        setOffset(0);
      },
    });
  }
  if (gradedOnly) {
    activeFilters.push({
      key: 'graded',
      label: 'Graded pricing',
      onRemove: () => {
        setGradedOnly(false);
        setOffset(0);
      },
    });
  }
  if (sort !== 'set_number') {
    activeFilters.push({
      key: 'sort',
      label: catalogSortOptions.find((option) => option.value === sort)?.label ?? sort,
      onRemove: () => {
        setSort('set_number');
        setOffset(0);
      },
    });
  }

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
                {setsQuery.isPending ? 'Loading sets' : `${filteredSets.length} print runs`}
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
            <>
              <SetStrip
                groups={setGroups}
                onSelectAll={selectAllPrintings}
                onSelectView={selectSetView}
                selectedGroup={selectedGroup}
                totalPrintingCount={totalPrintingCount}
              />
              {selectedGroup ? (
                <SetViewStrip
                  group={selectedGroup}
                  onSelect={selectSetView}
                  selectedView={selectedView}
                />
              ) : null}
            </>
          ) : null}

          {compact ? (
            <MobileFilterButton
              activeCount={activeFilters.length}
              condition={condition}
              onPress={() => setFilterSheetOpen(true)}
              sort={sort}
            />
          ) : (
            <View style={styles.filterBar}>
              <View style={styles.conditionFilter}>
                <Text style={styles.filterLabel}>Price condition</Text>
                <MarketConditionControl condition={condition} onChange={changeCondition} />
              </View>
              <View style={styles.filterMenus}>
                {!selectedSet ? (
                  <View style={styles.filterMenu}>
                    <SelectionMenu
                      accessibilityLabel="Filter by edition"
                      label="Edition"
                      onChange={(value) => {
                        setEdition(value);
                        setOffset(0);
                      }}
                      options={catalogEditionOptions}
                      value={edition}
                    />
                  </View>
                ) : null}
                <View style={styles.filterMenu}>
                  <SelectionMenu
                    accessibilityLabel="Filter by finish"
                    label="Finish"
                    onChange={(value) => {
                      setFinish(value);
                      setOffset(0);
                    }}
                    options={catalogFinishOptions}
                    value={finish}
                  />
                </View>
                <View
                  style={[styles.gradedFilter, gradedOnly && styles.gradedFilterSelected]}>
                  <View style={styles.gradedFilterCopy}>
                    <Text style={styles.filterLabel}>Pricing</Text>
                    <View style={styles.gradedFilterValue}>
                      <BadgeCheck
                        color={gradedOnly ? colors.brand : colors.textMuted}
                        size={16}
                      />
                      <Text
                        style={[
                          styles.gradedFilterText,
                          gradedOnly && styles.gradedFilterTextSelected,
                        ]}>
                        Graded only
                      </Text>
                    </View>
                  </View>
                  <Switch
                    accessibilityLabel="Show only printings with graded prices"
                    onValueChange={(value) => {
                      setGradedOnly(value);
                      setOffset(0);
                    }}
                    thumbColor={gradedOnly ? colors.text : colors.textMuted}
                    trackColor={{ false: colors.surfaceQuiet, true: colors.brandPressed }}
                    value={gradedOnly}
                  />
                </View>
                <View style={styles.filterMenu}>
                  <SelectionMenu
                    accessibilityLabel="Sort catalog"
                    label="Sort"
                    onChange={(value) => {
                      setSort(value);
                      setOffset(0);
                    }}
                    options={catalogSortOptions}
                    value={sort}
                  />
                </View>
              </View>
            </View>
          )}

          {activeFilters.length > 0 ? (
            <ActiveFilterStrip filters={activeFilters} onReset={resetFilters} />
          ) : null}

          <View style={styles.catalogLayout}>
            {!compact ? (
              <SetRail
                groups={setGroups}
                onSelectAll={selectAllPrintings}
                onSelectView={selectSetView}
                selectedGroup={selectedGroup}
                selectedView={selectedView}
                totalPrintingCount={totalPrintingCount}
              />
            ) : null}

            <View style={styles.results}>
              <View style={styles.resultsHeader}>
                <View style={styles.resultSummary}>
                  <View style={styles.resultCountWrap}>
                    <Layers3 color={colors.brass} size={17} />
                    <Text style={styles.resultCount}>
                      {listingsQuery.isPending
                        ? 'Loading catalog'
                        : total === 0
                          ? '0 printings'
                          : `${pageStart}-${pageEnd} of ${total} printings`}
                    </Text>
                  </View>
                  {pricingContextLabel ? (
                    <Text style={styles.pricingContext}>{pricingContextLabel}</Text>
                  ) : null}
                </View>

                <View style={styles.resultsActions}>
                  <CatalogDensityControl
                    density={density}
                    onChange={setDensity}
                  />
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
                  message={
                    gradedOnly
                      ? 'Try another set or remove the graded-pricing filter.'
                      : 'Try another card name, number, or collected set.'
                  }
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
                        columns === 4 && styles.gridItemFour,
                      ]}>
                      <CatalogCardTile
                        condition={condition}
                        density={density}
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

      {compact && filterSheetOpen ? (
        <CatalogFilterSheet
          onApply={applyFilters}
          onClose={() => setFilterSheetOpen(false)}
          showEdition={!selectedSet}
          values={{ condition, edition, finish, gradedOnly, sort }}
        />
      ) : null}
      <CardDetailModal listing={selectedListing} onClose={() => setSelectedListing(null)} />
      <SetDetailModal set={selectedPricingSet} onClose={() => setSelectedPricingSet(null)} />
    </Screen>
  );
}

function MobileFilterButton({
  activeCount,
  condition,
  onPress,
  sort,
}: {
  activeCount: number;
  condition: CatalogFilterValues['condition'];
  onPress: () => void;
  sort: CatalogListingSort;
}) {
  const sortLabel = catalogSortOptions.find((option) => option.value === sort)?.label ?? sort;

  return (
    <Pressable
      accessibilityLabel={`Open catalog filters, ${activeCount} active`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.mobileFilterButton, pressed && styles.mobileFilterPressed]}>
      <View style={styles.mobileFilterIdentity}>
        <SlidersHorizontal color={colors.brass} size={17} />
        <Text style={styles.mobileFilterTitle}>Filters</Text>
        {activeCount > 0 ? (
          <View style={styles.mobileFilterCount}>
            <Text style={styles.mobileFilterCountText}>{activeCount}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.mobileFilterSummary}>
        {shortCondition(condition)} / {sortLabel}
      </Text>
      <ChevronRight color={colors.textMuted} size={17} />
    </Pressable>
  );
}

function ActiveFilterStrip({
  filters,
  onReset,
}: {
  filters: ActiveCatalogFilter[];
  onReset: () => void;
}) {
  return (
    <View style={styles.activeFilterRow}>
      <ScrollView
        accessibilityLabel="Active catalog filters"
        contentContainerStyle={styles.activeFilterStrip}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.activeFilterScroll}>
        {filters.map((filter) => (
          <Pressable
            accessibilityLabel={`Remove ${filter.label} filter`}
            accessibilityRole="button"
            key={filter.key}
            onPress={filter.onRemove}
            style={({ pressed }) => [
              styles.activeFilterChip,
              pressed && styles.activeFilterPressed,
            ]}>
            <Text numberOfLines={1} style={styles.activeFilterText}>
              {filter.label}
            </Text>
            <X color={colors.brand} size={13} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [styles.resetFiltersButton, pressed && styles.activeFilterPressed]}>
        <RotateCcw color={colors.textMuted} size={13} />
        <Text style={styles.resetFiltersText}>Reset</Text>
      </Pressable>
    </View>
  );
}

function CatalogDensityControl({
  density,
  onChange,
}: {
  density: CatalogDensity;
  onChange: (density: CatalogDensity) => void;
}) {
  return (
    <View accessibilityLabel="Card size" accessibilityRole="tablist" style={styles.densityControl}>
      <DensityButton
        icon={<Square color={density === 'large' ? colors.text : colors.textMuted} size={15} />}
        label="Large"
        onPress={() => onChange('large')}
        selected={density === 'large'}
      />
      <DensityButton
        icon={<Grid2X2 color={density === 'standard' ? colors.text : colors.textMuted} size={15} />}
        label="Standard"
        onPress={() => onChange('standard')}
        selected={density === 'standard'}
      />
      <DensityButton
        icon={<Grid3X3 color={density === 'compact' ? colors.text : colors.textMuted} size={15} />}
        label="Compact"
        onPress={() => onChange('compact')}
        selected={density === 'compact'}
      />
    </View>
  );
}

function DensityButton({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} card size`}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.densityButton, selected && styles.densityButtonSelected]}>
      {icon}
      <Text style={[styles.densityButtonText, selected && styles.densityButtonTextSelected]}>
        {label}
      </Text>
    </Pressable>
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

type SetNavigationProps = {
  groups: CatalogSetGroup[];
  selectedGroup: CatalogSetGroup | undefined;
  totalPrintingCount: number;
  onSelectAll: () => void;
  onSelectView: (view: CatalogSetView) => void;
};

type SetRailProps = SetNavigationProps & {
  selectedView: CatalogSetView | undefined;
};

function SetRail({
  groups,
  selectedGroup,
  selectedView,
  totalPrintingCount,
  onSelectAll,
  onSelectView,
}: SetRailProps) {
  return (
    <View style={styles.setRail}>
      <Text style={styles.setRailTitle}>Collected sets</Text>
      <SetButton
        countLabel={String(totalPrintingCount)}
        label="All printings"
        onPress={onSelectAll}
        selected={!selectedGroup}
      />
      {groups.map((group) => {
        const expanded = selectedGroup?.key === group.key;
        return (
          <View key={group.key}>
            <SetGroupButton
              expanded={expanded}
              group={group}
              onPress={() => onSelectView(group.defaultView)}
            />
            {expanded ? (
              <View accessibilityRole="tablist" style={styles.setViewList}>
                {group.views.map((view) => (
                  <SetViewButton
                    key={view.key}
                    onPress={() => onSelectView(view)}
                    selected={selectedView?.key === view.key}
                    view={view}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function SetStrip({
  groups,
  selectedGroup,
  totalPrintingCount,
  onSelectAll,
  onSelectView,
}: SetNavigationProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.setStrip}
      horizontal
      showsHorizontalScrollIndicator={false}>
      <SetChip
        count={totalPrintingCount}
        label="All printings"
        onPress={onSelectAll}
        selected={!selectedGroup}
      />
      {groups.map((group) => (
        <SetChip
          key={group.key}
          label={group.label}
          onPress={() => onSelectView(group.defaultView)}
          selected={selectedGroup?.key === group.key}
          symbolURL={group.symbolUrl}
        />
      ))}
    </ScrollView>
  );
}

function SetViewStrip({
  group,
  selectedView,
  onSelect,
}: {
  group: CatalogSetGroup;
  selectedView: CatalogSetView | undefined;
  onSelect: (view: CatalogSetView) => void;
}) {
  return (
    <View style={styles.setViewStripWrap}>
      <Text style={styles.setViewStripLabel}>{group.label} printing</Text>
      <ScrollView
        contentContainerStyle={styles.setViewStrip}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {group.views.map((view) => (
          <SetChip
            count={view.printingCount}
            key={view.key}
            label={view.label}
            onPress={() => onSelect(view)}
            selected={selectedView?.key === view.key}
            showSymbol={false}
          />
        ))}
      </ScrollView>
    </View>
  );
}

type SetButtonProps = {
  label: string;
  countLabel: string;
  selected: boolean;
  symbolURL?: string | null;
  onPress: () => void;
};

function SetButton({ label, countLabel, selected, symbolURL, onPress }: SetButtonProps) {
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
      <Text style={styles.setButtonCount}>{countLabel}</Text>
    </Pressable>
  );
}

function SetGroupButton({
  expanded,
  group,
  onPress,
}: {
  expanded: boolean;
  group: CatalogSetGroup;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${group.label}, ${group.cardCountLabel} cards`}
      accessibilityRole="tab"
      accessibilityState={{ expanded, selected: expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.setButton,
        expanded && styles.setGroupButtonExpanded,
        pressed && styles.setButtonPressed,
      ]}>
      <SetSymbol label={group.label} symbolURL={group.symbolUrl} />
      <Text style={[styles.setButtonText, expanded && styles.setButtonTextSelected]}>
        {group.label}
      </Text>
      <Text style={styles.setButtonCount}>{group.cardCountLabel}</Text>
      {expanded ? (
        <ChevronDown color={colors.textMuted} size={15} />
      ) : (
        <ChevronRight color={colors.textMuted} size={15} />
      )}
    </Pressable>
  );
}

function SetViewButton({
  view,
  selected,
  onPress,
}: {
  view: CatalogSetView;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${view.label}, ${view.printingCount} printings`}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.setViewButton,
        selected && styles.setViewButtonSelected,
        pressed && styles.setButtonPressed,
      ]}>
      <View style={[styles.setViewGuide, selected && styles.setViewGuideSelected]} />
      <Text style={[styles.setViewButtonText, selected && styles.setButtonTextSelected]}>
        {view.label}
      </Text>
      <Text style={styles.setButtonCount}>{view.printingCount}</Text>
    </Pressable>
  );
}

type SetChipProps = {
  label: string;
  selected: boolean;
  count?: number;
  showSymbol?: boolean;
  symbolURL?: string | null;
  onPress: () => void;
};

function SetChip({
  label,
  selected,
  count,
  showSymbol = true,
  symbolURL,
  onPress,
}: SetChipProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.setChip, selected && styles.setChipSelected]}>
      {showSymbol ? <SetSymbol label={label} symbolURL={symbolURL} /> : null}
      <Text style={[styles.setChipText, selected && styles.setChipTextSelected]}>{label}</Text>
      {count === undefined ? null : <Text style={styles.setChipCount}>{count}</Text>}
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
  mobileFilterButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  mobileFilterPressed: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.brand,
  },
  mobileFilterIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mobileFilterTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  mobileFilterCount: {
    alignItems: 'center',
    backgroundColor: colors.onlineSurface,
    borderColor: colors.onlineBorder,
    borderRadius: 4,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 4,
  },
  mobileFilterCountText: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: '800',
  },
  mobileFilterSummary: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 11,
    textAlign: 'right',
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
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  conditionFilter: {
    flexShrink: 0,
    gap: spacing.xs,
    width: 280,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  filterMenus: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: spacing.sm,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  filterMenu: {
    flexShrink: 1,
    minWidth: 0,
  },
  gradedFilter: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 48,
    minWidth: 148,
    paddingHorizontal: 12,
  },
  gradedFilterSelected: {
    backgroundColor: colors.onlineSurface,
    borderColor: colors.onlineBorder,
  },
  gradedFilterCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  gradedFilterValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  gradedFilterText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  gradedFilterTextSelected: {
    color: colors.text,
  },
  activeFilterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  activeFilterScroll: {
    flex: 1,
  },
  activeFilterStrip: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  activeFilterChip: {
    alignItems: 'center',
    backgroundColor: colors.onlineSurface,
    borderColor: colors.onlineBorder,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: 9,
  },
  activeFilterPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  activeFilterText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 160,
  },
  resetFiltersButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  resetFiltersText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
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
    width: 232,
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
  setGroupButtonExpanded: {
    backgroundColor: colors.surfaceQuiet,
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
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
  },
  setViewList: {
    marginBottom: spacing.xs,
  },
  setViewButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 38,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  setViewButtonSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  setViewButtonText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  setViewGuide: {
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
    height: 20,
    width: 5,
  },
  setViewGuideSelected: {
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
  },
  setStrip: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  setViewStripWrap: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  setViewStripLabel: {
    color: colors.brass,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  setViewStrip: {
    gap: spacing.sm,
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
  setChipCount: {
    color: colors.brass,
    fontSize: 10,
    fontWeight: '800',
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
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    minHeight: 38,
  },
  resultSummary: {
    gap: 3,
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
  pricingContext: {
    color: colors.textMuted,
    fontSize: 10,
    paddingLeft: 25,
  },
  resultsActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  densityControl: {
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    flexDirection: 'row',
    padding: 3,
  },
  densityButton: {
    alignItems: 'center',
    borderRadius: 4,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 8,
  },
  densityButtonSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  densityButtonText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  densityButtonTextSelected: {
    color: colors.text,
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
    width: '47.5%',
  },
  gridItemThree: {
    width: '30.5%',
  },
  gridItemFour: {
    width: '22.2%',
  },
});
