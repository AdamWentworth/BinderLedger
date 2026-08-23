import { CircleDollarSign, Layers3, LibraryBig } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Metric } from '@/components/metric';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { colors, spacing } from '@/constants/theme';

export default function CollectionScreen() {
  const [query, setQuery] = useState('');

  return (
    <Screen
      title="My collection"
      subtitle="Condition-aware values across every binder, set, and loose card."
      toolbar={
        <View style={styles.searchWrap}>
          <SearchField onChangeText={setQuery} value={query} />
        </View>
      }>
      <View style={styles.metrics}>
        <Metric
          icon={<CircleDollarSign color={colors.brand} size={18} />}
          label="Collection value"
          note="No priced cards"
          value="$0.00"
        />
        <Metric
          icon={<LibraryBig color={colors.burgundy} size={18} />}
          label="Cards owned"
          note="Across 0 folders"
          value="0"
        />
        <Metric
          icon={<Layers3 color={colors.brass} size={18} />}
          label="Complete sets"
          note="0 sets in progress"
          value="0"
        />
      </View>

      <View style={styles.mainPanel}>
        <EmptyState
          message="Add a complete set or individual cards when you are ready to build this binder."
          title={query ? `No cards match "${query}"` : 'Your binder is empty'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    maxWidth: 360,
    minWidth: 260,
    width: '100%',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mainPanel: {
    marginTop: spacing.md,
  },
});
