import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useNavigation, useRoute, useIsFocused, RouteProp } from '@react-navigation/native';
import { useCameraPermission } from 'react-native-vision-camera';
import { CodeScanner, Barcode } from 'react-native-vision-camera-barcode-scanner';
import type { RootStackParamList } from '../../navigation/mainNavigation';
import { findMasterPekerjaByNik } from '../../../services/API/pekerjaApi';
import { MasterPekerja } from '../../../services/pekerja';

type ScanState = 'no-permission' | 'no-device' | 'idle' | 'verifying' | 'success' | 'not-found';

type AbsensiScanRouteProp = RouteProp<RootStackParamList, 'AbsensiScan'>;

// CodeScanner throws synchronously in its render if no camera device is
// found (e.g. an emulator without a camera configured, or a brief timing
// gap before the OS finishes enumerating devices). A plain try/catch can't
// catch a render-time throw from a child component — only a class-based
// error boundary can — so this turns that crash into a normal state update
// instead of a red error screen.
class CodeScannerErrorBoundary extends React.Component<
  { children: React.ReactNode; onDeviceUnavailable: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onDeviceUnavailable();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function AbsensiScanScreen() {
  const navigation = useNavigation();
  const route = useRoute<AbsensiScanRouteProp>();
  const isFocused = useIsFocused();
  const mode = route.params?.mode ?? 'pekerja';
  const onScanned = route.params?.onScanned;
  const onScannedCode = route.params?.onScannedCode;
  const onCancelled = route.params?.onCancelled;
  const isBarcodeMode = mode === 'barcode';

  const { hasPermission, requestPermission } = useCameraPermission();

  const [scanState, setScanState] = useState<ScanState>(hasPermission ? 'idle' : 'no-permission');
  const [scannedNik, setScannedNik] = useState<string | null>(null);
  const [matchedPekerja, setMatchedPekerja] = useState<MasterPekerja | null>(null);

  // On some devices, CameraX/MLKit can transiently report zero available
  // devices for a brief moment right after permission is granted — the OS
  // hasn't finished registering the camera as usable yet, even though the
  // hardware is fine. A short delay before actually mounting <CodeScanner>
  // avoids racing that window.
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Bumped on every "Coba Lagi" tap to force CodeScannerErrorBoundary to
  // fully remount (its own `hasError` state never resets on its own, so
  // without this, retrying after one failure would do nothing forever).
  const [retryKey, setRetryKey] = useState(0);

  // Set right before a successful "Gunakan" — lets the beforeRemove
  // listener below tell the difference between "left because of a
  // completed scan" (already handled via onScanned) and "left some other
  // way" (X button, hardware back, swipe-back gesture — none of which were
  // reopening TambahPekerjaModal before, silently dropping the admin back
  // onto the bare Detail Meja screen instead of resuming where they left off).
  const resolvedRef = useRef(false);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!resolvedRef.current) {
        onCancelled?.();
      }
    });
    return unsubscribe;
  }, [navigation, onCancelled]);

  // onBarcodeScanned fires on every detected frame (up to ~30/sec) while a
  // code stays in view, not once per physical scan — this guard plus
  // isActive={false} (via scanState !== 'idle' below) stops it from firing
  // a lookup per-frame.
  const isProcessingRef = useRef(false);

  React.useEffect(() => {
    if (!hasPermission) {
      setIsCameraReady(false);
      requestPermission().then((granted) => {
        setScanState(granted ? 'idle' : 'no-permission');
      });
      return;
    }

    setIsCameraReady(false);
    const timer = setTimeout(() => setIsCameraReady(true), 500);
    return () => clearTimeout(timer);
  }, [hasPermission, requestPermission]);

  const handleScannedNik = useCallback(async (nik: string) => {
    setScannedNik(nik);
    setScanState('verifying');

    try {
      const pekerja = await findMasterPekerjaByNik(nik);
      if (pekerja) {
        setMatchedPekerja(pekerja);
        setScanState('success');
      } else {
        setMatchedPekerja(null);
        setScanState('not-found');
      }
    } catch {
      setMatchedPekerja(null);
      setScanState('not-found');
    }
  }, []);

  // Barcode-tray mode has nothing to verify a code against (no master
  // tray/batch table exists yet — see resolveBarcodeTray in sktApi.ts) —
  // any nonempty code read off the camera is accepted immediately, and
  // the caller (TambahSetoranModal) resolves it to a batang quantity
  // after it navigates back.
  const handleScannedBarcode = useCallback((code: string) => {
    setScannedNik(code);
    setMatchedPekerja(null);
    setScanState('success');
  }, []);

  const handleBarcodeScanned = (barcodes: Barcode[]) => {
    if (isProcessingRef.current) return;
    const value = barcodes[0]?.rawValue?.trim();
    if (!value) return;

    isProcessingRef.current = true;
    if (isBarcodeMode) {
      handleScannedBarcode(value);
    } else {
      handleScannedNik(value);
    }
  };

  const resetToIdle = () => {
    isProcessingRef.current = false;
    setScannedNik(null);
    setMatchedPekerja(null);
    setScanState('idle');
  };

  const handleGunakan = () => {
    if (isBarcodeMode) {
      if (scannedNik) {
        resolvedRef.current = true;
        onScannedCode?.(scannedNik);
      }
    } else if (matchedPekerja) {
      resolvedRef.current = true;
      onScanned?.(matchedPekerja);
    }
    navigation.goBack();
  };

  // Camera only runs while this screen is focused AND we're actually
  // waiting for a code (paused during verifying/success/not-found so it
  // doesn't keep re-firing scans on top of a result already being shown).
  const isCameraActive = isFocused && scanState === 'idle';

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close scanner">
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{isBarcodeMode ? 'Scan Barcode Tray' : 'Scan Absensi'}</Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Camera + built-in MLKit code scanner — only mounted once permission
          is confirmed AND a short settle delay has passed, since device
          enumeration can transiently return nothing right after permission
          is granted on some devices, which is what was causing the crash
          here. key={retryKey} forces a full remount (and a fresh error
          boundary) every time "Coba Lagi" is tapped. */}
      <View style={styles.cameraArea}>
        {isCameraReady ? (
          <CodeScannerErrorBoundary
            key={retryKey}
            onDeviceUnavailable={() => setScanState('no-device')}
          >
            <CodeScanner
              style={StyleSheet.absoluteFill}
              isActive={isCameraActive}
              barcodeFormats={['all-formats']}
              onBarcodeScanned={handleBarcodeScanned}
              onError={() => setScanState('not-found')}
            />
          </CodeScannerErrorBoundary>
        ) : null}

        <View pointerEvents="none" style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {isCameraActive && (
          <Text style={styles.cameraHint}>
            {isBarcodeMode ? 'Arahkan kamera ke barcode tray' : 'Arahkan kamera ke barcode pekerja'}
          </Text>
        )}
      </View>

      {/* Bottom status panel — content swaps based on scanState */}
      <View style={styles.statusPanel}>
        {scanState === 'no-permission' && (
          <View>
            <Text style={styles.errorTitle}>Izin Kamera Ditolak</Text>
            <Text style={styles.errorSubtitle}>
              Aktifkan izin kamera untuk aplikasi ini di pengaturan perangkat, lalu coba lagi.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Buka Pengaturan</Text>
            </TouchableOpacity>
          </View>
        )}

        {scanState === 'no-device' && (
          <View>
            <Text style={styles.errorTitle}>Kamera Tidak Ditemukan</Text>
            <Text style={styles.errorSubtitle}>
              Tidak ada kamera yang terdeteksi. Coba tutup paksa dan buka ulang aplikasi
              (permission kamera yang baru saja diberikan kadang butuh restart aplikasi
              penuh, bukan reload). Jika ini emulator, pastikan kamera diaktifkan di
              pengaturan AVD.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setRetryKey((k) => k + 1);
                setScanState('idle');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        )}

        {scanState === 'idle' && (
          <Text style={styles.idleText}>
            {isBarcodeMode ? 'Menunggu barcode tray...' : 'Menunggu barcode...'}
          </Text>
        )}

        {scanState === 'verifying' && (
          <View style={styles.centeredRow}>
            <ActivityIndicator color="#2F5FD1" />
            <Text style={styles.verifyingText}>Memverifikasi NIK {scannedNik}...</Text>
          </View>
        )}

        {scanState === 'success' && isBarcodeMode && scannedNik && (
          <View>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Barcode Terdeteksi</Text>
            <Text style={styles.workerName}>{scannedNik}</Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.fullWidthButton]}
              onPress={handleGunakan}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Gunakan</Text>
            </TouchableOpacity>
          </View>
        )}

        {scanState === 'success' && !isBarcodeMode && matchedPekerja && (
          <View>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Pekerja Ditemukan</Text>
            <Text style={styles.workerName}>{matchedPekerja.namaPekerja}</Text>
            <Text style={styles.workerMeta}>
              NIK {matchedPekerja.nik} · {matchedPekerja.nomorAbsen}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.fullWidthButton]}
              onPress={handleGunakan}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Gunakan</Text>
            </TouchableOpacity>
          </View>
        )}

        {scanState === 'not-found' && (
          <View>
            <View style={styles.errorIconCircle}>
              <Text style={styles.errorIconText}>✕</Text>
            </View>
            <Text style={styles.errorTitle}>NIK Tidak Ditemukan</Text>
            <Text style={styles.errorSubtitle}>
              NIK {scannedNik} belum terdaftar. Coba scan ulang atau hubungi admin.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={resetToIdle} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0F1A' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
  },
  closeIcon: { color: '#FFFFFF', fontSize: 18 },
  topBarTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cameraArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  scanFrame: {
    width: 220,
    height: 220,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#2F5FD1',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  cameraHint: {
    position: 'absolute',
    bottom: -32,
    color: '#98A2B3',
    fontSize: 12,
    textAlign: 'center',
  },
  statusPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleText: { fontSize: 13, color: '#667085', fontWeight: '500' },
  centeredRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifyingText: { fontSize: 13, color: '#344054', fontWeight: '600' },
  successIconCircle: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  successIconText: { fontSize: 22, color: '#12B76A', fontWeight: '700' },
  successTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
    textAlign: 'center',
    marginBottom: 4,
  },
  workerName: { fontSize: 13, fontWeight: '600', color: '#344054', textAlign: 'center' },
  workerMeta: { fontSize: 11, color: '#667085', textAlign: 'center', marginTop: 2, marginBottom: 16 },
  errorIconCircle: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  errorIconText: { fontSize: 22, color: '#D92D20', fontWeight: '700' },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 12,
    color: '#667085',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  buttonRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  primaryButton: {
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  fullWidthButton: { alignSelf: 'stretch', marginTop: 4 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13, textAlign: 'center' },
});