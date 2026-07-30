import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SelectedPekerja } from '../types/pekerja';

interface TambahPekerjaModalProps {
  visible: boolean;
  onClose: () => void;
  nomorMeja: number | null;
  selectedPekerja: SelectedPekerja | null; // pre-filled chip, e.g. from a scan
  onPressScan: () => void; // will open the real picker/scanner later
  onSubmit: (kodePekerja: string) => void;
}

export default function TambahPekerjaModal({
  visible,
  onClose,
  nomorMeja,
  selectedPekerja,
  onPressScan,
  onSubmit,
}: TambahPekerjaModalProps) {
  const [kodePekerja, setKodePekerja] = useState('');

  const handleTambah = () => {
    onSubmit(kodePekerja);
    setKodePekerja('');
  };

  const handleBatal = () => {
    setKodePekerja('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Tambah Pekerja</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.mejaLabel}>Meja {nomorMeja ?? '-'}</Text>

          <Text style={styles.fieldLabel}>Pilih Pekerja</Text>
          <View style={styles.pilihPekerjaBox}>
            {selectedPekerja ? (
              <View style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {selectedPekerja.namaPekerja} - {selectedPekerja.nik}
                </Text>
              </View>
            ) : (
              <Text style={styles.placeholderText}>Belum dipilih</Text>
            )}

            <TouchableOpacity style={styles.scanButton} onPress={onPressScan} activeOpacity={0.8}>
              <Text style={styles.scanButtonText}>⌕ Scan</Text>
              <Text style={styles.scanChevron}>⌄</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Kode Pekerja</Text>
          <TextInput
            style={styles.input}
            value={kodePekerja}
            onChangeText={setKodePekerja}
            placeholder="Masukkan kode..."
            placeholderTextColor="#98A2B3"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.batalButton} onPress={handleBatal} activeOpacity={0.8}>
              <Text style={styles.batalButtonText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tambahButton} onPress={handleTambah} activeOpacity={0.8}>
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
  pilihPekerjaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    marginBottom: 14,
    height: 40,
  },
  chip: {
    flex: 1,
    backgroundColor: '#EAF0FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 6,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: '#2F5FD1' },
  placeholderText: { flex: 1, fontSize: 12, color: '#98A2B3' },
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
  scanChevron: { fontSize: 12, color: '#2F5FD1' },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 12,
    color: '#101828',
    marginBottom: 18,
  },
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
  tambahButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
