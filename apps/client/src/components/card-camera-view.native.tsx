import Constants, { AppOwnership } from 'expo-constants';
import { CameraView } from 'expo-camera';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { CardCameraHandle, CardCameraProps } from './card-camera';

const DevelopmentCardCamera = Constants.appOwnership === AppOwnership.Expo
  ? null
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo Go must not eagerly load custom native modules.
  : (require('./card-camera-view.dev.native') as typeof import('./card-camera-view.dev.native')).CardCamera;

export const CardCamera = forwardRef<CardCameraHandle, CardCameraProps>(function CardCamera(props, ref) {
  if (DevelopmentCardCamera) return <DevelopmentCardCamera {...props} ref={ref} />;
  return <ExpoGoCamera {...props} ref={ref} />;
});

const ExpoGoCamera = forwardRef<CardCameraHandle, CardCameraProps>(function ExpoGoCamera(
  { active, onBoundsChange, onError, onReady, onStatusChange, resetKey, torch },
  ref,
) {
  const camera = useRef<CameraView>(null);

  useEffect(() => {
    onBoundsChange(null);
    onStatusChange('searching');
  }, [onBoundsChange, onStatusChange, resetKey]);

  useImperativeHandle(ref, () => ({
    capture: async () => {
      if (!camera.current) throw new Error('Camera is not ready.');
      const picture = await camera.current.takePictureAsync({ exif: false, quality: 0.88 });
      if (!picture) throw new Error('Camera returned no picture.');
      return {
        format: 'jpg',
        height: picture.height,
        uri: picture.uri,
        width: picture.width,
      };
    },
  }));

  if (!active) return null;
  return (
    <CameraView
      enableTorch={torch}
      facing="back"
      mode="picture"
      onCameraReady={onReady}
      onMountError={({ message }) => onError(message)}
      ref={camera}
      style={StyleSheet.absoluteFill}
    />
  );
});
