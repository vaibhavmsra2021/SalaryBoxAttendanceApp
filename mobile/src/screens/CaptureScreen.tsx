import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';

import { colors } from '../theme';
import { Banner, Button } from '../ui';

type Fix = { latitude: number; longitude: number };
type Box = { x: number; y: number; width: number; height: number };

function faceOval(viewWidth: number, viewHeight: number): Box {
  let width = viewWidth * 0.72;
  let height = width * 1.28;
  const maxHeight = viewHeight * 0.78;
  if (height > maxHeight) {
    height = maxHeight;
    width = height / 1.28;
  }
  const y = Math.max(0, Math.min((viewHeight - height) / 2, viewHeight - height));
  return {
    x: (viewWidth - width) / 2,
    y,
    width,
    height,
  };
}

function cropForOval(imageWidth: number, imageHeight: number, viewWidth: number, viewHeight: number, oval: Box) {
  const padX = oval.width * 0.22;
  const padY = oval.height * 0.16;
  const guide = {
    x: oval.x - padX,
    y: oval.y - padY,
    width: oval.width + padX * 2,
    height: oval.height + padY * 2,
  };
  const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
  const offsetX = (imageWidth * scale - viewWidth) / 2;
  const offsetY = (imageHeight * scale - viewHeight) / 2;
  const originX = Math.max(0, Math.min((offsetX + guide.x) / scale, imageWidth - 1));
  const originY = Math.max(0, Math.min((offsetY + guide.y) / scale, imageHeight - 1));
  const width = Math.max(1, Math.min(guide.width / scale, imageWidth - originX));
  const height = Math.max(1, Math.min(guide.height / scale, imageHeight - originY));
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function CaptureScreen({
  hint,
  submitLabel,
  needsLocation,
  onSubmit,
}: {
  hint: string;
  submitLabel: string;
  needsLocation?: boolean;
  onSubmit: (photoUri: string, location: Fix | null) => Promise<void>;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<Fix | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(Boolean(needsLocation));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  async function readLocation() {
    setLocating(true);
    setLocationError(null);
    const result = await Location.requestForegroundPermissionsAsync();
    if (result.status !== 'granted') {
      setLocation(null);
      setLocationError('Location permission is required to mark attendance.');
      setLocating(false);
      return;
    }
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
    } catch {
      setLocation(null);
      setLocationError('Could not read your location. Move closer to a window and try again.');
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!needsLocation) return;
    let cancelled = false;
    void (async () => {
      setLocating(true);
      setLocationError(null);
      const result = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (result.status !== 'granted') {
        setLocation(null);
        setLocationError('Location permission is required to mark attendance.');
        setLocating(false);
        return;
      }
      try {
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setLocation({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
      } catch {
        if (cancelled) return;
        setLocation(null);
        setLocationError('Could not read your location. Move closer to a window and try again.');
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsLocation]);

  async function takePhoto() {
    if (!ready) return;
    const shot = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
    if (!shot?.uri) return;
    setError(null);
    if (!shot.width || !shot.height || stage.width < 1 || stage.height < 1) {
      setPhoto(shot.uri);
      return;
    }
    const oval = faceOval(stage.width, stage.height);
    const crop = cropForOval(shot.width, shot.height, stage.width, stage.height, oval);
    try {
      const cropped = await manipulateAsync(shot.uri, [{ crop }], {
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      setPhoto(cropped.uri);
    } catch {
      setPhoto(shot.uri);
    }
  }

  async function submit() {
    if (!photo) return;
    if (needsLocation && !location) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(photo, location);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Camera access is required to photograph a face.</Text>
        <Button label="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  const canSubmit = Boolean(photo) && !busy && (!needsLocation || Boolean(location));

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>{hint}</Text>
      {needsLocation ? (
        <Text style={styles.location}>
          {locating
            ? 'Finding your location...'
            : location
              ? `Location ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
              : locationError}
        </Text>
      ) : null}
      <Text style={styles.guide}>Fit your face in the oval. A normal distance is fine.</Text>
      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStage({ width, height });
        }}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.preview} />
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={styles.preview}
              facing="front"
              onCameraReady={() => setReady(true)}
            />
            {stage.width > 0 ? <FaceGuide stage={stage} /> : null}
          </>
        )}
      </View>
      {error ? <Banner message={error} /> : null}
      <View style={styles.actions}>
        {photo ? (
          <>
            <Button label="Retake" tone="ghost" onPress={() => setPhoto(null)} disabled={busy} />
            <Button
              label={busy ? 'Sending...' : submitLabel}
              onPress={submit}
              disabled={!canSubmit}
            />
          </>
        ) : (
          <Button label={ready ? 'Take selfie' : 'Starting camera...'} onPress={takePhoto} disabled={!ready} />
        )}
        {needsLocation && locationError ? (
          <Button label="Retry location" tone="ghost" onPress={readLocation} disabled={locating || busy} />
        ) : null}
      </View>
    </View>
  );
}

function FaceGuide({ stage }: { stage: { width: number; height: number } }) {
  const oval = faceOval(stage.width, stage.height);
  const bottom = Math.max(0, stage.height - (oval.y + oval.height));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.shade, { height: oval.y }]} />
      <View style={[styles.band, { height: oval.height }]}>
        <View style={[styles.shade, styles.side, { width: oval.x }]} />
        <View
          style={[
            styles.oval,
            { width: oval.width, height: oval.height, borderRadius: oval.width / 2 },
          ]}
        />
        <View style={[styles.shade, styles.side, { width: oval.x }]} />
      </View>
      <View style={[styles.shade, { height: bottom }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  location: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  guide: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  stage: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#111' },
  preview: { flex: 1 },
  shade: { backgroundColor: 'rgba(12, 16, 20, 0.55)' },
  side: { height: '100%' },
  band: { flexDirection: 'row' },
  oval: {
    borderWidth: 3,
    borderColor: '#F4F7F2',
    backgroundColor: 'transparent',
  },
  actions: { gap: 10 },
});
