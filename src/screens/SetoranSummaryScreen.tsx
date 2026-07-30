import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigation';
import { fetchSetoranSummary } from '../api/sktApi';
import { SetoranSummary, MejaSummary, PekerjaPair } from '../types/skt';
import { saveToCache, loadFromCache, setoranSummaryCacheKey } from '../storage/persistence';
import { useOffline } from '../context/OfflineContext';

type SummaryRouteProp = RouteProp<RootStackParamList, 'SetoranSummary'>;
type NavProp = NativeStackNavigationProp<RootStackParamList, 'SetoranSummary'>;

function formatRupiah(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function matchesQuery(pair: PekerjaPair, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const candidates = [
    pair.giling?.namaPekerja,
    pair.giling?.nomorAbsen,
    pair.batil?.namaPekerja,
    pair.batil?.nomorAbsen,
  ];
  return candidates.some((c) => c?.toLowerCase().includes(q));
}

function MejaSection({
  meja,
  query,
  isExpanded,
  onToggle,
}: {
  meja: MejaSummary;
  query: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const visiblePairs = meja.pairs.filter((p) => matchesQuery(p, query));
  if (query && visiblePairs.length === 0) return null;

  return (
    <View style={styles.mejaSection}>
      <TouchableOpacity style={styles.mejaHeader} onPress={onToggle} activeOpacity={0.75}>
        <View>
          <Text style={styles.mejaTitle}>Meja {meja.nomorMeja}</Text>
          <Text style={styles.mejaSubtitle}>
            {meja.pasanganCount} Pasang Pekerja · {meja.setoranCount} Setoran
          </Text>
        </View>
        <Text style={styles.chevron}>{isExpanded ? '⌄' : '›'}</Text>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.mejaBody}>
          {visiblePairs.map((pair, idx) => (
            <View key={idx} style={styles.pairBlock}>
              <View style={styles.pairNamesRow}>
                <View style={styles.pairNameCol}>
                  <Text style={styles.pairRoleLabel}>Pekerja Giling</Text>
                  <Text style={styles.pairName}>{pair.giling?.namaPekerja ?? '—'}</Text>
                </View>
                <View style={styles.pairNameCol}>
                  <Text style={styles.pairRoleLabel}>Pekerja Batil</Text>
                  <Text style={styles.pairName}>{pair.batil?.namaPekerja ?? '—'}</Text>
                </View>
              </View>

              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderText, styles.colSetoran]}>Setoran #</Text>
                <Text style={[styles.tableHeaderText, styles.colGood]}>Good</Text>
                <Text style={[styles.tableHeaderText, styles.colBad]}>Bad</Text>
              </View>

              {pair.entries.map((entry, entryIdx) => (
                <View key={entry.id} style={styles.tableRow}>
                  <Text style={[styles.tableCellMuted, styles.colSetoran]}>
                    #{entryIdx + 1}
                  </Text>
                  <Text style={[styles.tableCellGood, styles.colGood]}>{entry.good}</Text>
                  <Text style={[styles.tableCellBad, styles.colBad]}>{entry.bad}</Text>
                </View>
              ))}

              <View style={styles.pairTotalRow}>
                <Text style={[styles.pairTotalLabel, styles.colSetoran]}>Total</Text>
                <Text style={[styles.pairTotalGood, styles.colGood]}>{pair.totalGood}</Text>
                <Text style={[styles.pairTotalBad, styles.colBad]}>{pair.totalBad}</Text>
              </View>
            </View>
          ))}

          <View style={styles.mejaTotalBar}>
            <Text style={styles.mejaTotalLabel}>Total</Text>
            <Text style={styles.mejaTotalValue}>{meja.totalGood}</Text>
            <Text style={styles.mejaTotalValue}>{meja.totalBad}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function SetoranSummaryScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<SummaryRouteProp>();
  const { id } = route.params;
  const { isOffline } = useOffline();

  const [summary, setSummary] = useState<SetoranSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expandedMeja, setExpandedMeja] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSetoranSummary(id);
      setSummary(data);
      await saveToCache(setoranSummaryCacheKey(id), data);
      // Expand the first meja by default, like the mockup.
      if (data.mejaSummaries.length > 0) {
        setExpandedMeja(new Set([data.mejaSummaries[0].nomorMeja]));
      }
    } catch (err) {
      const cached = await loadFromCache<SetoranSummary>(setoranSummaryCacheKey(id));
      if (cached) {
        setSummary(cached);
        if (cached.mejaSummaries.length > 0) {
          setExpandedMeja(new Set([cached.mejaSummaries[0].nomorMeja]));
        }
      } else {
        setError('Unable to load setoran summary.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMeja = (nomorMeja: number) => {
    setExpandedMeja((prev) => {
      const next = new Set(prev);
      if (next.has(nomorMeja)) next.delete(nomorMeja);
      else next.add(nomorMeja);
      return next;
    });
  };

  // While searching, auto-expand every meja that has a match so results
  // aren't hidden behind a collapsed section.
  const effectiveExpanded = useMemo(() => {
    if (!query || !summary) return expandedMeja;
    const withMatches = summary.mejaSummaries
      .filter((m) => m.pairs.some((p) => matchesQuery(p, query)))
      .map((m) => m.nomorMeja);
    return new Set(withMatches);
  }, [query, summary, expandedMeja]);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Summary Setoran</Text>
        <View style={{ width: 20 }} />
      </View>

      {isOffline && (
        <Text style={styles.offlineNote}>You're offline — showing cached data</Text>
      )}

      {isLoading && !summary ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#2F5FD1" />
      ) : error && !summary ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.searchWrapper}>
            <Text style={styles.searchIcon}>◎</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Cari kode atau nama pekerja..."
              placeholderTextColor="#98A2B3"
              style={styles.searchInput}
            />
          </View>

          <View style={styles.totalsCard}>
            <View>
              <Text style={styles.totalsLabel}>Total Setoran</Text>
              <Text style={styles.totalsValue}>
                {summary!.totalSetoran.toLocaleString('id-ID')}
              </Text>
              <Text style={styles.totalsSub}>batang</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.totalsLabel}>Total Upah</Text>
              <Text style={styles.totalsValue}>{formatRupiah(summary!.totalUpah)}</Text>
              <Text style={styles.totalsSub}>dari 1 SKT Header</Text>
            </View>
          </View>

          {summary!.mejaSummaries.map((meja) => (
            <MejaSection
              key={meja.nomorMeja}
              meja={meja}
              query={query}
              isExpanded={effectiveExpanded.has(meja.nomorMeja)}
              onToggle={() => toggleMeja(meja.nomorMeja)}
            />
          ))}
        </ScrollView>
      )}
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
  errorText: { textAlign: 'center', color: '#B42318', marginTop: 40, fontSize: 13 },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF1F5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchIcon: { color: '#2F5FD1', marginRight: 8, fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, color: '#101828', padding: 0 },
  totalsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2F5FD1',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  totalsLabel: { color: '#D6E1FA', fontSize: 11 },
  totalsValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 4 },
  totalsSub: { color: '#D6E1FA', fontSize: 11, marginTop: 2 },
  mejaSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  mejaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  mejaTitle: { fontSize: 14, fontWeight: '700', color: '#101828' },
  mejaSubtitle: { fontSize: 11, color: '#667085', marginTop: 2 },
  chevron: { fontSize: 18, color: '#98A2B3' },
  mejaBody: { paddingHorizontal: 14, paddingBottom: 14 },
  pairBlock: { marginBottom: 14 },
  pairNamesRow: { flexDirection: 'row', marginBottom: 8, gap: 12 },
  pairNameCol: { flex: 1 },
  pairRoleLabel: { fontSize: 10, color: '#98A2B3', marginBottom: 2 },
  pairName: { fontSize: 12, fontWeight: '700', color: '#101828' },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableHeaderText: { fontSize: 10, color: '#98A2B3', fontWeight: '600' },
  tableRow: { flexDirection: 'row', paddingVertical: 5 },
  tableCellMuted: { fontSize: 12, color: '#667085' },
  tableCellGood: { fontSize: 12, color: '#12B76A', fontWeight: '600' },
  tableCellBad: { fontSize: 12, color: '#D92D20', fontWeight: '600' },
  colSetoran: { flex: 1 },
  colGood: { flex: 1, textAlign: 'center' },
  colBad: { flex: 1, textAlign: 'center' },
  pairTotalRow: {
    flexDirection: 'row',
    backgroundColor: '#EAF0FF',
    borderRadius: 6,
    paddingVertical: 6,
    marginTop: 4,
  },
  pairTotalLabel: { fontSize: 12, fontWeight: '700', color: '#2F5FD1', paddingLeft: 8 },
  pairTotalGood: { fontSize: 12, fontWeight: '700', color: '#12B76A', textAlign: 'center' },
  pairTotalBad: { fontSize: 12, fontWeight: '700', color: '#D92D20', textAlign: 'center' },
  mejaTotalBar: {
    flexDirection: 'row',
    backgroundColor: '#2F5FD1',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4,
  },
  mejaTotalLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    paddingLeft: 12,
  },
  mejaTotalValue: { flex: 1, color: '#FFFFFF', fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
