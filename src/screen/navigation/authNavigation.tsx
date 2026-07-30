// src/screen/navigation/authNavigation.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../Login';

export type AuthStackParamList = {
    Login: undefined;
    ForgotPassword: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
);

export default AuthNavigator;