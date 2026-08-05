import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DetailMejaModal from './page/components/DetailMejaModal';
import TambahPekerjaModal from './page/components/TambahPekerjaModal';
import { MasterPekerja, MejaGroup, PekerjaRow } from '../services/pekerja';

// Mock data mirroring the reference screenshots — swap for real skt_view
// rows once the API wiring for this screen is ready.
const MOCK_MEJA: MejaGroup[] = [
  {
    nomorMeja: 1,
    pekerja: [
      { id: 1, namaPekerja: 'SUWARTI', nik: '0009FE1', kode: '1' },
      { id: 2, namaPekerja: 'Aminah', nik: '0010FD1', kode: '2' },
      { id: 3, namaPekerja: 'Maslikah', nik: '0012FD1', kode: '3' },
      { id: 4, namaPekerja: 'ALFIYAH', nik: '0008FB2', kode: 'A' },
      { id: 5, namaPekerja: 'SUNARTI', nik: '0032FE2', kode: 'B' },
    ],
  },
  {
    nomorMeja: 2,
    pekerja: [
      { id: 6, namaPekerja: 'Crysa Umami', nik: '0022FD1', kode: '1' },
      { id: 7, namaPekerja: 'MISKIYATUN', nik: '0023FE1', kode: '2' },
      { id: 8, namaPekerja: 'Kemisrah', nik: '0020FD1', kode: '3' },
    ],
  },
];

export default function DetailMejaDemoScreen() {
  const [detailVisible, setDetailVisible] = useState(false);
  const [tambahVisible, setTambahVisible] = useState(false);
  const [activeMeja, setActiveMeja] = useState<number | null>(null);
  const [mejaGroups, setMejaGroups] = useState<MejaGroup[]>(MOCK_MEJA);
  const [deletingPekerjaId, setDeletingPekerjaId] = useState<number | null>(null);
  const [scannedPekerja, setScannedPekerja] = useState<MasterPekerja | null>(null);

  const activeMejaPekerja: PekerjaRow[] =
    mejaGroups.find((g) => g.nomorMeja === activeMeja)?.pekerja ?? [];

  const handleAddPekerja = (nomorMeja: number) => {
    setActiveMeja(nomorMeja);
    setScannedPekerja(null);
    setTambahVisible(true);
  };

  const handleDeletePekerja = (nomorMeja: number, pekerjaId: number) => {
    // Delete logic (API call + refresh) will be wired up later.
    console.log('delete pekerja', { nomorMeja, pekerjaId });
    setDeletingPekerjaId(pekerjaId);
    setTimeout(() => {
      setMejaGroups((prev) =>
        prev.map((g) =>
          g.nomorMeja === nomorMeja
            ? { ...g, pekerja: g.pekerja.filter((p) => p.id !== pekerjaId) }
            : g
        )
      );
      setDeletingPekerjaId(null);
    }, 400);
  };

  // Matches TambahPekerjaModal's current onSubmit signature:
  // (pekerja: MasterPekerja, kode: string) => void
  const handleSubmitTambah = (pekerja: MasterPekerja, kode: string) => {
    // Submit logic (API call + refresh) will be wired up later.
    console.log('tambah pekerja', { nomorMeja: activeMeja, pekerja, kode });
    setTambahVisible(false);
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.openButton} onPress={() => setDetailVisible(true)}>
        <Text style={styles.openButtonText}>Open Detail Meja</Text>
      </TouchableOpacity>

      <DetailMejaModal
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        brakLabel="Brak 2"
        tanggal="13 Juli 2026"
        mejaGroups={mejaGroups}
        deletingPekerjaId={deletingPekerjaId}
        onDeletePekerja={handleDeletePekerja}
        onAddPekerja={handleAddPekerja}
      >
        {/* Nested as `children` of DetailMejaModal — TambahPekerjaModal no
            longer wraps itself in its own <Modal>, so it MUST be rendered
            inside DetailMejaModal's Modal (as children) to get a proper
            full-screen, centered, dimmed overlay. Rendering it as a plain
            sibling here (the old pattern) is what produced the squashed,
            inline "Tambah Pekerja" card instead of a floating dialog. */}
        {tambahVisible && (
          <TambahPekerjaModal
            visible={tambahVisible}
            onClose={() => setTambahVisible(false)}
            nomorMeja={activeMeja}
            existingPekerja={activeMejaPekerja}
            mejaGroups={mejaGroups}
            scannedPekerja={scannedPekerja}
            onPressScan={() => console.log('open scanner / picker')}
            onSubmit={handleSubmitTambah}
          />
        )}
      </DetailMejaModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA', alignItems: 'center', justifyContent: 'center' },
  openButton: {
    backgroundColor: '#2F5FD1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  openButtonText: { color: '#FFFFFF', fontWeight: '700' },
});
