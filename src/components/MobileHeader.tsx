import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useMoods } from '../contexts/MoodContext';
import { useTheme } from '../contexts/ThemeContext';
import AppLogo from './AppLogo';

export default function MobileHeader() {
  const navigation = useNavigation<any>();
  const { user, profile } = useAuth();
  const { appBrandName } = useMoods();
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

  const isProfileActive = currentRouteName === 'Profile';

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;
  const displayName = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Mahasiswa';
  const userInitial = (displayName?.[0] || 'M').toUpperCase();

  return (
    <View style={[styles.headerContainer, { backgroundColor: theme.cardInner, borderBottomColor: theme.border }]}>
      {/* Left: Brand Logo & Title */}
      <TouchableOpacity
        style={styles.brandRow}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.7}
      >
        <AppLogo size={28} borderRadius={7} />
        <Text style={[styles.brandTitle, { color: theme.text }]}>{appBrandName || 'StudyBot AI'}</Text>
      </TouchableOpacity>

      {/* Right: User Profile Avatar Button */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={[
            styles.avatarBtn,
            { backgroundColor: theme.primary, borderColor: isProfileActive ? theme.accentLight : theme.border },
            isProfileActive && { borderWidth: 2, borderColor: theme.accentLight },
          ]}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
          accessibilityLabel={`Buka Pengaturan Akun ${displayName}`}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarLetter}>{userInitial}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 100,
    ...Platform.select({
      web: {
        position: 'sticky' as any,
        top: 0,
      },
    }),
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogoImage: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  brandTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
