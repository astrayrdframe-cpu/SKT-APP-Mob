import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from './navigation/AuthNavigation';
import { useAuthStore } from '../store/authStore';
import AuthServices from '../services/authService';

const { width } = Dimensions.get('window');

type NavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
    const navigation = useNavigation<NavigationProp>();
    const { setAuthenticated, setToken } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        // Load saved username on mount
        const loadSavedUsername = async () => {
            try {
                const savedUsername = await AsyncStorage.getItem('savedUsername');
                if (savedUsername) {
                    setUsername(savedUsername);
                }
            } catch (error) {
                console.error('Error loading saved username:', error);
            }
        };
        loadSavedUsername();
    }, []);

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            Alert.alert('Validation Error', 'Please enter both username and password');
            return;
        }

        try {
            setLoading(true);
            
            const response = await AuthServices.login(username, password); // Simulate login API call
            console.log('Login response:', response);

            // Save username to AsyncStorage
            await AsyncStorage.setItem('savedUsername', username);

            // Save token to AsyncStorage
            await AsyncStorage.setItem('accessToken', response.access_token);

            // Update store
            setToken(response.access_token);
            setAuthenticated(true);

            Alert.alert('Login Successful', 'You have been logged in successfully!');
        } catch (error: any) {
            Alert.alert('Login Failed', error.message || 'An error occurred during login');
            console.error('Login error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.mainContainer}>
            <ScrollView
                contentContainerStyle={styles.scrollContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                
                <View style={styles.headerContainer}>
                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>Sign in to continue</Text>
                </View>

                <View style={styles.formContainer}>
                    <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Username</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your username"
                            placeholderTextColor="#A0A0A0"
                            value={username}
                            onChangeText={setUsername}
                            editable={!loading}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your password"
                            placeholderTextColor="#A0A0A0"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            editable={!loading}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}>
                        <Text style={styles.buttonText}>
                            {loading ? 'Authenticating...' : 'Sign In'}
                        </Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#FFFFFF', // Pure white background for minimal aesthetic
    },
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: width * 0.08,
        paddingVertical: 40,
    },
    headerContainer: {
        marginBottom: 48,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#111111',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666666',
        fontWeight: '400',
    },
    formContainer: {
        width: '100%',
    },
    inputWrapper: {
        marginBottom: 24,
    },
    inputLabel: {
        fontSize: 12,
        textTransform: 'uppercase',
        color: '#888888',
        fontWeight: '600',
        marginBottom: 8,
        letterSpacing: 1,
    },
    input: {
        backgroundColor: '#F7F7F7',
        height: 56,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        color: '#111111',
        borderWidth: 1,
        borderColor: '#EFEFEF',
    },
    button: {
        backgroundColor: '#111111',
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
    },
    buttonDisabled: {
        backgroundColor: '#E0E0E0',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
});