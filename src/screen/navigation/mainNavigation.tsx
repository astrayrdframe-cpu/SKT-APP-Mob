// src/screen/navigation/mainNavigation.tsx
//
// Post-login stack. Combines the original placeholder routes (Home,
// MasterMk) with the SKT flow — Dashboard -> Detail -> Setoran Summary —
// wrapped in OfflineProvider so every screen in the stack can read
// connectivity state via useOffline(). AbsensiScan is registered as a
// modal presentation, reachable from the Scan button inside
// TambahPekerjaModal.
//
// AbsensiScanScreen and BarcodeTrayScanScreen are plain top-level imports,
// not React.lazy — lazy-loading them meant Metro had to fetch each one as
// its own async chunk (the "Downloading..." delay) on every fresh app
// start, before either scanner was ever opened. That's no longer needed
// for safety: neither wrapper screen imports react-native-vision-camera
// (or its own *Camera sibling) at ITS top level either — each wraps that
// require() in its own try/catch (see AbsensiScanScreen.tsx/
// BarcodeTrayScanScreen.tsx), so a bad camera install still only breaks
// that one screen's module evaluation, not the whole navigator. A plain
// import of the wrapper here is therefore just as crash-safe, with no
// runtime chunk fetch.

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../HomeScreen';
import MasterMkScreen from '../page/masterMk/MasterMkScreen';
import SKTHeaderDashboardScreen from '../page/dashboard/SKTHeaderDashboardScreen';
import SKTHeaderDetailScreen from '../page/dashboard/SKTHeaderDetailScreen';
import SetoranSummaryScreen from '../page/setoran/SetoranSummaryScreen';
import AbsensiScanScreen from '../page/absensi/AbsensiScanScreen';
import BarcodeTrayScanScreen from '../page/setoran/BarcodeTrayScanScreen';
import { OfflineProvider } from '../../context/OfflineContext';
import { SKTHeaderItem } from '../../services/skt';
import { MasterPekerja } from '../../services/pekerja';

export type RootStackParamList = {
  InboundList: undefined;
  MasterMk: undefined;
  SKTHeaderDashboard: undefined;
  SKTHeaderDetail: { id: string | number; preview?: SKTHeaderItem };
  SetoranSummary: { id: number };
  // onScanned fires once a scanned NIK resolves to a real pekerja and the
  // admin confirms "Gunakan". onCancelled fires if the scanner closes any
  // other way (X button, hardware back, swipe-back) — both exist so
  // TambahPekerjaModal reliably reopens no matter how the scan ends,
  // instead of only on a successful scan.
  //
  // `mode` switches what a scanned code means: 'pekerja' (default) looks
  // the code up against skt_master_pekerja and fires onScanned with the
  // resolved worker; 'barcode' (used by TambahSetoranModal's tray scan)
  // skips that lookup and fires onScannedCode with the raw scanned
  // string instead — the caller resolves it however it needs to.
  AbsensiScan:
    | {
        mode?: 'pekerja' | 'barcode';
        onScanned?: (pekerja: MasterPekerja) => void;
        onScannedCode?: (code: string) => void;
        onCancelled?: () => void;
      }
    | undefined;
  // Dedicated scanner for Tambah Setoran's "+ Scan to Add" (Barcode Tray)
  // — separate from AbsensiScan since it verifies a scanned code against
  // skt/test_temp, not skt_master_pekerja (see BarcodeTrayScanScreenCamera).
  // onScannedCode fires once a scanned code is confirmed against test_temp
  // and the admin taps "Gunakan"; onCancelled fires if the scanner closes
  // any other way, same "always reopens the caller" contract as AbsensiScan.
  BarcodeTrayScan:
    | {
        onScannedCode?: (code: string) => void;
        onCancelled?: () => void;
      }
    | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const MainNavigator = () => {
  return (
    <OfflineProvider>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="SKTHeaderDashboard">
        <Stack.Screen name="InboundList" component={HomeScreen} />
        <Stack.Screen name="MasterMk" component={MasterMkScreen} />
        <Stack.Screen name="SKTHeaderDashboard" component={SKTHeaderDashboardScreen} />
        <Stack.Screen name="SKTHeaderDetail" component={SKTHeaderDetailScreen} />
        <Stack.Screen name="SetoranSummary" component={SetoranSummaryScreen} />
        <Stack.Screen
          name="AbsensiScan"
          component={AbsensiScanScreen}
          options={{
            presentation: 'fullScreenModal',
            contentStyle: { backgroundColor: '#0B0F1A' },
          }}
        />
        <Stack.Screen
          name="BarcodeTrayScan"
          component={BarcodeTrayScanScreen}
          options={{
            presentation: 'fullScreenModal',
            contentStyle: { backgroundColor: '#0B0F1A' },
          }}
        />
      </Stack.Navigator>
    </OfflineProvider>
  );
};

export default MainNavigator;
