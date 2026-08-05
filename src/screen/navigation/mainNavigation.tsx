// src/screen/navigation/mainNavigation.tsx
//
// Post-login stack. Combines the original placeholder routes (Home,
// MasterMk) with the SKT flow — Dashboard -> Detail -> Setoran Summary —
// wrapped in OfflineProvider so every screen in the stack can read
// connectivity state via useOffline(). AbsensiScan is registered as a
// modal presentation, reachable from the Scan button inside
// TambahPekerjaModal.
//
// AbsensiScanScreen is imported lazily (React.lazy) rather than with a
// normal top-level import. A plain `import AbsensiScanScreen from ...`
// gets evaluated the instant this file loads — which means
// react-native-vision-camera's native module gets touched as soon as the
// navigator mounts, not only when the scanner is actually opened. If that
// native dependency has any linking issue (wrong version installed,
// missing pod/gradle setup, stale build, etc), a plain import can crash
// the whole navigator — taking down every screen, including
// SKTHeaderDetailScreen, which has nothing to do with the camera. Lazy
// loading confines any camera-related crash to just the AbsensiScan route.

import React, { Suspense } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../HomeScreen';
import MasterMkScreen from '../page/masterMk/MasterMkScreen';
import SKTHeaderDashboardScreen from '../page/dashboard/SKTHeaderDashboardScreen';
import SKTHeaderDetailScreen from '../page/dashboard/SKTHeaderDetailScreen';
import SetoranSummaryScreen from '../page/setoran/SetoranSummaryScreen';
import { OfflineProvider } from '../../context/OfflineContext';
import { SKTHeaderItem } from '../../services/skt';
import { MasterPekerja } from '../../services/pekerja';

const AbsensiScanScreen = React.lazy(() => import('../page/absensi/AbsensiScanScreen'));

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
          options={{
            presentation: 'fullScreenModal',
            contentStyle: { backgroundColor: '#0B0F1A' },
          }}>
          {(props: any) => (
            <Suspense fallback={<View style={{ flex: 1, backgroundColor: '#0B0F1A' }} />}>
              <AbsensiScanScreen {...props} />
            </Suspense>
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </OfflineProvider>
  );
};

export default MainNavigator;
