// src/services/authService.ts
import AsyncStorage from '@react-native-async-storage/async-storage'; // Use the correct AsyncStorage import
import { Alert } from 'react-native';
import axiosInstance from '../config/axiosInstance';
import Toast from 'react-native-toast-message';

interface LoginResponse {
  success: boolean;
  message: string;
  access_token: string;
}



class AuthServices {
  // Login function: Accepts credentials, performs authentication, and stores the token
 static async login(
    username: string,
    password: string,
  ): Promise<LoginResponse> {
    try {
      const response = await axiosInstance.post('/auth/login', {
        username,
        password,
      });
      return response.data;
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Login Failed',
        text2:
          error.response?.data?.message || 'An error occurred during login',
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
