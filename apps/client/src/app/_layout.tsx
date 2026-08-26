import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { Eye, LayoutGrid, LibraryBig, ScanLine, TrendingUp } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, desktopNavigationBreakpoint } from '@/constants/theme';
import { useHydratedWidth } from '@/hooks/use-hydrated-width';
import { CatalogPreferencesProvider } from '@/providers/catalog-preferences';
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
  const desktop = width >= desktopNavigationBreakpoint;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <CatalogPreferencesProvider>
          <Tabs
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: colors.canvas },
              tabBarActiveTintColor: colors.brand,
              tabBarActiveBackgroundColor: colors.surface,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarLabelPosition: desktop ? 'beside-icon' : 'below-icon',
              tabBarLabelStyle: { fontSize: desktop ? 12 : 10, fontWeight: '700' },
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
            <Tabs.Screen
              name="scan"
              options={{
                title: 'Scan',
                tabBarIcon: ({ color, size }) => <ScanLine color={color} size={size} />,
              }}
            />
          </Tabs>
        </CatalogPreferencesProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
