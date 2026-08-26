// Generic centered "are you sure?" confirmation dialog — e.g. used before
// SinkronisasiDataModal's Get Data / Push Data actually run, since both can
// clobber unsaved local or server-side changes.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmationModal({
  visible,
  title,
  message,
  cancelLabel = 'Batal',
  confirmLabel = 'Ya, Lanjutkan',
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Icon name="info-circle" size={22} color="#2F5FD1" solid />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.divider} />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
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
    backgroundColor: 'rgba(16, 24, 40, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EAF0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#101828', textAlign: 'center' },
  message: {
    fontSize: 12,
    color: '#667085',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: '#EEF1F5',
    marginTop: 20,
    marginBottom: 16,
  },
  buttonRow: { flexDirection: 'row', width: '100%', gap: 12 },
  cancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: { color: '#2F5FD1', fontWeight: '700', fontSize: 13 },
  confirmButton: {
    flex: 1,
    backgroundColor: '#2F5FD1',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
