import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MejaGroup } from '../types/pekerja';

interface DetailMejaModalProps {
  visible: boolean;
  onClose: () => void;
  brakLabel: string; // e.g. "Brak 2"
  tanggal: string; // e.g. "13 Juli 2026"
  mejaGroups: MejaGroup[];
  onDeletePekerja: (nomorMeja: number, pekerjaId: number) => void;
  onAddPekerja: (nomorMeja: number) => void;
}

function KodeBadge({ kode }: { kode: string }) {
  const isLetter = /[A-Za-z]/.test(kode);
  return (
    <View style={[styles.kodeBadge, isLetter ? styles.kodeBadgePurple : styles.kodeBadgeBlue]}>
      <Text style={styles.kodeBadgeText}>{kode}</Text>
    </View>
  );
}

export default function DetailMejaModal({
  visible,
  onClose,
  brakLabel,
  tanggal,
  mejaGroups,
  onDeletePekerja,
  onAddPekerja,
}: DetailMejaModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Detail Meja</Text>
              <Text style={styles.subtitle}>
                {brakLabel} - {tanggal}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mejaCountBadge}>
            <Text style={styles.mejaCountText}>{mejaGroups.length} Meja</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {mejaGroups.map((meja) => (
              <View key={meja.nomorMeja} style={styles.mejaSection}>
                <Text style={styles.mejaTitle}>Meja {meja.nomorMeja}</Text>

                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderText, styles.colName]}>Nama Pekerja</Text>
                  <Text style={[styles.tableHeaderText, styles.colNik]}>NIK</Text>
                  <Text style={[styles.tableHeaderText, styles.colKode]}>Kode</Text>
                  <Text style={[styles.tableHeaderText, styles.colAction]}>Action</Text>
                </View>

                {meja.pekerja.map((p) => (
                  <View key={p.id} style={styles.tableRow}>
                    <Text style={[styles.cellName, styles.colName]} numberOfLines={1}>
                      {p.namaPekerja}
                    </Text>
                    <Text style={[styles.cellNik, styles.colNik]} numberOfLines={1}>
                      {p.nik}
                    </Text>
                    <View style={styles.colKode}>
                      <KodeBadge kode={p.kode} />
                    </View>
                    <View style={styles.colAction}>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => onDeletePekerja(meja.nomorMeja, p.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.deleteButtonText}>🗑 Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addPekerjaButton}
                  onPress={() => onAddPekerja(meja.nomorMeja)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addPekerjaButtonText}>+ Add Pekerja</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E7EC',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#101828' },
  subtitle: { fontSize: 12, color: '#667085', marginTop: 4 },
  closeIcon: { fontSize: 18, color: '#667085', padding: 4 },
  mejaCountBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAF0FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 12,
  },
  mejaCountText: { fontSize: 11, fontWeight: '600', color: '#2F5FD1' },
  scrollContent: { paddingTop: 16, paddingBottom: 24 },
  mejaSection: {
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  mejaTitle: { fontSize: 14, fontWeight: '700', color: '#101828', marginBottom: 10 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    paddingBottom: 8,
    marginBottom: 4,
  },
  tableHeaderText: { fontSize: 10, color: '#98A2B3', fontWeight: '600' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  colName: { flex: 1.4 },
  colNik: { flex: 1.1 },
  colKode: { flex: 0.6, alignItems: 'flex-start' },
  colAction: { flex: 1.1, alignItems: 'flex-start' },
  cellName: { fontSize: 12, fontWeight: '700', color: '#101828' },
  cellNik: { fontSize: 11, color: '#667085' },
  kodeBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kodeBadgeBlue: { backgroundColor: '#2F5FD1' },
  kodeBadgePurple: { backgroundColor: '#7C3AED' },
  kodeBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#FDA29B',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deleteButtonText: { fontSize: 10, fontWeight: '600', color: '#D92D20' },
  addPekerjaButton: {
    borderWidth: 1.5,
    borderColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addPekerjaButtonText: { color: '#2F5FD1', fontWeight: '700', fontSize: 13 },
});
