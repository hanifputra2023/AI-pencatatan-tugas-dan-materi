import React, { useState, useEffect } from 'react';
import { Image, ImageStyle, StyleProp, Platform } from 'react-native';
import { useMoods } from '../contexts/MoodContext';

interface AppLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
  borderRadius?: number;
}

export default function AppLogo({ size = 32, style, borderRadius = 8 }: AppLogoProps) {
  const { appLogoUrl } = useMoods();
  const [loadError, setLoadError] = useState(false);

  // Reset error state when logo URL changes
  useEffect(() => {
    setLoadError(false);
  }, [appLogoUrl]);

  // Validasi URL:
  // Browser Web tidak diizinkan memuat local path 'file://' (keamanan browser)
  const isBlockedLocalUri = Platform.OS === 'web' && !!appLogoUrl && appLogoUrl.startsWith('file://');
  const isValidCustomUrl = !loadError && !isBlockedLocalUri && !!appLogoUrl && appLogoUrl.trim().length > 0;

  const source = isValidCustomUrl
    ? { uri: appLogoUrl }
    : require('../../assets/icon.png');

  return (
    <Image
      source={source}
      style={[{ width: size, height: size, borderRadius }, style]}
      resizeMode="cover"
      onError={() => setLoadError(true)}
    />
  );
}
