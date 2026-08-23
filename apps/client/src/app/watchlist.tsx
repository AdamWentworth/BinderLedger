import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';

export default function WatchlistScreen() {
  const [query, setQuery] = useState('');

  return (
    <Screen
      title="Watchlist"
      subtitle="A focused view of the cards and sets you care about most."
      toolbar={
        <View style={styles.searchWrap}>
          <SearchField
            onChangeText={setQuery}
            placeholder="Search watchlist"
            value={query}
          />
        </View>
      }>
      <EmptyState
        message="Tracked cards and custom market lists will appear here."
        title={query ? `Nothing matches "${query}"` : 'No watched cards'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    maxWidth: 360,
    minWidth: 260,
    width: '100%',
  },
});
