import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { fetchAllSktDetails, fetchMasterBarcodeData } from '../../../services/API/sktApi';
import {
  hasPostedSetoran,
  loadPendingSeatDeletes,
  postPendingSetoran,
} from '../../../services/API/setoranPost';
import { fetchMasterPekerja, refreshMasterPekerjaForBrak } from '../../../services/API/pekerjaApi';
import { SKTHeaderItem, SKTDetail, SetoranWorker, MasterBarcodeRow } from '../../../services/skt';
import { dedupeById } from '../../../utils/dedupe';
import { canAccessHeader, getBrakScope } from '../../../utils/accessControl';
import {
  cleanupCache,
  saveToCache,
  loadFromCache,
  removeFromCache,
  CACHE_KEYS,
  sktDetailCacheKey,
} from '../../../services/Offline/persistence';
import { useOffline } from '../../../context/OfflineContext';
import { useAuthStore } from '../../../store/authStore';
import { getServerNow } from '../../../services/serverTime';
import { startOfDay, isSameDay, formatShortDate } from '../../../utils/dateFilter';
import type { RootStackParamList } from '../../navigation/mainNavigation';
import SinkronisasiDataModal from '../components/SinkronisasiDataModal';
import ConfirmationModal from '../components/ConfirmationModal';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'SKTHeaderDashboard'>;

// Alternates between blue and purple, matching the mockup's card accents
const CARD_BORDER_COLORS = ['#2F5FD1', '#7C3AED'];

// "Good Morning/Afternoon/Evening" based on the SERVER's clock (see
// services/serverTime), not the device's — the phone's own clock/timezone
// can't be trusted to match the backend's.
function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// Plain JSON-shape equality — every value that flows through here (SKT
// list items, detail/workers pairs, master barcode rows) is a serializable
// object built the same way on every fetch, so a stringify compare is
// enough to tell "actually changed" from "same data came back again".
function isSameCachedValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function SKTHeaderDashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const { isOffline } = useOffline();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const user = useAuthStore((state) => state.user);

  const [items, setItems] = useState<SKTHeaderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncModalVisible, setIsSyncModalVisible] = useState(false);

  // Date filter replacing the old free-text search — restricted to today
  // down through H-3 (4 selectable days total), so there's no need for a
  // full calendar widget, just a short dropdown of those days.
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(getServerNow()));
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);

  // Ticks once a minute so the greeting below doesn't go stale (e.g. "Good
  // Morning" lingering past noon) if the dashboard is left open across a
  // time-of-day boundary.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Recomputed on every load/refresh too, not just the minute tick — the
  // very first render happens before any API response has set the
  // server-clock offset, so this picks up the corrected time as soon as
  // loadData's request comes back.
  const greeting = useMemo(
    () => greetingForHour(getServerNow().getHours()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minuteTick, isLoading, isRefreshing]
  );

  // Today down through H-3, newest first — the full set of days the date
  // filter dropdown offers.
  const dateOptions = useMemo(() => {
    const today = startOfDay(getServerNow());
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteTick]);

  // Visibility by the login's Brak id (see canAccessHeader in
  // utils/accessControl.ts) — applied before the date filter so a header
  // the account can't see never even reaches the date-filtered list, let
  // alone the FlatList below. MK scoping happens per meja, inside the
  // header (SKTHeaderDetailScreen).
  const accessibleItems = useMemo(
    () => items.filter((item) => canAccessHeader(user, item)),
    [items, user]
  );

  const filteredItems = useMemo(
    () => accessibleItems.filter((item) => isSameDay(new Date(item.tanggal), selectedDate)),
    [accessibleItems, selectedDate]
  );

  // Picking Get Data / Push Data in the sync sheet doesn't run the action
  // right away — it stages which one was picked and hands off to the
  // "Apakah kamu yakin?" confirmation dialog below, since both can clobber
  // unsaved changes (local or server-side).
  const [pendingSyncAction, setPendingSyncAction] = useState<'get' | 'push' | null>(null);

  const handleSelectGetData = () => {
    setIsSyncModalVisible(false);
    setPendingSyncAction('get');
  };

  const handleSelectPushData = () => {
    setIsSyncModalVisible(false);
    setPendingSyncAction('push');
  };

  const handleConfirmSyncAction = () => {
    const action = pendingSyncAction;
    setPendingSyncAction(null);
    if (action === 'get') {
      syncAllFromOrds();
    } else if (action === 'push') {
      pushAllDataToOrds();
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: () => clearAuth() },
    ]);
  };

  // Reads whatever's already cached locally — no live network call. This
  // runs on app start and on pull-to-refresh; the live GET against ORDS only
  // ever runs from the top-bar refresh button's Sinkronisasi Data → Get Data
  // flow (see syncAllFromOrds below), so the app never syncs on its own.
  const loadFromCacheOnly = useCallback(async (isRefresh = false) => {
    isRefresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      // Clear any duplicates/orphaned entries before reading — see
      // cleanupCache in services/Offline/persistence.ts.
      await cleanupCache();
      const cached = await loadFromCache<SKTHeaderItem[]>(CACHE_KEYS.SKT_LIST);
      setItems(cached ?? []);
    } finally {
      isRefresh ? setIsRefreshing(false) : setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromCacheOnly();
  }, [loadFromCacheOnly]);

  // skt_master_pekerja — the worker directory the badge scanner
  // (AbsensiScanScreenCamera, via findMasterPekerjaByNik in pekerjaApi.ts)
  // matches a scanned NIK against. Always pulled on every "Get Data" tap,
  // independently of the SKT header/detail sync below (see syncAllFromOrds
  // calling this before its own try block, not from inside it) — nested
  // inside that sync's try, a failure fetching skt header/detail (e.g.
  // offline mid-sync) used to skip this fetch entirely too, silently
  // leaving the pekerja directory stale even though it has nothing to do
  // with SKT headers. A super user replaces the whole cache; an MK only
  // re-downloads its own Brak and swaps those rows in (see
  // refreshMasterPekerjaForBrak in pekerjaApi.ts), so another login's Brak
  // on the same device is kept. fetchMasterPekerja collapses duplicate
  // rows for the same person either way.
  // Returns the error message if the pekerja download failed, else null —
  // syncAllFromOrds shows it, so an empty Pilih Pekerja list is never silent.
  const refreshMasterPekerja = useCallback(async (): Promise<string | null> => {
    try {
      const brakScope = getBrakScope(user);
      if (brakScope === null) {
        // Super user: a full replace of the cached list with the fresh
        // fetch, deduped by NIK (one person = one NIK) on the way in.
        const masterPekerjaRows = dedupeById(await fetchMasterPekerja(), (p) => p.nik);
        await saveToCache(CACHE_KEYS.MASTER_PEKERJA, masterPekerjaRows);
      } else {
        // MK: only its own Brak, swapped into the shared cache so other
        // logins' Braks on this device stay intact.
        for (const brakId of brakScope) await refreshMasterPekerjaForBrak(brakId);
      }
      // Either way only written once the fetch succeeded, so a failed GET
      // leaves the previous list in place.
      return null;
    } catch (masterPekerjaError: any) {
      console.warn('Failed to refresh skt_master_pekerja:', masterPekerjaError);
      return masterPekerjaError?.message || 'Gagal mengunduh daftar pekerja';
    }
  }, [user]);

  // "Get Data" (Sinkronisasi Data → confirmed) — a full resync from ORDS,
  // not just the summary list loadData() pulls for pull-to-refresh. Fetches
  // every header's detail + worker rows in one pass via fetchAllSktDetails.
  // Rules:
  //   1. A header with NO posted transaction is replaced entirely by the
  //      API data (header item and every worker/setoran row), and deleted
  //      if the server no longer returns it.
  //      A header WITH a posted transaction is locked: left exactly as
  //      cached and never deleted, so posted data is never pulled back down
  //      or posted twice. It still takes new setoran / pekerja, which Post
  //      sends as usual.
  //   2. A login new to this device (no Get Data history here and no
  //      transaction in the cached headers it can access) only pulls
  //      today's headers (server date); other cached headers are left as
  //      they are.
  // This is the live GET that loadDetail there leaves commented out, run
  // for every record at once from here instead.
  const syncAllFromOrds = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    // Started before the try block below, not inside it — this must run
    // (and get a chance to finish) regardless of whether the SKT
    // header/detail sync below succeeds or throws.
    const masterPekerjaPromise = refreshMasterPekerja();

    try {
      // The previously-cached list — the staleIds sweep below diffs against
      // it to clean up cache entries for headers no longer on the server.
      const previousList = (await loadFromCache<SKTHeaderItem[]>(CACHE_KEYS.SKT_LIST)) ?? [];

      // Rule 1 lock: headers holding any posted setoran (see
      // hasPostedSetoran in setoranPost.ts). Also notes, for rule 2, whether
      // this login has any transaction in the headers it can access.
      const lockedIds = new Set<number>();
      let userHasTransactions = false;
      for (const item of previousList) {
        const cachedDetail = await loadFromCache<{ detail: SKTDetail; workers: SetoranWorker[] }>(
          sktDetailCacheKey(item.id)
        );
        if (hasPostedSetoran(cachedDetail?.workers)) lockedIds.add(item.id);
        if (canAccessHeader(user, item) && cachedDetail?.workers.some((w) => !!w.transactionId)) {
          userHasTransactions = true;
        }
      }

      // Every header is kept, including ones with no skt_view rows (no meja
      // yet) — an MK must still see a header for their Brak before any meja
      // has been assigned to them (see canAccessHeader in
      // utils/accessControl.ts).
      const allDetails = await fetchAllSktDetails(getBrakScope(user));

      // Rule 2: a login new to this device pulls today's headers only.
      const today = startOfDay(getServerNow());
      const isToday = (item: SKTHeaderItem) => isSameDay(new Date(item.tanggal), today);
      const syncedUsers =
        (await loadFromCache<Record<string, string>>(CACHE_KEYS.SYNCED_USERS)) ?? {};
      const userKey = user?.username ?? '';
      const todayOnly = !syncedUsers[userKey] && !userHasTransactions;
      const details = todayOnly ? allDetails.filter(({ detail }) => isToday(detail)) : allDetails;
      // A today-only pull leaves every other cached header (another login's
      // data, older dates) exactly as it is — not replaced, not deleted.
      const untouchedIds = new Set(
        todayOnly ? previousList.filter((item) => !isToday(item)).map((item) => item.id) : []
      );

      // fetchAllSktDetails already dedupes skt_header/skt_view at the fetch
      // boundary (see fetchSktHeaderRows/fetchSktViewRows in sktApi.ts), but
      // this list/each detail's `workers` gets one more explicit pass right
      // here, at the point they're actually written to AsyncStorage — the
      // "Get Data" cache write is the one place this MUST hold, so it isn't
      // left implicit on an upstream fetch never regressing.
      const freshList: SKTHeaderItem[] = dedupeById(
        details.map(({ detail }) => detail),
        (item) => item.id
      );
      const freshIds = new Set(freshList.map((item) => item.id));
      const list: SKTHeaderItem[] = [
        ...freshList.map((item) => {
          const previous = lockedIds.has(item.id)
            ? previousList.find((p) => p.id === item.id)
            : undefined;
          return previous
            ? { ...previous, mkAssigned: item.mkAssigned, mkAssignedIds: item.mkAssignedIds }
            : item;
        }),
        ...previousList.filter(
          (item) => (lockedIds.has(item.id) || untouchedIds.has(item.id)) && !freshIds.has(item.id)
        ),
      ];

      setItems(list);

      // Only overwrite each cache entry if ORDS actually returned
      // something different from what's already cached — an unchanged
      // fetch is a no-op write, not a fresh replace. A previously-cached
      // list/detail that had duplicates in it will always differ from the
      // deduped fresh one (different length, if nothing else), so this
      // still guarantees the overwrite — and with it, the duplicates —
      // happens.
      if (!isSameCachedValue(previousList, list)) {
        await saveToCache(CACHE_KEYS.SKT_LIST, list);
      }

      // Rule 1: every unlocked header is replaced by the API data — minus
      // seats deleted on the device whose delete hasn't been Posted yet,
      // so they don't come back before the server drops them.
      const pendingDeleteIds = new Set(
        (await loadPendingSeatDeletes()).map((p) => p.sktLogPekerjaId)
      );
      await Promise.all(
        details
          .filter(({ detail }) => !lockedIds.has(detail.id))
          .map(async ({ detail, workers }) => {
            const cacheKey = sktDetailCacheKey(detail.id);
            const previousDetail = await loadFromCache<{ detail: SKTDetail; workers: SetoranWorker[] }>(
              cacheKey
            );
            const freshDetail = {
              detail,
              workers: dedupeById(
                workers.filter((w) => !pendingDeleteIds.has(w.sktLogPekerjaId ?? w.id)),
                (w) => w.id
              ),
            };
            if (!isSameCachedValue(previousDetail, freshDetail)) {
              await saveToCache(cacheKey, freshDetail);
            }
          })
      );

      const staleIds = previousList
        .filter(
          (item) => !freshIds.has(item.id) && !lockedIds.has(item.id) && !untouchedIds.has(item.id)
        )
        .map((item) => item.id);
      await Promise.all(staleIds.map((id) => removeFromCache(sktDetailCacheKey(id))));
      // This login now has cached data on this device.
      if (userKey) {
        await saveToCache(CACHE_KEYS.SYNCED_USERS, {
          ...syncedUsers,
          [userKey]: new Date().toISOString(),
        });
      }

      // skt_master_barcode (tray master) — fetched alongside the real
      // resync, but its failure shouldn't fail (or fall back) the SKT data
      // above, so it gets its own try/catch.
      try {
        const previousBarcodes = await loadFromCache<MasterBarcodeRow[]>(CACHE_KEYS.MASTER_BARCODE);
        const barcodeRows = dedupeById(await fetchMasterBarcodeData(), (r) => r.id);
        if (!isSameCachedValue(previousBarcodes, barcodeRows)) {
          await saveToCache(CACHE_KEYS.MASTER_BARCODE, barcodeRows);
        }
      } catch (barcodeError) {
        console.warn('Failed to refresh skt_master_barcode:', barcodeError);
      }
    } catch {
      // Fall back to the last cached list — likely offline, or the
      // endpoint is temporarily unreachable.
      const cached = await loadFromCache<SKTHeaderItem[]>(CACHE_KEYS.SKT_LIST);
      if (cached && cached.length > 0) {
        setItems(cached);
      } else {
        setError('Unable to load SKT data. Tap refresh to try again.');
      }
    } finally {
      const masterPekerjaError = await masterPekerjaPromise;
      if (masterPekerjaError) {
        Alert.alert(
          'Daftar Pekerja Gagal Diperbarui',
          `Daftar pekerja (Pilih Pekerja) tidak berhasil diunduh: ${masterPekerjaError}\n\nCoba Get Data lagi saat terhubung ke jaringan kantor.`
        );
      }
      // Sweep anything the sync itself didn't touch — e.g. old
      // setoran-summary-* entries for headers no longer on the server.
      await cleanupCache();
      setIsRefreshing(false);
    }
  }, [refreshMasterPekerja, user]);

  // "Push Data" (Sinkronisasi Data → confirmed) — posts the logged-in
  // user's not-yet-posted setoran, from the local cache, one header per
  // request (see postPendingSetoran in services/API/setoranPost.ts for the
  // eligibility, validate-everything-first and flag-only-on-success rules).
  const pushAllDataToOrds = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const {
        validationErrors,
        waiting,
        addedSeats,
        deletedSeats,
        failedDeletes,
        failedSeats,
        posted,
        failed,
      } = await postPendingSetoran(user);
      const sum = (rows: { setoranCount: number }[]) => rows.reduce((n, r) => n + r.setoranCount, 0);
      // New Giling seats added to the server before their setoran, plus
      // setoran held back because their new seat couldn't be added — not
      // an error (see SetoranPostResult.addedSeats / .waiting).
      const waitingNote =
        (addedSeats.length > 0
          ? `\n\n${addedSeats.length} pekerja baru ditambahkan ke server:\n${addedSeats.map((s) => `• ${s}`).join('\n')}`
          : '') +
        (waiting.length > 0
          ? `\n\n${waiting.length} setoran menunggu (pekerja baru tidak bisa ditambahkan ke server):\n${waiting.map((w) => `• ${w}`).join('\n')}`
          : '') +
        (deletedSeats.length > 0
          ? `\n\n${deletedSeats.length} pekerja dihapus dari server:\n${deletedSeats.map((s) => `• ${s}`).join('\n')}`
          : '') +
        (failedDeletes.length > 0
          ? `\n\n${failedDeletes.length} pekerja gagal dihapus dari server (akan dicoba lagi pada Post berikutnya):\n${failedDeletes.map((s) => `• ${s}`).join('\n')}`
          : '') +
        (failedSeats.length > 0
          ? `\n\nPekerja baru gagal ditambahkan ke server (akan dicoba lagi pada Post berikutnya):\n${failedSeats.map((s) => `• ${s}`).join('\n')}`
          : '');

      if (validationErrors.length > 0) {
        Alert.alert(
          'Post Dibatalkan',
          `Tidak ada data yang dikirim. Perbaiki transaksi berikut terlebih dahulu:\n\n${validationErrors.join('\n')}`
        );
      } else if (posted.length === 0 && failed.length === 0) {
        const seatFailures = failedDeletes.length + failedSeats.length;
        if (addedSeats.length > 0 || deletedSeats.length > 0 || seatFailures > 0) {
          Alert.alert(
            seatFailures > 0 ? 'Post Gagal' : 'Post Berhasil',
            `Data pekerja dikirim ke server (tidak ada setoran baru).${waitingNote}`
          );
        } else {
          Alert.alert('Tidak Ada Data', `Tidak ada setoran baru yang bisa dikirim.${waitingNote}`);
        }
      } else if (failed.length > 0) {
        Alert.alert(
          'Post Gagal',
          [
            posted.length > 0
              ? `${sum(posted)} setoran berhasil dikirim (header ${posted.map((p) => p.headerId).join(', ')}).`
              : 'Tidak ada setoran yang berhasil dikirim.',
            'Gagal dikirim (tidak ditandai, akan dikirim ulang pada Post berikutnya):',
            ...failed.map((f) => `• Header ${f.headerId} (${f.setoranCount} setoran): ${f.error}`),
          ].join('\n') + waitingNote
        );
      } else {
        Alert.alert('Post Berhasil', `${sum(posted)} setoran berhasil dikirim ke server.${waitingNote}`);
      }
    } catch (postError: any) {
      Alert.alert('Post Gagal', postError?.message || 'Terjadi kesalahan saat mengirim data ke server.');
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  const todayLabel = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>SKT NTI</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => setIsSyncModalVisible(true)}
            activeOpacity={0.7}
            accessibilityLabel="Refresh"
          >
            <Icon name="sync-alt" size={16} color="#FFFFFF" solid />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityLabel="Sign out"
          >
            <Icon name="sign-out-alt" size={16} color="#FFFFFF" solid />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>SKT Header</Text>
          <Text style={styles.greeting} numberOfLines={1}>
            {greeting}, {user?.username ?? 'User'}
          </Text>
        </View>
        <Text style={styles.subheading}>Hari ini, {todayLabel}</Text>

        <View style={styles.dateFilterContainer}>
          <TouchableOpacity
            style={styles.dateFilterButton}
            onPress={() => setIsDateMenuOpen((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel="Filter by date"
          >
            <View style={styles.dateFilterLeft}>
              <Icon name="calendar-alt" size={14} color="#2F5FD1" solid />
              <Text style={styles.dateFilterText}>{formatShortDate(selectedDate)}</Text>
            </View>
            <Icon name={isDateMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} color="#667085" solid />
          </TouchableOpacity>

          {isDateMenuOpen && (
            <View style={styles.dateFilterMenu}>
              {dateOptions.map((d) => {
                const active = isSameDay(d, selectedDate);
                return (
                  <TouchableOpacity
                    key={d.toISOString()}
                    style={[styles.dateFilterOption, active && styles.dateFilterOptionActive]}
                    onPress={() => {
                      setSelectedDate(d);
                      setIsDateMenuOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dateFilterOptionText,
                        active && styles.dateFilterOptionTextActive,
                      ]}
                    >
                      {formatShortDate(d)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {isOffline && (
          <Text style={styles.offlineNote}>
            You're offline — showing cached data
          </Text>
        )}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} color="#2F5FD1" />
        ) : error && items.length === 0 ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => loadFromCacheOnly(true)} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>No SKT records found.</Text>
            }
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.card, { borderLeftColor: CARD_BORDER_COLORS[index % 2] }]}
                onPress={() => navigation.navigate('SKTHeaderDetail', { id: item.id, preview: item })}
                activeOpacity={0.8}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <Text style={styles.gridIcon}>▦</Text>
                    <Text style={styles.cardLabel}>Jumlah Meja</Text>
                  </View>
                  <Text style={styles.cardLabel}>Brak</Text>
                </View>

                <View style={styles.cardRow}>
                  <Text style={styles.cardValueBold}>{item.jumlahMeja} Meja</Text>
                  {/* This header's OWN Brak name — skt_header's nama_brak
                      column (see SKTHeaderItem.brakName in services/skt.ts),
                      not the logged-in user's own nama_brak from
                      /auth/login, which is a per-account access marker (can
                      read "ALL" for an account with blanket access) rather
                      than any specific header's actual Brak. */}
                  <Text style={styles.cardValueBold}>{item.brakName || `Brak #${item.brakId}`}</Text>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Brand</Text>
                  <View
                    style={[
                      styles.badge,
                      item.jenisLabel === 'Lembur' ? styles.badgeLembur : styles.badgeBiasa,
                    ]}
                  >
                    <Text
                      style={
                        item.jenisLabel === 'Lembur'
                          ? styles.badgeTextLembur
                          : styles.badgeTextBiasa
                      }
                    >
                      {item.jenisLabel}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardBrandValue}>{item.brand}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <SinkronisasiDataModal
        visible={isSyncModalVisible}
        onClose={() => setIsSyncModalVisible(false)}
        onGetData={handleSelectGetData}
        onPushData={handleSelectPushData}
      />

      <ConfirmationModal
        visible={pendingSyncAction !== null}
        title="Apakah kamu yakin?"
        message={
          pendingSyncAction === 'push'
            ? 'Setoran Anda yang belum terkirim akan dikirim ke server. Setoran yang sudah terkirim tidak dapat diubah lagi.'
            : 'Data lokal akan diperbarui dengan data terbaru dari server. Perubahan yang belum tersimpan mungkin akan tertimpan.'
        }
        onCancel={() => setPendingSyncAction(null)}
        onConfirm={handleConfirmSyncAction}
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
  topBarTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refreshButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: 20 },
  headingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    columnGap: 8,
    marginTop: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101828',
  },
  greeting: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2F5FD1',
    maxWidth: '55%',
  },
  subheading: { fontSize: 13, color: '#667085', marginTop: 4, marginBottom: 16 },
  dateFilterContainer: { position: 'relative', zIndex: 10, marginBottom: 12 },
  dateFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF1F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateFilterLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateFilterText: { fontSize: 14, fontWeight: '600', color: '#101828' },
  dateFilterMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: '#101828',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dateFilterOption: { paddingHorizontal: 16, paddingVertical: 12 },
  dateFilterOptionActive: { backgroundColor: '#EEF1F5' },
  dateFilterOptionText: { fontSize: 14, color: '#344054' },
  dateFilterOptionTextActive: { color: '#2F5FD1', fontWeight: '700' },
  offlineNote: {
    color: '#B54708',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
  },
  loader: { marginTop: 40 },
  errorText: { textAlign: 'center', color: '#B42318', marginTop: 40, fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#667085', marginTop: 40, fontSize: 13 },
  listContent: { paddingBottom: 24 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridIcon: { fontSize: 11, color: '#667085' },
  cardLabel: { fontSize: 10, color: '#667085' },
  cardValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#101828',
    marginTop: 2,
    marginBottom: 8,
  },
  cardDivider: { height: 1, backgroundColor: '#EEF1F5', marginVertical: 4 },
  cardBrandValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#101828',
    marginTop: 4,
  },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeBiasa: { backgroundColor: '#D1FADF' },
  badgeLembur: { backgroundColor: '#FEF0C7' },
  badgeTextBiasa: { color: '#12B76A', fontSize: 10, fontWeight: '600' },
  badgeTextLembur: { color: '#B54708', fontSize: 10, fontWeight: '600' },
});
