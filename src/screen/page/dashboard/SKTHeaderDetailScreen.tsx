import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/mainNavigation';
import {
  fetchSktDetail,
  addPekerjaToMeja,
  deletePekerjaFromMeja,
  submitSetoran,
  SubmitSetoranPayload,
} from '../../../services/API/sktApi';
import { SKTDetail, SetoranWorker } from '../../../services/skt';
import { saveToCache, loadFromCache, sktDetailCacheKey } from '../../../services/persistence';
import { useOffline } from '../../../context/OfflineContext';
import DetailMejaModal from '../components/DetailMejaModal';
import TambahPekerjaModal from '../components/TambahPekerjaModal';
import TambahSetoranModal from '../setoran/TambahSetoranModal';
import { groupWorkersByMeja } from '../../../utils/mejaGrouping';
import { MasterPekerja } from '../../../services/pekerja';

type DetailRouteProp = RouteProp<RootStackParamList, 'SKTHeaderDetail'>;
type NavProp = NativeStackNavigationProp<RootStackParamList, 'SKTHeaderDetail'>;

const AVATAR_COLORS = ['#7C3AED', '#2F5FD1'];

interface CachedDetail {
  detail: SKTDetail;
  workers: SetoranWorker[];
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function SKTHeaderDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<DetailRouteProp>();
  const { id, preview } = route.params;
  const { isOffline } = useOffline();

  const [detail, setDetail] = useState<SKTDetail | null>(
    preview ? { ...preview, totalSetoran: 0, totalSetoranUnit: 'btg' } : null
  );
  const [workers, setWorkers] = useState<SetoranWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeja, setSelectedMeja] = useState<'Semua Meja' | number>('Semua Meja');
  const [showDetailMeja, setShowDetailMeja] = useState(false);

  // --- Tambah Pekerja dialog, nested on top of DetailMejaModal ---
  const [showTambahPekerja, setShowTambahPekerja] = useState(false);
  const [activeAddMeja, setActiveAddMeja] = useState<number | null>(null);
  const [scannedPekerja, setScannedPekerja] = useState<MasterPekerja | null>(null);

  // --- Delete Pekerja, from within DetailMejaModal ---
  const [deletingPekerjaId, setDeletingPekerjaId] = useState<number | null>(null);

  // --- Tambah Setoran dialog ---
  const [showTambahSetoran, setShowTambahSetoran] = useState(false);
  // Bumped only in handleTambahSetoran (a genuine fresh open), never on the
  // hide/reshow round trip a scan does — passed as TambahSetoranModal's
  // `key` so React remounts it (fresh giling/batil/barcodeTrays/badWaste
  // state) exactly when the admin taps "+ Tambah Setoran" again, and
  // leaves its state alone while it's just being hidden behind the scanner.
  const [tambahSetoranKey, setTambahSetoranKey] = useState(0);
  // The admin's pick from the "Meja" dropdown, only meaningful (and only
  // shown) while the header tab is on "Semua Meja" — see setoranTargetMeja.
  const [setoranMejaOverride, setSetoranMejaOverride] = useState<number | null>(null);
  const [isSubmittingSetoran, setIsSubmittingSetoran] = useState(false);
  const [scannedSetoranGiling, setScannedSetoranGiling] = useState<MasterPekerja | null>(null);
  const [scannedSetoranBatil, setScannedSetoranBatil] = useState<MasterPekerja | null>(null);
  const [scannedTrayCode, setScannedTrayCode] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSktDetail(id);
      setDetail(data.detail);
      setWorkers(data.workers);
      await saveToCache(sktDetailCacheKey(id), data);
    } catch {
      const cached = await loadFromCache<CachedDetail>(sktDetailCacheKey(id));
      if (cached) {
        setDetail(cached.detail);
        setWorkers(cached.workers);
      } else if (!preview) {
        setError('Unable to load this record.');
      }
      // With a `preview`, keep showing it rather than a blank screen.
    } finally {
      setIsLoading(false);
    }
  }, [id, preview]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const mejaTabs = useMemo(() => {
    const count = detail?.jumlahMeja ?? 0;
    return ['Semua Meja', ...Array.from({ length: count }, (_, i) => i + 1)] as (
      | 'Semua Meja'
      | number
    )[];
  }, [detail?.jumlahMeja]);

  // Just the numeric meja numbers, no 'Semua Meja' — this is what the
  // "Meja" field inside Tambah Setoran picks from when the header tab is
  // on 'Semua Meja' (see setoranTargetMeja/mejaOptions below).
  const mejaNumberOptions = useMemo(
    () => mejaTabs.filter((t): t is number => typeof t === 'number'),
    [mejaTabs]
  );

  const filteredWorkers = useMemo(() => {
    if (selectedMeja === 'Semua Meja') return workers;
    return workers.filter((w) => w.nomorMeja === selectedMeja);
  }, [workers, selectedMeja]);

  // Real MejaGroup[] derived from `workers` — this is what DetailMejaModal
  // actually needs (it was previously being passed brakId/jumlahMeja/workers,
  // none of which match the component's props, hence the undefined crash).
  const mejaGroups = useMemo(() => groupWorkersByMeja(workers), [workers]);

  // The pekerja already sitting in the meja currently being added to —
  // TambahPekerjaModal uses this to compute which role codes are still free.
  const activeMejaPekerja = useMemo(
    () => mejaGroups.find((g) => g.nomorMeja === activeAddMeja)?.pekerja ?? [],
    [mejaGroups, activeAddMeja]
  );

  // Which meja a fresh "+ Tambah Setoran" attaches to: the currently
  // selected meja tab, or — since there's no meja-agnostic submission in
  // this schema — the admin's own pick from the "Meja" dropdown inside the
  // dialog when the header tab is on "Semua Meja" (defaulting to the first
  // meja until they change it).
  const setoranTargetMeja =
    selectedMeja === 'Semua Meja' ? setoranMejaOverride ?? mejaNumberOptions[0] ?? 1 : selectedMeja;

  // ASSUMPTION: "Setoran ke" is the next sequence number for that meja —
  // i.e. one more than however many setoran rows already exist there.
  // The real rule (per giling+batil pair vs. per meja) isn't confirmed
  // yet; the server should be treated as the source of truth once the
  // real endpoint lands.
  const setoranTargetKe =
    workers.filter((w) => w.nomorMeja === setoranTargetMeja).length + 1;

  const handleTambahSetoran = () => {
    setScannedSetoranGiling(null);
    setScannedSetoranBatil(null);
    setScannedTrayCode(null);
    setSetoranMejaOverride(null);
    setTambahSetoranKey((k) => k + 1);
    setShowTambahSetoran(true);
  };

  // Shared by all three scans inside TambahSetoranModal — hides the
  // dialog, navigates to AbsensiScan configured for that scan's target,
  // then reopens the dialog once the scanner resolves or is cancelled.
  // Same "hide → navigate → reopen" shape as handleAddPekerja below.
  const handlePressScanSetoran = (target: 'giling' | 'batil' | 'tray') => {
    setShowTambahSetoran(false);

    if (target === 'tray') {
      navigation.navigate('AbsensiScan', {
        mode: 'barcode',
        onScannedCode: (code) => {
          setScannedTrayCode(code);
          setShowTambahSetoran(true);
        },
        onCancelled: () => setShowTambahSetoran(true),
      });
      return;
    }

    navigation.navigate('AbsensiScan', {
      mode: 'pekerja',
      onScanned: (pekerja) => {
        if (target === 'giling') setScannedSetoranGiling(pekerja);
        else setScannedSetoranBatil(pekerja);
        setShowTambahSetoran(true);
      },
      onCancelled: () => setShowTambahSetoran(true),
    });
  };

  const handleSubmitTambahSetoran = async (payload: SubmitSetoranPayload) => {
    setIsSubmittingSetoran(true);
    try {
      const newWorkers = await submitSetoran(payload);
      setWorkers((prev) => [...prev, ...newWorkers]);
      setShowTambahSetoran(false);
    } catch {
      Alert.alert(
        'Gagal Mengirim Setoran',
        'Terjadi kesalahan saat mengirim setoran. Silakan coba lagi.'
      );
    } finally {
      setIsSubmittingSetoran(false);
    }
  };

  const handleAddPekerja = (nomorMeja: number) => {
    setActiveAddMeja(nomorMeja);
    setScannedPekerja(null);
    setShowTambahPekerja(true);
  };

  const handleDeletePekerja = (nomorMeja: number, pekerjaId: number) => {
    const worker = workers.find((w) => w.id === pekerjaId);
    const label = worker ? worker.namaPekerja : 'pekerja ini';

    Alert.alert('Hapus Pekerja', `Yakin ingin menghapus ${label} dari Meja ${nomorMeja}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setDeletingPekerjaId(pekerjaId);
          try {
            await deletePekerjaFromMeja({ sktHeaderId: item.id, nomorMeja, pekerjaId });
            setWorkers((prev) => prev.filter((w) => w.id !== pekerjaId));
          } catch {
            Alert.alert(
              'Gagal Menghapus',
              'Terjadi kesalahan saat menghapus pekerja. Silakan coba lagi.'
            );
          } finally {
            setDeletingPekerjaId(null);
          }
        },
      },
    ]);
  };

  const handleSubmitTambahPekerja = async (pekerja: MasterPekerja, kode: string) => {
    const nomorMeja = activeAddMeja;
    if (nomorMeja === null) return;

    setShowTambahPekerja(false);

    try {
      const newWorker = await addPekerjaToMeja({
        sktHeaderId: item.id,
        nomorMeja,
        kode,
        masterPekerjaId: pekerja.id,
        nik: pekerja.nik,
        namaPekerja: pekerja.namaPekerja,
        nomorAbsen: pekerja.nomorAbsen,
      });
      setWorkers((prev) => [...prev, newWorker]);
    } catch {
      Alert.alert(
        'Gagal Menambahkan',
        'Terjadi kesalahan saat menambahkan pekerja. Silakan coba lagi.'
      );
    }
  };

  if (isLoading && !detail) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>SKT Header</Text>
          <View style={{ width: 20 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 60 }} color="#2F5FD1" />
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>SKT Header</Text>
          <View style={{ width: 20 }} />
        </View>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const item = detail!;
  const formattedDate = item.tanggal
    ? new Date(item.tanggal).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>SKT Header</Text>
        <View style={{ width: 20 }} />
      </View>

      {isOffline && (
        <Text style={styles.offlineNote}>You're offline — showing cached data</Text>
      )}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Brand</Text>
              <Text style={styles.infoValue}>{item.brand}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Brak</Text>
              <Text style={styles.infoValue}>#{item.brakId}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Jenis</Text>
              <Text style={styles.infoValue}>{item.jenisLabel}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Tanggal</Text>
              <Text style={styles.infoValue}>{formattedDate}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRowBottom}>
            <View>
              <Text style={styles.infoLabel}>Jumlah Meja</Text>
              {/* Opens the Detail Meja bottom-sheet showing pekerja grouped by meja */}
              <TouchableOpacity
                style={styles.statPill}
                onPress={() => setShowDetailMeja(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.statPillText}>{item.jumlahMeja}</Text>
                <Text style={styles.statPillIcon}>👁</Text>
              </TouchableOpacity>
            </View>

            <View>
              <Text style={styles.infoLabel}>Total Setoran</Text>
              <TouchableOpacity
                style={styles.statPill}
                onPress={() => navigation.navigate('SetoranSummary', { id: item.id })}
                activeOpacity={0.75}
              >
                <Text style={styles.statPillText}>
                  {item.totalSetoran.toLocaleString('id-ID')} {item.totalSetoranUnit}
                </Text>
                <Text style={styles.statPillIcon}>👁</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Meja filter tabs — generated from jumlah_meja, not hardcoded */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          {mejaTabs.map((tab) => {
            const isActive = tab === selectedMeja;
            const label = tab === 'Semua Meja' ? tab : `Meja ${tab}`;
            return (
              <TouchableOpacity
                key={String(tab)}
                onPress={() => setSelectedMeja(tab)}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
              >
                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Setoran list — real worker rows from skt_view */}
        <View style={styles.setoranHeaderRow}>
          <Text style={styles.setoranIcon}>⇅</Text>
          <Text style={styles.setoranHeaderText}>List Setoran</Text>
        </View>

        {filteredWorkers.length === 0 ? (
          <Text style={styles.emptyText}>No setoran entries for this meja yet.</Text>
        ) : (
          <View style={styles.setoranListWrapper}>
            {filteredWorkers.map((worker, index) => (
              <View key={worker.id} style={styles.setoranCard}>
                <View style={styles.setoranTopRow}>
                  <View style={styles.setoranNameRow}>
                    <View style={styles.codeCircle}>
                      <Text style={styles.codeCircleText}>{worker.kodeSetoran}</Text>
                    </View>
                    <Text style={styles.setoranName}>{worker.namaPekerja}</Text>
                  </View>
                  <View
                    style={[
                      styles.avatarSmall,
                      { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] },
                    ]}
                  >
                    <Text style={styles.avatarSmallText}>{worker.nomorAbsen.slice(-2)}</Text>
                  </View>
                </View>

                <View style={styles.setoranStatsRow}>
                  <Text style={styles.goodText}>Good: {worker.totalSetoran}</Text>
                  <Text style={styles.badText}>Bad: {worker.totalDefect}</Text>
                </View>

                <View style={styles.setoranMetaRow}>
                  <Text style={styles.metaText}>
                    {formatTime(worker.jamMasuk)}–{formatTime(worker.jamKeluar)}
                  </Text>
                  <View style={styles.mejaBadge}>
                    <Text style={styles.mejaBadgeText}>Meja {worker.nomorMeja}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer action */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButton} activeOpacity={0.85} onPress={handleTambahSetoran}>
          <Text style={styles.footerButtonText}>+  Tambah Setoran</Text>
        </TouchableOpacity>
      </View>

      {/* Detail Meja bottom sheet. TambahPekerjaModal is nested inside as
          a child (not rendered separately below) — two independent
          native <Modal> windows don't reliably stack in a predictable
          z-order on Android, which was causing Tambah Pekerja to render
          behind Detail Meja after returning from the QR scanner. Nesting
          it here means there's only ever one real native Modal; Tambah
          Pekerja is just a plain overlay View inside it, so it's always
          correctly on top. */}
      <DetailMejaModal
        visible={showDetailMeja}
        onClose={() => setShowDetailMeja(false)}
        brakLabel={`Brak ${item.brakId}`}
        tanggal={formattedDate}
        mejaGroups={mejaGroups}
        deletingPekerjaId={deletingPekerjaId}
        onDeletePekerja={handleDeletePekerja}
        onAddPekerja={handleAddPekerja}
      >
        {showTambahPekerja && (
          <TambahPekerjaModal
            visible={showTambahPekerja}
            onClose={() => setShowTambahPekerja(false)}
            nomorMeja={activeAddMeja}
            brakId={item.brakId}
            existingPekerja={activeMejaPekerja}
            mejaGroups={mejaGroups}
            scannedPekerja={scannedPekerja}
            onPressScan={() => {
              // Hide (unmount) the dialog while the full-screen scanner is
              // up, then remount it once the scanner closes — either with
              // a scanned worker pre-filled (onScanned) or unchanged
              // (onCancelled), so the admin always lands back on Tambah
              // Pekerja rather than the bare Detail Meja screen underneath.
              setShowTambahPekerja(false);
              navigation.navigate('AbsensiScan', {
                onScanned: (pekerja) => {
                  setScannedPekerja(pekerja);
                  setShowTambahPekerja(true);
                },
                onCancelled: () => {
                  setShowTambahPekerja(true);
                },
              });
            }}
            onSubmit={handleSubmitTambahPekerja}
          />
        )}
      </DetailMejaModal>

      {/* Tambah Setoran — its own top-level full-screen Modal (not nested
          inside DetailMejaModal, unlike Tambah Pekerja above), since it's
          opened directly from this screen's footer button rather than
          from within an already-open Detail Meja sheet. */}
      <TambahSetoranModal
        key={tambahSetoranKey}
        visible={showTambahSetoran}
        onClose={() => setShowTambahSetoran(false)}
        sktHeaderId={item.id}
        brand={item.brand}
        jenisLabel={item.jenisLabel}
        brakLabel={`Brak ${item.brakId}`}
        nomorMeja={setoranTargetMeja}
        mejaOptions={selectedMeja === 'Semua Meja' ? mejaNumberOptions : undefined}
        onChangeMeja={setSetoranMejaOverride}
        mejaGroups={mejaGroups}
        setoranKe={setoranTargetKe}
        isSubmitting={isSubmittingSetoran}
        onSubmit={handleSubmitTambahSetoran}
        onPressScanGiling={() => handlePressScanSetoran('giling')}
        onPressScanBatil={() => handlePressScanSetoran('batil')}
        onPressScanTray={() => handlePressScanSetoran('tray')}
        scannedGiling={scannedSetoranGiling}
        scannedBatil={scannedSetoranBatil}
        scannedTrayCode={scannedTrayCode}
      />
    </View>
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
  offlineNote: {
    color: '#B54708',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 6,
    backgroundColor: '#FEF6E7',
  },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  errorText: { textAlign: 'center', color: '#B42318', marginTop: 40, fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#667085', marginTop: 16, fontSize: 13 },
  infoCard: {
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
  infoDivider: { height: 1, backgroundColor: '#EEF1F5', marginVertical: 14 },
  infoRowBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF0FF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    alignSelf: 'flex-start',
  },
  statPillText: { color: '#2F5FD1', fontWeight: '700', fontSize: 13 },
  statPillIcon: { fontSize: 11 },
  tabsScroll: { marginTop: 18, marginBottom: 4 },
  tabsContent: { gap: 8, paddingRight: 8 },
  tabChip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#EEF1F5',
  },
  tabChipActive: { backgroundColor: '#2F5FD1' },
  tabChipText: { fontSize: 12, fontWeight: '600', color: '#475467' },
  tabChipTextActive: { color: '#FFFFFF' },
  setoranHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 10,
  },
  setoranIcon: { fontSize: 14, color: '#101828' },
  setoranHeaderText: { fontSize: 15, fontWeight: '700', color: '#101828' },
  setoranListWrapper: { gap: 10 },
  setoranCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 6,
  },
  setoranTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setoranNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EAF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCircleText: { fontSize: 11, fontWeight: '700', color: '#2F5FD1' },
  avatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
  setoranName: { fontSize: 12, fontWeight: '700', color: '#101828' },
  setoranStatsRow: { flexDirection: 'row', gap: 16 },
  goodText: { fontSize: 12, fontWeight: '600', color: '#12B76A' },
  badText: { fontSize: 12, fontWeight: '600', color: '#D92D20' },
  setoranMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 11, color: '#667085' },
  mejaBadge: {
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  mejaBadgeText: { fontSize: 10, fontWeight: '600', color: '#475467' },
  footer: {
    padding: 16,
    backgroundColor: '#F7F8FA',
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
  },
  footerButton: {
    backgroundColor: '#2F5FD1',
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});