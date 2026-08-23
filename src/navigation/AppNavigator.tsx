import React, { useState, useEffect } from 'react';
import { NavigationContainer, NavigatorScreenParams, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../contexts/AuthContext';

import OnboardingScreen, { ONBOARDING_STORAGE_KEY } from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import ChatScreen from '../screens/ChatScreen';
import StudyNotesScreen from '../screens/StudyNotesScreen';
import StudyNoteDetailScreen from '../screens/StudyNoteDetailScreen';
import JournalScreen from '../screens/JournalScreen';
import JournalEntryScreen from '../screens/JournalEntryScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AdminScreen from '../screens/AdminScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  JournalEntry: { entryId?: string; initialMood?: string; mood?: string } | undefined;
  StudyNoteDetail: { noteId?: string; autoOpenScan?: boolean } | undefined;
  Admin: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

export type TabParamList = {
  Home: undefined;
  Chat: undefined;
  Study: { initialTab?: 'notes' | 'tasks' | 'pomodoro' } | undefined;
  Journal: undefined;
  Calendar: undefined;
  Profile: undefined;
  StudyNoteDetail: { noteId?: string; autoOpenScan?: boolean } | undefined;
  JournalEntry: { entryId?: string } | undefined;
  Admin: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

import { useResponsive } from '../hooks/useResponsive';
import { useTheme } from '../contexts/ThemeContext';
import DesktopHeader from '../components/DesktopHeader';
import MobileHeader from '../components/MobileHeader';

const transparentNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
  },
};

function MainTabs() {
  const { isSmallPhone, isDesktop, isTablet } = useResponsive();
  const { theme } = useTheme();

  const iconSize = isSmallPhone ? 20 : (isDesktop || isTablet) ? 22 : 21;
  const labelFontSize = isSmallPhone ? 10.5 : (isDesktop || isTablet) ? 12 : 11;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {isDesktop ? <DesktopHeader /> : <MobileHeader />}
      <Tab.Navigator
        backBehavior="history"
        sceneContainerStyle={{ backgroundColor: 'transparent' }}
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              Home:     focused ? 'grid' : 'grid-outline',
              Chat:     focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline',
              Study:    focused ? 'school' : 'school-outline',
              Journal:  focused ? 'book' : 'book-outline',
              Calendar: focused ? 'stats-chart' : 'stats-chart-outline',
              Profile:  focused ? 'person' : 'person-outline',
            };
            return <Ionicons name={icons[route.name]} size={iconSize} color={color} />;
          },
          tabBarActiveTintColor: theme.accentLight,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: isDesktop ? { display: 'none' } : {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            paddingBottom: Platform.OS === 'ios' ? 16 : 8,
            paddingTop: 8,
            height: Platform.OS === 'ios' ? 74 : 64,
          },
          tabBarLabelStyle: {
            fontSize: labelFontSize,
            fontWeight: '600',
            marginTop: 2,
            letterSpacing: -0.1,
          },
          tabBarItemStyle: {
            paddingHorizontal: 4,
          },
          headerShown: false,
        })}
      >
      {/* 5 Primary Navigation Tabs */}
      <Tab.Screen name="Home"     component={HomeScreen}       options={{ title: 'Beranda' }} />
      <Tab.Screen name="Chat"     component={ChatScreen}       options={{ title: 'Teman Cerita' }} />
      <Tab.Screen name="Study"    component={StudyNotesScreen} options={{ title: 'Kuliah & Tugas' }} />
      <Tab.Screen name="Journal"  component={JournalScreen}    options={{ title: 'Jurnal' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen}   options={{ title: 'Statistik' }} />

      {/* Secondary Screens with Persistent Tab Bar & Top Header Navigation */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Akun',
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="StudyNoteDetail"
        component={StudyNoteDetailScreen}
        options={{
          title: 'Kuliah & Tugas',
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="JournalEntry"
        component={JournalEntryScreen}
        options={{
          title: 'Jurnal',
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
      <Tab.Screen
        name="Admin"
        component={AdminScreen}
        options={{
          title: 'Akun',
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
    </View>
  );
}

export default function AppNavigator() {
  const { session, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const seen = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        setHasSeenOnboarding(seen === 'true');
      } catch (e) {
        setHasSeenOnboarding(false);
      } finally {
        setCheckingOnboarding(false);
      }
    };
    checkOnboardingStatus();
  }, []);

  if (authLoading || checkingOnboarding) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="small" color={theme.accentLight} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={transparentNavTheme}>
      <Stack.Navigator
        initialRouteName={session ? 'Main' : hasSeenOnboarding ? 'Login' : 'Onboarding'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        {session ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="StudyNoteDetail" component={StudyNoteDetailScreen} />
            <Stack.Screen name="JournalEntry" component={JournalEntryScreen} />
            <Stack.Screen name="Admin" component={AdminScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          </>
        ) : hasSeenOnboarding ? (
          <>
            <Stack.Screen name="Login"      component={LoginScreen} />
            <Stack.Screen name="Register"   component={RegisterScreen} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login"      component={LoginScreen} />
            <Stack.Screen name="Register"   component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
