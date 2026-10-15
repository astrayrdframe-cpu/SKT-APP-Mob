import React, { useEffect, useState } from 'react';
import {
    Alert,
    Image,
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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuthStore } from '../store/authStore';
import AuthServices from '../services/authService';
import type { AuthStackParamList } from './navigation/authNavigation';

// White Nojorono logo, shown on the blue brand header.
const NOJORONO_LOGO = require('../assets/images/nojorono-logo-white.png');

// Service key khusus untuk menyimpan kredensial login di secure storage
// (Android Keystore / iOS Keychain), terpisah dari kredensial lain di device.
const REMEMBER_ME_SERVICE = 'sktnti-remember-me-credentials';

export default function LoginScreen() {
    const { setSession } = useAuthStore();
    const navigation = useNavigation<StackNavigationProp<AuthStackParamList, 'Login'>>();
    const route = useRoute<RouteProp<AuthStackParamList, 'Login'>>();

    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
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
                // Email & password disimpan bersama di secure storage, bukan
                // AsyncStorage, karena password tidak boleh tersimpan plain text.
                if (isRemembered) {
                    const credentials = await Keychain.getGenericPassword({
                        service: REMEMBER_ME_SERVICE,
                    });
                    if (credentials) {
                        setEmail(credentials.username); // Keychain menyimpan email di field 'username'
                        setPassword(credentials.password);
                    }
                }
            } catch (error) {
                console.error('Error loading preferences:', error);
            }
        };
        loadPreferences();
    }, []);

    // Kembali dari halaman ganti kata sandi yang berhasil: isi email,
    // kosongkan kata sandi lama, dan minta masuk dengan kata sandi baru.
    useEffect(() => {
        if (route.params?.passwordChanged) {
            if (route.params.email) setEmail(route.params.email);
            setPassword('');
        }
    }, [route.params]);

    // Dev-only escape hatch for when the backend/API is unreachable (e.g.
    // off the office network/VPN) and you still need to poke around the
    // rest of the app. Stripped out of release builds by __DEV__ — this
    // button literally does not exist in a production APK/IPA, so it can
    // never be found or used as a real backdoor. It does NOT hit the API
    // at all; it just fabricates a local session so downstream screens
    // have something to render.
    const handleDevMockLogin = async () => {
        await setSession({
            token: 'DEV-MOCK-TOKEN',
            // Expires in 1 day — long enough for a testing session, short
            // enough that it doesn't linger forever if forgotten.
            expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            user: {
                username: 'dev-mock-admin',
                role: 'ADMIN',
                nama_brak: 'Mock Brak (Dev Only)',
                // role ADMIN = super user (see isSuperUser in
                // utils/accessControl.ts) — the dev mock session sees
                // every SKT Header and every meja, which is what you want
                // when poking around offline/off-network.
                brak_id: null,
                mk_id: null,
                must_change_password: 0,
            },
        });
    };

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Validation Error', 'Please enter both email and password');
            return;
        }

        try {
            setLoading(true);
            
            const response = await AuthServices.login(email.trim(), password);
            // Never log the whole response — it carries the session token.
            console.log('Login response:', response.message);

            // Simpan status Remember Me
            await AsyncStorage.setItem('rememberMe', rememberMe.toString());

            // Simpan atau hapus kredensial (email + password) di secure
            // storage berdasarkan status Remember Me.
            if (rememberMe) {
                await Keychain.setGenericPassword(email.trim(), password, {
                    service: REMEMBER_ME_SERVICE,
                });
            } else {
                await Keychain.resetGenericPassword({ service: REMEMBER_ME_SERVICE });
            }

            // Wajib ganti kata sandi: sesi TIDAK dimulai. Pengguna diarahkan
            // ke halaman ganti kata sandi dengan token login ini (kredensial
            // API change_password), lalu harus masuk lagi dengan kata sandi
            // baru — jadi menutup/membuka ulang aplikasi tidak melewati langkah ini.
            if (response.data.must_change_password === 1) {
                navigation.navigate('ForgotPassword', {
                    token: response.data.token,
                    email: response.data.email || email.trim(),
                });
                return;
            }

            // Persist the token together with its expiry so the session can
            // be validated (and kept, or silently ended) on the next app
            // launch instead of just being remembered forever.
            await setSession({
                token: response.data.token,
                expiry: response.data.expired_date,
                user: {
                    email: response.data.email,
                    username: response.data.username,
                    role: response.data.role,
                    nama_brak: response.data.nama_brak,
                    brak_id: response.data.brak_id,
                    // null for ADMIN logins (ADMIN rows never set mk_id) —
                    // harmless, since role ADMIN skips the MK filter.
                    mk_id: response.data.mk_id,
                    must_change_password: response.data.must_change_password,
                    sudah_change_password: response.data.sudah_change_password,
                },
            });

            
        } catch (error: any) {
            Alert.alert('Login Failed', error.message || 'An error occurred during login');
            // warn, not error — a rejected login (bad/inactive email,
            // wrong password) is expected user input, already surfaced via
            // the Alert above; console.error here would pop RN's LogBox
            // redbox for something that isn't an app crash.
            console.warn('Login error:', error);
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
                    <Image
                        source={NOJORONO_LOGO}
                        style={styles.brandLogo}
                        resizeMode="contain"
                        accessibilityLabel="Nojorono"
                    />
                    <Text style={styles.brandTitle}>Selamat Datang</Text>
                    <Text style={styles.brandSubtitle}>Silakan masuk ke akun SKT NTI Anda</Text>
                </View>

                {/* Kartu form, menimpa header seperti bottom-sheet di layar lain
                    (DetailMejaModal, dsb) — full-bleed, rounded hanya di atas */}
                <View style={styles.cardContainer}>
                    {/* Email Input */}
                    <View style={styles.inputWrapper}>
                        <Text style={styles.inputLabel}>Email</Text>
                        <View style={styles.inputRow}>
                            <View style={styles.inputIconBadge}>
                                <Icon name="envelope" size={16} color="#2F5FD1" solid />
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder="nama@email.com"
                                placeholderTextColor="#98A2B3"
                                value={email}
                                onChangeText={setEmail}
                                editable={!loading}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                textContentType="emailAddress"
                                autoComplete="email"
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

                    {/* Remember Me — saat dicentang, email & password disimpan
                        di secure storage (Keychain) supaya auto-terisi lagi
                        di percobaan login berikutnya. */}
                    <View style={styles.optionsRow}>
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
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}>
                        <Text style={styles.buttonText}>
                            {loading ? 'Memproses...' : 'Masuk'}
                        </Text>
                    </TouchableOpacity>

                    {/* Visible only in dev builds (__DEV__ is compiled out of
                        release builds) — lets you get past the login screen
                        without a working API connection, for local UI
                        testing only. Never present in a real install. */}
                    {__DEV__ && (
                        <TouchableOpacity
                            style={styles.devButton}
                            onPress={handleDevMockLogin}
                            activeOpacity={0.8}>
                            <Icon name="bug" size={14} color="#B45309" solid />
                            <Text style={styles.devButtonText}>
                                Skip Login (Dev Mock — API Offline)
                            </Text>
                        </TouchableOpacity>
                    )}
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
    brandLogo: {
        width: 168,
        height: 74,
        marginBottom: 16,
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
    optionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    rememberMeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
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
    // Dev-only mock login button — styled distinctly (dashed amber border)
    // so it visually reads as "not a real feature" whenever it happens to
    // be visible during development.
    devButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#B45309',
        marginTop: 12,
    },
    devButtonText: {
        color: '#B45309',
        fontSize: 12,
        fontWeight: '600',
    },
});