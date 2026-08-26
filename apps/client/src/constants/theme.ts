export const colors = {
  canvas: '#06182F',
  navigation: '#030F20',
  cardBackdrop: '#08213F',
  surface: '#0D2A50',
  surfaceRaised: '#133A68',
  surfaceQuiet: '#1B4F84',
  paper: '#D8E9F7',
  text: '#F4F7FF',
  textMuted: '#AFC9E3',
  border: '#2B659C',
  brand: '#58B5EE',
  brandPressed: '#2E8ECB',
  burgundy: '#F06A62',
  brass: '#F4D04E',
  positive: '#62D6B0',
  negative: '#FF787E',
  warning: '#F4D04E',
  overlay: 'rgba(1, 8, 19, 0.9)',
  onlineSurface: '#0E3340',
  onlineBorder: '#2B7180',
  warningSurface: '#382F16',
  warningBorder: '#7C6827',
  offlineSurface: '#3B1B2B',
  offlineBorder: '#814052',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const contentMaxWidth = 1180;
export const desktopNavigationBreakpoint = 1200;
export const desktopNavigationWidth = 360;

export function getUsablePageWidth(windowWidth: number): number {
  return windowWidth >= desktopNavigationBreakpoint
    ? windowWidth - desktopNavigationWidth
    : windowWidth;
}
