import {
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  Mat,
  MatVector,
  MorphShapes,
  MorphTypes,
  OpenCV,
  Point,
  RetrievalModes,
  Scalar,
  Size,
} from 'react-native-fast-opencv';
import {
  Camera,
  CameraRef,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Image, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  CardBounds,
  CardCameraHandle,
  CardCameraProps,
  isCameraLifecycleCancellation,
  isCardAligned,
  isStableCard,
} from './card-camera';

const ANALYSIS_WIDTH = 240;
const ANALYSIS_HEIGHT = 320;

export const CardCamera = forwardRef<CardCameraHandle, CardCameraProps>(function CardCamera(
  {
    active,
    disabled,
    onAutoCapture,
    onBoundsChange,
    onError,
    onReady,
    onStatusChange,
    resetKey,
    torch,
  },
  ref,
) {
  const nativeCamera = useRef<CameraRef>(null);
  const history = useRef<CardBounds[]>([]);
  const armed = useRef(true);
  const appliedTorch = useRef(false);
  const [previewActive, setPreviewActive] = useState(false);
  const frameCounter = useSharedValue(0);
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    quality: 0.9,
    qualityPrioritization: 'quality',
  });
  const { error: resizerError, resizer } = useResizer({
    channelOrder: 'bgr',
    dataType: 'uint8',
    height: ANALYSIS_HEIGHT,
    pixelLayout: 'interleaved',
    scaleMode: 'contain',
    width: ANALYSIS_WIDTH,
  });

  useEffect(() => {
    history.current = [];
    armed.current = true;
    onBoundsChange(null);
    onStatusChange('searching');
  }, [onBoundsChange, onStatusChange, resetKey]);

  useEffect(() => {
    if (resizerError) onError(resizerError.message);
  }, [onError, resizerError]);

  useEffect(() => {
    if (!active || !previewActive || torch === appliedTorch.current) return;
    const controller = nativeCamera.current?.controller;
    if (!controller) return;

    let current = true;
    controller
      .setTorchMode(torch ? 'on' : 'off')
      .then(() => {
        if (current) appliedTorch.current = torch;
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : String(caught);
        if (current && !isCameraLifecycleCancellation(message)) {
          onError('The camera light could not be changed. You can continue scanning without it.');
        }
      });
    return () => {
      current = false;
    };
  }, [active, onError, previewActive, torch]);

  const handlePreviewStarted = useCallback(() => {
    appliedTorch.current = false;
    setPreviewActive(true);
    onReady();
  }, [onReady]);

  const handlePreviewStopped = useCallback(() => {
    appliedTorch.current = false;
    setPreviewActive(false);
  }, []);

  const handleCameraError = useCallback(
    (message: string) => {
      if (isCameraLifecycleCancellation(message)) return;
      onError('The camera session stopped unexpectedly. Return to Scan and try again.');
    },
    [onError],
  );

  const receiveDetection = useCallback(
    (bounds: CardBounds | null) => {
      onBoundsChange(bounds);
      if (!bounds) {
        history.current = [];
        onStatusChange('searching');
        return;
      }
      if (!isCardAligned(bounds)) {
        history.current = [];
        onStatusChange('align');
        return;
      }

      history.current = [...history.current.slice(-4), bounds];
      if (!isStableCard(history.current)) {
        onStatusChange('hold-steady');
        return;
      }
      onStatusChange('ready');
      if (armed.current && active && !disabled) {
        armed.current = false;
        onAutoCapture();
      }
    },
    [active, disabled, onAutoCapture, onBoundsChange, onStatusChange],
  );

  const frameOutput = useFrameOutput({
    dropFramesWhileBusy: true,
    enablePhysicalBufferRotation: false,
    pixelFormat: 'native',
    onFrame(frame) {
      'worklet';
      frameCounter.value = (frameCounter.value + 1) % 4;
      if (frameCounter.value !== 0 || resizer == null) {
        frame.dispose();
        return;
      }

      const resized = resizer.resize(frame);
      try {
        const pixels = new Uint8Array(resized.getPixelBuffer());
        const src = Mat.createFromBuffer('uint8', ANALYSIS_HEIGHT, ANALYSIS_WIDTH, 3, pixels);
        const hsv = Mat.create(0, 0, DataTypes.CV_8U);
        const mask = Mat.create(0, 0, DataTypes.CV_8U);
        const gray = Mat.create(0, 0, DataTypes.CV_8U);
        const edges = Mat.create(0, 0, DataTypes.CV_8U);
        const yellowContours = MatVector.create();
        const edgeContours = MatVector.create();
        const lowerYellow = Scalar.create(15, 80, 100);
        const upperYellow = Scalar.create(40, 255, 255);
        const kernelSize = Size.create(5, 5);
        const kernel = OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, kernelSize);
        const anchor = Point.create(-1, -1);
        let best: CardBounds | null = null;
        let bestScore = 0;

        try {
          OpenCV.cvtColor(src, hsv, ColorConversionCodes.COLOR_BGR2HSV);
          OpenCV.inRange(hsv, lowerYellow, upperYellow, mask);
          OpenCV.morphologyEx(mask, mask, MorphTypes.MORPH_CLOSE, kernel, anchor, 2);
          OpenCV.findContours(
            mask,
            yellowContours,
            RetrievalModes.RETR_EXTERNAL,
            ContourApproximationModes.CHAIN_APPROX_SIMPLE,
          );
          ({ bounds: best, score: bestScore } = findBestCardBounds(yellowContours, 0.22));

          if (best == null) {
            OpenCV.cvtColor(src, gray, ColorConversionCodes.COLOR_BGR2GRAY);
            OpenCV.GaussianBlur(gray, gray, kernelSize, 0);
            OpenCV.Canny(gray, edges, 45, 135);
            OpenCV.morphologyEx(edges, edges, MorphTypes.MORPH_CLOSE, kernel, anchor, 2);
            OpenCV.findContours(
              edges,
              edgeContours,
              RetrievalModes.RETR_LIST,
              ContourApproximationModes.CHAIN_APPROX_SIMPLE,
            );
            ({ bounds: best, score: bestScore } = findBestCardBounds(edgeContours, 0.16));
          }
          scheduleOnRN(receiveDetection, bestScore > 0 ? best : null);
        } finally {
          anchor.release();
          kernel.release();
          kernelSize.release();
          upperYellow.release();
          lowerYellow.release();
          edgeContours.release();
          yellowContours.release();
          edges.release();
          gray.release();
          mask.release();
          hsv.release();
          src.release();
        }
      } finally {
        resized.dispose();
        frame.dispose();
      }
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      capture: async () => {
        const photo = await photoOutput.capturePhotoToFile(
          { enableShutterSound: true, flashMode: torch ? 'on' : 'off' },
          {},
        );
        const uri = photo.filePath.startsWith('file://') ? photo.filePath : `file://${photo.filePath}`;
        const dimensions = await imageDimensions(uri);
        return { format: 'jpg', height: dimensions.height, uri, width: dimensions.width };
      },
    }),
    [photoOutput, torch],
  );

  return (
    <Camera
      device="back"
      enableNativeTapToFocusGesture
      isActive={active}
      onError={(error) => handleCameraError(error.message)}
      onPreviewStarted={handlePreviewStarted}
      onPreviewStopped={handlePreviewStopped}
      orientationSource="interface"
      outputs={[photoOutput, frameOutput]}
      ref={nativeCamera}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
    />
  );
});

function findBestCardBounds(
  contours: MatVector,
  minimumAreaRatio: number,
): { bounds: CardBounds | null; score: number } {
  'worklet';
  let best: CardBounds | null = null;
  let bestScore = 0;
  for (let index = 0; index < Math.min(contours.length, 40); index += 1) {
    const contour = contours.get(index);
    const rect = OpenCV.boundingRect(contour);
    try {
      const areaRatio = OpenCV.contourArea(contour, false).value / (ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
      const width = rect.width / ANALYSIS_WIDTH;
      const height = rect.height / ANALYSIS_HEIGHT;
      const aspect = rect.width / Math.max(rect.height, 1);
      if (areaRatio < minimumAreaRatio || areaRatio > 0.90 || aspect < 0.55 || aspect > 0.88) {
        continue;
      }
      const x = rect.x / ANALYSIS_WIDTH;
      const y = rect.y / ANALYSIS_HEIGHT;
      const centerDistance = Math.hypot(x + width / 2 - 0.5, y + height / 2 - 0.45);
      const aspectScore = Math.max(0, 1 - Math.abs(aspect - 2.5 / 3.5) / 0.18);
      const score = 0.55 * aspectScore + 0.25 * Math.max(0, 1 - centerDistance) + 0.20 * areaRatio;
      if (score > bestScore) {
        bestScore = score;
        best = { height, width, x, y };
      }
    } finally {
      rect.release();
      contour.release();
    }
  }
  return { bounds: best, score: bestScore };
}

function imageDimensions(uri: string): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ height, width }), reject);
  });
}
