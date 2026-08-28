import { describe, expect, it } from 'vitest';

import appConfig from '../../app.json';
import easConfig from '../../eas.json';
import { colors } from './theme';

type ExpoPlugin = string | [string, Record<string, unknown>];

type AppConfig = {
  expo: {
    icon: string;
    ios: { icon: string };
    android: {
      versionCode: number;
      adaptiveIcon: { backgroundColor: string; foregroundImage: string };
      runtimeVersion: { policy: string };
    };
    updates: { url: string };
    web: { favicon: string };
    plugins: ExpoPlugin[];
  };
};

type EASConfig = {
  build: {
    preview: {
      android: { buildType: string };
      channel: string;
      distribution: string;
      environment: string;
    };
  };
};

const config = appConfig as AppConfig;
const builds = easConfig as EASConfig;

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
    expect(config.expo.ios.icon).toBe('./assets/images/binderledger-icon-circle.png');
    expect(config.expo.android.adaptiveIcon.foregroundImage).toBe(
      './assets/images/binderledger-icon-circle.png',
    );
    expect(config.expo.web.favicon).toBe('./assets/images/binderledger-favicon.png');
  });

  it('increments the Android package when the native update runtime changes', () => {
    expect(config.expo.android.versionCode).toBeGreaterThanOrEqual(3);
  });

  it('keeps checkpoint builds on an installable preview update channel', () => {
    expect(config.expo.android.runtimeVersion.policy).toBe('appVersion');
    expect(config.expo.updates.url).toBe(
      'https://u.expo.dev/45908809-1cea-47e6-bd90-3a0a94a23f7e',
    );
    expect(builds.build.preview).toEqual({
      android: { buildType: 'apk' },
      channel: 'preview',
      distribution: 'internal',
      environment: 'preview',
    });

    const buildProperties = config.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    expect(buildProperties?.[1]).toMatchObject({
      android: { usesCleartextTraffic: true },
    });
  });
});
