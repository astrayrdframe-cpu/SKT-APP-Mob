import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { useAuthStore } from '../store/authStore';

// (Opsional) Jika menggunakan react-native-orientation-locker untuk lock per-screen
// import Orientation from 'react-native-orientation-locker';

const HomeScreen = () => {
  const user = useAuthStore((state) => state.user);
  const username = user?.username;
  const { clearAuth } = useAuthStore(); 

  // Aktifkan ini jika menggunakan library orientation-locker
  // useEffect(() => {
  //   Orientation.lockToLandscape();
  //   return () => Orientation.unlockAllOrientations();
  // }, []);

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes", onPress: () => {
          clearAuth();
          console.log("User Logged Out");
        }}
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        
        {/* --- CUSTOM HEADER AREA --- */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>Welcome,</Text>
            <Text style={styles.usernameText}>{username}</Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <FontAwesome5 name="sign-out-alt" size={24} color="#ffffff" solid />
          </TouchableOpacity>
        </View>

        {/* --- MAIN CONTENT AREA --- */}
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Layanan Pembayaran</Text>
          
          {/* ScrollView diganti dengan View biasa yang rata tengah (Centered Row) */}
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.card} activeOpacity={0.8}>
              <View style={styles.iconContainer}>
                <FontAwesome5 name="wallet" size={32} color="#4a90e2" solid />
              </View>
              <Text style={styles.cardText}>Top Up</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} activeOpacity={0.8}>
              <View style={styles.iconContainer}>
                <FontAwesome5 name="paper-plane" size={32} color="#4a90e2" solid />
              </View>
              <Text style={styles.cardText}>Transfer</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} activeOpacity={0.8}>
              <View style={styles.iconContainer}>
                <FontAwesome5 name="qrcode" size={32} color="#4a90e2" solid />
              </View>
              <Text style={styles.cardText}>Scan QR</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} activeOpacity={0.8}>
              <View style={styles.iconContainer}>
                <FontAwesome5 name="receipt" size={32} color="#4a90e2" solid />
              </View>
              <Text style={styles.cardText}>History</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#4a90e2',
  },
  container: {
    flex: 1,
    backgroundColor: '#f4f6f9', 
  },
  header: {
    backgroundColor: '#4a90e2', 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40, // Lebarkan padding untuk tablet
    paddingTop: 30,
    paddingBottom: 40, 
    borderBottomLeftRadius: 30, // Lengkungan diperbesar
    borderBottomRightRadius: 30,
  },
  greetingText: {
    color: '#e0e0e0',
    fontSize: 18, // Ukuran font diperbesar
    fontWeight: '500',
  },
  usernameText: {
    color: '#ffffff',
    fontSize: 32, // Nama user lebih menonjol di tablet
    fontWeight: 'bold',
    marginTop: 6,
  },
  logoutButton: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 50,
    width: 60, // Tombol diperbesar agar mudah disentuh di tablet
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginTop: 40, // Jarak dari header diperlebar
    paddingHorizontal: 40, // Padding sisi dilaraskan dengan header
  },
  sectionTitle: {
    fontSize: 24, // Judul seksi diperbesar
    fontWeight: '700',
    color: '#333',
    marginBottom: 30,
  },
  menuContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start', // Bisa diubah ke 'center' atau 'space-between' sesuai selera
    flexWrap: 'wrap', // Memungkinkan baris baru jika item bertambah banyak
    gap: 25, // Jarak antar kartu (berfungsi baik di React Native versi baru)
  },
  card: {
    backgroundColor: '#ffffff',
    width: 160, // Lebar kartu diperbesar drastis (dari 95)
    height: 180, // Tinggi kartu diperbesar (dari 105)
    borderRadius: 20,
    padding: 15,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6, 
    // Jika React Native Anda versi lama & tidak support gap di menuContainer, gunakan margin:
    // marginRight: 25,
    // marginBottom: 25,
  },
  iconContainer: {
    backgroundColor: '#f0f5ff',
    padding: 20, // Padding ikon diperbesar
    borderRadius: 50,
    marginBottom: 20, // Jarak ikon ke teks diperbesar
  },
  cardText: {
    color: '#333',
    fontSize: 18, // Teks diperbesar agar seimbang dengan ukuran kartu
    fontWeight: '600',
  },
});

export default HomeScreen;