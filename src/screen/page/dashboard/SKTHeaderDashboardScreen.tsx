import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { fetchSktHeaderList } from '../../../services/API/sktApi';
import { SKTHeaderItem } from '../../../services/skt';
import { saveToCache, loadFromCache, CACHE_KEYS } from '../../../services/persistence';
import { useOffline } from '../../../context/OfflineContext';
import { useAuthStore } from '../../../store/authStore';
import { getServerNow } from '../../../services/serverTime';
import type { RootStackParamList } from '../../navigation/mainNavigation';

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

export default function SKTHeaderDashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const { isOffline } = useOffline();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const user = useAuthStore((state) => state.user);

  const [items, setItems] = useState<SKTHeaderItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: () => clearAuth() },
    ]);
  };

  const loadData = useCallback(async (isRefresh = false) => {
    isRefresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSktHeaderList();
      setItems(data);
      await saveToCache(CACHE_KEYS.SKT_LIST, data);
    } catch {
      // Fall back to the last cached list — likely offline, or the
      // endpoint is temporarily unreachable.
      const cached = await loadFromCache<SKTHeaderItem[]>(CACHE_KEYS.SKT_LIST);
      if (cached && cached.length > 0) {
        setItems(cached);
      } else {
        setError('Unable to load SKT data. Pull down to try again.');
      }
    } finally {
      isRefresh ? setIsRefreshing(false) : setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredItems = items.filter((item) =>
    `${item.brakId} ${item.brand}`.toLowerCase().includes(query.toLowerCase())
  );

  const todayLabel = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.menuIcon}>☰</Text>
        <Text style={styles.topBarTitle}>SKT NTI</Text>
        <View style={styles.topBarActions}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarGlyph}>◍</Text>
          </View>
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

        <View style={styles.searchWrapper}>
          <Text style={styles.searchIcon}>◎</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cari SKT..."
            placeholderTextColor="#98A2B3"
            style={styles.searchInput}
          />
        </View>

        {isOffline && (
          <Text style={styles.offlineNote}>
            You're offline — showing cached data
          </Text>
        )}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} color="#2F5FD1" />
        ) : error && filteredItems.length === 0 ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} />
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
                  <Text style={styles.cardValueBold}>Brak #{item.brakId}</Text>
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
  menuIcon: { color: '#FFFFFF', fontSize: 20 },
  topBarTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: { color: '#2F5FD1', fontSize: 14 },
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
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF1F5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchIcon: { color: '#2F5FD1', marginRight: 8, fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, color: '#101828', padding: 0 },
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
