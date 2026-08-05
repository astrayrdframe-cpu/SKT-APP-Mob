// src/services/authService.ts
import AsyncStorage from '@react-native-async-storage/async-storage'; // Use the correct AsyncStorage import
import axiosInstance from '../config/axiosInstance';
import Toast from 'react-native-toast-message';

// Matches what the ORDS `/auth/login` endpoint actually returns, e.g.:
// { "status": "success", "message": "Login berhasil",
//   "data": { "token": "...", "username": "...", "nama_brak": "...",
//              "expired_date": "2026-08-05T16:07:24" } }
interface LoginResponse {
  status: 'success' | 'error' | string;
  message: string;
  data: {
    token: string;
    username: string;
    nama_brak: string;
    expired_date: string;
  };
}

class AuthServices {
  // Login function: Accepts credentials, performs authentication, stores the token, and saves user info
  static async login(
    username: string,
    password: string,
  ): Promise<LoginResponse> {
    try {
      const response = await axiosInstance.post<LoginResponse>('/auth/login', {
        username,
        password,
      });

      // ORDS returns HTTP 200 with a status field rather than a non-2xx
      // code on bad credentials, so a 200 response isn't proof of a
      // successful login — check the payload too.
      if (response.data?.status !== 'success' || !response.data?.data?.token) {
        throw new Error(response.data?.message || 'Login failed');
      }

      return response.data;
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2:
          error.response?.data?.message ||
          error.message ||
          'An error occurred during login',
        position: 'top',
      });
      throw error;
    }
  }


  // Get token: Retrieves the token from AsyncStorage
  static async getToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('token');
    } catch (error: any) {
      console.error('Failed to get token:', error);
      throw error.response;
    }
  }

  // Check if the user is authenticated: Returns a boolean indicating if the user is logged in
  static async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getToken();
      return token !== null;
    } catch (error: any) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }
}

export default AuthServices;
