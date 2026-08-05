import React, { useEffect, useState } from 'react';
import { loadAuthState, useAuthStore } from './store/authStore';
import { ActivityIndicator, StatusBar, Text, View } from 'react-native';
import AuthNavigator from './screen/navigation/authNavigation';
import MainNavigator from './screen/navigation/mainNavigation';

const AppNavigator = () => {
    const { isAuthenticated } = useAuthStore();
    const [isBooting, setIsBooting] = useState(true);

    useEffect(() => {
        const initializeAuthState = async () => {
            try {
                await loadAuthState(useAuthStore.setState);
            } catch (e) {
                console.error(e);
            } finally {
                setIsBooting(false);
            }
        };

        initializeAuthState();
    }, []);

    if (isBooting) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1317fc' }}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={{ marginTop: 10, fontSize: 18, color: '#fff', fontWeight: '600', letterSpacing: 1 }}>
                   SCANNER SKT MOBILE APPLICATION
                </Text>
            </View>
        );
    }

    return (
       <>
       <StatusBar barStyle={'light-content'} backgroundColor={'#000'} />
            {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
       </>
            
        
    );
};

export default AppNavigator;
