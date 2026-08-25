import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

import { CardCameraHandle, CardCameraProps } from './card-camera';

export const CardCamera = forwardRef<CardCameraHandle, CardCameraProps>(function CardCamera(_props, ref) {
  useImperativeHandle(ref, () => ({
    capture: async () => {
      throw new Error('Live camera capture is only available on a mobile development build.');
    },
  }));
  return <View />;
});
