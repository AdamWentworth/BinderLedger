import { CameraCapturedPicture, CameraView, useCameraPermissions } from 'expo-camera';
import {
  Camera,
  Check,
  CircleCheck,
  Flashlight,
  FlashlightOff,
  RotateCcw,
  ScanLine,
  Upload,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/theme';
import { createScanSession, ScanCapture, ScanSession } from '@/lib/api';

type CardSide = 'front' | 'back';
type CaptureMode = 'camera' | 'review' | 'complete';
type ScanGoal = 'identify' | 'condition';

const sideLabel: Record<CardSide, string> = {
  front: 'Front',
  back: 'Back',
};

export default function ScanScreen() {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [activeSide, setActiveSide] = useState<CardSide>('front');
  const [goal, setGoal] = useState<ScanGoal>('identify');
  const [captures, setCaptures] = useState<Partial<Record<CardSide, ScanCapture>>>({});
  const [mode, setMode] = useState<CaptureMode>('camera');
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ScanSession | null>(null);

  async function capturePhoto() {
    if (!camera.current || !cameraReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      let picture: CameraCapturedPicture | undefined;
      for (let attempt = 0; attempt < 2 && !picture; attempt += 1) {
        try {
          picture = await camera.current.takePictureAsync({
            exif: false,
            quality: 0.88,
          });
        } catch (caught) {
          if (attempt === 1) throw caught;
          await pause(600);
        }
      }
      if (!picture) throw new Error('Camera returned no picture');
      const capture = toScanCapture(picture);
      setCaptures((current) => ({ ...current, [activeSide]: capture }));
      if (activeSide === 'front' && goal === 'condition') {
        setActiveSide('back');
      } else {
        setTorch(false);
        setMode('review');
      }
    } catch (caught) {
      console.error('Camera capture failed', caught);
      setError('The photo could not be captured. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function retake(side: CardSide) {
    setActiveSide(side);
    setCameraReady(false);
    setError(null);
    setMode('camera');
  }

  async function uploadScan() {
    const front = captures.front;
    const back = captures.back;
    if (!front || (goal === 'condition' && !back) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await createScanSession(front, back, scanPlatform());
      setSession(saved);
      setMode('complete');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scan could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setActiveSide('front');
    setCaptures({});
    setSession(null);
    setError(null);
    setTorch(false);
    setCameraReady(false);
    setMode('camera');
  }

  function selectGoal(nextGoal: ScanGoal) {
    if (nextGoal === goal) return;
    setGoal(nextGoal);
    setActiveSide('front');
    setCaptures({});
    setError(null);
  }

  return (
    <Screen
      subtitle="Photograph cards for identification and condition review."
      title="Card scanner">
      {!permission ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !permission.granted ? (
        <PermissionState canAskAgain={permission.canAskAgain} request={requestPermission} />
      ) : mode === 'camera' ? (
        <View style={styles.workspace}>
          <View accessibilityRole="tablist" style={styles.goalControl}>
            <GoalButton
              label="Identify"
              onPress={() => selectGoal('identify')}
              selected={goal === 'identify'}
            />
            <GoalButton
              label="Condition"
              onPress={() => selectGoal('condition')}
              selected={goal === 'condition'}
            />
          </View>
          {goal === 'condition' ? (
            <View style={styles.progressRow}>
              <ProgressStep complete={Boolean(captures.front)} label="Front" selected={activeSide === 'front'} />
              <View style={styles.progressRule} />
              <ProgressStep complete={Boolean(captures.back)} label="Back" selected={activeSide === 'back'} />
            </View>
          ) : null}

          <View style={styles.cameraFrame}>
            <CameraView
              enableTorch={torch}
              facing="back"
              mode="picture"
              onCameraReady={() => {
                if (Platform.OS === 'web') {
                  setTimeout(() => setCameraReady(true), 2500);
                  return;
                }
                setCameraReady(true);
              }}
              onMountError={({ message }) => setError(message)}
              ref={camera}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.cameraShade}>
              <View style={styles.cardGuide} />
            </View>
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              <View style={styles.cameraTopBar}>
                <View style={styles.sideBadge}>
                  <ScanLine color={colors.text} size={17} />
                  <Text style={styles.sideBadgeText}>{sideLabel[activeSide]}</Text>
                </View>
                <Pressable
                  accessibilityLabel={torch ? 'Turn flash off' : 'Turn flash on'}
                  disabled={busy}
                  onPress={() => setTorch((current) => !current)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
                  {torch ? (
                    <FlashlightOff color={colors.text} size={21} />
                  ) : (
                    <Flashlight color={colors.text} size={21} />
                  )}
                </Pressable>
              </View>
              <View style={styles.captureBar}>
                <Pressable
                  accessibilityLabel={`Photograph card ${activeSide}`}
                  disabled={!cameraReady || busy}
                  onPress={capturePhoto}
                  style={({ pressed }) => [
                    styles.shutterOuter,
                    (!cameraReady || busy) && styles.buttonDisabled,
                    pressed && styles.shutterPressed,
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={colors.canvas} />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : mode === 'review' ? (
        <View style={styles.workspace}>
          <View style={styles.reviewHeader}>
            <CircleCheck color={colors.brand} size={24} />
            <View style={styles.reviewHeadingCopy}>
              <Text style={styles.sectionTitle}>
                {goal === 'condition' ? 'Both sides ready' : 'Card face ready'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {goal === 'condition' ? 'Review the full card and visible surface detail.' : 'Review the card face.'}
              </Text>
            </View>
          </View>
          <View style={styles.previewGrid}>
            {(goal === 'condition' ? (['front', 'back'] as const) : (['front'] as const)).map((side) => (
              <View key={side} style={styles.previewItem}>
                <View style={styles.previewImageFrame}>
                  {captures[side] ? (
                    <Image source={{ uri: captures[side]?.uri }} style={styles.previewImage} />
                  ) : null}
                  <View style={styles.previewLabel}>
                    <Text style={styles.previewLabelText}>{sideLabel[side]}</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => retake(side)}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                  <RotateCcw color={colors.text} size={17} />
                  <Text style={styles.secondaryButtonText}>Retake</Text>
                </Pressable>
              </View>
            ))}
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            disabled={busy}
            onPress={uploadScan}
            style={({ pressed }) => [
              styles.primaryButton,
              busy && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={colors.canvas} />
            ) : (
              <Upload color={colors.canvas} size={19} />
            )}
            <Text style={styles.primaryButtonText}>{busy ? 'Saving' : 'Save scan'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.completeState}>
          <View style={styles.completeIcon}>
            <Check color={colors.canvas} size={34} strokeWidth={3} />
          </View>
          <Text style={styles.completeTitle}>Scan saved</Text>
          <Text style={styles.completeCopy}>
            {goal === 'condition'
              ? 'Front and back are stored for future recognition and condition analysis.'
              : 'The card face is stored for future recognition.'}
          </Text>
          {session ? <Text style={styles.sessionID}>Scan {session.id.slice(0, 8)}</Text> : null}
          <Pressable
            onPress={reset}
            style={({ pressed }) => [styles.primaryButton, styles.scanAnotherButton, pressed && styles.buttonPressed]}>
            <Camera color={colors.canvas} size={19} />
            <Text style={styles.primaryButtonText}>Scan another</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

function PermissionState({
  canAskAgain,
  request,
}: {
  canAskAgain: boolean;
  request: () => Promise<unknown>;
}) {
  return (
    <View style={styles.permissionState}>
      <View style={styles.permissionIcon}>
        <Camera color={colors.brass} size={32} />
      </View>
      <Text style={styles.sectionTitle}>Camera access needed</Text>
      <Text style={styles.permissionCopy}>
        {canAskAgain
          ? 'BinderLedger only uses the camera when you open the scanner.'
          : 'Enable camera access for BinderLedger in your phone settings.'}
      </Text>
      {canAskAgain ? (
        <Pressable
          onPress={request}
          style={({ pressed }) => [styles.primaryButton, styles.permissionButton, pressed && styles.buttonPressed]}>
          <Camera color={colors.canvas} size={19} />
          <Text style={styles.primaryButtonText}>Enable camera</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProgressStep({ complete, label, selected }: { complete: boolean; label: string; selected: boolean }) {
  return (
    <View style={styles.progressStep}>
      <View style={[styles.progressDot, selected && styles.progressDotSelected, complete && styles.progressDotComplete]}>
        {complete ? <Check color={colors.canvas} size={14} strokeWidth={3} /> : null}
      </View>
      <Text style={[styles.progressText, selected && styles.progressTextSelected]}>{label}</Text>
    </View>
  );
}

function GoalButton({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.goalButton,
        selected && styles.goalButtonSelected,
        pressed && styles.buttonPressed,
      ]}>
      <Text style={[styles.goalButtonText, selected && styles.goalButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function toScanCapture(picture: CameraCapturedPicture): ScanCapture {
  return {
    format: picture.format,
    height: picture.height,
    uri: picture.uri,
    width: picture.width,
  };
}

function scanPlatform(): 'android' | 'ios' | 'web' | 'unknown' {
  if (Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web') {
    return Platform.OS;
  }
  return 'unknown';
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const styles = StyleSheet.create({
  workspace: {
    alignSelf: 'center',
    gap: spacing.md,
    maxWidth: 620,
    width: '100%',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 420,
  },
  goalControl: {
    alignSelf: 'center',
    backgroundColor: colors.navigation,
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  goalButton: {
    alignItems: 'center',
    borderRadius: 4,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 112,
    paddingHorizontal: spacing.md,
  },
  goalButtonSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  goalButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  goalButtonTextSelected: {
    color: colors.brand,
  },
  progressRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    maxWidth: 360,
    width: '80%',
  },
  progressStep: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 62,
  },
  progressRule: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
    marginBottom: 21,
  },
  progressDot: {
    alignItems: 'center',
    backgroundColor: colors.surfaceQuiet,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  progressDotSelected: {
    borderColor: colors.brass,
    borderWidth: 2,
  },
  progressDotComplete: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  progressTextSelected: {
    color: colors.text,
  },
  cameraFrame: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.navigation,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  cameraShade: {
    alignItems: 'center',
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  cardGuide: {
    aspectRatio: 2.5 / 3.5,
    borderColor: colors.brass,
    borderRadius: 7,
    borderWidth: 2,
    maxWidth: 330,
    transform: [{ translateY: -36 }],
    width: '66%',
  },
  cameraTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  sideBadge: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  sideBadgeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  captureBar: {
    alignItems: 'center',
    bottom: spacing.lg,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  shutterOuter: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 38,
    borderWidth: 4,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  shutterInner: {
    backgroundColor: colors.text,
    borderColor: colors.canvas,
    borderRadius: 29,
    borderWidth: 2,
    height: 58,
    width: 58,
  },
  shutterPressed: {
    transform: [{ scale: 0.96 }],
  },
  reviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  reviewHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  previewItem: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 180,
  },
  previewImageFrame: {
    aspectRatio: 2.5 / 3.5,
    backgroundColor: colors.navigation,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewImage: {
    height: '100%',
    resizeMode: 'contain',
    width: '100%',
  },
  previewLabel: {
    backgroundColor: colors.overlay,
    borderRadius: 4,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    position: 'absolute',
    top: spacing.sm,
  },
  previewLabelText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.brand,
    borderRadius: 6,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    color: colors.canvas,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 42,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: colors.negative,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  completeState: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    maxWidth: 420,
    minHeight: 420,
    width: '100%',
  },
  completeIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  completeTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  completeCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  sessionID: {
    color: colors.brass,
    fontSize: 12,
    fontWeight: '800',
  },
  scanAnotherButton: {
    marginTop: spacing.sm,
    maxWidth: 260,
    width: '100%',
  },
  permissionState: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    maxWidth: 420,
    minHeight: 420,
    width: '100%',
  },
  permissionIcon: {
    alignItems: 'center',
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  permissionCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  permissionButton: {
    maxWidth: 260,
    width: '100%',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
