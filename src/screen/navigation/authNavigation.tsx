// src/navigators/AuthNavigator.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '../Login';
import ForgotPasswordScreen from '../ForgotPassword';


export type AuthStackParamList = {
    // Set when returning from a successful password change: pre-fills the
    // email and asks the user to log in again with the new password.
    Login: { email?: string; passwordChanged?: boolean } | undefined;
    // Opened only after a login that returned must_change_password = 1,
    // with that login's token (the change_password API's credential).
    ForgotPassword: { token: string; email: string };
};

const AuthStack = createStackNavigator<AuthStackParamList>();

const AuthNavigator = () => (
    <AuthStack.Navigator>
        <AuthStack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
        />
        <AuthStack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
        />
    </AuthStack.Navigator>
);

export default AuthNavigator;
