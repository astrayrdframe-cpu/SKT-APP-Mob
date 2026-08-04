import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { useNavigation, useRoute, useIsFocused, RouteProp } from '@react-navigation/native';
import { useCameraPermission } from 'react-native-vision-camera';
import { CodeScanner, Barcode } from 'react-native-vision-camera-barcode-scanner';
import type { RootStackParamList } from '../navigation/AppNavigation';
import { findMasterPekerjaByNik } from '../api/pekerjaApi';
import { MasterPekerja } from '../types/pekerja';

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
  const onScanned = route.params?.onScanned;

  const { hasPermission, requestPermission } = useCameraPermission();

  const [scanState, setScanState] = useState<ScanState>(hasPermission ? 'idle' : 'no-permission');
  const [scannedNik, setScannedNik] = useState<string | null>(null);
  const [matchedPekerja, setMatchedPekerja] = useState<MasterPekerja | null>(null);

  // onBarcodeScanned fires on every detected frame (up to ~30/sec) while a
  // code stays in view, not once per physical scan — this guard plus
  // isActive={false} (via scanState !== 'idle' below) stops it from firing
  // a lookup per-frame.
  const isProcessingRef = useRef(false);

  React.useEffect(() => {
    if (!hasPermission) {
      requestPermission().then((granted) => {
        setScanState(granted ? 'idle' : 'no-permission');
      });
    }
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
    } catch (err) {
      setMatchedPekerja(null);
      setScanState('not-found');
    }
  }, []);

  const handleBarcodeScanned = (barcodes: Barcode[]) => {
    if (isProcessingRef.current) return;
    const value = barcodes[0]?.rawValue?.trim();
    if (!value) return;

    isProcessingRef.current = true;
    handleScannedNik(value);
  };

  const resetToIdle = () => {
    isProcessingRef.current = false;
    setScannedNik(null);
    setMatchedPekerja(null);
    setScanState('idle');
  };

  const handleGunakan = () => {
    if (matchedPekerja) {
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
        <Text style={styles.topBarTitle}>Scan Absensi</Text>
        <View style={{ width: 20 }} />
      </View>

      {/* Camera + built-in MLKit code scanner — only mounted once permission
          is confirmed, since device enumeration can legitimately return
          nothing before that, which is what was causing the crash here. */}
      <View style={styles.cameraArea}>
        {hasPermission ? (
          <CodeScannerErrorBoundary
            onDeviceUnavailable={() => setScanState('no-device')}
          >
            <CodeScanner
              style={StyleSheet.absoluteFill}
              isActive={isCameraActive}
              barcodeFormats={['qr-code']}
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
          <Text style={styles.cameraHint}>Arahkan kamera ke QR code pekerja</Text>
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
              Tidak ada kamera yang terdeteksi di perangkat ini. Jika ini adalah emulator,
              pastikan kamera diaktifkan di pengaturan AVD. Di perangkat fisik, coba tutup dan
              buka ulang aplikasi.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setScanState('idle')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        )}

        {scanState === 'idle' && <Text style={styles.idleText}>Menunggu QR code...</Text>}

        {scanState === 'verifying' && (
          <View style={styles.centeredRow}>
            <ActivityIndicator color="#2F5FD1" />
            <Text style={styles.verifyingText}>Memverifikasi NIK {scannedNik}...</Text>
          </View>
        )}

        {scanState === 'success' && matchedPekerja && (
          <View>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Pekerja Ditemukan</Text>
            <Text style={styles.workerName}>{matchedPekerja.namaPekerja}</Text>
            <Text style={styles.workerMeta}>
              NIK {matchedPekerja.nik} · {matchedPekerja.nomorAbsen}
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={resetToIdle}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>Scan Lagi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleGunakan}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>Gunakan</Text>
              </TouchableOpacity>
            </View>
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
  secondaryButton: {
    backgroundColor: '#F2F4F7',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  secondaryButtonText: { color: '#475467', fontWeight: '700', fontSize: 13 },
  primaryButton: {
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});