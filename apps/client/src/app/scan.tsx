import { CameraCapturedPicture, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Check,
  CircleCheck,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  RotateCcw,
  ScanLine,
  Search,
  Upload,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/theme';
import {
  confirmScanSession,
  createScanSession,
  getScanSession,
  resolveImageURL,
  ScanCapture,
  ScanSession,
} from '@/lib/api';

type CardSide = 'front' | 'back';
type CaptureMode = 'camera' | 'review' | 'complete';
type ScanGoal = 'identify' | 'condition';

const sideLabel: Record<CardSide, string> = {
  front: 'Front',
  back: 'Back',
};

export default function ScanScreen() {
  const camera = useRef<CameraView>(null);
  const { height: viewportHeight } = useWindowDimensions();
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
  const activeScanID = session?.id;
  const activeScanStatus = session?.status;
  const scannerStageMinHeight = Platform.OS === 'web' ? Math.max(420, viewportHeight - 270) : undefined;

  useEffect(() => {
    if (
      mode !== 'complete' ||
      !activeScanID ||
      (activeScanStatus !== 'captured' && activeScanStatus !== 'processing')
    ) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const current = await getScanSession(activeScanID);
        if (!cancelled) {
          setSession(current);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Scan status is unavailable.');
        }
      }
    };
    const interval = setInterval(() => void poll(), 1500);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeScanID, activeScanStatus, mode]);

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

  async function selectPhoto(side: CardSide) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        exif: false,
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;

      const capture = toPickerCapture(result.assets[0]);
      const nextCaptures = { ...captures, [side]: capture };
      setCaptures(nextCaptures);
      if (goal === 'condition' && (!nextCaptures.front || !nextCaptures.back)) {
        setActiveSide(nextCaptures.front ? 'back' : 'front');
      } else {
        setMode('review');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The photo could not be selected.');
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
      const saved = await createScanSession(front, back, scanPlatform(), goal);
      setSession(saved);
      setMode('complete');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scan could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMatch(candidateRank: number | null) {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSession(await confirmScanSession(session.id, candidateRank));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The match could not be confirmed.');
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
      subtitle="Photograph or upload cards for identification and condition review."
      title="Card scanner">
      <View style={[styles.scannerStage, { minHeight: scannerStageMinHeight }]}>
        {mode === 'camera' ? (
          Platform.OS === 'web' ? (
            <DesktopUploadState
              activeSide={activeSide}
              busy={busy}
              captures={captures}
              error={error}
              goal={goal}
              onPick={selectPhoto}
              onSelectGoal={selectGoal}
            />
          ) : !permission ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.brand} size="large" />
            </View>
          ) : !permission.granted ? (
            <PermissionState canAskAgain={permission.canAskAgain} request={requestPermission} />
          ) : (
            <View style={styles.workspace}>
              <View accessibilityRole="tablist" style={styles.goalControl}>
                <GoalButton
                  label="Front only"
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
                  <ProgressStep
                    complete={Boolean(captures.front)}
                    label="Front"
                    selected={activeSide === 'front'}
                  />
                  <View style={styles.progressRule} />
                  <ProgressStep
                    complete={Boolean(captures.back)}
                    label="Back"
                    selected={activeSide === 'back'}
                  />
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
          )
        ) : mode === 'review' ? (
          <View style={styles.workspace}>
            <View style={styles.reviewHeader}>
              <CircleCheck color={colors.brand} size={24} />
              <View style={styles.reviewHeadingCopy}>
                <Text style={styles.sectionTitle}>
                  {goal === 'condition' ? 'Both sides ready' : 'Card face ready'}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {goal === 'condition'
                    ? 'Review the full card and visible surface detail.'
                    : 'Review the card face.'}
                </Text>
              </View>
            </View>
            <View style={styles.previewGrid}>
              {(goal === 'condition' ? (['front', 'back'] as const) : (['front'] as const)).map(
                (side) => (
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
                ),
              )}
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
              <Text style={styles.primaryButtonText}>
                {busy ? 'Saving' : goal === 'identify' ? 'Match card' : 'Save and match'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <RecognitionState
            busy={busy}
            error={error}
            onConfirm={confirmMatch}
            onReset={reset}
            session={session}
          />
        )}
      </View>
    </Screen>
  );
}

function DesktopUploadState({
  activeSide,
  busy,
  captures,
  error,
  goal,
  onPick,
  onSelectGoal,
}: {
  activeSide: CardSide;
  busy: boolean;
  captures: Partial<Record<CardSide, ScanCapture>>;
  error: string | null;
  goal: ScanGoal;
  onPick: (side: CardSide) => Promise<void>;
  onSelectGoal: (goal: ScanGoal) => void;
}) {
  const currentCapture = captures[activeSide];

  return (
    <View style={styles.desktopUploadState}>
      <View accessibilityRole="tablist" style={styles.goalControl}>
        <GoalButton
          label="Front only"
          onPress={() => onSelectGoal('identify')}
          selected={goal === 'identify'}
        />
        <GoalButton
          label="Condition"
          onPress={() => onSelectGoal('condition')}
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

      <View style={styles.uploadPanel}>
        {currentCapture ? (
          <Image resizeMode="contain" source={{ uri: currentCapture.uri }} style={styles.uploadPreview} />
        ) : (
          <View style={styles.uploadIcon}>
            <ImagePlus color={colors.brass} size={32} />
          </View>
        )}
        <View style={styles.uploadCopy}>
          <Text style={styles.sectionTitle}>Card {activeSide}</Text>
          <Text style={styles.sectionSubtitle}>JPEG or PNG, up to 12 MB</Text>
        </View>
        <Pressable
          accessibilityLabel={`Choose card ${activeSide} photo`}
          disabled={busy}
          onPress={() => void onPick(activeSide)}
          style={({ pressed }) => [
            styles.primaryButton,
            styles.uploadButton,
            busy && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}>
          {busy ? (
            <ActivityIndicator color={colors.canvas} />
          ) : (
            <ImagePlus color={colors.canvas} size={19} />
          )}
          <Text style={styles.primaryButtonText}>{currentCapture ? 'Replace photo' : 'Choose photo'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
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

function RecognitionState({
  busy,
  error,
  onConfirm,
  onReset,
  session,
}: {
  busy: boolean;
  error: string | null;
  onConfirm: (candidateRank: number | null) => Promise<void>;
  onReset: () => void;
  session: ScanSession | null;
}) {
  if (!session || session.status === 'captured' || session.status === 'processing') {
    return (
      <View style={styles.completeState}>
        <View style={styles.processingIcon}>
          <Search color={colors.brass} size={30} />
        </View>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.completeTitle}>Matching card</Text>
        <Text style={styles.completeCopy}>Comparing the card face with verified catalog printings.</Text>
        {session ? <Text style={styles.sessionID}>Scan {session.id.slice(0, 8)}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  if (session.status === 'failed') {
    return (
      <View style={styles.completeState}>
        <View style={styles.failureIcon}>
          <X color={colors.negative} size={34} strokeWidth={3} />
        </View>
        <Text style={styles.completeTitle}>Match unavailable</Text>
        <Text style={styles.completeCopy}>The scan was stored, but its card could not be matched.</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <ScanAnotherButton onPress={onReset} />
      </View>
    );
  }

  if (session.confirmation) {
    const selected = session.candidates.find(
      (candidate) => candidate.rank === session.confirmation?.candidateRank,
    );
    return (
      <View style={styles.completeState}>
        <View style={styles.completeIcon}>
          <Check color={colors.canvas} size={34} strokeWidth={3} />
        </View>
        <Text style={styles.completeTitle}>
          {session.confirmation.decision === 'confirmed' ? 'Match confirmed' : 'Suggestions dismissed'}
        </Text>
        <Text style={styles.completeCopy}>
          {selected
            ? `${selected.cardName} / ${selected.setName} / ${selected.edition}`
            : 'No catalog printing was selected for this scan.'}
        </Text>
        {session.purpose === 'condition' ? (
          <Text style={styles.conditionNote}>Both card faces remain stored for later condition analysis.</Text>
        ) : null}
        <ScanAnotherButton onPress={onReset} />
      </View>
    );
  }

  return (
    <View style={styles.resultsState}>
      <View style={styles.resultsHeader}>
        <View style={styles.processingIcon}>
          <Search color={colors.brass} size={26} />
        </View>
        <View style={styles.resultsHeadingCopy}>
          <Text style={styles.completeTitle}>Possible matches</Text>
          <Text style={styles.sectionSubtitle}>Confirm the exact printing shown on your card.</Text>
        </View>
      </View>
      <View style={styles.candidateList}>
        {session.candidates.map((candidate) => (
          <Pressable
            accessibilityLabel={`Confirm ${candidate.cardName}, ${candidate.edition}, ${candidate.finish}`}
            disabled={busy}
            key={`${candidate.cardId}-${candidate.edition}-${candidate.finish}`}
            onPress={() => void onConfirm(candidate.rank)}
            style={({ pressed }) => [
              styles.candidateRow,
              busy && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            <View style={styles.candidateImageFrame}>
              <Image
                resizeMode="contain"
                source={{ uri: resolveImageURL(candidate.imageUrl) ?? undefined }}
                style={styles.candidateImage}
              />
            </View>
            <View style={styles.candidateCopy}>
              <Text style={styles.candidateRank}>
                {candidate.rank === 1 ? 'Best visual match' : `Alternative ${candidate.rank - 1}`}
              </Text>
              <Text numberOfLines={2} style={styles.candidateName}>
                {candidate.cardName}
              </Text>
              <Text numberOfLines={2} style={styles.candidateMeta}>
                {candidate.setName}{candidate.number ? ` #${candidate.number}` : ''}
              </Text>
              <Text numberOfLines={2} style={styles.candidatePrinting}>
                {candidate.edition} / {candidate.finish}
              </Text>
            </View>
            <View style={styles.confirmIcon}>
              {busy ? (
                <ActivityIndicator color={colors.canvas} size="small" />
              ) : (
                <Check color={colors.canvas} size={18} strokeWidth={3} />
              )}
            </View>
          </Pressable>
        ))}
      </View>
      {session.candidates.length === 0 ? (
        <Text style={styles.completeCopy}>No verified catalog image produced a useful match.</Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        disabled={busy}
        onPress={() => void onConfirm(null)}
        style={({ pressed }) => [
          styles.secondaryButton,
          busy && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}>
        <X color={colors.text} size={18} />
        <Text style={styles.secondaryButtonText}>None of these</Text>
      </Pressable>
    </View>
  );
}

function ScanAnotherButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        styles.scanAnotherButton,
        pressed && styles.buttonPressed,
      ]}>
      <Camera color={colors.canvas} size={19} />
      <Text style={styles.primaryButtonText}>Scan another</Text>
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

function toPickerCapture(asset: ImagePicker.ImagePickerAsset): ScanCapture {
  const mimeType = asset.mimeType?.toLowerCase();
  const filename = asset.fileName?.toLowerCase() ?? '';
  let format: ScanCapture['format'];
  if (mimeType === 'image/png' || filename.endsWith('.png')) {
    format = 'png';
  } else if (mimeType === 'image/jpeg' || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
    format = 'jpg';
  } else {
    throw new Error('Choose a JPEG or PNG image.');
  }
  if (asset.width <= 0 || asset.height <= 0) {
    throw new Error('The selected image dimensions could not be read.');
  }
  return {
    format,
    height: asset.height,
    uri: asset.uri,
    width: asset.width,
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
  scannerStage: {
    justifyContent: 'center',
    width: '100%',
  },
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
  desktopUploadState: {
    alignSelf: 'center',
    gap: spacing.md,
    maxWidth: 620,
    width: '100%',
  },
  uploadPanel: {
    alignItems: 'center',
    backgroundColor: colors.navigation,
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 310,
    padding: spacing.xl,
    width: '100%',
  },
  uploadIcon: {
    alignItems: 'center',
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  uploadPreview: {
    height: 168,
    width: 120,
  },
  uploadCopy: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  uploadButton: {
    alignSelf: 'center',
    maxWidth: 260,
    width: '100%',
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
  resultsState: {
    alignSelf: 'center',
    gap: spacing.md,
    maxWidth: 620,
    width: '100%',
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  resultsHeadingCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  completeIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  processingIcon: {
    alignItems: 'center',
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  failureIcon: {
    alignItems: 'center',
    backgroundColor: colors.offlineSurface,
    borderColor: colors.offlineBorder,
    borderRadius: 34,
    borderWidth: 1,
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
  conditionNote: {
    color: colors.brass,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  candidateList: {
    gap: spacing.sm,
  },
  candidateRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 126,
    padding: spacing.sm,
  },
  candidateImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.navigation,
    borderRadius: 5,
    height: 108,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 77,
  },
  candidateImage: {
    height: '100%',
    width: '100%',
  },
  candidateCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  candidateRank: {
    color: colors.brass,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  candidateName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  candidateMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  candidatePrinting: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '700',
  },
  confirmIcon: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  scanAnotherButton: {
    alignSelf: 'center',
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
    alignSelf: 'center',
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
