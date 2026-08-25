import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { type MarketCondition } from '@/lib/api';

const conditionStorageKey = 'binderledger.defaultCondition';
const densityStorageKey = 'binderledger.catalogDensity';
const defaultCondition: MarketCondition = 'Near Mint';
export type CatalogDensity = 'large' | 'standard' | 'compact';

const defaultDensity: CatalogDensity = 'standard';
const validConditions = new Set<MarketCondition>([
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
]);
const validDensities = new Set<CatalogDensity>(['large', 'standard', 'compact']);

type CatalogPreferences = {
  condition: MarketCondition;
  density: CatalogDensity;
  setCondition: (condition: MarketCondition) => void;
  setDensity: (density: CatalogDensity) => void;
};

const CatalogPreferencesContext = createContext<CatalogPreferences | null>(null);

export function CatalogPreferencesProvider({ children }: PropsWithChildren) {
  const [condition, setConditionState] = useState<MarketCondition>(defaultCondition);
  const [density, setDensityState] = useState<CatalogDensity>(defaultDensity);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(conditionStorageKey),
      AsyncStorage.getItem(densityStorageKey),
    ])
      .then(([storedCondition, storedDensity]) => {
        if (
          active &&
          storedCondition &&
          validConditions.has(storedCondition as MarketCondition)
        ) {
          setConditionState(storedCondition as MarketCondition);
        }
        if (active && storedDensity && validDensities.has(storedDensity as CatalogDensity)) {
          setDensityState(storedDensity as CatalogDensity);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const setCondition = useCallback((next: MarketCondition) => {
    setConditionState(next);
    void AsyncStorage.setItem(conditionStorageKey, next).catch(() => undefined);
  }, []);

  const setDensity = useCallback((next: CatalogDensity) => {
    setDensityState(next);
    void AsyncStorage.setItem(densityStorageKey, next).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ condition, density, setCondition, setDensity }),
    [condition, density, setCondition, setDensity],
  );

  return (
    <CatalogPreferencesContext.Provider value={value}>
      {children}
    </CatalogPreferencesContext.Provider>
  );
}

export function useCatalogPreferences(): CatalogPreferences {
  const value = useContext(CatalogPreferencesContext);
  if (!value) {
    throw new Error('useCatalogPreferences must be used within CatalogPreferencesProvider');
  }
  return value;
}
