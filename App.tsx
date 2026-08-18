import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { MoodProvider } from './src/contexts/MoodContext';
import { AlertProvider } from './src/contexts/AlertContext';
import { SubjectProvider } from './src/contexts/SubjectContext';
import AppNavigator from './src/navigation/AppNavigator';

// Eliminate default browser white focus rings and scrollbar styling on Web
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'antigravity-global-reset-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      * {
        outline: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
      *:focus, *:focus-visible, *:focus-within {
        outline: none !important;
        box-shadow: none !important;
      }
      input, textarea, select, button, div, [tabindex] {
        outline: none !important;
        box-shadow: none !important;
      }
      /* Custom Obsidian Dark Scrollbar */
      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      ::-webkit-scrollbar-track {
        background: #0E1117;
      }
      ::-webkit-scrollbar-thumb {
        background: #1E2430;
        border-radius: 3px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #2D3748;
      }
    `;
    document.head.appendChild(style);
  }
}

function MainAppContainer() {
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width > 768;

  return (
    <View style={styles.outerBackground}>
      <View
        style={[
          styles.appContainer,
          isWebDesktop && {
            maxWidth: 1080,
            width: '100%',
            height: '100%',
            alignSelf: 'center',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: '#1E2430',
          },
        ]}
      >
        <AppNavigator />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MoodProvider>
        <AlertProvider>
          <SubjectProvider>
            <StatusBar style="light" />
            <MainAppContainer />
          </SubjectProvider>
        </AlertProvider>
      </MoodProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  outerBackground: {
    flex: 1,
    backgroundColor: '#090B0E',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0E1117',
  },
});
