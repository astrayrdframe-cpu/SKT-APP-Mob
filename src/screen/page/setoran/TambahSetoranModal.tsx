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
import React, { useEffect, useMemo, useState } from 'react';
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
import { MasterPekerja, MejaGroup } from '../../../services/pekerja';
import { BarcodeTrayRow } from '../../../services/skt';
import { resolveBarcodeTray, SubmitSetoranPayload } from '../../../services/API/sktApi';
import { isNumericCode } from '../../../utils/pekerjaRole';

interface TambahSetoranModalProps {
  visible: boolean;
  onClose: () => void;
  sktHeaderId: number;
  brand: string;
  jenisLabel: string;
  brakLabel: string; // e.g. "Djinggo"
  nomorMeja: number;
  // When the parent screen's own meja tab is "Semua Meja" there's no single
  // meja this setoran unambiguously belongs to, so the caller passes every
  // valid meja number here and the "Meja" field renders as a picker instead
  // of the plain read-only box. Omitted (or a single-item list) keeps the
  // old read-only behaviour — e.g. when a specific "Meja N" tab is active.
  mejaOptions?: number[];
  onChangeMeja?: (nomorMeja: number) => void;
  // Every meja's roster (who's seated where, and as which kode) — a scan
  // is only accepted for Pekerja Giling/Batil if the scanned pekerja
  // (identified by `detailPekerja`, not NIK alone) is actually seated at
  // `nomorMeja`, and only in the matching role (numeric kode = Giling,
  // alpha kode = Batil). Scanning is otherwise wide open to the whole
  // master pekerja directory, which would let anyone from any meja (or the
  // wrong role at this meja) get logged against this setoran.
  mejaGroups: MejaGroup[];
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
  // Bumped by the parent on every single tray scan resolution, even ones
  // that hand back the exact same code as before. Needed because
  // scannedTrayCode alone can't be trusted to *change* on a repeat scan of
  // the same tray (React bails out of a setState that reuses the same
  // primitive value, so a same-code rescan wouldn't otherwise re-trigger
  // the duplicate-check effect below) — see its usage in the tray useEffect.
  scannedTrayToken?: number;
}

export default function TambahSetoranModal({
  visible,
  onClose,
  sktHeaderId,
  brand,
  jenisLabel,
  brakLabel,
  nomorMeja,
  mejaOptions,
  onChangeMeja,
  mejaGroups,
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
  scannedTrayToken,
}: TambahSetoranModalProps) {
  const [giling, setGiling] = useState<MasterPekerja | null>(null);
  const [batil, setBatil] = useState<MasterPekerja | null>(null);
  const [barcodeTrays, setBarcodeTrays] = useState<BarcodeTrayRow[]>([]);
  const [badWaste, setBadWaste] = useState(0);
  const [isResolvingTray, setIsResolvingTray] = useState(false);
  const [isMejaDropdownOpen, setIsMejaDropdownOpen] = useState(false);

  // Rendered in-tree instead of Alert.alert — same reasoning as
  // TambahPekerjaModal's errorMessage overlay: this dialog is its own
  // native <Modal>, and Alert.alert opens a separate native OS dialog
  // window that isn't guaranteed to stack above it. An in-tree overlay
  // stacks exactly like the rest of this component, so it always renders
  // in front.
  const [scanError, setScanError] = useState<{ title: string; message: string } | null>(null);

  const isMejaSelectable = !!mejaOptions && mejaOptions.length > 1;

  // The roster actually seated at the meja this setoran targets — recomputed
  // whenever that changes (tab switch, or the "Meja" picker above).
  const currentMejaPekerja = useMemo(
    () => mejaGroups.find((g) => g.nomorMeja === nomorMeja)?.pekerja ?? [],
    [mejaGroups, nomorMeja]
  );

  // NOTE: there's deliberately no "reset on `visible`" effect here anymore.
  // This component never actually unmounts between scans — hiding it just
  // toggles the native <Modal visible={...}> off while AbsensiScan is up,
  // then flips it back on once a scan resolves — and Giling/Batil/Barcode
  // Tray scans ALL hide-then-reshow this same dialog. A `visible`-keyed
  // reset would fire after EVERY one of those scans, wiping out whatever
  // was already filled in (e.g. Batil clearing the Giling you'd just
  // scanned, or a new tray silently erasing the ones scanned before it).
  // The real "this is a fresh dialog" signal is the parent remounting this
  // component via a bumped `key` prop on "+ Tambah Setoran" — see
  // SKTHeaderDetailScreen — which re-initializes every useState above for
  // free, without touching state across a scan's hide/reshow round trip.

  // A giling/batil pick is only valid for one specific meja (its kode is
  // registered there, not anywhere else) — if the admin changes meja after
  // already scanning someone, that pick no longer means anything and has
  // to be re-scanned.
  useEffect(() => {
    setGiling(null);
    setBatil(null);
  }, [nomorMeja]);

  // Pick up a freshly scanned giling pekerja handed back from AbsensiScan.
  // Only accepted if they're actually seated at this meja AND hold the
  // Giling (numeric) kode there — anyone else is rejected outright. Note
  // there's deliberately no "already picked as Batil" guard here: a pekerja
  // can hold BOTH a Giling and a Batil kode at the same meja (see
  // TambahPekerjaModal's dual-role rule), so the same pekerja legitimately
  // filling both slots in one setoran is the correct outcome, not an error
  // — the seat check below (via `.some()` across every row matching this
  // pekerja's `detailPekerja`, not just the first match) is what actually
  // decides eligibility.
  useEffect(() => {
    if (!scannedGiling) return;
    const seatsForPekerja = currentMejaPekerja.filter(
      (p) => p.detailPekerja === scannedGiling.detailPekerja
    );
    if (seatsForPekerja.length === 0) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedGiling.namaPekerja} tidak terdaftar di Meja ${nomorMeja}.`,
      });
      return;
    }
    if (!seatsForPekerja.some((p) => isNumericCode(p.kode))) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedGiling.namaPekerja} terdaftar sebagai Batil di Meja ${nomorMeja}, bukan Giling.`,
      });
      return;
    }
    setGiling(scannedGiling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedGiling]);

  // Pick up a freshly scanned batil pekerja handed back from AbsensiScan.
  // Only accepted if they're actually seated at this meja AND hold the
  // Batil (alpha) kode there — anyone else is rejected outright. Same
  // dual-role reasoning as the Giling effect above: no "already picked as
  // Giling" guard, since the same pekerja can legitimately fill both slots.
  // groupWorkersByMeja sorts Giling (numeric) rows first, so a naive
  // `.find()` here would always land on their Giling row and wrongly
  // reject a dual-role pekerja's Batil scan — `.some()` across every row
  // matching this pekerja's `detailPekerja` is what makes the check
  // correct.
  useEffect(() => {
    if (!scannedBatil) return;
    const seatsForPekerja = currentMejaPekerja.filter(
      (p) => p.detailPekerja === scannedBatil.detailPekerja
    );
    if (seatsForPekerja.length === 0) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedBatil.namaPekerja} tidak terdaftar di Meja ${nomorMeja}.`,
      });
      return;
    }
    if (!seatsForPekerja.some((p) => !isNumericCode(p.kode))) {
      setScanError({
        title: 'Tidak Bisa Digunakan',
        message: `${scannedBatil.namaPekerja} terdaftar sebagai Giling di Meja ${nomorMeja}, bukan Batil.`,
      });
      return;
    }
    setBatil(scannedBatil);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedBatil]);

  // Pick up a freshly scanned tray barcode and resolve it to a batang
  // count (see resolveBarcodeTray in sktApi.ts — placeholder until a real
  // master tray/batch table exists).
  //
  // A Nomor Tray already used earlier in THIS setoran is rejected outright
  // — one physical tray can't be counted twice toward the same submission.
  // The same Nomor Tray is fine again in a different Tambah Setoran
  // transaction: barcodeTrays always starts empty for a fresh transaction
  // (see the "no reset on `visible`" note above — a genuinely new dialog
  // comes from the parent's bumped `key`, which re-initializes this
  // useState for free), so this check only ever looks at trays already
  // scanned within the transaction currently open.
  //
  // Keyed on `scannedTrayToken`, not `scannedTrayCode` — the parent bumps
  // the token on every scan resolution, including a repeat scan of the
  // exact same code. Keying on the code alone would miss that case: React
  // bails out of a parent setState that reuses the same primitive string,
  // so re-scanning the same already-used tray back-to-back would silently
  // do nothing instead of showing "Nomor Tray Sudah Terpakai".
  useEffect(() => {
    if (!scannedTrayCode) return;
    if (barcodeTrays.some((t) => t.code === scannedTrayCode)) {
      setScanError({
        title: 'Nomor Tray Sudah Terpakai',
        message: `Nomor Tray ${scannedTrayCode} sudah discan di setoran ini. Nomor Tray yang sama masih bisa dipakai di transaksi Tambah Setoran lain.`,
      });
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
          setScanError({
            title: 'Gagal Membaca Barcode',
            message: `Barcode ${scannedTrayCode} tidak dikenali.`,
          });
        }
      })
      .finally(() => {
        if (!isCancelled) setIsResolvingTray(false);
      });

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedTrayToken]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scanError) {
        setScanError(null);
      } else {
        onClose();
      }
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose, scanError]);

  const handleDeleteTray = (code: string) => {
    setBarcodeTrays((prev) => prev.filter((t) => t.code !== code));
  };

  const totalBatang = barcodeTrays.reduce((sum, t) => sum + t.batang, 0);
  const canSubmit = !!giling && !!batil && barcodeTrays.length > 0 && !isSubmitting;

  const handleSubmit = () => {
    if (!giling || !batil) return;
    // Belt-and-suspenders alongside canSubmit disabling the button below —
    // every setoran must carry at least one Nomor Tray, so this can never
    // go through with an empty barcodeTrays list.
    if (barcodeTrays.length === 0) {
      setScanError({
        title: 'Nomor Tray Belum Discan',
        message: 'Setoran harus memiliki minimal satu Nomor Tray sebelum disimpan.',
      });
      return;
    }
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
              {isMejaSelectable ? (
                <>
                  <TouchableOpacity
                    style={styles.mejaPickerBox}
                    onPress={() => setIsMejaDropdownOpen((open) => !open)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.readonlyValue}>{nomorMeja}</Text>
                    <Text style={styles.mejaPickerChevron}>{isMejaDropdownOpen ? '⌃' : '⌄'}</Text>
                  </TouchableOpacity>
                  {isMejaDropdownOpen && (
                    <View style={styles.mejaDropdown}>
                      {mejaOptions!.map((meja) => (
                        <TouchableOpacity
                          key={meja}
                          style={styles.mejaDropdownItem}
                          onPress={() => {
                            onChangeMeja?.(meja);
                            setIsMejaDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.mejaDropdownItemText,
                              meja === nomorMeja && styles.mejaDropdownItemTextActive,
                            ]}
                          >
                            Meja {meja}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.readonlyBox}>
                  <Text style={styles.readonlyValue}>{nomorMeja}</Text>
                </View>
              )}
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

        {scanError && (
          <View style={styles.errorOverlay}>
            <View style={styles.errorBox}>
              <View style={styles.errorIconCircle}>
                <Text style={styles.errorIconText}>✕</Text>
              </View>
              <Text style={styles.errorTitle}>{scanError.title}</Text>
              <Text style={styles.errorSubtitle}>{scanError.message}</Text>
              <TouchableOpacity
                style={styles.errorButton}
                onPress={() => setScanError(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.errorButtonText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  // Matches the "Pekerja Tidak Ditemukan" card from AbsensiScanScreenCamera
  // — icon circle + bold title + gray subtitle + full-width pill button —
  // rendered as an in-tree overlay (see the `scanError` state comment
  // above) rather than Alert.alert.
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 24, 40, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorBox: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  errorIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorIconText: { fontSize: 24, color: '#D92D20', fontWeight: '700' },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 13,
    color: '#667085',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  errorButton: {
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
  },
  errorButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
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
  mejaPickerBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  mejaPickerChevron: { fontSize: 12, color: '#667085' },
  mejaDropdown: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    overflow: 'hidden',
  },
  mejaDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
  },
  mejaDropdownItemText: { fontSize: 13, fontWeight: '600', color: '#344054' },
  mejaDropdownItemTextActive: { color: '#2F5FD1' },

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
