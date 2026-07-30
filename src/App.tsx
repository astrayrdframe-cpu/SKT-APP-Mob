import React, { useEffect } from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import AppNavigator from './AppNavigator';
import {  StyleSheet } from 'react-native';


// Enable screens for better performance with navigation
enableScreens();

const Main = () => {


  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeAreaBackground}>
        <NavigationContainer theme={DefaultTheme}>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

export default function App() {
  return <Main />;
}

const styles = StyleSheet.create({
  safeAreaBackground: {
    flex: 1,  // Ensures it takes up the entire screen space
    backgroundColor: '#000',  // Set the background color to your custom color
    paddingTop: 0, // Ensures that no extra padding is added on top, letting the status bar stay visible
  },
});
