// Tambah Setoran — logs one new setoran submission (a giling + batil pair,
// the tray barcodes scanned for them, and any bad/waste count) against an
// existing SKT Header. Opened from the "+ Tambah Setoran" button at the
// bottom of SKTHeaderDetailScreen.
//
// Rendered as its own full-screen native Modal (not a bottom sheet, unlike
// DetailMejaModal) since the reference design is a dedicated screen with
// its own top bar — closer to AbsensiScanScreenCamera's full-takeover shape
// than to a dialog. Scanning (Pekerja Giling / Batil / Barcode Tray) all
// reuse the same "hide this modal, navigate to AbsensiScan, reopen once it
// resolves" pattern SKTHeaderDetailScreen already uses for TambahPekerjaModal
// — this component doesn't call navigation.navigate itself, the parent does
// (via onPressScanGiling/Batil/Tray) and hands the result back through the
// scannedGiling/scannedBatil/scannedTrayCode props.
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { MasterPekerja } from '../../../services/pekerja';
import { BarcodeTrayRow } from '../../../services/skt';
import { resolveBarcodeTray, SubmitSetoranPayload } from '../../../services/API/sktApi';

interface TambahSetoranModalProps {
  visible: boolean;
  onClose: () => void;
  sktHeaderId: number;
  brand: string;
  jenisLabel: string;
  brakLabel: string; // e.g. "Djinggo"
  nomorMeja: number;
  setoranKe: number;
  isSubmitting?: boolean;
  onSubmit: (payload: SubmitSetoranPayload) => void;
  // Edit-mode hook: pass the two existing skt_log_pekerja ids to show
  // Hapus. No entry point wires this up yet (List Setoran rows aren't
  // tappable for edit), but the dialog is ready for it.
  existingSetoranId?: { gilingId: number; batilId: number } | null;
  onDelete?: () => void;
  onPressScanGiling: () => void;
  onPressScanBatil: () => void;
  onPressScanTray: () => void;
  scannedGiling?: MasterPekerja | null;
  scannedBatil?: MasterPekerja | null;
  scannedTrayCode?: string | null;
}

export default function TambahSetoranModal({
  visible,
  onClose,
  sktHeaderId,
  brand,
  jenisLabel,
  brakLabel,
  nomorMeja,
  setoranKe,
  isSubmitting = false,
  onSubmit,
  existingSetoranId = null,
  onDelete,
  onPressScanGiling,
  onPressScanBatil,
  onPressScanTray,
  scannedGiling,
  scannedBatil,
  scannedTrayCode,
}: TambahSetoranModalProps) {
  const [giling, setGiling] = useState<MasterPekerja | null>(null);
  const [batil, setBatil] = useState<MasterPekerja | null>(null);
  const [barcodeTrays, setBarcodeTrays] = useState<BarcodeTrayRow[]>([]);
  const [badWaste, setBadWaste] = useState(0);
  const [isResolvingTray, setIsResolvingTray] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!visible) return;
    setGiling(null);
    setBatil(null);
    setBarcodeTrays([]);
    setBadWaste(0);
  }, [visible]);

  // Pick up a freshly scanned giling pekerja handed back from AbsensiScan.
  useEffect(() => {
    if (!scannedGiling) return;
    if (batil && batil.nik === scannedGiling.nik) {
      Alert.alert('Tidak Bisa Digunakan', 'Pekerja ini sudah dipilih sebagai Pekerja Batil.');
      return;
    }
    setGiling(scannedGiling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedGiling]);

  // Pick up a freshly scanned batil pekerja handed back from AbsensiScan.
  useEffect(() => {
    if (!scannedBatil) return;
    if (giling && giling.nik === scannedBatil.nik) {
      Alert.alert('Tidak Bisa Digunakan', 'Pekerja ini sudah dipilih sebagai Pekerja Giling.');
      return;
    }
    setBatil(scannedBatil);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedBatil]);

  // Pick up a freshly scanned tray barcode and resolve it to a batang
  // count (see resolveBarcodeTray in sktApi.ts — placeholder until a real
  // master tray/batch table exists).
  useEffect(() => {
    if (!scannedTrayCode) return;
    if (barcodeTrays.some((t) => t.code === scannedTrayCode)) {
      Alert.alert('Barcode Sudah Discan', `Tray ${scannedTrayCode} sudah ada di daftar.`);
      return;
    }

    let isCancelled = false;
    setIsResolvingTray(true);
    resolveBarcodeTray(scannedTrayCode)
      .then((row) => {
        if (!isCancelled) setBarcodeTrays((prev) => [...prev, row]);
      })
      .catch(() => {
        if (!isCancelled) {
          Alert.alert('Gagal Membaca Barcode', `Barcode ${scannedTrayCode} tidak dikenali.`);
        }
      })
      .finally(() => {
        if (!isCancelled) setIsResolvingTray(false);
      });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedTrayCode]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const handleDeleteTray = (code: string) => {
    setBarcodeTrays((prev) => prev.filter((t) => t.code !== code));
  };

  const totalBatang = barcodeTrays.reduce((sum, t) => sum + t.batang, 0);
  const canSubmit = !!giling && !!batil && barcodeTrays.length > 0 && !isSubmitting;

  const handleSubmit = () => {
    if (!giling || !batil) return;
    onSubmit({
      sktHeaderId,
      nomorMeja,
      setoranKe,
      giling: {
        masterPekerjaId: giling.id,
        nik: giling.nik,
        namaPekerja: giling.namaPekerja,
        nomorAbsen: giling.nomorAbsen,
      },
      batil: {
        masterPekerjaId: batil.id,
        nik: batil.nik,
        namaPekerja: batil.namaPekerja,
        nomorAbsen: batil.nomorAbsen,
      },
      barcodeTrays,
      badWaste,
    });
  };

  const handleHapus = () => {
    if (!onDelete) return;
    Alert.alert('Hapus Setoran', 'Yakin ingin menghapus setoran ini?', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Tambah Setoran</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.topRow}>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Brand</Text>
                  <Text style={styles.infoValue}>{brand}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Jenis</Text>
                  <Text style={styles.infoValue}>{jenisLabel}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Brak</Text>
                  <Text style={styles.infoValue}>{brakLabel}</Text>
                </View>
              </View>
            </View>

            {existingSetoranId && (
              <TouchableOpacity style={styles.hapusButton} onPress={handleHapus} activeOpacity={0.85}>
                <Text style={styles.hapusButtonText}>Hapus</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Pekerja Giling</Text>
          <View style={styles.pekerjaRow}>
            <Text style={styles.pekerjaName} numberOfLines={1}>
              {giling ? giling.namaPekerja : 'Belum discan'}
            </Text>
            <TouchableOpacity style={styles.scanButton} onPress={onPressScanGiling} activeOpacity={0.8}>
              <Text style={styles.scanButtonText}>📷 Scan</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Pekerja Batil</Text>
          <View style={styles.pekerjaRow}>
            <Text style={styles.pekerjaName} numberOfLines={1}>
              {batil ? batil.namaPekerja : 'Belum discan'}
            </Text>
            <TouchableOpacity style={styles.scanButton} onPress={onPressScanBatil} activeOpacity={0.8}>
              <Text style={styles.scanButtonText}>📷 Scan</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.twoCol, styles.fieldSpacing]}>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Meja</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyValue}>{nomorMeja}</Text>
              </View>
            </View>
            <View style={styles.twoColItem}>
              <Text style={styles.fieldLabel}>Setoran ke</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyValue}>{setoranKe}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.sectionHead, styles.fieldSpacing]}>
            <Text style={styles.fieldLabel}>Barcode Tray</Text>
            <TouchableOpacity
              style={styles.scanToAddButton}
              onPress={onPressScanTray}
              activeOpacity={0.8}
              disabled={isResolvingTray}
            >
              {isResolvingTray ? (
                <ActivityIndicator size="small" color="#2F5FD1" />
              ) : (
                <Text style={styles.scanToAddButtonText}>+ Scan to Add</Text>
              )}
            </TouchableOpacity>
          </View>

          {barcodeTrays.length > 0 && (
            <View style={styles.trayCard}>
              <View style={styles.trayHeaderRow}>
                <Text style={[styles.trayHeaderText, styles.trayColCode]}>Code</Text>
                <Text style={[styles.trayHeaderText, styles.trayColBatang]}>Batang</Text>
                <Text style={[styles.trayHeaderText, styles.trayColAct]}>Act</Text>
              </View>
              {barcodeTrays.map((tray) => (
                <View key={tray.code} style={styles.trayRow}>
                  <Text style={[styles.trayCellCode, styles.trayColCode]}>{tray.code}</Text>
                  <Text style={[styles.trayCellBatang, styles.trayColBatang]}>{tray.batang}</Text>
                  <TouchableOpacity
                    style={styles.trayColAct}
                    onPress={() => handleDeleteTray(tray.code)}
                    accessibilityLabel={`Hapus tray ${tray.code}`}
                  >
                    <Text style={styles.trayDeleteIcon}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.traySummary}>
            <Text style={styles.traySummaryText}>
              {barcodeTrays.length} Barcode Tray - {totalBatang} Batang
            </Text>
          </View>

          <Text style={[styles.fieldLabel, styles.fieldSpacing]}>Bad / Waste</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setBadWaste((v) => Math.max(0, v - 1))}
              activeOpacity={0.8}
              accessibilityLabel="Kurangi Bad / Waste"
            >
              <Text style={styles.stepperButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{badWaste}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setBadWaste((v) => v + 1)}
              activeOpacity={0.8}
              accessibilityLabel="Tambah Bad / Waste"
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.stepperUnit}>Btg</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2F5FD1',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 16,
  },
  backIcon: { color: '#FFFFFF', fontSize: 20 },
  topBarTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoCol: { flexShrink: 1, paddingRight: 6 },
  infoLabel: { fontSize: 10, color: '#98A2B3', marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#101828' },
  hapusButton: {
    backgroundColor: '#D92D20',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hapusButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#101828' },
  fieldSpacing: { marginTop: 20, marginBottom: 8 },
  pekerjaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF1F5',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pekerjaName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#101828', letterSpacing: 0.2 },
  scanButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2F5FD1',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  scanButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  twoCol: { flexDirection: 'row', gap: 12 },
  twoColItem: { flex: 1 },
  readonlyBox: {
    marginTop: 8,
    backgroundColor: '#EEF1F5',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  readonlyValue: { fontSize: 15, fontWeight: '700', color: '#101828' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanToAddButton: {
    borderWidth: 1.4,
    borderColor: '#2F5FD1',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  scanToAddButtonText: { color: '#2F5FD1', fontSize: 11, fontWeight: '700' },

  trayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF1F5',
    paddingHorizontal: 14,
    paddingTop: 10,
    marginTop: 10,
  },
  trayHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    paddingBottom: 8,
  },
  trayHeaderText: { fontSize: 10, color: '#98A2B3', fontWeight: '600' },
  trayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  trayColCode: { flex: 1 },
  trayColBatang: { flex: 1 },
  trayColAct: { flex: 0.6, alignItems: 'flex-end' },
  trayCellCode: { fontSize: 12, fontWeight: '600', color: '#101828' },
  trayCellBatang: { fontSize: 12, color: '#344054' },
  trayDeleteIcon: { fontSize: 13 },

  traySummary: {
    marginTop: 10,
    backgroundColor: '#EAF0FF',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  traySummaryText: { color: '#2F5FD1', fontSize: 12, fontWeight: '700' },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEF1F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2F5FD1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', lineHeight: 19 },
  stepperValue: { fontSize: 17, fontWeight: '700', color: '#101828' },
  stepperUnit: { fontSize: 12, color: '#667085', fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: '#F7F8FA',
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1.4,
    borderColor: '#D92D20',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#D92D20', fontWeight: '700', fontSize: 14 },
  submitButton: {
    flex: 1.3,
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#B0C4EF' },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
