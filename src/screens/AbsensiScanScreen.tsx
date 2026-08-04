import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// IMPORTANT: this file must never `import ... from 'react-native-vision-camera'`
// (or from AbsensiScanScreenCamera, which does) at the top level. A static
// `import` is evaluated before any code runs and can't be caught — if the
// native module isn't linked correctly (wrong version, native rebuild not
// done yet, etc.), it throws during app startup and takes the *entire*
// navigator down with it, including every other screen (this is what was
// breaking SKTHeaderDetailScreen). `require()` inside try/catch is a normal
// function call, so a bad camera install now only breaks this one screen.
let CameraScreen: React.ComponentType | null = null;
let loadErrorMessage: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CameraScreen = require('./AbsensiScanScreenCamera').default;
} catch (err) {
  loadErrorMessage = err instanceof Error ? err.message : String(err);
}

export default function AbsensiScanScreen() {
  const navigation = useNavigation();

  if (!CameraScreen) {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Close scanner">
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Scan Absensi</Text>
          <View style={{ width: 20 }} />
        </View>

        <View style={styles.errorBody}>
          <Text style={styles.errorTitle}>Kamera Belum Siap</Text>
          <Text style={styles.errorSubtitle}>
            react-native-vision-camera belum ter-link dengan benar. Pastikan
            react-native-vision-camera, react-native-nitro-modules, react-native-nitro-image,
            dan react-native-vision-camera-barcode-scanner semua terpasang (versi terbaru),
            lalu lakukan clean rebuild native — bukan sekadar reload Metro.
          </Text>
          {loadErrorMessage && <Text style={styles.errorDetail}>{loadErrorMessage}</Text>}
        </View>
      </View>
    );
  }

  return <CameraScreen />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0F1A' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
  },
  closeIcon: { color: '#FFFFFF', fontSize: 18 },
  topBarTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  errorBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  errorSubtitle: { color: '#98A2B3', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorDetail: {
    color: '#667085',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 16,
    fontFamily: 'monospace',
  },
});