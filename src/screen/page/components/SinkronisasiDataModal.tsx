// Sinkronisasi Data — bottom-sheet dialog opened from the refresh button in
// SKTHeaderDashboardScreen's top bar. Lets the user pick between pulling the
// latest data from the server ("Get Data") or pushing whatever's queued
// locally up to the server ("Push Data"). Follows the same slide-up sheet
// shape as DetailMejaModal for visual consistency across the app.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

interface SinkronisasiDataModalProps {
  visible: boolean;
  onClose: () => void;
  onGetData: () => void;
  onPushData: () => void;
}

export default function SinkronisasiDataModal({
  visible,
  onClose,
  onGetData,
  onPushData,
}: SinkronisasiDataModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Sinkronisasi Data</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Pilih jenis sinkronisasi yang ingin dilakukan.</Text>

          <TouchableOpacity
            style={[styles.option, styles.optionActive]}
            onPress={onGetData}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIconBox, styles.optionIconBoxActive]}>
              <Icon name="download" size={15} color="#2F5FD1" solid />
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Get Data</Text>
              <Text style={styles.optionSubtitle}>Ambil data terbaru dari server</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={onPushData} activeOpacity={0.8}>
            <View style={styles.optionIconBox}>
              <Icon name="upload" size={15} color="#667085" solid />
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>Push Data</Text>
              <Text style={styles.optionSubtitle}>Kirim data lokal ke server</Text>
            </View>
          </TouchableOpacity>
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
    paddingBottom: 28,
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
  title: { fontSize: 16, fontWeight: '700', color: '#101828' },
  closeIcon: { fontSize: 18, color: '#667085', padding: 4 },
  subtitle: { fontSize: 12, color: '#667085', marginTop: 4, marginBottom: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E4E7EC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  optionActive: {
    borderColor: '#2F5FD1',
    backgroundColor: '#EAF0FF',
  },
  optionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F4F7',
    marginRight: 12,
  },
  optionIconBoxActive: {
    backgroundColor: '#FFFFFF',
  },
  optionTextWrap: { flex: 1 },
  optionTitle: { fontSize: 13, fontWeight: '700', color: '#101828' },
  optionSubtitle: { fontSize: 11, color: '#667085', marginTop: 2 },
});
