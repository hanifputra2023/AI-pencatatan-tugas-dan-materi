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

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Register'> };

export default function RegisterScreen({ navigation }: Props) {
  const { isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || isTablet;

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'email' | 'password' | null>(null);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Perhatian', 'Email dan kata sandi wajib diisi.');
      return;
    }
    if (password.length < 6) {
      showAlert('Perhatian', 'Kata sandi minimal 6 karakter.');
      return;
    }
    setLoading(true);
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
      showAlert('Pendaftaran Berhasil 🎉', 'Akun kamu telah siap. Selamat datang di StudyBot AI!');
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

            {/* Top Navigation Row */}
            <View style={styles.topNavRow}>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                style={styles.backBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              <Text style={styles.topNavTitle}>Daftar Akun</Text>
              <View style={{ width: 36 }} />
            </View>

            {/* Glowing Logo Badge */}
            <View style={styles.logoWrapper}>
              <View style={styles.logoGlowBackdrop} />
              <View style={styles.logoOuterCircle}>
                <View style={styles.logoInnerBadge}>
                  <Ionicons name="school" size={26} color="#34D399" />
                </View>
              </View>
            </View>

            {/* Header Title */}
            <View style={styles.brandHeader}>
              <Text style={styles.appTitle}>Mulai Perjalanan Belajarmu</Text>
              <Text style={styles.appSubtitle}>
                Simpan catatan kuliah, rangkuman AI, dan refleksi harian dalam satu tempat aman.
              </Text>
            </View>

            {/* Form Fields */}
            <View style={styles.formArea}>

              {/* Username Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Panggilan (Opsional)</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'username' && styles.inputWrapperFocused
                ]}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={focusedField === 'username' ? '#34D399' : '#6B7280'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Misal: Kevin / Sarah"
                    placeholderTextColor="#4B5565"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="words"
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

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
                    color={focusedField === 'email' ? '#34D399' : '#6B7280'}
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
                <Text style={styles.inputLabel}>Kata Sandi (Min. 6 Karakter)</Text>
                <View style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused
                ]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={focusedField === 'password' ? '#34D399' : '#6B7280'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Buat kata sandi aman..."
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
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.btnSubmitText}>Buat Akun Baru</Text>
                    <Ionicons name="checkmark" size={17} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Switch to Login */}
              <TouchableOpacity
                style={styles.switchAuthBtn}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.7}
              >
                <Text style={styles.switchAuthText}>
                  Sudah memiliki akun? <Text style={styles.switchAuthHighlight}>Masuk di sini</Text>
                </Text>
              </TouchableOpacity>

              {/* Trust Badge */}
              <View style={styles.trustBadgeRow}>
                <Ionicons name="shield-checkmark-outline" size={13} color="#4B5565" />
                <Text style={styles.trustBadgeText}>
                  Gratis, Aman, & Tersinkronisasi Otomatis
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
    paddingVertical: 24,
  },
  ambientGlowTop: {
    position: 'absolute',
    top: -100,
    right: '20%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(16, 185, 129, 0.10)',
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -100,
    left: '20%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(59, 130, 246, 0.10)',
  },
  authCard: {
    backgroundColor: 'rgba(17, 20, 28, 0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E2432',
    width: '100%',
  },
  authCardWide: {
    maxWidth: 440,
    alignSelf: 'center',
    padding: 32,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#141822',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#202634',
  },
  topNavTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  logoWrapper: {
    alignSelf: 'center',
    marginBottom: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlowBackdrop: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.30)',
  },
  logoOuterCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#101B17',
    borderWidth: 2,
    borderColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  logoInnerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#182E25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 22,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F9FAFB',
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 12.5,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  formArea: {
    gap: 14,
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
    borderColor: '#10B981',
    backgroundColor: '#0F1A16',
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
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 6,
    shadowColor: '#059669',
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
    paddingVertical: 6,
  },
  switchAuthText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  switchAuthHighlight: {
    color: '#34D399',
    fontWeight: '700',
  },
  trustBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  trustBadgeText: {
    color: '#4B5565',
    fontSize: 11,
  },
});
