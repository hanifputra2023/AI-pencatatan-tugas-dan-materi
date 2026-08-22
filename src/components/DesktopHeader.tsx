import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import AppLogo from './AppLogo';

const DESKTOP_NAV_ITEMS = [
  { name: 'Home', label: 'Beranda', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'Chat', label: 'Teman Cerita', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
  { name: 'Study', label: 'Kuliah & Tugas', icon: 'school-outline', activeIcon: 'school' },
  { name: 'Journal', label: 'Jurnal', icon: 'book-outline', activeIcon: 'book' },
  { name: 'Calendar', label: 'Statistik', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
];

export default function DesktopHeader() {
  const navigation = useNavigation<any>();
  const { user, profile, signOut } = useAuth();
  const { appBrandName, appBrandTagline } = useMoods();
  const { theme } = useTheme();

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
    <View style={[styles.desktopHeader, { backgroundColor: theme.cardInner, borderBottomColor: theme.border }]}>
      <View style={styles.innerHeader}>
        {/* Brand Logo */}
        <TouchableOpacity
          style={styles.brandRow}
          onPress={() => navigation.navigate('Home')}
          activeOpacity={0.8}
        >
          <AppLogo size={34} borderRadius={9} />
          <View>
            <Text style={[styles.brandTitle, { color: theme.text }]}>{appBrandName || 'StudyBot AI'}</Text>
            <Text style={[styles.brandSub, { color: theme.subtext }]}>{appBrandTagline || 'Smart Academic & Journal'}</Text>
          </View>
        </TouchableOpacity>

        {/* Nav Links */}
        <View style={[styles.navLinksRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {DESKTOP_NAV_ITEMS.map(item => {
            const isActive = currentRouteName === item.name ||
              (item.name === 'Study' && currentRouteName === 'StudyNoteDetail') ||
              (item.name === 'Journal' && currentRouteName === 'JournalEntry');

            return (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.navLinkBtn,
                  isActive && { backgroundColor: theme.accentBg, borderColor: theme.border }
                ]}
                onPress={() => navigation.navigate(item.name)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={(isActive ? item.activeIcon : item.icon) as any}
                  size={16}
                  color={isActive ? theme.accentLight : theme.subtext}
                />
                <Text style={[styles.navLinkText, { color: isActive ? theme.accentLight : theme.subtext }, isActive && { fontWeight: '700' }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Right User & Actions */}
        <View style={styles.rightActions}>
          <TouchableOpacity
            style={[
              styles.profileBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              currentRouteName === 'Profile' && { borderColor: theme.accent, backgroundColor: theme.accentBg }
            ]}
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
          >
            <View style={[styles.avatarCircle, { backgroundColor: theme.primary, overflow: 'hidden' }]}>
              {profile?.avatar_url || user?.user_metadata?.avatar_url ? (
                <Image
                  source={{ uri: profile?.avatar_url || user?.user_metadata?.avatar_url }}
                  style={{ width: '100%', height: '100%', borderRadius: 12 }}
                />
              ) : (
                <Text style={styles.avatarLetter}>
                  {(profile?.username?.[0] || user?.user_metadata?.username?.[0] || user?.email?.[0] || 'M').toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={[styles.profileText, { color: theme.text }]} numberOfLines={1}>
              {profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Akun'}
            </Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
    width: '100%',
    zIndex: 100,
    justifyContent: 'center',
  },
  innerHeader: {
    maxWidth: 1440,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogoImage: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  brandTitle: {
    color: '#F9FAFB',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSub: {
    color: '#6B7280',
    fontSize: 11,
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
