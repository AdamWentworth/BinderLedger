import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tabs, usePathname } from 'expo-router';
import { Eye, LayoutGrid, LibraryBig, ScanLine, TrendingUp } from 'lucide-react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';

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

const browserTitles: Record<string, string> = {
  '/': 'Catalog',
  '/collection': 'Collection',
  '/market': 'Market',
  '/watchlist': 'Watchlist',
  '/scan': 'Scan',
};

const browserFavicon = '/favicon.ico?v=20260826-brand-2';

export default function RootLayout() {
  const width = useHydratedWidth();
  const desktop = width >= desktopNavigationBreakpoint;
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const section = browserTitles[pathname];
    document.title = section ? `${section} · BinderLedger` : 'BinderLedger';

    let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.type = 'image/png';
    favicon.href = browserFavicon;
  }, [pathname]);

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
