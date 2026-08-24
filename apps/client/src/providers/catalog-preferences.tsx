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
const defaultCondition: MarketCondition = 'Near Mint';
const validConditions = new Set<MarketCondition>([
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
]);

type CatalogPreferences = {
  condition: MarketCondition;
  setCondition: (condition: MarketCondition) => void;
};

const CatalogPreferencesContext = createContext<CatalogPreferences | null>(null);

export function CatalogPreferencesProvider({ children }: PropsWithChildren) {
  const [condition, setConditionState] = useState<MarketCondition>(defaultCondition);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(conditionStorageKey)
      .then((stored) => {
        if (active && stored && validConditions.has(stored as MarketCondition)) {
          setConditionState(stored as MarketCondition);
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

  const value = useMemo(() => ({ condition, setCondition }), [condition, setCondition]);

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
