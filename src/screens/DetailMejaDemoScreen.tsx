import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DetailMejaModal from '../components/DetailMejaModal';
import TambahPekerjaModal from '../components/TambahPekerjaModal';
import { MejaGroup, SelectedPekerja } from '../types/pekerja';

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
  const [mejaGroups] = useState<MejaGroup[]>(MOCK_MEJA);
  const [selectedPekerja] = useState<SelectedPekerja>({
    namaPekerja: 'AMINAH',
    nik: '0512FB1',
  });

  const handleAddPekerja = (nomorMeja: number) => {
    setActiveMeja(nomorMeja);
    setTambahVisible(true);
  };

  const handleDeletePekerja = (nomorMeja: number, pekerjaId: number) => {
    // Delete logic (API call + refresh) will be wired up later.
    console.log('delete pekerja', { nomorMeja, pekerjaId });
  };

  const handleSubmitTambah = (kodePekerja: string) => {
    // Submit logic (API call + refresh) will be wired up later.
    console.log('tambah pekerja', { nomorMeja: activeMeja, selectedPekerja, kodePekerja });
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
        onDeletePekerja={handleDeletePekerja}
        onAddPekerja={handleAddPekerja}
      />

      {/* Nested on top of DetailMejaModal, matching the stacked-dialog look */}
      <TambahPekerjaModal
        visible={tambahVisible}
        onClose={() => setTambahVisible(false)}
        nomorMeja={activeMeja}
        selectedPekerja={selectedPekerja}
        onPressScan={() => console.log('open scanner / picker')}
        onSubmit={handleSubmitTambah}
      />
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
