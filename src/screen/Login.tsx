import React, { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import Icon from 'react-native-vector-icons/FontAwesome5'; // Tambahkan icon
import { useAuthStore } from '../store/authStore';
import AuthServices from '../services/authService';

// Service key khusus untuk menyimpan kredensial login di secure storage
// (Android Keystore / iOS Keychain), terpisah dari kredensial lain di device.
const REMEMBER_ME_SERVICE = 'sktnti-remember-me-credentials';

export default function LoginScreen() {
    const { setSession } = useAuthStore();

    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // State baru untuk fitur tambahan
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    useEffect(() => {
        // Load saved preferences on mount
        const loadPreferences = async () => {
            try {
                const savedRememberMe = await AsyncStorage.getItem('rememberMe');
                const isRemembered = savedRememberMe === 'true';
                setRememberMe(isRemembered);

                // Hanya load kredensial jika 'Remember Me' sebelumnya dicentang.
                // Username & password disimpan bersama di secure storage, bukan
                // AsyncStorage, karena password tidak boleh tersimpan plain text.
                if (isRemembered) {
                    const credentials = await Keychain.getGenericPassword({
                        service: REMEMBER_ME_SERVICE,
                    });
                    if (credentials) {
                        setUsername(credentials.username);
                        setPassword(credentials.password);
                    }
                }
            } catch (error) {
                console.error('Error loading preferences:', error);
            }
        };
        loadPreferences();
    }, []);

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            Alert.alert('Validation Error', 'Please enter both username and password');
            return;
        }

        try {
            setLoading(true);
            
            const response = await AuthServices.login(username, password);
            console.log('Login response:', response);

            // Simpan status Remember Me
            await AsyncStorage.setItem('rememberMe', rememberMe.toString());

            // Simpan atau hapus kredensial (username + password) di secure
            // storage berdasarkan status Remember Me.
            if (rememberMe) {
                await Keychain.setGenericPassword(username, password, {
                    service: REMEMBER_ME_SERVICE,
                });
            } else {
                await Keychain.resetGenericPassword({ service: REMEMBER_ME_SERVICE });
            }

            // Persist the token together with its expiry so the session can
            // be validated (and kept, or silently ended) on the next app
            // launch instead of just being remembered forever.
            await setSession({
                token: response.data.token,
                expiry: response.data.expired_date,
                user: {
                    username: response.data.username,
                    nama_brak: response.data.nama_brak,
                },
            });

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
            <StatusBar barStyle="light-content" backgroundColor="#2F5FD1" />

            <ScrollView
                contentContainerStyle={styles.scrollContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}>

                {/* Brand header, sejalan dengan topBar biru di layar-layar lain */}
                <View style={styles.brandHeader}>
                    <View style={styles.brandIconBox}>
                        <Icon name="smoking" size={30} color="#B45309" solid />
                    </View>
                    <Text style={styles.brandTitle}>Selamat Datang</Text>
                    <Text style={styles.brandSubtitle}>Silakan masuk ke akun SKT NTI Anda</Text>
                </View>

                {/* Kartu form, menimpa header seperti bottom-sheet di layar lain
                    (DetailMejaModal, dsb) — full-bleed, rounded hanya di atas */}
                <View style={styles.cardContainer}>
                    {/* Username Input */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Username</Text>
                        <View style={styles.inputRow}>
                            <View style={styles.inputIconBadge}>
                                <Icon name="id-card" size={16} color="#2F5FD1" solid />
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder="Masukkan Username"
                                placeholderTextColor="#98A2B3"
                                value={username}
                                onChangeText={setUsername}
                                editable={!loading}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    {/* Password Input dengan Eye Icon */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Kata Sandi</Text>
                        <View style={styles.inputRow}>
                            <View style={styles.inputIconBadge}>
                                <Icon name="lock" size={16} color="#2F5FD1" solid />
                            </View>
                            <View style={styles.passwordInputContainer}>
                                <TextInput
                                    style={styles.passwordInput}
                                    placeholder="Masukkan Kata Sandi"
                                    placeholderTextColor="#98A2B3"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword} // Toggle visibilitas
                                    editable={!loading}
                                />
                                <TouchableOpacity
                                    style={styles.eyeIconContainer}
                                    onPress={() => setShowPassword(!showPassword)}
                                >
                                    <Icon
                                        name={showPassword ? 'eye' : 'eye-slash'}
                                        size={18}
                                        color="#98A2B3"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Remember Me — saat dicentang, username & password disimpan
                        di secure storage (Keychain) supaya auto-terisi lagi
                        di percobaan login berikutnya. */}
                    <TouchableOpacity
                        style={styles.rememberMeContainer}
                        onPress={() => setRememberMe(!rememberMe)}
                        activeOpacity={0.8}
                    >
                        <Icon
                            name={rememberMe ? 'check-square' : 'square'}
                            size={18}
                            color={rememberMe ? '#2F5FD1' : '#98A2B3'}
                            solid={rememberMe}
                        />
                        <Text style={styles.rememberMeText}>Ingat Saya</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}>
                        <Text style={styles.buttonText}>
                            {loading ? 'Memproses...' : 'Masuk'}
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
        backgroundColor: '#F7F8FA', // Latar abu-abu muda yang sama dipakai di seluruh app
    },
    scrollContainer: {
        flexGrow: 1,
    },
    // Header brand biru, senada dengan topBar di Dashboard & Setoran
    brandHeader: {
        backgroundColor: '#2F5FD1',
        alignItems: 'center',
        paddingTop: 64,
        paddingBottom: 56,
        paddingHorizontal: 24,
    },
    // Kotak ikon putih sedikit dimiringkan, menyerupai kartu rokok pada mockup
    brandIconBox: {
        width: 68,
        height: 68,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        transform: [{ rotate: '-8deg' }],
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    brandTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    brandSubtitle: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 13,
        marginTop: 4,
        textAlign: 'center',
    },
    // Kartu form full-bleed menimpa header, sama seperti pola bottom-sheet
    // (DetailMejaModal dsb) — rounded hanya di sisi atas, bukan dialog
    // mengambang di tengah layar.
    cardContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        marginTop: -24,
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 32,
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 4,
    },
    inputWrapper: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 13,
        color: '#101828',
        fontWeight: '600',
        marginBottom: 8,
    },
    // Baris berisi lencana ikon + kotak input, berdampingan seperti mockup
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inputIconBadge: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#EAF0FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        height: 44,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 14,
        color: '#101828',
        borderWidth: 1,
        borderColor: '#D0D5DD',
    },
    // --- Styles untuk Wrapper Password ---
    passwordInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D0D5DD',
        borderRadius: 12,
        height: 44,
    },
    passwordInput: {
        flex: 1, // Agar text input memakan sisa ruang di kiri icon
        height: '100%',
        paddingHorizontal: 16,
        fontSize: 14,
        color: '#101828',
    },
    eyeIconContainer: {
        paddingHorizontal: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rememberMeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    rememberMeText: {
        marginLeft: 10,
        fontSize: 13,
        color: '#4B5563',
        fontWeight: '500',
    },
    button: {
        backgroundColor: '#2F5FD1',
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
    },
    buttonDisabled: {
        backgroundColor: '#AEC0EA',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
});