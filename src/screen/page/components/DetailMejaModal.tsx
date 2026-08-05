import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { MejaGroup } from '../../../services/pekerja';

interface DetailMejaModalProps {
  visible: boolean;
  onClose: () => void;
  brakLabel: string; // e.g. "Brak 2"
  tanggal: string; // e.g. "13 Juli 2026"
  mejaGroups: MejaGroup[];
  deletingPekerjaId?: number | null; // shows a spinner on this row's Delete button while its request is in flight
  onDeletePekerja: (nomorMeja: number, pekerjaId: number) => void;
  onAddPekerja: (nomorMeja: number) => void;
  // Rendered inside this same native Modal window (e.g. TambahPekerjaModal),
  // instead of as a separate <Modal> — two independent native Modal windows
  // don't reliably stack in a predictable z-order on Android, which was
  // causing Tambah Pekerja to render behind Detail Meja after returning
  // from the QR scanner.
  //
  // IMPORTANT: `children` is rendered inside its own absolutely-positioned,
  // full-bleed `overlayRoot` layer (see below) — NOT as a loose sibling of
  // `backdrop`. `backdrop` uses `flex: 1`, so if `children` were placed
  // directly after it with no positioning context of its own, Android can
  // lay it out in the leftover (zero-height) flex space instead of treating
  // it as an independent full-screen layer, which is what caused Tambah
  // Pekerja to render squashed below the Detail Meja sheet instead of as a
  // centered, dimmed overlay on top of it.
  children?: React.ReactNode;
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
  mejaGroups = [],
  deletingPekerjaId = null,
  onDeletePekerja,
  onAddPekerja,
  children,
}: DetailMejaModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Root layer that both `backdrop` and `children` sit inside, so both
          are explicit full-screen siblings positioned against the SAME
          absolute-fill box instead of `children` trailing `backdrop` in
          normal flex flow. */}
      <View style={styles.overlayRoot}>
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
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
                          disabled={p.id === deletingPekerjaId}
                        >
                          {p.id === deletingPekerjaId ? (
                            <ActivityIndicator size="small" color="#D92D20" />
                          ) : (
                            <Text style={styles.deleteButtonText}>🗑 Delete</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  {meja.pekerja.length < 5 && (
                    <TouchableOpacity
                      style={styles.addPekerjaButton}
                      onPress={() => onAddPekerja(meja.nomorMeja)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addPekerjaButtonText}>+ Add Pekerja</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Tambah Pekerja (or any other nested dialog) — its own component
            already renders a full-bleed, centered `backdrop` via
            `StyleSheet.absoluteFill`, so this wrapper just has to
            guarantee it gets a real positioning context with a higher
            stacking order than `backdrop` above, on both platforms. */}
        {children ? <View style={styles.childOverlay}>{children}</View> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
    justifyContent: 'flex-end',
  },
  // Explicit absolute-fill layer with a higher zIndex/elevation than the
  // Detail Meja sheet, so nested dialogs (TambahPekerjaModal, etc.) always
  // render as a true full-screen centered overlay on top of it — on both
  // iOS (zIndex) and Android (elevation).
  childOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
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
