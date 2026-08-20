import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/alert';
import { useResponsive } from '../../hooks/useResponsive';

import { useTheme } from '../../contexts/ThemeContext';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Register'> };

export default function RegisterScreen({ navigation }: Props) {
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;
  const { theme, isLightMode } = useTheme();

  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'email' | 'password' | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Perhatian', 'Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      setLoading(false);
      if (error) {
        showAlert('Gagal Masuk', error.message || 'Periksa kembali email dan kata sandi kamu.');
      }
    } else {
      if (password.length < 6) {
        setLoading(false);
        showAlert('Perhatian', 'Kata sandi minimal 6 karakter.');
        return;
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          data: { username: username.trim() || email.split('@')[0] },
        },
      });
      setLoading(false);
      if (error) {
        showAlert('Gagal Daftar', error.message || 'Terjadi kesalahan saat pendaftaran.');
      } else {
        showAlert('Pendaftaran Berhasil', 'Akun kamu telah siap digunakan.');
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[
            styles.authCard,
            { backgroundColor: theme.card, borderColor: theme.border },
            isWide && styles.authCardWide
          ]}>

            {/* Minimalist Geometric Brand Logo */}
            <View style={styles.brandCenter}>
              <View style={[styles.logoBadge, { backgroundColor: theme.accentBg, borderColor: theme.border }]}>
                <Ionicons name="sparkles" size={20} color={theme.accentLight} />
              </View>
              <Text style={[styles.brandTitle, { color: theme.text }]}>StudyBot AI</Text>
              <Text style={[styles.brandSub, { color: theme.subtext }]}>
                {mode === 'login'
                  ? 'Masuk ke akun catatan dan ruang belajarmu'
                  : 'Buat akun baru untuk mulai belajar lebih pintar'}
              </Text>
            </View>

            {/* Clean Segmented Mode Switcher */}
            <View style={[styles.modeTabsRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <TouchableOpacity
                style={[
                  styles.modeTabBtn,
                  mode === 'login' && [styles.modeTabBtnActive, { backgroundColor: theme.card }]
                ]}
                onPress={() => setMode('login')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.modeTabText,
                  { color: theme.subtext },
                  mode === 'login' && [styles.modeTabTextActive, { color: theme.accentLight }]
                ]}>
                  Masuk
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeTabBtn,
                  mode === 'register' && [styles.modeTabBtnActive, { backgroundColor: theme.card }]
                ]}
                onPress={() => setMode('register')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.modeTabText,
                  { color: theme.subtext },
                  mode === 'register' && [styles.modeTabTextActive, { color: theme.accentLight }]
                ]}>
                  Daftar
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View style={styles.formArea}>

              {/* Username (Register Mode Only) */}
              {mode === 'register' && (
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.subtext }]}>Nama Panggilan</Text>
                  <View style={[
                    styles.inputBox,
                    { backgroundColor: theme.cardInner, borderColor: theme.border },
                    focusedField === 'username' && [styles.inputBoxFocused, { borderColor: theme.accent, backgroundColor: theme.card }]
                  ]}>
                    <Ionicons
                      name="person-outline"
                      size={17}
                      color={focusedField === 'username' ? theme.accentLight : theme.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.textInput, { color: theme.text }]}
                      placeholder="Nama kamu (opsional)"
                      placeholderTextColor={theme.muted}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="words"
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                </View>
              )}

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>Email</Text>
                <View style={[
                  styles.inputBox,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                  focusedField === 'email' && [styles.inputBoxFocused, { borderColor: theme.accent, backgroundColor: theme.card }]
                ]}>
                  <Ionicons
                    name="mail-outline"
                    size={17}
                    color={focusedField === 'email' ? theme.accentLight : theme.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="nama@email.com"
                    placeholderTextColor={theme.muted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.subtext }]}>Kata Sandi</Text>
                <View style={[
                  styles.inputBox,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                  focusedField === 'password' && [styles.inputBoxFocused, { borderColor: theme.accent, backgroundColor: theme.card }]
                ]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={17}
                    color={focusedField === 'password' ? theme.accentLight : theme.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder={mode === 'register' ? 'Minimal 6 karakter' : 'Kata sandi akun'}
                    placeholderTextColor={theme.muted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPass(!showPass)}
                    style={styles.eyeBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={17}
                      color={theme.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {mode === 'login' ? 'Masuk ke Akun' : 'Daftar Akun Baru'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Switch Mode Prompt */}
              <TouchableOpacity
                style={styles.switchPromptBtn}
                onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
                activeOpacity={0.7}
              >
                <Text style={[styles.switchPromptText, { color: theme.subtext }]}>
                  {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
                  <Text style={[styles.switchPromptLink, { color: theme.accentLight }]}>
                    {mode === 'login' ? 'Daftar sekarang' : 'Masuk di sini'}
                  </Text>
                </Text>
              </TouchableOpacity>

            </View>

            {/* Footer Security Badge */}
            <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
              <Ionicons name="lock-closed" size={11} color={theme.muted} />
              <Text style={[styles.footerSecurityText, { color: theme.muted }]}>
                Tersinkronisasi Aman & Privasi Terlindungi
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090B0E',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  authCard: {
    backgroundColor: '#11141C',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E2430',
    width: '100%',
  },
  authCardWide: {
    maxWidth: 400,
    alignSelf: 'center',
    padding: 28,
  },
  brandCenter: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#16233B',
    borderWidth: 1,
    borderColor: '#253856',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  brandSub: {
    color: '#6B7280',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#161B24',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#202634',
  },
  modeTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabBtnActive: {
    backgroundColor: '#1E293B',
  },
  modeTabText: {
    color: '#6B7280',
    fontSize: 12.5,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: '#F3F4F6',
    fontWeight: '700',
  },
  formArea: {
    gap: 14,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#202634',
  },
  inputBoxFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#111622',
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#F9FAFB',
    paddingVertical: 11,
    fontSize: 13.5,
  },
  eyeBtn: {
    padding: 4,
  },
  primaryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  switchPromptBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchPromptText: {
    color: '#6B7280',
    fontSize: 12.5,
  },
  switchPromptLink: {
    color: '#60A5FA',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1A202C',
  },
  footerSecurityText: {
    color: '#4B5565',
    fontSize: 11,
  },
});
