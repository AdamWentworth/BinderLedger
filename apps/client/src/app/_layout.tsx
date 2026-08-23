import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { Eye, LayoutGrid, LibraryBig, TrendingUp } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import '@/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
    },
  },
});

export default function RootLayout() {
  const width = useHydratedWidth();
  const desktop = width >= 900;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.canvas },
            tabBarActiveTintColor: colors.brand,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
            tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
            tabBarPosition: desktop ? 'left' : 'bottom',
            tabBarStyle: desktop
              ? {
                  backgroundColor: colors.navigation,
                  borderRightColor: colors.border,
                  borderRightWidth: 1,
                  paddingHorizontal: 12,
                  paddingTop: 24,
                  width: 196,
                }
              : {
                  backgroundColor: colors.navigation,
                  borderTopColor: colors.border,
                  height: 72,
                  paddingBottom: 9,
                  paddingTop: 7,
                },
            tabBarVariant: desktop ? 'material' : 'uikit',
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Catalog',
              tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
            }}
          />
          <Tabs.Screen
            name="collection"
            options={{
              title: 'Collection',
              tabBarIcon: ({ color, size }) => <LibraryBig color={color} size={size} />,
            }}
          />
          <Tabs.Screen
            name="market"
            options={{
              title: 'Market',
              tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
            }}
          />
          <Tabs.Screen
            name="watchlist"
            options={{
              title: 'Watchlist',
              tabBarIcon: ({ color, size }) => <Eye color={color} size={size} />,
            }}
          />
        </Tabs>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
