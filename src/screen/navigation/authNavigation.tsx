// src/navigators/AuthNavigator.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '../Login';


export type AuthStackParamList = {
    Login: undefined;
    ForgotPassword: undefined;
};

const AuthStack = createStackNavigator<AuthStackParamList>();

const AuthNavigator = () => (
    <AuthStack.Navigator>
        <AuthStack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
        />

    </AuthStack.Navigator>
);

export default AuthNavigator;
