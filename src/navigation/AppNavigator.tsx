import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
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
  Main: undefined;
  JournalEntry: { entryId?: string };
  StudyNoteDetail: { noteId?: string };
  Admin: undefined;
};

export type TabParamList = {
  Home: undefined;
  Chat: undefined;
  Study: undefined;
  Journal: undefined;
  Calendar: undefined;
  Profile: undefined;
  StudyNoteDetail: { noteId?: string } | undefined;
  JournalEntry: { entryId?: string } | undefined;
  Admin: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home:     focused ? 'grid' : 'grid-outline',
            Chat:     focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline',
            Study:    focused ? 'school' : 'school-outline',
            Journal:  focused ? 'book' : 'book-outline',
            Calendar: focused ? 'calendar' : 'calendar-outline',
            Profile:  focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={19} color={color} />;
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#5A6578',
        tabBarStyle: {
          backgroundColor: '#11141C',
          borderTopColor: '#1E2430',
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 14 : 8,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 70 : 62,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          marginTop: 2,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen}       options={{ title: 'Beranda' }} />
      <Tab.Screen name="Chat"     component={ChatScreen}       options={{ title: 'Teman Cerita' }} />
      <Tab.Screen name="Study"    component={StudyNotesScreen} options={{ title: 'Kuliah & Tugas' }} />
      <Tab.Screen name="Journal"  component={JournalScreen}    options={{ title: 'Jurnal' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen}   options={{ title: 'Statistik' }} />
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
  );
}

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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
    backgroundColor: '#0E1117',
  },
});
