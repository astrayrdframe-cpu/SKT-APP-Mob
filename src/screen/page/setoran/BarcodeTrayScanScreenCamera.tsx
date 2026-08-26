// Dedicated camera scanner for Tambah Setoran's "+ Scan to Add" (Barcode
// Tray) — a separate screen from AbsensiScanScreenCamera (which handles
// Pekerja Giling/Batil badge scans against skt_master_pekerja). This one
// scans a tray barcode and verifies it against skt/test_temp
// (SKT_TEST_TEMP_ENDPOINT) instead — a standalone test table used as a
// stand-in until a real master tray/batch table exists (see
// findTestTempRowByCode in sktApi.ts). Kept as its own screen/route rather
// than another mode on AbsensiScanScreenCamera since it verifies against a
// completely different data source, not a variant of the pekerja lookup.
//
// Split into this "Camera" file plus a thin BarcodeTrayScanScreen.tsx
// wrapper for the same reason AbsensiScanScreenCamera is — see that
// wrapper's own comment: this file is the one that touches
// react-native-vision-camera at the top level, so it's require()'d inside
// a try/catch rather than statically imported, keeping a bad camera
// install from crashing the whole navigator.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useNavigation, useRoute, useIsFocused, RouteProp } from '@react-navigation/native';
import { useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { CodeScanner, Barcode } from 'react-native-vision-camera-barcode-scanner';
import type { RootStackParamList } from '../../navigation/mainNavigation';
import { findTestTempRowByCode } from '../../../services/API/sktApi';
import { TestTempRow } from '../../../services/skt';

type ScanState = 'no-permission' | 'no-device' | 'idle' | 'verifying' | 'success' | 'not-found';

type BarcodeTrayScanRouteProp = RouteProp<RootStackParamList, 'BarcodeTrayScan'>;

// Same reasoning as AbsensiScanScreenCamera's identical class — CodeScanner
// throws synchronously in its render if no camera device is found, and
// only a class-based error boundary can catch a render-time throw from a
// child component.
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

export default function BarcodeTrayScanScreen() {
  const navigation = useNavigation();
  const route = useRoute<BarcodeTrayScanRouteProp>();
  const isFocused = useIsFocused();
  const onScannedCode = route.params?.onScannedCode;
  const onCancelled = route.params?.onCancelled;

  const { hasPermission, requestPermission } = useCameraPermission();

  // See AbsensiScanScreenCamera's identical `device` comment — reactive,
  // not a guessed fixed delay, so the very first open of this screen in a
  // session doesn't wrongly show "Kamera Tidak Ditemukan" while the
  // camera factory is still resolving.
  const device = useCameraDevice('back');

  const [scanState, setScanState] = useState<ScanState>(hasPermission ? 'idle' : 'no-permission');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [matchedTestTemp, setMatchedTestTemp] = useState<TestTempRow | null>(null);

  // Bumped on every "Coba Lagi" tap to force CodeScannerErrorBoundary to
  // fully remount and to restart the no-device grace timer below.
  const [retryKey, setRetryKey] = useState(0);

  // Set right before a successful "Gunakan" — lets the beforeRemove
  // listener below tell "left because of a completed scan" (already
  // handled via onScannedCode) apart from "left some other way" (X
  // button, hardware back, swipe-back), so TambahSetoranModal reliably
  // reopens no matter how the scan ends.
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
    if (hasPermission) return;
    requestPermission().then((granted) => {
      setScanState(granted ? 'idle' : 'no-permission');
    });
  }, [hasPermission, requestPermission]);

  // Genuine "no camera" fallback — if `device` is still unresolved after a
  // generous grace period, stop waiting and show the real error state.
  // Restarts on every "Coba Lagi" via retryKey.
  React.useEffect(() => {
    if (!hasPermission || device != null) return;
    const timer = setTimeout(() => {
      setScanState((current) => (current === 'idle' ? 'no-device' : current));
    }, 6000);
    return () => clearTimeout(timer);
  }, [hasPermission, device, retryKey]);

  // Verify the scanned code against skt/test_temp — a match on `name_test`
  // (or `id` as a fallback) counts as "recognized"; anything else is
  // rejected. See findTestTempRowByCode in sktApi.ts for the matching
  // rule and why test_temp stands in for a real tray/batch table.
  const handleScannedCode = useCallback(async (code: string) => {
    setScannedCode(code);
    setScanState('verifying');

    try {
      const match = await findTestTempRowByCode(code);
      if (match) {
        setMatchedTestTemp(match);
        setScanState('success');
      } else {
        setMatchedTestTemp(null);
        setScanState('not-found');
      }
    } catch {
      setMatchedTestTemp(null);
      setScanState('not-found');
    }
  }, []);

  const handleBarcodeScanned = (barcodes: Barcode[]) => {
    if (isProcessingRef.current) return;
    const value = barcodes[0]?.rawValue?.trim();
    if (!value) return;

    isProcessingRef.current = true;
    handleScannedCode(value);
  };

  const resetToIdle = () => {
    isProcessingRef.current = false;
    setScannedCode(null);
    setMatchedTestTemp(null);
    setScanState('idle');
  };

  const handleGunakan = () => {
    if (scannedCode && matchedTestTemp) {
      resolvedRef.current = true;
      onScannedCode?.(scannedCode);
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
        <Text style={styles.topBarTitle}>Scan Barcode Tray</Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Camera + built-in MLKit code scanner — see AbsensiScanScreenCamera's
          identical comment for why mounting waits on both `hasPermission`
          and a resolved `device`, and why key={retryKey} forces a full
          remount (fresh error boundary) on every "Coba Lagi". */}
      <View style={styles.cameraArea}>
        {hasPermission && device != null ? (
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
        ) : hasPermission && scanState === 'idle' ? (
          <ActivityIndicator color="#2F5FD1" />
        ) : null}

        <View pointerEvents="none" style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {isCameraActive && device != null && (
          <Text style={styles.cameraHint}>Arahkan kamera ke barcode tray</Text>
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

        {scanState === 'idle' && device == null && (
          <Text style={styles.idleText}>Menyiapkan kamera...</Text>
        )}

        {scanState === 'idle' && device != null && (
          <Text style={styles.idleText}>Menunggu barcode tray...</Text>
        )}

        {scanState === 'verifying' && (
          <View style={styles.centeredRow}>
            <ActivityIndicator color="#2F5FD1" />
            <Text style={styles.verifyingText}>Memverifikasi barcode {scannedCode}...</Text>
          </View>
        )}

        {scanState === 'success' && scannedCode && matchedTestTemp && (
          <View>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Barcode Ditemukan</Text>
            <Text style={styles.workerName}>{scannedCode}</Text>
            <Text style={styles.workerMeta}>Cocok dengan "{matchedTestTemp.nameTest}"</Text>
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
            <Text style={styles.errorTitle}>Barcode Tidak Dikenali</Text>
            <Text style={styles.errorSubtitle}>
              Barcode {scannedCode} tidak ditemukan di data. Coba scan ulang atau hubungi admin.
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
