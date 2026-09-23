import React, { useState } from 'react';
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
//
// The require() itself is deferred to first RENDER (via loadCameraScreen
// below), not run at this module's own top level either — mainNavigation.tsx
// now imports this wrapper eagerly (no more React.lazy chunk/"download" on
// every launch, see mainNavigation.tsx), which means this module's top level
// runs as part of the very first JS bundle evaluation, before the native
// bridge is necessarily done (re-)registering modules — that's fine for
// everything else in this file, but touching a native camera module that
// early caused it to fail (and stick failed for the rest of that JS
// session) specifically after a dev "Reload" (JS context torn down and
// re-run, native side left alive). Waiting for the first render instead —
// i.e. the AbsensiScan route actually being opened — gives the bridge all
// the time it needs, on both a cold start and a reload, while still never
// touching the camera module until a scanner screen is genuinely visited.
let CameraScreen: React.ComponentType | null | undefined; // undefined = not attempted yet
let loadErrorMessage: string | null = null;

function loadCameraScreen(): React.ComponentType | null {
  if (CameraScreen !== undefined) return CameraScreen; // already attempted — reuse the result
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    CameraScreen = require('./AbsensiScanScreenCamera').default;
  } catch (err) {
    loadErrorMessage = err instanceof Error ? err.message : String(err);
    CameraScreen = null;
  }
  return CameraScreen ?? null;
}

export default function AbsensiScanScreen() {
  const navigation = useNavigation();
  // Lazy initializer — runs once, on this component's first render (i.e.
  // once the AbsensiScan route actually mounts), not on every re-render.
  const [Camera] = useState(loadCameraScreen);

  if (!Camera) {
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

  return <Camera />;
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