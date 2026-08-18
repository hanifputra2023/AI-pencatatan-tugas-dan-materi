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

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const { isSmallPhone, isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Perhatian', 'Email dan kata sandi wajib diisi.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);
    if (error) {
      showAlert('Gagal Masuk', error.message || 'Periksa kembali email dan kata sandi kamu.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Ambient Glow Elements */}
      <View style={styles.ambientGlowTop} pointerEvents="none" />
      <View style={styles.ambientGlowBottom} pointerEvents="none" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.authCard, isWide && styles.authCardWide]}>

            {/* Glowing Futuristic Logo Badge */}
            <View style={styles.logoWrapper}>
              <View style={styles.logoGlowBackdrop} />
              <View style={styles.logoOuterCircle}>
                <View style={styles.logoInnerBadge}>
                  <Ionicons name="sparkles" size={26} color="#60A5FA" />
                </View>
              </View>
            </View>

            {/* Brand Title & Tagline */}
            <View style={styles.brandHeader}>
              <Text style={styles.appTitle}>StudyBot AI</Text>
              <Text style={styles.appSubtitle}>
                Asisten Pintar Kuliah, Rangkuman Ujian & Teman Refleksi
              </Text>
            </View>

            {/* Form Fields */}
            <View style={styles.formArea}>

              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Alamat Email</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused
                ]}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={focusedField === 'email' ? '#60A5FA' : '#6B7280'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="nama@kampus.ac.id"
                    placeholderTextColor="#4B5565"
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

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Kata Sandi</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused
                ]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={focusedField === 'password' ? '#60A5FA' : '#6B7280'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Masukkan kata sandi..."
                    placeholderTextColor="#4B5565"
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
                      size={18}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.btnSubmit, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.btnSubmitText}>Masuk ke Akun</Text>
                    <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Switch to Register */}
              <TouchableOpacity
                style={styles.switchAuthBtn}
                onPress={() => navigation.navigate('Register')}
                activeOpacity={0.7}
              >
                <Text style={styles.switchAuthText}>
                  Belum memiliki akun? <Text style={styles.switchAuthHighlight}>Daftar Sekarang</Text>
                </Text>
              </TouchableOpacity>

              {/* Trust & Security Badge */}
              <View style={styles.trustBadgeRow}>
                <Ionicons name="shield-checkmark-outline" size={13} color="#4B5565" />
                <Text style={styles.trustBadgeText}>
                  Enkripsi Cloud Aman & Privasi Terlindungi
                </Text>
              </View>

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
  ambientGlowTop: {
    position: 'absolute',
    top: -100,
    left: '25%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -100,
    right: '20%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
  },
  authCard: {
    backgroundColor: 'rgba(17, 20, 28, 0.85)',
    borderRadius: 24,
    padding: 26,
    borderWidth: 1,
    borderColor: '#1E2432',
    width: '100%',
  },
  authCardWide: {
    maxWidth: 440,
    alignSelf: 'center',
    padding: 34,
  },
  logoWrapper: {
    alignSelf: 'center',
    marginBottom: 20,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlowBackdrop: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(59, 130, 246, 0.35)',
  },
  logoOuterCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#131926',
    borderWidth: 2,
    borderColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  logoInnerBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 26,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  formArea: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1117',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#222836',
  },
  inputWrapperFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#111622',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#F9FAFB',
    paddingVertical: 13,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 6,
  },
  btnSubmit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  btnSubmitText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  switchAuthBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchAuthText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  switchAuthHighlight: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  trustBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  trustBadgeText: {
    color: '#4B5565',
    fontSize: 11,
  },
});
