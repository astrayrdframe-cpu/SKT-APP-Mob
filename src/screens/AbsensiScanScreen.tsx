import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

type ScanState = 'idle' | 'verifying' | 'success' | 'not-found';

interface ScannedWorker {
  namaPekerja: string;
  nik: string;
  nomorAbsen: string;
}

// Preview-only mock — the real scanned worker comes from resolving the
// QR payload's NIK against skt_master_pekerja once the scan logic is wired up.
const MOCK_SCANNED_WORKER: ScannedWorker = {
  namaPekerja: 'REBINAH',
  nik: '0471FE1',
  nomorAbsen: 'GL471',
};

export default function AbsensiScanScreen() {
  const navigation = useNavigation();
  const [scanState, setScanState] = useState<ScanState>('idle');

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

      {/* Camera preview placeholder — swap for react-native-vision-camera's
          <Camera /> component once the scan logic is wired up. */}
      <View style={styles.cameraArea}>
        <View style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.cameraHint}>Arahkan kamera ke QR code pekerja</Text>
      </View>

      {/* Bottom status panel — content swaps based on scanState */}
      <View style={styles.statusPanel}>
        {scanState === 'idle' && <Text style={styles.idleText}>Menunggu QR code...</Text>}

        {scanState === 'verifying' && (
          <View style={styles.centeredRow}>
            <ActivityIndicator color="#2F5FD1" />
            <Text style={styles.verifyingText}>Memverifikasi NIK...</Text>
          </View>
        )}

        {scanState === 'success' && (
          <View>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Absen Berhasil</Text>
            <Text style={styles.workerName}>{MOCK_SCANNED_WORKER.namaPekerja}</Text>
            <Text style={styles.workerMeta}>
              NIK {MOCK_SCANNED_WORKER.nik} · {MOCK_SCANNED_WORKER.nomorAbsen}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setScanState('idle')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Scan Berikutnya</Text>
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
              Pekerja ini belum terdaftar. Coba scan ulang atau hubungi admin.
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
      </View>

      {/* DEV-ONLY preview switcher — lets every UI state be checked without a
          real camera/QR payload wired up yet. Remove once scan logic lands. */}
      <View style={styles.devSwitcher}>
        <Text style={styles.devSwitcherLabel}>Preview state:</Text>
        <View style={styles.devSwitcherRow}>
          {(['idle', 'verifying', 'success', 'not-found'] as ScanState[]).map((state) => (
            <TouchableOpacity
              key={state}
              style={[styles.devChip, scanState === state && styles.devChipActive]}
              onPress={() => setScanState(state)}
            >
              <Text style={[styles.devChipText, scanState === state && styles.devChipTextActive]}>
                {state}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
  cameraHint: { color: '#98A2B3', fontSize: 12, marginTop: 20, textAlign: 'center' },
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
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  devSwitcher: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  devSwitcherLabel: { color: '#98A2B3', fontSize: 10, marginBottom: 6 },
  devSwitcherRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  devChip: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  devChipActive: { backgroundColor: '#2F5FD1', borderColor: '#2F5FD1' },
  devChipText: { color: '#98A2B3', fontSize: 10, fontWeight: '600' },
  devChipTextActive: { color: '#FFFFFF' },
});
