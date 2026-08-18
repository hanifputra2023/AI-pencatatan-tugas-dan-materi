import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

const DESKTOP_NAV_ITEMS = [
  { name: 'Home', label: 'Beranda', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'Chat', label: 'Teman Cerita', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
  { name: 'Study', label: 'Kuliah & Tugas', icon: 'school-outline', activeIcon: 'school' },
  { name: 'Journal', label: 'Jurnal', icon: 'book-outline', activeIcon: 'book' },
  { name: 'Calendar', label: 'Statistik', icon: 'calendar-outline', activeIcon: 'calendar' },
];

export default function DesktopHeader() {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();

  // Get current active route name
  const currentRouteName = useNavigationState(state => {
    if (!state) return 'Home';
    const activeRoute = state.routes[state.index];
    if (activeRoute?.state) {
      const childRoutes = activeRoute.state.routes;
      const childIndex = activeRoute.state.index || 0;
      return childRoutes[childIndex]?.name || activeRoute.name;
    }
    return activeRoute?.name || 'Home';
  });

  return (
    <View style={styles.desktopHeader}>
      {/* Brand Logo */}
      <TouchableOpacity
        style={styles.brandRow}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.8}
      >
        <View style={styles.logoBadge}>
          <Ionicons name="sparkles" size={16} color="#60A5FA" />
        </View>
        <View>
          <Text style={styles.brandTitle}>StudyBot AI</Text>
          <Text style={styles.brandSub}>Smart Academic & Journal</Text>
        </View>
      </TouchableOpacity>

      {/* Nav Links */}
      <View style={styles.navLinksRow}>
        {DESKTOP_NAV_ITEMS.map(item => {
          const isActive = currentRouteName === item.name ||
            (item.name === 'Study' && currentRouteName === 'StudyNoteDetail') ||
            (item.name === 'Journal' && currentRouteName === 'JournalEntry');

          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.navLinkBtn, isActive && styles.navLinkBtnActive]}
              onPress={() => navigation.navigate(item.name)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={(isActive ? item.activeIcon : item.icon) as any}
                size={16}
                color={isActive ? '#60A5FA' : '#9CA3AF'}
              />
              <Text style={[styles.navLinkText, isActive && styles.navLinkTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Right User & Actions */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={[styles.profileBtn, currentRouteName === 'Profile' && styles.profileBtnActive]}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>
              {(user?.email?.[0] || 'U').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.profileText} numberOfLines={1}>
            {user?.user_metadata?.username || user?.email?.split('@')[0] || 'Akun'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopHeader: {
    height: 60,
    backgroundColor: '#0E1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2430',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    width: '100%',
    zIndex: 100,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#16233B',
    borderWidth: 1,
    borderColor: '#253856',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#F9FAFB',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSub: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '500',
  },
  navLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141822',
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  navLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  navLinkBtnActive: {
    backgroundColor: '#1E293B',
  },
  navLinkText: {
    color: '#9CA3AF',
    fontSize: 12.5,
    fontWeight: '600',
  },
  navLinkTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#141822',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#202634',
  },
  profileBtnActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#16233B',
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  profileText: {
    color: '#F3F4F6',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 100,
  },
});
