import React, { useState } from 'react';
import {
    ActivityIndicator,
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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AuthServices from '../services/authService';
import type { AuthStackParamList } from './navigation/authNavigation';

// White Nojorono logo, shown on the blue brand header.
const NOJORONO_LOGO = require('../assets/images/nojorono-logo-white.png');

type NavProp = StackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

const MIN_PASSWORD_LENGTH = 6;

// Ganti kata sandi. Dibuka otomatis setelah login yang mengembalikan
// must_change_password = 1, membawa token login itu sebagai kredensial API
// auth/change_password. Setelah berhasil, pengguna kembali ke Login dan
// masuk lagi dengan kata sandi baru (sesi baru dimulai di sana).
export default function ForgotPasswordScreen() {
    const navigation = useNavigation<NavProp>();
    const route = useRoute<RouteProp<AuthStackParamList, 'ForgotPassword'>>();
    const { token, email } = route.params;

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Dicek langsung saat mengetik: kata sandi baru minimal 6 karakter dan
    // tidak boleh sama dengan yang lama, dan konfirmasi harus sama dengannya.
    const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
    const sameAsOld = newPassword.length > 0 && newPassword === oldPassword;
    const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
    const confirmMatches = confirmPassword.length > 0 && confirmPassword === newPassword;
    const canSubmit =
        !submitting &&
        oldPassword.length > 0 &&
        newPassword.length >= MIN_PASSWORD_LENGTH &&
        confirmMatches &&
        !sameAsOld;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const message = await AuthServices.changePassword(token, oldPassword, newPassword);
            Alert.alert('Kata Sandi Diubah', `${message}\n\nSilakan masuk dengan kata sandi baru.`, [
                {
                    text: 'OK',
                    onPress: () => navigation.popTo('Login', { email, passwordChanged: true }),
                },
            ]);
        } catch (error: any) {
            Alert.alert('Gagal Mengubah Kata Sandi', error?.message || 'Terjadi kesalahan. Coba lagi.');
            console.warn('Change password error:', error?.message);
        } finally {
            setSubmitting(false);
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

                {/* Brand header, sama seperti layar Login */}
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

                {/* Kartu form mengambang, menimpa bagian bawah header */}
                <View style={styles.cardOuter}>
                    <View style={styles.card}>
                        <View style={styles.notice}>
                            <Icon name="info-circle" size={14} color="#2F5FD1" solid />
                            <Text style={styles.noticeText}>
                                Akun {email} wajib mengganti kata sandi sebelum melanjutkan.
                            </Text>
                        </View>

                        <PasswordField
                            label="Kata Sandi Sebelumnya"
                            placeholder="Masukkan kata sandi sebelumnya"
                            value={oldPassword}
                            onChangeText={setOldPassword}
                            editable={!submitting}
                        />
                        <PasswordField
                            label="Kata Sandi Baru"
                            placeholder="Masukkan kata sandi baru"
                            value={newPassword}
                            onChangeText={setNewPassword}
                            editable={!submitting}
                            bubble={tooShort ? `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.` : undefined}
                            error={sameAsOld ? 'Kata sandi baru harus berbeda dari kata sandi sebelumnya.' : undefined}
                        />
                        <PasswordField
                            label="Konfirmasi Kata Sandi"
                            placeholder="Ulangi kata sandi baru"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            editable={!submitting}
                            error={confirmMismatch ? 'Konfirmasi kata sandi tidak sama dengan kata sandi baru.' : undefined}
                            success={confirmMatches && !sameAsOld ? 'Kata sandi cocok.' : undefined}
                        />

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.button, styles.secondaryButton]}
                                onPress={() => navigation.goBack()}
                                disabled={submitting}
                                activeOpacity={0.8}>
                                <Text style={styles.secondaryButtonText}>Kembali</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.button, styles.primaryButton, !canSubmit && styles.buttonDisabled]}
                                onPress={handleSubmit}
                                disabled={!canSubmit}
                                activeOpacity={0.8}>
                                {submitting ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Submit</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// Satu kolom kata sandi: label, ikon gembok di dalam kotak input, tombol
// mata untuk menampilkan/menyembunyikan isi, dan pesan validasi di bawahnya.
function PasswordField({
    label,
    placeholder,
    value,
    onChangeText,
    editable = true,
    bubble,
    error,
    success,
}: {
    label: string;
    placeholder: string;
    value: string;
    onChangeText: (text: string) => void;
    editable?: boolean;
    // A small speech bubble under the field (e.g. the minimum-length hint),
    // shown above any error/success line.
    bubble?: string;
    error?: string;
    success?: string;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View
                style={[
                    styles.inputBox,
                    error || bubble ? styles.inputBoxError : success ? styles.inputBoxSuccess : null,
                ]}>
                <View style={styles.inputIconBadge}>
                    <Icon name="lock" size={13} color="#2F5FD1" solid />
                </View>
                <TextInput
                    style={styles.input}
                    placeholder={placeholder}
                    placeholderTextColor="#98A2B3"
                    value={value}
                    onChangeText={onChangeText}
                    editable={editable}
                    secureTextEntry={!visible}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setVisible((v) => !v)}
                    accessibilityLabel={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
                    <Icon name={visible ? 'eye' : 'eye-slash'} size={16} color="#98A2B3" />
                </TouchableOpacity>
            </View>
            {bubble ? (
                <View style={styles.bubbleWrapper}>
                    <View style={styles.bubbleArrow} />
                    <View style={styles.bubble}>
                        <Icon name="exclamation-circle" size={12} color="#FFFFFF" solid />
                        <Text style={styles.bubbleText}>{bubble}</Text>
                    </View>
                </View>
            ) : null}
            {error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : success ? (
                <Text style={styles.successText}>{success}</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#F7F8FA',
    },
    scrollContainer: {
        flexGrow: 1,
        paddingBottom: 32,
    },
    brandHeader: {
        backgroundColor: '#2F5FD1',
        alignItems: 'center',
        paddingTop: 64,
        paddingBottom: 72,
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
    // Kartu mengambang dengan sudut membulat di semua sisi (sesuai mockup),
    // lebarnya dibatasi supaya tetap rapi di tablet.
    cardOuter: {
        marginTop: -40,
        paddingHorizontal: 24,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        alignSelf: 'center',
        width: '100%',
        maxWidth: 560,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 20,
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 5,
    },
    fieldWrapper: {
        marginBottom: 16,
    },
    fieldLabel: {
        fontSize: 13,
        color: '#101828',
        fontWeight: '600',
        marginBottom: 8,
    },
    // Kotak input dengan ikon gembok di dalamnya, bukan di sampingnya.
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 46,
        borderWidth: 1,
        borderColor: '#D0D5DD',
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        paddingLeft: 8,
    },
    inputIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#EAF0FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: '100%',
        paddingHorizontal: 12,
        fontSize: 14,
        color: '#101828',
    },
    eyeButton: {
        paddingHorizontal: 14,
        height: '100%',
        justifyContent: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    button: {
        flex: 1,
        height: 46,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryButton: {
        backgroundColor: '#EAF0FF',
        borderWidth: 1,
        borderColor: '#2F5FD1',
    },
    secondaryButtonText: {
        color: '#2F5FD1',
        fontSize: 14,
        fontWeight: '700',
    },
    primaryButton: {
        backgroundColor: '#2F5FD1',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    inputBoxError: {
        borderColor: '#D92D20',
    },
    inputBoxSuccess: {
        borderColor: '#12B76A',
    },
    errorText: {
        marginTop: 6,
        fontSize: 12,
        color: '#D92D20',
    },
    successText: {
        marginTop: 6,
        fontSize: 12,
        color: '#039855',
    },
    // Speech bubble under a field: small arrow pointing up at the input.
    bubbleWrapper: {
        alignItems: 'flex-start',
        marginTop: 4,
    },
    bubbleArrow: {
        marginLeft: 18,
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderBottomWidth: 6,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: '#D92D20',
    },
    bubble: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#D92D20',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    bubbleText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
    notice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#EAF0FF',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 16,
    },
    noticeText: {
        flex: 1,
        fontSize: 12,
        color: '#1D3E8F',
    },
});