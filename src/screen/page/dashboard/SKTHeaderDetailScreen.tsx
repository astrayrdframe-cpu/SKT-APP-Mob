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
  // fetchSktDetail, // GET disabled here on purpose — being wired up elsewhere. See loadDetail below.
  addPekerjaToMeja,
  deletePekerjaFromMeja,
  submitSetoran,
  updateSetoran,
  deleteSetoran,
  SubmitSetoranPayload,
} from '../../../services/API/sktApi';
import { SKTDetail, SetoranWorker } from '../../../services/skt';
import { saveToCache, loadFromCache, sktDetailCacheKey } from '../../../services/Offline/persistence';
import { useOffline } from '../../../context/OfflineContext';
import DetailMejaModal from '../components/DetailMejaModal';
import TambahPekerjaModal from '../components/TambahPekerjaModal';
import TambahSetoranModal from '../setoran/TambahSetoranModal';
import {
  groupWorkersByMeja,
  pairSetoranByMeja,
  pekerjaHasSetoran,
  workerIsGiling,
  SetoranPairRow,
} from '../../../utils/mejaGrouping';
import { MasterPekerja, buildDetailPekerja } from '../../../services/pekerja';

// Reshapes an existing SetoranWorker row into the MasterPekerja shape
// TambahSetoranModal's giling/batil state expects, so tapping a List
// Setoran card can pre-fill "already scanned" without a re-scan. `id` here
// is the row's skt_log_pekerja_id, not a real skt_master_pekerja.id — fine
// for edit-mode pre-fill/display, since editing never re-submits it through
// addPekerjaToMeja; a genuine re-scan (onPressScanGiling/Batil) always
// overwrites it with the real master id anyway. active/isTraining/brakId
// have no equivalent on SetoranWorker, so they're filled with harmless
// defaults purely to satisfy the type.
function workerToPekerjaStub(w: SetoranWorker): MasterPekerja {
  return {
    id: w.id,
    nomorAbsen: w.nomorAbsen,
    nik: w.nik,
    namaPekerja: w.namaPekerja,
    detailPekerja: buildDetailPekerja(w.nomorAbsen, w.namaPekerja, w.nik),
    active: true,
    isTraining: false,
    brakId: 0,
  };
}

type DetailRouteProp = RouteProp<RootStackParamList, 'SKTHeaderDetail'>;
type NavProp = NativeStackNavigationProp<RootStackParamList, 'SKTHeaderDetail'>;

interface CachedDetail {
  detail: SKTDetail;
  workers: SetoranWorker[];
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
  // Non-null while TambahSetoranModal is open in edit mode (tapped a List
  // Setoran card) instead of the ordinary "+ Tambah Setoran" add flow — set
  // by handleEditSetoran, cleared once that edit is submitted, deleted, or
  // cancelled. Drives which nomorMeja/setoranKe/existingSetoranId/initial*
  // values get passed to the modal, and which of handleSubmitTambahSetoran
  // / handleSubmitEditSetoran its onSubmit points at.
  const [editingPair, setEditingPair] = useState<SetoranPairRow | null>(null);
  const [isSubmittingSetoran, setIsSubmittingSetoran] = useState(false);
  const [scannedSetoranGiling, setScannedSetoranGiling] = useState<MasterPekerja | null>(null);
  const [scannedSetoranBatil, setScannedSetoranBatil] = useState<MasterPekerja | null>(null);
  const [scannedTrayCode, setScannedTrayCode] = useState<string | null>(null);
  // Bumped alongside scannedTrayCode on every tray scan resolution — see
  // TambahSetoranModal's `scannedTrayToken` prop comment for why a plain
  // code-only signal can miss a same-code rescan.
  const [scannedTrayToken, setScannedTrayToken] = useState(0);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // GET call disabled here on purpose — fetching this detail is being
    // moved elsewhere. For now this only reads whatever's already saved
    // locally (see src/services/Offline/persistence.ts), falling back to
    // the `preview` passed in via navigation if there's no cache yet.
    // try {
    //   const data = await fetchSktDetail(id);
    //   setDetail(data.detail);
    //   setWorkers(data.workers);
    //   await saveToCache(sktDetailCacheKey(id), data);
    // } catch {
    try {
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

  // Every local transaction (add/delete pekerja, submit setoran) below
  // writes its resulting worker list back here immediately, so it's on
  // disk in AsyncStorage — not just sitting in React state — the moment
  // it happens. That's what makes it durable across a screen remount, an
  // app restart, or a logout (clearAuth only removes the auth-* keys, see
  // src/store/authStore.tsx, so this cache is untouched by sign-out).
  const persistWorkers = useCallback(
    async (updatedWorkers: SetoranWorker[]) => {
      if (!detail) return;
      await saveToCache(sktDetailCacheKey(id), { detail, workers: updatedWorkers });
    },
    [detail, id]
  );

  const mejaTabs = useMemo(() => {
    const count = detail?.jumlahMeja ?? 0;
    return ['Semua Meja', ...Array.from({ length: count }, (_, i) => i + 1)] as (
      | 'Semua Meja'
      | number
    )[];
  }, [detail?.jumlahMeja]);

  const filteredWorkers = useMemo(() => {
    if (selectedMeja === 'Semua Meja') return workers;
    return workers.filter((w) => w.nomorMeja === selectedMeja);
  }, [workers, selectedMeja]);

  // List Setoran shows one card per Tambah Setoran submission — Giling
  // paired with its Batil counterpart, not one card per worker row (see
  // pairSetoranByMeja in utils/mejaGrouping.ts for the pairing rule).
  const setoranPairs = useMemo(() => pairSetoranByMeja(filteredWorkers), [filteredWorkers]);

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

  const handleTambahSetoran = () => {
    setEditingPair(null);
    setScannedSetoranGiling(null);
    setScannedSetoranBatil(null);
    setScannedTrayCode(null);
    setScannedTrayToken(0);
    setTambahSetoranKey((k) => k + 1);
    setShowTambahSetoran(true);
  };

  // Tapping a List Setoran card — opens the same dialog as "+ Tambah
  // Setoran" but pre-filled from the tapped pair, with Hapus available (see
  // existingSetoranId/initialGiling/initialBatil/initialBarcodeTrays/
  // initialBadWaste on TambahSetoranModal). Both rows must exist (an
  // unmatched giling-only or batil-only "pair" — see pairSetoranByMeja —
  // isn't a complete submission and has nothing sensible to edit/delete).
  const handleEditSetoran = (pair: SetoranPairRow) => {
    if (!pair.giling || !pair.batil) return;
    setEditingPair(pair);
    setScannedSetoranGiling(null);
    setScannedSetoranBatil(null);
    setScannedTrayCode(null);
    setScannedTrayToken(0);
    setTambahSetoranKey((k) => k + 1);
    setShowTambahSetoran(true);
  };

  // Shared by all three scans inside TambahSetoranModal — hides the
  // dialog, navigates to the scanner for that scan's target (AbsensiScan
  // for Giling/Batil against skt_master_pekerja; the dedicated
  // BarcodeTrayScan for Barcode Tray against skt/test_temp), then reopens
  // the dialog once the scanner resolves or is cancelled. Same "hide →
  // navigate → reopen" shape as handleAddPekerja below.
  const handlePressScanSetoran = (target: 'giling' | 'batil' | 'tray') => {
    setShowTambahSetoran(false);

    if (target === 'tray') {
      navigation.navigate('BarcodeTrayScan', {
        onScannedCode: (code) => {
          setScannedTrayCode(code);
          setScannedTrayToken((t) => t + 1);
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
      const updatedWorkers = [...workers, ...newWorkers];
      setWorkers(updatedWorkers);
      await persistWorkers(updatedWorkers);
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

  // Edit-mode counterpart to handleSubmitTambahSetoran — rewrites the two
  // existing rows (via updateSetoran) instead of appending new ones.
  const handleSubmitEditSetoran = async (payload: SubmitSetoranPayload) => {
    if (!editingPair?.giling || !editingPair?.batil) return;
    const { giling: oldGiling, batil: oldBatil } = editingPair;
    setIsSubmittingSetoran(true);
    try {
      // payload.giling.kode/payload.batil.kode already carry the pair's
      // real seat kode — sourced from initialGilingKode/initialBatilKode
      // below, since re-scanning is disabled while editing — so there's
      // nothing extra to pass through for that here.
      const updatedRows = await updateSetoran({
        ...payload,
        gilingId: oldGiling.id,
        batilId: oldBatil.id,
        transactionId: oldGiling.transactionId ?? oldBatil.transactionId,
      });
      const updatedWorkers = workers
        .filter((w) => w.id !== oldGiling.id && w.id !== oldBatil.id)
        .concat(updatedRows);
      setWorkers(updatedWorkers);
      await persistWorkers(updatedWorkers);
      setShowTambahSetoran(false);
      setEditingPair(null);
    } catch {
      Alert.alert(
        'Gagal Menyimpan',
        'Terjadi kesalahan saat menyimpan perubahan setoran. Silakan coba lagi.'
      );
    } finally {
      setIsSubmittingSetoran(false);
    }
  };

  // Hapus inside the edit-mode dialog — TambahSetoranModal already confirms
  // via Alert.alert before calling this (see its handleHapus), so this just
  // performs the removal.
  //
  // "Delete the setoran, not the worker": Detail Meja's roster and List
  // Setoran's cards are both derived from the same `workers` array (see
  // groupWorkersByMeja/pairSetoranByMeja in utils/mejaGrouping.ts) — for a
  // pair that was never a standalone Tambah Setoran submission (no
  // `transactionId`; just two roster seats pairing up positionally, e.g.
  // the "0 Selongsong" cards a bare Tambah Pekerja seat already produces),
  // the Giling/Batil row IS the roster seat, not a separate record. Simply
  // filtering those two ids out of `workers` would silently delete the
  // seat too, which is exactly what shouldn't happen here.
  //
  // So each side is only fully removed if the SAME person+role still has
  // another seat left at this meja afterward (a genuine standalone
  // submission row, distinct from its own roster seat — safe to drop
  // entirely, and the card disappears because the row is just gone).
  // Otherwise this row IS their only seat: it's kept — same id/kode/name/
  // nik/meja as before, so Detail Meja shows no change at all — but its
  // setoran-specific fields are stripped back to "never submitted" AND
  // flagged setoranDeleted (see that field's comment in skt.ts), which is
  // what actually makes pairSetoranByMeja stop producing a card for it.
  // Resetting the fields without the flag isn't enough on its own — a bare
  // roster seat already reads as an unsubmitted "0/0/0" pair (see
  // pairSetoranByMeja's positional fallback), so the card would just keep
  // showing up looking identical to before "deleting" it.
  const handleDeleteSetoranPair = async () => {
    if (!editingPair?.giling || !editingPair?.batil) return;
    const { giling, batil, nomorMeja } = editingPair;
    try {
      await deleteSetoran({ sktHeaderId: item.id, nomorMeja, gilingId: giling.id, batilId: batil.id });

      const updatedWorkers = workers.flatMap((w) => {
        if (w.id !== giling.id && w.id !== batil.id) return [w];

        const isGiling = workerIsGiling(w);
        const stillSeatedElsewhere = workers.some(
          (other) =>
            other.id !== w.id &&
            other.nomorMeja === w.nomorMeja &&
            other.nik === w.nik &&
            workerIsGiling(other) === isGiling
        );
        if (stillSeatedElsewhere) return []; // a genuine standalone submission row — safe to drop

        const { totalSetoran, totalDefect, setoranKe, transactionId, trayCount, barcodeTrays, ...seat } = w;
        return [{ ...seat, totalSetoran: 0, totalDefect: 0, setoranDeleted: true }];
      });

      setWorkers(updatedWorkers);
      await persistWorkers(updatedWorkers);
      setShowTambahSetoran(false);
      setEditingPair(null);
    } catch {
      Alert.alert(
        'Gagal Menghapus',
        'Terjadi kesalahan saat menghapus setoran. Silakan coba lagi.'
      );
    }
  };

  const handleAddPekerja = (nomorMeja: number) => {
    setActiveAddMeja(nomorMeja);
    setScannedPekerja(null);
    setShowTambahPekerja(true);
  };

  // Re-reads whatever's actually persisted for this record right now,
  // falling back to in-memory `workers` if nothing's cached yet (e.g. a
  // brand-new record still running only off `preview`). Belt-and-suspenders
  // around the delete-pekerja guard below: `workers` state is written back
  // to AsyncStorage immediately after every mutation (see persistWorkers),
  // so in normal use it's never actually behind the cache — but the guard
  // is a hard "can't delete" rule, so it re-confirms against the source of
  // truth on disk rather than trusting whatever's currently in React state.
  const loadLatestWorkersFromCache = useCallback(async (): Promise<SetoranWorker[]> => {
    const cached = await loadFromCache<CachedDetail>(sktDetailCacheKey(id));
    return cached?.workers ?? workers;
  }, [id, workers]);

  const handleDeletePekerja = async (nomorMeja: number, pekerjaId: number) => {
    const worker = workers.find((w) => w.id === pekerjaId);
    const label = worker ? worker.namaPekerja : 'pekerja ini';

    // Can't delete a seat once that exact person (by NIK), in that same
    // role, is showing up paired with a Giling/Batil counterpart in List
    // Setoran for this meja — applies whether that role is Giling or
    // Batil. Checked against the freshly persisted cache, not just
    // in-memory `workers` (see loadLatestWorkersFromCache above). See
    // pekerjaHasSetoran's own comment in utils/mejaGrouping.ts for exactly
    // what counts as "paired", and why the match is by NIK+role rather
    // than exact kode.
    if (worker) {
      const latestWorkers = await loadLatestWorkersFromCache();
      if (pekerjaHasSetoran(latestWorkers, nomorMeja, worker)) {
        Alert.alert(
          'Tidak Bisa Dihapus',
          `${worker.namaPekerja} sudah memiliki setoran di Meja ${nomorMeja} dan tidak bisa dihapus.`
        );
        return;
      }
    }

    Alert.alert('Hapus Pekerja', `Yakin ingin menghapus ${label} dari Meja ${nomorMeja}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setDeletingPekerjaId(pekerjaId);
          try {
            // Re-checked once more right before the actual delete — closes
            // the (small) window between confirming the dialog and this
            // running, in case a setoran was recorded for this same
            // person/role in the meantime.
            if (worker) {
              const latestWorkers = await loadLatestWorkersFromCache();
              if (pekerjaHasSetoran(latestWorkers, nomorMeja, worker)) {
                Alert.alert(
                  'Tidak Bisa Dihapus',
                  `${worker.namaPekerja} sudah memiliki setoran di Meja ${nomorMeja} dan tidak bisa dihapus.`
                );
                return;
              }
            }
            await deletePekerjaFromMeja({ sktHeaderId: item.id, nomorMeja, pekerjaId });
            const updatedWorkers = workers.filter((w) => w.id !== pekerjaId);
            setWorkers(updatedWorkers);
            await persistWorkers(updatedWorkers);
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
      const updatedWorkers = [...workers, newWorker];
      setWorkers(updatedWorkers);
      await persistWorkers(updatedWorkers);
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

        {setoranPairs.length === 0 ? (
          <Text style={styles.emptyText}>No setoran entries for this meja yet.</Text>
        ) : (
          <View style={styles.setoranListWrapper}>
            {setoranPairs.map((pair) => (
              <TouchableOpacity
                key={pair.key}
                style={styles.setoranCard}
                activeOpacity={0.7}
                onPress={() => handleEditSetoran(pair)}
                disabled={!pair.giling || !pair.batil}
              >
                <View style={styles.pairTopRow}>
                  <Text style={styles.pairMejaLabel}>Meja {pair.nomorMeja}</Text>
                  <View style={styles.pairSetoranBadge}>
                    <Text style={styles.pairSetoranBadgeText}>Setoran #{pair.setoranKe}</Text>
                  </View>
                </View>

                <View style={styles.pairNamesRow}>
                  <View style={styles.pairSide}>
                    <View style={styles.codeCircle}>
                      <Text style={styles.codeCircleText}>{pair.giling?.kodeSetoran ?? '1'}</Text>
                    </View>
                    <Text style={styles.pairSideName} numberOfLines={1}>
                      {pair.giling?.namaPekerja ?? '—'}
                    </Text>
                  </View>
                  <View style={[styles.pairSide, styles.pairSideRight]}>
                    <Text
                      style={[styles.pairSideName, styles.pairSideNameRight]}
                      numberOfLines={1}
                    >
                      {pair.batil?.namaPekerja ?? '—'}
                    </Text>
                    <View style={[styles.codeCircle, styles.codeCircleAlt]}>
                      <Text style={[styles.codeCircleText, styles.codeCircleTextAlt]}>
                        {pair.batil?.kodeSetoran ?? 'A'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.setoranMetaRow}>
                  <Text style={styles.pairTrayText}>{pair.trayCount} Selongsong</Text>
                  <View style={styles.setoranStatsRow}>
                    <Text style={styles.goodText}>Good: {pair.good}</Text>
                    <Text style={styles.badText}>Bad: {pair.bad}</Text>
                  </View>
                </View>
              </TouchableOpacity>
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
        onClose={() => {
          setShowTambahSetoran(false);
          setEditingPair(null);
        }}
        sktHeaderId={item.id}
        brand={item.brand}
        jenisLabel={item.jenisLabel}
        brakLabel={`Brak ${item.brakId}`}
        // Editing an existing submission keeps it pinned to its own meja —
        // a fresh add starts with no meja at all, and no candidate list
        // pre-filtered to one either (see TambahSetoranModal's mejaGroups
        // prop): the admin now picks Giling/Batil from every worker on this
        // header, and the meja is derived from whoever they actually pick,
        // regardless of which tab happens to be active here.
        nomorMeja={editingPair ? editingPair.nomorMeja : null}
        mejaGroups={mejaGroups}
        // Null until both Giling and Batil are actually picked (see
        // computePairSetoranKe in utils/mejaGrouping.ts) — TambahSetoranModal
        // computes the real, pair-scoped number itself once that happens;
        // edit mode always uses the pair's real, immutable value.
        setoranKe={editingPair ? editingPair.setoranKe : null}
        workers={workers}
        isSubmitting={isSubmittingSetoran}
        onSubmit={editingPair ? handleSubmitEditSetoran : handleSubmitTambahSetoran}
        existingSetoranId={
          editingPair?.giling && editingPair?.batil
            ? { gilingId: editingPair.giling.id, batilId: editingPair.batil.id }
            : null
        }
        onDelete={handleDeleteSetoranPair}
        initialGiling={editingPair?.giling ? workerToPekerjaStub(editingPair.giling) : null}
        initialBatil={editingPair?.batil ? workerToPekerjaStub(editingPair.batil) : null}
        initialGilingKode={editingPair?.giling?.kodeSetoran ?? null}
        initialBatilKode={editingPair?.batil?.kodeSetoran ?? null}
        // Older/fetched rows don't carry the real per-tray list (see
        // SetoranWorker.barcodeTrays in skt.ts) — fall back to one synthetic
        // row standing in for the existing total, so editing Bad/Waste on
        // them doesn't force a full re-scan just to keep Submit enabled.
        initialBarcodeTrays={
          editingPair?.giling?.barcodeTrays ??
          editingPair?.batil?.barcodeTrays ??
          (editingPair ? [{ code: `Setoran #${editingPair.setoranKe}`, batang: editingPair.good }] : [])
        }
        initialBadWaste={editingPair?.bad ?? 0}
        onPressScanGiling={() => handlePressScanSetoran('giling')}
        onPressScanBatil={() => handlePressScanSetoran('batil')}
        onPressScanTray={() => handlePressScanSetoran('tray')}
        scannedGiling={scannedSetoranGiling}
        scannedBatil={scannedSetoranBatil}
        scannedTrayCode={scannedTrayCode}
        scannedTrayToken={scannedTrayToken}
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
  // Top row of a pair card: "Meja N" (gray, left) + "Setoran #N" pill
  // (blue, right).
  pairTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pairMejaLabel: { fontSize: 11, fontWeight: '600', color: '#98A2B3' },
  pairSetoranBadge: {
    backgroundColor: '#EAF0FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pairSetoranBadgeText: { fontSize: 10, fontWeight: '700', color: '#2F5FD1' },
  // Middle row: Giling (role circle + name) on the left, Batil (name +
  // role circle) on the right — one card per paired submission instead of
  // one card per worker row.
  pairNamesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pairSide: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, maxWidth: '48%' },
  pairSideRight: { justifyContent: 'flex-end' },
  pairSideName: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: '#101828' },
  pairSideNameRight: { textAlign: 'right' },
  codeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EAF0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCircleText: { fontSize: 11, fontWeight: '700', color: '#2F5FD1' },
  // Batil's role circle (alpha kode) gets the same purple used for the
  // avatar dots elsewhere in this screen, so Giling/Batil read as visually
  // distinct roles at a glance.
  codeCircleAlt: { backgroundColor: '#F3E8FF' },
  codeCircleTextAlt: { color: '#7C3AED' },
  setoranStatsRow: { flexDirection: 'row', gap: 16 },
  goodText: { fontSize: 12, fontWeight: '600', color: '#12B76A' },
  badText: { fontSize: 12, fontWeight: '600', color: '#D92D20' },
  setoranMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pairTrayText: { fontSize: 12, fontWeight: '600', color: '#344054' },
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