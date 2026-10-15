// src/services/authService.ts
import AsyncStorage from '@react-native-async-storage/async-storage'; // Use the correct AsyncStorage import
import axiosInstance from '../config/axiosInstance';
import { API_BASE_URL } from '../config/api';
import Toast from 'react-native-toast-message';

// Matches what the ORDS `/auth/login` endpoint's PL/SQL actually returns.
// The request is { "email", "password" } — the endpoint no longer accepts
// a username ("Email dan password wajib diisi" if email is missing):
// { "status": "success", "message": "Login berhasil",
//   "data": { "token": "...", "email": "...", "username": "...",
//              "role": "ADMIN" | "MK", "nama_brak": "...",
//              "mk_id": number | null, "brak_id": number | null,
//              "must_change_password": 0 | 1, "sudah_change_password": 0 | 1,
//              "expired_date": "2026-08-05T16:07:24" } }
interface LoginResponse {
  status: 'success' | 'error' | string;
  message: string;
  data: {
    token: string;
    email: string;
    username: string;
    role: 'ADMIN' | 'MK' | string;
    nama_brak: string;
    mk_id: number | null;
    brak_id: number | null;
    must_change_password: number;
    sudah_change_password: number;
    expired_date: string;
  };
}

class AuthServices {
  // Login function: Accepts credentials, performs authentication, stores the token, and saves user info
  static async login(
    email: string,
    password: string,
  ): Promise<LoginResponse> {
    try {
      const response = await axiosInstance.post<LoginResponse>('/auth/login', {
        email,
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


  // POST auth/change_password — changes the password of the account the
  // login token belongs to. Body { old_password, new_password }, token as
  // "Authorization: Bearer <token>". Like auth/login, a rejection comes back
  // as HTTP 200 + { "status": "error", "message": ... } (e.g. "Token tidak
  // valid atau sudah expired"), so the payload is checked, not just the
  // status code. Uses fetch rather than axiosInstance on purpose: its request
  // interceptor overwrites Authorization with the stored session token, and
  // an account that must change its password has no stored session yet.
  static async changePassword(
    token: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/auth/change_password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.status !== 'success') {
      throw new Error(data?.message || `HTTP ${response.status}`);
    }
    return data?.message || 'Kata sandi berhasil diubah';
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
