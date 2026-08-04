import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { MasterPekerja, PekerjaRow } from '../types/pekerja';
import { fetchMasterPekerja } from '../api/pekerjaApi';

// Every possible role code a meja slot can hold — numeric = giling,
// alpha = batil. A meja can only ever have 5 people at once (enforced by
// hiding "+ Add Pekerja" in DetailMejaModal), so at most 5 of these 8 are
// ever in use at the same time.
const ALL_CODES = ['1', '2', '3', 'A', 'B'];

function isNumericCode(code: string): boolean {
  return /^[0-9]+$/.test(code);
}

function KodeBadge({ code }: { code: string }) {
  const isAlpha = !isNumericCode(code);
  return (
    <View style={[styles.kodeBadge, isAlpha ? styles.kodeBadgePurple : styles.kodeBadgeBlue]}>
      <Text style={styles.kodeBadgeText}>{code}</Text>
    </View>
  );
}

interface TambahPekerjaModalProps {
  visible: boolean;
  onClose: () => void;
  nomorMeja: number | null;
  brakId?: number; // scopes the search results to this Brak, if provided
  existingPekerja: PekerjaRow[]; // rows already in this meja — determines which codes are still available
  scannedPekerja?: MasterPekerja | null; // result handed back from AbsensiScanScreen after a QR scan
  onPressScan: () => void; // navigates to the attendance QR scanner
  onSubmit: (pekerja: MasterPekerja, kode: string) => void;
}

export default function TambahPekerjaModal({
  visible,
  onClose,
  nomorMeja,
  brakId,
  existingPekerja,
  scannedPekerja,
  onPressScan,
  onSubmit,
}: TambahPekerjaModalProps) {
  const [pekerjaList, setPekerjaList] = useState<MasterPekerja[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedPekerja, setSelectedPekerja] = useState<MasterPekerja | null>(null);

  const [isKodeDropdownOpen, setIsKodeDropdownOpen] = useState(false);
  const [selectedKode, setSelectedKode] = useState<string | null>(null);

  // Load (or reload) the directory every time the dialog opens, scoped to
  // the current Brak if one was passed in.
  useEffect(() => {
    if (!visible) return;
    let isCancelled = false;

    setIsLoading(true);
    setLoadError(null);

    fetchMasterPekerja({ brakId })
      .then((list) => {
        if (!isCancelled) setPekerjaList(list);
      })
      .catch(() => {
        if (!isCancelled) setLoadError('Gagal memuat daftar pekerja.');
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, brakId]);

  // Pre-fill the search box and selection whenever a fresh scan result
  // arrives from AbsensiScanScreen — this is the "just scan the ID card"
  // shortcut for the same search+select flow, so Kode Pekerja availability
  // is recomputed exactly as if the admin had typed the name.
  useEffect(() => {
    if (!scannedPekerja) return;
    setSelectedPekerja(scannedPekerja);
    setSearchQuery(scannedPekerja.namaPekerja);
    setIsDropdownOpen(false);
    setSelectedKode(null);
    setIsKodeDropdownOpen(false);
  }, [scannedPekerja]);

  const filteredPekerja =
    searchQuery.trim().length === 0
      ? pekerjaList
      : pekerjaList.filter((p) =>
          p.namaPekerja.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );

  // Codes already sitting in this meja (by anyone) are off the table.
  // On top of that, the selected pekerja specifically can't take a second
  // numeric code if they already hold one, nor a second alpha code if they
  // already hold one — same name is fine across meja as long as it's one
  // numeric + one alpha, never number+number or letter+letter.
  const usedCodesInMeja = new Set(existingPekerja.map((p) => p.kode));
  const selectedPekerjaCodesInMeja = selectedPekerja
    ? existingPekerja.filter((p) => p.nik === selectedPekerja.nik).map((p) => p.kode)
    : [];
  const alreadyHasNumeric = selectedPekerjaCodesInMeja.some(isNumericCode);
  const alreadyHasAlpha = selectedPekerjaCodesInMeja.some((c) => !isNumericCode(c));

  const availableCodes = ALL_CODES.filter((code) => {
    if (usedCodesInMeja.has(code)) return false;
    if (isNumericCode(code) && alreadyHasNumeric) return false;
    if (!isNumericCode(code) && alreadyHasAlpha) return false;
    return true;
  });

  const resetState = () => {
    setSearchQuery('');
    setSelectedPekerja(null);
    setIsDropdownOpen(false);
    setSelectedKode(null);
    setIsKodeDropdownOpen(false);
  };

  // Typing clears any prior selection — Kode Pekerja availability depends
  // on which pekerja is picked, so it resets along with it.
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    setSelectedPekerja(null);
    setIsDropdownOpen(true);
    setSelectedKode(null);
    setIsKodeDropdownOpen(false);
  };

  const handleSelectPekerja = (pekerja: MasterPekerja) => {
    setSelectedPekerja(pekerja);
    setSearchQuery(pekerja.namaPekerja);
    setIsDropdownOpen(false);
    setSelectedKode(null);
    setIsKodeDropdownOpen(false);
  };

  const handleSelectKode = (code: string) => {
    setSelectedKode(code);
    setIsKodeDropdownOpen(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleTambah = () => {
    if (!selectedPekerja || !selectedKode) return;
    onSubmit(selectedPekerja, selectedKode);
    resetState();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tambah Pekerja</Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel="Close">
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.mejaLabel}>Meja {nomorMeja ?? '-'}</Text>

          <Text style={styles.fieldLabel}>Pilih Pekerja</Text>
          <View style={styles.pilihPekerjaBox}>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Cari nama pekerja..."
              placeholderTextColor="#98A2B3"
            />
            <TouchableOpacity style={styles.scanButton} onPress={onPressScan} activeOpacity={0.8}>
              <Text style={styles.scanButtonText}>⌕ Scan</Text>
            </TouchableOpacity>
          </View>

          {isDropdownOpen && (
            <View style={styles.dropdown}>
              {isLoading ? (
                <View style={styles.dropdownStatusRow}>
                  <ActivityIndicator color="#2F5FD1" size="small" />
                  <Text style={styles.dropdownStatusText}>Memuat pekerja...</Text>
                </View>
              ) : loadError ? (
                <Text style={styles.dropdownErrorText}>{loadError}</Text>
              ) : filteredPekerja.length === 0 ? (
                <Text style={styles.dropdownEmptyText}>Pekerja tidak ditemukan</Text>
              ) : (
                <ScrollView
                  style={styles.dropdownScroll}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {filteredPekerja.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.dropdownItem}
                      onPress={() => handleSelectPekerja(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.dropdownItemName} numberOfLines={1}>
                        {p.namaPekerja}
                      </Text>
                      <Text style={styles.dropdownItemNik}>{p.nik}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          <Text style={[styles.fieldLabel, styles.kodeFieldLabel]}>Kode Pekerja</Text>
          <TouchableOpacity
            style={styles.kodeBox}
            onPress={() => selectedPekerja && setIsKodeDropdownOpen((open) => !open)}
            activeOpacity={0.8}
            disabled={!selectedPekerja}
          >
            {selectedKode ? (
              <View style={styles.kodeSelectedRow}>
                <KodeBadge code={selectedKode} />
                <Text style={styles.kodeSelectedText}>{selectedKode}</Text>
              </View>
            ) : (
              <Text style={styles.kodePlaceholder}>
                {selectedPekerja ? 'Pilih kode...' : 'Pilih pekerja terlebih dahulu'}
              </Text>
            )}
            <Text style={styles.kodeChevron}>{isKodeDropdownOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {isKodeDropdownOpen && (
            <View style={[styles.dropdown, styles.kodeDropdown]}>
              {availableCodes.length === 0 ? (
                <Text style={styles.dropdownEmptyText}>
                  Tidak ada kode tersedia untuk pekerja ini di meja ini
                </Text>
              ) : (
                <View style={styles.kodeGrid}>
                  {availableCodes.map((code) => (
                    <TouchableOpacity
                      key={code}
                      style={styles.kodeChip}
                      onPress={() => handleSelectKode(code)}
                      activeOpacity={0.7}
                    >
                      <KodeBadge code={code} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.batalButton} onPress={handleClose} activeOpacity={0.8}>
              <Text style={styles.batalButtonText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tambahButton,
                (!selectedPekerja || !selectedKode) && styles.tambahButtonDisabled,
              ]}
              onPress={handleTambah}
              activeOpacity={0.8}
              disabled={!selectedPekerja || !selectedKode}
            >
              <Text style={styles.tambahButtonText}>Tambah</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: '#101828' },
  closeIcon: { fontSize: 16, color: '#667085', padding: 2 },
  mejaLabel: { fontSize: 11, color: '#667085', marginTop: 2, marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#344054', marginBottom: 6 },
  kodeFieldLabel: { marginTop: 14 },
  pilihPekerjaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#101828', paddingVertical: 0 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderLeftWidth: 1,
    borderLeftColor: '#EAECF0',
    paddingLeft: 8,
    paddingRight: 6,
    height: '100%',
    justifyContent: 'center',
  },
  scanButtonText: { fontSize: 12, fontWeight: '600', color: '#2F5FD1' },
  dropdown: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 160 },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F4F7',
  },
  dropdownItemName: { fontSize: 12, fontWeight: '600', color: '#101828', flex: 1, marginRight: 8 },
  dropdownItemNik: { fontSize: 11, color: '#98A2B3' },
  dropdownStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  dropdownStatusText: { fontSize: 11, color: '#667085' },
  dropdownEmptyText: { fontSize: 11, color: '#98A2B3', padding: 12, textAlign: 'center' },
  dropdownErrorText: { fontSize: 11, color: '#D92D20', padding: 12, textAlign: 'center' },
  kodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 18,
  },
  kodeSelectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kodeSelectedText: { fontSize: 12, fontWeight: '600', color: '#101828' },
  kodePlaceholder: { fontSize: 12, color: '#98A2B3' },
  kodeChevron: { fontSize: 12, color: '#667085' },
  kodeDropdown: { marginBottom: 18, marginTop: -10 },
  kodeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12 },
  kodeChip: { alignItems: 'center', justifyContent: 'center' },
  kodeBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kodeBadgeBlue: { backgroundColor: '#2F5FD1' },
  kodeBadgePurple: { backgroundColor: '#7C3AED' },
  kodeBadgeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  batalButton: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  batalButtonText: { fontSize: 13, fontWeight: '700', color: '#475467' },
  tambahButton: {
    flex: 1,
    backgroundColor: '#2F5FD1',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  tambahButtonDisabled: { backgroundColor: '#B0C4EF' },
  tambahButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});