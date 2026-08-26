import { describe, expect, it } from 'vitest';

import appConfig from '../../app.json';
import { colors } from './theme';

type ExpoPlugin = string | [string, Record<string, unknown>];

type AppConfig = {
  expo: {
    icon: string;
    ios: { icon: string };
    android: { adaptiveIcon: { backgroundColor: string; foregroundImage: string } };
    web: { favicon: string };
    plugins: ExpoPlugin[];
  };
};

const config = appConfig as AppConfig;

describe('Expo branding configuration', () => {
  it('keeps native shell backgrounds synchronized with the shared canvas', () => {
    expect(config.expo.android.adaptiveIcon.backgroundColor).toBe(colors.canvas);

    const splashPlugin = config.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );
    expect(splashPlugin?.[1].backgroundColor).toBe(colors.canvas);
  });

  it('keeps every platform mapped to the intended branding assets', () => {
    expect(config.expo.icon).toBe('./assets/images/binderledger-icon-circle.png');
    expect(config.expo.ios.icon).toBe('./assets/images/binderledger-icon-ios.png');
    expect(config.expo.android.adaptiveIcon.foregroundImage).toBe(
      './assets/images/binderledger-icon-circle.png',
    );
    expect(config.expo.web.favicon).toBe('./assets/images/binderledger-icon-circle.png');
  });
});
