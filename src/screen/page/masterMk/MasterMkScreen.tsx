import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';

// Data Dummy Sesuai Gambar
const DUMMY_DATA = [
  { id: '1', nama: 'SITI AMINAH', nik: '0512FB1', brak: 'Djinggo', status: 'TETAP', active: true },
  { id: '2', nama: 'BUDI SANTOSO', nik: '0788FB2', brak: 'Djinggo', status: 'TIDAK TETAP', active: true },
  { id: '3', nama: 'RATNA DEWI', nik: '0921FB1', brak: 'Bening Trans', status: 'TETAP', active: true },
  { id: '4', nama: 'AGUS PRAYITNO', nik: '0455FB3', brak: 'Sonia', status: 'TETAP', active: false },
  { id: '5', nama: 'WIWIK HANDAYANI', nik: '0673FB1', brak: 'Djinggo', status: 'TIDAK TETAP', active: true },
  { id: '6', nama: 'DEDI KURNIAWAN', nik: '0299FB2', brak: 'Bening Trans', status: 'TETAP', active: true },
];

export default function MasterMKScreen() {
  const [search, setSearch] = useState('');

  // Komponen untuk Header Tabel
  const TableHeader = () => (
    <View style={styles.tableHeaderContainer}>
      <Text style={[styles.headerText, styles.colNama]}>NAMA MK</Text>
      <Text style={[styles.headerText, styles.colNik]}>NIK</Text>
      <Text style={[styles.headerText, styles.colBrak]}>BRAK</Text>
      <Text style={[styles.headerText, styles.colStatus]}>STATUS</Text>
      <Text style={[styles.headerText, styles.colActive]}>ACTIVE</Text>
      <Text style={[styles.headerText, styles.colAction]}>ACTION</Text>
    </View>
  );

  // Komponen untuk Baris (Row) Tabel
  const renderTableRow = ({ item, index }: { item: any; index: number }) => {
    // Warna background selang-seling (Zebra striping)
    const rowBackgroundColor = index % 2 === 0 ? '#FFFFFF' : '#F5F6F8';

    return (
      <View style={[styles.tableRow, { backgroundColor: rowBackgroundColor }]}>
        <Text style={[styles.rowText, styles.colNama]}>{item.nama}</Text>
        <Text style={[styles.rowText, styles.colNik]}>{item.nik}</Text>
        <Text style={[styles.rowText, styles.colBrak]}>{item.brak}</Text>
        
        {/* Kolom Status (Badge) */}
        <View style={styles.colStatus}>
          <View style={[
            styles.statusBadge, 
            { backgroundColor: item.status === 'TETAP' ? '#D6EAF8' : '#E5E7EB' }
          ]}>
            <Text style={[
              styles.statusBadgeText,
              { color: item.status === 'TETAP' ? '#2874A6' : '#6B7280' }
            ]}>
              {item.status}
            </Text>
          </View>
        </View>

        {/* Kolom Active Indicator */}
        <View style={[styles.colActive, styles.activeContainer]}>
          <View style={[styles.activeDot, { backgroundColor: item.active ? '#22C55E' : '#9CA3AF' }]} />
          <Text style={[styles.rowText, { color: item.active ? '#064E3B' : '#6B7280', fontWeight: '500' }]}>
            {item.active ? 'ACTIVE' : 'NONACTIVE'}
          </Text>
        </View>

        {/* Kolom Action (2 Button) */}
        <View style={[styles.colAction, styles.actionContainer]}>
          <TouchableOpacity onPress={() => console.log('Edit', item.id)} style={styles.actionButton}>
            <Icon name="edit" size={16} color="#EAB308" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => console.log('Delete', item.id)} style={styles.actionButton}>
            <Icon name="trash-alt" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      
      {/* Top App Bar */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <TouchableOpacity style={styles.menuIcon}>
            <Icon name="bars" size={20} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.title}>SKT Master MK</Text>
        </View>
        
        <View style={styles.topRight}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </View>
          <Text style={styles.profileName}>admin.djinggo</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={16} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari Master MK..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Table Area */}
      <View style={styles.tableWrapper}>
        <FlatList
          data={DUMMY_DATA}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={TableHeader}
          renderItem={renderTableRow}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Pagination (Bottom) */}
      <View style={styles.paginationContainer}>
        <TouchableOpacity style={styles.pageButton}><Icon name="step-backward" size={12} color="#6B7280" /></TouchableOpacity>
        <TouchableOpacity style={styles.pageButton}><Icon name="chevron-left" size={12} color="#6B7280" /></TouchableOpacity>
        <Text style={styles.pageText}>1 of 1</Text>
        <TouchableOpacity style={styles.pageButton}><Icon name="chevron-right" size={12} color="#6B7280" /></TouchableOpacity>
      </View>

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <Icon name="plus" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // Background abu-abu sangat muda khas aplikasi
  },
  // --- Header Styles ---
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#F9FAFB',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    marginRight: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B7366',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#FFF',
    fontWeight: '600',
  },
  profileName: {
    fontSize: 14,
    color: '#374151',
  },
  // --- Search Bar Styles ---
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 30, // Bentuk Pill
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 15,
    height: 45,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  // --- Table Styles ---
  tableWrapper: {
    flex: 1,
    marginHorizontal: 20,
  },
  tableHeaderContainer: {
    flexDirection: 'row',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  rowText: {
    fontSize: 14,
    color: '#1F2937',
  },
  // Flexbox untuk menyelaraskan kolom Header dan Isi Tabel
  colNama: { flex: 2 },
  colNik: { flex: 1 },
  colBrak: { flex: 1.5 },
  colStatus: { flex: 1.5, alignItems: 'flex-start' },
  colActive: { flex: 1.5 },
  colAction: { flex: 1, alignItems: 'center' },
  
  // Custom Cell Styles
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 15, // Jarak antar tombol edit dan delete
  },
  actionButton: {
    padding: 5,
  },
  // --- Pagination Styles ---
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  pageButton: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  pageText: {
    fontSize: 14,
    color: '#374151',
    marginHorizontal: 10,
  },
  // --- FAB Styles ---
  fab: {
    position: 'absolute',
    bottom: 25,
    right: 25,
    backgroundColor: '#0369A1',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4, // Shadow for Android
    shadowColor: '#000', // Shadow for iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});