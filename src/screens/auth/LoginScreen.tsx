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
import { useTheme, isColorLight } from '../../contexts/ThemeContext';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;
  const { theme, isLightMode } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const primaryBtnTextColor = isColorLight(theme.primary) ? '#0F172A' : '#FFFFFF';

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Perhatian', 'Silakan masukkan email dan kata sandi Anda.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);

    if (error) {
      showAlert('Gagal Masuk', error.message || 'Email atau kata sandi tidak cocok. Silakan coba lagi.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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

            {/* Brand Header */}
            <View style={styles.brandHeader}>
              
              <Text style={[styles.brandHeading, { color: theme.text }]}>Selamat Datang Kembali</Text>
              <Text style={[styles.brandSubtitle, { color: theme.subtext }]}>
                Masuk untuk melanjutkan catatan kuliah, tugas, dan refleksi harianmu.
              </Text>
            </View>

            {/* Form Area */}
            <View style={styles.formArea}>

              {/* Email Input */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Email Mahasiswa</Text>
                <View style={[
                  styles.inputBox,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                  focusedField === 'email' && [styles.inputBoxFocused, { borderColor: theme.accent, backgroundColor: theme.card }]
                ]}>
                  <Ionicons
                    name="mail-outline"
                    size={17}
                    color={focusedField === 'email' ? theme.accentLight : theme.subtext}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="nama@email.com"
                    placeholderTextColor={theme.muted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Kata Sandi</Text>
                <View style={[
                  styles.inputBox,
                  { backgroundColor: theme.cardInner, borderColor: theme.border },
                  focusedField === 'password' && [styles.inputBoxFocused, { borderColor: theme.accent, backgroundColor: theme.card }]
                ]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={17}
                    color={focusedField === 'password' ? theme.accentLight : theme.subtext}
                    style={styles.fieldIcon}
                  />
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Masukkan kata sandi..."
                    placeholderTextColor={theme.muted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPass(!showPass)}
                    style={styles.eyeBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.subtext}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: theme.primary },
                  (!email.trim() || !password.trim()) && styles.submitBtnDisabled
                ]}
                onPress={handleLogin}
                disabled={loading || !email.trim() || !password.trim()}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={primaryBtnTextColor} size="small" />
                ) : (
                  <View style={styles.btnContentRow}>
                    <Text style={[styles.submitBtnText, { color: primaryBtnTextColor }]}>
                      Masuk Sekarang
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={primaryBtnTextColor} />
                  </View>
                )}
              </TouchableOpacity>

            </View>

            {/* Bottom Footer Link to Register */}
            <View style={[styles.footerSwitchRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.footerSwitchPrompt, { color: theme.subtext }]}>
                Belum punya akun?
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.7}
              >
                <Text style={[styles.footerSwitchAction, { color: theme.accentLight }]}>
                  Daftar Akun Baru
                </Text>
              </TouchableOpacity>
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
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  authCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  authCardWide: {
    paddingHorizontal: 36,
    paddingTop: 40,
    paddingBottom: 32,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  brandHeading: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 6,
  },
  brandSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  formArea: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginLeft: 2,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
  },
  inputBoxFocused: {
    borderWidth: 1.5,
  },
  fieldIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 4,
  },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingTop: 18,
    borderTopWidth: 1,
  },
  footerSwitchPrompt: {
    fontSize: 13,
  },
  footerSwitchAction: {
    fontSize: 13,
    fontWeight: '700',
  },
});
