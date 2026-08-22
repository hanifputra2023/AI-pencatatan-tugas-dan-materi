import React from 'react';
import { NavigationContainer, NavigatorScreenParams, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';

import { useAuth } from '../contexts/AuthContext';

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
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  JournalEntry: { entryId?: string } | undefined;
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

  const iconSize = isSmallPhone ? 17 : (isDesktop || isTablet) ? 20 : 18;
  const labelFontSize = isSmallPhone ? 9 : (isDesktop || isTablet) ? 11.5 : 10;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {isDesktop && <DesktopHeader />}
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
              Calendar: focused ? 'calendar' : 'calendar-outline',
              Profile:  focused ? 'person' : 'person-outline',
            };
            return <Ionicons name={icons[route.name]} size={iconSize} color={color} />;
          },
          tabBarActiveTintColor: theme.accentLight,
          tabBarInactiveTintColor: '#5A6578',
          tabBarStyle: isDesktop ? { display: 'none' } : {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            borderTopWidth: 1,
            paddingBottom: Platform.OS === 'ios' ? (isSmallPhone ? 10 : 14) : 8,
            paddingTop: isSmallPhone ? 6 : 8,
            height: Platform.OS === 'ios' ? (isSmallPhone ? 64 : 70) : (isSmallPhone ? 58 : 62),
          },
          tabBarLabelStyle: {
            fontSize: labelFontSize,
            fontWeight: '600',
            marginTop: isSmallPhone ? 1 : 2,
            letterSpacing: isSmallPhone ? -0.3 : 0,
          },
          tabBarItemStyle: {
            paddingHorizontal: isSmallPhone ? 1 : 4,
          },
          headerShown: false,
        })}
      >
      <Tab.Screen name="Home"     component={HomeScreen}       options={{ title: 'Beranda' }} />
      <Tab.Screen name="Chat"     component={ChatScreen}       options={{ title: isSmallPhone ? 'Curhat' : 'Teman Cerita' }} />
      <Tab.Screen name="Study"    component={StudyNotesScreen} options={{ title: isSmallPhone ? 'Kuliah' : 'Kuliah & Tugas' }} />
      <Tab.Screen name="Journal"  component={JournalScreen}    options={{ title: 'Jurnal' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen}   options={{ title: isSmallPhone ? 'Stat' : 'Statistik' }} />
      <Tab.Screen name="Profile"  component={ProfileScreen}    options={{ title: 'Akun' }} />

      {/* Secondary & Detail Screens - Keeps Bottom Navigation Bar Persistent & Accessible */}
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
  const { session, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="small" color={theme.accentLight} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={transparentNavTheme}>
      <Stack.Navigator
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
          </>
        ) : (
          <>
            <Stack.Screen name="Login"    component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
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
