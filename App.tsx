import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { MoodProvider } from './src/contexts/MoodContext';
import { AlertProvider } from './src/contexts/AlertContext';
import { SubjectProvider } from './src/contexts/SubjectContext';
import AppNavigator from './src/navigation/AppNavigator';

// Eliminate default browser white focus rings on Web
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
    `;
    document.head.appendChild(style);
  }
}


function MainAppContainer() {
  const { theme, isLightMode } = useTheme();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const scrollbarStyleId = 'antigravity-scrollbar-styles';
      let styleEl = document.getElementById(scrollbarStyleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = scrollbarStyleId;
        document.head.appendChild(styleEl);
      }
      styleEl.innerHTML = `
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: ${isLightMode ? '#F1F5F9' : '#0E1117'};
        }
        ::-webkit-scrollbar-thumb {
          background: ${isLightMode ? '#CBD5E1' : '#1E2430'};
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${isLightMode ? '#94A3B8' : '#2D3748'};
        }
      `;
    }
  }, [isLightMode]);

  return (
    <SafeAreaView 
      style={[styles.outerBackground, { backgroundColor: theme.bg }]} 
      edges={Platform.OS === 'web' ? [] : ['top', 'left', 'right']}
    >
      <StatusBar style={isLightMode ? 'dark' : 'light'} />
      <View style={[styles.appContainer, { backgroundColor: theme.bg }]}>
        <AppNavigator />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <MoodProvider>
            <AlertProvider>
              <SubjectProvider>
                <MainAppContainer />
              </SubjectProvider>
            </AlertProvider>
          </MoodProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  outerBackground: {
    flex: 1,
  },
  appContainer: {
    flex: 1,
    width: '100%',
  },
});
