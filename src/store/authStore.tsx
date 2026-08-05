import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IUser } from '../interface/userInterface';


interface AuthState {
    isAuthenticated: boolean;
    accessToken: string | null;
    refreshToken?: string | null;
    // ISO expiry string returned by /auth/login (data.expired_date). Used
    // to decide, on app boot, whether a persisted token is still usable
    // rather than trusting the bare isAuthenticated flag forever.
    tokenExpiry: string | null;
    user: any | null;
    setAuthenticated: (status: boolean) => void;
    setToken: (token: string) => void;
    setUser: (user: IUser) => void;
    // Persists token + expiry + user + isAuthenticated together so a
    // session is never left half-written across the individual AsyncStorage
    // keys (e.g. token saved but expiry missing).
    setSession: (session: { token: string; expiry: string; user: any }) => Promise<void>;
    clearAuth: () => void;
}
const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    accessToken: null,
    tokenExpiry: null,
    user: null,
    setAuthenticated: async (status) => {
        await AsyncStorage.setItem('isAuthenticated', JSON.stringify(status));
        set({ isAuthenticated: status });
    },
    setUser: async (user) => {
        if (user) {
            await AsyncStorage.setItem('user', JSON.stringify(user));
        } else {
            await AsyncStorage.removeItem('user');
        }
        set({ user });
    },
    setToken: async (accessToken) => {
        await AsyncStorage.setItem('accessToken', accessToken);
        set({ accessToken });
    },
    setSession: async ({ token, expiry, user }) => {
        await AsyncStorage.setMany({
            isAuthenticated: JSON.stringify(true),
            accessToken: token,
            tokenExpiry: expiry,
            user: JSON.stringify(user),
        });
        set({ isAuthenticated: true, accessToken: token, tokenExpiry: expiry, user });
    },
    clearAuth: async () => {
        await AsyncStorage.removeMany(['isAuthenticated', 'accessToken', 'tokenExpiry', 'user']);
        set({ isAuthenticated: false, accessToken: null, tokenExpiry: null, user: null });
    },
}));


// Load initial authentication state from AsyncStorage, run once on app
// boot (see AppNavigator). If a persisted token has an expiry in the past,
// the session is treated as logged out instead of restored — otherwise a
// stale isAuthenticated=true flag would keep granting access to a token
// the backend has already expired, until the first 401 happened to occur.
const loadAuthState = async (set: any) => {
    const savedAuthState = await AsyncStorage.getItem('isAuthenticated');
    const savedUser = await AsyncStorage.getItem('user');
    const savedToken = await AsyncStorage.getItem('accessToken');
    const savedExpiry = await AsyncStorage.getItem('tokenExpiry');

    if (savedExpiry && new Date(savedExpiry).getTime() <= Date.now()) {
        await AsyncStorage.removeMany(['isAuthenticated', 'accessToken', 'tokenExpiry', 'user']);
        set({ isAuthenticated: false, accessToken: null, tokenExpiry: null, user: null });
        return;
    }

    if (savedAuthState) {
        set({ isAuthenticated: JSON.parse(savedAuthState) });
    }
    if (savedUser) {
        set({ user: JSON.parse(savedUser) });
    }
    if (savedToken) {
        set({ accessToken: savedToken });
    }
    if (savedExpiry) {
        set({ tokenExpiry: savedExpiry });
    }
};

export { useAuthStore, loadAuthState };
