import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydratedWidth(): number {
  const { width } = useWindowDimensions();
  const hydrated = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return hydrated ? width : 0;
}
