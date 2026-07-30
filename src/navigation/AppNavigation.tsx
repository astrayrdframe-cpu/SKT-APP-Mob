// src/navigation/AppNavigation.tsx
//
// This replaces the old placeholder "MainNavigator" (which only had
// HomeScreen). It becomes the post-login stack: Dashboard -> Detail ->
// Setoran Summary, wrapped in OfflineProvider so every screen in the
// stack can read connectivity state via useOffline().

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SKTHeaderDashboardScreen from '../screens/SKTHeaderDashboardScreen';
import SKTHeaderDetailScreen from '../screens/SKTHeaderDetailScreen';
import SetoranSummaryScreen from '../screens/SetoranSummaryScreen';
import { OfflineProvider } from '../context/OfflineContext';
import { SKTHeaderItem } from '../types/skt';

export type RootStackParamList = {
  SKTHeaderDashboard: undefined;
  SKTHeaderDetail: { id: string | number; preview?: SKTHeaderItem };
  SetoranSummary: { id: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigation = () => {
  return (
    <OfflineProvider>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="SKTHeaderDashboard">
        <Stack.Screen name="SKTHeaderDashboard" component={SKTHeaderDashboardScreen} />
        <Stack.Screen name="SKTHeaderDetail" component={SKTHeaderDetailScreen} />
        <Stack.Screen name="SetoranSummary" component={SetoranSummaryScreen} />
      </Stack.Navigator>
    </OfflineProvider>
  );
};

export default AppNavigation;
