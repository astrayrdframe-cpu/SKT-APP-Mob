// src/api/axiosInstance.ts
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { updateServerTimeFromHeader } from '../services/serverTime';
import { REACT_NATIVE_API_URL } from '@env';



const axiosInstance = axios.create({
    // baseURL: BASE_URL,
    baseURL: REACT_NATIVE_API_URL,
    timeout: 10000,
});



// You can add interceptors here if needed
axiosInstance.interceptors.request.use(
    async (config) => {
        try {
            const accessToken = await AsyncStorage.getItem('accessToken');
            if (accessToken) {
                config.headers.Authorization = `Bearer ${accessToken}`;
            }
        } catch (error) {
            console.error('Error fetching token from AsyncStorage', error);
            throw new Error('Error fetching token from AsyncStorage: ' + error);
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

axiosInstance.interceptors.response.use(
    (response) => {
        // Every HTTP response carries a `Date` header stamped by the
        // server — piggyback on it to keep our server-clock offset fresh
        // without needing a dedicated "current time" endpoint.
        updateServerTimeFromHeader(response.headers?.date);
        return response;
    },
    (error) => {
        if (error.response?.headers?.date) {
            updateServerTimeFromHeader(error.response.headers.date);
        }
        if (error.response && error.response.status === 401) {
            // Clear token and redirect to login if unauthorized
            useAuthStore.getState().clearAuth(); // Access clearAuth from the singleton store
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
